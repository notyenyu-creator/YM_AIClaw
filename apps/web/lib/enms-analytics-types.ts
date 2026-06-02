export type EnmsSummaryPoint = {
  recordedAt: string | number | Date;
  maxDemandKw?: number | null;
  totalConsumptionKwh?: number | null;
  avgPowerFactor?: number | null;
  minPowerFactor?: number | null;
  totalKvarh?: number | null;
  validSampleCount?: number | null;
  excludedSampleCount?: number | null;
  contractCapacityKw?: number | null;
  temperatureC?: number | null;
  businessLoadIndex?: number | null;
  productionLoadIndex?: number | null;
  siteId?: string | null;
  powerAccountId?: string | null;
  meterRole?: string | null;
};

export type EnmsRawPoint = {
  recordedAt: string | number | Date;
  psKw?: number | null;
  pfs?: number | null;
  qsKvar?: number | null;
  va?: number | null;
  vb?: number | null;
  vc?: number | null;
  ia?: number | null;
  ib?: number | null;
  ic?: number | null;
  connected?: boolean | null;
  quality?: string | number | null;
  thdVa?: number | null;
  thdVb?: number | null;
  thdVc?: number | null;
  thdIa?: number | null;
  thdIb?: number | null;
  thdIc?: number | null;
  macAddress?: string | null;
  circuitSeq?: string | null;
  meterRole?: string | null;
};

export type EnmsSignalSeverity = "info" | "warning" | "critical";

export type EnmsRiskLevel =
  | "unknown"
  | "safe"
  | "watch"
  | "warning"
  | "critical";
