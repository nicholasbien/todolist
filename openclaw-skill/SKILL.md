---
name: todolist
version: 1.0.0
description: Manage your AI-powered todo list, journal, and chat sessions via the TodoList app API
author: todolist
triggers:
  - todo
  - todos
  - task
  - tasks
  - add task
  - journal
  - write journal
  - my todos
  - todolist
tools:
  - fetch_url
  - run_script
---

# TodoList App Integration

You are connected to a TodoList app — an AI-powered collaborative todo list with journaling and chat sessions.

## Setup

Before first use, the user must set these environment variables (or you can ask them):

- `TODOLIST_API_URL` — The API base URL (default: `https://app.todolist.nyc`)
- `TODOLIST_AUTH_TOKEN` — A JWT auth token

If `TODOLIST_AUTH_TOKEN` is not set, help the user log in by running the `scripts/login.sh` script in this skill's directory. It will prompt for their email and verification code, then return a token.

## Authentication

All API requests require the header:
```
Authorization: Bearer $TODOLIST_AUTH_TOKEN
```

## Available Operations

### List Todos
```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "$TODOLIST_API_URL/todos?space_id=$SPACE_ID"
```
Returns an array of todo objects. Each has `_id`, `text`, `completed`, `category`, `priority`, `space_id`.

### Add a Todo
```bash
curl -s -X POST -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Your task here", "space_id": "SPACE_ID"}' \
  "$TODOLIST_API_URL/todos"
```
The backend auto-classifies the category and priority using AI. You only need to provide `text` and `space_id`.

### Update a Todo
```bash
curl -s -X PUT -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Updated text"}' \
  "$TODOLIST_API_URL/todos/TODO_ID"
```

### Complete a Todo
```bash
curl -s -X PUT -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "$TODOLIST_API_URL/todos/TODO_ID/complete"
```

### Delete a Todo
```bash
curl -s -X DELETE -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "$TODOLIST_API_URL/todos/TODO_ID"
```

### List Spaces
```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "$TODOLIST_API_URL/spaces"
```
Returns available spaces. Use the first space's `_id` as `SPACE_ID` if the user doesn't specify one.

### Get Journal Entry
```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "$TODOLIST_API_URL/journals?date=YYYY-MM-DD&space_id=$SPACE_ID"
```

### Write Journal Entry
```bash
curl -s -X POST -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Journal content here", "date": "YYYY-MM-DD", "space_id": "SPACE_ID"}' \
  "$TODOLIST_API_URL/journals"
```

### Get Insights
```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "$TODOLIST_API_URL/insights?space_id=$SPACE_ID"
```
Returns analytics about todo completion rates, categories, and trends.

### Export Data
```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "$TODOLIST_API_URL/export?data=todos&space_id=$SPACE_ID&format=json"
```
Supports `data=todos` or `data=journals`, and `format=json` or `format=csv`.

### Chat Sessions (Task-Linked Messaging)

Sessions are conversation threads that can be **linked to specific todos** via `todo_id`. This lets you track discussions, context, and progress per task. Each todo can have at most one linked session.

#### List Sessions
```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "$TODOLIST_API_URL/agent/sessions?space_id=$SPACE_ID"
```
Each session object includes: `_id`, `title`, `todo_id` (if linked), `needs_agent_response`, `has_unread_reply`, `created_at`, `updated_at`.

#### Create a Session (Linked to a Todo)
```bash
curl -s -X POST -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Session title", "space_id": "SPACE_ID", "todo_id": "TODO_ID", "initial_message": "First message", "initial_role": "user"}' \
  "$TODOLIST_API_URL/agent/sessions"
```
- `todo_id` (optional) — Links this session to a specific todo. Omit for standalone sessions.
- `initial_message` (optional) — Post a first message automatically on creation.
- `initial_role` (optional) — `"user"` or `"assistant"` (default: `"user"`).

#### Get a Session with Messages
```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "$TODOLIST_API_URL/agent/sessions/SESSION_ID"
```
Returns the session with its full `display_messages` array and `todo_id` link.

#### Get Pending Sessions (Awaiting Response)
```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "$TODOLIST_API_URL/agent/sessions/pending?space_id=$SPACE_ID"
```
Returns sessions where `needs_agent_response` is true — i.e., the user posted a message and is waiting for a reply. Each result includes the `todo_id` if linked.

#### Post a Message to a Session
```bash
curl -s -X POST -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Your response here", "role": "assistant"}' \
  "$TODOLIST_API_URL/agent/sessions/SESSION_ID/messages"
```
- `role`: `"assistant"` (for agent replies) or `"user"` (for user messages).
- Posting as `assistant` clears the `needs_agent_response` flag and sets `has_unread_reply` so the user sees a notification.

#### Get Session Status for All Todos
```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "$TODOLIST_API_URL/agent/sessions/unread-todos?space_id=$SPACE_ID"
```
Returns a map of `todo_id` → status (`"waiting"` or `"unread_reply"`) so you can see at a glance which tasks have active conversations.

#### Delete a Session
```bash
curl -s -X DELETE -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "$TODOLIST_API_URL/agent/sessions/SESSION_ID"
```

## Workflows

### Basic: Managing Todos
1. First call **List Spaces** to get the `space_id` (cache it for subsequent calls)
2. Then call the relevant todo endpoint

### Adding Tasks
1. Get the space_id if not cached
2. Call **Add a Todo** with just the text — the backend handles classification

### Journaling
1. Use today's date (or the date they specify) in YYYY-MM-DD format
2. Call **Get Journal Entry** or **Write Journal Entry**

### Responding to Pending Sessions (Agent Loop)

This is the recommended workflow for acting as an autonomous agent that responds to user messages on tasks:

1. **Poll for pending sessions:**
   ```bash
   curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
     "$TODOLIST_API_URL/agent/sessions/pending?space_id=$SPACE_ID"
   ```

2. **For each pending session**, read the conversation:
   ```bash
   curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
     "$TODOLIST_API_URL/agent/sessions/SESSION_ID"
   ```

3. **Check the linked todo** (if `todo_id` is present) to understand context:
   ```bash
   curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
     "$TODOLIST_API_URL/todos/TODO_ID"
   ```

4. **Do the work** — update the todo, add new tasks, write a journal entry, etc.

5. **Reply to the session** with a summary of what you did:
   ```bash
   curl -s -X POST -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"content": "Done! I updated the task and added 2 subtasks.", "role": "assistant"}' \
     "$TODOLIST_API_URL/agent/sessions/SESSION_ID/messages"
   ```

### Creating a Session for a Task

When you add or update a todo and want to track discussion on it:

1. **Add the todo** and capture its `_id` from the response.
2. **Create a linked session:**
   ```bash
   curl -s -X POST -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"title": "Discussion: Task name", "space_id": "SPACE_ID", "todo_id": "TODO_ID", "initial_message": "Created this task. Here is the plan...", "initial_role": "assistant"}' \
     "$TODOLIST_API_URL/agent/sessions"
   ```

Now the user will see this session linked to their task in the app, and can reply to continue the conversation.

## Error Handling

- **401 Unauthorized** — Token expired. Ask the user to re-authenticate by running the login script.
- **404 Not Found** — The resource doesn't exist. Let the user know.
- **422 Validation Error** — Check the request body format.

## Notes

- The app supports multiple collaborative spaces. Always confirm which space to use if the user has more than one.
- Todos are auto-classified by AI into categories (Work, Personal, Health, etc.) and priorities (high, medium, low).
- The production URL is `https://app.todolist.nyc`.
