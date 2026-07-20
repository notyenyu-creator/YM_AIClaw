#!/usr/bin/env bash

set -euo pipefail

if [[ "$-" == *x* ]]; then
  set +x
  echo "[db-smoke] xtrace disabled to avoid leaking runtime secrets."
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/web"

REQUESTED_DOMAIN=""
STRICT="false"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/check-domain-db-smoke.sh [options]

Options:
  --domain <all|ycrm|erp|enms>  Smoke one domain or all domains. Required.
  --strict                      Exit 1 when any requested domain smoke fails
  -h, --help                    Show this help

This script performs read-only DB connection/schema smoke checks through DuckDB
postgres_scanner, matching DenchClaw's runtime path. It never prints connection
strings, passwords, hosts, or customer network details.
EOF
}

die() {
  echo "error: $*" >&2
  exit 1
}

normalize_domain() {
  case "$1" in
    all|ALL)
      echo "all"
      ;;
    ycrm|YCRM|Y-CRM|y-crm|Y_CRM|y_crm)
      echo "ycrm"
      ;;
    erp|ERP)
      echo "erp"
      ;;
    enms|ENMS|EnMS|Enms)
      echo "enms"
      ;;
    *)
      die "unsupported domain: $1"
      ;;
  esac
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --domain)
        [[ $# -ge 2 ]] || die "--domain requires a value"
        REQUESTED_DOMAIN="$(normalize_domain "$2")"
        shift 2
        ;;
      --strict)
        STRICT="true"
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "unknown argument: $1"
        ;;
    esac
  done

  [[ -n "$REQUESTED_DOMAIN" ]] || die "--domain is required. Use --domain enms for EnMS-only gates or --domain all for three-domain smoke."
}

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    local line key value
    if [[ "$-" == *x* ]]; then
      set +x
      echo "[db-smoke] xtrace disabled while loading env to avoid leaking runtime secrets."
    fi

    while IFS= read -r line || [[ -n "$line" ]]; do
      line="${line%$'\r'}"
      line="${line#"${line%%[![:space:]]*}"}"
      line="${line%"${line##*[![:space:]]}"}"

      [[ -z "$line" || "$line" == \#* ]] && continue

      if [[ "$line" =~ ^export[[:space:]]+(.+)$ ]]; then
        line="${BASH_REMATCH[1]}"
      fi

      [[ "$line" == *=* ]] || continue
      key="${line%%=*}"
      value="${line#*=}"
      key="${key//[[:space:]]/}"
      value="${value#"${value%%[![:space:]]*}"}"
      value="${value%"${value##*[![:space:]]}"}"

      [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue

      if [[ ${#value} -ge 2 ]]; then
        if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
          value="${value:1:${#value}-2}"
        elif [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
          value="${value:1:${#value}-2}"
        fi
      fi

      export "$key=$value"
    done < "$file"

    echo "[db-smoke] loaded env: ${file#$ROOT_DIR/}"
  fi
}

load_runtime_env() {
  load_env_file "$ROOT_DIR/.env"
  load_env_file "$ROOT_DIR/.env.local"
  load_env_file "$APP_DIR/.env"
  load_env_file "$APP_DIR/.env.local"
}

value_has_placeholder() {
  local value="$1"
  case "$value" in
    *"<"*">"*|*TODO*|*todo*|*TBD*|*tbd*|*changeme*|*CHANGE_ME*|*change-me*|*your-password*|*your_password*|*YOUR_PASSWORD*|*example*|*EXAMPLE*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

key_is_real_value() {
  local key="$1"
  local value="${!key:-}"
  [[ -n "$value" ]] && ! value_has_placeholder "$value"
}

first_configured_key() {
  local placeholder_key=""
  local key
  for key in "$@"; do
    if [[ -n "${!key:-}" ]]; then
      if key_is_real_value "$key"; then
        echo "$key"
        return 0
      fi
      if [[ -z "$placeholder_key" ]]; then
        placeholder_key="$key"
      fi
    fi
  done
  if [[ -n "$placeholder_key" ]]; then
    echo "$placeholder_key"
    return 0
  fi
  return 1
}

redact_sensitive_text() {
  sed -E \
    -e 's#(postgres(ql)?|mongodb)://[^[:space:];]+#\1://[REDACTED]#g' \
    -e 's/((host|hostaddr|port|dbname|database|user|password)[[:space:]]*=[[:space:]]*)('\''([^'\''\\]|\\.)*'\''|"([^"\\]|\\.)*"|(\\.|[^[:space:];])+)/\1[REDACTED]/g' \
    -e 's/(password[[:space:]]*=[[:space:]]*).*/\1[REDACTED]/g' \
    -e 's/(host ")[^"]+/\1[REDACTED]/g' \
    -e 's/(user ")[^"]+/\1[REDACTED]/g' \
    -e 's/(database ")[^"]+/\1[REDACTED]/g' \
    -e 's/(host name ")[^"]+/\1[REDACTED]/g' \
    -e 's/(server at ")[^"]+/\1[REDACTED]/g' \
    -e 's/(, port )[0-9]+/\1[REDACTED]/g' \
    -e 's/\(([0-9]{1,3}\.){3}[0-9]{1,3}\)/([REDACTED_IP])/g' \
    -e 's/\(([0-9A-Fa-f:]{2,})\)/([REDACTED_IP])/g' \
    -e 's#(://[^:/@[:space:]]+):[^@/[:space:]]+@#\1:[REDACTED]@#g' \
    -e 's/(Authorization:[[:space:]]*Bearer[[:space:]]+)[^[:space:]]+/\1[REDACTED]/g'
}

clear_ambient_libpq_env() {
  unset PGHOST
  unset PGHOSTADDR
  unset PGPORT
  unset PGDATABASE
  unset PGUSER
  unset PGPASSWORD
  unset PGPASSFILE
  unset PGSERVICE
  unset PGSERVICEFILE
  unset PGOPTIONS
}

resolve_duckdb_bin() {
  if [[ -n "${DUCKDB_BIN:-}" && -x "${DUCKDB_BIN}" ]]; then
    echo "$DUCKDB_BIN"
    return 0
  fi

  if command -v duckdb >/dev/null 2>&1; then
    command -v duckdb
    return 0
  fi

  if [[ -x "/opt/homebrew/bin/duckdb" ]]; then
    echo "/opt/homebrew/bin/duckdb"
    return 0
  fi

  return 1
}

sql_quote() {
  printf "%s" "$1" | sed "s/'/''/g"
}

run_domain_sql() {
  local alias="$1"
  local connection="$2"
  local sql="$3"
  local duckdb_bin="$4"
  local escaped_connection
  escaped_connection="$(sql_quote "$connection")"
  local full_sql="INSTALL postgres_scanner; LOAD postgres_scanner; ATTACH '${escaped_connection}' AS ${alias} (TYPE postgres_scanner, READ_ONLY); ${sql}"

  local output
  if output="$(printf "%s" "$full_sql" | "$duckdb_bin" -json :memory: 2>&1)"; then
    printf "%s\n" "$output"
    return 0
  fi

  printf "%s\n" "$output" | redact_sensitive_text
  return 1
}

check_enms_allowlist() {
  local connection="$1"
  local normalized_connection
  local expected_host="${ENMS_PG_ALLOWED_HOST:-}"
  local expected_port="${ENMS_PG_ALLOWED_PORT:-}"
  local expected_db="${ENMS_PG_ALLOWED_DATABASE:-}"
  local actual_host=""
  local actual_port=""
  local actual_db=""
  local part key value

  if [[ "$connection" == *"://"* ]]; then
    echo "unsupported_connection_format"
    return 1
  fi

  normalized_connection="$(printf "%s" "$connection" | tr "[:upper:]" "[:lower:]")"
  if [[ "$normalized_connection" =~ (^|[[:space:]])(hostaddr|service)[[:space:]]*= ]]; then
    echo "unsupported_connection_format"
    return 1
  fi

  if [[ "$normalized_connection" =~ (^|[[:space:]])(host|port|dbname|database)[[:space:]]+= ]]; then
    echo "unsupported_connection_format"
    return 1
  fi

  if [[ -z "$expected_host" || -z "$expected_port" || -z "$expected_db" ]]; then
    echo "missing_allowlist"
    return 1
  fi

  if value_has_placeholder "$expected_host" || value_has_placeholder "$expected_port" || value_has_placeholder "$expected_db"; then
    echo "placeholder_allowlist"
    return 1
  fi

  if [[ ! "$expected_port" =~ ^[0-9]+$ ]] || ((expected_port < 1 || expected_port > 65535)); then
    echo "invalid_allowlist"
    return 1
  fi

  for part in $connection; do
    [[ "$part" == *=* ]] || continue
    key="${part%%=*}"
    value="${part#*=}"
    key="$(printf "%s" "$key" | tr "[:upper:]" "[:lower:]")"
    case "$key" in
      host)
        actual_host="$value"
        ;;
      port)
        actual_port="$value"
        ;;
      dbname)
        actual_db="$value"
        ;;
      database)
        actual_db="$value"
        ;;
    esac
  done

  if [[ "$actual_host" != "$expected_host" || "$actual_port" != "$expected_port" || "$actual_db" != "$expected_db" ]]; then
    echo "allowlist_mismatch"
    return 1
  fi

  echo "ready"
  return 0
}

domain_connection_key() {
  case "$1" in
    ycrm)
      first_configured_key YCRM_PG_CONNECTION Y_CRM_PG_CONNECTION OPENCLAW_YCRM_PG_CONNECTION YCRM_POSTGRES_CONNECTION || true
      ;;
    erp)
      first_configured_key ERP_PG_CONNECTION OPENCLAW_ERP_PG_CONNECTION ERP_POSTGRES_CONNECTION || true
      ;;
    enms)
      first_configured_key ENMS_PG_CONNECTION OPENCLAW_ENMS_PG_CONNECTION ENMS_POSTGRES_CONNECTION || true
      ;;
    *)
      return 1
      ;;
  esac
}

