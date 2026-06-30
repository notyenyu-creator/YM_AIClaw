import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { EnmsContextPack } from "./enms-context-pack";
import type { ErpContextPack } from "./erp-context-pack";
import type { YcrmContextPack } from "./ycrm-context-pack";
import { duckdbQueryExternalPgAsync, resolveWorkspaceRoot } from "./workspace";

const ERP_CONNECTION_STRING =
  "host=118.168.188.27 port=5433 dbname=ErpUAT_local user=erp_local password=erp_local";
const ENMS_CONNECTION_STRING =
  "host=118.168.188.27 port=55433 dbname=EnMS user=sa password=ym@mes42769778 sslmode=disable";

export type DomainBootstrapSystem = "ycrm" | "erp" | "enms";
export type DomainBootstrapSource =
  | "live_db"
  | "reference_file"
  | "cached_schema"
  | "unavailable";

export type DomainBootstrapSnapshot = {
  system: DomainBootstrapSystem;
  source: DomainBootstrapSource;
  scope: string;
  availability: "ready" | "partial" | "blocked";
  facts: string[];
  joins: string[];
  cautions: string[];
  gaps: string[];
  stillAvailable: string[];
};

type BootstrapRequest =
  | {
      system: "ycrm";
      userMessage: string;
      pack: YcrmContextPack;
    }
  | {
      system: "erp";
      userMessage: string;
      pack: ErpContextPack;
    }
  | {
      system: "enms";
      userMessage: string;
      pack: EnmsContextPack;
    };

type ColumnRow = {
  table_name?: string;
  column_name?: string;
};

function pushUnique(target: string[], value: string | null | undefined) {
  if (!value) {
    return;
  }
  if (!target.includes(value)) {
    target.push(value);
  }
}

function normalizeHeading(value: string): string {
  return value.trim().replace(/`/g, "");
}

function sanitizeMarkdownCell(value: string): string {
  return value.replace(/\*\*/g, "").replace(/`/g, "").trim();
}

function resolveWorkspaceFile(relativePath: string): string | null {
  const workspaceRoot = resolveWorkspaceRoot();
  if (!workspaceRoot) {
    return null;
  }
  const absolutePath = join(workspaceRoot, relativePath);
  return existsSync(absolutePath) ? absolutePath : null;
}

function readWorkspaceFile(relativePath: string): string | null {
  const absolutePath = resolveWorkspaceFile(relativePath);
  if (!absolutePath) {
    return null;
  }
  try {
    return readFileSync(absolutePath, "utf-8");
  } catch {
    return null;
  }
}

function extractMetaLine(content: string, label: string): string | null {
  const pattern = new RegExp(`^-\\s*${label}:\\s*(.+)$`, "m");
  return content.match(pattern)?.[1]?.trim() ?? null;
}

function extractMarkdownHeadings(content: string): string[] {
  return Array.from(content.matchAll(/^###\s+(.+)$/gm)).map((match) =>
    normalizeHeading(match[1] ?? ""),
  );
}

function extractMarkdownTableColumns(
  content: string,
  heading: string,
  limit = 6,
): string[] {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingRegex = new RegExp(`^###\\s+${escapedHeading}\\s*$`, "m");
  const match = headingRegex.exec(content);
  if (!match) {
    return [];
  }

  const section = content.slice(match.index + match[0].length).split(/^###\s+/m)[0];
  const columns: string[] = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || trimmed.startsWith("|------")) {
      continue;
    }
    const parts = trimmed
      .split("|")
      .map((part) => sanitizeMarkdownCell(part))
      .filter(Boolean);
    if (parts.length < 2 || parts[0] === "欄位") {
      continue;
    }
    pushUnique(columns, parts[0]);
    if (columns.length >= limit) {
      break;
    }
  }

  return columns;
}

function summarizeHeadingsAsFacts(
  content: string,
  preferredHeadings: string[],
  fallbackLabel: string,
): string[] {
  const headings = extractMarkdownHeadings(content);
  if (headings.length === 0) {
    return [];
  }

  const selected = preferredHeadings.filter((heading) => headings.includes(heading));
  const finalSelection =
    selected.length > 0 ? selected : headings.slice(0, Math.min(headings.length, 4));

  return finalSelection.map((heading) => `${fallbackLabel}: ${heading}`);
}

function summarizeColumnRows(rows: ColumnRow[], preferredTables: string[]): string[] {
  const columnsByTable = new Map<string, string[]>();
  for (const row of rows) {
    const tableName = row.table_name?.trim();
    const columnName = row.column_name?.trim();
    if (!tableName || !columnName) {
      continue;
    }
    const existing = columnsByTable.get(tableName) ?? [];
    if (!existing.includes(columnName)) {
      existing.push(columnName);
    }
    columnsByTable.set(tableName, existing);
  }

  const selectedTables =
    preferredTables.filter((tableName) => columnsByTable.has(tableName)).length > 0
      ? preferredTables.filter((tableName) => columnsByTable.has(tableName))
      : [...columnsByTable.keys()].slice(0, 4);

  return selectedTables.map((tableName) => {
    const columns = (columnsByTable.get(tableName) ?? []).slice(0, 6);
    return `${tableName}: ${columns.join(", ") || "no_columns"}`;
  });
}

function parseQuotedCandidates(message: string): string[] {
  const results: string[] = [];
  for (const match of message.matchAll(/[「『"“](.+?)[」』"”]/g)) {
    pushUnique(results, match[1]?.trim());
  }
  return results;
}

function extractSiteCandidates(message: string): string[] {
  const results = parseQuotedCandidates(message);
  for (const match of message.matchAll(/([\u4e00-\u9fffA-Za-z0-9_-]{2,24}(?:廠|場|站|區))/g)) {
    const candidate = match[1]?.trim();
    if (
      candidate &&
      candidate !== "場域" &&
      candidate !== "廠區" &&
      candidate !== "站點"
    ) {
      pushUnique(results, candidate);
    }
  }
  return results.slice(0, 3);
}

function extractAccountCandidates(message: string): string[] {
  const results: string[] = [];
  for (const match of message.matchAll(/\b\d{8,14}\b/g)) {
    pushUnique(results, match[0]?.trim());
  }
  return results.slice(0, 5);
}

