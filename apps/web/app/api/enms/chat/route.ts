import {
  buildEnmsContext,
  type EnmsPlannerPreflight,
} from "@/lib/enms-context-builder";
import {
  buildEnmsContextPack,
  type EnmsContextPack,
} from "@/lib/enms-context-pack";
import {
  ENMS_CHAT_CONTRACT_VERSION,
  ENMS_CHAT_PLAN_CONTRACT_VERSION,
  ENMS_FACTS_SCHEMA_VERSION,
  ENMS_INTEGRATION_CONTRACT_VERSION,
  buildEnmsScopedBundleContextMessage,
  hasEnmsChatSemanticRouteForPage,
  getEnmsPageDefinition,
  isEnmsLatestDataQuestion,
  isEnmsPageKey,
  loadEnmsKnowledgeBundle,
  loadEnmsPromptDocuments,
  type EnmsPageKey,
  type EnmsKnowledgeBundle,
} from "@/lib/enms-capability-registry";
import {
  filterEnmsStructuredNarrative,
  isEnmsStructuredAgentEnabled,
  runEnmsGeneralChatAgent,
  runEnmsStructuredAgent,
} from "@/lib/enms-structured-agent";
import { getEnmsS2sApiKey } from "@/lib/enms-s2s-auth";
import { buildEnmsDirectAnswer } from "@/lib/enms-direct-answer";
import {
  buildEnmsScopedAnswer,
  type EnmsScopedAnswerBlock,
  type EnmsScopedAnswerResult,
} from "@/lib/enms-scoped-answer";
import { buildEnmsVerifiedDirectQueryAnswer } from "@/lib/enms-verified-direct-query";
import {
  buildDomainBootstrapSnapshot,
  type DomainBootstrapSnapshot,
} from "@/lib/domain-bootstrap";
import {
  buildDomainReadOnlyExecutionPlan,
  buildReadOnlyExecutionBlockedReply,
} from "@/lib/domain-read-only-pipeline";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 8;
const MAX_HISTORY_CONTENT_LENGTH = 1000;
const MAX_BLOCKS = 12;
const MAX_BLOCK_TEXT_LENGTH = 1200;
const DEFAULT_MAX_CHART_BLOCKS = 2;
const EXPLICIT_MAX_CHART_BLOCKS = 4;

type EnmsBridgeHistoryItem = {
  role?: string;
  content?: string;
};

type EnmsBridgeScope = {
  userId?: string | null;
  companyNo?: string | null;
  currentSiteId?: string | null;
  isAdmin?: boolean;
  allSites?: boolean;
  siteFilterRequired?: boolean;
  siteIds?: string[];
  macFilterRequired?: boolean;
  macAddresses?: string[];
  powerAccountFilterRequired?: boolean;
  powerAccountIds?: Array<number | string>;
};

type EnmsBridgeGuardrails = {
  mode?: string;
  factsAlreadyScopedByEnms?: boolean;
  noSqlFromClient?: boolean;
  noHtml?: boolean;
  semanticViewsOnly?: boolean;
  allowedViewPrefix?: string;
  requireEvidence?: boolean;
};

type EnmsScopedContext = {
  contractVersion?: string;
  factsSchemaVersion?: string;
  pageKey?: string;
  status?: string;
  updatedAt?: string;
  facts?: Record<string, unknown>;
  analysis?: {
    intent?: string;
    summary?: string;
    findings?: string[];
    recommendations?: string[];
  };
  cards?: Array<{
    key?: string;
    label?: string;
    value?: string;
    unit?: string | null;
    note?: string | null;
  }>;
  chartSeries?: Array<{
    key?: string;
    label?: string;
    points?: Array<{
      label?: string;
      value?: number | null;
      timestamp?: string | null;
    }>;
  }>;
  evidence?: {
    dataSources?: string[];
    timeRange?: string | null;
    queryScope?: string;
    confidence?: string;
    generatedAt?: string;
  };
  missingData?: Array<{
    key?: string;
    message?: string;
  }>;
  sourceMode?: string;
};

type EnmsScopedFactsBundle = {
  contractVersion?: string;
  factsSchemaVersion?: string;
  primaryPageKey?: string;
  contexts?: EnmsScopedContext[];
};

type EnmsChatPlan = {
  contractVersion?: string;
  registryVersion?: string;
  strategy?: string;
  intent?: string;
  confidence?: string;
  allowDbFacts?: boolean;
  allowGeneralAI?: boolean;
  primaryPageKey?: string;
  selectedPageKeys?: string[];
  maxContexts?: number;
  sourceOfTruth?: string;
  answerObligations?: EnmsChatAnswerObligation[];
};

type EnmsChatAnswerObligation = {
  key?: string;
  label?: string;
  pageKey?: string;
  capability?: string;
  answerKind?: string;
  requiredFactPaths?: string[];
  chartRequired?: boolean;
  chartType?: "bar" | "line" | "ranking" | "metric";
  unit?: string;
  reason?: string;
};

type EnmsBridgeRequest = {
  message?: string;
  conversationId?: string | null;
  pageKey?: string | null;
  history?: EnmsBridgeHistoryItem[];
  scope?: EnmsBridgeScope | null;
  scopedContext?: EnmsScopedContext | null;
  scopedFactsBundle?: EnmsScopedFactsBundle | null;
  chatPlan?: EnmsChatPlan | null;
  guardrails?: EnmsBridgeGuardrails | null;
};

type AIAssistantBlock = {
  type:
    | "paragraph"
    | "warning"
    | "citation"
    | "metric"
    | "actionLink"
    | "miniBars"
    | "chart";
  text?: string;
  label?: string;
  value?: string;
  tone?: string;
  route?: string;
  chartType?: "bar" | "line" | "ranking" | "metric";
  unit?: string;
  series?: Array<{
    key: string;
    label: string;
    type: "bar" | "line" | "ranking" | "metric";
    points: Array<{
      label: string;
      value: number;
      timestamp?: string | null;
      tone?: string;
    }>;
  }>;
  items?: Array<{
    name: string;
    value: string;
    width: number;
    tone: string;
  }>;
};

const ALLOWED_ASSISTANT_CHART_TYPES = new Set([
  "bar",
  "line",
  "ranking",
  "metric",
]);

