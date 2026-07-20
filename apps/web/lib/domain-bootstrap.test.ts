import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fileStore = new Map<string, string>();
const TEST_ENMS_CONNECTION =
  "host=enms-db.internal port=55433 dbname=EnMS user=test password=secret sslmode=disable";
const TEST_YCRM_CONNECTION =
  "dbname=default user=test password=secret host=localhost port=5432";
const TEST_ERP_CONNECTION =
  "host=118.168.188.27 port=5433 dbname=ErpUAT_local user=test password=secret sslmode=disable";
const ORIGINAL_ENV = { ...process.env };

vi.mock("node:fs", () => ({
  existsSync: vi.fn((target: string) => fileStore.has(String(target))),
  readFileSync: vi.fn((target: string) => {
    const value = fileStore.get(String(target));
    if (value == null) {
      throw new Error(`ENOENT: ${target}`);
    }
    return value;
  }),
}));

vi.mock("@/lib/workspace", () => {
  const duckdbQueryExternalPgAsync = vi.fn(
    async (connectionString: string, sql: string) => {
      if (connectionString.includes("ErpUAT_local")) {
        if (sql.includes("information_schema.columns")) {
          return [
            { table_name: "SO", column_name: "company_id" },
            { table_name: "SO", column_name: "site_id" },
            { table_name: "SO", column_name: "so_id" },
            { table_name: "SO", column_name: "customer_id" },
            { table_name: "SO", column_name: "cancelled_at" },
            { table_name: "B_CUSTOMER", column_name: "customer_id" },
            { table_name: "B_CUSTOMER", column_name: "customer_name" },
            { table_name: "INVENTORY", column_name: "item_id" },
            { table_name: "INVENTORY", column_name: "available_qty" },
          ];
        }
        return [
          {
            company_count: 1,
            site_count: 1,
            customer_count: 11,
            so_count: 23,
            inventory_count: 42,
          },
        ];
      }

      if (connectionString.includes("dbname=EnMS")) {
        if (sql.includes("information_schema.columns")) {
          return [
            { table_name: "DeviceDataSummaryView", column_name: "RecordTime" },
            { table_name: "DeviceDataSummaryView", column_name: "MaxDemand" },
            { table_name: "DeviceDataSummaryView", column_name: "TotalConsumption" },
            { table_name: "mqtt_raw_data", column_name: "timestamp" },
            { table_name: "mqtt_raw_data", column_name: "ps" },
            { table_name: "PowerAccounts", column_name: "AccountId" },
            { table_name: "PowerAccounts", column_name: "CurrentPlanId" },
            { table_name: "sites", column_name: "site_id" },
            { table_name: "sites", column_name: "site_name" },
            { table_name: "DemandAlertHistory", column_name: "ContractCapacity" },
          ];
        }
        if (
          sql.includes('SELECT site_id, site_name, company_no') &&
          sql.includes('FROM enms.public."sites"') &&
          sql.includes("LIMIT 50")
        ) {
          return [
            { site_id: "site001", site_name: "大溪廠", company_no: "Pingroun" },
            { site_id: "site002", site_name: "蘆竹廠", company_no: "Pingroun" },
          ];
        }
        if (sql.includes('FROM enms.public."sites"') && sql.includes("ILIKE")) {
          return [
            {
              site_id: "site001",
              site_name: "大溪廠",
              company_no: "Pingroun",
            },
          ];
        }
        if (sql.includes('WITH ranked AS (') && sql.includes('"DemandAlertHistory"')) {
          return [
            {
              site_name: "大溪廠",
              AccountNumber: "1234567890",
              AlertTime: "2026-06-06 01:57:47+08",
              CurrentDemand: 89.19,
              ContractCapacity: 10,
              UtilizationRate: 891.86,
              AlertType: "Alert_5",
            },
          ];
        }
        if (sql.includes('AVG(v."AvgPowerFactor") AS avg_pf')) {
          return [
            { site_name: "大溪廠", avg_pf: 0.6764, min_pf: 0.002, point_count: 10360 },
            { site_name: "蘆竹廠", avg_pf: 0.9949, min_pf: 0.666, point_count: 8470 },
          ];
        }
        if (sql.includes("WITH recent AS (") && sql.includes("kwh_per_floor_area_30d")) {
          return [
            {
              site_id: "site001",
              site_name: "大溪廠",
              company_name: "屏榮食品",
              summary_points: 120,
              total_kwh_30d: 12500.25,
              peak_kw_30d: 512.2,
              avg_pf_30d: 0.91,
              kwh_per_floor_area_30d: 32.5,
              kwh_per_employee_30d: 210.1,
            },
            {
              site_id: "site002",
              site_name: "蘆竹廠",
              company_name: "屏榮食品",
              summary_points: 118,
              total_kwh_30d: 9800.4,
              peak_kw_30d: 420.8,
              avg_pf_30d: 0.96,
              kwh_per_floor_area_30d: 28.1,
              kwh_per_employee_30d: 188.4,
            },
          ];
        }
        if (sql.includes("GROUP BY s.site_name, meter_alias, v.\"CircuitSeq\"")) {
          return [
            { site_name: "大溪廠", meter_alias: "主電錶", circuit_seq: 1, total_kwh: 271.47 },
            { site_name: "大溪廠", meter_alias: "M2100預設-2", circuit_seq: 2, total_kwh: 76.95 },
          ];
        }
        if (sql.includes('GROUP BY "AlertType"')) {
          return [
            { AlertType: "Alert_4", alert_count: 313 },
            { AlertType: "Alert_5", alert_count: 294 },
          ];
        }
        if (
          sql.includes('FROM enms.public."TaipowerBills"') &&
          sql.includes('ORDER BY "AccountNumber", "BillingMonth" DESC')
        ) {
          return [
            { AccountNumber: "8888888888", BillingMonth: "11412", UsageAmount: 74870, TotalAmount: 257240, CurrentAvgRate: 3.4358 },
            { AccountNumber: "8888888888", BillingMonth: "11411", UsageAmount: 79578, TotalAmount: 255299, CurrentAvgRate: 3.2082 },
          ];
        }
        if (sql.includes("WITH site_accounts AS (") && sql.includes("baseline_monthly_bill")) {
          return [
            {
              site_id: "site001",
              site_name: "大溪廠",
              account_count: 2,
              billed_accounts: 1,
              active_plan_count: 1,
              baseline_monthly_bill: 180000,
              baseline_monthly_kwh: 52000,
              avg_bill_rate: 3.46,
              savings_5pct_monthly: 8996,
              savings_10pct_monthly: 17992,
            },
          ];
        }
        return [
          {
            site_count: 3,
            gateway_count: 6,
            meter_count: 8,
            power_account_count: 0,
            demand_alert_count: 0,
            company_count: 1,
            taipower_bill_count: 12,
            price_plan_count: 2,
            price_rate_count: 4,
            latest_summary_time: "2026-06-02 12:00:00+08",
          },
        ];
      }

      return [];
    },
  );

  return {
    resolveWorkspaceRoot: vi.fn(() => "/virtual/workspace"),
    duckdbQueryExternalPgAsync,
    duckdbQueryExternalPgAsyncDetailed: vi.fn(
      async (connectionString: string, sql: string, alias?: string) => ({
        rows: await duckdbQueryExternalPgAsync(connectionString, sql, alias),
        error: null,
      }),
    ),
  };
});

