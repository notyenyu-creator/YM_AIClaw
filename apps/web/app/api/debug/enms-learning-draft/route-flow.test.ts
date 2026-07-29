import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sessionStore: new Map<string, Record<string, unknown>>(),
  updateSessionEnmsPlannerLearningDraft: vi.fn(
    (sessionId: string, draft: unknown) => {
      const existing = mocks.sessionStore.get(sessionId) ?? {};
      mocks.sessionStore.set(sessionId, {
        ...existing,
        enmsPlannerLearningDraft: draft,
      });
    },
  ),
}));

vi.mock("@/app/api/web-sessions/shared", () => ({
  getSessionMeta: (sessionId: string) => mocks.sessionStore.get(sessionId),
  updateSessionEnmsPlannerLearningDraft:
    mocks.updateSessionEnmsPlannerLearningDraft,
}));

import { GET as internalGet } from "../../internal/enms-learning-draft/route";
import { POST as internalWritebackPost } from "../../internal/enms-learning-draft/writeback/route";
import { POST as internalPromotePost } from "../../internal/enms-learning-draft/promote/route";
import { POST as internalResolvePost } from "../../internal/enms-learning-draft/resolve/route";
import {
  applyEnmsLearningDraftPromotion,
  applyEnmsLearningDraftWriteback,
  buildEnmsLearningDraft,
} from "@/lib/enms-learning-draft";
import type { EnmsPlannerPreflight } from "@/lib/enms-context-builder";
import type { EnmsContextPack } from "@/lib/enms-context-pack";

const REVIEW_TOKEN = "review-secret";
const ORIGINAL_ENV = { ...process.env };
const originalCwd = process.cwd();

const basePresentation = {
  optional_chart_requested: false,
  chart_render_allowed: false,
  chart_guardrail_reason: null,
  max_chart_panels: 0,
};

function enableReviewGate() {
  process.env.ENCLAW_ENMS_LEARNING_REVIEW_ENABLED = "1";
  process.env.ENCLAW_ENMS_LEARNING_REVIEW_TOKEN = REVIEW_TOKEN;
  delete process.env.ENCLAW_ENMS_LEARNING_REVIEW_TOKEN_FILE;
}

function buildRequest(path: string, body: unknown, token = REVIEW_TOKEN): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function makePreflight(intent: EnmsPlannerPreflight["intent"]): EnmsPlannerPreflight {
  return {
    system: "enms",
    updatedAt: 1710000000000,
    intent,
    confidence: "high",
    shouldRouteToEnms: true,
    matchedKeywords: ["需量"],
    warnings: [],
    presentation: basePresentation,
  };
}

function makePack(intent: EnmsPlannerPreflight["intent"]): EnmsContextPack {
  return {
    planner: makePreflight(intent),
    presentation: basePresentation,
    read_first: ["skills/enms/SKILL.md"],
    references: [],
    wiki: [],
    playbooks: [],
    memory_keys: [],
    live_query_steps: ["read_summary_view_first"],
    execution_hints: [],
  };
}

function makeDemandDraft(sessionId: string) {
  return buildEnmsLearningDraft({
    session_id: sessionId,
    planner_preflight: makePreflight("demand_forecast"),
    planner_context_pack: makePack("demand_forecast"),
    messages: [
      { role: "user", content: "請分析最大需量和超約風險" },
      { role: "assistant", content: "已依授權資料回答。" },
    ],
  });
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  mocks.sessionStore.clear();
  mocks.updateSessionEnmsPlannerLearningDraft.mockClear();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  process.chdir(originalCwd);
});

