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
    pushUnique(
      playbooks,
      "wiki/playbooks/enms/ENMS_ROI_WHAT_IF_PLAYBOOK_TEMPLATE.md",
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
    pushUnique(steps, "normalize_by_company_context");
  }

  if (preflight.intent === "efficiency_analysis") {
    pushUnique(steps, "join_billing_tariff_scope");
    pushUnique(steps, "estimate_savings_scenarios");
  }

  return steps;
}

function buildExecutionHints(
  preflight: EnmsPlannerPreflight,
  presentation: EnmsContextPack["presentation"],
): string[] {
  const hints = [
    "Treat EnMS questions as DB-first requests: check the local EnMS PostgreSQL / TimescaleDB facts before answering from general model knowledge.",
    "If the EnMS DB query returns no rows or a required join path is missing, explicitly say the requested site / device / time range lacks data instead of falling back to generic energy knowledge or external web content.",
    "Use the OpenClaw Gateway session runtime and follow the Hermes-style planner/context flow for this request.",
    "Treat the AI Wiki layer as durable operating knowledge, but treat EnMS PostgreSQL / TimescaleDB as the source-of-truth for energy measurements.",
    "Only use the .27 PostgreSQL / TimescaleDB instance as the primary EnMS source. Do not use .29 for this flow.",
    "When EnMS SQL execution is required, use the server-side EnMS DB connector already configured by runtime environment variables; do not print, request, or infer database credentials in the answer.",
    "When using the exec tool for EnMS SQL, prefer the fixed helper script under skills/enms/scripts/query_enms.sh. If the SQL contains quoted identifiers, ORDER BY, or multiple clauses, send it via stdin/heredoc instead of wrapping the whole SQL in one shell-quoted argument.",
    "Do not guess alternative EnMS database names, local default hosts, or default database credentials. EnMS queries must use the runtime-configured server-side connector.",
    "Keep the alias simple and stable for EnMS queries: ATTACH the PostgreSQL source AS enms in READ_ONLY mode, then query enms.public tables/views.",
    "Prefer DeviceDataSummaryView for KPI, demand, trend, and benchmarking questions before reading raw hypertable data.",
    'DeviceDataSummaryView uses "MacAddress" (capital M/A) on the summary layer; raw-layer "mqtt_raw_data" uses lower-case "mac". Never query DeviceDataSummaryView.mac.',
    'For bill, ROI, what-if, or 電號 questions that mention an account number, start from PowerAccounts.AccountNumber and TaipowerBills.AccountNumber. Do not reinterpret an account name like "Demo 展示工廠" as sites.site_name.',
    'For site-scoped summary queries, map DeviceDataSummaryView."MacAddress" -> site_gateways.mac_address -> sites.site_id / sites.site_name. Do not filter DeviceDataSummaryView by site_name or SiteId directly because those columns are not present there.',
    'For device / meter / account questions, join DeviceDataSummaryView."MacAddress" + "CircuitSeq" -> ElectricityMeter."DeviceAddress" + "CircuitSeq" -> PowerAccounts."AccountId" -> PowerAccounts."SiteId" -> sites.site_id.',
    'In the current restored EnMS schema, ElectricityMeter uses "DeviceAlias" for friendly meter names. Do not guess a "MeterAlias" column.',
    'Do not search for site names like "阿里山" inside DeviceAddress, MacAddress, or DeviceAlias. Resolve the site through site_gateways or PowerAccounts.SiteId first, then filter by sites.site_name.',
    "Use mqtt_raw_data for anomaly detection, root-cause analysis, and power-quality drill-down only after summary-layer context is clear.",
    "Do not rely on FK-only schema inference; EnMS contains logical relations that must be joined through device, site, gateway, and company semantics.",
    "Always join ElectricityMeter, PowerAccounts, sites, site_gateways, and ComCompany before making business-facing claims.",
    "Do not treat Mongo as the primary analysis source for phase-1 EnMS integration.",
    "Use postgres_scanner in READ_ONLY mode and never emit INSERT/UPDATE/DELETE statements.",
    "If EnMS DB facts do not cover the requested site, device, time range, or metric, explicitly say what is missing instead of substituting generic world-energy background.",
    "Only provide external market / policy / industry background if the user explicitly asks for external context, and clearly label it as external information rather than EnMS data.",
    "Do not narrate failed SQL attempts, schema mistakes, or intermediate troubleshooting to the user. Silently correct the query path and return only the final DB-backed conclusion plus any true missing-data boundary.",
    "If the injected bootstrap facts already contain direct facts such as roi_preview_fact, site_benchmark_30d, power_factor_30d, top_load_7d, contract_risk_7d, alert_type_7d, or bill_trend_fact, treat them as verified EnMS DB facts and summarize them as 本地 EnMS DB 已彙整資料 before attempting exploratory SQL.",
    "For benchmarking, ROI, top-load, contract-risk, and bill-trend questions, prefer those concrete DB-backed facts over fresh ad-hoc queries unless the user explicitly asks for drill-down details.",
    "Never mention bootstrap, snapshot, 引導快照, derived facts, or internal labels in the final user-facing answer. Translate those labels into normal business language.",
    'Do not invent helper table names. In this EnMS runtime, labels like "roi_preview_fact" are derived bootstrap summaries, not queryable tables.',
    'Use "TaipowerBills" for bill history. Do not invent table names like electricity_bills, power_bills, or site_roi_preview.',
    'TaipowerBills."BillingMonth" uses ROC year-month numbering and is stored as text/varchar. Example: Gregorian 2025 corresponds to BillingMonth 11401..11412, not 202501..202512. Cast BillingMonth when doing numeric year filters.',
    'Do not invent a "PowerPlans" table. In the current restored EnMS schema, tariff metadata comes from PowerAccounts.CurrentPlanId -> ElectricityPricePlans -> ElectricityPriceRates.',
    'Do not assume PowerAccounts has a ContractCapacity column. If contract-capacity evidence is needed, look for it in DemandAlertHistory first and clearly state when no direct contract-capacity source is available for the requested time range or account.',
    'DemandAlertHistory is a real table in the restored EnMS schema. Query "DemandAlertHistory" with quoted CamelCase column names such as "AlertTime", "AccountNumber", "CurrentDemand", "ContractCapacity", and "UtilizationRate".',
    'Do not assume DemandAlertHistory has columns like AlertSeverity, SeverityLevel, IsSuppressed, or SuppressionReason unless schema introspection confirms them. If those governance fields are unavailable, classify alerts conservatively by AlertType, UtilizationRate, recency, and repetition instead.',
    'For 設備耗電排行 / 迴路最耗電 questions, aggregate sum(DeviceDataSummaryView."TotalConsumption") by site_name + DeviceAlias/DeviceName + CircuitSeq over the requested time window. Do not answer with raw timestamp rows unless the user explicitly asked for drill-down samples.',
    'For 最近6期帳單趨勢 questions, query TaipowerBills by exact AccountNumber, order by BillingMonth desc, limit 6, and summarize UsageAmount / TotalAmount / CurrentAvgRate from those rows.',
    'For 節電 5% / 10% 能省多少 questions, if TaipowerBills exists for the requested account, estimate both kWh savings and NTD savings from bill history or average bill rate. Do not stop at only kWh when the user clearly asked about ROI / savings.',
    'For 功率因數比較 questions, use avg(DeviceDataSummaryView."AvgPowerFactor") and min(DeviceDataSummaryView."MinPowerFactor") by site over the requested time window. Never sum power-factor fields or present values outside the realistic 0..1 range as valid PF results.',
    'For 能源趨勢 / 能源趨勢分析 questions, build time-series from DeviceDataSummaryView by date_trunc(requested grain, "RecordTime"), using sum("TotalConsumption") for energy, max("MaxDemand") for demand, and avg("AvgPowerFactor") for power factor. Do not use WeightedPowerFactorSum or ValidActivePowerSum as the headline power-factor trend.',
    'If the user asks for a chart or trend analysis and does not specify site/account/meter scope, first resolve the best available EnMS scope from site_match / account hints; otherwise clearly state that the chart is an all-visible-data trend rather than a single-site dashboard view.',
    "Preferred exec pattern for multi-clause EnMS SQL: cat <<'SQL' | bash skills/enms/scripts/query_enms.sh ... SQL",
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

  if (preflight.intent === "site_benchmarking") {
    hints.push(
      "For benchmarking, aggregate the same time window across sites, then rank by total kWh, peak demand, average power factor, and normalized density metrics.",
    );
    hints.push(
      "Use site_gateways.mac_address -> sites.site_id -> ComCompany.CompanyNo to map summary rows into site/company semantics before ranking.",
    );
    hints.push(
      'For site-level benchmarking, use DeviceDataSummaryView."TotalConsumption", "MaxDemand", and "AvgPowerFactor". Do not substitute fields like ValidActivePowerSum or WeightedPowerFactorSum as the headline benchmark KPIs unless the user explicitly asked for those raw/derived columns.',
    );
    hints.push(
      'When comparing power factor, use avg(DeviceDataSummaryView."AvgPowerFactor") and keep the result in the realistic range 0..1. If a derived result exceeds that range, mark the PF comparison as invalid instead of presenting an impossible value.',
    );
    hints.push(
      "If bootstrap facts already provide site_benchmark_30d and power_factor_30d values, prefer those authoritative facts. If an exploratory SQL attempt produces power-factor values outside 0..1 or totals that materially contradict the bootstrap facts, discard the exploratory result and answer from the bootstrap facts instead.",
    );
    hints.push(
      "Only claim kWh per employee or kWh per floor-area when EmployeeNum or TotalFloorArea exists; otherwise state that normalization depth is limited.",
    );
    hints.push(
      "If only one company or very few sites are present, explicitly label the benchmarking result as first-pass comparison rather than broad peer-group benchmarking.",
    );
  }

  if (preflight.intent === "efficiency_analysis") {
    hints.push(
      "For ROI / what-if analysis, join PowerAccounts.CurrentPlanId with ElectricityPricePlans / ElectricityPriceRates and use TaipowerBills when bill history exists.",
    );
    hints.push(
      "If the prompt includes a concrete account number, query TaipowerBills for that exact AccountNumber first, then use PowerAccounts to recover the site context only if needed.",
    );
    hints.push(
      "When bill history is available, estimate 5% and 10% savings scenarios from average usage and average bill rate before making investment claims.",
    );
    hints.push(
      "If the user provides CAPEX or retrofit cost, convert annual savings into simple payback; otherwise separate confirmed savings potential from missing investment assumptions.",
    );
    hints.push(
      "Keep ROI answers explainable: show baseline usage, applied rate source, scenario assumption, estimated savings, and which site/account still lacks billing evidence.",
    );
  }

  if (preflight.intent === "natural_language_query") {
    hints.push(
      "Interpret phrases like 能源趨勢, 能源趨勢分析, 總表, 主電表, 用電量, and 契約容量 as EnMS DB-backed analytics requests unless the user explicitly asks for external market context.",
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
  const compactLive = pack.live_query_steps;
  const compactHints = pack.execution_hints;

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
