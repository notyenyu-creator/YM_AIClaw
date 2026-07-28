import { timingSafeEqual } from "crypto";

import { buildEnmsContext } from "@/lib/enms-context-builder";
import { buildEnmsContextPack } from "@/lib/enms-context-pack";
import { buildEnmsAlertGovernance } from "@/lib/enms-alert-governance-engine";
import { buildEnmsAnomalyDetection } from "@/lib/enms-anomaly-detection-engine";
import { buildEnmsDemandForecast } from "@/lib/enms-demand-forecast-engine";
import type {
  EnmsRawPoint,
  EnmsSummaryPoint,
} from "@/lib/enms-analytics-types";
import {
  ENMS_FACTS_SCHEMA_VERSION,
  ENMS_INTEGRATION_CONTRACT_VERSION,
  getEnmsCapabilityRegistry,
  getEnmsPageDefinition,
  getEnmsPageKeys,
  getMissingRequiredFactGroups,
  isEnmsPageKey,
  loadEnmsKnowledgeBundle,
  loadEnmsPromptDocuments,
  type EnmsKnowledgeBundle,
  type EnmsPageKey,
} from "@/lib/enms-capability-registry";
import {
  filterEnmsStructuredNarrative,
  isEnmsStructuredAgentEnabled,
  runEnmsStructuredAgent,
} from "@/lib/enms-structured-agent";
import { getEnmsS2sApiKey } from "@/lib/enms-s2s-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageAnalysis = {
  intent?: string;
  summary?: string;
  findings?: string[];
  recommendations?: string[];
};

type PageCard = {
  key?: string;
  label?: string;
  value?: string;
  unit?: string | null;
  tone?: string | null;
  note?: string | null;
};

type ChartPoint = {
  label?: string;
  value?: number | null;
  timestamp?: string | null;
  tone?: string | null;
};

type ChartSeries = {
  key?: string;
  label?: string;
  type?: string;
  points?: ChartPoint[];
};

type PageEvidence = {
  dataSources?: string[];
  timeRange?: string | null;
  queryScope?: string;
  confidence?: string;
  generatedAt?: string;
};

type MissingData = {
  key?: string;
  message?: string;
};

type PageInsightRequest = {
  contractVersion?: string;
  factsSchemaVersion?: string;
  pageKey?: string;
  facts?: Record<string, unknown>;
  analysis?: PageAnalysis;
  cards?: PageCard[];
  chartSeries?: ChartSeries[];
  evidence?: PageEvidence;
  missingData?: MissingData[];
  scopeSummary?: Record<string, unknown>;
  guardrails?: {
    mode?: string;
    factsAlreadyScopedByEnms?: boolean;
    noSqlFromClient?: boolean;
    requireEvidence?: boolean;
    noHtml?: boolean;
    semanticViewsOnly?: boolean;
    allowedViewPrefix?: string;
  };
};

type AnalyticsInputs = {
  summaryPoints: EnmsSummaryPoint[];
  rawPoints: EnmsRawPoint[];
  contractCapacityKw: number | null;
};

function getExpectedApiKey(): string {
  return getEnmsS2sApiKey();
}

function isAuthorized(req: Request): boolean {
  const expected = getExpectedApiKey();
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

function normalizePageKey(value: unknown): EnmsPageKey | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return isEnmsPageKey(normalized) ? normalized : null;
}

