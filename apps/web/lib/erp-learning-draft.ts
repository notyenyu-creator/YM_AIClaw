// ERP Learning Draft — Phase 2a
//
// Mirrors the Y-CRM learning-draft pattern. Generates a first-pass
// knowledge-page draft from a session's persisted ERP planner artifacts
// and recent transcript snippets.

import type { ErpPlannerPreflight } from "./erp-context-builder";
import type { ErpContextPack } from "./erp-context-pack";

export type ErpLearningDraftMessage = {
  id?: string;
  role: "user" | "assistant";
  content?: string;
};

export type ErpLearningDraftInput = {
  session_id: string;
  planner_preflight: ErpPlannerPreflight | null;
  planner_context_pack: ErpContextPack | null;
  messages: ErpLearningDraftMessage[];
};

export type ErpLearningDraft = {
  session_id: string;
  status: "ready" | "insufficient_context";
  learning_focus: string;
  summary: string;
  meta: {
    generated_at: number;
    generation_mode: "minimal_evidence";
    token_guardrails: string[];
    cached: boolean;
    source: "fresh_generation" | "session_cache";
  };
  writeback: {
    status:
      | "not_written"
      | "written"
      | "promoted"
      | "promotion_conflicted"
      | "resolution_kept_current";
    updated_at: number | null;
    files: string[];
    skipped_files: string[];
    promoted_files: string[];
    promotion_skipped_files: string[];
    promotion_conflict_files: string[];
    approved_at?: number | null;
    approved_via?: "manual_promotion" | "manual_force_promotion" | null;
    resolution_action?: "keep_current_page" | "force_promote_override" | null;
    resolved_at?: number | null;
    review_reason?: string | null;
    reviewer_note?: string | null;
    reviewer_actor?: string | null;
  };
  evidence: {
    latest_user_message: string | null;
    latest_assistant_reply: string | null;
    live_query_steps: string[];
    matched_keywords: string[];
  };
  drafts: {
    wiki: Array<{
      kind:
        | "sales_order_summary"
        | "inventory_snapshot"
        | "shipment_tracking"
        | "work_order_summary"
        | "purchase_order_summary"
        | "service_ticket_summary"
        | "finance_doc_summary";
      suggested_path: string;
      title: string;
      reason: string;
      outline: string[];
    }>;
    playbooks: Array<{
      kind:
        | "order_fulfillment"
        | "inventory_health"
        | "production_diagnosis"
        | "procurement_review";
      suggested_path: string;
      title: string;
      reason: string;
      next_sections: string[];
    }>;
    memory: Array<{
      key: string;
      value: string;
      reason: string;
    }>;
  };
  history?: ErpLearningDraftHistoryEntry[];
};

export type ErpLearningDraftHistoryEntry = {
  at: number;
  event:
    | "draft_generated"
    | "draft_skipped_insufficient_context"
    | "wiki_draft_written"
    | "promotion_conflicted"
    | "promotion_succeeded"
    | "resolution_kept_current";
  tone: "neutral" | "success" | "warning";
  summary: string;
  files: string[];
  review_reason?: string | null;
  reviewer_note?: string | null;
  reviewer_actor?: string | null;
};

function normalizeOptionalReviewText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function appendHistoryEntry(
  draft: ErpLearningDraft,
  entry: Omit<ErpLearningDraftHistoryEntry, "at"> & { at?: number },
): ErpLearningDraftHistoryEntry[] {
  return [
    ...(draft.history ?? []),
    {
      at: entry.at ?? Date.now(),
      event: entry.event,
      tone: entry.tone,
      summary: entry.summary,
      files: [...entry.files],
      review_reason: entry.review_reason ?? null,
      reviewer_note: entry.reviewer_note ?? null,
      reviewer_actor: entry.reviewer_actor ?? null,
    },
  ];
}

function compactText(value: string | null | undefined, max = 180): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

function latestMessage(
  messages: ErpLearningDraftMessage[],
  role: "user" | "assistant",
): string | null {
  const message = [...messages].reverse().find((entry) => entry.role === role);
  return compactText(message?.content);
}