type EnmsAnswerSource =
  | "verified_query"
  | "scoped_facts"
  | "context_snapshot"
  | "runtime"
  | "blocked"
  | "no_match"
  | "general_ai";

function getExpectedApiKey(): string {
  return getEnmsS2sApiKey();
}

function isAuthorized(req: Request): boolean {
  const expected = getExpectedApiKey();
  if (!expected) {
    return false;
  }

  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const actual = match?.[1] ?? "";
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function isPreciseLatestDataAnswer(answer: EnmsScopedAnswerResult): boolean {
  return (
    answer.answerKind === "time_range" &&
    answer.matchedFactPaths.some((path) =>
      path.toLowerCase().includes("latestdataat"),
    )
  );
}

function shouldAppendStructuredAnalysis(answer: EnmsScopedAnswerResult): boolean {
  return !(
    isPreciseLatestDataAnswer(answer) ||
    answer.answerKind === "billing" ||
    answer.answerKind === "device_lookup" ||
    answer.answerKind === "missing" ||
    answer.answerKind === "ranking" ||
    answer.answerKind === "site_metadata"
  );
}

function trimText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }

  const text = value.trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function sanitizePlainText(value: unknown, maxLength: number): string {
  return trimText(
    typeof value === "string" ? value.replace(/<[^>]*>/g, "") : value,
    maxLength,
  );
}

function sanitizeStringList(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => sanitizePlainText(item, MAX_BLOCK_TEXT_LENGTH))
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeHistory(history: unknown): EnmsBridgeHistoryItem[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((item): item is EnmsBridgeHistoryItem => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const candidate = item as EnmsBridgeHistoryItem;
      return Boolean(candidate.role && candidate.content);
    })
    .slice(-MAX_HISTORY_ITEMS)
    .map((item) => ({
      role: trimText(item.role, 40),
      content: trimText(item.content, MAX_HISTORY_CONTENT_LENGTH),
    }));
}

function shouldBlockRestrictedScope(scope?: EnmsBridgeScope | null): boolean {
  if (!scope) {
    return false;
  }

  // Current EnClaw direct-query helpers do not yet push EnMS site/mac/account
  // filters into every SQL path. Block restricted scopes until scoped SQL is
  // implemented, so a user never receives data outside EnMS' authorization.
  return Boolean(
    scope.siteFilterRequired ||
    scope.macFilterRequired ||
    scope.powerAccountFilterRequired,
  );
}

function isTrustedScopedContext(
  context: EnmsScopedContext | null | undefined,
  guardrails: EnmsBridgeGuardrails | null | undefined,
  expectedPageKey?: string | null,
): context is EnmsScopedContext {
  return Boolean(
    context &&
    typeof context === "object" &&
    context.contractVersion === ENMS_INTEGRATION_CONTRACT_VERSION &&
    context.factsSchemaVersion === ENMS_FACTS_SCHEMA_VERSION &&
    isEnmsPageKey(context.pageKey) &&
    (!expectedPageKey || expectedPageKey === context.pageKey) &&
    ["ready", "empty", "blocked", "error"].includes(context.status ?? "") &&
    guardrails?.mode === "readonly" &&
    guardrails?.factsAlreadyScopedByEnms === true &&
    guardrails.noSqlFromClient === true &&
    guardrails.noHtml === true &&
    guardrails.semanticViewsOnly === true &&
    guardrails.allowedViewPrefix === "ai_" &&
    guardrails.requireEvidence === true &&
    Boolean(sanitizePlainText(context.evidence?.queryScope, 1000)),
  );
}

function hasTrustedScopedContext(body: EnmsBridgeRequest): boolean {
  const context = body.scopedContext;
  const guardrails = body.guardrails;

  return isTrustedScopedContext(context, guardrails, body.pageKey);
}

function getTrustedScopedFactsBundle(
  body: EnmsBridgeRequest,
): EnmsScopedFactsBundle | null {
  const bundle = body.scopedFactsBundle;
  if (
    !bundle ||
    bundle.contractVersion !== ENMS_INTEGRATION_CONTRACT_VERSION ||
    bundle.factsSchemaVersion !== ENMS_FACTS_SCHEMA_VERSION ||
    !isEnmsPageKey(bundle.primaryPageKey) ||
    !Array.isArray(bundle.contexts) ||
    bundle.contexts.length === 0 ||
    bundle.contexts.length > 4
  ) {
    return null;
  }

  const contexts = bundle.contexts.filter((context) =>
    isTrustedScopedContext(context, body.guardrails),
  );
  if (contexts.length === 0) {
    return null;
  }

  const primaryPageKey = contexts.some(
    (context) => context.pageKey === bundle.primaryPageKey,
  )
    ? bundle.primaryPageKey
    : contexts[0]?.pageKey;
  if (!isEnmsPageKey(primaryPageKey)) {
    return null;
  }

  return {
    contractVersion: ENMS_INTEGRATION_CONTRACT_VERSION,
    factsSchemaVersion: ENMS_FACTS_SCHEMA_VERSION,
    primaryPageKey,
    contexts,
  };
}

function isGeneralAiChatPlan(plan?: EnmsChatPlan | null): boolean {
  return (
    plan?.contractVersion === ENMS_CHAT_PLAN_CONTRACT_VERSION &&
    plan?.strategy === "general_ai" &&
    plan.allowDbFacts === false &&
    plan.allowGeneralAI === true
  );
}

function isPlannerIntent(value: string): value is EnmsPlannerPreflight["intent"] {
  return [
    "demand_forecast",
    "anomaly_detection",
    "natural_language_query",
    "site_benchmarking",
    "alert_governance",
    "efficiency_analysis",
    "raw_trace",
    "unknown",
  ].includes(value);
}

function isPlannerConfidence(
  value: string,
): value is EnmsPlannerPreflight["confidence"] {
  return ["low", "medium", "high"].includes(value);
}

