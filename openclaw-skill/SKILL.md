---
name: todolist
description: Manage todos, journal entries, and task-linked chat sessions via the todolist app API. Use when the user asks about their tasks, todos, journal, or wants to add/update/complete tasks.
allowed-tools: ["exec", "cron"]
metadata: {"openclaw": {"requires": {"bins": ["curl", "jq"], "env": ["TODOLIST_AUTH_TOKEN"]}, "primaryEnv": "TODOLIST_AUTH_TOKEN"}}
---

# todolist App Integration

You are connected to a todolist app — an AI-powered collaborative todo list with journaling and task-linked chat sessions.

## Setup

Two environment variables are required:

- `TODOLIST_API_URL` — The API base URL (default: `http://localhost:8141`)
- `TODOLIST_AUTH_TOKEN` — A JWT auth token

If `TODOLIST_AUTH_TOKEN` is not set, help the user log in by running: `bash {baseDir}/scripts/login.sh`

## Authentication

All API requests require the header: `Authorization: Bearer $TODOLIST_AUTH_TOKEN`

If `TODOLIST_API_URL` is not set, default to `http://localhost:8141`.

## Step 1: Get the Space ID

Before any operation, you need a `SPACE_ID`. Call this once and reuse the result:

```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-http://localhost:8141}/spaces" | jq '.'
```

Use the first space's `_id` value as `SPACE_ID` for all subsequent calls. If the user has multiple spaces, ask which one to use.

## Operations

### List Todos

```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-http://localhost:8141}/todos?space_id=SPACE_ID" | jq '.'
```

Each todo has: `_id`, `text`, `completed`, `category`, `priority`, `space_id`.

### Add a Todo

```bash
curl -s -X POST -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "YOUR_TASK_TEXT", "space_id": "SPACE_ID"}' \
  "${TODOLIST_API_URL:-http://localhost:8141}/todos" | jq '.'
```

Only provide `text` and `space_id`. The backend auto-classifies category and priority using AI.

### Update a Todo

```bash
curl -s -X PUT -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "UPDATED_TEXT"}' \
  "${TODOLIST_API_URL:-http://localhost:8141}/todos/TODO_ID" | jq '.'
```

### Complete a Todo

```bash
curl -s -X PUT -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-http://localhost:8141}/todos/TODO_ID/complete" | jq '.'
```

### Delete a Todo

```bash
curl -s -X DELETE -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-http://localhost:8141}/todos/TODO_ID"
```

### Get Journal Entry

```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-http://localhost:8141}/journals?date=YYYY-MM-DD&space_id=SPACE_ID" | jq '.'
```

### Write Journal Entry

```bash
curl -s -X POST -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "JOURNAL_CONTENT", "date": "YYYY-MM-DD", "space_id": "SPACE_ID"}' \
  "${TODOLIST_API_URL:-http://localhost:8141}/journals" | jq '.'
```

### Get Insights

```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-http://localhost:8141}/insights?space_id=SPACE_ID" | jq '.'
```

### Export Data

```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-http://localhost:8141}/export?data=todos&space_id=SPACE_ID&format=json"
```

Supports `data=todos` or `data=journals`, and `format=json` or `format=csv`.

## Chat Sessions

Sessions are conversation threads. There are two types:

1. **Task-linked sessions** — linked to a specific todo via `todo_id`. Each todo can have at most one linked session. These let you track discussions and progress per task.
2. **Direct-chat sessions** — have `agent_id` set but no `todo_id`. These are direct conversations a user started with a specific agent from the Assistant tab. Treat these as conversational exchanges and do not create/update todos unless explicitly asked.

### List Sessions

```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-http://localhost:8141}/agent/sessions?space_id=SPACE_ID" | jq '.'
```

Each session includes: `_id`, `title`, `todo_id` (if linked), `needs_agent_response`, `has_unread_reply`.

### Create a Session Linked to a Todo

```bash
curl -s -X POST -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "SESSION_TITLE", "space_id": "SPACE_ID", "todo_id": "TODO_ID", "initial_message": "FIRST_MESSAGE", "initial_role": "assistant"}' \
  "${TODOLIST_API_URL:-http://localhost:8141}/agent/sessions" | jq '.'
```

- `todo_id` is optional. Omit it for standalone sessions.
- `initial_message` and `initial_role` are optional. Use them to post a first message on creation.

### Get a Session with Messages

```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-http://localhost:8141}/agent/sessions/SESSION_ID" | jq '.'
```

Returns the session with its `display_messages` array and `todo_id`.

### Get Pending Sessions (Awaiting Your Response)

```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-http://localhost:8141}/agent/sessions/pending?space_id=SPACE_ID&agent_id=openclaw" | jq '.'
```

Returns sessions claimed by openclaw plus unclaimed sessions. Each session includes enrichment fields:

