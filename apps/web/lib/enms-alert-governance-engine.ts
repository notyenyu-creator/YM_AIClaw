import type {
  EnmsRiskLevel,
  EnmsSignalSeverity,
} from "./enms-analytics-types";
import type { EnmsAnomalyDetectionOutput } from "./enms-anomaly-detection-engine";
import type { EnmsDemandForecastOutput } from "./enms-demand-forecast-engine";

export type EnmsGovernanceSignal = {
  signalType: "prewarning" | "alert";
  code: string;
  severity: EnmsSignalSeverity;
  summary: string;
  source: "forecast" | "anomaly" | "composed";
  recommendedOwner:
    | "energy_manager"
    | "facility_ops"
    | "electrical_maintenance";
  escalationWindowMinutes: number;
  recommendedActions: string[];
};

export type EnmsAlertGovernanceOutput = {
  status: "ready";
  riskLevel: EnmsRiskLevel;
  prewarnings: EnmsGovernanceSignal[];
  alerts: EnmsGovernanceSignal[];
  explanation: string[];
};

export type EnmsAlertGovernanceInput = {
  demandForecast: EnmsDemandForecastOutput;
  anomalyDetection: EnmsAnomalyDetectionOutput;
};

function severityRank(severity: EnmsSignalSeverity): number {
  if (severity === "critical") {
    return 3;
  }
  if (severity === "warning") {
    return 2;
  }
  return 1;
}

export function buildEnmsAlertGovernance(
  input: EnmsAlertGovernanceInput,
): EnmsAlertGovernanceOutput {
  const prewarnings: EnmsGovernanceSignal[] = [];
  const alerts: EnmsGovernanceSignal[] = [];

  for (const warning of input.demandForecast.prewarnings) {
    const signal: EnmsGovernanceSignal = {
      signalType:
        warning.severity === "critical" ? "alert" : "prewarning",
      code: warning.code,
      severity: warning.severity,
      summary: warning.summary,
      source: "forecast",
      recommendedOwner: "energy_manager",
      escalationWindowMinutes: warning.severity === "critical" ? 15 : 60,
      recommendedActions: [warning.recommendedAction],
    };
    if (signal.signalType === "alert") {
      alerts.push(signal);
    } else {
      prewarnings.push(signal);
    }
  }

  for (const anomaly of input.anomalyDetection.anomalies) {
    const signalType =
      anomaly.severity === "critical"
      || anomaly.code === "connectivity_dropout"
      || anomaly.code === "harmonic_distortion"
        ? "alert"
        : "prewarning";
    const owner =
      anomaly.category === "power_quality"
        ? "electrical_maintenance"
        : anomaly.category === "availability"
          ? "facility_ops"
          : "energy_manager";
    const signal: EnmsGovernanceSignal = {
      signalType,
      code: anomaly.code,
      severity: anomaly.severity,
      summary: anomaly.summary,
      source: "anomaly",
      recommendedOwner: owner,
      escalationWindowMinutes: signalType === "alert" ? 30 : 120,
      recommendedActions: anomaly.recommendedActions,
    };
    if (signalType === "alert") {
      alerts.push(signal);
    } else {
      prewarnings.push(signal);
    }
  }

  const lowPowerFactor = input.anomalyDetection.anomalies.find(
    (anomaly) => anomaly.code === "low_power_factor",
  );
  const forecastRisk =
    input.demandForecast.riskLevel === "warning"
    || input.demandForecast.riskLevel === "critical";
  if (lowPowerFactor && forecastRisk) {
    prewarnings.push({
      signalType: "prewarning",
      code: "reactive_power_compounding_risk",
      severity:
        lowPowerFactor.severity === "critical"
        || input.demandForecast.riskLevel === "critical"
          ? "critical"
          : "warning",
      summary:
        "低功因與高需量風險同時存在，可能放大超約與電能品質問題。",
      source: "composed",
      recommendedOwner: "energy_manager",
      escalationWindowMinutes: 45,
      recommendedActions: [
        "先檢查無功補償設備，再比對尖峰時段主要負載。",
        "若預測峰值接近契約容量，優先啟動降載或調整排程。",
      ],
    });
  }

  const dedupe = new Map<string, EnmsGovernanceSignal>();
  for (const signal of [...alerts, ...prewarnings]) {
    const existing = dedupe.get(signal.code);
    if (!existing || severityRank(signal.severity) > severityRank(existing.severity)) {
      dedupe.set(signal.code, signal);
    }
  }

  const dedupedAlerts = [...dedupe.values()].filter(
    (signal) => signal.signalType === "alert",
  );
  const dedupedPrewarnings = [...dedupe.values()].filter(
    (signal) => signal.signalType === "prewarning",
  );

  return {
    status: "ready",
    riskLevel: input.demandForecast.riskLevel,
    prewarnings: dedupedPrewarnings,
    alerts: dedupedAlerts,
    explanation: [
      "Alert governance 會把 forecast 與 anomaly 兩條輸出統整成 prewarning / alert 分級，而不是讓 LLM 直接臨場決定告警強度。",
      "正式門檻與通知策略仍應依場域、契約容量與誤報率持續校準。",
    ],
  };
}
