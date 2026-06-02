import { describe, expect, it } from "vitest";
import { buildEnmsDemandForecast } from "./enms-demand-forecast-engine";
import type { EnmsSummaryPoint } from "./enms-analytics-types";

function createSummarySeries(values: number[], withContractCapacity = true): EnmsSummaryPoint[] {
  const start = new Date("2026-06-01T08:00:00.000Z").getTime();
  return values.map((maxDemandKw, index) => ({
    recordedAt: new Date(start + index * 15 * 60_000).toISOString(),
    maxDemandKw,
    totalConsumptionKwh: Number((maxDemandKw * 0.21).toFixed(2)),
    avgPowerFactor: 0.96,
    minPowerFactor: 0.92,
    contractCapacityKw: withContractCapacity ? 90 : null,
    temperatureC: 28 + index * 0.2,
    businessLoadIndex: 0.74 + index * 0.02,
    productionLoadIndex: 0.7 + index * 0.025,
  }));
}

describe("buildEnmsDemandForecast", () => {
  it("builds statistical demand prewarnings against contract capacity", () => {
    const summaryPoints = createSummarySeries([70, 72, 74, 76, 78, 82, 86, 90, 93, 95, 97, 99]);

    const result = buildEnmsDemandForecast({
      summaryPoints,
      forecastHorizonIntervals: 4,
    });

    expect(result.status).toBe("ready");
    expect(result.intervals).toHaveLength(4);
    expect(result.projectedPeakKw).not.toBeNull();
    expect(result.projectedPeakRatio).not.toBeNull();
    expect(["warning", "critical"]).toContain(result.riskLevel);
    expect(
      result.prewarnings.some((warning) =>
        ["contract_capacity_warning", "contract_capacity_critical"].includes(warning.code),
      ),
    ).toBe(true);
    expect(result.explanation.join(" ")).toContain("統計型預警模組");
  });

  it("does not fabricate contract-capacity risk when capacity semantics are unavailable", () => {
    const summaryPoints = createSummarySeries([68, 69, 70, 72, 73, 75, 77, 79, 81, 83, 85, 87], false);

    const result = buildEnmsDemandForecast({
      summaryPoints,
      forecastHorizonIntervals: 3,
    });

    expect(result.status).toBe("ready");
    expect(result.inputSummary.contractCapacityKw).toBeNull();
    expect(result.projectedPeakKw).not.toBeNull();
    expect(result.projectedPeakRatio).toBeNull();
    expect(result.riskLevel).toBe("unknown");
    expect(
      result.prewarnings.some((warning) => warning.code.startsWith("contract_capacity_")),
    ).toBe(false);
  });

  it("returns insufficient history when the summary window is too short", () => {
    const result = buildEnmsDemandForecast({
      summaryPoints: createSummarySeries([72, 74, 75, 76, 78, 79, 80]),
    });

    expect(result.status).toBe("insufficient_history");
    expect(result.intervals).toHaveLength(0);
    expect(result.riskLevel).toBe("unknown");
  });
});
