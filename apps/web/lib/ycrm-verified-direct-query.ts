import type { YcrmPlannerPreflight } from "./ycrm-context-builder";
import { getYcrmPostgresConnectionString } from "./domain-db-config";
import { duckdbQueryExternalPgAsyncDetailed } from "./workspace";

type YcrmCountRow = {
  total_count?: number | string;
};

type YcrmOverviewRow = {
  category?: string | null;
  count?: number | string | null;
};

type YcrmOpportunityStageRow = {
  stage?: string | null;
  total_count?: number | string | null;
};

type YcrmTaskStatusRow = {
  status?: string | null;
  total_count?: number | string | null;
};

type YcrmTaskDueRow = {
  due_status?: string | null;
  total_count?: number | string | null;
};

type YcrmOpportunityAmountTrendRow = {
  month?: string | null;
  currency?: string | null;
  total_amount?: number | string | null;
};

type YcrmOpportunityAmountTrendAvailabilityRow = {
  requested_window_start?: string | null;
  requested_window_end?: string | null;
  earliest_created_at?: string | null;
  latest_created_at?: string | null;
  fallback_window_start?: string | null;
  fallback_window_end?: string | null;
  rows_in_requested_window?: number | string | null;
};

type YcrmOpportunityStageAmountRow = {
  stage?: string | null;
  currency?: string | null;
  total_amount?: number | string | null;
};

export type YcrmVerifiedDirectQueryInput = {
  userMessage: string;
  planner: YcrmPlannerPreflight;
};

type YcrmCountTarget = {
  label: string;
  tableName: "company" | "person" | "opportunity" | "workspaceMember";
  key:
    | "company_count"
    | "person_count"
    | "opportunity_count"
    | "workspace_member_count";
  noun: string;
};

type YcrmOverviewTarget = {
  label: string;
};

type YcrmOpportunityStageTarget = {
  label: string;
};

type YcrmTaskStatusTarget = {
  label: string;
};

type YcrmTaskDueTarget = {
  label: string;
};

type YcrmOpportunityAmountTrendTarget = {
  label: string;
  grain: "day" | "month";
  startSql: string;
  endSql: string;
};

type YcrmOpportunityStageAmountTarget = {
  label: string;
};

function includesAny(message: string, keywords: string[]) {
  return keywords.some((keyword) => message.includes(keyword.toLowerCase()));
}

function extractRecentDayWindow(message: string): number | null {
  const match = message.match(/(?:最近|近)\s*(\d{1,3})\s*(?:天|日)/);
  if (!match) {
    return null;
  }
  const days = Number(match[1]);
  return Number.isFinite(days) && days > 0 ? days : null;
}

