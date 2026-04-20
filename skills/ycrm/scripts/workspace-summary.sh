#!/bin/bash
# Y-CRM 工作區資料摘要
# 查詢各工作區的記錄數量統計
# 輸出 JSON 格式

QUERY="INSTALL postgres_scanner; LOAD postgres_scanner; ATTACH 'dbname=default user=postgres password=postgres host=localhost port=5432' AS ycrm (TYPE postgres_scanner, READ_ONLY);

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

duckdb -json ':memory:' "$QUERY" 2>/dev/null

if [ $? -ne 0 ]; then
  echo '{"error": "Failed to connect to Y-CRM database. Is PostgreSQL running on localhost:5432?"}'
fi
