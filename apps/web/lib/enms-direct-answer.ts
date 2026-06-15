import type { DomainBootstrapSnapshot } from "./domain-bootstrap";
import type { EnmsPlannerPreflight } from "./enms-context-builder";

type DirectAnswerInput = {
  userMessage: string;
  preflight: EnmsPlannerPreflight;
  snapshot: DomainBootstrapSnapshot | null;
};

type BenchmarkFact = {
  site: string;
  totalKwh: string;
  peakKw: string;
  avgPf: string;
  kwhPerFloorArea: string;
  kwhPerEmployee: string;
};

type RoiFact = {
  site: string;
  billedAccounts: string;
  baselineBill: string;
  baselineKwh: string;
  avgRate: string;
  savings5: string;
  savings10: string;
};

type TopLoadFact = {
  site: string;
  meterAlias: string;
  circuitSeq: string;
  totalKwh: string;
};

type ContractRiskFact = {
  site: string;
  account: string;
  alertTime: string;
  utilization: string;
  currentDemand: string;
  contractCapacity: string;
  alertType: string;
};

type PowerFactorFact = {
  site: string;
  avgPf: string;
  minPf: string;
  pointCount: string;
};

type AlertTypeFact = {
  type: string;
  count: string;
};

type BillTrendFact = {
  account: string;
  billingMonth: string;
  usageKwh: string;
  totalAmount: string;
  avgRate: string;
};

type SiteAccountsFact = {
  site: string;
  accounts: string;
};

type FreshnessFact = {
  latestTime: string;
  rows1d: string;
};

type TodayAnomalyFact = {
  site: string;
  minPf: string;
  avgPf: string;
  maxDemand: string;
  pointCount: string;
  alertCount: string;
  maxUtil: string;
  maxAlertDemand: string;
  disconnectedCount: string;
  lowPfRawCount: string;
  severeLowPfRawCount: string;
  abnormalQualityCount: string;
};

function includesAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function shouldPreferLiveQuery(userMessage: string): boolean {
  const asksExactCount =
    includesAny(userMessage, ["多少筆", "幾筆", "筆數"]) ||
    (includesAny(userMessage, ["多少", "幾"]) &&
      includesAny(userMessage, ["筆", "紀錄", "告警紀錄", "資料筆數"]));
  const asksChart =
    includesAny(userMessage, [
      "圖表",
      "chart",
      "report-json",
      "折線圖",
      "長條圖",
      "圓餅圖",
      "視覺化",
      "呈現出來",
    ]);
  const asksSqlOrQueryDetail = includesAny(userMessage, [
    "sql",
    "query",
    "查詢語法",
    "duckdb",
    "postgres",
    "postgresql",
  ]);
  const asksEnergyTrend =
    includesAny(userMessage, ["能源趨勢分析", "能源趨勢"]) &&
    !includesAny(userMessage, ["帳單趨勢", "電費趨勢"]);

  return asksExactCount || asksChart || asksSqlOrQueryDetail || asksEnergyTrend;
}

function extractRequestedSites(snapshot: DomainBootstrapSnapshot): string[] {
  return snapshot.facts
    .filter((fact) => fact.startsWith("site_match: "))
    .map((fact) => fact.replace(/^site_match:\s*/, ""))
    .map((fact) => fact.split("->")[0]?.trim() ?? "")
    .filter(Boolean);
}

function filterToRequestedSites<T extends { site: string }>(
  rows: T[],
  requestedSites: string[],
): T[] {
  if (requestedSites.length === 0) {
    return rows;
  }
  const requested = new Set(requestedSites);
  const filtered = rows.filter((row) => requested.has(row.site));
  return filtered.length > 0 ? filtered : rows;
}

function parseSlashKeyValueLine(line: string): Record<string, string> {
  const segments = line.split(" / ").map((segment) => segment.trim());
  const result: Record<string, string> = {};
  for (const segment of segments) {
    const equals = segment.indexOf("=");
    if (equals <= 0) {
      if (!result._head) {
        result._head = segment;
      }
      continue;
    }
    const key = segment.slice(0, equals).trim();
    const value = segment.slice(equals + 1).trim();
    if (key) {
      result[key] = value;
    }
  }
  return result;
}

