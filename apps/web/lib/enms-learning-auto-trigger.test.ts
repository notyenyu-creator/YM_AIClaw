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
  updateSessionEnmsPlannerLearningDraft: (sessionId: string, draft: unknown) => {
    updateCalls.push({ sessionId, draft });
    const existing = (sessionStore.get(sessionId) ?? {}) as Record<string, unknown>;
    sessionStore.set(sessionId, { ...existing, enmsPlannerLearningDraft: draft });
  },
}));

vi.mock("./workspace", () => ({
  resolveWebChatDir: () => "/tmp/test-enms-web-chats",
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

import { runAutoEnmsLearningDraftEvaluation } from "./enms-learning-auto-trigger";

const basePresentation = {
  optional_chart_requested: false,
  chart_render_allowed: false,
  chart_guardrail_reason: null,
  max_chart_panels: 0,
};

const baseSessionMeta = {
  id: "s-enms-auto-1",
  title: "Test",
  createdAt: 0,
  updatedAt: 0,
  messageCount: 2,
  enmsPlannerPreflight: {
    system: "enms" as const,
    updatedAt: 1710000000000,
    intent: "demand_forecast" as const,
    confidence: "high" as const,
    shouldRouteToEnms: true,
    matchedKeywords: ["需量"],
    warnings: [],
    presentation: basePresentation,
  },
  enmsPlannerContextPack: {
    planner: {
      system: "enms" as const,
      updatedAt: 1710000000000,
      intent: "demand_forecast" as const,
      confidence: "high" as const,
      shouldRouteToEnms: true,
      matchedKeywords: ["需量"],
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
    { id: "u1", role: "user", content: "請分析本週最大需量和超約風險" },
    { id: "a1", role: "assistant", content: "已整理出三個場域的需量趨勢與風險" },
  ];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runAutoEnmsLearningDraftEvaluation", () => {
  it("skips subagent sessions", () => {
    const outcome = runAutoEnmsLearningDraftEvaluation("agent:main:web:abc:subagent:1");
    expect(outcome).toEqual({ status: "skipped", reason: "subagent_session" });
    expect(updateCalls.length).toBe(0);
  });

  it("skips when EnMS planner artifacts are missing", () => {
    sessionStore.set("s-enms-auto-1", {
      ...baseSessionMeta,
      enmsPlannerPreflight: undefined,
      enmsPlannerContextPack: undefined,
    });
    const outcome = runAutoEnmsLearningDraftEvaluation("s-enms-auto-1");
    expect(outcome).toEqual({ status: "skipped", reason: "no_planner_artifacts" });
  });

  it("skips when planner is not routed to EnMS", () => {
    sessionStore.set("s-enms-auto-1", {
      ...baseSessionMeta,
      enmsPlannerPreflight: {
        ...baseSessionMeta.enmsPlannerPreflight,
        shouldRouteToEnms: false,
      },
    });
    const outcome = runAutoEnmsLearningDraftEvaluation("s-enms-auto-1");
    expect(outcome).toEqual({ status: "skipped", reason: "not_routed_to_enms" });
  });

  it("skips when intent is not high-value", () => {
    sessionStore.set("s-enms-auto-1", {
      ...baseSessionMeta,
      enmsPlannerPreflight: {
        ...baseSessionMeta.enmsPlannerPreflight,
        intent: "natural_language_query",
      },
    });
    const outcome = runAutoEnmsLearningDraftEvaluation("s-enms-auto-1");
    expect(outcome).toEqual({ status: "skipped", reason: "intent_not_high_value" });
  });

  it("skips when an existing draft has been reviewed", () => {
    sessionStore.set("s-enms-auto-1", {
      ...baseSessionMeta,
      enmsPlannerLearningDraft: { writeback: { status: "promoted" } },
    });
    const outcome = runAutoEnmsLearningDraftEvaluation("s-enms-auto-1");
    expect(outcome).toEqual({ status: "skipped", reason: "draft_already_reviewed" });
  });

  it("skips when an existing draft is too recent", () => {
    const now = 1710000010000;
    sessionStore.set("s-enms-auto-1", {
      ...baseSessionMeta,
      enmsPlannerLearningDraft: {
        status: "ready",
        writeback: { status: "not_written" },
        meta: { generated_at: now - 5000 },
      },
    });
    const outcome = runAutoEnmsLearningDraftEvaluation("s-enms-auto-1", { now });
    expect(outcome).toEqual({ status: "skipped", reason: "draft_too_recent" });
  });

  it("generates and persists a draft for high-value EnMS intent", () => {
    sessionStore.set("s-enms-auto-1", baseSessionMeta);
    const outcome = runAutoEnmsLearningDraftEvaluation("s-enms-auto-1");
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

  it("regenerates if the existing draft is older than the recency window", () => {
    const now = 1710000020000;
    sessionStore.set("s-enms-auto-1", {
      ...baseSessionMeta,
      enmsPlannerLearningDraft: {
        status: "ready",
        writeback: { status: "not_written" },
        meta: { generated_at: now - 60_000 },
      },
    });
    const outcome = runAutoEnmsLearningDraftEvaluation("s-enms-auto-1", { now });
    expect(outcome.status).toBe("generated");
    expect(updateCalls.length).toBe(1);
  });

  it("skips when transcript has no eligible messages", () => {
    mockTranscript = [];
    sessionStore.set("s-enms-auto-1", baseSessionMeta);
    const outcome = runAutoEnmsLearningDraftEvaluation("s-enms-auto-1");
    expect(outcome).toEqual({ status: "skipped", reason: "no_eligible_messages" });
    expect(updateCalls.length).toBe(0);
  });
});
