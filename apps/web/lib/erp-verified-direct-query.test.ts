import { beforeEach, describe, expect, it, vi } from "vitest";

const TEST_ERP_CONNECTION =
  "host=118.168.188.27 port=5433 dbname=ErpUAT_local user=test password=secret sslmode=disable";
const ORIGINAL_ENV = { ...process.env };

vi.mock("./workspace", () => ({
  duckdbQueryExternalPgAsyncDetailed: vi.fn(),
}));

describe("buildErpVerifiedDirectQueryAnswer", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.ERP_PG_CONNECTION = TEST_ERP_CONNECTION;
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("answers ERP customer count requests from local DB rows and emits report-json", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [{ total_count: 42 }],
      error: null,
    });

    const { buildErpVerifiedDirectQueryAnswer } = await import(
      "./erp-verified-direct-query"
    );

    const answer = await buildErpVerifiedDirectQueryAnswer({
      userMessage: "可以幫我用圖表呈現一下 ERP 目前有多少客戶嗎？",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(answer).toContain("目前共有 42 個客戶");
    expect(answer).toContain("```report-json");
    expect(answer).toContain("\"sourceDomain\": \"erp\"");
    expect(answer).toContain("\"sourceKind\": \"verified_direct\"");
    expect(answer).toContain("\"customer_count-bar\"");
    expect(answer).toContain("\"type\": \"bar\"");
  });

  it("answers ERP single sales-order summary requests using SO / SO_LINE rows", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        {
          company_id: "C01",
          site_id: "S01",
          so_id: "SO20260101",
          customer_id: "CU001",
          customer_name: "OOCHAIN",
          so_date: "2026-01-01",
          so_delivery_date: "2026-01-15",
          subtotal_amt: 1000,
          tax_amt: 50,
          freight_amt: 20,
          total_amt: 1070,
          order_status: "10",
          picking_status: "READY",
          shipping_status: "PARTIAL",
          invoice_status: "PENDING",
          line_count: 3,
          ordered_qty: 120,
          picked_qty: 80,
          shipped_qty: 60,
          returned_qty: 0,
          remaining_qty: 60,
          shipment_progress_bucket: "PARTIALLY_SHIPPED",
        },
      ],
      error: null,
    });

    const { buildErpVerifiedDirectQueryAnswer } = await import(
      "./erp-verified-direct-query"
    );

    const answer = await buildErpVerifiedDirectQueryAnswer({
      userMessage: "請摘要 SO20260101 的訂單狀態、總金額、訂購/已揀/已出/未出數量。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mock.calls[0]?.[1],
    ).toContain("WITH line_agg AS");
    expect(answer).toContain("訂單 SO20260101 的摘要如下");
    expect(answer).toContain("客戶：OOCHAIN");
    expect(answer).toContain("總計 1,070");
    expect(answer).toContain("待出 60");
    expect(answer).toContain("\"erp-sales-order-summary-SO20260101\"");
  });

  it("stops when the same ERP so_id resolves to multiple company/site rows", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        { company_id: "C01", site_id: "S01", so_id: "SO20260101" },
        { company_id: "C02", site_id: "S02", so_id: "SO20260101" },
      ],
      error: null,
    });

    const { buildErpVerifiedDirectQueryAnswer } = await import(
      "./erp-verified-direct-query"
    );

    const answer = await buildErpVerifiedDirectQueryAnswer({
      userMessage: "請列出 SO20260101 的訂單摘要。",
    });

    expect(answer).toContain("找到多筆 company/site 版本");
    expect(answer).toContain("請再補充 company_id 或 site_id");
  });

  it("answers ERP active sales-order count requests using non-cancelled rows", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [{ total_count: 15 }],
      error: null,
    });

    const { buildErpVerifiedDirectQueryAnswer } = await import(
      "./erp-verified-direct-query"
    );

    const answer = await buildErpVerifiedDirectQueryAnswer({
      userMessage: "ERP 目前有多少訂單？也可以用圖表呈現",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mock.calls[0]?.[1],
    ).toContain("WHERE cancelled_at IS NULL");
    expect(answer).toContain("目前共有 15 筆未作廢訂單");
  });

  it("answers ERP available-inventory ranking requests using available_qty instead of allocated_qty", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        {
          item_name: "A100 測試品",
          available_qty: 150,
          on_hand_qty: 160,
          reserved_qty: 10,
        },
        {
          item_name: "B200 第二品",
          available_qty: 90,
          on_hand_qty: 95,
          reserved_qty: 5,
        },
      ],
      error: null,
    });

    const { buildErpVerifiedDirectQueryAnswer } = await import(
      "./erp-verified-direct-query"
    );

    const answer = await buildErpVerifiedDirectQueryAnswer({
      userMessage: "ERP 目前可用庫存最多的前 10 個商品是哪些？請用圖表呈現。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mock.calls[0]?.[1],
    ).toContain("SUM(inv.available_qty)");
    expect(
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mock.calls[0]?.[1],
    ).not.toContain("allocated_qty");
    expect(answer).toContain("可用庫存最高的前 10 個商品");
    expect(answer).toContain("A100 測試品：可用 150");
    expect(answer).toContain("```report-json");
    expect(answer).toContain("\"inventory-available-ranking\"");
  });

  it("answers ERP customer-order ranking requests from SO + B_CUSTOMER rows and emits report-json", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        { customer_name: "OOCHAIN", order_count: 8, total_amt: 15230 },
        { customer_name: "MAODING", order_count: 5, total_amt: 9200 },
      ],
      error: null,
    });

    const { buildErpVerifiedDirectQueryAnswer } = await import(
      "./erp-verified-direct-query"
    );

    const answer = await buildErpVerifiedDirectQueryAnswer({
      userMessage: "ERP 訂單最多的前 10 個客戶是哪些？請用圖表呈現。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mock.calls[0]?.[1],
    ).toContain('LEFT JOIN erp.public."B_CUSTOMER" c ON c.customer_id = s.customer_id');
    expect(answer).toContain("訂單數最多的前 10 個客戶");
    expect(answer).toContain("OOCHAIN：8 筆訂單");
    expect(answer).toContain("\"erp-customer-order-ranking\"");
  });

  it("returns text-only fallback when ERP customer-order ranking has no rows", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [],
      error: null,
    });

    const { buildErpVerifiedDirectQueryAnswer } = await import(
      "./erp-verified-direct-query"
    );

    const answer = await buildErpVerifiedDirectQueryAnswer({
      userMessage: "ERP 訂單最多的前 10 個客戶是哪些？請用圖表呈現。",
    });

    expect(answer).toContain("目前沒有可聚合的客戶訂單資料列");
    expect(answer).not.toContain("```report-json");
  });

  it("answers ERP order-status summary requests from SO rows and emits report-json", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        { status_code: "10", total_count: 8 },
        { status_code: "20", total_count: 5 },
      ],
      error: null,
    });

    const { buildErpVerifiedDirectQueryAnswer } = await import(
      "./erp-verified-direct-query"
    );

    const answer = await buildErpVerifiedDirectQueryAnswer({
      userMessage: "請幫我用圖表呈現 ERP 訂單狀態分布。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mock.calls[0]?.[1],
    ).toContain("COALESCE(order_status, 'UNKNOWN')");
    expect(answer).toContain("目前 訂單狀態分布如下");
    expect(answer).toContain("10：8 筆");
    expect(answer).toContain("```report-json");
    expect(answer).toContain("\"erp-order-status\"");
  });

  it("answers ERP overdue-summary requests from SO rows and emits report-json", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        { due_status: "已逾期", total_count: 6 },
        { due_status: "未逾期", total_count: 9 },
      ],
      error: null,
    });

    const { buildErpVerifiedDirectQueryAnswer } = await import(
      "./erp-verified-direct-query"
    );

    const answer = await buildErpVerifiedDirectQueryAnswer({
      userMessage: "請幫我用圖表呈現 ERP 訂單交期逾期概況。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mock.calls[0]?.[1],
    ).toContain("WHEN delivery_date < CURRENT_DATE THEN '已逾期'");
    expect(answer).toContain("訂單交期逾期概況如下");
    expect(answer).toContain("已逾期：6 筆");
    expect(answer).toContain("```report-json");
    expect(answer).toContain("\"erp-overdue-status\"");
  });

  it("answers ERP overdue-unshipped exception requests and emits report-json", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        {
          company_id: "C01",
          site_id: "S01",
          so_id: "SO20260109",
          customer_name: "OOCHAIN",
          delivery_date: "2026-01-15",
          shipping_status: "PARTIAL",
          order_status: "20",
          total_amt: 1200,
          ordered_qty: 100,
          shipped_qty: 40,
          remaining_qty: 60,
          days_overdue: 7,
        },
      ],
      error: null,
    });

    const { buildErpVerifiedDirectQueryAnswer } = await import(
      "./erp-verified-direct-query"
    );

    const answer = await buildErpVerifiedDirectQueryAnswer({
      userMessage: "ERP 現在有哪些訂單已過交期還沒出貨？請列前 10 筆。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mock.calls[0]?.[1],
    ).toContain("COALESCE(la.remaining_qty, 0) > 0");
    expect(answer).toContain("逾期未出貨最需要先處理的前 10 筆訂單如下");
    expect(answer).toContain("SO20260109 / OOCHAIN：逾期 7 天，待出 60");
    expect(answer).toContain("\"erp-overdue-unshipped-orders\"");
  });

  it("prefers overdue-summary over generic order-status summary for mixed overdue/status wording", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        { due_status: "已逾期", total_count: 6 },
        { due_status: "未逾期", total_count: 9 },
      ],
      error: null,
    });

    const { buildErpVerifiedDirectQueryAnswer } = await import(
      "./erp-verified-direct-query"
    );

    const answer = await buildErpVerifiedDirectQueryAnswer({
      userMessage: "請幫我用圖表呈現 ERP 訂單交期逾期狀態分布。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mock.calls[0]?.[1],
    ).toContain("AS due_status");
    expect(answer).toContain("訂單交期逾期概況如下");
    expect(answer).toContain("\"erp-overdue-status\"");
  });

  it("answers ERP picking-status summary requests from SO rows and emits report-json", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        { status_code: "READY", total_count: 5 },
        { status_code: "PICKED", total_count: 3 },
      ],
      error: null,
    });

    const { buildErpVerifiedDirectQueryAnswer } = await import(
      "./erp-verified-direct-query"
    );

    const answer = await buildErpVerifiedDirectQueryAnswer({
      userMessage: "請幫我用圖表呈現 ERP 揀貨狀態分布。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mock.calls[0]?.[1],
    ).toContain("COALESCE(picking_status, 'UNKNOWN')");
    expect(answer).toContain("揀貨狀態分布如下");
    expect(answer).toContain("READY：5 筆");
    expect(answer).toContain("\"erp-picking-status\"");
  });

  it("answers ERP invoice-status summary requests from SO rows and emits report-json", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        { status_code: "PENDING", total_count: 4 },
        { status_code: "ISSUED", total_count: 2 },
      ],
      error: null,
    });

    const { buildErpVerifiedDirectQueryAnswer } = await import(
      "./erp-verified-direct-query"
    );

    const answer = await buildErpVerifiedDirectQueryAnswer({
      userMessage: "請幫我用圖表呈現 ERP 開票狀態分布。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mock.calls[0]?.[1],
    ).toContain("COALESCE(invoice_status, 'UNKNOWN')");
    expect(answer).toContain("開票狀態分布如下");
    expect(answer).toContain("PENDING：4 筆");
    expect(answer).toContain("\"erp-invoice-status\"");
  });

  it("returns text-only fallback when ERP status summary has no aggregate rows", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [],
      error: null,
    });

    const { buildErpVerifiedDirectQueryAnswer } = await import(
      "./erp-verified-direct-query"
    );

    const answer = await buildErpVerifiedDirectQueryAnswer({
      userMessage: "請幫我用圖表呈現 ERP 揀貨狀態分布。",
    });

    expect(answer).toContain("目前沒有可聚合的狀態資料列");
    expect(answer).not.toContain("```report-json");
  });

  it("returns text-only fallback when ERP overdue-unshipped exception query has no rows", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [],
      error: null,
    });

    const { buildErpVerifiedDirectQueryAnswer } = await import(
      "./erp-verified-direct-query"
    );

    const answer = await buildErpVerifiedDirectQueryAnswer({
      userMessage: "ERP 現在有哪些訂單已過交期還沒出貨？請列前 10 筆。",
    });

    expect(answer).toContain("目前沒有符合條件的逾期未出貨訂單");
    expect(answer).not.toContain("```report-json");
  });

  it("does not intercept non-count ERP questions", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    const { buildErpVerifiedDirectQueryAnswer } = await import(
      "./erp-verified-direct-query"
    );

    const answer = await buildErpVerifiedDirectQueryAnswer({
      userMessage: "請幫我查 ERP 庫存狀態，並用圖表呈現。",
    });

    expect(answer).toBeNull();
    expect(duckdbQueryExternalPgAsyncDetailed).not.toHaveBeenCalled();
  });

  it("does not intercept ERP write-like requests that mention quantity", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    const { buildErpVerifiedDirectQueryAnswer } = await import(
      "./erp-verified-direct-query"
    );

    const answer = await buildErpVerifiedDirectQueryAnswer({
      userMessage: "請幫我更新 ERP 庫存數量，並建立一筆調整紀錄。",
    });

    expect(answer).toBeNull();
    expect(duckdbQueryExternalPgAsyncDetailed).not.toHaveBeenCalled();
  });

  it("routes SO-specific quantity questions to the single-order summary path instead of global ERP order counts", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        {
          company_id: "C01",
          site_id: "S01",
          so_id: "SO20260101",
          customer_id: "CU001",
          customer_name: "OOCHAIN",
          so_date: "2026-01-01",
          so_delivery_date: "2026-01-15",
          subtotal_amt: 1000,
          tax_amt: 50,
          freight_amt: 20,
          total_amt: 1070,
          order_status: "10",
          picking_status: "READY",
          shipping_status: "PARTIAL",
          invoice_status: "PENDING",
          line_count: 3,
          ordered_qty: 120,
          picked_qty: 80,
          shipped_qty: 60,
          returned_qty: 0,
          remaining_qty: 60,
          shipment_progress_bucket: "PARTIALLY_SHIPPED",
        },
      ],
      error: null,
    });
    const { buildErpVerifiedDirectQueryAnswer } = await import(
      "./erp-verified-direct-query"
    );

    const answer = await buildErpVerifiedDirectQueryAnswer({
      userMessage: "SO20260101 出貨多少了？",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mock.calls[0]?.[1],
    ).toContain("WITH line_agg AS");
    expect(answer).toContain("訂單 SO20260101 的摘要如下");
  });

  it("returns a safe ERP unavailable reply when DB config is missing", async () => {
    delete process.env.ERP_PG_CONNECTION;
    delete process.env.OPENCLAW_ERP_PG_CONNECTION;
    delete process.env.ERP_POSTGRES_CONNECTION;

    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    const { buildErpVerifiedDirectQueryAnswer } = await import(
      "./erp-verified-direct-query"
    );

    const answer = await buildErpVerifiedDirectQueryAnswer({
      userMessage: "可以幫我用圖表呈現一下 ERP 目前有多少客戶嗎？",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).not.toHaveBeenCalled();
    expect(answer).toContain("目前 ERP 資料連線尚未啟用");
    expect(answer).not.toContain("password=");
  });
});
