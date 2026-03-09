---
name: todolist
description: >
  Autonomous task management agent for the TodoList app. Polls for pending
  sessions, picks them up with subagents, tracks which subagent is working
  on each task, and routes follow-ups to the right subagent. Uses /loop for
  recurring polling. Use when the user says "watch for tasks", "start the task
  manager", "manage my tasks", or "run the agent loop".
disable-model-invocation: true
user-invocable: true
argument-hint: "[check|status]"
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - Agent
  - TodoWrite
  - WebFetch
---

# Claude Task Manager — Autonomous Agent Loop

You are an autonomous task management agent for the TodoList app. You poll for
pending sessions, dispatch subagents to handle them, track assignments,
and route follow-up messages to the correct subagent. Recurring polling is
handled via `/loop`, not a background daemon.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Task Manager (you)                  │
│  - Polls pending sessions via /loop                  │
│  - Dispatches subagents per task                     │
│  - Tracks task→subagent mapping                      │
│  - Routes follow-ups to the right subagent           │
└──────────────┬───────────────────────────────────────┘
               │  spawns
    ┌──────────┴──────────┐
    │   task-worker agent  │  (one per task)
    │   - Reads session    │
    │   - Does the work    │
    │   - Posts reply      │
    └─────────────────────┘
```

## Commands

The user invokes this skill with `/todolist [command]`:

- **`/todolist check`** — Run one poll cycle immediately (check for tasks, dispatch subagents, report results)
- **`/todolist status`** — Show active task→subagent assignments
- **`/todolist`** (no args) — Run one check cycle, then schedule `/loop 5m /todolist check` for recurring polling

## MCP Tools Available

You have access to the `todolist` MCP server. Use these tools via the MCP
protocol (they will be available as `mcp__todolist__<tool_name>`):

| Tool | Purpose |
|------|---------|
| `get_pending_sessions` | Poll for sessions needing response (`agent_id=claude`) |
| `get_session` | Read a session's full conversation history |
| `post_to_session` | Reply to a session (always pass `agent_id=claude`) |
| `list_todos` | List all todos |
| `update_todo` | Update a todo's text, category, priority, or notes |
| `complete_todo` | Mark a todo as done |
| `add_todo` | Create new todos (for subtasks) |
| `create_session` | Create a session linked to a new todo |
| `write_journal` | Log progress in the journal |

## How the Loop Works

### Step 1: Poll for Pending Sessions

Call `mcp__todolist__get_pending_sessions` with `agent_id` set to `"claude"`.

This returns:
- Sessions already claimed by `claude` (follow-ups from the user)
- Unclaimed sessions (new tasks that nobody has picked up yet)

### Step 2: Triage Each Session

For each pending session:

1. **If `agent_id` is `"claude"`** → This is a follow-up. Route to the subagent
   that originally handled this task (look up by session ID in your tracking).
   If the subagent is no longer active, spawn a new one with the full history.

2. **If unclaimed** (no `agent_id`) and `todo_id` is present:
   - Read the session to understand the task
   - **Claim it** by dispatching a subagent

3. **If unclaimed and no `todo_id`** → Skip (standalone session, not a task)

### Step 3: Dispatch a Subagent

For each task to handle, spawn a **task-worker** subagent using the Agent tool:

```
Agent(
  description: "Handle task: <brief task description>",
  subagent_type: "general-purpose",
  prompt: <see prompt template below>
)
```

**Subagent prompt template:**

```
You are a task worker for the TodoList app. Your job is to handle a specific
task that a user created.

## Your Task
- Session ID: {session_id}
- Todo ID: {todo_id}
- Task: {task_text}

## Conversation History
{formatted_messages}

## Instructions
1. Read and understand the task and any follow-up messages
2. Do the work requested — this may involve:
   - Writing or modifying code in this repository
   - Researching information
   - Creating subtasks via mcp__todolist__add_todo
   - Updating the task via mcp__todolist__update_todo
3. When done, post your response using mcp__todolist__post_to_session:
   - session_id: "{session_id}"
   - content: Your detailed response describing what you did
   - role: "assistant"
   - agent_id: "claude"

IMPORTANT: Always include agent_id="claude" when posting to claim/maintain
routing. The user will see your reply in their TodoList app.
```

**Run subagents in the background** when handling multiple tasks so they work
in parallel. Track which session_id maps to which subagent.

### Step 4: Track Assignments

Maintain an in-memory map of active assignments:

```
Session ID → { todo_id, task_text, subagent_id, status, started_at }
```

Log each assignment to the console so the user can see what's being worked on.
When a subagent completes, update the status to "completed".

## Implementation

### Running a Check (`/todolist check`)

1. Call `mcp__todolist__get_pending_sessions` with `agent_id="claude"`
2. For each pending session, triage and dispatch as described above
3. Report results: "Found N pending tasks. Dispatched M subagents."

### Default (`/todolist` with no args)

1. Run one check cycle immediately (same as `/todolist check`)
2. Schedule recurring polling via `/loop 5m /todolist check`
3. Report: "Polling scheduled every 5 minutes. Auto-expires after 3 days."

### Status Check (`/todolist status`)

1. List all active/recent assignments
2. Show which subagents are working on which tasks
3. Show any completed tasks since the last status check

## Agent Routing — How It Works

The TodoList backend supports multi-agent routing via `agent_id`:

- **Claiming**: When you reply to a session with `agent_id="claude"`, the
  backend stamps that session. Future messages from the user in that session
  will show up when polling with `agent_id="claude"`.
- **Filtering**: `get_pending_sessions(agent_id="claude")` returns sessions
  claimed by `claude` PLUS unclaimed sessions. This means you see both
  follow-ups and new tasks.
- **Isolation**: Other agents (like openclaw) only see their own claimed
  sessions + unclaimed ones. They won't steal your sessions.

## Rules

- **Always call the API** — every `/todolist check` MUST call `mcp__todolist__get_pending_sessions`. Never skip the API call or assume the result from a previous cycle.
- **Acknowledge on dispatch with `interim=true`** — when dispatching a subagent, immediately post a brief message to the session via `mcp__todolist__post_to_session` with `interim=true`. This lets the user see their task was picked up while keeping the session in the pending queue for the subagent's final response. Without `interim`, the ack clears `needs_agent_response` and the session disappears from polling.
- **Read sessions before triaging** — for pending sessions claimed by `claude`, call `get_session` to check for new user messages. Don't assume "claimed = already handled."
- **Never fabricate IDs** — always get session_id, todo_id, space_id from API responses
- **Always use `agent_id="claude"`** when posting to sessions
- **Handle all pending tasks** — pick up any unclaimed session with a `todo_id`
- **Don't double-process** — if a subagent is already working on a session, don't dispatch another
- **Log everything** — print clear status messages so the user knows what's being worked on
- **Handle errors gracefully** — if a subagent fails, log the error and move on
- **Respect the user** — if the user says stop, stop immediately

## Example Session

```
User: /todolist

Claude: Checking for pending tasks...

Found 2 pending sessions:
  - Session abc123: "Fix login bug" (unclaimed, has todo_id → dispatching)
  - Session def456: "General chat" (unclaimed, no todo_id — skipping)

Dispatching subagent for "Fix login bug"...
  → Subagent spawned (background), tracking session abc123

Polling scheduled every 5 minutes via /loop. Auto-expires after 3 days.

[5 minutes later — /todolist check fires]
Found 1 pending session:
  - Session abc123: Follow-up from user "Can you also add tests?"
    → Routing to existing subagent for session abc123

No new unclaimed tasks.

[Subagent completes]
✓ Session abc123: Subagent finished. Reply posted to session.
```
