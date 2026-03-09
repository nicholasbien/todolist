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

### Chat Sessions

#### List Sessions
```bash
curl -s -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  "$TODOLIST_API_URL/agent/sessions?space_id=$SPACE_ID"
```

#### Create a Session
```bash
curl -s -X POST -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Session title", "space_id": "SPACE_ID"}' \
  "$TODOLIST_API_URL/agent/sessions"
```

#### Post a Message to a Session
```bash
curl -s -X POST -H "Authorization: Bearer $TODOLIST_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Your message", "role": "user"}' \
  "$TODOLIST_API_URL/agent/sessions/SESSION_ID/messages"
```

## Workflow

When the user asks about their tasks or todos:
1. First call **List Spaces** to get the `space_id` (cache it for subsequent calls)
2. Then call the relevant endpoint

When the user says "add task" or similar:
1. Get the space_id if not cached
2. Call **Add a Todo** with just the text — the backend handles classification

When the user asks about their journal:
1. Use today's date (or the date they specify) in YYYY-MM-DD format
2. Call **Get Journal Entry** or **Write Journal Entry**

## Error Handling

- **401 Unauthorized** — Token expired. Ask the user to re-authenticate by running the login script.
- **404 Not Found** — The resource doesn't exist. Let the user know.
- **422 Validation Error** — Check the request body format.

## Notes

- The app supports multiple collaborative spaces. Always confirm which space to use if the user has more than one.
- Todos are auto-classified by AI into categories (Work, Personal, Health, etc.) and priorities (high, medium, low).
- The production URL is `https://app.todolist.nyc`.
