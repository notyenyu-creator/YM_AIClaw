import type {
  EnmsChatAnswerObligation,
  EnmsChatAnswerObligationKey,
  EnmsChatQueryPlan,
  EnmsChatSemanticRouteKey,
  EnmsPageKey,
} from "./enms-capability-registry";

export const ENMS_SEMANTIC_GRAPH_VERSION = "2026-08-17.1";

export type EnmsSemanticGraphNodeKind =
  | "capability"
  | "metric"
  | "formula"
  | "fact_path"
  | "chart"
  | "knowledge_ref"
  | "entity_relation";

export type EnmsSemanticGraphMode = "shadow" | "enabled" | "fallback";

export type EnmsSemanticGraphCapabilityKey =
  | EnmsChatSemanticRouteKey
  | EnmsChatAnswerObligationKey
  | "chart_request";

export type EnmsSemanticGraphNode = {
  id: string;
  kind: EnmsSemanticGraphNodeKind;
  label: string;
  description: string;
};

export type EnmsSemanticGraphEdge = {
  from: string;
  to: string;
  relation:
    | "answers_with"
    | "measured_by"
    | "computed_by"
    | "requires_fact"
    | "renders_as"
    | "grounded_by"
    | "governed_by";
};

export type EnmsSemanticGraphCapabilityContract = {
  key: EnmsSemanticGraphCapabilityKey;
  pageKey: EnmsPageKey;
  obligationKeys: EnmsChatAnswerObligationKey[];
  units: string[];
  requiredFactPaths: string[];
  chartTypes: Array<"bar" | "line" | "ranking" | "metric">;
  knowledgeRefs: string[];
  graphPaths: string[];
  verifierRules: string[];
};

export type EnmsSemanticGraph = {
  version: string;
  nodes: EnmsSemanticGraphNode[];
  edges: EnmsSemanticGraphEdge[];
  capabilityContracts: EnmsSemanticGraphCapabilityContract[];
};

export type EnmsSemanticGraphPlan = {
  version: string;
  mode: EnmsSemanticGraphMode;
  applied: boolean;
  coverage: "complete" | "partial" | "none";
  selectedCapabilities: EnmsSemanticGraphCapabilityKey[];
  missingContractKeys: EnmsSemanticGraphCapabilityKey[];
  skippedContractKeys: EnmsSemanticGraphCapabilityKey[];
  selectedPageKeys: EnmsPageKey[];
  answerObligationKeys: EnmsChatAnswerObligationKey[];
  requiredFactPaths: string[];
  chartTypes: string[];
  knowledgeRefs: string[];
  graphPaths: string[];
  warnings: string[];
  reason: string;
};

type EnmsSemanticGraphPlanOptions = {
  enabledCapabilityKeys?: Set<string>;
};

