import { duckdbQueryExternalPgAsyncDetailed } from "./workspace";

const ERP_CONNECTION_STRING =
  "host=118.168.188.27 port=5433 dbname=ErpUAT_local user=sa password=ym@mes42769778 sslmode=disable";

type ErpCountRow = {
  total_count?: number | string;
};

type ErpInventoryRankingRow = {
  item_name?: string | null;
  available_qty?: number | string | null;
  on_hand_qty?: number | string | null;
  reserved_qty?: number | string | null;
};

type ErpCustomerOrderRankingRow = {
  customer_name?: string | null;
  order_count?: number | string | null;
  total_amt?: number | string | null;
};

type ErpStatusSummaryRow = {
  status_code?: string | null;
  total_count?: number | string | null;
};

type ErpOverdueSummaryRow = {
  due_status?: string | null;
  total_count?: number | string | null;
};

type ErpOverdueExceptionRow = {
  company_id?: string | null;
  site_id?: string | null;
  so_id?: string | null;
  customer_name?: string | null;
  delivery_date?: string | null;
  shipping_status?: string | null;
  order_status?: string | null;
  total_amt?: number | string | null;
  ordered_qty?: number | string | null;
  shipped_qty?: number | string | null;
  remaining_qty?: number | string | null;
  days_overdue?: number | string | null;
};

type ErpSalesOrderSummaryRow = {
  company_id?: string | null;
  site_id?: string | null;
  so_id?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  so_date?: string | null;
  so_delivery_date?: string | null;
  subtotal_amt?: number | string | null;
  tax_amt?: number | string | null;
  freight_amt?: number | string | null;
  total_amt?: number | string | null;
  order_status?: string | null;
  picking_status?: string | null;
  shipping_status?: string | null;
  invoice_status?: string | null;
  line_count?: number | string | null;
  ordered_qty?: number | string | null;
  picked_qty?: number | string | null;
  shipped_qty?: number | string | null;
  returned_qty?: number | string | null;
  remaining_qty?: number | string | null;
  shipment_progress_bucket?: string | null;
};

export type ErpVerifiedDirectQueryInput = {
  userMessage: string;
};

type ErpCountTarget = {
  label: string;
  tableName: "B_COMPANY" | "B_SITE" | "B_CUSTOMER" | "SO" | "INVENTORY";
  key:
    | "company_count"
    | "site_count"
    | "customer_count"
    | "sales_order_count"
    | "inventory_row_count";
  noun: string;
  whereClause?: string;
};

type ErpInventoryRankingTarget = {
  label: string;
  limit: number;
};

type ErpCustomerOrderRankingTarget = {
  label: string;
  limit: number;
};

type ErpStatusSummaryTarget = {
  label: string;
  statusColumn: "order_status" | "shipping_status" | "picking_status" | "invoice_status";
  panelId:
    | "erp-order-status"
    | "erp-shipping-status"
    | "erp-picking-status"
    | "erp-invoice-status";
  panelTitle: string;
};

type ErpOverdueSummaryTarget = {
  label: string;
  panelId: "erp-overdue-status";
  panelTitle: string;
};

type ErpOverdueExceptionTarget = {
  label: string;
  limit: number;
};

type ErpSalesOrderSummaryTarget = {
  label: string;
  soId: string;
};

function includesAny(message: string, keywords: string[]) {
  return keywords.some((keyword) => message.includes(keyword.toLowerCase()));
}

function looksLikeWriteRequest(message: string): boolean {
  return /新增|建立|開立|更新|修改|變更|刪除|取消|關閉|核准|approve|create|update|delete|cancel|close|adjust|post|write/i.test(
    message,
  );
}

function detectErpCountTarget(message: string): ErpCountTarget | null {
  const normalized = message.toLowerCase();
  if (looksLikeWriteRequest(message)) {
    return null;
  }
  if (/\bSO[0-9A-Za-z_-]{4,}\b/i.test(message)) {
    return null;
  }
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

  if (includesAny(normalized, ["公司", "company"])) {
    return {
      label: "公司",
      tableName: "B_COMPANY",
      key: "company_count",
      noun: "家公司",
    };
  }

  if (includesAny(normalized, ["場域", "site"])) {
    return {
      label: "場域",
      tableName: "B_SITE",
      key: "site_count",
      noun: "個場域",
    };
  }

  if (includesAny(normalized, ["客戶", "customer"])) {
    return {
      label: "客戶",
      tableName: "B_CUSTOMER",
      key: "customer_count",
      noun: "個客戶",
    };
  }

  if (includesAny(normalized, ["訂單", "sales order", "so"])) {
    return {
      label: "未作廢訂單",
      tableName: "SO",
      key: "sales_order_count",
      noun: "筆未作廢訂單",
      whereClause: 'WHERE cancelled_at IS NULL',
    };
  }

  if (includesAny(normalized, ["庫存", "inventory", "存貨"])) {
    return {
      label: "庫存資料",
      tableName: "INVENTORY",
      key: "inventory_row_count",
      noun: "筆庫存資料",
    };
  }

  return null;
}