function sessionSuffix(sessionId: string): string {
  return sessionId.slice(0, 8);
}

const EMPTY_WRITEBACK = {
  status: "not_written" as const,
  updated_at: null,
  files: [] as string[],
  skipped_files: [] as string[],
  promoted_files: [] as string[],
  promotion_skipped_files: [] as string[],
  promotion_conflict_files: [] as string[],
  approved_at: null,
  approved_via: null,
  resolution_action: null,
  resolved_at: null,
  review_reason: null,
  reviewer_note: null,
  reviewer_actor: null,
};

export function buildErpLearningDraft(
  input: ErpLearningDraftInput,
): ErpLearningDraft {
  const latestUserMessage = latestMessage(input.messages, "user");
  const latestAssistantReply = latestMessage(input.messages, "assistant");
  const planner = input.planner_preflight;
  const pack = input.planner_context_pack;
  const suffix = sessionSuffix(input.session_id);

  if (!planner || !planner.shouldRouteToErp) {
    return {
      session_id: input.session_id,
      status: "insufficient_context",
      learning_focus: "planner_not_available",
      summary: "This session does not yet have a persisted ERP planner context, so no learning draft was generated.",
      meta: {
        generated_at: Date.now(),
        generation_mode: "minimal_evidence",
        token_guardrails: [
          "manual_trigger_only",
          "planner_context_only",
          "single_session_single_draft",
        ],
        cached: false,
        source: "fresh_generation",
      },
      writeback: { ...EMPTY_WRITEBACK },
      evidence: {
        latest_user_message: latestUserMessage,
        latest_assistant_reply: latestAssistantReply,
        live_query_steps: [],
        matched_keywords: [],
      },
      drafts: { wiki: [], playbooks: [], memory: [] },
      history: [
        {
          at: Date.now(),
          event: "draft_skipped_insufficient_context",
          tone: "warning",
          summary: "Skipped learning draft generation because the session does not yet have persisted ERP planner context.",
          files: [],
        },
      ],
    };
  }

  const wiki: ErpLearningDraft["drafts"]["wiki"] = [];
  const playbooks: ErpLearningDraft["drafts"]["playbooks"] = [];
  const memory: ErpLearningDraft["drafts"]["memory"] = [];
  const liveQuerySteps = [...(pack?.live_query_steps ?? [])];

  if (planner.intent === "sales_order") {
    wiki.push({
      kind: "sales_order_summary",
      suggested_path: `wiki/entities/orders/${suffix}-sales-order-summary.md`,
      title: `ERP Sales Order Summary Draft ${suffix}`,
      reason: "This session analyzed sales orders and should leave behind a reusable order summary page.",
      outline: [
        "訂單範圍與客戶背景",
        "目前出貨/揀貨/開立發票狀態",
        "下一步追蹤與風險點",
      ],
    });
    playbooks.push({
      kind: "order_fulfillment",
      suggested_path: `wiki/playbooks/erp/${suffix}-order-fulfillment-playbook.md`,
      title: `ERP Order Fulfillment Playbook Draft ${suffix}`,
      reason: "Capture the order-fulfillment investigation pattern used in this session.",
      next_sections: [
        "起點：客戶/訂單脈絡如何取得",
        "必要查詢步驟（SO / SO_LINE / DO / cancelled_at IS NULL）",
        "輸出格式：摘要 + 風險點 + 後續建議",
      ],
    });
  }

  if (planner.intent === "inventory_status") {
    wiki.push({
      kind: "inventory_snapshot",
      suggested_path: `wiki/entities/items/${suffix}-inventory-snapshot.md`,
      title: `ERP Inventory Snapshot Draft ${suffix}`,
      reason: "This session reviewed inventory levels and should leave behind a reusable snapshot.",
      outline: [
        "查詢範圍（company/site/item 範圍）",
        "在手 / 可用 / 保留 / 已分配 數量摘要",
        "低庫存或異常項目",
      ],
    });
    playbooks.push({
      kind: "inventory_health",
      suggested_path: `wiki/playbooks/erp/${suffix}-inventory-health-playbook.md`,
      title: `ERP Inventory Health Playbook Draft ${suffix}`,
      reason: "Capture the inventory-health investigation pattern.",
      next_sections: [
        "黃金規則：available_qty vs allocated_qty 區分",
        "JOIN B_ITEM 取得品項名稱",
        "建議的圖表與彙整層級",
      ],
    });
  }

  if (planner.intent === "shipping_status") {
    wiki.push({
      kind: "shipment_tracking",
      suggested_path: `wiki/operations/erp/${suffix}-shipment-tracking.md`,
      title: `ERP Shipment Tracking Draft ${suffix}`,
      reason: "This session tracked shipping/picking status and should leave behind a reusable tracking summary.",
      outline: [
        "對應的銷售單與客戶",
        "DO / PICK 進度狀態",
        "已出/未出/延誤分析",
      ],
    });
  }

  if (planner.intent === "production_status") {
    wiki.push({
      kind: "work_order_summary",
      suggested_path: `wiki/entities/work-orders/${suffix}-work-order-summary.md`,
      title: `ERP Work Order Summary Draft ${suffix}`,
      reason: "This session analyzed production/work orders and should leave behind a reusable WO summary.",
      outline: [
        "工單與成品/客戶對應",
        "plan_qty / finished_qty / 良率",
        "工序卡點與下一步建議",
      ],
    });
    playbooks.push({
      kind: "production_diagnosis",
      suggested_path: `wiki/playbooks/erp/${suffix}-production-diagnosis-playbook.md`,
      title: `ERP Production Diagnosis Playbook Draft ${suffix}`,
      reason: "Capture the production-diagnosis investigation pattern.",
      next_sections: [
        "WO → WO_PROCESS → WO_PROCESS_REPORT 路徑",
        "良率與卡點識別",
        "與 SO 的關聯",
      ],
    });
  }

  if (planner.intent === "purchase_order") {
    wiki.push({
      kind: "purchase_order_summary",
      suggested_path: `wiki/entities/purchases/${suffix}-purchase-order-summary.md`,
      title: `ERP Purchase Order Summary Draft ${suffix}`,
      reason: "This session analyzed purchases and should leave behind a reusable PO summary.",
      outline: [
        "供應商與採購範圍",
        "PO / GR 進度與交期",
        "未進貨 / 延誤情況",
      ],
    });
    playbooks.push({
      kind: "procurement_review",
      suggested_path: `wiki/playbooks/erp/${suffix}-procurement-review-playbook.md`,
      title: `ERP Procurement Review Playbook Draft ${suffix}`,
      reason: "Capture the procurement-review investigation pattern.",
      next_sections: [
        "PR → PO → GR 流程節點",
        "供應商交期表現",
        "與庫存的關聯（PO_LINE.received_qty）",
      ],
    });
  }

  if (planner.intent === "service_ticket") {
    wiki.push({
      kind: "service_ticket_summary",
      suggested_path: `wiki/operations/erp/${suffix}-service-ticket-summary.md`,
      title: `ERP Service Ticket Summary Draft ${suffix}`,
      reason: "This session reviewed service tickets and should leave behind a reusable summary.",
      outline: [
        "客戶與產品脈絡",
        "工時 / 用料 / 處理狀態",
        "後續追蹤建議",
      ],
    });
  }

  if (planner.intent === "finance_doc") {
    wiki.push({
      kind: "finance_doc_summary",
      suggested_path: `wiki/operations/erp/${suffix}-finance-doc-summary.md`,
      title: `ERP Finance Doc Summary Draft ${suffix}`,
      reason: "This session reviewed finance docs and should leave behind a reusable summary.",
      outline: [
        "傳票/發票範圍與客戶/供應商",
        "對應的銷售/採購單",
        "應收/應付狀態",
      ],
    });
  }

  // Memory entries are durable rules captured from this session.
  memory.push({
    key: "known_rule:erp_tables_are_uppercase_and_quoted",
    value: 'All ERP tables must be referenced as erp.public."TABLE_NAME"; lowercase or unquoted form will fail.',
    reason: "This session interacted with ERP tables and reinforced the casing rule.",
  });
  memory.push({
    key: "known_rule:erp_queries_must_be_read_only",
    value: "ERP phase-1 is read-only via DuckDB postgres_scanner; never emit INSERT/UPDATE/DELETE.",
    reason: "This session queried ERP and reinforced the read-only rule.",
  });

  if (planner.intent === "inventory_status") {
    memory.push({
      key: "known_rule:inventory_available_vs_allocated",
      value: 'For "available stock" questions use available_qty (not allocated_qty). UAT allocated_qty is often 0.',
      reason: "This session involved an inventory query and reinforced the column-choice rule.",
    });
  }

  if (
    planner.intent === "sales_order"
    || planner.intent === "purchase_order"
    || planner.intent === "shipping_status"
  ) {
    memory.push({
      key: "known_rule:exclude_cancelled_documents",
      value: "Always WHERE cancelled_at IS NULL when analyzing transactional ERP documents.",
      reason: "This session worked with transactional documents and reinforced the cancellation filter.",
    });
  }

  return {
    session_id: input.session_id,
    status: "ready",
    learning_focus: planner.intent,
    summary: `Generated a first-pass ERP learning draft from the persisted session context for intent "${planner.intent}".`,
    meta: {
      generated_at: Date.now(),
      generation_mode: "minimal_evidence",
      token_guardrails: [
        "manual_trigger_only",
        "planner_context_only",
        "single_session_single_draft",
      ],
      cached: false,
      source: "fresh_generation",
    },
    writeback: { ...EMPTY_WRITEBACK },
    evidence: {
      latest_user_message: latestUserMessage,
      latest_assistant_reply: latestAssistantReply,
      live_query_steps: liveQuerySteps,
      matched_keywords: [...planner.matchedKeywords],
    },
    drafts: { wiki, playbooks, memory },
    history: [
      {
        at: Date.now(),
        event: "draft_generated",
        tone: "neutral",
        summary: `Generated an ERP learning draft for intent "${planner.intent}" using minimal-evidence mode.`,
        files: [],
      },
    ],
  };
}

