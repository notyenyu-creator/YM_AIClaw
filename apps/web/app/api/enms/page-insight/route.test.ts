import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const structuredAgentMocks = vi.hoisted(() => ({
  enabled: vi.fn(() => false),
  run: vi.fn(),
}));

vi.mock("@/lib/enms-structured-agent", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/enms-structured-agent")>();
  return {
    ...actual,
    isEnmsStructuredAgentEnabled: structuredAgentMocks.enabled,
    runEnmsStructuredAgent: structuredAgentMocks.run,
  };
});

const ORIGINAL_ENV = { ...process.env };
const API_KEY = "server-secret";

function buildRequest(body: unknown, token = API_KEY) {
  return new Request("http://localhost/api/enms/page-insight", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function buildRegistryRequest(token = API_KEY) {
  return new Request("http://localhost/api/enms/page-insight", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

function buildBody(pageKey = "demand") {
  const start = new Date("2026-07-25T00:00:00.000Z").getTime();
  const points = Array.from({ length: 8 }, (_, index) => ({
    label: `08:${String(index * 15).padStart(2, "0")}`,
    timestamp: new Date(start + index * 15 * 60_000).toISOString(),
    value: 70 + index,
    tone: "blue",
  }));

  return {
    contractVersion: "enms.ai.page-insight.v1",
    factsSchemaVersion: "enms.ai.facts.v1",
    pageKey,
    facts: {
      metrics: {
        contractCapacityKw: 90,
        currentDemandKw: 77,
        peakDemandKw: 82,
        projectedPeakDemandKw: 88,
        projectedPeakContractCapacityKw: 90,
        suggestedShedKw: 7,
        anomalyCount: 1,
        siteCount: 2,
        totalAlertCount30d: 3,
        totalConsumptionKwh30d: 1200,
      },
      ranking: [{ name: "迴路 A", value: 450 }],
      exampleQuestion: "最近 7 日哪個迴路最耗電？",
      exampleAnswer: "迴路 A 約 450 kWh。",
      siteRankings: [{ name: "場域 A", value: 1200 }],
      alertGroups: [{ name: "需量告警", value: 3 }],
      opportunities: [{ name: "排程調整", value: 12000 }],
      analyticsInputs: {
        contractCapacityKw: 90,
        summaryPoints: points.map((point) => ({
          recordedAt: point.timestamp,
          maxDemandKw: point.value,
          totalConsumptionKwh: point.value / 4,
          avgPowerFactor: 0.95,
          minPowerFactor: 0.9,
          contractCapacityKw: 90,
        })),
        rawPoints: points.map((point, index) => ({
          recordedAt: point.timestamp,
          connected: index >= 3,
          quality: index < 3 ? "BAD" : "GOOD",
          va: 110,
          vb: 109,
          vc: 111,
          ia: 10,
          ib: 10,
          ic: 11,
        })),
      },
      contractCapacityTimeline: [
        {
          timestamp: new Date(start + 8 * 15 * 60_000).toISOString(),
          demandKw: 85,
          contractCapacityKw: 90,
        },
        {
          timestamp: new Date(start + 9 * 15 * 60_000).toISOString(),
          demandKw: 88,
          contractCapacityKw: 95,
        },
      ],
    },
    analysis: {
      summary: "EnMS scoped facts 摘要",
      findings: ["最近需量持續上升"],
      recommendations: ["持續觀察"],
    },
    cards: [
      {
        key: "peakDemand",
        label: "趨勢推估尖峰",
        value: "82.0",
        unit: "kW",
      },
    ],
    chartSeries: [
      {
        key: "actualDemand",
        label: "實際需量",
        type: "line",
        points,
      },
      {
        key: "forecastDemand",
        label: "趨勢推估",
        type: "line",
        points: [
          {
            label: "10:00",
            timestamp: new Date(start + 8 * 15 * 60_000).toISOString(),
            value: 85,
            tone: "purple",
          },
          {
            label: "10:15",
            timestamp: new Date(start + 9 * 15 * 60_000).toISOString(),
            value: 88,
            tone: "purple",
          },
        ],
      },
    ],
    evidence: {
      dataSources: ["DeviceDataSummaryView"],
      timeRange: "2026-07-25",
      queryScope: "siteCount=1 / macCount=2",
      confidence: "medium",
    },
    missingData: [],
    scopeSummary: {
      siteIds: ["site-1"],
    },
    guardrails: {
      mode: "readonly",
      factsAlreadyScopedByEnms: true,
      noSqlFromClient: true,
      requireEvidence: true,
      noHtml: true,
      semanticViewsOnly: true,
      allowedViewPrefix: "ai_",
    },
  };
}

describe("POST /api/enms/page-insight", () => {
  beforeEach(() => {
    vi.resetModules();
    structuredAgentMocks.enabled.mockReturnValue(false);
    structuredAgentMocks.run.mockReset();
    process.env.ENCLAW_ENMS_API_KEY = API_KEY;
    delete process.env.ENCLAW_ENMS_API_KEY_FILE;
    delete process.env.ENMS_AI_ASSISTANT_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  it("publishes the documented eight-capability readonly registry", async () => {
    const { GET } = await import("./route.js");
    const response = await GET(buildRegistryRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.pageKeys).toEqual([
      "demand",
      "anomaly",
      "nlq",
      "bench",
      "alert",
      "eff",
    ]);
    expect(json.registry.capabilities).toHaveLength(8);
    expect(json.registry.readonlyPolicy.wikiWritebackPerformed).toBe(false);
  });

  it("protects the registry contract with server-to-server auth", async () => {
    const { GET } = await import("./route.js");

    const response = await GET(buildRegistryRequest("wrong-token"));

    expect(response.status).toBe(401);
  });

  it("requires server-to-server bearer auth", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(buildRequest(buildBody(), "wrong-secret"));

    expect(response.status).toBe(401);
  });

  it("loads server-to-server auth from a mounted secret file and fails closed when missing", async () => {
    const secretDir = mkdtempSync(join(tmpdir(), "enclaw-enms-s2s-"));
    const secretFile = join(secretDir, "api-key");
    writeFileSync(secretFile, `${API_KEY}\n`);
    process.env.ENCLAW_ENMS_API_KEY = "environment-fallback-must-not-be-used";
    process.env.ENCLAW_ENMS_API_KEY_FILE = secretFile;

    try {
      const { GET } = await import("./route.js");
      const validResponse = await GET(buildRegistryRequest());
      expect(validResponse.status).toBe(200);

      process.env.ENCLAW_ENMS_API_KEY_FILE = `${secretFile}.missing`;
      const missingResponse = await GET(buildRegistryRequest());
      expect(missingResponse.status).toBe(401);
    } finally {
      rmSync(secretDir, { recursive: true, force: true });
    }
  });

  it("rejects unsupported page keys", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(buildRequest(buildBody("unknown")));

    expect(response.status).toBe(400);
  });

  it("rejects incompatible page and facts contract versions", async () => {
    const { POST } = await import("./route.js");
    const pageBody = buildBody();
    pageBody.contractVersion = "enms.ai.page-insight.v999";
    const pageResponse = await POST(buildRequest(pageBody));
    expect(pageResponse.status).toBe(409);

    const factsBody = buildBody();
    factsBody.factsSchemaVersion = "enms.ai.facts.v999";
    const factsResponse = await POST(buildRequest(factsBody));
    expect(factsResponse.status).toBe(409);
  });

  it("requires both page and facts contract versions", async () => {
    const { POST } = await import("./route.js");
    const missingPageVersion = buildBody() as Record<string, unknown>;
    delete missingPageVersion.contractVersion;
    const pageResponse = await POST(buildRequest(missingPageVersion));
    expect(pageResponse.status).toBe(409);

    const missingFactsVersion = buildBody() as Record<string, unknown>;
    delete missingFactsVersion.factsSchemaVersion;
    const factsResponse = await POST(buildRequest(missingFactsVersion));
    expect(factsResponse.status).toBe(409);
  });

  it("fails closed when EnMS scoped-facts guardrails are missing", async () => {
    const { POST } = await import("./route.js");
    const body = buildBody();
    body.guardrails.factsAlreadyScopedByEnms = false;

    const response = await POST(buildRequest(body));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("blocked");
    expect(json.missingData[0].key).toBe("guardrails");
  });

  it("requires evidence guardrails and query scope", async () => {
    const { POST } = await import("./route.js");
    const body = buildBody();
    body.guardrails.requireEvidence = false;

    const response = await POST(buildRequest(body));
    const json = await response.json();

    expect(json.status).toBe("blocked");
    expect(json.analysis.summary).toContain("必須回傳 evidence");
  });

  it("requires EnMS ai semantic-view guardrails", async () => {
    const { POST } = await import("./route.js");
    const missingSemanticViewGuard = buildBody();
    missingSemanticViewGuard.guardrails.semanticViewsOnly = false;

    const semanticResponse = await POST(buildRequest(missingSemanticViewGuard));
    const semanticJson = await semanticResponse.json();

    expect(semanticJson.status).toBe("blocked");
    expect(semanticJson.analysis.summary).toContain("ai_* semantic views");

    const wrongPrefix = buildBody();
    wrongPrefix.guardrails.allowedViewPrefix = "raw_";

    const prefixResponse = await POST(buildRequest(wrongPrefix));
    const prefixJson = await prefixResponse.json();

    expect(prefixJson.status).toBe("blocked");
    expect(prefixJson.missingData[0].key).toBe("guardrails");
    expect(prefixJson.analysis.summary).toContain("ai_* semantic views");
  });

  it("returns structured demand analysis without replacing EnMS forecast numbers", async () => {
    const { POST } = await import("./route.js");
    const body = buildBody();
    const authoritativeForecast = body.chartSeries.find(
      (series) => series.key === "forecastDemand",
    );
    const response = await POST(buildRequest(body));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.pageKey).toBe("demand");
    expect(json.status).toBe("ready");
    expect(json.sourceMode).toBe("enclaw");
    expect(json.analysis.intent).toBe("demand_forecast");
    expect(json.chartSeries.find(
      (series: { key?: string }) => series.key === "forecastDemand",
    )).toEqual(authoritativeForecast);
    expect(json.analysis.findings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("EnMS 授權趨勢推估尖峰"),
        expect.stringContaining("契約容量異動"),
      ]),
    );
    expect(json.evidence.dataSources).toContain(
      "EnClaw Context Builder / Context Pack",
    );
    expect(json.evidence.dataSources).toContain(
      "EnMS Demand Forecast Facts / EnClaw Analysis",
    );
    expect(json.evidence.queryScope).toContain("siteCount=1");
    expect(json.contractVersion).toBe("enms.ai.page-insight.v1");
    expect(json.factsSchemaVersion).toBe("enms.ai.facts.v1");
    expect(json.orchestration.contractVersion).toBe(
      "enms.ai.page-insight.v1",
    );
    expect(json.orchestration.capabilities).toHaveLength(8);
    expect(json.orchestration.knowledge.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "skills/enms/SKILL.md",
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
        expect.objectContaining({
          path:
            "wiki/entities/energy/ENMS_DEMAND_FORECAST_TEMPLATE.md",
        }),
      ]),
    );
    expect(json.orchestration.readonlyPolicy.wikiWritebackPerformed).toBe(
      false,
    );
  });

  it("applies provider-backed findings without replacing EnMS summary, cards, or chart data", async () => {
    process.env.ENCLAW_ENMS_STRUCTURED_AGENT_ENABLED = "1";
    structuredAgentMocks.enabled.mockReturnValue(true);
    structuredAgentMocks.run.mockResolvedValue({
        summary: "目前負載接近契約警戒區，建議持續監看。",
        findings: [
          {
            text: "目前需量相對契約容量偏高。",
            factRefs: [
              "metrics.currentDemandKw",
              "metrics.contractCapacityKw",
            ],
          },
        ],
        recommendations: [
          {
            text: "優先盤點可延後運轉的非關鍵設備。",
            factRefs: ["metrics.currentDemandKw"],
          },
        ],
        confidence: "high",
        knowledgeRefs: ["skills/enms/SKILL.md"],
      });
    const { POST } = await import("./route.js");
    const body = buildBody();
    const response = await POST(buildRequest(body));
    const json = await response.json();

    expect(json.status).toBe("ready");
    expect(json.analysis.summary).not.toContain("契約警戒區");
    expect(json.analysis.summary).toBe("EnMS scoped facts 摘要");
    expect(json.analysis.findings).toContain(
      "目前需量相對契約容量偏高。",
    );
    expect(json.analysis.findings).toContain("最近需量持續上升");
    expect(json.analysis.recommendations).toContain("持續觀察");
    expect(json.cards).toEqual([
      expect.objectContaining(body.cards[0]),
    ]);
    expect(json.chartSeries).toEqual(body.chartSeries);
    expect(json.orchestration.model).toEqual(
      expect.objectContaining({
        attempted: true,
        applied: true,
        fallback: false,
      }),
    );
    expect(json.structuredModelAttempted).toBe(true);
    expect(json.structuredModelApplied).toBe(true);
    expect(json.evidence.dataSources).toContain(
      "EnClaw Provider-backed Structured Agent",
    );
  });

  it("filters model claims that conflict with EnMS missing-data boundaries", async () => {
    process.env.ENCLAW_ENMS_STRUCTURED_AGENT_ENABLED = "1";
    structuredAgentMocks.enabled.mockReturnValue(true);
    structuredAgentMocks.run.mockResolvedValue({
      summary: "模型摘要不應取代 EnMS 摘要。",
      findings: [
        {
          text: "ROI 回收期約 8 個月。",
          factRefs: ["metrics.quickWinSavingNtd"],
        },
        {
          text: "夜間基載偏高，建議優先盤點排程。",
          factRefs: ["metrics.offHourConsumptionRatio"],
        },
      ],
      recommendations: [
        {
          text: "先確認可延後運轉的非關鍵設備。",
          factRefs: ["opportunities"],
        },
      ],
      confidence: "high",
      knowledgeRefs: ["skills/enms/SKILL.md"],
    });
    const { POST } = await import("./route.js");
    const body = buildBody("eff");
    (
      body as { missingData: Array<{ key: string; message: string }> }
    ).missingData = [
      {
        key: "taipowerBills",
        message: "缺台電帳單平均電價，未估算節省金額。",
      },
    ];

    const response = await POST(buildRequest(body));
    const json = await response.json();

    expect(json.status).toBe("ready");
    expect(json.analysis.findings).not.toContain(
      "ROI 回收期約 8 個月。",
    );
    expect(json.analysis.findings).toContain(
      "夜間基載偏高，建議優先盤點排程。",
    );
    expect(json.analysis.recommendations).toContain(
      "先確認可延後運轉的非關鍵設備。",
    );
    expect(json.orchestration.model.applied).toBe(true);
  });

  it("skips structured model when required narrative facts would be blocked", async () => {
    process.env.ENCLAW_ENMS_STRUCTURED_AGENT_ENABLED = "1";
    structuredAgentMocks.enabled.mockReturnValue(true);
    structuredAgentMocks.run.mockResolvedValue({
      summary: "不應執行",
      findings: [],
      recommendations: [],
      confidence: "high",
      knowledgeRefs: ["skills/enms/SKILL.md"],
    });
    const { POST } = await import("./route.js");
    const body = buildBody("demand");
    (body.facts.metrics as Record<string, number | null>).contractCapacityKw =
      null;
    (
      body as { missingData: Array<{ key: string; message: string }> }
    ).missingData = [
      {
        key: "contractCapacity",
        message: "缺少目前有效契約容量。",
      },
    ];

    const response = await POST(buildRequest(body));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("ready");
    expect(structuredAgentMocks.run).not.toHaveBeenCalled();
    expect(json.orchestration.model).toEqual(
      expect.objectContaining({
        attempted: false,
        applied: false,
        fallback: false,
        skipReason: "skip_structured_model_missing_contract_capacity",
      }),
    );
  });

  it.each([
    {
      pageKey: "demand",
      intent: "demand_forecast",
      evidence: "ENMS_DEMAND_FORECAST_TEMPLATE.md",
    },
    {
      pageKey: "anomaly",
      intent: "anomaly_detection",
      evidence: "EnClaw Anomaly Detection Engine",
    },
    {
      pageKey: "nlq",
      intent: "natural_language_query",
      evidence: "ENMS_NL_QUERY_SUMMARY_TEMPLATE.md",
    },
    {
      pageKey: "bench",
      intent: "site_benchmarking",
      evidence: "ENMS_SITE_BENCHMARKING_PLAYBOOK_TEMPLATE.md",
    },
    {
      pageKey: "alert",
      intent: "alert_governance",
      evidence: "EnClaw Alert Governance Engine",
    },
    {
      pageKey: "eff",
      intent: "efficiency_analysis",
      evidence: "ENMS_EFFICIENCY_IMPROVEMENT_PLAYBOOK_TEMPLATE.md",
    },
  ])(
    "routes $pageKey through the expected EnClaw intent and evidence",
    async ({ pageKey, intent, evidence }) => {
      const { POST } = await import("./route.js");
      const response = await POST(buildRequest(buildBody(pageKey)));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.pageKey).toBe(pageKey);
      expect(json.status).toBe("ready");
      expect(json.analysis.intent).toBe(intent);
      expect(
        json.evidence.dataSources.some((source: string) =>
          source.includes(evidence),
        ),
      ).toBe(true);
      expect(
        json.orchestration.knowledge.documents.some(
          (document: { path?: string }) =>
            document.path?.includes(evidence),
        ) ||
          json.orchestration.page.analyticsEngines.some((engine: string) =>
            evidence.includes(
              engine
                .split("_")
                .map((part) =>
                  part.length > 0
                    ? `${part[0].toUpperCase()}${part.slice(1)}`
                    : part,
                )
                .join(" "),
            ),
          ),
      ).toBe(true);
    },
  );

  it("strips HTML from structured analysis text", async () => {
    const { POST } = await import("./route.js");
    const body = buildBody("eff");
    body.analysis.summary = "<script>alert(1)</script>節能摘要";

    const response = await POST(buildRequest(body));
    const json = await response.json();

    expect(json.analysis.summary).not.toContain("<script>");
    expect(json.analysis.summary).toContain("節能摘要");
  });

  it("reports page knowledge fact gaps without fabricating values", async () => {
    const { POST } = await import("./route.js");
    const body = buildBody("bench");
    Object.assign(body, {
      facts: {
        metrics: {
          siteCount: 2,
        },
        siteRankings: [],
      },
    });

    const response = await POST(buildRequest(body));
    const json = await response.json();

    expect(json.status).toBe("empty");
    expect(json.cards).toEqual([]);
    expect(json.chartSeries).toEqual([]);
    expect(json.analysis.summary).toContain("本次不產生推測分析");
    expect(
      json.missingData.some((item: { key?: string }) =>
        item.key?.startsWith("knowledgeFact:siteRankings"),
      ),
    ).toBe(true);
    expect(JSON.stringify(json)).not.toContain("Demo");
  });
});