function buildChatPlanAwarePreflight(
  plan: EnmsChatPlan | null | undefined,
  fallback: EnmsPlannerPreflight,
): EnmsPlannerPreflight {
  if (plan?.contractVersion !== ENMS_CHAT_PLAN_CONTRACT_VERSION) {
    return fallback;
  }

  const plannedIntent = sanitizePlainText(plan.intent, 80);
  const plannedConfidence = sanitizePlainText(plan.confidence, 40);
  return {
    ...fallback,
    intent: isPlannerIntent(plannedIntent) ? plannedIntent : fallback.intent,
    confidence: isPlannerConfidence(plannedConfidence)
      ? plannedConfidence
      : fallback.confidence,
    shouldRouteToEnms: plan.strategy !== "general_ai" && plan.allowDbFacts !== false,
    matchedKeywords: [
      ...fallback.matchedKeywords,
      ...(plan.selectedPageKeys ?? []).map((key) => `capability:${key}`),
    ].slice(0, 12),
  };
}

function getChatPlanIntentOverride(
  plan: EnmsChatPlan | null | undefined,
): string | undefined {
  if (plan?.contractVersion !== ENMS_CHAT_PLAN_CONTRACT_VERSION) {
    return undefined;
  }

  return sanitizePlainText(plan.intent, 80) || undefined;
}

function summarizeScope(scope?: EnmsBridgeScope | null): string {
  if (!scope) {
    return "EnMS scope not provided";
  }

  const parts = [
    `user=${scope.userId ?? "unknown"}`,
    `company=${scope.companyNo ?? "unknown"}`,
    `site=${scope.currentSiteId ?? "all"}`,
    `allSites=${scope.allSites ? "true" : "false"}`,
    `siteCount=${scope.siteIds?.length ?? 0}`,
    `powerAccountCount=${scope.powerAccountIds?.length ?? 0}`,
    `macCount=${scope.macAddresses?.length ?? 0}`,
  ];
  return parts.join(" / ");
}

function buildConversationContext(history: EnmsBridgeHistoryItem[]): string {
  if (history.length === 0) {
    return "";
  }

  return history
    .map(
      (item) =>
        `${item.role === "assistant" ? "assistant" : "user"}: ${item.content}`,
    )
    .join("\n");
}

function buildEffectiveMessage(
  message: string,
  history: EnmsBridgeHistoryItem[],
): string {
  const conversationContext = buildConversationContext(history);
  if (!conversationContext) {
    return message;
  }

  return [
    "[Conversation Context]",
    conversationContext,
    "[/Conversation Context]",
    message,
  ].join("\n");
}

function isScopedPresentationRequest(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (
    /什麼是|是什麼|何謂|定義|概念|what is|definition|meaning/i.test(
      normalized,
    )
  ) {
    return false;
  }

  return /圖表|圖形|畫成圖|用圖|長條圖|折線圖|排行榜|排名圖|表格|整理成表|chart|graph|visual/i
    .test(normalized);
}

function chatPlanSelectsPage(
  plan: EnmsChatPlan | null | undefined,
  pageKey: string | undefined,
): boolean {
  if (
    plan?.contractVersion !== ENMS_CHAT_PLAN_CONTRACT_VERSION ||
    !isEnmsPageKey(pageKey)
  ) {
    return false;
  }

  return (
    plan.primaryPageKey === pageKey ||
    (Array.isArray(plan.selectedPageKeys) &&
      plan.selectedPageKeys.includes(pageKey))
  );
}

function getSafeAnswerObligations(
  plan: EnmsChatPlan | null | undefined,
): EnmsChatAnswerObligation[] {
  if (
    plan?.contractVersion !== ENMS_CHAT_PLAN_CONTRACT_VERSION ||
    !Array.isArray(plan.answerObligations)
  ) {
    return [];
  }

  return plan.answerObligations
    .filter((obligation) => obligation && typeof obligation === "object")
    .filter((obligation) =>
      !obligation.pageKey || isEnmsPageKey(obligation.pageKey),
    )
    .slice(0, EXPLICIT_MAX_CHART_BLOCKS);
}

function isExplicitMultiChartRequest(
  message: string,
  obligations: EnmsChatAnswerObligation[],
): boolean {
  return obligations.filter((obligation) => obligation.chartRequired).length > 2 ||
    /每一個都用圖|每個都用圖|每一項.*圖|全部.*圖表|都用圖表|每個.*圖表/i.test(
      message,
    );
}

function getMaxChartBlocks(
  message: string,
  plan: EnmsChatPlan | null | undefined,
): number {
  const obligations = getSafeAnswerObligations(plan);
  return isExplicitMultiChartRequest(message, obligations)
    ? EXPLICIT_MAX_CHART_BLOCKS
    : DEFAULT_MAX_CHART_BLOCKS;
}

function getObligationsForPage(
  plan: EnmsChatPlan | null | undefined,
  pageKey: string | undefined,
): EnmsChatAnswerObligation[] {
  if (!isEnmsPageKey(pageKey)) {
    return [];
  }

  return getSafeAnswerObligations(plan).filter(
    (obligation) => obligation.pageKey === pageKey,
  );
}

function buildScopedFactsQuestion(
  body: EnmsBridgeRequest,
  message: string,
  pageKey: string | undefined,
): string {
  const baseQuestion = hasEnmsChatSemanticRouteForPage(message, pageKey)
    ? buildEnmsScopedBundleContextMessage(message, pageKey)
    : message;

  const obligations = getObligationsForPage(body.chatPlan, pageKey);
  if (obligations.length > 0) {
    const labels = obligations
      .map((obligation) => sanitizePlainText(obligation.label, 80))
      .filter(Boolean)
      .join("、");
    return `${baseQuestion}\n請針對此頁 scoped facts 回答：${labels}。${
      obligations.some((obligation) => obligation.chartRequired)
        ? "若 facts 足夠，請輸出對應圖表。"
        : ""
    }`;
  }

  if (isScopedPresentationRequest(message) && chatPlanSelectsPage(body.chatPlan, pageKey)) {
    const definition = getEnmsPageDefinition(pageKey as EnmsPageKey);
    return `${definition.prompt} 請用圖表呈現`;
  }

  return message;
}

function classifyBlockTone(text: string): "warning" | "paragraph" {
  return /錯誤|失敗|無法|尚未|缺少|不能|不會|未就緒|未啟用|拒絕|越權/.test(text)
    ? "warning"
    : "paragraph";
}

