import { duckdbQueryExternalPgAsync } from "@/lib/workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/workspace/db/external-pg-query
 * Body: { connectionString: string, sql: string, alias?: string }
 *
 * Executes a read-only SQL query against an external PostgreSQL database
 * via DuckDB's postgres_scanner extension. Always uses READ_ONLY mode.
 */
export async function POST(request: Request) {
  let body: { connectionString?: string; sql?: string; alias?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { connectionString, sql, alias } = body;

  if (!connectionString || !sql) {
    return Response.json(
      { error: "Missing required `connectionString` and `sql` fields" },
      { status: 400 },
    );
  }

  const trimmedSql = sql.trim().toUpperCase();
  if (
    !trimmedSql.startsWith("SELECT") &&
    !trimmedSql.startsWith("PRAGMA") &&
    !trimmedSql.startsWith("DESCRIBE") &&
    !trimmedSql.startsWith("SHOW") &&
    !trimmedSql.startsWith("EXPLAIN") &&
    !trimmedSql.startsWith("WITH")
  ) {
    return Response.json(
      { error: "Only read-only queries (SELECT, DESCRIBE, SHOW, EXPLAIN, WITH) are allowed" },
      { status: 403 },
    );
  }

  const rows = await duckdbQueryExternalPgAsync(connectionString, sql, alias);
  return Response.json({ rows, sql });
}
