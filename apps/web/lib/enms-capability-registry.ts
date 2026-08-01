import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";

import type { EnmsIntent } from "./enms-context-builder";
import type { EnmsContextPack } from "./enms-context-pack";

export const ENMS_INTEGRATION_CONTRACT_VERSION =
  "enms.ai.page-insight.v1";
export const ENMS_CHAT_CONTRACT_VERSION = "enms.ai.chat.v1";
export const ENMS_CHAT_PLAN_CONTRACT_VERSION = "enms.ai.chat-plan.v1";
export const ENMS_FACTS_SCHEMA_VERSION = "enms.ai.facts.v1";
export const ENMS_CAPABILITY_REGISTRY_VERSION = "2026-08-01.1";

export type EnmsCapabilityKey =
  | "enms_runtime"
  | "context_builder"
  | "context_pack"
  | "review_flow"
  | "data_governance"
  | "analytics_integration"
  | "chart_output"
  | "wiki_writeback";

export type EnmsPageKey =
  | "demand"
  | "anomaly"
  | "nlq"
  | "bench"
  | "alert"
  | "eff";

export type EnmsCapabilityDefinition = {
  key: EnmsCapabilityKey;
  name: string;
  readonlyMode:
    | "executed"
    | "available_not_executed"
    | "explicitly_disabled";
  responsibility: string;
};

export type EnmsPageDefinition = {
  pageKey: EnmsPageKey;
  name: string;
  prompt: string;
  intent: Exclude<EnmsIntent, "raw_trace" | "unknown">;
  capabilityKeys: EnmsCapabilityKey[];
  analyticsEngines: string[];
  skillPaths: string[];
  wikiPaths: string[];
  playbookPaths: string[];
  requiredKnowledgePhrases: string[];
  requiredFactPaths: string[][];
};

export type EnmsChatSemanticRouteKey =
  | "latest_data"
  | "demand_risk"
  | "anomaly_root_cause"
  | "device_lookup"
  | "site_metadata"
  | "meter_ranking"
  | "energy_usage_query"
  | "site_benchmarking"
  | "alert_governance"
  | "efficiency_advice"
  | "billing"
  | "raw_trace";

export type EnmsChatSemanticRoute = {
  key: EnmsChatSemanticRouteKey;
  pageKey: EnmsPageKey;
  intent: EnmsIntent;
  synonyms: string[];
  queryHint: string;
  preciseAnswerOnly?: boolean;
};

export type EnmsChatAnswerObligationKey =
  | "latest_data"
  | "site_metadata"
  | "device_lookup"
  | "meter_ranking"
  | "total_energy_30d"
  | "peak_demand_30d"
  | "avg_power_factor_30d"
  | "site_benchmarking"
  | "billing"
  | "carbon_emission"
  | "efficiency_advice"
  | "alert_governance"
  | "anomaly_root_cause"
  | "raw_trace";

export type EnmsChatAnswerObligation = {
  key: EnmsChatAnswerObligationKey;
  label: string;
  pageKey: EnmsPageKey;
  capability: EnmsChatSemanticRouteKey;
  answerKind: "time_range" | "site_metadata" | "device_lookup" | "ranking" | "demand" | "metric" | "billing" | "summary";
  requiredFactPaths: string[];
  chartRequired: boolean;
  chartType: "bar" | "line" | "ranking" | "metric";
  unit: string;
  reason: string;
};

export type EnmsChatQueryPlan = {
  contractVersion: string;
  registryVersion: string;
  strategy:
    | "general_ai"
    | "single_scoped_facts"
    | "multi_scoped_facts_bundle";
  intent: EnmsIntent | "general_question";
  confidence: "low" | "medium" | "high";
  allowDbFacts: boolean;
  allowGeneralAI: boolean;
  selectedCapabilities: EnmsChatSemanticRouteKey[];
  primaryPageKey: EnmsPageKey;
  selectedPageKeys: EnmsPageKey[];
  needClarification: boolean;
  matchedRoutes: Array<{
    key: EnmsChatSemanticRouteKey;
    pageKey: EnmsPageKey;
    intent: EnmsIntent;
    queryHint: string;
  }>;
  maxContexts: number;
  answerObligations: EnmsChatAnswerObligation[];
  sourceOfTruth: string;
  reason: string;
};

export type EnmsKnowledgeDocument = {
  path: string;
  sha256: string;
  headings: string[];
  directiveCount: number;
};

export type EnmsPromptDocument = {
  path: string;
  sha256: string;
  content: string;
};

export type EnmsKnowledgeBundle = {
  contractVersion: string;
  factsSchemaVersion: string;
  registryVersion: string;
  pageKey: EnmsPageKey;
  capabilities: EnmsCapabilityDefinition[];
  documents: EnmsKnowledgeDocument[];
  verifiedPhrases: string[];
  contextPack: {
    intent: EnmsIntent;
    readFirst: string[];
    references: string[];
    wiki: string[];
    playbooks: string[];
    liveQuerySteps: string[];
  };
  loadedAt: string;
};

const CORE_CAPABILITIES: Record<
  EnmsCapabilityKey,
  EnmsCapabilityDefinition
> = {
  enms_runtime: {
    key: "enms_runtime",
    name: "EnMS-specific Runtime 擴充",
    readonlyMode: "executed",
    responsibility: "承接 EnMS server-to-server contract 與 structured output。",
  },
  context_builder: {
    key: "context_builder",
    name: "Context Builder",
    readonlyMode: "executed",
    responsibility: "判斷 EnMS intent、domain routing 與 presentation guardrail。",
  },
  context_pack: {
    key: "context_pack",
    name: "Context Pack",
    readonlyMode: "executed",
    responsibility: "組合 skill、reference、wiki、playbook 與 live-query 規範。",
  },
  review_flow: {
    key: "review_flow",
    name: "Review Flow",
    readonlyMode: "available_not_executed",
    responsibility: "唯讀頁面不建立 learning draft，也不進 promotion。",
  },
  data_governance: {
    key: "data_governance",
    name: "資料治理",
    readonlyMode: "executed",
    responsibility: "驗證 scoped facts、缺資料、來源與回答邊界。",
  },
  analytics_integration: {
    key: "analytics_integration",
    name: "分析模組整合",
    readonlyMode: "executed",
    responsibility: "依頁面使用 forecast、anomaly、alert 或規則型分析。",
  },
  chart_output: {
    key: "chart_output",
    name: "圖表輸出",
    readonlyMode: "executed",
    responsibility: "只回傳由已授權 facts 產生的 structured chart series。",
  },
  wiki_writeback: {
    key: "wiki_writeback",
    name: "Wiki Writeback 整合",
    readonlyMode: "explicitly_disabled",
    responsibility: "唯讀 API 絕不自動寫回 Wiki 或修改 playbook。",
  },
};

const SHARED_CAPABILITY_KEYS: EnmsCapabilityKey[] = [
  "enms_runtime",
  "context_builder",
  "context_pack",
  "review_flow",
  "data_governance",
  "analytics_integration",
  "chart_output",
  "wiki_writeback",
];

const SHARED_SKILL_PATHS = [
  "skills/enms/SKILL.md",
  "skills/enms/reference/auto-schema-enms.md",
];

