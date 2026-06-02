import type { EnmsRawPoint, EnmsSummaryPoint } from "@/lib/enms-analytics-types";
import { buildEnmsAlertGovernance } from "@/lib/enms-alert-governance-engine";
import { buildEnmsAnomalyDetection } from "@/lib/enms-anomaly-detection-engine";
import { buildEnmsDemandForecast } from "@/lib/enms-demand-forecast-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DebugRequestBody = {
  summaryPoints?: EnmsSummaryPoint[];
  rawPoints?: EnmsRawPoint[];
  contractCapacityKw?: number | null;
};

function createSampleSummaryPoints(): EnmsSummaryPoint[] {
  const start = new Date("2026-06-01T08:00:00.000Z").getTime();
  return [71, 73, 74, 76, 79, 83, 87, 90, 92, 95, 97, 99].map((maxDemandKw, index) => ({
    recordedAt: new Date(start + index * 15 * 60_000).toISOString(),
    maxDemandKw,
    totalConsumptionKwh: Number((maxDemandKw * 0.22).toFixed(2)),
    avgPowerFactor: index >= 10 ? 0.88 : 0.96,
    minPowerFactor: index >= 10 ? 0.79 : 0.92,
    contractCapacityKw: 90,
    temperatureC: 28 + index * 0.25,
    businessLoadIndex: 0.72 + index * 0.02,
    productionLoadIndex: 0.68 + index * 0.03,
    siteId: "site-alpha",
    powerAccountId: "pa-001",
    meterRole: "main",
  }));
}

function createSampleRawPoints(): EnmsRawPoint[] {
  const start = new Date("2026-06-01T10:30:00.000Z").getTime();
  return Array.from({ length: 12 }, (_, index) => ({
    recordedAt: new Date(start + index * 5 * 60_000).toISOString(),
    psKw: 74 + index,
    pfs: index >= 8 ? 0.84 : 0.95,
    qsKvar: 17 + index * 0.6,
    va: 220,
    vb: index >= 9 ? 247 : 222,
    vc: 198,
    ia: 86,
    ib: index >= 9 ? 121 : 89,
    ic: 63,
    connected: index < 3 ? false : true,
    quality: index < 4 ? "bad" : "ok",
    thdVa: index >= 8 ? 12.5 : 3.1,
    thdVb: index >= 8 ? 11.4 : 2.9,
    thdVc: index >= 8 ? 10.2 : 2.8,
    thdIa: index >= 8 ? 8.1 : 2.4,
    thdIb: index >= 8 ? 8.6 : 2.5,
    thdIc: index >= 8 ? 7.7 : 2.3,
    macAddress: "gw-01",
    circuitSeq: "1",
    meterRole: "main",
  }));
}

function buildAnalyticsResponse(body?: DebugRequestBody) {
  const summaryPoints = body?.summaryPoints ?? createSampleSummaryPoints();
  const rawPoints = body?.rawPoints ?? createSampleRawPoints();
  const contractCapacityKw =
    typeof body?.contractCapacityKw === "number" && Number.isFinite(body.contractCapacityKw)
      ? body.contractCapacityKw
      : 90;

  const demandForecast = buildEnmsDemandForecast({
    summaryPoints,
    contractCapacityKw,
    forecastHorizonIntervals: 4,
  });
  const anomalyDetection = buildEnmsAnomalyDetection({
    summaryPoints,
    rawPoints,
    contractCapacityKw,
  });
  const alertGovernance = buildEnmsAlertGovernance({
    demandForecast,
    anomalyDetection,
  });

  return {
    sampleInput: {
      summaryPoints,
      rawPoints,
      contractCapacityKw,
    },
    output: {
      demandForecast,
      anomalyDetection,
      alertGovernance,
    },
  };
}

export async function GET() {
  return Response.json({
    ok: true,
    analytics: {
      id: "enms_analytics_workbench",
      scope: "enms_energy_analysis_alerting",
      description:
        "Debug route for EnMS demand forecast, anomaly detection, and alert governance engines.",
    },
    ...buildAnalyticsResponse(),
  });
}

export async function POST(req: Request) {
  let body: DebugRequestBody;
  try {
    body = (await req.json()) as DebugRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.summaryPoints && !Array.isArray(body.summaryPoints)) {
    return Response.json({ error: "'summaryPoints' must be an array" }, { status: 400 });
  }
  if (body.rawPoints && !Array.isArray(body.rawPoints)) {
    return Response.json({ error: "'rawPoints' must be an array" }, { status: 400 });
  }

  return Response.json({
    ok: true,
    ...buildAnalyticsResponse(body),
  });
}