const GRAPH_NODES: EnmsSemanticGraphNode[] = [
  {
    id: "capability:latest_data",
    kind: "capability",
    label: "最新資料時間",
    description: "回答授權範圍內最新資料時間與資料覆蓋狀態，不推測不存在的資料。",
  },
  {
    id: "capability:data_coverage",
    kind: "capability",
    label: "資料收集天數 / 覆蓋範圍",
    description: "回答授權電表時序資料的起訖、覆蓋日數、樣本數與電表數，不用最新資料取樣視窗代替。",
  },
  {
    id: "capability:same_slot_demand",
    kind: "capability",
    label: "同時段需量",
    description: "回答指定日期或最近 7 日同時段最高需量，單位必須是 kW。",
  },
  {
    id: "capability:today_demand_point",
    kind: "capability",
    label: "最新資料日 24 小時需量",
    description: "回答最新資料日 24 小時分頁中指定時間的 15 分鐘需量，單位必須是 kW。",
  },
  {
    id: "capability:daily_peak_demand_point",
    kind: "capability",
    label: "指定日期最高需量",
    description: "回答指定日期內 15 分鐘需量的最高值，單位必須是 kW。",
  },
  {
    id: "capability:monthly_peak_demand_point",
    kind: "capability",
    label: "本月最高需量點",
    description: "回答本月契約分頁中最高需量發生日期與 kW 數值。",
  },
  {
    id: "capability:daily_consumption_point",
    kind: "capability",
    label: "指定日期 / 最高日每日用電量",
    description: "回答 30 日總覽分頁中指定日期或最高用電日的每日 kWh 用電量。",
  },
  {
    id: "capability:period_energy_total",
    kind: "capability",
    label: "指定月份總用電",
    description: "回答指定月份、本月或上月整個本地日曆月的 kWh 用電加總。",
  },
  {
    id: "capability:forecast_readiness",
    kind: "capability",
    label: "Forecast 準備度",
    description: "回答 Forecast 準備度分頁的歷史長度、完整度、契約容量、外部變因等 readiness 分數。",
  },
  {
    id: "capability:energy_usage_query",
    kind: "capability",
    label: "用電量查詢",
    description: "回答總用電、每日用電與用電摘要，單位必須是 kWh。",
  },
  {
    id: "capability:anomaly_root_cause",
    kind: "capability",
    label: "異常根因",
    description: "回答異常訊號、偏離程度、功率因數與可能原因，需附 evidence。",
  },
  {
    id: "capability:meter_ranking",
    kind: "capability",
    label: "迴路 / 電表用電排名",
    description: "回答最費電、用電最高或排行問題，單位必須是 kWh。",
  },
  {
    id: "capability:device_lookup",
    kind: "capability",
    label: "設備 / 電表對應",
    description: "回答迴路、主電表、子電表、MAC、位址與設備名稱對應。",
  },
  {
    id: "capability:site_metadata",
    kind: "capability",
    label: "案場 / 場域資訊",
    description: "回答目前案場、公司、授權場域或 site metadata。",
  },
  {
    id: "capability:site_benchmarking",
    kind: "capability",
    label: "多場域 Benchmarking",
    description: "回答場域用電、需量與功率因數比較，需標明同一時間窗。",
  },
  {
    id: "capability:demand_risk",
    kind: "capability",
    label: "需量與契約風險",
    description: "回答當前需量、最大需量、契約容量與超約風險。",
  },
  {
    id: "capability:power_factor",
    kind: "capability",
    label: "功率因數",
    description: "回答平均 / 最低功率因數與低功因區間，數值範圍需為 0 到 1。",
  },
  {
    id: "capability:efficiency_power_factor",
    kind: "capability",
    label: "能效分頁功率因數",
    description: "回答能效節能挖掘分頁的平均功率因數，數值必須來自 eff scoped facts。",
  },
  {
    id: "capability:efficiency_advice",
    kind: "capability",
    label: "能效節能建議",
    description: "回答節能線索、待機基載、碳排與改善建議；缺費率或外部變因時需明確標示。",
  },
  {
    id: "capability:alert_governance",
    kind: "capability",
    label: "Alert 智能治理",
    description: "回答告警摘要、重複告警、門檻治理與優先處置建議。",
  },
  {
    id: "capability:billing",
    kind: "capability",
    label: "電費 / 帳單",
    description: "回答帳單、費率、基本電費與成本估算；缺已發布費率時不可使用固定假單價。",
  },
  {
    id: "capability:raw_trace",
    kind: "capability",
    label: "MQTT / Raw Trace",
    description: "回答 MQTT、raw payload 與入庫 trace；只能使用授權 facts 或 verified read-only query。",
  },
  {
    id: "capability:chart_request",
    kind: "capability",
    label: "圖表呈現",
    description: "將可驗證 facts 轉成 chart block，不產生未授權或猜測圖表。",
  },
  {
    id: "metric:demand_kw",
    kind: "metric",
    label: "需量 kW",
    description: "kW 是強度與尖峰指標，只能取最新、最大或平均，不可跨時間加總。",
  },
  {
    id: "metric:energy_kwh",
    kind: "metric",
    label: "用電量 kWh",
    description: "kWh 是用電量，可在同一 scope 與同一時間窗內加總。",
  },
  {
    id: "metric:data_coverage_days",
    kind: "metric",
    label: "資料覆蓋日數",
    description: "以授權時序資料在部署本地時區內有資料的日曆日數計算，不等同某個頁面的查詢視窗。",
  },
  {
    id: "metric:power_factor",
    kind: "metric",
    label: "功率因數",
    description: "功率因數為 0 到 1 的比例型指標，通常以平均、最低與低功因筆數判讀。",
  },
  {
    id: "metric:carbon_kgco2e",
    kind: "metric",
    label: "碳排 kgCO2e",
    description: "碳排以授權用電量乘上系統碳排係數估算，缺係數時必須標示不足。",
  },
  {
    id: "metric:cost_ntd",
    kind: "metric",
    label: "成本 NTD",
    description: "成本必須使用已發布費率或帳單資料；正式模式不可套固定假單價。",
  },
  {
    id: "metric:alert_count",
    kind: "metric",
    label: "告警筆數",
    description: "告警以授權範圍內的事件筆數、群組與重複次數判讀。",
  },
  {
    id: "formula:demand_max_not_sum",
    kind: "formula",
    label: "需量不可加總",
    description: "最大需量以同一電號 / billing reference 的時間桶取最大，不把不同時間點相加。",
  },
  {
    id: "formula:baseline_deviation_percent",
    kind: "formula",
    label: "基準偏離率",
    description: "偏離率 = (實際需量 - 歷史基準需量) / 歷史基準需量 × 100%，需同一時間點或同口徑基準比較。",
  },
  {
    id: "formula:energy_sum_same_window",
    kind: "formula",
    label: "同窗用電加總",
    description: "總用電必須在相同授權範圍與相同時間窗內加總 kWh。",
  },
  {
    id: "formula:data_coverage_local_dates",
    kind: "formula",
    label: "本地日曆日覆蓋",
    description: "資料覆蓋日數 = COUNT(DISTINCT recorded_at 依部署時區轉換後的本地日期)。",
  },
  {
    id: "formula:pf_avg_min_rule",
    kind: "formula",
    label: "功因平均與低功因判讀",
    description: "平均功因 >= 0.95 可視為良好，低於 0.9 的區間需列為風險證據。",
  },
  {
    id: "relation:meter_identity",
    kind: "entity_relation",
    label: "電表身份",
    description: "物理身份以 MAC、Address、CircuitSeq 與 surrogate ElectricityMeter id 協同判讀。",
  },
  {
    id: "relation:site_scope",
    kind: "entity_relation",
    label: "授權場域範圍",
    description: "所有 EnMS facts 必須先由 EnMS API 依 user/site/account/meter scope 裁切。",
  },
  {
    id: "fact_path:scoped_facts",
    kind: "fact_path",
    label: "EnMS Scoped Facts",
    description: "由 EnMS API 產生的最小授權 facts bundle；Graph 不自行查 DB。",
  },
  {
    id: "chart:demand_line",
    kind: "chart",
    label: "需量折線圖",
    description: "用於需量趨勢、同時段比較與契約容量線。",
  },
  {
    id: "chart:ranking_bar",
    kind: "chart",
    label: "排行長條圖",
    description: "用於場域或迴路用電排名。",
  },
  {
    id: "chart:metric_card",
    kind: "chart",
    label: "指標卡",
    description: "用於最新資料、功率因數、契約使用率等單值指標。",
  },
  {
    id: "knowledge:enms_skill",
    kind: "knowledge_ref",
    label: "EnMS Skill",
    description: "EnMS domain routing 與資料治理基礎規則。",
  },
  {
    id: "knowledge:analysis_templates",
    kind: "knowledge_ref",
    label: "分析模板",
    description: "需求預測、異常、benchmarking、節能與圖表輸出模板。",
  },
];