const CHAT_SEMANTIC_ROUTES: readonly EnmsChatSemanticRoute[] = [
  {
    key: "latest_data",
    pageKey: "nlq",
    intent: "natural_language_query",
    synonyms: [
      "最新資料",
      "最新一筆",
      "最新的一筆",
      "最新的資料",
      "最後一筆",
      "最近一筆",
      "更新到",
      "資料截至",
    ],
    queryHint: "最新一筆資料時間",
    preciseAnswerOnly: true,
  },
  {
    key: "demand_risk",
    pageKey: "demand",
    intent: "demand_forecast",
    synonyms: [
      "需量",
      "最大需量",
      "需量預測",
      "降載",
      "削峰",
      "移峰",
      "尖峰",
      "超約",
      "契約容量",
      "dmd15",
      "maxdemand",
      "peak demand",
    ],
    queryHint: "目前需量 契約容量 超約風險 趨勢推估尖峰 降載建議",
  },
  {
    key: "anomaly_root_cause",
    pageKey: "anomaly",
    intent: "anomaly_detection",
    synonyms: [
      "異常",
      "根因",
      "故障",
      "異常偵測",
      "根因分析",
      "三相",
      "功率因數",
      "功因",
      "電力品質",
      "quality",
      "connected",
      "thd",
      "波動",
    ],
    queryHint: "異常 根因 功率因數 電力品質 關聯訊號 處置建議",
  },
  {
    key: "device_lookup",
    pageKey: "nlq",
    intent: "natural_language_query",
    synonyms: [
      "對應",
      "對應設備",
      "是哪個設備",
      "是哪台設備",
      "是什麼設備",
      "設備名稱",
      "設備別名",
      "設備主檔",
      "電表主檔",
      "綁定",
      "mapping",
      "註冊",
    ],
    queryHint:
      "設備對應 電表主檔 迴路 MAC Address CircuitSeq ElectricityMeterId",
  },
  {
    key: "site_metadata",
    pageKey: "nlq",
    intent: "natural_language_query",
    synonyms: [
      "案場",
      "案場名稱",
      "目前案場",
      "場域名稱",
      "目前場域",
      "廠區名稱",
      "目前廠區",
      "分店名稱",
      "據點名稱",
      "站點名稱",
      "公司名稱",
      "客戶名稱",
      "site name",
      "current site",
      "company name",
    ],
    queryHint: "案場名稱 場域名稱 公司名稱 site metadata current scope",
    preciseAnswerOnly: true,
  },
  {
    key: "meter_ranking",
    pageKey: "nlq",
    intent: "natural_language_query",
    synonyms: [
      "最費電",
      "最耗電",
      "耗電最高",
      "用電最高",
      "耗能最高",
      "迴路排名",
      "迴路排行",
      "電表排名",
      "電表排行",
      "用電排名",
      "用電排行",
      "耗電排名",
      "耗電排行",
    ],
    queryHint:
      "迴路用電排行 電表耗電排名 sum(kWh) by MAC Address CircuitSeq",
  },
  {
    key: "energy_usage_query",
    pageKey: "nlq",
    intent: "natural_language_query",
    synonyms: [
      "enms",
      "用電",
      "能耗",
      "耗電",
      "能源趨勢",
      "能源趨勢分析",
      "總表",
      "主電表",
      "主電總表",
      "電表",
      "電號",
      "kwh",
      "kw",
      "總耗電",
      "總用電",
      "用電量",
      "totalconsumption",
    ],
    queryHint: "用電量 能耗 電表 電號 趨勢 摘要",
  },
  {
    key: "site_benchmarking",
    pageKey: "bench",
    intent: "site_benchmarking",
    synonyms: [
      "場域",
      "site",
      "多場域",
      "benchmark",
      "排名",
      "比較",
      "坪均",
      "人均",
    ],
    queryHint: "場域比較 排名 用電差異 能源績效 改善優先序",
  },
  {
    key: "alert_governance",
    pageKey: "alert",
    intent: "alert_governance",
    synonyms: [
      "alert",
      "警報",
      "告警",
      "告警治理",
      "超約預警",
      "預警",
      "摘要",
      "類型",
      "分類",
      "噪音",
      "抑制",
      "可抑制",
      "重複",
      "去重",
      "門檻",
      "DemandAlertHistory",
      "治理",
    ],
    queryHint: "告警 警報 預警 優先級 重複告警 門檻調整",
  },
  {
    key: "efficiency_advice",
    pageKey: "eff",
    intent: "efficiency_analysis",
    synonyms: [
      "能效",
      "節能",
      "節電",
      "省電",
      "節費",
      "節省",
      "省多少",
      "節能挖掘",
      "energy efficiency",
      "削峰節費",
      "基載",
      "空調排程",
      "照明排程",
      "設備效率",
      "energy baseline",
      "enpi",
      "quick win",
      "quickwin",
    ],
    queryHint: "能效 節能 節電 省電 節省 quick win 基載 設備效率 改善建議",
  },
  {
    key: "billing",
    pageKey: "eff",
    intent: "efficiency_analysis",
    synonyms: [
      "帳單",
      "台電帳單",
      "電費",
      "費率",
      "平均電價",
      "應繳",
      "billing",
      "roi",
      "what-if",
      "what if",
      "投資回收",
      "回收期",
      "payback",
      "情境模擬",
      "模擬",
      "試算",
    ],
    queryHint: "台電帳單 電費 費率 ROI 投資回收 what-if 試算",
  },
  {
    key: "raw_trace",
    pageKey: "nlq",
    intent: "raw_trace",
    synonyms: [
      "mqtt",
      "raw",
      "payload",
      "trace",
      "topic",
      "原始訊息",
      "mqtt_raw_messages",
      "mqtt_raw_data",
      "timescale",
      "hypertable",
    ],
    queryHint: "MQTT raw payload trace timescale 原始資料回溯",
  },
];

