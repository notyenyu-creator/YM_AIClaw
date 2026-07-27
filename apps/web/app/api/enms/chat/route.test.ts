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
const DEFAULT_API_KEY = "server-secret";

function buildRequest(body: unknown, headers?: HeadersInit) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Content-Type", "application/json");
  if (!requestHeaders.has("Authorization")) {
    requestHeaders.set("Authorization", `Bearer ${DEFAULT_API_KEY}`);
  }

  const requestBody =
    body && typeof body === "object" && "scopedContext" in body
      ? {
          ...body,
          scopedContext: {
            contractVersion: "enms.ai.page-insight.v1",
            factsSchemaVersion: "enms.ai.facts.v1",
            ...(body as { scopedContext?: Record<string, unknown> })
              .scopedContext,
          },
        }
      : body;

  return new Request("http://localhost/api/enms/chat", {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(requestBody),
  });
}

describe("POST /api/enms/chat", () => {
  beforeEach(() => {
    vi.resetModules();
    structuredAgentMocks.enabled.mockReturnValue(false);
    structuredAgentMocks.run.mockReset();
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    delete process.env.ENMS_AI_ASSISTANT_API_KEY;
    delete process.env.ENMS_PG_CONNECTION;
    delete process.env.OPENCLAW_ENMS_PG_CONNECTION;
    delete process.env.ENMS_POSTGRES_CONNECTION;
    delete process.env.ENCLAW_ENMS_ALLOW_LEGACY_ENMS_TABLES;
    delete process.env.ENCLAW_ENMS_DISABLE_LEGACY_DIRECT_QUERY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  it("describes the EnMS adapter contract", async () => {
    const { GET } = await import("./route.js");

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.adapter).toBe("enms-ai-assistant-chat");
    expect(json.contract.contractVersion).toBe("enms.ai.chat.v1");
    expect(json.contract.acceptedPageInsightContractVersion).toBe(
      "enms.ai.page-insight.v1",
    );
    expect(json.contract.request).toContain("scope");
    expect(json.contract.request).toContain("scopedContext");
  });

  it("rejects missing message", async () => {
    const { POST } = await import("./route.js");

    const response = await POST(buildRequest({ message: "   " }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("message");
  });

  it("requires a configured server-to-server bearer token", async () => {
    delete process.env.ENCLAW_ENMS_API_KEY;
    const { POST } = await import("./route.js");

    const response = await POST(buildRequest({ message: "請查最近 7 天需量" }));

    expect(response.status).toBe(401);
  });

  it("rejects wrong bearer auth", async () => {
    const { POST } = await import("./route.js");

    const response = await POST(
      buildRequest(
        { message: "請查最近 7 天需量" },
        { Authorization: "Bearer wrong-secret" },
      ),
    );

    expect(response.status).toBe(401);
  });

  it("fails closed when EnMS requires semantic views and legacy tables are not explicitly allowed", async () => {
    const { POST } = await import("./route.js");

    const response = await POST(
      buildRequest({
        message: "目前有幾個電表？",
        conversationId: "conv-semantic",
        guardrails: {
          mode: "readonly",
          semanticViewsOnly: true,
          allowedViewPrefix: "ai_",
        },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.conversationId).toBe("conv-semantic");
    expect(json.citations[0].source).toBe("blocked");
    expect(
      json.blocks.some((block: { text?: string }) =>
        block.text?.includes("只能使用 ai_* semantic views"),
      ),
    ).toBe(true);
  });

  it("blocks restricted EnMS scopes before any global DB query", async () => {
    const { POST } = await import("./route.js");

    const response = await POST(
      buildRequest({
        message: "請查最近 7 天最大需量",
        conversationId: "conv-1",
        scope: {
          userId: "UserA",
          companyNo: "Pingroun",
          allSites: false,
          siteFilterRequired: true,
          siteIds: ["site-1"],
        },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.conversationId).toBe("conv-1");
    expect(json.intent).toBe("demand_forecast");
    expect(json.evidence.queryScope).toContain("siteCount=1");
    expect(
      json.blocks.some((block: { text?: string }) =>
        block.text?.includes("為避免越權讀取"),
      ),
    ).toBe(true);
  });

  it("answers a restricted scope only from EnMS-authorized scoped facts", async () => {
    const { POST } = await import("./route.js");

    const response = await POST(
      buildRequest({
        message: "請分析目前需量風險",
        conversationId: "conv-scoped",
        scope: {
          userId: "UserA",
          companyNo: "Pingroun",
          allSites: false,
          siteFilterRequired: true,
          siteIds: ["site-1"],
        },
        scopedContext: {
          pageKey: "demand",
          status: "ready",
          facts: {
            metrics: {
              currentDemandKw: 82.3,
              peakDemandKw: 91.2,
              projectedPeakDemandKw: 94.5,
              contractCapacityKw: 100,
            },
          },
          analysis: {
            summary: "<b>目前需量 82.3 kW，仍在契約容量內。</b>",
            findings: ["最近尖峰為 91.2 kW。"],
            recommendations: ["持續觀察 15 分鐘需量。"],
          },
          cards: [
            {
              label: "目前需量",
              value: "82.3",
              unit: "kW",
            },
          ],
          evidence: {
            dataSources: ["DeviceDataSummaryView"],
            timeRange: "最近 30 日",
            queryScope: "場域 1 個",
            confidence: "high",
          },
          missingData: [],
          sourceMode: "enms",
        },
        guardrails: {
          mode: "readonly",
          factsAlreadyScopedByEnms: true,
          noSqlFromClient: true,
          noHtml: true,
          semanticViewsOnly: true,
          requireEvidence: true,
        },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.conversationId).toBe("conv-scoped");
    expect(json.citations[0].source).toBe("scoped_facts");
    expect(json.evidence.queryScope).toBe("場域 1 個");
    expect(json.evidence.dataSources).toContain("DeviceDataSummaryView");
    expect(
      json.blocks.some((block: { text?: string }) =>
        block.text?.includes("目前需量：82.3 kW"),
      ),
    ).toBe(true);
    expect(json.answerContract.answerKind).toBe("demand");
    expect(json.answerContract.matchedFactPaths).toContain(
      "facts.metrics.currentDemandKw",
    );
    expect(json.answerContract.wikiWritebackPerformed).toBe(false);
    expect(JSON.stringify(json)).not.toContain("<b>");
    expect(JSON.stringify(json)).not.toContain("為避免越權讀取");
  });

  it("combines trusted scoped facts bundle answers without widening scope", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "我想知道最新的一筆資料時間，也請分析目前需量有沒有超約風險",
        conversationId: "conv-bundle",
        scope: {
          userId: "UserA",
          companyNo: "Pingroun",
          allSites: false,
          siteFilterRequired: true,
          siteIds: ["site-1"],
        },
        scopedContext: {
          pageKey: "nlq",
          status: "ready",
          facts: {
            latestDataAt: "2026-07-22T02:00:00.000Z",
            sampleCount: 96,
            meterCount: 4,
          },
          evidence: {
            dataSources: ["ai_energy_15m_v1"],
            timeRange: "授權範圍最新資料：2026-07-22 10:00",
            queryScope: "nlq scope",
            confidence: "high",
          },
        },
        scopedFactsBundle: {
          contractVersion: "enms.ai.page-insight.v1",
          factsSchemaVersion: "enms.ai.facts.v1",
          primaryPageKey: "nlq",
          contexts: [
            {
              contractVersion: "enms.ai.page-insight.v1",
              factsSchemaVersion: "enms.ai.facts.v1",
              pageKey: "nlq",
              status: "ready",
              facts: {
                latestDataAt: "2026-07-22T02:00:00.000Z",
                sampleCount: 96,
                meterCount: 4,
              },
              evidence: {
                dataSources: ["ai_energy_15m_v1"],
                timeRange: "授權範圍最新資料：2026-07-22 10:00",
                queryScope: "nlq scope",
                confidence: "high",
              },
            },
            {
              contractVersion: "enms.ai.page-insight.v1",
              factsSchemaVersion: "enms.ai.facts.v1",
              pageKey: "demand",
              status: "ready",
              facts: {
                metrics: {
                  currentDemandKw: 82.3,
                  peakDemandKw: 91.2,
                  projectedPeakDemandKw: 94.5,
                  contractCapacityKw: 100,
                },
              },
              evidence: {
                dataSources: ["ai_energy_15m_v1"],
                timeRange: "最近 30 日",
                queryScope: "demand scope",
                confidence: "high",
              },
            },
          ],
        },
        guardrails: {
          mode: "readonly",
          factsAlreadyScopedByEnms: true,
          noSqlFromClient: true,
          noHtml: true,
          semanticViewsOnly: true,
          requireEvidence: true,
        },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.conversationId).toBe("conv-bundle");
    expect(JSON.stringify(json.blocks)).toContain("分成以下面向回答");
    expect(JSON.stringify(json.blocks)).toContain("2026/7/22 10:00:00");
    expect(JSON.stringify(json.blocks)).toContain("目前需量：82.3 kW");
    expect(json.evidence.queryScope).toContain("nlq scope");
    expect(json.evidence.queryScope).toContain("demand scope");
    expect(json.evidence.dataSources).toContain("ai_energy_15m_v1");
    expect(json.answerContract.chatFactsBundle.primaryPageKey).toBe("nlq");
    expect(json.answerContract.chatFactsBundle.pageKeys).toEqual([
      "nlq",
      "demand",
    ]);
    expect(json.answerContract.structuredModelAttempted).toBe(false);
    expect(json.answerContract.structuredModelApplied).toBe(false);
    expect(JSON.stringify(json)).not.toContain("為避免越權讀取");
  });

  it("does not force latest-data bundle answers for energy-saving advice questions", async () => {
    process.env.ENCLAW_ENMS_STRUCTURED_AGENT_ENABLED = "1";
    structuredAgentMocks.enabled.mockReturnValue(true);
    structuredAgentMocks.run.mockResolvedValue({
      summary: "節能建議應以 EnMS 授權 facts 為依據。",
      findings: [
        {
          text: "夜間基載偏高，優先盤點非生產時段仍運轉的負載。",
          factRefs: ["metrics.quickWinSavingNtd"],
        },
      ],
      recommendations: [
        {
          text: "先從空調與長時間運轉迴路排程下手，預估年節省可作為追蹤 KPI。",
          factRefs: ["metrics.quickWinSavingNtd"],
        },
      ],
      confidence: "high",
      knowledgeRefs: ["skills/enms/SKILL.md"],
    });
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "可以給我一個省電建議嗎？",
        conversationId: "conv-eff-advice",
        scope: {
          userId: "UserA",
          companyNo: "Pingroun",
          allSites: false,
          siteFilterRequired: true,
          siteIds: ["site-1"],
        },
        scopedContext: {
          pageKey: "nlq",
          status: "ready",
          facts: {
            latestDataAt: "2026-07-22T02:00:00.000Z",
            sampleCount: 3500,
            meterCount: 25,
          },
          evidence: {
            dataSources: ["ai_energy_15m_v1"],
            timeRange: "07/20 15:00 - 07/22 01:45",
            queryScope: "nlq scope",
            confidence: "high",
          },
        },
        scopedFactsBundle: {
          contractVersion: "enms.ai.page-insight.v1",
          factsSchemaVersion: "enms.ai.facts.v1",
          primaryPageKey: "nlq",
          contexts: [
            {
              contractVersion: "enms.ai.page-insight.v1",
              factsSchemaVersion: "enms.ai.facts.v1",
              pageKey: "nlq",
              status: "ready",
              facts: {
                latestDataAt: "2026-07-22T02:00:00.000Z",
                sampleCount: 3500,
                meterCount: 25,
              },
              evidence: {
                dataSources: ["ai_energy_15m_v1"],
                timeRange: "07/20 15:00 - 07/22 01:45",
                queryScope: "nlq scope",
                confidence: "high",
              },
            },
            {
              contractVersion: "enms.ai.page-insight.v1",
              factsSchemaVersion: "enms.ai.facts.v1",
              pageKey: "eff",
              status: "ready",
              facts: {
                metrics: {
                  quickWinSavingNtd: 120000,
                  averagePowerFactor: 0.91,
                },
              },
              evidence: {
                dataSources: ["ai_efficiency_view"],
                timeRange: "最近 30 日",
                queryScope: "eff scope",
                confidence: "high",
              },
            },
          ],
        },
        guardrails: {
          mode: "readonly",
          factsAlreadyScopedByEnms: true,
          noSqlFromClient: true,
          noHtml: true,
          semanticViewsOnly: true,
          requireEvidence: true,
        },
      }),
    );
    const json = await response.json();
    const blocks = JSON.stringify(json.blocks);

    expect(response.status).toBe(200);
    expect(blocks).not.toContain("授權範圍內最新一筆 EnMS 時序資料時間");
    expect(blocks).not.toContain("2026/7/22 10:00:00");
    expect(blocks).toContain("預估年節省：120,000 NTD");
    expect(blocks).toContain("夜間基載偏高");
    expect(structuredAgentMocks.run).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "chat",
        pageKey: "eff",
        task: "可以給我一個省電建議嗎？",
      }),
    );
    expect(json.answerContract.answerKind).toBe("metric");
    expect(json.answerContract.structuredModelAttempted).toBe(true);
    expect(json.answerContract.structuredModelApplied).toBe(true);
  });

  it("does not force EnMS scoped facts onto unrelated general questions", async () => {
    process.env.ENCLAW_ENMS_STRUCTURED_AGENT_ENABLED = "1";
    structuredAgentMocks.enabled.mockReturnValue(true);
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "今天天氣如何？",
        conversationId: "conv-general-no-match",
        scopedContext: {
          pageKey: "nlq",
          status: "ready",
          facts: {
            latestDataAt: "2026-07-22T02:00:00.000Z",
          },
          analysis: {
            summary: "不應把 EnMS 摘要拿來回答天氣問題。",
          },
          evidence: {
            dataSources: ["ai_energy_15m_v1"],
            timeRange: "07/20 15:00 - 07/22 01:45",
            queryScope: "nlq scope",
            confidence: "high",
          },
        },
        scopedFactsBundle: {
          contractVersion: "enms.ai.page-insight.v1",
          factsSchemaVersion: "enms.ai.facts.v1",
          primaryPageKey: "nlq",
          contexts: [
            {
              contractVersion: "enms.ai.page-insight.v1",
              factsSchemaVersion: "enms.ai.facts.v1",
              pageKey: "nlq",
              status: "ready",
              facts: {
                latestDataAt: "2026-07-22T02:00:00.000Z",
              },
              analysis: {
                summary: "不應把 EnMS 摘要拿來回答天氣問題。",
              },
              evidence: {
                dataSources: ["ai_energy_15m_v1"],
                timeRange: "07/20 15:00 - 07/22 01:45",
                queryScope: "nlq scope",
                confidence: "high",
              },
            },
            {
              contractVersion: "enms.ai.page-insight.v1",
              factsSchemaVersion: "enms.ai.facts.v1",
              pageKey: "eff",
              status: "ready",
              facts: {
                metrics: {
                  quickWinSavingNtd: 120000,
                },
              },
              evidence: {
                dataSources: ["ai_bill_v1"],
                timeRange: "最近 30 日",
                queryScope: "eff scope",
                confidence: "high",
              },
            },
          ],
        },
        guardrails: {
          mode: "readonly",
          factsAlreadyScopedByEnms: true,
          noSqlFromClient: true,
          noHtml: true,
          semanticViewsOnly: true,
          requireEvidence: true,
        },
      }),
    );
    const json = await response.json();
    const payload = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(json.citations[0].source).toBe("no_match");
    expect(payload).toContain("沒有命中 EnMS 的能管語意路由");
    expect(payload).not.toContain("2026/7/22 10:00:00");
    expect(payload).not.toContain("預估年節省");
    expect(payload).not.toContain("不應把 EnMS 摘要拿來回答天氣問題");
    expect(structuredAgentMocks.run).not.toHaveBeenCalled();
  });

  it("normalizes the bundle primary page key after filtering untrusted contexts", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "我想知道最新的一筆資料時間",
        conversationId: "conv-bundle-primary",
        scope: {
          userId: "UserA",
          companyNo: "Pingroun",
          allSites: false,
          siteFilterRequired: true,
          siteIds: ["site-1"],
        },
        scopedContext: {
          pageKey: "nlq",
          status: "ready",
          facts: {
            latestDataAt: "2026-07-22T02:00:00.000Z",
          },
          evidence: {
            dataSources: ["ai_energy_15m_v1"],
            timeRange: "授權範圍最新資料：2026-07-22 10:00",
            queryScope: "nlq scope",
            confidence: "high",
          },
        },
        scopedFactsBundle: {
          contractVersion: "enms.ai.page-insight.v1",
          factsSchemaVersion: "enms.ai.facts.v1",
          primaryPageKey: "demand",
          contexts: [
            {
              contractVersion: "enms.ai.page-insight.v1",
              factsSchemaVersion: "enms.ai.facts.v1",
              pageKey: "demand",
              status: "ready",
              facts: {
                metrics: {
                  currentDemandKw: 999999,
                },
              },
              evidence: {
                dataSources: ["untrusted_global_table"],
                timeRange: "全域資料",
                queryScope: "",
                confidence: "high",
              },
            },
            {
              contractVersion: "enms.ai.page-insight.v1",
              factsSchemaVersion: "enms.ai.facts.v1",
              pageKey: "nlq",
              status: "ready",
              facts: {
                latestDataAt: "2026-07-22T02:00:00.000Z",
              },
              evidence: {
                dataSources: ["ai_energy_15m_v1"],
                timeRange: "授權範圍最新資料：2026-07-22 10:00",
                queryScope: "nlq scope",
                confidence: "high",
              },
            },
          ],
        },
        guardrails: {
          mode: "readonly",
          factsAlreadyScopedByEnms: true,
          noSqlFromClient: true,
          noHtml: true,
          semanticViewsOnly: true,
          requireEvidence: true,
        },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(JSON.stringify(json.blocks)).toContain("2026/7/22 10:00:00");
    expect(json.answerContract.chatFactsBundle.primaryPageKey).toBe("nlq");
    expect(json.answerContract.chatFactsBundle.pageKeys).toEqual(["nlq"]);
    expect(JSON.stringify(json)).not.toContain("999999");
    expect(JSON.stringify(json)).not.toContain("untrusted_global_table");
  });

  it("adds provider-backed analysis while retaining the exact scoped-facts answer", async () => {
    process.env.ENCLAW_ENMS_STRUCTURED_AGENT_ENABLED = "1";
    structuredAgentMocks.enabled.mockReturnValue(true);
    structuredAgentMocks.run.mockResolvedValue({
      summary: "目前負載接近契約警戒區。",
      findings: [
        {
          text: "目前需量相對契約容量偏高。",
          factRefs: ["metrics.currentDemandKw", "metrics.contractCapacityKw"],
        },
      ],
      recommendations: [
        {
          text: "持續監看並盤點可延後運轉的設備。",
          factRefs: ["metrics.currentDemandKw"],
        },
      ],
      confidence: "high",
      knowledgeRefs: ["skills/enms/SKILL.md"],
    });
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "請分析目前需量風險",
        scope: {
          siteFilterRequired: true,
          siteIds: ["site-1"],
        },
        scopedContext: {
          pageKey: "demand",
          status: "ready",
          facts: {
            metrics: {
              currentDemandKw: 82.3,
              contractCapacityKw: 100,
            },
          },
          evidence: {
            dataSources: ["ai_energy_15m_v1"],
            queryScope: "siteCount=1",
            confidence: "high",
          },
        },
        guardrails: {
          mode: "readonly",
          factsAlreadyScopedByEnms: true,
          noSqlFromClient: true,
          noHtml: true,
          semanticViewsOnly: true,
          requireEvidence: true,
        },
      }),
    );
    const json = await response.json();

    expect(JSON.stringify(json.blocks)).toContain("82.3");
    expect(JSON.stringify(json.blocks)).toContain("目前需量相對契約容量偏高");
    expect(JSON.stringify(json.blocks)).not.toContain("接近契約警戒區");
    expect(json.answerContract.structuredModelAttempted).toBe(true);
    expect(json.answerContract.structuredModelApplied).toBe(true);
  });

  it("does not append structured analysis for precise latest-data answers", async () => {
    process.env.ENCLAW_ENMS_STRUCTURED_AGENT_ENABLED = "1";
    structuredAgentMocks.enabled.mockReturnValue(true);
    structuredAgentMocks.run.mockResolvedValue({
      summary: "這段模型摘要不應被加入精準時間回答。",
      findings: [
        {
          text: "模型補充不應出現。",
          factRefs: ["latestDataAt"],
        },
      ],
      recommendations: [],
      confidence: "high",
      knowledgeRefs: ["skills/enms/SKILL.md"],
    });
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "電號 04043717102 最新的一筆資料是幾月幾號？",
        scopedContext: {
          pageKey: "nlq",
          status: "empty",
          facts: {
            latestDataAt: "2026-07-22T02:00:00.000Z",
            account: {
              accountNumber: "04043717102",
            },
          },
          evidence: {
            dataSources: ["ai_energy_15m_v1"],
            queryScope: "siteCount=1",
            confidence: "high",
          },
        },
        guardrails: {
          mode: "readonly",
          factsAlreadyScopedByEnms: true,
          noSqlFromClient: true,
          noHtml: true,
          semanticViewsOnly: true,
          requireEvidence: true,
        },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(JSON.stringify(json.blocks)).toContain("2026/7/22 10:00:00");
    expect(JSON.stringify(json.blocks)).not.toContain("模型補充不應出現");
    expect(structuredAgentMocks.run).not.toHaveBeenCalled();
    expect(json.answerContract.structuredModelAttempted).toBe(false);
    expect(json.answerContract.structuredModelApplied).toBe(false);
  });

  it("filters unsupported Chat claims and never appends the model summary", async () => {
    process.env.ENCLAW_ENMS_STRUCTURED_AGENT_ENABLED = "1";
    structuredAgentMocks.enabled.mockReturnValue(true);
    structuredAgentMocks.run.mockResolvedValue({
      summary: "需量已接近契約警戒區。",
      findings: [
        {
          text: "目前存在超約風險。",
          factRefs: ["metrics.currentDemandKw"],
        },
        {
          text: "近期負載有持續上升趨勢。",
          factRefs: ["metrics.currentDemandKw"],
        },
      ],
      recommendations: [
        {
          text: "持續監看可延後運轉的設備。",
          factRefs: ["metrics.currentDemandKw"],
        },
      ],
      confidence: "medium",
      knowledgeRefs: ["skills/enms/SKILL.md"],
    });
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "請分析目前需量風險",
        scope: {
          siteFilterRequired: true,
          siteIds: ["site-1"],
        },
        scopedContext: {
          pageKey: "demand",
          status: "ready",
          facts: {
            metrics: {
              currentDemandKw: 82.3,
              contractCapacityKw: null,
            },
          },
          evidence: {
            dataSources: ["ai_energy_15m_v1"],
            queryScope: "siteCount=1",
            confidence: "medium",
          },
          missingData: [
            {
              key: "contractCapacity",
              message: "缺少目前有效契約容量。",
            },
          ],
        },
        guardrails: {
          mode: "readonly",
          factsAlreadyScopedByEnms: true,
          noSqlFromClient: true,
          noHtml: true,
          semanticViewsOnly: true,
          requireEvidence: true,
        },
      }),
    );
    const json = await response.json();
    const blocks = JSON.stringify(json.blocks);

    expect(response.status).toBe(200);
    expect(blocks).toContain("82.3");
    expect(blocks).toContain("近期負載有持續上升趨勢");
    expect(blocks).not.toContain("接近契約警戒區");
    expect(blocks).not.toContain("超約風險");
    expect(json.answerContract.structuredModelAttempted).toBe(true);
    expect(json.answerContract.structuredModelApplied).toBe(true);
  });

  it("does not trust scoped context without every EnMS guardrail", async () => {
    const { POST } = await import("./route.js");

    const response = await POST(
      buildRequest({
        message: "請查最近 7 天最大需量",
        scope: {
          siteFilterRequired: true,
          siteIds: ["site-1"],
        },
        scopedContext: {
          pageKey: "demand",
          status: "ready",
          analysis: {
            summary: "不應顯示這段內容",
          },
        },
        guardrails: {
          mode: "readonly",
          factsAlreadyScopedByEnms: true,
          noSqlFromClient: true,
          noHtml: false,
          semanticViewsOnly: true,
          requireEvidence: true,
        },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.citations[0].source).toBe("blocked");
    expect(JSON.stringify(json)).not.toContain("不應顯示這段內容");
  });

  it("fails closed when scoped facts use an unsupported contract version", async () => {
    const { POST } = await import("./route.js");

    const response = await POST(
      buildRequest({
        message: "請分析目前需量風險",
        scope: {
          siteFilterRequired: true,
          siteIds: ["site-1"],
        },
        scopedContext: {
          contractVersion: "enms.ai.page-insight.v999",
          pageKey: "demand",
          status: "ready",
          facts: {
            metrics: {
              currentDemandKw: 82.3,
            },
          },
          evidence: {
            queryScope: "siteCount=1",
          },
        },
        guardrails: {
          mode: "readonly",
          factsAlreadyScopedByEnms: true,
          noSqlFromClient: true,
          noHtml: true,
          semanticViewsOnly: true,
          requireEvidence: true,
        },
      }),
    );
    const json = await response.json();

    expect(json.citations[0].source).toBe("blocked");
    expect(JSON.stringify(json)).not.toContain("82.3");
  });

  it("does not trust a scoped context whose page key mismatches the request", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "請查目前需量",
        pageKey: "demand",
        scope: {
          siteFilterRequired: true,
          siteIds: ["site-1"],
        },
        scopedContext: {
          pageKey: "eff",
          status: "ready",
          facts: {
            metrics: {
              currentDemandKw: 82.3,
            },
          },
          evidence: {
            queryScope: "siteCount=1",
          },
        },
        guardrails: {
          mode: "readonly",
          factsAlreadyScopedByEnms: true,
          noSqlFromClient: true,
          noHtml: true,
          semanticViewsOnly: true,
          requireEvidence: true,
        },
      }),
    );
    const json = await response.json();

    expect(json.citations[0].source).toBe("blocked");
    expect(JSON.stringify(json)).not.toContain("82.3");
  });

  it("answers an exact bill question from trusted scoped facts", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "最近一期帳單月份、金額和用電量是多少？",
        conversationId: "conv-bill",
        scope: {
          powerAccountFilterRequired: true,
          powerAccountIds: [1],
        },
        scopedContext: {
          pageKey: "eff",
          status: "ready",
          facts: {
            metrics: {
              latestBillMonth: "11506",
              latestBillAmountNtd: 45678,
              latestBillUsageKwh: 10987,
            },
          },
          analysis: {
            summary: "不應只回整頁摘要",
          },
          evidence: {
            dataSources: ["ai_bill_view"],
            timeRange: "最近 12 期",
            queryScope: "powerAccountCount=1",
            confidence: "high",
          },
          missingData: [],
        },
        guardrails: {
          mode: "readonly",
          factsAlreadyScopedByEnms: true,
          noSqlFromClient: true,
          noHtml: true,
          semanticViewsOnly: true,
          requireEvidence: true,
        },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.answerContract.answerKind).toBe("billing");
    expect(JSON.stringify(json.blocks)).toContain("11506");
    expect(JSON.stringify(json.blocks)).toContain("45,678 NTD");
    expect(JSON.stringify(json.blocks)).not.toContain("不應只回整頁摘要");
  });

  it("does not answer a requested account absent from scoped facts", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "請查電號 99999999999 的最近帳單",
        scope: {
          powerAccountFilterRequired: true,
          powerAccountIds: [1],
        },
        scopedContext: {
          pageKey: "eff",
          status: "ready",
          facts: {
            account: { accountNumber: "04043717102" },
            metrics: {
              latestBillMonth: "11506",
              latestBillAmountNtd: 45678,
            },
          },
          evidence: {
            timeRange: "最近 12 期",
            queryScope: "powerAccountCount=1",
            confidence: "high",
          },
          missingData: [],
        },
        guardrails: {
          mode: "readonly",
          factsAlreadyScopedByEnms: true,
          noSqlFromClient: true,
          noHtml: true,
          semanticViewsOnly: true,
          requireEvidence: true,
        },
      }),
    );
    const json = await response.json();

    expect(json.answerContract.answerKind).toBe("missing");
    expect(JSON.stringify(json.blocks)).toContain("99999999999");
    expect(JSON.stringify(json.blocks)).not.toContain("45,678");
  });

  it("disables legacy direct query through an explicit production setting", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ENCLAW_ENMS_DISABLE_LEGACY_DIRECT_QUERY = "1";
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "目前有幾個電表？",
      }),
    );
    const json = await response.json();

    expect(json.citations[0].source).toBe("blocked");
    expect(JSON.stringify(json.blocks)).toContain(
      "部署設定停用 legacy EnMS direct query",
    );
  });

  it("fails closed for legacy direct query in production by default", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "目前有幾個電表？",
      }),
    );
    const json = await response.json();

    expect(JSON.stringify(json.blocks)).toContain(
      "部署設定停用 legacy EnMS direct query",
    );
  });

  it("preserves legacy direct query only when production explicitly enables it", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ENCLAW_ENMS_ALLOW_LEGACY_ENMS_TABLES = "1";
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "目前有幾個電表？",
      }),
    );
    const json = await response.json();

    expect(JSON.stringify(json.blocks)).not.toContain(
      "部署設定停用 legacy EnMS direct query",
    );
  });
});