function parseBenchmarkFacts(snapshot: DomainBootstrapSnapshot): BenchmarkFact[] {
  return snapshot.facts
    .filter((fact) => fact.startsWith("site_benchmark_30d: "))
    .map((fact) => fact.replace(/^site_benchmark_30d:\s*/, ""))
    .map((line) => {
      const parsed = parseSlashKeyValueLine(line);
      return {
        site: parsed._head ?? "未知場域",
        totalKwh: parsed.total_kwh ?? "n/a",
        peakKw: parsed.peak_kw ?? "n/a",
        avgPf: parsed.avg_pf ?? "n/a",
        kwhPerFloorArea: parsed.kwh_per_floor_area ?? "n/a",
        kwhPerEmployee: parsed.kwh_per_employee ?? "n/a",
      };
    });
}

function parseRoiFacts(snapshot: DomainBootstrapSnapshot): RoiFact[] {
  return snapshot.facts
    .filter((fact) => fact.startsWith("roi_preview_fact: "))
    .map((fact) => fact.replace(/^roi_preview_fact:\s*/, ""))
    .map((line) => {
      const parsed = parseSlashKeyValueLine(line);
      return {
        site: parsed.site ?? "未知場域",
        billedAccounts: parsed.billed_accounts ?? "0/0",
        baselineBill: parsed.baseline_bill ?? "n/a",
        baselineKwh: parsed.baseline_kwh ?? "n/a",
        avgRate: parsed.avg_rate ?? "n/a",
        savings5: parsed.savings_5pct ?? "n/a",
        savings10: parsed.savings_10pct ?? "n/a",
      };
    });
}

function parseTopLoadFacts(snapshot: DomainBootstrapSnapshot): TopLoadFact[] {
  return snapshot.facts
    .filter((fact) => fact.startsWith("top_load_"))
    .map((fact) => fact.replace(/^top_load_\d+d:\s*/, ""))
    .map((line) => {
      const parsed = parseSlashKeyValueLine(line);
      return {
        site: parsed.site ?? "未知場域",
        meterAlias: parsed.meter_alias ?? "未知電表",
        circuitSeq: parsed.circuit_seq ?? "n/a",
        totalKwh: parsed.total_kwh ?? "n/a",
      };
    });
}

function parseContractRiskFacts(
  snapshot: DomainBootstrapSnapshot,
): ContractRiskFact[] {
  return snapshot.facts
    .filter((fact) => fact.startsWith("contract_risk_"))
    .map((fact) => fact.replace(/^contract_risk_\d+d:\s*/, ""))
    .map((line) => {
      const parsed = parseSlashKeyValueLine(line);
      return {
        site: parsed.site ?? "未知場域",
        account: parsed.account ?? "n/a",
        alertTime: parsed.alert_time ?? "n/a",
        utilization: parsed.utilization ?? "n/a",
        currentDemand: parsed.current_demand ?? "n/a",
        contractCapacity: parsed.contract_capacity ?? "n/a",
        alertType: parsed.alert_type ?? "n/a",
      };
    });
}

function parsePowerFactorFacts(
  snapshot: DomainBootstrapSnapshot,
): PowerFactorFact[] {
  return snapshot.facts
    .filter((fact) => fact.startsWith("power_factor_"))
    .map((fact) => fact.replace(/^power_factor_\d+d:\s*/, ""))
    .map((line) => {
      const parsed = parseSlashKeyValueLine(line);
      return {
        site: parsed.site ?? "未知場域",
        avgPf: parsed.avg_pf ?? "n/a",
        minPf: parsed.min_pf ?? "n/a",
        pointCount: parsed.point_count ?? "n/a",
      };
    });
}

function parseAlertTypeFacts(snapshot: DomainBootstrapSnapshot): AlertTypeFact[] {
  return snapshot.facts
    .filter((fact) => fact.startsWith("alert_type_"))
    .map((fact) => fact.replace(/^alert_type_\d+d:\s*/, ""))
    .map((line) => {
      const parsed = parseSlashKeyValueLine(line);
      return {
        type: parsed.type ?? "未知類型",
        count: parsed.count ?? "0",
      };
    });
}

function parseBillTrendFacts(snapshot: DomainBootstrapSnapshot): BillTrendFact[] {
  return snapshot.facts
    .filter((fact) => fact.startsWith("bill_trend_fact: "))
    .map((fact) => fact.replace(/^bill_trend_fact:\s*/, ""))
    .map((line) => {
      const parsed = parseSlashKeyValueLine(line);
      return {
        account: parsed.account ?? "n/a",
        billingMonth: parsed.billing_month ?? "n/a",
        usageKwh: parsed.usage_kwh ?? "n/a",
        totalAmount: parsed.total_amount ?? "n/a",
        avgRate: parsed.avg_rate ?? "n/a",
      };
    });
}

