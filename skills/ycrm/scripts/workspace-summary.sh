#!/bin/bash
# Y-CRM 工作區資料摘要
# 查詢各工作區的記錄數量統計
# 輸出 JSON 格式

YCRM_PG_CONNECTION="${YCRM_PG_CONNECTION:-${Y_CRM_PG_CONNECTION:-${OPENCLAW_YCRM_PG_CONNECTION:-${YCRM_POSTGRES_CONNECTION:-}}}}"

if [ -z "$YCRM_PG_CONNECTION" ]; then
  echo '{"error": "Y-CRM database connection is not configured. Set YCRM_PG_CONNECTION on the server runtime."}'
  exit 2
fi

ESCAPED_YCRM_PG_CONNECTION="$(printf '%s' "$YCRM_PG_CONNECTION" | perl -pe "s/'/''/g")"

QUERY="INSTALL postgres_scanner; LOAD postgres_scanner; ATTACH '${ESCAPED_YCRM_PG_CONNECTION}' AS ycrm (TYPE postgres_scanner, READ_ONLY);

WITH workspaces AS (
  SELECT id, \"displayName\", subdomain
  FROM ycrm.core.workspace
  WHERE \"deletedAt\" IS NULL
  ORDER BY \"displayName\"
),
members AS (
  SELECT \"workspaceId\", COUNT(*) AS member_count
  FROM ycrm.core.\"userWorkspace\"
  WHERE \"deletedAt\" IS NULL
  GROUP BY \"workspaceId\"
)
SELECT
  w.\"displayName\" AS workspace,
  w.subdomain,
  COALESCE(m.member_count, 0) AS members
FROM workspaces w
LEFT JOIN members m ON w.id = m.\"workspaceId\"
ORDER BY w.\"displayName\";"

DUCKDB_OUTPUT="$(env -u YCRM_PG_CONNECTION -u Y_CRM_PG_CONNECTION -u OPENCLAW_YCRM_PG_CONNECTION -u YCRM_POSTGRES_CONNECTION duckdb -json ':memory:' 2>/dev/null <<SQL
${QUERY}
SQL
)"
DUCKDB_STATUS=$?
printf '%s\n' "$DUCKDB_OUTPUT"

if [ "$DUCKDB_STATUS" -ne 0 ]; then
  echo '{"error": "Failed to connect to Y-CRM database. Check server-side YCRM_PG_CONNECTION."}'
fi