function detectErpInventoryRankingTarget(
  message: string,
): ErpInventoryRankingTarget | null {
  const normalized = message.toLowerCase();
  if (looksLikeWriteRequest(message)) {
    return null;
  }

  const mentionsInventory = includesAny(normalized, [
    "庫存",
    "存貨",
    "inventory",
  ]);
  const mentionsRanking = includesAny(normalized, [
    "排行",
    "排名",
    "top",
    "前",
    "最多",
    "最高",
  ]);
  const mentionsAvailable = includesAny(normalized, [
    "可用",
    "available",
    "能賣",
  ]);

  if (!mentionsInventory || !mentionsRanking || !mentionsAvailable) {
    return null;
  }

  return {
    label: "可用庫存排行",
    limit: 10,
  };
}

function detectErpCustomerOrderRankingTarget(
  message: string,
): ErpCustomerOrderRankingTarget | null {
  const normalized = message.toLowerCase();
  if (looksLikeWriteRequest(message)) {
    return null;
  }

  const mentionsCustomer = includesAny(normalized, [
    "客戶",
    "customer",
  ]);
  const mentionsOrder = includesAny(normalized, [
    "訂單",
    "sales order",
    "so",
  ]);
  const mentionsRanking = includesAny(normalized, [
    "排行",
    "排名",
    "top",
    "前",
    "最多",
    "最高",
  ]);

  if (!mentionsCustomer || !mentionsOrder || !mentionsRanking) {
    return null;
  }

  return {
    label: "客戶訂單排行",
    limit: 10,
  };
}

function detectErpStatusSummaryTarget(
  message: string,
): ErpStatusSummaryTarget | null {
  const normalized = message.toLowerCase();
  if (looksLikeWriteRequest(message)) {
    return null;
  }

  const mentionsOrder = includesAny(normalized, ["訂單", "sales order", "so"]);
  const mentionsShipping = includesAny(normalized, ["出貨", "shipping", "shipment"]);
  const mentionsPicking = includesAny(normalized, ["揀貨", "撿貨", "picking", "pick"]);
  const mentionsInvoice = includesAny(normalized, ["開票", "發票", "invoice", "billing"]);
  const mentionsOverdue = includesAny(normalized, [
    "逾期",
    "延誤",
    "delay",
    "delayed",
    "overdue",
  ]);
  const mentionsDistribution = includesAny(normalized, [
    "分布",
    "分佈",
    "總覽",
    "概況",
    "統計",
  ]);
  const mentionsStatus = includesAny(normalized, [
    "status",
    "狀態",
  ]);

  if (!mentionsStatus || !mentionsDistribution) {
    return null;
  }

  if (mentionsOverdue) {
    return null;
  }

  if (mentionsPicking) {
    return {
      label: "揀貨狀態分布",
      statusColumn: "picking_status",
      panelId: "erp-picking-status",
      panelTitle: "ERP 揀貨狀態分布",
    };
  }

  if (mentionsInvoice) {
    return {
      label: "開票狀態分布",
      statusColumn: "invoice_status",
      panelId: "erp-invoice-status",
      panelTitle: "ERP 開票狀態分布",
    };
  }

  if (mentionsShipping) {
    return {
      label: "出貨狀態分布",
      statusColumn: "shipping_status",
      panelId: "erp-shipping-status",
      panelTitle: "ERP 出貨狀態分布",
    };
  }

  if (mentionsOrder) {
    return {
      label: "訂單狀態分布",
      statusColumn: "order_status",
      panelId: "erp-order-status",
      panelTitle: "ERP 訂單狀態分布",
    };
  }

  return null;
}

function detectErpOverdueSummaryTarget(
  message: string,
): ErpOverdueSummaryTarget | null {
  const normalized = message.toLowerCase();
  if (looksLikeWriteRequest(message)) {
    return null;
  }

  const mentionsOrderOrShipping = includesAny(normalized, [
    "訂單",
    "sales order",
    "so",
    "出貨",
    "shipping",
    "shipment",
    "交期",
    "delivery",
  ]);
  const mentionsOverdue = includesAny(normalized, [
    "逾期",
    "延誤",
    "delay",
    "delayed",
    "overdue",
  ]);
  const mentionsSummary = includesAny(normalized, [
    "分布",
    "分佈",
    "總覽",
    "概況",
    "統計",
    "圖表",
    "chart",
    "bar",
    "pie",
  ]);

  if (!mentionsOrderOrShipping || !mentionsOverdue || !mentionsSummary) {
    return null;
  }

  return {
    label: "訂單交期逾期概況",
    panelId: "erp-overdue-status",
    panelTitle: "ERP 訂單交期逾期概況",
  };
}