const PAGE_REGISTRY: Record<EnmsPageKey, EnmsPageDefinition> = {
  demand: {
    pageKey: "demand",
    name: "需量預測",
    prompt: "分析需量預測、契約容量風險與降載建議",
    intent: "demand_forecast",
    capabilityKeys: SHARED_CAPABILITY_KEYS,
    analyticsEngines: ["demand_forecast"],
    skillPaths: SHARED_SKILL_PATHS,
    wikiPaths: [
      "wiki/entities/energy/ENMS_DEMAND_FORECAST_TEMPLATE.md",
    ],
    playbookPaths: [
      "wiki/playbooks/enms/ENMS_LOAD_SHEDDING_PLAYBOOK_TEMPLATE.md",
    ],
    requiredKnowledgePhrases: [
      "目前最大需量",
      "契約容量",
      "建議降載順序",
    ],
    requiredFactPaths: [
      ["metrics.currentDemandKw", "metrics.peakDemandKw"],
      ["analyticsInputs.summaryPoints"],
    ],
  },
  anomaly: {
    pageKey: "anomaly",
    name: "異常根因分析",
    prompt: "分析能源異常、可能根因、關聯訊號與處置建議",
    intent: "anomaly_detection",
    capabilityKeys: SHARED_CAPABILITY_KEYS,
    analyticsEngines: ["anomaly_detection"],
    skillPaths: SHARED_SKILL_PATHS,
    wikiPaths: [
      "wiki/operations/enms/ENMS_ANOMALY_ROOT_CAUSE_TEMPLATE.md",
    ],
    playbookPaths: [
      "wiki/playbooks/enms/ENMS_ANOMALY_TRIAGE_PLAYBOOK_TEMPLATE.md",
    ],
    requiredKnowledgePhrases: [
      "量測證據",
      "可能根因",
      "後續處置",
    ],
    requiredFactPaths: [
      ["analyticsInputs.summaryPoints", "analyticsInputs.rawPoints"],
      ["metrics.anomalyCount", "signals"],
    ],
  },
  nlq: {
    pageKey: "nlq",
    name: "自然語言查詢",
    prompt: "依 EnMS 授權資料整理自然語言查詢摘要",
    intent: "natural_language_query",
    capabilityKeys: SHARED_CAPABILITY_KEYS,
    analyticsEngines: ["verified_query_contract"],
    skillPaths: SHARED_SKILL_PATHS,
    wikiPaths: [
      "wiki/operations/enms/ENMS_NL_QUERY_SUMMARY_TEMPLATE.md",
    ],
    playbookPaths: [],
    requiredKnowledgePhrases: [
      "Data Sources Used",
      "Answer Summary",
      "Follow-up Queries",
    ],
    requiredFactPaths: [
      ["ranking", "exampleAnswer"],
      ["exampleQuestion"],
    ],
  },
  bench: {
    pageKey: "bench",
    name: "多場域比較",
    prompt:
      "比較可見場域的總用電排名；只有 facts 具備面積、產量或人數等正規化資料時，才分析能源績效與改善優先序",
    intent: "site_benchmarking",
    capabilityKeys: SHARED_CAPABILITY_KEYS,
    analyticsEngines: ["site_benchmarking_rules"],
    skillPaths: SHARED_SKILL_PATHS,
    wikiPaths: [
      "wiki/entities/sites/ENMS_SITE_ENERGY_SUMMARY_TEMPLATE.md",
    ],
    playbookPaths: [
      "wiki/playbooks/enms/ENMS_SITE_BENCHMARKING_PLAYBOOK_TEMPLATE.md",
    ],
    requiredKnowledgePhrases: [
      "場域排名",
      "差異原因",
      "改善建議",
    ],
    requiredFactPaths: [["siteRankings"], ["metrics.siteCount"]],
  },
  alert: {
    pageKey: "alert",
    name: "Alert 智能治理",
    prompt: "分析能源告警治理、優先級、重複告警與調整建議",
    intent: "alert_governance",
    capabilityKeys: SHARED_CAPABILITY_KEYS,
    analyticsEngines: [
      "demand_forecast",
      "anomaly_detection",
      "alert_governance",
    ],
    skillPaths: SHARED_SKILL_PATHS,
    wikiPaths: [
      "wiki/operations/enms/ENMS_ANOMALY_ROOT_CAUSE_TEMPLATE.md",
      "wiki/operations/enms/ENMS_ALERT_GOVERNANCE_TEMPLATE.md",
    ],
    playbookPaths: [
      "wiki/playbooks/enms/ENMS_LOAD_SHEDDING_PLAYBOOK_TEMPLATE.md",
      "wiki/playbooks/enms/ENMS_ALERT_TUNING_PLAYBOOK_TEMPLATE.md",
    ],
    requiredKnowledgePhrases: [
      "真實高風險事件",
      "建議調整門檻",
      "建議降噪項目",
    ],
    requiredFactPaths: [["alertGroups"], ["metrics.totalAlertCount30d"]],
  },
  eff: {
    pageKey: "eff",
    name: "能效節能挖掘",
    prompt: "分析能效、節能機會、投資回收與 what-if 情境",
    intent: "efficiency_analysis",
    capabilityKeys: SHARED_CAPABILITY_KEYS,
    analyticsEngines: ["efficiency_rules", "roi_what_if_rules"],
    skillPaths: SHARED_SKILL_PATHS,
    wikiPaths: [
      "wiki/entities/sites/ENMS_SITE_ENERGY_SUMMARY_TEMPLATE.md",
      "wiki/operations/enms/ENMS_EFFICIENCY_SUMMARY_TEMPLATE.md",
    ],
    playbookPaths: [
      "wiki/playbooks/enms/ENMS_EFFICIENCY_IMPROVEMENT_PLAYBOOK_TEMPLATE.md",
      "wiki/playbooks/enms/ENMS_ROI_WHAT_IF_PLAYBOOK_TEMPLATE.md",
    ],
    requiredKnowledgePhrases: [
      "quick win",
      "5% / 10% 節電",
      "缺哪些電號、帳單、費率或投資金額",
    ],
    requiredFactPaths: [
      ["metrics.totalConsumptionKwh30d"],
      ["opportunities"],
    ],
  },
};

const knowledgeCache = new Map<string, Promise<EnmsKnowledgeBundle>>();
const promptDocumentCache = new Map<
  string,
  Promise<EnmsPromptDocument[]>
>();
const MAX_PROMPT_KNOWLEDGE_BYTES = 32 * 1024;

