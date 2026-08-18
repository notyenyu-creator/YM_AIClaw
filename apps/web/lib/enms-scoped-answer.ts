import {
  isEnmsDeviceLookupQuestion,
  isEnmsLatestDataQuestion,
  isEnmsSiteMetadataQuestion,
  matchesEnmsChatSemanticRoute,
} from "./enms-capability-registry";

export type EnmsScopedAnswerContext = {
  pageKey?: string;
  status?: string;
  updatedAt?: string;
  facts?: Record<string, unknown>;
  analysis?: {
    summary?: string;
    findings?: string[];
    recommendations?: string[];
  };
  cards?: Array<{
    key?: string;
    label?: string;
    value?: string;
    unit?: string | null;
    note?: string | null;
  }>;
  chartSeries?: Array<{
    key?: string;
    label?: string;
    points?: Array<{
      label?: string;
      value?: number | null;
      timestamp?: string | null;
    }>;
  }>;
  evidence?: {
    dataSources?: string[];
    timeRange?: string | null;
    queryScope?: string;
    confidence?: string;
    generatedAt?: string;
  };
  missingData?: Array<{
    key?: string;
    message?: string;
  }>;
};

export type EnmsScopedAnswerScope = {
  powerAccountIds?: Array<number | string>;
};

export type EnmsScopedAnswerChatPlan = {
  contractVersion?: string;
  answerObligations?: Array<{
    key?: string;
    capability?: string;
    pageKey?: string;
    answerKind?: string;
    requiredFactPaths?: string[];
    chartRequired?: boolean;
    chartType?: "bar" | "line" | "ranking" | "metric";
    unit?: string;
  }>;
};

export type EnmsScopedAnswerResult = {
  text: string;
  answerKind:
    | "billing"
    | "demand"
    | "device_lookup"
    | "site_metadata"
    | "ranking"
    | "account"
    | "time_range"
    | "metric"
    | "summary"
    | "missing";
  matchedFactPaths: string[];
  blocks?: EnmsScopedAnswerBlock[];
};

export type EnmsScopedAnswerBlock = {
  type: "chart";
  label?: string;
  chartType: "bar" | "line" | "ranking" | "metric";
  unit?: string;
  series: Array<{
    key: string;
    label: string;
    type: "bar" | "line" | "ranking" | "metric";
    points: Array<{
      label: string;
      value: number;
      timestamp?: string | null;
      tone?: string;
    }>;
  }>;
};

type NamedValue = {
  name: string;
  value: number | null;
  note: string;
};

type DeviceMapping = {
  label: string;
  meterId: string;
  deviceName: string;
  deviceAlias: string;
  macAddress: string;
  address: string;
  circuitSeq: number | null;
  meterRole: string;
  accountNumber: string;
  accountName: string;
  siteName: string;
  identityKey: string;
};

type SiteMetadataSite = {
  siteId: string;
  siteName: string;
  companyNo: string;
};

type SiteMetadata = {
  companyNo: string;
  companyName: string;
  currentSiteId: string;
  currentSite: SiteMetadataSite | null;
  authorizedSites: SiteMetadataSite[];
  meterCount: number | null;
};

type RequestedMeterRole = {
  label: string;
  matches: RegExp;
};

type CommonMetricDefinition = {
  matches: (value: string) => boolean;
  paths: string[];
  label: string;
  unit: string;
  pathLabels?: Record<string, string>;
  pathUnits?: Record<string, string>;
  fallbackFromOpportunities?: boolean;
};

const NUMBER_FORMAT = new Intl.NumberFormat("zh-TW", {
  maximumFractionDigits: 3,
});
const ENMS_CHAT_PLAN_CONTRACT_VERSION = "enms.ai.chat-plan.v2";

function collectPlanObligationKeys(
  chatPlan: EnmsScopedAnswerChatPlan | null | undefined,
): Set<string> {
  if (
    chatPlan?.contractVersion !== ENMS_CHAT_PLAN_CONTRACT_VERSION ||
    !Array.isArray(chatPlan.answerObligations)
  ) {
    return new Set<string>();
  }

  return new Set(
    chatPlan.answerObligations
      .flatMap((obligation) => [
        sanitizeText(obligation?.key),
        sanitizeText(obligation?.capability),
      ])
      .filter(Boolean)
      .map((key) => key.toLowerCase()),
  );
}

function collectPlanAnswerObligationKeys(
  chatPlan: EnmsScopedAnswerChatPlan | null | undefined,
): string[] {
  if (
    chatPlan?.contractVersion !== ENMS_CHAT_PLAN_CONTRACT_VERSION ||
    !Array.isArray(chatPlan.answerObligations)
  ) {
    return [];
  }

  const selected: string[] = [];
  for (const obligation of chatPlan.answerObligations) {
    const key = sanitizeText(obligation?.key).toLowerCase();
    if (!key || selected.includes(key)) {
      continue;
    }
    selected.push(key);
  }
  return selected;
}

function allowsObligation(
  obligationKeys: Set<string>,
  allowedKeys: string[],
): boolean {
  if (obligationKeys.size === 0) {
    return true;
  }

  return allowedKeys.some((key) => obligationKeys.has(key.toLowerCase()));
}

function resolvePowerFactorScopeLabel(context: EnmsScopedAnswerContext): string {
  if (context.pageKey === "anomaly") {
    return "焦點異常電表 / 異常根因分頁";
  }
  if (context.pageKey === "eff") {
    return "全場能效總覽 / 能效節能分頁";
  }

  return "目前授權範圍";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getCaseInsensitive(
  record: Record<string, unknown>,
  key: string,
): unknown {
  const actualKey = Object.keys(record).find(
    (candidate) => candidate.toLowerCase() === key.toLowerCase(),
  );
  return actualKey ? record[actualKey] : undefined;
}

function getPath(root: Record<string, unknown>, path: string): unknown {
  let current: unknown = root;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = getCaseInsensitive(current as Record<string, unknown>, segment);
  }
  return current;
}

function getNumber(root: Record<string, unknown>, path: string): number | null {
  const value = getPath(root, path);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getText(root: Record<string, unknown>, path: string): string {
  const value = getPath(root, path);
  return typeof value === "string" ? sanitizeText(value) : "";
}

function sanitizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/<[^>]*>/g, "").trim() : "";
}

function formatNumber(value: number, unit = ""): string {
  return `${NUMBER_FORMAT.format(value)}${unit ? ` ${unit}` : ""}`;
}

function formatTaipeiTimestamp(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return sanitizeText(value);
  }
  return date.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour12: false,
  });
}

function readNamedValues(
  value: unknown,
  valueKeys: string[] = [
    "value",
    "consumptionKwh",
    "totalConsumptionKwh",
    "usageKwh",
  ],
): NamedValue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): NamedValue | null => {
      const record = asRecord(item);
      const name =
        sanitizeText(getCaseInsensitive(record, "name")) ||
        sanitizeText(getCaseInsensitive(record, "label"));
      const rawValue = valueKeys
        .map((key) => getCaseInsensitive(record, key))
        .find((item) => typeof item === "number" && Number.isFinite(item));
      const numericValue =
        typeof rawValue === "number" && Number.isFinite(rawValue)
          ? rawValue
          : null;
      if (!name) {
        return null;
      }
      return {
        name,
        value: numericValue,
        note: sanitizeText(getCaseInsensitive(record, "note")),
      };
    })
    .filter((item): item is NamedValue => item !== null);
}

function readDeviceMappings(value: unknown): DeviceMapping[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): DeviceMapping | null => {
      const record = asRecord(item);
      const rawCircuitSeq = getCaseInsensitive(record, "circuitSeq");
      const circuitSeq =
        typeof rawCircuitSeq === "number" && Number.isFinite(rawCircuitSeq)
          ? rawCircuitSeq
          : typeof rawCircuitSeq === "string" && rawCircuitSeq.trim()
            ? Number(rawCircuitSeq)
            : null;
      const mapping: DeviceMapping = {
        label: sanitizeText(getCaseInsensitive(record, "label")),
        meterId: sanitizeText(getCaseInsensitive(record, "meterId")),
        deviceName: sanitizeText(getCaseInsensitive(record, "deviceName")),
        deviceAlias: sanitizeText(getCaseInsensitive(record, "deviceAlias")),
        macAddress: sanitizeText(getCaseInsensitive(record, "macAddress")),
        address: sanitizeText(getCaseInsensitive(record, "address")),
        circuitSeq: circuitSeq !== null && Number.isFinite(circuitSeq)
          ? circuitSeq
          : null,
        meterRole: sanitizeText(getCaseInsensitive(record, "meterRole")),
        accountNumber: sanitizeText(getCaseInsensitive(record, "accountNumber")),
        accountName: sanitizeText(getCaseInsensitive(record, "accountName")),
        siteName: sanitizeText(getCaseInsensitive(record, "siteName")),
        identityKey: sanitizeText(getCaseInsensitive(record, "identityKey")),
      };
      if (!mapping.label && !mapping.macAddress && !mapping.meterId) {
        return null;
      }

      return mapping;
    })
    .filter((item): item is DeviceMapping => item !== null);
}

