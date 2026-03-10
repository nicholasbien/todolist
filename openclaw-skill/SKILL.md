---
name: todolist
description: Manage todos, journal entries, and task-linked chat sessions via the TodoList app API. Use when the user asks about their tasks, todos, journal, or wants to add/update/complete tasks.
allowed-tools: ["exec", "cron"]
metadata: {"openclaw": {"requires": {"bins": ["curl", "jq"], "env": ["TODOLIST_AUTH_TOKEN"]}, "primaryEnv": "TODOLIST_AUTH_TOKEN"}}
---

# TodoList App Integration

You are connected to a TodoList app — an AI-powered collaborative todo list with journaling and task-linked chat sessions.

## Setup

Two environment variables are required:

- `TODOLIST_API_URL` — The API base URL (default: `https://app.todolist.nyc`)
- `TODOLIST_AUTH_TOKEN` — A JWT auth token

If `TODOLIST_AUTH_TOKEN` is not set, help the user log in by running: `bash {baseDir}/scripts/login.sh`

## Authentication

All API requests require the header: `Authorization: Bearer $TODOLIST_AUTH_TOKEN`

If `TODOLIST_API_URL` is not set, default to `https://app.todolist.nyc`.

## Step 1: Get the Space ID

Before any operation, you need a `SPACE_ID`. Call this once and reuse the result:

```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-https://app.todolist.nyc}/spaces" | jq '.'
```

Use the first space's `_id` value as `SPACE_ID` for all subsequent calls. If the user has multiple spaces, ask which one to use.

## Operations

### List Todos

```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-https://app.todolist.nyc}/todos?space_id=SPACE_ID" | jq '.'
```

Each todo has: `_id`, `text`, `completed`, `category`, `priority`, `space_id`.

### Add a Todo

```bash
curl -s -X POST -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "YOUR_TASK_TEXT", "space_id": "SPACE_ID"}' \
  "${TODOLIST_API_URL:-https://app.todolist.nyc}/todos" | jq '.'
```

Only provide `text` and `space_id`. The backend auto-classifies category and priority using AI.

### Update a Todo

```bash
curl -s -X PUT -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "UPDATED_TEXT"}' \
  "${TODOLIST_API_URL:-https://app.todolist.nyc}/todos/TODO_ID" | jq '.'
```

### Complete a Todo

```bash
curl -s -X PUT -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-https://app.todolist.nyc}/todos/TODO_ID/complete" | jq '.'
```

### Delete a Todo

```bash
curl -s -X DELETE -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-https://app.todolist.nyc}/todos/TODO_ID"
```

### Get Journal Entry

```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-https://app.todolist.nyc}/journals?date=YYYY-MM-DD&space_id=SPACE_ID" | jq '.'
```

### Write Journal Entry

```bash
curl -s -X POST -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "JOURNAL_CONTENT", "date": "YYYY-MM-DD", "space_id": "SPACE_ID"}' \
  "${TODOLIST_API_URL:-https://app.todolist.nyc}/journals" | jq '.'
```

### Get Insights

```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-https://app.todolist.nyc}/insights?space_id=SPACE_ID" | jq '.'
```

### Export Data

```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-https://app.todolist.nyc}/export?data=todos&space_id=SPACE_ID&format=json"
```

Supports `data=todos` or `data=journals`, and `format=json` or `format=csv`.

## Task-Linked Chat Sessions

Sessions are conversation threads that can be **linked to a specific todo** via `todo_id`. Each todo can have at most one linked session. This lets you track discussions and progress per task.

### List Sessions

```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-https://app.todolist.nyc}/agent/sessions?space_id=SPACE_ID" | jq '.'
```

Each session includes: `_id`, `title`, `todo_id` (if linked), `needs_agent_response`, `has_unread_reply`.

### Create a Session Linked to a Todo

```bash
curl -s -X POST -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "SESSION_TITLE", "space_id": "SPACE_ID", "todo_id": "TODO_ID", "initial_message": "FIRST_MESSAGE", "initial_role": "assistant"}' \
  "${TODOLIST_API_URL:-https://app.todolist.nyc}/agent/sessions" | jq '.'
```