function textToBlocks(text: string): AIAssistantBlock[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, MAX_BLOCKS);

  if (paragraphs.length === 0) {
    return [
      {
        type: "warning",
        text: "EnClaw 已接到請求，但沒有產生可顯示的回答內容。",
      },
    ];
  }

  return paragraphs.map((paragraph) => ({
    type: classifyBlockTone(paragraph),
    text: trimText(paragraph, MAX_BLOCK_TEXT_LENGTH),
  }));
}

function scopedAnswerBlocksToAssistantBlocks(
  blocks: EnmsScopedAnswerBlock[] | undefined,
  maxBlocks = DEFAULT_MAX_CHART_BLOCKS,
): AIAssistantBlock[] {
  return (blocks ?? [])
    .filter((block) => block.type === "chart")
    .slice(0, Math.max(0, maxBlocks))
    .map((block) => ({
      type: "chart" as const,
      label: sanitizePlainText(block.label, 120),
      chartType: sanitizeAssistantChartType(block.chartType),
      unit: sanitizePlainText(block.unit, 40),
      series: block.series
        .slice(0, 4)
        .map((series) => ({
          key: sanitizePlainText(series.key, 80),
          label: sanitizePlainText(series.label, 120),
          type: sanitizeAssistantChartType(series.type),
          points: series.points
            .filter((point) => Number.isFinite(point.value))
            .slice(0, 12)
            .map((point) => ({
              label: sanitizePlainText(point.label, 120),
              value: point.value,
              timestamp: point.timestamp ?? null,
              tone: sanitizePlainText(point.tone, 40),
            }))
            .filter((point) => point.label),
        }))
        .filter((series) => series.key && series.points.length > 0),
    }))
    .filter((block) => block.series && block.series.length > 0);
}

function sanitizeAssistantChartType(
  chartType: unknown,
): "bar" | "line" | "ranking" | "metric" {
  return typeof chartType === "string" &&
    ALLOWED_ASSISTANT_CHART_TYPES.has(chartType)
    ? (chartType as "bar" | "line" | "ranking" | "metric")
    : "bar";
}

function buildCitationBlock(
  _preflight: EnmsPlannerPreflight,
  _snapshot: DomainBootstrapSnapshot | null,
  answerSource: EnmsAnswerSource,
  _intent?: string,
): AIAssistantBlock {
  const sourceLabel: Record<EnmsAnswerSource, string> = {
    verified_query: "來源：EnMS 已驗證查詢結果。",
    scoped_facts: "來源：EnMS 授權資料，由 EnClaw 分析；已套用口徑驗證。",
    context_snapshot: "來源：EnMS 資料快照。",
    runtime: "來源：EnClaw 分析流程。",
    blocked: "來源：EnClaw 安全邊界；本次未執行資料查詢。",
    no_match:
      "來源：EnClaw 問題判斷；目前未命中可安全查詢的 EnMS 資料。",
    general_ai:
      "來源：一般 AI 模型；本次未使用 EnMS 授權資料。",
  };

  const source = sourceLabel[answerSource] ?? sourceLabel.runtime;

  return {
    type: "citation",
    text: source,
  };
}

function buildAnswer(params: {
  conversationId?: string | null;
  preflight: EnmsPlannerPreflight;
  text: string;
  scope?: EnmsBridgeScope | null;
  snapshot?: DomainBootstrapSnapshot | null;
  scopedContext?: EnmsScopedContext | null;
  scopedFactsBundle?: EnmsScopedFactsBundle | null;
  contextPack?: EnmsContextPack | null;
  knowledgeBundle?: EnmsKnowledgeBundle | null;
  scopedAnswer?: EnmsScopedAnswerResult | null;
  fallback?: boolean;
  answerSource?: EnmsAnswerSource;
  structuredModelAttempted?: boolean;
  structuredModelApplied?: boolean;
  intentOverride?: string;
  answerContractItems?: Array<{
    pageKey?: string;
    answerKind: EnmsScopedAnswerResult["answerKind"];
    matchedFactPaths: string[];
  }>;
  extraBlocks?: AIAssistantBlock[];
}): Response {
  const safeAnswerText = sanitizePlainText(
    params.text,
    MAX_BLOCK_TEXT_LENGTH * MAX_BLOCKS,
  );
  const extraBlocks = (params.extraBlocks ?? []).slice(0, MAX_BLOCKS - 1);
  const textBlockLimit = Math.max(1, MAX_BLOCKS - extraBlocks.length);
  const blocks = [
    ...textToBlocks(safeAnswerText).slice(0, textBlockLimit),
    ...extraBlocks,
  ];
  const answerSource = params.answerSource ?? "runtime";
  const bundleContexts = params.scopedFactsBundle?.contexts ?? [];
  const evidenceContexts = bundleContexts.length > 0
    ? bundleContexts
    : params.scopedContext
      ? [params.scopedContext]
      : [];
  const bundlePageKeys = bundleContexts
    .map((context) => sanitizePlainText(context.pageKey, 40))
    .filter(Boolean);
  const timeRange = evidenceContexts
    .map((context) => sanitizePlainText(context.evidence?.timeRange, 160))
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 4)
    .join(" | ");
  const queryScope = evidenceContexts
    .map((context) => sanitizePlainText(context.evidence?.queryScope, 240))
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 4)
    .join(" | ");
  const confidence =
    evidenceContexts
      .map((context) => sanitizePlainText(context.evidence?.confidence, 40))
      .find(Boolean) || "";
  blocks.push(
    buildCitationBlock(
      params.preflight,
      params.snapshot ?? null,
      answerSource,
      params.intentOverride ?? params.preflight.intent,
    ),
  );

  return Response.json({
    contractVersion: ENMS_CHAT_CONTRACT_VERSION,
    factsSchemaVersion: ENMS_FACTS_SCHEMA_VERSION,
    conversationId:
      params.conversationId ||
      `enms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    sourceMode: "enclaw",
    intent: params.intentOverride ?? params.preflight.intent,
    isFallback: params.fallback ?? false,
    blocks,
    citations: [
      {
        label:
          answerSource === "scoped_facts"
            ? "EnMS 授權資料 + 能管語意口徑驗證"
            : answerSource === "general_ai"
              ? "一般 AI"
            : "EnClaw 能管分析流程",
        source: answerSource,
        timeRange:
          timeRange ||
          "依使用者問題與 EnMS 授權範圍判定",
      },
    ],
    evidence: {
      dataSources: [
        answerSource === "general_ai"
          ? "一般 AI 模型（未讀取 EnMS 授權資料）"
          : "EnClaw 能管語意分析",
        ...evidenceContexts.flatMap((context) =>
          sanitizeStringList(context.evidence?.dataSources),
        ),
        ...(params.knowledgeBundle?.documents ?? [])
          .filter((document) => document.path.startsWith("wiki/"))
          .map((document) => `${document.path}#${document.sha256.slice(0, 12)}`)
          .slice(0, 5),
        ...(answerSource === "verified_query" ||
        answerSource === "context_snapshot"
          ? ["EnMS PostgreSQL/TimescaleDB"]
          : []),
        ...(answerSource === "scoped_facts" ? ["EnMS API 授權資料"] : []),
        ...(params.snapshot?.facts.length ? ["Domain bootstrap snapshot"] : []),
      ]
        .filter((value, index, all) => all.indexOf(value) === index)
        .slice(0, 8),
      timeRange: answerSource === "general_ai"
        ? "不使用 EnMS 資料"
        : timeRange || "依問題語意與資料可用性判定",
      queryScope: answerSource === "general_ai"
        ? "一般 AI 回覆；未讀取 EnMS 授權資料"
        : queryScope || summarizeScope(params.scope),
      confidence:
        confidence ||
        (params.snapshot?.availability === "blocked"
          ? "blocked"
          : params.preflight.confidence),
      generatedAt: new Date().toISOString(),
    },
    answerContract: params.scopedAnswer
      ? {
          answerKind: params.scopedAnswer.answerKind,
          matchedFactPaths: params.scopedAnswer.matchedFactPaths,
          items:
            params.answerContractItems?.map((item) => ({
              pageKey: sanitizePlainText(item.pageKey, 40),
              answerKind: item.answerKind,
              matchedFactPaths: item.matchedFactPaths
                .map((path) => sanitizePlainText(path, 160))
                .filter(Boolean)
                .slice(0, 12),
            })) ?? [],
          pageInsightContractVersion: params.knowledgeBundle?.contractVersion,
          factsSchemaVersion: ENMS_FACTS_SCHEMA_VERSION,
          registryVersion: params.knowledgeBundle?.registryVersion,
          structuredJsonOnly: true,
          htmlAllowed: false,
          reviewDraftCreated: false,
          wikiWritebackPerformed: false,
          structuredModelAttempted: params.structuredModelAttempted ?? false,
          structuredModelApplied: params.structuredModelApplied ?? false,
          chatFactsBundle:
            bundlePageKeys.length > 0
              ? {
                  primaryPageKey: params.scopedFactsBundle?.primaryPageKey,
                  pageKeys: bundlePageKeys,
                }
              : undefined,
        }
      : undefined,
  });
}

