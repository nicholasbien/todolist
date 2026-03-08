# Heartbeat — Check for pending user messages

Run this checklist every heartbeat interval. This is the main loop for the OpenClaw agent.

## Environment

These env vars must be set:
- `TODOLIST_API_URL` — Backend URL (e.g. `https://backend-openclaw.up.railway.app`)
- `TODOLIST_AUTH_TOKEN` — JWT auth token
- `DEFAULT_SPACE_ID` — Default space ID

## Steps

### 1. Poll for pending messages

```bash
node cli/todolist-cli.js list-pending
```

If "No pending messages" → reply `HEARTBEAT_OK` and stop.

### 2. For each pending session, dispatch to the right subagent

Each pending session has a session_id and may show `[Claimed: <agent_id>]`.

**Session already claimed by a subagent** (`[Claimed: oc-<id>]`):
- The user sent a follow-up to an ongoing conversation
- **Resume the subagent** that previously handled this session using its agent_id
- Forward the new user message to that subagent so it can continue with context
- The subagent reads the session, sees the new message, and responds

**Unclaimed session** (no `[Claimed: ...]`):
- This is a new conversation — spawn a fresh subagent
- Claim the session first:
  ```bash
  node cli/todolist-cli.js claim-session <session_id> --agent-id oc-<session_id_short>
  ```
- Store the mapping: `session_id → subagent_id` so future heartbeats can resume it
- The subagent reads the session and starts working

### 3. Subagent workflow

Each subagent handles one session. Give it these instructions:

```
You are working on session <session_id>. Your agent_id is <agent_id>.

Read the conversation:
  node cli/todolist-cli.js get-session <session_id>

Post progress updates as you work:
  node cli/todolist-cli.js post-message -s <session_id> -c "Looking into this..."

Check for follow-up messages during long tasks:
  node cli/todolist-cli.js watch-session <session_id> --since <ISO timestamp>

Post your response when done:
  node cli/todolist-cli.js post-message -s <session_id> -c "Here is what I found..."

You stay claimed on this session. Do NOT release unless the user says they're done.
Only release when complete:
  node cli/todolist-cli.js release-session <session_id>
```

### 4. Create tasks for new work

If a message involves new work, create a task to track it:
```bash
node cli/todolist-cli.js add-todo "task description" --priority High
```

## Session-to-subagent mapping

The backend stores `agent_id` on each session in MongoDB. This is how the mapping works:

- When you claim a session, set `agent_id` to a unique ID for the subagent (e.g. `oc-<session_id_short>`)
- When `list-pending` returns a session with `[Claimed: oc-abc123]`, you know subagent `oc-abc123` was handling it
- Resume that subagent with its stored context — don't spawn a new one
- The backend preserves `agent_id` across agent responses (it's NOT cleared when the agent posts)
- After 10 agent responses, `agent_id` auto-clears (MAX_SESSION_TURNS)

## Key rules

- **Stay claimed** — posting a response does NOT release the session
- **Resume, don't re-spawn** — use the agent_id to find and resume the right subagent
- **Progress updates** — post intermediate status so the user sees activity
- **Auto-release at 10 turns** — sessions auto-release after 10 agent responses
- **Explicit release** — only call `release-session` when the task is truly complete
- **Worktrees for code** — if a subagent needs to edit code, use a git worktree