- `is_followup` — `true` if openclaw previously responded and the user sent a new message
- `message_count` — total messages in the session
- `recent_messages` — user messages since the last agent response (so you can triage without reading the full session)
- `todo_id` — linked todo ID (if any)
- `agent_id` — which agent claimed this session (if any)

### Reply to a Session

```bash
curl -s -X POST -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "YOUR_REPLY", "role": "assistant", "agent_id": "openclaw"}' \
  "${TODOLIST_API_URL:-http://localhost:8141}/agent/sessions/SESSION_ID/messages" | jq '.'
```

Posting as `assistant` clears the pending flag and notifies the user. The `agent_id` claims the session so followups route back to openclaw.

### Post a Progress Update (Interim)

```bash
curl -s -X POST -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Working on this...", "role": "assistant", "agent_id": "openclaw", "interim": true}' \
  "${TODOLIST_API_URL:-http://localhost:8141}/agent/sessions/SESSION_ID/messages" | jq '.'
```

When `interim` is `true`, the message is posted but `needs_agent_response` is NOT cleared. Use this for progress updates ("Working on this...") while keeping the session in the pending queue for the final response.

### Check Session Status for All Todos

```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-http://localhost:8141}/agent/sessions/unread-todos?space_id=SPACE_ID" | jq '.'
```

Returns `todo_id` → status (`"waiting"` or `"unread_reply"`).

### Delete a Session

```bash
curl -s -X DELETE -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-http://localhost:8141}/agent/sessions/SESSION_ID"
```

## Workflows

### When the user asks about their tasks

1. Get the space ID (step 1 above)
2. List todos
3. Present them clearly

### When the user says "add task" or similar

1. Get the space ID if you don't have it
2. Add the todo — only provide `text` and `space_id`
3. Confirm what was added, including the auto-assigned category

### When the user asks about their journal

1. Use today's date or the date they specify (YYYY-MM-DD format)
2. Call get or write journal

### Responding to Pending Sessions (Agent Loop)

**Routing source of truth:** `GET /agent/sessions/pending?agent_id=openclaw`

Sessions assigned to OpenClaw arrive with `agent_id=openclaw`; when OpenClaw replies, it claims routing for followups.

Backend behavior: polling pending sessions with `agent_id=openclaw` returns sessions already claimed by OpenClaw plus unclaimed sessions.

**Agent routing:** Sessions support an `agent_id` field. When you reply to a session, always include `agent_id=openclaw` — this claims the session so that followup messages from the user route back to you instead of the built-in agent.

Use this workflow to act as an autonomous agent responding to user messages:

1. **Poll** for pending sessions with `agent_id=openclaw` — this returns your claimed sessions AND unclaimed ones
2. **Triage using enrichment fields** — each session includes `is_followup`, `recent_messages`, `message_count`, `todo_id`, and `agent_id` so you can triage without reading the full session history
3. **If `is_followup` is true** — the user sent a new message to a session you previously handled. Check `recent_messages` for what they said and handle accordingly
4. **If `agent_id` is `openclaw` and no `todo_id`** — this is a direct chat session. The user started a conversation with you directly from the Assistant tab (not linked to a task). Respond conversationally. Do not create or update todos unless the user explicitly asks
5. **If not a followup** and the session has `agent_id: openclaw` and `todo_id` — this is a new task pre-routed to you via the agent dropdown. Claim it by posting an interim ack, then do the work
6. **If unclaimed** (no `agent_id`) and `todo_id` is present — **skip** (the built-in agent will handle it). Only handle sessions that are explicitly routed to you via `agent_id`
7. **Post an interim ack** — immediately reply with `interim=true` so the user sees the task was picked up while you work on it
8. **Do the work** — update the todo, add new tasks, write a journal entry, etc.
9. **Reply** to the session with `agent_id=openclaw` (without `interim`) to post the final response

### Creating a Session for a New Task

When you add a todo and want to track discussion:

1. Add the todo and capture its `_id` from the response
2. Create a linked session with `todo_id` set to that `_id`
3. Include an `initial_message` explaining the plan or context

The user will see the session linked to their task in the app and can reply to continue the conversation.

### Sub-Task Management

When a task is complex, break it into sub-tasks for sequential execution. Sub-tasks
execute in **linear order** — only the first sub-task's session starts as pending.
When a sub-task completes, the next one's session is automatically activated.

#### Creating Sub-Tasks

Pass `parent_id` when adding a todo to create it as a sub-task:

```bash
# Create sub-task 1 (appended to parent's subtask_ids, session starts pending)
curl -s -X POST -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Step 1: Research the problem", "space_id": "SPACE_ID", "parent_id": "PARENT_TODO_ID"}' \
  "${TODOLIST_API_URL:-http://localhost:8141}/todos" | jq '.'

# Create sub-task 2 (appended to parent's subtask_ids, session starts dormant)
curl -s -X POST -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Step 2: Implement the solution", "space_id": "SPACE_ID", "parent_id": "PARENT_TODO_ID"}' \
  "${TODOLIST_API_URL:-http://localhost:8141}/todos" | jq '.'
```