function readSiteMetadataSite(value: unknown): SiteMetadataSite | null {
  const record = asRecord(value);
  const siteId = sanitizeText(getCaseInsensitive(record, "siteId"));
  const siteName = sanitizeText(getCaseInsensitive(record, "siteName"));
  const companyNo = sanitizeText(getCaseInsensitive(record, "companyNo"));
  if (!siteId && !siteName) {
    return null;
  }

  return {
    siteId,
    siteName,
    companyNo,
  };
}

function readSiteMetadata(value: unknown): SiteMetadata {
  const record = asRecord(value);
  const authorizedSitesValue =
    getCaseInsensitive(record, "authorizedSites") ??
    getCaseInsensitive(record, "sites");
  const authorizedSites = Array.isArray(authorizedSitesValue)
    ? authorizedSitesValue
      .map(readSiteMetadataSite)
      .filter((item): item is SiteMetadataSite => item !== null)
    : [];
  const currentSite =
    readSiteMetadataSite(getCaseInsensitive(record, "currentSite")) ??
    (authorizedSites.length === 1 ? authorizedSites[0] : null);
  const rawMeterCount = getCaseInsensitive(record, "meterCount");

  return {
    companyNo: sanitizeText(getCaseInsensitive(record, "companyNo")),
    companyName: sanitizeText(getCaseInsensitive(record, "companyName")),
    currentSiteId: sanitizeText(getCaseInsensitive(record, "currentSiteId")),
    currentSite,
    authorizedSites,
    meterCount: typeof rawMeterCount === "number" && Number.isFinite(rawMeterCount)
      ? rawMeterCount
      : null,
  };
}

function collectAccountNumbers(
  value: unknown,
  depth = 0,
  result = new Set<string>(),
): Set<string> {
  if (depth > 5 || result.size >= 20 || value === null) {
    return result;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 100)) {
      collectAccountNumbers(item, depth + 1, result);
    }
    return result;
  }
  if (typeof value !== "object") {
    return result;
  }

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/^(?:power)?accountnumber$/i.test(key) && typeof item === "string") {
      const normalized = item.replace(/[^\d]/g, "");
      if (normalized.length >= 8 && normalized.length <= 14) {
        result.add(item);
      }
    } else {
      collectAccountNumbers(item, depth + 1, result);
    }
  }
  return result;
}

function findRequestedAccountNumber(message: string): string {
  const match = message.match(/(?:\d[\s-]?){8,14}/);
  return match ? match[0].replace(/[^\d]/g, "") : "";
}

