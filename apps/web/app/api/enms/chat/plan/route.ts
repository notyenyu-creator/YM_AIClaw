import { timingSafeEqual } from "crypto";

import {
  buildEnmsChatQueryPlan,
  ENMS_CHAT_ANSWER_OBLIGATION_VALUES,
  ENMS_CHAT_ANSWER_QUALITY_RULE_VALUES,
  ENMS_CHAT_FACT_GROUP_VALUES,
  ENMS_CHAT_PLAN_CONTRACT_VERSION,
  ENMS_CHAT_SEMANTIC_GOAL_VALUES,
  ENMS_CAPABILITY_REGISTRY_VERSION,
  getEnmsChatSemanticRoutes,
  type EnmsChatModelPlannerHints,
  type EnmsChatSemanticRouteKey,
  type EnmsPageKey,
} from "@/lib/enms-capability-registry";
import { getEnmsS2sApiKey } from "@/lib/enms-s2s-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 4;
const MAX_HISTORY_CONTENT_LENGTH = 600;
const MAX_MODEL_PLANNER_RESPONSE_BYTES = 16 * 1024;
const MODEL_PLANNER_DEFAULT_TIMEOUT_MS = 4_000;
const ENMS_PAGE_KEY_VALUES: readonly EnmsPageKey[] = [
  "demand",
  "anomaly",
  "nlq",
  "bench",
  "alert",
  "eff",
];

type EnmsChatPlanRequest = {
  message?: string;
  conversationId?: string | null;
  history?: EnmsChatPlanHistoryItem[];
};

type EnmsChatPlanHistoryItem = {
  role?: string;
  content?: string;
};

type ModelPlannerConfig = {
  endpoint: URL;
  apiKey: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
};

function isAuthorized(req: Request): boolean {
  const expected = getEnmsS2sApiKey();
  if (!expected) {
    return false;
  }

  const match = (req.headers.get("authorization") ?? "").match(
    /^Bearer\s+(.+)$/i,
  );
  const actual = match?.[1] ?? "";
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function trimText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }

  const text = value.trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function readBoundedInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, parsed))
    : fallback;
}

function readPlannerModelEnv(suffix: string): string | undefined {
  return (
    process.env[`ENCLAW_ENMS_PLANNER_MODEL_${suffix}`]?.trim() ||
    process.env[`ENCLAW_ENMS_STRUCTURED_MODEL_${suffix}`]?.trim() ||
    undefined
  );
}

function isModelSemanticPlannerEnabled(): boolean {
  return (
    process.env.ENCLAW_ENMS_MODEL_SEMANTIC_PLANNER_ENABLED === "1" ||
    process.env.ENCLAW_ENMS_PLANNER_MODEL_ENABLED === "1"
  );
}

function getModelPlannerConfig(): ModelPlannerConfig | null {
  const transport = readPlannerModelEnv("TRANSPORT") || "openai-compatible";
  if (transport !== "openai-compatible") {
    return null;
  }

  const baseUrl = readPlannerModelEnv("BASE_URL") ?? "";
  const apiKey = readPlannerModelEnv("API_KEY") ?? "";
  const model = readPlannerModelEnv("NAME") ?? "";
  if (!baseUrl || !apiKey || !model) {
    return null;
  }

  try {
    const normalizedBase = new URL(
      baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
    );
    if (
      !["http:", "https:"].includes(normalizedBase.protocol) ||
      normalizedBase.username ||
      normalizedBase.password
    ) {
      return null;
    }
    if (
      (readPlannerModelEnv("REQUIRE_HTTPS") ??
        process.env.ENCLAW_ENMS_REQUIRE_MODEL_HTTPS) === "1" &&
      normalizedBase.protocol !== "https:"
    ) {
      return null;
    }
    const allowedHosts = (readPlannerModelEnv("ALLOWED_HOSTS") ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (
      allowedHosts.length > 0 &&
      !allowedHosts.includes(normalizedBase.hostname.toLowerCase())
    ) {
      return null;
    }

    return {
      endpoint: new URL("chat/completions", normalizedBase),
      apiKey,
      model,
      maxTokens: readBoundedInt(
        readPlannerModelEnv("MAX_TOKENS"),
        512,
        128,
        1_000,
      ),
      timeoutMs: readBoundedInt(
        readPlannerModelEnv("TIMEOUT_MS"),
        MODEL_PLANNER_DEFAULT_TIMEOUT_MS,
        800,
        8_000,
      ),
    };
  } catch {
    return null;
  }
}

function normalizeHistory(history: unknown): EnmsChatPlanHistoryItem[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((item): EnmsChatPlanHistoryItem | null => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const role = trimText(record.role, 20);
      const content = trimText(record.content, MAX_HISTORY_CONTENT_LENGTH);
      if (!role || !content) {
        return null;
      }
      return {
        role: role === "assistant" ? "assistant" : "user",
        content,
      };
    })
    .filter((item): item is EnmsChatPlanHistoryItem => item !== null)
    .slice(-MAX_HISTORY_ITEMS);
}

