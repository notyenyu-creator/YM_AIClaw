// ERP Context Builder — Phase 1
//
// Mirrors the Y-CRM context builder pattern but kept intentionally small:
// it only detects whether the user message belongs to the ERP domain and
// returns a minimal preflight summary. Full intent classification, risk
// scoring, and learning loop integration are deferred to phase 2.

export type ErpIntent =
  | "sales_order"
  | "purchase_order"
  | "inventory_status"
  | "shipping_status"
  | "production_status"
  | "service_ticket"
  | "finance_doc"
  | "unknown";

export type ErpContextBuilderInput = {
  request: {
    user_message: string;
    current_system_hint?: "erp" | "ycrm" | "none" | null;
  };
};

export function createDefaultErpContextInput(
  userMessage: string,
): ErpContextBuilderInput {
  return {
    request: {
      user_message: userMessage,
      current_system_hint: "erp",
    },
  };
}

export type ErpPlannerPreflight = {
  system: "erp";
  updatedAt: number;
  intent: ErpIntent;
  confidence: "low" | "medium" | "high";
  shouldRouteToErp: boolean;
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
  "圖表", "chart", "圖", "bar", "pie", "line",
  "分布", "趨勢", "占比", "比例", "排名", "ranking",
  "報表", "分析圖", "長條圖", "圓餅圖",
];

const INTENT_KEYWORDS: Record<ErpIntent, string[]> = {
  sales_order: [
    "訂單", "銷售單", "so", "報價", "quote", "客戶訂單",
    "未交", "交期", "已出", "出貨進度", "訂購", "下單",
  ],
  shipping_status: [
    "出貨", "出貨單", "do", "送貨", "貨運", "tracking", "已寄出",
    "揀貨", "pick", "出貨狀態", "物流",
  ],
  purchase_order: [
    "採購", "採購單", "po", "請購", "pr", "供應商", "進貨", "gr",
    "退購", "vendor", "下訂", "詢價",
  ],
  inventory_status: [
    "庫存", "庫存量", "存貨", "可用量", "在手", "批號", "lot",
    "倉位", "庫位", "盤點", "調撥", "領料", "退料", "缺料",
    "安全庫存", "available", "on hand",
  ],
  production_status: [
    "工單", "wo", "生產", "製程", "工序", "報工", "良率",
    "在製", "完工", "bom", "排程", "產線", "機台",
  ],
  service_ticket: [
    "服務單", "保修", "維修", "客訴", "ticket", "工時",
  ],
  finance_doc: [
    "傳票", "發票", "請款", "應收", "應付", "成本", "對帳",
    "invoice", "billing",
  ],
  unknown: [],
};

// Words that strongly suggest the question is NOT for ERP (Y-CRM-only)
const YCRM_ONLY_KEYWORDS = [
  "line", "聯絡人", "商機", "opportunity", "互動", "拜訪",
  "業務員指派", "y-crm", "ycrm",
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function countMatches(message: string, keywords: string[]): {
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

export function detectErpIntent(message: string): {
  intent: ErpIntent;
  matchedKeywords: string[];
  totalMatches: number;
} {
  let bestIntent: ErpIntent = "unknown";
  let bestScore = 0;
  const allMatched: string[] = [];

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS) as Array<
    [ErpIntent, string[]]
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

  // totalMatches = unique ERP keywords matched across ALL intents
  // (used for routing confidence; bestIntent is the dominant label)
  const uniqueMatched = Array.from(new Set(allMatched));
  return {
    intent: bestIntent,
    matchedKeywords: uniqueMatched,
    totalMatches: uniqueMatched.length,
  };
}

export function buildErpContext(
  input: ErpContextBuilderInput,
): ErpPlannerPreflight {
  const message = input.request.user_message ?? "";
  const hint = input.request.current_system_hint;

  const { intent, matchedKeywords, totalMatches } = detectErpIntent(message);
  const ycrmSignal = countMatches(message, YCRM_ONLY_KEYWORDS).count;

  // Confidence and routing rules:
  // - Explicit "erp" hint → high confidence routing
  // - 2+ ERP keyword matches → medium/high
  // - 1 match but Y-CRM signal stronger → skip
  // - 0 matches → not routed
  let confidence: "low" | "medium" | "high" = "low";
  let shouldRouteToErp = false;
  const warnings: string[] = [];

  if (hint === "erp") {
    shouldRouteToErp = true;
    confidence = totalMatches >= 1 ? "high" : "medium";
  } else if (totalMatches >= 2 && totalMatches > ycrmSignal) {
    shouldRouteToErp = true;
    confidence = "high";
  } else if (totalMatches === 1 && ycrmSignal === 0) {
    shouldRouteToErp = true;
    confidence = "medium";
  } else if (totalMatches >= 1 && ycrmSignal >= totalMatches) {
    shouldRouteToErp = false;
    warnings.push("erp_keywords_present_but_ycrm_signal_stronger");
  }

  if (intent === "unknown" && shouldRouteToErp) {
    warnings.push("routed_without_clear_intent");
  }

  const chartHits = countMatches(message, CHART_KEYWORDS);
  const optionalChartRequested = chartHits.count > 0;
  const presentation = {
    optional_chart_requested: optionalChartRequested,
    chart_render_allowed: optionalChartRequested && shouldRouteToErp,
    chart_guardrail_reason: optionalChartRequested
      ? "chart_optional_if_non_empty_aggregates_available"
      : null,
    max_chart_panels: optionalChartRequested ? 2 : 0,
  };

  return {
    system: "erp",
    updatedAt: Date.now(),
    intent,
    confidence,
    shouldRouteToErp,
    matchedKeywords,
    warnings,
    presentation,
  };
}

export function summarizeErpPlan(
  preflight: ErpPlannerPreflight,
): ErpPlannerPreflight {
  // Currently identical to preflight; placeholder for future enrichment.
  return preflight;
}

// Build the prompt block injected into the chat message when routing to ERP.
// Kept terse to respect token budget.
export function decorateMessageWithErpContext(
  agentMessage: string,
  preflight: ErpPlannerPreflight,
): string {
  if (!preflight.shouldRouteToErp) {
    return agentMessage;
  }
  const block = [
    "[ERP Routing Context]",
    `system: erp`,
    `intent: ${preflight.intent}`,
    `confidence: ${preflight.confidence}`,
    `matched_keywords: ${preflight.matchedKeywords.join(", ") || "(none)"}`,
    `read_first:`,
    `  - skills/erp/SKILL.md`,
    `  - skills/erp/reference/auto-schema-erp.md`,
    `connection: postgres_scanner READ_ONLY @ 118.168.188.27:5433/ErpUAT_local`,
    `rules:`,
    `  - 表名必須加雙引號 + 全大寫 (e.g. erp.public."SO")`,
    `  - 排除作廢單 WHERE cancelled_at IS NULL`,
    `  - 預設 LIMIT 100，預設時間 30 天`,
    `  - 唯讀，禁止 INSERT/UPDATE/DELETE`,
    preflight.warnings.length > 0
      ? `warnings: ${preflight.warnings.join(", ")}`
      : null,
    "[/ERP Routing Context]",
    "",
    agentMessage,
  ]
    .filter(Boolean)
    .join("\n");
  return block;
}

export function shouldPersistErpPlannerPreflight(
  preflight: ErpPlannerPreflight,
): boolean {
  return preflight.shouldRouteToErp;
}
