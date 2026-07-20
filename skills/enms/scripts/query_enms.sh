#!/usr/bin/env bash
set -euo pipefail

if [[ $# -gt 0 ]]; then
  QUERY="$*"
else
  QUERY="$(cat)"
fi

ENMS_PG_CONNECTION="${ENMS_PG_CONNECTION:-${OPENCLAW_ENMS_PG_CONNECTION:-${ENMS_POSTGRES_CONNECTION:-}}}"

if [[ -z "$ENMS_PG_CONNECTION" ]]; then
  echo "error: 目前 EnMS 資料連線尚未啟用，已停止查詢以避免推測。請維運確認伺服器端 ENMS_PG_CONNECTION 設定。" >&2
  exit 2
fi

extract_conninfo_value() {
  local key="$1"
  printf '%s\n' "$ENMS_PG_CONNECTION" | tr ' ' '\n' | awk -F= -v target="$key" '$1 == target { value=$2 } END { print value }'
}

ENMS_PG_HOST="$(extract_conninfo_value host)"
ENMS_PG_PORT="$(extract_conninfo_value port)"
ENMS_PG_DATABASE="$(extract_conninfo_value dbname)"

if [[ -z "$ENMS_PG_HOST" || -z "$ENMS_PG_PORT" || -z "$ENMS_PG_DATABASE" ]]; then
  echo "error: EnMS 資料連線缺少 host / port / dbname，已停止查詢以避免使用錯誤資料源。" >&2
  exit 2
fi

if [[ -z "${ENMS_PG_ALLOWED_HOST:-}" || -z "${ENMS_PG_ALLOWED_PORT:-}" || -z "${ENMS_PG_ALLOWED_DATABASE:-}" ]]; then
  echo "error: EnMS 授權目標 allowlist 尚未設定完整，已停止查詢以避免使用錯誤資料源。" >&2
  exit 2
fi

if [[ -n "${ENMS_PG_ALLOWED_HOST:-}" && "$ENMS_PG_HOST" != "$ENMS_PG_ALLOWED_HOST" ]]; then
  echo "error: EnMS 資料連線 host 不符合部署環境授權目標，已停止查詢以避免使用錯誤資料源。" >&2
  exit 2
fi

if [[ -n "${ENMS_PG_ALLOWED_PORT:-}" && "$ENMS_PG_PORT" != "$ENMS_PG_ALLOWED_PORT" ]]; then
  echo "error: EnMS 資料連線 port 不符合部署環境授權目標，已停止查詢以避免使用錯誤資料源。" >&2
  exit 2
fi

if [[ -n "${ENMS_PG_ALLOWED_DATABASE:-}" && "$ENMS_PG_DATABASE" != "$ENMS_PG_ALLOWED_DATABASE" ]]; then
  echo "error: EnMS 資料連線不符合正式資料來源限制，已停止查詢以避免使用錯誤資料源。" >&2
  exit 2
fi

ESCAPED_ENMS_PG_CONNECTION="$(printf '%s' "$ENMS_PG_CONNECTION" | perl -pe "s/'/''/g")"

redact_output() {
  perl -pe '
    s/(password|sslpassword|pgpassword)=(?:'\''[^'\'']*'\''|"[^"]*"|\S+)/$1=<redacted>/gi;
    s#(postgres(?:ql)?://[^:/@\s]+:)[^@\s]+(@)#$1<redacted>$2#gi;
    s/ATTACH\s+'\''[^'\'']*'\''\s+AS\s+enms/ATTACH '\''<redacted-connection>'\'' AS enms/gi;
  '
}

SANITIZED_QUERY="$(printf '%s\n' "$QUERY" | perl -0pe '
  s/^\s*INSTALL\s+postgres_scanner\s*;\s*//img;
  s/^\s*LOAD\s+postgres_scanner\s*;\s*//img;
  s/^\s*ATTACH\b.*?\bAS\s+enms\b.*?;\s*//img;
')"

QUERY_FOR_SAFETY="$(printf '%s\n' "$SANITIZED_QUERY" | perl -0pe "
  s/'(?:''|[^'])*'/'string'/g;
  s/\"(?:\"\"|[^\"])*\"/\"identifier\"/g;
  s/--[^\n\r]*//g;
  s#/\\*[\\s\\S]*?\\*/##g;
  s/^\\s+|\\s+\$//g;
  s/;\\s*\$//;
")"

QUERY_FOR_FUNCTION_SAFETY="$(printf '%s\n' "$SANITIZED_QUERY" | perl -0pe "
  s/'(?:''|[^'])*'/'string'/g;
  s/--[^\n\r]*//g;
  s#/\\*[\\s\\S]*?\\*/##g;
")"

if [[ ! "$QUERY_FOR_SAFETY" =~ ^([Ss][Ee][Ll][Ee][Cc][Tt]|[Ww][Ii][Tt][Hh])[[:space:]] ]]; then
  echo "error: EnMS helper 只允許 SELECT / WITH 唯讀查詢。" >&2
  exit 2
fi

if [[ "$QUERY_FOR_SAFETY" == *";"* ]]; then
  echo "error: EnMS helper 一次只允許一段唯讀查詢。" >&2
  exit 2
fi

if printf '%s\n' "$QUERY_FOR_SAFETY" | grep -Eiq '\b(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE|ATTACH|DETACH|INSTALL|LOAD|COPY|EXPORT|IMPORT|GRANT|REVOKE|MERGE|PRAGMA|CALL|SET|VACUUM|BEGIN|COMMIT|ROLLBACK)\b|getenv\s*\(|read_[a-z_]*\s*\(|postgres_(scan|query|execute|attach)\s*\(|query(_table)?\s*\('; then
  echo "error: EnMS helper 偵測到非唯讀或高風險 DuckDB 函式，已停止查詢。" >&2
  exit 2
fi

if printf '%s\n' "$QUERY_FOR_FUNCTION_SAFETY" | grep -Eiq '"?(getenv|read_[a-z_]*|postgres_(scan|query|execute|attach)|query|query_table)"?[[:space:]]*\('; then
  echo "error: EnMS helper 偵測到非唯讀或高風險 DuckDB 函式，已停止查詢。" >&2
  exit 2
fi

set +e
DUCKDB_OUTPUT="$(env -u ENMS_PG_CONNECTION -u OPENCLAW_ENMS_PG_CONNECTION -u ENMS_POSTGRES_CONNECTION -u ENMS_MONGO_URI -u ENMS_PG_ALLOWED_HOST -u ENMS_PG_ALLOWED_PORT -u ENMS_PG_ALLOWED_DATABASE duckdb -json ':memory:' 2>&1 <<SQL
INSTALL postgres_scanner;
LOAD postgres_scanner;
ATTACH '${ESCAPED_ENMS_PG_CONNECTION}'
AS enms (TYPE postgres_scanner, READ_ONLY);
${SANITIZED_QUERY}
SQL
)"
DUCKDB_STATUS=$?
set -e

printf '%s\n' "$DUCKDB_OUTPUT" | redact_output
exit "$DUCKDB_STATUS"
