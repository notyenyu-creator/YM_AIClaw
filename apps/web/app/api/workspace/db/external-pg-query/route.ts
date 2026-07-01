export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/workspace/db/external-pg-query
 *
 * Deprecated. External PostgreSQL execution must go through controlled
 * domain-specific routes / report execution paths that resolve server-side
 * environment config. This endpoint intentionally rejects all requests so no
 * caller can bypass OpenClaw Gateway orchestration with ad-hoc SQL.
 */
export async function POST() {
  return Response.json(
    {
      error:
        "Deprecated internal route. Use controlled report execution or domain-specific verified query paths.",
    },
    { status: 410 },
  );
}
