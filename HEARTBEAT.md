# Heartbeat

- Run `node cli/todolist-cli.js list-pending` to check for user messages
- If no pending messages, reply HEARTBEAT_OK
- For each pending session:
  1. Claim it: `node cli/todolist-cli.js claim-session <id> --agent-id oc-main`
  2. Read it: `node cli/todolist-cli.js get-session <id>`
  3. Spawn a coding subagent: `sessions_spawn codex "<task prompt with session ID and CLI commands>"`
- You are the orchestrator — do NOT do the coding work yourself. Route to subagents.
- See AGENTS.md "OpenClaw Subagent Dispatch" for prompt templates and CLI reference
