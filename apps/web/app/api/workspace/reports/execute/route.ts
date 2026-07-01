import {
  duckdbQueryAsyncDetailed,
} from "@/lib/workspace";
import {
  redactDatabaseConnectionSecrets,
} from "@/lib/enms-db-config";
import {
  collectExternalPgReportDomains,
  EXTERNAL_PG_DOMAIN_LABELS,
} from "@/lib/report-domain-routing";
import { buildFilterClauses, injectFilters, checkSqlSafety } from "@/lib/report-filters";
import type { FilterEntry } from "@/lib/report-filters";
import { trackServer } from "@/lib/telemetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/workspace/reports/execute
 *
 * Body: { sql: string, filters?: FilterEntry[] }
 *
 * Executes a report panel's SQL query with optional filter injection.
 * Only SELECT-compatible queries are allowed.
 */
export async function POST(req: Request) {
  let body: {
    sql?: string;
    filters?: FilterEntry[];
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sql, filters } = body;
  if (!sql || typeof sql !== "string") {
    return Response.json(
      { error: "Missing 'sql' field in request body" },
      { status: 400 },
    );
  }

  // Basic SQL safety: reject mutation statements
  const safetyError = checkSqlSafety(sql);
  if (safetyError) {
    return Response.json({ error: safetyError }, { status: 403 });
  }

  // Build filter clauses and inject into SQL
  const filterClauses = buildFilterClauses(filters);
  const finalSql = injectFilters(sql, filterClauses);
  const safeSql = redactDatabaseConnectionSecrets(finalSql);
  const externalDomains = collectExternalPgReportDomains(finalSql);
  if (externalDomains.length > 0) {
    return Response.json(
      {
        error: `這張圖表引用外部資料域（${externalDomains.map((domain) => EXTERNAL_PG_DOMAIN_LABELS[domain]).join("、")}）。為避免繞過 OpenClaw Gateway 與 domain guardrail，外部 Y-CRM / ERP / EnMS 圖表必須改走 verified direct query 產生的受控圖表資料。`,
        sql: safeSql,
        sourceDomain: externalDomains.length === 1 ? externalDomains[0] : null,
        sourceKind: "blocked_external_postgres" as const,
      },
      { status: 400 },
    );
  }

  try {
    const result = await duckdbQueryAsyncDetailed(finalSql);
    if (result.error) {
      return Response.json(
        {
          error: redactDatabaseConnectionSecrets(result.error),
          sql: safeSql,
          sourceDomain: null,
          sourceKind: "workspace_duckdb" as const,
        },
        { status: 500 },
      );
    }
    trackServer("report_executed");
    return Response.json({
      rows: result.rows,
      sql: safeSql,
      sourceDomain: null,
      sourceKind: "workspace_duckdb" as const,
    });
  } catch (err) {
    return Response.json(
      {
        error: redactDatabaseConnectionSecrets(
          err instanceof Error ? err.message : "Query execution failed",
        ),
        sql: safeSql,
        sourceDomain: null,
        sourceKind: "workspace_duckdb" as const,
      },
      { status: 500 },
    );
  }
}
