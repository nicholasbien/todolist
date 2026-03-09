#!/usr/bin/env bash
# stop-daemon.sh — Stop the todolist daemon

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/../logs/daemon.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "No daemon PID file found. Daemon may not be running."
  exit 0
fi

PID=$(cat "$PID_FILE")

if kill -0 "$PID" 2>/dev/null; then
  echo "Stopping todolist daemon (PID $PID)..."
  kill "$PID"
  rm -f "$PID_FILE"
  echo "Stopped."
else
  echo "Daemon process $PID not found (stale PID file). Cleaning up."
  rm -f "$PID_FILE"
fi