function sanitizeText(value: unknown, maxLength = 1200): string {
  if (typeof value !== "string") {
    return "";
  }

  const text = value.replace(/<[^>]*>/g, "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function sanitizeList(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => sanitizeText(item))
    .filter(Boolean)
    .slice(0, limit);
}

function sanitizeAnalysis(
  analysis: PageAnalysis | undefined,
  intent: string,
): Required<PageAnalysis> {
  return {
    intent,
    summary: sanitizeText(analysis?.summary),
    findings: sanitizeList(analysis?.findings),
    recommendations: sanitizeList(analysis?.recommendations),
  };
}

function sanitizeCards(cards: PageCard[] | undefined): PageCard[] {
  if (!Array.isArray(cards)) {
    return [];
  }

  return cards.slice(0, 8).map((card) => ({
    key: sanitizeText(card.key, 80),
    label: sanitizeText(card.label, 120),
    value: sanitizeText(card.value, 120),
    unit: sanitizeText(card.unit, 40) || null,
    tone: sanitizeText(card.tone, 40) || null,
    note: sanitizeText(card.note, 300) || null,
  }));
}

function sanitizeChartSeries(series: ChartSeries[] | undefined): ChartSeries[] {
  if (!Array.isArray(series)) {
    return [];
  }

  return series.slice(0, 8).map((item) => ({
    key: sanitizeText(item.key, 80),
    label: sanitizeText(item.label, 120),
    type: sanitizeText(item.type, 40) || "line",
    points: Array.isArray(item.points)
      ? item.points.slice(0, 64).map((point) => ({
          label: sanitizeText(point.label, 120),
          value:
            typeof point.value === "number" && Number.isFinite(point.value)
              ? point.value
              : null,
          timestamp:
            typeof point.timestamp === "string" ? point.timestamp : null,
          tone: sanitizeText(point.tone, 40) || null,
        }))
      : [],
  }));
}

function sanitizeMissingData(items: MissingData[] | undefined): MissingData[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.slice(0, 8).map((item) => ({
    key: sanitizeText(item.key, 80),
    message: sanitizeText(item.message, 500),
  }));
}

function lowerConfidence(
  current: string,
  model: "low" | "medium" | "high",
): "low" | "medium" | "high" {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  const normalizedCurrent =
    current === "low" || current === "high" ? current : "medium";
  return rank[normalizedCurrent] <= rank[model]
    ? normalizedCurrent
    : model;
}

function hasMissingDataKey(
  missingData: MissingData[],
  ...fragments: string[]
): boolean {
  const normalizedFragments = fragments.map((fragment) =>
    fragment.toLowerCase(),
  );
  return missingData.some((item) => {
    const key = sanitizeText(item.key, 120).toLowerCase();
    return normalizedFragments.some((fragment) => key.includes(fragment));
  });
}

function shouldAttemptStructuredNarrative(
  pageKey: EnmsPageKey,
  facts: Record<string, unknown>,
  missingData: MissingData[],
): { attempt: boolean; reason?: string } {
  if (
    pageKey === "demand" &&
    hasMissingDataKey(missingData, "contractcapacity")
  ) {
    return {
      attempt: false,
      reason:
        "skip_structured_model_missing_contract_capacity",
    };
  }

  if (
    pageKey === "bench" &&
    hasMissingDataKey(missingData, "normalization")
  ) {
    return {
      attempt: false,
      reason:
        "skip_structured_model_missing_benchmark_normalization",
    };
  }

  if (
    pageKey === "eff" &&
    hasMissingDataKey(missingData, "taipowerbill", "tariff", "rate") &&
    hasMissingDataKey(missingData, "productionvolume") &&
    !Array.isArray(facts.opportunities)
  ) {
    return {
      attempt: false,
      reason:
        "skip_structured_model_missing_efficiency_cost_and_production_context",
    };
  }

  return { attempt: true };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecordedAt(value: unknown): string | number | Date | null {
  return typeof value === "string" || typeof value === "number"
    ? value
    : null;
}

function extractAnalyticsInputs(
  facts: Record<string, unknown>,
): AnalyticsInputs {
  const input = asRecord(facts.analyticsInputs);
  const summaryPoints = Array.isArray(input.summaryPoints)
    ? input.summaryPoints
        .map((value): EnmsSummaryPoint | null => {
          const point = asRecord(value);
          const recordedAt = asRecordedAt(point.recordedAt);
          if (recordedAt === null) {
            return null;
          }
          return {
            recordedAt,
            maxDemandKw: asFiniteNumber(point.maxDemandKw),
            totalConsumptionKwh: asFiniteNumber(point.totalConsumptionKwh),
            avgPowerFactor: asFiniteNumber(point.avgPowerFactor),
            minPowerFactor: asFiniteNumber(point.minPowerFactor),
            contractCapacityKw: asFiniteNumber(point.contractCapacityKw),
          };
        })
        .filter((point): point is EnmsSummaryPoint => point !== null)
        .slice(-64)
    : [];
  const rawPoints = Array.isArray(input.rawPoints)
    ? input.rawPoints
        .map((value): EnmsRawPoint | null => {
          const point = asRecord(value);
          const recordedAt = asRecordedAt(point.recordedAt);
          if (recordedAt === null) {
            return null;
          }
          return {
            recordedAt,
            psKw: asFiniteNumber(point.psKw),
            pfs: asFiniteNumber(point.pfs),
            qsKvar: asFiniteNumber(point.qsKvar),
            va: asFiniteNumber(point.va),
            vb: asFiniteNumber(point.vb),
            vc: asFiniteNumber(point.vc),
            ia: asFiniteNumber(point.ia),
            ib: asFiniteNumber(point.ib),
            ic: asFiniteNumber(point.ic),
            connected:
              typeof point.connected === "boolean" ? point.connected : null,
            quality:
              typeof point.quality === "string" ||
              typeof point.quality === "number"
                ? point.quality
                : null,
            thdVa: asFiniteNumber(point.thdVa),
            thdVb: asFiniteNumber(point.thdVb),
            thdVc: asFiniteNumber(point.thdVc),
            thdIa: asFiniteNumber(point.thdIa),
            thdIb: asFiniteNumber(point.thdIb),
            thdIc: asFiniteNumber(point.thdIc),
          };
        })
        .filter((point): point is EnmsRawPoint => point !== null)
        .slice(-64)
    : [];

  return {
    summaryPoints,
    rawPoints,
    contractCapacityKw: asFiniteNumber(input.contractCapacityKw),
  };
}

function uniqueText(values: string[], limit = 8): string[] {
  return values
    .map((value) => sanitizeText(value))
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, limit);
}

function buildDemandEnrichment(
  analysis: Required<PageAnalysis>,
  facts: Record<string, unknown>,
  chartSeries: ChartSeries[],
): {
  analysis: Required<PageAnalysis>;
  chartSeries: ChartSeries[];
  confidence: string;
} {
  const metrics =
    facts.metrics && typeof facts.metrics === "object"
      ? (facts.metrics as Record<string, unknown>)
      : {};
  const projectedPeakDemandKw = asFiniteNumber(
    metrics.projectedPeakDemandKw,
  );
  const projectedPeakContractCapacityKw = asFiniteNumber(
    metrics.projectedPeakContractCapacityKw,
  );
  const suggestedShedKw = asFiniteNumber(metrics.suggestedShedKw);
  const contractTimeline = Array.isArray(facts.contractCapacityTimeline)
    ? facts.contractCapacityTimeline
        .map((item) => asRecord(item))
        .filter((item) => Object.keys(item).length > 0)
    : [];
  const utilizationPercent =
    projectedPeakDemandKw !== null &&
      projectedPeakContractCapacityKw !== null &&
      projectedPeakContractCapacityKw > 0
      ? (projectedPeakDemandKw / projectedPeakContractCapacityKw) * 100
      : undefined;
  const capacityValues = contractTimeline
    .map((item) => asFiniteNumber(item.contractCapacityKw))
    .filter((value): value is number => value !== null && value > 0);
  const findings = [...analysis.findings];
  const recommendations = [...analysis.recommendations];

  if (
    projectedPeakDemandKw !== null &&
    projectedPeakContractCapacityKw !== null
  ) {
    findings.push(
      `EnMS 授權趨勢推估尖峰為 ${projectedPeakDemandKw.toFixed(1)} kW，該時間點契約容量為 ${projectedPeakContractCapacityKw.toFixed(1)} kW${utilizationPercent === undefined ? "" : `，使用率約 ${utilizationPercent.toFixed(1)}%`}。`,
    );
  }

  if (new Set(capacityValues).size > 1) {
    findings.push(
      "預測期間存在契約容量異動，風險判讀已依 EnMS 各時間點的有效契約容量，而非單一固定容量。",
    );
  }

  if (suggestedShedKw !== null && suggestedShedKw > 0) {
    recommendations.unshift(
      `依 EnMS 計算，尖峰前至少預留 ${suggestedShedKw.toFixed(1)} kW 的可降載量，並先處理高負載迴路。`,
    );
  }

  return {
    analysis: {
      ...analysis,
      findings: uniqueText(findings),
      recommendations: uniqueText(recommendations),
    },
    // EnMS is the numerical authority for demand cards and chart points.
    chartSeries,
    confidence:
      projectedPeakDemandKw !== null &&
        projectedPeakContractCapacityKw !== null &&
        chartSeries.some((series) => series.key === "forecastDemand")
        ? "high"
        : "medium",
  };
}

function buildAnomalyEnrichment(
  analysis: Required<PageAnalysis>,
  facts: Record<string, unknown>,
  chartSeries: ChartSeries[],
): {
  analysis: Required<PageAnalysis>;
  chartSeries: ChartSeries[];
  confidence: string;
} {
  const inputs = extractAnalyticsInputs(facts);
  const output = buildEnmsAnomalyDetection(inputs);
  if (output.status === "insufficient_data") {
    return {
      analysis: {
        ...analysis,
        findings: uniqueText([
          ...analysis.findings,
          ...output.explanation,
        ]),
      },
      chartSeries,
      confidence: "low",
    };
  }

  const findings = output.anomalies.flatMap((anomaly) => [
    anomaly.summary,
    ...anomaly.evidence,
  ]);
  const recommendations = output.anomalies.flatMap(
    (anomaly) => anomaly.recommendedActions,
  );

  return {
    analysis: {
      ...analysis,
      summary:
        output.anomalies.length > 0
          ? `EnClaw analytics 偵測到 ${output.anomalies.length} 類異常，整體等級為 ${output.overallSeverity}。`
          : "EnClaw analytics 目前未偵測到顯著異常；此結論僅適用於本次 evidence 時間範圍。",
      findings: uniqueText([...findings, ...analysis.findings]),
      recommendations: uniqueText([
        ...recommendations,
        ...analysis.recommendations,
      ]),
    },
    chartSeries,
    confidence:
      inputs.summaryPoints.length >= 8 || inputs.rawPoints.length >= 12
        ? "high"
        : "medium",
  };
}

function buildAlertEnrichment(
  analysis: Required<PageAnalysis>,
  facts: Record<string, unknown>,
  chartSeries: ChartSeries[],
): {
  analysis: Required<PageAnalysis>;
  chartSeries: ChartSeries[];
  confidence: string;
} {
  const inputs = extractAnalyticsInputs(facts);
  const demandForecast = buildEnmsDemandForecast({
    summaryPoints: inputs.summaryPoints,
    contractCapacityKw: inputs.contractCapacityKw,
    forecastHorizonIntervals: 4,
  });
  const anomalyDetection = buildEnmsAnomalyDetection(inputs);
  const governance = buildEnmsAlertGovernance({
    demandForecast,
    anomalyDetection,
  });
  const signals = [...governance.alerts, ...governance.prewarnings];

  return {
    analysis: {
      ...analysis,
      summary:
        signals.length > 0
          ? `EnClaw Alert Governance 產生 ${governance.alerts.length} 個 alert、${governance.prewarnings.length} 個 prewarning。`
          : analysis.summary,
      findings: uniqueText([
        ...signals.map(
          (signal) =>
            `${signal.code}：${signal.summary}（owner=${signal.recommendedOwner}）`,
        ),
        ...analysis.findings,
      ]),
      recommendations: uniqueText([
        ...signals.flatMap((signal) => signal.recommendedActions),
        ...analysis.recommendations,
      ]),
    },
    chartSeries,
    confidence:
      inputs.summaryPoints.length >= 8 || inputs.rawPoints.length >= 12
        ? "high"
        : "medium",
  };
}

function buildFactsEnrichment(
  pageKey: Exclude<EnmsPageKey, "demand" | "anomaly" | "alert">,
  analysis: Required<PageAnalysis>,
  facts: Record<string, unknown>,
  chartSeries: ChartSeries[],
): {
  analysis: Required<PageAnalysis>;
  chartSeries: ChartSeries[];
  confidence: string;
} {
  const metrics = asRecord(facts.metrics);
  const findings = [...analysis.findings];
  const recommendations = [...analysis.recommendations];

  if (pageKey === "bench") {
    const ranking = Array.isArray(facts.siteRankings)
      ? facts.siteRankings.map(asRecord)
      : [];
    const values = ranking
      .map((item) => asFiniteNumber(item.value))
      .filter((value): value is number => value !== null);
    if (values.length >= 2 && Math.min(...values) > 0) {
      findings.unshift(
        `最高與最低場域總用電差距約 ${(Math.max(...values) / Math.min(...values)).toFixed(2)} 倍；需補面積、人流或產量後才能判斷單位效率。`,
      );
    }
  } else if (pageKey === "eff") {
    const powerFactor = asFiniteNumber(metrics.averagePowerFactor);
    const standbyRatio = asFiniteNumber(metrics.standbyConsumptionRatio);
    if (powerFactor !== null && powerFactor < 0.95) {
      recommendations.unshift(
        `平均功率因數 ${powerFactor.toFixed(3)}，建議優先檢查無功補償與高無效負載。`,
      );
    }
    if (standbyRatio !== null && standbyRatio >= 0.14) {
      recommendations.unshift(
        `非營業耗能占比約 ${(standbyRatio * 100).toFixed(1)}%，可先盤點待機負載與排程關閉機會。`,
      );
    }
  } else {
    findings.unshift(
      "此摘要由 EnMS 已授權 facts 產生，互動式追問仍透過右下角 Chat 進行。",
    );
  }

  return {
    analysis: {
      ...analysis,
      findings: uniqueText(findings),
      recommendations: uniqueText(recommendations),
    },
    chartSeries,
    confidence: sanitizeText(metrics.siteCount, 40) ? "high" : "medium",
  };
}

function buildEvidence(
  source: PageEvidence | undefined,
  contextPack: ReturnType<typeof buildEnmsContextPack>,
  confidence: string,
  analyticsSources: string[] = [],
  knowledgeBundle?: EnmsKnowledgeBundle,
): PageEvidence {
  const dataSources = [
    ...(Array.isArray(source?.dataSources) ? source.dataSources : []),
    "EnMS scoped facts",
    "EnClaw EnMS Runtime",
    "EnClaw Context Builder / Context Pack",
    ...analyticsSources,
    ...(knowledgeBundle?.documents ?? [])
      .filter(
        (document) =>
          document.path.startsWith("wiki/") ||
          document.path === "skills/enms/SKILL.md",
      )
      .map(
        (document) =>
          `Loaded EnClaw knowledge: ${document.path}#${document.sha256.slice(0, 12)}`,
      ),
    ...contextPack.wiki.map((path) => `AI Wiki contract: ${path}`),
    ...contextPack.playbooks.map((path) => `Playbook contract: ${path}`),
  ]
    .map((item) => sanitizeText(item, 300))
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 12);

  return {
    dataSources,
    timeRange: sanitizeText(source?.timeRange, 200) || null,
    queryScope: sanitizeText(source?.queryScope, 600),
    confidence,
    generatedAt: new Date().toISOString(),
  };
}

