import {
  duckdbQueryAsyncDetailed,
  duckdbQueryExternalPgAsyncDetailed,
} from "@/lib/workspace";
import { buildFilterClauses, injectFilters, checkSqlSafety } from "@/lib/report-filters";
import type { FilterEntry } from "@/lib/report-filters";
import { trackServer } from "@/lib/telemetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const YCRM_PG_CONNECTION =
  "dbname=default user=postgres password=postgres host=localhost port=5432";
const ERP_PG_CONNECTION =
  "host=118.168.188.27 port=5433 dbname=ErpUAT_local user=erp_local password=erp_local";
const ENMS_PG_CONNECTION =
  "host=118.168.188.27 port=55433 dbname=EnMS user=sa password=ym@mes42769778 sslmode=disable";

function resolveExternalPgTarget(sql: string): {
  alias: "ycrm" | "erp" | "enms";
  connectionString: string;
} | null {
  if (/\bycrm\./i.test(sql)) {
    return { alias: "ycrm", connectionString: YCRM_PG_CONNECTION };
  }
  if (/\berp\./i.test(sql)) {
    return { alias: "erp", connectionString: ERP_PG_CONNECTION };
  }
  if (/\benms\./i.test(sql)) {
    return { alias: "enms", connectionString: ENMS_PG_CONNECTION };
  }
  return null;
}

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

  try {
    const externalTarget = resolveExternalPgTarget(finalSql);
    const result = externalTarget
      ? await duckdbQueryExternalPgAsyncDetailed(
          externalTarget.connectionString,
          finalSql,
          externalTarget.alias,
        )
      : await duckdbQueryAsyncDetailed(finalSql);
    if (result.error) {
      return Response.json({ error: result.error, sql: finalSql }, { status: 500 });
    }
    trackServer("report_executed");
    return Response.json({ rows: result.rows, sql: finalSql });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Query execution failed" },
      { status: 500 },
    );
  }
}
