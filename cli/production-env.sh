#!/bin/bash
# Production CLI configuration for todolist.nyc
# Source this file: source /data/workspace/todolist/cli/production-env.sh
#
# NOTE: Backend URL is configured in backend-config.json (single source of truth)
# This script reads from there via jq (install with: apt-get install jq)

# Read backend URL from centralized config
if command -v jq &> /dev/null && [ -f "$(dirname "$0")/../backend-config.json" ]; then
    export TODOLIST_API_URL=$(jq -r '.environments.production.backendUrl' "$(dirname "$0")/../backend-config.json")
else
    # Fallback if jq not available
    export TODOLIST_API_URL=https://todolist-backend-production-a83b.up.railway.app
fi
export TODOLIST_AUTH_TOKEN=7WOHCYUYiv7Ta8KEVFYUM3ozk7hC-7j2CqWiHsuBFuM
export DEFAULT_SPACE_ID=69abce0e50a04398b2ab1709

echo "Production environment configured for todolist.nyc"
echo "API URL: $TODOLIST_API_URL"
echo ""
echo "Commands:"
echo "  todolist list-pending    # Check for pending agent sessions"
echo "  todolist get-session ID  # Get session details"
echo "  todolist claim-session ID # Claim a session"