domain_sql() {
  case "$1" in
    ycrm)
      cat <<'SQL'
SELECT
  (SELECT COUNT(*) FROM ycrm.information_schema.tables WHERE table_schema LIKE 'workspace_%') AS workspace_table_count,
  (SELECT COUNT(*) FROM ycrm.information_schema.tables WHERE table_name IN ('company', 'person', 'opportunity', 'workspaceMember')) AS known_table_count
SQL
      ;;
    erp)
      cat <<'SQL'
SELECT
  EXISTS(SELECT 1 FROM erp.public."SO" LIMIT 1) AS has_sales_order_rows,
  EXISTS(SELECT 1 FROM erp.public."B_CUSTOMER" LIMIT 1) AS has_customer_rows,
  EXISTS(SELECT 1 FROM erp.public."INVENTORY" LIMIT 1) AS has_inventory_rows
SQL
      ;;
    enms)
      cat <<'SQL'
SELECT
  (SELECT COUNT(*) FROM enms.information_schema.tables WHERE table_schema = 'public' AND table_name IN ('sites', 'ElectricityMeter', 'PowerAccounts', 'DeviceDataSummaryView')) AS known_table_count,
  EXISTS(SELECT 1 FROM enms.public."sites" LIMIT 1) AS has_site_rows,
  EXISTS(SELECT 1 FROM enms.public."ElectricityMeter" LIMIT 1) AS has_meter_rows,
  EXISTS(SELECT 1 FROM enms.public."PowerAccounts" LIMIT 1) AS has_power_account_rows,
  EXISTS(SELECT 1 FROM enms.public."DeviceDataSummaryView" LIMIT 1) AS has_summary_rows,
  (SELECT COUNT(*) FROM enms.information_schema.columns WHERE table_schema = 'public' AND table_name = 'DeviceDataSummaryView' AND column_name = 'RecordTime') AS has_summary_record_time_column