export function markErpLearningDraftAsCached(
  draft: ErpLearningDraft,
): ErpLearningDraft {
  return {
    ...draft,
    meta: { ...draft.meta, cached: true, source: "session_cache" },
  };
}

export function applyErpLearningDraftWriteback(
  draft: ErpLearningDraft,
  result: { files: string[]; skipped_files: string[] },
): ErpLearningDraft {
  return {
    ...draft,
    writeback: {
      ...draft.writeback,
      status: "written",
      updated_at: Date.now(),
      files: [...result.files],
      skipped_files: [...result.skipped_files],
    },
    history: appendHistoryEntry(draft, {
      event: "wiki_draft_written",
      tone: result.files.length > 0 ? "success" : "warning",
      summary:
        result.files.length > 0
          ? `Wrote ${result.files.length} ERP wiki draft file${result.files.length === 1 ? "" : "s"} for review.`
          : "Writeback completed without creating new ERP wiki draft files.",
      files: [...result.files, ...result.skipped_files],
    }),
  };
}

export function applyErpLearningDraftPromotion(
  draft: ErpLearningDraft,
  result: {
    promoted_files: string[];
    skipped_files: string[];
    conflict_files?: string[];
    approved_via?: "manual_promotion" | "manual_force_promotion";
    resolution_action?: "force_promote_override" | null;
    review_reason?: string | null;
    reviewer_note?: string | null;
    reviewer_actor?: string | null;
  },
): ErpLearningDraft {
  const hasPromotedFiles = result.promoted_files.length > 0;
  const hasConflicts = (result.conflict_files?.length ?? 0) > 0;
  const approvedAt = hasPromotedFiles ? Date.now() : (draft.writeback.approved_at ?? null);
  const approvedVia = hasPromotedFiles
    ? (result.approved_via ?? "manual_promotion")
    : (draft.writeback.approved_via ?? null);
  const resolutionAction = hasPromotedFiles
    ? (result.resolution_action ?? null)
    : (draft.writeback.resolution_action ?? null);
  const resolvedAt = hasPromotedFiles && result.resolution_action
    ? Date.now()
    : (draft.writeback.resolved_at ?? null);
  const reviewReason = normalizeOptionalReviewText(result.review_reason) ?? (draft.writeback.review_reason ?? null);
  const reviewerNote = normalizeOptionalReviewText(result.reviewer_note) ?? (draft.writeback.reviewer_note ?? null);
  const reviewerActor = normalizeOptionalReviewText(result.reviewer_actor) ?? (draft.writeback.reviewer_actor ?? null);

  return {
    ...draft,
    writeback: {
      ...draft.writeback,
      status: hasConflicts ? "promotion_conflicted" : "promoted",
      updated_at: Date.now(),
      promoted_files: [...result.promoted_files],
      promotion_skipped_files: [...result.skipped_files],
      promotion_conflict_files: [...(result.conflict_files ?? [])],
      approved_at: approvedAt,
      approved_via: approvedVia,
      resolution_action: resolutionAction,
      resolved_at: resolvedAt,
      review_reason: reviewReason,
      reviewer_note: reviewerNote,
      reviewer_actor: reviewerActor,
    },
    history: appendHistoryEntry(draft, {
      event: hasConflicts ? "promotion_conflicted" : "promotion_succeeded",
      tone: hasConflicts ? "warning" : "success",
      summary: hasConflicts
        ? `Promotion paused because ${result.conflict_files?.length ?? 0} ERP wiki page conflict${(result.conflict_files?.length ?? 0) === 1 ? "" : "s"} need review.`
        : result.approved_via === "manual_force_promotion"
          ? `Force-promoted ${result.promoted_files.length} ERP wiki draft file${result.promoted_files.length === 1 ? "" : "s"} after manual override.`
          : `Promoted ${result.promoted_files.length} ERP wiki draft file${result.promoted_files.length === 1 ? "" : "s"} into the wiki registry.`,
      files: hasConflicts
        ? [...(result.conflict_files ?? [])]
        : [...result.promoted_files, ...result.skipped_files],
      review_reason: reviewReason,
      reviewer_note: reviewerNote,
      reviewer_actor: reviewerActor,
    }),
  };
}