describe("domain bootstrap snapshots", () => {
  beforeEach(() => {
    fileStore.clear();
    process.env.ENMS_PG_CONNECTION = TEST_ENMS_CONNECTION;
    process.env.ENMS_PG_ALLOWED_HOST = "enms-db.internal";
    process.env.ENMS_PG_ALLOWED_PORT = "55433";
    process.env.ENMS_PG_ALLOWED_DATABASE = "EnMS";
    process.env.YCRM_PG_CONNECTION = TEST_YCRM_CONNECTION;
    process.env.ERP_PG_CONNECTION = TEST_ERP_CONNECTION;
    delete process.env.OPENCLAW_ENMS_PG_CONNECTION;
    delete process.env.ENMS_POSTGRES_CONNECTION;
    delete process.env.Y_CRM_PG_CONNECTION;
    delete process.env.OPENCLAW_YCRM_PG_CONNECTION;
    delete process.env.YCRM_POSTGRES_CONNECTION;
    delete process.env.OPENCLAW_ERP_PG_CONNECTION;
    delete process.env.ERP_POSTGRES_CONNECTION;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("builds a Y-CRM bootstrap snapshot from the cached auto-schema file", async () => {
    fileStore.set(
      "/virtual/workspace/skills/ycrm/reference/auto-schema-workspace_3jox.md",
      [
        "# 自動產生的 Schema Reference",
        "- 掃描時間: 2026-06-02 10:00:00",
        "- 標準表: 31 張",
        "- 自訂表: 4 張",
        "",
        "### person",
        "| 欄位 | 型別 | 說明 |",
        "| name | text | 姓名 |",
        "| companyId | uuid | FK |",
        "| workspaceMemberId | uuid | FK |",
        "",
        "### company",
        "| 欄位 | 型別 | 說明 |",
        "| name | text | 名稱 |",
        "| ownerId | uuid | FK |",
      ].join("\n"),
    );

    const { buildDomainBootstrapSnapshot } = await import("./domain-bootstrap");

    const snapshot = await buildDomainBootstrapSnapshot({
      system: "ycrm",
      userMessage: "請整理 Y-CRM 客戶背景",
      pack: {
        planner: {
          system: "ycrm",
          updatedAt: Date.now(),
          validationState: "heuristic",
          intent: "entity_summary",
          confidence: "high",
          shouldRouteToYcrm: true,
          workspaceId: "workspace_3jox",
          needsWorkspaceValidation: false,
          warnings: [],
          blockers: [],
          crossSystem: false,
          targetSystems: [],
        },
        presentation: {
          optional_chart_requested: false,
          chart_render_allowed: false,
          chart_guardrail_reason: null,
          max_chart_panels: 0,
        },
        read_first: [
          "schema/integration-profiles/ycrm.md",
          "skills/ycrm/reference/auto-schema-workspace_3jox.md",
        ],
        references: ["skills/ycrm/reference/auto-schema-workspace_3jox.md"],
        wiki: [],
        playbooks: [],
        memory_keys: [],
        live_query_steps: [],
        execution_hints: [],
      },
    });

    expect(snapshot?.system).toBe("ycrm");
    expect(snapshot?.source).toBe("cached_schema");
    expect(snapshot?.availability).toBe("ready");
    expect(snapshot?.facts.join(" ")).toContain("auto_schema_scanned_at");
    expect(snapshot?.facts.join(" ")).toContain("person:");
  });

  it("builds an ERP bootstrap snapshot from live DB introspection", async () => {
    const { buildDomainBootstrapSnapshot } = await import("./domain-bootstrap");

    const snapshot = await buildDomainBootstrapSnapshot({
      system: "erp",
      userMessage: "請查 ERP 訂單與庫存",
      pack: {
        planner: {
          system: "erp",
          updatedAt: Date.now(),
          intent: "sales_order",
          confidence: "high",
          shouldRouteToErp: true,
          matchedKeywords: ["訂單"],
          warnings: [],
          presentation: {
            optional_chart_requested: false,
            chart_render_allowed: false,
            chart_guardrail_reason: null,
            max_chart_panels: 0,
          },
        },
        presentation: {
          optional_chart_requested: false,
          chart_render_allowed: false,
          chart_guardrail_reason: null,
          max_chart_panels: 0,
        },
        read_first: [],
        references: [],
        wiki: [],
        playbooks: [],
        memory_keys: [],
        live_query_steps: [],
        execution_hints: [],
      },
    });

    expect(snapshot?.system).toBe("erp");
    expect(snapshot?.source).toBe("live_db");
    expect(snapshot?.availability).toBe("ready");
    expect(snapshot?.facts.join(" ")).toContain("SO:");
    expect(snapshot?.facts.join(" ")).toContain("sales_order_count");
  });

  it("blocks ERP bootstrap when live DB introspection fails", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [],
      error:
        "ATTACH 'host=118.168.188.27 port=5433 dbname=ErpUAT_local user=sa password=secret sslmode=disable' AS erp failed",
    });
    const { buildDomainBootstrapSnapshot } = await import("./domain-bootstrap");

    const snapshot = await buildDomainBootstrapSnapshot({
      system: "erp",
      userMessage: "請查 ERP 訂單與庫存",
      pack: {
        planner: {
          system: "erp",
          updatedAt: Date.now(),
          intent: "sales_order",
          confidence: "high",
          shouldRouteToErp: true,
          matchedKeywords: ["訂單"],
          warnings: [],
          presentation: {
            optional_chart_requested: false,
            chart_render_allowed: false,
            chart_guardrail_reason: null,
            max_chart_panels: 0,
          },
        },
        presentation: {
          optional_chart_requested: false,
          chart_render_allowed: false,
          chart_guardrail_reason: null,
          max_chart_panels: 0,
        },
        read_first: [],
        references: ["skills/erp/reference/auto-schema-erp.md"],
        wiki: [],
        playbooks: [],
        memory_keys: [],
        live_query_steps: [],
        execution_hints: [],
      },
    });

    expect(snapshot?.system).toBe("erp");
    expect(snapshot?.source).toBe("unavailable");
    expect(snapshot?.availability).toBe("blocked");
    expect(snapshot?.gaps.join(" ")).not.toContain("password=secret");
    expect(snapshot?.gaps.join(" ")).toContain("ATTACH '<redacted-connection>' AS erp");
  });

  it("builds an EnMS bootstrap snapshot with site match and data-availability cautions", async () => {
    const { buildDomainBootstrapSnapshot } = await import("./domain-bootstrap");

    const snapshot = await buildDomainBootstrapSnapshot({
      system: "enms",
      userMessage: "請分析大溪廠的需量與契約容量風險",
      pack: {
        planner: {
          system: "enms",
          updatedAt: Date.now(),
          intent: "demand_forecast",
          confidence: "high",
          shouldRouteToEnms: true,
          matchedKeywords: ["需量", "契約容量"],
          warnings: [],
          presentation: {
            optional_chart_requested: false,
            chart_render_allowed: false,
            chart_guardrail_reason: null,
            max_chart_panels: 0,
          },
        },
        presentation: {
          optional_chart_requested: false,
          chart_render_allowed: false,
          chart_guardrail_reason: null,
          max_chart_panels: 0,
        },
        read_first: [],
        references: [],
        wiki: [],
        playbooks: [],
        memory_keys: [],
        live_query_steps: [],
        execution_hints: [],
      },
    });

    expect(snapshot?.system).toBe("enms");
    expect(snapshot?.source).toBe("live_db");
    expect(snapshot?.availability).toBe("partial");
    expect(snapshot?.facts.join(" ")).toContain("site_match: 大溪廠");
    expect(snapshot?.gaps.join(" ")).toContain('EnMS table "PowerAccounts" currently has 0 rows');
    expect(snapshot?.gaps.join(" ")).toContain('EnMS table "DemandAlertHistory" currently has 0 rows');
    expect(snapshot?.cautions.join(" ")).toContain("PowerAccounts currently has 0 rows");
    expect(snapshot?.cautions.join(" ")).toContain("DemandAlertHistory currently has 0 rows");
  });

  it("returns a blocked EnMS bootstrap snapshot when DB config is missing", async () => {
    delete process.env.ENMS_PG_CONNECTION;
    delete process.env.OPENCLAW_ENMS_PG_CONNECTION;
    delete process.env.ENMS_POSTGRES_CONNECTION;
    const { buildDomainBootstrapSnapshot } = await import("./domain-bootstrap");

    const snapshot = await buildDomainBootstrapSnapshot({
      system: "enms",
      userMessage: "請分析大溪廠的需量與契約容量風險",
      pack: {
        planner: {
          system: "enms",
          updatedAt: Date.now(),
          intent: "demand_forecast",
          confidence: "high",
          shouldRouteToEnms: true,
          matchedKeywords: ["需量", "契約容量"],
          warnings: [],
          presentation: {
            optional_chart_requested: false,
            chart_render_allowed: false,
            chart_guardrail_reason: null,
            max_chart_panels: 0,
          },
        },
        presentation: {
          optional_chart_requested: false,
          chart_render_allowed: false,
          chart_guardrail_reason: null,
          max_chart_panels: 0,
        },
        read_first: [],
        references: [],
        wiki: [],
        playbooks: [],
        memory_keys: [],
        live_query_steps: [],
        execution_hints: [],
      },
    });

    expect(snapshot?.system).toBe("enms");
    expect(snapshot?.source).toBe("unavailable");
    expect(snapshot?.availability).toBe("blocked");
    expect(snapshot?.gaps.join(" ")).toContain("目前 EnMS 資料連線尚未啟用");
  });

  it("returns a blocked EnMS bootstrap snapshot when DB config targets the wrong source", async () => {
    process.env.ENMS_PG_CONNECTION =
      "host=127.0.0.1 port=5432 dbname=enms_27 user=test password=secret sslmode=disable";
    const { buildDomainBootstrapSnapshot } = await import("./domain-bootstrap");

    const snapshot = await buildDomainBootstrapSnapshot({
      system: "enms",
      userMessage: "請分析大溪廠的需量與契約容量風險",
      pack: {
        planner: {
          system: "enms",
          updatedAt: Date.now(),
          intent: "demand_forecast",
          confidence: "high",
          shouldRouteToEnms: true,
          matchedKeywords: ["需量", "契約容量"],
          warnings: [],
          presentation: {
            optional_chart_requested: false,
            chart_render_allowed: false,
            chart_guardrail_reason: null,
            max_chart_panels: 0,
          },
        },
        presentation: {
          optional_chart_requested: false,
          chart_render_allowed: false,
          chart_guardrail_reason: null,
          max_chart_panels: 0,
        },
        read_first: [],
        references: [],
        wiki: [],
        playbooks: [],
        memory_keys: [],
        live_query_steps: [],
        execution_hints: [],
      },
    });

    expect(snapshot?.system).toBe("enms");
    expect(snapshot?.source).toBe("unavailable");
    expect(snapshot?.availability).toBe("blocked");
    expect(snapshot?.gaps.join(" ")).toContain("目前 EnMS 資料來源尚未通過授權目標檢查");
  });

  it("returns a blocked EnMS bootstrap snapshot when live introspection fails", async () => {
    const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");
    vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValueOnce({
      rows: [],
      error:
        "ATTACH 'host=enms-db.internal port=55433 dbname=EnMS user=sa password=secret sslmode=disable' AS enms failed",
    });
    const { buildDomainBootstrapSnapshot } = await import("./domain-bootstrap");

    const snapshot = await buildDomainBootstrapSnapshot({
      system: "enms",
      userMessage: "請找最近 7 天最耗電設備",
      pack: {
        planner: {
          system: "enms",
          updatedAt: Date.now(),
          intent: "natural_language_query",
          confidence: "high",
          shouldRouteToEnms: true,
          matchedKeywords: ["耗電"],
          warnings: [],
          presentation: {
            optional_chart_requested: false,
            chart_render_allowed: false,
            chart_guardrail_reason: null,
            max_chart_panels: 0,
          },
        },
        presentation: {
          optional_chart_requested: false,
          chart_render_allowed: false,
          chart_guardrail_reason: null,
          max_chart_panels: 0,
        },
        read_first: [],
        references: [],
        wiki: [],
        playbooks: [],
        memory_keys: [],
        live_query_steps: [],
        execution_hints: [],
      },
    });

    expect(snapshot?.system).toBe("enms");
    expect(snapshot?.source).toBe("unavailable");
    expect(snapshot?.availability).toBe("blocked");
    expect(snapshot?.gaps.join(" ")).not.toContain("password=secret");
    expect(snapshot?.gaps.join(" ")).toContain("ATTACH '<redacted-connection>' AS enms");
  });

  it("adds multi-site benchmark facts when the planner intent is site_benchmarking", async () => {
    const { buildDomainBootstrapSnapshot } = await import("./domain-bootstrap");

    const snapshot = await buildDomainBootstrapSnapshot({
      system: "enms",
      userMessage: "請比較各場域的能耗與排名。",
      pack: {
        planner: {
          system: "enms",
          updatedAt: Date.now(),
          intent: "site_benchmarking",
          confidence: "high",
          shouldRouteToEnms: true,
          matchedKeywords: ["場域", "排名"],
          warnings: [],
          presentation: {
            optional_chart_requested: false,
            chart_render_allowed: false,
            chart_guardrail_reason: null,
            max_chart_panels: 0,
          },
        },
        presentation: {
          optional_chart_requested: false,
          chart_render_allowed: false,
          chart_guardrail_reason: null,
          max_chart_panels: 0,
        },
        read_first: [],
        references: [],
        wiki: [],
        playbooks: [],
        memory_keys: [],
        live_query_steps: [],
        execution_hints: [],
      },
    });

    expect(snapshot?.facts.join(" ")).toContain("benchmark_window: 30 days");
    expect(snapshot?.facts.join(" ")).toContain("site_benchmark_30d: 大溪廠");
    expect(snapshot?.cautions.join(" ")).toContain("intra-company");
  });

  it("adds ROI readiness and what-if preview facts for efficiency analysis", async () => {
    const { buildDomainBootstrapSnapshot } = await import("./domain-bootstrap");

    const snapshot = await buildDomainBootstrapSnapshot({
      system: "enms",
      userMessage: "請做這個場域的節能 ROI 與 what-if 試算。",
      pack: {
        planner: {
          system: "enms",
          updatedAt: Date.now(),
          intent: "efficiency_analysis",
          confidence: "high",
          shouldRouteToEnms: true,
          matchedKeywords: ["節能", "roi"],
          warnings: [],
          presentation: {
            optional_chart_requested: false,
            chart_render_allowed: false,
            chart_guardrail_reason: null,
            max_chart_panels: 0,
          },
        },
        presentation: {
          optional_chart_requested: false,
          chart_render_allowed: false,
          chart_guardrail_reason: null,
          max_chart_panels: 0,
        },
        read_first: [],
        references: [],
        wiki: [],
        playbooks: [],
        memory_keys: [],
        live_query_steps: [],
        execution_hints: [],
      },
    });

    expect(snapshot?.facts.join(" ")).toContain("roi_readiness: bills=12");
    expect(snapshot?.facts.join(" ")).toContain("roi_preview_fact: site=大溪廠");
    expect(snapshot?.cautions.join(" ")).toContain("scenario estimates");
  });

  it("maps Gregorian bill years into ROC BillingMonth ranges for ROI prompts", async () => {
    const { buildDomainBootstrapSnapshot } = await import("./domain-bootstrap");

    const snapshot = await buildDomainBootstrapSnapshot({
      system: "enms",
      userMessage: "請查 2025 年的節能 ROI 與帳單節省試算。",
      pack: {
        planner: {
          system: "enms",
          updatedAt: Date.now(),
          intent: "efficiency_analysis",
          confidence: "high",
          shouldRouteToEnms: true,
          matchedKeywords: ["節能", "roi", "帳單"],
          warnings: [],
          presentation: {
            optional_chart_requested: false,
            chart_render_allowed: false,
            chart_guardrail_reason: null,
            max_chart_panels: 0,
          },
        },
        presentation: {
          optional_chart_requested: false,
          chart_render_allowed: false,
          chart_guardrail_reason: null,
          max_chart_panels: 0,
        },
        read_first: [],
        references: [],
        wiki: [],
        playbooks: [],
        memory_keys: [],
        live_query_steps: [],
        execution_hints: [],
      },
    });

    expect(snapshot?.facts.join(" ")).toContain(
      "billing_calendar_mapping: gregorian_year=2025 / billing_month_range=11401..11412",
    );
    expect(snapshot?.facts.join(" ")).toContain("requested_year=2025");
  });

  it("adds contract-risk preview facts for EnMS over-contract questions", async () => {
    const { buildDomainBootstrapSnapshot } = await import("./domain-bootstrap");

    const snapshot = await buildDomainBootstrapSnapshot({
      system: "enms",
      userMessage: "阿里山最近 7 天哪些時間點最接近超約？",
      pack: {
        planner: {
          system: "enms",
          updatedAt: Date.now(),
          intent: "demand_forecast",
          confidence: "high",
          shouldRouteToEnms: true,
          matchedKeywords: ["超約"],
          warnings: [],
          presentation: {
            optional_chart_requested: false,
            chart_render_allowed: false,
            chart_guardrail_reason: null,
            max_chart_panels: 0,
          },
        },
        presentation: {
          optional_chart_requested: false,
          chart_render_allowed: false,
          chart_guardrail_reason: null,
          max_chart_panels: 0,
        },
        read_first: [],
        references: [],
        wiki: [],
        playbooks: [],
        memory_keys: [],
        live_query_steps: [],
        execution_hints: [],
      },
    });

    expect(snapshot?.facts.join(" ")).toContain("contract_risk_7d: site=大溪廠");
    expect(snapshot?.facts.join(" ")).toContain("utilization=891.86");
  });

  it("adds power-factor preview facts for site comparison questions", async () => {
    const { buildDomainBootstrapSnapshot } = await import("./domain-bootstrap");

    const snapshot = await buildDomainBootstrapSnapshot({
      system: "enms",
      userMessage: "大溪廠與蘆竹廠最近 30 天平均功率因數是否低於建議值？",
      pack: {
        planner: {
          system: "enms",
          updatedAt: Date.now(),
          intent: "site_benchmarking",
          confidence: "high",
          shouldRouteToEnms: true,
          matchedKeywords: ["功率因數", "比較"],
          warnings: [],
          presentation: {
            optional_chart_requested: false,
            chart_render_allowed: false,
            chart_guardrail_reason: null,
            max_chart_panels: 0,
          },
        },
        presentation: {
          optional_chart_requested: false,
          chart_render_allowed: false,
          chart_guardrail_reason: null,
          max_chart_panels: 0,
        },
        read_first: [],
        references: [],
        wiki: [],
        playbooks: [],
        memory_keys: [],
        live_query_steps: [],
        execution_hints: [],
      },
    });

    expect(snapshot?.facts.join(" ")).toContain("power_factor_30d: site=大溪廠");
    expect(snapshot?.facts.join(" ")).toContain("power_factor_30d: site=蘆竹廠");
  });

  it("decorates the prompt with a full bootstrap snapshot by default", async () => {
    const { decorateMessageWithDomainBootstrapSnapshot } = await import(
      "./domain-bootstrap"
    );

    const decorated = decorateMessageWithDomainBootstrapSnapshot("原始訊息", {
      system: "enms",
      source: "live_db",
      scope: "enms.public",
      availability: "partial",
      facts: ["DeviceDataSummaryView: RecordTime, MaxDemand"],
      joins: ["PowerAccounts.AccountId <- ElectricityMeter.PowerAccountId"],
      cautions: ["READ_ONLY only"],
      gaps: ['PowerAccounts currently has 0 rows'],
      stillAvailable: ["DeviceDataSummaryView trend summary"],
    });

    expect(decorated).toContain("[Domain Bootstrap Snapshot]");
    expect(decorated).toContain("bootstrap.system=enms");
    expect(decorated).toContain("bootstrap.availability=partial");
    expect(decorated).toContain("bootstrap.gaps:");
    expect(decorated).toContain("Never reply with only a vague phrase like '因資料限制'");
    expect(decorated).toContain("bootstrap.response_template_when_partial_or_blocked:");
    expect(decorated).toContain("缺少資料：明確列出缺哪張表");
    expect(decorated).toContain("原始訊息");
  });

  it("supports a compact bootstrap snapshot mode for local models", async () => {
    const { decorateMessageWithDomainBootstrapSnapshot } = await import(
      "./domain-bootstrap"
    );

    const decorated = decorateMessageWithDomainBootstrapSnapshot(
      "原始訊息",
      {
        system: "enms",
        source: "live_db",
        scope: "enms.public",
        availability: "partial",
        facts: [
          "fact-1",
          "fact-2",
          "fact-3",
          "fact-4",
          "fact-5",
        ],
        joins: ["join-1", "join-2", "join-3"],
        cautions: ["caution-1", "caution-2", "caution-3", "caution-4"],
        gaps: ["gap-1", "gap-2", "gap-3", "gap-4"],
        stillAvailable: ["available-1", "available-2", "available-3"],
      },
      { compact: true },
    );

    expect(decorated).toContain("fact-4");
    expect(decorated).not.toContain("fact-5");
    expect(decorated).toContain("join-2");
    expect(decorated).not.toContain("join-3");
    expect(decorated).toContain("gap-3");
    expect(decorated).not.toContain("gap-4");
    expect(decorated).not.toContain("bootstrap.response_template_when_partial_or_blocked:");
  });

  it("prioritizes relevant ROI facts when decorating the prompt", async () => {
    const { decorateMessageWithDomainBootstrapSnapshot } = await import(
      "./domain-bootstrap"
    );

    const decorated = decorateMessageWithDomainBootstrapSnapshot(
      "請查 2025 年的節能 ROI 與帳單節省試算。",
      {
        system: "enms",
        source: "live_db",
        scope: "enms.public",
        availability: "partial",
        facts: [
          "status: sites=2",
          "all_sites: 大溪廠, 蘆竹廠",
          "benchmark_window: 30 days / sites_with_summary=2",
          "site_benchmark_30d: 大溪廠 / total_kwh=12500.25 / peak_kw=512.2 / avg_pf=0.91 / kwh_per_floor_area=32.5 / kwh_per_employee=210.1",
          "billing_calendar_mapping: gregorian_year=2025 / billing_month_range=11401..11412",
          "roi_readiness: bills=12 / plans=2 / rates=4 / sites_with_accounts=1 / requested_year=2025",
          "roi_preview_fact: site=大溪廠 / billed_accounts=1/2 / baseline_bill=180000 / baseline_kwh=52000 / avg_rate=3.46 / savings_5pct=8996 / savings_10pct=17992",
          "bill_trend_fact: account=8888888888 / billing_month=11412 / usage_kwh=74870 / total_amount=257240 / avg_rate=3.4358",
        ],
        joins: ["PowerAccounts.AccountId <- ElectricityMeter.PowerAccountId"],
        cautions: ["READ_ONLY only"],
        gaps: ["Some sites still lack Taipower bill coverage for ROI estimation in 2025: 蘆竹廠"],
        stillAvailable: ["DeviceDataSummaryView trend summary"],
      },
    );

    expect(decorated).toContain("billing_calendar_mapping: gregorian_year=2025");
    expect(decorated).toContain("roi_preview_fact: site=大溪廠");
    expect(decorated).toContain("bill_trend_fact: account=8888888888");
  });
});
