import { describe, expect, it } from "vitest";
import { buildEnmsAnomalyDetection } from "./enms-anomaly-detection-engine";
import type { EnmsRawPoint, EnmsSummaryPoint } from "./enms-analytics-types";

function createSummaryPoints(): EnmsSummaryPoint[] {
  const start = new Date("2026-06-01T01:00:00.000Z").getTime();
  const demand = [61, 62, 63, 64, 66, 94];
  const avgPf = [0.97, 0.97, 0.96, 0.96, 0.95, 0.84];
  const minPf = [0.95, 0.95, 0.94, 0.93, 0.92, 0.76];
  return demand.map((maxDemandKw, index) => ({
    recordedAt: new Date(start + index * 15 * 60_000).toISOString(),
    maxDemandKw,
    avgPowerFactor: avgPf[index],
    minPowerFactor: minPf[index],
  }));
}

function createRawPoints(): EnmsRawPoint[] {
  const start = new Date("2026-06-01T02:00:00.000Z").getTime();
  return Array.from({ length: 10 }, (_, index) => ({
    recordedAt: new Date(start + index * 5 * 60_000).toISOString(),
    psKw: 72 + index,
    pfs: index >= 8 ? 0.82 : 0.95,
    va: 220,
    vb: index >= 8 ? 248 : 221,
    vc: 198,
    ia: 88,
    ib: index >= 8 ? 122 : 90,
    ic: 64,
    connected: index < 4 ? false : true,
    quality: index < 3 ? "bad" : "ok",
    thdVa: index >= 7 ? 12.5 : 3.8,
    thdVb: index >= 7 ? 11.9 : 3.4,
    thdVc: index >= 7 ? 10.8 : 3.2,
    thdIa: index >= 7 ? 8.2 : 2.8,
    thdIb: index >= 7 ? 8.8 : 2.7,
    thdIc: index >= 7 ? 7.9 : 2.6,
  }));
}

describe("buildEnmsAnomalyDetection", () => {
  it("detects demand, power-quality, and availability anomalies from summary and raw signals", () => {
    const result = buildEnmsAnomalyDetection({
      summaryPoints: createSummaryPoints(),
      rawPoints: createRawPoints(),
      contractCapacityKw: 90,
    });

    const codes = result.anomalies.map((anomaly) => anomaly.code);

    expect(result.status).toBe("ready");
    expect(codes).toContain("demand_spike");
    expect(codes).toContain("low_power_factor");
    expect(codes).toContain("contract_capacity_pressure");
    expect(codes).toContain("connectivity_dropout");
    expect(codes).toContain("harmonic_distortion");
    expect(codes).toContain("phase_imbalance");
    expect(codes).toContain("quality_degradation");
    expect(result.overallSeverity).toBe("critical");
  });

  it("reports insufficient data when neither summary nor raw history is usable", () => {
    const result = buildEnmsAnomalyDetection({
      summaryPoints: [{ recordedAt: "2026-06-01T00:00:00.000Z", maxDemandKw: 50 }],
      rawPoints: [{ recordedAt: "2026-06-01T00:05:00.000Z", psKw: 49 }],
    });

    expect(result.status).toBe("insufficient_data");
    expect(result.anomalies).toHaveLength(0);
    expect(result.overallSeverity).toBe("none");
  });
});