function validateGuardrails(body: PageInsightRequest): string | null {
  if (body.guardrails?.mode !== "readonly") {
    return "page insight 只接受 readonly 模式";
  }
  if (body.guardrails?.factsAlreadyScopedByEnms !== true) {
    return "facts 必須先由 EnMS 套用使用者授權範圍";
  }
  if (
    body.guardrails?.noSqlFromClient !== true ||
    body.guardrails?.noHtml !== true
  ) {
    return "缺少必要的 SQL/HTML 安全限制";
  }
  if (
    body.guardrails?.semanticViewsOnly !== true ||
    body.guardrails?.allowedViewPrefix !== "ai_"
  ) {
    return "page insight 只接受 ai_* semantic views";
  }
  if (body.guardrails?.requireEvidence !== true) {
    return "page insight 必須回傳 evidence";
  }
  if (!sanitizeText(body.evidence?.queryScope, 600)) {
    return "缺少 evidence.queryScope";
  }
  return null;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({
    ok: true,
    adapter: "enms-ai-assistant-page-insight",
    pageKeys: getEnmsPageKeys(),
    registry: {
      contractVersion: ENMS_INTEGRATION_CONTRACT_VERSION,
      factsSchemaVersion: ENMS_FACTS_SCHEMA_VERSION,
      capabilities: getEnmsCapabilityRegistry(),
      readonlyPolicy: {
        reviewDraftCreated: false,
        wikiWritebackPerformed: false,
      },
    },
    architecture: {
      sourceOfTruth: "EnMS scoped facts",
      runtime: "EnClaw EnMS domain runtime",
      context:
        "Context Builder + Context Pack + loaded Skill/AI Wiki/Playbook policy",
      reviewWriteback: "not_performed_on_readonly_request",
    },
  });
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PageInsightRequest;
  try {
    body = (await req.json()) as PageInsightRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const pageKey = normalizePageKey(body.pageKey);
  if (!pageKey) {
    return Response.json({ error: "Unsupported 'pageKey'" }, { status: 400 });
  }
  const definition = getEnmsPageDefinition(pageKey);
  if (body.contractVersion !== ENMS_INTEGRATION_CONTRACT_VERSION) {
    return Response.json(
      {
        error: "Unsupported 'contractVersion'",
        supported: ENMS_INTEGRATION_CONTRACT_VERSION,
      },
      { status: 409 },
    );
  }
  if (body.factsSchemaVersion !== ENMS_FACTS_SCHEMA_VERSION) {
    return Response.json(
      {
        error: "Unsupported 'factsSchemaVersion'",
        supported: ENMS_FACTS_SCHEMA_VERSION,
      },
      { status: 409 },
    );
  }

  const guardrailError = validateGuardrails(body);
  if (guardrailError) {
    return Response.json(
      {
        pageKey,
        status: "blocked",
        updatedAt: new Date().toISOString(),
        analysis: {
          intent: definition.intent,
          summary: guardrailError,
          findings: [],
          recommendations: [],
        },
        cards: [],
        chartSeries: [],
        evidence: buildEvidence(body.evidence, buildEnmsContextPack(
          buildEnmsContext({
            request: {
              user_message: definition.prompt,
              current_system_hint: "enms",
            },
          }),
        ), "blocked"),
        missingData: [{ key: "guardrails", message: guardrailError }],
        sourceMode: "enclaw",
      },
      { status: 200 },
    );
  }

  const preflight = buildEnmsContext({
    request: {
      user_message: definition.prompt,
      current_system_hint: "enms",
    },
  });
  const contextPack = buildEnmsContextPack(preflight);
  let knowledgeBundle: EnmsKnowledgeBundle;
  try {
    knowledgeBundle = await loadEnmsKnowledgeBundle(pageKey, contextPack);
  } catch {
    const message =
      "EnClaw 的 EnMS skill/wiki/playbook knowledge contract 未完整載入；為避免未套規範的分析，本次已停止。";
    return Response.json({
      pageKey,
      status: "blocked",
      updatedAt: new Date().toISOString(),
      facts: {},
      analysis: {
        intent: definition.intent,
        summary: message,
        findings: [],
        recommendations: [],
      },
      cards: [],
      chartSeries: [],
      evidence: buildEvidence(
        body.evidence,
        contextPack,
        "blocked",
      ),
      missingData: [{ key: "knowledgeContract", message }],
      sourceMode: "enclaw",
    });
  }
  const facts = asRecord(body.facts);
  const missingRequiredFactGroups = getMissingRequiredFactGroups(
    pageKey,
    facts,
  );
  let analysis = sanitizeAnalysis(
    body.analysis,
    definition.intent,
  );
  let chartSeries = sanitizeChartSeries(body.chartSeries);
  let confidence = sanitizeText(body.evidence?.confidence, 40) || "medium";
  let analyticsSources: string[] = [];
  let structuredModelAttempted = false;
  let structuredModelApplied = false;
  let structuredModelKnowledgeRefs: string[] = [];
  let structuredModelSkipReason: string | null = null;
  const missingData = sanitizeMissingData(body.missingData);

  if (missingRequiredFactGroups.length > 0) {
    const missingFacts = missingRequiredFactGroups
      .map((group) => group.join(" 或 "))
      .join("；");
    analysis = {
      intent: definition.intent,
      summary: `EnMS 已授權 facts 資料不足，尚缺：${missingFacts}。本次不產生推測分析。`,
      findings: [],
      recommendations: ["請先補齊缺少的 EnMS facts，再重新執行分析。"],
    };
    chartSeries = [];
    confidence = "low";
  } else if (pageKey === "demand") {
    const enrichment = buildDemandEnrichment(
      analysis,
      facts,
      chartSeries,
    );
    analysis = enrichment.analysis;
    chartSeries = enrichment.chartSeries;
    confidence = enrichment.confidence;
    analyticsSources = ["EnMS Demand Forecast Facts / EnClaw Analysis"];
  } else if (pageKey === "anomaly") {
    const enrichment = buildAnomalyEnrichment(analysis, facts, chartSeries);
    analysis = enrichment.analysis;
    chartSeries = enrichment.chartSeries;
    confidence = enrichment.confidence;
    analyticsSources = ["EnClaw Anomaly Detection Engine"];
  } else if (pageKey === "alert") {
    const enrichment = buildAlertEnrichment(analysis, facts, chartSeries);
    analysis = enrichment.analysis;
    chartSeries = enrichment.chartSeries;
    confidence = enrichment.confidence;
    analyticsSources = [
      "EnClaw Demand Forecast Engine",
      "EnClaw Anomaly Detection Engine",
      "EnClaw Alert Governance Engine",
    ];
  } else {
    const enrichment = buildFactsEnrichment(
      pageKey,
      analysis,
      facts,
      chartSeries,
    );
    analysis = enrichment.analysis;
    chartSeries = enrichment.chartSeries;
    confidence = enrichment.confidence;
  }

  const structuredNarrativePlan = shouldAttemptStructuredNarrative(
    pageKey,
    facts,
    missingData,
  );
  structuredModelSkipReason = structuredNarrativePlan.reason ?? null;

  if (
    missingRequiredFactGroups.length === 0 &&
    structuredNarrativePlan.attempt &&
    isEnmsStructuredAgentEnabled()
  ) {
    structuredModelAttempted = true;
    try {
      const deterministicSummary = analysis.summary;
      const promptDocuments = await loadEnmsPromptDocuments(
        pageKey,
        knowledgeBundle,
      );
      const narrative = await runEnmsStructuredAgent({
        mode: "page",
        pageKey,
        intent: definition.intent,
        task: definition.prompt,
        facts,
        deterministicSummary: analysis.summary,
        documents: promptDocuments,
        signal: req.signal,
      });
      const supportedFindings = filterEnmsStructuredNarrative(
        pageKey,
        narrative.findings,
        missingData,
      );
      const supportedRecommendations = filterEnmsStructuredNarrative(
        pageKey,
        narrative.recommendations,
        missingData,
      );
      if (
        supportedFindings.length + supportedRecommendations.length ===
        0
      ) {
        throw new Error(
          "Structured model narrative is unsupported by available facts",
        );
      }
      analysis = {
        intent: definition.intent,
        // EnMS keeps the authoritative facts-based summary. EnClaw enriches
        // qualitative findings and recommendations without restating values.
        summary: deterministicSummary,
        findings: uniqueText([
          ...analysis.findings,
          ...supportedFindings.map((item) => item.text),
        ]),
        recommendations: uniqueText([
          ...analysis.recommendations,
          ...supportedRecommendations.map((item) => item.text),
        ]),
      };
      confidence = lowerConfidence(confidence, narrative.confidence);
      structuredModelApplied = true;
      structuredModelKnowledgeRefs = narrative.knowledgeRefs;
      analyticsSources = [
        ...analyticsSources,
        "EnClaw Provider-backed Structured Agent",
      ];
    } catch (error) {
      console.warn("[enms-page-insight] Structured model fallback", {
        pageKey,
        reason:
          error instanceof Error
            ? error.message
            : "unknown structured model error",
      });
      // Deterministic analytics remain the safe fallback.
    }
  }

  for (const missingGroup of missingRequiredFactGroups) {
    missingData.push({
      key: `knowledgeFact:${missingGroup.join("|")}`,
      message: `EnClaw ${definition.name} 規範需要至少一項 facts：${missingGroup.join(" 或 ")}。`,
    });
  }

  return Response.json({
    contractVersion: knowledgeBundle.contractVersion,
    factsSchemaVersion: knowledgeBundle.factsSchemaVersion,
    pageKey,
    status: missingRequiredFactGroups.length > 0 ? "empty" : "ready",
    updatedAt: new Date().toISOString(),
    facts: {},
    analysis,
    cards:
      missingRequiredFactGroups.length > 0 ? [] : sanitizeCards(body.cards),
    chartSeries,
    evidence: buildEvidence(
      body.evidence,
      contextPack,
      confidence,
      analyticsSources,
      knowledgeBundle,
    ),
    missingData: missingData.slice(0, 8),
    sourceMode: "enclaw",
    orchestration: {
      contractVersion: knowledgeBundle.contractVersion,
      factsSchemaVersion: knowledgeBundle.factsSchemaVersion,
      registryVersion: knowledgeBundle.registryVersion,
      page: {
        name: definition.name,
        intent: definition.intent,
        analyticsEngines: definition.analyticsEngines,
      },
      capabilities: knowledgeBundle.capabilities,
      contextPack: knowledgeBundle.contextPack,
      knowledge: {
        documents: knowledgeBundle.documents,
        verifiedPhrases: knowledgeBundle.verifiedPhrases,
      },
      readonlyPolicy: {
        structuredJsonOnly: true,
        htmlAllowed: false,
        clientSqlAllowed: false,
        reviewDraftCreated: false,
        wikiWritebackPerformed: false,
      },
      model: {
        attempted: structuredModelAttempted,
        applied: structuredModelApplied,
        fallback:
          structuredModelAttempted && !structuredModelApplied,
        skipReason: structuredModelSkipReason,
        knowledgeRefs: structuredModelKnowledgeRefs,
      },
    },
    structuredModelAttempted,
    structuredModelApplied,
  });
}