function detectErpOverdueExceptionTarget(
  message: string,
): ErpOverdueExceptionTarget | null {
  const normalized = message.toLowerCase();
  if (looksLikeWriteRequest(message)) {
    return null;
  }

  const mentionsOrderOrShipping = includesAny(normalized, [
    "訂單",
    "sales order",
    "so",
    "出貨",
    "shipping",
    "shipment",
    "交期",
    "delivery",
  ]);
  const mentionsOverdue = includesAny(normalized, [
    "逾期",
    "延誤",
    "delay",
    "delayed",
    "overdue",
    "過交期",
  ]);
  const mentionsUnshipped = includesAny(normalized, [
    "未出貨",
    "還沒出貨",
    "待出",
    "未完成出貨",
    "unshipped",
    "open qty",
  ]);
  const mentionsDetail = includesAny(normalized, [
    "哪些",
    "清單",
    "列出",
    "明細",
    "前",
    "top",
  ]);

  if (!mentionsOrderOrShipping || !mentionsOverdue || !mentionsUnshipped || !mentionsDetail) {
    return null;
  }

  return {
    label: "逾期未出貨訂單明細",
    limit: 10,
  };
}

function detectErpSalesOrderSummaryTarget(
  message: string,
): ErpSalesOrderSummaryTarget | null {
  if (looksLikeWriteRequest(message)) {
    return null;
  }

  const normalized = message.toLowerCase();
  const soIdMatch = message.match(/\bSO[0-9A-Za-z_-]{4,}\b/i);
  if (!soIdMatch) {
    return null;
  }

  const mentionsSummaryIntent = includesAny(normalized, [
    "訂單摘要",
    "摘要",
    "summary",
    "狀態",
    "總金額",
    "出貨",
    "出貨進度",
    "已出",
    "已揀",
    "未出",
    "交期",
    "進度",
  ]);

  if (!mentionsSummaryIntent) {
    return null;
  }

  return {
    label: "銷售訂單摘要",
    soId: soIdMatch[0].toUpperCase(),
  };
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

function buildErpCountReport(target: ErpCountTarget, row: ErpCountRow | undefined) {
  const totalCount = toNumber(row?.total_count);
  const chartRows = [
    {
      category: target.label,
      total_count: totalCount,
    },
  ];

  return [
    `根據本地 ERP DB 的 ${target.tableName} 查詢，目前共有 ${formatNumber(totalCount)} ${target.noun}。`,
    "",
    `查詢依據：${target.tableName}${target.whereClause ? ` (${target.whereClause})` : ""}。此回答只使用本地 ERP DB，不使用外部網路資料。`,
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        title: `ERP 目前 ${target.label}總數`,
        description: `本地 ERP DB 查詢結果，${target.label}總數為 ${formatNumber(totalCount)}。`,
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

function buildErpInventoryRankingReport(
  target: ErpInventoryRankingTarget,
  rows: ErpInventoryRankingRow[],
): string {
  const normalizedRows = rows.map((row, index) => ({
    rank: index + 1,
    item_name: row.item_name?.trim() || `品項 ${index + 1}`,
    available_qty: toNumber(row.available_qty),
    on_hand_qty: toNumber(row.on_hand_qty),
    reserved_qty: toNumber(row.reserved_qty),
  }));

  if (normalizedRows.length === 0) {
    return [
      `我判斷這是 ERP ${target.label}查詢，已優先查本地 ERP DB，但目前沒有可聚合的庫存資料列。`,
      "因此我不會輸出空圖表，也不會改用外部網路資料或推測答案。請先確認 INVENTORY / B_ITEM 是否有有效資料。",
    ].join("\n");
  }

  const topLines = normalizedRows.slice(0, 5).map((row) => {
    return `${row.rank}. ${row.item_name}：可用 ${formatNumber(row.available_qty)}，在手 ${formatNumber(row.on_hand_qty)}，保留 ${formatNumber(row.reserved_qty)}`;
  });

  return [
    `根據本地 ERP DB 的 INVENTORY + B_ITEM 查詢，目前可用庫存最高的前 ${target.limit} 個商品如下。`,
    "",
    ...topLines,
    "",
    "查詢依據：INVENTORY.available_qty / on_hand_qty / reserved_qty，並以 B_ITEM.item_name 補品項名稱。此回答只使用本地 ERP DB，不使用外部網路資料。",
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        title: `ERP ${target.label}`,
        description: `本地 ERP DB 查詢結果，依可用庫存排序的前 ${target.limit} 個商品。`,
        panels: [
          {
            id: "inventory-available-ranking",
            title: "可用庫存前十名",
            type: "bar",
            rows: normalizedRows,
            mapping: {
              xAxis: "item_name",
              yAxis: ["available_qty"],
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

function buildErpCustomerOrderRankingReport(
  target: ErpCustomerOrderRankingTarget,
  rows: ErpCustomerOrderRankingRow[],
): string {
  const normalizedRows = rows.map((row, index) => ({
    rank: index + 1,
    customer_name: row.customer_name?.trim() || `客戶 ${index + 1}`,
    order_count: toNumber(row.order_count),
    total_amt: toNumber(row.total_amt),
  }));

  if (normalizedRows.length === 0) {
    return [
      `我判斷這是 ERP ${target.label}查詢，已優先查本地 ERP DB，但目前沒有可聚合的客戶訂單資料列。`,
      "因此我不會輸出空圖表，也不會改用外部網路資料或推測答案。請先確認 SO / B_CUSTOMER 是否有有效資料。",
    ].join("\n");
  }

  const summaryLines = normalizedRows.slice(0, 5).map((row) => {
    return `${row.rank}. ${row.customer_name}：${formatNumber(row.order_count)} 筆訂單，總金額 ${formatDecimal(row.total_amt)}`;
  });

  return [
    `根據本地 ERP DB 的 SO + B_CUSTOMER 查詢，目前訂單數最多的前 ${target.limit} 個客戶如下。`,
    "",
    ...summaryLines,
    "",
    "查詢依據：SO.customer_id -> B_CUSTOMER.customer_id，並排除 cancelled_at IS NOT NULL 的作廢單。排行先依訂單筆數，再依總金額排序。此回答只使用本地 ERP DB，不使用外部網路資料。",
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        title: `ERP ${target.label}`,
        description: `本地 ERP DB 查詢結果，依訂單筆數排序的前 ${target.limit} 個客戶。`,
        panels: [
          {
            id: "erp-customer-order-ranking",
            title: "客戶訂單排行",
            type: "bar",
            rows: normalizedRows,
            mapping: {
              xAxis: "customer_name",
              yAxis: ["order_count"],
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

function buildErpStatusSummaryReport(
  target: ErpStatusSummaryTarget,
  rows: ErpStatusSummaryRow[],
): string {
  const normalizedRows = rows.map((row) => ({
    status_code: row.status_code?.trim() || "UNKNOWN",
    total_count: toNumber(row.total_count),
  }));

  if (normalizedRows.length === 0) {
    return [
      `我判斷這是 ERP ${target.label}查詢，已優先查本地 ERP DB，但目前沒有可聚合的狀態資料列。`,
      "因此我不會輸出空圖表，也不會改用外部網路資料或推測答案。請先確認 SO 的狀態欄位是否有有效資料。",
    ].join("\n");
  }

  const summaryLines = normalizedRows.map((row) => {
    return `${row.status_code}：${formatNumber(row.total_count)} 筆`;
  });

  return [
    `根據本地 ERP DB 的 SO 查詢，目前 ${target.label}如下。`,
    "",
    ...summaryLines,
    "",
    `查詢依據：SO.${target.statusColumn}，並排除 cancelled_at IS NOT NULL 的作廢單。此回答只使用本地 ERP DB，不使用外部網路資料。`,
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        title: target.panelTitle,
        description: `本地 ERP DB 查詢結果，依 ${target.statusColumn} 聚合的狀態分布。`,
        panels: [
          {
            id: target.panelId,
            title: target.panelTitle,
            type: "bar",
            rows: normalizedRows,
            mapping: {
              xAxis: "status_code",
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

function buildErpOverdueSummaryReport(
  target: ErpOverdueSummaryTarget,
  rows: ErpOverdueSummaryRow[],
): string {
  const normalizedRows = rows.map((row) => ({
    due_status: row.due_status?.trim() || "UNKNOWN",
    total_count: toNumber(row.total_count),
  }));

  if (normalizedRows.length === 0) {
    return [
      `我判斷這是 ERP ${target.label}查詢，已優先查本地 ERP DB，但目前沒有可聚合的交期資料列。`,
      "因此我不會輸出空圖表，也不會改用外部網路資料或推測答案。請先確認 SO.delivery_date / shipping_status 是否有有效資料。",
    ].join("\n");
  }

  const summaryLines = normalizedRows.map((row) => {
    return `${row.due_status}：${formatNumber(row.total_count)} 筆`;
  });

  return [
    `根據本地 ERP DB 的 SO 查詢，目前 ${target.label}如下。`,
    "",
    ...summaryLines,
    "",
    "查詢依據：SO.delivery_date / shipping_status，並排除 cancelled_at IS NOT NULL 的作廢單。若 delivery_date 已過且 shipping_status 仍非 SHIPPED / CLOSED，歸類為已逾期。此回答只使用本地 ERP DB，不使用外部網路資料。",
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        title: target.panelTitle,
        description: "本地 ERP DB 查詢結果，依交期是否逾期聚合的訂單概況。",
        panels: [
          {
            id: target.panelId,
            title: target.panelTitle,
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

function buildErpOverdueExceptionReport(
  target: ErpOverdueExceptionTarget,
  rows: ErpOverdueExceptionRow[],
): string {
  const normalizedRows = rows.map((row, index) => ({
    rank: index + 1,
    company_id: row.company_id?.trim() || "?",
    site_id: row.site_id?.trim() || "?",
    so_id: row.so_id?.trim() || `SO-${index + 1}`,
    customer_name: row.customer_name?.trim() || "未知客戶",
    delivery_date: row.delivery_date?.trim() || "未提供",
    shipping_status: row.shipping_status?.trim() || "UNKNOWN",
    order_status: row.order_status?.trim() || "UNKNOWN",
    total_amt: toNumber(row.total_amt),
    ordered_qty: toNumber(row.ordered_qty),
    shipped_qty: toNumber(row.shipped_qty),
    remaining_qty: toNumber(row.remaining_qty),
    days_overdue: toNumber(row.days_overdue),
  }));

  if (normalizedRows.length === 0) {
    return [
      `我判斷這是 ERP ${target.label}查詢，已優先查本地 ERP DB，但目前沒有符合條件的逾期未出貨訂單。`,
      "因此我不會輸出空圖表，也不會改用外部網路資料或推測答案。若你想看整體分布，可改問逾期概況；若要更細，請指定 company/site。",
    ].join("\n");
  }

  const summaryLines = normalizedRows.slice(0, 5).map((row) => {
    return `${row.rank}. ${row.so_id} / ${row.customer_name}：逾期 ${formatNumber(row.days_overdue)} 天，待出 ${formatDecimal(row.remaining_qty)}，交期 ${row.delivery_date}`;
  });

  return [
    `根據本地 ERP DB 的 SO / SO_LINE / B_CUSTOMER 查詢，目前逾期未出貨最需要先處理的前 ${target.limit} 筆訂單如下。`,
    "",
    ...summaryLines,
    "",
    "查詢依據：以 SO.delivery_date 判斷是否逾期，並以 SO_LINE 的訂購量減已出量推算 remaining_qty；只保留 cancelled_at IS NULL 且 remaining_qty > 0 的訂單。此回答只使用本地 ERP DB，不使用外部網路資料。",
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        title: `ERP ${target.label}`,
        description: `本地 ERP DB 查詢結果，列出交期已過且仍有待出數量的前 ${target.limit} 筆訂單。`,
        panels: [
          {
            id: "erp-overdue-unshipped-orders",
            title: "逾期未出貨訂單待出量",
            type: "bar",
            rows: normalizedRows,
            mapping: {
              xAxis: "so_id",
              yAxis: ["remaining_qty"],
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

function buildErpSalesOrderSummaryReport(
  target: ErpSalesOrderSummaryTarget,
  row: ErpSalesOrderSummaryRow,
): string {
  const orderedQty = toNumber(row.ordered_qty);
  const pickedQty = toNumber(row.picked_qty);
  const shippedQty = toNumber(row.shipped_qty);
  const returnedQty = toNumber(row.returned_qty);
  const remainingQty = toNumber(row.remaining_qty);
  const subtotalAmt = toNumber(row.subtotal_amt);
  const taxAmt = toNumber(row.tax_amt);
  const freightAmt = toNumber(row.freight_amt);
  const totalAmt = toNumber(row.total_amt);
  const lineCount = toNumber(row.line_count);
  const chartRows = [
    { category: "訂購數量", qty: orderedQty },
    { category: "已揀數量", qty: pickedQty },
    { category: "已出數量", qty: shippedQty },
    { category: "已退數量", qty: returnedQty },
    { category: "待出數量", qty: remainingQty },
  ];

  return [
    `根據本地 ERP DB 的 SO / SO_LINE 查詢，訂單 ${target.soId} 的摘要如下。`,
    "",
    `客戶：${row.customer_name?.trim() || row.customer_id || "未知客戶"}`,
    `公司 / 場域：${row.company_id || "?"} / ${row.site_id || "?"}`,
    `訂單日：${row.so_date || "未提供"}；交期：${row.so_delivery_date || "未提供"}`,
    `狀態：order=${row.order_status || "UNKNOWN"}，picking=${row.picking_status || "UNKNOWN"}，shipping=${row.shipping_status || "UNKNOWN"}，invoice=${row.invoice_status || "UNKNOWN"}`,
    `金額：小計 ${formatDecimal(subtotalAmt)}、稅額 ${formatDecimal(taxAmt)}、運費 ${formatDecimal(freightAmt)}、總計 ${formatDecimal(totalAmt)}`,
    `明細：共 ${formatNumber(lineCount)} 行，訂購 ${formatDecimal(orderedQty)}、已揀 ${formatDecimal(pickedQty)}、已出 ${formatDecimal(shippedQty)}、已退 ${formatDecimal(returnedQty)}、待出 ${formatDecimal(remainingQty)}；進度判定 ${row.shipment_progress_bucket || "UNKNOWN"}`,
    "",
    `查詢依據：SO / SO_LINE / B_CUSTOMER，並排除 cancelled_at IS NOT NULL 的作廢單。此回答只使用本地 ERP DB，不使用外部網路資料。`,
    "",
    "```report-json",
    JSON.stringify(
      {
        version: 1,
        title: `ERP 訂單 ${target.soId} 摘要`,
        description: `本地 ERP DB 查詢結果，整理 ${target.soId} 的金額、狀態與出貨進度。`,
        panels: [
          {
            id: `erp-sales-order-summary-${target.soId}`,
            title: `${target.soId} 出貨進度`,
            type: "bar",
            rows: chartRows,
            mapping: {
              xAxis: "category",
              yAxis: ["qty"],
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

export async function buildErpVerifiedDirectQueryAnswer(
  input: ErpVerifiedDirectQueryInput,
): Promise<string | null> {
  const salesOrderSummaryTarget = detectErpSalesOrderSummaryTarget(input.userMessage);
  if (salesOrderSummaryTarget) {
    try {
      const result = await duckdbQueryExternalPgAsyncDetailed<ErpSalesOrderSummaryRow>(
        ERP_CONNECTION_STRING,
        `
          WITH line_agg AS (
            SELECT
              company_id,
              site_id,
              so_id,
              COUNT(*) AS line_count,
              COALESCE(SUM(qty), 0) AS ordered_qty,
              COALESCE(SUM(picked_qty), 0) AS picked_qty,
              COALESCE(SUM(shipped_qty), 0) AS shipped_qty,
              COALESCE(SUM(returned_qty), 0) AS returned_qty,
              GREATEST(COALESCE(SUM(qty), 0) - COALESCE(SUM(shipped_qty), 0), 0) AS remaining_qty
            FROM erp.public."SO_LINE"
            WHERE so_id = '${salesOrderSummaryTarget.soId}'
            GROUP BY 1, 2, 3
          )
          SELECT
            s.company_id,
            s.site_id,
            s.so_id,
            s.customer_id,
            COALESCE(NULLIF(TRIM(c.customer_name), ''), s.customer_id) AS customer_name,
            CAST(s.so_date AS VARCHAR) AS so_date,
            CAST(s.delivery_date AS VARCHAR) AS so_delivery_date,
            s.subtotal_amt,
            s.tax_amt,
            s.freight_amt,
            s.total_amt,
            s.order_status,
            s.picking_status,
            s.shipping_status,
            s.invoice_status,
            COALESCE(la.line_count, 0) AS line_count,
            COALESCE(la.ordered_qty, 0) AS ordered_qty,
            COALESCE(la.picked_qty, 0) AS picked_qty,
            COALESCE(la.shipped_qty, 0) AS shipped_qty,
            COALESCE(la.returned_qty, 0) AS returned_qty,
            COALESCE(la.remaining_qty, 0) AS remaining_qty,
            CASE
              WHEN COALESCE(la.shipped_qty, 0) = 0 THEN 'UNSHIPPED'
              WHEN COALESCE(la.shipped_qty, 0) < COALESCE(la.ordered_qty, 0) THEN 'PARTIALLY_SHIPPED'
              ELSE 'FULLY_SHIPPED'
            END AS shipment_progress_bucket
          FROM erp.public."SO" s
          LEFT JOIN erp.public."B_CUSTOMER" c ON c.customer_id = s.customer_id
          LEFT JOIN line_agg la
            ON la.company_id = s.company_id
           AND la.site_id = s.site_id
           AND la.so_id = s.so_id
          WHERE s.so_id = '${salesOrderSummaryTarget.soId}'
            AND s.cancelled_at IS NULL
          ORDER BY s.company_id ASC, s.site_id ASC
        `,
        "erp",
      );

      if (result.error) {
        throw new Error(result.error);
      }

      if (result.rows.length === 0) {
        return [
          `我判斷這是 ERP ${salesOrderSummaryTarget.soId} 的銷售訂單摘要查詢，已優先查本地 ERP DB，但目前查無可用資料。`,
          "因此我不會改用外部網路資料或推測答案。請先確認 so_id 是否正確，或該訂單是否已作廢。",
        ].join("\n");
      }

      if (result.rows.length > 1) {
        return [
          `我判斷這是 ERP ${salesOrderSummaryTarget.soId} 的銷售訂單摘要查詢，但在本地 ERP DB 中找到多筆 company/site 版本，無法安全只回其中一筆。`,
          "請再補充 company_id 或 site_id，我會再用本地 ERP DB 做精確摘要，不會改用模型猜答案。",
        ].join("\n");
      }

      return buildErpSalesOrderSummaryReport(salesOrderSummaryTarget, result.rows[0]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown ERP DB query error";
      return [
        `我判斷這是 ERP ${salesOrderSummaryTarget.soId} 的銷售訂單摘要查詢，已優先查本地 ERP DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 SO / SO_LINE / B_CUSTOMER 是否可讀。",
      ].join("\n");
    }
  }

  const statusSummaryTarget = detectErpStatusSummaryTarget(input.userMessage);
  if (statusSummaryTarget) {
    try {
      const result = await duckdbQueryExternalPgAsyncDetailed<ErpStatusSummaryRow>(
        ERP_CONNECTION_STRING,
        `
          SELECT
            COALESCE(${statusSummaryTarget.statusColumn}, 'UNKNOWN') AS status_code,
            COUNT(*) AS total_count
          FROM erp.public."SO"
          WHERE cancelled_at IS NULL
          GROUP BY 1
          ORDER BY total_count DESC, status_code ASC
        `,
        "erp",
      );

      if (result.error) {
        throw new Error(result.error);
      }

      return buildErpStatusSummaryReport(statusSummaryTarget, result.rows);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown ERP DB query error";
      return [
        `我判斷這是 ERP ${statusSummaryTarget.label}查詢，已優先查本地 ERP DB，但查詢時發生錯誤：${message}`,
      "因此我不會改用外部網路資料或推測答案。請先確認 SO 表與對應狀態欄位是否可讀。",
      ].join("\n");
    }
  }

  const overdueSummaryTarget = detectErpOverdueSummaryTarget(input.userMessage);
  if (overdueSummaryTarget) {
    try {
      const result = await duckdbQueryExternalPgAsyncDetailed<ErpOverdueSummaryRow>(
        ERP_CONNECTION_STRING,
        `
          SELECT
            CASE
              WHEN delivery_date IS NULL THEN '未設定交期'
              WHEN COALESCE(shipping_status, 'UNKNOWN') IN ('SHIPPED', 'CLOSED') THEN '已出貨或已結案'
              WHEN delivery_date < CURRENT_DATE THEN '已逾期'
              ELSE '未逾期'
            END AS due_status,
            COUNT(*) AS total_count
          FROM erp.public."SO"
          WHERE cancelled_at IS NULL
          GROUP BY 1
          ORDER BY total_count DESC, due_status ASC
        `,
        "erp",
      );

      if (result.error) {
        throw new Error(result.error);
      }

      return buildErpOverdueSummaryReport(overdueSummaryTarget, result.rows);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown ERP DB query error";
      return [
        `我判斷這是 ERP ${overdueSummaryTarget.label}查詢，已優先查本地 ERP DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 SO.delivery_date / shipping_status 是否可讀。",
      ].join("\n");
    }
  }

  const overdueExceptionTarget = detectErpOverdueExceptionTarget(input.userMessage);
  if (overdueExceptionTarget) {
    try {
      const result = await duckdbQueryExternalPgAsyncDetailed<ErpOverdueExceptionRow>(
        ERP_CONNECTION_STRING,
        `
          WITH line_agg AS (
            SELECT
              company_id,
              site_id,
              so_id,
              COALESCE(SUM(qty), 0) AS ordered_qty,
              COALESCE(SUM(shipped_qty), 0) AS shipped_qty,
              GREATEST(COALESCE(SUM(qty), 0) - COALESCE(SUM(shipped_qty), 0), 0) AS remaining_qty
            FROM erp.public."SO_LINE"
            GROUP BY 1, 2, 3
          )
          SELECT
            s.company_id,
            s.site_id,
            s.so_id,
            COALESCE(NULLIF(TRIM(c.customer_name), ''), s.customer_id) AS customer_name,
            CAST(s.delivery_date AS VARCHAR) AS delivery_date,
            COALESCE(s.shipping_status, 'UNKNOWN') AS shipping_status,
            COALESCE(s.order_status, 'UNKNOWN') AS order_status,
            s.total_amt,
            COALESCE(la.ordered_qty, 0) AS ordered_qty,
            COALESCE(la.shipped_qty, 0) AS shipped_qty,
            COALESCE(la.remaining_qty, 0) AS remaining_qty,
            GREATEST(DATEDIFF('day', CAST(s.delivery_date AS DATE), CURRENT_DATE), 0) AS days_overdue
          FROM erp.public."SO" s
          LEFT JOIN erp.public."B_CUSTOMER" c ON c.customer_id = s.customer_id
          LEFT JOIN line_agg la
            ON la.company_id = s.company_id
           AND la.site_id = s.site_id
           AND la.so_id = s.so_id
          WHERE s.cancelled_at IS NULL
            AND s.delivery_date IS NOT NULL
            AND CAST(s.delivery_date AS DATE) < CURRENT_DATE
            AND COALESCE(s.shipping_status, 'UNKNOWN') NOT IN ('SHIPPED', 'CLOSED')
            AND COALESCE(la.remaining_qty, 0) > 0
          ORDER BY days_overdue DESC, remaining_qty DESC, s.so_id ASC
          LIMIT ${overdueExceptionTarget.limit}
        `,
        "erp",
      );

      if (result.error) {
        throw new Error(result.error);
      }

      return buildErpOverdueExceptionReport(overdueExceptionTarget, result.rows);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown ERP DB query error";
      return [
        `我判斷這是 ERP ${overdueExceptionTarget.label}查詢，已優先查本地 ERP DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 SO / SO_LINE / B_CUSTOMER / delivery_date / shipping_status 是否可讀。",
      ].join("\n");
    }
  }

  const customerOrderRankingTarget = detectErpCustomerOrderRankingTarget(
    input.userMessage,
  );
  if (customerOrderRankingTarget) {
    try {
      const result = await duckdbQueryExternalPgAsyncDetailed<ErpCustomerOrderRankingRow>(
        ERP_CONNECTION_STRING,
        `
          SELECT
            COALESCE(NULLIF(TRIM(c.customer_name), ''), s.customer_id) AS customer_name,
            COUNT(*) AS order_count,
            ROUND(COALESCE(SUM(s.total_amt), 0), 2) AS total_amt
          FROM erp.public."SO" s
          LEFT JOIN erp.public."B_CUSTOMER" c ON c.customer_id = s.customer_id
          WHERE s.cancelled_at IS NULL
          GROUP BY 1
          ORDER BY order_count DESC, total_amt DESC, customer_name ASC
          LIMIT ${customerOrderRankingTarget.limit}
        `,
        "erp",
      );

      if (result.error) {
        throw new Error(result.error);
      }

      return buildErpCustomerOrderRankingReport(customerOrderRankingTarget, result.rows);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown ERP DB query error";
      return [
        `我判斷這是 ERP ${customerOrderRankingTarget.label}查詢，已優先查本地 ERP DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 SO / B_CUSTOMER 是否可讀。",
      ].join("\n");
    }
  }

  const inventoryRankingTarget = detectErpInventoryRankingTarget(input.userMessage);
  if (inventoryRankingTarget) {
    try {
      const result = await duckdbQueryExternalPgAsyncDetailed<ErpInventoryRankingRow>(
        ERP_CONNECTION_STRING,
        `
          SELECT
            COALESCE(NULLIF(TRIM(i.item_name), ''), inv.item_id) AS item_name,
            ROUND(COALESCE(SUM(inv.available_qty), 0), 2) AS available_qty,
            ROUND(COALESCE(SUM(inv.on_hand_qty), 0), 2) AS on_hand_qty,
            ROUND(COALESCE(SUM(inv.reserved_qty), 0), 2) AS reserved_qty
          FROM erp.public."INVENTORY" inv
          LEFT JOIN erp.public."B_ITEM" i ON i.item_id = inv.item_id
          GROUP BY 1
          ORDER BY available_qty DESC, on_hand_qty DESC, item_name ASC
          LIMIT ${inventoryRankingTarget.limit}
        `,
        "erp",
      );

      if (result.error) {
        throw new Error(result.error);
      }

      return buildErpInventoryRankingReport(inventoryRankingTarget, result.rows);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown ERP DB query error";
      return [
        `我判斷這是 ERP ${inventoryRankingTarget.label}查詢，已優先查本地 ERP DB，但查詢時發生錯誤：${message}`,
        "因此我不會改用外部網路資料或推測答案。請先確認 INVENTORY / B_ITEM 是否可讀，以及 available_qty 欄位是否存在。",
      ].join("\n");
    }
  }

  const target = detectErpCountTarget(input.userMessage);
  if (!target) {
    return null;
  }

  try {
    const result = await duckdbQueryExternalPgAsyncDetailed<ErpCountRow>(
      ERP_CONNECTION_STRING,
      `
        SELECT COUNT(*) AS total_count
        FROM erp.public."${target.tableName}"
        ${target.whereClause ?? ""}
      `,
      "erp",
    );

    if (result.error) {
      throw new Error(result.error);
    }

    return buildErpCountReport(target, result.rows[0]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown ERP DB query error";
    return [
      `我判斷這是 ERP ${target.label}總數查詢，已優先查本地 ERP DB，但查詢時發生錯誤：${message}`,
      `因此我不會改用外部網路資料或推測答案。請先確認 ${target.tableName} 表是否可讀。`,
    ].join("\n");
  }
}