describe("EnMS learning draft internal review flow", () => {
  it("keeps the internal alias behind the same feature flag and reviewer token gate", async () => {
    const disabled = await internalGet(
      new Request("http://localhost/api/internal/enms-learning-draft", {
        headers: { Authorization: `Bearer ${REVIEW_TOKEN}` },
      }),
    );
    expect(disabled.status).toBe(404);

    enableReviewGate();
    const unauthorized = await internalGet(
      new Request("http://localhost/api/internal/enms-learning-draft"),
    );
    expect(unauthorized.status).toBe(401);
  });

  it("returns only the EnMS learning draft through the secured internal read route", async () => {
    enableReviewGate();
    const sessionId = "s-read-flow";
    mocks.sessionStore.set(sessionId, {
      id: sessionId,
      title: "Sensitive session title",
      enmsPlannerLearningDraft: makeDemandDraft(sessionId),
    });

    const response = await internalGet(
      new Request(
        `http://localhost/api/internal/enms-learning-draft?session_id=${sessionId}`,
        {
          headers: { Authorization: `Bearer ${REVIEW_TOKEN}` },
        },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      session_id: sessionId,
      draft: expect.objectContaining({
        session_id: sessionId,
        learning_focus: "demand_forecast",
      }),
    });
    expect(body.session).toBeUndefined();
  });

  it.each([
    ["promote", "/api/internal/enms-learning-draft/promote", internalPromotePost],
    ["resolve", "/api/internal/enms-learning-draft/resolve", internalResolvePost],
  ])(
    "keeps the internal %s alias behind the same validation after auth passes",
    async (_label, path, handler) => {
      enableReviewGate();

      const response = await handler(
        new Request(`http://localhost${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${REVIEW_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: "{bad-json",
        }),
      );

      expect(response.status).toBe(400);
    },
  );

  it("writes both wiki draft and regression case artifacts through the internal alias", async () => {
    const root = mkdtempSync(join(tmpdir(), "enms-route-writeback-"));
    try {
      process.chdir(root);
      enableReviewGate();
      const sessionId = "s-writeback-flow";
      mocks.sessionStore.set(sessionId, {
        id: sessionId,
        enmsPlannerLearningDraft: makeDemandDraft(sessionId),
      });

      const response = await internalWritebackPost(
        buildRequest("/api/internal/enms-learning-draft/writeback", {
          session_id: sessionId,
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.writeback.files).toHaveLength(1);
      expect(body.writeback.regression_files).toHaveLength(1);
      expect(existsSync(join(root, body.writeback.files[0]))).toBe(true);
      expect(existsSync(join(root, body.writeback.regression_files[0]))).toBe(true);
      expect(mocks.updateSessionEnmsPlannerLearningDraft).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          writeback: expect.objectContaining({
            status: "written",
            regression_files: body.writeback.regression_files,
          }),
        }),
      );
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("blocks promotion when the reviewer-owned regression artifact is missing", async () => {
    enableReviewGate();
    const sessionId = "s-promotion-blocked";
    const draftWithoutRegressionArtifact = applyEnmsLearningDraftWriteback(
      makeDemandDraft(sessionId),
      {
        files: ["wiki/entities/energy/s-promotion-blocked-demand-forecast-summary.md"],
        skipped_files: [],
      },
    );
    mocks.sessionStore.set(sessionId, {
      id: sessionId,
      enmsPlannerLearningDraft: draftWithoutRegressionArtifact,
    });

    const response = await internalPromotePost(
      buildRequest("/api/internal/enms-learning-draft/promote", {
        session_id: sessionId,
        reviewer_actor: "QA",
        review_reason: "Regression artifact must exist before promotion",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.missing_gates).toContain(
      "regression_artifact_written_or_skipped",
    );
  });

  it("keeps force-promotion behind the same artifact readiness gates", async () => {
    enableReviewGate();
    const sessionId = "s-force-readiness-blocked";
    const written = applyEnmsLearningDraftWriteback(makeDemandDraft(sessionId), {
      files: ["wiki/entities/energy/s-force-readiness-blocked-demand-forecast-summary.md"],
      skipped_files: [],
      regression_files: [
        "wiki/regression/enms/s-force-readiness-blocked-demand_forecast-regression.json",
      ],
      regression_skipped_files: [],
    });
    const conflicted = applyEnmsLearningDraftPromotion(written, {
      promoted_files: [],
      skipped_files: [],
      conflict_files: [
        "wiki/entities/energy/s-force-readiness-blocked-demand-forecast-summary.md",
      ],
      review_reason: "Manual conflict found",
      reviewer_actor: "QA",
    });
    mocks.sessionStore.set(sessionId, {
      id: sessionId,
      enmsPlannerLearningDraft: conflicted,
    });

    const response = await internalPromotePost(
      buildRequest("/api/internal/enms-learning-draft/promote", {
        session_id: sessionId,
        force_conflict_override: true,
        reviewer_actor: "QA",
        review_reason: "Force override must not bypass artifact gates",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.missing_gates).toEqual(
      expect.arrayContaining([
        "wiki_artifact_exists_on_disk",
        "regression_artifact_exists_on_disk",
      ]),
    );
  });
});