const GRAPH_EDGES: EnmsSemanticGraphEdge[] = [
  { from: "capability:latest_data", to: "fact_path:scoped_facts", relation: "requires_fact" },
  { from: "capability:latest_data", to: "relation:site_scope", relation: "governed_by" },
  { from: "capability:data_coverage", to: "metric:data_coverage_days", relation: "answers_with" },
  { from: "capability:data_coverage", to: "formula:data_coverage_local_dates", relation: "computed_by" },
  { from: "capability:data_coverage", to: "fact_path:scoped_facts", relation: "requires_fact" },
  { from: "capability:data_coverage", to: "relation:site_scope", relation: "governed_by" },
  { from: "capability:same_slot_demand", to: "metric:demand_kw", relation: "answers_with" },
  { from: "capability:same_slot_demand", to: "formula:demand_max_not_sum", relation: "computed_by" },
  { from: "capability:same_slot_demand", to: "chart:demand_line", relation: "renders_as" },
  { from: "capability:today_demand_point", to: "metric:demand_kw", relation: "answers_with" },
  { from: "capability:today_demand_point", to: "formula:demand_max_not_sum", relation: "computed_by" },
  { from: "capability:today_demand_point", to: "chart:demand_line", relation: "renders_as" },
  { from: "capability:daily_peak_demand_point", to: "metric:demand_kw", relation: "answers_with" },
  { from: "capability:daily_peak_demand_point", to: "formula:demand_max_not_sum", relation: "computed_by" },
  { from: "capability:daily_peak_demand_point", to: "chart:demand_line", relation: "renders_as" },
  { from: "capability:monthly_peak_demand_point", to: "metric:demand_kw", relation: "answers_with" },
  { from: "capability:monthly_peak_demand_point", to: "formula:demand_max_not_sum", relation: "computed_by" },
  { from: "capability:monthly_peak_demand_point", to: "chart:demand_line", relation: "renders_as" },
  { from: "capability:daily_consumption_point", to: "metric:energy_kwh", relation: "answers_with" },
  { from: "capability:daily_consumption_point", to: "formula:energy_sum_same_window", relation: "computed_by" },
  { from: "capability:daily_consumption_point", to: "chart:demand_line", relation: "renders_as" },
  { from: "capability:period_energy_total", to: "metric:energy_kwh", relation: "answers_with" },
  { from: "capability:period_energy_total", to: "formula:energy_sum_same_window", relation: "computed_by" },
  { from: "capability:period_energy_total", to: "chart:metric_card", relation: "renders_as" },
  { from: "capability:forecast_readiness", to: "metric:demand_kw", relation: "governed_by" },
  { from: "capability:forecast_readiness", to: "chart:demand_line", relation: "renders_as" },
  { from: "capability:energy_usage_query", to: "metric:energy_kwh", relation: "answers_with" },
  { from: "capability:energy_usage_query", to: "formula:energy_sum_same_window", relation: "computed_by" },
  { from: "capability:energy_usage_query", to: "chart:ranking_bar", relation: "renders_as" },
  { from: "capability:anomaly_root_cause", to: "metric:demand_kw", relation: "answers_with" },
  { from: "capability:anomaly_root_cause", to: "metric:power_factor", relation: "answers_with" },
  { from: "capability:anomaly_root_cause", to: "chart:demand_line", relation: "renders_as" },
  { from: "capability:meter_ranking", to: "metric:energy_kwh", relation: "answers_with" },
  { from: "capability:meter_ranking", to: "formula:energy_sum_same_window", relation: "computed_by" },
  { from: "capability:meter_ranking", to: "chart:ranking_bar", relation: "renders_as" },
  { from: "capability:device_lookup", to: "relation:meter_identity", relation: "governed_by" },
  { from: "capability:site_metadata", to: "relation:site_scope", relation: "governed_by" },
  { from: "capability:site_benchmarking", to: "metric:energy_kwh", relation: "answers_with" },
  { from: "capability:site_benchmarking", to: "metric:demand_kw", relation: "answers_with" },
  { from: "capability:site_benchmarking", to: "metric:power_factor", relation: "answers_with" },
  { from: "capability:site_benchmarking", to: "chart:ranking_bar", relation: "renders_as" },
  { from: "capability:demand_risk", to: "metric:demand_kw", relation: "answers_with" },
  { from: "capability:demand_risk", to: "formula:demand_max_not_sum", relation: "computed_by" },
  { from: "capability:power_factor", to: "metric:power_factor", relation: "answers_with" },
  { from: "capability:power_factor", to: "formula:pf_avg_min_rule", relation: "computed_by" },
  { from: "capability:efficiency_power_factor", to: "metric:power_factor", relation: "answers_with" },
  { from: "capability:efficiency_power_factor", to: "formula:pf_avg_min_rule", relation: "computed_by" },
  { from: "capability:efficiency_power_factor", to: "chart:metric_card", relation: "renders_as" },
  { from: "capability:efficiency_advice", to: "metric:energy_kwh", relation: "answers_with" },
  { from: "capability:efficiency_advice", to: "metric:carbon_kgco2e", relation: "answers_with" },
  { from: "capability:efficiency_advice", to: "metric:cost_ntd", relation: "answers_with" },
  { from: "capability:efficiency_advice", to: "chart:ranking_bar", relation: "renders_as" },
  { from: "capability:alert_governance", to: "metric:alert_count", relation: "answers_with" },
  { from: "capability:alert_governance", to: "chart:ranking_bar", relation: "renders_as" },
  { from: "capability:billing", to: "metric:cost_ntd", relation: "answers_with" },
  { from: "capability:billing", to: "chart:metric_card", relation: "renders_as" },
  { from: "capability:raw_trace", to: "fact_path:scoped_facts", relation: "requires_fact" },
  { from: "capability:chart_request", to: "chart:demand_line", relation: "renders_as" },
  { from: "capability:chart_request", to: "chart:ranking_bar", relation: "renders_as" },
  { from: "knowledge:enms_skill", to: "relation:site_scope", relation: "grounded_by" },
  { from: "knowledge:analysis_templates", to: "formula:demand_max_not_sum", relation: "grounded_by" },
];

