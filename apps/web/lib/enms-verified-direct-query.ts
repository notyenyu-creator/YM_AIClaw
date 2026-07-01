import {
  getEnmsPostgresConnectionString,
  redactDatabaseConnectionSecrets,
} from "./enms-db-config";
import { duckdbQueryExternalPgAsyncDetailed as duckdbQueryExternalPgAsyncDetailedRaw } from "./workspace";

async function duckdbQueryExternalPgAsyncDetailed<T>(
  connectionString: string,
  sql: string,
  alias: string,
) {
  const result = await duckdbQueryExternalPgAsyncDetailedRaw<T>(
    connectionString,
    sql,
    alias,
  );
  return result.error
    ? { ...result, error: redactDatabaseConnectionSecrets(result.error) }
    : result;
}

type DemandAlertCountRow = {
  demand_alert_count?: number | string;
  first_alert_time?: string | null;
  latest_alert_time?: string | null;
};

type DemandAlertTypeRow = {
  alert_type?: string | null;
  alert_count?: number | string;
};

type RoiYearRow = {
  site_name?: string | null;
  account_count?: number | string;
  billed_accounts?: number | string;
  bill_count?: number | string;
  baseline_kwh?: number | string;
  baseline_bill?: number | string;
  avg_rate?: number | string;
  savings_5pct?: number | string;
  savings_10pct?: number | string;
};

type AlertTypeSummaryRow = {
  alert_type?: string | null;
  alert_count?: number | string;
  first_alert_time?: string | null;
  latest_alert_time?: string | null;
};

type LayerFreshnessRow = {
  latest_raw_time?: string | null;
  raw_rows_1d?: number | string;
  latest_summary_time?: string | null;
  summary_rows_1d?: number | string;
};

type AlertGovernanceRow = {
  account_number?: string | null;
  alert_type?: string | null;
  alert_count?: number | string;
  max_utilization?: number | string;
  max_demand?: number | string;
  contract_capacity?: number | string;
  first_alert_time?: string | null;
  latest_alert_time?: string | null;
};

type ContractRiskRow = {
  site_name?: string | null;
  account_number?: string | null;
  max_utilization?: number | string;
  max_demand?: number | string;
  contract_capacity?: number | string;
  latest_alert_time?: string | null;
};

type SiteAccountsRow = {
  site_name?: string | null;
  accounts?: string | null;
  account_count?: number | string;
};

type TopLoadRow = {
  site_name?: string | null;
  meter_name?: string | null;
  circuit_seq?: number | string;
  total_kwh?: number | string;
  peak_kw?: number | string;
  avg_pf?: number | string;
};

type TopLoadAvailabilityRow = {
  requested_window_start?: string | null;
  requested_window_end?: string | null;
  earliest_summary_time?: string | null;
  latest_summary_time?: string | null;
  fallback_window_start?: string | null;
  fallback_window_end?: string | null;
  summary_rows_requested_window?: number | string;
};

type AnomalySummaryRow = {
  site_name?: string | null;
  meter_name?: string | null;
  circuit_seq?: number | string;
  summary_points?: number | string;
  max_demand?: number | string;
  avg_pf?: number | string;
  min_pf?: number | string;
  excluded_samples?: number | string;
};

type RawQualityRow = {
  site_name?: string | null;
  meter_name?: string | null;
  circuit_seq?: number | string;
  raw_points?: number | string;
  disconnected_count?: number | string;
  abnormal_quality_count?: number | string;
  low_pf_count?: number | string;
  max_voltage_thd?: number | string;
};

type SitePeakDemandRow = {
  site_name?: string | null;
  meter_name?: string | null;
  circuit_seq?: number | string;
  peak_kw?: number | string;
  peak_time?: string | null;
};

type SavingsScenarioRow = {
  site_name?: string | null;
  gregorian_year?: number | string;
  billed_accounts?: number | string;
  bill_count?: number | string;
  baseline_kwh?: number | string;
  baseline_bill?: number | string;
  savings_5pct_kwh?: number | string;
  savings_10pct_kwh?: number | string;
  savings_5pct_ntd?: number | string;
  savings_10pct_ntd?: number | string;
};

type SiteKpiRow = {
  site_name?: string | null;
  total_kwh?: number | string;
  peak_kw?: number | string;
  avg_pf?: number | string;
  min_pf?: number | string;
  point_count?: number | string;
};

type EnergyTrendRow = {
  period?: string | null;
  total_kwh?: number | string;
  peak_kw?: number | string;
  avg_pf?: number | string;
};

type BillTrendRow = {
  period?: string | null;
  bill_count?: number | string;
  account_count?: number | string;
  total_kwh?: number | string;
  total_bill?: number | string;
  avg_rate?: number | string;
};

type AssetCountRow = {
  total_count?: number | string;
};

export type EnmsVerifiedDirectQueryInput = {
  userMessage: string;
};

function includesAny(message: string, keywords: string[]) {
  return keywords.some((keyword) => message.includes(keyword.toLowerCase()));
}

function extractAccountNumber(message: string): string | null {
  const match = message.match(/\b\d{8,12}\b/);
  return match?.[0] ?? null;
}

function isDemandAlertCountRequest(message: string) {
  const normalized = message.toLowerCase();
  const hasDemandAlertScope =
    includesAny(normalized, ["需量告警", "需量", "契約容量", "超約"]) &&
    includesAny(normalized, ["告警", "alert", "紀錄", "記錄"]);
  const asksCount = includesAny(normalized, [
    "多少筆",
    "幾筆",
    "筆數",
    "資料筆數",
    "count",
    "總數",
  ]);
  return Boolean(extractAccountNumber(message)) && hasDemandAlertScope && asksCount;
}

type AssetCountTarget = {
  label: string;
  tableName:
    | "ElectricityMeter"
    | "sites"
    | "site_gateways"
    | "PowerAccounts";
  key: "meter_count" | "site_count" | "gateway_count" | "power_account_count";
};

function detectAssetCountTarget(message: string): AssetCountTarget | null {
  const normalized = message.toLowerCase();
  const asksCount = includesAny(normalized, [
    "多少",
    "幾個",
    "幾筆",
    "筆數",
    "數量",
    "count",
    "總數",
  ]);

  if (!asksCount) {
    return null;
  }

  if (
    includesAny(normalized, [
      "告警",
      "alert",
      "需量",
      "總用電",
      "用電量",
      "最大需量",
      "功率因數",
      "平均功率因數",
      "最低功率因數",
      "電費",
      "帳單",
      "roi",
      "節電",
      "benchmarking",
      "比較",
      "排名",
      "排行",
      "趨勢",
      "異常",
      "電力品質",
    ])
  ) {
    return null;
  }

  if (includesAny(normalized, ["電表", "meter"])) {
    return {
      label: "電表",
      tableName: "ElectricityMeter",
      key: "meter_count",
    };
  }
  if (includesAny(normalized, ["場域", "site"])) {
    return {
      label: "場域",
      tableName: "sites",
      key: "site_count",
    };
  }
  if (includesAny(normalized, ["gateway", "閘道", "閘道器", "網關"])) {
    return {
      label: "gateway",
      tableName: "site_gateways",
      key: "gateway_count",
    };
  }
  if (includesAny(normalized, ["電號", "account", "power account"])) {
    return {
      label: "電號",
      tableName: "PowerAccounts",
      key: "power_account_count",
    };
  }

  return null;
}

function isAssetCountRequest(message: string) {
  return detectAssetCountTarget(message) != null;
}