function buildScopeBlockedAnswer(
  body: EnmsBridgeRequest,
  preflight: EnmsPlannerPreflight,
): Response {
  return buildAnswer({
    conversationId: body.conversationId,
    preflight,
    scope: body.scope,
    fallback: false,
    answerSource: "blocked",
    text: [
      "我已接到 EnMS AI 助手的請求，但這次使用者是受限場域 / 電號 / MAC 範圍。",
      "目前 EnClaw 既有 EnMS direct-query helper 尚未把 EnMS 傳入的 scope 全面下推到每一條 SQL。為避免越權讀取，我先停止本次資料查詢，不會用全域資料或模型推測答案。",
      "下一步需要補 scoped SQL filter，或改由 EnMS API 提供已授權的 ai_* semantic views 後再讓 EnClaw 查詢。",
    ].join("\n\n"),
  });
}

async function buildGeneralNoMatchAnswer(
  body: EnmsBridgeRequest,
  preflight: EnmsPlannerPreflight,
  message: string,
  signal: AbortSignal,
): Promise<Response> {
  let text = [
    "這題不是 EnMS 能管資料問題，因此我沒有使用 EnMS 授權資料、DB 或任何電表資料。",
    "目前一般 AI 模型暫時不可用；為避免編造答案，請稍後再試，或改問能管相關問題。",
  ].join("\n\n");
  let structuredModelAttempted = false;
  let structuredModelApplied = false;
  let fallback = true;

  if (isEnmsStructuredAgentEnabled()) {
    structuredModelAttempted = true;
    try {
      const generalAnswer = await runEnmsGeneralChatAgent({
        task: message,
        signal,
      });
      text = generalAnswer.text;
      structuredModelApplied = true;
      fallback = false;
    } catch (error) {
      console.warn("[enms-chat] General AI fallback unavailable", {
        reason:
          error instanceof Error
            ? error.message
            : "unknown general AI error",
      });
    }
  }

  return buildAnswer({
    conversationId: body.conversationId,
    preflight,
    scope: body.scope,
    fallback,
    answerSource: "general_ai",
    structuredModelAttempted,
    structuredModelApplied,
    intentOverride: "general_question",
    text,
  });
}

function buildBundleAnswerText(
  candidates: Array<{
    context: EnmsScopedContext;
    scopedAnswer: EnmsScopedAnswerResult;
  }>,
): string {
  if (candidates.length === 1) {
    return candidates[0]?.scopedAnswer.text ?? "";
  }

  return [
    "我依照 EnMS 已授權資料，分成以下面向回答：",
    ...candidates.map(({ context, scopedAnswer }) => {
      const pageName = isEnmsPageKey(context.pageKey)
        ? getEnmsPageDefinition(context.pageKey).name
        : "EnMS 資料";
      const compactText = scopedAnswer.text.replace(/\n{2,}/g, "\n");
      return `【${pageName}】\n${compactText}`;
    }),
  ].join("\n\n");
}

