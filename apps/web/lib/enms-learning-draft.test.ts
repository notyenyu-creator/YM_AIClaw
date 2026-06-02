import { describe, expect, it } from "vitest";
import {
  applyEnmsLearningDraftKeepCurrentResolution,
  applyEnmsLearningDraftPromotion,
  applyEnmsLearningDraftWriteback,
  buildEnmsLearningDraft,
  markEnmsLearningDraftAsCached,
} from "./enms-learning-draft";
import type { EnmsPlannerPreflight } from "./enms-context-builder";
import type { EnmsContextPack } from "./enms-context-pack";

const basePresentation = {
  optional_chart_requested: false,
  chart_render_allowed: false,
  chart_guardrail_reason: null,
  max_chart_panels: 0,
};

function makePreflight(
  intent: EnmsPlannerPreflight["intent"],
  overrides: Partial<EnmsPlannerPreflight> = {},
): EnmsPlannerPreflight {
  return {
    system: "enms",
    updatedAt: 1710000000000,
    intent,
    confidence: "high",
    shouldRouteToEnms: true,
    matchedKeywords: ["需量"],
    warnings: [],
    presentation: basePresentation,
    ...overrides,
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
    live_query_steps: ["read_summary_view_first", "join_meter_master"],
    execution_hints: [],
  };
}

describe("buildEnmsLearningDraft", () => {
  it("returns insufficient_context when planner is missing", () => {
    const draft = buildEnmsLearningDraft({
      session_id: "s-enms-1",
      planner_preflight: null,
      planner_context_pack: null,
      messages: [],
    });
    expect(draft.status).toBe("insufficient_context");
    expect(draft.learning_focus).toBe("planner_not_available");
    expect(draft.history?.[0].event).toBe("draft_skipped_insufficient_context");
  });

  it("creates demand forecast wiki + load shedding playbook", () => {
    const draft = buildEnmsLearningDraft({
      session_id: "s-demand-1",
      planner_preflight: makePreflight("demand_forecast"),
      planner_context_pack: makePack("demand_forecast"),
      messages: [
        { role: "user", content: "請分析最大需量和超約風險" },
        { role: "assistant", content: "整理出三個場域的需量風險" },
      ],
    });
    expect(draft.status).toBe("ready");
    expect(draft.drafts.wiki.map((item) => item.kind)).toContain(
      "demand_forecast_summary",
    );
    expect(draft.drafts.playbooks.map((item) => item.kind)).toContain(
      "load_shedding",
    );
    expect(draft.drafts.memory.map((item) => item.key)).toContain(
      "known_rule:enms_join_power_account_before_curtailment_advice",
    );
  });

  it("creates anomaly root cause wiki + anomaly triage playbook", () => {
    const draft = buildEnmsLearningDraft({
      session_id: "s-anom-1",
      planner_preflight: makePreflight("anomaly_detection", {
        matchedKeywords: ["異常", "thd"],
      }),
      planner_context_pack: makePack("anomaly_detection"),
      messages: [{ role: "user", content: "這個電表功因異常的根因是什麼？" }],
    });
    expect(draft.drafts.wiki.map((item) => item.kind)).toContain(
      "anomaly_root_cause",
    );
    expect(draft.drafts.playbooks.map((item) => item.kind)).toContain(
      "anomaly_triage",
    );
    expect(draft.evidence.matched_keywords).toContain("異常");
  });

  it("creates site benchmark wiki + site benchmarking playbook", () => {
    const draft = buildEnmsLearningDraft({
      session_id: "s-site-1",
      planner_preflight: makePreflight("site_benchmarking"),
      planner_context_pack: makePack("site_benchmarking"),
      messages: [{ role: "user", content: "比較各場域的人均和坪均能耗" }],
    });
    expect(draft.drafts.wiki.map((item) => item.kind)).toContain(
      "site_energy_summary",
    );
    expect(draft.drafts.playbooks.map((item) => item.kind)).toContain(
      "site_benchmarking",
    );
  });

  it("creates alert governance and efficiency drafts for their respective intents", () => {
    const alertDraft = buildEnmsLearningDraft({
      session_id: "s-alert-1",
      planner_preflight: makePreflight("alert_governance"),
      planner_context_pack: makePack("alert_governance"),
      messages: [{ role: "user", content: "告警門檻是不是太敏感" }],
    });
    const efficiencyDraft = buildEnmsLearningDraft({
      session_id: "s-eff-1",
      planner_preflight: makePreflight("efficiency_analysis"),
      planner_context_pack: makePack("efficiency_analysis"),
      messages: [{ role: "user", content: "哪個場域的功因最差" }],
    });

    expect(alertDraft.drafts.wiki.map((item) => item.kind)).toContain(
      "alert_governance_summary",
    );
    expect(alertDraft.drafts.playbooks.map((item) => item.kind)).toContain(
      "alert_tuning",
    );
    expect(efficiencyDraft.drafts.wiki.map((item) => item.kind)).toContain(
      "efficiency_summary",
    );
    expect(efficiencyDraft.drafts.playbooks.map((item) => item.kind)).toContain(
      "efficiency_improvement",
    );
  });

  it("captures raw trace and natural language query drafts", () => {
    const rawDraft = buildEnmsLearningDraft({
      session_id: "s-raw-1",
      planner_preflight: makePreflight("raw_trace"),
      planner_context_pack: makePack("raw_trace"),
      messages: [{ role: "user", content: "看 mqtt_raw_messages 的 payload" }],
    });
    const queryDraft = buildEnmsLearningDraft({
      session_id: "s-query-1",
      planner_preflight: makePreflight("natural_language_query"),
      planner_context_pack: makePack("natural_language_query"),
      messages: [{ role: "user", content: "這週總用電最高的場域是哪個" }],
    });

    expect(rawDraft.drafts.wiki.map((item) => item.kind)).toContain(
      "raw_trace_summary",
    );
    expect(rawDraft.drafts.playbooks.map((item) => item.kind)).toContain(
      "data_trace",
    );
    expect(queryDraft.drafts.wiki.map((item) => item.kind)).toContain(
      "natural_language_query_summary",
    );
  });

  it("always records the primary-source and semantic-join rules", () => {
    const draft = buildEnmsLearningDraft({
      session_id: "s-mem-1",
      planner_preflight: makePreflight("demand_forecast"),
      planner_context_pack: makePack("demand_forecast"),
      messages: [],
    });
    const keys = draft.drafts.memory.map((item) => item.key);
    expect(keys).toContain(
      "known_rule:enms_only_use_dot27_postgres_as_primary_source",
    );
    expect(keys).toContain(
      "known_rule:enms_join_meter_power_site_company_before_answer",
    );
  });

  it("compacts long evidence messages", () => {
    const longMessage = "a".repeat(500);
    const draft = buildEnmsLearningDraft({
      session_id: "s-compact-1",
      planner_preflight: makePreflight("demand_forecast"),
      planner_context_pack: makePack("demand_forecast"),
      messages: [{ role: "user", content: longMessage }],
    });
    expect(draft.evidence.latest_user_message?.length).toBeLessThanOrEqual(180);
    expect(draft.evidence.latest_user_message?.endsWith("...")).toBe(true);
  });
});

