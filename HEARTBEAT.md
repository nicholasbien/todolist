# Heartbeat checklist for Todolist

- Call mcp__todolist__get_pending_sessions to check for unread user messages
- For each pending session without a [Claimed by: ...] tag:
  1. Claim it with mcp__todolist__claim_session (use a unique agent_id)
  2. Read the full conversation with mcp__todolist__get_session
  3. Do the requested work (answer questions, manage todos, edit code, etc.)
  4. Post your response with mcp__todolist__post_to_session
- Skip sessions that are already claimed by another agent
- If no pending messages, reply HEARTBEAT_OK