const CAPABILITY_CONTRACTS: EnmsSemanticGraphCapabilityContract[] = [
  {
    key: "latest_data",
    pageKey: "nlq",
    obligationKeys: ["latest_data"],
    units: [],
    requiredFactPaths: [
      "facts.latestDataAt",
      "facts.metrics.latestDataAt",
    ],
    chartTypes: ["metric"],
    knowledgeRefs: [
      "skills/enms/SKILL.md",
      "skills/enms/reference/feature-guide.md",
    ],
    graphPaths: [
      "capability:latest_data -> fact_path:scoped_facts -> relation:site_scope",
    ],
    verifierRules: [
      "latest_data 必須回答授權範圍內資料時間，不可使用模型猜測日期。",
    ],
  },
  {
    key: "data_coverage",
    pageKey: "nlq",
    obligationKeys: ["data_coverage"],
    units: ["days"],
    requiredFactPaths: [
      "facts.dataCoverage.firstDataAt",
      "facts.dataCoverage.latestDataAt",
      "facts.dataCoverage.coveredDateCount",
      "facts.metrics.dataCoverageCoveredDateCount",
      "facts.metrics.dataCoverageSampleCount",
      "facts.metrics.dataCoverageMeterCount",
    ],
    chartTypes: ["metric"],
    knowledgeRefs: [
      "skills/enms/SKILL.md",
      "skills/enms/reference/feature-guide.md",
    ],
    graphPaths: [
      "capability:data_coverage -> metric:data_coverage_days -> formula:data_coverage_local_dates -> fact_path:scoped_facts -> relation:site_scope",
    ],
    verifierRules: [
      "data_coverage 必須回答授權電表時序資料的起訖與有資料日數，不可使用 latest_data sample window 代替。",
      "data_coverage 必須標示它是授權語意層的資料覆蓋，不是案場 metadata 或目前分頁 7 日 / 30 日視窗。",
    ],
  },
  {
    key: "same_slot_demand",
    pageKey: "demand",
    obligationKeys: ["same_slot_demand"],
    units: ["kW"],
    requiredFactPaths: [
      "facts.activeDemandView.key",
      "facts.activeDemandView.formula",
      "chartSeries.sameSlotDemand",
      "chartSeries.dailyPeakReference",
    ],
    chartTypes: ["line"],
    knowledgeRefs: [
      "skills/enms/SKILL.md",
      "skills/enms/reference/analysis-templates.md",
      "wiki/entities/energy/ENMS_DEMAND_FORECAST_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:same_slot_demand -> metric:demand_kw -> formula:demand_max_not_sum -> chart:demand_line",
    ],
    verifierRules: [
      "same_slot_demand 必須以 kW 回答，不可改用 kWh 排名。",
      "若使用圖表，文字與 chartSeries.sameSlotDemand 必須描述同一時間窗。",
    ],
  },
  {
    key: "today_demand_point",
    pageKey: "demand",
    obligationKeys: ["today_demand_point"],
    units: ["kW"],
    requiredFactPaths: [
      "facts.activeDemandView.key",
      "facts.activeDemandView.formula",
      "chartSeries.actualDemand",
      "chartSeries.contractCapacity",
    ],
    chartTypes: ["line"],
    knowledgeRefs: [
      "skills/enms/SKILL.md",
      "wiki/entities/energy/ENMS_DEMAND_FORECAST_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:today_demand_point -> metric:demand_kw -> formula:demand_max_not_sum -> chart:demand_line",
    ],
    verifierRules: [
      "today_demand_point 必須以 actualDemand kW 回答指定時間，不可改用最新資料時間或 30 日摘要。",
      "若使用圖表，文字與 chartSeries.actualDemand 必須描述同一最新資料日 24 小時視圖。",
    ],
  },
  {
    key: "daily_peak_demand_point",
    pageKey: "demand",
    obligationKeys: ["daily_peak_demand_point"],
    units: ["kW"],
    requiredFactPaths: [
      "facts.activeDemandView.key",
      "facts.activeDemandView.formula",
      "chartSeries.actualDemand",
      "chartSeries.contractCapacity",
    ],
    chartTypes: ["line"],
    knowledgeRefs: [
      "skills/enms/SKILL.md",
      "wiki/entities/energy/ENMS_DEMAND_FORECAST_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:daily_peak_demand_point -> metric:demand_kw -> formula:demand_max_not_sum -> chart:demand_line",
    ],
    verifierRules: [
      "daily_peak_demand_point 必須以指定日期內 actualDemand kW 取最大回答，不可改用單一點位。",
      "指定日期最高需量是同一天所有 15 分鐘 kW 點位取最大，kW 不可加總，也不可改用 kWh 排名。",
    ],
  },
  {
    key: "monthly_peak_demand_point",
    pageKey: "demand",
    obligationKeys: ["monthly_peak_demand_point"],
    units: ["kW"],
    requiredFactPaths: [
      "facts.activeDemandView.key",
      "facts.activeDemandView.formula",
      "chartSeries.dailyPeakDemand",
      "chartSeries.contractCapacity",
    ],
    chartTypes: ["line"],
    knowledgeRefs: [
      "skills/enms/SKILL.md",
      "skills/enms/reference/analysis-templates.md",
      "wiki/entities/energy/ENMS_DEMAND_FORECAST_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:monthly_peak_demand_point -> metric:demand_kw -> formula:demand_max_not_sum -> chart:demand_line",
    ],
    verifierRules: [
      "monthly_peak_demand_point 必須以 dailyPeakDemand kW 回答日期與數值，不可改用趨勢推估或 kWh 排名。",
      "本月最高需量取每日最高需量中的最大值，kW 不可加總。",
    ],
  },
  {
    key: "daily_consumption_point",
    pageKey: "demand",
    obligationKeys: ["daily_consumption_point"],
    units: ["kWh"],
    requiredFactPaths: [
      "facts.activeDemandView.key",
      "facts.activeDemandView.formula",
      "chartSeries.dailyConsumption",
    ],
    chartTypes: ["line"],
    knowledgeRefs: [
      "skills/enms/SKILL.md",
      "wiki/entities/energy/ENMS_DEMAND_FORECAST_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:daily_consumption_point -> metric:energy_kwh -> formula:energy_sum_same_window -> chart:demand_line",
    ],
    verifierRules: [
      "daily_consumption_point 必須以 dailyConsumption kWh 回答指定日期或最高用電日，不可改用迴路排行。",
      "每日用電量可加總，但必須在同一台北日期與同一授權 scope 內加總。",
    ],
  },
  {
    key: "period_energy_total",
    pageKey: "demand",
    obligationKeys: ["period_energy_total"],
    units: ["kWh"],
    requiredFactPaths: [
      "facts.periodEnergyTotal",
      "facts.metrics.periodEnergyTotalKwh",
      "facts.metrics.periodEnergyLabel",
    ],
    chartTypes: ["metric", "bar"],
    knowledgeRefs: [
      "skills/enms/SKILL.md",
      "wiki/entities/energy/ENMS_DEMAND_FORECAST_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:period_energy_total -> metric:energy_kwh -> formula:energy_sum_same_window -> chart:metric_card",
    ],
    verifierRules: [
      "period_energy_total 必須以指定本地日曆月的 kWh 加總回答，不可改用最近 30 天或迴路排行。",
      "月份總用電可跨 billing reference 電表加總，但不可混入已被主表涵蓋的子表造成重複計算。",
    ],
  },
  {
    key: "forecast_readiness",
    pageKey: "demand",
    obligationKeys: ["forecast_readiness"],
    units: ["score"],
    requiredFactPaths: [
      "facts.activeDemandView.key",
      "facts.activeDemandView.formula",
      "chartSeries.forecastReadiness",
    ],
    chartTypes: ["metric", "line"],
    knowledgeRefs: [
      "skills/enms/SKILL.md",
      "wiki/entities/energy/ENMS_DEMAND_FORECAST_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:forecast_readiness -> chart:demand_line",
    ],
    verifierRules: [
      "forecast_readiness 必須回答 readiness 分數，不可改成需量趨勢或契約風險。",
      "Forecast readiness 只是模型準備度檢查，不可宣稱正式 AI forecast 已完成。",
    ],
  },
  {
    key: "total_energy_30d",
    pageKey: "bench",
    obligationKeys: ["total_energy_30d"],
    units: ["kWh"],
    requiredFactPaths: [
      "facts.metrics.totalConsumptionKwh30d",
      "facts.siteRankings",
      "facts.meterRankingDetails",
    ],
    chartTypes: ["bar", "ranking"],
    knowledgeRefs: [
      "skills/enms/SKILL.md",
      "wiki/operations/enms/ENMS_NL_QUERY_SUMMARY_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:energy_usage_query -> metric:energy_kwh -> formula:energy_sum_same_window -> chart:ranking_bar",
    ],
    verifierRules: [
      "total_energy_30d 必須以 kWh 回答，不可使用 kW 需量取代。",
      "若用於 benchmarking，必須標示相同時間窗與授權 scope。",
    ],
  },
  {
    key: "energy_usage_query",
    pageKey: "nlq",
    obligationKeys: ["total_energy_30d", "meter_ranking"],
    units: ["kWh"],
    requiredFactPaths: [
      "facts.metrics.totalConsumptionKwh30d",
      "facts.meterRankingDetails",
      "facts.ranking",
    ],
    chartTypes: ["bar", "ranking"],
    knowledgeRefs: [
      "skills/enms/SKILL.md",
      "wiki/operations/enms/ENMS_NL_QUERY_SUMMARY_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:energy_usage_query -> metric:energy_kwh -> formula:energy_sum_same_window -> chart:ranking_bar",
    ],
    verifierRules: [
      "energy_usage_query 必須使用 kWh 與同一時間窗回答，不可用 kW 需量取代。",
      "若問題要求圖表，圖表必須綁定授權 facts 的用電量或排名資料。",
    ],
  },
  {
    key: "meter_ranking",
    pageKey: "nlq",
    obligationKeys: ["meter_ranking"],
    units: ["kWh"],
    requiredFactPaths: [
      "facts.meterRankingDetails",
      "facts.ranking",
      "facts.topLoads",
    ],
    chartTypes: ["bar", "ranking"],
    knowledgeRefs: [
      "skills/enms/SKILL.md",
      "wiki/operations/enms/ENMS_NL_QUERY_SUMMARY_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:meter_ranking -> metric:energy_kwh -> formula:energy_sum_same_window -> chart:ranking_bar",
    ],
    verifierRules: [
      "meter_ranking 必須回答設備 / 電表 / 迴路排行，不可回答同時段需量。",
      "kWh 可加總，但必須保留相同 scope 與時間窗。",
    ],
  },
  {
    key: "device_lookup",
    pageKey: "nlq",
    obligationKeys: ["device_lookup"],
    units: [],
    requiredFactPaths: [
      "facts.deviceMappings",
      "facts.deviceMappingSummary",
    ],
    chartTypes: [],
    knowledgeRefs: [
      "skills/enms/SKILL.md",
      "skills/enms/reference/feature-guide.md",
    ],
    graphPaths: [
      "capability:device_lookup -> relation:meter_identity",
    ],
    verifierRules: [
      "device_lookup 必須回設備對應或要求縮小範圍，不可改成耗電排行。",
      "迴路號需搭配 MAC / Address / CircuitSeq 判讀。",
    ],
  },
  {
    key: "site_metadata",
    pageKey: "nlq",
    obligationKeys: ["site_metadata"],
    units: [],
    requiredFactPaths: [
      "facts.siteMetadata",
      "facts.authorizedSites",
      "facts.currentSite",
    ],
    chartTypes: [],
    knowledgeRefs: [
      "skills/enms/SKILL.md",
      "skills/enms/reference/feature-guide.md",
    ],
    graphPaths: [
      "capability:site_metadata -> relation:site_scope",
    ],
    verifierRules: [
      "site_metadata 必須回答授權範圍內案場 / 公司資訊，不可走一般模型猜測。",
    ],
  },
  {
    key: "anomaly_deviation_point",
    pageKey: "anomaly",
    obligationKeys: ["anomaly_deviation_point"],
    units: ["kW", "%"],
    requiredFactPaths: [
      "facts.anomalyDeviationPoint.timestamp",
      "facts.anomalyDeviationPoint.actualDemandKw",
      "facts.anomalyDeviationPoint.baselineDemandKw",
      "facts.anomalyDeviationPoint.deviationKw",
      "facts.anomalyDeviationPoint.deviationPercent",
      "facts.metrics.deviationPercent",
      "chartSeries.actualDemand",
      "chartSeries.baseline",
    ],
    chartTypes: ["line"],
    knowledgeRefs: [
      "skills/enms/reference/analysis-templates.md",
      "wiki/operations/enms/ENMS_ANOMALY_ROOT_CAUSE_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:anomaly_root_cause -> metric:demand_kw -> formula:baseline_deviation_percent -> chart:demand_line",
    ],
    verifierRules: [
      "anomaly_deviation_point 必須回答最大偏離點的時間、實際需量、歷史基準、差值與偏離百分比，不可只回答平均功率因數。",
    ],
  },
  {
    key: "anomaly_summary",
    pageKey: "anomaly",
    obligationKeys: ["anomaly_summary"],
    units: ["kW", "pf"],
    requiredFactPaths: [
      "facts.metrics.anomalyCount",
      "facts.metrics.deviationPercent",
      "facts.metrics.avgPowerFactor",
      "facts.metrics.minPowerFactor",
      "facts.signals",
    ],
    chartTypes: ["line", "metric"],
    knowledgeRefs: [
      "skills/enms/reference/analysis-templates.md",
      "wiki/operations/enms/ENMS_ANOMALY_ROOT_CAUSE_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:anomaly_root_cause -> metric:demand_kw -> formula:demand_max_not_sum -> chart:demand_line",
      "capability:anomaly_root_cause -> metric:power_factor -> formula:pf_avg_min_rule",
    ],
    verifierRules: [
      "anomaly_summary 必須回答異常類別、最大偏離點、偏離比例、功率因數或訊號 evidence，不可只回一般節能建議。",
    ],
  },
  {
    key: "site_benchmarking",
    pageKey: "bench",
    obligationKeys: ["site_benchmarking", "total_energy_30d"],
    units: ["kWh", "kW", "pf"],
    requiredFactPaths: [
      "facts.siteRankings",
      "facts.metrics.siteCount",
      "facts.metrics.totalConsumptionKwh30d",
    ],
    chartTypes: ["bar", "ranking"],
    knowledgeRefs: [
      "skills/enms/SKILL.md",
      "skills/enms/reference/analysis-templates.md",
      "wiki/playbooks/enms/ENMS_SITE_BENCHMARKING_PLAYBOOK_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:site_benchmarking -> metric:energy_kwh -> formula:energy_sum_same_window -> chart:ranking_bar",
      "capability:site_benchmarking -> metric:demand_kw -> formula:demand_max_not_sum",
      "capability:site_benchmarking -> metric:power_factor -> formula:pf_avg_min_rule",
    ],
    verifierRules: [
      "benchmarking 必須在同一時間窗比較。",
      "若只有一個授權場域，需標示無法做真正多場域差異。",
    ],
  },
  {
    key: "demand_risk",
    pageKey: "demand",
    obligationKeys: ["peak_demand_30d"],
    units: ["kW"],
    requiredFactPaths: [
      "facts.metrics.peakDemandKw",
      "facts.metrics.projectedPeakDemandKw",
      "facts.metrics.contractCapacityKw",
    ],
    chartTypes: ["metric", "line"],
    knowledgeRefs: [
      "skills/enms/reference/analysis-templates.md",
      "wiki/entities/energy/ENMS_DEMAND_FORECAST_TEMPLATE.md",
      "wiki/playbooks/enms/ENMS_LOAD_SHEDDING_PLAYBOOK_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:demand_risk -> metric:demand_kw -> formula:demand_max_not_sum -> chart:demand_line",
    ],
    verifierRules: [
      "需量風險必須使用 kW 與契約容量比較，不可用 kWh 代替。",
    ],
  },
  {
    key: "avg_power_factor_30d",
    pageKey: "anomaly",
    obligationKeys: ["avg_power_factor_30d"],
    units: ["pf"],
    requiredFactPaths: [
      "facts.metrics.avgPowerFactor",
      "facts.metrics.minPowerFactor",
      "facts.metrics.lowPowerFactorCount",
    ],
    chartTypes: ["metric"],
    knowledgeRefs: [
      "skills/enms/reference/analysis-templates.md",
      "wiki/operations/enms/ENMS_ANOMALY_ROOT_CAUSE_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:power_factor -> metric:power_factor -> formula:pf_avg_min_rule -> chart:metric_card",
    ],
    verifierRules: [
      "功率因數必須維持 0 到 1 的合理範圍。",
    ],
  },
  {
    key: "billing",
    pageKey: "eff",
    obligationKeys: ["billing"],
    units: ["NTD"],
    requiredFactPaths: [
      "facts.billDetails",
      "facts.latestBill",
      "facts.metrics.averageRateNtdPerKwh",
    ],
    chartTypes: ["bar", "metric"],
    knowledgeRefs: [
      "skills/enms/SKILL.md",
      "wiki/operations/enms/ENMS_EFFICIENCY_SUMMARY_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:billing -> metric:cost_ntd -> chart:metric_card",
    ],
    verifierRules: [
      "billing 必須使用帳單或已發布費率；缺資料時不可套固定假單價。",
    ],
  },
  {
    key: "carbon_emission",
    pageKey: "eff",
    obligationKeys: ["carbon_emission"],
    units: ["kgCO2e"],
    requiredFactPaths: [
      "facts.metrics.carbonEmissionKg",
      "facts.metrics.totalConsumptionKwh30d",
      "facts.metrics.carbonFactorKgPerKwh",
    ],
    chartTypes: ["bar", "metric"],
    knowledgeRefs: [
      "skills/enms/reference/analysis-templates.md",
      "wiki/operations/enms/ENMS_EFFICIENCY_SUMMARY_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:efficiency_advice -> metric:carbon_kgco2e -> formula:energy_sum_same_window -> chart:ranking_bar",
    ],
    verifierRules: [
      "carbon_emission 必須以授權 kWh 與碳排係數計算；缺係數時需標示資料不足。",
    ],
  },
  {
    key: "efficiency_summary",
    pageKey: "eff",
    obligationKeys: ["efficiency_summary"],
    units: ["kWh", "pf", "kgCO2e"],
    requiredFactPaths: [
      "facts.metrics.totalConsumptionKwh30d",
      "facts.metrics.averagePowerFactor",
      "facts.metrics.standbyConsumptionRatio",
      "facts.opportunities",
    ],
    chartTypes: ["bar", "metric"],
    knowledgeRefs: [
      "skills/enms/reference/analysis-templates.md",
      "wiki/operations/enms/ENMS_EFFICIENCY_SUMMARY_TEMPLATE.md",
      "wiki/playbooks/enms/ENMS_EFFICIENCY_IMPROVEMENT_PLAYBOOK_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:efficiency_advice -> metric:energy_kwh -> formula:energy_sum_same_window -> chart:ranking_bar",
      "capability:efficiency_power_factor -> metric:power_factor -> formula:pf_avg_min_rule",
    ],
    verifierRules: [
      "efficiency_summary 必須標示節能線索的資料依據與缺資料邊界，不可宣稱已做自動控制。",
    ],
  },
  {
    key: "efficiency_power_factor",
    pageKey: "eff",
    obligationKeys: ["efficiency_power_factor"],
    units: ["pf"],
    requiredFactPaths: [
      "facts.metrics.averagePowerFactor",
      "facts.metrics.standbyConsumptionRatio",
    ],
    chartTypes: ["metric"],
    knowledgeRefs: [
      "skills/enms/reference/analysis-templates.md",
      "wiki/operations/enms/ENMS_EFFICIENCY_SUMMARY_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:efficiency_power_factor -> metric:power_factor -> formula:pf_avg_min_rule -> chart:metric_card",
    ],
    verifierRules: [
      "能效分頁功率因數必須使用 eff facts.metrics.averagePowerFactor，不可改用 anomaly avgPowerFactor。",
      "功率因數必須維持 0 到 1 的合理範圍。",
    ],
  },
  {
    key: "efficiency_advice",
    pageKey: "eff",
    obligationKeys: ["efficiency_advice"],
    units: ["kWh"],
    requiredFactPaths: [
      "facts.metrics.totalConsumptionKwh30d",
      "facts.opportunities",
      "facts.meterRankingDetails",
      "facts.metrics.averagePowerFactor",
      "facts.metrics.standbyConsumptionRatio",
      "facts.anomalyDeviationPoint",
      "facts.metrics.averageRateNtdPerKwh",
    ],
    chartTypes: ["bar", "metric"],
    knowledgeRefs: [
      "skills/enms/reference/analysis-templates.md",
      "wiki/operations/enms/ENMS_EFFICIENCY_SUMMARY_TEMPLATE.md",
      "wiki/playbooks/enms/ENMS_EFFICIENCY_IMPROVEMENT_PLAYBOOK_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:efficiency_advice -> metric:energy_kwh -> formula:energy_sum_same_window -> chart:ranking_bar",
      "capability:efficiency_advice -> entity:meter_role -> relation:main_meter_covers_submeters -> verifier:consumption_is_not_waste",
      "capability:efficiency_advice -> metric:power_factor -> formula:pf_quality_threshold -> verifier:efficiency_opportunity_requires_context",
    ],
    verifierRules: [
      "efficiency_advice 只能做唯讀改善建議，不可自動控制設備或改告警規則。",
      "efficiency_advice 必須區分耗電最高與最浪費；總表或主表用電高不等於改善優先序最高。",
      "efficiency_advice 應綜合用電排行、功率因數、夜間占比、異常偏離與設備角色，不可只回 Top kWh 排名。",
    ],
  },
  {
    key: "alert_governance",
    pageKey: "alert",
    obligationKeys: ["alert_governance"],
    units: ["count"],
    requiredFactPaths: [
      "facts.alertGroups",
      "facts.metrics.totalAlertCount30d",
    ],
    chartTypes: ["bar", "ranking"],
    knowledgeRefs: [
      "skills/enms/reference/analysis-templates.md",
      "wiki/operations/enms/ENMS_ALERT_GOVERNANCE_TEMPLATE.md",
      "wiki/playbooks/enms/ENMS_ALERT_TUNING_PLAYBOOK_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:alert_governance -> metric:alert_count -> chart:ranking_bar",
    ],
    verifierRules: [
      "alert_governance 必須回答告警摘要、重複與門檻治理，不可自動修改告警設定。",
    ],
  },
  {
    key: "anomaly_root_cause",
    pageKey: "anomaly",
    obligationKeys: ["anomaly_summary"],
    units: ["kW", "pf"],
    requiredFactPaths: [
      "facts.metrics.anomalyCount",
      "facts.signals",
    ],
    chartTypes: ["line", "metric"],
    knowledgeRefs: [
      "skills/enms/reference/analysis-templates.md",
      "wiki/operations/enms/ENMS_ANOMALY_ROOT_CAUSE_TEMPLATE.md",
    ],
    graphPaths: [
      "capability:anomaly_root_cause -> metric:demand_kw -> formula:demand_max_not_sum -> chart:demand_line",
    ],
    verifierRules: [
      "anomaly_root_cause 必須使用異常訊號與 evidence，不可用一般常識取代。",
    ],
  },
  {
    key: "raw_trace",
    pageKey: "nlq",
    obligationKeys: ["raw_trace"],
    units: [],
    requiredFactPaths: [
      "facts.rawTrace",
      "facts.latestDataAt",
    ],
    chartTypes: ["metric"],
    knowledgeRefs: [
      "skills/enms/SKILL.md",
      "skills/enms/reference/feature-guide.md",
    ],
    graphPaths: [
      "capability:raw_trace -> fact_path:scoped_facts -> relation:site_scope",
    ],
    verifierRules: [
      "raw_trace 只能使用授權 facts 或 verified read-only query，不可接受使用者 SQL。",
    ],
  },
  {
    key: "chart_request",
    pageKey: "nlq",
    obligationKeys: [],
    units: [],
    requiredFactPaths: [],
    chartTypes: ["bar", "line", "ranking", "metric"],
    knowledgeRefs: [
      "skills/enms/reference/analysis-templates.md",
    ],
    graphPaths: [
      "capability:chart_request -> chart:demand_line",
      "capability:chart_request -> chart:ranking_bar",
    ],
    verifierRules: [
      "chart_request 不可單獨成為資料來源；必須附著在已授權 facts obligation 上。",
    ],
  },
];

