#!/bin/bash
# Production CLI configuration for todolist.nyc
# Source this file: source /data/workspace/todolist/cli/production-env.sh

export TODOLIST_API_URL=https://todolist-backend-production-a83b.up.railway.app
export TODOLIST_AUTH_TOKEN=7WOHCYUYiv7Ta8KEVFYUM3ozk7hC-7j2CqWiHsuBFuM
export DEFAULT_SPACE_ID=69abce0e50a04398b2ab1709

echo "Production environment configured for todolist.nyc"
echo "API URL: $TODOLIST_API_URL"
echo ""
echo "Commands:"
echo "  todolist list-pending    # Check for pending agent sessions"
echo "  todolist get-session ID  # Get session details"
echo "  todolist claim-session ID # Claim a session"
