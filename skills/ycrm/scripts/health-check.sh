#!/bin/bash
# Y-CRM 健康檢查腳本
# 檢查 PostgreSQL、後端 API、前端、Redis 的運行狀態
# 輸出 JSON 格式結果

echo "{"

# 1. PostgreSQL
PG_STATUS="false"
if duckdb ':memory:' "INSTALL postgres_scanner; LOAD postgres_scanner; ATTACH 'dbname=default user=postgres password=postgres host=localhost port=5432' AS ycrm (TYPE postgres_scanner, READ_ONLY); SELECT 1;" > /dev/null 2>&1; then
  PG_STATUS="true"
fi
echo "  \"postgresql\": $PG_STATUS,"

# 2. 後端 API（嘗試本地開發 3000 和 Docker 8867）
BACKEND_STATUS="false"
BACKEND_URL=""
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/healthz 2>/dev/null | grep -q "200"; then
  BACKEND_STATUS="true"
  BACKEND_URL="http://localhost:3000"
elif curl -s -o /dev/null -w "%{http_code}" http://localhost:8867/healthz 2>/dev/null | grep -q "200"; then
  BACKEND_STATUS="true"
  BACKEND_URL="http://localhost:8867"
fi
echo "  \"backend\": $BACKEND_STATUS,"
echo "  \"backend_url\": \"$BACKEND_URL\","

# 3. 前端（嘗試本地開發 3001 和 Docker 8866）
FRONTEND_STATUS="false"
FRONTEND_URL=""
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 2>/dev/null | grep -qE "200|304"; then
  FRONTEND_STATUS="true"
  FRONTEND_URL="http://localhost:3001"
elif curl -s -o /dev/null -w "%{http_code}" http://localhost:8866 2>/dev/null | grep -qE "200|304"; then
  FRONTEND_STATUS="true"
  FRONTEND_URL="http://localhost:8866"
fi
echo "  \"frontend\": $FRONTEND_STATUS,"
echo "  \"frontend_url\": \"$FRONTEND_URL\","

# 4. Redis
REDIS_STATUS="false"
if redis-cli ping 2>/dev/null | grep -q "PONG"; then
  REDIS_STATUS="true"
elif docker exec $(docker ps -q -f name=redis 2>/dev/null) redis-cli ping 2>/dev/null | grep -q "PONG"; then
  REDIS_STATUS="true"
fi
echo "  \"redis\": $REDIS_STATUS,"

# 5. 工作區數量
WS_COUNT=0
if [ "$PG_STATUS" = "true" ]; then
  WS_COUNT=$(duckdb -json ':memory:' "INSTALL postgres_scanner; LOAD postgres_scanner; ATTACH 'dbname=default user=postgres password=postgres host=localhost port=5432' AS ycrm (TYPE postgres_scanner, READ_ONLY); SELECT COUNT(*) AS cnt FROM ycrm.core.workspace WHERE \"deletedAt\" IS NULL;" 2>/dev/null | grep -o '"cnt":[0-9]*' | grep -o '[0-9]*' || echo "0")
fi
echo "  \"workspace_count\": $WS_COUNT"

echo "}"
