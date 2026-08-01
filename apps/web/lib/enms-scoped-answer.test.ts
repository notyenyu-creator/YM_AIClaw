import { describe, expect, it } from "vitest";

import {
  buildEnmsScopedAnswer,
  type EnmsScopedAnswerContext,
} from "./enms-scoped-answer";

function buildContext(
  overrides: Partial<EnmsScopedAnswerContext> = {},
): EnmsScopedAnswerContext {
  return {
    pageKey: "eff",
    status: "ready",
    updatedAt: "2026-07-25T08:00:00.000Z",
    facts: {
      latestDataAt: "2026-07-22T02:00:00.000Z",
      sampleCount: 96,
      meterCount: 4,
      metrics: {
        currentDemandKw: 82.3,
        peakDemandKw: 91.2,
        projectedPeakDemandKw: 94.5,
        contractCapacityKw: 100,
        totalConsumptionKwh30d: 12345.6,
        averagePowerFactor: 0.93,
        latestBillMonth: "11506",
        latestBillAmountNtd: 45678,
        latestBillUsageKwh: 10987,
        averageRateNtdPerKwh: 4.157,
      },
      siteRankings: [
        { name: "A 場域", value: 2000 },
        { name: "B 場域", value: 1200 },
      ],
      deviceMappings: [
        {
          label: "冰機 CH1 電源 · MAC-A / 位址 2 / 迴路 1",
          meterId: "101",
          deviceAlias: "冰機 CH1 電源",
          deviceName: "M2100",
          macAddress: "MAC-A",
          address: "2",
          circuitSeq: 1,
          meterRole: "Sub",
          accountNumber: "04043717102",
          siteName: "阿里山",
          identityKey: "MAC-A|2|1",
        },
        {
          label: "空壓機電源 · MAC-B / 位址 4 / 迴路 1",
          meterId: "102",
          deviceAlias: "空壓機電源",
          deviceName: "PM210",
          macAddress: "MAC-B",
          address: "4",
          circuitSeq: 1,
          meterRole: "Main",
          accountNumber: "04043717102",
          siteName: "阿里山",
          identityKey: "MAC-B|4|1",
        },
      ],
      siteMetadata: {
        companyNo: "COMPANY-A",
        companyName: "屏榮食品股份有限公司",
        currentSiteId: "site001",
        currentSite: {
          siteId: "site001",
          siteName: "大溪廠",
          companyNo: "COMPANY-A",
        },
        authorizedSites: [
          {
            siteId: "site001",
            siteName: "大溪廠",
            companyNo: "COMPANY-A",
          },
        ],
        meterCount: 25,
      },
      account: {
        accountNumber: "04043717102",
      },
    },
    analysis: {
      summary: "授權資料摘要",
      findings: ["A 場域用電最高。"],
      recommendations: ["先檢查高負載時段。"],
    },
    cards: [],
    chartSeries: [],
    evidence: {
      dataSources: ["ai_energy_15m_view"],
      timeRange: "2026-06-26 00:00 至 2026-07-25 23:59",
      queryScope: "siteCount=2 / accountCount=1",
      confidence: "high",
      generatedAt: "2026-07-25T08:00:00.000Z",
    },
    missingData: [],
    ...overrides,
  };
}

