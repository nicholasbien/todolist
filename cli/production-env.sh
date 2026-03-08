#!/bin/bash
# Production CLI configuration for todolist.nyc
# Source this file: source /data/workspace/todolist/cli/production-env.sh
#
# NOTE: Backend URL is configured in backend-config.json (single source of truth)
# This script reads from there via jq (install with: apt-get install jq)

# Read backend URL from centralized config — no fallbacks, fail loudly if missing
if ! command -v jq &> /dev/null; then
    echo "ERROR: jq is required. Install with: apt-get install jq" >&2
    return 1 2>/dev/null || exit 1
fi
CONFIG_FILE="$(dirname "$0")/../backend-config.json"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: backend-config.json not found at $CONFIG_FILE" >&2
    return 1 2>/dev/null || exit 1
fi
export TODOLIST_API_URL=$(jq -r '.environments.production.backendUrl' "$CONFIG_FILE")
export TODOLIST_AUTH_TOKEN="${TODOLIST_AUTH_TOKEN:?Set TODOLIST_AUTH_TOKEN env var}"
export DEFAULT_SPACE_ID=69abce0e50a04398b2ab1709

echo "Production environment configured for todolist.nyc"
echo "API URL: $TODOLIST_API_URL"
echo ""
echo "Commands:"
echo "  todolist list-pending    # Check for pending agent sessions"
echo "  todolist get-session ID  # Get session details"
echo "  todolist claim-session ID # Claim a session"
