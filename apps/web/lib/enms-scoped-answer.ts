import { matchesEnmsChatSemanticRoute } from "./enms-capability-registry";

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

export type EnmsScopedAnswerResult = {
  text: string;
  answerKind:
    | "billing"
    | "demand"
    | "ranking"
    | "account"
    | "time_range"
    | "metric"
    | "summary"
    | "missing";
  matchedFactPaths: string[];
};

type NamedValue = {
  name: string;
  value: number | null;
  note: string;
};

const NUMBER_FORMAT = new Intl.NumberFormat("zh-TW", {
  maximumFractionDigits: 3,
});

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

function readNamedValues(value: unknown): NamedValue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): NamedValue | null => {
      const record = asRecord(item);
      const name =
        sanitizeText(getCaseInsensitive(record, "name")) ||
        sanitizeText(getCaseInsensitive(record, "label"));
      const rawValue = getCaseInsensitive(record, "value");
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
  const missing = (context.missingData ?? [])
    .map((item) => sanitizeText(item.message))
    .filter(Boolean)
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

function answerBilling(
  message: string,
  context: EnmsScopedAnswerContext,
  facts: Record<string, unknown>,
): EnmsScopedAnswerResult | null {
  if (!/帳單|電費|費率|平均電價|應繳|billing/i.test(message)) {
    return null;
  }

  const metrics = asRecord(getCaseInsensitive(facts, "metrics"));
  const month = getText(metrics, "latestBillMonth");
  const amount = getNumber(metrics, "latestBillAmountNtd");
  const usage = getNumber(metrics, "latestBillUsageKwh");
  const averageRate = getNumber(metrics, "averageRateNtdPerKwh");
  const matchedFactPaths: string[] = [];
  const lines: string[] = [];

  if (month) {
    lines.push(`最近一期帳單月份：${month}`);
    matchedFactPaths.push("facts.metrics.latestBillMonth");
  }
  if (amount !== null) {
    lines.push(`最近一期應繳金額：${formatNumber(amount, "NTD")}`);
    matchedFactPaths.push("facts.metrics.latestBillAmountNtd");
  }
  if (usage !== null) {
    lines.push(`最近一期用電量：${formatNumber(usage, "kWh")}`);
    matchedFactPaths.push("facts.metrics.latestBillUsageKwh");
  }
  if (averageRate !== null) {
    lines.push(`本次分析採用平均電價：${formatNumber(averageRate, "NTD/kWh")}`);
    matchedFactPaths.push("facts.metrics.averageRateNtdPerKwh");
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
      label: "預測尖峰需量",
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
        ? `預測尖峰高於契約容量 ${formatNumber(projectedPeak - contractCapacity, "kW")}，存在超約風險。`
        : `預測尖峰仍低於契約容量 ${formatNumber(contractCapacity - projectedPeak, "kW")}。`
      : "";

  return {
    answerKind: "demand",
    matchedFactPaths: available.map(
      (definition) => `facts.metrics.${definition.path}`,
    ),
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
): EnmsScopedAnswerResult | null {
  if (!/排名|排行|最高|最低|最耗電|場域比較|哪個場域|哪個迴路/i.test(message)) {
    return null;
  }

  const sources: Array<{ path: string; values: NamedValue[] }> = [
    {
      path: "facts.siteRankings",
      values: readNamedValues(getCaseInsensitive(facts, "siteRankings")),
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
  for (const series of context.chartSeries ?? []) {
    if (/ranking|排行|排名/i.test(series.key ?? series.label ?? "")) {
      sources.push({
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

  const source = sources.find((candidate) => candidate.values.length > 0);
  if (!source) {
    return buildMissingAnswer(context, "排名");
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

  return {
    answerKind: "ranking",
    matchedFactPaths: [source.path],
    text: [
      selected
        .map((item, index) => {
          const rank = requestedRank ? startIndex + 1 : index + 1;
          const value =
            item.value === null
              ? "數值未提供"
              : NUMBER_FORMAT.format(item.value);
          return `#${rank} ${item.name}：${value}${item.note ? `（${item.note}）` : ""}`;
        })
        .join("\n"),
      `排名時間範圍：${sanitizeText(context.evidence?.timeRange) || "EnMS 未提供"}`,
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

function answerLatestDataAt(
  message: string,
  context: EnmsScopedAnswerContext,
  facts: Record<string, unknown>,
): EnmsScopedAnswerResult | null {
  if (
    !/最新.*(?:資料|一筆|時間)|最後一筆|最近一筆|更新到|資料.*(?:到|截至)|幾月幾號/i.test(
      message,
    )
  ) {
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

function answerCommonMetric(
  message: string,
  context: EnmsScopedAnswerContext,
  facts: Record<string, unknown>,
): EnmsScopedAnswerResult | null {
  const metrics = asRecord(getCaseInsensitive(facts, "metrics"));
  const definitions = [
    {
      matches: (value: string) => /總用電|用電量|耗電|能耗/i.test(value),
      paths: ["totalConsumptionKwh", "totalConsumptionKwh30d"],
      label: "總用電",
      unit: "kWh",
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
      paths: ["quickWinSavingNtd", "yearlyAvoidedCostNtd"],
      label: "預估年節省",
      unit: "NTD",
    },
  ];
  const definition = definitions.find((item) => item.matches(message));
  if (!definition) {
    return null;
  }

  for (const path of definition.paths) {
    const value = getNumber(metrics, path);
    if (value !== null) {
      return {
        answerKind: "metric",
        matchedFactPaths: [`facts.metrics.${path}`],
        text: `${definition.label}：${formatNumber(value, definition.unit)}。\n\n資料時間範圍：${sanitizeText(context.evidence?.timeRange) || "EnMS 未提供"}。`,
      };
    }
  }

  return buildMissingAnswer(context, definition.label);
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

export function buildEnmsScopedAnswer(params: {
  message: string;
  context: EnmsScopedAnswerContext;
  scope?: EnmsScopedAnswerScope;
}): EnmsScopedAnswerResult {
  const message = sanitizeText(params.message);
  const facts = asRecord(params.context.facts);
  const latestDataAnswer = answerLatestDataAt(message, params.context, facts);

  if (params.context.status !== "ready") {
    if (params.context.status === "empty" && latestDataAnswer) {
      return latestDataAnswer;
    }

    return buildMissingAnswer(params.context, "本題");
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

  const answer =
    answerBilling(message, params.context, facts) ||
    answerDemand(message, params.context, facts) ||
    answerRanking(message, params.context, facts) ||
    latestDataAnswer ||
    answerAccount(message, params.context, facts, params.scope) ||
    answerTimeRange(message, params.context) ||
    answerCommonMetric(message, params.context, facts) ||
    answerCard(message, params.context);
  if (answer) {
    return answer;
  }

  const summary = sanitizeText(params.context.analysis?.summary);
  const findings = (params.context.analysis?.findings ?? [])
    .map(sanitizeText)
    .filter(Boolean)
    .slice(0, 4);
  if (!summary && findings.length === 0) {
    return buildMissingAnswer(params.context, "本題");
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
