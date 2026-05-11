import { describe, expect, it } from "vitest";
import {
  applyErpLearningDraftWriteback,
  buildErpLearningDraft,
  markErpLearningDraftAsCached,
} from "./erp-learning-draft";
import type { ErpPlannerPreflight } from "./erp-context-builder";
import type { ErpContextPack } from "./erp-context-pack";

const basePresentation = {
  optional_chart_requested: false,
  chart_render_allowed: false,
  chart_guardrail_reason: null,
  max_chart_panels: 0,
};

function makePreflight(
  intent: ErpPlannerPreflight["intent"],
  overrides: Partial<ErpPlannerPreflight> = {},
): ErpPlannerPreflight {
  return {
    system: "erp",
    updatedAt: 1710000000000,
    intent,
    confidence: "high",
    shouldRouteToErp: true,
    matchedKeywords: ["庫存"],
    warnings: [],
    presentation: basePresentation,
    ...overrides,
  };
}

function makePack(intent: ErpPlannerPreflight["intent"]): ErpContextPack {
  return {
    planner: makePreflight(intent),
    presentation: basePresentation,
    read_first: ["skills/erp/SKILL.md"],
    references: [],
    wiki: [],
    playbooks: [],
    memory_keys: [],
    live_query_steps: ["read_real_data", "read_auto_schema_first"],
    execution_hints: [],
  };
}

describe("buildErpLearningDraft", () => {
  it("returns insufficient_context when planner is missing", () => {
    const draft = buildErpLearningDraft({
      session_id: "s-erp-1",
      planner_preflight: null,
      planner_context_pack: null,
      messages: [],
    });
    expect(draft.status).toBe("insufficient_context");
    expect(draft.learning_focus).toBe("planner_not_available");
    expect(draft.drafts.wiki).toEqual([]);
    expect(draft.drafts.playbooks).toEqual([]);
    expect(draft.history?.[0].event).toBe("draft_skipped_insufficient_context");
  });

  it("returns insufficient_context when shouldRouteToErp is false", () => {
    const draft = buildErpLearningDraft({
      session_id: "s-erp-2",
      planner_preflight: makePreflight("unknown", { shouldRouteToErp: false }),
      planner_context_pack: null,
      messages: [],
    });
    expect(draft.status).toBe("insufficient_context");
  });

  it("creates sales_order summary + order_fulfillment playbook for sales_order intent", () => {
    const draft = buildErpLearningDraft({
      session_id: "s-sales-1",
      planner_preflight: makePreflight("sales_order"),
      planner_context_pack: makePack("sales_order"),
      messages: [
        { role: "user", content: "OOCHAIN 本月還沒出貨的訂單" },
        { role: "assistant", content: "整理出 3 張訂單，2 張過交期" },
      ],
    });
    expect(draft.status).toBe("ready");
    expect(draft.learning_focus).toBe("sales_order");
    expect(draft.drafts.wiki.map((w) => w.kind)).toContain("sales_order_summary");
    expect(draft.drafts.playbooks.map((p) => p.kind)).toContain("order_fulfillment");
    expect(draft.drafts.wiki[0].suggested_path).toMatch(/wiki\/entities\/orders\/.*sales-order-summary\.md$/);
    expect(draft.drafts.memory.map((m) => m.key)).toContain("known_rule:exclude_cancelled_documents");
  });

  it("creates inventory_snapshot + records available_qty rule for inventory_status", () => {
    const draft = buildErpLearningDraft({
      session_id: "s-inv-1",
      planner_preflight: makePreflight("inventory_status"),
      planner_context_pack: makePack("inventory_status"),
      messages: [
        { role: "user", content: "目前可用庫存最多的前 10 個商品" },
      ],
    });
    expect(draft.drafts.wiki.map((w) => w.kind)).toContain("inventory_snapshot");
    expect(draft.drafts.playbooks.map((p) => p.kind)).toContain("inventory_health");
    expect(draft.drafts.memory.map((m) => m.key)).toContain(
      "known_rule:inventory_available_vs_allocated",
    );
  });

  it("creates work_order_summary + production_diagnosis for production_status", () => {
    const draft = buildErpLearningDraft({
      session_id: "s-prod-1",
      planner_preflight: makePreflight("production_status"),
      planner_context_pack: makePack("production_status"),
      messages: [{ role: "user", content: "這張工單做到哪了" }],
    });
    expect(draft.drafts.wiki.map((w) => w.kind)).toContain("work_order_summary");
    expect(draft.drafts.playbooks.map((p) => p.kind)).toContain("production_diagnosis");
  });

  it("creates shipment_tracking for shipping_status", () => {
    const draft = buildErpLearningDraft({
      session_id: "s-ship-1",
      planner_preflight: makePreflight("shipping_status"),
      planner_context_pack: makePack("shipping_status"),
      messages: [{ role: "user", content: "出貨進度" }],
    });
    expect(draft.drafts.wiki.map((w) => w.kind)).toContain("shipment_tracking");
  });

  it("creates purchase_order_summary + procurement_review for purchase_order", () => {
    const draft = buildErpLearningDraft({
      session_id: "s-po-1",
      planner_preflight: makePreflight("purchase_order"),
      planner_context_pack: makePack("purchase_order"),
      messages: [{ role: "user", content: "供應商交期" }],
    });
    expect(draft.drafts.wiki.map((w) => w.kind)).toContain("purchase_order_summary");
    expect(draft.drafts.playbooks.map((p) => p.kind)).toContain("procurement_review");
  });

  it("always records the uppercase-table and read-only rules in memory", () => {
    const draft = buildErpLearningDraft({
      session_id: "s-mem-1",
      planner_preflight: makePreflight("inventory_status"),
      planner_context_pack: makePack("inventory_status"),
      messages: [],
    });
    const memKeys = draft.drafts.memory.map((m) => m.key);
    expect(memKeys).toContain("known_rule:erp_tables_are_uppercase_and_quoted");
    expect(memKeys).toContain("known_rule:erp_queries_must_be_read_only");
  });

  it("captures live_query_steps from the planner pack", () => {
    const draft = buildErpLearningDraft({
      session_id: "s-evidence-1",
      planner_preflight: makePreflight("sales_order"),
      planner_context_pack: makePack("sales_order"),
      messages: [],
    });
    expect(draft.evidence.live_query_steps).toContain("read_real_data");
    expect(draft.evidence.live_query_steps).toContain("read_auto_schema_first");
  });

  it("compacts long messages in the evidence section", () => {
    const longMessage = "a".repeat(500);
    const draft = buildErpLearningDraft({
      session_id: "s-compact-1",
      planner_preflight: makePreflight("sales_order"),
      planner_context_pack: makePack("sales_order"),
      messages: [{ role: "user", content: longMessage }],
    });
    expect(draft.evidence.latest_user_message?.length).toBeLessThanOrEqual(180);
    expect(draft.evidence.latest_user_message?.endsWith("...")).toBe(true);
  });
});

