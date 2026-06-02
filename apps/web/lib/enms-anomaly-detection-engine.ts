import type {
  EnmsRawPoint,
  EnmsSignalSeverity,
  EnmsSummaryPoint,
} from "./enms-analytics-types";
import {
  asTimestampMs,
  average,
  clamp,
  mad,
  maxOrNull,
  median,
} from "./enms-analytics-utils";

type NormalizedSummaryPoint = {
  recordedAtMs: number;
  maxDemandKw: number;
  avgPowerFactor: number | null;
  minPowerFactor: number | null;
};

type NormalizedRawPoint = {
  recordedAtMs: number;
  psKw: number | null;
  pfs: number | null;
  va: number | null;
  vb: number | null;
  vc: number | null;
  ia: number | null;
  ib: number | null;
  ic: number | null;
  connected: boolean | null;
  quality: string | number | null;
  thdValues: number[];
};

export type EnmsAnomalyCode =
  | "demand_spike"
  | "low_power_factor"
  | "connectivity_dropout"
  | "harmonic_distortion"
  | "phase_imbalance"
  | "quality_degradation"
  | "contract_capacity_pressure";

export type EnmsAnomalyFinding = {
  code: EnmsAnomalyCode;
  severity: EnmsSignalSeverity;
  category: "demand" | "power_quality" | "availability" | "governance";
  summary: string;
  evidence: string[];
  recommendedActions: string[];
  metrics: Record<string, number | string | boolean | null>;
};

export type EnmsAnomalyDetectionOutput = {
  status: "ready" | "insufficient_data";
  baselineWindow: {
    summarySamples: number;
    rawSamples: number;
  };
  anomalies: EnmsAnomalyFinding[];
  overallSeverity: EnmsSignalSeverity | "none";
  explanation: string[];
};

export type EnmsAnomalyDetectionInput = {
  summaryPoints: EnmsSummaryPoint[];
  rawPoints?: EnmsRawPoint[];
  contractCapacityKw?: number | null;
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
        avgPowerFactor:
          typeof point.avgPowerFactor === "number" && Number.isFinite(point.avgPowerFactor)
            ? point.avgPowerFactor
            : null,
        minPowerFactor:
          typeof point.minPowerFactor === "number" && Number.isFinite(point.minPowerFactor)
            ? point.minPowerFactor
            : null,
      };
    })
    .filter((point): point is NormalizedSummaryPoint => point !== null)
    .sort((left, right) => left.recordedAtMs - right.recordedAtMs);
}

