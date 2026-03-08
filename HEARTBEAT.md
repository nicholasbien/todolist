# Heartbeat

- Run `node cli/todolist-cli.js list-pending` to check for user messages
- If no pending messages, reply HEARTBEAT_OK
- For each pending session with `[Claimed: oc-<id>]`: resume that subagent with the new message
- For each unclaimed session: claim it (`node cli/todolist-cli.js claim-session <id> --agent-id oc-<id_short>`), then spawn a subagent
- Subagent reads session (`get-session`), does the work, posts response (`post-message`), stays claimed for follow-ups
- Only release (`release-session`) when the task is truly complete
- See AGENTS.md "Subagent Workflow" section for full instructions and CLI reference