describe("markErpLearningDraftAsCached", () => {
  it("flips the cached flag and updates the source", () => {
    const fresh = buildErpLearningDraft({
      session_id: "s-cache-1",
      planner_preflight: makePreflight("sales_order"),
      planner_context_pack: makePack("sales_order"),
      messages: [],
    });
    const cached = markErpLearningDraftAsCached(fresh);
    expect(cached.meta.cached).toBe(true);
    expect(cached.meta.source).toBe("session_cache");
  });
});

describe("applyErpLearningDraftWriteback", () => {
  it("transitions to written and appends a history entry", () => {
    const fresh = buildErpLearningDraft({
      session_id: "s-wb-1",
      planner_preflight: makePreflight("sales_order"),
      planner_context_pack: makePack("sales_order"),
      messages: [],
    });
    const updated = applyErpLearningDraftWriteback(fresh, {
      files: ["wiki/entities/orders/s-wb-1-sales-order-summary.md"],
      skipped_files: [],
    });
    expect(updated.writeback.status).toBe("written");
    expect(updated.writeback.files).toHaveLength(1);
    expect(updated.history?.at(-1)?.event).toBe("wiki_draft_written");
    expect(updated.history?.at(-1)?.tone).toBe("success");
  });

  it("uses warning tone when writeback produced no new files", () => {
    const fresh = buildErpLearningDraft({
      session_id: "s-wb-2",
      planner_preflight: makePreflight("sales_order"),
      planner_context_pack: makePack("sales_order"),
      messages: [],
    });
    const updated = applyErpLearningDraftWriteback(fresh, {
      files: [],
      skipped_files: ["wiki/entities/orders/s-wb-2-sales-order-summary.md"],
    });
    expect(updated.history?.at(-1)?.tone).toBe("warning");
  });
});
