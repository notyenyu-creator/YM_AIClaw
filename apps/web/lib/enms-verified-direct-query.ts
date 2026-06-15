import { duckdbQueryExternalPgAsyncDetailed } from "./workspace";

const ENMS_CONNECTION_STRING =
  "host=118.168.188.27 port=55433 dbname=EnMS user=sa password=ym@mes42769778 sslmode=disable";

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

function extractGregorianYear(message: string): number | null {
  const match = message.match(/\b(20\d{2})\b/);
  if (!match) return null;
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
  if (typeof value === "number") return value;
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
      .sort()[0] ?? null;
  const latestAlertTime =
    rows
      .map((row) => row.latest_alert_time)
      .filter((value): value is string => Boolean(value))
      .sort()
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

function buildTopLoadReport(rows: TopLoadRow[], requestedSite: string | null) {
  if (rows.length === 0) {
    return [
      `根據本地 EnMS DB 查詢，${requestedSite ?? "指定場域"}最近 7 天沒有可統計的設備 / 迴路耗電資料。`,
      "查詢依據：DeviceDataSummaryView + ElectricityMeter + PowerAccounts + sites。此回答只使用本地 EnMS DB。",
    ].join("\n");
  }

  const lines = [
    `根據本地 EnMS DB 的 DeviceDataSummaryView、ElectricityMeter、PowerAccounts 與 sites 查詢，${requestedSite ?? "指定場域"}最近 7 天設備 / 迴路耗電 Top ${Math.min(rows.length, 5)} 如下：`,
    "",
  ];

  rows.slice(0, 5).forEach((row, index) => {
    const totalKwh = toNumber(row.total_kwh);
    const peakKw = toNumber(row.peak_kw);
    const avgPf = toNumber(row.avg_pf);
    const reasons = [
      totalKwh > 0 ? "耗電量最高，優先檢查排程與基載" : "",
      peakKw > 0 ? "尖峰需量會影響契約容量風險" : "",
      avgPf > 0 && avgPf < 0.9 ? "平均功率因數偏低，可能有功因改善空間" : "",
    ].filter(Boolean);
    lines.push(
      `${index + 1}. ${row.site_name ?? requestedSite ?? "未對應場域"} / ${row.meter_name ?? "未知電表"} / 迴路 ${row.circuit_seq ?? "n/a"}：耗電 ${formatKwh(totalKwh)}，尖峰 ${formatKw(peakKw)}，平均功因 ${round(avgPf, 4)}。關注原因：${reasons.join("；") || "用電量在排序中靠前"}。`,
    );
  });

  lines.push(
    "",
    "查詢依據：sum(DeviceDataSummaryView.TotalConsumption)、max(DeviceDataSummaryView.MaxDemand)、avg(DeviceDataSummaryView.AvgPowerFactor)，並透過 ElectricityMeter / PowerAccounts / sites 對應場域與電表別名。此回答只使用本地 EnMS DB。",
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
  const sortedByPf = [...rows].sort((a, b) => toNumber(a.avg_pf) - toNumber(b.avg_pf));

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
    .slice()
    .sort((a, b) => toNumber(b.total_kwh) - toNumber(a.total_kwh))
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
  if (message.includes("阿里山")) return "阿里山";
  if (message.includes("洋銘")) return "洋銘資訊";
  return null;
}

async function queryRecentAlertGovernanceRows() {
  return duckdbQueryExternalPgAsyncDetailed<AlertGovernanceRow>(
    ENMS_CONNECTION_STRING,
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
    ENMS_CONNECTION_STRING,
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
    ENMS_CONNECTION_STRING,
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

async function queryTopLoadRows(siteName: string | null) {
  const siteFilter = siteName ? `AND s.site_name LIKE '%${siteName}%'` : "";
  return duckdbQueryExternalPgAsyncDetailed<TopLoadRow>(
    ENMS_CONNECTION_STRING,
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
      WHERE v."RecordTime" >= NOW() - INTERVAL '7 days'
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
    ENMS_CONNECTION_STRING,
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
    ENMS_CONNECTION_STRING,
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
    ENMS_CONNECTION_STRING,
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
    ENMS_CONNECTION_STRING,
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
    ENMS_CONNECTION_STRING,
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
  if (isAlertTypeSummaryRequest(userMessage)) {
    try {
      const alertTypeResult =
        await duckdbQueryExternalPgAsyncDetailed<AlertTypeSummaryRow>(
          ENMS_CONNECTION_STRING,
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
          ENMS_CONNECTION_STRING,
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

  if (isTopLoadRankingRequest(userMessage)) {
    try {
      const requestedSite = detectKnownSiteName(userMessage);
      const result = await queryTopLoadRows(requestedSite);
      if (result.error) {
        throw new Error(result.error);
      }
      return buildTopLoadReport(result.rows, requestedSite);
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
        ENMS_CONNECTION_STRING,
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
      ENMS_CONNECTION_STRING,
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
      ENMS_CONNECTION_STRING,
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