function findRequestedCircuitSeq(message: string): number | null {
  const match = message.match(/(?:迴路|回路|ch|circuit)\s*[-#:]?\s*(\d{1,3})/i);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function isChartRequested(message: string): boolean {
  return /圖表|圖形|長條圖|折線圖|趨勢圖|排行榜|排名圖|chart|graph|visual/i.test(message);
}

function buildMetricChartBlock(
  label: string,
  unit: string,
  key: string,
  points: Array<{ label: string; value: number; tone?: string }>,
): EnmsScopedAnswerBlock {
  return {
    type: "chart",
    label,
    chartType: "metric",
    unit,
    series: [
      {
        key,
        label,
        type: "metric",
        points: points
          .filter((point) => Number.isFinite(point.value))
          .slice(0, 6),
      },
    ],
  };
}

function readChartPointValues(
  context: EnmsScopedAnswerContext,
  keyPatterns: RegExp[],
): Array<{ label: string; timestamp: string; value: number }> {
  return (context.chartSeries ?? [])
    .filter((series) =>
      keyPatterns.some((pattern) =>
        pattern.test(`${series.key ?? ""} ${series.label ?? ""}`),
      ),
    )
    .flatMap((series) =>
      (series.points ?? [])
        .map((point) => ({
          label: sanitizeText(point.label),
          timestamp: sanitizeText(point.timestamp),
          value:
            typeof point.value === "number" && Number.isFinite(point.value)
              ? point.value
              : null,
        }))
        .filter((point): point is { label: string; timestamp: string; value: number } =>
          point.value !== null,
        ),
    );
}

function formatChartPointTime(point: { label: string; timestamp: string }): string {
  return point.label || formatTaipeiTimestamp(point.timestamp) || "未提供時間";
}

function requestedMonthDay(message: string): { month: number; day: number } | null {
  const match = message.match(
    /(?:20\d{2}\s*(?:年|[-/])\s*)?(\d{1,2})\s*(?:月|[-/])\s*(\d{1,2})\s*(?:日|號)?/,
  );
  if (!match) {
    return null;
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  return Number.isFinite(month) && Number.isFinite(day)
    ? { month, day }
    : null;
}

function chartPointMatchesMonthDay(
  point: { label: string; timestamp: string },
  monthDay: { month: number; day: number },
): boolean {
  const tokens = [point.label, point.timestamp].filter(Boolean);
  return tokens.some((token) => {
    const date = new Date(token);
    if (!Number.isNaN(date.getTime())) {
      const month = Number(
        date.toLocaleString("en-US", {
          timeZone: "Asia/Taipei",
          month: "numeric",
        }),
      );
      const day = Number(
        date.toLocaleString("en-US", {
          timeZone: "Asia/Taipei",
          day: "numeric",
        }),
      );
      return month === monthDay.month && day === monthDay.day;
    }

    const escapedMonth = String(monthDay.month).padStart(2, "0");
    const escapedDay = String(monthDay.day).padStart(2, "0");
    return new RegExp(
      `(?:^|[^0-9])(?:${monthDay.month}|${escapedMonth})(?:月|[-/])(?:${monthDay.day}|${escapedDay})(?:日|號)?`,
    ).test(token);
  });
}

function findRequestedMeterRole(message: string): RequestedMeterRole | null {
  if (/主電表|主電錶|總表|總電表|總電錶|\bmain\b/i.test(message)) {
    return {
      label: "主電表",
      matches: /^main$/i,
    };
  }

  if (/子電表|子電錶|分表|\bsubmeter\b|\bsub\b/i.test(message)) {
    return {
      label: "子電表",
      matches: /^sub(?:meter)?$/i,
    };
  }

  if (/獨立設備|獨立電表|standalone/i.test(message)) {
    return {
      label: "獨立設備",
      matches: /^standalone$/i,
    };
  }

  return null;
}

function normalizeAccountNumber(value: string): string {
  return value.replace(/[^\d]/g, "");
}

function findRequestedDateToken(message: string): string {
  const chineseDate = message.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月/);
  if (chineseDate) {
    return `${chineseDate[1]}-${chineseDate[2].padStart(2, "0")}`;
  }

  const isoDate = message.match(/(20\d{2})[-/](\d{1,2})(?:[-/]\d{1,2})?/);
  return isoDate ? `${isoDate[1]}-${isoDate[2].padStart(2, "0")}` : "";
}

function scopedContextCoversDate(
  context: EnmsScopedAnswerContext,
  dateToken: string,
): boolean {
  if (!dateToken) {
    return true;
  }
  const searchable = [
    context.evidence?.timeRange,
    context.updatedAt,
    context.evidence?.generatedAt,
    ...(context.chartSeries ?? []).flatMap((series) =>
      (series.points ?? []).map((point) => point.timestamp),
    ),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .replace(/\//g, "-");
  return searchable.includes(dateToken);
}

function buildMissingAnswer(
  context: EnmsScopedAnswerContext,
  subject: string,
): EnmsScopedAnswerResult {
  const allMissing = (context.missingData ?? [])
    .map((item) => sanitizeText(item.message))
    .filter(Boolean);
  const relevantMissing = filterMissingBySubject(allMissing, subject);
  const missing = (relevantMissing.length > 0 ? relevantMissing : allMissing)
    .slice(0, 4);
  const timeRange = sanitizeText(context.evidence?.timeRange);

  return {
    answerKind: "missing",
    matchedFactPaths: [],
    text: [
      `本次 EnMS 已授權 scoped facts 沒有足夠的${subject}資料，因此不能用其他場域、全域 DB 或模型猜測補答案。`,
      timeRange ? `目前可驗證的資料時間範圍：${timeRange}。` : "",
      missing.length > 0
        ? `已知缺口：\n${missing.map((item) => `- ${item}`).join("\n")}`
        : "請由 EnMS API 依相同權限範圍補齊對應 facts 後再查詢。",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

function filterMissingBySubject(
  missing: string[],
  subject: string,
): string[] {
  const subjectPattern = (() => {
    if (/帳單|台電|電費|費率|電價|bill|billing/i.test(subject)) {
      return /帳單|台電|電費|費率|電價|bill|billing/i;
    }
    if (/需量|契約容量|超約|降載|尖峰|demand/i.test(subject)) {
      return /需量|契約|容量|超約|降載|尖峰|demand|kW/i;
    }
    if (/功率因數|功因|power factor|pf/i.test(subject)) {
      return /功率因數|功因|power factor|pf|電力品質|summary|raw/i;
    }
    if (/排名|排行|迴路|電表|用電|耗電|kWh/i.test(subject)) {
      return /排名|排行|迴路|電表|用電|耗電|能耗|summary|kWh|圖表/i;
    }
    if (/設備|對應|主檔|mapping/i.test(subject)) {
      return /設備|電表|主檔|對應|mapping|MAC|位址|地址|迴路/i;
    }
    return null;
  })();

  if (!subjectPattern) {
    return missing;
  }

  return missing.filter((item) => subjectPattern.test(item));
}

function inferMissingSubject(
  message: string,
  context: EnmsScopedAnswerContext,
): string {
  const missingText = (context.missingData ?? [])
    .map((item) => `${sanitizeText(item.key)} ${sanitizeText(item.message)}`)
    .join(" ");
  const evidence = `${message} ${missingText}`;
  if (/帳單|台電|電費|費率|平均電價|應繳|bill|billing/i.test(evidence)) {
    return "台電帳單 / 費率";
  }
  if (/需量|契約容量|超約|降載|尖峰|demand|kw/i.test(evidence)) {
    return "需量 / 契約容量";
  }
  if (/排名|排行|最耗電|最費電|耗電|用電最高|迴路|電表|kwh/i.test(evidence)) {
    return "排名";
  }
  return "本題";
}

function answerBilling(
  message: string,
  context: EnmsScopedAnswerContext,
  facts: Record<string, unknown>,
): EnmsScopedAnswerResult | null {
  if (!/帳單|電費|費率|平均電價|應繳|billing/i.test(message)) {
    return null;
  }

  const metrics = asRecord(getCaseInsensitive(facts, "metrics"));
  const billDetails = Array.isArray(getCaseInsensitive(facts, "billDetails"))
    ? (getCaseInsensitive(facts, "billDetails") as unknown[])
        .map(asRecord)
        .filter((item) => sanitizeText(getCaseInsensitive(item, "accountNumber")))
    : [];
  const requestedAccount = findRequestedAccountNumber(message);
  const selectedBill = requestedAccount
    ? billDetails.find((item) =>
        normalizeAccountNumber(sanitizeText(getCaseInsensitive(item, "accountNumber"))) ===
          requestedAccount
      )
    : billDetails[0];
  if (requestedAccount && billDetails.length > 0 && !selectedBill) {
    return buildMissingAnswer(context, `電號 ${requestedAccount} 的台電帳單 / 費率`);
  }

  const month = selectedBill
    ? sanitizeText(getCaseInsensitive(selectedBill, "billingMonth"))
    : getText(metrics, "latestBillMonth");
  const amount = selectedBill
    ? typeof getCaseInsensitive(selectedBill, "totalAmountNtd") === "number"
      ? (getCaseInsensitive(selectedBill, "totalAmountNtd") as number)
      : null
    : getNumber(metrics, "latestBillAmountNtd");
  const usage = selectedBill
    ? typeof getCaseInsensitive(selectedBill, "usageKwh") === "number"
      ? (getCaseInsensitive(selectedBill, "usageKwh") as number)
      : null
    : getNumber(metrics, "latestBillUsageKwh");
  const averageRate = selectedBill
    ? typeof getCaseInsensitive(selectedBill, "averageRateNtdPerKwh") === "number"
      ? (getCaseInsensitive(selectedBill, "averageRateNtdPerKwh") as number)
      : null
    : getNumber(metrics, "averageRateNtdPerKwh");
  const accountLine = selectedBill
    ? sanitizeText(getCaseInsensitive(selectedBill, "accountNumber"))
    : "";
  const matchedFactPaths: string[] = [];
  const lines: string[] = [];

  if (accountLine) {
    lines.push(`電號：${accountLine}`);
    matchedFactPaths.push("facts.billDetails.accountNumber");
  }
  if (month) {
    lines.push(`最近一期帳單月份：${month}`);
    matchedFactPaths.push(
      selectedBill ? "facts.billDetails.billingMonth" : "facts.metrics.latestBillMonth",
    );
  }
  if (amount !== null) {
    lines.push(`最近一期應繳金額：${formatNumber(amount, "NTD")}`);
    matchedFactPaths.push(
      selectedBill
        ? "facts.billDetails.totalAmountNtd"
        : "facts.metrics.latestBillAmountNtd",
    );
  }
  if (usage !== null) {
    lines.push(`最近一期用電量：${formatNumber(usage, "kWh")}`);
    matchedFactPaths.push(
      selectedBill ? "facts.billDetails.usageKwh" : "facts.metrics.latestBillUsageKwh",
    );
  }
  if (averageRate !== null) {
    lines.push(`本次分析採用平均電價：${formatNumber(averageRate, "NTD/kWh")}`);
    matchedFactPaths.push(
      selectedBill
        ? "facts.billDetails.averageRateNtdPerKwh"
        : "facts.metrics.averageRateNtdPerKwh",
    );
  }

  if (lines.length === 0) {
    return buildMissingAnswer(context, "台電帳單 / 費率");
  }

  return {
    answerKind: "billing",
    matchedFactPaths,
    text: [
      lines.join("\n"),
      `資料時間範圍：${sanitizeText(context.evidence?.timeRange) || "EnMS 未提供"}`,
    ].join("\n\n"),
  };
}

function answerDemand(
  message: string,
  context: EnmsScopedAnswerContext,
  facts: Record<string, unknown>,
): EnmsScopedAnswerResult | null {
  if (!/需量|契約容量|超約|降載|尖峰|demand/i.test(message)) {
    return null;
  }

  const metrics = asRecord(getCaseInsensitive(facts, "metrics"));
  const metricDefinitions = [
    {
      path: "currentDemandKw",
      label: "目前需量",
      unit: "kW",
      include: /目前|現在|即時|需量/i.test(message),
    },
    {
      path: "peakDemandKw",
      label: "已發生最高需量",
      unit: "kW",
      include: /最高|尖峰|需量/i.test(message),
    },
    {
      path: "projectedPeakDemandKw",
      label: "趨勢推估尖峰需量",
      unit: "kW",
      include: /預測|未來|尖峰|超約/i.test(message),
    },
    {
      path: "contractCapacityKw",
      label: "契約容量",
      unit: "kW",
      include: /契約|超約|容量|需量/i.test(message),
    },
    {
      path: "targetDemandKw",
      label: "建議需量目標",
      unit: "kW",
      include: /目標|降載|建議/i.test(message),
    },
    {
      path: "suggestedShedKw",
      label: "建議降載",
      unit: "kW",
      include: /降載|超約|建議/i.test(message),
    },
  ] as const;
  const selected = metricDefinitions
    .map((definition) => ({
      ...definition,
      value: getNumber(metrics, definition.path),
    }))
    .filter((definition) => definition.include && definition.value !== null);
  const available =
    selected.length > 0
      ? selected
      : metricDefinitions
          .map((definition) => ({
            ...definition,
            value: getNumber(metrics, definition.path),
          }))
          .filter((definition) => definition.value !== null)
          .slice(0, 4);

  if (available.length === 0) {
    return buildMissingAnswer(context, "需量 / 契約容量");
  }

  const contractCapacity = getNumber(metrics, "contractCapacityKw");
  const projectedPeak = getNumber(metrics, "projectedPeakDemandKw");
  const risk =
    contractCapacity !== null && projectedPeak !== null
      ? projectedPeak > contractCapacity
        ? `趨勢推估尖峰高於契約容量 ${formatNumber(projectedPeak - contractCapacity, "kW")}，需人工確認超約風險。`
        : `趨勢推估尖峰仍低於契約容量 ${formatNumber(contractCapacity - projectedPeak, "kW")}。`
      : "";
  const chartBlocks = isChartRequested(message)
    ? [
        buildMetricChartBlock(
          "需量指標",
          "kW",
          "facts.metrics.demandKpi",
          available.map((definition) => ({
            label: definition.label,
            value: definition.value as number,
            tone:
              definition.path === "contractCapacityKw"
                ? "danger"
                : definition.path === "projectedPeakDemandKw"
                  ? "purple"
                  : "blue",
          })),
        ),
      ]
    : [];

  return {
    answerKind: "demand",
    matchedFactPaths: available.map(
      (definition) => `facts.metrics.${definition.path}`,
    ),
    blocks: chartBlocks,
    text: [
      available
        .map(
          (definition) =>
            `${definition.label}：${formatNumber(
              definition.value as number,
              definition.unit,
            )}`,
        )
        .join("\n"),
      risk,
      `判讀時間範圍：${sanitizeText(context.evidence?.timeRange) || "EnMS 未提供"}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

function answerRanking(
  message: string,
  context: EnmsScopedAnswerContext,
  facts: Record<string, unknown>,
  options: {
    allowMeterRanking: boolean;
    allowSiteRanking: boolean;
    forceRanking?: boolean;
  } = {
    allowMeterRanking: true,
    allowSiteRanking: true,
    forceRanking: false,
  },
): EnmsScopedAnswerResult | null {
  if (isEnmsDeviceLookupQuestion(message)) {
    return null;
  }
  if (
    !options.forceRanking &&
    !/排名|排行|最高|最低|最耗電|最費電|耗電最高|用電最高|場域比較|哪個場域|哪個迴路.{0,8}(?:費電|耗電|用電)|(?:費電|耗電|用電).{0,8}迴路/i
      .test(message)
  ) {
    return null;
  }
  const asksSiteBenchmarking =
    /場域|案場|各場域|各案場|多場域|區域|廠區|據點|站點|site|benchmark/i
      .test(message) &&
    /比較|排名|排行|benchmark|總用電|用電|耗電|耗能|平均功率因數|功率因數/i
      .test(message);
  if (
    /需量|kw|demand/i.test(message) &&
    !asksSiteBenchmarking &&
    !/迴路|回路|電表|mac|address|位址|地址|circuit|meter/i.test(message)
  ) {
    return null;
  }

  const siteRankingSource = {
    path: "facts.siteRankings",
    values: readNamedValues(getCaseInsensitive(facts, "siteRankings")),
  };
  const meterDemandRankingSources: Array<{ path: string; values: NamedValue[] }> = [
    {
      path: "facts.meterRankingDetails.peakDemandKw",
      values: readNamedValues(
        getCaseInsensitive(facts, "meterRankingDetails"),
        ["peakDemandKw"],
      ),
    },
  ];
  const meterRankingSources: Array<{ path: string; values: NamedValue[] }> = [
    {
      path: "facts.meterRankingDetails",
      values: readNamedValues(getCaseInsensitive(facts, "meterRankingDetails")),
    },
    {
      path: "facts.ranking",
      values: readNamedValues(getCaseInsensitive(facts, "ranking")),
    },
    {
      path: "facts.topLoads",
      values: readNamedValues(getCaseInsensitive(facts, "topLoads")),
    },
  ];
  const chartRankingSources: Array<{ path: string; values: NamedValue[] }> = [];
  for (const series of context.chartSeries ?? []) {
    if (/ranking|排行|排名/i.test(series.key ?? series.label ?? "")) {
      chartRankingSources.push({
        path: `chartSeries.${series.key ?? "ranking"}`,
        values: (series.points ?? [])
          .map((point) => ({
            name: sanitizeText(point.label),
            value:
              typeof point.value === "number" && Number.isFinite(point.value)
                ? point.value
                : null,
            note: "",
          }))
          .filter((point) => point.name),
      });
    }
  }
  const asksMeterRanking =
    /迴路|回路|電表|MAC|CircuitSeq|哪個迴路|哪個電表/i.test(message) &&
    !/場域|site/i.test(message);
  const asksConsumptionRanking =
    /最耗電|最費電|耗電|費電|用電|耗能|kWh/i.test(message);
  const asksDemandRanking =
    asksMeterRanking && /需量|kw|demand/i.test(message) && !asksConsumptionRanking;
  const siteSources = options.allowSiteRanking ? [siteRankingSource] : [];
  const meterSources = options.allowMeterRanking
    ? asksDemandRanking
      ? meterDemandRankingSources
      : [...meterRankingSources, ...chartRankingSources]
    : [];
  const sources = asksDemandRanking
    ? meterSources
    : asksMeterRanking
      ? [...meterSources, ...siteSources]
      : [...siteSources, ...meterSources];
  const valueUnit = asksDemandRanking ? "kW" : "kWh";
  const missingSubject = asksDemandRanking
    ? "迴路 / 電表需量排名"
    : options.allowSiteRanking && !options.allowMeterRanking
      ? "場域排名"
      : options.allowMeterRanking && !options.allowSiteRanking
        ? "迴路 / 電表排名"
        : "排名";

  const source = sources.find((candidate) => candidate.values.length > 0);
  if (!source) {
    return buildMissingAnswer(context, missingSubject);
  }
  const lowestFirst = /最低|最少/.test(message);
  const sorted = source.values.toSorted((left, right) => {
    if (left.value === null) {
      return 1;
    }
    if (right.value === null) {
      return -1;
    }
    return lowestFirst ? left.value - right.value : right.value - left.value;
  });
  const requestedRank = message.match(/第\s*(\d+)\s*(?:名|個)/);
  const startIndex = requestedRank
    ? Math.max(Number(requestedRank[1]) - 1, 0)
    : 0;
  const selected = requestedRank
    ? sorted.slice(startIndex, startIndex + 1)
    : sorted.slice(0, 5);
  const chartPoints = selected
    .filter((item) => item.value !== null)
    .map((item) => ({
      label: item.name,
      value: item.value ?? 0,
      tone: lowestFirst ? "green" : "blue",
    }));
  const chartBlocks: EnmsScopedAnswerBlock[] =
    isChartRequested(message) && chartPoints.length > 0
      ? [
          {
            type: "chart",
            label: options.allowMeterRanking && !options.allowSiteRanking
              ? "迴路 / 電表排名"
              : "場域 Benchmarking 排名",
            chartType: "bar",
            unit: valueUnit,
            series: [
              {
                key: source.path.replace(/[^a-z0-9_.-]/gi, "_").slice(0, 80),
                label: options.allowMeterRanking && !options.allowSiteRanking
                  ? "迴路 / 電表排名"
                  : "場域排名",
                type: "bar",
                points: chartPoints,
              },
            ],
          },
        ]
      : [];

  return {
    answerKind: "ranking",
    matchedFactPaths: [source.path],
    blocks: chartBlocks,
    text: [
      selected
        .map((item, index) => {
          const rank = requestedRank ? startIndex + 1 : index + 1;
          const value =
            item.value === null
              ? "數值未提供"
              : `${NUMBER_FORMAT.format(item.value)} ${valueUnit}`;
          return `#${rank} ${item.name}：${value}${item.note ? `（${item.note}）` : ""}`;
        })
        .join("\n"),
      `排名時間範圍：${sanitizeText(context.evidence?.timeRange) || "EnMS 未提供"}`,
    ].join("\n\n"),
  };
}

function answerDeviceLookup(
  message: string,
  context: EnmsScopedAnswerContext,
  facts: Record<string, unknown>,
): EnmsScopedAnswerResult | null {
  if (!isEnmsDeviceLookupQuestion(message)) {
    return null;
  }

  const mappings = readDeviceMappings(getCaseInsensitive(facts, "deviceMappings"));
  const requestedCircuitSeq = findRequestedCircuitSeq(message);
  const requestedMeterRole = findRequestedMeterRole(message);
  const matchedMappings = mappings.filter((mapping) => {
    if (
      requestedCircuitSeq !== null &&
      mapping.circuitSeq !== requestedCircuitSeq
    ) {
      return false;
    }
    if (
      requestedMeterRole &&
      !requestedMeterRole.matches.test(mapping.meterRole)
    ) {
      return false;
    }
    return true;
  });
  if (matchedMappings.length === 0) {
    const requestedLabel = [
      requestedCircuitSeq === null ? "" : `迴路 ${requestedCircuitSeq}`,
      requestedMeterRole?.label ?? "",
      "設備 / 電表對應",
    ]
      .filter(Boolean)
      .join("的");
    return buildMissingAnswer(
      context,
      requestedLabel,
    );
  }

  const shown = matchedMappings.slice(0, 8);
  const titleSubject = requestedMeterRole?.label ?? "設備 / 電表對應";
  const title = requestedCircuitSeq === null
    ? `目前授權範圍內可驗證的${titleSubject}共 ${matchedMappings.length} 筆：`
    : `迴路 ${requestedCircuitSeq} 在目前授權範圍內有 ${matchedMappings.length} 筆可驗證${titleSubject}：`;
  const lines = shown.map((mapping) => {
    const displayName =
      mapping.deviceAlias || mapping.deviceName || mapping.label || "未註冊電表";
    const details = [
      mapping.macAddress ? `MAC ${mapping.macAddress}` : "",
      mapping.address ? `位址 ${mapping.address}` : "",
      mapping.circuitSeq !== null ? `迴路 ${mapping.circuitSeq}` : "",
      mapping.meterRole ? `角色 ${mapping.meterRole}` : "",
      mapping.accountNumber ? `電號 ${mapping.accountNumber}` : "",
      mapping.siteName ? `場域 ${mapping.siteName}` : "",
    ].filter(Boolean);
    return `- ${displayName}${details.length ? `（${details.join(" / ")}）` : ""}`;
  });
  const ambiguityNote = matchedMappings.length > 1
    ? "注意：迴路號在不同 Gateway MAC / Address 下可能重複，畫面判讀請以 MAC、位址與迴路一起看；後端另以電表主檔 surrogate key 輔助去重。"
    : "";

  return {
    answerKind: "device_lookup",
    matchedFactPaths: ["facts.deviceMappings"],
    text: [
      title,
      lines.join("\n"),
      matchedMappings.length > shown.length
        ? `另有 ${matchedMappings.length - shown.length} 筆未列出，請縮小 MAC、位址或電號範圍。`
        : "",
      ambiguityNote,
      `資料時間範圍：${sanitizeText(context.evidence?.timeRange) || "EnMS 電表主檔 scoped inventory"}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

function answerSiteMetadata(
  message: string,
  context: EnmsScopedAnswerContext,
  facts: Record<string, unknown>,
): EnmsScopedAnswerResult | null {
  if (!isEnmsSiteMetadataQuestion(message)) {
    return null;
  }

  const metadata = readSiteMetadata(getCaseInsensitive(facts, "siteMetadata"));
  const lines: string[] = [];
  if (metadata.companyName) {
    lines.push(
      `公司 / 客戶：${metadata.companyName}${metadata.companyNo ? `（${metadata.companyNo}）` : ""}`,
    );
  } else if (metadata.companyNo) {
    lines.push(`公司代碼：${metadata.companyNo}`);
  }

  const currentSiteName = metadata.currentSite?.siteName;
  const currentSiteId = metadata.currentSite?.siteId || metadata.currentSiteId;
  if (currentSiteName) {
    lines.push(
      `目前場域 / 案場：${currentSiteName}${currentSiteId ? `（${currentSiteId}）` : ""}`,
    );
  }

  if (metadata.authorizedSites.length > 0) {
    lines.push(`授權可見場域數：${metadata.authorizedSites.length}`);
    lines.push(
      ...metadata.authorizedSites.slice(0, 8).map((site) =>
        `- ${site.siteName || site.siteId || "未命名場域"}${site.siteId ? `（${site.siteId}）` : ""}`
      ),
    );
  }

  if (metadata.meterCount !== null) {
    lines.push(`授權電表迴路數：${NUMBER_FORMAT.format(metadata.meterCount)} 筆`);
  }

  if (lines.length === 0) {
    return buildMissingAnswer(context, "公司 / 場域 / 案場名稱");
  }

  return {
    answerKind: "site_metadata",
    matchedFactPaths: ["facts.siteMetadata"],
    text: [
      lines.join("\n"),
      `資料時間範圍：${sanitizeText(context.evidence?.timeRange) || "EnMS 授權 scope metadata"}`,
    ].join("\n\n"),
  };
}

function answerAccount(
  message: string,
  context: EnmsScopedAnswerContext,
  facts: Record<string, unknown>,
  scope?: EnmsScopedAnswerScope,
): EnmsScopedAnswerResult | null {
  if (!/電號|account number/i.test(message)) {
    return null;
  }

  const accountNumbers = Array.from(collectAccountNumbers(facts));
  const requestedAccount = findRequestedAccountNumber(message);
  if (requestedAccount) {
    const matched = accountNumbers.find(
      (account) => normalizeAccountNumber(account) === requestedAccount,
    );
    if (!matched) {
      return buildMissingAnswer(context, `電號 ${requestedAccount} 的可驗證`);
    }
    return {
      answerKind: "account",
      matchedFactPaths: ["facts.*.accountNumber"],
      text: `本次已授權 scoped facts 包含電號 ${matched}；資料時間範圍為 ${sanitizeText(context.evidence?.timeRange) || "EnMS 未提供"}。`,
    };
  }

  if (accountNumbers.length > 0) {
    return {
      answerKind: "account",
      matchedFactPaths: ["facts.*.accountNumber"],
      text: `本次已授權 scoped facts 包含 ${accountNumbers.length} 個電號：${accountNumbers.join("、")}。`,
    };
  }

  if (scope?.powerAccountIds?.length) {
    return {
      answerKind: "account",
      matchedFactPaths: ["scope.powerAccountIds"],
      text: `本次 EnMS 授權範圍包含 ${scope.powerAccountIds.length} 個電號識別碼，但 scoped facts 沒有提供可顯示的 AccountNumber，因此不會把內部 ID 猜成電號。`,
    };
  }

  return buildMissingAnswer(context, "電號");
}

function answerTimeRange(
  message: string,
  context: EnmsScopedAnswerContext,
): EnmsScopedAnswerResult | null {
  if (!/更新時間|資料時間|時間範圍|哪一天|日期|截至|多久|幾天/i.test(message)) {
    return null;
  }

  const timeRange = sanitizeText(context.evidence?.timeRange);
  const updatedAt = formatTaipeiTimestamp(
    context.updatedAt || context.evidence?.generatedAt,
  );
  if (!timeRange && !updatedAt) {
    return buildMissingAnswer(context, "時間範圍");
  }

  return {
    answerKind: "time_range",
    matchedFactPaths: [
      ...(timeRange ? ["evidence.timeRange"] : []),
      ...(updatedAt ? ["updatedAt"] : []),
    ],
    text: [
      timeRange ? `資料時間範圍：${timeRange}` : "",
      updatedAt ? `資料更新時間（台北時間）：${updatedAt}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function answerDataCoverage(
  message: string,
  context: EnmsScopedAnswerContext,
  facts: Record<string, unknown>,
): EnmsScopedAnswerResult | null {
  const normalizedMessage = message.toLowerCase();
  const hasDataAnchor =
    /資料|數據|時序|讀值|紀錄|記錄|電表資訊|電表資料|收集|採集|累積|涵蓋|覆蓋|coverage|data/.test(
      normalizedMessage,
    );
  const hasCoverageIntent =
    /幾天|幾日|多少天|多少日|多久|多長|總共有|共有|從哪天|到哪天|起訖|期間|時間跨度|資料量|筆數|日數|天數|date range|time range|how many days/.test(
      normalizedMessage,
    );
  const asksLatestOnly =
    /最新一筆|最近一筆|最後一筆|更新到|截至/.test(normalizedMessage);
  if (!hasDataAnchor || !hasCoverageIntent || asksLatestOnly) {
    return null;
  }

  const dataCoverage = asRecord(getCaseInsensitive(facts, "dataCoverage"));
  const metrics = asRecord(getCaseInsensitive(facts, "metrics"));
  const firstDataAt =
    getText(dataCoverage, "firstDataAtText") ??
    getText(metrics, "dataCoverageFirstDataAt") ??
    formatTaipeiTimestamp(getText(dataCoverage, "firstDataAt"));
  const latestDataAt =
    getText(dataCoverage, "latestDataAtText") ??
    getText(metrics, "dataCoverageLatestDataAt") ??
    formatTaipeiTimestamp(getText(dataCoverage, "latestDataAt"));
  const coveredDateCount =
    getNumber(dataCoverage, "coveredDateCount") ??
    getNumber(metrics, "dataCoverageCoveredDateCount");
  if (!firstDataAt || !latestDataAt || coveredDateCount === null) {
    return buildMissingAnswer(context, "資料收集天數 / 覆蓋範圍");
  }

  const calendarSpanDays =
    getNumber(dataCoverage, "calendarSpanDays") ??
    getNumber(metrics, "dataCoverageCalendarSpanDays");
  const sampleCount =
    getNumber(dataCoverage, "sampleCount") ??
    getNumber(metrics, "dataCoverageSampleCount");
  const meterCount =
    getNumber(dataCoverage, "meterCount") ??
    getNumber(metrics, "dataCoverageMeterCount");
  const timeZone =
    getText(dataCoverage, "timeZone") ??
    getText(metrics, "dataCoverageTimeZone");
  const evidence = [
    meterCount !== null ? `涵蓋電表迴路：${formatNumber(meterCount, "個")}` : "",
    sampleCount !== null ? `15 分鐘資料：${formatNumber(sampleCount, "筆")}` : "",
  ].filter(Boolean);
  const spanLine =
    calendarSpanDays !== null
      ? `起訖日期跨度：${formatNumber(calendarSpanDays, "天")}`
      : "";
  const gapLine =
    calendarSpanDays !== null && calendarSpanDays > coveredDateCount
      ? "提醒：日期跨度大於有資料日數，代表中間可能有日期沒有資料或未納入目前授權範圍。"
      : "";

  return {
    answerKind: "time_range",
    matchedFactPaths: [
      "facts.dataCoverage.firstDataAt",
      "facts.dataCoverage.latestDataAt",
      "facts.dataCoverage.coveredDateCount",
    ],
    text: [
      `授權範圍內電表時序資料從 ${firstDataAt} 到 ${latestDataAt}。`,
      `有資料的本地日曆日：${formatNumber(coveredDateCount, "天")}`,
      spanLine,
      evidence.join("\n"),
      gapLine,
      `口徑：以 EnMS 授權語意層統計${timeZone ? `，依部署時區 ${timeZone} 計算本地日曆日` : ""}；不是目前分頁的 7 日或 30 日取樣視窗。`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function answerLatestDataAt(
  message: string,
  context: EnmsScopedAnswerContext,
  facts: Record<string, unknown>,
): EnmsScopedAnswerResult | null {
  if (!isEnmsLatestDataQuestion(message)) {
    return null;
  }

  const metrics = asRecord(getCaseInsensitive(facts, "metrics"));
  const latestDataAt =
    getText(facts, "latestDataAt") || getText(metrics, "latestDataAt");
  if (!latestDataAt) {
    return buildMissingAnswer(context, "最新資料時間");
  }

  const sampleCount = getNumber(facts, "sampleCount");
  const meterCount = getNumber(facts, "meterCount");
  const details = [
    sampleCount !== null
      ? `本次 facts 樣本數：${formatNumber(sampleCount, "筆")}`
      : "",
    meterCount !== null
      ? `涵蓋電表迴路：${formatNumber(meterCount, "個")}`
      : "",
    `資料時間範圍：${sanitizeText(context.evidence?.timeRange) || "EnMS 未提供"}`,
  ].filter(Boolean);

  return {
    answerKind: "time_range",
    matchedFactPaths: [
      getText(facts, "latestDataAt")
        ? "facts.latestDataAt"
        : "facts.metrics.latestDataAt",
    ],
    text: [
      `授權範圍內最新一筆 EnMS 時序資料時間：${formatTaipeiTimestamp(latestDataAt)}。`,
      details.join("\n"),
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

function answerDailyConsumptionPoint(
  message: string,
  context: EnmsScopedAnswerContext,
): EnmsScopedAnswerResult | null {
  const points = readChartPointValues(context, [
    /dailyConsumption/i,
    /每日用電|日用電|daily.*energy/i,
  ]);
  if (points.length === 0) {
    return buildMissingAnswer(context, "每日用電量");
  }

  const targetMonthDay = requestedMonthDay(message);
  const matchedPoint = targetMonthDay
    ? points.find((point) => chartPointMatchesMonthDay(point, targetMonthDay))
    : null;
  const selectedPoint =
    matchedPoint ??
    points
      .toSorted((left, right) => right.value - left.value)
      .at(0);
  if (!selectedPoint) {
    return buildMissingAnswer(context, "每日用電量");
  }

  const subject = matchedPoint ? "指定日期每日用電量" : "最高用電日";
  const chartBlocks = isChartRequested(message)
    ? [
        {
          type: "chart" as const,
          label: "每日用電量",
          chartType: "line" as const,
          unit: "kWh",
          series: [
            {
              key: "chartSeries.dailyConsumption",
              label: "每日用電量",
              type: "line" as const,
              points: points.slice(0, 60).map((point) => ({
                label: formatChartPointTime(point),
                value: point.value,
                timestamp: point.timestamp || null,
                tone: point === selectedPoint ? "danger" : "blue",
              })),
            },
          ],
        },
      ]
    : [];

  return {
    answerKind: "metric",
    matchedFactPaths: ["chartSeries.dailyConsumption"],
    blocks: chartBlocks,
    text: [
      `${subject}：${formatChartPointTime(selectedPoint)}，約 ${formatNumber(selectedPoint.value, "kWh")}。`,
      `資料時間範圍：${sanitizeText(context.evidence?.timeRange) || "EnMS 未提供"}。`,
      "口徑：每日用電量 = 同一本地日曆日內 15 分鐘 TotalConsumption kWh 加總；kWh 可加總。",
    ].join("\n"),
  };
}

function answerDailyPeakDemandPoint(
  message: string,
  context: EnmsScopedAnswerContext,
): EnmsScopedAnswerResult | null {
  const points = readChartPointValues(context, [
    /dailyPeakDemand/i,
    /每日最高需量|最高需量/i,
  ]);
  if (points.length === 0) {
    return null;
  }

  const targetMonthDay = requestedMonthDay(message);
  const matchedPoint = targetMonthDay
    ? points.find((point) => chartPointMatchesMonthDay(point, targetMonthDay))
    : null;
  const selectedPoint =
    matchedPoint ??
    points
      .toSorted((left, right) => right.value - left.value)
      .at(0);
  if (!selectedPoint) {
    return buildMissingAnswer(context, "每日最高需量");
  }

  const subject = matchedPoint ? "指定日期最高需量" : "最高需量日";
  return {
    answerKind: "demand",
    matchedFactPaths: ["chartSeries.dailyPeakDemand"],
    text: [
      `${subject}：${formatChartPointTime(selectedPoint)}，約 ${formatNumber(selectedPoint.value, "kW")}。`,
      `資料時間範圍：${sanitizeText(context.evidence?.timeRange) || "EnMS 未提供"}。`,
      "口徑：每日最高需量 = 同一本地日曆日內 15 分鐘需量取最大值；需量是 kW 強度，不可加總。",
    ].join("\n"),
  };
}

function answerAnomalyDeviationPoint(
  context: EnmsScopedAnswerContext,
  facts: Record<string, unknown>,
): EnmsScopedAnswerResult | null {
  const point = asRecord(getCaseInsensitive(facts, "anomalyDeviationPoint"));
  const actualDemandKw = getNumber(point, "actualDemandKw");
  const baselineDemandKw = getNumber(point, "baselineDemandKw");
  const deltaKw = getNumber(point, "deltaKw");
  const deviationPercent = getNumber(point, "deviationPercent");
  const timestamp =
    getText(point, "label") ||
    getText(point, "timestampText") ||
    formatTaipeiTimestamp(getText(point, "timestamp"));
  const meterLabel = getText(point, "meterLabel");

  if (
    actualDemandKw === null ||
    baselineDemandKw === null ||
    deltaKw === null ||
    deviationPercent === null
  ) {
    return buildMissingAnswer(context, "異常最大偏離點");
  }

  return {
    answerKind: "metric",
    matchedFactPaths: ["facts.anomalyDeviationPoint"],
    text: [
      `異常最大偏離點：${timestamp || "未提供時間"}。`,
      meterLabel ? `對象：${meterLabel}。` : "",
      `實際需量：${formatNumber(actualDemandKw, "kW")}；歷史基準：${formatNumber(baselineDemandKw, "kW")}。`,
      `偏離量：${formatNumber(deltaKw, "kW")}；偏離比例：${formatNumber(deviationPercent, "%")}。`,
      `資料時間範圍：${sanitizeText(context.evidence?.timeRange) || "EnMS 未提供"}。`,
      "口徑：偏離比例 = (實際需量 - 歷史基準需量) / 歷史基準需量 × 100；此題不可用平均功率因數取代。",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function answerCommonMetric(
  message: string,
  context: EnmsScopedAnswerContext,
  facts: Record<string, unknown>,
): EnmsScopedAnswerResult | null {
  const metrics = asRecord(getCaseInsensitive(facts, "metrics"));
  const definitions: CommonMetricDefinition[] = [
    {
      matches: (value: string) => /總用電|用電量|耗電|能耗/i.test(value),
      paths: [
        "periodEnergyTotalKwh",
        "totalConsumptionKwh",
        "totalConsumptionKwh30d",
      ],
      label: "總用電",
      unit: "kWh",
      pathLabels: {
        periodEnergyTotalKwh: "指定期間總用電",
      },
    },
    {
      matches: (value: string) => /功率因數|功因/i.test(value),
      paths: ["averagePowerFactor", "avgPowerFactor"],
      label: "平均功率因數",
      unit: "",
    },
    {
      matches: (value: string) =>
        /告警.*(?:幾|多少|數量)|(?:幾|多少).*告警/i.test(value),
      paths: ["totalAlertCount30d", "todayAlertCount", "highPriorityCount"],
      label: "告警數",
      unit: "筆",
    },
    {
      matches: (value: string) =>
        /場域.*(?:幾|多少|數量)|(?:幾|多少).*場域/i.test(value),
      paths: ["siteCount"],
      label: "可比較場域",
      unit: "個",
    },
    {
      matches: (value: string) =>
        matchesEnmsChatSemanticRoute("efficiency_advice", value),
      paths: [
        "quickWinSavingNtd",
        "yearlyAvoidedCostNtd",
        "quickWinSavingKwh",
      ],
      label: "5% what-if 年化金額",
      unit: "NTD",
      pathLabels: {
        quickWinSavingKwh: "5% what-if 年化節電量",
      },
      pathUnits: {
        quickWinSavingKwh: "kWh",
      },
      fallbackFromOpportunities: true,
    },
  ];
  const matchingDefinitions = definitions.filter((item) => item.matches(message));
  if (matchingDefinitions.length === 0) {
    return null;
  }

  for (const definition of matchingDefinitions) {
    for (const path of definition.paths) {
      const value = getNumber(metrics, path);
      if (value !== null) {
        const label = definition.pathLabels?.[path] ?? definition.label;
        const unit = definition.pathUnits?.[path] ?? definition.unit;
        const chartUnit = unit || (/功率因數|功因/.test(label) ? "pf" : "");
        const matchedFactPath = `facts.metrics.${path}`;
        return {
          answerKind: "metric",
          matchedFactPaths: [matchedFactPath],
          blocks: isChartRequested(message)
            ? [
              buildMetricChartBlock(
                label,
                chartUnit,
                matchedFactPath,
                  [
                    {
                      label,
                      value,
                      tone: /功率因數|功因/.test(label) ? "green" : "blue",
                    },
                  ],
                ),
              ]
            : [],
          text: [
            `${label}：${formatNumber(value, unit)}。`,
            /功率因數|功因/.test(label)
              ? `口徑範圍：${resolvePowerFactorScopeLabel(context)}。`
              : "",
            `資料時間範圍：${sanitizeText(context.evidence?.timeRange) || "EnMS 未提供"}。`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        };
      }
    }
  }

  const opportunityDefinition = matchingDefinitions.find(
    (definition) => definition.fallbackFromOpportunities,
  );
  if (opportunityDefinition) {
    const opportunityAnswer = answerEfficiencyOpportunities(message, context, facts);
    if (opportunityAnswer) {
      return opportunityAnswer;
    }
  }

  return buildMissingAnswer(context, matchingDefinitions[0].label);
}

function answerEfficiencyOpportunities(
  message: string,
  context: EnmsScopedAnswerContext,
  facts: Record<string, unknown>,
): EnmsScopedAnswerResult | null {
  if (!matchesEnmsChatSemanticRoute("efficiency_advice", message)) {
    return null;
  }

  const opportunities = getCaseInsensitive(facts, "opportunities");
  if (!Array.isArray(opportunities)) {
    return null;
  }

  const lines = opportunities
    .map(asRecord)
    .map((item) => {
      const name = sanitizeText(getCaseInsensitive(item, "name"));
      const note = sanitizeText(getCaseInsensitive(item, "note"));
      const value = getNumber(item, "value");
      const score = value === null ? "" : `（指標分數 ${formatNumber(value)}）`;
      return [name ? `${name}${score}` : "", note].filter(Boolean).join("：");
    })
    .filter(Boolean)
    .slice(0, 3);
  if (lines.length === 0) {
    return null;
  }

  return {
    answerKind: "summary",
    matchedFactPaths: ["facts.opportunities"],
    text: [
      `可驗證節能線索與建議：\n${lines.map((item) => `- ${item}`).join("\n")}`,
      `資料時間範圍：${sanitizeText(context.evidence?.timeRange) || "EnMS 未提供"}。`,
    ].join("\n\n"),
  };
}

function answerCard(
  message: string,
  context: EnmsScopedAnswerContext,
): EnmsScopedAnswerResult | null {
  const normalizedMessage = message.toLowerCase();
  const card = (context.cards ?? []).find((candidate) => {
    const label = sanitizeText(candidate.label).toLowerCase();
    const key = sanitizeText(candidate.key).toLowerCase();
    return (
      (label.length >= 2 && normalizedMessage.includes(label)) ||
      (key.length >= 3 && normalizedMessage.includes(key))
    );
  });
  if (!card?.label || !card.value) {
    return null;
  }

  return {
    answerKind: "metric",
    matchedFactPaths: [`cards.${card.key ?? card.label}`],
    text: `${sanitizeText(card.label)}：${sanitizeText(card.value)}${card.unit ? ` ${sanitizeText(card.unit)}` : ""}${card.note ? `（${sanitizeText(card.note)}）` : ""}`,
  };
}

function getObligationDisplayName(key: string): string {
  switch (key) {
    case "latest_data":
      return "最新資料時間";
    case "data_coverage":
      return "資料收集天數 / 覆蓋範圍";
    case "site_metadata":
      return "案場 / 場域資訊";
    case "device_lookup":
      return "設備 / 電表對應";
    case "daily_consumption_point":
      return "每日用電量";
    case "period_energy_total":
      return "指定期間總用電";
    case "total_energy_30d":
      return "最近 30 天總用電";
    case "same_slot_demand":
      return "同時段需量";
    case "daily_peak_demand_point":
      return "指定日期最高需量";
    case "today_demand_point":
      return "最新資料日 24 小時需量";
    case "monthly_peak_demand_point":
      return "本月最高需量";
    case "peak_demand_30d":
      return "最高需量 / 契約風險";
    case "forecast_readiness":
      return "Forecast 準備度";
    case "anomaly_deviation_point":
      return "異常最大偏離點";
    case "anomaly_summary":
    case "anomaly_root_cause":
      return "異常根因摘要";
    case "avg_power_factor_30d":
    case "efficiency_power_factor":
      return "功率因數";
    case "site_benchmarking":
      return "多場域比較";
    case "meter_ranking":
      return "迴路 / 電表用電排行";
    case "billing":
      return "電費 / 帳單";
    case "carbon_emission":
      return "碳排放";
    case "efficiency_summary":
    case "efficiency_advice":
      return "節能 / 能效建議";
    case "alert_governance":
      return "Alert 智能治理";
    default:
      return "EnMS 指標";
  }
}

function buildFocusedObligationQuestion(message: string, key: string): string {
  const suffixByKey: Record<string, string> = {
    latest_data: "最新資料時間",
    data_coverage: "資料涵蓋天數 資料起訖",
    site_metadata: "目前案場 場域 公司",
    device_lookup: "設備 電表 迴路 對應",
    daily_consumption_point: "每日用電量 kWh",
    period_energy_total: "指定月份 總用電 kWh",
    total_energy_30d: "最近 30 天總用電 kWh",
    same_slot_demand: "同時段需量 kW",
    daily_peak_demand_point: "指定日期最高需量 kW",
    today_demand_point: "最新資料日 24 小時需量 kW",
    monthly_peak_demand_point: "本月最高需量 kW",
    peak_demand_30d: "最高需量 契約容量 超約 kW",
    forecast_readiness: "Forecast 準備度",
    anomaly_deviation_point: "異常最大偏離點 實際值 基準 差值 百分比",
    anomaly_summary: "異常根因摘要",
    anomaly_root_cause: "異常根因摘要",
    avg_power_factor_30d: "平均功率因數 低功因",
    efficiency_power_factor: "能效分頁 平均功率因數",
    site_benchmarking: "多場域 比較 排名 kWh",
    meter_ranking: "迴路 電表 用電排行 kWh",
    billing: "電費 帳單 費率",
    carbon_emission: "碳排放 kgCO2e",
    efficiency_summary: "能效 節能 摘要",
    efficiency_advice: "節能建議 最浪費 改善機會",
    alert_governance: "Alert 告警治理",
  };
  const suffix = suffixByKey[key];
  return suffix ? `${message}\n${suffix}` : message;
}

function answerForExplicitObligation(
  key: string,
  message: string,
  context: EnmsScopedAnswerContext,
  facts: Record<string, unknown>,
  scope?: EnmsScopedAnswerScope,
): EnmsScopedAnswerResult | null {
  const focusedMessage = buildFocusedObligationQuestion(message, key);
  switch (key) {
    case "latest_data":
      return answerLatestDataAt(focusedMessage, context, facts);
    case "data_coverage":
      return answerDataCoverage(focusedMessage, context, facts);
    case "site_metadata":
      return answerSiteMetadata(focusedMessage, context, facts);
    case "device_lookup":
      return answerDeviceLookup(focusedMessage, context, facts);
    case "daily_consumption_point":
      return answerDailyConsumptionPoint(focusedMessage, context);
    case "period_energy_total":
    case "total_energy_30d":
      return answerCommonMetric(focusedMessage, context, facts);
    case "same_slot_demand":
    case "today_demand_point":
    case "peak_demand_30d":
    case "forecast_readiness":
      return answerDemand(focusedMessage, context, facts);
    case "daily_peak_demand_point":
    case "monthly_peak_demand_point":
      return answerDailyPeakDemandPoint(focusedMessage, context) ??
        answerDemand(focusedMessage, context, facts);
    case "anomaly_deviation_point":
      return answerAnomalyDeviationPoint(context, facts);
    case "anomaly_summary":
    case "anomaly_root_cause":
      return answerCommonMetric(focusedMessage, context, facts) ??
        answerCard(focusedMessage, context);
    case "avg_power_factor_30d":
    case "efficiency_power_factor":
      return answerCommonMetric(focusedMessage, context, facts);
    case "site_benchmarking":
      return answerRanking(focusedMessage, context, facts, {
        allowMeterRanking: false,
        allowSiteRanking: true,
        forceRanking: true,
      });
    case "meter_ranking":
      return answerRanking(focusedMessage, context, facts, {
        allowMeterRanking: true,
        allowSiteRanking: false,
        forceRanking: true,
      });
    case "billing":
      return answerBilling(focusedMessage, context, facts);
    case "carbon_emission":
    case "efficiency_summary":
    case "efficiency_advice":
      return answerCommonMetric(focusedMessage, context, facts) ??
        answerEfficiencyOpportunities(focusedMessage, context, facts);
    case "alert_governance":
      return answerCommonMetric(focusedMessage, context, facts) ??
        answerCard(focusedMessage, context);
    default:
      return scope ? answerAccount(focusedMessage, context, facts, scope) : null;
  }
}

function buildExplicitObligationAnswer(
  message: string,
  context: EnmsScopedAnswerContext,
  facts: Record<string, unknown>,
  chatPlan: EnmsScopedAnswerChatPlan | null | undefined,
  scope?: EnmsScopedAnswerScope,
): EnmsScopedAnswerResult | null {
  const obligationKeys = collectPlanAnswerObligationKeys(chatPlan);
  if (obligationKeys.length <= 1) {
    return null;
  }

  const answers: Array<{
    key: string;
    answer: EnmsScopedAnswerResult;
  }> = [];
  const usedText = new Set<string>();
  for (const key of obligationKeys.slice(0, 6)) {
    const answer = answerForExplicitObligation(
      key,
      message,
      context,
      facts,
      scope,
    );
    if (!answer || answer.answerKind === "missing") {
      continue;
    }
    const normalizedText = answer.text.replace(/\s+/g, " ").trim();
    if (!normalizedText || usedText.has(normalizedText)) {
      continue;
    }
    usedText.add(normalizedText);
    answers.push({ key, answer });
  }

  if (answers.length <= 1) {
    return answers[0]?.answer ?? null;
  }

  return {
    answerKind: "summary",
    matchedFactPaths: Array.from(
      new Set(answers.flatMap((item) => item.answer.matchedFactPaths)),
    ),
    blocks: answers.flatMap((item) => item.answer.blocks ?? []).slice(0, 4),
    text: [
      "我依照 EnMS 授權資料，逐項回答：",
      ...answers.map(({ key, answer }) => {
        const compactText = answer.text.replace(/\n{2,}/g, "\n");
        return `【${getObligationDisplayName(key)}】\n${compactText}`;
      }),
    ].join("\n\n"),
  };
}

export function buildEnmsScopedAnswer(params: {
  message: string;
  context: EnmsScopedAnswerContext;
  scope?: EnmsScopedAnswerScope;
  chatPlan?: EnmsScopedAnswerChatPlan | null;
}): EnmsScopedAnswerResult {
  const message = sanitizeText(params.message);
  const facts = asRecord(params.context.facts);
  const obligationKeys = collectPlanObligationKeys(params.chatPlan);
  const canUse = (keys: string[]) => allowsObligation(obligationKeys, keys);
  const hasExplicitObligations = obligationKeys.size > 0;
  const allowMeterRanking =
    !hasExplicitObligations || canUse(["meter_ranking"]);
  const allowSiteRanking =
    !hasExplicitObligations || canUse(["site_benchmarking"]);
  const dataCoverageAnswer = canUse(["data_coverage"])
    ? answerDataCoverage(message, params.context, facts)
    : null;
  const latestDataAnswer = canUse(["latest_data"])
    ? answerLatestDataAt(message, params.context, facts)
    : null;
  const timeRangeAnswer = latestDataAnswer
    ? null
    : canUse(["latest_data", "data_coverage"])
      ? answerTimeRange(message, params.context)
      : null;
  const siteMetadataAnswer = canUse(["site_metadata"])
    ? answerSiteMetadata(message, params.context, facts)
    : null;

  if (params.context.status !== "ready") {
    if (params.context.status === "empty" && siteMetadataAnswer) {
      return siteMetadataAnswer;
    }

    if (params.context.status === "empty" && latestDataAnswer) {
      return latestDataAnswer;
    }

    if (params.context.status === "empty" && dataCoverageAnswer) {
      return dataCoverageAnswer;
    }

    return buildMissingAnswer(
      params.context,
      inferMissingSubject(message, params.context),
    );
  }

  const requestedAccount = findRequestedAccountNumber(message);
  if (requestedAccount) {
    const availableAccounts = Array.from(collectAccountNumbers(facts)).map(
      normalizeAccountNumber,
    );
    if (!availableAccounts.includes(requestedAccount)) {
      return buildMissingAnswer(
        params.context,
        `電號 ${requestedAccount} 的可驗證`,
      );
    }
  }

  const requestedDate = findRequestedDateToken(message);
  if (
    requestedDate &&
    !scopedContextCoversDate(params.context, requestedDate)
  ) {
    return buildMissingAnswer(
      params.context,
      `${requestedDate} 時間範圍的可驗證`,
    );
  }

  const explicitObligationAnswer = buildExplicitObligationAnswer(
    message,
    params.context,
    facts,
    params.chatPlan,
    params.scope,
  );
  if (explicitObligationAnswer) {
    return explicitObligationAnswer;
  }

  const answers = [
    canUse(["billing"]) ? answerBilling(message, params.context, facts) : null,
    dataCoverageAnswer,
    siteMetadataAnswer,
    canUse(["device_lookup"])
      ? answerDeviceLookup(message, params.context, facts)
      : null,
    canUse(["daily_consumption_point"])
      ? answerDailyConsumptionPoint(message, params.context)
      : null,
    canUse(["daily_peak_demand_point", "monthly_peak_demand_point"])
      ? answerDailyPeakDemandPoint(message, params.context)
      : null,
    canUse(["anomaly_deviation_point"])
      ? answerAnomalyDeviationPoint(params.context, facts)
      : null,
    canUse(["meter_ranking", "site_benchmarking"])
      ? answerRanking(message, params.context, facts, {
        allowMeterRanking,
        allowSiteRanking,
        forceRanking: hasExplicitObligations,
      })
      : null,
    canUse([
      "peak_demand_30d",
      "same_slot_demand",
      "today_demand_point",
      "daily_peak_demand_point",
      "monthly_peak_demand_point",
      "forecast_readiness",
    ])
      ? answerDemand(message, params.context, facts)
      : null,
    timeRangeAnswer,
    latestDataAnswer,
    obligationKeys.size === 0
      ? answerAccount(message, params.context, facts, params.scope)
      : null,
    canUse(["efficiency_summary", "efficiency_advice"])
      ? answerEfficiencyOpportunities(message, params.context, facts)
      : null,
    canUse([
      "total_energy_30d",
      "period_energy_total",
      "avg_power_factor_30d",
      "efficiency_power_factor",
      "carbon_emission",
      "efficiency_summary",
      "efficiency_advice",
    ])
      ? answerCommonMetric(message, params.context, facts)
      : null,
    obligationKeys.size === 0 ? answerCard(message, params.context) : null,
  ].filter((answer): answer is EnmsScopedAnswerResult => answer !== null);
  const answer =
    answers.find((candidate) => candidate.answerKind !== "missing") ??
    answers[0];
  if (answer) {
    return answer;
  }

  const summary = sanitizeText(params.context.analysis?.summary);
  const findings = (params.context.analysis?.findings ?? [])
    .map(sanitizeText)
    .filter(Boolean)
    .slice(0, 4);
  if (!summary && findings.length === 0) {
    return buildMissingAnswer(
      params.context,
      inferMissingSubject(message, params.context),
    );
  }

  return {
    answerKind: "summary",
    matchedFactPaths: [
      ...(summary ? ["analysis.summary"] : []),
      ...(findings.length > 0 ? ["analysis.findings"] : []),
    ],
    text: [
      summary,
      findings.length > 0
        ? `可驗證發現：\n${findings.map((item) => `- ${item}`).join("\n")}`
        : "",
      "若要查指定日期、電號或明細數值，EnMS API 必須在同一授權範圍提供對應 facts；EnClaw 不會改查全域資料補答案。",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
