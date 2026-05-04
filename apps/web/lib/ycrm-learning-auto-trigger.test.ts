import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionStore = new Map<string, unknown>();
const updateCalls: Array<{ sessionId: string; draft: unknown }> = [];
let mockTranscript: Array<{
  id?: string;
  role: "user" | "assistant" | string;
  content?: string;
  parts?: Array<{ type?: string; text?: string }>;
}> = [];

vi.mock("@/app/api/web-sessions/shared", () => ({
  getSessionMeta: (sessionId: string) => sessionStore.get(sessionId) ?? null,
  updateSessionPlannerLearningDraft: (sessionId: string, draft: unknown) => {
    updateCalls.push({ sessionId, draft });
    const existing = (sessionStore.get(sessionId) ?? {}) as Record<string, unknown>;
    sessionStore.set(sessionId, { ...existing, plannerLearningDraft: draft });
  },
}));

vi.mock("./workspace", () => ({
  resolveWebChatDir: () => "/tmp/test-web-chats",
}));

vi.mock("node:fs", async () => {
  const real = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...real,
    existsSync: () => true,
    readFileSync: () =>
      mockTranscript.map((line) => JSON.stringify(line)).join("\n"),
  };
});

import {
  runAutoLearningDraftEvaluation,
} from "./ycrm-learning-auto-trigger";

const baseSessionMeta = {
  id: "s-auto-1",
  title: "Test",
  createdAt: 0,
  updatedAt: 0,
  messageCount: 2,
  plannerPreflight: {
    system: "ycrm" as const,
    updatedAt: 1710000000000,
    intent: "entity_summary",
    confidence: "high",
    shouldRouteToYcrm: true,
    workspaceId: "workspace_test",
    needsWorkspaceValidation: false,
    warnings: [],
    blockers: [],
    crossSystem: false,
    targetSystems: [],
  },
  plannerContextPack: {
    planner: {
      system: "ycrm" as const,
      updatedAt: 1710000000000,
      intent: "entity_summary",
      confidence: "high",
      shouldRouteToYcrm: true,
      workspaceId: "workspace_test",
      needsWorkspaceValidation: false,
      warnings: [],
      blockers: [],
      crossSystem: false,
      targetSystems: [],
    },
    presentation: {
      optional_chart_requested: false,
      chart_render_allowed: false,
      chart_guardrail_reason: null,
      max_chart_panels: 0,
    },
    read_first: [],
    references: [],
    wiki: [],
    playbooks: [],
    memory_keys: [],
    live_query_steps: [],
    execution_hints: [],
  },
};

beforeEach(() => {
  sessionStore.clear();
  updateCalls.length = 0;
  mockTranscript = [
    { id: "u1", role: "user", content: "請整理 Calleen 公司的客戶背景" },
    { id: "a1", role: "assistant", content: "已整理客戶輪廓與下一步建議" },
  ];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runAutoLearningDraftEvaluation", () => {
  it("skips subagent sessions", () => {
    const outcome = runAutoLearningDraftEvaluation("agent:main:web:abc:subagent:1");
    expect(outcome).toEqual({ status: "skipped", reason: "subagent_session" });
    expect(updateCalls.length).toBe(0);
  });

  it("skips when planner artifacts are missing", () => {
    sessionStore.set("s-auto-1", { ...baseSessionMeta, plannerPreflight: undefined, plannerContextPack: undefined });
    const outcome = runAutoLearningDraftEvaluation("s-auto-1");
    expect(outcome).toEqual({ status: "skipped", reason: "no_planner_artifacts" });
  });

  it("skips when planner is not routed to Y-CRM", () => {
    sessionStore.set("s-auto-1", {
      ...baseSessionMeta,
      plannerPreflight: { ...baseSessionMeta.plannerPreflight, shouldRouteToYcrm: false },
    });
    const outcome = runAutoLearningDraftEvaluation("s-auto-1");
    expect(outcome).toEqual({ status: "skipped", reason: "not_routed_to_ycrm" });
  });

  it("skips when intent is not high-value", () => {
    sessionStore.set("s-auto-1", {
      ...baseSessionMeta,
      plannerPreflight: { ...baseSessionMeta.plannerPreflight, intent: "product_help" },
    });
    const outcome = runAutoLearningDraftEvaluation("s-auto-1");
    expect(outcome).toEqual({ status: "skipped", reason: "intent_not_high_value" });
  });

  it("skips when an existing draft has been written/promoted", () => {
    sessionStore.set("s-auto-1", {
      ...baseSessionMeta,
      plannerLearningDraft: {
        writeback: { status: "promoted" },
      },
    });
    const outcome = runAutoLearningDraftEvaluation("s-auto-1");
    expect(outcome).toEqual({ status: "skipped", reason: "draft_already_reviewed" });
  });

  it("skips when an existing not-written draft is too recent", () => {
    const now = 1710000010000;
    sessionStore.set("s-auto-1", {
      ...baseSessionMeta,
      plannerLearningDraft: {
        status: "ready",
        writeback: { status: "not_written" },
        meta: { generated_at: now - 5000 },
      },
    });
    const outcome = runAutoLearningDraftEvaluation("s-auto-1", { now });
    expect(outcome).toEqual({ status: "skipped", reason: "draft_too_recent" });
  });

  it("generates and persists a draft for high-value intent with transcript", () => {
    sessionStore.set("s-auto-1", baseSessionMeta);
    const outcome = runAutoLearningDraftEvaluation("s-auto-1");
    expect(outcome.status).toBe("generated");
    expect(updateCalls.length).toBe(1);
    const persisted = updateCalls[0].draft as {
      meta: { token_guardrails: string[] };
      status: string;
    };
    expect(persisted.status).toBe("ready");
    expect(persisted.meta.token_guardrails).toContain("auto_trigger_post_run");
    expect(persisted.meta.token_guardrails).toContain("transcript_window_4");
  });

  it("regenerates if existing draft is older than the recency window", () => {
    const now = 1710000020000;
    sessionStore.set("s-auto-1", {
      ...baseSessionMeta,
      plannerLearningDraft: {
        status: "ready",
        writeback: { status: "not_written" },
        meta: { generated_at: now - 60_000 },
      },
    });
    const outcome = runAutoLearningDraftEvaluation("s-auto-1", { now });
    expect(outcome.status).toBe("generated");
    expect(updateCalls.length).toBe(1);
  });

  it("skips when transcript has no eligible messages", () => {
    mockTranscript = [];
    sessionStore.set("s-auto-1", baseSessionMeta);
    const outcome = runAutoLearningDraftEvaluation("s-auto-1");
    expect(outcome).toEqual({ status: "skipped", reason: "no_eligible_messages" });
    expect(updateCalls.length).toBe(0);
  });
});
