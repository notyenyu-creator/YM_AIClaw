import { describe, expect, it } from "vitest";
import { buildEnmsAlertGovernance } from "./enms-alert-governance-engine";
import type { EnmsAnomalyDetectionOutput } from "./enms-anomaly-detection-engine";
import type { EnmsDemandForecastOutput } from "./enms-demand-forecast-engine";

function createDemandForecast(): EnmsDemandForecastOutput {
  return {
    status: "ready",
    baselineStrategy: "same_slot_weighted_baseline_plus_recent_trend",
    inputSummary: {
      sampleCount: 24,
      intervalMinutes: 15,
      contractCapacityKw: 90,
      featureCoverage: {
        temperature: true,
        businessLoad: true,
        productionLoad: true,
      },
    },
    projectedPeakKw: 96.4,
    projectedPeakRatio: 1.0711,
    riskLevel: "critical",
    prewarnings: [
      {
        code: "contract_capacity_critical",
        severity: "critical",
        summary: "預測需量已超過契約容量，需立即處理降載或排程調整。",
        recommendedAction: "啟動降載 playbook。",
      },
      {
        code: "rapid_demand_ramp",
        severity: "warning",
        summary: "短時間內需量有明顯抬升趨勢。",
        recommendedAction: "檢查最近大負載啟停。",
      },
    ],
    intervals: [],
    explanation: [],
  };
}

function createAnomalyDetection(): EnmsAnomalyDetectionOutput {
  return {
    status: "ready",
    baselineWindow: {
      summarySamples: 16,
      rawSamples: 40,
    },
    anomalies: [
      {
        code: "low_power_factor",
        severity: "warning",
        category: "power_quality",
        summary: "功率因數偏低。",
        evidence: [],
        recommendedActions: ["檢查無功補償設備。"],
        metrics: {},
      },
      {
        code: "connectivity_dropout",
        severity: "critical",
        category: "availability",
        summary: "最近 raw 訊號有掉點。",
        evidence: [],
        recommendedActions: ["檢查 gateway 連線。"],
        metrics: {},
      },
    ],
    overallSeverity: "critical",
    explanation: [],
  };
}

describe("buildEnmsAlertGovernance", () => {
  it("separates prewarnings from alerts and composes cross-signal risk", () => {
    const result = buildEnmsAlertGovernance({
      demandForecast: createDemandForecast(),
      anomalyDetection: createAnomalyDetection(),
    });

    expect(result.status).toBe("ready");
    expect(result.riskLevel).toBe("critical");
    expect(result.alerts.map((signal) => signal.code)).toContain("contract_capacity_critical");
    expect(result.alerts.map((signal) => signal.code)).toContain("connectivity_dropout");
    expect(result.prewarnings.map((signal) => signal.code)).toContain("rapid_demand_ramp");
    expect(result.prewarnings.map((signal) => signal.code)).toContain("reactive_power_compounding_risk");
    expect(
      result.prewarnings.find((signal) => signal.code === "low_power_factor")?.recommendedOwner,
    ).toBe("electrical_maintenance");
  });
});
