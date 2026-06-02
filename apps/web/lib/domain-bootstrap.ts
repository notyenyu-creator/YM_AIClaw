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

function formatCountFact(label: string, value: unknown): string | null {
  if (value == null || value === "") {
    return null;
  }
  return `${label}: ${String(value)}`;
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
): Promise<DomainBootstrapSnapshot> {
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
          'DemandAlertHistory'
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
        (
          SELECT CAST(MAX("RecordTime") AS VARCHAR)
          FROM enms.public."DeviceDataSummaryView"
        ) AS latest_summary_time
    `,
    "enms",
  );

  const facts: string[] = [];
  const gaps: string[] = [];
  const status = statusRows[0] ?? {};
  pushUnique(facts, formatCountFact("site_count", status.site_count));
  pushUnique(facts, formatCountFact("gateway_count", status.gateway_count));
  pushUnique(facts, formatCountFact("meter_count", status.meter_count));
  pushUnique(facts, formatCountFact("power_account_count", status.power_account_count));
  pushUnique(facts, formatCountFact("demand_alert_count", status.demand_alert_count));
  pushUnique(facts, formatCountFact("latest_summary_time", status.latest_summary_time));
  if (columnRows.length === 0) {
    pushUnique(
      gaps,
      "Live EnMS schema introspection returned 0 rows, so exact table/column confirmation is unavailable.",
    );
  }

  const siteCandidates = extractSiteCandidates(userMessage);
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
    if (siteRows.length === 0) {
      pushUnique(
        gaps,
        `No matching site rows were found for: ${siteCandidates.join(", ")}`,
      );
    }
  }

  if (columnRows.length > 0) {
    for (const fact of summarizeColumnRows(columnRows, [
      "DeviceDataSummaryView",
      "mqtt_raw_data",
      "ElectricityMeter",
      "PowerAccounts",
      "sites",
      "DemandAlertHistory",
    ])) {
      pushUnique(facts, fact);
    }
  }

  const cautions: string[] = [
    "Use only the .27 PostgreSQL / TimescaleDB instance as the primary EnMS source.",
    "Do not claim contract-capacity facts unless PowerAccounts or DemandAlertHistory provides real rows.",
    "Join meter, power-account, site, gateway, and company semantics before business-facing conclusions.",
  ];

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
    facts: facts.slice(0, 10),
    joins: [
      "mqtt_raw_data.(mac, circuit_seq) -> ElectricityMeter.(DeviceAddress, CircuitSeq)",
      "ElectricityMeter.PowerAccountId -> PowerAccounts.AccountId",
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
        return await buildEnmsBootstrapSnapshot(request.userMessage);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function decorateMessageWithDomainBootstrapSnapshot(
  userMessage: string,
  snapshot: DomainBootstrapSnapshot | null,
): string {
  if (!snapshot) {
    return userMessage;
  }

  const lines = [
    "[Domain Bootstrap Snapshot]",
    `bootstrap.system=${snapshot.system}`,
    `bootstrap.source=${snapshot.source}`,
    `bootstrap.scope=${snapshot.scope}`,
    `bootstrap.availability=${snapshot.availability}`,
    "bootstrap.facts:",
    ...snapshot.facts.slice(0, 6).map((fact) => `- ${fact}`),
    "bootstrap.joins:",
    ...snapshot.joins.slice(0, 3).map((joinRule) => `- ${joinRule}`),
    "bootstrap.cautions:",
    ...snapshot.cautions.slice(0, 5).map((caution) => `- ${caution}`),
    "bootstrap.gaps:",
    ...(snapshot.gaps.length > 0
      ? snapshot.gaps.slice(0, 5).map((gap) => `- ${gap}`)
      : ["- none"]),
    "bootstrap.still_available:",
    ...(snapshot.stillAvailable.length > 0
      ? snapshot.stillAvailable.slice(0, 4).map((item) => `- ${item}`)
      : ["- none"]),
    "bootstrap.response_rules:",
    "- If the requested answer depends on a listed gap, explicitly name the missing table/field/data source.",
    "- Never reply with only a vague phrase like '因資料限制'; explain what is missing and what can still be answered.",
    "- When data is partial, separate confirmed facts from unavailable facts.",
    "bootstrap.response_template_when_partial_or_blocked:",
    "- 已確認：列出目前已確認的系統、scope、表或站點。",
    "- 缺少資料：明確列出缺哪張表、哪個欄位、或目前 0 rows 的來源。",
    "- 目前可回答：列出在現有資料下仍可完成的分析。",
    "- 建議下一步：列出最小補數據或改問法。",
    "[/Domain Bootstrap Snapshot]",
  ];

  return `${lines.join("\n")}\n\n${userMessage}`;
}