function selectBundleAnswerCandidates(
  body: EnmsBridgeRequest,
  message: string,
  contexts: EnmsScopedContext[],
): Array<{
  context: EnmsScopedContext;
  scopedAnswer: EnmsScopedAnswerResult;
}> {
  const selected: Array<{
    context: EnmsScopedContext;
    scopedAnswer: EnmsScopedAnswerResult;
  }> = [];
  const missingWarnings: Array<{
    context: EnmsScopedContext;
    scopedAnswer: EnmsScopedAnswerResult;
  }> = [];
  const usedKinds = new Set<string>();
  const usedTexts = new Set<string>();
  const latestDataQuestion = isEnmsLatestDataQuestion(message);

  for (const context of contexts) {
    const canUseContext =
      hasEnmsChatSemanticRouteForPage(message, context.pageKey) ||
      (isScopedPresentationRequest(message) &&
        chatPlanSelectsPage(body.chatPlan, context.pageKey));
    if (!canUseContext) {
      continue;
    }
    const scopedQuestion = buildScopedFactsQuestion(
      body,
      message,
      context.pageKey,
    );
    const scopedAnswer = buildEnmsScopedAnswer({
      message: scopedQuestion,
      context,
      scope: body.scope ?? undefined,
    });
    const textKey = scopedAnswer.text.replace(/\s+/g, " ").trim();
    if (scopedAnswer.answerKind === "missing") {
      if (!usedTexts.has(textKey) && missingWarnings.length < 2) {
        missingWarnings.push({ context, scopedAnswer });
        usedTexts.add(textKey);
      }
      continue;
    }
    if (!latestDataQuestion && scopedAnswer.answerKind === "time_range") {
      continue;
    }
    const kindKey = `${context.pageKey}:${scopedAnswer.answerKind}`;
    if (usedTexts.has(textKey) || usedKinds.has(kindKey)) {
      continue;
    }

    selected.push({ context, scopedAnswer });
    usedTexts.add(textKey);
    usedKinds.add(kindKey);
    if (selected.length >= 4) {
      break;
    }
  }

  if (selected.length === 0) {
    return missingWarnings.slice(0, 4);
  }

  return [
    ...selected,
    ...missingWarnings.slice(0, Math.max(0, 4 - selected.length)),
  ];
}

async function buildScopedFactsBundleAnswer(
  body: EnmsBridgeRequest,
  preflight: EnmsPlannerPreflight,
  message: string,
  bundle: EnmsScopedFactsBundle,
  signal: AbortSignal,
): Promise<Response> {
  const contexts = (bundle.contexts ?? []).filter((context) =>
    isTrustedScopedContext(context, body.guardrails),
  );
  const primaryContext =
    contexts.find((context) => context.pageKey === bundle.primaryPageKey) ??
    (isTrustedScopedContext(body.scopedContext, body.guardrails)
      ? body.scopedContext
      : null) ??
    contexts[0];
  if (!primaryContext || !isEnmsPageKey(primaryContext.pageKey)) {
    return buildScopeBlockedAnswer(body, preflight);
  }

  const candidates = selectBundleAnswerCandidates(body, message, contexts);
  if (
    candidates.length === 0 &&
    contexts.every(
      (context) =>
        !hasEnmsChatSemanticRouteForPage(message, context.pageKey) &&
        !(
          isScopedPresentationRequest(message) &&
          chatPlanSelectsPage(body.chatPlan, context.pageKey)
        ),
    )
  ) {
    return buildGeneralNoMatchAnswer(body, preflight, message, signal);
  }

  const definition = getEnmsPageDefinition(primaryContext.pageKey);
  const pagePreflight = buildEnmsContext({
    request: {
      user_message: definition.prompt,
      current_system_hint: "enms",
    },
  });
  const pack = buildEnmsContextPack(pagePreflight);
  let knowledgeBundle: EnmsKnowledgeBundle;
  try {
    knowledgeBundle = await loadEnmsKnowledgeBundle(primaryContext.pageKey, pack);
  } catch {
    return buildAnswer({
      conversationId: body.conversationId,
      preflight,
      scope: body.scope,
      scopedContext: primaryContext,
      scopedFactsBundle: bundle,
      contextPack: pack,
      fallback: false,
      answerSource: "blocked",
      intentOverride: getChatPlanIntentOverride(body.chatPlan),
      text: "EnClaw 的 EnMS skill/wiki/playbook knowledge contract 未完整載入；本次不會繞過規範直接回答。",
    });
  }

  const scopedAnswer =
    candidates[0]?.scopedAnswer ??
    buildEnmsScopedAnswer({
      message: buildScopedFactsQuestion(body, message, primaryContext.pageKey),
      context: primaryContext,
      scope: body.scope ?? undefined,
    });
  let text = candidates.length > 0
    ? buildBundleAnswerText(candidates)
    : scopedAnswer.text;
  let responseKnowledgeBundle = knowledgeBundle;
  let structuredModelAttempted = false;
  let structuredModelApplied = false;
  const modelCandidate = candidates.find(
    (candidate) => shouldAppendStructuredAnalysis(candidate.scopedAnswer),
  );
  const modelScopedAnswer = modelCandidate?.scopedAnswer ?? scopedAnswer;
  const modelContext = modelCandidate?.context ??
    (shouldAppendStructuredAnalysis(scopedAnswer) ? primaryContext : null);

  if (
    modelContext?.facts &&
    isEnmsPageKey(modelContext.pageKey) &&
    shouldAppendStructuredAnalysis(modelScopedAnswer) &&
    isEnmsStructuredAgentEnabled()
  ) {
    structuredModelAttempted = true;
    const modelPageKey = modelContext.pageKey;
    try {
      const modelDefinition = getEnmsPageDefinition(modelPageKey);
      if (modelPageKey !== primaryContext.pageKey) {
        const modelPreflight = buildEnmsContext({
          request: {
            user_message: modelDefinition.prompt,
            current_system_hint: "enms",
          },
        });
        const modelPack = buildEnmsContextPack(modelPreflight);
        responseKnowledgeBundle = await loadEnmsKnowledgeBundle(
          modelPageKey,
          modelPack,
        );
      }
      const promptDocuments = await loadEnmsPromptDocuments(
        modelPageKey,
        responseKnowledgeBundle,
      );
      const narrative = await runEnmsStructuredAgent({
        mode: "chat",
        pageKey: modelPageKey,
        intent: modelDefinition.intent,
        task: message,
        facts: modelContext.facts,
        deterministicSummary: text,
        documents: promptDocuments,
        signal,
      });
      const supportedFindings = filterEnmsStructuredNarrative(
        modelPageKey,
        narrative.findings,
        modelContext.missingData ?? [],
      );
      const supportedRecommendations = filterEnmsStructuredNarrative(
        modelPageKey,
        narrative.recommendations,
        modelContext.missingData ?? [],
      );
      const analysisText = [
        ...supportedFindings.map((item) => item.text),
        ...supportedRecommendations.map((item) => item.text),
      ]
        .filter(Boolean)
        .join("\n");
      if (analysisText) {
        text = `${text}\n\nEnClaw 分析\n${analysisText}`;
        structuredModelApplied = true;
      }
    } catch (error) {
      console.warn("[enms-chat] Structured model fallback", {
        pageKey: modelContext.pageKey,
        reason:
          error instanceof Error
            ? error.message
            : "unknown structured model error",
      });
      // The exact scoped-facts bundle answer remains available as safe fallback.
    }
  }

  const maxChartBlocks = getMaxChartBlocks(message, body.chatPlan);
  const scopedChartBlocks = (candidates.length > 0
    ? candidates.flatMap((candidate) =>
      scopedAnswerBlocksToAssistantBlocks(candidate.scopedAnswer.blocks, maxChartBlocks),
    )
    : scopedAnswerBlocksToAssistantBlocks(scopedAnswer.blocks, maxChartBlocks))
    .slice(0, maxChartBlocks);

  return buildAnswer({
    conversationId: body.conversationId,
    preflight,
    scope: body.scope,
    scopedContext: primaryContext,
    scopedFactsBundle: bundle,
    contextPack: pack,
    knowledgeBundle: responseKnowledgeBundle,
    scopedAnswer,
    answerContractItems: candidates.map((candidate) => ({
      pageKey: candidate.context.pageKey,
      answerKind: candidate.scopedAnswer.answerKind,
      matchedFactPaths: candidate.scopedAnswer.matchedFactPaths,
    })),
    fallback: false,
    answerSource: "scoped_facts",
    structuredModelAttempted,
    structuredModelApplied,
    intentOverride: getChatPlanIntentOverride(body.chatPlan),
    text,
    extraBlocks: scopedChartBlocks,
  });
}