function normalizeRawPoints(points: EnmsRawPoint[]): NormalizedRawPoint[] {
  return points
    .map((point) => {
      const recordedAtMs = asTimestampMs(point.recordedAt);
      if (recordedAtMs === null) {
        return null;
      }
      const thdValues = [
        point.thdVa,
        point.thdVb,
        point.thdVc,
        point.thdIa,
        point.thdIb,
        point.thdIc,
      ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

      return {
        recordedAtMs,
        psKw: typeof point.psKw === "number" && Number.isFinite(point.psKw) ? point.psKw : null,
        pfs: typeof point.pfs === "number" && Number.isFinite(point.pfs) ? point.pfs : null,
        va: typeof point.va === "number" && Number.isFinite(point.va) ? point.va : null,
        vb: typeof point.vb === "number" && Number.isFinite(point.vb) ? point.vb : null,
        vc: typeof point.vc === "number" && Number.isFinite(point.vc) ? point.vc : null,
        ia: typeof point.ia === "number" && Number.isFinite(point.ia) ? point.ia : null,
        ib: typeof point.ib === "number" && Number.isFinite(point.ib) ? point.ib : null,
        ic: typeof point.ic === "number" && Number.isFinite(point.ic) ? point.ic : null,
        connected: typeof point.connected === "boolean" ? point.connected : null,
        quality: point.quality ?? null,
        thdValues,
      };
    })
    .filter((point): point is NormalizedRawPoint => point !== null)
    .sort((left, right) => left.recordedAtMs - right.recordedAtMs);
}

function resolveSeverityRank(severity: EnmsSignalSeverity | "none"): number {
  if (severity === "critical") {
    return 3;
  }
  if (severity === "warning") {
    return 2;
  }
  if (severity === "info") {
    return 1;
  }
  return 0;
}

function phaseImbalance(values: Array<number | null>): number | null {
  const numeric = values.filter((value): value is number => value !== null);
  if (numeric.length < 2) {
    return null;
  }
  const avgValue = average(numeric);
  if (avgValue === null || avgValue === 0) {
    return null;
  }
  return (Math.max(...numeric) - Math.min(...numeric)) / avgValue;
}

export function buildEnmsAnomalyDetection(
  input: EnmsAnomalyDetectionInput,
): EnmsAnomalyDetectionOutput {
  const summaryPoints = normalizeSummaryPoints(input.summaryPoints);
  const rawPoints = normalizeRawPoints(input.rawPoints ?? []);
  const anomalies: EnmsAnomalyFinding[] = [];

  if (summaryPoints.length < 4 && rawPoints.length < 6) {
    return {
      status: "insufficient_data",
      baselineWindow: {
        summarySamples: summaryPoints.length,
        rawSamples: rawPoints.length,
      },
      anomalies: [],
      overallSeverity: "none",
      explanation: [
        "摘要與 raw 資料都不足，還無法建立基本異常基線。",
      ],
    };
  }

  if (summaryPoints.length >= 4) {
    const latestSummary = summaryPoints[summaryPoints.length - 1];
    const historicalDemand = summaryPoints
      .slice(0, -1)
      .map((point) => point.maxDemandKw);
    const demandMedian = median(historicalDemand);
    const demandMad = mad(historicalDemand);
    const demandThreshold =
      demandMedian !== null
        ? demandMedian + Math.max((demandMad ?? demandMedian * 0.04) * 3, demandMedian * 0.12)
        : null;

    if (demandThreshold !== null && latestSummary.maxDemandKw > demandThreshold) {
      const exceedRatio = latestSummary.maxDemandKw / demandThreshold;
      anomalies.push({
        code: "demand_spike",
        severity: exceedRatio >= 1.15 ? "critical" : "warning",
        category: "demand",
        summary: "最新需量明顯高於歷史基線，存在尖峰負載異常。",
        evidence: [
          `latest_max_demand_kw=${latestSummary.maxDemandKw.toFixed(2)}`,
          `baseline_threshold_kw=${demandThreshold.toFixed(2)}`,
        ],
        recommendedActions: [
          "回查最近 1 至 2 小時的大負載設備啟停情況。",
          "確認是否需要比對契約容量與降載策略。",
        ],
        metrics: {
          latestMaxDemandKw: Number(latestSummary.maxDemandKw.toFixed(2)),
          baselineThresholdKw: Number(demandThreshold.toFixed(2)),
          exceedRatio: Number(exceedRatio.toFixed(4)),
        },
      });
    }

    const avgPowerFactor = latestSummary.avgPowerFactor;
    const minPowerFactor = latestSummary.minPowerFactor;
    const lowestPowerFactor = Math.min(
      avgPowerFactor ?? 1,
      minPowerFactor ?? 1,
    );
    if (lowestPowerFactor < 0.9) {
      anomalies.push({
        code: "low_power_factor",
        severity: lowestPowerFactor < 0.8 ? "critical" : "warning",
        category: "power_quality",
        summary: "功率因數偏低，可能帶來無效能耗與需量風險。",
        evidence: [
          `avg_power_factor=${avgPowerFactor?.toFixed(3) ?? "n/a"}`,
          `min_power_factor=${minPowerFactor?.toFixed(3) ?? "n/a"}`,
        ],
        recommendedActions: [
          "檢查無功補償設備與高無效負載來源。",
          "若同時有高需量風險，優先檢查契約容量與大馬達群組。",
        ],
        metrics: {
          avgPowerFactor: avgPowerFactor !== null ? Number(avgPowerFactor.toFixed(3)) : null,
          minPowerFactor: minPowerFactor !== null ? Number(minPowerFactor.toFixed(3)) : null,
        },
      });
    }

    if (
      typeof input.contractCapacityKw === "number"
      && Number.isFinite(input.contractCapacityKw)
      && input.contractCapacityKw > 0
    ) {
      const ratio = latestSummary.maxDemandKw / input.contractCapacityKw;
      if (ratio >= 0.95) {
        anomalies.push({
          code: "contract_capacity_pressure",
          severity: ratio >= 1 ? "critical" : "warning",
          category: "governance",
          summary: "目前需量已接近或超過契約容量，應列入即時告警治理。",
          evidence: [
            `latest_max_demand_kw=${latestSummary.maxDemandKw.toFixed(2)}`,
            `contract_capacity_kw=${input.contractCapacityKw.toFixed(2)}`,
          ],
          recommendedActions: [
            "優先檢查 PowerAccounts 與 DemandAlertHistory 的門檻設定。",
            "必要時啟動降載或調整排程。",
          ],
          metrics: {
            latestMaxDemandKw: Number(latestSummary.maxDemandKw.toFixed(2)),
            contractCapacityKw: Number(input.contractCapacityKw.toFixed(2)),
            contractRatio: Number(ratio.toFixed(4)),
          },
        });
      }
    }
  }

  if (rawPoints.length >= 6) {
    const recentRaw = rawPoints.slice(-24);
    const disconnectRatio =
      recentRaw.filter((point) => point.connected === false).length / recentRaw.length;
    if (disconnectRatio >= 0.2) {
      anomalies.push({
        code: "connectivity_dropout",
        severity: disconnectRatio >= 0.4 ? "critical" : "warning",
        category: "availability",
        summary: "最近 raw 訊號出現明顯連線掉點，資料品質不穩定。",
        evidence: [`disconnect_ratio=${disconnectRatio.toFixed(4)}`],
        recommendedActions: [
          "檢查 gateway / meter 的連線品質與最近掉線時段。",
          "在做 KPI 或異常判讀前先確認這段資料是否可用。",
        ],
        metrics: {
          disconnectRatio: Number(disconnectRatio.toFixed(4)),
        },
      });
    }

    const maxThd = maxOrNull(recentRaw.flatMap((point) => point.thdValues));
    if (maxThd !== null && maxThd >= 8) {
      anomalies.push({
        code: "harmonic_distortion",
        severity: maxThd >= 12 ? "critical" : "warning",
        category: "power_quality",
        summary: "最近 raw data 出現 THD 偏高，疑似電力品質異常。",
        evidence: [`max_thd=${maxThd.toFixed(2)}`],
        recommendedActions: [
          "回查異常時段的設備啟停與非線性負載。",
          "同時比對電壓、電流與功因異常是否共現。",
        ],
        metrics: {
          maxThd: Number(maxThd.toFixed(2)),
        },
      });
    }

    const latestRaw = recentRaw[recentRaw.length - 1];
    const voltageImbalance = phaseImbalance([latestRaw.va, latestRaw.vb, latestRaw.vc]);
    const currentImbalance = phaseImbalance([latestRaw.ia, latestRaw.ib, latestRaw.ic]);
    const dominantImbalance = Math.max(voltageImbalance ?? 0, currentImbalance ?? 0);
    if (dominantImbalance >= 0.12) {
      anomalies.push({
        code: "phase_imbalance",
        severity: dominantImbalance >= 0.2 ? "critical" : "warning",
        category: "power_quality",
        summary: "三相電壓或電流不平衡，可能影響設備效率與告警判讀。",
        evidence: [
          `voltage_imbalance=${voltageImbalance?.toFixed(4) ?? "n/a"}`,
          `current_imbalance=${currentImbalance?.toFixed(4) ?? "n/a"}`,
        ],
        recommendedActions: [
          "檢查三相負載分配與異常相別。",
          "必要時追 raw trace 與設備主檔位置語意。",
        ],
        metrics: {
          voltageImbalance:
            voltageImbalance !== null ? Number(clamp(voltageImbalance, 0, 9).toFixed(4)) : null,
          currentImbalance:
            currentImbalance !== null ? Number(clamp(currentImbalance, 0, 9).toFixed(4)) : null,
        },
      });
    }

    const degradedQualityRatio =
      recentRaw.filter((point) => {
        if (typeof point.quality === "string") {
          const normalized = point.quality.trim().toLowerCase();
          return normalized.length > 0 && normalized !== "ok" && normalized !== "good";
        }
        if (typeof point.quality === "number" && Number.isFinite(point.quality)) {
          return point.quality < 0.8;
        }
        return false;
      }).length / recentRaw.length;
    if (degradedQualityRatio >= 0.25) {
      anomalies.push({
        code: "quality_degradation",
        severity: degradedQualityRatio >= 0.5 ? "critical" : "warning",
        category: "availability",
        summary: "原始資料的 quality 訊號偏差偏高，可能影響後續分析可信度。",
        evidence: [`quality_issue_ratio=${degradedQualityRatio.toFixed(4)}`],
        recommendedActions: [
          "先確認這段資料是否應排除在 KPI / root-cause 之外。",
          "必要時回查 mqtt_raw_messages 與 gateway 來源。",
        ],
        metrics: {
          qualityIssueRatio: Number(degradedQualityRatio.toFixed(4)),
        },
      });
    }
  }

  const overallSeverity = anomalies.reduce<EnmsSignalSeverity | "none">(
    (current, anomaly) =>
      resolveSeverityRank(anomaly.severity) > resolveSeverityRank(current)
        ? anomaly.severity
        : current,
    "none",
  );

  return {
    status: "ready",
    baselineWindow: {
      summarySamples: summaryPoints.length,
      rawSamples: rawPoints.length,
    },
    anomalies,
    overallSeverity,
    explanation: [
      "Anomaly detection 先看 summary layer 建立需量/功因基線，再用 raw layer 驗證 THD、連線與三相品質。",
      "這個 engine 屬於規則 + 統計基線判讀，不等於完整故障診斷模型；仍需搭配 live data 與實際場域校準。",
    ],
  };
}
