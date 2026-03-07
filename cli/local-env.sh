#!/bin/bash
# Local development CLI configuration for todolist.nyc
# Source this file: source /data/workspace/todolist/cli/local-env.sh

export TODOLIST_API_URL=http://localhost:8000
export TODOLIST_AUTH_TOKEN=""
export DEFAULT_SPACE_ID=69abce0e50a04398b2ab1709

echo "Local development environment configured for todolist.nyc"
echo "API URL: $TODOLIST_API_URL"
echo ""
echo "Note: Must obtain token by logging in to local backend"
echo "Then run: export TODOLIST_AUTH_TOKEN=your-local-token"
echo ""
echo "Commands:"
echo "  todolist list-pending    # Check for pending agent sessions"
echo "  todolist get-session ID  # Get session details"
