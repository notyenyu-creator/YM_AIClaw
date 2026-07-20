#!/usr/bin/env bash

set -euo pipefail

if [[ "$-" == *x* ]]; then
  set +x
  echo "[db-env] xtrace disabled to avoid leaking runtime secrets."
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/web"

REQUESTED_DOMAIN="all"
STRICT="false"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/check-domain-db-env.sh [options]

Options:
  --domain <all|ycrm|erp|enms>  Check one domain or all domains. Default: all
  --strict                      Exit 1 when any requested domain is not ready
  -h, --help                    Show this help

This script checks whether DenchClaw server-side DB runtime environment variables
are present without printing connection strings, passwords, hosts, or customer
network details.
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
}

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    local line key value
    if [[ "$-" == *x* ]]; then
      set +x
      echo "[db-env] xtrace disabled while loading env to avoid leaking runtime secrets."
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

    echo "[db-env] loaded env: ${file#$ROOT_DIR/}"
  fi
}

load_runtime_env() {
  load_env_file "$ROOT_DIR/.env"
  load_env_file "$ROOT_DIR/.env.local"
  load_env_file "$APP_DIR/.env"
  load_env_file "$APP_DIR/.env.local"
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

check_allowlist() {
  local missing=()
  local placeholder=()
  local invalid=()
  local key

  for key in ENMS_PG_ALLOWED_HOST ENMS_PG_ALLOWED_PORT ENMS_PG_ALLOWED_DATABASE; do
    if [[ -z "${!key:-}" ]]; then
      missing+=("$key")
    elif value_has_placeholder "${!key}"; then
      placeholder+=("$key")
    fi
  done

  if [[ -n "${ENMS_PG_ALLOWED_PORT:-}" && ! "${ENMS_PG_ALLOWED_PORT}" =~ ^[0-9]+$ ]]; then
    invalid+=("ENMS_PG_ALLOWED_PORT")
  elif [[ -n "${ENMS_PG_ALLOWED_PORT:-}" ]] && ((ENMS_PG_ALLOWED_PORT < 1 || ENMS_PG_ALLOWED_PORT > 65535)); then
    invalid+=("ENMS_PG_ALLOWED_PORT")
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "missing_allowlist"
    return 1
  fi

  if [[ ${#placeholder[@]} -gt 0 ]]; then
    echo "placeholder_allowlist"
    return 1
  fi

  if [[ ${#invalid[@]} -gt 0 ]]; then
    echo "invalid_allowlist"
    return 1
  fi

  echo "ready"
  return 0
}

print_row() {
  local domain="$1"
  local connection_key="$2"
  local allowlist="$3"
  local status="$4"
  local note="$5"

  printf "%-8s %-32s %-20s %-24s %s\n" "$domain" "$connection_key" "$allowlist" "$status" "$note"
}

check_domain() {
  local domain="$1"
  local label="$2"
  local connection_key=""
  local connection_status="ready"
  local allowlist_status="n/a"
  local status="ready"
  local note="required server-side env keys are present"

  case "$domain" in
    ycrm)
      connection_key="$(first_configured_key YCRM_PG_CONNECTION Y_CRM_PG_CONNECTION OPENCLAW_YCRM_PG_CONNECTION YCRM_POSTGRES_CONNECTION || true)"
      ;;
    erp)
      connection_key="$(first_configured_key ERP_PG_CONNECTION OPENCLAW_ERP_PG_CONNECTION ERP_POSTGRES_CONNECTION || true)"
      ;;
    enms)
      connection_key="$(first_configured_key ENMS_PG_CONNECTION OPENCLAW_ENMS_PG_CONNECTION ENMS_POSTGRES_CONNECTION || true)"
      ;;
    *)
      die "unsupported domain in check_domain: $domain"
      ;;
  esac

  if [[ -z "$connection_key" ]]; then
    connection_key="missing"
    connection_status="missing_connection"
  elif ! key_is_real_value "$connection_key"; then
    connection_status="placeholder_connection"
  fi

  if [[ "$domain" == "enms" ]]; then
    allowlist_status="$(check_allowlist || true)"
  fi

  if [[ "$connection_status" != "ready" ]]; then
    status="$connection_status"
    if [[ "$domain" == "enms" && "$allowlist_status" != "ready" ]]; then
      note="set server-side connection env and EnMS allowlist env"
    else
      note="set the server-side connection env in runtime secrets"
    fi
  elif [[ "$allowlist_status" != "n/a" && "$allowlist_status" != "ready" ]]; then
    status="$allowlist_status"
    note="set EnMS allowlist host, port, and database env"
  fi

  print_row "$label" "$connection_key" "$allowlist_status" "$status" "$note"

  [[ "$status" == "ready" ]]
}

main() {
  parse_args "$@"
  load_runtime_env

  local failed="false"

  echo "[db-env] DenchClaw DB env / secret wiring preflight"
  printf "%-8s %-32s %-20s %-24s %s\n" "Domain" "Connection key" "Allowlist" "Status" "Note"
  printf "%-8s %-32s %-20s %-24s %s\n" "------" "--------------" "---------" "------" "----"

  if [[ "$REQUESTED_DOMAIN" == "all" || "$REQUESTED_DOMAIN" == "ycrm" ]]; then
    check_domain "ycrm" "Y-CRM" || failed="true"
  fi
  if [[ "$REQUESTED_DOMAIN" == "all" || "$REQUESTED_DOMAIN" == "erp" ]]; then
    check_domain "erp" "ERP" || failed="true"
  fi
  if [[ "$REQUESTED_DOMAIN" == "all" || "$REQUESTED_DOMAIN" == "enms" ]]; then
    check_domain "enms" "EnMS" || failed="true"
  fi

  if [[ "$failed" == "true" ]]; then
    echo "[db-env] result: env preflight not ready. Domain queries will fail closed until runtime secrets are configured."
    if [[ "$STRICT" == "true" ]]; then
      exit 1
    fi
    exit 0
  fi

  echo "[db-env] result: env preflight ready. Run DB connection/schema smoke tests next."
}

main "$@"