function unique(values: string[]): string[] {
  return values.filter((value, index, all) => all.indexOf(value) === index);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

const ENMS_DOMAIN_ANCHORS = [
  "enms",
  "能管",
  "能源管理",
  "能源",
  "用電",
  "能耗",
  "耗電",
  "電表",
  "電號",
  "電費",
  "台電",
  "需量",
  "契約容量",
  "超約",
  "kwh",
  "kw",
  "功率",
  "功因",
  "功率因數",
  "告警",
  "警報",
  "預警",
  "案場",
  "場域",
  "廠區",
  "分店",
  "據點",
  "站點",
  "迴路",
  "空調",
  "基載",
  "節能",
  "節電",
  "省電",
  "碳排",
  "mqtt",
  "timescale",
];

const CONTEXTUAL_SYNONYMS: Partial<
  Record<EnmsChatSemanticRouteKey, string[]>
> = {
  energy_usage_query: ["最高", "最低", "趨勢", "排名"],
  site_benchmarking: ["排名", "比較", "區域"],
  alert_governance: ["摘要", "類型", "分類", "治理", "門檻"],
};

function hasEnmsDomainAnchor(normalizedMessage: string): boolean {
  return ENMS_DOMAIN_ANCHORS.some((anchor) =>
    normalizedMessage.includes(anchor.toLowerCase())
  );
}

function routeHasContextualOnlyMatch(
  route: EnmsChatSemanticRoute,
  normalizedMessage: string,
): boolean {
  const contextual = CONTEXTUAL_SYNONYMS[route.key] ?? [];
  if (contextual.length === 0) {
    return false;
  }

  const matchedSynonyms = route.synonyms.filter((synonym) =>
    normalizedMessage.includes(synonym.toLowerCase())
  );
  return (
    matchedSynonyms.length > 0 &&
    matchedSynonyms.every((synonym) => contextual.includes(synonym))
  );
}

function getRequestedAccountSuffix(message: string): string {
  const requestedAccount = message.match(/(?:\d[\s-]?){8,14}/)?.[0] ?? "";
  return requestedAccount ? ` 電號 ${requestedAccount}` : "";
}

export function getEnmsChatSemanticRoutes(): EnmsChatSemanticRoute[] {
  return CHAT_SEMANTIC_ROUTES.map((route) => ({
    ...route,
    synonyms: [...route.synonyms],
  }));
}

export function matchesEnmsChatSemanticRoute(
  routeKey: EnmsChatSemanticRouteKey,
  message: string,
): boolean {
  if (routeKey === "latest_data") {
    return isEnmsLatestDataQuestion(message);
  }
  if (routeKey === "device_lookup") {
    return isEnmsDeviceLookupQuestion(message);
  }
  if (routeKey === "site_metadata") {
    return isEnmsSiteMetadataQuestion(message);
  }
  if (routeKey === "meter_ranking") {
    if (isEnmsDeviceLookupQuestion(message)) {
      return false;
    }
    if (isEnmsSiteBenchmarkingQuestion(normalizeText(message))) {
      return false;
    }
  }
  if (routeKey === "site_benchmarking") {
    return isEnmsSiteBenchmarkingQuestion(normalizeText(message));
  }

  const route = CHAT_SEMANTIC_ROUTES.find((candidate) =>
    candidate.key === routeKey
  );
  if (!route) {
    return false;
  }

  const normalizedMessage = normalizeText(message);
  const matched = route.synonyms.some((synonym) =>
    normalizedMessage.includes(synonym.toLowerCase())
  );
  if (!matched) {
    return false;
  }

  if (routeHasContextualOnlyMatch(route, normalizedMessage)) {
    return hasEnmsDomainAnchor(normalizedMessage);
  }

  return true;
}

export function isEnmsDeviceLookupQuestion(message: string): boolean {
  const normalizedMessage = normalizeText(message);
  const hasIdentityAnchor =
    /迴路|回路|電表|設備|mac|address|位址|地址|circuit|meter/.test(
      normalizedMessage,
    );
  const hasLookupIntent =
    /對應|是哪|是什麼|哪台|哪個設備|設備名稱|設備別名|主檔|綁定|mapping|註冊|屬於/.test(
      normalizedMessage,
    );
  const isRankingIntent =
    /最費電|最耗電|耗電最高|用電最高|耗能最高|排行|排名/.test(
      normalizedMessage,
    );

  return hasIdentityAnchor && hasLookupIntent && !isRankingIntent;
}

export function isEnmsSiteMetadataQuestion(message: string): boolean {
  const normalizedMessage = normalizeText(message);
  if (isGeneralSiteMetadataConceptQuestion(normalizedMessage)) {
    return false;
  }

  const hasSiteAnchor =
    /案場|場域|廠區|分店|據點|站點|site|location|company|公司|客戶/.test(
      normalizedMessage,
    );
  const hasLookupIntent =
    /名稱|名字|叫什麼|是哪|目前|現在|所在|所屬|有哪些|清單|列表|幾個|多少|name|current|which|what|our|my|我們|我司|本公司/.test(
      normalizedMessage,
    );
  const hasMetricIntent =
    /用電|耗電|能耗|總用電|總耗電|費電|需量|電費|碳排|告警|異常|節能|排名|排行|比較|benchmark|kwh|kw|金額|成本/.test(
      normalizedMessage,
    );

  return hasSiteAnchor && hasLookupIntent && !hasMetricIntent;
}

function isGeneralSiteMetadataConceptQuestion(normalizedMessage: string): boolean {
  const asksMeaning =
    /什麼意思|定義|概念|何謂|what does .+ mean|meaning of|definition of/.test(
      normalizedMessage,
    );
  const asksBareDefinition =
    /^(請問)?\s*(案場|場域|廠區|分店|據點|站點|site|location|company|公司|客戶)\s*(是什麼|是甚麼|what is)\s*[?？]?$/.test(
      normalizedMessage,
    ) ||
    /^(what is)\s+(site|location|company|customer)\s*[?？]?$/.test(
      normalizedMessage,
    );
  return asksMeaning || asksBareDefinition;
}

export function isEnmsLatestDataQuestion(message: string): boolean {
  const normalizedMessage = normalizeText(message);
  return (
    /(?:最新|最後|最近).{0,8}(?:資料|一筆|讀值|紀錄|記錄|時序|電表|db|資料庫|enms|meter|data)/i
      .test(normalizedMessage) ||
    /(?:資料|讀值|紀錄|記錄|時序|電表|db|資料庫|enms|meter|data).{0,12}(?:最新|最後|最近|更新到|截至)/i
      .test(normalizedMessage) ||
    /(?:資料|讀值|紀錄|記錄|時序|電表|db|資料庫|enms|meter|data).{0,12}幾月幾號/i
      .test(normalizedMessage) ||
    /幾月幾號.{0,12}(?:資料|讀值|紀錄|記錄|時序|電表|db|資料庫|enms|meter|data)/i
      .test(normalizedMessage)
  );
}

function isEnmsChartRequested(message: string): boolean {
  return /圖表|圖形|畫成圖|用圖|長條圖|折線圖|趨勢圖|排行榜|排名圖|chart|graph|visual/i
    .test(message);
}

function hasMeterRankingSubject(message: string): boolean {
  return /迴路|回路|電表|電錶|MAC|Address|位址|地址|CircuitSeq|circuit|meter/i
    .test(message);
}

function buildEnmsChatAnswerObligations(
  normalizedMessage: string,
  matchedRoutes: EnmsChatSemanticRoute[],
): EnmsChatAnswerObligation[] {
  const chartRequired = isEnmsChartRequested(normalizedMessage);
  const routeKeys = new Set(matchedRoutes.map((route) => route.key));
  const obligations: EnmsChatAnswerObligation[] = [];
  const add = (obligation: EnmsChatAnswerObligation) => {
    if (!obligations.some((item) => item.key === obligation.key)) {
      obligations.push(obligation);
    }
  };

  if (routeKeys.has("latest_data")) {
    add({
      key: "latest_data",
      label: "最新資料時間",
      pageKey: "nlq",
      capability: "latest_data",
      answerKind: "time_range",
      requiredFactPaths: [
        "facts.latestDataAt",
        "facts.metrics.latestDataAt",
      ],
      chartRequired: false,
      chartType: "metric",
      unit: "",
      reason: "使用者詢問 EnMS 最新一筆資料或資料更新時間。",
    });
  }

  if (routeKeys.has("site_metadata")) {
    add({
      key: "site_metadata",
      label: "案場 / 場域資訊",
      pageKey: "nlq",
      capability: "site_metadata",
      answerKind: "site_metadata",
      requiredFactPaths: [
        "facts.siteMetadata",
        "facts.authorizedSites",
        "facts.currentSite",
      ],
      chartRequired: false,
      chartType: "metric",
      unit: "",
      reason: "使用者詢問目前案場、場域、公司或授權範圍 metadata。",
    });
  }

  if (routeKeys.has("device_lookup")) {
    add({
      key: "device_lookup",
      label: "設備 / 電表對應",
      pageKey: "nlq",
      capability: "device_lookup",
      answerKind: "device_lookup",
      requiredFactPaths: ["facts.deviceMappings"],
      chartRequired: false,
      chartType: "ranking",
      unit: "",
      reason: "使用者詢問迴路、電表、MAC 或 Address 的設備對應。",
    });
  }

  if (
    routeKeys.has("meter_ranking") &&
    (hasMeterRankingSubject(normalizedMessage) ||
      !routeKeys.has("site_benchmarking"))
  ) {
    add({
      key: "meter_ranking",
      label: "迴路 / 電表用電排名",
      pageKey: "nlq",
      capability: "meter_ranking",
      answerKind: "ranking",
      requiredFactPaths: [
        "facts.meterRankingDetails",
        "facts.ranking",
        "facts.topLoads",
      ],
      chartRequired,
      chartType: "bar",
      unit: "kWh",
      reason: "使用者詢問最耗電或用電排名，必須以授權迴路 / 電表 facts 排序。",
    });
  }

  if (
    routeKeys.has("energy_usage_query") ||
    /總用電|總耗電|用電量|用電|耗電|能耗|kwh/i.test(normalizedMessage)
  ) {
    add({
      key: "total_energy_30d",
      label: "最近 30 天總用電",
      pageKey: routeKeys.has("site_benchmarking") ? "bench" : "nlq",
      capability: routeKeys.has("site_benchmarking")
        ? "site_benchmarking"
        : "energy_usage_query",
      answerKind: "metric",
      requiredFactPaths: [
        "facts.metrics.totalConsumptionKwh30d",
        "facts.siteRankings",
        "facts.meterRankingDetails",
      ],
      chartRequired,
      chartType: "bar",
      unit: "kWh",
      reason: "使用者要求總用電，需以 kWh facts 呈現，不可用需量 kW 取代。",
    });
  }

  if (routeKeys.has("demand_risk") || /最大需量|需量|尖峰|kw|demand/i.test(normalizedMessage)) {
    add({
      key: "peak_demand_30d",
      label: "最近 30 天最大需量",
      pageKey: "demand",
      capability: "demand_risk",
      answerKind: "demand",
      requiredFactPaths: [
        "facts.metrics.peakDemandKw",
        "facts.metrics.projectedPeakDemandKw",
        "facts.metrics.contractCapacityKw",
      ],
      chartRequired,
      chartType: "metric",
      unit: "kW",
      reason: "使用者要求最大需量或契約風險，需量是 kW 強度且不可加總。",
    });
  }

  if (routeKeys.has("anomaly_root_cause") || /平均功率因數|功率因數|功因|power factor|pf/i.test(normalizedMessage)) {
    add({
      key: "avg_power_factor_30d",
      label: "最近 30 天平均功率因數",
      pageKey: "anomaly",
      capability: "anomaly_root_cause",
      answerKind: "metric",
      requiredFactPaths: [
        "facts.metrics.avgPowerFactor",
        "facts.metrics.minPowerFactor",
      ],
      chartRequired,
      chartType: "metric",
      unit: "pf",
      reason: "使用者要求功率因數，需以 0-1 區間指標與低功因規則判讀。",
    });
  }

  if (routeKeys.has("site_benchmarking")) {
    add({
      key: "site_benchmarking",
      label: "多場域 Benchmarking 排名與差異",
      pageKey: "bench",
      capability: "site_benchmarking",
      answerKind: "ranking",
      requiredFactPaths: [
        "facts.siteRankings",
        "facts.metrics.siteCount",
      ],
      chartRequired,
      chartType: "bar",
      unit: "kWh",
      reason: "使用者要求多場域比較或 benchmarking，需以相同時間窗排名並說明差異。",
    });
  }

  if (routeKeys.has("billing")) {
    add({
      key: "billing",
      label: "電費 / 費率 / 帳單",
      pageKey: "eff",
      capability: "billing",
      answerKind: "billing",
      requiredFactPaths: [
        "facts.billDetails",
        "facts.latestBill",
        "facts.metrics.averageRateNtdPerKwh",
      ],
      chartRequired,
      chartType: "bar",
      unit: "NTD",
      reason: "使用者要求電費、帳單、費率或 ROI，缺資料時必須只標該項不足。",
    });
  }

  if (routeKeys.has("efficiency_advice")) {
    add({
      key: /碳排|co2|carbon/i.test(normalizedMessage)
        ? "carbon_emission"
        : "efficiency_advice",
      label: /碳排|co2|carbon/i.test(normalizedMessage)
        ? "碳排放"
        : "節能 / 能效建議",
      pageKey: "eff",
      capability: "efficiency_advice",
      answerKind: "summary",
      requiredFactPaths: [
        "facts.metrics.totalConsumptionKwh30d",
        "facts.opportunities",
        "facts.metrics.carbonEmissionKg",
      ],
      chartRequired,
      chartType: "bar",
      unit: /碳排|co2|carbon/i.test(normalizedMessage) ? "kgCO2e" : "kWh",
      reason: "使用者要求節能、能效、碳排或改善建議，需以可驗證 facts 與缺資料邊界回答。",
    });
  }

  if (routeKeys.has("alert_governance")) {
    add({
      key: "alert_governance",
      label: "Alert 智能治理",
      pageKey: "alert",
      capability: "alert_governance",
      answerKind: "summary",
      requiredFactPaths: [
        "facts.alertGroups",
        "facts.metrics.totalAlertCount30d",
      ],
      chartRequired,
      chartType: "bar",
      unit: "count",
      reason: "使用者要求告警治理、分類、摘要或門檻建議。",
    });
  }

  if (routeKeys.has("anomaly_root_cause") && !obligations.some((item) => item.key === "avg_power_factor_30d")) {
    add({
      key: "anomaly_root_cause",
      label: "異常根因分析",
      pageKey: "anomaly",
      capability: "anomaly_root_cause",
      answerKind: "summary",
      requiredFactPaths: [
        "facts.metrics.anomalyCount",
        "facts.signals",
      ],
      chartRequired,
      chartType: "line",
      unit: "",
      reason: "使用者要求異常或根因分析，需以異常訊號與規則 evidence 回答。",
    });
  }

  if (routeKeys.has("raw_trace")) {
    add({
      key: "raw_trace",
      label: "MQTT / raw trace",
      pageKey: "nlq",
      capability: "raw_trace",
      answerKind: "summary",
      requiredFactPaths: [
        "facts.rawTrace",
        "facts.latestDataAt",
      ],
      chartRequired: false,
      chartType: "metric",
      unit: "",
      reason: "使用者要求 MQTT、Timescale 或 raw payload trace。",
    });
  }

  return obligations.slice(0, 4);
}

export function buildEnmsIntentKeywordMap(): Record<EnmsIntent, string[]> {
  const keywords: Record<EnmsIntent, string[]> = {
    demand_forecast: [],
    anomaly_detection: [],
    natural_language_query: [],
    site_benchmarking: [],
    alert_governance: [],
    efficiency_analysis: [],
    raw_trace: [],
    unknown: [],
  };

  for (const route of CHAT_SEMANTIC_ROUTES) {
    keywords[route.intent].push(...route.synonyms);
  }

  return Object.fromEntries(
    Object.entries(keywords).map(([intent, values]) => [
      intent,
      unique(values),
    ]),
  ) as Record<EnmsIntent, string[]>;
}

export function buildEnmsChatQueryPlan(message: string): EnmsChatQueryPlan {
  const normalizedMessage = normalizeText(message);
  const matchedRoutes = prioritizeEnmsChatRoutes(
    CHAT_SEMANTIC_ROUTES
      .map((route, index) => ({
        route,
        index,
        firstMentionAt: getRouteFirstMentionIndex(route, normalizedMessage),
      }))
      .filter((item) => item.firstMentionAt >= 0)
      .toSorted((left, right) =>
        left.firstMentionAt - right.firstMentionAt || left.index - right.index
      )
      .map((item) => item.route),
    normalizedMessage,
  );
  const selectedPageKeys = unique(
    matchedRoutes.map((route) => route.pageKey),
  ).slice(0, 4) as EnmsPageKey[];

  if (selectedPageKeys.length === 0) {
    return {
      contractVersion: ENMS_CHAT_PLAN_CONTRACT_VERSION,
      registryVersion: ENMS_CAPABILITY_REGISTRY_VERSION,
      strategy: "general_ai",
      intent: "general_question",
      confidence: "low",
      allowDbFacts: false,
      allowGeneralAI: true,
      selectedCapabilities: [],
      primaryPageKey: "nlq",
      selectedPageKeys: [],
      needClarification: false,
      matchedRoutes: [],
      maxContexts: 0,
      answerObligations: [],
      sourceOfTruth:
        "EnClaw Capability Registry / Context Builder; no EnMS facts required",
      reason:
        "未命中 EnMS domain capability，應走一般 AI fallback，不查 EnMS DB facts。",
    };
  }

  const primaryRoute = matchedRoutes.find((route) =>
    route.pageKey === selectedPageKeys[0]
  ) ?? matchedRoutes[0];
  const selectedCapabilities = unique(
    matchedRoutes.map((route) => route.key),
  ).slice(0, 8) as EnmsChatSemanticRouteKey[];
  const answerObligations = buildEnmsChatAnswerObligations(
    normalizedMessage,
    matchedRoutes,
  );
  return {
    contractVersion: ENMS_CHAT_PLAN_CONTRACT_VERSION,
    registryVersion: ENMS_CAPABILITY_REGISTRY_VERSION,
    strategy:
      selectedPageKeys.length > 1
        ? "multi_scoped_facts_bundle"
        : "single_scoped_facts",
    intent: primaryRoute.intent,
    confidence: matchedRoutes.length > 0 ? "high" : "medium",
    allowDbFacts: true,
    allowGeneralAI: false,
    selectedCapabilities,
    primaryPageKey: primaryRoute.pageKey,
    selectedPageKeys,
    needClarification: shouldClarifyEnmsChatQuestion(
      normalizedMessage,
      selectedCapabilities,
    ),
    matchedRoutes: matchedRoutes.slice(0, 8).map((route) => ({
      key: route.key,
      pageKey: route.pageKey,
      intent: route.intent,
      queryHint: route.queryHint,
    })),
    maxContexts: 4,
    answerObligations,
    sourceOfTruth:
      "EnClaw Capability Registry / Context Builder -> EnMS API scoped ai_* facts",
    reason:
      "命中 EnMS domain capability，EnMS API 應依 selectedPageKeys 建立授權 scoped facts bundle。",
  };
}

function prioritizeEnmsChatRoutes(
  routes: EnmsChatSemanticRoute[],
  normalizedMessage: string,
): EnmsChatSemanticRoute[] {
  if (isEnmsSiteMetadataQuestion(normalizedMessage)) {
    return routes
      .filter((route) =>
        route.key === "site_metadata" || route.key === "latest_data"
      )
      .toSorted((left, right) => {
        if (left.key === "site_metadata" && right.key !== "site_metadata") {
          return -1;
        }
        if (right.key === "site_metadata" && left.key !== "site_metadata") {
          return 1;
        }
        return 0;
      });
  }

  if (isEnmsDeviceLookupQuestion(normalizedMessage)) {
    return routes.toSorted((left, right) => {
      if (left.key === "device_lookup" && right.key !== "device_lookup") {
        return -1;
      }
      if (right.key === "device_lookup" && left.key !== "device_lookup") {
        return 1;
      }
      return 0;
    });
  }

  if (isContextualPresentationQuestion(normalizedMessage)) {
    const chartPriority: EnmsChatSemanticRouteKey[] = [
      "site_benchmarking",
      "meter_ranking",
      "demand_risk",
      "anomaly_root_cause",
      "alert_governance",
      "efficiency_advice",
      "billing",
      "energy_usage_query",
      "latest_data",
    ];
    return routes.toSorted((left, right) => {
      const leftRank = chartPriority.indexOf(left.key);
      const rightRank = chartPriority.indexOf(right.key);
      const safeLeftRank = leftRank >= 0 ? leftRank : chartPriority.length;
      const safeRightRank = rightRank >= 0 ? rightRank : chartPriority.length;
      return safeLeftRank - safeRightRank;
    });
  }

  if (!isEnmsSiteBenchmarkingQuestion(normalizedMessage)) {
    return routes;
  }

  const siteBenchmarkingRoutes = routes.filter((route) =>
    route.key === "site_benchmarking"
  );
  if (siteBenchmarkingRoutes.length === 0) {
    return routes;
  }

  return routes.toSorted((left, right) => {
    if (left.key === "site_benchmarking" && right.key === "energy_usage_query") {
      return -1;
    }
    if (left.key === "energy_usage_query" && right.key === "site_benchmarking") {
      return 1;
    }
    return 0;
  });
}

function isContextualPresentationQuestion(normalizedMessage: string): boolean {
  return (
    normalizedMessage.includes("[conversation context]") &&
    /圖表|圖形|畫成圖|用圖|長條圖|折線圖|趨勢圖|排行榜|排名圖|chart|graph|visual/i
      .test(normalizedMessage)
  );
}

function shouldClarifyEnmsChatQuestion(
  normalizedMessage: string,
  selectedCapabilities: EnmsChatSemanticRouteKey[],
): boolean {
  if (
    selectedCapabilities.includes("device_lookup") &&
    !/(?:主電表|主電錶|總表|總電表|總電錶|子電表|子電錶|分表|standalone|獨立|迴路|回路|ch|circuit|mac|address|位址|地址|\d)/i
      .test(normalizedMessage)
  ) {
    return true;
  }

  if (
    selectedCapabilities.includes("billing") &&
    /哪個月|幾月|指定月份|上個月|上月|去年/i.test(normalizedMessage)
  ) {
    return false;
  }

  return false;
}

function isEnmsSiteBenchmarkingQuestion(normalizedMessage: string): boolean {
  const hasSiteAnchor =
    /案場|各案場|場域|多場域|各場域|區域|各區域|廠區|分店|據點|站點|site|benchmark/.test(
      normalizedMessage,
    );
  const hasComparisonIntent =
    /比較|排名|排行|benchmark/.test(normalizedMessage);
  const hasEnergyMetric =
    /用電|耗電|能耗|總用電|總耗電|能源績效|kwh|kw/.test(
      normalizedMessage,
    );
  return hasSiteAnchor && hasComparisonIntent && hasEnergyMetric;
}

function getRouteFirstMentionIndex(
  route: EnmsChatSemanticRoute,
  normalizedMessage: string,
): number {
  if (!matchesEnmsChatSemanticRoute(route.key, normalizedMessage)) {
    return -1;
  }

  if (route.key === "latest_data") {
    const regexMentions = [
      /(?:最新|最後|最近).{0,8}(?:資料|一筆|讀值|紀錄|記錄|時序|電表|db|資料庫|enms|meter|data)/i,
      /(?:資料|讀值|紀錄|記錄|時序|電表|db|資料庫|enms|meter|data).{0,12}(?:最新|最後|最近|更新到|截至)/i,
      /(?:資料|讀值|紀錄|記錄|時序|電表|db|資料庫|enms|meter|data).{0,12}幾月幾號/i,
      /幾月幾號.{0,12}(?:資料|讀值|紀錄|記錄|時序|電表|db|資料庫|enms|meter|data)/i,
    ]
      .map((regex) => normalizedMessage.search(regex))
      .filter((index) => index >= 0);
    if (regexMentions.length > 0) {
      return Math.min(...regexMentions);
    }
  }

  if (route.key === "device_lookup") {
    const regexMentions = [
      /(?:主電表|主電錶|總表|總電表|總電錶|子電表|子電錶|分表|獨立設備|獨立電表|standalone|迴路|回路|電表|設備|mac|address|位址|地址|circuit|meter).{0,12}(?:對應|是哪|是什麼|哪台|哪個設備|設備名稱|設備別名|主檔|綁定|mapping|註冊|屬於)/i,
      /(?:對應|是哪|是什麼|哪台|哪個設備|設備名稱|設備別名|主檔|綁定|mapping|註冊|屬於).{0,12}(?:主電表|主電錶|總表|總電表|總電錶|子電表|子電錶|分表|獨立設備|獨立電表|standalone|迴路|回路|電表|設備|mac|address|位址|地址|circuit|meter)/i,
    ]
      .map((regex) => normalizedMessage.search(regex))
      .filter((index) => index >= 0);
    if (regexMentions.length > 0) {
      return Math.min(...regexMentions);
    }
  }

  if (route.key === "site_metadata") {
    const regexMentions = [
      /(?:案場|場域|廠區|分店|據點|站點|site|location|company|公司|客戶).{0,12}(?:名稱|名字|叫什麼|是哪|是什麼|目前|現在|所在|所屬|有哪些|清單|列表|幾個|多少|name|current|which|what)/i,
      /(?:名稱|名字|叫什麼|是哪|是什麼|目前|現在|所在|所屬|有哪些|清單|列表|幾個|多少|name|current|which|what).{0,12}(?:案場|場域|廠區|分店|據點|站點|site|location|company|公司|客戶)/i,
    ]
      .map((regex) => normalizedMessage.search(regex))
      .filter((index) => index >= 0);
    if (regexMentions.length > 0) {
      return Math.min(...regexMentions);
    }
  }

  return route.synonyms.reduce((best, synonym) => {
    const index = normalizedMessage.indexOf(synonym.toLowerCase());
    return index >= 0 && (best < 0 || index < best) ? index : best;
  }, -1);
}

export function getEnmsChatSemanticRouteForPage(
  message: string,
  pageKey: EnmsPageKey,
): EnmsChatSemanticRoute | null {
  const pageRoutes = CHAT_SEMANTIC_ROUTES.filter(
    (route) => route.pageKey === pageKey,
  );
  return pageRoutes.find((route) =>
    matchesEnmsChatSemanticRoute(route.key, message)
  ) ?? null;
}

export function hasEnmsChatSemanticRouteForPage(
  message: string,
  pageKey: string | undefined,
): boolean {
  return (
    isEnmsPageKey(pageKey) &&
    getEnmsChatSemanticRouteForPage(message, pageKey) !== null
  );
}

export function buildEnmsScopedBundleContextMessage(
  message: string,
  pageKey: string | undefined,
): string {
  if (!isEnmsPageKey(pageKey)) {
    return message;
  }

  const route = getEnmsChatSemanticRouteForPage(message, pageKey);
  if (!route || (pageKey === "nlq" && route.key !== "latest_data")) {
    return message;
  }

  const suffix = getRequestedAccountSuffix(message);
  const presentationSuffix =
    /圖表|圖形|畫成圖|用圖|長條圖|折線圖|趨勢圖|排行榜|排名圖|chart|graph|visual/i
      .test(message)
      ? " 請用圖表呈現"
      : "";
  if (pageKey !== "nlq") {
    return `${route.queryHint}${suffix}${presentationSuffix}`
      .replace(/\s+/g, " ")
      .trim();
  }

  if (route.preciseAnswerOnly) {
    return `${route.queryHint}${suffix}${presentationSuffix}`
      .replace(/\s+/g, " ")
      .trim();
  }

  return `${message} ${route.queryHint}${suffix}`
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeResourcePath(value: string): string {
  const normalizedPath = normalize(value).split(sep).join("/");
  if (
    normalizedPath.startsWith("../") ||
    normalizedPath.startsWith("/") ||
    normalizedPath.includes("/../")
  ) {
    throw new Error(`Invalid EnMS knowledge path: ${value}`);
  }

  const allowed =
    normalizedPath.startsWith("skills/enms/") ||
    normalizedPath.startsWith("wiki/operations/enms/") ||
    normalizedPath.startsWith("wiki/playbooks/enms/") ||
    normalizedPath.startsWith("wiki/entities/energy/ENMS_") ||
    normalizedPath.startsWith("wiki/entities/sites/ENMS_");
  if (!allowed) {
    throw new Error(`EnMS knowledge path is outside the allowlist: ${value}`);
  }

  return normalizedPath;
}

function findRepositoryRoot(): string {
  let current = resolve(process.cwd());
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(current, "skills", "enms", "SKILL.md"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  throw new Error("Unable to locate EnClaw repository knowledge root");
}

function extractHeadings(content: string): string[] {
  return content
    .split(/\r?\n/)
    .filter((line) => /^#{1,4}\s+\S/.test(line))
    .map((line) => line.replace(/^#{1,4}\s+/, "").trim())
    .slice(0, 24);
}

function countDirectives(content: string): number {
  return content
    .split(/\r?\n/)
    .filter((line) => /^\s*(?:[-*]|\d+\.)\s+\S/.test(line)).length;
}

function hasFactPath(
  facts: Record<string, unknown>,
  dottedPath: string,
): boolean {
  let current: unknown = facts;
  for (const segment of dottedPath.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return false;
    }
    const record = current as Record<string, unknown>;
    const actualKey = Object.keys(record).find(
      (key) => key.toLowerCase() === segment.toLowerCase(),
    );
    if (!actualKey) {
      return false;
    }
    current = record[actualKey];
  }

  return isValidFactValue(dottedPath, current);
}

function isNamedValueList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return false;
      }
      const record = item as Record<string, unknown>;
      return (
        typeof record.name === "string" &&
        record.name.trim().length > 0 &&
        typeof record.value === "number" &&
        Number.isFinite(record.value)
      );
    })
  );
}