describe("EnMS learning draft lifecycle helpers", () => {
  it("marks a draft as cached", () => {
    const fresh = buildEnmsLearningDraft({
      session_id: "s-cache-1",
      planner_preflight: makePreflight("demand_forecast"),
      planner_context_pack: makePack("demand_forecast"),
      messages: [],
    });
    const cached = markEnmsLearningDraftAsCached(fresh);
    expect(cached.meta.cached).toBe(true);
    expect(cached.meta.source).toBe("session_cache");
  });

  it("records writeback, promotion conflict, and keep-current resolution in history", () => {
    const fresh = buildEnmsLearningDraft({
      session_id: "s-flow-1",
      planner_preflight: makePreflight("demand_forecast"),
      planner_context_pack: makePack("demand_forecast"),
      messages: [],
    });
    const written = applyEnmsLearningDraftWriteback(fresh, {
      files: ["wiki/entities/energy/s-flow-1-demand-forecast-summary.md"],
      skipped_files: [],
    });
    const conflicted = applyEnmsLearningDraftPromotion(written, {
      promoted_files: [],
      skipped_files: [],
      conflict_files: ["wiki/entities/energy/s-flow-1-demand-forecast-summary.md"],
      review_reason: "Curated page already exists",
      reviewer_note: "Keep manual page",
      reviewer_actor: "YM",
    });
    const resolved = applyEnmsLearningDraftKeepCurrentResolution(conflicted, {
      conflict_files: ["wiki/entities/energy/s-flow-1-demand-forecast-summary.md"],
      review_reason: "Keep curated page",
      reviewer_note: "Reviewed",
      reviewer_actor: "YM",
    });

    expect(resolved.history?.map((entry) => entry.event)).toEqual([
      "draft_generated",
      "wiki_draft_written",
      "promotion_conflicted",
      "resolution_kept_current",
    ]);
    expect(resolved.writeback.review_reason).toBe("Keep curated page");
    expect(resolved.writeback.reviewer_actor).toBe("YM");
  });
});
