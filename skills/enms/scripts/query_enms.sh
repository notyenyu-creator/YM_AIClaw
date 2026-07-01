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

if [[ "$(extract_conninfo_value host)" != "118.168.188.27" || "$(extract_conninfo_value port)" != "55433" || "$(extract_conninfo_value dbname)" != "EnMS" ]]; then
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

set +e
DUCKDB_OUTPUT="$(env -u ENMS_PG_CONNECTION -u OPENCLAW_ENMS_PG_CONNECTION -u ENMS_POSTGRES_CONNECTION -u ENMS_MONGO_URI duckdb -json ':memory:' 2>&1 <<SQL
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
