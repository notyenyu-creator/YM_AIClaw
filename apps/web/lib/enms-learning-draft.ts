import type { EnmsPlannerPreflight } from "./enms-context-builder";
import type { EnmsContextPack } from "./enms-context-pack";

export type EnmsLearningDraftMessage = {
  id?: string;
  role: "user" | "assistant";
  content?: string;
};

export type EnmsLearningDraftInput = {
  session_id: string;
  planner_preflight: EnmsPlannerPreflight | null;
  planner_context_pack: EnmsContextPack | null;
  messages: EnmsLearningDraftMessage[];
};

export type EnmsLearningDraft = {
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
        | "demand_forecast_summary"
        | "site_energy_summary"
        | "anomaly_root_cause"
        | "alert_governance_summary"
        | "efficiency_summary"
        | "raw_trace_summary"
        | "natural_language_query_summary";
      suggested_path: string;
      title: string;
      reason: string;
      outline: string[];
    }>;
    playbooks: Array<{
      kind:
        | "load_shedding"
        | "site_benchmarking"
        | "anomaly_triage"
        | "alert_tuning"
        | "efficiency_improvement"
        | "data_trace";
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
  history?: EnmsLearningDraftHistoryEntry[];
};

export type EnmsLearningDraftHistoryEntry = {
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

function normalizeOptionalReviewText(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function appendHistoryEntry(
  draft: EnmsLearningDraft,
  entry: Omit<EnmsLearningDraftHistoryEntry, "at"> & { at?: number },
): EnmsLearningDraftHistoryEntry[] {
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
  messages: EnmsLearningDraftMessage[],
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

export function buildEnmsLearningDraft(
  input: EnmsLearningDraftInput,
): EnmsLearningDraft {
  const latestUserMessage = latestMessage(input.messages, "user");
  const latestAssistantReply = latestMessage(input.messages, "assistant");
  const planner = input.planner_preflight;
  const pack = input.planner_context_pack;
  const suffix = sessionSuffix(input.session_id);

  if (!planner || !planner.shouldRouteToEnms) {
    return {
      session_id: input.session_id,
      status: "insufficient_context",
      learning_focus: "planner_not_available",
      summary:
        "This session does not yet have a persisted EnMS planner context, so no learning draft was generated.",
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
          summary:
            "Skipped learning draft generation because the session does not yet have persisted EnMS planner context.",
          files: [],
        },
      ],
    };
  }

  const wiki: EnmsLearningDraft["drafts"]["wiki"] = [];
  const playbooks: EnmsLearningDraft["drafts"]["playbooks"] = [];
  const memory: EnmsLearningDraft["drafts"]["memory"] = [];
  const liveQuerySteps = [...(pack?.live_query_steps ?? [])];

  if (planner.intent === "demand_forecast") {
    wiki.push({
      kind: "demand_forecast_summary",
      suggested_path: `wiki/entities/energy/${suffix}-demand-forecast-summary.md`,
      title: `EnMS Demand Forecast Draft ${suffix}`,
      reason:
        "This session analyzed demand and over-contract risk, so it should leave behind a reusable demand summary page.",
      outline: [
        "需量範圍與場域/電號背景",
        "最大需量、契約容量與超約風險",
        "可執行的降載建議與注意事項",
      ],
    });
    playbooks.push({
      kind: "load_shedding",
      suggested_path: `wiki/playbooks/enms/${suffix}-load-shedding-playbook.md`,
      title: `EnMS Load Shedding Playbook Draft ${suffix}`,
      reason: "Capture the demand-forecast and curtailment workflow used in this session.",
      next_sections: [
        "先看 DeviceDataSummaryView 的關鍵聚合欄位",
        "何時需要 join PowerAccounts / 契約容量語意",
        "輸出降載建議時的 guardrails",
      ],
    });
  }

  if (planner.intent === "anomaly_detection") {
    wiki.push({
      kind: "anomaly_root_cause",
      suggested_path: `wiki/operations/enms/${suffix}-anomaly-root-cause.md`,
      title: `EnMS Anomaly Root Cause Draft ${suffix}`,
      reason:
        "This session investigated electrical anomalies and should leave behind a reusable root-cause summary.",
      outline: [
        "異常事件範圍與時間點",
        "summary layer 與 raw layer 的對照證據",
        "可能根因、風險等級與後續動作",
      ],
    });
    playbooks.push({
      kind: "anomaly_triage",
      suggested_path: `wiki/playbooks/enms/${suffix}-anomaly-triage-playbook.md`,
      title: `EnMS Anomaly Triage Playbook Draft ${suffix}`,
      reason: "Capture the anomaly triage pattern used in this session.",
      next_sections: [
        "先看 summary，再 fallback raw hypertable",
        "ps / pfs / ia / ib / ic / va / vb / vc / THD 的對照方式",
        "根因說明前必做的主資料 join",
      ],
    });
  }

  if (planner.intent === "site_benchmarking") {
    wiki.push({
      kind: "site_energy_summary",
      suggested_path: `wiki/entities/sites/${suffix}-site-energy-summary.md`,
      title: `EnMS Site Benchmark Draft ${suffix}`,
      reason:
        "This session compared site-level energy performance and should leave behind a reusable benchmarking page.",
      outline: [
        "場域與公司範圍",
        "TotalConsumption / MaxDemand / AvgPowerFactor 比較",
        "人均 / 坪均能耗與差異解讀",
      ],
    });
    playbooks.push({
      kind: "site_benchmarking",
      suggested_path: `wiki/playbooks/enms/${suffix}-site-benchmarking-playbook.md`,
      title: `EnMS Site Benchmarking Playbook Draft ${suffix}`,
      reason: "Capture the multi-site benchmarking workflow used in this session.",
      next_sections: [
        "sites / site_gateways / ComCompany 的 join 順序",
        "適合比較的 KPI 與不適合直接比較的訊號",
        "如何輸出排名與差異解釋",
      ],
    });
  }

  if (planner.intent === "alert_governance") {
    wiki.push({
      kind: "alert_governance_summary",
      suggested_path: `wiki/operations/enms/${suffix}-alert-governance-summary.md`,
      title: `EnMS Alert Governance Draft ${suffix}`,
      reason:
        "This session focused on alerts and over-contract governance, so it should leave behind a reusable alert summary.",
      outline: [
        "告警範圍與門檻邏輯",
        "誤報 / 漏報與需量事件對照",
        "調整建議與人工確認事項",
      ],
    });
    playbooks.push({
      kind: "alert_tuning",
      suggested_path: `wiki/playbooks/enms/${suffix}-alert-tuning-playbook.md`,
      title: `EnMS Alert Tuning Playbook Draft ${suffix}`,
      reason: "Capture the alert tuning and governance workflow used in this session.",
      next_sections: [
        "DemandAlertHistory 與 raw signal 的比對方式",
        "需要補的 PowerAccount / 契約容量語意",
        "告警調整前的審核邊界",
      ],
    });
  }

  if (planner.intent === "efficiency_analysis") {
    wiki.push({
      kind: "efficiency_summary",
      suggested_path: `wiki/entities/energy/${suffix}-efficiency-summary.md`,
      title: `EnMS Efficiency Analysis Draft ${suffix}`,
      reason:
        "This session analyzed power-factor and energy-efficiency signals and should leave behind a reusable efficiency page.",
      outline: [
        "分析範圍與設備/場域背景",
        "TotalConsumption / PowerFactor / Kvarh 關鍵指標",
        "節能機會與驗證方法",
      ],
    });
    playbooks.push({
      kind: "efficiency_improvement",
      suggested_path: `wiki/playbooks/enms/${suffix}-efficiency-improvement-playbook.md`,
      title: `EnMS Efficiency Improvement Playbook Draft ${suffix}`,
      reason: "Capture the energy-efficiency diagnosis workflow used in this session.",
      next_sections: [
        "先看 summary 聚合，再用 raw evidence 補細節",
        "company / floor area / employee count 的 benchmark 邏輯",
        "建議輸出格式與驗證步驟",
      ],
    });
  }

  if (planner.intent === "raw_trace") {
    wiki.push({
      kind: "raw_trace_summary",
      suggested_path: `wiki/operations/enms/${suffix}-raw-trace-summary.md`,
      title: `EnMS Raw Trace Draft ${suffix}`,
      reason:
        "This session drilled into MQTT / Timescale raw data and should leave behind a reusable trace summary.",
      outline: [
        "raw table / topic / payload 範圍",
        "對應設備、場域與時間點",
        "trace 結論與是否需要回到 summary 層驗證",
      ],
    });
    playbooks.push({
      kind: "data_trace",
      suggested_path: `wiki/playbooks/enms/${suffix}-data-trace-playbook.md`,
      title: `EnMS Data Trace Playbook Draft ${suffix}`,
      reason: "Capture the raw-trace debugging workflow used in this session.",
      next_sections: [
        "何時可以進 raw trace，何時不該直接跳 raw",
        "mqtt_raw_data / mqtt_raw_messages 的用途區分",
        "trace 完成後如何回寫成可復用知識",
      ],
    });
  }

  if (planner.intent === "natural_language_query") {
    wiki.push({
      kind: "natural_language_query_summary",
      suggested_path: `wiki/operations/enms/${suffix}-query-summary.md`,
      title: `EnMS Query Summary Draft ${suffix}`,
      reason:
        "This session translated a natural-language energy question into DB analysis steps and should leave behind a reusable summary.",
      outline: [
        "問題定義與查詢範圍",
        "使用的資料層與 join 規則",
        "結果摘要與後續可追問方向",
      ],
    });
  }

  memory.push({
    key: "known_rule:enms_only_use_dot27_postgres_as_primary_source",
    value:
      "Use the .27 PostgreSQL / TimescaleDB instance as the primary EnMS source-of-truth; do not use .29 in this flow.",
    reason: "This session reinforced the EnMS primary source boundary.",
  });
  memory.push({
    key: "known_rule:enms_summary_view_before_raw_trace",
    value:
      "Prefer DeviceDataSummaryView for KPI, demand, trend, and benchmarking questions before reading raw hypertable data.",
    reason: "This session reinforced the summary-first EnMS analysis workflow.",
  });
  memory.push({
    key: "known_rule:enms_join_meter_power_site_company_before_answer",
    value:
      "Join ElectricityMeter, PowerAccounts, sites, site_gateways, and ComCompany before making business-facing EnMS claims.",
    reason: "This session reinforced the EnMS semantic join requirement.",
  });

  if (
    planner.intent === "anomaly_detection" ||
    planner.intent === "raw_trace"
  ) {
    memory.push({
      key: "known_rule:enms_raw_trace_is_debug_layer_not_primary_truth",
      value:
        "Treat mqtt_raw_data / mqtt_raw_messages as drill-down and debug layers, not the first layer for executive conclusions.",
      reason: "This session required raw-signal drill-down and reinforced the debug-layer rule.",
    });
  }

  if (
    planner.intent === "demand_forecast" ||
    planner.intent === "alert_governance"
  ) {
    memory.push({
      key: "known_rule:enms_join_power_account_before_curtailment_advice",
      value:
        "Demand, alert, and curtailment recommendations must include PowerAccounts / contract semantics before giving action advice.",
      reason: "This session reinforced the contract-capacity guardrail.",
    });
  }

  if (
    planner.intent === "site_benchmarking" ||
    planner.intent === "efficiency_analysis"
  ) {
    memory.push({
      key: "known_rule:enms_benchmark_requires_site_company_density_context",
      value:
        "Site benchmarking should include company, floor-area, and employee context before making density comparisons.",
      reason: "This session reinforced the benchmarking context requirement.",
    });
  }

  return {
    session_id: input.session_id,
    status: "ready",
    learning_focus: planner.intent,
    summary: `Generated a first-pass EnMS learning draft from the persisted session context for intent "${planner.intent}".`,
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
        summary: `Generated an EnMS learning draft for intent "${planner.intent}" using minimal-evidence mode.`,
        files: [],
      },
    ],
  };
}