function parseSiteAccountsFacts(
  snapshot: DomainBootstrapSnapshot,
): SiteAccountsFact[] {
  return snapshot.facts
    .filter((fact) => fact.startsWith("site_accounts: "))
    .map((fact) => fact.replace(/^site_accounts:\s*/, ""))
    .map((line) => {
      const parsed = parseSlashKeyValueLine(line);
      return {
        site: parsed.site ?? "未知場域",
        accounts: parsed.accounts ?? "n/a",
      };
    });
}

function parseFreshnessFact(
  snapshot: DomainBootstrapSnapshot,
  prefix: "freshness_raw: " | "freshness_summary: ",
): FreshnessFact | null {
  const fact = snapshot.facts.find((item) => item.startsWith(prefix));
  if (!fact) {
    return null;
  }
  const parsed = parseSlashKeyValueLine(fact.replace(prefix, ""));
  const latestTime =
    parsed.latest_raw_time ?? parsed.latest_summary_time ?? "n/a";
  return {
    latestTime,
    rows1d: parsed.rows_1d ?? "0",
  };
}

function parseTodayAnomalyFacts(
  snapshot: DomainBootstrapSnapshot,
): TodayAnomalyFact[] {
  return snapshot.facts
    .filter((fact) => fact.startsWith("today_anomaly_fact: "))
    .map((fact) => fact.replace(/^today_anomaly_fact:\s*/, ""))
    .map((line) => {
      const parsed = parseSlashKeyValueLine(line);
      return {
        site: parsed.site ?? "未知場域",
        minPf: parsed.min_pf ?? "n/a",
        avgPf: parsed.avg_pf ?? "n/a",
        maxDemand: parsed.max_demand ?? "n/a",
        pointCount: parsed.point_count ?? "0",
        alertCount: parsed.alert_count ?? "0",
        maxUtil: parsed.max_util ?? "n/a",
        maxAlertDemand: parsed.max_alert_demand ?? "n/a",
        disconnectedCount: parsed.disconnected_count ?? "0",
        lowPfRawCount: parsed.low_pf_raw_count ?? "0",
        severeLowPfRawCount: parsed.severe_low_pf_raw_count ?? "0",
        abnormalQualityCount: parsed.abnormal_quality_count ?? "0",
      };
    });
}

function firstFact(snapshot: DomainBootstrapSnapshot, prefix: string): string | null {
  return snapshot.facts.find((fact) => fact.startsWith(prefix)) ?? null;
}

function summarizeMissingData(snapshot: DomainBootstrapSnapshot): string {
  const lines = [
    "目前沒有足夠的 EnMS DB 事實可直接回答這題。",
  ];
  if (snapshot.gaps.length > 0) {
    lines.push(`缺少資料：${snapshot.gaps.slice(0, 3).join("；")}`);
  }
  if (snapshot.stillAvailable.length > 0) {
    lines.push(`目前仍可回答：${snapshot.stillAvailable.slice(0, 3).join("、")}`);
  }
  return lines.join("\n");
}

function buildBenchmarkAnswer(
  snapshot: DomainBootstrapSnapshot,
  requestedSites: string[],
): string | null {
  const rows = filterToRequestedSites(parseBenchmarkFacts(snapshot), requestedSites);
  if (rows.length === 0) {
    return null;
  }

  const pfRows = filterToRequestedSites(parsePowerFactorFacts(snapshot), requestedSites);
  const pfMap = new Map(pfRows.map((row) => [row.site, row]));
  const ranking = [...rows].sort((a, b) => Number(b.totalKwh) - Number(a.totalKwh));
  const lines = [
    "以下依本地 EnMS DB 最近 30 天摘要資料進行多場域 benchmarking：",
  ];

  ranking.forEach((row, index) => {
    const pf = pfMap.get(row.site);
    const densityParts: string[] = [];
    if (row.kwhPerFloorArea !== "n/a") {
      densityParts.push(`坪均 ${row.kwhPerFloorArea} kWh`);
    }
    if (row.kwhPerEmployee !== "n/a") {
      densityParts.push(`人均 ${row.kwhPerEmployee} kWh`);
    }
    lines.push(
      `${index + 1}. ${row.site}：總用電 ${row.totalKwh} kWh，最大需量 ${row.peakKw} kW，平均功率因數 ${pf?.avgPf ?? row.avgPf}${densityParts.length > 0 ? `，${densityParts.join("，")}` : ""}`,
    );
  });

  if (ranking.length >= 2) {
    const top = ranking[0];
    const bottom = ranking[ranking.length - 1];
    lines.push(
      `差異重點：${top.site} 目前總用電與峰值需量最高；${bottom.site} 目前用電量相對較低。若要再深入，下一步可依設備或電號做 drill-down。`,
    );
  }

  const caution = snapshot.cautions.find((item) =>
    item.toLowerCase().includes("benchmark"),
  );
  if (caution) {
    lines.push(`邊界說明：${caution}`);
  }

  return lines.join("\n");
}

