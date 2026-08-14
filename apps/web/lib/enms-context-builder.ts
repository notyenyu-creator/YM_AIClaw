// EnMS Context Builder
//
// Mirrors the ERP/Y-CRM routing pattern. It detects whether a user
// request belongs to the EnMS / energy-management domain and returns a
// compact preflight summary that can later be turned into a context pack.

import { buildEnmsIntentKeywordMap } from "./enms-capability-registry";

export type EnmsIntent =
  | "demand_forecast"
  | "anomaly_detection"
  | "natural_language_query"
  | "site_benchmarking"
  | "alert_governance"
  | "efficiency_analysis"
  | "raw_trace"
  | "unknown";

export type EnmsContextBuilderInput = {
  request: {
    user_message: string;
    current_system_hint?: "enms" | "erp" | "ycrm" | "none" | null;
  };
};

export function createDefaultEnmsContextInput(
  userMessage: string,
): EnmsContextBuilderInput {
  return {
    request: {
      user_message: userMessage,
      current_system_hint: "enms",
    },
  };
}

export type EnmsPlannerPreflight = {
  system: "enms";
  updatedAt: number;
  intent: EnmsIntent;
  confidence: "low" | "medium" | "high";
  shouldRouteToEnms: boolean;
  matchedKeywords: string[];
  warnings: string[];
  presentation: {
    optional_chart_requested: boolean;
    chart_render_allowed: boolean;
    chart_guardrail_reason: string | null;
    max_chart_panels: number;
  };
};

const CHART_KEYWORDS = [
  "圖表",
  "chart",
  "圖",
  "bar",
  "pie",
  "line",
  "分布",
  "趨勢",
  "占比",
  "比例",
  "排名",
  "ranking",
  "報表",
  "分析圖",
  "長條圖",
  "圓餅圖",
  "儀表板",
  "dashboard",
];

const EXPLICIT_CHART_KEYWORDS = [
  "圖表",
  "chart",
  "圖",
  "bar",
  "pie",
  "line",
  "報表",
  "分析圖",
  "長條圖",
  "圓餅圖",
  "儀表板",
  "dashboard",
];

const INTENT_KEYWORDS = buildEnmsIntentKeywordMap();

const YCRM_ONLY_KEYWORDS = [
  "line",
  "聯絡人",
  "商機",
  "opportunity",
  "互動",
  "拜訪",
  "業務員指派",
  "y-crm",
  "ycrm",
  "客戶跟進",
];

const ERP_ONLY_KEYWORDS = [
  "訂單",
  "採購",
  "庫存",
  "工單",
  "出貨",
  "發票",
  "應收",
  "應付",
  "bom",
  "shipment",
  "inventory",
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function countMatches(
  message: string,
  keywords: string[],
): {
  count: number;
  matched: string[];
} {
  const lower = normalize(message);
  const matched: string[] = [];
  for (const keyword of keywords) {
    if (lower.includes(keyword.toLowerCase())) {
      matched.push(keyword);
    }
  }
  return { count: matched.length, matched };
}

function hasExplicitEnmsExclusion(message: string): boolean {
  return (
    /(不要查|不要看|不要用|不用|不查|不看|別查|勿查|排除|不要|別|勿)\s*(?:(?:ERP|erp|Y-CRM|y-crm)\s*(?:或|\/|、|,|，)\s*)*(EnMS|enms|能管|能源管理)(?=[\s,，。.!?]|$)/i.test(message) ||
    /(EnMS|enms|能管|能源管理)[\s,，]*(先)?(不要查|不要看|不要用|不用|不查|不看|別查|勿查|排除)(?=[,，。.!?]|$)/i.test(message)
  );
}

function hasNegatedEnergyAnalysis(message: string): boolean {
  return /(不要|別|勿|不用|不看|不查|不要查|不要分析|不分析|先不要分析).{0,20}(耗電|用電|能耗|能源|電表|場域能耗|需量|功率因數|功因|超約|契約容量)/i.test(message);
}

function asksMeterOrDeviceRanking(normalizedMessage: string): boolean {
  const hasMeterSubject =
    /迴路|回路|電表|電錶|設備|電表別名|設備別名|mac|address|位址|地址|circuit|meter|device/i
      .test(normalizedMessage);
  const hasRankingIntent =
    /最費電|最耗電|耗電最高|用電最高|最高用電|耗能最高|排名|排行|top|ranking/i
      .test(normalizedMessage);
  const hasEnergyMetric =
    /用電|耗電|費電|能耗|kwh|energy|consumption/i.test(normalizedMessage);
  return hasMeterSubject && hasRankingIntent && hasEnergyMetric;
}

export function detectEnmsIntent(message: string): {
  intent: EnmsIntent;
  matchedKeywords: string[];
  totalMatches: number;
} {
  const normalizedMessage = normalize(message);
  let bestIntent: EnmsIntent = "unknown";
  let bestScore = 0;
  const allMatched: string[] = [];

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS) as Array<
    [EnmsIntent, string[]]
  >) {
    if (intent === "unknown") {
      continue;
    }
    const { count, matched } = countMatches(message, keywords);
    allMatched.push(...matched);
    if (count > bestScore) {
      bestScore = count;
      bestIntent = intent;
    }
  }

  const uniqueMatched = Array.from(new Set(allMatched));
  const asksPowerFactorComparison =
    (normalizedMessage.includes("功率因數") ||
      normalizedMessage.includes("功因") ||
      normalizedMessage.includes("power factor")) &&
    (normalizedMessage.includes("哪個場域") ||
      normalizedMessage.includes("各場域") ||
      normalizedMessage.includes("比較") ||
      normalizedMessage.includes("最差") ||
      normalizedMessage.includes("低於建議值"));
  const asksMeterRanking = asksMeterOrDeviceRanking(normalizedMessage);
  const asksSiteBenchmarking =
    !asksMeterRanking &&
    (normalizedMessage.includes("場域") ||
      normalizedMessage.includes("各場域") ||
      normalizedMessage.includes("多場域") ||
      normalizedMessage.includes("廠區") ||
      normalizedMessage.includes("區域") ||
      normalizedMessage.includes("site")) &&
    (normalizedMessage.includes("比較") ||
      normalizedMessage.includes("排名") ||
      normalizedMessage.includes("排行") ||
      normalizedMessage.includes("benchmark") ||
      normalizedMessage.includes("用電") ||
      normalizedMessage.includes("能耗") ||
      normalizedMessage.includes("耗電") ||
      normalizedMessage.includes("績效"));

  return {
    intent: asksPowerFactorComparison || asksSiteBenchmarking
      ? "site_benchmarking"
      : bestIntent,
    matchedKeywords: uniqueMatched,
    totalMatches: uniqueMatched.length,
  };
}

