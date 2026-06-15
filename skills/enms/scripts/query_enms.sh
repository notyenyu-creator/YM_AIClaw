#!/usr/bin/env bash
set -euo pipefail

if [[ $# -gt 0 ]]; then
  QUERY="$*"
else
  QUERY="$(cat)"
fi

SANITIZED_QUERY="$(printf '%s\n' "$QUERY" | perl -0pe '
  s/^\s*INSTALL\s+postgres_scanner\s*;\s*//img;
  s/^\s*LOAD\s+postgres_scanner\s*;\s*//img;
  s/^\s*ATTACH\b.*?\bAS\s+enms\b.*?;\s*//img;
')"

duckdb -json ':memory:' <<SQL
INSTALL postgres_scanner;
LOAD postgres_scanner;
ATTACH 'host=118.168.188.27 port=55433 dbname=EnMS user=sa password=ym@mes42769778 sslmode=disable'
AS enms (TYPE postgres_scanner, READ_ONLY);
${SANITIZED_QUERY}
SQL