function buildRoiAnswer(
  snapshot: DomainBootstrapSnapshot,
  requestedSites: string[],
): string | null {
  const rows = filterToRequestedSites(parseRoiFacts(snapshot), requestedSites);
  if (rows.length === 0) {
    return null;
  }
  const mapping = firstFact(snapshot, "billing_calendar_mapping:");
  const lines = [
    `以下依本地 EnMS DB 的帳單與電價資料估算節能 ROI${mapping ? `（${mapping.replace("billing_calendar_mapping: ", "")}）` : ""}：`,
  ];

  for (const row of rows) {
    lines.push(
      `- ${row.site}：已覆蓋帳單電號 ${row.billedAccounts}，基準月電費 ${row.baselineBill} 元，基準月用電 ${row.baselineKwh} kWh，平均單價 ${row.avgRate} 元/kWh；節電 5% 估計每月可省 ${row.savings5} 元，節電 10% 估計每月可省 ${row.savings10} 元。`,
    );
  }

  const caution = snapshot.cautions.find((item) =>
    item.toLowerCase().includes("roi / what-if"),
  );
  if (caution) {
    lines.push(`邊界說明：${caution}`);
  }

  return lines.join("\n");
}

function buildTopLoadAnswer(
  snapshot: DomainBootstrapSnapshot,
  requestedSites: string[],
): string | null {
  const rows = filterToRequestedSites(parseTopLoadFacts(snapshot), requestedSites);
  if (rows.length === 0) {
    return null;
  }
  const lines = ["以下依本地 EnMS DB 最近 7 天摘要資料整理最耗電的設備 / 迴路："];
  rows.forEach((row, index) => {
    lines.push(
      `${index + 1}. ${row.site} / ${row.meterAlias} / 迴路 ${row.circuitSeq}：${row.totalKwh} kWh。優先關注原因：近 7 天累積耗電位居前列，建議先檢視該設備的運轉時段與負載配置。`,
    );
  });
  return lines.join("\n");
}

function buildContractRiskAnswer(
  snapshot: DomainBootstrapSnapshot,
  requestedSites: string[],
): string | null {
  const rows = filterToRequestedSites(
    parseContractRiskFacts(snapshot),
    requestedSites,
  );
  if (rows.length === 0) {
    return null;
  }
  const lines = [
    "以下依本地 EnMS DB 最近 7 天需量告警資料整理契約容量風險：",
  ];
  rows.forEach((row, index) => {
    lines.push(
      `${index + 1}. ${row.site} / 電號 ${row.account}：${row.alertTime} 曾達使用率 ${row.utilization}%（目前需量 ${row.currentDemand} kW / 契約容量 ${row.contractCapacity} kW，類型 ${row.alertType}）。建議先檢查該時段的主要負載與可降載設備。`,
    );
  });
  return lines.join("\n");
}

function buildPowerFactorAnswer(
  snapshot: DomainBootstrapSnapshot,
  requestedSites: string[],
): string | null {
  const rows = filterToRequestedSites(
    parsePowerFactorFacts(snapshot),
    requestedSites,
  );
  if (rows.length === 0) {
    return null;
  }
  const ranking = [...rows].sort((a, b) => Number(a.avgPf) - Number(b.avgPf));
  const lines = ["以下依本地 EnMS DB 最近 30 天資料比較各場域功率因數："];
  ranking.forEach((row, index) => {
    lines.push(
      `${index + 1}. ${row.site}：平均功率因數 ${row.avgPf}，最低功率因數 ${row.minPf}，樣本點 ${row.pointCount}。`,
    );
  });
  return lines.join("\n");
}

