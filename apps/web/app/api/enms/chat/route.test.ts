import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const structuredAgentMocks = vi.hoisted(() => ({
  enabled: vi.fn(() => false),
  run: vi.fn(),
  runGeneral: vi.fn(),
}));

vi.mock("@/lib/enms-structured-agent", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/enms-structured-agent")>();
  return {
    ...actual,
    isEnmsStructuredAgentEnabled: structuredAgentMocks.enabled,
    runEnmsStructuredAgent: structuredAgentMocks.run,
    runEnmsGeneralChatAgent: structuredAgentMocks.runGeneral,
  };
});

const ORIGINAL_ENV = { ...process.env };
const DEFAULT_API_KEY = "server-secret";

function buildRequest(
  body: unknown,
  headers?: HeadersInit,
  options: { preserveGuardrails?: boolean } = {},
) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Content-Type", "application/json");
  if (!requestHeaders.has("Authorization")) {
    requestHeaders.set("Authorization", `Bearer ${DEFAULT_API_KEY}`);
  }

  const requestBody =
    body && typeof body === "object"
      ? {
          ...body,
          ...(!options.preserveGuardrails &&
          "guardrails" in body &&
          (body as { guardrails?: Record<string, unknown> }).guardrails
            ? {
                guardrails: {
                  ...(body as { guardrails?: Record<string, unknown> })
                    .guardrails,
                  ...((body as { guardrails?: Record<string, unknown> })
                    .guardrails?.semanticViewsOnly === true &&
                  !(
                    "allowedViewPrefix" in
                    ((body as { guardrails?: Record<string, unknown> })
                      .guardrails ?? {})
                  )
                    ? { allowedViewPrefix: "ai_" }
                    : {}),
                },
              }
            : {}),
          ...("scopedContext" in body
            ? {
                scopedContext: {
                  contractVersion: "enms.ai.page-insight.v1",
                  factsSchemaVersion: "enms.ai.facts.v1",
                  ...(body as { scopedContext?: Record<string, unknown> })
                    .scopedContext,
                },
              }
            : {}),
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
    structuredAgentMocks.runGeneral.mockReset();
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
          companyNo: "TEST-COMPANY",
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
          companyNo: "TEST-COMPANY",
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
          companyNo: "TEST-COMPANY",
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

  it("keeps exact nlq device answers in a multi-intent bundle before demand analysis", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "迴路1 是對應哪個設備，也請說明需量超約風險",
        conversationId: "conv-device-demand",
        scope: {
          userId: "UserA",
          companyNo: "TEST-COMPANY",
          allSites: false,
          siteFilterRequired: true,
          siteIds: ["site-1"],
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
                deviceMappings: [
                  {
                    label: "冰機 CH1 電源 · MAC-A / 位址 2 / 迴路 1",
                    deviceAlias: "冰機 CH1 電源",
                    macAddress: "MAC-A",
                    address: "2",
                    circuitSeq: 1,
                    accountNumber: "TEST-PA-001",
                    siteName: "TEST-SITE-A",
                    identityKey: "MAC-A|2|1",
                  },
                ],
              },
              evidence: {
                dataSources: ["ai_meter_v1"],
                timeRange: "目前設備主檔",
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
                  projectedPeakDemandKw: 104.5,
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
    const blocks = JSON.stringify(json.blocks);

    expect(response.status).toBe(200);
    expect(blocks).toContain("冰機 CH1 電源");
    expect(blocks).toContain("目前需量：82.3 kW");
    expect(blocks).not.toContain("需量 / 契約容量");
    expect(json.answerContract.chatFactsBundle.pageKeys).toEqual([
      "nlq",
      "demand",
    ]);
    expect(json.answerContract.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageKey: "nlq",
          answerKind: "device_lookup",
          matchedFactPaths: expect.arrayContaining(["facts.deviceMappings"]),
        }),
        expect.objectContaining({
          pageKey: "demand",
          answerKind: "demand",
          matchedFactPaths: expect.arrayContaining([
            "facts.metrics.currentDemandKw",
            "facts.metrics.peakDemandKw",
            "facts.metrics.projectedPeakDemandKw",
          ]),
        }),
      ]),
    );
  });

  it("keeps exact nlq meter ranking answers in a multi-intent bundle before demand analysis", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "哪個迴路最費電，也請說明需量超約風險",
        conversationId: "conv-ranking-demand",
        scope: {
          userId: "UserA",
          companyNo: "TEST-COMPANY",
          allSites: false,
          siteFilterRequired: true,
          siteIds: ["site-1"],
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
                meterRankingDetails: [
                  {
                    label: "冰機 CH1 電源 · MAC-A / 位址 2 / 迴路 1",
                    consumptionKwh: 3420,
                    peakDemandKw: 91.2,
                    macAddress: "MAC-A",
                    address: "2",
                    circuitSeq: 1,
                    identityKey: "MAC-A|2|1",
                  },
                ],
              },
              evidence: {
                dataSources: ["ai_energy_15m_v1"],
                timeRange: "最近 7 日",
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
                  projectedPeakDemandKw: 104.5,
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
    const blocks = JSON.stringify(json.blocks);

    expect(response.status).toBe(200);
    expect(blocks).toContain("冰機 CH1 電源");
    expect(blocks).toContain("3,420 kWh");
    expect(blocks).toContain("目前需量：82.3 kW");
    expect(blocks).not.toContain("需量 / 契約容量");
    expect(json.answerContract.chatFactsBundle.pageKeys).toEqual([
      "nlq",
      "demand",
    ]);
    expect(json.answerContract.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageKey: "nlq",
          answerKind: "ranking",
          matchedFactPaths: expect.arrayContaining(["facts.meterRankingDetails"]),
        }),
        expect.objectContaining({
          pageKey: "demand",
          answerKind: "demand",
          matchedFactPaths: expect.arrayContaining([
            "facts.metrics.currentDemandKw",
            "facts.metrics.peakDemandKw",
            "facts.metrics.projectedPeakDemandKw",
          ]),
        }),
      ]),
    );
  });

  it("keeps meter ranking when the same bundle question also asks billing facts", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "哪個迴路最費電，也看最近帳單",
        conversationId: "conv-ranking-billing",
        scope: {
          userId: "UserA",
          companyNo: "TEST-COMPANY",
          allSites: false,
          siteFilterRequired: true,
          siteIds: ["site-1"],
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
                meterRankingDetails: [
                  {
                    label: "冰機 CH1 電源 · MAC-A / 位址 2 / 迴路 1",
                    consumptionKwh: 3420,
                    macAddress: "MAC-A",
                    address: "2",
                    circuitSeq: 1,
                    identityKey: "MAC-A|2|1",
                  },
                ],
              },
              evidence: {
                dataSources: ["ai_energy_15m_v1"],
                timeRange: "最近 7 日",
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
                  latestBillMonth: "11506",
                  latestBillAmountNtd: 45678,
                  latestBillUsageKwh: 10987,
                },
              },
              evidence: {
                dataSources: ["ai_bill_v1"],
                timeRange: "最近一期帳單",
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
    expect(blocks).toContain("冰機 CH1 電源");
    expect(blocks).toContain("3,420 kWh");
    expect(blocks).toContain("11506");
    expect(blocks).toContain("45,678 NTD");
    expect(blocks).not.toContain("台電帳單 / 費率");
    expect(json.answerContract.chatFactsBundle.pageKeys).toEqual([
      "nlq",
      "eff",
    ]);
  });

  it("keeps available meter ranking and warns when requested billing bundle facts are missing", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "哪個迴路最費電，也看最近帳單",
        conversationId: "conv-ranking-missing-billing",
        scope: {
          userId: "UserA",
          companyNo: "TEST-COMPANY",
          allSites: false,
          siteFilterRequired: true,
          siteIds: ["site-1"],
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
                meterRankingDetails: [
                  {
                    label: "冰機 CH1 電源 · MAC-A / 位址 2 / 迴路 1",
                    consumptionKwh: 3420,
                    macAddress: "MAC-A",
                    address: "2",
                    circuitSeq: 1,
                    identityKey: "MAC-A|2|1",
                  },
                ],
              },
              evidence: {
                dataSources: ["ai_energy_15m_v1"],
                timeRange: "最近 7 日",
                queryScope: "nlq scope",
                confidence: "high",
              },
            },
            {
              contractVersion: "enms.ai.page-insight.v1",
              factsSchemaVersion: "enms.ai.facts.v1",
              pageKey: "eff",
              status: "empty",
              facts: {},
              evidence: {
                dataSources: ["ai_bill_v1"],
                timeRange: "最近一期帳單",
                queryScope: "eff scope",
                confidence: "medium",
              },
              missingData: [
                {
                  key: "taipowerBills",
                  message: "缺台電帳單資料。",
                },
              ],
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
    expect(blocks).toContain("冰機 CH1 電源");
    expect(blocks).toContain("3,420 kWh");
    expect(blocks).toContain("沒有足夠的台電帳單 / 費率資料");
    expect(blocks).toContain("缺台電帳單資料");
    expect(json.answerContract.answerKind).toBe("ranking");
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
          text: "先從空調與長時間運轉迴路排程下手，5% what-if 年化金額可作為追蹤 KPI。",
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
          companyNo: "TEST-COMPANY",
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
    expect(blocks).toContain("5% what-if 年化金額：120,000 NTD");
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

  it("keeps same answerKind candidates when they belong to different page capabilities", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "功率因數正常嗎？也給我省電建議",
        conversationId: "conv-multi-metric",
        scope: {
          userId: "UserA",
          companyNo: "TEST-COMPANY",
          allSites: false,
          siteFilterRequired: true,
          siteIds: ["site-1"],
        },
        scopedContext: {
          pageKey: "anomaly",
          status: "ready",
          facts: {
            metrics: {
              avgPowerFactor: 0.82,
            },
          },
          evidence: {
            dataSources: ["ai_anomaly_view"],
            timeRange: "最近 7 日",
            queryScope: "anomaly scope",
            confidence: "high",
          },
        },
        scopedFactsBundle: {
          contractVersion: "enms.ai.page-insight.v1",
          factsSchemaVersion: "enms.ai.facts.v1",
          primaryPageKey: "anomaly",
          contexts: [
            {
              contractVersion: "enms.ai.page-insight.v1",
              factsSchemaVersion: "enms.ai.facts.v1",
              pageKey: "anomaly",
              status: "ready",
              facts: {
                metrics: {
                  avgPowerFactor: 0.82,
                },
              },
              evidence: {
                dataSources: ["ai_anomaly_view"],
                timeRange: "最近 7 日",
                queryScope: "anomaly scope",
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
    expect(blocks).toContain("【異常根因分析】");
    expect(blocks).toContain("平均功率因數：0.82");
    expect(blocks).toContain("【能效節能挖掘】");
    expect(blocks).toContain("5% what-if 年化金額：120,000 NTD");
    expect(json.answerContract.items).toEqual([
      {
        pageKey: "anomaly",
        answerKind: "metric",
        matchedFactPaths: ["facts.metrics.avgPowerFactor"],
      },
      {
        pageKey: "eff",
        answerKind: "metric",
        matchedFactPaths: ["facts.metrics.quickWinSavingNtd"],
      },
    ]);
  });

  it("does not force EnMS scoped facts onto unrelated general questions", async () => {
    process.env.ENCLAW_ENMS_STRUCTURED_AGENT_ENABLED = "1";
    structuredAgentMocks.enabled.mockReturnValue(true);
    structuredAgentMocks.runGeneral.mockResolvedValue({
      text: "我目前沒有即時天氣查詢工具，因此不能直接確認今天實際天氣。請提供城市與資料來源，或改用天氣服務查詢。",
      confidence: "high",
    });
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "今天天氣如何？",
        conversationId: "conv-general-no-match",
        history: [
          {
            role: "assistant",
            content:
              "授權範圍內最新一筆 EnMS 時序資料時間：2026/7/22 10:00:00，電號 TEST-PA-001。",
          },
        ],
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
    const visibleBlocksText = JSON.stringify(json.blocks);

    expect(response.status).toBe(200);
    expect(json.intent).toBe("general_question");
    expect(json.citations[0].source).toBe("general_ai");
    expect(json.evidence.queryScope).toBe("一般 AI 回覆；未讀取 EnMS 授權資料");
    expect(visibleBlocksText).not.toContain("intent=");
    expect(visibleBlocksText).not.toContain("confidence=");
    expect(payload).toContain("我目前沒有即時天氣查詢工具");
    expect(payload).not.toContain("2026/7/22 10:00:00");
    expect(payload).not.toContain("5% what-if 年化金額");
    expect(payload).not.toContain("不應把 EnMS 摘要拿來回答天氣問題");
    expect(structuredAgentMocks.runGeneral).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "今天天氣如何？",
      }),
    );
    expect(structuredAgentMocks.runGeneral.mock.calls[0][0]).not.toHaveProperty(
      "history",
    );
    expect(structuredAgentMocks.run).not.toHaveBeenCalled();
  });

  it("uses the chat planner general route without requiring scoped facts", async () => {
    process.env.ENCLAW_ENMS_STRUCTURED_AGENT_ENABLED = "1";
    structuredAgentMocks.enabled.mockReturnValue(true);
    structuredAgentMocks.runGeneral.mockResolvedValue({
      text: "今天是 2026 年 7 月 28 日。",
      confidence: "high",
    });
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "今天是幾月幾號？",
        conversationId: "conv-general-plan",
        chatPlan: {
          contractVersion: "enms.ai.chat-plan.v2",
          registryVersion: "test-registry",
          strategy: "general_ai",
          intent: "general_question",
          allowDbFacts: false,
          allowGeneralAI: true,
          selectedPageKeys: [],
        },
        guardrails: {
          mode: "readonly",
          factsAlreadyScopedByEnms: true,
          noSqlFromClient: true,
          noHtml: true,
          semanticViewsOnly: true,
          allowedViewPrefix: "ai_",
          requireEvidence: true,
        },
      }),
    );
    const json = await response.json();
    const payload = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(json.intent).toBe("general_question");
    expect(json.citations[0].source).toBe("general_ai");
    expect(payload).toContain("今天是 2026 年 7 月 28 日");
    expect(payload).not.toContain("EnMS 時序資料時間");
    expect(payload).not.toContain("ai_energy_15m_v1");
    expect(structuredAgentMocks.runGeneral).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "今天是幾月幾號？",
      }),
    );
    expect(structuredAgentMocks.run).not.toHaveBeenCalled();
  });

  it("lets the current chat plan override stale EnMS history and scoped facts for general questions", async () => {
    process.env.ENCLAW_ENMS_STRUCTURED_AGENT_ENABLED = "1";
    structuredAgentMocks.enabled.mockReturnValue(true);
    structuredAgentMocks.runGeneral.mockResolvedValue({
      text: "一般省電方式包含關閉閒置設備、調整空調設定與排程管理；這次未讀取 EnMS 資料。",
      confidence: "high",
    });
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "請用一般常識說明家庭怎麼省電",
        conversationId: "conv-general-after-enms",
        history: [
          {
            role: "assistant",
            content:
              "目前需量：899.64 kW；最高需量：1,368.4 kW；intent=demand_forecast。",
          },
        ],
        chatPlan: {
          contractVersion: "enms.ai.chat-plan.v2",
          registryVersion: "test-registry",
          strategy: "general_ai",
          intent: "general_question",
          confidence: "high",
          allowDbFacts: false,
          allowGeneralAI: true,
          selectedPageKeys: [],
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
                  currentDemandKw: 899.64,
                  peakDemandKw: 1368.4,
                },
              },
              evidence: {
                dataSources: ["ai_energy_15m_v1"],
                timeRange: "最近 30 日",
                queryScope: "siteCount=1",
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
          allowedViewPrefix: "ai_",
          requireEvidence: true,
        },
      }),
    );
    const json = await response.json();
    const payload = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(json.intent).toBe("general_question");
    expect(json.citations[0].source).toBe("general_ai");
    expect(payload).toContain("一般省電方式");
    expect(payload).not.toContain("899.64");
    expect(payload).not.toContain("1,368.4");
    expect(structuredAgentMocks.runGeneral).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "請用一般常識說明家庭怎麼省電",
      }),
    );
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
          companyNo: "TEST-COMPANY",
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
        message: "電號 TEST-PA-001 最新的一筆資料是幾月幾號？",
        scopedContext: {
          pageKey: "nlq",
          status: "empty",
          facts: {
            latestDataAt: "2026-07-22T02:00:00.000Z",
            account: {
              accountNumber: "TEST-PA-001",
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

  it("does not append structured analysis for precise site metadata answers", async () => {
    process.env.ENCLAW_ENMS_STRUCTURED_AGENT_ENABLED = "1";
    structuredAgentMocks.enabled.mockReturnValue(true);
    structuredAgentMocks.run.mockResolvedValue({
      summary: "這段模型補充不應混入案場 metadata 答案。",
      findings: [
        {
          text: "模型補充不應出現。",
          factRefs: ["siteMetadata"],
        },
      ],
      recommendations: [],
      confidence: "high",
      knowledgeRefs: ["skills/enms/SKILL.md"],
    });
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "目前案場名稱是什麼？",
        scopedContext: {
          pageKey: "nlq",
          status: "ready",
          facts: {
            siteMetadata: {
              companyNo: "COMPANY-A",
              companyName: "屏榮食品股份有限公司",
              currentSiteId: "SITE-A",
              currentSite: {
                siteId: "SITE-A",
                siteName: "大溪廠",
                companyNo: "COMPANY-A",
              },
              authorizedSites: [
                {
                  siteId: "SITE-A",
                  siteName: "大溪廠",
                  companyNo: "COMPANY-A",
                },
              ],
              meterCount: 25,
            },
          },
          evidence: {
            dataSources: ["sites", "ComCompany", "ai_meter_v1"],
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
    const blocks = JSON.stringify(json.blocks);

    expect(response.status).toBe(200);
    expect(json.answerContract.answerKind).toBe("site_metadata");
    expect(blocks).toContain("屏榮食品股份有限公司");
    expect(blocks).toContain("大溪廠");
    expect(blocks).toContain("授權電表迴路數");
    expect(blocks).not.toContain("模型補充不應出現");
    expect(structuredAgentMocks.run).not.toHaveBeenCalled();
    expect(json.answerContract.structuredModelAttempted).toBe(false);
    expect(json.answerContract.structuredModelApplied).toBe(false);
  });

  it("does not append structured analysis for precise device lookup answers", async () => {
    process.env.ENCLAW_ENMS_STRUCTURED_AGENT_ENABLED = "1";
    structuredAgentMocks.enabled.mockReturnValue(true);
    structuredAgentMocks.run.mockResolvedValue({
      summary: "這段節能模型摘要不應混入設備對應答案。",
      findings: [
        {
          text: "模型誤把設備對應題轉成節能建議。",
          factRefs: ["deviceMappings"],
        },
      ],
      recommendations: [],
      confidence: "high",
      knowledgeRefs: ["skills/enms/SKILL.md"],
    });
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "迴路1 是對應哪個設備？",
        scopedContext: {
          pageKey: "nlq",
          status: "ready",
          facts: {
            deviceMappings: [
              {
                label: "冰機 CH1 電源 · MAC-A / 位址 2 / 迴路 1",
                deviceAlias: "冰機 CH1 電源",
                macAddress: "MAC-A",
                address: "2",
                circuitSeq: 1,
                meterRole: "Sub",
                accountNumber: "TEST-PA-001",
                siteName: "TEST-SITE-A",
              },
            ],
          },
          evidence: {
            dataSources: ["ai_meter_v1"],
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
    const blocks = JSON.stringify(json.blocks);

    expect(response.status).toBe(200);
    expect(json.answerContract.answerKind).toBe("device_lookup");
    expect(blocks).toContain("冰機 CH1 電源");
    expect(blocks).toContain("MAC-A");
    expect(blocks).not.toContain("節能模型摘要");
    expect(blocks).not.toContain("節能建議");
    expect(structuredAgentMocks.run).not.toHaveBeenCalled();
    expect(json.answerContract.structuredModelAttempted).toBe(false);
    expect(json.answerContract.structuredModelApplied).toBe(false);
  });

  it("filters device lookup answers by requested main-meter role", async () => {
    process.env.ENCLAW_ENMS_STRUCTURED_AGENT_ENABLED = "1";
    structuredAgentMocks.enabled.mockReturnValue(true);
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "主電表是哪個？",
        scopedContext: {
          pageKey: "nlq",
          status: "ready",
          facts: {
            deviceMappings: [
              {
                label: "總表 · MAC-MAIN / 位址 1 / 迴路 1",
                deviceAlias: "總表",
                macAddress: "MAC-MAIN",
                address: "1",
                circuitSeq: 1,
                meterRole: "Main",
                accountNumber: "TEST-PA-001",
                siteName: "TEST-SITE-A",
              },
              {
                label: "冰機 CH1 · MAC-SUB / 位址 2 / 迴路 1",
                deviceAlias: "冰機 CH1",
                macAddress: "MAC-SUB",
                address: "2",
                circuitSeq: 1,
                meterRole: "Submeter",
                accountNumber: "TEST-PA-001",
                siteName: "TEST-SITE-A",
              },
              {
                label: "獨立水泵 · MAC-STANDALONE / 位址 3 / 迴路 1",
                deviceAlias: "獨立水泵",
                macAddress: "MAC-STANDALONE",
                address: "3",
                circuitSeq: 1,
                meterRole: "Standalone",
                accountNumber: "TEST-PA-002",
                siteName: "TEST-SITE-B",
              },
            ],
          },
          evidence: {
            dataSources: ["ai_meter_v1"],
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
    const blocks = JSON.stringify(json.blocks);

    expect(response.status).toBe(200);
    expect(json.answerContract.answerKind).toBe("device_lookup");
    expect(blocks).toContain("總表");
    expect(blocks).toContain("角色 Main");
    expect(blocks).not.toContain("冰機 CH1");
    expect(blocks).not.toContain("獨立水泵");
    expect(structuredAgentMocks.run).not.toHaveBeenCalled();
    expect(json.answerContract.structuredModelAttempted).toBe(false);
  });

  it("does not append structured analysis for precise meter ranking answers", async () => {
    process.env.ENCLAW_ENMS_STRUCTURED_AGENT_ENABLED = "1";
    structuredAgentMocks.enabled.mockReturnValue(true);
    structuredAgentMocks.run.mockResolvedValue({
      summary: "這段模型摘要不應混入迴路排行答案。",
      findings: [
        {
          text: "模型誤把排行題轉成需量超約建議。",
          factRefs: ["ranking"],
        },
      ],
      recommendations: [],
      confidence: "high",
      knowledgeRefs: ["skills/enms/SKILL.md"],
    });
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "哪個迴路最費電？",
        scopedContext: {
          pageKey: "nlq",
          status: "ready",
          facts: {
            ranking: [
              { name: "MAC-A / 位址 2 / 迴路 1", value: 3420 },
              { name: "MAC-B / 位址 4 / 迴路 1", value: 2150 },
            ],
            siteRankings: [
              { name: "A 場域", value: 9999 },
            ],
          },
          evidence: {
            dataSources: ["ai_energy_15m_v1"],
            timeRange: "最近 7 日",
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
    const blocks = JSON.stringify(json.blocks);

    expect(response.status).toBe(200);
    expect(json.answerContract.answerKind).toBe("ranking");
    expect(blocks).toContain("MAC-A / 位址 2 / 迴路 1");
    expect(blocks).toContain("3,420 kWh");
    expect(blocks).not.toContain("A 場域");
    expect(blocks).not.toContain("需量超約建議");
    expect(structuredAgentMocks.run).not.toHaveBeenCalled();
    expect(json.answerContract.structuredModelAttempted).toBe(false);
    expect(json.answerContract.structuredModelApplied).toBe(false);
  });

  it("returns a safe chart block for explicit scoped benchmarking chart requests", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "請查最近 30 天多場域 benchmarking 排名與差異，請用圖表呈現",
        scopedContext: {
          pageKey: "bench",
          status: "ready",
          facts: {
            siteRankings: [
              { name: "大溪廠", value: 13864.4 },
              { name: "二廠", value: 8240.2 },
            ],
          },
          evidence: {
            dataSources: ["ai_energy_15m_v1"],
            timeRange: "最近 30 日",
            queryScope: "siteCount=2",
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
    expect(json.answerContract.answerKind).toBe("ranking");
    expect(json.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "chart",
          chartType: "bar",
          unit: "kWh",
          series: [
            expect.objectContaining({
              key: "facts.siteRankings",
              points: [
                expect.objectContaining({ label: "大溪廠", value: 13864.4 }),
                expect.objectContaining({ label: "二廠", value: 8240.2 }),
              ],
            }),
          ],
        }),
      ]),
    );
    expect(structuredAgentMocks.run).not.toHaveBeenCalled();
  });

  it("keeps scoped chart blocks for mixed benchmarking metric requests", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message:
          "請查詢最近 30 天的總用電、最大需量、平均功率因數，並做多場域 benchmarking 排名與差異說明。請用圖表呈現",
        scopedContext: {
          pageKey: "bench",
          status: "ready",
          facts: {
            metrics: {
              peakDemandKw: 1386.44,
              averagePowerFactor: 0.613,
            },
            siteRankings: [
              { name: "大溪廠", value: 665217.19 },
              { name: "二廠", value: 412000 },
            ],
          },
          evidence: {
            dataSources: ["ai_energy_15m_v1"],
            timeRange: "最近 30 日",
            queryScope: "siteCount=2",
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
    expect(json.answerContract.answerKind).toBe("ranking");
    expect(json.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "chart",
          chartType: "bar",
          unit: "kWh",
          series: [
            expect.objectContaining({
              key: "facts.siteRankings",
              points: [
                expect.objectContaining({ label: "大溪廠", value: 665217.19 }),
                expect.objectContaining({ label: "二廠", value: 412000 }),
              ],
            }),
          ],
        }),
      ]),
    );
    expect(JSON.stringify(json)).not.toContain("無法生成圖表");
    expect(JSON.stringify(json)).not.toContain("Y-CRM 合約");
    expect(structuredAgentMocks.run).not.toHaveBeenCalled();
  });

  it("keeps chart blocks within the block budget for verbose multi-context bundle answers", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message:
          "請查詢最近 30 天的總用電、最大需量、平均功率因數，並做多場域 benchmarking 排名與差異說明。請幫我每一個都用圖表呈現",
        chatPlan: {
          contractVersion: "enms.ai.chat-plan.v2",
          strategy: "multi_scoped_facts",
          intent: "site_benchmarking",
          confidence: "high",
          allowDbFacts: true,
          allowGeneralAI: false,
          selectedCapabilities: [
            "site_benchmarking",
            "demand_risk",
            "anomaly_root_cause",
          ],
          primaryPageKey: "bench",
          selectedPageKeys: ["bench", "demand", "anomaly"],
          needClarification: false,
          maxContexts: 4,
          answerObligations: [
            {
              key: "total_energy_30d",
              label: "最近 30 天總用電",
              pageKey: "bench",
              capability: "site_benchmarking",
              answerKind: "ranking",
              requiredFactPaths: ["facts.siteRankings"],
              chartRequired: true,
              chartType: "bar",
              unit: "kWh",
            },
            {
              key: "peak_demand_30d",
              label: "最近 30 天最大需量",
              pageKey: "demand",
              capability: "demand_risk",
              answerKind: "demand",
              requiredFactPaths: ["facts.metrics.peakDemandKw"],
              chartRequired: true,
              chartType: "metric",
              unit: "kW",
            },
            {
              key: "avg_power_factor_30d",
              label: "最近 30 天平均功率因數",
              pageKey: "anomaly",
              capability: "anomaly_root_cause",
              answerKind: "metric",
              requiredFactPaths: ["facts.metrics.avgPowerFactor"],
              chartRequired: true,
              chartType: "metric",
              unit: "pf",
            },
          ],
        },
        scopedFactsBundle: {
          contractVersion: "enms.ai.page-insight.v1",
          factsSchemaVersion: "enms.ai.facts.v1",
          primaryPageKey: "bench",
          contexts: [
            {
              contractVersion: "enms.ai.page-insight.v1",
              factsSchemaVersion: "enms.ai.facts.v1",
              pageKey: "bench",
              status: "ready",
              facts: {
                siteRankings: [
                  {
                    name: "大溪廠",
                    value: 664734.9,
                    note: "資料粒度加總需量參考峰值 1,386.4 kW",
                  },
                ],
              },
              evidence: {
                dataSources: ["ai_energy_15m_v1"],
                timeRange: "07/02 00:45 - 07/29 01:45",
                queryScope: "siteCount=1",
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
                  currentDemandKw: 992.6,
                  peakDemandKw: 1386.44,
                  projectedPeakDemandKw: 998.6,
                  contractCapacityKw: 3535,
                  suggestedShedKw: 0,
                },
              },
              evidence: {
                dataSources: ["DeviceDataSummaryView"],
                timeRange: "07/02 00:45 - 07/29 01:45",
                queryScope: "powerAccountCount=1",
                confidence: "high",
              },
            },
            {
              contractVersion: "enms.ai.page-insight.v1",
              factsSchemaVersion: "enms.ai.facts.v1",
              pageKey: "anomaly",
              status: "ready",
              facts: {
                metrics: {
                  avgPowerFactor: 0.613,
                  minPowerFactor: 0.588,
                },
              },
              evidence: {
                dataSources: ["ai_anomaly_view"],
                timeRange: "07/25 00:00 - 07/29 01:00",
                queryScope: "meterCount=25",
                confidence: "high",
              },
            },
          ],
        },
        scopedContext: {
          pageKey: "bench",
          status: "ready",
          facts: {
            siteRankings: [
              {
                name: "大溪廠",
                value: 664734.9,
                note: "資料粒度加總需量參考峰值 1,386.4 kW",
              },
            ],
          },
          evidence: {
            dataSources: ["ai_energy_15m_v1"],
            timeRange: "07/02 00:45 - 07/29 01:45",
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
    const chartBlocks = json.blocks.filter(
      (block: { type?: string }) => block.type === "chart",
    );

    expect(response.status).toBe(200);
    expect(json.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "chart",
          chartType: "bar",
          unit: "kWh",
          series: [
            expect.objectContaining({
              key: "facts.siteRankings",
              points: [
                expect.objectContaining({ label: "大溪廠", value: 664734.9 }),
              ],
            }),
          ],
        }),
      ]),
    );
    expect(chartBlocks.length).toBeGreaterThanOrEqual(3);
    expect(chartBlocks.length).toBeLessThanOrEqual(4);
    expect(chartBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chartType: "metric",
          unit: "kW",
        }),
        expect.objectContaining({
          chartType: "metric",
          unit: "pf",
        }),
      ]),
    );
    expect(JSON.stringify(json.blocks)).toContain("【多場域比較】");
    expect(JSON.stringify(json.blocks)).not.toContain("【自然語言查詢】");
    expect(JSON.stringify(json.blocks)).toContain("【需量預測】");
    expect(JSON.stringify(json.blocks)).toContain("【異常根因分析】");
    expect(JSON.stringify(json.blocks)).toContain("平均功率因數：0.613");
    expect(json.answerContract.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageKey: "bench",
          answerKind: "ranking",
          matchedFactPaths: ["facts.siteRankings"],
        }),
        expect.objectContaining({
          pageKey: "demand",
          answerKind: "demand",
          matchedFactPaths: expect.arrayContaining([
            "facts.metrics.peakDemandKw",
          ]),
        }),
        expect.objectContaining({
          pageKey: "anomaly",
          answerKind: "metric",
          matchedFactPaths: ["facts.metrics.avgPowerFactor"],
        }),
      ]),
    );
    expect(structuredAgentMocks.run).not.toHaveBeenCalled();
  });

  it("returns scoped chart blocks for contextual chart follow-ups", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message: "圖表呢？",
        history: [
          {
            role: "user",
            content: "今天天氣如何？請不要畫 EnMS 圖表。",
          },
          {
            role: "assistant",
            content: "這是一般問題，不應使用 EnMS scoped facts。",
          },
        ],
        chatPlan: {
          contractVersion: "enms.ai.chat-plan.v2",
          strategy: "single_scoped_facts",
          intent: "site_benchmarking",
          confidence: "high",
          allowDbFacts: true,
          allowGeneralAI: false,
          selectedCapabilities: ["site_benchmarking"],
          primaryPageKey: "bench",
          selectedPageKeys: ["bench"],
          needClarification: false,
          maxContexts: 1,
        },
        scopedFactsBundle: {
          contractVersion: "enms.ai.page-insight.v1",
          factsSchemaVersion: "enms.ai.facts.v1",
          primaryPageKey: "bench",
          contexts: [
            {
              contractVersion: "enms.ai.page-insight.v1",
              factsSchemaVersion: "enms.ai.facts.v1",
              pageKey: "bench",
              status: "ready",
              facts: {
                siteRankings: [
                  { name: "大溪廠", value: 13864.4 },
                  { name: "二廠", value: 8240.2 },
                ],
              },
              evidence: {
                dataSources: ["ai_energy_15m_v1"],
                timeRange: "最近 30 日",
                queryScope: "siteCount=2",
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
    expect(json.answerContract.chatFactsBundle.pageKeys).toEqual(["bench"]);
    expect(json.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "chart",
          chartType: "bar",
          unit: "kWh",
          series: [
            expect.objectContaining({
              key: "facts.siteRankings",
              points: [
                expect.objectContaining({ label: "大溪廠", value: 13864.4 }),
                expect.objectContaining({ label: "二廠", value: 8240.2 }),
              ],
            }),
          ],
        }),
      ]),
    );
    expect(JSON.stringify(json)).not.toContain("無法生成圖表");
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

  it("does not trust scoped context without the ai semantic-view prefix guardrail", async () => {
    const { POST } = await import("./route.js");

    const response = await POST(
      buildRequest(
        {
          message: "請查最近 7 天最大需量",
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
              },
            },
            analysis: {
              summary: "不應顯示這段內容",
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
        },
        undefined,
        { preserveGuardrails: true },
      ),
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
    structuredAgentMocks.enabled.mockReturnValue(true);
    structuredAgentMocks.run.mockResolvedValue({
      blocks: [
        {
          type: "paragraph",
          text: "模型不應追加這段帳單解讀，避免把 exact facts 帶偏。",
        },
      ],
      citations: [],
      confidence: "high",
      intent: "efficiency_analysis",
    });
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
    expect(JSON.stringify(json.blocks)).not.toContain("模型不應追加");
    expect(structuredAgentMocks.run).not.toHaveBeenCalled();
  });

  it("does not answer a requested account absent from scoped facts", async () => {
    structuredAgentMocks.enabled.mockReturnValue(true);
    structuredAgentMocks.run.mockResolvedValue({
      blocks: [{ type: "paragraph", text: "模型不應補不存在的帳單。" }],
      citations: [],
      confidence: "high",
      intent: "efficiency_analysis",
    });
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
            account: { accountNumber: "TEST-PA-001" },
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
    expect(JSON.stringify(json.blocks)).not.toContain("模型不應補");
    expect(structuredAgentMocks.run).not.toHaveBeenCalled();
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