const CONTRACT_BY_KEY = new Map(
  CAPABILITY_CONTRACTS.map((contract) => [contract.key, contract]),
);

const REQUIRED_GRAPH_CONTRACT_KEYS: EnmsSemanticGraphCapabilityKey[] = [
  "latest_data",
  "data_coverage",
  "site_metadata",
  "device_lookup",
  "meter_ranking",
  "energy_usage_query",
  "total_energy_30d",
  "peak_demand_30d",
  "today_demand_point",
  "daily_peak_demand_point",
  "same_slot_demand",
  "monthly_peak_demand_point",
  "daily_consumption_point",
  "period_energy_total",
  "forecast_readiness",
  "avg_power_factor_30d",
  "anomaly_deviation_point",
  "anomaly_summary",
  "site_benchmarking",
  "billing",
  "carbon_emission",
  "efficiency_summary",
  "efficiency_power_factor",
  "efficiency_advice",
  "alert_governance",
  "anomaly_root_cause",
  "raw_trace",
  "chart_request",
];

function isEnabledFlag(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value ?? "");
}

function isDisabledFlag(value: string | undefined): boolean {
  return /^(0|false|no|off)$/i.test(value ?? "");
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function uniqueContractsByKey(
  contracts: EnmsSemanticGraphCapabilityContract[],
): EnmsSemanticGraphCapabilityContract[] {
  const byKey = new Map<
    EnmsSemanticGraphCapabilityKey,
    EnmsSemanticGraphCapabilityContract
  >();

  for (const contract of contracts) {
    if (!byKey.has(contract.key)) {
      byKey.set(contract.key, contract);
    }
  }

  return [...byKey.values()];
}

export function isEnmsSemanticGraphShadowEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isEnabledFlag(env.ENMS_SEMANTIC_GRAPH_SHADOW);
}

export function isEnmsSemanticGraphEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return !isDisabledFlag(env.ENMS_SEMANTIC_GRAPH_ENABLED);
}

export function getEnabledEnmsSemanticGraphCapabilities(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> | null {
  const raw = env.ENMS_SEMANTIC_GRAPH_CAPABILITIES?.trim();
  if (!raw) {
    return null;
  }

  return new Set(
    raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export function getEnmsSemanticGraph(): EnmsSemanticGraph {
  return {
    version: ENMS_SEMANTIC_GRAPH_VERSION,
    nodes: GRAPH_NODES.map((node) => ({ ...node })),
    edges: GRAPH_EDGES.map((edge) => ({ ...edge })),
    capabilityContracts: CAPABILITY_CONTRACTS.map(cloneCapabilityContract),
  };
}

export function getEnmsSemanticGraphCapabilityContract(
  key: EnmsSemanticGraphCapabilityKey,
): EnmsSemanticGraphCapabilityContract | null {
  const contract = CONTRACT_BY_KEY.get(key);
  return contract ? cloneCapabilityContract(contract) : null;
}

function cloneCapabilityContract(
  contract: EnmsSemanticGraphCapabilityContract,
): EnmsSemanticGraphCapabilityContract {
  return {
    ...contract,
    obligationKeys: [...contract.obligationKeys],
    units: [...contract.units],
    requiredFactPaths: [...contract.requiredFactPaths],
    chartTypes: [...contract.chartTypes],
    knowledgeRefs: [...contract.knowledgeRefs],
    graphPaths: [...contract.graphPaths],
    verifierRules: [...contract.verifierRules],
  };
}

function resolveContracts(
  selectedCapabilities: EnmsChatSemanticRouteKey[],
  answerObligations: EnmsChatAnswerObligation[],
): EnmsSemanticGraphCapabilityContract[] {
  const contracts: EnmsSemanticGraphCapabilityContract[] = [];

  for (const obligation of answerObligations) {
    const contract = getEnmsSemanticGraphCapabilityContract(obligation.key) ??
      getEnmsSemanticGraphCapabilityContract(obligation.capability);
    if (contract) {
      contracts.push(contract);
    }
  }

  for (const capability of selectedCapabilities) {
    const contract = getEnmsSemanticGraphCapabilityContract(capability);
    if (contract) {
      contracts.push(contract);
    }
  }

  if (answerObligations.some((obligation) => obligation.chartRequired)) {
    const chartContract = getEnmsSemanticGraphCapabilityContract(
      "chart_request",
    );
    if (chartContract) {
      contracts.push(chartContract);
    }
  }

  return uniqueContractsByKey(contracts);
}

function isContractCovered(
  key: EnmsSemanticGraphCapabilityKey,
  contracts: EnmsSemanticGraphCapabilityContract[],
): boolean {
  return contracts.some((contract) =>
    contract.key === key ||
    contract.obligationKeys.includes(key as EnmsChatAnswerObligationKey)
  );
}

function resolveRequestedGraphKeys(
  plan: EnmsChatQueryPlan,
): EnmsSemanticGraphCapabilityKey[] {
  return unique<EnmsSemanticGraphCapabilityKey>([
    ...plan.selectedCapabilities,
    ...plan.answerObligations.map((obligation) => obligation.key),
    ...(plan.answerObligations.some((obligation) => obligation.chartRequired)
      ? (["chart_request"] as EnmsSemanticGraphCapabilityKey[])
      : []),
  ]);
}

function resolveMissingContractKeys(
  requestedKeys: EnmsSemanticGraphCapabilityKey[],
  contracts: EnmsSemanticGraphCapabilityContract[],
): EnmsSemanticGraphCapabilityKey[] {
  return requestedKeys.filter((key) => !isContractCovered(key, contracts));
}

function resolveCoverage(
  requestedCount: number,
  contractCount: number,
  missingCount: number,
  skippedCount: number,
): EnmsSemanticGraphPlan["coverage"] {
  if (requestedCount === 0 || contractCount === 0) {
    return "none";
  }
  if (missingCount > 0 || skippedCount > 0) {
    return "partial";
  }
  return "complete";
}

export function buildEnmsSemanticGraphPlan(
  plan: EnmsChatQueryPlan,
  mode: EnmsSemanticGraphMode,
  options: EnmsSemanticGraphPlanOptions = {},
): EnmsSemanticGraphPlan {
  const resolvedContracts = resolveContracts(
    plan.selectedCapabilities,
    plan.answerObligations,
  );
  const requestedKeys = resolveRequestedGraphKeys(plan);
  const missingContractKeys = resolveMissingContractKeys(
    requestedKeys,
    resolvedContracts,
  );
  const contracts = mode === "enabled" && options.enabledCapabilityKeys
    ? resolvedContracts.filter((contract) =>
      options.enabledCapabilityKeys?.has(contract.key) ||
      contract.obligationKeys.some((key) =>
        options.enabledCapabilityKeys?.has(key)
      )
    )
    : resolvedContracts;
  const selectedContractKeys = new Set(contracts.map((contract) => contract.key));
  const skippedContractKeys = resolvedContracts
    .filter((contract) => !selectedContractKeys.has(contract.key))
    .map((contract) => contract.key);
  const warnings: string[] = [];

  if (plan.allowDbFacts && contracts.length === 0) {
    warnings.push(
      resolvedContracts.length > 0
        ? "semantic graph capability 尚未列入 controlled enable allowlist，維持既有 planner。"
        : "semantic graph 找不到對應 capability contract，維持既有 planner。",
    );
  }
  if (plan.allowDbFacts && missingContractKeys.length > 0) {
    warnings.push(
      `semantic graph 尚缺 capability contract：${missingContractKeys.join(", ")}，維持既有 planner。`,
    );
  }
  if (mode === "enabled" && skippedContractKeys.length > 0) {
    warnings.push(
      `semantic graph controlled enable 未包含：${skippedContractKeys.join(", ")}，只做部分 graph enrichment。`,
    );
  }

  const coverage = resolveCoverage(
    requestedKeys.length,
    contracts.length,
    missingContractKeys.length,
    skippedContractKeys.length,
  );
  const applied = mode === "enabled" &&
    contracts.length > 0 &&
    missingContractKeys.length === 0 &&
    skippedContractKeys.length === 0;

  return {
    version: ENMS_SEMANTIC_GRAPH_VERSION,
    mode,
    applied,
    coverage,
    selectedCapabilities: unique(contracts.map((contract) => contract.key)),
    missingContractKeys,
    skippedContractKeys,
    selectedPageKeys: unique(contracts.map((contract) => contract.pageKey)),
    answerObligationKeys: unique(
      contracts.flatMap((contract) => contract.obligationKeys),
    ),
    requiredFactPaths: unique(
      contracts.flatMap((contract) => contract.requiredFactPaths),
    ),
    chartTypes: unique(
      contracts.flatMap((contract) => contract.chartTypes),
    ),
    knowledgeRefs: unique(
      contracts.flatMap((contract) => contract.knowledgeRefs),
    ),
    graphPaths: unique(contracts.flatMap((contract) => contract.graphPaths)),
    warnings,
    reason:
      "Semantic Graph 只提供 EnMS domain navigation、facts contract、unit/chart verifier hint；不存客戶數值、不查 DB。",
  };
}

function enrichObligationWithGraph(
  obligation: EnmsChatAnswerObligation,
  enabledCapabilityKeys: Set<string> | null,
): EnmsChatAnswerObligation {
  const contract = getEnmsSemanticGraphCapabilityContract(obligation.key) ??
    getEnmsSemanticGraphCapabilityContract(obligation.capability);
  if (!contract) {
    return obligation;
  }
  if (
    enabledCapabilityKeys &&
    !enabledCapabilityKeys.has(contract.key) &&
    !contract.obligationKeys.some((key) => enabledCapabilityKeys.has(key))
  ) {
    return obligation;
  }

  return {
    ...obligation,
    requiredFactPaths: unique([
      ...obligation.requiredFactPaths,
      ...contract.requiredFactPaths,
    ]),
  };
}

export function applyEnmsSemanticGraphToPlan(
  plan: EnmsChatQueryPlan,
  env: NodeJS.ProcessEnv = process.env,
): EnmsChatQueryPlan {
  if (!plan.allowDbFacts) {
    return plan;
  }

  const enabled = isEnmsSemanticGraphEnabled(env);
  const shadow = isEnmsSemanticGraphShadowEnabled(env);
  const enabledCapabilityKeys = enabled
    ? getEnabledEnmsSemanticGraphCapabilities(env)
    : null;

  if (!enabled && !shadow) {
    return plan;
  }

  const graphPlan = buildEnmsSemanticGraphPlan(
    plan,
    enabled ? "enabled" : "shadow",
    {
      enabledCapabilityKeys: enabledCapabilityKeys ?? undefined,
    },
  );

  if (graphPlan.warnings.length > 0) {
    return {
      ...plan,
      semanticGraph: {
        ...graphPlan,
        mode: "fallback",
        applied: false,
      },
    };
  }

  if (!enabled) {
    return {
      ...plan,
      semanticGraph: {
        ...graphPlan,
        applied: false,
      },
    };
  }

  return {
    ...plan,
    answerObligations: plan.answerObligations.map((obligation) =>
      enrichObligationWithGraph(obligation, enabledCapabilityKeys)
    ),
    semanticGraph: graphPlan,
  };
}

export type EnmsSemanticGraphIntegrityIssue = {
  level: "error" | "warning";
  message: string;
  key?: string;
};

export function validateEnmsSemanticGraphIntegrity(): EnmsSemanticGraphIntegrityIssue[] {
  const issues: EnmsSemanticGraphIntegrityIssue[] = [];
  const nodeIds = new Set(GRAPH_NODES.map((node) => node.id));
  const contractKeys = new Set<EnmsSemanticGraphCapabilityKey>();
  const serializedGraph = JSON.stringify({
    nodes: GRAPH_NODES,
    edges: GRAPH_EDGES,
    capabilityContracts: CAPABILITY_CONTRACTS,
  });

  if (/[0-9A-F]{2}(?::[0-9A-F]{2}){5}/i.test(serializedGraph)) {
    issues.push({
      level: "error",
      message: "Semantic Graph 不可保存客戶 MAC 或 raw 授權資料。",
    });
  }

  for (const forbiddenTerm of ["mqtt_raw_data", "DeviceDataSummaryView"]) {
    if (serializedGraph.includes(forbiddenTerm)) {
      issues.push({
        level: "error",
        message: `Semantic Graph 不可綁定資料表名稱：${forbiddenTerm}。`,
      });
    }
  }

  for (const edge of GRAPH_EDGES) {
    if (!nodeIds.has(edge.from)) {
      issues.push({
        level: "error",
        key: edge.from,
        message: `Semantic Graph edge.from 找不到 node：${edge.from}。`,
      });
    }
    if (!nodeIds.has(edge.to)) {
      issues.push({
        level: "error",
        key: edge.to,
        message: `Semantic Graph edge.to 找不到 node：${edge.to}。`,
      });
    }
  }

  for (const contract of CAPABILITY_CONTRACTS) {
    if (contractKeys.has(contract.key)) {
      issues.push({
        level: "error",
        key: contract.key,
        message: `Semantic Graph capability contract key 重複：${contract.key}。`,
      });
    }
    contractKeys.add(contract.key);

    if (contract.verifierRules.length === 0) {
      issues.push({
        level: "error",
        key: contract.key,
        message: `Semantic Graph contract 缺 verifierRules：${contract.key}。`,
      });
    }
    if (contract.key !== "chart_request" && contract.requiredFactPaths.length === 0) {
      issues.push({
        level: "error",
        key: contract.key,
        message: `Semantic Graph contract 缺 requiredFactPaths：${contract.key}。`,
      });
    }
    if (contract.key !== "chart_request" && contract.graphPaths.length === 0) {
      issues.push({
        level: "error",
        key: contract.key,
        message: `Semantic Graph contract 缺 graphPaths：${contract.key}。`,
      });
    }
  }

  for (const key of REQUIRED_GRAPH_CONTRACT_KEYS) {
    if (!isContractCovered(key, CAPABILITY_CONTRACTS)) {
      issues.push({
        level: "error",
        key,
        message: `Semantic Graph 未覆蓋必要 capability / obligation：${key}。`,
      });
    }
  }

  return issues;
}
