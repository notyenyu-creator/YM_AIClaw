import { safeResolvePath, duckdbQueryOnFileAsync } from "@/lib/workspace";
import { redactDatabaseConnectionSecrets } from "@/lib/enms-db-config";
import { checkSqlSafety } from "@/lib/report-filters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/workspace/db/query
 * Body: { path: string, sql: string }
 *
 * Executes a read-only SQL query against a database file and returns JSON rows.
 * Only SELECT statements are allowed for safety.
 */
export async function POST(request: Request) {
  let body: { path?: string; sql?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { path: relPath, sql } = body;

  if (!relPath || !sql) {
    return Response.json(
      { error: "Missing required `path` and `sql` fields" },
      { status: 400 },
    );
  }

  const safetyError = checkSqlSafety(sql);
  if (safetyError) {
    return Response.json(
      { error: safetyError },
      { status: 403 },
    );
  }

  const absPath = safeResolvePath(relPath);
  if (!absPath) {
    return Response.json(
      { error: "File not found or path traversal rejected" },
      { status: 404 },
    );
  }

  try {
    const rows = await duckdbQueryOnFileAsync(absPath, sql);
    return Response.json({ rows, sql });
  } catch (err) {
    return Response.json(
      {
        error: redactDatabaseConnectionSecrets(
          err instanceof Error ? err.message : "Query failed",
        ),
      },
      { status: 500 },
    );
  }
}