function extractGregorianYear(message: string): number | null {
  const match = message.match(/\b(20\d{2})\b/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
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

function asksCount(message: string): boolean {
  return includesAny(message, [
    "多少",
    "幾個",
    "幾家",
    "幾位",
    "幾筆",
    "數量",
    "總數",
    "count",
  ]);
}

function detectYcrmCountTarget(
  normalizedMessage: string,
  planner: YcrmPlannerPreflight,
): YcrmCountTarget | null {
  if (
    planner.intent === "product_help" ||
    planner.intent === "write_intent" ||
    planner.intent === "cross_system_request" ||
    planner.intent === "unknown"
  ) {
    return null;
  }

  if (!asksCount(normalizedMessage)) {
    return null;
  }

  if (includesAny(normalizedMessage, ["工作區成員", "成員", "workspacemember", "workspace member", "業務"])) {
    return {
      label: "工作區成員",
      tableName: "workspaceMember",
      key: "workspace_member_count",
      noun: "位工作區成員",
    };
  }

  if (includesAny(normalizedMessage, ["聯絡人", "person", "contact"])) {
    return {
      label: "聯絡人",
      tableName: "person",
      key: "person_count",
      noun: "位聯絡人",
    };
  }

  if (includesAny(normalizedMessage, ["商機", "opportunity", "pipeline"])) {
    return {
      label: "商機",
      tableName: "opportunity",
      key: "opportunity_count",
      noun: "筆商機",
    };
  }

  if (includesAny(normalizedMessage, ["客戶", "公司", "customer", "account", "company"])) {
    return {
      label: "客戶公司",
      tableName: "company",
      key: "company_count",
      noun: "家客戶公司",
    };
  }

  return null;
}

function detectYcrmOverviewTarget(
  normalizedMessage: string,
  planner: YcrmPlannerPreflight,
): YcrmOverviewTarget | null {
  if (
    planner.intent === "product_help" ||
    planner.intent === "write_intent" ||
    planner.intent === "cross_system_request" ||
    planner.intent === "unknown"
  ) {
    return null;
  }

  const overviewHints = includesAny(normalizedMessage, [
    "總覽",
    "概況",
    "一覽",
    "總表",
    "overview",
    "summary",
  ]);

  const mentionsCategories = [
    "聯絡人",
    "客戶",
    "公司",
    "商機",
    "任務",
    "person",
    "company",
    "opportunity",
    "task",
  ].filter((keyword) => normalizedMessage.includes(keyword.toLowerCase())).length;

  const chartRequested = includesAny(normalizedMessage, [
    "圖表",
    "chart",
    "報表",
    "分布",
  ]);

  if (overviewHints || (mentionsCategories >= 2 && (chartRequested || asksCount(normalizedMessage)))) {
    return {
      label: "Y-CRM 核心資料總覽",
    };
  }

  return null;
}

function detectYcrmOpportunityStageTarget(
  normalizedMessage: string,
  planner: YcrmPlannerPreflight,
): YcrmOpportunityStageTarget | null {
  if (
    planner.intent === "product_help" ||
    planner.intent === "write_intent" ||
    planner.intent === "cross_system_request" ||
    planner.intent === "unknown"
  ) {
    return null;
  }

  const mentionsOpportunity = includesAny(normalizedMessage, [
    "商機",
    "opportunity",
    "pipeline",
  ]);
  const mentionsStage = includesAny(normalizedMessage, [
    "階段",
    "stage",
  ]);
  const mentionsDistribution = includesAny(normalizedMessage, [
    "分布",
    "分佈",
    "分布圖",
    "分佈圖",
    "統計",
    "總覽",
    "圖表",
    "chart",
    "pie",
    "bar",
  ]);

  if (mentionsOpportunity && mentionsStage && mentionsDistribution) {
    return {
      label: "商機階段分布",
    };
  }

  return null;
}

function detectYcrmTaskStatusTarget(
  normalizedMessage: string,
  planner: YcrmPlannerPreflight,
): YcrmTaskStatusTarget | null {
  if (
    planner.intent === "product_help" ||
    planner.intent === "write_intent" ||
    planner.intent === "cross_system_request" ||
    planner.intent === "unknown"
  ) {
    return null;
  }

  const mentionsTask = includesAny(normalizedMessage, [
    "任務",
    "task",
  ]);
  const mentionsStatus = includesAny(normalizedMessage, [
    "狀態",
    "status",
  ]);
  const mentionsDistribution = includesAny(normalizedMessage, [
    "分布",
    "分佈",
    "分布圖",
    "分佈圖",
    "統計",
    "總覽",
    "圖表",
    "chart",
    "pie",
    "bar",
  ]);

  if (mentionsTask && mentionsStatus && mentionsDistribution) {
    return {
      label: "任務狀態分布",
    };
  }

  return null;
}

function detectYcrmTaskDueTarget(
  normalizedMessage: string,
  planner: YcrmPlannerPreflight,
): YcrmTaskDueTarget | null {
  if (
    planner.intent === "product_help" ||
    planner.intent === "write_intent" ||
    planner.intent === "cross_system_request" ||
    planner.intent === "unknown"
  ) {
    return null;
  }

  const mentionsTask = includesAny(normalizedMessage, [
    "任務",
    "task",
  ]);
  const mentionsDue = includesAny(normalizedMessage, [
    "到期",
    "截止",
    "due",
    "deadline",
    "逾期",
    "delay",
    "overdue",
  ]);
  const mentionsSummary = includesAny(normalizedMessage, [
    "分布",
    "分佈",
    "統計",
    "總覽",
    "概況",
    "圖表",
    "chart",
    "bar",
    "pie",
  ]);

  if (mentionsTask && mentionsDue && mentionsSummary) {
    return {
      label: "任務到期概況",
    };
  }

  return null;
}

function detectYcrmOpportunityAmountTrendTarget(
  normalizedMessage: string,
  planner: YcrmPlannerPreflight,
): YcrmOpportunityAmountTrendTarget | null {
  if (
    planner.intent === "product_help" ||
    planner.intent === "write_intent" ||
    planner.intent === "cross_system_request" ||
    planner.intent === "unknown"
  ) {
    return null;
  }

  const mentionsOpportunity = includesAny(normalizedMessage, [
    "商機",
    "opportunity",
    "pipeline",
  ]);
  const mentionsAmount = includesAny(normalizedMessage, [
    "金額",
    "amount",
    "業績",
    "營收",
  ]);
  const mentionsStage = includesAny(normalizedMessage, [
    "階段",
    "stage",
  ]);
  const mentionsTrend = includesAny(normalizedMessage, [
    "趨勢",
    "trend",
    "每月",
    "月度",
    "monthly",
    "12個月",
    "近一年",
    "line",
    "折線",
  ]);

  if (mentionsOpportunity && mentionsAmount && mentionsTrend && !mentionsStage) {
    const recentDayWindow = extractRecentDayWindow(normalizedMessage);
    if (recentDayWindow) {
      return {
        label: `最近 ${recentDayWindow} 天商機金額趨勢`,
        grain: recentDayWindow > 92 ? "month" : "day",
        startSql: `CURRENT_DATE - INTERVAL '${recentDayWindow} days'`,
        endSql: `CURRENT_DATE + INTERVAL '1 day'`,
      };
    }

    const isoDateCandidates = extractIsoDateCandidates(normalizedMessage);
    if (isoDateCandidates.length >= 2) {
      const [startDate, endDate] = isoDateCandidates.toSorted();
      return {
        label: `${startDate} 到 ${endDate} 商機金額趨勢`,
        grain: "day",
        startSql: `DATE '${startDate}'`,
        endSql: `DATE '${endDate}' + INTERVAL '1 day'`,
      };
    }

    if (isoDateCandidates.length === 1 && includesAny(normalizedMessage, ["到今天", "至今", "到現在", "today"])) {
      const [startDate] = isoDateCandidates;
      return {
        label: `${startDate} 到今天商機金額趨勢`,
        grain: "day",
        startSql: `DATE '${startDate}'`,
        endSql: `CURRENT_DATE + INTERVAL '1 day'`,
      };
    }

    const yearMonthMatch = normalizedMessage.match(/\b(20\d{2})\s*年\s*(\d{1,2})\s*月/);
    if (yearMonthMatch && includesAny(normalizedMessage, ["到今天", "至今", "到現在", "today"])) {
      const year = Number(yearMonthMatch[1]);
      const month = Number(yearMonthMatch[2]);
      if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
        const paddedMonth = String(month).padStart(2, "0");
        return {
          label: `${year}-${paddedMonth} 起商機金額趨勢`,
          grain: "month",
          startSql: `DATE '${year}-${paddedMonth}-01'`,
          endSql: `CURRENT_DATE + INTERVAL '1 day'`,
        };
      }
    }

    const yearOnly = extractGregorianYear(normalizedMessage);
    if (yearOnly) {
      const currentYear = new Date().getFullYear();
      return {
        label: `${yearOnly} 年商機金額趨勢`,
        grain: "month",
        startSql: `DATE '${yearOnly}-01-01'`,
        endSql:
          yearOnly === currentYear && includesAny(normalizedMessage, ["到今天", "至今", "到現在", "today"])
            ? `CURRENT_DATE + INTERVAL '1 day'`
            : `DATE '${yearOnly + 1}-01-01'`,
      };
    }

    return {
      label: "最近 12 個月商機金額趨勢",
      grain: "month",
      startSql: `CURRENT_DATE - INTERVAL '12 months'`,
      endSql: `CURRENT_DATE + INTERVAL '1 day'`,
    };
  }

  return null;
}

function detectYcrmOpportunityStageAmountTarget(
  normalizedMessage: string,
  planner: YcrmPlannerPreflight,
): YcrmOpportunityStageAmountTarget | null {
  if (
    planner.intent === "product_help" ||
    planner.intent === "write_intent" ||
    planner.intent === "cross_system_request" ||
    planner.intent === "unknown"
  ) {
    return null;
  }

  const mentionsOpportunity = includesAny(normalizedMessage, [
    "商機",
    "opportunity",
    "pipeline",
  ]);
  const mentionsStage = includesAny(normalizedMessage, [
    "階段",
    "stage",
  ]);
  const mentionsAmount = includesAny(normalizedMessage, [
    "金額",
    "amount",
    "業績",
    "營收",
  ]);
  const mentionsDistribution = includesAny(normalizedMessage, [
    "分布",
    "分佈",
    "統計",
    "排行",
    "排名",
    "圖表",
    "chart",
    "bar",
  ]);

  if (mentionsOpportunity && mentionsStage && mentionsAmount && mentionsDistribution) {
    return {
      label: "各階段商機金額分布",
    };
  }

  return null;
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-TW").format(value);
}

function formatDecimal(value: number): string {
  return new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTime(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "UNKNOWN";
}

const YCRM_REPORT_METADATA = {
  sourceDomain: "ycrm",
  sourceKind: "verified_direct",
  verifiedBy: "ycrm-verified-direct-query",
} as const;

function buildYcrmCountReport(
  workspaceId: string,
  target: YcrmCountTarget,
  row: YcrmCountRow | undefined,
): string {
  const totalCount = toNumber(row?.total_count);
  const chartRows = [
    {
      category: target.label,
      total_count: totalCount,
    },
  ];

  return [
    `根據本地 Y-CRM DB 工作區 ${workspaceId} 的 ${target.tableName} 查詢，目前共有 ${formatNumber(totalCount)} ${target.noun}。`,
    "",
    `查詢依據：ycrm.${workspaceId}.${target.tableName}，只統計 "deletedAt" IS NULL 的有效資料列。此回答只使用本地 Y-CRM DB，不使用外部網路資料。`,
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        ...YCRM_REPORT_METADATA,
        title: `Y-CRM 目前${target.label}總數`,
        description: `工作區 ${workspaceId} 的 ${target.label}總數為 ${formatNumber(totalCount)}。`,
        panels: [
          {
            id: `${target.key}-bar`,
            title: `${target.label}總數圖表`,
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

function buildYcrmOverviewReport(
  workspaceId: string,
  target: YcrmOverviewTarget,
  rows: YcrmOverviewRow[],
): string {
  const normalizedRows = rows.map((row) => ({
    category: row.category?.trim() || "未命名類別",
    count: toNumber(row.count),
  }));

  if (normalizedRows.length === 0) {
    return [
      `我判斷這是 Y-CRM ${target.label}查詢，已優先查本地 Y-CRM DB，但目前沒有可聚合的核心資料列。`,
      `查詢依據：ycrm.${workspaceId}.person / company / opportunity / task，並只統計 "deletedAt" IS NULL 的有效資料列。因為沒有足夠資料，我不會輸出空圖表。`,
    ].join("\n");
  }

  const summaryMap = new Map(
    normalizedRows.map((row) => [row.category, row.count] as const),
  );

  return [
    `根據本地 Y-CRM DB 工作區 ${workspaceId} 的核心資料查詢，目前聯絡人 ${formatNumber(summaryMap.get("聯絡人") ?? 0)} 位、客戶公司 ${formatNumber(summaryMap.get("公司") ?? 0)} 家、商機 ${formatNumber(summaryMap.get("商機") ?? 0)} 筆、任務 ${formatNumber(summaryMap.get("任務") ?? 0)} 筆。`,
    "",
    `查詢依據：ycrm.${workspaceId}.person / company / opportunity / task，並只統計 "deletedAt" IS NULL 的有效資料列。此回答只使用本地 Y-CRM DB，不使用外部網路資料。`,
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        ...YCRM_REPORT_METADATA,
        title: target.label,
        description: `工作區 ${workspaceId} 的聯絡人、客戶公司、商機與任務總數。`,
        panels: [
          {
            id: "ycrm-overview-counts",
            title: "Y-CRM 核心資料總覽",
            type: "bar",
            rows: normalizedRows,
            mapping: {
              xAxis: "category",
              yAxis: ["count"],
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

function stageLabel(stage: string): string {
  const STAGE_LABELS: Record<string, string> = {
    OPT0_XU_QIU_QUE_REN: "需求確認",
    OPT1_ZHUN_BEI_TI_AN: "準備提案",
    OPT2_YI_BAO_JIA: "已報價",
    OPT4_HE_YUE_QIAN_SHU_ZHONG: "合約簽署中",
    OPT5_YI_CHENG_JIAO_CLOSED_WON: "已成交",
    OPT6_WEI_CHENG_JIAO_CLOSED_LOST: "未成交",
  };
  return STAGE_LABELS[stage] ?? stage;
}

function taskStatusLabel(status: string): string {
  const STATUS_LABELS: Record<string, string> = {
    TODO: "待辦",
    JIN_XING_ZHONG: "進行中",
    YI_WAN_CHENG: "已完成",
    SHANG_WEI_ZHI_PAI: "尚未指派",
    UNKNOWN: "無狀態",
  };
  return STATUS_LABELS[status] ?? status;
}

function buildYcrmOpportunityStageReport(
  workspaceId: string,
  target: YcrmOpportunityStageTarget,
  rows: YcrmOpportunityStageRow[],
): string {
  const normalizedRows = rows.map((row) => ({
    stage: stageLabel(row.stage?.trim() || "UNKNOWN"),
    total_count: toNumber(row.total_count),
  }));

  if (normalizedRows.length === 0) {
    return [
      `我判斷這是 Y-CRM ${target.label}查詢，已優先查本地 Y-CRM DB，但目前沒有可聚合的商機階段資料列。`,
      `查詢依據：ycrm.${workspaceId}.opportunity.stage，並只統計 "deletedAt" IS NULL 的有效資料列。因為沒有足夠資料，我不會輸出空圖表。`,
    ].join("\n");
  }

  const summaryLines = normalizedRows.map((row) => {
    return `${row.stage}：${formatNumber(row.total_count)} 筆`;
  });

  return [
    `根據本地 Y-CRM DB 工作區 ${workspaceId} 的 opportunity 查詢，目前 ${target.label}如下。`,
    "",
    ...summaryLines,
    "",
    `查詢依據：ycrm.${workspaceId}.opportunity.stage，並只統計 "deletedAt" IS NULL 的有效資料列。此回答只使用本地 Y-CRM DB，不使用外部網路資料。`,
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        ...YCRM_REPORT_METADATA,
        title: `Y-CRM ${target.label}`,
        description: `工作區 ${workspaceId} 的商機依 stage 聚合分布。`,
        panels: [
          {
            id: "ycrm-opportunity-stage-distribution",
            title: "商機階段分布",
            type: "bar",
            rows: normalizedRows,
            mapping: {
              xAxis: "stage",
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

function buildYcrmTaskStatusReport(
  workspaceId: string,
  target: YcrmTaskStatusTarget,
  rows: YcrmTaskStatusRow[],
): string {
  const normalizedRows = rows.map((row) => ({
    status: taskStatusLabel(row.status?.trim() || "UNKNOWN"),
    total_count: toNumber(row.total_count),
  }));

  if (normalizedRows.length === 0) {
    return [
      `我判斷這是 Y-CRM ${target.label}查詢，已優先查本地 Y-CRM DB，但目前沒有可聚合的任務狀態資料列。`,
      `查詢依據：ycrm.${workspaceId}.task.status，並只統計 "deletedAt" IS NULL 的有效資料列。因為沒有足夠資料，我不會輸出空圖表。`,
    ].join("\n");
  }

  const summaryLines = normalizedRows.map((row) => {
    return `${row.status}：${formatNumber(row.total_count)} 筆`;
  });

  return [
    `根據本地 Y-CRM DB 工作區 ${workspaceId} 的 task 查詢，目前 ${target.label}如下。`,
    "",
    ...summaryLines,
    "",
    `查詢依據：ycrm.${workspaceId}.task.status，並只統計 "deletedAt" IS NULL 的有效資料列。此回答只使用本地 Y-CRM DB，不使用外部網路資料。`,
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        ...YCRM_REPORT_METADATA,
        title: `Y-CRM ${target.label}`,
        description: `工作區 ${workspaceId} 的任務依 status 聚合分布。`,
        panels: [
          {
            id: "ycrm-task-status-distribution",
            title: "任務狀態分布",
            type: "bar",
            rows: normalizedRows,
            mapping: {
              xAxis: "status",
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

function buildYcrmTaskDueReport(
  workspaceId: string,
  target: YcrmTaskDueTarget,
  rows: YcrmTaskDueRow[],
): string {
  const normalizedRows = rows.map((row) => ({
    due_status: row.due_status?.trim() || "UNKNOWN",
    total_count: toNumber(row.total_count),
  }));

  if (normalizedRows.length === 0) {
    return [
      `我判斷這是 Y-CRM ${target.label}查詢，已優先查本地 Y-CRM DB，但目前沒有可聚合的任務到期資料列。`,
      `查詢依據：ycrm.${workspaceId}.task.dueAt / status，並只統計 "deletedAt" IS NULL 的有效資料列。因為沒有足夠資料，我不會輸出空圖表。`,
    ].join("\n");
  }

  const summaryLines = normalizedRows.map((row) => {
    return `${row.due_status}：${formatNumber(row.total_count)} 筆`;
  });

  return [
    `根據本地 Y-CRM DB 工作區 ${workspaceId} 的 task 查詢，目前 ${target.label}如下。`,
    "",
    ...summaryLines,
    "",
    `查詢依據：ycrm.${workspaceId}.task.dueAt / status，並只統計 "deletedAt" IS NULL 的有效資料列。若 dueAt 已過且 status 尚未完成，歸類為已逾期。此回答只使用本地 Y-CRM DB，不使用外部網路資料。`,
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        ...YCRM_REPORT_METADATA,
        title: `Y-CRM ${target.label}`,
        description: `工作區 ${workspaceId} 的任務依到期狀態聚合分布。`,
        panels: [
          {
            id: "ycrm-task-due-distribution",
            title: "任務到期概況",
            type: "bar",
            rows: normalizedRows,
            mapping: {
              xAxis: "due_status",
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

function buildYcrmOpportunityAmountTrendReport(
  workspaceId: string,
  target: YcrmOpportunityAmountTrendTarget,
  rows: YcrmOpportunityAmountTrendRow[],
): string {
  const normalizedRows = rows.map((row) => ({
    month: row.month?.trim() || "UNKNOWN",
    currency: row.currency?.trim().toUpperCase() || "UNKNOWN",
    total_amount: toNumber(row.total_amount),
  }));

  if (normalizedRows.length === 0) {
    return [
      `我判斷這是 Y-CRM ${target.label}查詢，已優先查本地 Y-CRM DB，但目前沒有可聚合的商機金額資料。`,
      `查詢依據：ycrm.${workspaceId}.opportunity.createdAt / amountAmountMicros / amountCurrencyCode，並只統計 "deletedAt" IS NULL 的有效資料列。因為沒有足夠資料，我不會輸出空圖表。`,
    ].join("\n");
  }

  const latestByCurrency = new Map<string, { month: string; total_amount: number }>();
  for (const row of normalizedRows) {
    latestByCurrency.set(row.currency, {
      month: row.month,
      total_amount: row.total_amount,
    });
  }
  const currencies = [...latestByCurrency.keys()].toSorted();
  const panels = currencies.map((currency) => ({
    id: `ycrm-opportunity-amount-trend-${currency.toLowerCase()}`,
    title: `${target.grain === "day" ? "每日" : "每月"}新增商機總金額 (${currency})`,
    type: "line" as const,
    rows: normalizedRows.filter((row) => row.currency === currency).map((row) => ({
      month: row.month,
      total_amount: row.total_amount,
    })),
    mapping: {
      xAxis: "month",
      yAxis: ["total_amount"],
    },
    size: "full" as const,
  }));
  const summaryLines = currencies.map((currency) => {
    const latest = latestByCurrency.get(currency);
    return `${currency}：最近一個${target.grain === "day" ? "區間" : "月份"} ${latest?.month || "UNKNOWN"} 的新增商機總金額為 ${formatDecimal(latest?.total_amount ?? 0)} ${currency}`;
  });

  return [
    `根據本地 Y-CRM DB 工作區 ${workspaceId} 的 opportunity 查詢，目前 ${target.label}已整理完成。`,
    "",
    `時間粒度：${target.grain === "day" ? "日" : "月"}。`,
    ...summaryLines,
    "",
    `查詢依據：ycrm.${workspaceId}.opportunity.createdAt / amountAmountMicros / amountCurrencyCode，並只統計 "deletedAt" IS NULL 的有效資料列。金額已由 micros 轉成各幣別主單位；若工作區同時存在多種幣別，我會分幣別輸出趨勢，不會混算。此回答只使用本地 Y-CRM DB，不使用外部網路資料。`,
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        ...YCRM_REPORT_METADATA,
        title: `Y-CRM ${target.label}`,
        description: `工作區 ${workspaceId} 的 ${target.label}；若存在多幣別，會分幣別呈現。`,
        panels,
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

function buildYcrmOpportunityAmountTrendNoDataReport(
  workspaceId: string,
  target: YcrmOpportunityAmountTrendTarget,
  availability: YcrmOpportunityAmountTrendAvailabilityRow | undefined,
): string {
  const requestedWindowStart = formatTime(availability?.requested_window_start);
  const requestedWindowEnd = formatTime(availability?.requested_window_end);
  const earliestCreatedAt = formatTime(availability?.earliest_created_at);
  const latestCreatedAt = formatTime(availability?.latest_created_at);
  const fallbackWindowStart = formatTime(availability?.fallback_window_start);
  const fallbackWindowEnd = formatTime(availability?.fallback_window_end);
  const requestedWindowRows = toNumber(availability?.rows_in_requested_window);

  const lines = [
    `我判斷這是 Y-CRM ${target.label}查詢，已優先查本地 Y-CRM DB，但你要求的區間目前沒有可聚合的商機金額資料。`,
    `實際查詢區間：${requestedWindowStart} 至 ${requestedWindowEnd}。`,
    `目前工作區 ${workspaceId} 的 opportunity.createdAt 可見資料時間帶為 ${earliestCreatedAt} 至 ${latestCreatedAt}；你要求的區間內資料筆數為 ${formatNumber(requestedWindowRows)}。`,
    "因此我不會輸出空圖表，也不會直接把答案改成其他區間，避免答非所問。",
    "",
    `如果你願意，我建議下一步改查最新可用區間，例如：請查 ${fallbackWindowStart} 到 ${fallbackWindowEnd} 的商機金額趨勢圖表。`,
    `查詢依據：ycrm.${workspaceId}.opportunity.createdAt / amountAmountMicros / amountCurrencyCode，並只統計 "deletedAt" IS NULL 的有效資料列。此回答只使用本地 Y-CRM DB，不使用外部網路資料。`,
  ];

  return lines.join("\n");
}

function buildYcrmOpportunityStageAmountReport(
  workspaceId: string,
  target: YcrmOpportunityStageAmountTarget,
  rows: YcrmOpportunityStageAmountRow[],
): string {
  const normalizedRows = rows.map((row) => {
    const stage = stageLabel(row.stage?.trim() || "UNKNOWN");
    const currency = row.currency?.trim().toUpperCase() || "UNKNOWN";
    return {
      stage,
      currency,
      stage_currency: `${stage} (${currency})`,
      total_amount: toNumber(row.total_amount),
    };
  });

  if (normalizedRows.length === 0) {
    return [
      `我判斷這是 Y-CRM ${target.label}查詢，已優先查本地 Y-CRM DB，但目前沒有可聚合的商機金額資料列。`,
      `查詢依據：ycrm.${workspaceId}.opportunity.stage / amountAmountMicros / amountCurrencyCode，並只統計 "deletedAt" IS NULL 的有效資料列。因為沒有足夠資料，我不會輸出空圖表。`,
    ].join("\n");
  }

  const summaryLines = normalizedRows.map((row) => {
    return `${row.stage}（${row.currency}）：${formatDecimal(row.total_amount)} ${row.currency}`;
  });

  return [
    `根據本地 Y-CRM DB 工作區 ${workspaceId} 的 opportunity 查詢，目前 ${target.label}如下。`,
    "",
    ...summaryLines,
    "",
    `查詢依據：ycrm.${workspaceId}.opportunity.stage / amountAmountMicros / amountCurrencyCode，並只統計 "deletedAt" IS NULL 的有效資料列。金額已由 micros 轉成各幣別主單位；若同時存在多種幣別，我會分幣別顯示，不會混算。此回答只使用本地 Y-CRM DB，不使用外部網路資料。`,
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        ...YCRM_REPORT_METADATA,
        title: `Y-CRM ${target.label}`,
        description: `工作區 ${workspaceId} 的商機依 stage 與幣別聚合之金額分布。`,
        panels: [
          {
            id: "ycrm-opportunity-stage-amount-distribution",
            title: "各階段商機金額分布",
            type: "bar",
            rows: normalizedRows,
            mapping: {
              xAxis: "stage_currency",
              yAxis: ["total_amount"],
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

export async function buildYcrmVerifiedDirectQueryAnswer(
  input: YcrmVerifiedDirectQueryInput,
): Promise<string | null> {
  const normalizedMessage = input.userMessage.toLowerCase();
  const opportunityAmountTrendTarget = detectYcrmOpportunityAmountTrendTarget(
    normalizedMessage,
    input.planner,
  );
  if (opportunityAmountTrendTarget) {
    if (input.planner.blockers.includes("auto_schema_missing")) {
      return null;
    }

    if (!input.planner.workspaceId || input.planner.needsWorkspaceValidation) {
      return [
        `我判斷這是 Y-CRM ${opportunityAmountTrendTarget.label}查詢，但目前還沒有確認工作區，因此不能安全查本地 Y-CRM DB。`,
        "我會先停在這裡，不會改用模型猜答案。請先明確指定或確認 Y-CRM 工作區後再查詢。",
      ].join("\n");
    }

    try {
      const result =
        await duckdbQueryExternalPgAsyncDetailed<YcrmOpportunityAmountTrendRow>(
          getYcrmPostgresConnectionString(),
          `
            SELECT
              strftime(date_trunc('${opportunityAmountTrendTarget.grain}', "createdAt"), '${opportunityAmountTrendTarget.grain === "day" ? "%Y-%m-%d" : "%Y-%m"}') AS month,
              COALESCE(NULLIF(UPPER(TRIM("amountCurrencyCode")), ''), 'UNKNOWN') AS currency,
              ROUND(COALESCE(SUM("amountAmountMicros"), 0) / 1000000.0, 2) AS total_amount
            FROM ycrm."${input.planner.workspaceId}"."opportunity"
            WHERE "deletedAt" IS NULL
              AND "createdAt" >= ${opportunityAmountTrendTarget.startSql}
              AND "createdAt" < ${opportunityAmountTrendTarget.endSql}
            GROUP BY month, currency
            ORDER BY month, currency
          `,
          "ycrm",
        );

      if (result.error) {
        throw new Error(result.error);
      }

      if (result.rows.length === 0) {
        const availabilityResult =
          await duckdbQueryExternalPgAsyncDetailed<YcrmOpportunityAmountTrendAvailabilityRow>(
            getYcrmPostgresConnectionString(),
            `
              SELECT
                CAST(CAST(${opportunityAmountTrendTarget.startSql} AS DATE) AS VARCHAR) AS requested_window_start,
                CAST(CAST((${opportunityAmountTrendTarget.endSql}) - INTERVAL '1 day' AS DATE) AS VARCHAR) AS requested_window_end,
                CAST(MIN("createdAt") AS VARCHAR) AS earliest_created_at,
                CAST(MAX("createdAt") AS VARCHAR) AS latest_created_at,
                CAST(CAST(MAX("createdAt") - (CAST(${opportunityAmountTrendTarget.endSql} AS TIMESTAMP) - CAST(${opportunityAmountTrendTarget.startSql} AS TIMESTAMP)) AS DATE) AS VARCHAR) AS fallback_window_start,
                CAST(CAST(MAX("createdAt") AS DATE) AS VARCHAR) AS fallback_window_end,
                COUNT(*) FILTER (
                  WHERE "createdAt" >= ${opportunityAmountTrendTarget.startSql}
                    AND "createdAt" < ${opportunityAmountTrendTarget.endSql}
                ) AS rows_in_requested_window
              FROM ycrm."${input.planner.workspaceId}"."opportunity"
              WHERE "deletedAt" IS NULL
            `,
            "ycrm",
          );

        if (!availabilityResult.error) {
          return buildYcrmOpportunityAmountTrendNoDataReport(
            input.planner.workspaceId,
            opportunityAmountTrendTarget,
            availabilityResult.rows[0],
          );
        }
      }

      return buildYcrmOpportunityAmountTrendReport(
        input.planner.workspaceId,
        opportunityAmountTrendTarget,
        result.rows,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown Y-CRM DB query error";
      return [
        `我判斷這是 Y-CRM ${opportunityAmountTrendTarget.label}查詢，已優先查本地 Y-CRM DB，但查詢時發生錯誤：${message}`,
        `因此我不會改用外部網路資料或推測答案。請先確認 ycrm.${input.planner.workspaceId}.opportunity 的 createdAt / amountAmountMicros 是否可讀。`,
      ].join("\n");
    }
  }

  const opportunityStageAmountTarget = detectYcrmOpportunityStageAmountTarget(
    normalizedMessage,
    input.planner,
  );
  if (opportunityStageAmountTarget) {
    if (input.planner.blockers.includes("auto_schema_missing")) {
      return null;
    }

    if (!input.planner.workspaceId || input.planner.needsWorkspaceValidation) {
      return [
        `我判斷這是 Y-CRM ${opportunityStageAmountTarget.label}查詢，但目前還沒有確認工作區，因此不能安全查本地 Y-CRM DB。`,
        "我會先停在這裡，不會改用模型猜答案。請先明確指定或確認 Y-CRM 工作區後再查詢。",
      ].join("\n");
    }

    try {
      const result =
        await duckdbQueryExternalPgAsyncDetailed<YcrmOpportunityStageAmountRow>(
          getYcrmPostgresConnectionString(),
          `
            SELECT
              COALESCE(stage, 'UNKNOWN') AS stage,
              COALESCE(NULLIF(UPPER(TRIM("amountCurrencyCode")), ''), 'UNKNOWN') AS currency,
              ROUND(COALESCE(SUM("amountAmountMicros"), 0) / 1000000.0, 2) AS total_amount
            FROM ycrm."${input.planner.workspaceId}"."opportunity"
            WHERE "deletedAt" IS NULL
            GROUP BY 1, 2
            ORDER BY total_amount DESC, stage ASC, currency ASC
          `,
          "ycrm",
        );

      if (result.error) {
        throw new Error(result.error);
      }

      return buildYcrmOpportunityStageAmountReport(
        input.planner.workspaceId,
        opportunityStageAmountTarget,
        result.rows,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown Y-CRM DB query error";
      return [
        `我判斷這是 Y-CRM ${opportunityStageAmountTarget.label}查詢，已優先查本地 Y-CRM DB，但查詢時發生錯誤：${message}`,
        `因此我不會改用外部網路資料或推測答案。請先確認 ycrm.${input.planner.workspaceId}.opportunity 的 stage / amountAmountMicros / amountCurrencyCode 是否可讀。`,
      ].join("\n");
    }
  }

  const taskDueTarget = detectYcrmTaskDueTarget(
    normalizedMessage,
    input.planner,
  );
  if (taskDueTarget) {
    if (input.planner.blockers.includes("auto_schema_missing")) {
      return null;
    }

    if (!input.planner.workspaceId || input.planner.needsWorkspaceValidation) {
      return [
        `我判斷這是 Y-CRM ${taskDueTarget.label}查詢，但目前還沒有確認工作區，因此不能安全查本地 Y-CRM DB。`,
        "我會先停在這裡，不會改用模型猜答案。請先明確指定或確認 Y-CRM 工作區後再查詢。",
      ].join("\n");
    }

    try {
      const result = await duckdbQueryExternalPgAsyncDetailed<YcrmTaskDueRow>(
        getYcrmPostgresConnectionString(),
        `
          SELECT
            CASE
              WHEN "dueAt" < CURRENT_TIMESTAMP AND COALESCE(status, 'UNKNOWN') NOT IN ('YI_WAN_CHENG', 'DONE') THEN '已逾期'
              WHEN "dueAt" IS NULL THEN '無截止日'
              WHEN COALESCE(status, 'UNKNOWN') IN ('YI_WAN_CHENG', 'DONE') THEN '已完成'
              ELSE '正常'
            END AS due_status,
            COUNT(*) AS total_count
          FROM ycrm."${input.planner.workspaceId}"."task"
          WHERE "deletedAt" IS NULL
          GROUP BY 1
          ORDER BY total_count DESC, due_status ASC
        `,
        "ycrm",
      );

      if (result.error) {
        throw new Error(result.error);
      }

      return buildYcrmTaskDueReport(
        input.planner.workspaceId,
        taskDueTarget,
        result.rows,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown Y-CRM DB query error";
      return [
        `我判斷這是 Y-CRM ${taskDueTarget.label}查詢，已優先查本地 Y-CRM DB，但查詢時發生錯誤：${message}`,
        `因此我不會改用外部網路資料或推測答案。請先確認 ycrm.${input.planner.workspaceId}.task 的 dueAt / status 是否可讀。`,
      ].join("\n");
    }
  }

  const taskStatusTarget = detectYcrmTaskStatusTarget(
    normalizedMessage,
    input.planner,
  );
  if (taskStatusTarget) {
    if (input.planner.blockers.includes("auto_schema_missing")) {
      return null;
    }

    if (!input.planner.workspaceId || input.planner.needsWorkspaceValidation) {
      return [
        `我判斷這是 Y-CRM ${taskStatusTarget.label}查詢，但目前還沒有確認工作區，因此不能安全查本地 Y-CRM DB。`,
        "我會先停在這裡，不會改用模型猜答案。請先明確指定或確認 Y-CRM 工作區後再查詢。",
      ].join("\n");
    }

    try {
      const result = await duckdbQueryExternalPgAsyncDetailed<YcrmTaskStatusRow>(
        getYcrmPostgresConnectionString(),
        `
          SELECT
            COALESCE(status, 'UNKNOWN') AS status,
            COUNT(*) AS total_count
          FROM ycrm."${input.planner.workspaceId}"."task"
          WHERE "deletedAt" IS NULL
          GROUP BY 1
          ORDER BY total_count DESC, status ASC
        `,
        "ycrm",
      );

      if (result.error) {
        throw new Error(result.error);
      }

      return buildYcrmTaskStatusReport(
        input.planner.workspaceId,
        taskStatusTarget,
        result.rows,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown Y-CRM DB query error";
      return [
        `我判斷這是 Y-CRM ${taskStatusTarget.label}查詢，已優先查本地 Y-CRM DB，但查詢時發生錯誤：${message}`,
        `因此我不會改用外部網路資料或推測答案。請先確認 ycrm.${input.planner.workspaceId}.task 是否可讀。`,
      ].join("\n");
    }
  }

  const opportunityStageTarget = detectYcrmOpportunityStageTarget(
    normalizedMessage,
    input.planner,
  );
  if (opportunityStageTarget) {
    if (input.planner.blockers.includes("auto_schema_missing")) {
      return null;
    }

    if (!input.planner.workspaceId || input.planner.needsWorkspaceValidation) {
      return [
        `我判斷這是 Y-CRM ${opportunityStageTarget.label}查詢，但目前還沒有確認工作區，因此不能安全查本地 Y-CRM DB。`,
        "我會先停在這裡，不會改用模型猜答案。請先明確指定或確認 Y-CRM 工作區後再查詢。",
      ].join("\n");
    }

    try {
      const result = await duckdbQueryExternalPgAsyncDetailed<YcrmOpportunityStageRow>(
        getYcrmPostgresConnectionString(),
        `
          SELECT
            COALESCE(stage, 'UNKNOWN') AS stage,
            COUNT(*) AS total_count
          FROM ycrm."${input.planner.workspaceId}"."opportunity"
          WHERE "deletedAt" IS NULL
          GROUP BY 1
          ORDER BY total_count DESC, stage ASC
        `,
        "ycrm",
      );

      if (result.error) {
        throw new Error(result.error);
      }

      return buildYcrmOpportunityStageReport(
        input.planner.workspaceId,
        opportunityStageTarget,
        result.rows,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown Y-CRM DB query error";
      return [
        `我判斷這是 Y-CRM ${opportunityStageTarget.label}查詢，已優先查本地 Y-CRM DB，但查詢時發生錯誤：${message}`,
        `因此我不會改用外部網路資料或推測答案。請先確認 ycrm.${input.planner.workspaceId}.opportunity 是否可讀。`,
      ].join("\n");
    }
  }

  const overviewTarget = detectYcrmOverviewTarget(normalizedMessage, input.planner);
  if (overviewTarget) {
    if (input.planner.blockers.includes("auto_schema_missing")) {
      return null;
    }

    if (!input.planner.workspaceId || input.planner.needsWorkspaceValidation) {
      return [
        `我判斷這是 Y-CRM ${overviewTarget.label}查詢，但目前還沒有確認工作區，因此不能安全查本地 Y-CRM DB。`,
        "我會先停在這裡，不會改用模型猜答案。請先明確指定或確認 Y-CRM 工作區後再查詢。",
      ].join("\n");
    }

    try {
      const result = await duckdbQueryExternalPgAsyncDetailed<YcrmOverviewRow>(
        getYcrmPostgresConnectionString(),
        `
          SELECT '聯絡人' AS category, COUNT(*) AS count
          FROM ycrm."${input.planner.workspaceId}"."person"
          WHERE "deletedAt" IS NULL
          UNION ALL
          SELECT '公司' AS category, COUNT(*) AS count
          FROM ycrm."${input.planner.workspaceId}"."company"
          WHERE "deletedAt" IS NULL
          UNION ALL
          SELECT '商機' AS category, COUNT(*) AS count
          FROM ycrm."${input.planner.workspaceId}"."opportunity"
          WHERE "deletedAt" IS NULL
          UNION ALL
          SELECT '任務' AS category, COUNT(*) AS count
          FROM ycrm."${input.planner.workspaceId}"."task"
          WHERE "deletedAt" IS NULL
        `,
        "ycrm",
      );

      if (result.error) {
        throw new Error(result.error);
      }

      return buildYcrmOverviewReport(
        input.planner.workspaceId,
        overviewTarget,
        result.rows,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown Y-CRM DB query error";
      return [
        `我判斷這是 Y-CRM ${overviewTarget.label}查詢，已優先查本地 Y-CRM DB，但查詢時發生錯誤：${message}`,
        `因此我不會改用外部網路資料或推測答案。請先確認 ycrm.${input.planner.workspaceId}.person / company / opportunity / task 是否可讀。`,
      ].join("\n");
    }
  }

  const target = detectYcrmCountTarget(normalizedMessage, input.planner);
  if (!target) {
    return null;
  }

  if (input.planner.blockers.includes("auto_schema_missing")) {
    return null;
  }

  if (!input.planner.workspaceId || input.planner.needsWorkspaceValidation) {
    return [
      `我判斷這是 Y-CRM ${target.label}總數查詢，但目前還沒有確認工作區，因此不能安全查本地 Y-CRM DB。`,
      "我會先停在這裡，不會改用模型猜答案。請先明確指定或確認 Y-CRM 工作區後再查詢。",
    ].join("\n");
  }

  try {
    const result = await duckdbQueryExternalPgAsyncDetailed<YcrmCountRow>(
      getYcrmPostgresConnectionString(),
      `
        SELECT COUNT(*) AS total_count
        FROM ycrm."${input.planner.workspaceId}"."${target.tableName}"
        WHERE "deletedAt" IS NULL
      `,
      "ycrm",
    );

    if (result.error) {
      throw new Error(result.error);
    }

    return buildYcrmCountReport(input.planner.workspaceId, target, result.rows[0]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown Y-CRM DB query error";
    return [
      `我判斷這是 Y-CRM ${target.label}總數查詢，已優先查本地 Y-CRM DB，但查詢時發生錯誤：${message}`,
      `因此我不會改用外部網路資料或推測答案。請先確認 ycrm.${input.planner.workspaceId}.${target.tableName} 是否可讀。`,
    ].join("\n");
  }
}
