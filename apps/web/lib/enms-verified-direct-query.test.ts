import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_ENMS_CONNECTION =
  "host=enms-db.internal port=55433 dbname=EnMS user=test password=secret sslmode=disable";
const ORIGINAL_ENV = { ...process.env };

function configureEnmsAllowlist() {
  process.env.ENMS_PG_ALLOWED_HOST = "enms-db.internal";
  process.env.ENMS_PG_ALLOWED_PORT = "55433";
  process.env.ENMS_PG_ALLOWED_DATABASE = "EnMS";
}

vi.mock("./workspace", () => ({
  duckdbQueryExternalPgAsyncDetailed: vi.fn(),
}));

describe("buildEnmsVerifiedDirectQueryAnswer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ENMS_PG_CONNECTION = TEST_ENMS_CONNECTION;
    configureEnmsAllowlist();
    delete process.env.OPENCLAW_ENMS_PG_CONNECTION;
    delete process.env.ENMS_POSTGRES_CONNECTION;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("answers exact account demand-alert count from EnMS DB rows and emits report-json", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed)
      .mockResolvedValueOnce({
        rows: [
          {
            demand_alert_count: 2172,
            first_alert_time: "2025-12-10 11:01:45.469099+00",
            latest_alert_time: "2026-05-22 06:28:38.398116+00",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        rows: [
          { alert_type: "Alert_4", alert_count: 1983 },
          { alert_type: "Alert_5", alert_count: 110 },
          { alert_type: "Alert_OverContract", alert_count: 79 },
        ],
        error: null,
      });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage:
        "我要的是DB裡面有多少資料筆數請幫我全部列出來（電號：04043717102 目前有多少筆需量告警紀錄）也可以幫我用圖表呈現出來",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(2);
    expect(answer).toContain("電號 04043717102 目前共有 2,172 筆需量告警紀錄");
    expect(answer).toContain("Alert_4：1,983 筆");
    expect(answer).toContain("Alert_OverContract：79 筆");
    expect(answer).toContain("```report-json");
    expect(answer).toContain("\"sourceDomain\": \"enms\"");
    expect(answer).toContain("\"sourceKind\": \"verified_direct\"");
    expect(answer).toContain("\"rows\"");
    expect(answer).toContain("\"alert_type\": \"Alert_4\"");
  });

  it("returns a safe EnMS unavailable answer when DB config is missing", async () => {
    delete process.env.ENMS_PG_CONNECTION;
    delete process.env.OPENCLAW_ENMS_PG_CONNECTION;
    delete process.env.ENMS_POSTGRES_CONNECTION;

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "可以幫我用圖表呈現一下目前有多少電表嗎？",
    });

    expect(answer).toContain("目前 EnMS 資料連線尚未啟用");
    expect(answer).not.toContain("password=");
    expect(answer).not.toContain("ATTACH");
  });

  it("redacts database credentials from EnMS query errors", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [],
      error:
        "Catalog Error near ATTACH 'host=enms-redaction.internal port=55433 dbname=EnMS user=sa password=secret sslmode=disable' AS enms",
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "可以幫我用圖表呈現一下目前有多少電表嗎？",
    });

    expect(answer).toContain("ATTACH '<redacted-connection>' AS enms");
    expect(answer).not.toContain("password=secret");
  });

  it("does not intercept broader EnMS trend questions", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "請問我在2026年1月到今天的能源趨勢分析可以提供給我嗎？",
    });

    expect(answer).not.toBeNull();
    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
  });

  it("answers EnMS bill-trend prompts from local billing rows and emits report-json", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        {
          period: "2026-01",
          bill_count: 1,
          account_count: 1,
          total_kwh: 1200.5,
          total_bill: 4200,
          avg_rate: 3.4985,
        },
        {
          period: "2026-02",
          bill_count: 1,
          account_count: 1,
          total_kwh: 1188.2,
          total_bill: 4310,
          avg_rate: 3.6273,
        },
      ],
      error: null,
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "電號 8888888888 最近 6 期台電帳單趨勢如何？請用圖表呈現。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    const sql = vi.mocked(duckdbQueryExternalPgAsyncDetailed).mock.calls[0]?.[1] ?? "";
    expect(sql).toContain('AND pa."AccountNumber" = \'8888888888\'');
    expect(answer).toContain("最近 6 期台電帳單趨勢已整理完成");
    expect(answer).toContain("最新期 2026-02");
    expect(answer).toContain("\"enms-bill-trend-amount\"");
  });

  it("does not let bill-trend prompts get intercepted by site bill ranking", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [],
      error: null,
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "阿里山最近 6 期台電帳單趨勢如何？請用圖表呈現。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(answer).toContain("不能用 DB 產出帳單趨勢圖");
    expect(answer).not.toContain("電費 / 用電排行");
  });

  it("answers meter count requests from EnMS DB rows and emits report-json", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [{ total_count: 128 }],
      error: null,
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "可以幫我用圖表呈現一下目前有多少電表嗎？",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(answer).toContain("目前共有 128 個電表");
    expect(answer).toContain("```report-json");
    expect(answer).toContain("\"meter_count-bar\"");
    expect(answer).toContain("\"type\": \"bar\"");
  });

  it("answers year-based ROI requests from EnMS billing rows and emits report-json", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        {
          site_name: "阿里山",
          account_count: 1,
          billed_accounts: 1,
          bill_count: 12,
          baseline_kwh: 1006863,
          baseline_bill: 3592971,
          avg_rate: 3.5685,
          savings_5pct: 179648.55,
          savings_10pct: 359297.1,
        },
        {
          site_name: "洋銘資訊",
          account_count: 2,
          billed_accounts: 2,
          bill_count: 12,
          baseline_kwh: 17177,
          baseline_bill: 57638,
          avg_rate: 3.3556,
          savings_5pct: 2881.9,
          savings_10pct: 5763.8,
        },
      ],
      error: null,
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "可以查2025年 的節能ROI嗎？也可以幫我用圖表呈現出來。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(answer).toContain("2025 年節能 ROI 的年度帳單基線試算");
    expect(answer).toContain("阿里山");
    expect(answer).toContain("節電 5% 約省 NT$ 179,649");
    expect(answer).toContain("真正投資回收期");
    expect(answer).toContain("```report-json");
    expect(answer).toContain("\"savings_10pct_ntd\"");
  });

  it("answers recent alert type summary from DemandAlertHistory and emits report-json", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        {
          alert_type: "Alert_4",
          alert_count: 313,
          first_alert_time: "2026-06-04 09:00:00+08",
          latest_alert_time: "2026-06-10 18:00:00+08",
        },
        {
          alert_type: "Alert_5",
          alert_count: 294,
          first_alert_time: "2026-06-04 10:00:00+08",
          latest_alert_time: "2026-06-10 18:05:00+08",
        },
      ],
      error: null,
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "最近 7 天最常見的 EnMS 告警類型是什麼？請列出各類型筆數。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(answer).toContain("最近 7 天共有 607 筆告警紀錄");
    expect(answer).toContain("Alert_4：313 筆");
    expect(answer).toContain("Alert_5：294 筆");
    expect(answer).toContain("DemandAlertHistory.AlertTime、AlertType");
    expect(answer).toContain("```report-json");
  });

  it("answers raw and summary layer freshness from EnMS DB rows", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        {
          latest_raw_time: "2026-06-10 11:55:15.560649+08",
          raw_rows_1d: 3344,
          latest_summary_time: "2026-06-10 11:45:00+08",
          summary_rows_1d: 175,
        },
      ],
      error: null,
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage:
        "raw layer 與 summary layer 最近是否都有更新？請列出最新資料時間與近 1 天筆數。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(answer).toContain("raw layer（mqtt_raw_data）：最新資料時間 2026-06-10 11:55:15.560649+08；近 1 天 3,344 筆");
    expect(answer).toContain("summary layer（DeviceDataSummaryView）：最新資料時間 2026-06-10 11:45:00+08；近 1 天 175 筆");
    expect(answer).toContain("raw layer 與 summary layer 目前都有更新");
    expect(answer).toContain("mqtt_raw_data.timestamp、DeviceDataSummaryView.RecordTime");
  });

  it("answers recent alert governance summaries from EnMS DB rows", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        {
          account_number: "1234567890",
          alert_type: "Alert_5",
          alert_count: 276,
          max_utilization: 891.86,
          max_demand: 89.19,
          contract_capacity: 10,
        },
      ],
      error: null,
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage:
        "請整理最近 7 天的 EnMS 告警與預警摘要，區分需要立即處理、持續觀察與可抑制的項目，並提供治理建議。",
    });

    expect(answer).toContain("最近 7 天共有 276 筆告警 / 預警紀錄");
    expect(answer).toContain("需要立即處理");
    expect(answer).toContain("deadband / hysteresis / escalation window");
  });

  it("answers contract-capacity risk ranking from EnMS DB rows", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        {
          site_name: "阿里山",
          account_number: "1234567890",
          max_utilization: 894.32,
          max_demand: 90.63,
          contract_capacity: 15,
          latest_alert_time: "2026-06-10 11:48:30+08",
        },
      ],
      error: null,
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "哪個電號最近最接近或超過契約容量？請列出電號、最高使用率、最大需量與時間。",
    });

    expect(answer).toContain("最近最接近或超過契約容量的電號");
    expect(answer).toContain("阿里山 / 電號 1234567890");
    expect(answer).toContain("最高使用率 894.32%");
  });

  it("answers site account mapping from EnMS DB rows", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        { site_name: "阿里山", accounts: "1234567890, 8888888888", account_count: 2 },
      ],
      error: null,
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "各場域目前對應哪些主要電號？請列出場域與電號。",
    });

    expect(answer).toContain("目前各場域主要電號");
    expect(answer).toContain("阿里山：2 個電號");
    expect(answer).toContain("PowerAccounts.AccountNumber");
  });

  it("answers top-load ranking from EnMS DB rows", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        {
          site_name: "阿里山",
          meter_name: "主電錶",
          circuit_seq: 1,
          total_kwh: 3454.5,
          peak_kw: 12993.01,
          avg_pf: 0.6896,
        },
      ],
      error: null,
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "阿里山最近 7 天的設備耗電排行如何？請列出 Top 5。",
    });

    expect(answer).toContain("阿里山最近 7 天的設備 / 迴路耗電 Top 1");
    expect(answer).toContain("主電錶");
    expect(answer).toContain("平均功率因數偏低");
  });

  it("explains missing recent top-load data with absolute dates and latest available 7-day fallback", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed)
      .mockResolvedValueOnce({
        rows: [],
        error: null,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            requested_window_start: "2026-06-16 15:10:00+08",
            requested_window_end: "2026-06-23 15:10:00+08",
            earliest_summary_time: "2026-05-21 19:00:00+08",
            latest_summary_time: "2026-06-15 01:45:00+08",
            fallback_window_start: "2026-06-08 01:45:00+08",
            fallback_window_end: "2026-06-15 01:45:00+08",
            summary_rows_requested_window: 0,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            site_name: "阿里山",
            meter_name: "主電錶",
            circuit_seq: 1,
            total_kwh: 3454.5,
            peak_kw: 12993.01,
            avg_pf: 0.6896,
          },
        ],
        error: null,
      });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "請找出最近 7 天最耗電的設備或迴路，列出場域、電表別名、耗電量與需優先關注的原因。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(3);
    expect(answer).toContain("你要求的查詢條件是 全部場域最近 7 天設備 / 迴路耗電排行");
    expect(answer).toContain("實際查詢區間：2026-06-16 15:10:00+08 至 2026-06-23 15:10:00+08");
    expect(answer).toContain("目前這個範圍可見的 summary 資料時間帶為 2026-05-21 19:00:00+08 至 2026-06-15 01:45:00+08");
    expect(answer).toContain("最新可用 7 天（2026-06-08 01:45:00+08 至 2026-06-15 01:45:00+08）");
    expect(answer).toContain("主電錶");
    expect(answer).toContain("請查 2026-06-01 到 2026-06-15 的設備 / 迴路耗電排行");
  });

  it("does not render unknown scoped top-load availability as an invalid time range", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed)
      .mockResolvedValueOnce({
        rows: [],
        error: null,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            requested_window_start: "2026-06-16 15:10:00+08",
            requested_window_end: "2026-06-23 15:10:00+08",
            earliest_summary_time: null,
            latest_summary_time: null,
            fallback_window_start: null,
            fallback_window_end: null,
            summary_rows_requested_window: 0,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        rows: [],
        error: null,
      });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "阿里山最近 7 天的設備耗電排行如何？請列出 Top 5。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(3);
    expect(answer).toContain("實際查詢區間：2026-06-16 15:10:00+08 至 2026-06-23 15:10:00+08");
    expect(answer).toContain("目前「阿里山」也沒有可補查的 summary 資料時間帶");
    expect(answer).toContain("補查「阿里山」最新可用資料後，仍沒有可用的耗電排行資料");
    expect(answer).not.toContain("無資料 至 無資料");
  });

  it("answers top-load ranking with explicit date ranges", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        {
          site_name: "阿里山",
          meter_name: "主電錶",
          circuit_seq: 1,
          total_kwh: 3454.5,
          peak_kw: 12993.01,
          avg_pf: 0.6896,
        },
      ],
      error: null,
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "請查 2026-06-01 到 2026-06-15 的設備耗電排行，列出最耗電電表。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    const sql = vi.mocked(duckdbQueryExternalPgAsyncDetailed).mock.calls[0]?.[1] ?? "";
    expect(sql).toContain("DATE '2026-06-01'");
    expect(sql).toContain("DATE '2026-06-15' + INTERVAL '1 day'");
    expect(answer).toContain("全部場域 2026-06-01 到 2026-06-15的設備 / 迴路耗電 Top 1");
    expect(answer).toContain("主電錶");
  });

  it("answers recent anomaly and power-quality questions from summary and raw rows", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed)
      .mockResolvedValueOnce({
        rows: [
          {
            site_name: "阿里山",
            meter_name: "主電錶",
            circuit_seq: 1,
            summary_points: 10,
            max_demand: 75.462,
            avg_pf: 0.63823,
            min_pf: 0.311,
            excluded_samples: 0,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            site_name: "阿里山",
            meter_name: "主電錶",
            circuit_seq: 1,
            raw_points: 144,
            disconnected_count: 0,
            abnormal_quality_count: 144,
            low_pf_count: 131,
            max_voltage_thd: 0,
          },
        ],
        error: null,
      });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage:
        "請用 EnMS 資料分析阿里山最近 24 小時有哪些異常用電、功因或電力品質問題，並提供可能根因與排查建議。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(2);
    expect(answer).toContain("最近 24 小時異常 / 功因 / 電力品質重點");
    expect(answer).toContain("summary layer 判讀");
    expect(answer).toContain("raw layer 檢查");
    expect(answer).toContain("平均功因 0.6382 低於 0.9");
    expect(answer).toContain("低功因訊號 131 筆");
    expect(answer).toContain("此回答只使用本地 EnMS DB");
  });

  it("answers recent peak-demand ranking questions from EnMS DB rows", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        {
          site_name: "阿里山",
          meter_name: "主電錶",
          circuit_seq: 1,
          peak_kw: 12993.01,
          peak_time: "2026-06-10 11:45:00+08",
        },
      ],
      error: null,
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "哪個場域最近 30 天最大需量最高？請列出時間與數值。",
    });

    expect(answer).toContain("最近 30 天場域最大需量排行");
    expect(answer).toContain("阿里山：最大需量 12,993.01 kW");
    expect(answer).toContain("DeviceDataSummaryView.RecordTime");
  });

  it("answers savings scenario questions from latest local billing year", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        {
          site_name: "阿里山",
          gregorian_year: 2025,
          billed_accounts: 1,
          bill_count: 12,
          baseline_kwh: 1006863,
          baseline_bill: 3592971,
          savings_5pct_kwh: 50343.15,
          savings_10pct_kwh: 100686.3,
          savings_5pct_ntd: 179648.55,
          savings_10pct_ntd: 359297.1,
        },
      ],
      error: null,
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "阿里山如果節電 5% / 10%，大約能省多少？請用本地 EnMS 帳單資料估算。",
    });

    expect(answer).toContain("最新可用帳單年度估算節電 5% / 10%");
    expect(answer).toContain("阿里山（2025）");
    expect(answer).toContain("節電 5% 約省 50,343.15 kWh / NT$ 179,649");
    expect(answer).toContain("此回答只使用本地 EnMS DB");
  });

  it("answers latest bill ranking questions from EnMS billing rows", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        {
          site_name: "阿里山",
          gregorian_year: 2025,
          billed_accounts: 1,
          bill_count: 12,
          baseline_kwh: 1006863,
          baseline_bill: 3592971,
          savings_5pct_kwh: 50343.15,
          savings_10pct_kwh: 100686.3,
          savings_5pct_ntd: 179648.55,
          savings_10pct_ntd: 359297.1,
        },
        {
          site_name: "洋銘資訊",
          gregorian_year: 2025,
          billed_accounts: 2,
          bill_count: 12,
          baseline_kwh: 17177,
          baseline_bill: 57638,
          savings_5pct_kwh: 858.85,
          savings_10pct_kwh: 1717.7,
          savings_5pct_ntd: 2881.9,
          savings_10pct_ntd: 5763.8,
        },
      ],
      error: null,
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "哪個場域最新年度電費最高？請用圖表呈現各場域電費排行。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(answer).toContain("2025 年台電帳單 baseline 的電費 / 用電排行");
    expect(answer).toContain("1. 阿里山：年度電費 NT$ 3,592,971");
    expect(answer).toContain("2. 洋銘資訊：年度電費 NT$ 57,638");
    expect(answer).toContain("```report-json");
    expect(answer).toContain("\"enms-site-bill-ranking\"");
    expect(answer).toContain("\"baseline_bill\"");
    expect(answer).toContain("\"baseline_kwh\"");
  });

  it("answers EnMS energy trend questions with a verified time-series report", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        { period: "2026-01", total_kwh: 5707.52, peak_kw: 57, avg_pf: 0.9821 },
        { period: "2026-02", total_kwh: 5696.46, peak_kw: 55, avg_pf: 0.9784 },
        { period: "2026-03", total_kwh: 6033.12, peak_kw: 58, avg_pf: 0.9812 },
      ],
      error: null,
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "請問我在2026年1月到今天的能源趨勢分析可以提供給我嗎？也可以幫我用圖表呈現出來。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(answer).toContain("能源趨勢已整理完成");
    expect(answer).toContain("時間粒度：月");
    expect(answer).toContain("最新區間 2026-03：用電 6,033.12 kWh");
    expect(answer).toContain("```report-json");
    expect(answer).toContain("\"enms-energy-trend-kwh\"");
    expect(answer).toContain("\"enms-energy-trend-demand\"");
    expect(answer).toContain("\"enms-energy-trend-pf\"");
  });

  it("does not let ROI prompts get intercepted by energy trend detection", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        {
          site_name: "阿里山",
          account_count: 1,
          billed_accounts: 1,
          bill_count: 12,
          baseline_kwh: 1006863,
          baseline_bill: 3592971,
          avg_rate: 3.5685,
          savings_5pct: 179648.55,
          savings_10pct: 359297.1,
        },
      ],
      error: null,
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "可以查 2025 年節能 ROI 趨勢分析圖嗎？",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(answer).toContain("2025 年節能 ROI 的年度帳單基線試算");
    expect(answer).not.toContain("能源趨勢已整理完成");
  });

  it("answers EnMS explicit date-range energy trend questions without falling back", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        { period: "2026-01-01", total_kwh: 5707.52, peak_kw: 57, avg_pf: 0.9821 },
        { period: "2026-01-02", total_kwh: 5696.46, peak_kw: 55, avg_pf: 0.9784 },
      ],
      error: null,
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "請用 EnMS 資料分析 2026-01-01 到 2026-01-02 的能源趨勢，並用圖表呈現。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    const sql = vi.mocked(duckdbQueryExternalPgAsyncDetailed).mock.calls[0]?.[1] ?? "";
    expect(sql).toContain("DATE '2026-01-01'");
    expect(sql).toContain("DATE '2026-01-02' + INTERVAL '1 day'");
    expect(answer).toContain("能源趨勢已整理完成");
    expect(answer).toContain("時間粒度：日");
    expect(answer).toContain("最新區間 2026-01-02：用電 5,696.46 kWh");
  });

  it("does not misroute site KPI questions into asset counts", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        {
          site_name: "阿里山",
          total_kwh: 1006863,
          peak_kw: 12993.01,
          avg_pf: 0.9123,
          min_pf: 0.8012,
          point_count: 1440,
        },
      ],
      error: null,
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "最近 30 天各場域總用電是多少？請做比較。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(answer).toContain("最近 30 天場域 benchmarking");
    expect(answer).toContain("總用電 1,006,863 kWh");
    expect(answer).not.toContain("目前共有");
  });

  it("keeps peak-demand ranking questions on the peak-demand path when phrased as ranking", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        {
          site_name: "阿里山",
          meter_name: "主電錶",
          circuit_seq: 1,
          peak_kw: 12993.01,
          peak_time: "2026-06-10 11:45:00+08",
        },
      ],
      error: null,
    });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "最近 30 天最大需量排名，列出時間與數值。",
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(answer).toContain("最近 30 天場域最大需量排行");
    expect(answer).toContain("時間 2026-06-10 11:45:00+08");
    expect(answer).not.toContain("場域 benchmarking");
  });

  it("answers executive briefs and quick wins from combined EnMS DB rows", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed)
      .mockResolvedValueOnce({
        rows: [
          {
            site_name: "阿里山",
            account_number: "1234567890",
            max_utilization: 894.32,
            max_demand: 90.63,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            site_name: "阿里山",
            meter_name: "主電錶",
            total_kwh: 3454.5,
            peak_kw: 12993.01,
            avg_pf: 0.6896,
          },
        ],
        error: null,
      });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "老闆問今天能管有什麼重點，我要怎麼用三句話回報？",
    });

    expect(answer).toContain("可以用這三句話回報");
    expect(answer).toContain("最高契約容量風險");
    expect(answer).toContain("查詢依據：DemandAlertHistory");
  });

  it("answers quick win questions from combined EnMS DB rows", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed)
      .mockResolvedValueOnce({
        rows: [
          {
            site_name: "阿里山",
            account_number: "1234567890",
            max_utilization: 894.32,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            site_name: "阿里山",
            meter_name: "主電錶",
            total_kwh: 3454.5,
            peak_kw: 12993.01,
            avg_pf: 0.6896,
          },
        ],
        error: null,
      });

    const { buildEnmsVerifiedDirectQueryAnswer } = await import(
      "./enms-verified-direct-query"
    );

    const answer = await buildEnmsVerifiedDirectQueryAnswer({
      userMessage: "請幫我找出可能可以節省電費的 quick win。",
    });

    expect(answer).toContain("節省電費 quick win");
    expect(answer).toContain("高耗電迴路排程優化");
    expect(answer).toContain("約可少用 172.73 kWh");
  });
});
