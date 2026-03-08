# Heartbeat — Check for pending user messages

Run this checklist every heartbeat interval.

## Environment

These env vars must be set:
- `TODOLIST_API_URL` — Backend URL (e.g. `https://backend-openclaw.up.railway.app`)
- `TODOLIST_AUTH_TOKEN` — JWT auth token
- `DEFAULT_SPACE_ID` — Default space ID

## Steps

1. Check for pending messages:
   ```bash
   node cli/todolist-cli.js list-pending
   ```

2. If "No pending messages" → reply `HEARTBEAT_OK` and stop.

3. For each pending session:

   **If already claimed by you** (`[Claimed: oc-<id>]`):
   - You previously handled this session — the user sent a follow-up
   - Read the session to see the new message:
     ```bash
     node cli/todolist-cli.js get-session <session_id>
     ```

   **If unclaimed**:
   - Claim it first:
     ```bash
     node cli/todolist-cli.js claim-session <session_id> --agent-id oc-<session_id_short>
     ```
   - Read the full conversation:
     ```bash
     node cli/todolist-cli.js get-session <session_id>
     ```

4. Do the requested work (answer questions, manage todos, edit code, research, etc.)

5. Post progress updates as you work — don't wait until you're done:
   ```bash
   node cli/todolist-cli.js post-message -s <session_id> -c "Looking into this..."
   ```

6. For long tasks, check for follow-up messages periodically:
   ```bash
   node cli/todolist-cli.js watch-session <session_id> --since "2026-03-07T12:00:00"
   ```

7. Post your final response:
   ```bash
   node cli/todolist-cli.js post-message -s <session_id> -c "Done! Here's what I did: ..."
   ```

8. You stay claimed on the session — do NOT release unless the task is truly complete.
   Only release when done:
   ```bash
   node cli/todolist-cli.js release-session <session_id>
   ```

## Important notes

- **You stay claimed** after posting a response. Your agent_id is preserved so you handle follow-ups.
- **Sessions auto-release** after 10 agent responses (MAX_SESSION_TURNS).
- **Resume context**: When a user sends a follow-up to a session you previously handled, you'll see it as `[Claimed: oc-<id>]` in list-pending. Read the full session to refresh your context.
- **Create tasks** for new work: `node cli/todolist-cli.js add-todo "task description"`
- **If code changes are needed**, work in a git worktree to avoid conflicts with other agents.
