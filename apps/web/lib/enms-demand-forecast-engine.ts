import type {
  EnmsRiskLevel,
  EnmsSignalSeverity,
  EnmsSummaryPoint,
} from "./enms-analytics-types";
import {
  asTimestampMs,
  average,
  clamp,
  inferIntervalMinutes,
  isWeekend,
  mad,
  maxOrNull,
  median,
  minuteOfDay,
  percentageDelta,
} from "./enms-analytics-utils";

type NormalizedSummaryPoint = {
  recordedAtMs: number;
  maxDemandKw: number;
  totalConsumptionKwh: number | null;
  avgPowerFactor: number | null;
  minPowerFactor: number | null;
  contractCapacityKw: number | null;
  temperatureC: number | null;
  businessLoadIndex: number | null;
  productionLoadIndex: number | null;
};

export type EnmsDemandForecastPrewarning = {
  code:
    | "contract_capacity_watch"
    | "contract_capacity_warning"
    | "contract_capacity_critical"
    | "rapid_demand_ramp";
  severity: EnmsSignalSeverity;
  summary: string;
  recommendedAction: string;
};

export type EnmsDemandForecastInterval = {
  slotStartIso: string;
  predictedDemandKw: number;
  lowerBoundKw: number;
  upperBoundKw: number;
  confidence: "low" | "medium" | "high";
  basis: {
    matchedSamples: number;
    sameSlotSamples: number;
    trendComponentKw: number;
    weatherAdjustmentRatio: number;
    businessAdjustmentRatio: number;
    productionAdjustmentRatio: number;
  };
};

export type EnmsDemandForecastOutput = {
  status: "ready" | "insufficient_history";
  baselineStrategy: string;
  inputSummary: {
    sampleCount: number;
    intervalMinutes: number;
    contractCapacityKw: number | null;
    featureCoverage: {
      temperature: boolean;
      businessLoad: boolean;
      productionLoad: boolean;
    };
  };
  projectedPeakKw: number | null;
  projectedPeakRatio: number | null;
  riskLevel: EnmsRiskLevel;
  prewarnings: EnmsDemandForecastPrewarning[];
  intervals: EnmsDemandForecastInterval[];
  explanation: string[];
};

export type EnmsDemandForecastInput = {
  summaryPoints: EnmsSummaryPoint[];
  contractCapacityKw?: number | null;
  forecastHorizonIntervals?: number;
  expectedIntervalMinutes?: number;
  now?: string | number | Date;
};

function normalizeSummaryPoints(points: EnmsSummaryPoint[]): NormalizedSummaryPoint[] {
  return points
    .map((point) => {
      const recordedAtMs = asTimestampMs(point.recordedAt);
      const maxDemandKw =
        typeof point.maxDemandKw === "number" && Number.isFinite(point.maxDemandKw)
          ? point.maxDemandKw
          : null;
      if (recordedAtMs === null || maxDemandKw === null) {
        return null;
      }
      return {
        recordedAtMs,
        maxDemandKw,
        totalConsumptionKwh:
          typeof point.totalConsumptionKwh === "number" && Number.isFinite(point.totalConsumptionKwh)
            ? point.totalConsumptionKwh
            : null,
        avgPowerFactor:
          typeof point.avgPowerFactor === "number" && Number.isFinite(point.avgPowerFactor)
            ? point.avgPowerFactor
            : null,
        minPowerFactor:
          typeof point.minPowerFactor === "number" && Number.isFinite(point.minPowerFactor)
            ? point.minPowerFactor
            : null,
        contractCapacityKw:
          typeof point.contractCapacityKw === "number" && Number.isFinite(point.contractCapacityKw)
            ? point.contractCapacityKw
            : null,
        temperatureC:
          typeof point.temperatureC === "number" && Number.isFinite(point.temperatureC)
            ? point.temperatureC
            : null,
        businessLoadIndex:
          typeof point.businessLoadIndex === "number" && Number.isFinite(point.businessLoadIndex)
            ? point.businessLoadIndex
            : null,
        productionLoadIndex:
          typeof point.productionLoadIndex === "number" && Number.isFinite(point.productionLoadIndex)
            ? point.productionLoadIndex
            : null,
      };
    })
    .filter((point): point is NormalizedSummaryPoint => point !== null)
    .sort((left, right) => left.recordedAtMs - right.recordedAtMs);
}

function resolveRiskLevel(projectedPeakRatio: number | null): EnmsRiskLevel {
  if (projectedPeakRatio === null) {
    return "unknown";
  }
  if (projectedPeakRatio >= 1) {
    return "critical";
  }
  if (projectedPeakRatio >= 0.95) {
    return "warning";
  }
  if (projectedPeakRatio >= 0.85) {
    return "watch";
  }
  return "safe";
}

