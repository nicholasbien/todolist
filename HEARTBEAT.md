# Todolist Heartbeat Checklist

## Agent Integration Tasks

- Call `mcp__todolist__get_pending_sessions` to check for unread user messages
- For each pending session without a [Claimed by: ...] tag:
  1. Claim it with `mcp__todolist__claim_session` (use a unique agent_id like "marlin")
  2. Read the full conversation with `mcp__todolist__get_session`
  3. Do the requested work (answer questions, manage todos, etc.)
  4. Post your response with `mcp__todolist__post_to_session`
- Skip sessions that are already claimed by another agent
- If no pending messages, reply HEARTBEAT_OK

## Portfolio Tasks (Periodic)

- Check if Poisson asked for portfolio update
- If yes: run `./portfolio.ts report` or `./portfolio.ts prices`
- Send HTML report to WhatsApp

## Maintenance

- Check for any system alerts or notifications
- Respond to user messages promptly
- Keep workspace organized