export function applyErpLearningDraftKeepCurrentResolution(
  draft: ErpLearningDraft,
  result: {
    conflict_files: string[];
    review_reason?: string | null;
    reviewer_note?: string | null;
    reviewer_actor?: string | null;
  },
): ErpLearningDraft {
  const reviewReason = normalizeOptionalReviewText(result.review_reason) ?? (draft.writeback.review_reason ?? null);
  const reviewerNote = normalizeOptionalReviewText(result.reviewer_note) ?? (draft.writeback.reviewer_note ?? null);
  const reviewerActor = normalizeOptionalReviewText(result.reviewer_actor) ?? (draft.writeback.reviewer_actor ?? null);

  return {
    ...draft,
    writeback: {
      ...draft.writeback,
      status: "resolution_kept_current",
      updated_at: Date.now(),
      promotion_conflict_files: [...result.conflict_files],
      resolution_action: "keep_current_page",
      resolved_at: Date.now(),
      review_reason: reviewReason,
      reviewer_note: reviewerNote,
      reviewer_actor: reviewerActor,
    },
    history: appendHistoryEntry(draft, {
      event: "resolution_kept_current",
      tone: "warning",
      summary: "Kept the current ERP wiki page and recorded the draft as reviewed without overwriting content.",
      files: [...result.conflict_files],
      review_reason: reviewReason,
      reviewer_note: reviewerNote,
      reviewer_actor: reviewerActor,
    }),
  };
}