function extractGregorianYear(message: string): number | null {
  const match = message.match(/\b(20\d{2})\b/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

function isRoiYearRequest(message: string) {
  const normalized = message.toLowerCase();
  const asksRoi = includesAny(normalized, [
    "roi",
    "節能roi",
    "節能 roi",
    "節能投資",
    "投資回收",
    "回收期",
    "what-if",
    "節能試算",
  ]);
  return asksRoi && extractGregorianYear(message) != null;
}

function isAlertTypeSummaryRequest(message: string) {
  const normalized = message.toLowerCase();
  if (extractAccountNumber(message)) {
    return false;
  }
  const asksRecentAlertType =
    includesAny(normalized, ["最近", "7 天", "七天", "近 7 天", "近七天"]) &&
    includesAny(normalized, ["告警", "alert"]) &&
    includesAny(normalized, ["類型", "分類", "各類型", "最常見", "筆數", "count"]);

  return asksRecentAlertType;
}

function isLayerFreshnessRequest(message: string) {
  const normalized = message.toLowerCase();
  const asksLayerFreshness =
    includesAny(normalized, ["raw layer", "raw", "summary layer", "summary"]) &&
    includesAny(normalized, ["更新", "最新", "資料時間", "近 1 天", "近一天", "1 天筆數", "筆數"]);

  return asksLayerFreshness;
}

function isRecentAlertGovernanceRequest(message: string) {
  const normalized = message.toLowerCase();
  return (
    includesAny(normalized, ["最近 7 天", "近 7 天", "七天"]) &&
    includesAny(normalized, ["告警", "預警", "alert"]) &&
    includesAny(normalized, ["摘要", "治理", "立即處理", "持續觀察", "可抑制", "建議"])
  );
}

function isContractCapacityRiskRequest(message: string) {
  const normalized = message.toLowerCase();
  const hasContractScope = includesAny(normalized, [
    "契約容量",
    "超約",
    "使用率",
    "最接近",
  ]);
  const asksRanking = includesAny(normalized, [
    "電號",
    "超過",
    "最高",
    "最大需量",
    "時間",
    "列出",
  ]);
  return hasContractScope && asksRanking;
}

function isSiteAccountsRequest(message: string) {
  const normalized = message.toLowerCase();
  return (
    includesAny(normalized, ["場域", "site"]) &&
    includesAny(normalized, ["電號", "account"]) &&
    includesAny(normalized, ["對應", "主要", "列出"])
  );
}

function isTopLoadRankingRequest(message: string) {
  const normalized = message.toLowerCase();
  return (
    includesAny(normalized, ["最耗電", "耗電排行", "用電排行", "top 5", "top5"]) &&
    includesAny(normalized, ["設備", "迴路", "電表"])
  );
}

function isRecentAnomalyRequest(message: string) {
  const normalized = message.toLowerCase();
  return (
    includesAny(normalized, ["最近 24 小時", "近 24 小時", "24 小時"]) &&
    includesAny(normalized, ["異常", "功因", "功率因數", "電力品質", "根因", "排查"])
  );
}

function isPeakDemandRankingRequest(message: string) {
  const normalized = message.toLowerCase();
  return (
    includesAny(normalized, ["最近 30 天", "近 30 天", "三十天"]) &&
    includesAny(normalized, ["最大需量", "需量最高", "尖峰需量"]) &&
    includesAny(normalized, ["場域", "哪個", "列出", "時間", "數值"])
  );
}

function isSiteBenchmarkRequest(message: string) {
  const normalized = message.toLowerCase();
  if (includesAny(normalized, ["趨勢", "trend", "time-series", "timeseries"])) {
    return false;
  }
  if (
    includesAny(normalized, ["最大需量", "需量最高", "尖峰需量"]) &&
    includesAny(normalized, ["時間", "數值"])
  ) {
    return false;
  }
  return (
    includesAny(normalized, ["最近 30 天", "近 30 天", "三十天"]) &&
    includesAny(normalized, ["benchmarking", "比較", "排名", "總用電", "平均功率因數", "功率因數最差"])
  );
}

function isSavingsScenarioRequest(message: string) {
  const normalized = message.toLowerCase();
  return (
    includesAny(normalized, ["節電 5%", "節電5%", "5% / 10%", "5%/10%", "節電"]) &&
    includesAny(normalized, ["10%", "省多少", "帳單", "估算"])
  );
}

function isSiteBillRankingRequest(message: string) {
  const normalized = message.toLowerCase();
  if (includesAny(normalized, ["趨勢", "trend", "最近 6 期", "近 6 期", "最近6期", "近6期"])) {
    return false;
  }
  const hasBillScope = includesAny(normalized, [
    "電費",
    "帳單",
    "台電",
    "bill",
  ]);
  const asksRanking = includesAny(normalized, [
    "最高",
    "排行",
    "排名",
    "top",
    "比較",
    "圖表",
    "呈現",
    "哪個場域",
  ]);

  return hasBillScope && asksRanking;
}

function extractRecentBillPeriodWindow(message: string): number | null {
  const match = message.match(/(?:最近|近)\s*(\d{1,2})\s*期/);
  if (!match) {
    return null;
  }
  const periods = Number(match[1]);
  return Number.isFinite(periods) && periods > 0 ? periods : null;
}

function detectBillTrendTarget(message: string): BillTrendTarget | null {
  const normalized = message.toLowerCase();
  const hasBillScope = includesAny(normalized, [
    "台電帳單",
    "帳單",
    "電費",
    "bill",
    "billing",
  ]);
  const asksTrend = includesAny(normalized, [
    "趨勢",
    "trend",
    "走勢",
    "最近 6 期",
    "近 6 期",
    "最近6期",
    "近6期",
    "圖表",
    "chart",
    "line",
    "折線",
  ]);

  if (!hasBillScope || !asksTrend) {
    return null;
  }

  if (
    includesAny(normalized, [
      "roi",
      "節能roi",
      "節能 roi",
      "節能投資",
      "投資回收",
      "回收期",
      "what-if",
      "節能試算",
      "排行",
      "排名",
      "最高",
      "哪個場域",
      "benchmarking",
      "比較",
    ])
  ) {
    return null;
  }

  const accountNumber = extractAccountNumber(message);
  const siteName = detectKnownSiteName(message);
  const year = extractGregorianYear(message);
  const periodLimit = extractRecentBillPeriodWindow(message) ?? 6;
  const scopeLabel = accountNumber
    ? `電號 ${accountNumber}`
    : siteName
      ? `${siteName} 場域`
      : "目前可見 EnMS 帳單資料";

  return {
    label:
      year != null
        ? `${scopeLabel}${year} 年台電帳單趨勢`
        : `${scopeLabel}最近 ${periodLimit} 期台電帳單趨勢`,
    scopeLabel,
    accountNumber,
    siteName,
    year,
    periodLimit,
  };
}

type EnergyTrendTarget = {
  label: string;
  grain: "day" | "month";
  startSql: string;
  endSql: string;
  siteName: string | null;
  scopeLabel: string;
};

type BillTrendTarget = {
  label: string;
  scopeLabel: string;
  accountNumber: string | null;
  siteName: string | null;
  year: number | null;
  periodLimit: number;
};

type TopLoadTarget = {
  label: string;
  scopeLabel: string;
  windowLabel: string;
  startSql: string;
  endSql: string;
  siteName: string | null;
};

function extractRecentDayWindow(message: string): number | null {
  const match = message.match(/(?:最近|近)\s*(\d{1,3})\s*(?:天|日)/);
  if (!match) {
    return null;
  }
  const days = Number(match[1]);
  return Number.isFinite(days) && days > 0 ? days : null;
}

function normalizeIsoDateParts(year: number, month: number, day: number): string | null {
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const normalized = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  if (date.toISOString().slice(0, 10) !== normalized) {
    return null;
  }
  return normalized;
}

function extractIsoDateCandidates(message: string): string[] {
  const results: string[] = [];
  for (const match of message.matchAll(/\b(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\b/g)) {
    const normalized = normalizeIsoDateParts(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
    );
    if (normalized && !results.includes(normalized)) {
      results.push(normalized);
    }
  }
  return results.slice(0, 2);
}

function detectTopLoadTarget(message: string): TopLoadTarget | null {
  if (!isTopLoadRankingRequest(message)) {
    return null;
  }

  const normalized = message.toLowerCase();
  const siteName = detectKnownSiteName(message);
  const scopeLabel = siteName ?? "全部場域";
  const isoDateCandidates = extractIsoDateCandidates(message);

  if (isoDateCandidates.length >= 2) {
    const [startDate, endDate] = isoDateCandidates.toSorted();
    return {
      label: `${scopeLabel} ${startDate} 到 ${endDate} 設備 / 迴路耗電排行`,
      scopeLabel,
      windowLabel: `${startDate} 到 ${endDate}`,
      startSql: `DATE '${startDate}'`,
      endSql: `DATE '${endDate}' + INTERVAL '1 day'`,
      siteName,
    };
  }

  if (
    isoDateCandidates.length === 1 &&
    includesAny(normalized, ["到今天", "至今", "到現在", "today"])
  ) {
    const [startDate] = isoDateCandidates;
    return {
      label: `${scopeLabel} ${startDate} 到今天設備 / 迴路耗電排行`,
      scopeLabel,
      windowLabel: `${startDate} 到今天`,
      startSql: `DATE '${startDate}'`,
      endSql: "NOW()",
      siteName,
    };
  }

  const recentDayWindow = extractRecentDayWindow(message) ?? 7;
  return {
    label: `${scopeLabel}最近 ${recentDayWindow} 天設備 / 迴路耗電排行`,
    scopeLabel,
    windowLabel: `最近 ${recentDayWindow} 天`,
    startSql: `NOW() - INTERVAL '${recentDayWindow} days'`,
    endSql: "NOW()",
    siteName,
  };
}

function detectEnergyTrendTarget(message: string): EnergyTrendTarget | null {
  const normalized = message.toLowerCase();
  const asksEnergyTrend =
    includesAny(normalized, [
      "能源趨勢",
      "能源趨勢分析",
      "用電趨勢",
      "能耗趨勢",
      "趨勢分析",
    ]) ||
    (includesAny(normalized, ["總用電", "用電量", "最大需量", "功率因數"]) &&
      includesAny(normalized, ["趨勢", "圖表", "分析"]));

  if (!asksEnergyTrend) {
    return null;
  }

  if (
    includesAny(normalized, [
      "帳單趨勢",
      "電費趨勢",
      "台電帳單",
      "bill trend",
      "roi",
      "節能roi",
      "節能 roi",
      "節能投資",
      "投資回收",
      "回收期",
      "what-if",
      "節能試算",
    ])
  ) {
    return null;
  }

  const siteName = detectKnownSiteName(message);
  const scopeLabel = siteName ? `${siteName} 場域` : "目前可見 EnMS summary 資料";
  const recentDayWindow = extractRecentDayWindow(message);
  if (recentDayWindow) {
    return {
      label: `${scopeLabel}最近 ${recentDayWindow} 天能源趨勢`,
      grain: recentDayWindow > 92 ? "month" : "day",
      startSql: `CURRENT_DATE - INTERVAL '${recentDayWindow} days'`,
      endSql: `CURRENT_DATE + INTERVAL '1 day'`,
      siteName,
      scopeLabel,
    };
  }

  const isoDateCandidates = extractIsoDateCandidates(message);
  if (isoDateCandidates.length >= 2) {
    const [startDate, endDate] = isoDateCandidates.toSorted();
    return {
      label: `${scopeLabel}${startDate} 到 ${endDate} 能源趨勢`,
      grain: "day",
      startSql: `DATE '${startDate}'`,
      endSql: `DATE '${endDate}' + INTERVAL '1 day'`,
      siteName,
      scopeLabel,
    };
  }

  if (isoDateCandidates.length === 1 && includesAny(normalized, ["到今天", "至今", "到現在", "today"])) {
    const [startDate] = isoDateCandidates;
    return {
      label: `${scopeLabel}${startDate} 到今天能源趨勢`,
      grain: "day",
      startSql: `DATE '${startDate}'`,
      endSql: `CURRENT_DATE + INTERVAL '1 day'`,
      siteName,
      scopeLabel,
    };
  }

  const yearMonthMatch = message.match(/\b(20\d{2})\s*年\s*(\d{1,2})\s*月/);
  if (yearMonthMatch && includesAny(normalized, ["到今天", "至今", "到現在", "today"])) {
    const year = Number(yearMonthMatch[1]);
    const month = Number(yearMonthMatch[2]);
    if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
      const paddedMonth = String(month).padStart(2, "0");
      return {
        label: `${scopeLabel}${year}-${paddedMonth} 起能源趨勢`,
        grain: "month",
        startSql: `DATE '${year}-${paddedMonth}-01'`,
        endSql: `CURRENT_DATE + INTERVAL '1 day'`,
        siteName,
        scopeLabel,
      };
    }
  }

  const yearOnly = extractGregorianYear(message);
  if (yearOnly) {
    const currentYear = new Date().getFullYear();
    const endSql =
      yearOnly === currentYear && includesAny(normalized, ["到今天", "至今", "到現在", "today"])
        ? `CURRENT_DATE + INTERVAL '1 day'`
        : `DATE '${yearOnly + 1}-01-01'`;
    return {
      label: `${scopeLabel}${yearOnly} 年能源趨勢`,
      grain: "month",
      startSql: `DATE '${yearOnly}-01-01'`,
      endSql,
      siteName,
      scopeLabel,
    };
  }

  return {
    label: `${scopeLabel}最近 30 天能源趨勢`,
    grain: "day",
    startSql: `CURRENT_DATE - INTERVAL '30 days'`,
    endSql: `CURRENT_DATE + INTERVAL '1 day'`,
    siteName,
    scopeLabel,
  };
}

function isPriorityConsumptionIssueRequest(message: string) {
  const normalized = message.toLowerCase();
  return (
    includesAny(normalized, ["最值得先處理", "優先處理", "先處理"]) &&
    includesAny(normalized, ["耗電問題", "用電問題", "資料說明", "資料"])
  );
}

function isMaintenanceInspectionRequest(message: string) {
  const normalized = message.toLowerCase();
  return (
    includesAny(normalized, ["維修", "巡檢", "檢修"]) &&
    includesAny(normalized, ["設備", "電表", "迴路"])
  );
}

function isExecutiveBriefRequest(message: string) {
  const normalized = message.toLowerCase();
  return (
    includesAny(normalized, ["老闆", "主管", "高層", "投資人"]) &&
    includesAny(normalized, ["三句話", "3 句話", "回報", "重點", "風險"])
  );
}

function isQuickWinRequest(message: string) {
  const normalized = message.toLowerCase();
  return includesAny(normalized, ["quick win", "節省電費", "節能機會", "省電費", "優先處理"]);
}

function toNumber(value: number | string | undefined): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-TW").format(value);
}

function formatMoney(value: number) {
  return `NT$ ${formatNumber(Math.round(value))}`;
}

function formatKwh(value: number) {
  return `${formatNumber(round(value, 2))} kWh`;
}

function formatKw(value: number) {
  return `${formatNumber(round(value, 2))} kW`;
}

function formatPercent(value: number) {
  return `${formatNumber(round(value, 2))}%`;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatTime(value: string | null | undefined) {
  return value && value.trim() ? value : "無資料";
}

const ENMS_REPORT_METADATA = {
  sourceDomain: "enms",
  sourceKind: "verified_direct",
  verifiedBy: "enms-verified-direct-query",
} as const;

function buildTopLoadLine(row: TopLoadRow, index: number, requestedSite: string | null) {
  const totalKwh = toNumber(row.total_kwh);
  const peakKw = toNumber(row.peak_kw);
  const avgPf = toNumber(row.avg_pf);
  const reasons = [
    totalKwh > 0 ? "耗電量最高，優先檢查排程與基載" : "",
    peakKw > 0 ? "尖峰需量會影響契約容量風險" : "",
    avgPf > 0 && avgPf < 0.9 ? "平均功率因數偏低，可能有功因改善空間" : "",
  ].filter(Boolean);

  return `${index + 1}. ${row.site_name ?? requestedSite ?? "未對應場域"} / ${row.meter_name ?? "未知電表"} / 迴路 ${row.circuit_seq ?? "n/a"}：耗電 ${formatKwh(totalKwh)}，尖峰 ${formatKw(peakKw)}，平均功因 ${round(avgPf, 4)}。關注原因：${reasons.join("；") || "用電量在排序中靠前"}。`;
}

function formatTopLoadScopeWindowLabel(scopeLabel: string, windowLabel: string) {
  return windowLabel.startsWith("最近")
    ? `${scopeLabel}${windowLabel}`
    : `${scopeLabel} ${windowLabel}`;
}

function buildAssetCountReport(
  target: AssetCountTarget,
  row: AssetCountRow | undefined,
) {
  const totalCount = toNumber(row?.total_count);
  const noun = target.label;
  const rowKey = target.key;
  const chartRows = [
    {
      category: noun,
      total_count: totalCount,
    },
  ];

  return [
    `根據本地 EnMS DB 的 ${target.tableName} 查詢，目前共有 ${formatNumber(totalCount)} 個${noun}。`,
    "",
    `查詢依據：${target.tableName}。此回答只使用本地 EnMS DB，不使用外部網路資料。`,
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        ...ENMS_REPORT_METADATA,
        title: `目前 ${noun} 總數`,
        description: `本地 EnMS DB 查詢結果，${noun}總數為 ${formatNumber(totalCount)}。`,
        panels: [
          {
            id: `${rowKey}-bar`,
            title: `${noun}總數圖表`,
            type: "bar",
            rows: chartRows,
            mapping: {
              xAxis: "category",
              yAxis: ["total_count"],
            },
            size: "full",
          },
        ],
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

function buildAlertTypeSummaryReport(rows: AlertTypeSummaryRow[]) {
  const breakdownRows = rows.map((row) => ({
    alert_type: row.alert_type ?? "Unknown",
    alert_count: toNumber(row.alert_count),
  }));
  const totalCount = breakdownRows.reduce((sum, row) => sum + row.alert_count, 0);
  const firstAlertTime =
    rows
      .map((row) => row.first_alert_time)
      .filter((value): value is string => Boolean(value))
      .toSorted()[0] ?? null;
  const latestAlertTime =
    rows
      .map((row) => row.latest_alert_time)
      .filter((value): value is string => Boolean(value))
      .toSorted()
      .at(-1) ?? null;

  if (totalCount === 0) {
    return [
      "我判斷這是 EnMS 最近 7 天告警類型統計，已優先查本地 EnMS DB。",
      "目前 DemandAlertHistory 最近 7 天沒有可統計的告警紀錄，因此不會用外部資料或假資料補齊。",
      "查詢依據：DemandAlertHistory.AlertTime、AlertType。此回答只使用本地 EnMS DB。",
    ].join("\n");
  }

  const topText = breakdownRows
    .slice(0, 5)
    .map((row, index) => `${index + 1}. ${row.alert_type}：${formatNumber(row.alert_count)} 筆`)
    .join("\n");

  return [
    `根據本地 EnMS DB 的 DemandAlertHistory 查詢，最近 7 天共有 ${formatNumber(totalCount)} 筆告警紀錄。`,
    "",
    "告警類型排行：",
    topText,
    "",
    `資料時間範圍：${formatTime(firstAlertTime)} 到 ${formatTime(latestAlertTime)}。`,
    "查詢依據：DemandAlertHistory.AlertTime、AlertType。此回答只使用本地 EnMS DB，不使用外部網路資料。",
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        ...ENMS_REPORT_METADATA,
        title: "最近 7 天 EnMS 告警類型筆數",
        description: `本地 EnMS DB 查詢結果，共 ${formatNumber(totalCount)} 筆。`,
        panels: [
          {
            id: "recent-alert-type-breakdown",
            title: "告警類型筆數",
            type: "bar",
            rows: breakdownRows,
            mapping: {
              xAxis: "alert_type",
              yAxis: ["alert_count"],
            },
            size: "full",
          },
        ],
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

function buildLayerFreshnessReport(row: LayerFreshnessRow | undefined) {
  const rawRows = toNumber(row?.raw_rows_1d);
  const summaryRows = toNumber(row?.summary_rows_1d);
  const rawStatus = rawRows > 0 ? "近 1 天有資料進來" : "近 1 天沒有新資料";
  const summaryStatus = summaryRows > 0 ? "近 1 天有資料更新" : "近 1 天沒有新資料";
  const overall =
    rawRows > 0 && summaryRows > 0
      ? "raw layer 與 summary layer 目前都有更新。"
      : rawRows > 0
        ? "raw layer 有更新，但 summary layer 近 1 天沒有彙整資料，建議檢查 summary / cagg 匯總流程。"
        : summaryRows > 0
          ? "summary layer 有更新，但 raw layer 近 1 天沒有新增原始資料，建議確認 raw ingestion 是否已切到其他資料源。"
          : "raw layer 與 summary layer 近 1 天都沒有新資料，建議先檢查資料接入與排程。";

  return [
    "根據本地 EnMS DB 查詢，raw layer 與 summary layer 更新狀態如下：",
    "",
    `- raw layer（mqtt_raw_data）：最新資料時間 ${formatTime(row?.latest_raw_time)}；近 1 天 ${formatNumber(rawRows)} 筆，判斷為${rawStatus}。`,
    `- summary layer（DeviceDataSummaryView）：最新資料時間 ${formatTime(row?.latest_summary_time)}；近 1 天 ${formatNumber(summaryRows)} 筆，判斷為${summaryStatus}。`,
    "",
    `結論：${overall}`,
    "查詢依據：mqtt_raw_data.timestamp、DeviceDataSummaryView.RecordTime。此回答只使用本地 EnMS DB，不使用外部網路資料。",
  ].join("\n");
}

function buildRecentAlertGovernanceReport(rows: AlertGovernanceRow[]) {
  if (rows.length === 0) {
    return [
      "根據本地 EnMS DB 查詢，最近 7 天 DemandAlertHistory 沒有可統計的告警 / 預警紀錄。",
      "治理建議：目前不需要立即處理，但仍建議保持需量與資料接入監控。",
      "查詢依據：DemandAlertHistory.AlertTime、AccountNumber、AlertType、UtilizationRate。此回答只使用本地 EnMS DB。",
    ].join("\n");
  }

  const totalCount = rows.reduce((sum, row) => sum + toNumber(row.alert_count), 0);
  const immediate = rows.filter((row) => toNumber(row.max_utilization) >= 100);
  const watch = rows.filter((row) => {
    const utilization = toNumber(row.max_utilization);
    return utilization >= 80 && utilization < 100;
  });
  const suppressible = rows.filter((row) => toNumber(row.alert_count) >= 20);
  const topRows = rows
    .slice(0, 5)
    .map((row, index) => {
      const account = row.account_number ?? "未知電號";
      const type = row.alert_type ?? "Unknown";
      const count = formatNumber(toNumber(row.alert_count));
      const utilization = formatPercent(toNumber(row.max_utilization));
      const demand = formatKw(toNumber(row.max_demand));
      const capacity = formatKw(toNumber(row.contract_capacity));
      return `${index + 1}. 電號 ${account} / ${type}：${count} 筆，最高使用率 ${utilization}，最大需量 ${demand}，契約容量 ${capacity}。`;
    })
    .join("\n");

  return [
    `根據本地 EnMS DB 的 DemandAlertHistory 查詢，最近 7 天共有 ${formatNumber(totalCount)} 筆告警 / 預警紀錄。`,
    "",
    "主要告警摘要：",
    topRows,
    "",
    `需要立即處理：${formatNumber(immediate.length)} 組，判斷依據是最高使用率達 100% 以上或已超過契約容量。`,
    `持續觀察：${formatNumber(watch.length)} 組，判斷依據是最高使用率介於 80% 到 100%。`,
    `可抑制 / 去重點：${formatNumber(suppressible.length)} 組，判斷依據是同一電號與 AlertType 在 7 天內重複超過 20 筆。`,
    "",
    "治理建議：先處理最高使用率的電號，再針對高重複 AlertType 設定 deadband / hysteresis / escalation window，避免告警噪音掩蓋真正超約風險。",
    "查詢依據：DemandAlertHistory.AlertTime、AccountNumber、AlertType、CurrentDemand、ContractCapacity、UtilizationRate。此回答只使用本地 EnMS DB，不使用外部網路資料。",
  ].join("\n");
}

function buildContractRiskReport(rows: ContractRiskRow[]) {
  if (rows.length === 0) {
    return [
      "根據本地 EnMS DB 查詢，最近 30 天沒有可用的契約容量風險紀錄。",
      "查詢依據：DemandAlertHistory + PowerAccounts + sites。此回答只使用本地 EnMS DB。",
    ].join("\n");
  }

  const lines = [
    "根據本地 EnMS DB 的 DemandAlertHistory、PowerAccounts 與 sites 查詢，最近最接近或超過契約容量的電號如下：",
    "",
  ];

  rows.slice(0, 5).forEach((row, index) => {
    lines.push(
      `${index + 1}. ${row.site_name ?? "未對應場域"} / 電號 ${row.account_number ?? "未知"}：最高使用率 ${formatPercent(toNumber(row.max_utilization))}，最大需量 ${formatKw(toNumber(row.max_demand))}，契約容量 ${formatKw(toNumber(row.contract_capacity))}，最近告警時間 ${formatTime(row.latest_alert_time)}。`,
    );
  });

  lines.push(
    "",
    "優先處理建議：先處理使用率最高且已超過 100% 的電號，確認尖峰時段負載、可降載設備與契約容量設定是否合理。",
    "查詢依據：DemandAlertHistory.AccountNumber、CurrentDemand、ContractCapacity、UtilizationRate，並透過 PowerAccounts.SiteId 對應 sites.site_id。此回答只使用本地 EnMS DB。",
  );

  return lines.join("\n");
}

function buildSiteAccountsReport(rows: SiteAccountsRow[]) {
  if (rows.length === 0) {
    return [
      "根據本地 EnMS DB 查詢，目前 PowerAccounts 沒有可列出的電號資料。",
      "查詢依據：PowerAccounts + sites。此回答只使用本地 EnMS DB。",
    ].join("\n");
  }

  const lines = [
    "根據本地 EnMS DB 的 PowerAccounts 與 sites 查詢，目前各場域主要電號如下：",
    "",
  ];

  rows.forEach((row) => {
    lines.push(
      `- ${row.site_name ?? "未對應場域"}：${formatNumber(toNumber(row.account_count))} 個電號，${row.accounts ?? "無電號"}`,
    );
  });

  lines.push(
    "",
    "查詢依據：PowerAccounts.AccountNumber、PowerAccounts.SiteId、sites.site_id、sites.site_name。此回答只使用本地 EnMS DB。",
  );

  return lines.join("\n");
}

function buildTopLoadReport(
  rows: TopLoadRow[],
  requestedSite: string | null,
  windowLabel: string = "最近 7 天",
) {
  const scopeWindowLabel = formatTopLoadScopeWindowLabel(
    requestedSite ?? "全部場域",
    windowLabel,
  );
  if (rows.length === 0) {
    return [
      `根據本地 EnMS DB 查詢，${scopeWindowLabel}沒有可統計的設備 / 迴路耗電資料。`,
      "查詢依據：DeviceDataSummaryView + ElectricityMeter + PowerAccounts + sites。此回答只使用本地 EnMS DB。",
    ].join("\n");
  }

  const lines = [
    `根據本地 EnMS DB 的 DeviceDataSummaryView、ElectricityMeter、PowerAccounts 與 sites 查詢，${scopeWindowLabel}的設備 / 迴路耗電 Top ${Math.min(rows.length, 5)} 如下：`,
    "",
  ];

  rows.slice(0, 5).forEach((row, index) => {
    lines.push(buildTopLoadLine(row, index, requestedSite));
  });

  lines.push(
    "",
    "查詢依據：sum(DeviceDataSummaryView.TotalConsumption)、max(DeviceDataSummaryView.MaxDemand)、avg(DeviceDataSummaryView.AvgPowerFactor)，並透過 ElectricityMeter / PowerAccounts / sites 對應場域與電表別名。此回答只使用本地 EnMS DB。",
  );

  return lines.join("\n");
}

function buildTopLoadNoRecentDataReport(
  target: TopLoadTarget,
  availability: TopLoadAvailabilityRow | undefined,
  fallbackRows: TopLoadRow[],
) {
  const requestedWindowStart = formatTime(availability?.requested_window_start);
  const requestedWindowEnd = formatTime(availability?.requested_window_end);
  const latestSummaryTime = formatTime(availability?.latest_summary_time);
  const earliestSummaryTime = formatTime(availability?.earliest_summary_time);
  const fallbackWindowStart = formatTime(availability?.fallback_window_start);
  const fallbackWindowEnd = formatTime(availability?.fallback_window_end);

  const lines = [
    `你要求的查詢條件是 ${target.label}。`,
    `實際查詢區間：${requestedWindowStart} 至 ${requestedWindowEnd}。`,
    `但本地 EnMS summary layer 在這個區間內沒有可統計的設備 / 迴路耗電資料；目前這個範圍可見的 summary 資料時間帶為 ${earliestSummaryTime} 至 ${latestSummaryTime}。`,
  ];

  if (fallbackRows.length > 0) {
    lines.push(
      "",
      `我先改用最新可用 7 天（${fallbackWindowStart} 至 ${fallbackWindowEnd}）整理出設備 / 迴路耗電 Top ${Math.min(fallbackRows.length, 5)}：`,
      "",
    );
    fallbackRows.slice(0, 5).forEach((row, index) => {
      lines.push(buildTopLoadLine(row, index, target.siteName));
    });
  } else {
    lines.push(
      "",
      `補查最新可用 7 天（${fallbackWindowStart} 至 ${fallbackWindowEnd}）後，仍沒有可用的耗電排行資料。`,
    );
  }

  lines.push(
    "",
    "如果你要改查其他日期，可以直接指定區間，例如：請查 2026-06-01 到 2026-06-15 的設備 / 迴路耗電排行。",
    "查詢依據：DeviceDataSummaryView + ElectricityMeter + PowerAccounts + sites。此回答只使用本地 EnMS DB，不使用外部網路資料。",
  );

  return lines.join("\n");
}

function buildRecentAnomalyReport(
  summaryRows: AnomalySummaryRow[],
  rawRows: RawQualityRow[],
  requestedSite: string | null,
) {
  if (summaryRows.length === 0 && rawRows.length === 0) {
    return [
      `根據本地 EnMS DB 查詢，${requestedSite ?? "指定場域"}最近 24 小時沒有可用的 summary / raw 異常分析資料。`,
      "查詢依據：DeviceDataSummaryView + mqtt_raw_data + ElectricityMeter + PowerAccounts + sites。此回答只使用本地 EnMS DB。",
    ].join("\n");
  }

  const lines = [
    `根據本地 EnMS DB 的 DeviceDataSummaryView 與 mqtt_raw_data 查詢，${requestedSite ?? "指定場域"}最近 24 小時異常 / 功因 / 電力品質重點如下：`,
    "",
  ];

  if (summaryRows.length > 0) {
    lines.push("summary layer 判讀：");
    summaryRows.slice(0, 3).forEach((row, index) => {
      const avgPf = toNumber(row.avg_pf);
      const minPf = toNumber(row.min_pf);
      const reasons = [
        avgPf > 0 && avgPf < 0.9 ? `平均功因 ${round(avgPf, 4)} 低於 0.9` : "",
        minPf > 0 && minPf < 0.8 ? `最低功因 ${round(minPf, 4)} 明顯偏低` : "",
        toNumber(row.max_demand) > 0 ? `尖峰需量 ${formatKw(toNumber(row.max_demand))}` : "",
      ].filter(Boolean);
      lines.push(
        `${index + 1}. ${row.meter_name ?? "未知電表"} / 迴路 ${row.circuit_seq ?? "n/a"}：${formatNumber(toNumber(row.summary_points))} 筆 summary 點，${reasons.join("；") || "未見明顯異常"}。`,
      );
    });
    lines.push("");
  }

  if (rawRows.length > 0) {
    lines.push("raw layer 檢查：");
    rawRows.slice(0, 3).forEach((row, index) => {
      lines.push(
        `${index + 1}. ${row.meter_name ?? "未知電表"} / 迴路 ${row.circuit_seq ?? "n/a"}：raw ${formatNumber(toNumber(row.raw_points))} 筆，低功因訊號 ${formatNumber(toNumber(row.low_pf_count))} 筆，quality 非 good/ok ${formatNumber(toNumber(row.abnormal_quality_count))} 筆，斷線 ${formatNumber(toNumber(row.disconnected_count))} 筆。`,
      );
    });
    lines.push("");
  }

  lines.push(
    "可能根因：高負載尖峰加上功率因數偏低，常見原因包含馬達 / 壓縮機等感性負載集中啟動、補償設備不足或失效、排程同時段重疊。",
    "排查建議：先檢查最低功因與最高需量同時段的主電錶 / 迴路，再確認功因補償盤、主要馬達負載與尖峰排程；若 raw quality 持續非 good/ok，需同步檢查資料品質與通訊狀態。",
    "查詢依據：DeviceDataSummaryView.MaxDemand / AvgPowerFactor / MinPowerFactor，mqtt_raw_data.pfs / connected / quality / thd_*，並透過 ElectricityMeter / PowerAccounts / sites 對應場域與電表。此回答只使用本地 EnMS DB。",
  );

  return lines.join("\n");
}

function buildPeakDemandRankingReport(rows: SitePeakDemandRow[]) {
  if (rows.length === 0) {
    return [
      "根據本地 EnMS DB 查詢，最近 30 天沒有可統計的場域最大需量資料。",
      "查詢依據：DeviceDataSummaryView + ElectricityMeter + PowerAccounts + sites。此回答只使用本地 EnMS DB。",
    ].join("\n");
  }

  const lines = [
    "根據本地 EnMS DB 的 DeviceDataSummaryView、ElectricityMeter、PowerAccounts 與 sites 查詢，最近 30 天場域最大需量排行如下：",
    "",
  ];

  rows.slice(0, 5).forEach((row, index) => {
    lines.push(
      `${index + 1}. ${row.site_name ?? "未對應場域"}：最大需量 ${formatKw(toNumber(row.peak_kw))}，時間 ${formatTime(row.peak_time)}，來源電表 ${row.meter_name ?? "未知電表"} / 迴路 ${row.circuit_seq ?? "n/a"}。`,
    );
  });

  lines.push(
    "",
    "判讀建議：最大需量最高的場域優先檢查尖峰時段負載與可降載設備，避免後續契約容量風險擴大。",
    "查詢依據：max(DeviceDataSummaryView.MaxDemand)、DeviceDataSummaryView.RecordTime，並透過 ElectricityMeter / PowerAccounts / sites 對應場域。此回答只使用本地 EnMS DB。",
  );

  return lines.join("\n");
}

function buildSiteBenchmarkReport(rows: SiteKpiRow[], userMessage: string) {
  if (rows.length === 0) {
    return [
      "根據本地 EnMS DB 查詢，最近 30 天沒有可統計的場域 KPI 資料。",
      "查詢依據：DeviceDataSummaryView + ElectricityMeter + PowerAccounts + sites。此回答只使用本地 EnMS DB。",
    ].join("\n");
  }

  const asksWorstPf = userMessage.includes("功率因數最差") || userMessage.includes("功因最差");
  const sortedByPf = rows.toSorted((a, b) => toNumber(a.avg_pf) - toNumber(b.avg_pf));

  if (asksWorstPf) {
    const worst = sortedByPf[0];
    return [
      `根據本地 EnMS DB 的 DeviceDataSummaryView 查詢，最近 30 天平均功率因數最差的場域是 ${worst.site_name ?? "未對應場域"}。`,
      "",
      `平均功率因數：${round(toNumber(worst.avg_pf), 4)}；最低功率因數：${round(toNumber(worst.min_pf), 4)}；總用電：${formatKwh(toNumber(worst.total_kwh))}；最大需量：${formatKw(toNumber(worst.peak_kw))}；資料點數：${formatNumber(toNumber(worst.point_count))}。`,
      "判讀：若平均功因低於 0.9，建議優先檢查功因補償設備、馬達 / 壓縮機等感性負載，以及尖峰時段是否集中啟動。",
      "查詢依據：avg(DeviceDataSummaryView.AvgPowerFactor)、min(DeviceDataSummaryView.MinPowerFactor)，並透過 ElectricityMeter / PowerAccounts / sites 對應場域。此回答只使用本地 EnMS DB。",
    ].join("\n");
  }

  const lines = [
    "根據本地 EnMS DB 的 DeviceDataSummaryView、ElectricityMeter、PowerAccounts 與 sites 查詢，最近 30 天場域 benchmarking 如下：",
    "",
  ];

  rows
    .toSorted((a, b) => toNumber(b.total_kwh) - toNumber(a.total_kwh))
    .forEach((row, index) => {
      lines.push(
        `${index + 1}. ${row.site_name ?? "未對應場域"}：總用電 ${formatKwh(toNumber(row.total_kwh))}，最大需量 ${formatKw(toNumber(row.peak_kw))}，平均功率因數 ${round(toNumber(row.avg_pf), 4)}，最低功率因數 ${round(toNumber(row.min_pf), 4)}，資料點數 ${formatNumber(toNumber(row.point_count))}。`,
      );
    });

  lines.push(
    "",
    "差異判讀：總用電高代表節能潛力較大；最大需量高代表契約容量與尖峰降載風險較高；平均功率因數低於 0.9 的場域，應優先檢查功因補償與感性負載。",
    "查詢依據：sum(DeviceDataSummaryView.TotalConsumption)、max(DeviceDataSummaryView.MaxDemand)、avg/min(DeviceDataSummaryView.*PowerFactor)，並透過 ElectricityMeter / PowerAccounts / sites 對應場域。此回答只使用本地 EnMS DB。",
  );

  return lines.join("\n");
}

function buildSavingsScenarioReport(rows: SavingsScenarioRow[], requestedSite: string | null) {
  if (rows.length === 0) {
    return [
      `根據本地 EnMS DB 查詢，${requestedSite ?? "指定場域"}目前沒有可用帳單資料，無法估算節電 5% / 10% 的節省金額。`,
      "查詢依據：TaipowerBills + PowerAccounts + sites。此回答只使用本地 EnMS DB。",
    ].join("\n");
  }

  const lines = [
    `根據本地 EnMS DB 的 TaipowerBills、PowerAccounts 與 sites 查詢，以下用最新可用帳單年度估算節電 5% / 10% 的效果。`,
    "",
  ];

  rows.forEach((row) => {
    lines.push(
      `- ${row.site_name ?? requestedSite ?? "未命名場域"}（${row.gregorian_year ?? "最新年度"}）：${formatNumber(toNumber(row.billed_accounts))} 個電號、${formatNumber(toNumber(row.bill_count))} 期帳單，年度用電 ${formatKwh(toNumber(row.baseline_kwh))}，年度電費 ${formatMoney(toNumber(row.baseline_bill))}；節電 5% 約省 ${formatKwh(toNumber(row.savings_5pct_kwh))} / ${formatMoney(toNumber(row.savings_5pct_ntd))}，節電 10% 約省 ${formatKwh(toNumber(row.savings_10pct_kwh))} / ${formatMoney(toNumber(row.savings_10pct_ntd))}。`,
    );
  });

  lines.push(
    "",
    "邊界說明：這是用本地歷史帳單做 baseline 的節能情境估算；若要轉成 ROI / 回收期，還需要設備投資 CAPEX、維護成本 OPEX 與實際節電率驗證。",
    "查詢依據：TaipowerBills.BillingMonth、UsageAmount、TotalAmount，並透過 PowerAccounts.SiteId 對應 sites.site_id。此回答只使用本地 EnMS DB。",
  );

  return lines.join("\n");
}

function buildSiteBillRankingReport(rows: SavingsScenarioRow[], requestedSite: string | null) {
  if (rows.length === 0) {
    return [
      "我判斷這是 EnMS 最新年度電費 / 用電排行查詢，已優先查本地 EnMS DB。",
      requestedSite
        ? `目前在 ${requestedSite} 找不到可用的台電帳單 baseline，因此不能用 DB 產出電費排行或圖表。`
        : "目前找不到可用的台電帳單 baseline，因此不能用 DB 產出場域電費排行或圖表。",
      "我不會改用外部網路資料或假資料補齊；請先確認 TaipowerBills、PowerAccounts 與 sites 是否已有最新帳單資料。",
    ].join("\n");
  }

  const latestYear = rows.reduce((maxYear, row) => {
    const year = toNumber(row.gregorian_year);
    return year > maxYear ? year : maxYear;
  }, 0);
  const normalizedRows = rows.map((row, index) => ({
    rank: index + 1,
    site_name: row.site_name ?? "未命名場域",
    baseline_bill: round(toNumber(row.baseline_bill), 0),
    baseline_kwh: round(toNumber(row.baseline_kwh), 0),
    billed_accounts: toNumber(row.billed_accounts),
    bill_count: toNumber(row.bill_count),
  }));

  const lines = [
    `根據本地 EnMS DB 的 TaipowerBills、PowerAccounts 與 sites 查詢，以下是${requestedSite ? `${requestedSite} ` : ""}${latestYear > 0 ? `${latestYear} 年` : "最新年度"}台電帳單 baseline 的電費 / 用電排行。`,
    "",
    ...normalizedRows.map(
      (row) =>
        `${row.rank}. ${row.site_name}：年度電費 ${formatMoney(row.baseline_bill)}，年度用電 ${formatNumber(row.baseline_kwh)} kWh，涵蓋 ${formatNumber(row.billed_accounts)} 個電號 / ${formatNumber(row.bill_count)} 期帳單。`,
    ),
    "",
    "查詢依據：TaipowerBills.BillingMonth、UsageAmount、TotalAmount，並透過 PowerAccounts.SiteId 對應 sites.site_id。此回答只使用本地 EnMS DB，不使用外部網路資料。",
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        ...ENMS_REPORT_METADATA,
        title: `${latestYear > 0 ? `${latestYear} 年` : "最新年度"} EnMS 場域電費 / 用電排行`,
        description: "以本地 EnMS DB 的最新可用台電帳單年度 baseline 產出場域電費與用電排行。",
        panels: [
          {
            id: "enms-site-bill-ranking",
            title: "場域年度電費排行",
            type: "bar",
            rows: normalizedRows,
            mapping: {
              xAxis: "site_name",
              yAxis: ["baseline_bill"],
            },
            size: "full",
          },
          {
            id: "enms-site-kwh-ranking",
            title: "場域年度用電排行",
            type: "bar",
            rows: normalizedRows,
            mapping: {
              xAxis: "site_name",
              yAxis: ["baseline_kwh"],
            },
            size: "full",
          },
        ],
      },
      null,
      2,
    ),
    "```",
  ];

  return lines.join("\n");
}

function buildBillTrendReport(target: BillTrendTarget, rows: BillTrendRow[]) {
  const normalizedRows = rows.map((row) => ({
    period: row.period?.trim() || "UNKNOWN",
    bill_count: toNumber(row.bill_count),
    account_count: toNumber(row.account_count),
    total_kwh: round(toNumber(row.total_kwh), 2),
    total_bill: round(toNumber(row.total_bill), 0),
    avg_rate: round(toNumber(row.avg_rate), 4),
  }));

  if (normalizedRows.length === 0) {
    return [
      `我判斷這是 EnMS ${target.label}查詢，已優先查本地 EnMS DB。`,
      `目前在 ${target.scopeLabel} 的指定台電帳單範圍內找不到可用資料，因此不能用 DB 產出帳單趨勢圖。`,
      "我不會改用外部網路資料或假資料補齊；請先確認 TaipowerBills、PowerAccounts 與 sites 是否已有該範圍帳單資料。",
    ].join("\n");
  }

  const latest = normalizedRows.at(-1);
  const totalKwh = normalizedRows.reduce((sum, row) => sum + row.total_kwh, 0);
  const totalBill = normalizedRows.reduce((sum, row) => sum + row.total_bill, 0);
  const weightedAvgRate = totalKwh > 0 ? totalBill / totalKwh : 0;

  return [
    `根據本地 EnMS DB 的 TaipowerBills、PowerAccounts 與 sites 查詢，${target.label}已整理完成。`,
    "",
    `資料期數：${formatNumber(normalizedRows.length)} 期；累計用電 ${formatKwh(totalKwh)}；累計電費 ${formatMoney(totalBill)}；整體平均電價 ${round(weightedAvgRate, 4).toFixed(4)} 元/kWh。`,
    latest
      ? `最新期 ${latest.period}：用電 ${formatKwh(latest.total_kwh)}，電費 ${formatMoney(latest.total_bill)}，平均電價 ${latest.avg_rate.toFixed(4)} 元/kWh，涵蓋 ${formatNumber(latest.account_count)} 個電號 / ${formatNumber(latest.bill_count)} 期帳單。`
      : "最新期資料不足。",
    "",
    "查詢依據：TaipowerBills.BillingMonth、UsageAmount、TotalAmount，並透過 PowerAccounts.SiteId 對應 sites.site_id。此回答只使用本地 EnMS DB，不使用外部網路資料。",
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        ...ENMS_REPORT_METADATA,
        title: `EnMS ${target.label}`,
        description: "以本地 EnMS DB 的台電帳單資料呈現用電、電費與平均電價趨勢。",
        panels: [
          {
            id: "enms-bill-trend-amount",
            title: "台電帳單電費趨勢",
            type: "line",
            rows: normalizedRows,
            mapping: {
              xAxis: "period",
              yAxis: ["total_bill"],
            },
            size: "full",
          },
          {
            id: "enms-bill-trend-kwh",
            title: "台電帳單用電趨勢",
            type: "line",
            rows: normalizedRows,
            mapping: {
              xAxis: "period",
              yAxis: ["total_kwh"],
            },
            size: "full",
          },
          {
            id: "enms-bill-trend-rate",
            title: "平均電價趨勢",
            type: "line",
            rows: normalizedRows,
            mapping: {
              xAxis: "period",
              yAxis: ["avg_rate"],
            },
            size: "full",
          },
        ],
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

function buildEnergyTrendReport(target: EnergyTrendTarget, rows: EnergyTrendRow[]) {
  const normalizedRows = rows.map((row) => ({
    period: row.period?.trim() || "UNKNOWN",
    total_kwh: round(toNumber(row.total_kwh), 2),
    peak_kw: round(toNumber(row.peak_kw), 2),
    avg_pf: round(toNumber(row.avg_pf), 4),
  }));

  if (normalizedRows.length === 0) {
    return [
      `我判斷這是 EnMS ${target.label}查詢，已優先查本地 EnMS DB。`,
      `目前在 ${target.scopeLabel} 的指定時間範圍內找不到可用的 DeviceDataSummaryView 趨勢資料，因此不能用 DB 產出趨勢圖。`,
      "我不會改用外部網路資料或假資料補齊；請先確認 summary layer 是否已有該時段資料。",
    ].join("\n");
  }

  const latest = normalizedRows.at(-1);
  const totalKwh = normalizedRows.reduce((sum, row) => sum + row.total_kwh, 0);
  const peakRow = normalizedRows.reduce(
    (current, row) => (row.peak_kw > current.peak_kw ? row : current),
    normalizedRows[0],
  );

  return [
    `根據本地 EnMS DB 的 DeviceDataSummaryView、ElectricityMeter、PowerAccounts 與 sites 查詢，${target.scopeLabel}的能源趨勢已整理完成。`,
    "",
    `時間粒度：${target.grain === "month" ? "月" : "日"}；資料點數 ${formatNumber(normalizedRows.length)}。`,
    `累計用電：${formatKwh(totalKwh)}。`,
    `最高需量區間：${peakRow.period}，最大需量 ${formatKw(peakRow.peak_kw)}。`,
    latest
      ? `最新區間 ${latest.period}：用電 ${formatKwh(latest.total_kwh)}，最大需量 ${formatKw(latest.peak_kw)}，平均功率因數 ${round(latest.avg_pf, 4)}。`
      : "最新區間資料不足。",
    "",
    `查詢依據：sum(DeviceDataSummaryView.TotalConsumption)、max(DeviceDataSummaryView.MaxDemand)、avg(DeviceDataSummaryView.AvgPowerFactor)，並透過 ElectricityMeter / PowerAccounts / sites 對應場域。此回答只使用本地 EnMS DB，不使用外部網路資料。`,
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        ...ENMS_REPORT_METADATA,
        title: `EnMS ${target.scopeLabel}能源趨勢`,
        description: "以本地 EnMS summary layer 產生用電、需量與功率因數 time-series。",
        panels: [
          {
            id: "enms-energy-trend-kwh",
            title: "總用電趨勢",
            type: "line",
            rows: normalizedRows,
            mapping: {
              xAxis: "period",
              yAxis: ["total_kwh"],
            },
            size: "full",
          },
          {
            id: "enms-energy-trend-demand",
            title: "最大需量趨勢",
            type: "line",
            rows: normalizedRows,
            mapping: {
              xAxis: "period",
              yAxis: ["peak_kw"],
            },
            size: "full",
          },
          {
            id: "enms-energy-trend-pf",
            title: "平均功率因數趨勢",
            type: "line",
            rows: normalizedRows,
            mapping: {
              xAxis: "period",
              yAxis: ["avg_pf"],
            },
            size: "full",
          },
        ],
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

function buildPriorityConsumptionIssueReport(
  riskRows: ContractRiskRow[],
  topLoadRows: TopLoadRow[],
) {
  const topRisk = riskRows[0];
  const topLoad = topLoadRows[0];

  if (!topRisk && !topLoad) {
    return [
      "根據本地 EnMS DB，目前沒有足夠的近期契約容量風險或設備耗電資料可判斷優先處理項目。",
      "查詢依據：DemandAlertHistory、DeviceDataSummaryView、ElectricityMeter、PowerAccounts、sites。此回答只使用本地 EnMS DB。",
    ].join("\n");
  }

  const lines = [
    "根據本地 EnMS DB，現在最值得先處理的耗電問題是「契約容量 / 需量風險最高的負載」，其次才是一般耗電排行。",
    "",
  ];

  if (topRisk) {
    lines.push(
      `第一優先：${topRisk.site_name ?? "未對應場域"} 電號 ${topRisk.account_number ?? "未知"}，最高使用率 ${formatPercent(toNumber(topRisk.max_utilization))}，最大需量 ${formatKw(toNumber(topRisk.max_demand))}，契約容量 ${formatKw(toNumber(topRisk.contract_capacity))}。這會直接影響超約風險，建議先做尖峰時段降載與排程錯峰。`,
    );
  }

  if (topLoad) {
    lines.push(
      `第二優先：${topLoad.site_name ?? "未對應場域"} / ${topLoad.meter_name ?? "未知電表"} / 迴路 ${topLoad.circuit_seq ?? "n/a"}，最近 7 天耗電 ${formatKwh(toNumber(topLoad.total_kwh))}、尖峰 ${formatKw(toNumber(topLoad.peak_kw))}、平均功因 ${round(toNumber(topLoad.avg_pf), 4)}。建議檢查是否有長時間基載、同時啟動或功因偏低。`,
    );
  }

  lines.push(
    "",
    "查詢依據：DemandAlertHistory.UtilizationRate / CurrentDemand / ContractCapacity，以及 DeviceDataSummaryView.TotalConsumption / MaxDemand / AvgPowerFactor。此回答只使用本地 EnMS DB。",
  );

  return lines.join("\n");
}

function buildMaintenanceInspectionReport(topLoadRows: TopLoadRow[]) {
  if (topLoadRows.length === 0) {
    return [
      "根據本地 EnMS DB，目前沒有可用的設備 / 迴路耗電排行資料可安排巡檢順序。",
      "查詢依據：DeviceDataSummaryView + ElectricityMeter + PowerAccounts + sites。此回答只使用本地 EnMS DB。",
    ].join("\n");
  }

  const lines = [
    "根據本地 EnMS DB，維修巡檢建議先看以下設備 / 迴路：",
    "",
  ];

  topLoadRows.slice(0, 5).forEach((row, index) => {
    const reasons = [
      `最近 7 天耗電 ${formatKwh(toNumber(row.total_kwh))}`,
      `尖峰 ${formatKw(toNumber(row.peak_kw))}`,
      toNumber(row.avg_pf) > 0 && toNumber(row.avg_pf) < 0.9
        ? `平均功因 ${round(toNumber(row.avg_pf), 4)} 偏低`
        : "",
    ].filter(Boolean);
    lines.push(
      `${index + 1}. ${row.site_name ?? "未對應場域"} / ${row.meter_name ?? "未知電表"} / 迴路 ${row.circuit_seq ?? "n/a"}：${reasons.join("；")}。`,
    );
  });

  lines.push(
    "",
    "巡檢重點：先確認高耗電迴路的排程與持續基載，再檢查功因補償與主要馬達 / 壓縮機等感性負載狀態。",
    "查詢依據：sum(DeviceDataSummaryView.TotalConsumption)、max(DeviceDataSummaryView.MaxDemand)、avg(DeviceDataSummaryView.AvgPowerFactor)，並透過 ElectricityMeter / PowerAccounts / sites 對應電表。此回答只使用本地 EnMS DB。",
  );

  return lines.join("\n");
}

function buildExecutiveBriefReport(riskRows: ContractRiskRow[], topLoadRows: TopLoadRow[]) {
  const topRisk = riskRows[0];
  const topLoad = topLoadRows[0];

  if (!topRisk && !topLoad) {
    return [
      "根據本地 EnMS DB，目前沒有足夠的近期需量風險或耗電排行資料可形成主管摘要。",
      "建議先確認 DeviceDataSummaryView 與 DemandAlertHistory 是否持續寫入。",
      "此回答只使用本地 EnMS DB，不使用外部網路資料。",
    ].join("\n");
  }

  const riskSentence = topRisk
    ? `1. 目前最高契約容量風險在 ${topRisk.site_name ?? "未對應場域"} 電號 ${topRisk.account_number ?? "未知"}，最高使用率 ${formatPercent(toNumber(topRisk.max_utilization))}，最大需量 ${formatKw(toNumber(topRisk.max_demand))}。`
    : "1. 目前沒有可確認的契約容量風險資料。";
  const loadSentence = topLoad
    ? `2. 最近 7 天耗電優先關注點是 ${topLoad.site_name ?? "未對應場域"} / ${topLoad.meter_name ?? "未知電表"}，耗電 ${formatKwh(toNumber(topLoad.total_kwh))}，尖峰 ${formatKw(toNumber(topLoad.peak_kw))}。`
    : "2. 目前沒有可確認的設備 / 迴路耗電排行資料。";

  return [
    "可以用這三句話回報：",
    riskSentence,
    loadSentence,
    "3. 建議先處理超約 / 接近契約容量的電號，再檢查高耗電迴路的排程與功率因數，這是目前最能快速降低風險與電費的方向。",
    "",
    "查詢依據：DemandAlertHistory、DeviceDataSummaryView、ElectricityMeter、PowerAccounts、sites。此回答只使用本地 EnMS DB。",
  ].join("\n");
}

function buildQuickWinReport(riskRows: ContractRiskRow[], topLoadRows: TopLoadRow[]) {
  const lines = [
    "根據本地 EnMS DB，目前可先看的節省電費 quick win 如下：",
    "",
  ];

  if (topLoadRows.length > 0) {
    const row = topLoadRows[0];
    const potentialKwh = toNumber(row.total_kwh) * 0.05;
    lines.push(
      `1. 高耗電迴路排程優化：${row.site_name ?? "未對應場域"} / ${row.meter_name ?? "未知電表"} 最近 7 天耗電 ${formatKwh(toNumber(row.total_kwh))}；若先以 5% 節電作為保守目標，約可少用 ${formatKwh(potentialKwh)}。`,
    );
  }

  if (riskRows.length > 0) {
    const row = riskRows[0];
    lines.push(
      `2. 需量風險降載：${row.site_name ?? "未對應場域"} 電號 ${row.account_number ?? "未知"} 最高使用率 ${formatPercent(toNumber(row.max_utilization))}，建議針對尖峰時段做錯峰或短時降載。`,
    );
  }

  const lowPf = topLoadRows.find((row) => {
    const avgPf = toNumber(row.avg_pf);
    return avgPf > 0 && avgPf < 0.9;
  });
  if (lowPf) {
    lines.push(
      `3. 功率因數改善：${lowPf.site_name ?? "未對應場域"} / ${lowPf.meter_name ?? "未知電表"} 平均功因 ${round(toNumber(lowPf.avg_pf), 4)}，低於常見建議值 0.9，可優先檢查補償設備或負載型態。`,
    );
  }

  if (lines.length === 2) {
    lines.push("目前近期資料不足以形成明確 quick win，建議先確認 summary layer 與告警資料是否持續進場。");
  }

  lines.push(
    "",
    "查詢依據：DeviceDataSummaryView.TotalConsumption / MaxDemand / AvgPowerFactor、DemandAlertHistory.UtilizationRate。此回答只使用本地 EnMS DB；節電量為以現有 DB 數據做的保守情境試算，不是假資料。",
  );

  return lines.join("\n");
}

function detectKnownSiteName(message: string): string | null {
  if (message.includes("阿里山")) {
    return "阿里山";
  }
  if (message.includes("洋銘")) {
    return "洋銘資訊";
  }
  return null;
}

async function queryRecentAlertGovernanceRows() {
  return duckdbQueryExternalPgAsyncDetailed<AlertGovernanceRow>(
    getEnmsPostgresConnectionString(),
    `
      SELECT
        "AccountNumber" AS account_number,
        COALESCE("AlertType", 'Unknown') AS alert_type,
        COUNT(*) AS alert_count,
        MAX("UtilizationRate") AS max_utilization,
        MAX("CurrentDemand") AS max_demand,
        MAX("ContractCapacity") AS contract_capacity,
        MIN("AlertTime") AS first_alert_time,
        MAX("AlertTime") AS latest_alert_time
      FROM enms.public."DemandAlertHistory"
      WHERE "AlertTime" >= NOW() - INTERVAL '7 days'
      GROUP BY "AccountNumber", COALESCE("AlertType", 'Unknown')
      ORDER BY max_utilization DESC NULLS LAST, alert_count DESC
      LIMIT 10
    `,
    "enms",
  );
}

async function queryContractRiskRows() {
  return duckdbQueryExternalPgAsyncDetailed<ContractRiskRow>(
    getEnmsPostgresConnectionString(),
    `
      SELECT
        COALESCE(s.site_name, '(未對應場域)') AS site_name,
        dah."AccountNumber" AS account_number,
        MAX(dah."UtilizationRate") AS max_utilization,
        MAX(dah."CurrentDemand") AS max_demand,
        MAX(dah."ContractCapacity") AS contract_capacity,
        MAX(dah."AlertTime") AS latest_alert_time
      FROM enms.public."DemandAlertHistory" dah
      LEFT JOIN enms.public."PowerAccounts" pa
        ON pa."AccountNumber" = dah."AccountNumber"
      LEFT JOIN enms.public.sites s
        ON s.site_id = pa."SiteId"
      WHERE dah."AlertTime" >= NOW() - INTERVAL '30 days'
      GROUP BY COALESCE(s.site_name, '(未對應場域)'), dah."AccountNumber"
      ORDER BY max_utilization DESC NULLS LAST
      LIMIT 5
    `,
    "enms",
  );
}

async function querySiteAccountsRows() {
  return duckdbQueryExternalPgAsyncDetailed<SiteAccountsRow>(
    getEnmsPostgresConnectionString(),
    `
      SELECT
        COALESCE(s.site_name, '(未對應場域)') AS site_name,
        STRING_AGG(pa."AccountNumber", ', ' ORDER BY pa."AccountNumber") AS accounts,
        COUNT(*) AS account_count
      FROM enms.public."PowerAccounts" pa
      LEFT JOIN enms.public.sites s
        ON s.site_id = pa."SiteId"
      WHERE pa."AccountNumber" IS NOT NULL
      GROUP BY COALESCE(s.site_name, '(未對應場域)')
      ORDER BY site_name
    `,
    "enms",
  );
}

function buildTopLoadSiteFilter(siteName: string | null) {
  if (!siteName) {
    return "";
  }
  const escapedSiteName = siteName.replace(/'/g, "''");
  return `AND s.site_name LIKE '%${escapedSiteName}%'`;
}

async function queryTopLoadRows(
  siteName: string | null,
  startSql: string = "NOW() - INTERVAL '7 days'",
  endSql: string = "NOW()",
) {
  const siteFilter = buildTopLoadSiteFilter(siteName);
  return duckdbQueryExternalPgAsyncDetailed<TopLoadRow>(
    getEnmsPostgresConnectionString(),
    `
      WITH meter_meta AS (
        SELECT
          "DeviceAddress",
          TRY_CAST("CircuitSeq" AS INTEGER) AS circuit_seq,
          MAX(COALESCE(NULLIF("DeviceAlias", ''), "DeviceName", "DeviceAddress")) AS meter_name,
          MAX("PowerAccountId") AS power_account_id
        FROM enms.public."ElectricityMeter"
        GROUP BY "DeviceAddress", TRY_CAST("CircuitSeq" AS INTEGER)
      )
      SELECT
        COALESCE(s.site_name, '(未對應場域)') AS site_name,
        COALESCE(mm.meter_name, v."MacAddress") AS meter_name,
        v."CircuitSeq" AS circuit_seq,
        SUM(v."TotalConsumption") AS total_kwh,
        MAX(v."MaxDemand") AS peak_kw,
        AVG(v."AvgPowerFactor") AS avg_pf
      FROM enms.public."DeviceDataSummaryView" v
      LEFT JOIN meter_meta mm
        ON mm."DeviceAddress" = v."MacAddress"
       AND mm.circuit_seq = v."CircuitSeq"
      LEFT JOIN enms.public."PowerAccounts" pa
        ON pa."AccountId" = mm.power_account_id
      LEFT JOIN enms.public.sites s
        ON s.site_id = pa."SiteId"
      WHERE v."RecordTime" >= ${startSql}
        AND v."RecordTime" < ${endSql}
        ${siteFilter}
      GROUP BY 1, 2, 3
      HAVING SUM(v."TotalConsumption") > 0
      ORDER BY total_kwh DESC
      LIMIT 5
    `,
    "enms",
  );
}

async function queryTopLoadAvailabilityRow(target: TopLoadTarget) {
  const siteFilter = buildTopLoadSiteFilter(target.siteName);
  if (!target.siteName) {
    return duckdbQueryExternalPgAsyncDetailed<TopLoadAvailabilityRow>(
      getEnmsPostgresConnectionString(),
      `
        SELECT
          CAST(${target.startSql} AS VARCHAR) AS requested_window_start,
          CAST(${target.endSql} AS VARCHAR) AS requested_window_end,
          CAST(MIN("RecordTime") AS VARCHAR) AS earliest_summary_time,
          CAST(MAX("RecordTime") AS VARCHAR) AS latest_summary_time,
          CAST(MAX("RecordTime") - INTERVAL '7 days' AS VARCHAR) AS fallback_window_start,
          CAST(MAX("RecordTime") AS VARCHAR) AS fallback_window_end,
          COUNT(*) FILTER (
            WHERE "RecordTime" >= ${target.startSql}
              AND "RecordTime" < ${target.endSql}
          ) AS summary_rows_requested_window
        FROM enms.public."DeviceDataSummaryView"
      `,
      "enms",
    );
  }

  return duckdbQueryExternalPgAsyncDetailed<TopLoadAvailabilityRow>(
    getEnmsPostgresConnectionString(),
    `
      WITH meter_meta AS (
        SELECT
          "DeviceAddress",
          TRY_CAST("CircuitSeq" AS INTEGER) AS circuit_seq,
          MAX("PowerAccountId") AS power_account_id
        FROM enms.public."ElectricityMeter"
        GROUP BY "DeviceAddress", TRY_CAST("CircuitSeq" AS INTEGER)
      ),
      scoped_summary AS (
        SELECT
          v."RecordTime" AS record_time
        FROM enms.public."DeviceDataSummaryView" v
        LEFT JOIN meter_meta mm
          ON mm."DeviceAddress" = v."MacAddress"
         AND mm.circuit_seq = v."CircuitSeq"
        LEFT JOIN enms.public."PowerAccounts" pa
          ON pa."AccountId" = mm.power_account_id
        LEFT JOIN enms.public.sites s
          ON s.site_id = pa."SiteId"
        WHERE 1 = 1
          ${siteFilter}
      )
      SELECT
        CAST(${target.startSql} AS VARCHAR) AS requested_window_start,
        CAST(${target.endSql} AS VARCHAR) AS requested_window_end,
        CAST(MIN(record_time) AS VARCHAR) AS earliest_summary_time,
        CAST(MAX(record_time) AS VARCHAR) AS latest_summary_time,
        CAST(MAX(record_time) - INTERVAL '7 days' AS VARCHAR) AS fallback_window_start,
        CAST(MAX(record_time) AS VARCHAR) AS fallback_window_end,
        COUNT(*) FILTER (
          WHERE record_time >= ${target.startSql}
            AND record_time < ${target.endSql}
        ) AS summary_rows_requested_window
      FROM scoped_summary
    `,
    "enms",
  );
}

async function queryLatestAvailableTopLoadRows(siteName: string | null) {
  const siteFilter = buildTopLoadSiteFilter(siteName);
  return duckdbQueryExternalPgAsyncDetailed<TopLoadRow>(
    getEnmsPostgresConnectionString(),
    `
      WITH meter_meta AS (
        SELECT
          "DeviceAddress",
          TRY_CAST("CircuitSeq" AS INTEGER) AS circuit_seq,
          MAX(COALESCE(NULLIF("DeviceAlias", ''), "DeviceName", "DeviceAddress")) AS meter_name,
          MAX("PowerAccountId") AS power_account_id
        FROM enms.public."ElectricityMeter"
        GROUP BY "DeviceAddress", TRY_CAST("CircuitSeq" AS INTEGER)
      ),
      latest_summary AS (
        SELECT
          MAX(v."RecordTime") AS latest_time
        FROM enms.public."DeviceDataSummaryView" v
        LEFT JOIN meter_meta mm
          ON mm."DeviceAddress" = v."MacAddress"
         AND mm.circuit_seq = v."CircuitSeq"
        LEFT JOIN enms.public."PowerAccounts" pa
          ON pa."AccountId" = mm.power_account_id
        LEFT JOIN enms.public.sites s
          ON s.site_id = pa."SiteId"
        WHERE 1 = 1
          ${siteFilter}
      )
      SELECT
        COALESCE(s.site_name, '(未對應場域)') AS site_name,
        COALESCE(mm.meter_name, v."MacAddress") AS meter_name,
        v."CircuitSeq" AS circuit_seq,
        SUM(v."TotalConsumption") AS total_kwh,
        MAX(v."MaxDemand") AS peak_kw,
        AVG(v."AvgPowerFactor") AS avg_pf
      FROM enms.public."DeviceDataSummaryView" v
      CROSS JOIN latest_summary ls
      LEFT JOIN meter_meta mm
        ON mm."DeviceAddress" = v."MacAddress"
       AND mm.circuit_seq = v."CircuitSeq"
      LEFT JOIN enms.public."PowerAccounts" pa
        ON pa."AccountId" = mm.power_account_id
      LEFT JOIN enms.public.sites s
        ON s.site_id = pa."SiteId"
      WHERE ls.latest_time IS NOT NULL
        AND v."RecordTime" >= ls.latest_time - INTERVAL '7 days'
        AND v."RecordTime" <= ls.latest_time
        ${siteFilter}
      GROUP BY 1, 2, 3
      HAVING SUM(v."TotalConsumption") > 0
      ORDER BY total_kwh DESC
      LIMIT 5
    `,
    "enms",
  );
}

async function queryRecentAnomalySummaryRows(siteName: string | null) {
  const siteFilter = siteName ? `AND s.site_name LIKE '%${siteName}%'` : "";
  return duckdbQueryExternalPgAsyncDetailed<AnomalySummaryRow>(
    getEnmsPostgresConnectionString(),
    `
      WITH meter_meta AS (
        SELECT
          "DeviceAddress",
          TRY_CAST("CircuitSeq" AS INTEGER) AS circuit_seq,
          MAX(COALESCE(NULLIF("DeviceAlias", ''), "DeviceName", "DeviceAddress")) AS meter_name,
          MAX("PowerAccountId") AS power_account_id
        FROM enms.public."ElectricityMeter"
        GROUP BY "DeviceAddress", TRY_CAST("CircuitSeq" AS INTEGER)
      )
      SELECT
        COALESCE(s.site_name, '(未對應場域)') AS site_name,
        COALESCE(mm.meter_name, v."MacAddress") AS meter_name,
        v."CircuitSeq" AS circuit_seq,
        COUNT(*) AS summary_points,
        MAX(v."MaxDemand") AS max_demand,
        AVG(v."AvgPowerFactor") AS avg_pf,
        MIN(v."MinPowerFactor") AS min_pf,
        SUM(COALESCE(v."ExcludedSampleCount", 0)) AS excluded_samples
      FROM enms.public."DeviceDataSummaryView" v
      LEFT JOIN meter_meta mm
        ON mm."DeviceAddress" = v."MacAddress"
       AND mm.circuit_seq = v."CircuitSeq"
      LEFT JOIN enms.public."PowerAccounts" pa
        ON pa."AccountId" = mm.power_account_id
      LEFT JOIN enms.public.sites s
        ON s.site_id = pa."SiteId"
      WHERE v."RecordTime" >= NOW() - INTERVAL '24 hours'
        ${siteFilter}
      GROUP BY 1, 2, 3
      ORDER BY max_demand DESC NULLS LAST, min_pf ASC NULLS LAST
      LIMIT 5
    `,
    "enms",
  );
}

async function queryRecentRawQualityRows(siteName: string | null) {
  const siteFilter = siteName ? `AND s.site_name LIKE '%${siteName}%'` : "";
  return duckdbQueryExternalPgAsyncDetailed<RawQualityRow>(
    getEnmsPostgresConnectionString(),
    `
      WITH meter_meta AS (
        SELECT
          "DeviceAddress",
          TRY_CAST("CircuitSeq" AS INTEGER) AS circuit_seq,
          MAX(COALESCE(NULLIF("DeviceAlias", ''), "DeviceName", "DeviceAddress")) AS meter_name,
          MAX("PowerAccountId") AS power_account_id
        FROM enms.public."ElectricityMeter"
        GROUP BY "DeviceAddress", TRY_CAST("CircuitSeq" AS INTEGER)
      )
      SELECT
        COALESCE(s.site_name, '(未對應場域)') AS site_name,
        COALESCE(mm.meter_name, r.mac) AS meter_name,
        r.circuit_seq,
        COUNT(*) AS raw_points,
        SUM(CASE WHEN r.connected = false THEN 1 ELSE 0 END) AS disconnected_count,
        SUM(CASE WHEN r.quality IS NOT NULL AND r.quality <> '' AND LOWER(r.quality) NOT IN ('good', 'ok') THEN 1 ELSE 0 END) AS abnormal_quality_count,
        SUM(CASE WHEN r.pfs IS NOT NULL AND r.pfs < 0.9 THEN 1 ELSE 0 END) AS low_pf_count,
        MAX(GREATEST(COALESCE(r.thd_va, 0), COALESCE(r.thd_vb, 0), COALESCE(r.thd_vc, 0))) AS max_voltage_thd
      FROM enms.public.mqtt_raw_data r
      LEFT JOIN meter_meta mm
        ON mm."DeviceAddress" = r.mac
       AND mm.circuit_seq = r.circuit_seq
      LEFT JOIN enms.public."PowerAccounts" pa
        ON pa."AccountId" = mm.power_account_id
      LEFT JOIN enms.public.sites s
        ON s.site_id = pa."SiteId"
      WHERE r.timestamp >= NOW() - INTERVAL '24 hours'
        ${siteFilter}
      GROUP BY 1, 2, 3
      ORDER BY disconnected_count DESC, abnormal_quality_count DESC, low_pf_count DESC
      LIMIT 5
    `,
    "enms",
  );
}

async function querySiteKpiRows() {
  return duckdbQueryExternalPgAsyncDetailed<SiteKpiRow>(
    getEnmsPostgresConnectionString(),
    `
      WITH meter_meta AS (
        SELECT
          "DeviceAddress",
          TRY_CAST("CircuitSeq" AS INTEGER) AS circuit_seq,
          MAX("PowerAccountId") AS power_account_id
        FROM enms.public."ElectricityMeter"
        GROUP BY "DeviceAddress", TRY_CAST("CircuitSeq" AS INTEGER)
      )
      SELECT
        COALESCE(s.site_name, '(未對應場域)') AS site_name,
        SUM(v."TotalConsumption") AS total_kwh,
        MAX(v."MaxDemand") AS peak_kw,
        AVG(v."AvgPowerFactor") AS avg_pf,
        MIN(v."MinPowerFactor") AS min_pf,
        COUNT(*) AS point_count
      FROM enms.public."DeviceDataSummaryView" v
      LEFT JOIN meter_meta mm
        ON mm."DeviceAddress" = v."MacAddress"
       AND mm.circuit_seq = v."CircuitSeq"
      LEFT JOIN enms.public."PowerAccounts" pa
        ON pa."AccountId" = mm.power_account_id
      LEFT JOIN enms.public.sites s
        ON s.site_id = pa."SiteId"
      WHERE v."RecordTime" >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      HAVING COUNT(*) > 0
      ORDER BY total_kwh DESC
    `,
    "enms",
  );
}

async function queryPeakDemandRankingRows() {
  return duckdbQueryExternalPgAsyncDetailed<SitePeakDemandRow>(
    getEnmsPostgresConnectionString(),
    `
      WITH meter_meta AS (
        SELECT
          "DeviceAddress",
          TRY_CAST("CircuitSeq" AS INTEGER) AS circuit_seq,
          MAX(COALESCE(NULLIF("DeviceAlias", ''), "DeviceName", "DeviceAddress")) AS meter_name,
          MAX("PowerAccountId") AS power_account_id
        FROM enms.public."ElectricityMeter"
        GROUP BY "DeviceAddress", TRY_CAST("CircuitSeq" AS INTEGER)
      ),
      site_points AS (
        SELECT
          COALESCE(s.site_name, '(未對應場域)') AS site_name,
          COALESCE(mm.meter_name, v."MacAddress") AS meter_name,
          v."CircuitSeq" AS circuit_seq,
          v."RecordTime" AS peak_time,
          v."MaxDemand" AS peak_kw
        FROM enms.public."DeviceDataSummaryView" v
        LEFT JOIN meter_meta mm
          ON mm."DeviceAddress" = v."MacAddress"
         AND mm.circuit_seq = v."CircuitSeq"
        LEFT JOIN enms.public."PowerAccounts" pa
          ON pa."AccountId" = mm.power_account_id
        LEFT JOIN enms.public.sites s
          ON s.site_id = pa."SiteId"
        WHERE v."RecordTime" >= NOW() - INTERVAL '30 days'
          AND v."MaxDemand" IS NOT NULL
      ),
      ranked AS (
        SELECT
          *,
          ROW_NUMBER() OVER (PARTITION BY site_name ORDER BY peak_kw DESC NULLS LAST, peak_time DESC) AS rn
        FROM site_points
      )
      SELECT
        site_name,
        meter_name,
        circuit_seq,
        peak_kw,
        peak_time
      FROM ranked
      WHERE rn = 1
      ORDER BY peak_kw DESC NULLS LAST
      LIMIT 5
    `,
    "enms",
  );
}

async function querySavingsScenarioRows(siteName: string | null) {
  const siteFilter = siteName ? `AND s.site_name LIKE '%${siteName}%'` : "";
  return duckdbQueryExternalPgAsyncDetailed<SavingsScenarioRow>(
    getEnmsPostgresConnectionString(),
    `
      WITH target_accounts AS (
        SELECT DISTINCT
          s.site_name,
          pa."AccountNumber"
        FROM enms.public.sites s
        JOIN enms.public."PowerAccounts" pa
          ON pa."SiteId" = s.site_id
        WHERE pa."AccountNumber" IS NOT NULL
          ${siteFilter}
      ),
      latest_year AS (
        SELECT
          ta.site_name,
          MAX(FLOOR(TRY_CAST(tb."BillingMonth" AS DOUBLE) / 100)) AS roc_year
        FROM target_accounts ta
        JOIN enms.public."TaipowerBills" tb
          ON tb."AccountNumber" = ta."AccountNumber"
        WHERE TRY_CAST(tb."BillingMonth" AS INTEGER) IS NOT NULL
        GROUP BY ta.site_name
      ),
      bill_summary AS (
        SELECT
          ta.site_name,
          ly.roc_year,
          COUNT(DISTINCT ta."AccountNumber") AS billed_accounts,
          COUNT(*) AS bill_count,
          SUM(COALESCE(TRY_CAST(tb."UsageAmount" AS DOUBLE), 0)) AS baseline_kwh,
          SUM(COALESCE(TRY_CAST(tb."TotalAmount" AS DOUBLE), 0)) AS baseline_bill
        FROM target_accounts ta
        JOIN latest_year ly
          ON ly.site_name = ta.site_name
        JOIN enms.public."TaipowerBills" tb
          ON tb."AccountNumber" = ta."AccountNumber"
         AND FLOOR(TRY_CAST(tb."BillingMonth" AS DOUBLE) / 100) = ly.roc_year
        GROUP BY ta.site_name, ly.roc_year
      )
      SELECT
        site_name,
        roc_year + 1911 AS gregorian_year,
        billed_accounts,
        bill_count,
        baseline_kwh,
        baseline_bill,
        baseline_kwh * 0.05 AS savings_5pct_kwh,
        baseline_kwh * 0.10 AS savings_10pct_kwh,
        baseline_bill * 0.05 AS savings_5pct_ntd,
        baseline_bill * 0.10 AS savings_10pct_ntd
      FROM bill_summary
      ORDER BY baseline_bill DESC
      LIMIT 5
    `,
    "enms",
  );
}

async function queryBillTrendRows(target: BillTrendTarget) {
  const accountFilter = target.accountNumber
    ? `AND pa."AccountNumber" = '${target.accountNumber}'`
    : "";
  const siteFilter = target.siteName ? `AND s.site_name LIKE '%${target.siteName}%'` : "";
  const yearFilter =
    target.year != null
      ? `AND TRY_CAST(tb."BillingMonth" AS INTEGER) BETWEEN ${(target.year - 1911) * 100 + 1} AND ${(target.year - 1911) * 100 + 12}`
      : "";
  const periodLimiter = target.year != null ? "" : `LIMIT ${Math.max(1, target.periodLimit)}`;

  return duckdbQueryExternalPgAsyncDetailed<BillTrendRow>(
    getEnmsPostgresConnectionString(),
    `
      WITH target_accounts AS (
        SELECT DISTINCT
          pa."AccountNumber"
        FROM enms.public."PowerAccounts" pa
        LEFT JOIN enms.public.sites s
          ON s.site_id = pa."SiteId"
        WHERE pa."AccountNumber" IS NOT NULL
          ${accountFilter}
          ${siteFilter}
      ),
      bill_rows AS (
        SELECT
          TRY_CAST(tb."BillingMonth" AS INTEGER) AS billing_month_roc,
          tb."AccountNumber" AS account_number,
          COALESCE(TRY_CAST(tb."UsageAmount" AS DOUBLE), 0) AS usage_kwh,
          COALESCE(TRY_CAST(tb."TotalAmount" AS DOUBLE), 0) AS total_bill
        FROM enms.public."TaipowerBills" tb
        JOIN target_accounts ta
          ON ta."AccountNumber" = tb."AccountNumber"
        WHERE TRY_CAST(tb."BillingMonth" AS INTEGER) IS NOT NULL
          ${yearFilter}
      ),
      selected_periods AS (
        SELECT billing_month_roc
        FROM (
          SELECT DISTINCT billing_month_roc
          FROM bill_rows
        ) periods
        ORDER BY billing_month_roc DESC
        ${periodLimiter}
      )
      SELECT
        printf(
          '%04d-%02d',
          CAST(FLOOR(CAST(br.billing_month_roc AS DOUBLE) / 100) + 1911 AS INTEGER),
          CAST(MOD(br.billing_month_roc, 100) AS INTEGER)
        ) AS period,
        COUNT(*) AS bill_count,
        COUNT(DISTINCT br.account_number) AS account_count,
        SUM(br.usage_kwh) AS total_kwh,
        SUM(br.total_bill) AS total_bill,
        SUM(br.total_bill) / NULLIF(SUM(br.usage_kwh), 0) AS avg_rate
      FROM bill_rows br
      JOIN selected_periods sp
        ON sp.billing_month_roc = br.billing_month_roc
      GROUP BY br.billing_month_roc
      ORDER BY br.billing_month_roc ASC
    `,
    "enms",
  );
}

async function queryEnergyTrendRows(target: EnergyTrendTarget) {
  const siteFilter = target.siteName ? `AND s.site_name LIKE '%${target.siteName}%'` : "";
  const periodFormat = target.grain === "month" ? "%Y-%m" : "%Y-%m-%d";
  return duckdbQueryExternalPgAsyncDetailed<EnergyTrendRow>(
    getEnmsPostgresConnectionString(),
    `
      WITH meter_meta AS (
        SELECT
          "DeviceAddress",
          TRY_CAST("CircuitSeq" AS INTEGER) AS circuit_seq,
          MAX("PowerAccountId") AS power_account_id
        FROM enms.public."ElectricityMeter"
        GROUP BY "DeviceAddress", TRY_CAST("CircuitSeq" AS INTEGER)
      )
      SELECT
        strftime(date_trunc('${target.grain}', v."RecordTime"), '${periodFormat}') AS period,
        SUM(COALESCE(v."TotalConsumption", 0)) AS total_kwh,
        MAX(COALESCE(v."MaxDemand", 0)) AS peak_kw,
        AVG(NULLIF(v."AvgPowerFactor", 0)) AS avg_pf
      FROM enms.public."DeviceDataSummaryView" v
      LEFT JOIN meter_meta mm
        ON mm."DeviceAddress" = v."MacAddress"
       AND mm.circuit_seq = v."CircuitSeq"
      LEFT JOIN enms.public."PowerAccounts" pa
        ON pa."AccountId" = mm.power_account_id
      LEFT JOIN enms.public.sites s
        ON s.site_id = pa."SiteId"
      WHERE v."RecordTime" >= ${target.startSql}
        AND v."RecordTime" < ${target.endSql}
        ${siteFilter}
      GROUP BY 1
      HAVING SUM(COALESCE(v."TotalConsumption", 0)) > 0
      ORDER BY period ASC
    `,
    "enms",
  );
}

function buildDemandAlertCountReport(
  accountNumber: string,
  totalCount: number,
  countRow: DemandAlertCountRow | undefined,
  typeRows: DemandAlertTypeRow[],
) {
  const breakdownRows = typeRows.map((row) => ({
    alert_type: row.alert_type ?? "Unknown",
    alert_count: toNumber(row.alert_count),
  }));
  const breakdownText =
    breakdownRows.length > 0
      ? breakdownRows
          .map((row) => `${row.alert_type}：${formatNumber(row.alert_count)} 筆`)
          .join("、")
      : "目前沒有可分組的告警類型資料";

  const lines = [
    `根據本地 EnMS DB 的 DemandAlertHistory 查詢，電號 ${accountNumber} 目前共有 ${formatNumber(totalCount)} 筆需量告警紀錄。`,
    "",
    `查詢時間範圍：${formatTime(countRow?.first_alert_time)} 到 ${formatTime(countRow?.latest_alert_time)}。`,
    `告警類型分布：${breakdownText}。`,
    "",
    "查詢依據：DemandAlertHistory.AccountNumber、AlertType、AlertTime。此回答只使用本地 EnMS DB，不使用外部網路資料。",
  ];

  if (breakdownRows.length > 0) {
    lines.push(
      "",
      "```report-json",
      JSON.stringify(
        {
          version: 1,
          ...ENMS_REPORT_METADATA,
          title: `電號 ${accountNumber} 需量告警紀錄分布`,
          description: `本地 EnMS DB 查詢結果，共 ${formatNumber(totalCount)} 筆。`,
          panels: [
            {
              id: "demand-alert-type-breakdown",
              title: "需量告警類型筆數",
              type: "bar",
              rows: breakdownRows,
              mapping: {
                xAxis: "alert_type",
                yAxis: ["alert_count"],
              },
              size: "full",
            },
          ],
        },
        null,
        2,
      ),
      "```",
    );
  }

  return lines.join("\n");
}

function buildRoiYearReport(year: number, rows: RoiYearRow[]) {
  if (rows.length === 0) {
    return [
      `我判斷這是 EnMS ${year} 年節能 ROI 查詢，已優先查本地 EnMS DB。`,
      `目前 TaipowerBills / PowerAccounts / sites 在 ${year} 年沒有可用帳單資料，因此不能用 DB 產出 ROI 數字。`,
      "我不會改用外部網路資料或假資料補齊；請先確認該年度台電帳單是否已匯入。",
    ].join("\n");
  }

  const chartRows = rows.map((row) => ({
    site_name: row.site_name ?? "未命名場域",
    savings_5pct_ntd: round(toNumber(row.savings_5pct), 0),
    savings_10pct_ntd: round(toNumber(row.savings_10pct), 0),
  }));
  const lines = [
    `根據本地 EnMS DB 的 TaipowerBills、PowerAccounts 與 sites 查詢，以下是 ${year} 年節能 ROI 的年度帳單基線試算。`,
    "",
  ];

  for (const row of rows) {
    const site = row.site_name ?? "未命名場域";
    const accountCount = formatNumber(toNumber(row.account_count));
    const billedAccounts = formatNumber(toNumber(row.billed_accounts));
    const billCount = formatNumber(toNumber(row.bill_count));
    const baselineKwh = formatNumber(round(toNumber(row.baseline_kwh), 0));
    const baselineBill = formatMoney(toNumber(row.baseline_bill));
    const avgRate = round(toNumber(row.avg_rate), 4).toFixed(4);
    const savings5 = formatMoney(toNumber(row.savings_5pct));
    const savings10 = formatMoney(toNumber(row.savings_10pct));
    lines.push(
      `- ${site}：${billedAccounts}/${accountCount} 個電號有 ${year} 年帳單，共 ${billCount} 期；年度用電 ${baselineKwh} kWh，年度電費 ${baselineBill}，平均電價 ${avgRate} 元/kWh；若節電 5% 約省 ${savings5}，節電 10% 約省 ${savings10}。`,
    );
  }

  lines.push(
    "",
    "邊界說明：這是以本地 EnMS DB 的歷史台電帳單作為 baseline 的節省金額試算；若要計算真正投資回收期，還需要設備投資金額 CAPEX、維護成本 OPEX 與預計節電率。",
    "查詢依據：TaipowerBills.BillingMonth、UsageAmount、TotalAmount，並透過 PowerAccounts.SiteId 對應 sites.site_id。此回答只使用本地 EnMS DB，不使用外部網路資料。",
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        ...ENMS_REPORT_METADATA,
        title: `${year} 年節能 ROI 年度試算`,
        description: "以本地 EnMS DB 台電帳單為 baseline，呈現 5% 與 10% 節電情境的年度節省金額。",
        panels: [
          {
            id: "roi-savings-scenario",
            title: "節電 5% / 10% 年度節省金額",
            type: "bar",
            rows: chartRows,
            mapping: {
              xAxis: "site_name",
              yAxis: ["savings_5pct_ntd", "savings_10pct_ntd"],
            },
            size: "full",
          },
        ],
      },
      null,
      2,
    ),
    "```",
  );

  return lines.join("\n");
}

export async function buildEnmsVerifiedDirectQueryAnswer(
  input: EnmsVerifiedDirectQueryInput,
): Promise<string | null> {
  const { userMessage } = input;
  if (isAssetCountRequest(userMessage)) {
    const target = detectAssetCountTarget(userMessage);
    if (!target) {
      return null;
    }
    try {
      const result = await duckdbQueryExternalPgAsyncDetailed<AssetCountRow>(
        getEnmsPostgresConnectionString(),
        `
          SELECT COUNT(*) AS total_count
          FROM enms.public."${target.tableName}"
        `,
        "enms",
      );
      if (result.error) {
        throw new Error(result.error);
      }
      return buildAssetCountReport(target, result.rows[0]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown EnMS DB query error";
      return [
        `我判斷這是 EnMS ${target.label}總數查詢，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
        `因此我不會改用外部網路資料或推測答案。請先確認 ${target.tableName} 表是否可讀。`,
      ].join("\n");
    }
  }

  if (isAlertTypeSummaryRequest(userMessage)) {
    try {
      const alertTypeResult =
        await duckdbQueryExternalPgAsyncDetailed<AlertTypeSummaryRow>(
          getEnmsPostgresConnectionString(),
          `
            SELECT
              COALESCE("AlertType", 'Unknown') AS alert_type,
              COUNT(*) AS alert_count,
              MIN("AlertTime") AS first_alert_time,
              MAX("AlertTime") AS latest_alert_time
            FROM enms.public."DemandAlertHistory"
            WHERE "AlertTime" >= NOW() - INTERVAL '7 days'
            GROUP BY COALESCE("AlertType", 'Unknown')
            ORDER BY alert_count DESC, alert_type ASC
          `,
          "enms",
        );
      if (alertTypeResult.error) {
        throw new Error(alertTypeResult.error);
      }
      return buildAlertTypeSummaryReport(alertTypeResult.rows);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown EnMS DB query error";
      return [
        `我判斷這是 EnMS 最近 7 天告警類型統計，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 DemandAlertHistory 表是否可讀。",
      ].join("\n");
    }
  }

  if (isLayerFreshnessRequest(userMessage)) {
    try {
      const freshnessResult =
        await duckdbQueryExternalPgAsyncDetailed<LayerFreshnessRow>(
          getEnmsPostgresConnectionString(),
          `
            SELECT
              CAST((SELECT MAX(timestamp) FROM enms.public.mqtt_raw_data) AS VARCHAR) AS latest_raw_time,
              (SELECT COUNT(*) FROM enms.public.mqtt_raw_data WHERE timestamp >= NOW() - INTERVAL '1 day') AS raw_rows_1d,
              CAST((SELECT MAX("RecordTime") FROM enms.public."DeviceDataSummaryView") AS VARCHAR) AS latest_summary_time,
              (SELECT COUNT(*) FROM enms.public."DeviceDataSummaryView" WHERE "RecordTime" >= NOW() - INTERVAL '1 day') AS summary_rows_1d
          `,
          "enms",
        );
      if (freshnessResult.error) {
        throw new Error(freshnessResult.error);
      }
      return buildLayerFreshnessReport(freshnessResult.rows[0]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown EnMS DB query error";
      return [
        `我判斷這是 EnMS raw / summary layer 更新狀態查詢，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 mqtt_raw_data 與 DeviceDataSummaryView 是否可讀。",
      ].join("\n");
    }
  }

  if (isRecentAlertGovernanceRequest(userMessage)) {
    try {
      const result = await queryRecentAlertGovernanceRows();
      if (result.error) {
        throw new Error(result.error);
      }
      return buildRecentAlertGovernanceReport(result.rows);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown EnMS DB query error";
      return [
        `我判斷這是 EnMS 最近 7 天告警治理摘要，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 DemandAlertHistory 表是否可讀。",
      ].join("\n");
    }
  }

  if (isContractCapacityRiskRequest(userMessage)) {
    try {
      const result = await queryContractRiskRows();
      if (result.error) {
        throw new Error(result.error);
      }
      return buildContractRiskReport(result.rows);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown EnMS DB query error";
      return [
        `我判斷這是 EnMS 契約容量風險排行，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 DemandAlertHistory、PowerAccounts 與 sites 表是否可讀。",
      ].join("\n");
    }
  }

  if (isSiteAccountsRequest(userMessage)) {
    try {
      const result = await querySiteAccountsRows();
      if (result.error) {
        throw new Error(result.error);
      }
      return buildSiteAccountsReport(result.rows);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown EnMS DB query error";
      return [
        `我判斷這是 EnMS 場域與電號對照查詢，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 PowerAccounts 與 sites 表是否可讀。",
      ].join("\n");
    }
  }

  if (isPeakDemandRankingRequest(userMessage)) {
    try {
      const result = await queryPeakDemandRankingRows();
      if (result.error) {
        throw new Error(result.error);
      }
      return buildPeakDemandRankingReport(result.rows);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown EnMS DB query error";
      return [
        `我判斷這是 EnMS 最近 30 天場域最大需量排行，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 DeviceDataSummaryView 與主資料 join 是否可讀。",
      ].join("\n");
    }
  }

  if (isSiteBenchmarkRequest(userMessage)) {
    try {
      const result = await querySiteKpiRows();
      if (result.error) {
        throw new Error(result.error);
      }
      return buildSiteBenchmarkReport(result.rows, userMessage);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown EnMS DB query error";
      return [
        `我判斷這是 EnMS 最近 30 天場域 KPI / benchmarking 查詢，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 DeviceDataSummaryView 與主資料 join 是否可讀。",
      ].join("\n");
    }
  }

  if (isSavingsScenarioRequest(userMessage)) {
    try {
      const requestedSite = detectKnownSiteName(userMessage);
      const result = await querySavingsScenarioRows(requestedSite);
      if (result.error) {
        throw new Error(result.error);
      }
      return buildSavingsScenarioReport(result.rows, requestedSite);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown EnMS DB query error";
      return [
        `我判斷這是 EnMS 節電 5% / 10% 帳單估算，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 TaipowerBills、PowerAccounts 與 sites 表是否可讀。",
      ].join("\n");
    }
  }

  const billTrendTarget = detectBillTrendTarget(userMessage);
  if (billTrendTarget) {
    try {
      const result = await queryBillTrendRows(billTrendTarget);
      if (result.error) {
        throw new Error(result.error);
      }
      return buildBillTrendReport(billTrendTarget, result.rows);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown EnMS DB query error";
      return [
        `我判斷這是 EnMS ${billTrendTarget.label}查詢，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 TaipowerBills、PowerAccounts 與 sites 表是否可讀。",
      ].join("\n");
    }
  }

  if (isSiteBillRankingRequest(userMessage)) {
    try {
      const requestedSite = detectKnownSiteName(userMessage);
      const result = await querySavingsScenarioRows(requestedSite);
      if (result.error) {
        throw new Error(result.error);
      }
      return buildSiteBillRankingReport(result.rows, requestedSite);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown EnMS DB query error";
      return [
        `我判斷這是 EnMS 最新年度電費 / 用電排行，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 TaipowerBills、PowerAccounts 與 sites 表是否可讀。",
      ].join("\n");
    }
  }

  const energyTrendTarget = detectEnergyTrendTarget(userMessage);
  if (energyTrendTarget) {
    try {
      const result = await queryEnergyTrendRows(energyTrendTarget);
      if (result.error) {
        throw new Error(result.error);
      }
      return buildEnergyTrendReport(energyTrendTarget, result.rows);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown EnMS DB query error";
      return [
        `我判斷這是 EnMS ${energyTrendTarget.label}查詢，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 DeviceDataSummaryView、ElectricityMeter、PowerAccounts 與 sites 表是否可讀。",
      ].join("\n");
    }
  }

  if (isRecentAnomalyRequest(userMessage)) {
    try {
      const requestedSite = detectKnownSiteName(userMessage);
      const [summaryResult, rawResult] = await Promise.all([
        queryRecentAnomalySummaryRows(requestedSite),
        queryRecentRawQualityRows(requestedSite),
      ]);
      if (summaryResult.error) {
        throw new Error(summaryResult.error);
      }
      if (rawResult.error) {
        throw new Error(rawResult.error);
      }
      return buildRecentAnomalyReport(summaryResult.rows, rawResult.rows, requestedSite);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown EnMS DB query error";
      return [
        `我判斷這是 EnMS 最近 24 小時異常 / 功因 / 電力品質分析，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 DeviceDataSummaryView、mqtt_raw_data 與主資料 join 是否可讀。",
      ].join("\n");
    }
  }

  const topLoadTarget = detectTopLoadTarget(userMessage);
  if (topLoadTarget) {
    try {
      const result = await queryTopLoadRows(
        topLoadTarget.siteName,
        topLoadTarget.startSql,
        topLoadTarget.endSql,
      );
      if (result.error) {
        throw new Error(result.error);
      }
      if (result.rows.length > 0) {
        return buildTopLoadReport(
          result.rows,
          topLoadTarget.siteName,
          topLoadTarget.windowLabel,
        );
      }

      const availabilityResult = await queryTopLoadAvailabilityRow(topLoadTarget);
      if (availabilityResult.error) {
        throw new Error(availabilityResult.error);
      }

      const latestAvailableResult = await queryLatestAvailableTopLoadRows(
        topLoadTarget.siteName,
      );
      if (latestAvailableResult.error) {
        throw new Error(latestAvailableResult.error);
      }

      return buildTopLoadNoRecentDataReport(
        topLoadTarget,
        availabilityResult.rows[0],
        latestAvailableResult.rows,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown EnMS DB query error";
      return [
        `我判斷這是 EnMS 設備 / 迴路耗電排行，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 DeviceDataSummaryView、ElectricityMeter、PowerAccounts 與 sites 表是否可讀。",
      ].join("\n");
    }
  }

  if (isPriorityConsumptionIssueRequest(userMessage)) {
    try {
      const [riskResult, topLoadResult] = await Promise.all([
        queryContractRiskRows(),
        queryTopLoadRows(null),
      ]);
      if (riskResult.error) {
        throw new Error(riskResult.error);
      }
      if (topLoadResult.error) {
        throw new Error(topLoadResult.error);
      }
      return buildPriorityConsumptionIssueReport(riskResult.rows, topLoadResult.rows);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown EnMS DB query error";
      return [
        `我判斷這是 EnMS 優先處理耗電問題查詢，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 DemandAlertHistory 與 DeviceDataSummaryView 是否可讀。",
      ].join("\n");
    }
  }

  if (isMaintenanceInspectionRequest(userMessage)) {
    try {
      const result = await queryTopLoadRows(null);
      if (result.error) {
        throw new Error(result.error);
      }
      return buildMaintenanceInspectionReport(result.rows);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown EnMS DB query error";
      return [
        `我判斷這是 EnMS 維修巡檢設備排序，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 DeviceDataSummaryView、ElectricityMeter、PowerAccounts 與 sites 表是否可讀。",
      ].join("\n");
    }
  }

  if (isExecutiveBriefRequest(userMessage)) {
    try {
      const [riskResult, topLoadResult] = await Promise.all([
        queryContractRiskRows(),
        queryTopLoadRows(null),
      ]);
      if (riskResult.error) {
        throw new Error(riskResult.error);
      }
      if (topLoadResult.error) {
        throw new Error(topLoadResult.error);
      }
      return buildExecutiveBriefReport(riskResult.rows, topLoadResult.rows);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown EnMS DB query error";
      return [
        `我判斷這是 EnMS 主管摘要查詢，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認近期需量告警與 summary layer 是否可讀。",
      ].join("\n");
    }
  }

  if (isQuickWinRequest(userMessage)) {
    try {
      const [riskResult, topLoadResult] = await Promise.all([
        queryContractRiskRows(),
        queryTopLoadRows(null),
      ]);
      if (riskResult.error) {
        throw new Error(riskResult.error);
      }
      if (topLoadResult.error) {
        throw new Error(topLoadResult.error);
      }
      return buildQuickWinReport(riskResult.rows, topLoadResult.rows);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown EnMS DB query error";
      return [
        `我判斷這是 EnMS 節省電費 quick win 查詢，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認近期耗電排行與需量告警資料是否可讀。",
      ].join("\n");
    }
  }

  if (isRoiYearRequest(userMessage)) {
    const year = extractGregorianYear(userMessage);
    if (!year) {
      return null;
    }
    const rocYear = year - 1911;
    try {
      const roiResult = await duckdbQueryExternalPgAsyncDetailed<RoiYearRow>(
        getEnmsPostgresConnectionString(),
        `
          WITH site_accounts AS (
            SELECT DISTINCT
              s.site_id,
              s.site_name,
              pa."AccountNumber"
            FROM enms.public."sites" s
            JOIN enms.public."PowerAccounts" pa
              ON pa."SiteId" = s.site_id
            WHERE pa."AccountNumber" IS NOT NULL
          ),
          bill_summary AS (
            SELECT
              "AccountNumber",
              COUNT(*) AS bill_count,
              SUM(COALESCE(TRY_CAST("UsageAmount" AS DOUBLE), 0)) AS baseline_kwh,
              SUM(COALESCE(TRY_CAST("TotalAmount" AS DOUBLE), 0)) AS baseline_bill
            FROM enms.public."TaipowerBills"
            WHERE TRY_CAST("BillingMonth" AS INTEGER) BETWEEN ${rocYear}01 AND ${rocYear}12
            GROUP BY "AccountNumber"
          )
          SELECT
            sa.site_name,
            COUNT(DISTINCT sa."AccountNumber") AS account_count,
            COUNT(DISTINCT CASE WHEN bs.bill_count > 0 THEN sa."AccountNumber" END) AS billed_accounts,
            SUM(COALESCE(bs.bill_count, 0)) AS bill_count,
            SUM(COALESCE(bs.baseline_kwh, 0)) AS baseline_kwh,
            SUM(COALESCE(bs.baseline_bill, 0)) AS baseline_bill,
            SUM(COALESCE(bs.baseline_bill, 0)) / NULLIF(SUM(COALESCE(bs.baseline_kwh, 0)), 0) AS avg_rate,
            SUM(COALESCE(bs.baseline_bill, 0)) * 0.05 AS savings_5pct,
            SUM(COALESCE(bs.baseline_bill, 0)) * 0.10 AS savings_10pct
          FROM site_accounts sa
          LEFT JOIN bill_summary bs
            ON bs."AccountNumber" = sa."AccountNumber"
          GROUP BY sa.site_name
          HAVING SUM(COALESCE(bs.bill_count, 0)) > 0
          ORDER BY baseline_bill DESC, sa.site_name ASC
        `,
        "enms",
      );
      if (roiResult.error) {
        throw new Error(roiResult.error);
      }
      return buildRoiYearReport(year, roiResult.rows);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown EnMS DB query error";
      return [
        `我判斷這是 EnMS ${year} 年節能 ROI 查詢，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 TaipowerBills、PowerAccounts 與 sites 表是否可讀。",
      ].join("\n");
    }
  }

  if (!isDemandAlertCountRequest(userMessage)) {
    return null;
  }

  const accountNumber = extractAccountNumber(userMessage);
  if (!accountNumber) {
    return null;
  }

  try {
    const countResult = await duckdbQueryExternalPgAsyncDetailed<DemandAlertCountRow>(
      getEnmsPostgresConnectionString(),
      `
        SELECT
          COUNT(*) AS demand_alert_count,
          MIN("AlertTime") AS first_alert_time,
          MAX("AlertTime") AS latest_alert_time
        FROM enms.public."DemandAlertHistory"
        WHERE "AccountNumber" = '${accountNumber}'
      `,
      "enms",
    );
    if (countResult.error) {
      throw new Error(countResult.error);
    }

    const typeResult = await duckdbQueryExternalPgAsyncDetailed<DemandAlertTypeRow>(
      getEnmsPostgresConnectionString(),
      `
        SELECT
          COALESCE("AlertType", 'Unknown') AS alert_type,
          COUNT(*) AS alert_count
        FROM enms.public."DemandAlertHistory"
        WHERE "AccountNumber" = '${accountNumber}'
        GROUP BY COALESCE("AlertType", 'Unknown')
        ORDER BY alert_count DESC, alert_type ASC
      `,
      "enms",
    );
    if (typeResult.error) {
      throw new Error(typeResult.error);
    }

    const countRow = countResult.rows[0];
    const totalCount = toNumber(countRow?.demand_alert_count);
    return buildDemandAlertCountReport(
      accountNumber,
      totalCount,
      countRow,
      typeResult.rows,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown EnMS DB query error";
    return [
      `我判斷這是 EnMS 需量告警筆數查詢，已優先查本地 EnMS DB，但查詢時發生錯誤：${message}`,
      "因此我不會改用外部網路資料或推測答案。請先確認 EnMS DB 連線與 DemandAlertHistory 表是否可讀。",
    ].join("\n");
  }
}