function isContextualFollowUpQuestion(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (
    /什麼是|是什麼|何謂|定義|概念|what is|definition|meaning/i.test(
      normalized,
    )
  ) {
    return false;
  }

  const asksPresentation =
    /圖表|圖形|畫成圖|用圖|長條圖|折線圖|排行榜|排名圖|表格|整理成表|chart|graph|visual/i
      .test(normalized);
  const hasFollowUpMarker =
    /^(那|這|上面|剛剛|前面|上一題|上一個|同樣|也|再|順便|可以|請|麻煩)/i
      .test(normalized) ||
    /呢|也|再|補|呈現|整理|轉成|換成/i.test(normalized);
  const hasContextualAnchor =
    /這個|那個|此案場|本案場|目前這張圖|這張圖|這個分頁|目前分頁|同一張|同一題|同時段|上一題|上一個|剛剛|剛才|前面|上述|哪一天|哪天|那一天|多少|是多少|正常嗎|可以嗎/i
      .test(normalized);

  return (
    asksPresentation && (normalized.length <= 80 || hasFollowUpMarker)
  ) || (normalized.length <= 80 && (hasFollowUpMarker || hasContextualAnchor));
}

function buildPlannerMessage(
  message: string,
  history: EnmsChatPlanHistoryItem[],
): string {
  if (!isContextualFollowUpQuestion(message) || history.length === 0) {
    return message;
  }

  const conversationContext = history
    .map((item) => `${item.role === "assistant" ? "assistant" : "user"}: ${item.content}`)
    .join("\n");

  return [
    "[Conversation Context]",
    conversationContext,
    "[/Conversation Context]",
    message,
  ].join("\n");
}