Each sub-task:
- Gets appended to the parent's `subtask_ids` array
- Gets its own linked session automatically
- Inherits `agent_id` from the parent's session
- Only the first sub-task (order 0) starts with an active pending session

#### How Sub-Task Orchestration Works

1. **Agent creates sub-tasks** with `parent_id` → sessions created, only first is pending
2. **Agent picks up first sub-task** via polling `GET /agent/sessions/pending` → works on it
3. **First sub-task completes** (via `PUT /todos/TODO_ID/complete`) → backend automatically:
   - Activates the next sub-task's session (`needs_agent_response = true`)
   - Posts progress update to parent session: "Subtask completed: X (1/3 done)"
4. **Next poll picks up the newly-activated sub-task** → works on it
5. **Repeat** until all sub-tasks complete
6. **All done** → backend notifies parent session: "All subtasks complete."
   The **managing agent** is responsible for:
   - Reading subtask session results
   - Posting a final summary to the parent session
   - Completing the parent task via `PUT /todos/TODO_ID/complete`

#### Get Sub-Tasks

```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-http://localhost:8141}/todos/PARENT_TODO_ID/subtasks" | jq '.'
```

#### Sub-Task Workflow

When handling a complex task:
1. Read the task description and notes
2. Create sub-tasks with clear, actionable descriptions and detailed notes
3. **Post a plan to the parent session** describing what each subtask will do:
   e.g. "Breaking this into 3 sub-tasks:\n1. Research the problem — investigate X\n2. Implement solution — build Y\n3. Write tests — cover Z"
4. The first sub-task will automatically become pending for the next poll cycle
5. **Poll for updates** using `GET /agent/sessions/pending?agent_id=openclaw` to
   monitor subtask progress — the backend activates subtasks sequentially
6. As subtasks complete, post progress updates to the parent session
7. Handle any issues — if a subtask fails, read its session and take corrective action
8. When all subtasks complete, the parent session receives a notification
9. Read each subtask's session results, post a final summary, and complete the parent task

#### Sub-Task Display in list_todos

Sub-tasks appear indented under their parent:
```
1. [  ] Build login page [Development] (ID: abc123) [0/3 sub-tasks]
   └─ [done] Design wireframe (ID: def456)
   └─ [  ] Implement frontend (ID: ghi789)
   └─ [  ] Add tests (ID: jkl012)
```

## Error Handling

- **401 Unauthorized** — Token expired. Re-run `{baseDir}/scripts/login.sh` to get a new token.
- **404 Not Found** — The resource doesn't exist. Tell the user.
- **422 Validation Error** — Check the request body format.

## Autonomous Mode (Cron)

The user can ask you to "watch for tasks" or "check my sessions automatically." When they do, set up a cron job that polls for pending sessions and processes them.

### Setting up the task watcher

Tell the user you're creating a cron job, then run:

```
openclaw cron add \
  --name "todolist-watcher" \
  --every "5m" \
  --session isolated \
  --message "Check for pending todolist sessions and respond to them. Use the todolist skill. Follow the 'Responding to Pending Sessions' workflow: routing source of truth is GET /agent/sessions/pending?agent_id=openclaw. This returns sessions claimed by openclaw plus unclaimed sessions. Skip unclaimed sessions (no agent_id) — the built-in agent handles those. Use is_followup/recent_messages for followups, post an interim ack before work, and always reply with agent_id=openclaw to claim routing. If there are no pending sessions, do nothing."
```

This creates an isolated session every 5 minutes that checks for work. Adjust the interval based on user preference.

### Stopping the watcher

```
openclaw cron remove todolist-watcher
```

### What happens in each cycle

1. OpenClaw spawns an isolated session with the todolist skill loaded
2. It polls `GET /agent/sessions/pending?agent_id=openclaw` for claimed + unclaimed sessions
3. For sessions where `is_followup` is true, it checks `recent_messages` and handles the followup
4. For direct-chat sessions (`agent_id=openclaw`, no `todo_id`), it responds conversationally
5. For new task sessions with `agent_id=openclaw` and `todo_id` (pre-routed via dropdown), it posts an interim ack and does the work
6. For unclaimed sessions (no `agent_id`), it skips them — the built-in agent will handle those
8. The isolated session closes — no context pollution in the main chat

### Important

- The cron job runs in its own session, so it won't affect your main conversation
- Each run is independent — the agent reads the full session history each time
- If no sessions are pending, the agent does nothing and exits cleanly
- The user can also manually trigger a check anytime by saying "check my pending sessions"

## Rules

- Never fabricate todo IDs, session IDs, or space IDs. Always get them from API responses.
- Always confirm which space to use if the user has more than one.
- When creating sessions for tasks, use descriptive titles that reference the task.
- Default to today's date for journal operations unless the user specifies otherwise.
- Set `TODOLIST_API_URL` to your deployment URL if not running locally.
