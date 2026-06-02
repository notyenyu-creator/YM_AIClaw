import { beforeEach, describe, expect, it, vi } from "vitest";

const fileStore = new Map<string, string>();

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

vi.mock("@/lib/workspace", () => ({
  resolveWorkspaceRoot: vi.fn(() => "/virtual/workspace"),
  duckdbQueryExternalPgAsync: vi.fn(
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
        if (sql.includes('FROM enms.public."sites"') && sql.includes("ILIKE")) {
          return [
            {
              site_id: "site001",
              site_name: "大溪廠",
              company_no: "Pingroun",
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
            latest_summary_time: "2026-06-02 12:00:00+08",
          },
        ];
      }

      return [];
    },
  ),
}));

describe("domain bootstrap snapshots", () => {
  beforeEach(() => {
    fileStore.clear();
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

  it("decorates the prompt with a compact bootstrap snapshot", async () => {
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
});
