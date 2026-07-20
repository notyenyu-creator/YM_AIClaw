#!/usr/bin/env bash

set -euo pipefail

if [[ "$-" == *x* ]]; then
  set +x
  echo "[dench-web] xtrace disabled to avoid leaking runtime secrets."
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/web"

PORT="3200"
HOST="0.0.0.0"
MODE="restart"
RUN_STYLE="detach"
SKIP_BUILD="false"

PID_FILE=""
LOG_FILE=""
SCREEN_NAME=""

usage() {
  cat <<'EOF'
Usage:
  bash scripts/dench-web-standalone.sh [command] [options]

Commands:
  build      Run web build + web:prepack only
  start      Start the standalone web server
  stop       Stop the current listener on the configured port
  restart    Stop, rebuild, prepack, then start again (default)
  status     Show current listener, pid file, and health status

Options:
  --port <port>         Listen port. Default: 3200
  --host <host>         Bind host. Default: 0.0.0.0
  --foreground          Keep the server attached to the current shell
  --detach              Start the server in the background (default)
  --skip-build          Skip build + prepack for start/restart
  -h, --help            Show this help

Examples:
  bash scripts/dench-web-standalone.sh restart --port 3200 --detach
  bash scripts/dench-web-standalone.sh restart --port 3200 --foreground
  bash scripts/dench-web-standalone.sh stop --port 3200
  bash scripts/dench-web-standalone.sh status --port 3200
EOF
}

die() {
  echo "error: $*" >&2
  exit 1
}

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    local line key value
    if [[ "$-" == *x* ]]; then
      set +x
      echo "[dench-web] xtrace disabled while loading env to avoid leaking runtime secrets."
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

    echo "[dench-web] loaded env: ${file#$ROOT_DIR/}"
  fi
}

load_runtime_env() {
  local script_port="$PORT"
  local script_host="$HOST"
  local script_mode="$MODE"
  local script_run_style="$RUN_STYLE"
  local script_skip_build="$SKIP_BUILD"
  load_env_file "$ROOT_DIR/.env"
  load_env_file "$ROOT_DIR/.env.local"
  load_env_file "$APP_DIR/.env"
  load_env_file "$APP_DIR/.env.local"
  PORT="$script_port"
  HOST="$script_host"
  MODE="$script_mode"
  RUN_STYLE="$script_run_style"
  SKIP_BUILD="$script_skip_build"
  PID_FILE="/tmp/denchclaw-web-${PORT}.pid"
  LOG_FILE="/tmp/denchclaw-web-${PORT}.log"
  SCREEN_NAME="denchclaw-web-${PORT}"
}

has_any_env_key() {
  local key
  for key in "$@"; do
    if [[ -n "${!key:-}" ]]; then
      return 0
    fi
  done
  return 1
}

warn_missing_db_runtime_env() {
  local missing=()
  if ! has_any_env_key YCRM_PG_CONNECTION Y_CRM_PG_CONNECTION OPENCLAW_YCRM_PG_CONNECTION YCRM_POSTGRES_CONNECTION; then
    missing+=("Y-CRM")
  fi
  if ! has_any_env_key ERP_PG_CONNECTION OPENCLAW_ERP_PG_CONNECTION ERP_POSTGRES_CONNECTION; then
    missing+=("ERP")
  fi
  if ! has_any_env_key ENMS_PG_CONNECTION OPENCLAW_ENMS_PG_CONNECTION ENMS_POSTGRES_CONNECTION; then
    missing+=("EnMS")
  fi
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "[dench-web] warning: DB runtime env missing for ${missing[*]}; affected domain queries will fail closed instead of guessing."
  fi
  if has_any_env_key ENMS_PG_CONNECTION OPENCLAW_ENMS_PG_CONNECTION ENMS_POSTGRES_CONNECTION; then
    if ! has_any_env_key ENMS_PG_ALLOWED_HOST || ! has_any_env_key ENMS_PG_ALLOWED_PORT || ! has_any_env_key ENMS_PG_ALLOWED_DATABASE; then
      echo "[dench-web] warning: EnMS DB env is present but ENMS_PG_ALLOWED_HOST / ENMS_PG_ALLOWED_PORT / ENMS_PG_ALLOWED_DATABASE is incomplete."
    fi
  fi
}

validate_runtime_args() {
  if [[ ! "$PORT" =~ ^[0-9]+$ ]] || ((PORT < 1 || PORT > 65535)); then
    die "--port must be a number between 1 and 65535"
  fi

  if [[ ! "$HOST" =~ ^[A-Za-z0-9_.:-]+$ ]]; then
    die "--host contains unsupported characters"
  fi
}

redact_sensitive_log() {
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

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      build|start|stop|restart|status)
        MODE="$1"
        shift
        ;;
      --port)
        [[ $# -ge 2 ]] || die "--port requires a value"
        PORT="$2"
        shift 2
        ;;
      --host)
        [[ $# -ge 2 ]] || die "--host requires a value"
        HOST="$2"
        shift 2
        ;;
      --foreground)
        RUN_STYLE="foreground"
        shift
        ;;
      --detach)
        RUN_STYLE="detach"
        shift
        ;;
      --skip-build)
        SKIP_BUILD="true"
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

  PID_FILE="/tmp/denchclaw-web-${PORT}.pid"
  LOG_FILE="/tmp/denchclaw-web-${PORT}.log"
  SCREEN_NAME="denchclaw-web-${PORT}"
}

find_listener_pids() {
  lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true
}