SQL
      ;;
    *)
      return 1
      ;;
  esac
}

print_row() {
  local domain="$1"
  local key="$2"
  local status="$3"
  local note="$4"
  printf "%-8s %-32s %-18s %s\n" "$domain" "$key" "$status" "$note"
}

smoke_domain() {
  local domain="$1"
  local label="$2"
  local duckdb_bin="$3"
  local key connection allowlist sql output

  key="$(domain_connection_key "$domain")"
  if [[ -z "$key" ]]; then
    print_row "$label" "missing" "missing_env" "run check-domain-db-env.sh first"
    return 1
  fi

  if ! key_is_real_value "$key"; then
    print_row "$label" "$key" "placeholder_env" "replace placeholder runtime secret"
    return 1
  fi

  connection="${!key}"

  if [[ "$domain" == "enms" ]]; then
    allowlist="$(check_enms_allowlist "$connection")"
    if [[ "$allowlist" != "ready" ]]; then
      case "$allowlist" in
        missing_allowlist)
          print_row "$label" "$key" "$allowlist" "set ENMS_PG_ALLOWED_HOST / PORT / DATABASE"
          ;;
        placeholder_allowlist)
          print_row "$label" "$key" "$allowlist" "replace EnMS allowlist placeholders"
          ;;
        invalid_allowlist)
          print_row "$label" "$key" "$allowlist" "ENMS_PG_ALLOWED_PORT must be 1-65535"
          ;;
        unsupported_connection_format)
          print_row "$label" "$key" "$allowlist" "use libpq keyword connection without URI, hostaddr, or service"
          ;;
        allowlist_mismatch)
          print_row "$label" "$key" "$allowlist" "connection host/port/dbname must match EnMS allowlist"
          ;;
        *)
          print_row "$label" "$key" "$allowlist" "EnMS allowlist check failed"
          ;;
      esac
      return 1
    fi
  fi

  sql="$(domain_sql "$domain")"
  if output="$(run_domain_sql "$domain" "$connection" "$sql" "$duckdb_bin")"; then
    local one_line
    one_line="$(printf "%s" "$output" | tr '\n' ' ' | redact_sensitive_text)"
    print_row "$label" "$key" "smoke_pass" "$one_line"
    return 0
  fi

  local error_line
  error_line="$(printf "%s" "$output" | tr '\n' ' ' | cut -c 1-180)"
  print_row "$label" "$key" "smoke_fail" "$error_line"
  return 1
}