function extractRecentDayWindow(message: string, fallbackDays = 30): number {
  const explicit = message.match(/(?:最近|過去)\s*(\d{1,3})\s*天/);
  if (explicit) {
    const parsed = Number(explicit[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  if (message.includes("今天")) {
    return 1;
  }
  if (message.includes("本月")) {
    return 30;
  }
  return fallbackDays;
}

function extractGregorianYearCandidates(message: string): number[] {
  const years: number[] = [];
  for (const match of message.matchAll(/\b(20\d{2})\b/g)) {
    const year = Number(match[1]);
    if (Number.isFinite(year) && year >= 2000 && year <= 2099) {
      years.push(year);
    }
  }
  return Array.from(new Set(years)).slice(0, 2);
}

function toRocBillingYear(gregorianYear: number): number | null {
  if (!Number.isFinite(gregorianYear) || gregorianYear < 1912) {
    return null;
  }
  return gregorianYear - 1911;
}

function messageIncludesAny(message: string, keywords: string[]): boolean {
  const lower = message.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function formatCountFact(label: string, value: unknown): string | null {
  if (value == null || value === "") {
    return null;
  }
  return `${label}: ${String(value)}`;
}

function formatNumericFact(value: unknown, digits = 2): string | null {
  const normalized =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : null;
  if (normalized == null || !Number.isFinite(normalized)) {
    return null;
  }
  return normalized.toFixed(digits);
}

async function buildYcrmBootstrapSnapshot(
  pack: YcrmContextPack,
): Promise<DomainBootstrapSnapshot | null> {
  const autoSchemaPath =
    pack.read_first.find((entry) => entry.includes("auto-schema-")) ??
    pack.references.find((entry) => entry.includes("auto-schema-"));
  if (!autoSchemaPath) {
    return null;
  }

  const content = readWorkspaceFile(autoSchemaPath);
  if (!content) {
    return {
      system: "ycrm",
      source: "unavailable",
      scope: pack.planner.workspaceId ?? "unresolved_workspace",
      availability: "blocked",
      facts: [
        `workspace: ${pack.planner.workspaceId ?? "unresolved"}`,
        `auto_schema_reference_missing: ${autoSchemaPath}`,
      ],
      joins: [
        "workspaceMember IDs must be resolved before owner/assignee joins.",
      ],
      cautions: [
        "Do not assume CRM field names without the matching workspace auto-schema.",
      ],
      gaps: [
        `Missing auto-schema reference: ${autoSchemaPath}`,
        "Cannot safely confirm Y-CRM field names, owner foreign keys, or table-scoped joins.",
      ],
      stillAvailable: [
        "High-level Y-CRM workflow guidance",
        "Wiki/playbook-based explanation without exact field-level claims",
      ],
    };
  }

  const workspaceId = pack.planner.workspaceId ?? "unresolved";
  const scanTime = extractMetaLine(content, "掃描時間");
  const standardTables = extractMetaLine(content, "標準表");
  const customTables = extractMetaLine(content, "自訂表");
  const facts: string[] = [`workspace: ${workspaceId}`];
  pushUnique(facts, scanTime ? `auto_schema_scanned_at: ${scanTime}` : null);
  pushUnique(facts, standardTables ? `standard_tables: ${standardTables}` : null);
  pushUnique(facts, customTables ? `custom_tables: ${customTables}` : null);

  const intentPreferredTables: Record<string, string[]> = {
    entity_summary: ["person", "company", "workspaceMember", "opportunity"],
    sales_report: ["opportunity", "company", "workspaceMember", "task"],
    line_interaction_review: ["messageChannelMessage", "person", "company"],
    write_intent: ["task", "note", "opportunity"],
    product_help: ["workspaceMember", "person", "company"],
    cross_system_request: ["company", "opportunity", "workspaceMember"],
    unknown: ["company", "person", "opportunity"],
  };

  const selectedTables =
    intentPreferredTables[pack.planner.intent] ?? intentPreferredTables.unknown;
  for (const tableName of selectedTables) {
    const columns = extractMarkdownTableColumns(content, tableName);
    if (columns.length > 0) {
      pushUnique(facts, `${tableName}: ${columns.slice(0, 6).join(", ")}`);
    }
  }

  if (facts.length <= 3) {
    for (const fact of summarizeHeadingsAsFacts(content, selectedTables, "table")) {
      pushUnique(facts, fact);
    }
  }

  return {
    system: "ycrm",
    source: "cached_schema",
    scope: workspaceId,
    availability: "ready",
    facts: facts.slice(0, 6),
    joins: [
      "workspaceMember IDs must be resolved before owner/assignee joins.",
      "Owner/assignee foreign keys are table-scoped from the workspace auto-schema only.",
    ],
    cautions: [
      "Do not assume CRM field names outside the resolved workspace auto-schema.",
      "Do not answer from README-level guesses when the auto-schema is available.",
    ],
    gaps: [],
    stillAvailable: [
      "Entity summary and owner/assignee routing within the resolved workspace",
      "Schema-backed Y-CRM field lookup and relationship explanation",
    ],
  };
}

async function buildErpBootstrapSnapshot(): Promise<DomainBootstrapSnapshot> {
  const columnRows = await duckdbQueryExternalPgAsync<ColumnRow>(
    ERP_CONNECTION_STRING,
    `
      SELECT table_name, column_name
      FROM erp.information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('B_COMPANY', 'B_SITE', 'B_CUSTOMER', 'SO', 'SO_LINE', 'B_ITEM', 'INVENTORY')
      ORDER BY table_name, ordinal_position
    `,
    "erp",
  );

  const countRows = await duckdbQueryExternalPgAsync<Record<string, unknown>>(
    ERP_CONNECTION_STRING,
    `
      SELECT
        (SELECT COUNT(*) FROM erp.public."B_COMPANY") AS company_count,
        (SELECT COUNT(*) FROM erp.public."B_SITE") AS site_count,
        (SELECT COUNT(*) FROM erp.public."B_CUSTOMER") AS customer_count,
        (SELECT COUNT(*) FROM erp.public."SO") AS so_count,
        (SELECT COUNT(*) FROM erp.public."INVENTORY") AS inventory_count
    `,
    "erp",
  );

  const facts: string[] = [];
  const gaps: string[] = [];
  const counts = countRows[0] ?? {};
  pushUnique(facts, formatCountFact("company_count", counts.company_count));
  pushUnique(facts, formatCountFact("site_count", counts.site_count));
  pushUnique(facts, formatCountFact("customer_count", counts.customer_count));
  pushUnique(facts, formatCountFact("sales_order_count", counts.so_count));
  pushUnique(facts, formatCountFact("inventory_row_count", counts.inventory_count));
  if (columnRows.length === 0) {
    pushUnique(
      gaps,
      "Live ERP schema introspection returned 0 rows, so exact table/column confirmation is unavailable.",
    );
  }
  if (Number(counts.so_count ?? 0) === 0) {
    pushUnique(
      gaps,
      'ERP table "SO" currently has 0 rows, so order-trend or order-status summaries may be unavailable.',
    );
  }
  if (Number(counts.inventory_count ?? 0) === 0) {
    pushUnique(
      gaps,
      'ERP table "INVENTORY" currently has 0 rows, so available-stock answers may be unavailable.',
    );
  }
  if (columnRows.length > 0) {
    for (const fact of summarizeColumnRows(columnRows, [
      "B_COMPANY",
      "B_SITE",
      "B_CUSTOMER",
      "SO",
      "SO_LINE",
      "INVENTORY",
    ])) {
      pushUnique(facts, fact);
    }
  }

  if (facts.length === 0) {
    const fallback = readWorkspaceFile("skills/erp/reference/auto-schema-erp.md");
    if (fallback) {
      return {
        system: "erp",
        source: "reference_file",
        scope: "erp.public",
        availability: "partial",
        facts: summarizeHeadingsAsFacts(
          fallback,
          ["B_COMPANY", "B_SITE", "B_CUSTOMER", "SO", "SO_LINE", "INVENTORY"],
          "reference_table",
        ).slice(0, 6),
        joins: [
          "SO.customer_id -> B_CUSTOMER.customer_id",
          "SO_LINE.(company_id, site_id, so_id) -> SO.(company_id, site_id, so_id)",
        ],
        cautions: [
          "Use quoted uppercase table names such as erp.public.\"SO\".",
          "Filter cancelled documents before drawing conclusions.",
        ],
        gaps: [
          "Live ERP introspection was unavailable, so this snapshot is using the cached reference file.",
        ],
        stillAvailable: [
          "Reference-level table and field guidance",
          "Safe SQL pattern guidance for quoted uppercase ERP tables",
        ],
      };
    }
  }

  const availability =
    facts.length === 0 ? "blocked" : gaps.length > 0 ? "partial" : "ready";
  return {
    system: "erp",
    source: facts.length > 0 ? "live_db" : "unavailable",
    scope: "erp.public",
    availability,
    facts: facts.slice(0, 8),
    joins: [
      "SO.customer_id -> B_CUSTOMER.customer_id",
      "SO_LINE.(company_id, site_id, so_id) -> SO.(company_id, site_id, so_id)",
      "INVENTORY.item_id -> B_ITEM.item_id",
    ],
    cautions: [
      "Use quoted uppercase table names such as erp.public.\"SO\".",
      "Filter cancelled documents with cancelled_at IS NULL before conclusions.",
      "Keep ERP in READ_ONLY mode for phase-1 analysis.",
    ],
    gaps,
    stillAvailable: [
      "Company/site scope confirmation",
      "Master-data and schema-level explanation",
      "Any ERP query whose required tables still contain rows",
    ],
  };
}

async function buildEnmsBootstrapSnapshot(
  userMessage: string,
  pack: EnmsContextPack,
): Promise<DomainBootstrapSnapshot> {
  const needsBenchmarkPreview =
    pack.planner.intent === "site_benchmarking" ||
    messageIncludesAny(userMessage, ["benchmark", "benchmarking", "排名"]) ||
    (messageIncludesAny(userMessage, ["比較"]) &&
      messageIncludesAny(userMessage, ["總用電", "最大需量", "功率因數", "用電"])) ||
    (messageIncludesAny(userMessage, ["最大需量最高", "最大需量"]) &&
      messageIncludesAny(userMessage, ["場域", "site", "哪個"]));
  const needsEfficiencyPreview = pack.planner.intent === "efficiency_analysis";
  const needsTopLoadPreview =
    messageIncludesAny(userMessage, ["耗電", "用電排行", "最耗電"]) &&
    messageIncludesAny(userMessage, ["設備", "迴路", "電表", "排行"]);
  const needsContractRiskPreview =
    pack.planner.intent === "demand_forecast" ||
    messageIncludesAny(userMessage, ["契約容量", "超約", "utilization", "contract"]);
  const needsPowerFactorPreview =
    messageIncludesAny(userMessage, ["功率因數", "功因", "power factor"]) &&
    (messageIncludesAny(userMessage, ["場域", "比較", "最差", "site"]) ||
      pack.planner.intent === "site_benchmarking" ||
      pack.planner.intent === "anomaly_detection");
  const needsAlertTypePreview =
    pack.planner.intent === "alert_governance" &&
    messageIncludesAny(userMessage, ["類型", "最常見", "摘要", "治理", "噪音", "抑制", "重複"]);
  const needsBillTrendPreview =
    messageIncludesAny(userMessage, ["帳單", "bill", "台電"]) &&
    extractAccountCandidates(userMessage).length > 0;
  const needsSiteAccountPreview =
    messageIncludesAny(userMessage, ["電號", "account"]) &&
    messageIncludesAny(userMessage, ["各場域", "對應", "主要"]);
  const needsAnomalyPreview =
    pack.planner.intent === "anomaly_detection" ||
    messageIncludesAny(userMessage, ["異常", "根因", "電力品質", "quality", "低功因", "功因異常"]);
  const needsFreshnessPreview =
    messageIncludesAny(userMessage, ["raw layer", "summary layer", "最近是否都有更新", "新鮮度", "更新狀態"]) ||
    (messageIncludesAny(userMessage, ["raw", "summary"]) &&
      messageIncludesAny(userMessage, ["更新", "最近", "新鮮度"])) ||
    needsAnomalyPreview;
  const dayWindow = extractRecentDayWindow(userMessage, 30);

  const columnRows = await duckdbQueryExternalPgAsync<ColumnRow>(
    ENMS_CONNECTION_STRING,
    `
      SELECT table_name, column_name
      FROM enms.information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (
          'DeviceDataSummaryView',
          'mqtt_raw_data',
          'ElectricityMeter',
          'PowerAccounts',
          'sites',
          'site_gateways',
          'ComCompany',
          'DemandAlertHistory',
          'TaipowerBills',
          'ElectricityPricePlans',
          'ElectricityPriceRates'
        )
      ORDER BY table_name, ordinal_position
    `,
    "enms",
  );

  const statusRows = await duckdbQueryExternalPgAsync<Record<string, unknown>>(
    ENMS_CONNECTION_STRING,
    `
      SELECT
        (SELECT COUNT(*) FROM enms.public."sites") AS site_count,
        (SELECT COUNT(*) FROM enms.public."site_gateways") AS gateway_count,
        (SELECT COUNT(*) FROM enms.public."ElectricityMeter") AS meter_count,
        (SELECT COUNT(*) FROM enms.public."PowerAccounts") AS power_account_count,
        (SELECT COUNT(*) FROM enms.public."DemandAlertHistory") AS demand_alert_count,
        (SELECT COUNT(*) FROM enms.public."ComCompany") AS company_count,
        (SELECT COUNT(*) FROM enms.public."TaipowerBills") AS taipower_bill_count,
        (SELECT COUNT(*) FROM enms.public."ElectricityPricePlans") AS price_plan_count,
        (SELECT COUNT(*) FROM enms.public."ElectricityPriceRates") AS price_rate_count,
        (
          SELECT CAST(MAX("RecordTime") AS VARCHAR)
          FROM enms.public."DeviceDataSummaryView"
        ) AS latest_summary_time,
        (
          SELECT CAST(MAX(timestamp) AS VARCHAR)
          FROM enms.public.mqtt_raw_data
        ) AS latest_raw_time,
        (
          SELECT COUNT(*)
          FROM enms.public.mqtt_raw_data
          WHERE timestamp >= NOW() - INTERVAL '1 day'
        ) AS raw_rows_1d,
        (
          SELECT COUNT(*)
          FROM enms.public."DeviceDataSummaryView"
          WHERE "RecordTime" >= NOW() - INTERVAL '1 day'
        ) AS summary_rows_1d
    `,
    "enms",
  );

  const facts: string[] = [];
  const gaps: string[] = [];
  const cautions: string[] = [
    "Use only the .27 PostgreSQL / TimescaleDB instance as the primary EnMS source.",
    "Do not claim contract-capacity facts unless PowerAccounts or DemandAlertHistory provides real rows.",
    "Join meter, power-account, site, gateway, and company semantics before business-facing conclusions.",
  ];
  const status = statusRows[0] ?? {};
  if (columnRows.length === 0) {
    pushUnique(
      gaps,
      "Live EnMS schema introspection returned 0 rows, so exact table/column confirmation is unavailable.",
    );
  }

  const siteCandidates = extractSiteCandidates(userMessage);
  const allSiteRows = await duckdbQueryExternalPgAsync<Record<string, unknown>>(
    ENMS_CONNECTION_STRING,
    `
      SELECT site_id, site_name, company_no
      FROM enms.public."sites"
      ORDER BY site_name
      LIMIT 50
    `,
    "enms",
  );
  const mentionedSiteRows = allSiteRows.filter((row) => {
    const siteName =
      typeof row.site_name === "string" ? row.site_name.trim() : "";
    return siteName.length > 0 && userMessage.includes(siteName);
  });
  const resolvedSiteRows = mentionedSiteRows.length > 0 ? mentionedSiteRows : [];
  const accountCandidates = extractAccountCandidates(userMessage);
  const gregorianYearCandidates = extractGregorianYearCandidates(userMessage);
  const requestedGregorianYear = gregorianYearCandidates[0] ?? null;
  const requestedRocBillingYear =
    requestedGregorianYear != null
      ? toRocBillingYear(requestedGregorianYear)
      : null;
  if (siteCandidates.length > 0) {
    const whereClause = siteCandidates
      .map((candidate) => `site_name ILIKE '%${candidate.replace(/'/g, "''")}%'`)
      .join(" OR ");
    const siteRows = await duckdbQueryExternalPgAsync<
      Record<string, unknown>
    >(
      ENMS_CONNECTION_STRING,
      `
        SELECT site_id, site_name, company_no
        FROM enms.public."sites"
        WHERE ${whereClause}
        ORDER BY site_name
        LIMIT 5
      `,
      "enms",
    );

    for (const row of siteRows) {
      pushUnique(
        facts,
        `site_match: ${String(row.site_name)} -> ${String(row.site_id)} / ${String(row.company_no)}`,
      );
    }
    if (siteRows.length === 0 && resolvedSiteRows.length === 0) {
      pushUnique(
        gaps,
        `No matching site rows were found for: ${siteCandidates.join(", ")}`,
      );
    }
  }

  for (const row of resolvedSiteRows) {
    pushUnique(
      facts,
      `site_match: ${String(row.site_name)} -> ${String(row.site_id)} / ${String(row.company_no)}`,
    );
  }

  if (needsContractRiskPreview) {
    const siteFilter =
      resolvedSiteRows.length > 0
        ? `AND s.site_name IN (${resolvedSiteRows
            .map((row) => `'${String(row.site_name).replace(/'/g, "''")}'`)
            .join(", ")})`
        : "";
    const accountFilter =
      accountCandidates.length > 0
        ? `AND d."AccountNumber" IN (${accountCandidates
            .map((candidate) => `'${candidate.replace(/'/g, "''")}'`)
            .join(", ")})`
        : "";
    const contractRows = await duckdbQueryExternalPgAsync<Record<string, unknown>>(
      ENMS_CONNECTION_STRING,
      `
        WITH ranked AS (
          SELECT
            s.site_name,
            d."AccountNumber",
            d."AlertTime",
            d."CurrentDemand",
            d."ContractCapacity",
            d."UtilizationRate",
            d."AlertType",
            row_number() OVER (
              PARTITION BY d."AccountNumber"
              ORDER BY d."UtilizationRate" DESC NULLS LAST, d."AlertTime" DESC
            ) AS rn
          FROM enms.public."DemandAlertHistory" d
          JOIN enms.public."PowerAccounts" pa
            ON pa."AccountNumber" = d."AccountNumber"
          JOIN enms.public."sites" s
            ON s.site_id = pa."SiteId"
          WHERE d."AlertTime" >= NOW() - INTERVAL '${dayWindow} days'
          ${siteFilter}
          ${accountFilter}
        )
        SELECT
          site_name,
          "AccountNumber",
          "AlertTime",
          "CurrentDemand",
          "ContractCapacity",
          "UtilizationRate",
          "AlertType"
        FROM ranked
        WHERE rn = 1
        ORDER BY "UtilizationRate" DESC NULLS LAST
        LIMIT 5
      `,
      "enms",
    );

    for (const row of contractRows) {
      const util = formatNumericFact(row.UtilizationRate, 2) ?? "n/a";
      const demand = formatNumericFact(row.CurrentDemand, 2) ?? "n/a";
      const contractCapacity = formatNumericFact(row.ContractCapacity, 2) ?? "n/a";
      pushUnique(
        facts,
        `contract_risk_${dayWindow}d: site=${String(row.site_name)} / account=${String(row.AccountNumber)} / alert_time=${String(row.AlertTime)} / utilization=${util} / current_demand=${demand} / contract_capacity=${contractCapacity} / alert_type=${String(row.AlertType)}`,
      );
    }
  }

  if (needsPowerFactorPreview) {
    const siteFilter =
      resolvedSiteRows.length > 0
        ? `AND s.site_name IN (${resolvedSiteRows
            .map((row) => `'${String(row.site_name).replace(/'/g, "''")}'`)
            .join(", ")})`
        : "";
    const pfRows = await duckdbQueryExternalPgAsync<Record<string, unknown>>(
      ENMS_CONNECTION_STRING,
      `
        SELECT
          s.site_name,
          AVG(v."AvgPowerFactor") AS avg_pf,
          MIN(v."MinPowerFactor") AS min_pf,
          COUNT(*) AS point_count
        FROM enms.public."DeviceDataSummaryView" v
        JOIN enms.public."site_gateways" sg
          ON sg.mac_address = v."MacAddress"
        JOIN enms.public."sites" s
          ON s.site_id = sg.site_id
        WHERE v."RecordTime" >= NOW() - INTERVAL '${dayWindow} days'
        ${siteFilter}
        GROUP BY s.site_name
        ORDER BY avg_pf ASC NULLS LAST
        LIMIT 5
      `,
      "enms",
    );

    for (const row of pfRows) {
      const avgPf = formatNumericFact(row.avg_pf, 4) ?? "n/a";
      const minPf = formatNumericFact(row.min_pf, 4) ?? "n/a";
      pushUnique(
        facts,
        `power_factor_${dayWindow}d: site=${String(row.site_name)} / avg_pf=${avgPf} / min_pf=${minPf} / point_count=${String(row.point_count)}`,
      );
    }
  }

  if (needsTopLoadPreview) {
    const siteFilter =
      resolvedSiteRows.length > 0
        ? `AND s.site_name IN (${resolvedSiteRows
            .map((row) => `'${String(row.site_name).replace(/'/g, "''")}'`)
            .join(", ")})`
        : "";
    const topLoadRows = await duckdbQueryExternalPgAsync<Record<string, unknown>>(
      ENMS_CONNECTION_STRING,
      `
        SELECT
          s.site_name,
          COALESCE(NULLIF(e."DeviceAlias", ''), NULLIF(e."DeviceName", ''), CONCAT('Circuit ', CAST(v."CircuitSeq" AS VARCHAR))) AS meter_alias,
          v."CircuitSeq" AS circuit_seq,
          SUM(COALESCE(v."TotalConsumption", 0)) AS total_kwh
        FROM enms.public."DeviceDataSummaryView" v
        JOIN enms.public."ElectricityMeter" e
          ON e."DeviceAddress" = v."MacAddress"
         AND e."CircuitSeq" = v."CircuitSeq"
        LEFT JOIN enms.public."PowerAccounts" pa
          ON pa."AccountId" = e."PowerAccountId"
        LEFT JOIN enms.public."sites" s
          ON s.site_id = pa."SiteId"
        WHERE v."RecordTime" >= NOW() - INTERVAL '${dayWindow} days'
        ${siteFilter}
        GROUP BY s.site_name, meter_alias, v."CircuitSeq"
        ORDER BY total_kwh DESC NULLS LAST
        LIMIT 5
      `,
      "enms",
    );

    const filteredTopLoadRows =
      resolvedSiteRows.length > 0
        ? topLoadRows.filter((row) =>
            resolvedSiteRows.some(
              (siteRow) => String(siteRow.site_name) === String(row.site_name),
            ),
          )
        : topLoadRows;
    for (const row of filteredTopLoadRows) {
      const totalKwh = formatNumericFact(row.total_kwh, 2) ?? "n/a";
      pushUnique(
        facts,
        `top_load_${dayWindow}d: site=${String(row.site_name)} / meter_alias=${String(row.meter_alias)} / circuit_seq=${String(row.circuit_seq)} / total_kwh=${totalKwh}`,
      );
    }
  }

  if (needsAlertTypePreview) {
    const alertRows = await duckdbQueryExternalPgAsync<Record<string, unknown>>(
      ENMS_CONNECTION_STRING,
      `
        SELECT
          "AlertType",
          COUNT(*) AS alert_count
        FROM enms.public."DemandAlertHistory"
        WHERE "AlertTime" >= NOW() - INTERVAL '${dayWindow} days'
        GROUP BY "AlertType"
        ORDER BY alert_count DESC NULLS LAST
        LIMIT 5
      `,
      "enms",
    );

    for (const row of alertRows) {
      pushUnique(
        facts,
        `alert_type_${dayWindow}d: type=${String(row.AlertType)} / count=${String(row.alert_count)}`,
      );
    }
  }

  if (needsBillTrendPreview) {
    const billRows = await duckdbQueryExternalPgAsync<Record<string, unknown>>(
      ENMS_CONNECTION_STRING,
      `
        SELECT
          "AccountNumber",
          "BillingMonth",
          "UsageAmount",
          "TotalAmount",
          "CurrentAvgRate"
        FROM enms.public."TaipowerBills"
        WHERE "AccountNumber" IN (${accountCandidates
          .map((candidate) => `'${candidate.replace(/'/g, "''")}'`)
          .join(", ")})
        ORDER BY "AccountNumber", "BillingMonth" DESC
        LIMIT 12
      `,
      "enms",
    );

    for (const row of billRows.slice(0, 6)) {
      const usage = formatNumericFact(row.UsageAmount, 2) ?? "n/a";
      const total = formatNumericFact(row.TotalAmount, 2) ?? "n/a";
      const rate = formatNumericFact(row.CurrentAvgRate, 4) ?? "n/a";
      pushUnique(
        facts,
        `bill_trend_fact: account=${String(row.AccountNumber)} / billing_month=${String(row.BillingMonth)} / usage_kwh=${usage} / total_amount=${total} / avg_rate=${rate}`,
      );
    }
  }

  if (needsSiteAccountPreview) {
    const siteAccountRows = await duckdbQueryExternalPgAsync<Record<string, unknown>>(
      ENMS_CONNECTION_STRING,
      `
        SELECT
          s.site_name,
          STRING_AGG(DISTINCT pa."AccountNumber"::VARCHAR, ', ' ORDER BY pa."AccountNumber"::VARCHAR) AS account_numbers
        FROM enms.public."PowerAccounts" pa
        JOIN enms.public."sites" s
          ON s.site_id = pa."SiteId"
        WHERE pa."AccountNumber" IS NOT NULL
        GROUP BY s.site_name
        ORDER BY s.site_name
        LIMIT 10
      `,
      "enms",
    );

    for (const row of siteAccountRows) {
      pushUnique(
        facts,
        `site_accounts: site=${String(row.site_name)} / accounts=${String(row.account_numbers)}`,
      );
    }
  }

  if (needsFreshnessPreview) {
    pushUnique(
      facts,
      `freshness_raw: latest_raw_time=${String(status.latest_raw_time ?? "n/a")} / rows_1d=${String(status.raw_rows_1d ?? 0)}`,
    );
    pushUnique(
      facts,
      `freshness_summary: latest_summary_time=${String(status.latest_summary_time ?? "n/a")} / rows_1d=${String(status.summary_rows_1d ?? 0)}`,
    );
  }

  if (needsAnomalyPreview) {
    const anomalySiteFilter =
      resolvedSiteRows.length > 0
        ? `AND s.site_name IN (${resolvedSiteRows
            .map((row) => `'${String(row.site_name).replace(/'/g, "''")}'`)
            .join(", ")})`
        : "";
    const todayPfRows = await duckdbQueryExternalPgAsync<Record<string, unknown>>(
      ENMS_CONNECTION_STRING,
      `
        SELECT
          s.site_name,
          MIN(v."MinPowerFactor") AS min_pf,
          AVG(v."AvgPowerFactor") AS avg_pf,
          MAX(v."MaxDemand") AS max_demand,
          COUNT(*) AS point_count
        FROM enms.public."DeviceDataSummaryView" v
        JOIN enms.public."site_gateways" sg
          ON sg.mac_address = v."MacAddress"
        JOIN enms.public."sites" s
          ON s.site_id = sg.site_id
        WHERE v."RecordTime" >= date_trunc('day', NOW())
        ${anomalySiteFilter}
        GROUP BY s.site_name
        ORDER BY s.site_name
        LIMIT 5
      `,
      "enms",
    );
    const todayAlertRows = await duckdbQueryExternalPgAsync<Record<string, unknown>>(
      ENMS_CONNECTION_STRING,
      `
        SELECT
          s.site_name,
          COUNT(*) AS alert_count,
          MAX(d."UtilizationRate") AS max_util,
          MAX(d."CurrentDemand") AS max_alert_demand
        FROM enms.public."DemandAlertHistory" d
        JOIN enms.public."PowerAccounts" pa
          ON pa."AccountNumber" = d."AccountNumber"
        JOIN enms.public."sites" s
          ON s.site_id = pa."SiteId"
        WHERE d."AlertTime" >= date_trunc('day', NOW())
        ${anomalySiteFilter}
        GROUP BY s.site_name
        ORDER BY s.site_name
        LIMIT 5
      `,
      "enms",
    );
    const todayRawRows = await duckdbQueryExternalPgAsync<Record<string, unknown>>(
      ENMS_CONNECTION_STRING,
      `
        SELECT
          s.site_name,
          SUM(CASE WHEN r.connected = false THEN 1 ELSE 0 END) AS disconnected_count,
          SUM(CASE WHEN COALESCE(r.pfs, 1) < 0.9 THEN 1 ELSE 0 END) AS low_pf_raw_count,
          SUM(CASE WHEN COALESCE(r.pfs, 1) < 0.8 THEN 1 ELSE 0 END) AS severe_low_pf_raw_count,
          SUM(
            CASE
              WHEN NULLIF(r.quality, '') IS NOT NULL
               AND lower(r.quality) NOT IN ('ok', 'good', 'normal')
                THEN 1
              ELSE 0
            END
          ) AS abnormal_quality_count
        FROM enms.public.mqtt_raw_data r
        JOIN enms.public."site_gateways" sg
          ON sg.mac_address = r.mac
        JOIN enms.public."sites" s
          ON s.site_id = sg.site_id
        WHERE r.timestamp >= date_trunc('day', NOW())
        ${anomalySiteFilter}
        GROUP BY s.site_name
        ORDER BY s.site_name
        LIMIT 5
      `,
      "enms",
    );

    const anomalyMap = new Map<string, Record<string, unknown>>();
    for (const row of todayPfRows) {
      anomalyMap.set(String(row.site_name), { ...row });
    }
    for (const row of todayAlertRows) {
      const key = String(row.site_name);
      anomalyMap.set(key, { ...(anomalyMap.get(key) ?? {}), ...row });
    }
    for (const row of todayRawRows) {
      const key = String(row.site_name);
      anomalyMap.set(key, { ...(anomalyMap.get(key) ?? {}), ...row });
    }

    for (const row of anomalyMap.values()) {
      pushUnique(
        facts,
        `today_anomaly_fact: site=${String(row.site_name)} / min_pf=${formatNumericFact(row.min_pf, 4) ?? "n/a"} / avg_pf=${formatNumericFact(row.avg_pf, 4) ?? "n/a"} / max_demand=${formatNumericFact(row.max_demand, 2) ?? "n/a"} / point_count=${String(row.point_count ?? 0)} / alert_count=${String(row.alert_count ?? 0)} / max_util=${formatNumericFact(row.max_util, 2) ?? "n/a"} / max_alert_demand=${formatNumericFact(row.max_alert_demand, 2) ?? "n/a"} / disconnected_count=${String(row.disconnected_count ?? 0)} / low_pf_raw_count=${String(row.low_pf_raw_count ?? 0)} / severe_low_pf_raw_count=${String(row.severe_low_pf_raw_count ?? 0)} / abnormal_quality_count=${String(row.abnormal_quality_count ?? 0)}`,
      );
    }
  }

  if (needsBenchmarkPreview) {
    const benchmarkSiteFilter =
      resolvedSiteRows.length > 0
        ? `WHERE s.site_name IN (${resolvedSiteRows
            .map((row) => `'${String(row.site_name).replace(/'/g, "''")}'`)
            .join(", ")})`
        : "";
    const benchmarkRows = await duckdbQueryExternalPgAsync<Record<string, unknown>>(
      ENMS_CONNECTION_STRING,
      `
        WITH recent AS (
          SELECT
            d."RecordTime",
            d."MacAddress",
            COALESCE(d."TotalConsumption", 0) AS total_kwh,
            COALESCE(d."MaxDemand", 0) AS peak_kw,
            NULLIF(d."AvgPowerFactor", 0) AS avg_pf
          FROM enms.public."DeviceDataSummaryView" d
          WHERE d."RecordTime" >= NOW() - INTERVAL '30 days'
        )
        SELECT
          s.site_id,
          s.site_name,
          c."CompanyName" AS company_name,
          COUNT(*) AS summary_points,
          SUM(recent.total_kwh) AS total_kwh_30d,
          MAX(recent.peak_kw) AS peak_kw_30d,
          AVG(recent.avg_pf) AS avg_pf_30d,
          CASE
            WHEN COALESCE(c."TotalFloorArea", 0) > 0
              THEN SUM(recent.total_kwh) / c."TotalFloorArea"
            ELSE NULL
          END AS kwh_per_floor_area_30d,
          CASE
            WHEN COALESCE(c."EmployeeNum", 0) > 0
              THEN SUM(recent.total_kwh) / c."EmployeeNum"
            ELSE NULL
          END AS kwh_per_employee_30d
        FROM recent
        JOIN enms.public."site_gateways" g
          ON g.mac_address = recent."MacAddress"
        JOIN enms.public."sites" s
          ON s.site_id = g.site_id
        LEFT JOIN enms.public."ComCompany" c
          ON c."CompanyNo" = s.company_no
        ${benchmarkSiteFilter}
        GROUP BY
          s.site_id,
          s.site_name,
          c."CompanyName",
          c."TotalFloorArea",
          c."EmployeeNum"
        ORDER BY total_kwh_30d DESC
        LIMIT 5
      `,
      "enms",
    );

    pushUnique(
      facts,
      `benchmark_window: 30 days / sites_with_summary=${benchmarkRows.length}`,
    );
    for (const row of benchmarkRows.slice(0, 3)) {
      const totalKwh = formatNumericFact(row.total_kwh_30d, 2) ?? "n/a";
      const peakKw = formatNumericFact(row.peak_kw_30d, 2) ?? "n/a";
      const avgPf = formatNumericFact(row.avg_pf_30d, 3) ?? "n/a";
      const kwhPerFloorArea =
        formatNumericFact(row.kwh_per_floor_area_30d, 2) ?? "n/a";
      const kwhPerEmployee =
        formatNumericFact(row.kwh_per_employee_30d, 2) ?? "n/a";
      pushUnique(
        facts,
        `site_benchmark_30d: ${String(row.site_name)} / total_kwh=${totalKwh} / peak_kw=${peakKw} / avg_pf=${avgPf} / kwh_per_floor_area=${kwhPerFloorArea} / kwh_per_employee=${kwhPerEmployee}`,
      );
    }

    if (benchmarkRows.length < 2) {
      pushUnique(
        gaps,
        "Benchmarking currently has fewer than 2 sites with summary-layer data, so multi-site ranking depth is limited.",
      );
    }

    const uniqueCompanies = new Set(
      benchmarkRows
        .map((row) =>
          typeof row.company_name === "string" ? row.company_name.trim() : "",
        )
        .filter(Boolean),
    );
    if (benchmarkRows.length >= 2 && uniqueCompanies.size <= 1) {
      pushUnique(
        cautions,
        "Current site benchmarking is mostly intra-company because the available sites map to the same company context.",
      );
    }
  }

  if (needsEfficiencyPreview) {
    if (requestedGregorianYear != null && requestedRocBillingYear != null) {
      pushUnique(
        facts,
        `billing_calendar_mapping: gregorian_year=${String(requestedGregorianYear)} / billing_month_range=${String(requestedRocBillingYear)}01..${String(requestedRocBillingYear)}12`,
      );
    }

    const roiSiteFilter =
      resolvedSiteRows.length > 0
        ? `AND s.site_name IN (${resolvedSiteRows
            .map((row) => `'${String(row.site_name).replace(/'/g, "''")}'`)
            .join(", ")})`
        : "";
    const billYearClause =
      requestedRocBillingYear != null
        ? `WHERE CAST("BillingMonth" AS INTEGER) BETWEEN ${requestedRocBillingYear}01 AND ${requestedRocBillingYear}12`
        : "";

    const roiRows = await duckdbQueryExternalPgAsync<Record<string, unknown>>(
      ENMS_CONNECTION_STRING,
      `
        WITH site_accounts AS (
          SELECT DISTINCT
            s.site_id,
            s.site_name,
            pa."AccountNumber",
            pa."CurrentPlanId"
          FROM enms.public."sites" s
          JOIN enms.public."PowerAccounts" pa
            ON pa."SiteId" = s.site_id
          WHERE pa."AccountNumber" IS NOT NULL
          ${roiSiteFilter}
        ),
        bill_summary AS (
          SELECT
            "AccountNumber",
            COUNT(*) AS bill_count,
            AVG("TotalAmount") AS avg_bill_amount,
            AVG("UsageAmount") AS avg_usage_amount,
            AVG("CurrentAvgRate") AS avg_bill_rate
          FROM enms.public."TaipowerBills"
          ${billYearClause}
          GROUP BY "AccountNumber"
        )
        SELECT
          sa.site_id,
          sa.site_name,
          COUNT(DISTINCT sa."AccountNumber") AS account_count,
          COUNT(DISTINCT CASE WHEN bs.bill_count > 0 THEN sa."AccountNumber" END) AS billed_accounts,
          COUNT(DISTINCT sa."CurrentPlanId") AS active_plan_count,
          SUM(COALESCE(bs.avg_bill_amount, 0)) AS baseline_monthly_bill,
          SUM(COALESCE(bs.avg_usage_amount, 0)) AS baseline_monthly_kwh,
          AVG(NULLIF(bs.avg_bill_rate, 0)) AS avg_bill_rate,
          (SUM(COALESCE(bs.avg_usage_amount, 0)) * AVG(NULLIF(bs.avg_bill_rate, 0)) * 0.05) AS savings_5pct_monthly,
          (SUM(COALESCE(bs.avg_usage_amount, 0)) * AVG(NULLIF(bs.avg_bill_rate, 0)) * 0.10) AS savings_10pct_monthly
        FROM site_accounts sa
        LEFT JOIN bill_summary bs
          ON bs."AccountNumber" = sa."AccountNumber"
        GROUP BY sa.site_id, sa.site_name
        ORDER BY sa.site_id
      `,
      "enms",
    );

    pushUnique(
      facts,
      `roi_readiness: bills=${String(status.taipower_bill_count ?? 0)} / plans=${String(status.price_plan_count ?? 0)} / rates=${String(status.price_rate_count ?? 0)} / sites_with_accounts=${roiRows.length}${requestedGregorianYear != null ? ` / requested_year=${String(requestedGregorianYear)}` : ""}`,
    );

    for (const row of roiRows.slice(0, 3)) {
      const baselineBill =
        formatNumericFact(row.baseline_monthly_bill, 2) ?? "n/a";
      const baselineKwh =
        formatNumericFact(row.baseline_monthly_kwh, 2) ?? "n/a";
      const avgRate = formatNumericFact(row.avg_bill_rate, 4) ?? "n/a";
      const savings5 = formatNumericFact(row.savings_5pct_monthly, 2) ?? "n/a";
      const savings10 = formatNumericFact(row.savings_10pct_monthly, 2) ?? "n/a";
      pushUnique(
        facts,
        `roi_preview_fact: site=${String(row.site_name)} / billed_accounts=${String(row.billed_accounts ?? 0)}/${String(row.account_count ?? 0)} / baseline_bill=${baselineBill} / baseline_kwh=${baselineKwh} / avg_rate=${avgRate} / savings_5pct=${savings5} / savings_10pct=${savings10}`,
      );
    }

    const uncoveredSites = roiRows.filter((row) => Number(row.billed_accounts ?? 0) === 0);
    if (uncoveredSites.length > 0) {
      pushUnique(
        gaps,
        `Some sites still lack Taipower bill coverage for ROI estimation${requestedGregorianYear != null ? ` in ${String(requestedGregorianYear)}` : ""}: ${uncoveredSites.map((row) => String(row.site_name)).join(", ")}`,
      );
    }
    if (Number(status.taipower_bill_count ?? 0) === 0) {
      pushUnique(
        gaps,
        'EnMS table "TaipowerBills" currently has 0 rows, so bill-based ROI and what-if estimation is unavailable.',
      );
    }
    if (Number(status.price_plan_count ?? 0) === 0 || Number(status.price_rate_count ?? 0) === 0) {
      pushUnique(
        cautions,
        "Tariff plan or rate coverage is incomplete, so ROI scenarios may need to fall back to bill-average rates instead of full tariff simulation.",
      );
    }
    pushUnique(
      cautions,
      "ROI / what-if numbers should be framed as scenario estimates unless retrofit CAPEX and full tariff scope are both available.",
    );
    pushUnique(
      cautions,
      'Strings like "roi_preview_fact" are derived bootstrap facts, not physical EnMS tables. Query TaipowerBills, PowerAccounts, ElectricityPricePlans, and ElectricityPriceRates directly.',
    );
  }

  if (columnRows.length > 0) {
    for (const fact of summarizeColumnRows(columnRows, [
      "DeviceDataSummaryView",
      "mqtt_raw_data",
      "ElectricityMeter",
      "PowerAccounts",
      "sites",
      "DemandAlertHistory",
      "TaipowerBills",
      "ElectricityPriceRates",
    ])) {
      pushUnique(facts, fact);
    }
  }

  for (const fact of [
    formatCountFact("site_count", status.site_count),
    formatCountFact("gateway_count", status.gateway_count),
    formatCountFact("meter_count", status.meter_count),
    formatCountFact("power_account_count", status.power_account_count),
    formatCountFact("demand_alert_count", status.demand_alert_count),
    formatCountFact("company_count", status.company_count),
    formatCountFact("taipower_bill_count", status.taipower_bill_count),
    formatCountFact("price_plan_count", status.price_plan_count),
    formatCountFact("price_rate_count", status.price_rate_count),
    formatCountFact("latest_summary_time", status.latest_summary_time),
    formatCountFact("latest_raw_time", status.latest_raw_time),
  ]) {
    pushUnique(facts, fact);
  }
  if (Number(status.power_account_count ?? 0) === 0) {
    pushUnique(
      gaps,
      'EnMS table "PowerAccounts" currently has 0 rows, so contract-capacity semantics are unavailable.',
    );
    pushUnique(
      cautions,
      "PowerAccounts currently has 0 rows, so contract-capacity semantics may be incomplete.",
    );
  }
  if (Number(status.demand_alert_count ?? 0) === 0) {
    pushUnique(
      gaps,
      'EnMS table "DemandAlertHistory" currently has 0 rows, so alert-history and ContractCapacity evidence are unavailable.',
    );
    pushUnique(
      cautions,
      "DemandAlertHistory currently has 0 rows, so alert-history-based contract capacity evidence is unavailable.",
    );
  }
  if (needsEfficiencyPreview && Number(status.taipower_bill_count ?? 0) === 0) {
    pushUnique(
      cautions,
      "Without Taipower bill history, efficiency analysis can still rank opportunities but cannot ground ROI in real billing evidence.",
    );
  }

  if (facts.length === 0) {
    const fallback = readWorkspaceFile("skills/enms/reference/auto-schema-enms.md");
    if (fallback) {
      return {
        system: "enms",
        source: "reference_file",
        scope: "enms.public",
        availability: "partial",
        facts: summarizeHeadingsAsFacts(
          fallback,
          [
            "DeviceDataSummaryView",
            "mqtt_raw_data",
            "ElectricityMeter",
            "PowerAccounts",
            "sites",
            "site_gateways",
          ],
          "reference_table",
        ).slice(0, 6),
        joins: [
          "mqtt_raw_data.(mac, circuit_seq) -> ElectricityMeter.(DeviceAddress, CircuitSeq)",
          "ElectricityMeter.PowerAccountId -> PowerAccounts.AccountId",
          "PowerAccounts.SiteId -> sites.site_id",
        ],
        cautions,
        gaps: [
          "Live EnMS introspection was unavailable, so this snapshot is using the cached bootstrap reference.",
        ],
        stillAvailable: [
          "Reference-level join guidance",
          "Summary-vs-raw routing guidance for EnMS analysis",
        ],
      };
    }
  }

  const availability =
    facts.length === 0 ? "blocked" : gaps.length > 0 ? "partial" : "ready";
  return {
    system: "enms",
    source: facts.length > 0 ? "live_db" : "unavailable",
    scope: "enms.public",
    availability,
    facts,
    joins: [
      "mqtt_raw_data.(mac, circuit_seq) -> ElectricityMeter.(DeviceAddress, CircuitSeq)",
      "ElectricityMeter.PowerAccountId -> PowerAccounts.AccountId",
      "PowerAccounts.SiteId -> sites.site_id",
      "site_gateways.site_id -> sites.site_id -> ComCompany.CompanyNo",
    ],
    cautions: cautions.slice(0, 5),
    gaps: gaps.slice(0, 5),
    stillAvailable: [
      "Site/gateway topology lookup",
      "Any summary-layer demand and consumption facts that still exist in DeviceDataSummaryView",
      "Raw signal inspection from mqtt_raw_data when summary data exists",
    ],
  };
}

export async function buildDomainBootstrapSnapshot(
  request: BootstrapRequest,
): Promise<DomainBootstrapSnapshot | null> {
  try {
    switch (request.system) {
      case "ycrm":
        return await buildYcrmBootstrapSnapshot(request.pack);
      case "erp":
        return await buildErpBootstrapSnapshot();
      case "enms":
        return await buildEnmsBootstrapSnapshot(request.userMessage, request.pack);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function selectRelevantBootstrapFacts(
  facts: string[],
  userMessage: string,
): string[] {
  const wantsEfficiency =
    messageIncludesAny(userMessage, ["roi", "what-if", "節電", "省多少", "帳單"]);
  const wantsTopLoad =
    messageIncludesAny(userMessage, ["耗電", "最耗電", "用電排行"]) &&
    messageIncludesAny(userMessage, ["設備", "迴路", "電表"]);
  const wantsContractRisk = messageIncludesAny(userMessage, [
    "契約容量",
    "超約",
    "需量",
    "utilization",
    "contract",
  ]);
  const wantsPowerFactor = messageIncludesAny(userMessage, [
    "功率因數",
    "功因",
    "power factor",
  ]);
  const wantsAlertSummary = messageIncludesAny(userMessage, [
    "告警",
    "預警",
    "alert",
    "治理",
    "摘要",
  ]);
  const wantsSiteAccounts =
    messageIncludesAny(userMessage, ["電號", "account"]) &&
    messageIncludesAny(userMessage, ["場域", "對應", "主要"]);
  const wantsBenchmark =
    messageIncludesAny(userMessage, ["benchmark", "benchmarking", "排名"]) ||
    (messageIncludesAny(userMessage, ["比較"]) &&
      messageIncludesAny(userMessage, ["總用電", "最大需量", "功率因數", "用電"]));

  const scored = facts.map((fact, index) => {
    let score = 0;
    if (
      fact.startsWith("status:") ||
      fact.startsWith("all_sites:") ||
      fact.startsWith("site_match:")
    ) {
      score += 50;
    }
    if (wantsEfficiency) {
      if (fact.startsWith("billing_calendar_mapping:")) score += 90;
      if (fact.startsWith("roi_preview_fact:")) score += 120;
      if (fact.startsWith("roi_readiness:")) score += 100;
      if (fact.startsWith("bill_trend_fact:")) score += 90;
      if (fact.startsWith("site_accounts:")) score += 70;
    }
    if (wantsTopLoad && fact.startsWith("top_load_")) score += 120;
    if (wantsContractRisk && fact.startsWith("contract_risk_")) score += 120;
    if (wantsPowerFactor && fact.startsWith("power_factor_")) score += 120;
    if (wantsAlertSummary && fact.startsWith("alert_type_")) score += 120;
    if (wantsSiteAccounts && fact.startsWith("site_accounts:")) score += 120;
    if (wantsBenchmark && fact.startsWith("site_benchmark_")) score += 120;
    if (wantsBenchmark && fact.startsWith("benchmark_window:")) score += 100;
    return { fact, score, index };
  });

  const prioritized = scored
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.fact);

  const fallback = facts.filter((fact) => !prioritized.includes(fact));
  return [...prioritized, ...fallback].slice(0, 10);
}

export function decorateMessageWithDomainBootstrapSnapshot(
  userMessage: string,
  snapshot: DomainBootstrapSnapshot | null,
  options?: { compact?: boolean },
): string {
  if (!snapshot) {
    return userMessage;
  }

  const compact = options?.compact ?? false;
  const visibleFacts = selectRelevantBootstrapFacts(snapshot.facts, userMessage).slice(
    0,
    compact ? 4 : 10,
  );

  const lines = [
    "[Domain Bootstrap Snapshot]",
    `bootstrap.system=${snapshot.system}`,
    `bootstrap.source=${snapshot.source}`,
    `bootstrap.scope=${snapshot.scope}`,
    `bootstrap.availability=${snapshot.availability}`,
    "bootstrap.facts:",
    ...visibleFacts.map((fact) => `- ${fact}`),
    "bootstrap.joins:",
    ...snapshot.joins.slice(0, compact ? 2 : 3).map((joinRule) => `- ${joinRule}`),
    "bootstrap.cautions:",
    ...snapshot.cautions.slice(0, compact ? 3 : 5).map((caution) => `- ${caution}`),
    "bootstrap.gaps:",
    ...(snapshot.gaps.length > 0
      ? snapshot.gaps.slice(0, compact ? 3 : 5).map((gap) => `- ${gap}`)
      : ["- none"]),
    "bootstrap.still_available:",
    ...(snapshot.stillAvailable.length > 0
      ? snapshot.stillAvailable.slice(0, compact ? 2 : 4).map((item) => `- ${item}`)
      : ["- none"]),
    "bootstrap.response_rules:",
    "- If bootstrap.facts already contain the requested site / account / bill / alert / power-factor answer, summarize those DB-backed facts first before attempting extra SQL.",
    "- Treat bootstrap.facts as already verified local EnMS DB facts. In the final user-facing answer, call them 本地 EnMS DB 已彙整資料 or 已確認資料, never bootstrap, snapshot, 引導快照, or derived label.",
    ...(compact
      ? [
          "- If the requested answer depends on a listed gap, explicitly name the missing table/field/data source.",
          "- When data is partial, separate confirmed facts from unavailable facts.",
        ]
      : [
          "- Do not contradict a concrete bootstrap fact with a guessed table name, guessed join, or generic fallback answer.",
          "- If the requested answer depends on a listed gap, explicitly name the missing table/field/data source.",
          "- Never reply with only a vague phrase like '因資料限制'; explain what is missing and what can still be answered.",
          "- When data is partial, separate confirmed facts from unavailable facts.",
          "- Do not expose failed intermediate SQL attempts, schema guesses, or troubleshooting notes in the final answer.",
          "bootstrap.response_template_when_partial_or_blocked:",
          "- 已確認：列出目前已確認的系統、scope、表或站點。",
          "- 缺少資料：明確列出缺哪張表、哪個欄位、或目前 0 rows 的來源。",
          "- 目前可回答：列出在現有資料下仍可完成的分析。",
          "- 建議下一步：列出最小補數據或改問法。",
        ]),
    "[/Domain Bootstrap Snapshot]",
  ];

  return `${lines.join("\n")}\n\n${userMessage}`;
}