function resolveConfidence(sameSlotSamples: number, totalSamples: number): "low" | "medium" | "high" {
  if (sameSlotSamples >= 6 && totalSamples >= 24) {
    return "high";
  }
  if (sameSlotSamples >= 3 && totalSamples >= 12) {
    return "medium";
  }
  return "low";
}

export function buildEnmsDemandForecast(
  input: EnmsDemandForecastInput,
): EnmsDemandForecastOutput {
  const points = normalizeSummaryPoints(input.summaryPoints);
  const timestamps = points.map((point) => point.recordedAtMs);
  const intervalMinutes = input.expectedIntervalMinutes ?? inferIntervalMinutes(timestamps);
  const contractCapacityKw =
    typeof input.contractCapacityKw === "number" && Number.isFinite(input.contractCapacityKw)
      ? input.contractCapacityKw
      : points
          .map((point) => point.contractCapacityKw)
          .reduce<number | null>((resolved, value) => {
            if (resolved !== null) {
              return resolved;
            }
            return value ?? null;
          }, null);

  const featureCoverage = {
    temperature: points.some((point) => point.temperatureC !== null),
    businessLoad: points.some((point) => point.businessLoadIndex !== null),
    productionLoad: points.some((point) => point.productionLoadIndex !== null),
  };

  if (points.length < 8) {
    return {
      status: "insufficient_history",
      baselineStrategy: "same_slot_weighted_baseline_plus_recent_trend",
      inputSummary: {
        sampleCount: points.length,
        intervalMinutes,
        contractCapacityKw,
        featureCoverage,
      },
      projectedPeakKw: null,
      projectedPeakRatio: null,
      riskLevel: "unknown",
      prewarnings: [],
      intervals: [],
      explanation: [
        "歷史摘要資料不足，至少需要 8 筆以上 summary records 才能做出可信的需量預警。",
      ],
    };
  }

  const horizonIntervals = Math.max(1, Math.min(input.forecastHorizonIntervals ?? 4, 16));
  const latestPoint = points[points.length - 1];
  const recentWindow = points.slice(-8);
  const trendRecentAvg = average(recentWindow.slice(-4).map((point) => point.maxDemandKw));
  const trendOlderAvg = average(recentWindow.slice(0, 4).map((point) => point.maxDemandKw));
  const trendComponentKw =
    trendRecentAvg !== null && trendOlderAvg !== null
      ? (trendRecentAvg - trendOlderAvg) * 0.35
      : 0;

  const recentTemperature = average(
    recentWindow
      .map((point) => point.temperatureC)
      .filter((value): value is number => value !== null),
  );
  const recentBusinessLoad = average(
    recentWindow
      .map((point) => point.businessLoadIndex)
      .filter((value): value is number => value !== null),
  );
  const recentProductionLoad = average(
    recentWindow
      .map((point) => point.productionLoadIndex)
      .filter((value): value is number => value !== null),
  );

  const intervals: EnmsDemandForecastInterval[] = [];
  for (let offset = 1; offset <= horizonIntervals; offset += 1) {
    const futureTs =
      latestPoint.recordedAtMs + offset * intervalMinutes * 60_000;
    const futureMinute = minuteOfDay(futureTs);
    const futureWeekend = isWeekend(futureTs);

    const sameSlot = points.filter(
      (point) =>
        minuteOfDay(point.recordedAtMs) === futureMinute
        && isWeekend(point.recordedAtMs) === futureWeekend,
    );
    const closeSlot = points.filter(
      (point) =>
        Math.abs(minuteOfDay(point.recordedAtMs) - futureMinute) <= intervalMinutes
        && isWeekend(point.recordedAtMs) === futureWeekend,
    );
    const fallbackWindow = points.slice(-12);
    const baselineCandidates =
      sameSlot.length >= 3
        ? sameSlot
        : closeSlot.length >= 3
          ? closeSlot
          : fallbackWindow;
    const baselineValues = baselineCandidates.map((point) => point.maxDemandKw);
    const baselineDemand =
      median(baselineValues)
      ?? average(fallbackWindow.map((point) => point.maxDemandKw))
      ?? latestPoint.maxDemandKw;

    const baselineTemperature = average(
      baselineCandidates
        .map((point) => point.temperatureC)
        .filter((value): value is number => value !== null),
    );
    const baselineBusinessLoad = average(
      baselineCandidates
        .map((point) => point.businessLoadIndex)
        .filter((value): value is number => value !== null),
    );
    const baselineProductionLoad = average(
      baselineCandidates
        .map((point) => point.productionLoadIndex)
        .filter((value): value is number => value !== null),
    );

    const weatherAdjustmentRatio = clamp(
      percentageDelta(recentTemperature, baselineTemperature) * 0.35,
      -0.08,
      0.18,
    );
    const businessAdjustmentRatio = clamp(
      percentageDelta(recentBusinessLoad, baselineBusinessLoad) * 0.5,
      -0.1,
      0.2,
    );
    const productionAdjustmentRatio = clamp(
      percentageDelta(recentProductionLoad, baselineProductionLoad) * 0.5,
      -0.1,
      0.2,
    );

    const adjustedDemand =
      baselineDemand
      * (1 + weatherAdjustmentRatio + businessAdjustmentRatio + productionAdjustmentRatio)
      + trendComponentKw;
    const predictedDemandKw = clamp(adjustedDemand, 0, baselineDemand * 1.8);
    const volatilityMad = mad(baselineValues) ?? baselineDemand * 0.04;
    const lowerBoundKw = clamp(predictedDemandKw - Math.max(volatilityMad * 1.5, 0.5), 0, predictedDemandKw);
    const upperBoundKw = predictedDemandKw + Math.max(volatilityMad * 2, 0.75);

    intervals.push({
      slotStartIso: new Date(futureTs).toISOString(),
      predictedDemandKw: Number(predictedDemandKw.toFixed(2)),
      lowerBoundKw: Number(lowerBoundKw.toFixed(2)),
      upperBoundKw: Number(upperBoundKw.toFixed(2)),
      confidence: resolveConfidence(sameSlot.length, points.length),
      basis: {
        matchedSamples: baselineCandidates.length,
        sameSlotSamples: sameSlot.length,
        trendComponentKw: Number(trendComponentKw.toFixed(2)),
        weatherAdjustmentRatio: Number(weatherAdjustmentRatio.toFixed(4)),
        businessAdjustmentRatio: Number(businessAdjustmentRatio.toFixed(4)),
        productionAdjustmentRatio: Number(productionAdjustmentRatio.toFixed(4)),
      },
    });
  }

  const projectedPeakKw = maxOrNull(intervals.map((interval) => interval.predictedDemandKw));
  const projectedPeakRatio =
    projectedPeakKw !== null && contractCapacityKw && contractCapacityKw > 0
      ? projectedPeakKw / contractCapacityKw
      : null;
  const riskLevel = resolveRiskLevel(projectedPeakRatio);
  const prewarnings: EnmsDemandForecastPrewarning[] = [];

  if (projectedPeakRatio !== null) {
    if (projectedPeakRatio >= 1) {
      prewarnings.push({
        code: "contract_capacity_critical",
        severity: "critical",
        summary: "預測需量已超過契約容量，需立即處理降載或排程調整。",
        recommendedAction: "優先檢查大負載設備與可延後時段，必要時啟動降載 playbook。",
      });
    } else if (projectedPeakRatio >= 0.95) {
      prewarnings.push({
        code: "contract_capacity_warning",
        severity: "warning",
        summary: "預測需量已接近契約容量上限，存在超約風險。",
        recommendedAction: "提前檢查 PowerAccounts 與場域負載分配，確認是否需要預先降載。",
      });
    } else if (projectedPeakRatio >= 0.85) {
      prewarnings.push({
        code: "contract_capacity_watch",
        severity: "info",
        summary: "預測需量進入觀察區間，建議持續監控尖峰時段。",
        recommendedAction: "維持觀測並比對今日尖峰與歷史同時段差異。",
      });
    }
  }

  if (projectedPeakKw !== null && projectedPeakKw > latestPoint.maxDemandKw * 1.12) {
    prewarnings.push({
      code: "rapid_demand_ramp",
      severity: riskLevel === "critical" ? "critical" : "warning",
      summary: "短時間內需量有明顯抬升趨勢，尖峰負載正在加速。",
      recommendedAction: "檢查最近 1 至 2 小時的大負載設備啟停與營運條件變化。",
    });
  }

  return {
    status: "ready",
    baselineStrategy: "same_slot_weighted_baseline_plus_recent_trend",
    inputSummary: {
      sampleCount: points.length,
      intervalMinutes,
      contractCapacityKw,
      featureCoverage,
    },
    projectedPeakKw: projectedPeakKw !== null ? Number(projectedPeakKw.toFixed(2)) : null,
    projectedPeakRatio:
      projectedPeakRatio !== null ? Number(projectedPeakRatio.toFixed(4)) : null,
    riskLevel,
    prewarnings,
    intervals,
    explanation: [
      "Forecast 使用歷史 summary-layer 需量資料，並結合同時段基線、最近趨勢與可用的溫度/營運負載特徵。",
      "這個 engine 是統計型預警模組，不是用 LLM 直接猜數字；實際精度仍取決於歷史資料長度與特徵品質。",
    ],
  };
}