async function buildScopedFactsAnswer(
  body: EnmsBridgeRequest,
  preflight: EnmsPlannerPreflight,
  message: string,
  signal: AbortSignal,
): Promise<Response> {
  const scopedContext = body.scopedContext as EnmsScopedContext;
  if (!isEnmsPageKey(scopedContext.pageKey)) {
    return buildScopeBlockedAnswer(body, preflight);
  }

  const definition = getEnmsPageDefinition(scopedContext.pageKey);
  const pagePreflight = buildEnmsContext({
    request: {
      user_message: definition.prompt,
      current_system_hint: "enms",
    },
  });
  const pack = buildEnmsContextPack(pagePreflight);
  let knowledgeBundle: EnmsKnowledgeBundle;
  try {
    knowledgeBundle = await loadEnmsKnowledgeBundle(
      scopedContext.pageKey,
      pack,
    );
  } catch {
    return buildAnswer({
      conversationId: body.conversationId,
      preflight,
      scope: body.scope,
      scopedContext,
      contextPack: pack,
      fallback: false,
      answerSource: "blocked",
      intentOverride: getChatPlanIntentOverride(body.chatPlan),
      text: "EnClaw 的 EnMS skill/wiki/playbook knowledge contract 未完整載入；本次不會繞過規範直接回答。",
    });
  }
  const scopedAnswer = buildEnmsScopedAnswer({
    message: buildScopedFactsQuestion(body, message, scopedContext.pageKey),
    context: scopedContext,
    scope: body.scope ?? undefined,
  });
  let text = scopedAnswer.text;
  let structuredModelAttempted = false;
  let structuredModelApplied = false;

  if (
    scopedContext.facts &&
    shouldAppendStructuredAnalysis(scopedAnswer) &&
    isEnmsStructuredAgentEnabled()
  ) {
    structuredModelAttempted = true;
    try {
      const promptDocuments = await loadEnmsPromptDocuments(
        scopedContext.pageKey,
        knowledgeBundle,
      );
      const narrative = await runEnmsStructuredAgent({
        mode: "chat",
        pageKey: scopedContext.pageKey,
        intent: definition.intent,
        task: message,
        facts: scopedContext.facts,
        deterministicSummary: scopedAnswer.text,
        documents: promptDocuments,
        signal,
      });
      const supportedFindings = filterEnmsStructuredNarrative(
        scopedContext.pageKey,
        narrative.findings,
        scopedContext.missingData ?? [],
      );
      const supportedRecommendations = filterEnmsStructuredNarrative(
        scopedContext.pageKey,
        narrative.recommendations,
        scopedContext.missingData ?? [],
      );
      const analysisText = [
        ...supportedFindings.map((item) => item.text),
        ...supportedRecommendations.map((item) => item.text),
      ]
        .filter(Boolean)
        .join("\n");
      if (analysisText) {
        text = `${scopedAnswer.text}\n\nEnClaw 分析\n${analysisText}`;
        structuredModelApplied = true;
      }
    } catch (error) {
      console.warn("[enms-chat] Structured model fallback", {
        pageKey: scopedContext.pageKey,
        reason:
          error instanceof Error
            ? error.message
            : "unknown structured model error",
      });
      // The exact scoped-facts answer remains available as safe fallback.
    }
  }

  return buildAnswer({
    conversationId: body.conversationId,
    preflight,
    scope: body.scope,
    scopedContext,
    contextPack: pack,
    knowledgeBundle,
    scopedAnswer,
    answerContractItems: [
      {
        pageKey: scopedContext.pageKey,
        answerKind: scopedAnswer.answerKind,
        matchedFactPaths: scopedAnswer.matchedFactPaths,
      },
    ],
    fallback: false,
    answerSource: "scoped_facts",
    structuredModelAttempted,
    structuredModelApplied,
    intentOverride: getChatPlanIntentOverride(body.chatPlan),
    text,
    extraBlocks: scopedAnswerBlocksToAssistantBlocks(
      scopedAnswer.blocks,
      getMaxChartBlocks(message, body.chatPlan),
    ),
  });
}

