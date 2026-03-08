# Heartbeat

- Run `node cli/todolist-cli.js list-pending` to check for user messages
- If no pending messages, reply HEARTBEAT_OK
- For each pending session, claim it: `node cli/todolist-cli.js claim-session <id> --agent-id oc-<id_short>`
- Then dispatch via codex: `codex exec "$(node cli/todolist-cli.js get-session <id> | head -50) — Respond to this user session by running: node cli/todolist-cli.js post-message -s <id> -c '<your response>'"`
- For coding tasks, use: `codex exec --full-auto "Read session <id>, do the work, post response via CLI"`
- See AGENTS.md "OpenClaw Codex Dispatch" section for full prompt template and examples