main() {
  parse_args "$@"
  load_runtime_env
  clear_ambient_libpq_env

  local duckdb_bin
  if ! duckdb_bin="$(resolve_duckdb_bin)"; then
    echo "[db-smoke] error: DuckDB binary is not available. Install duckdb or set DUCKDB_BIN." >&2
    exit 1
  fi

  local failed="false"

  echo "[db-smoke] DenchClaw read-only DB connection/schema smoke"
  echo "[db-smoke] duckdb: $duckdb_bin"
  printf "%-8s %-32s %-18s %s\n" "Domain" "Connection key" "Status" "Evidence"
  printf "%-8s %-32s %-18s %s\n" "------" "--------------" "------" "--------"

  if [[ "$REQUESTED_DOMAIN" == "all" || "$REQUESTED_DOMAIN" == "ycrm" ]]; then
    smoke_domain "ycrm" "Y-CRM" "$duckdb_bin" || failed="true"
  fi
  if [[ "$REQUESTED_DOMAIN" == "all" || "$REQUESTED_DOMAIN" == "erp" ]]; then
    smoke_domain "erp" "ERP" "$duckdb_bin" || failed="true"
  fi
  if [[ "$REQUESTED_DOMAIN" == "all" || "$REQUESTED_DOMAIN" == "enms" ]]; then
    smoke_domain "enms" "EnMS" "$duckdb_bin" || failed="true"
  fi

  if [[ "$failed" == "true" ]]; then
    echo "[db-smoke] result: smoke failed or not ready."
    if [[ "$STRICT" == "true" ]]; then
      exit 1
    fi
    exit 0
  fi

  echo "[db-smoke] result: smoke passed"
}

main "$@"
