HEARTBEAT.md checklist

1. Background Sessions Check
   - Run `process list` for running sessions
   - If any running, report status; else continue

2. Production Todolist Check
   Set env vars:
   ```
   export TODOLIST_API_URL="https://backend-openclaw.up.railway.app"
   export TODOLIST_AUTH_TOKEN="iegtE0k95uX-m0KkVK4EUTThDpusnu1HjkG5mVhg0ow"
   export DEFAULT_SPACE_ID="69acf86990e15c7b59794961"
   ```

   Check pending:
   ```
   cd /data/workspace/todolist/cli && node todolist-cli.js list-pending
   ```

   For each pending session:
   - Claim: `node cli/todolist-cli.js claim-session <id> --agent-id oc-main`
   - Read: `node cli/todolist-cli.js get-session <id>`
   - Spawn subagent: `sessions_spawn codex "<task prompt with session ID>"`
   - Save runId to `.openclaw/session-agents.json`
   - Report status (not HEARTBEAT_OK if sessions found)

   For follow-ups (session already in mapping):
   - Load mapping from `.openclaw/session-agents.json`
   - Resume same subagent with new message
   - Do NOT spawn new subagent

3. Session Cap Check
   - Verify session management working (MAX_ACTIVE_SESSIONS=10)

4. Subagent Progress Check
   - Active: `sessions_list --kinds subagent`
   - Check completions and report results

If no pending sessions and no active work: HEARTBEAT_OK

5. Token Refresh (if auth fails with 401/403)
   ```
   curl -s -X POST -H "Content-Type: application/json" \
     -d '{"email": "test@example.com", "code": "000000"}' \
     https://backend-openclaw.up.railway.app/auth/login
   ```
   Update TODOLIST_AUTH_TOKEN with the "token" value from the response.

You are the orchestrator — do NOT do the coding work yourself. Route to subagents.
See AGENTS.md "OpenClaw Subagent Dispatch" for full details and prompt templates.
