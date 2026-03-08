---
name: check-messages
description: Poll for pending user messages from the todolist web app's Assistant tab and dispatch subagents to handle them. Use with /loop to continuously monitor.
user-invocable: true
---

# Check Messages

Check for pending user messages and dispatch subagents to handle them. Subagents stay claimed on sessions for persistent back-and-forth conversations with users.

## Instructions

1. Call `mcp__todolist__get_pending_sessions` to check for sessions with unread user messages.
2. If there are no pending messages, respond only with "No pending messages." and stop.
3. **Handle claimed sessions** — if a session shows `[Claimed by: {agent_id}]`, try to **resume** the existing agent with that ID (using the Agent tool's `resume` parameter) so it picks up the follow-up message with full context. If it can't be resumed, reclaim with a new agent.
4. For unclaimed pending sessions, **claim it first** by calling `mcp__todolist__claim_session` with the session_id and a unique agent_id (use `"cc-{session_id_short}"`). If the claim fails, skip that session.
5. Launch a **background Agent** to handle the claimed session:
   - Use the Agent tool with `run_in_background: true`
   - **If the work involves code changes**, use `isolation: "worktree"`
   - The agent communicates directly with the user through the session using CLI commands or MCP tools
6. Do NOT block waiting for agents to finish — dispatch all pending messages in parallel and return immediately.

## Session lifecycle

- **Subagent stays claimed** after posting a response. The agent_id is NOT cleared.
- When the user sends a follow-up, `needs_agent_response` flips to true and the session shows up in `get_pending_sessions` again — but still claimed by the same agent.
- The main agent should **resume** the same subagent so it keeps its context.
- Session auto-releases after **10 assistant responses** (MAX_SESSION_TURNS). After that, the next user message creates a fresh unclaimed pending session.
- Subagents can also explicitly release via `release-session` CLI command or `mcp__todolist__release_session` if they decide the task is done.

## Agent prompt template

For each pending session, launch a background agent with this prompt:

```
You have a pending message from a user in the todolist web app.
Session ID: {session_id}
Session title: {title}
Last message: {last_message}

## How to communicate

You have two ways to interact with the session. Use whichever works:

**Option A: MCP tools** (if available)
- mcp__todolist__get_session — read full conversation
- mcp__todolist__post_to_session — post your response
- mcp__todolist__claim_session — reclaim if needed

**Option B: CLI** (always works)
- `node cli/todolist-cli.js get-session {session_id}` — read full conversation
- `node cli/todolist-cli.js post-message -s {session_id} -c "your message"` — post response
- `node cli/todolist-cli.js watch-session {session_id} --since <ISO timestamp>` — check for new user messages
- `node cli/todolist-cli.js claim-session {session_id} --agent-id {agent_id}` — reclaim session
- `node cli/todolist-cli.js release-session {session_id}` — release when done

Requires env vars: TODOLIST_API_URL, TODOLIST_AUTH_TOKEN, DEFAULT_SPACE_ID

## Important: You stay on this session

After you post a response, you are NOT released. Your agent_id stays claimed on the session. If the user sends a follow-up, the main agent will resume you with the new message. You do NOT need to poll — you'll be resumed with context.

However, while doing long-running work, you should:
1. **Post progress updates** — don't wait until you're done
2. **Check for follow-up messages** periodically:
   - Run `watch-session {session_id} --since <timestamp>` every few steps
   - If the user sent something new, read it and adjust
3. When the task is truly complete, you can explicitly release via `release-session`

## Workflow

1. Read the full session to understand context
2. If this involves new work, create a task via mcp__todolist__add_todo or CLI `add-todo`
3. Post progress updates as you work
4. Check for follow-ups during long tasks via `watch-session`
5. Post your response when done — you stay claimed for follow-ups
6. If you made code changes in a worktree, mention the branch name
```

## Usage

One-time check:
```
/check-messages
```

Continuous polling (every minute):
```
/loop 1m /check-messages
```