function buildPeakDemandAnswer(
  snapshot: DomainBootstrapSnapshot,
  requestedSites: string[],
): string | null {
  const rows = filterToRequestedSites(parseBenchmarkFacts(snapshot), requestedSites);
  if (rows.length === 0) {
    return null;
  }
  const ranking = [...rows].sort((a, b) => Number(b.peakKw) - Number(a.peakKw));
  const lines = ["以下依本地 EnMS DB 最近 30 天摘要資料比較各場域最大需量："];
  ranking.forEach((row, index) => {
    lines.push(
      `${index + 1}. ${row.site}：最大需量 ${row.peakKw} kW，總用電 ${row.totalKwh} kWh，平均功率因數 ${row.avgPf}。`,
    );
  });
  if (ranking[0]) {
    lines.push(`結論：目前最大需量最高的場域是 ${ranking[0].site}。`);
  }
  return lines.join("\n");
}

function buildAlertSummaryAnswer(
  snapshot: DomainBootstrapSnapshot,
  opts?: { focusNoise?: boolean },
): string | null {
  const rows = parseAlertTypeFacts(snapshot);
  if (rows.length === 0) {
    return null;
  }
  const lines = ["以下依本地 EnMS DB 最近 7 天告警資料整理摘要："];
  rows.forEach((row, index) => {
    lines.push(`${index + 1}. ${row.type}：${row.count} 筆`);
  });
  if (opts?.focusNoise) {
    lines.push(
      "目前 DemandAlertHistory 並沒有 suppression / shelving / dedupe 旗標，因此只能先把高頻 AlertType 視為疑似重複噪音來源，再由治理規則做人為確認。",
    );
  } else {
    lines.push("治理建議：先處理高頻重複告警，再分出需立即處理與可持續觀察項目。");
  }
  return lines.join("\n");
}

function buildBillTrendAnswer(snapshot: DomainBootstrapSnapshot): string | null {
  const rows = parseBillTrendFacts(snapshot);
  if (rows.length === 0) {
    return null;
  }
  const lines = ["以下依本地 EnMS DB 最近可用帳單資料整理電費趨勢："];
  rows.forEach((row) => {
    lines.push(
      `- 電號 ${row.account} / 帳單月份 ${row.billingMonth}：用電 ${row.usageKwh} kWh，電費 ${row.totalAmount} 元，平均單價 ${row.avgRate} 元/kWh`,
    );
  });
  return lines.join("\n");
}

function buildSiteAccountsAnswer(snapshot: DomainBootstrapSnapshot): string | null {
  const rows = parseSiteAccountsFacts(snapshot);
  if (rows.length === 0) {
    return null;
  }
  const lines = ["以下依本地 EnMS DB 整理目前各場域主要電號："];
  rows.forEach((row) => {
    lines.push(`- ${row.site}：${row.accounts}`);
  });
  return lines.join("\n");
}

function buildFreshnessAnswer(snapshot: DomainBootstrapSnapshot): string | null {
  const raw = parseFreshnessFact(snapshot, "freshness_raw: ");
  const summary = parseFreshnessFact(snapshot, "freshness_summary: ");
  if (!raw && !summary) {
    return null;
  }
  const lines = ["以下依本地 EnMS DB 檢查 raw / summary layer 的更新狀態："];
  if (raw) {
    lines.push(`- raw layer：最新資料時間 ${raw.latestTime}，近 24 小時筆數 ${raw.rows1d}。`);
  }
  if (summary) {
    lines.push(`- summary layer：最新資料時間 ${summary.latestTime}，近 24 小時筆數 ${summary.rows1d}。`);
  }
  if (raw && summary) {
    const bothActive =
      Number(raw.rows1d) > 0 &&
      Number(summary.rows1d) > 0 &&
      raw.latestTime !== "n/a" &&
      summary.latestTime !== "n/a";
    lines.push(
      bothActive
        ? "結論：目前 raw layer 與 summary layer 都有最近 24 小時內的更新。"
        : "結論：至少其中一層最近 24 小時沒有新資料，需再檢查 ETL / summary pipeline。",
    );
  }
  return lines.join("\n");
}

