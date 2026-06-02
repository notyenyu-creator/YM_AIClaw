import type { EnmsPlannerPreflight } from "./enms-context-builder";

export type EnmsContextPack = {
  planner: EnmsPlannerPreflight;
  presentation: {
    optional_chart_requested: boolean;
    chart_render_allowed: boolean;
    chart_guardrail_reason: string | null;
    max_chart_panels: number;
  };
  read_first: string[];
  references: string[];
  wiki: string[];
  playbooks: string[];
  memory_keys: string[];
  live_query_steps: string[];
  execution_hints: string[];
};

function pushUnique(target: string[], value: string) {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function buildReferences(preflight: EnmsPlannerPreflight): string[] {
  const references = [
    "skills/enms/reference/auto-schema-enms.md",
    "skills/enms/reference/db-schema-cheatsheet.md",
  ];

  if (
    preflight.intent === "demand_forecast" ||
    preflight.intent === "site_benchmarking" ||
    preflight.intent === "efficiency_analysis"
  ) {
    references.push("skills/enms/reference/analysis-templates.md");
  }

  if (
    preflight.intent === "natural_language_query" ||
    preflight.intent === "alert_governance" ||
    preflight.intent === "unknown"
  ) {
    references.push("skills/enms/reference/feature-guide.md");
  }

  return references;
}

function buildWiki(preflight: EnmsPlannerPreflight): string[] {
  const pages: string[] = [];

  if (preflight.intent === "demand_forecast") {
    pushUnique(pages, "wiki/entities/energy/ENMS_DEMAND_FORECAST_TEMPLATE.md");
  }
  if (
    preflight.intent === "site_benchmarking" ||
    preflight.intent === "efficiency_analysis"
  ) {
    pushUnique(
      pages,
      "wiki/entities/sites/ENMS_SITE_ENERGY_SUMMARY_TEMPLATE.md",
    );
  }
  if (
    preflight.intent === "anomaly_detection" ||
    preflight.intent === "raw_trace" ||
    preflight.intent === "alert_governance"
  ) {
    pushUnique(
      pages,
      "wiki/operations/enms/ENMS_ANOMALY_ROOT_CAUSE_TEMPLATE.md",
    );
  }
  if (preflight.intent === "alert_governance") {
    pushUnique(
      pages,
      "wiki/operations/enms/ENMS_ALERT_GOVERNANCE_TEMPLATE.md",
    );
  }
  if (preflight.intent === "efficiency_analysis") {
    pushUnique(
      pages,
      "wiki/operations/enms/ENMS_EFFICIENCY_SUMMARY_TEMPLATE.md",
    );
  }
  if (preflight.intent === "raw_trace") {
    pushUnique(
      pages,
      "wiki/operations/enms/ENMS_RAW_TRACE_SUMMARY_TEMPLATE.md",
    );
  }
  if (preflight.intent === "natural_language_query") {
    pushUnique(
      pages,
      "wiki/operations/enms/ENMS_NL_QUERY_SUMMARY_TEMPLATE.md",
    );
  }

  return pages;
}

function buildPlaybooks(preflight: EnmsPlannerPreflight): string[] {
  const playbooks: string[] = [];

  if (
    preflight.intent === "demand_forecast" ||
    preflight.intent === "alert_governance"
  ) {
    pushUnique(
      playbooks,
      "wiki/playbooks/enms/ENMS_LOAD_SHEDDING_PLAYBOOK_TEMPLATE.md",
    );
  }
  if (preflight.intent === "site_benchmarking") {
    pushUnique(
      playbooks,
      "wiki/playbooks/enms/ENMS_SITE_BENCHMARKING_PLAYBOOK_TEMPLATE.md",
    );
  }
  if (preflight.intent === "anomaly_detection") {
    pushUnique(
      playbooks,
      "wiki/playbooks/enms/ENMS_ANOMALY_TRIAGE_PLAYBOOK_TEMPLATE.md",
    );
  }
  if (preflight.intent === "alert_governance") {
    pushUnique(
      playbooks,
      "wiki/playbooks/enms/ENMS_ALERT_TUNING_PLAYBOOK_TEMPLATE.md",
    );
  }
  if (preflight.intent === "efficiency_analysis") {
    pushUnique(
      playbooks,
      "wiki/playbooks/enms/ENMS_EFFICIENCY_IMPROVEMENT_PLAYBOOK_TEMPLATE.md",
    );
  }
  if (preflight.intent === "raw_trace") {
    pushUnique(
      playbooks,
      "wiki/playbooks/enms/ENMS_DATA_TRACE_PLAYBOOK_TEMPLATE.md",
    );
  }

  return playbooks;
}

function buildMemoryKeys(preflight: EnmsPlannerPreflight): string[] {
  const memory = [
    "known_rule:enms_only_use_dot27_postgres_as_primary_source",
    "known_rule:enms_join_meter_site_company_before_answer",
    "known_rule:enms_summary_view_before_raw_trace",
  ];

  if (preflight.intent === "raw_trace") {
    pushUnique(
      memory,
      "known_rule:enms_trace_layer_is_debug_only_not_primary_truth",
    );
  }

  return memory;
}

function buildLiveQuerySteps(preflight: EnmsPlannerPreflight): string[] {
  const steps = [
    "read_summary_view_first",
    "inspect_timescale_metadata",
    "join_meter_master",
  ];

  if (
    preflight.intent === "anomaly_detection" ||
    preflight.intent === "raw_trace" ||
    preflight.intent === "alert_governance"
  ) {
    pushUnique(steps, "fallback_to_raw_hypertable");
    pushUnique(steps, "verify_quality_and_connected_signals");
  }

  if (
    preflight.intent === "demand_forecast" ||
    preflight.intent === "efficiency_analysis" ||
    preflight.intent === "alert_governance"
  ) {
    pushUnique(steps, "join_power_account_scope");
  }

  if (
    preflight.intent === "site_benchmarking" ||
    preflight.intent === "efficiency_analysis"
  ) {
    pushUnique(steps, "join_site_gateway_company_scope");
  }

  return steps;
}

function buildExecutionHints(
  preflight: EnmsPlannerPreflight,
  presentation: EnmsContextPack["presentation"],
): string[] {
  const hints = [
    "Use the OpenClaw Gateway session runtime and follow the Hermes-style planner/context flow for this request.",
    "Treat the AI Wiki layer as durable operating knowledge, but treat EnMS PostgreSQL / TimescaleDB as the source-of-truth for energy measurements.",
    "Only use the .27 PostgreSQL / TimescaleDB instance as the primary EnMS source. Do not use .29 for this flow.",
    "Prefer DeviceDataSummaryView for KPI, demand, trend, and benchmarking questions before reading raw hypertable data.",
    "Use mqtt_raw_data for anomaly detection, root-cause analysis, and power-quality drill-down only after summary-layer context is clear.",
    "Do not rely on FK-only schema inference; EnMS contains logical relations that must be joined through device, site, gateway, and company semantics.",
    "Always join ElectricityMeter, PowerAccounts, sites, site_gateways, and ComCompany before making business-facing claims.",
    "Do not treat Mongo as the primary analysis source for phase-1 EnMS integration.",
    "Use postgres_scanner in READ_ONLY mode and never emit INSERT/UPDATE/DELETE statements.",
    "When token pressure is high, prefer a concise summary over dumping raw rows or oversized charts.",
  ];

  if (
    preflight.intent === "anomaly_detection" ||
    preflight.intent === "raw_trace"
  ) {
    hints.push(
      "If the question is root-cause oriented, compare summary-layer anomalies against raw ps / pfs / ia / ib / ic / va / vb / vc and THD evidence.",
    );
    hints.push(
      "Treat anomaly detection as a rule-plus-statistical-baseline workflow: validate demand spikes, low power factor, connectivity, THD, phase imbalance, and quality degradation before escalating.",
    );
  }

  if (
    preflight.intent === "demand_forecast" ||
    preflight.intent === "alert_governance"
  ) {
    hints.push(
      "Demand / alert analysis should pull contract or power-account semantics before making curtailment or over-contract recommendations.",
    );
    hints.push(
      "When enough DeviceDataSummaryView history exists, use a statistical demand forecast against contract capacity instead of letting the LLM invent projected peak values.",
    );
  }

  if (preflight.intent === "alert_governance") {
    hints.push(
      "Separate prewarning from alert severity by combining forecast pressure, anomaly findings, and operational ownership rather than emitting a flat alert list.",
    );
  }

  if (presentation.optional_chart_requested) {
    hints.push(
      "Charts are optional support visuals. Finish the factual EnMS summary first.",
    );
    hints.push(
      `Only render charts if non-empty aggregated EnMS data exists, and do not exceed ${presentation.max_chart_panels} panels.`,
    );
    hints.push(
      "After you have verified non-empty aggregate rows, emit report-json using VALUES constants from the real EnMS query result so the chart mirrors the confirmed data.",
    );
    hints.push(
      "Do not emit an EnMS chart card when aggregate rows are empty, and do not point report-json panels at guessed table names or unresolved SQL.",
    );
  }

  if (preflight.warnings.length > 0) {
    hints.push(`Watch-outs: ${preflight.warnings.join(", ")}.`);
  }

  return hints;
}

export function buildEnmsContextPack(
  preflight: EnmsPlannerPreflight,
): EnmsContextPack {
  return {
    planner: preflight,
    presentation: preflight.presentation,
    read_first: [
      "skills/enms/SKILL.md",
      "skills/enms/reference/auto-schema-enms.md",
    ],
    references: buildReferences(preflight),
    wiki: buildWiki(preflight),
    playbooks: buildPlaybooks(preflight),
    memory_keys: buildMemoryKeys(preflight),
    live_query_steps: buildLiveQuerySteps(preflight),
    execution_hints: buildExecutionHints(preflight, preflight.presentation),
  };
}

export function decorateMessageWithEnmsContextPack(
  userMessage: string,
  pack: EnmsContextPack,
): string {
  if (!pack.planner.shouldRouteToEnms) {
    return userMessage;
  }

  const compactReadFirst = pack.read_first.slice(0, 2);
  const compactReferences = pack.references.slice(0, 2);
  const compactWiki = pack.wiki.slice(0, 2);
  const compactPlaybooks = pack.playbooks.slice(0, 1);
  const compactMemory = pack.memory_keys.slice(0, 3);
  const compactLive = pack.live_query_steps.slice(0, 5);
  const compactHints = pack.execution_hints.slice(0, 8);

  const lines = [
    "[EnMS Context Pack]",
    "runtime.gateway=openclaw_gateway",
    "runtime.orchestration=hermes_style",
    "runtime.knowledge_layer=ai_wiki",
    "runtime.pack_mode=compact",
    "runtime.token_budget_mode=compact_guarded",
    `planner.intent=${pack.planner.intent}`,
    `planner.confidence=${pack.planner.confidence}`,
    "planner.system_scope=enms",
    `planner.matched_keywords=${pack.planner.matchedKeywords.join(",") || "none"}`,
    `planner.read_first=${compactReadFirst.join(" | ")}`,
    `planner.references=${compactReferences.length > 0 ? compactReferences.join(" | ") : "none"}`,
    `planner.wiki=${compactWiki.length > 0 ? compactWiki.join(" | ") : "none"}`,
    `planner.playbooks=${compactPlaybooks.length > 0 ? compactPlaybooks.join(" | ") : "none"}`,
    `planner.memory=${compactMemory.length > 0 ? compactMemory.join(",") : "none"}`,
    `planner.live=${compactLive.join(",")}`,
    `planner.presentation.optional_chart_requested=${pack.presentation.optional_chart_requested ? "true" : "false"}`,
    `planner.presentation.chart_render_allowed=${pack.presentation.chart_render_allowed ? "true" : "false"}`,
    `planner.presentation.max_chart_panels=${pack.presentation.max_chart_panels}`,
    `planner.presentation.chart_guardrail=${pack.presentation.chart_guardrail_reason ?? "none"}`,
    `planner.warnings=${pack.planner.warnings.length > 0 ? pack.planner.warnings.join(",") : "none"}`,
    "Guidance:",
    ...compactHints.map((hint) => `- ${hint}`),
    "[/EnMS Context Pack]",
  ];

  return `${lines.join("\n")}\n\n${userMessage}`;
}