show_listener_summary() {
  lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P 2>/dev/null || true
}

wait_for_http() {
  local url="http://127.0.0.1:${PORT}/"
  local attempts=40

  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS -I "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done

  return 1
}

ensure_bundle_ready() {
  local server_entry="$APP_DIR/.next/standalone/apps/web/server.js"
  local static_dir="$APP_DIR/.next/standalone/apps/web/.next/static"
  local public_dir="$APP_DIR/.next/standalone/apps/web/public"

  [[ -f "$server_entry" ]] || die "standalone server missing: $server_entry"
  [[ -d "$static_dir" ]] || die "standalone static assets missing: $static_dir"
  [[ -d "$public_dir" ]] || die "standalone public assets missing: $public_dir"
}

build_bundle() {
  echo "[dench-web] building apps/web..."
  (cd "$APP_DIR" && pnpm build)

  echo "[dench-web] running web:prepack..."
  (cd "$ROOT_DIR" && pnpm web:prepack)

  ensure_bundle_ready
}

stop_server() {
  local pids
  pids="$(find_listener_pids)"

  if [[ -z "$pids" && ! -f "$PID_FILE" ]]; then
    echo "[dench-web] no listener found on port $PORT"
    return 0
  fi

  if [[ -n "$pids" ]]; then
    echo "[dench-web] stopping listener(s) on port $PORT: $pids"
    kill $pids 2>/dev/null || true
  fi

  if [[ -f "$PID_FILE" ]]; then
    local pid_from_file
    pid_from_file="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid_from_file" ]]; then
      kill "$pid_from_file" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi

  if command -v screen >/dev/null 2>&1; then
    screen -S "$SCREEN_NAME" -X quit >/dev/null 2>&1 || true
  fi

  for _ in {1..20}; do
    if [[ -z "$(find_listener_pids)" ]]; then
      echo "[dench-web] port $PORT is clear"
      return 0
    fi
    sleep 0.25
  done

  die "port $PORT is still occupied after stop"
}

start_detached() {
  local server_entry="$APP_DIR/.next/standalone/apps/web/server.js"

  warn_missing_db_runtime_env
  : >"$LOG_FILE"

  if command -v screen >/dev/null 2>&1; then
    screen -S "$SCREEN_NAME" -X quit >/dev/null 2>&1 || true
    screen -dmS "$SCREEN_NAME" bash -lc "echo \$\$ > '$PID_FILE'; cd '$APP_DIR'; exec env PORT='$PORT' HOSTNAME='$HOST' node '$server_entry' >>'$LOG_FILE' 2>&1"
  else
    (
      cd "$APP_DIR"
      nohup env PORT="$PORT" HOSTNAME="$HOST" node "$server_entry" >>"$LOG_FILE" 2>&1 < /dev/null &
      echo $! >"$PID_FILE"
    )
  fi

  if ! wait_for_http; then
    echo "[dench-web] startup log:" >&2
    sed -n '1,120p' "$LOG_FILE" | redact_sensitive_log >&2 || true
    die "standalone server did not become healthy on port $PORT"
  fi

  echo "[dench-web] started in background"
  echo "[dench-web] pid file: $PID_FILE"
  echo "[dench-web] log file: $LOG_FILE"
  if command -v screen >/dev/null 2>&1; then
    echo "[dench-web] screen session: $SCREEN_NAME"
  fi
  show_listener_summary
}

start_foreground() {
  local server_entry="$APP_DIR/.next/standalone/apps/web/server.js"

  warn_missing_db_runtime_env
  echo "[dench-web] starting in foreground on http://127.0.0.1:${PORT}"
  echo "[dench-web] press Ctrl+C to stop"
  cd "$APP_DIR"
  exec env PORT="$PORT" HOSTNAME="$HOST" node "$server_entry"
}

status_server() {
  echo "[dench-web] mode: standalone"
  echo "[dench-web] port: $PORT"
  echo "[dench-web] host: $HOST"
  echo "[dench-web] pid file: $PID_FILE"
  echo "[dench-web] log file: $LOG_FILE"
  echo "[dench-web] screen session: $SCREEN_NAME"

  if [[ -f "$PID_FILE" ]]; then
    echo "[dench-web] recorded pid: $(cat "$PID_FILE" 2>/dev/null || true)"
  fi

  if command -v screen >/dev/null 2>&1; then
    screen -ls | grep -F "$SCREEN_NAME" || true
  fi

  if show_listener_summary | grep -q .; then
    :
  else
    echo "[dench-web] no active listener on port $PORT"
  fi

  if curl -fsS -I "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
    echo "[dench-web] health: ok"
  else
    echo "[dench-web] health: unavailable"
  fi
}

main() {
parse_args "$@"
validate_runtime_args
load_runtime_env
validate_runtime_args

case "$MODE" in
    build)
      build_bundle
      ;;
    stop)
      stop_server
      ;;
    status)
      status_server
      ;;
    start)
      [[ "$SKIP_BUILD" == "true" ]] || build_bundle
      ensure_bundle_ready
      if [[ "$RUN_STYLE" == "foreground" ]]; then
        start_foreground
      else
        start_detached
      fi
      ;;
    restart)
      stop_server
      [[ "$SKIP_BUILD" == "true" ]] || build_bundle
      ensure_bundle_ready
      if [[ "$RUN_STYLE" == "foreground" ]]; then
        start_foreground
      else
        start_detached
      fi
      ;;
    *)
      die "unsupported mode: $MODE"
      ;;
  esac
}

main "$@"