export function markEnmsLearningDraftAsCached(
  draft: EnmsLearningDraft,
): EnmsLearningDraft {
  return {
    ...draft,
    meta: { ...draft.meta, cached: true, source: "session_cache" },
  };
}

export function applyEnmsLearningDraftWriteback(
  draft: EnmsLearningDraft,
  result: { files: string[]; skipped_files: string[] },
): EnmsLearningDraft {
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
          ? `Wrote ${result.files.length} EnMS wiki draft file${result.files.length === 1 ? "" : "s"} for review.`
          : "Writeback completed without creating new EnMS wiki draft files.",
      files: [...result.files, ...result.skipped_files],
    }),
  };
}

export function applyEnmsLearningDraftPromotion(
  draft: EnmsLearningDraft,
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
): EnmsLearningDraft {
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
        ? `Promotion paused because ${result.conflict_files?.length ?? 0} EnMS wiki page conflict${(result.conflict_files?.length ?? 0) === 1 ? "" : "s"} need review.`
        : result.approved_via === "manual_force_promotion"
          ? `Force-promoted ${result.promoted_files.length} EnMS wiki draft file${result.promoted_files.length === 1 ? "" : "s"} after manual override.`
          : `Promoted ${result.promoted_files.length} EnMS wiki draft file${result.promoted_files.length === 1 ? "" : "s"} into the wiki registry.`,
      files: hasConflicts
        ? [...(result.conflict_files ?? [])]
        : [...result.promoted_files, ...result.skipped_files],
      review_reason: reviewReason,
      reviewer_note: reviewerNote,
      reviewer_actor: reviewerActor,
    }),
  };
}

export function applyEnmsLearningDraftKeepCurrentResolution(
  draft: EnmsLearningDraft,
  result: {
    conflict_files: string[];
    review_reason?: string | null;
    reviewer_note?: string | null;
    reviewer_actor?: string | null;
  },
): EnmsLearningDraft {
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
      summary:
        "Kept the current EnMS wiki page and recorded the draft as reviewed without overwriting content.",
      files: [...result.conflict_files],
      review_reason: reviewReason,
      reviewer_note: reviewerNote,
      reviewer_actor: reviewerActor,
    }),
  };
}