describe("buildEnmsScopedAnswer", () => {
  it("answers billing questions from exact scoped bill facts", () => {
    const result = buildEnmsScopedAnswer({
      message: "最近一期帳單金額、月份和用電量是多少？",
      context: buildContext(),
    });

    expect(result.answerKind).toBe("billing");
    expect(result.text).toContain("11506");
    expect(result.text).toContain("45,678 NTD");
    expect(result.text).toContain("10,987 kWh");
    expect(result.matchedFactPaths).toContain(
      "facts.metrics.latestBillAmountNtd",
    );
  });

  it("answers current site metadata from scoped facts instead of general AI", () => {
    const result = buildEnmsScopedAnswer({
      message: "你可以幫我看看目前案場名稱是什麼嗎？",
      context: buildContext({ pageKey: "nlq" }),
    });

    expect(result.answerKind).toBe("site_metadata");
    expect(result.text).toContain("屏榮食品股份有限公司");
    expect(result.text).toContain("大溪廠");
    expect(result.text).toContain("授權電表迴路數：25");
    expect(result.matchedFactPaths).toContain("facts.siteMetadata");
  });

  it("prioritizes current site when multiple authorized sites exist", () => {
    const result = buildEnmsScopedAnswer({
      message: "目前案場名稱是什麼？",
      context: buildContext({
        pageKey: "nlq",
        facts: {
          ...buildContext().facts,
          siteMetadata: {
            companyNo: "COMPANY-A",
            companyName: "測試公司",
            currentSiteId: "SITE-B",
            currentSite: {
              siteId: "SITE-B",
              siteName: "目前場域",
              companyNo: "COMPANY-A",
            },
            authorizedSites: [
              {
                siteId: "SITE-A",
                siteName: "其他場域",
                companyNo: "COMPANY-A",
              },
              {
                siteId: "SITE-B",
                siteName: "目前場域",
                companyNo: "COMPANY-A",
              },
            ],
            meterCount: 3,
          },
        },
      }),
    });

    expect(result.answerKind).toBe("site_metadata");
    expect(result.text).toContain("目前場域 / 案場：目前場域");
    expect(result.text).toContain("授權可見場域數：2");
    expect(result.text).toContain("其他場域");
  });

  it("answers requested account billing from bill details instead of global metrics", () => {
    const result = buildEnmsScopedAnswer({
      message: "請查電號 04043717102 最近帳單",
      context: buildContext({
        facts: {
          ...buildContext().facts,
          billDetails: [
            {
              accountNumber: "99999999999",
              billingMonth: "11506",
              totalAmountNtd: 99999,
              usageKwh: 9999,
              averageRateNtdPerKwh: 10,
            },
            {
              accountNumber: "04043717102",
              billingMonth: "11507",
              totalAmountNtd: 12345,
              usageKwh: 678,
              averageRateNtdPerKwh: 18.208,
            },
          ],
          metrics: {
            latestBillMonth: "11506",
            latestBillAmountNtd: 45678,
            latestBillUsageKwh: 10987,
            averageRateNtdPerKwh: 4.157,
          },
        },
      }),
    });

    expect(result.answerKind).toBe("billing");
    expect(result.text).toContain("電號：04043717102");
    expect(result.text).toContain("最近一期帳單月份：11507");
    expect(result.text).toContain("12,345 NTD");
    expect(result.text).toContain("678 kWh");
    expect(result.text).not.toContain("99,999 NTD");
    expect(result.text).not.toContain("45,678 NTD");
    expect(result.matchedFactPaths).toContain("facts.billDetails.accountNumber");
  });

  it("does not answer a requested account bill from another account detail", () => {
    const result = buildEnmsScopedAnswer({
      message: "請查電號 88888888888 最近帳單",
      context: buildContext({
        facts: {
          ...buildContext().facts,
          billDetails: [
            {
              accountNumber: "04043717102",
              billingMonth: "11507",
              totalAmountNtd: 12345,
              usageKwh: 678,
            },
          ],
        },
      }),
    });

    expect(result.answerKind).toBe("missing");
    expect(result.text).toContain("電號 88888888888");
    expect(result.text).not.toContain("12,345 NTD");
  });

  it("answers demand questions without summarizing unrelated page content", () => {
    const result = buildEnmsScopedAnswer({
      message: "目前需量和契約容量是多少？有超約風險嗎？",
      context: buildContext(),
    });

    expect(result.answerKind).toBe("demand");
    expect(result.text).toContain("目前需量：82.3 kW");
    expect(result.text).toContain("契約容量：100 kW");
    expect(result.text).toContain("趨勢推估尖峰仍低於契約容量 5.5 kW");
    expect(result.text).not.toContain("預測尖峰");
    expect(result.text).not.toContain("A 場域用電最高");
  });

  it("prioritizes device lookup over demand when a multi-intent question names a circuit", () => {
    const result = buildEnmsScopedAnswer({
      message: "迴路1 是對應哪個設備，也請說明需量超約風險",
      context: buildContext(),
    });

    expect(result.answerKind).toBe("device_lookup");
    expect(result.text).toContain("冰機 CH1 電源");
    expect(result.text).toContain("空壓機電源");
    expect(result.text).not.toContain("目前需量：82.3 kW");
  });

  it("prioritizes meter ranking over demand when a multi-intent question asks the most energy-consuming circuit", () => {
    const result = buildEnmsScopedAnswer({
      message: "哪個迴路最費電，也請說明需量超約風險",
      context: buildContext({
        facts: {
          ...buildContext().facts,
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
      }),
    });

    expect(result.answerKind).toBe("ranking");
    expect(result.text).toContain("冰機 CH1 電源");
    expect(result.text).toContain("3,420 kWh");
    expect(result.text).not.toContain("目前需量：82.3 kW");
  });

  it("answers circuit peak demand ranking in kW, not kWh consumption", () => {
    const result = buildEnmsScopedAnswer({
      message: "哪個迴路最高需量？",
      context: buildContext({
        facts: {
          ...buildContext().facts,
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
            {
              label: "空壓機電源 · MAC-B / 位址 4 / 迴路 1",
              consumptionKwh: 9999,
              peakDemandKw: 45.6,
              macAddress: "MAC-B",
              address: "4",
              circuitSeq: 1,
              identityKey: "MAC-B|4|1",
            },
          ],
        },
      }),
    });

    expect(result.answerKind).toBe("ranking");
    expect(result.text).toContain("冰機 CH1 電源");
    expect(result.text).toContain("91.2 kW");
    expect(result.text).not.toContain("9,999 kWh");
    expect(result.matchedFactPaths).toContain(
      "facts.meterRankingDetails.peakDemandKw",
    );
  });

  it("does not let missing billing facts hide available meter ranking facts", () => {
    const result = buildEnmsScopedAnswer({
      message: "哪個迴路最費電，也看最近帳單",
      context: buildContext({
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
      }),
    });

    expect(result.answerKind).toBe("ranking");
    expect(result.text).toContain("冰機 CH1 電源");
    expect(result.text).toContain("3,420 kWh");
    expect(result.text).not.toContain("台電帳單 / 費率");
  });

  it("answers a requested ranking position from scoped ranking facts", () => {
    const result = buildEnmsScopedAnswer({
      message: "場域用電排名第 2 名是誰？",
      context: buildContext(),
    });

    expect(result.answerKind).toBe("ranking");
    expect(result.text).toContain("#2 B 場域：1,200");
    expect(result.text).not.toContain("A 場域：2,000");
  });

  it("adds a safe chart block for explicit EnMS benchmarking chart requests", () => {
    const result = buildEnmsScopedAnswer({
      message: "請查最近 30 天多場域 benchmarking 排名，請用圖表呈現",
      context: buildContext({ pageKey: "bench" }),
    });

    expect(result.answerKind).toBe("ranking");
    expect(result.matchedFactPaths).toContain("facts.siteRankings");
    expect(result.blocks).toEqual([
      expect.objectContaining({
        type: "chart",
        chartType: "bar",
        unit: "kWh",
        series: [
          expect.objectContaining({
            key: "facts.siteRankings",
            points: [
              expect.objectContaining({ label: "A 場域", value: 2000 }),
              expect.objectContaining({ label: "B 場域", value: 1200 }),
            ],
          }),
        ],
      }),
    ]);
  });

  it("keeps benchmarking chart output for mixed energy, demand, and power-factor requests", () => {
    const result = buildEnmsScopedAnswer({
      message:
        "請查詢最近 30 天的總用電、最大需量、平均功率因數，並做多場域 benchmarking 排名與差異說明。請用圖表呈現",
      context: buildContext({ pageKey: "bench" }),
    });

    expect(result.answerKind).toBe("ranking");
    expect(result.matchedFactPaths).toContain("facts.siteRankings");
    expect(result.text).toContain("#1 A 場域：2,000 kWh");
    expect(result.blocks).toEqual([
      expect.objectContaining({
        type: "chart",
        chartType: "bar",
        unit: "kWh",
        series: [
          expect.objectContaining({
            key: "facts.siteRankings",
            points: [
              expect.objectContaining({ label: "A 場域", value: 2000 }),
              expect.objectContaining({ label: "B 場域", value: 1200 }),
            ],
          }),
        ],
      }),
    ]);
  });

  it("prioritizes meter ranking facts for circuit consumption questions", () => {
    const result = buildEnmsScopedAnswer({
      message: "哪個迴路最費電？",
      context: buildContext({
        facts: {
          siteRankings: [
            { name: "A 場域", value: 2000 },
            { name: "B 場域", value: 1200 },
          ],
          ranking: [
            { name: "MAC-A / 位址 2 / 迴路 1", value: 3420 },
            { name: "MAC-B / 位址 4 / 迴路 1", value: 2150 },
          ],
        },
      }),
    });

    expect(result.answerKind).toBe("ranking");
    expect(result.text).toContain("#1 MAC-A / 位址 2 / 迴路 1：3,420 kWh");
    expect(result.text).not.toContain("A 場域");
  });

  it("uses meter ranking details before legacy ranking labels", () => {
    const result = buildEnmsScopedAnswer({
      message: "哪個迴路最費電？",
      context: buildContext({
        facts: {
          meterRankingDetails: [
            {
              name: "冰機 CH1 電源 · MAC-A / 位址 2 / 迴路 1",
              value: 3420,
              macAddress: "MAC-A",
              address: "2",
              circuitSeq: 1,
              identityKey: "MAC-A|2|1",
            },
          ],
          ranking: [
            { name: "舊排行 Label", value: 9999 },
          ],
        },
      }),
    });

    expect(result.answerKind).toBe("ranking");
    expect(result.matchedFactPaths).toContain("facts.meterRankingDetails");
    expect(result.text).toContain("冰機 CH1 電源 · MAC-A / 位址 2 / 迴路 1");
    expect(result.text).not.toContain("舊排行 Label");
  });

  it("answers device lookup questions from scoped meter mappings, not kWh ranking", () => {
    const result = buildEnmsScopedAnswer({
      message: "迴路1 是對應哪個設備？",
      context: buildContext({ pageKey: "nlq" }),
    });

    expect(result.answerKind).toBe("device_lookup");
    expect(result.text).toContain("迴路 1");
    expect(result.text).toContain("冰機 CH1 電源");
    expect(result.text).toContain("空壓機電源");
    expect(result.text).toContain("MAC-A");
    expect(result.text).toContain("位址 2");
    expect(result.text).toContain("迴路 1");
    expect(result.text).not.toContain("ElectricityMeter.Id");
    expect(result.text).not.toContain("ElectricityMeter.Id 101");
    expect(result.text).not.toContain("ElectricityMeter.Id 102");
    expect(result.text).not.toContain("kWh");
    expect(result.text).not.toContain("#1");
    expect(result.matchedFactPaths).toContain("facts.deviceMappings");
  });

  it("answers main meter lookup by filtering scoped meter role", () => {
    const result = buildEnmsScopedAnswer({
      message: "主電表是哪個？",
      context: buildContext({ pageKey: "nlq" }),
    });

    expect(result.answerKind).toBe("device_lookup");
    expect(result.text).toContain("主電表共 1 筆");
    expect(result.text).toContain("空壓機電源");
    expect(result.text).toContain("角色 Main");
    expect(result.text).toContain("MAC-B");
    expect(result.text).not.toContain("冰機 CH1 電源");
    expect(result.text).not.toContain("角色 Sub");
    expect(result.text).not.toContain("kWh");
    expect(result.matchedFactPaths).toContain("facts.deviceMappings");
  });

  it("verifies a requested account number against scoped facts", () => {
    const result = buildEnmsScopedAnswer({
      message: "電號 04043717102 的資料有在這次範圍嗎？",
      context: buildContext(),
    });

    expect(result.answerKind).toBe("account");
    expect(result.text).toContain("包含電號 04043717102");
  });

  it("does not claim an account number that scoped facts do not contain", () => {
    const result = buildEnmsScopedAnswer({
      message: "請查電號 99999999999",
      context: buildContext(),
    });

    expect(result.answerKind).toBe("missing");
    expect(result.text).toContain("沒有足夠的電號 99999999999");
    expect(result.text).toContain("不能用其他場域、全域 DB");
  });

  it("answers time-range questions with Taipei update time", () => {
    const result = buildEnmsScopedAnswer({
      message: "這份資料的時間範圍和更新時間？",
      context: buildContext(),
    });

    expect(result.answerKind).toBe("time_range");
    expect(result.text).toContain("2026-06-26 00:00 至 2026-07-25 23:59");
    expect(result.text).toContain("2026/7/25 16:00:00");
  });

  it("answers latest data timestamp from scoped facts instead of page summary", () => {
    const result = buildEnmsScopedAnswer({
      message: "最新的一筆資料是幾月幾號？",
      context: buildContext(),
    });

    expect(result.answerKind).toBe("time_range");
    expect(result.text).toContain(
      "最新一筆 EnMS 時序資料時間：2026/7/22 10:00:00",
    );
    expect(result.text).toContain("本次 facts 樣本數：96 筆");
    expect(result.matchedFactPaths).toContain("facts.latestDataAt");
    expect(result.text).not.toContain("授權資料摘要");
  });

  it("does not treat general date wording as latest EnMS data timestamp", () => {
    const result = buildEnmsScopedAnswer({
      message: "今天是幾月幾號？",
      context: buildContext(),
    });

    expect(result.answerKind).not.toBe("time_range");
    expect(result.matchedFactPaths).not.toContain("facts.latestDataAt");
    expect(result.text).not.toContain("最新一筆 EnMS 時序資料時間");
  });

  it("answers latest data timestamp even when the question mentions an account number", () => {
    const result = buildEnmsScopedAnswer({
      message: "電號 04043717102 最新的一筆資料是幾月幾號？",
      context: buildContext(),
    });

    expect(result.answerKind).toBe("time_range");
    expect(result.text).toContain(
      "最新一筆 EnMS 時序資料時間：2026/7/22 10:00:00",
    );
    expect(result.text).not.toContain("包含電號 04043717102");
  });

  it("answers latest data timestamp from an empty scoped context when EnMS provides the fact", () => {
    const result = buildEnmsScopedAnswer({
      message: "目前 DB 最新一筆資料是幾月幾號？",
      context: buildContext({
        status: "empty",
        analysis: {
          summary: "最近 7 日沒有可供圖表分析的資料。",
          findings: [],
          recommendations: [],
        },
        chartSeries: [],
        cards: [],
        missingData: [
          {
            key: "recentSummaryWindow",
            message: "最近 7 日沒有可供圖表分析的資料。",
          },
        ],
      }),
    });

    expect(result.answerKind).toBe("time_range");
    expect(result.text).toContain(
      "最新一筆 EnMS 時序資料時間：2026/7/22 10:00:00",
    );
    expect(result.text).not.toContain("沒有足夠");
  });

  it("fails closed when the requested bill facts are missing", () => {
    const context = buildContext({
      facts: {
        metrics: {
          totalConsumptionKwh30d: 1000,
        },
      },
      missingData: [
        {
          key: "taipowerBills",
          message: "缺少台電帳單資料。",
        },
      ],
    });
    const result = buildEnmsScopedAnswer({
      message: "最近一期帳單多少？",
      context,
    });

    expect(result.answerKind).toBe("missing");
    expect(result.text).toContain("缺少台電帳單資料");
    expect(result.text).not.toContain("授權資料摘要");
  });

  it("reports only billing-related missing data for bill questions", () => {
    const result = buildEnmsScopedAnswer({
      message: "上個月電費多少？",
      context: buildContext({
        facts: {
          metrics: {
            latestDataAt: "2026-07-22T02:00:00.000Z",
          },
        },
        missingData: [
          {
            key: "taipowerBills",
            message: "缺少台電帳單資料。",
          },
          {
            key: "carbonToday",
            message: "今天沒有可用用電資料，不能計算本日碳排。",
          },
          {
            key: "productionBaseline",
            message: "缺產量 / 人流 / 營業時段資料，單位能耗與 ROI 仍屬粗估。",
          },
        ],
      }),
    });

    expect(result.answerKind).toBe("missing");
    expect(result.text).toContain("缺少台電帳單資料");
    expect(result.text).not.toContain("本日碳排");
    expect(result.text).not.toContain("產量 / 人流");
  });

  it("answers efficiency advice from kWh saving when bill amount is unavailable", () => {
    const result = buildEnmsScopedAnswer({
      message: "可以給我一個省電建議嗎？",
      context: buildContext({
        facts: {
          metrics: {
            quickWinSavingKwh: 617.28,
          },
        },
        missingData: [
          {
            key: "taipowerBills",
            message: "缺台電帳單平均電價。",
          },
        ],
      }),
    });

    expect(result.answerKind).toBe("metric");
    expect(result.text).toContain("5% what-if 年化節電量：617.28 kWh");
    expect(result.text).not.toContain("5% what-if 年化金額");
    expect(result.matchedFactPaths).toContain(
      "facts.metrics.quickWinSavingKwh",
    );
  });

  it("answers efficiency advice from scoped opportunities when saving metrics are unavailable", () => {
    const result = buildEnmsScopedAnswer({
      message: "請提供節能改善建議",
      context: buildContext({
        facts: {
          metrics: {
            totalConsumptionKwh30d: 12345.6,
          },
          opportunities: [
            {
              name: "夜間基載",
              value: 72,
              note: "非營業時段仍有長時間運轉負載，建議先盤點排程。",
            },
          ],
        },
      }),
    });

    expect(result.answerKind).toBe("summary");
    expect(result.text).toContain("可驗證節能線索");
    expect(result.text).toContain("夜間基載（指標分數 72）");
    expect(result.text).toContain("非營業時段仍有長時間運轉負載");
    expect(result.matchedFactPaths).toContain("facts.opportunities");
  });
});