function isAnalyticsPointList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return false;
      }
      const record = item as Record<string, unknown>;
      return (
        typeof record.recordedAt === "string" &&
        record.recordedAt.trim().length > 0
      );
    })
  );
}

function isValidFactValue(dottedPath: string, value: unknown): boolean {
  const path = dottedPath.toLowerCase();
  if (path.startsWith("metrics.")) {
    return typeof value === "number" && Number.isFinite(value);
  }

  if (
    path === "ranking" ||
    path === "siterankings" ||
    path === "alertgroups" ||
    path === "opportunities"
  ) {
    return isNamedValueList(value);
  }

  if (
    path === "analyticsinputs.summarypoints" ||
    path === "analyticsinputs.rawpoints"
  ) {
    return isAnalyticsPointList(value);
  }

  if (path === "examplequestion" || path === "exampleanswer") {
    return typeof value === "string" && value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value !== null && value !== undefined;
}

async function createKnowledgeBundle(
  definition: EnmsPageDefinition,
  pack: EnmsContextPack,
): Promise<EnmsKnowledgeBundle> {
  if (pack.planner.intent !== definition.intent) {
    throw new Error(
      `EnMS context intent mismatch: expected ${definition.intent}, got ${pack.planner.intent}`,
    );
  }

  const requiredRoutes = [
    ...definition.skillPaths,
    ...definition.wikiPaths,
    ...definition.playbookPaths,
  ];
  const contextRoutes = [
    ...pack.read_first,
    ...pack.references,
    ...pack.wiki,
    ...pack.playbooks,
  ];
  const resourcePaths = unique([...requiredRoutes, ...contextRoutes]).map(
    normalizeResourcePath,
  );
  const root = findRepositoryRoot();
  const loadedDocuments = await Promise.all(
    resourcePaths.map(async (resourcePath) => {
      const content = await readFile(join(root, resourcePath), "utf8");
      return {
        content,
        metadata: {
          path: resourcePath,
          sha256: createHash("sha256").update(content).digest("hex"),
          headings: extractHeadings(content),
          directiveCount: countDirectives(content),
        },
      };
    }),
  );
  const combinedKnowledge = loadedDocuments
    .map((document) => document.content)
    .join("\n");
  const missingPhrases = definition.requiredKnowledgePhrases.filter(
    (phrase) => !combinedKnowledge.includes(phrase),
  );
  if (missingPhrases.length > 0) {
    throw new Error(
      `EnMS knowledge contract mismatch: ${missingPhrases.join(", ")}`,
    );
  }

  return {
    contractVersion: ENMS_INTEGRATION_CONTRACT_VERSION,
    factsSchemaVersion: ENMS_FACTS_SCHEMA_VERSION,
    registryVersion: ENMS_CAPABILITY_REGISTRY_VERSION,
    pageKey: definition.pageKey,
    capabilities: definition.capabilityKeys.map(
      (key) => CORE_CAPABILITIES[key],
    ),
    documents: loadedDocuments.map((document) => document.metadata),
    verifiedPhrases: [...definition.requiredKnowledgePhrases],
    contextPack: {
      intent: pack.planner.intent,
      readFirst: [...pack.read_first],
      references: [...pack.references],
      wiki: [...pack.wiki],
      playbooks: [...pack.playbooks],
      liveQuerySteps: [...pack.live_query_steps],
    },
    loadedAt: new Date().toISOString(),
  };
}

export function isEnmsPageKey(value: unknown): value is EnmsPageKey {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PAGE_REGISTRY, value)
  );
}

