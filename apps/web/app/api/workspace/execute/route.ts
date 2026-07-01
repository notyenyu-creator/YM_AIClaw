import { duckdbQueryAsync } from "@/lib/workspace";
import { redactDatabaseConnectionSecrets } from "@/lib/enms-db-config";
import { checkSqlSafety } from "@/lib/report-filters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { sql?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sql } = body;
  if (!sql || typeof sql !== "string") {
    return Response.json(
      { error: "Missing 'sql' field in request body" },
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

  try {
    const rows = await duckdbQueryAsync(sql);
    return Response.json({ rows: rows ?? [], ok: true });
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
