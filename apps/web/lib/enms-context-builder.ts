// EnMS Context Builder
//
// Mirrors the ERP/Y-CRM routing pattern. It detects whether a user
// request belongs to the EnMS / energy-management domain and returns a
// compact preflight summary that can later be turned into a context pack.

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

const INTENT_KEYWORDS: Record<EnmsIntent, string[]> = {
  demand_forecast: [
    "需量",
    "最大需量",
    "需量預測",
    "降載",
    "智能降載",
    "超約",
    "契約容量",
    "電費",
    "dmd15",
    "maxdemand",
    "peak demand",
  ],
  anomaly_detection: [
    "異常",
    "根因",
    "故障",
    "異常偵測",
    "根因分析",
    "三相",
    "功率因數",
    "功因",
    "quality",
    "connected",
    "thd",
    "告警",
    "波動",
  ],
  natural_language_query: [
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
    "功因",
    "用電量",
    "totalconsumption",
  ],
  site_benchmarking: [
    "場域",
    "site",
    "多場域",
    "benchmark",
    "排名",
    "比較",
    "坪均",
    "人均",
    "site name",
    "company name",
  ],
  alert_governance: [
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
  efficiency_analysis: [
    "能效",
    "節能",
    "節電",
    "省電",
    "節費",
    "省多少",
    "帳單",
    "台電帳單",
    "billing",
    "節能挖掘",
    "energy efficiency",
    "roi",
    "what-if",
    "what if",
    "投資回收",
    "回收期",
    "payback",
    "情境模擬",
    "模擬",
    "試算",
    "密度",
    "坪效",
    "kvarh",
    "功率品質",
    "avgpowerfactor",
    "minpowerfactor",
  ],
  raw_trace: [
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
  unknown: [],
};

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

  return {
    intent: asksPowerFactorComparison ? "site_benchmarking" : bestIntent,
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

  let confidence: "low" | "medium" | "high" = "low";
  let shouldRouteToEnms = false;
  const warnings: string[] = [];

  if (hint === "enms") {
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