- `todo_id` is optional. Omit it for standalone sessions.
- `initial_message` and `initial_role` are optional. Use them to post a first message on creation.

### Get a Session with Messages

```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-https://app.todolist.nyc}/agent/sessions/SESSION_ID" | jq '.'
```

Returns the session with its `display_messages` array and `todo_id`.

### Get Pending Sessions (Awaiting Your Response)

```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-https://app.todolist.nyc}/agent/sessions/pending?space_id=SPACE_ID&agent_id=openclaw" | jq '.'
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
  "${TODOLIST_API_URL:-https://app.todolist.nyc}/agent/sessions/SESSION_ID/messages" | jq '.'
```

Posting as `assistant` clears the pending flag and notifies the user. The `agent_id` claims the session so followups route back to openclaw.

### Post a Progress Update (Interim)

```bash
curl -s -X POST -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Working on this...", "role": "assistant", "agent_id": "openclaw", "interim": true}' \
  "${TODOLIST_API_URL:-https://app.todolist.nyc}/agent/sessions/SESSION_ID/messages" | jq '.'
```

When `interim` is `true`, the message is posted but `needs_agent_response` is NOT cleared. Use this for progress updates ("Working on this...") while keeping the session in the pending queue for the final response.

### Check Session Status for All Todos

```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-https://app.todolist.nyc}/agent/sessions/unread-todos?space_id=SPACE_ID" | jq '.'
```

Returns `todo_id` → status (`"waiting"` or `"unread_reply"`).

### Delete a Session

```bash
curl -s -X DELETE -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "${TODOLIST_API_URL:-https://app.todolist.nyc}/agent/sessions/SESSION_ID"
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

Use this workflow to act as an autonomous agent responding to user messages on tasks:

1. **Poll** for pending sessions with `agent_id=openclaw` — this returns sessions claimed by OpenClaw plus unclaimed sessions
2. **Do not require extra `#openclaw` filtering** — rely on `agent_id` routing + pending state as the decision source
3. **Triage using enrichment fields** — each session includes `is_followup`, `recent_messages`, and `message_count` so you can triage without reading the full session history
4. **If `is_followup` is true** — the user sent a new message to a session you previously handled. Check `recent_messages` for what they said and handle accordingly
5. **If not a followup** — post an interim ack, then do the work
6. **Post an interim ack** — immediately reply with `interim=true` so the user sees the task was picked up while you work on it
7. **Do the work** — update the todo, add new tasks, write a journal entry, etc.
8. **Reply** to the session with `agent_id=openclaw` (without `interim`) to post the final response

### Creating a Session for a New Task

When you add a todo and want to track discussion:

1. Add the todo and capture its `_id` from the response
2. Create a linked session with `todo_id` set to that `_id`
3. Include an `initial_message` explaining the plan or context

The user will see the session linked to their task in the app and can reply to continue the conversation.

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
  --message "Check for pending TodoList sessions and respond to them. Use the todolist skill. Follow the 'Responding to Pending Sessions' workflow: routing source of truth is GET /agent/sessions/pending?agent_id=openclaw. This returns sessions claimed by openclaw plus unclaimed sessions. Do not require extra #openclaw filtering. Use is_followup/recent_messages for followups, post an interim ack before work, and always reply with agent_id=openclaw to claim routing. If there are no pending sessions, do nothing."
```

This creates an isolated session every 5 minutes that checks for work. Adjust the interval based on user preference.

### Stopping the watcher

```
openclaw cron remove todolist-watcher
```

### What happens in each cycle

1. OpenClaw spawns an isolated session with the todolist skill loaded
2. It polls `GET /agent/sessions/pending?agent_id=openclaw` for sessions claimed by OpenClaw plus unclaimed sessions
3. It does not apply additional `#openclaw` tag filtering
4. For sessions where `is_followup` is true, it checks `recent_messages` and handles the followup
5. For other pending sessions in that result set, it posts an interim ack and does the work
6. The isolated session closes — no context pollution in the main chat

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
- The production URL is `https://app.todolist.nyc`.
