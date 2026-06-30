import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./workspace", () => ({
  duckdbQueryExternalPgAsyncDetailed: vi.fn(),
}));

describe("buildYcrmVerifiedDirectQueryAnswer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("answers Y-CRM customer-company count requests from local DB rows and emits report-json", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [{ total_count: 23 }],
      error: null,
    });

    const { buildYcrmVerifiedDirectQueryAnswer } = await import(
      "./ycrm-verified-direct-query"
    );

    const answer = await buildYcrmVerifiedDirectQueryAnswer({
      userMessage: "請用 Y-CRM 資料幫我用圖表呈現一下目前有多少客戶，不要看 ERP。",
      planner: {
        system: "ycrm",
        updatedAt: Date.now(),
        validationState: "heuristic",
        intent: "entity_summary",
        confidence: "high",
        shouldRouteToYcrm: true,
        workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
        needsWorkspaceValidation: false,
        warnings: [],
        blockers: [],
        crossSystem: false,
        targetSystems: [],
      },
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mock.calls[0]?.[1],
    ).toContain('FROM ycrm."workspace_3joxkr9ofo5hlxjan164egffx"."company"');
    expect(answer).toContain("目前共有 23 家客戶公司");
    expect(answer).toContain("```report-json");
    expect(answer).toContain("\"company_count-bar\"");
  });

  it("answers Y-CRM opportunity amount-trend requests and emits report-json", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        { month: "2026-01", currency: "TWD", total_amount: 120.5 },
        { month: "2026-02", currency: "TWD", total_amount: 88.0 },
        { month: "2026-02", currency: "USD", total_amount: 25.0 },
      ],
      error: null,
    });

    const { buildYcrmVerifiedDirectQueryAnswer } = await import(
      "./ycrm-verified-direct-query"
    );

    const answer = await buildYcrmVerifiedDirectQueryAnswer({
      userMessage: "請用 Y-CRM 工作區資料幫我做最近 12 個月的商機金額趨勢圖表。",
      planner: {
        system: "ycrm",
        updatedAt: Date.now(),
        validationState: "heuristic",
        intent: "opportunity_analysis",
        confidence: "high",
        shouldRouteToYcrm: true,
        workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
        needsWorkspaceValidation: false,
        warnings: [],
        blockers: [],
        crossSystem: false,
        targetSystems: [],
      },
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(answer).toContain("商機金額趨勢已整理完成");
    expect(answer).toContain("TWD：最近一個月份 2026-02 的新增商機總金額為 88 TWD");
    expect(answer).toContain("USD：最近一個月份 2026-02 的新增商機總金額為 25 USD");
    expect(answer).toContain("\"ycrm-opportunity-amount-trend-twd\"");
    expect(answer).toContain("\"ycrm-opportunity-amount-trend-usd\"");
  });

  it("answers Y-CRM opportunity amount-trend requests with explicit date ranges", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        { month: "2026-01-01", currency: "TWD", total_amount: 120.5 },
        { month: "2026-01-02", currency: "TWD", total_amount: 88.0 },
      ],
      error: null,
    });

    const { buildYcrmVerifiedDirectQueryAnswer } = await import(
      "./ycrm-verified-direct-query"
    );

    const answer = await buildYcrmVerifiedDirectQueryAnswer({
      userMessage: "請用 Y-CRM 工作區資料幫我做 2026-01-01 到 2026-01-02 的商機金額趨勢圖表。",
      planner: {
        system: "ycrm",
        updatedAt: Date.now(),
        validationState: "heuristic",
        intent: "opportunity_analysis",
        confidence: "high",
        shouldRouteToYcrm: true,
        workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
        needsWorkspaceValidation: false,
        warnings: [],
        blockers: [],
        crossSystem: false,
        targetSystems: [],
      },
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    const sql = vi.mocked(duckdbQueryExternalPgAsyncDetailed).mock.calls[0]?.[1] ?? "";
    expect(sql).toContain("DATE '2026-01-01'");
    expect(sql).toContain("DATE '2026-01-02' + INTERVAL '1 day'");
    expect(answer).toContain("2026-01-01 到 2026-01-02 商機金額趨勢已整理完成");
    expect(answer).toContain("時間粒度：日");
  });

  it("explains missing opportunity trend data with explicit dates and latest available suggestion", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed)
      .mockResolvedValueOnce({
        rows: [],
        error: null,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            requested_window_start: "2026-06-16",
            requested_window_end: "2026-06-23",
            earliest_created_at: "2026-05-01 09:00:00+08",
            latest_created_at: "2026-06-15 18:30:00+08",
            fallback_window_start: "2026-06-08",
            fallback_window_end: "2026-06-15",
            rows_in_requested_window: 0,
          },
        ],
        error: null,
      });

    const { buildYcrmVerifiedDirectQueryAnswer } = await import(
      "./ycrm-verified-direct-query"
    );

    const answer = await buildYcrmVerifiedDirectQueryAnswer({
      userMessage: "請用 Y-CRM 工作區資料幫我做最近 7 天的商機金額趨勢圖表。",
      planner: {
        system: "ycrm",
        updatedAt: Date.now(),
        validationState: "heuristic",
        intent: "opportunity_analysis",
        confidence: "high",
        shouldRouteToYcrm: true,
        workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
        needsWorkspaceValidation: false,
        warnings: [],
        blockers: [],
        crossSystem: false,
        targetSystems: [],
      },
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(2);
    expect(answer).toContain("最近 7 天商機金額趨勢查詢");
    expect(answer).toContain("實際查詢區間：2026-06-16 至 2026-06-23");
    expect(answer).toContain("opportunity.createdAt 可見資料時間帶為 2026-05-01 09:00:00+08 至 2026-06-15 18:30:00+08");
    expect(answer).toContain("你要求的區間內資料筆數為 0");
    expect(answer).toContain("請查 2026-06-08 到 2026-06-15 的商機金額趨勢圖表");
    expect(answer).not.toContain("```report-json");
  });

  it("answers Y-CRM opportunity stage-amount distribution requests and emits report-json", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        { stage: "OPT0_XU_QIU_QUE_REN", currency: "TWD", total_amount: 250.5 },
        { stage: "OPT2_YI_BAO_JIA", currency: "USD", total_amount: 88 },
      ],
      error: null,
    });

    const { buildYcrmVerifiedDirectQueryAnswer } = await import(
      "./ycrm-verified-direct-query"
    );

    const answer = await buildYcrmVerifiedDirectQueryAnswer({
      userMessage: "請用 Y-CRM 工作區資料幫我做各階段商機金額分布圖表。",
      planner: {
        system: "ycrm",
        updatedAt: Date.now(),
        validationState: "heuristic",
        intent: "opportunity_analysis",
        confidence: "high",
        shouldRouteToYcrm: true,
        workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
        needsWorkspaceValidation: false,
        warnings: [],
        blockers: [],
        crossSystem: false,
        targetSystems: [],
      },
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(answer).toContain("各階段商機金額分布如下");
    expect(answer).toContain("需求確認（TWD）：250.5 TWD");
    expect(answer).toContain("已報價（USD）：88 USD");
    expect(answer).toContain("\"ycrm-opportunity-stage-amount-distribution\"");
  });

  it("answers Y-CRM overview requests from local DB rows and emits report-json", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        { category: "聯絡人", count: 120 },
        { category: "公司", count: 23 },
        { category: "商機", count: 14 },
        { category: "任務", count: 31 },
      ],
      error: null,
    });

    const { buildYcrmVerifiedDirectQueryAnswer } = await import(
      "./ycrm-verified-direct-query"
    );

    const answer = await buildYcrmVerifiedDirectQueryAnswer({
      userMessage: "請用 Y-CRM 資料幫我做一個聯絡人、客戶公司、商機、任務的總覽圖表。",
      planner: {
        system: "ycrm",
        updatedAt: Date.now(),
        validationState: "heuristic",
        intent: "sales_report",
        confidence: "high",
        shouldRouteToYcrm: true,
        workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
        needsWorkspaceValidation: false,
        warnings: [],
        blockers: [],
        crossSystem: false,
        targetSystems: [],
      },
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(answer).toContain("聯絡人 120 位");
    expect(answer).toContain("客戶公司 23 家");
    expect(answer).toContain("商機 14 筆");
    expect(answer).toContain("任務 31 筆");
    expect(answer).toContain("```report-json");
    expect(answer).toContain("\"ycrm-overview-counts\"");
  });

  it("answers Y-CRM opportunity-stage distribution requests and emits report-json", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        { stage: "OPT0_XU_QIU_QUE_REN", total_count: 9 },
        { stage: "OPT2_YI_BAO_JIA", total_count: 4 },
      ],
      error: null,
    });

    const { buildYcrmVerifiedDirectQueryAnswer } = await import(
      "./ycrm-verified-direct-query"
    );

    const answer = await buildYcrmVerifiedDirectQueryAnswer({
      userMessage: "請用 Y-CRM 工作區資料幫我做商機階段分布圖表。",
      planner: {
        system: "ycrm",
        updatedAt: Date.now(),
        validationState: "heuristic",
        intent: "opportunity_analysis",
        confidence: "high",
        shouldRouteToYcrm: true,
        workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
        needsWorkspaceValidation: false,
        warnings: [],
        blockers: [],
        crossSystem: false,
        targetSystems: [],
      },
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(answer).toContain("商機階段分布如下");
    expect(answer).toContain("需求確認：9 筆");
    expect(answer).toContain("已報價：4 筆");
    expect(answer).toContain("```report-json");
    expect(answer).toContain("\"ycrm-opportunity-stage-distribution\"");
  });

  it("answers Y-CRM task-status distribution requests and emits report-json", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        { status: "TODO", total_count: 12 },
        { status: "YI_WAN_CHENG", total_count: 7 },
      ],
      error: null,
    });

    const { buildYcrmVerifiedDirectQueryAnswer } = await import(
      "./ycrm-verified-direct-query"
    );

    const answer = await buildYcrmVerifiedDirectQueryAnswer({
      userMessage: "請用 Y-CRM 工作區資料幫我做任務狀態分布圖表。",
      planner: {
        system: "ycrm",
        updatedAt: Date.now(),
        validationState: "heuristic",
        intent: "sales_report",
        confidence: "high",
        shouldRouteToYcrm: true,
        workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
        needsWorkspaceValidation: false,
        warnings: [],
        blockers: [],
        crossSystem: false,
        targetSystems: [],
      },
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(answer).toContain("任務狀態分布如下");
    expect(answer).toContain("待辦：12 筆");
    expect(answer).toContain("已完成：7 筆");
    expect(answer).toContain("```report-json");
    expect(answer).toContain("\"ycrm-task-status-distribution\"");
  });

  it("answers Y-CRM task-due summary requests and emits report-json", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        { due_status: "已逾期", total_count: 4 },
        { due_status: "正常", total_count: 11 },
      ],
      error: null,
    });

    const { buildYcrmVerifiedDirectQueryAnswer } = await import(
      "./ycrm-verified-direct-query"
    );

    const answer = await buildYcrmVerifiedDirectQueryAnswer({
      userMessage: "請用 Y-CRM 工作區資料幫我做任務到期概況圖表。",
      planner: {
        system: "ycrm",
        updatedAt: Date.now(),
        validationState: "heuristic",
        intent: "sales_report",
        confidence: "high",
        shouldRouteToYcrm: true,
        workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
        needsWorkspaceValidation: false,
        warnings: [],
        blockers: [],
        crossSystem: false,
        targetSystems: [],
      },
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    expect(answer).toContain("任務到期概況如下");
    expect(answer).toContain("已逾期：4 筆");
    expect(answer).toContain("正常：11 筆");
    expect(answer).toContain("\"ycrm-task-due-distribution\"");
  });

  it("returns text-only fallback when Y-CRM task-status summary has no aggregate rows", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [],
      error: null,
    });

    const { buildYcrmVerifiedDirectQueryAnswer } = await import(
      "./ycrm-verified-direct-query"
    );

    const answer = await buildYcrmVerifiedDirectQueryAnswer({
      userMessage: "請用 Y-CRM 工作區資料幫我做任務狀態分布圖表。",
      planner: {
        system: "ycrm",
        updatedAt: Date.now(),
        validationState: "heuristic",
        intent: "sales_report",
        confidence: "high",
        shouldRouteToYcrm: true,
        workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
        needsWorkspaceValidation: false,
        warnings: [],
        blockers: [],
        crossSystem: false,
        targetSystems: [],
      },
    });

    expect(answer).toContain("目前沒有可聚合的任務狀態資料列");
    expect(answer).not.toContain("```report-json");
  });

  it("returns text-only fallback when Y-CRM opportunity stage-amount distribution has no rows", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [],
      error: null,
    });

    const { buildYcrmVerifiedDirectQueryAnswer } = await import(
      "./ycrm-verified-direct-query"
    );

    const answer = await buildYcrmVerifiedDirectQueryAnswer({
      userMessage: "請用 Y-CRM 工作區資料幫我做各階段商機金額分布圖表。",
      planner: {
        system: "ycrm",
        updatedAt: Date.now(),
        validationState: "heuristic",
        intent: "opportunity_analysis",
        confidence: "high",
        shouldRouteToYcrm: true,
        workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
        needsWorkspaceValidation: false,
        warnings: [],
        blockers: [],
        crossSystem: false,
        targetSystems: [],
      },
    });

    expect(answer).toContain("目前沒有可聚合的商機金額資料列");
    expect(answer).not.toContain("```report-json");
  });

  it("stops when the Y-CRM workspace is still unresolved", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    const { buildYcrmVerifiedDirectQueryAnswer } = await import(
      "./ycrm-verified-direct-query"
    );

    const answer = await buildYcrmVerifiedDirectQueryAnswer({
      userMessage: "Y-CRM 目前有多少商機？",
      planner: {
        system: "ycrm",
        updatedAt: Date.now(),
        validationState: "heuristic",
        intent: "opportunity_analysis",
        confidence: "medium",
        shouldRouteToYcrm: true,
        workspaceId: null,
        needsWorkspaceValidation: true,
        warnings: ["person_name_may_be_misread_as_workspace"],
        blockers: [],
        crossSystem: false,
        targetSystems: [],
      },
    });

    expect(duckdbQueryExternalPgAsyncDetailed).not.toHaveBeenCalled();
    expect(answer).toContain("還沒有確認工作區");
    expect(answer).toContain("不會改用模型猜答案");
  });

  it("does not intercept Y-CRM product help requests", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    const { buildYcrmVerifiedDirectQueryAnswer } = await import(
      "./ycrm-verified-direct-query"
    );

    const answer = await buildYcrmVerifiedDirectQueryAnswer({
      userMessage: "Y-CRM 的 LINE 自動回覆要怎麼設定？",
      planner: {
        system: "ycrm",
        updatedAt: Date.now(),
        validationState: "heuristic",
        intent: "product_help",
        confidence: "high",
        shouldRouteToYcrm: true,
        workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
        needsWorkspaceValidation: false,
        warnings: [],
        blockers: [],
        crossSystem: false,
        targetSystems: [],
      },
    });

    expect(answer).toBeNull();
    expect(duckdbQueryExternalPgAsyncDetailed).not.toHaveBeenCalled();
  });

  it("does not misroute stage-trend wording into the generic opportunity amount trend path", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    const { buildYcrmVerifiedDirectQueryAnswer } = await import(
      "./ycrm-verified-direct-query"
    );

    const answer = await buildYcrmVerifiedDirectQueryAnswer({
      userMessage: "請幫我做各階段商機金額趨勢圖。",
      planner: {
        system: "ycrm",
        updatedAt: Date.now(),
        validationState: "heuristic",
        intent: "opportunity_analysis",
        confidence: "high",
        shouldRouteToYcrm: true,
        workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
        needsWorkspaceValidation: false,
        warnings: [],
        blockers: [],
        crossSystem: false,
        targetSystems: [],
      },
    });

    expect(answer).toBeNull();
    expect(duckdbQueryExternalPgAsyncDetailed).not.toHaveBeenCalled();
  });

  it("does not misroute quarter-overview amount prompts into the opportunity amount trend path", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("./workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [
        { category: "聯絡人", count: 120 },
        { category: "公司", count: 23 },
        { category: "商機", count: 14 },
        { category: "任務", count: 31 },
      ],
      error: null,
    });

    const { buildYcrmVerifiedDirectQueryAnswer } = await import(
      "./ycrm-verified-direct-query"
    );

    const answer = await buildYcrmVerifiedDirectQueryAnswer({
      userMessage: "請幫我做 2026 Q1 商機金額總覽圖。",
      planner: {
        system: "ycrm",
        updatedAt: Date.now(),
        validationState: "heuristic",
        intent: "sales_report",
        confidence: "high",
        shouldRouteToYcrm: true,
        workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
        needsWorkspaceValidation: false,
        warnings: [],
        blockers: [],
        crossSystem: false,
        targetSystems: [],
      },
    });

    expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledTimes(1);
    const sql = vi.mocked(duckdbQueryExternalPgAsyncDetailed).mock.calls[0]?.[1] ?? "";
    expect(sql).not.toContain("amountAmountMicros");
    expect(answer).toContain("核心資料查詢");
  });
});
