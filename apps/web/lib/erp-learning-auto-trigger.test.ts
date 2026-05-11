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
  updateSessionErpPlannerLearningDraft: (sessionId: string, draft: unknown) => {
    updateCalls.push({ sessionId, draft });
    const existing = (sessionStore.get(sessionId) ?? {}) as Record<string, unknown>;
    sessionStore.set(sessionId, { ...existing, erpPlannerLearningDraft: draft });
  },
}));

vi.mock("./workspace", () => ({
  resolveWebChatDir: () => "/tmp/test-erp-web-chats",
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

import { runAutoErpLearningDraftEvaluation } from "./erp-learning-auto-trigger";

const basePresentation = {
  optional_chart_requested: false,
  chart_render_allowed: false,
  chart_guardrail_reason: null,
  max_chart_panels: 0,
};

const baseSessionMeta = {
  id: "s-erp-auto-1",
  title: "Test",
  createdAt: 0,
  updatedAt: 0,
  messageCount: 2,
  erpPlannerPreflight: {
    system: "erp" as const,
    updatedAt: 1710000000000,
    intent: "inventory_status",
    confidence: "high",
    shouldRouteToErp: true,
    matchedKeywords: ["庫存"],
    warnings: [],
    presentation: basePresentation,
  },
  erpPlannerContextPack: {
    planner: {
      system: "erp" as const,
      updatedAt: 1710000000000,
      intent: "inventory_status",
      confidence: "high",
      shouldRouteToErp: true,
      matchedKeywords: ["庫存"],
      warnings: [],
      presentation: basePresentation,
    },
    presentation: basePresentation,
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
    { id: "u1", role: "user", content: "目前可用庫存最多的前 10 個商品？" },
    { id: "a1", role: "assistant", content: "整理出 10 個商品的可用庫存量。" },
  ];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runAutoErpLearningDraftEvaluation", () => {
  it("skips subagent sessions", () => {
    const outcome = runAutoErpLearningDraftEvaluation("agent:main:web:abc:subagent:1");
    expect(outcome).toEqual({ status: "skipped", reason: "subagent_session" });
    expect(updateCalls.length).toBe(0);
  });

  it("skips when ERP planner artifacts are missing", () => {
    sessionStore.set("s-erp-auto-1", {
      ...baseSessionMeta,
      erpPlannerPreflight: undefined,
      erpPlannerContextPack: undefined,
    });
    const outcome = runAutoErpLearningDraftEvaluation("s-erp-auto-1");
    expect(outcome).toEqual({ status: "skipped", reason: "no_planner_artifacts" });
  });

  it("skips when planner is not routed to ERP", () => {
    sessionStore.set("s-erp-auto-1", {
      ...baseSessionMeta,
      erpPlannerPreflight: { ...baseSessionMeta.erpPlannerPreflight, shouldRouteToErp: false },
    });
    const outcome = runAutoErpLearningDraftEvaluation("s-erp-auto-1");
    expect(outcome).toEqual({ status: "skipped", reason: "not_routed_to_erp" });
  });

  it("skips when intent is not high-value", () => {
    sessionStore.set("s-erp-auto-1", {
      ...baseSessionMeta,
      erpPlannerPreflight: { ...baseSessionMeta.erpPlannerPreflight, intent: "unknown" },
    });
    const outcome = runAutoErpLearningDraftEvaluation("s-erp-auto-1");
    expect(outcome).toEqual({ status: "skipped", reason: "intent_not_high_value" });
  });

  it("skips when an existing draft has been written/promoted", () => {
    sessionStore.set("s-erp-auto-1", {
      ...baseSessionMeta,
      erpPlannerLearningDraft: { writeback: { status: "promoted" } },
    });
    const outcome = runAutoErpLearningDraftEvaluation("s-erp-auto-1");
    expect(outcome).toEqual({ status: "skipped", reason: "draft_already_reviewed" });
  });

  it("skips when an existing not-written draft is too recent", () => {
    const now = 1710000010000;
    sessionStore.set("s-erp-auto-1", {
      ...baseSessionMeta,
      erpPlannerLearningDraft: {
        status: "ready",
        writeback: { status: "not_written" },
        meta: { generated_at: now - 5000 },
      },
    });
    const outcome = runAutoErpLearningDraftEvaluation("s-erp-auto-1", { now });
    expect(outcome).toEqual({ status: "skipped", reason: "draft_too_recent" });
  });

  it("generates and persists a draft for high-value intent with transcript", () => {
    sessionStore.set("s-erp-auto-1", baseSessionMeta);
    const outcome = runAutoErpLearningDraftEvaluation("s-erp-auto-1");
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
    sessionStore.set("s-erp-auto-1", {
      ...baseSessionMeta,
      erpPlannerLearningDraft: {
        status: "ready",
        writeback: { status: "not_written" },
        meta: { generated_at: now - 60_000 },
      },
    });
    const outcome = runAutoErpLearningDraftEvaluation("s-erp-auto-1", { now });
    expect(outcome.status).toBe("generated");
    expect(updateCalls.length).toBe(1);
  });

  it("skips when transcript has no eligible messages", () => {
    mockTranscript = [];
    sessionStore.set("s-erp-auto-1", baseSessionMeta);
    const outcome = runAutoErpLearningDraftEvaluation("s-erp-auto-1");
    expect(outcome).toEqual({ status: "skipped", reason: "no_eligible_messages" });
    expect(updateCalls.length).toBe(0);
  });
});