function buildModelSemanticPlannerPrompt(message: string): string {
  const capabilityCatalog = getEnmsChatSemanticRoutes().map((route) => ({
    key: route.key,
    pageKey: route.pageKey,
    intent: route.intent,
    queryHint: route.queryHint,
    examples: route.synonyms.slice(0, 8),
  }));

  const semanticContract = {
    pageKeys: ENMS_PAGE_KEY_VALUES,
    answerObligationKeys: ENMS_CHAT_ANSWER_OBLIGATION_VALUES,
    semanticGoals: ENMS_CHAT_SEMANTIC_GOAL_VALUES,
    requiredFactGroups: ENMS_CHAT_FACT_GROUP_VALUES,
    answerQualityRules: ENMS_CHAT_ANSWER_QUALITY_RULE_VALUES,
  };

  return [
    "你是 EnMS AI Chat 的 plan-only 語意規劃器。",
    "你的任務是理解使用者語意，輸出可驗證 ChatPlan hints；不得回答問題、不得查資料、不得產生 SQL、不得呼叫工具。",
    "若問題是一般閒聊、天氣、非能管概念或沒有要求 EnMS 授權資料，allowDbFacts 必須是 false，allowGeneralAI 必須是 true。",
    "若問題涉及能管資料、場域、電號、電表、迴路、需量、用電、功率因數、異常、告警、節能、碳排、電費或圖表，allowDbFacts 必須是 true，並從 capabilityCatalog 與 semanticContract 選擇白名單值。",
    "優先選最少 capability；除非使用者明確要求多個指標、比較或圖表組合，通常只選 1 個主要 capability。",
    "嚴格區分單位與語意：最高/最大需量、目前需量、kW、peak demand 只能選 demand 類 capability，不要選 energy_usage_query 或 meter_ranking。",
    "用電量、總用電、耗電、kWh、哪一天用電最高才選 energy 類 capability；不可用需量 kW 取代 kWh。",
    "資料涵蓋多久、收集幾天、資料起訖、樣本數或資料覆蓋範圍，應選 data_coverage；不要誤選 site_metadata 或 latest_data。",
    "案場名稱、目前場域、公司/廠區清單才選 site_metadata；最新一筆資料時間才選 latest_data。",
    "最大偏移/偏離點必須選 anomaly deviation 相關 capability；不可只選功率因數或一般異常摘要。",
    "最浪費、白白燒電、無效耗能、空轉需要節能機會與支援 facts；要區分『耗電最高』與『浪費最高』。",
    "不要用單一關鍵字硬猜；要理解語意。例如：最浪費需要節能機會、用電排行、異常、設備角色；最大偏移需要 anomaly deviation；指定月份總用電需要 period energy total。",
    "answerObligationKeys 要描述使用者真正要看到的答案項目；requiredFactGroups 要描述後續 EnMS API 需要準備的 facts；answerQualityRules 要描述 verifier 要防止的混線。",
    '只輸出 JSON object，schema: {"selectedCapabilities":["capability_key"],"selectedPageKeys":["page_key"],"answerObligationKeys":["obligation_key"],"semanticGoals":["goal"],"requiredFactGroups":["fact_group"],"answerQualityRules":["rule"],"chartRequested":true|false,"allowDbFacts":true|false,"allowGeneralAI":true|false,"needClarification":true|false,"confidence":"low|medium|high","reason":"short reason"}',
    `<CAPABILITY_CATALOG>${JSON.stringify(capabilityCatalog)}</CAPABILITY_CATALOG>`,
    `<SEMANTIC_CONTRACT>${JSON.stringify(semanticContract)}</SEMANTIC_CONTRACT>`,
    `<USER_MESSAGE>${message}</USER_MESSAGE>`,
    "<FINAL_OUTPUT_RULES>只輸出 JSON object，不得在 JSON 前後加入任何文字。</FINAL_OUTPUT_RULES>",
  ].join("\n");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function filterAllowedValues<T extends string>(
  values: unknown,
  allowedValues: readonly T[],
  maxItems: number,
): T[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const allowed = new Set<string>(allowedValues);
  const selected: T[] = [];
  for (const value of values) {
    if (typeof value !== "string" || !allowed.has(value)) {
      continue;
    }
    if (!selected.includes(value as T)) {
      selected.push(value as T);
    }
    if (selected.length >= maxItems) {
      break;
    }
  }
  return selected;
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first < 0 || last <= first) {
    return null;
  }
  return trimmed.slice(first, last + 1);
}

function parseModelPlannerHints(rawContent: string): EnmsChatModelPlannerHints | null {
  const candidate = extractJsonObject(rawContent);
  if (!candidate) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (!isPlainRecord(parsed)) {
    return null;
  }

  const routeKeys = new Set(
    getEnmsChatSemanticRoutes().map((route) => route.key),
  );
  const selectedCapabilities = filterAllowedValues(
    parsed.selectedCapabilities,
    Array.from(routeKeys) as EnmsChatSemanticRouteKey[],
    6,
  );
  const selectedPageKeys = filterAllowedValues(
    parsed.selectedPageKeys,
    ENMS_PAGE_KEY_VALUES,
    4,
  );
  const answerObligationKeys = filterAllowedValues(
    parsed.answerObligationKeys,
    ENMS_CHAT_ANSWER_OBLIGATION_VALUES,
    6,
  );
  const semanticGoals = filterAllowedValues(
    parsed.semanticGoals,
    ENMS_CHAT_SEMANTIC_GOAL_VALUES,
    8,
  );
  const requiredFactGroups = filterAllowedValues(
    parsed.requiredFactGroups,
    ENMS_CHAT_FACT_GROUP_VALUES,
    10,
  );
  const answerQualityRules = filterAllowedValues(
    parsed.answerQualityRules,
    ENMS_CHAT_ANSWER_QUALITY_RULE_VALUES,
    8,
  );
  const confidence =
    parsed.confidence === "high" ||
    parsed.confidence === "medium" ||
    parsed.confidence === "low"
      ? parsed.confidence
      : "low";
  const allowDbFacts = parsed.allowDbFacts === true;
  const allowGeneralAI = parsed.allowGeneralAI === true;
  const needClarification = parsed.needClarification === true;
  const reason = trimText(parsed.reason, 160);

  if (!allowDbFacts && !allowGeneralAI) {
    return null;
  }
  const hasSemanticSelection =
    selectedCapabilities.length > 0 ||
    answerObligationKeys.length > 0 ||
    semanticGoals.length > 0 ||
    requiredFactGroups.length > 0;
  if (allowDbFacts && !hasSemanticSelection) {
    return null;
  }

  return {
    selectedCapabilities,
    selectedPageKeys,
    answerObligationKeys,
    semanticGoals,
    requiredFactGroups,
    answerQualityRules,
    allowDbFacts,
    allowGeneralAI: allowDbFacts ? false : allowGeneralAI,
    needClarification,
    chartRequested: parsed.chartRequested === true,
    confidence,
    reason,
  };
}