export function buildEnmsContext(
  input: EnmsContextBuilderInput,
): EnmsPlannerPreflight {
  const message = input.request.user_message ?? "";
  const normalizedMessage = normalize(message);
  const hint = input.request.current_system_hint;

  const { intent, matchedKeywords, totalMatches } = detectEnmsIntent(message);
  const ycrmSignal = countMatches(message, YCRM_ONLY_KEYWORDS).count;
  const erpSignal = countMatches(message, ERP_ONLY_KEYWORDS).count;
  const otherSystemSignal = Math.max(ycrmSignal, erpSignal);
  const explicitEnmsExclusion = hasExplicitEnmsExclusion(message);
  const negatedEnergyAnalysis =
    hasNegatedEnergyAnalysis(message) &&
    hint !== "enms" &&
    (otherSystemSignal > 0 || totalMatches <= 1);

  let confidence: "low" | "medium" | "high" = "low";
  let shouldRouteToEnms = false;
  const warnings: string[] = [];

  if (explicitEnmsExclusion || negatedEnergyAnalysis) {
    shouldRouteToEnms = false;
    warnings.push("enms_explicitly_excluded");
  } else if (hint === "enms") {
    shouldRouteToEnms = true;
    confidence = totalMatches >= 1 ? "high" : "medium";
  } else if (totalMatches >= 2 && totalMatches > otherSystemSignal) {
    shouldRouteToEnms = true;
    confidence = "high";
  } else if (totalMatches === 1 && otherSystemSignal === 0) {
    shouldRouteToEnms = true;
    confidence = "medium";
  } else if (totalMatches >= 1 && otherSystemSignal >= totalMatches) {
    shouldRouteToEnms = false;
    warnings.push("enms_keywords_present_but_other_system_signal_stronger");
  }

  if (intent === "unknown" && shouldRouteToEnms) {
    warnings.push("routed_without_clear_intent");
  }

  if (
    shouldRouteToEnms &&
    intent === "site_benchmarking" &&
    (normalizedMessage.includes("功率因數") ||
      normalizedMessage.includes("功因")) &&
    (normalizedMessage.includes("哪個場域") ||
      normalizedMessage.includes("各場域") ||
      normalizedMessage.includes("比較") ||
      normalizedMessage.includes("低於建議值") ||
      normalizedMessage.includes("最差"))
  ) {
    confidence = "high";
  }

  const chartHits = countMatches(message, CHART_KEYWORDS);
  const explicitChartHits = countMatches(message, EXPLICIT_CHART_KEYWORDS);
  const optionalChartRequested =
    intent === "site_benchmarking"
      ? explicitChartHits.count > 0
      : chartHits.count > 0;
  const presentation = {
    optional_chart_requested: optionalChartRequested,
    chart_render_allowed: optionalChartRequested && shouldRouteToEnms,
    chart_guardrail_reason: optionalChartRequested
      ? "chart_optional_if_non_empty_aggregates_available"
      : null,
    max_chart_panels: optionalChartRequested ? 2 : 0,
  };

  return {
    system: "enms",
    updatedAt: Date.now(),
    intent,
    confidence,
    shouldRouteToEnms,
    matchedKeywords,
    warnings,
    presentation,
  };
}

export function shouldPersistEnmsPlannerPreflight(
  preflight: EnmsPlannerPreflight,
): boolean {
  return preflight.shouldRouteToEnms;
}
