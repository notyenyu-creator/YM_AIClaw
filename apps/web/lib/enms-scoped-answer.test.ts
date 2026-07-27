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

  it("answers demand questions without summarizing unrelated page content", () => {
    const result = buildEnmsScopedAnswer({
      message: "目前需量和契約容量是多少？有超約風險嗎？",
      context: buildContext(),
    });

    expect(result.answerKind).toBe("demand");
    expect(result.text).toContain("目前需量：82.3 kW");
    expect(result.text).toContain("契約容量：100 kW");
    expect(result.text).toContain("預測尖峰仍低於契約容量 5.5 kW");
    expect(result.text).not.toContain("A 場域用電最高");
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
});
