#!/usr/bin/env bash
# check.sh — Run a single /todolist check via Claude Code CLI
#
# Usage:
#   ./check.sh                    # interactive
#   CLAUDE_HEADLESS=1 ./check.sh  # headless (for cron/daemon)
#
# Requirements:
#   - claude CLI in PATH
#   - TODOLIST_AUTH_TOKEN set (or configured in .mcp.json)
#   - MCP server configured in .mcp.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

PROMPT='/todolist check'

cd "$PROJECT_DIR"

if [ "${CLAUDE_HEADLESS:-}" = "1" ]; then
  # Headless mode for cron jobs — print output, non-interactive
  claude --print "$PROMPT" 2>&1
else
  # Interactive mode — opens a Claude Code session
  claude "$PROMPT"
fi