export function getEnmsPageDefinition(
  pageKey: EnmsPageKey,
): EnmsPageDefinition {
  return PAGE_REGISTRY[pageKey];
}

export function getEnmsPageKeys(): EnmsPageKey[] {
  return Object.keys(PAGE_REGISTRY) as EnmsPageKey[];
}

export function getEnmsCapabilityRegistry(): EnmsCapabilityDefinition[] {
  return Object.values(CORE_CAPABILITIES);
}

export function getMissingRequiredFactGroups(
  pageKey: EnmsPageKey,
  facts: Record<string, unknown>,
): string[][] {
  return PAGE_REGISTRY[pageKey].requiredFactPaths.filter(
    (alternatives) =>
      !alternatives.some((path) => hasFactPath(facts, path)),
  );
}

export function loadEnmsKnowledgeBundle(
  pageKey: EnmsPageKey,
  pack: EnmsContextPack,
): Promise<EnmsKnowledgeBundle> {
  const definition = PAGE_REGISTRY[pageKey];
  const cacheKey = [
    ENMS_CAPABILITY_REGISTRY_VERSION,
    pageKey,
    pack.planner.intent,
    ...pack.read_first,
    ...pack.references,
    ...pack.wiki,
    ...pack.playbooks,
  ].join("|");

  const cached = knowledgeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const loading = createKnowledgeBundle(definition, pack).catch((error) => {
    knowledgeCache.delete(cacheKey);
    throw error;
  });
  knowledgeCache.set(cacheKey, loading);
  return loading;
}