function legacyDirectQueryEnabled(): boolean {
  if (process.env.ENCLAW_ENMS_DISABLE_LEGACY_DIRECT_QUERY === "1") {
    return false;
  }
  return process.env.ENCLAW_ENMS_ALLOW_LEGACY_ENMS_TABLES === "1";
}

function buildDirectQueryPolicyNotice(
  guardrails?: EnmsBridgeGuardrails | null,
): string | null {
  if (legacyDirectQueryEnabled() && !guardrails?.semanticViewsOnly) {
    return null;
  }

  if (
    guardrails?.semanticViewsOnly &&
    process.env.ENCLAW_ENMS_ALLOW_LEGACY_ENMS_TABLES !== "1"
  ) {
    return "EnMS 要求本次查詢只能使用 ai_* semantic views，但 EnClaw 目前尚未收到可查詢的 ai_* view contract，因此已停止查詢。";
  }

  return "EnClaw 已由部署設定停用 legacy EnMS direct query；請改由 EnMS API 傳入已授權 scoped facts。";
}

export async function GET() {
  return Response.json({
    ok: true,
    adapter: "enms-ai-assistant-chat",
    contract: {
      contractVersion: ENMS_CHAT_CONTRACT_VERSION,
      acceptedPageInsightContractVersion: ENMS_INTEGRATION_CONTRACT_VERSION,
      acceptedFactsSchemaVersion: ENMS_FACTS_SCHEMA_VERSION,
      request: [
        "message",
        "conversationId",
        "history",
        "scope",
        "scopedContext",
        "guardrails",
      ],
      response: [
        "conversationId",
        "sourceMode",
        "intent",
        "blocks",
        "citations",
        "evidence",
      ],
    },
    security: {
      browserDirectAccess: "not_recommended",
      apiKeyEnv: ["ENCLAW_ENMS_API_KEY", "ENMS_AI_ASSISTANT_API_KEY"],
      apiKeyPolicy: "required",
      legacyTableFallbackEnv: "ENCLAW_ENMS_ALLOW_LEGACY_ENMS_TABLES",
      legacyDirectQueryDisableEnv: "ENCLAW_ENMS_DISABLE_LEGACY_DIRECT_QUERY",
      productionLegacyPolicy:
        "preserved_by_default; explicitly_disable_with_env",
      restrictedScopePolicy:
        "accept_enms_scoped_facts_or_block_before_direct_query",
    },
  });
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: EnmsBridgeRequest;
  try {
    body = (await req.json()) as EnmsBridgeRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = trimText(body.message, MAX_MESSAGE_LENGTH);
  if (!message) {
    return Response.json({ error: "Missing 'message' field" }, { status: 400 });
  }

  const currentMessagePreflight = buildEnmsContext({
    request: {
      user_message: message,
      current_system_hint: "enms",
    },
  });
  const preflight = buildChatPlanAwarePreflight(
    body.chatPlan,
    currentMessagePreflight,
  );
  const history = normalizeHistory(body.history);
  const effectiveMessage = buildEffectiveMessage(message, history);

  const trustedScopedFactsBundle = getTrustedScopedFactsBundle(body);
  const trustedScopedContext = hasTrustedScopedContext(body);
  if (isGeneralAiChatPlan(body.chatPlan)) {
    return buildGeneralNoMatchAnswer(body, preflight, message, req.signal);
  }

  if (
    shouldBlockRestrictedScope(body.scope) &&
    !trustedScopedContext &&
    !trustedScopedFactsBundle
  ) {
    return buildScopeBlockedAnswer(body, preflight);
  }

  if (trustedScopedFactsBundle) {
    return buildScopedFactsBundleAnswer(
      body,
      preflight,
      message,
      trustedScopedFactsBundle,
      req.signal,
    );
  }

  if (trustedScopedContext) {
    return buildScopedFactsAnswer(
      body,
      preflight,
      message,
      req.signal,
    );
  }

  const directQueryPolicyNotice = buildDirectQueryPolicyNotice(body.guardrails);
  if (directQueryPolicyNotice) {
    return buildAnswer({
      conversationId: body.conversationId,
      preflight,
      scope: body.scope,
      fallback: false,
      answerSource: "blocked",
      text: directQueryPolicyNotice,
    });
  }

  const pack = buildEnmsContextPack(preflight);
  const snapshot = await buildDomainBootstrapSnapshot({
    system: "enms",
    userMessage: effectiveMessage,
    pack,
  });
  const plan = buildDomainReadOnlyExecutionPlan({
    system: "enms",
    userMessage: effectiveMessage,
    preflight,
    pack,
    snapshot,
  });

  const blockedReply = buildReadOnlyExecutionBlockedReply(plan);
  if (blockedReply) {
    return buildAnswer({
      conversationId: body.conversationId,
      preflight,
      scope: body.scope,
      snapshot,
      fallback: false,
      answerSource: "blocked",
      text: blockedReply,
    });
  }

  let answer: string | null = null;
  let answerSource: EnmsAnswerSource = "no_match";

  if (plan.eligible) {
    answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: effectiveMessage,
    });
    if (answer) {
      answerSource = "verified_query";
    }
  }

  if (!answer) {
    answer = buildEnmsDirectAnswer({
      userMessage: effectiveMessage,
      preflight,
      snapshot,
    });
    if (answer) {
      answerSource =
        snapshot?.source === "live_db" ? "context_snapshot" : "runtime";
    }
  }

  if (!answer) {
    answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: effectiveMessage,
    });
    if (answer) {
      answerSource = "verified_query";
    }
  }

  if (!answer) {
    answer = [
      "我已判斷這是 EnMS AI 助手問題，但目前沒有命中可安全直接回答的 verified query。",
      "請把問題補上更明確的時間範圍、場域、電號或設備，例如：最近 7 天哪個電表耗電最高？",
    ].join("\n\n");
  }

  return buildAnswer({
    conversationId: body.conversationId,
    preflight,
    scope: body.scope,
    snapshot,
    fallback: false,
    answerSource,
    text: answer,
  });
}