function buildTodayAnomalyAnswer(
  snapshot: DomainBootstrapSnapshot,
  requestedSites: string[],
): string | null {
  const rows = filterToRequestedSites(parseTodayAnomalyFacts(snapshot), requestedSites);
  if (rows.length === 0) {
    const raw = parseFreshnessFact(snapshot, "freshness_raw: ");
    const summary = parseFreshnessFact(snapshot, "freshness_summary: ");
    const lines = ["目前本地 EnMS DB 沒有足夠的「今日」異常資料可直接整理。"];
    if (summary) {
      lines.push(`- summary layer 最新資料時間：${summary.latestTime}（近 24 小時 ${summary.rows1d} 筆）`);
    }
    if (raw) {
      lines.push(`- raw layer 最新資料時間：${raw.latestTime}（近 24 小時 ${raw.rows1d} 筆）`);
    }
    lines.push("建議下一步：改問『最近 24 小時』或指定最新有資料的日期 / 場域 / 設備，系統才能用 DB 事實做異常與根因整理。");
    return lines.join("\n");
  }
  const lines = ["以下依本地 EnMS DB 今日 summary / raw / alert 資料整理異常線索："];
  rows.forEach((row) => {
    const findings: string[] = [];
    if (row.minPf !== "n/a" && Number(row.minPf) < 0.8) {
      findings.push(`最低功率因數 ${row.minPf}`);
    }
    if (Number(row.alertCount) > 0 && row.maxUtil !== "n/a") {
      findings.push(`今日告警 ${row.alertCount} 筆，最高使用率 ${row.maxUtil}%`);
    }
    if (Number(row.severeLowPfRawCount) > 0) {
      findings.push(`raw layer 嚴重低功因筆數 ${row.severeLowPfRawCount}`);
    } else if (Number(row.lowPfRawCount) > 0) {
      findings.push(`raw layer 低功因筆數 ${row.lowPfRawCount}`);
    }
    if (Number(row.abnormalQualityCount) > 0) {
      findings.push(`疑似品質異常筆數 ${row.abnormalQualityCount}`);
    }
    if (Number(row.disconnectedCount) > 0) {
      findings.push(`斷線筆數 ${row.disconnectedCount}`);
    }
    if (findings.length === 0) {
      findings.push("今日未看到明顯異常指標跨過目前規則門檻");
    }

    const suggestions: string[] = [];
    if (row.minPf !== "n/a" && Number(row.minPf) < 0.8) {
      suggestions.push("先檢查補償電容、負載切換與主要用電設備啟停時段");
    }
    if (Number(row.abnormalQualityCount) > 0) {
      suggestions.push("抽查 raw quality 字串來源與量測設備狀態，確認是否為品質訊號異常或通訊標記");
    }
    if (Number(row.disconnectedCount) > 0) {
      suggestions.push("檢查 gateway / device 連線穩定度");
    }
    if (Number(row.alertCount) > 0) {
      suggestions.push("回看告警時段的主要負載與契約容量壓力");
    }
    lines.push(`- ${row.site}：${findings.join("；")}。`);
    if (suggestions.length > 0) {
      lines.push(`  建議：${suggestions.join("；")}。`);
    }
  });
  lines.push("邊界說明：這裡先用今日 DB 事實整理異常線索；若要做更精細根因，下一步再 drill-down 到特定設備 / 迴路 / 時間窗。");
  return lines.join("\n");
}