export function loadEnmsPromptDocuments(
  pageKey: EnmsPageKey,
  bundle: EnmsKnowledgeBundle,
): Promise<EnmsPromptDocument[]> {
  const definition = PAGE_REGISTRY[pageKey];
  const allowedPaths = unique([
    ...definition.skillPaths,
    ...definition.wikiPaths,
    ...definition.playbookPaths,
  ]).filter(
    (path) => path !== "skills/enms/reference/auto-schema-enms.md",
  );
  const cacheKey = [
    ENMS_CAPABILITY_REGISTRY_VERSION,
    pageKey,
    ...allowedPaths,
    ...bundle.documents.map((document) => document.sha256),
  ].join("|");
  const cached = promptDocumentCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const loading = (async () => {
    const root = findRepositoryRoot();
    const documents: EnmsPromptDocument[] = [];
    let totalBytes = 0;

    for (const rawPath of allowedPaths) {
      const resourcePath = normalizeResourcePath(rawPath);
      const metadata = bundle.documents.find(
        (document) => document.path === resourcePath,
      );
      if (!metadata) {
        throw new Error(
          `EnMS prompt document is missing from verified bundle: ${resourcePath}`,
        );
      }

      const content = await readFile(join(root, resourcePath), "utf8");
      const sha256 = createHash("sha256").update(content).digest("hex");
      if (sha256 !== metadata.sha256) {
        throw new Error(
          `EnMS prompt document changed after verification: ${resourcePath}`,
        );
      }

      const contentBytes = Buffer.byteLength(content, "utf8");
      if (totalBytes + contentBytes > MAX_PROMPT_KNOWLEDGE_BYTES) {
        throw new Error(
          `EnMS prompt knowledge exceeds ${MAX_PROMPT_KNOWLEDGE_BYTES} bytes`,
        );
      }
      totalBytes += contentBytes;
      documents.push({ path: resourcePath, sha256, content });
    }

    return documents;
  })().catch((error) => {
    promptDocumentCache.delete(cacheKey);
    throw error;
  });
  promptDocumentCache.set(cacheKey, loading);
  return loading;
}

export function clearEnmsKnowledgeCacheForTests(): void {
  knowledgeCache.clear();
  promptDocumentCache.clear();
}
