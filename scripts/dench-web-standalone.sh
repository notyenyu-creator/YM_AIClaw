#!/usr/bin/env bash

set -euo pipefail

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
    sed -n '1,120p' "$LOG_FILE" >&2 || true
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
