#!/usr/bin/env bash
# start-daemon.sh — Start the task manager as a background daemon
#
# Runs poll-once.sh every 5 minutes via a simple loop.
# Logs to .claude/skills/todolist/logs/daemon.log
#
# Usage:
#   ./start-daemon.sh          # start in background
#   ./start-daemon.sh --fg     # start in foreground (for debugging)
#
# To stop: kill $(cat .claude/skills/todolist/logs/daemon.pid)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/../logs"
mkdir -p "$LOG_DIR"

PID_FILE="$LOG_DIR/daemon.pid"
LOG_FILE="$LOG_DIR/daemon.log"
INTERVAL=300  # 5 minutes

# Check if already running
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Task manager daemon already running (PID $OLD_PID)"
    echo "Stop it with: kill $OLD_PID"
    exit 1
  else
    rm -f "$PID_FILE"
  fi
fi

run_loop() {
  echo "[$(date)] Task manager daemon started (PID $$, interval ${INTERVAL}s)"
  echo "$$" > "$PID_FILE"

  trap 'echo "[$(date)] Daemon stopped"; rm -f "$PID_FILE"; exit 0' INT TERM

  while true; do
    echo ""
    echo "[$(date)] === Poll cycle starting ==="
    CLAUDE_HEADLESS=1 "$SCRIPT_DIR/poll-once.sh" 2>&1 || echo "[$(date)] Poll cycle failed (exit $?)"
    echo "[$(date)] === Poll cycle complete. Sleeping ${INTERVAL}s ==="
    sleep "$INTERVAL"
  done
}

if [ "${1:-}" = "--fg" ]; then
  run_loop 2>&1 | tee -a "$LOG_FILE"
else
  echo "Starting task manager daemon in background..."
  echo "  Log: $LOG_FILE"
  echo "  PID file: $PID_FILE"
  nohup bash -c "$(declare -f run_loop); SCRIPT_DIR='$SCRIPT_DIR' PID_FILE='$PID_FILE' INTERVAL='$INTERVAL' run_loop" >> "$LOG_FILE" 2>&1 &
  DAEMON_PID=$!
  echo "$DAEMON_PID" > "$PID_FILE"
  echo "  PID: $DAEMON_PID"
  echo ""
  echo "Stop with: kill $DAEMON_PID"
fi