async function runModelSemanticPlanner(
  message: string,
): Promise<EnmsChatModelPlannerHints | null> {
  if (!isModelSemanticPlannerEnabled()) {
    return null;
  }

  const config = getModelPlannerConfig();
  if (!config) {
    return null;
  }

  const timeoutController = new AbortController();
  const timeout = setTimeout(
    () => timeoutController.abort(),
    config.timeoutMs,
  );

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "user",
            content: buildModelSemanticPlannerPrompt(message),
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: config.maxTokens,
        stream: false,
      }),
      redirect: "error",
      signal: timeoutController.signal,
    });
    if (!response.ok) {
      return null;
    }

    const rawResponse = await response.text();
    if (
      !rawResponse ||
      Buffer.byteLength(rawResponse, "utf8") >
        MAX_MODEL_PLANNER_RESPONSE_BYTES
    ) {
      return null;
    }

    let envelope: unknown;
    try {
      envelope = JSON.parse(rawResponse);
    } catch {
      return null;
    }
    const content =
      isPlainRecord(envelope) &&
      Array.isArray(envelope.choices) &&
      isPlainRecord(envelope.choices[0]) &&
      isPlainRecord(envelope.choices[0].message) &&
      typeof envelope.choices[0].message.content === "string"
        ? envelope.choices[0].message.content
        : "";
    return content ? parseModelPlannerHints(content) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({
    ok: true,
    adapter: "enms-ai-assistant-chat-planner",
    contract: {
      contractVersion: ENMS_CHAT_PLAN_CONTRACT_VERSION,
      registryVersion: ENMS_CAPABILITY_REGISTRY_VERSION,
      request: ["message", "conversationId", "history"],
      response: [
        "strategy",
        "intent",
        "selectedCapabilities",
        "allowDbFacts",
        "allowGeneralAI",
        "needClarification",
        "primaryPageKey",
        "selectedPageKeys",
        "matchedRoutes",
        "answerObligations",
        "semanticGraph",
      ],
      optionalResponse: [
        "semanticGraph",
      ],
      metadataOnly: [
        "semanticGraph",
      ],
      semanticGraphFields: [
        "version",
        "mode",
        "applied",
        "coverage",
        "missingContractKeys",
        "skippedContractKeys",
        "requiredFactPaths",
        "chartTypes",
        "knowledgeRefs",
      ],
    },
    security: {
      apiKeyPolicy: "required",
      dataPolicy:
        "planner only; does not query EnMS DB, DuckDB, semantic views, or external tools",
      semanticGraphPolicy:
        "optional planner metadata only; never a data source and never a replacement for scoped facts",
    },
  });
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: EnmsChatPlanRequest;
  try {
    body = (await req.json()) as EnmsChatPlanRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = trimText(body.message, MAX_MESSAGE_LENGTH);
  if (!message) {
    return Response.json({ error: "Missing 'message' field" }, { status: 400 });
  }

  const history = normalizeHistory(body.history);
  const plannerMessage = buildPlannerMessage(message, history);
  const modelHints = await runModelSemanticPlanner(plannerMessage);
  return Response.json(buildEnmsChatQueryPlan(plannerMessage, modelHints ?? undefined));
}