export function buildEnmsDirectAnswer(
  input: DirectAnswerInput,
): string | null {
  const { userMessage, preflight, snapshot } = input;
  if (!snapshot || snapshot.system !== "enms") {
    return null;
  }
  if (snapshot.availability === "blocked") {
    return summarizeMissingData(snapshot);
  }
  if (shouldPreferLiveQuery(userMessage)) {
    return null;
  }

  const requestedSites = extractRequestedSites(snapshot);
  const asksBenchmark =
    preflight.intent === "site_benchmarking" ||
    includesAny(userMessage, ["benchmark", "benchmarking", "排名", "比較"]) ||
    (includesAny(userMessage, ["總用電", "最大需量", "功率因數"]) &&
      includesAny(userMessage, ["場域", "site"]));
  const asksEfficiency =
    preflight.intent === "efficiency_analysis" ||
    includesAny(userMessage, ["roi", "what-if", "節電", "節能", "帳單", "回收期"]);
  const asksTopLoad =
    includesAny(userMessage, ["最耗電", "耗電排行", "用電排行"]) &&
    includesAny(userMessage, ["設備", "迴路", "電表"]);
  const asksContractRisk =
    preflight.intent === "demand_forecast" ||
    includesAny(userMessage, ["契約容量", "超約", "需量", "降載"]);
  const asksPowerFactor =
    includesAny(userMessage, ["功率因數", "功因", "power factor"]) &&
    includesAny(userMessage, ["比較", "場域", "哪個", "最差", "低於"]);
  const asksPeakBySite =
    includesAny(userMessage, ["最大需量最高", "最大需量"]) &&
    includesAny(userMessage, ["場域", "site", "哪個"]) &&
    !includesAny(userMessage, ["比較", "benchmark", "benchmarking", "排名", "總用電", "功率因數"]);
  const asksAlertSummary =
    preflight.intent === "alert_governance" ||
    includesAny(userMessage, ["告警", "預警", "治理", "摘要"]);
  const asksBillTrend =
    includesAny(userMessage, ["帳單", "電費"]) &&
    includesAny(userMessage, ["趨勢", "最近", "期"]);
  const asksSiteAccounts =
    includesAny(userMessage, ["電號", "account"]) &&
    includesAny(userMessage, ["場域", "對應", "主要"]);
  const asksFreshness =
    includesAny(userMessage, ["raw layer", "summary layer", "更新", "新鮮度"]) ||
    (includesAny(userMessage, ["raw", "summary"]) &&
      includesAny(userMessage, ["更新", "最近"]));
  const asksAnomaly =
    preflight.intent === "anomaly_detection" ||
    includesAny(userMessage, ["異常", "根因", "電力品質", "功因問題"]);
  const asksTodayScopedAnomaly =
    asksAnomaly &&
    includesAny(userMessage, ["今天", "今日", "today"]);

  // Keep the deterministic direct-answer layer narrow. It should only handle:
  // 1) freshness checks, and
  // 2) same-day anomaly prompts where the best user experience is to clearly
  //    explain that today's DB coverage is insufficient instead of letting the
  //    model drift into generic commentary.
  //
  // All other EnMS analysis prompts should flow through the normal AI + DB
  // query path so the system can assemble richer answers and charts from live
  // data.
  if (!asksFreshness && !asksTodayScopedAnomaly) {
    return null;
  }
  const hasExplicitBenchmarkScope =
    includesAny(userMessage, ["benchmark", "benchmarking", "排名"]) ||
    includesAny(userMessage, ["總用電", "最大需量"]);

  if (asksFreshness) {
    return buildFreshnessAnswer(snapshot) ?? summarizeMissingData(snapshot);
  }
  if (asksAnomaly) {
    return buildTodayAnomalyAnswer(snapshot, requestedSites) ?? summarizeMissingData(snapshot);
  }
  if (asksBillTrend) {
    return buildBillTrendAnswer(snapshot) ?? summarizeMissingData(snapshot);
  }
  if (asksPowerFactor && !hasExplicitBenchmarkScope) {
    return buildPowerFactorAnswer(snapshot, requestedSites) ?? summarizeMissingData(snapshot);
  }
  if (asksPeakBySite) {
    return buildPeakDemandAnswer(snapshot, requestedSites) ?? summarizeMissingData(snapshot);
  }
  if (asksBenchmark) {
    return buildBenchmarkAnswer(snapshot, requestedSites) ?? summarizeMissingData(snapshot);
  }
  if (asksEfficiency) {
    return buildRoiAnswer(snapshot, requestedSites) ?? summarizeMissingData(snapshot);
  }
  if (asksTopLoad) {
    return buildTopLoadAnswer(snapshot, requestedSites) ?? summarizeMissingData(snapshot);
  }
  if (asksContractRisk) {
    return (
      buildContractRiskAnswer(snapshot, requestedSites) ??
      summarizeMissingData(snapshot)
    );
  }
  if (asksAlertSummary) {
    return (
      buildAlertSummaryAnswer(snapshot, {
        focusNoise: includesAny(userMessage, ["噪音", "重複", "可抑制"]),
      }) ?? summarizeMissingData(snapshot)
    );
  }
  if (asksSiteAccounts) {
    return buildSiteAccountsAnswer(snapshot) ?? summarizeMissingData(snapshot);
  }

  return null;
}
