import { afterEach, describe, expect, it, vi } from "vitest";

const DEFAULT_API_KEY = "server-secret";

function buildRequest(body: unknown, headers?: HeadersInit) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Content-Type", "application/json");
  if (!requestHeaders.has("Authorization")) {
    requestHeaders.set("Authorization", `Bearer ${DEFAULT_API_KEY}`);
  }

  return new Request("http://localhost/api/enms/chat/plan", {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
}

function buildGetRequest(headers?: HeadersInit) {
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has("Authorization")) {
    requestHeaders.set("Authorization", `Bearer ${DEFAULT_API_KEY}`);
  }

  return new Request("http://localhost/api/enms/chat/plan", {
    method: "GET",
    headers: requestHeaders,
  });
}

describe("POST /api/enms/chat/plan", () => {
  afterEach(() => {
    delete process.env.ENMS_SEMANTIC_GRAPH_ENABLED;
    delete process.env.ENMS_SEMANTIC_GRAPH_SHADOW;
    delete process.env.ENMS_SEMANTIC_GRAPH_CAPABILITIES;
    delete process.env.ENCLAW_ENMS_MODEL_SEMANTIC_PLANNER_ENABLED;
    delete process.env.ENCLAW_ENMS_PLANNER_MODEL_TRANSPORT;
    delete process.env.ENCLAW_ENMS_PLANNER_MODEL_BASE_URL;
    delete process.env.ENCLAW_ENMS_PLANNER_MODEL_API_KEY;
    delete process.env.ENCLAW_ENMS_PLANNER_MODEL_NAME;
    delete process.env.ENCLAW_ENMS_PLANNER_MODEL_ALLOWED_HOSTS;
    delete process.env.ENCLAW_ENMS_PLANNER_MODEL_TIMEOUT_MS;
    delete process.env.ENCLAW_ENMS_PLANNER_MODEL_MAX_TOKENS;
    vi.unstubAllGlobals();
  });

  it("requires server-to-server authorization for the contract description", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    const { GET } = await import("./route.js");

    const unauthorized = await GET(buildGetRequest({ Authorization: "Bearer wrong" }));
    const authorized = await GET(buildGetRequest());
    const json = await authorized.json();

    expect(unauthorized.status).toBe(401);
    expect(authorized.status).toBe(200);
    expect(json.contract.contractVersion).toBe("enms.ai.chat-plan.v2");
    expect(json.contract.response).toContain("semanticGraph");
    expect(json.contract.optionalResponse).toContain("semanticGraph");
    expect(json.contract.metadataOnly).toContain("semanticGraph");
    expect(json.contract.semanticGraphFields).toEqual(
      expect.arrayContaining([
        "coverage",
        "missingContractKeys",
        "skippedContractKeys",
        "requiredFactPaths",
      ]),
    );
    expect(json.security.apiKeyPolicy).toBe("required");
    expect(json.security.semanticGraphPolicy).toContain("never a data source");
  });

  it("requires server-to-server authorization", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    const { POST } = await import("./route.js");

    const response = await POST(
      buildRequest({ message: "請分析需量" }, { Authorization: "Bearer wrong" }),
    );

    expect(response.status).toBe(401);
  });

  it("routes unrelated questions to general AI without DB facts", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    const { POST } = await import("./route.js");

    const response = await POST(
      buildRequest({ message: "請用一句話解釋什麼是資料治理" }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.strategy).toBe("general_ai");
    expect(json.intent).toBe("general_question");
    expect(json.allowDbFacts).toBe(false);
    expect(json.allowGeneralAI).toBe(true);
    expect(json.selectedPageKeys).toEqual([]);
  });

  it("routes EnMS multi-intent questions to scoped facts bundles", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    const { POST } = await import("./route.js");

    const response = await POST(
      buildRequest({
        message: "最新資料時間，也分析需量超約風險與節能建議",
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.strategy).toBe("multi_scoped_facts_bundle");
    expect(json.allowDbFacts).toBe(true);
    expect(json.primaryPageKey).toBe("nlq");
    expect(json.selectedPageKeys).toEqual(["nlq", "demand", "eff"]);
  });

  it("keeps site benchmarking ahead of generic usage but not ahead of earlier explicit intents", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    const { POST } = await import("./route.js");

    const siteFirstResponse = await POST(
      buildRequest({ message: "用電場域比較一下" }),
    );
    const siteFirstJson = await siteFirstResponse.json();

    expect(siteFirstResponse.status).toBe(200);
    expect(siteFirstJson.primaryPageKey).toBe("bench");
    expect(siteFirstJson.selectedPageKeys[0]).toBe("bench");

    const multiIntentResponse = await POST(
      buildRequest({
        message:
          "最新資料、異常根因、告警治理、場域用電比較、節能電費、需量超約都幫我看",
      }),
    );
    const multiIntentJson = await multiIntentResponse.json();

    expect(multiIntentResponse.status).toBe(200);
    expect(multiIntentJson.primaryPageKey).toBe("nlq");
    expect(multiIntentJson.selectedPageKeys).toEqual([
      "nlq",
      "anomaly",
      "alert",
      "bench",
    ]);
  });

  it("routes regex-only latest-data questions to scoped facts", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    const { POST } = await import("./route.js");

    for (const message of [
      "最近讀值是什麼時間？",
      "最後紀錄時間？",
      "目前 DB 是幾月幾號？",
    ]) {
      const response = await POST(buildRequest({ message }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.strategy).toBe("single_scoped_facts");
      expect(json.allowDbFacts).toBe(true);
      expect(json.primaryPageKey).toBe("nlq");
      expect(json.selectedPageKeys).toEqual(["nlq"]);
    }
  });

  it("uses recent context for short chart follow-ups without widening general questions", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    const { POST } = await import("./route.js");

    const history = [
      {
        role: "user",
        content:
          "請查詢最近 30 天的總用電、最大需量、平均功率因數，並做多場域 benchmarking 排名與差異說明。",
      },
      {
        role: "assistant",
        content:
          "根據 EnMS scoped facts，多場域 benchmarking 顯示大溪廠用電最高。",
      },
    ];
    for (const message of ["圖表呢？", "可以用圖表呈現嗎？", "折線圖"]) {
      const chartFollowUpResponse = await POST(
        buildRequest({
          message,
          history,
        }),
      );
      const chartFollowUpJson = await chartFollowUpResponse.json();

      expect(chartFollowUpResponse.status).toBe(200);
      expect([
        "single_scoped_facts",
        "multi_scoped_facts_bundle",
      ]).toContain(chartFollowUpJson.strategy);
      expect(chartFollowUpJson.allowDbFacts).toBe(true);
      expect(chartFollowUpJson.primaryPageKey).toBe("bench");
      expect(chartFollowUpJson.selectedPageKeys).toContain("bench");
      expect(chartFollowUpJson.selectedCapabilities).toContain(
        "site_benchmarking",
      );
    }

    const weatherResponse = await POST(
      buildRequest({
        message: "今天天氣如何？",
        history,
      }),
    );
    const weatherJson = await weatherResponse.json();

    expect(weatherResponse.status).toBe(200);
    expect(weatherJson.strategy).toBe("general_ai");
    expect(weatherJson.allowDbFacts).toBe(false);
    expect(weatherJson.selectedPageKeys).toEqual([]);
  });

  it("returns answer obligations for composite chart prompts", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    const { POST } = await import("./route.js");
    const response = await POST(
      buildRequest({
        message:
          "請查詢最近 30 天的總用電、最大需量、平均功率因數，並做多場域 benchmarking 排名與差異說明。請幫我每一個都用圖表呈現",
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.allowDbFacts).toBe(true);
    expect(json.answerObligations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "total_energy_30d",
          chartRequired: true,
          unit: "kWh",
        }),
        expect.objectContaining({
          key: "peak_demand_30d",
          chartRequired: true,
          unit: "kW",
        }),
        expect.objectContaining({
          key: "avg_power_factor_30d",
          chartRequired: true,
          unit: "pf",
        }),
        expect.objectContaining({
          key: "site_benchmarking",
          chartRequired: true,
        }),
      ]),
    );
  });

  it("uses the optional model semantic planner only as whitelisted ChatPlan hints", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    process.env.ENCLAW_ENMS_MODEL_SEMANTIC_PLANNER_ENABLED = "1";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_TRANSPORT = "openai-compatible";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_BASE_URL = "http://model.local/v1";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_API_KEY = "planner-secret";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_NAME = "fast-planner";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_ALLOWED_HOSTS = "model.local";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    selectedCapabilities: [
                      "efficiency_advice",
                      "meter_ranking",
                      "anomaly_root_cause",
                      "device_lookup",
                      "unknown_capability",
                    ],
                    selectedPageKeys: ["eff", "nlq", "unknown_page"],
                    answerObligationKeys: [
                      "efficiency_advice",
                      "meter_ranking",
                      "unknown_obligation",
                    ],
                    semanticGoals: [
                      "efficiency_opportunity",
                      "chart_rendering",
                      "unknown_goal",
                    ],
                    requiredFactGroups: [
                      "efficiency_opportunities",
                      "meter_energy_ranking",
                      "power_quality",
                      "unknown_fact_group",
                    ],
                    answerQualityRules: [
                      "must_distinguish_consumption_from_waste",
                      "must_explain_main_meter_is_not_waste",
                      "unknown_rule",
                    ],
                    chartRequested: true,
                    allowDbFacts: true,
                    allowGeneralAI: false,
                    needClarification: false,
                    confidence: "high",
                    reason: "使用者以口語詢問可改善的耗能來源。",
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        )
      ),
    );
    const { POST } = await import("./route.js");

    const response = await POST(
      buildRequest({ message: "哪個設備最會白白燒電？" }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.strategy).toBe("multi_scoped_facts_bundle");
    expect(json.allowDbFacts).toBe(true);
    expect(json.allowGeneralAI).toBe(false);
    expect(json.primaryPageKey).toBe("eff");
    expect(json.selectedCapabilities).toEqual(
      expect.arrayContaining([
        "efficiency_advice",
        "meter_ranking",
        "anomaly_root_cause",
        "device_lookup",
      ]),
    );
    expect(json.selectedCapabilities).not.toContain("unknown_capability");
    expect(json.semanticGoals).toContain("efficiency_opportunity");
    expect(json.requiredFactGroups).toEqual(
      expect.arrayContaining([
        "efficiency_opportunities",
        "meter_energy_ranking",
        "power_quality",
        "chart_series",
      ]),
    );
    expect(json.answerQualityRules).toEqual(
      expect.arrayContaining([
        "must_distinguish_consumption_from_waste",
        "must_explain_main_meter_is_not_waste",
        "must_attach_chart_only_from_verified_facts",
      ]),
    );
    expect(json.sourceOfTruth).toContain("能管語意口徑驗證");
    expect(json.semanticGraph).toMatchObject({
      mode: "enabled",
      applied: true,
      coverage: "complete",
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("lets the semantic model drive the plan through obligations without hard-coded capability wording", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    process.env.ENCLAW_ENMS_MODEL_SEMANTIC_PLANNER_ENABLED = "1";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_TRANSPORT = "openai-compatible";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_BASE_URL = "http://model.local/v1";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_API_KEY = "planner-secret";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_NAME = "fast-planner";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_ALLOWED_HOSTS = "model.local";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    selectedCapabilities: [],
                    answerObligationKeys: ["period_energy_total"],
                    semanticGoals: ["calendar_energy_total"],
                    requiredFactGroups: ["energy_calendar_period"],
                    answerQualityRules: [
                      "must_answer_requested_metric",
                      "must_not_mix_kw_and_kwh",
                      "must_not_use_meter_ranking_for_calendar_total",
                    ],
                    allowDbFacts: true,
                    allowGeneralAI: false,
                    needClarification: false,
                    confidence: "high",
                    reason: "使用者用自然語言要求日曆月份總用電。",
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        )
      ),
    );
    const { POST } = await import("./route.js");

    const response = await POST(
      buildRequest({ message: "幫我加總整個七月吃掉多少電" }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.allowDbFacts).toBe(true);
    expect(json.selectedCapabilities).toContain("period_energy_total");
    expect(json.selectedCapabilities).not.toContain("meter_ranking");
    expect(json.answerObligations).toEqual([
      expect.objectContaining({
        key: "period_energy_total",
        unit: "kWh",
      }),
    ]);
    expect(json.requiredFactGroups).toContain("energy_calendar_period");
  });

  it("normalizes noisy model hints by metric family before building the graph plan", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    process.env.ENCLAW_ENMS_MODEL_SEMANTIC_PLANNER_ENABLED = "1";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_TRANSPORT = "openai-compatible";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_BASE_URL = "http://model.local/v1";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_API_KEY = "planner-secret";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_NAME = "fast-planner";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_ALLOWED_HOSTS = "model.local";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    selectedCapabilities: [
                      "demand_risk",
                      "energy_usage_query",
                      "meter_ranking",
                    ],
                    allowDbFacts: true,
                    allowGeneralAI: false,
                    needClarification: false,
                    confidence: "high",
                    reason: "模型誤把最高需量和用電排行混在一起。",
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        )
      ),
    );
    const { POST } = await import("./route.js");

    const response = await POST(
      buildRequest({ message: "目前廠區中最高需量是多少kW呢？" }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.selectedCapabilities).toContain("demand_risk");
    expect(json.selectedCapabilities).not.toContain("energy_usage_query");
    expect(json.selectedCapabilities).not.toContain("meter_ranking");
    expect(json.answerObligations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "peak_demand_30d",
          unit: "kW",
        }),
      ]),
    );
    expect(json.answerObligations.map((item: { key: string }) => item.key))
      .not.toContain("meter_ranking");
    expect(json.semanticGraph).toMatchObject({
      mode: "enabled",
      applied: true,
      coverage: "complete",
    });
  });

  it("does not let the model semantic planner force DB facts for general questions", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    process.env.ENCLAW_ENMS_MODEL_SEMANTIC_PLANNER_ENABLED = "1";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_TRANSPORT = "openai-compatible";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_BASE_URL = "http://model.local/v1";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_API_KEY = "planner-secret";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_NAME = "fast-planner";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    selectedCapabilities: [],
                    allowDbFacts: false,
                    allowGeneralAI: true,
                    needClarification: false,
                    confidence: "high",
                    reason: "一般天氣問題。",
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        )
      ),
    );
    const { POST } = await import("./route.js");

    const response = await POST(buildRequest({ message: "今天天氣如何？" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.strategy).toBe("general_ai");
    expect(json.allowDbFacts).toBe(false);
    expect(json.allowGeneralAI).toBe(true);
    expect(json.selectedCapabilities).toEqual([]);
    expect(json.selectedPageKeys).toEqual([]);
  });

  it("falls back to the deterministic planner when model hints are low confidence", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    process.env.ENCLAW_ENMS_MODEL_SEMANTIC_PLANNER_ENABLED = "1";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_TRANSPORT = "openai-compatible";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_BASE_URL = "http://model.local/v1";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_API_KEY = "planner-secret";
    process.env.ENCLAW_ENMS_PLANNER_MODEL_NAME = "fast-planner";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    selectedCapabilities: ["meter_ranking"],
                    allowDbFacts: true,
                    allowGeneralAI: false,
                    needClarification: false,
                    confidence: "low",
                    reason: "不確定。",
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        )
      ),
    );
    const { POST } = await import("./route.js");

    const response = await POST(
      buildRequest({ message: "08/10 最高需量是多少呢？" }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.primaryPageKey).toBe("demand");
    expect(json.selectedCapabilities).toContain("daily_peak_demand_point");
    expect(json.selectedCapabilities).not.toContain("meter_ranking");
    expect(json.sourceOfTruth).not.toContain("model semantic planner");
  });

  it("can expose semantic graph metadata in shadow mode without changing routing", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    process.env.ENMS_SEMANTIC_GRAPH_ENABLED = "false";
    process.env.ENMS_SEMANTIC_GRAPH_SHADOW = "true";
    const { POST } = await import("./route.js");

    const response = await POST(
      buildRequest({ message: "8月8號同時段最高是多少kw呢？" }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.allowDbFacts).toBe(true);
    expect(json.selectedCapabilities).toContain("same_slot_demand");
    expect(json.semanticGraph).toMatchObject({
      mode: "shadow",
      applied: false,
      coverage: "complete",
    });
    expect(json.semanticGraph.requiredFactPaths).toEqual(
      expect.arrayContaining([
        "chartSeries.sameSlotDemand",
        "chartSeries.dailyPeakReference",
      ]),
    );
  });

  it("routes demand page chart-specific questions to matching obligations", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    const { POST } = await import("./route.js");

    const monthlyPeakResponse = await POST(
      buildRequest({ message: "本月契約分頁中本月最高需量是哪一天多少kW？" }),
    );
    const monthlyPeakJson = await monthlyPeakResponse.json();
    const dailyConsumptionResponse = await POST(
      buildRequest({ message: "30日總覽分頁中8月8日用電量是多少kWh？" }),
    );
    const dailyConsumptionJson = await dailyConsumptionResponse.json();

    expect(monthlyPeakResponse.status).toBe(200);
    expect(monthlyPeakJson.selectedCapabilities).toContain(
      "monthly_peak_demand_point",
    );
    expect(monthlyPeakJson.answerObligations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "monthly_peak_demand_point",
          pageKey: "demand",
          unit: "kW",
        }),
      ]),
    );

    const dailyPeakResponse = await POST(
      buildRequest({ message: "08/10 最高需量是多少呢？" }),
    );
    const dailyPeakJson = await dailyPeakResponse.json();
    expect(dailyPeakResponse.status).toBe(200);
    expect(dailyPeakJson.selectedCapabilities).toContain(
      "daily_peak_demand_point",
    );
    expect(dailyPeakJson.selectedCapabilities).not.toContain(
      "today_demand_point",
    );
    expect(dailyPeakJson.answerObligations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "daily_peak_demand_point",
          pageKey: "demand",
          unit: "kW",
        }),
      ]),
    );

    expect(dailyConsumptionResponse.status).toBe(200);
    expect(dailyConsumptionJson.selectedCapabilities).toContain(
      "daily_consumption_point",
    );
    expect(dailyConsumptionJson.answerObligations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "daily_consumption_point",
          pageKey: "demand",
          unit: "kWh",
        }),
      ]),
    );
  });

  it("routes efficiency page power factor questions to eff facts instead of anomaly facts", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    const { POST } = await import("./route.js");

    const response = await POST(
      buildRequest({ message: "能效節能挖掘分頁功率因數正常嗎？" }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.primaryPageKey).toBe("eff");
    expect(json.selectedPageKeys).toEqual(["eff"]);
    expect(json.selectedCapabilities).toContain("efficiency_power_factor");
    expect(json.selectedCapabilities).not.toContain("anomaly_root_cause");
    expect(json.answerObligations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "efficiency_power_factor",
          pageKey: "eff",
          unit: "pf",
        }),
      ]),
    );
  });

  it("supports semantic graph controlled enable allowlist at route level", async () => {
    process.env.ENCLAW_ENMS_API_KEY = DEFAULT_API_KEY;
    process.env.ENMS_SEMANTIC_GRAPH_ENABLED = "true";
    process.env.ENMS_SEMANTIC_GRAPH_CAPABILITIES = "same_slot_demand";
    const { POST } = await import("./route.js");

    const enabledResponse = await POST(
      buildRequest({ message: "8月8號同時段最高是多少kw呢？" }),
    );
    const enabledJson = await enabledResponse.json();
    const blockedResponse = await POST(
      buildRequest({ message: "哪個迴路最費電？" }),
    );
    const blockedJson = await blockedResponse.json();

    expect(enabledResponse.status).toBe(200);
    expect(enabledJson.semanticGraph).toMatchObject({
      mode: "enabled",
      applied: true,
      coverage: "complete",
      selectedCapabilities: ["same_slot_demand"],
    });

    expect(blockedResponse.status).toBe(200);
    expect(blockedJson.allowDbFacts).toBe(true);
    expect(blockedJson.semanticGraph).toMatchObject({
      mode: "fallback",
      applied: false,
      coverage: "none",
    });
  });
});
