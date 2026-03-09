#!/usr/bin/env bash
# poll-once.sh — Run a single poll cycle via Claude Code CLI
#
# Usage:
#   ./poll-once.sh                    # interactive
#   CLAUDE_HEADLESS=1 ./poll-once.sh  # headless (for cron)
#
# Requirements:
#   - claude CLI in PATH
#   - TODOLIST_AUTH_TOKEN set (or configured in .mcp.json)
#   - MCP server configured in .mcp.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

PROMPT='Run a single todolist poll cycle: call mcp__todolist__get_pending_sessions with agent_id="claude", triage each session (only handle #claude tagged tasks), dispatch subagents for any new tasks, route follow-ups to existing workers, and report results. Skip sessions without #claude in the todo text. Always post replies with agent_id="claude".'

cd "$PROJECT_DIR"

if [ "${CLAUDE_HEADLESS:-}" = "1" ]; then
  # Headless mode for cron jobs — print output, non-interactive
  claude --print "$PROMPT" 2>&1
else
  # Interactive mode — opens a Claude Code session
  claude "$PROMPT"
fi
