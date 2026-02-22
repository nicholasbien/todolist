# Chat Storage Design: Persistent Chat Sessions

## Overview

This document describes the design for persistent storage of chat sessions with the AI assistant. The goal is to allow users to revisit past conversations from a dropdown, while keeping the dropdown fast to load and preserving the full LLM interaction trajectory in MongoDB.

---

## Requirements

- Dropdown menu showing each past chat's first query and date
- Dropdown loads efficiently — no message content fetched just to populate the list
- Full conversation trajectory stored exactly as sent to the LLM provider (OpenAI Responses API format)
- Past chats loaded into UI from raw stored data when user selects one
- No offline support needed for chat history
- Default behavior: visiting the assistant page starts a new chat
- User can select a past chat from the dropdown to resume it

---

## Current State

The current `chats` collection stores individual messages as a flat list:

```js
{ _id, user_id, role, content, space_id, created_at }
```

There is no concept of a "session" or "conversation". All messages for a user/space are lumped together and the last 10 are loaded as rolling context. The frontend uses `sessionStorage` for the current browser session only — history is lost on refresh.

---

## New MongoDB Schema

### `chat_sessions` Collection

Used exclusively for the dropdown listing. Contains no message content.

```js
{
  _id: ObjectId,
  user_id: String,          // owner
  space_id: String | null,  // space context
  title: String,            // first user message, truncated to 120 chars
  created_at: ISODate,
  updated_at: ISODate       // updated on each new message
}
```

**Indexes:**
- `(user_id, space_id, updated_at DESC)` — primary listing query
- `user_id` — security checks

### `chat_trajectories` Collection

One document per session. Stores the full LLM trajectory and the frontend display representation.

```js
{
  _id: ObjectId,
  session_id: String,       // matches chat_sessions._id (string)
  user_id: String,
  space_id: String | null,

  // Full trajectory as passed to OpenAI Responses API input array.
  // Preserved exactly — no transformation. Includes:
  //   {role: "user", content: "..."}
  //   {type: "message", role: "assistant", content: [{type: "output_text", text: "..."}]}
  //   {type: "function_call", call_id: "...", name: "...", arguments: "..."}
  //   {type: "function_call_output", call_id: "...", output: "..."}
  trajectory: Array,

  // Frontend display messages — derived from trajectory events during streaming.
  // Stored so the UI can render a past chat without reconstruction logic.
  //   {role: "user", content: "..."}
  //   {role: "assistant", content: "..."}
  //   {role: "system", content: "🔧 tool_name(...): result", toolData: {tool, args, data}}
  display_messages: Array,

  created_at: ISODate,
  updated_at: ISODate
}
```

**Indexes:**
- `session_id` (unique) — load trajectory for a given session
- `user_id` — auth validation on load

**Why store `display_messages` alongside `trajectory`?**

The raw trajectory uses OpenAI Responses API format, which is different from what the frontend renders. Storing `display_messages` separately avoids complex reconstruction logic on load and keeps the backend/frontend contract simple. The trajectory remains the authoritative source — it is what gets passed back to the LLM when resuming.

---

## API Changes

### Modified: `GET /agent/stream`

Add optional `session_id` query parameter.

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string (required) | User query |
| `space_id` | string (optional) | Space context |
| `session_id` | string (optional) | Resume existing session; omit to start new |

**Behavior:**

- If `session_id` is omitted: create a new `chat_sessions` document, use its ID for the new session.
- If `session_id` is provided: load the trajectory from `chat_trajectories`, append the new turn, stream response, save back.
- The `ready` SSE event gains a `session_id` field so the frontend can store it after the first message.

Updated `ready` event:
```
event: ready
data: {"ok": true, "tools": [...], "space_id": "...", "session_id": "abc123"}
```

### New: `GET /agent/sessions`

List sessions for the dropdown. Only returns lightweight metadata.

**Query params:** `space_id` (optional)

**Response:**
```json
[
  {
    "_id": "abc123",
    "title": "What should I get done today?",
    "created_at": "2026-02-22T14:30:00Z",
    "updated_at": "2026-02-22T14:35:00Z"
  },
  ...
]
```

Sorted by `updated_at DESC`. Limit 50 per request (sufficient for dropdown).

### New: `GET /agent/sessions/{session_id}`

Load a specific past session. Returns trajectory (for resuming) and display_messages (for rendering UI).

**Response:**
```json
{
  "session_id": "abc123",
  "title": "What should I get done today?",
  "display_messages": [...],
  "trajectory": [...],
  "created_at": "...",
  "updated_at": "..."
}
```

### New: `DELETE /agent/sessions/{session_id}`

Delete a single session (both `chat_sessions` and `chat_trajectories` documents).

### Deprecated: `DELETE /agent/history`

Kept for backward compatibility to clear all messages. New UI will use per-session delete.

---

## In-Memory Conversation State

Current in-memory state is keyed by `user_id:space_id`. This limits a user to one active conversation per space.

**New design:** key by `session_id`.

```python
conversation_state: Dict[str, List[Dict[str, Any]]] = {}
# key: session_id → value: trajectory (input_messages array)
```

**On each turn:**
1. If `session_id` not in `conversation_state`: load trajectory from `chat_trajectories` into memory.
2. Append new messages, stream response, execute tools.
3. After response completes: persist updated trajectory back to `chat_trajectories` and update `chat_sessions.updated_at`.

**Cache eviction:** A simple LRU or TTL-based eviction (e.g. drop sessions not accessed in 30 minutes) prevents unbounded memory growth.

---

## Frontend Changes

### State additions to `AgentChatbot`

```ts
const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
const [sessions, setSessions] = useState<SessionMeta[]>([]);
const [sessionsLoading, setSessionsLoading] = useState(false);
```

### Session lifecycle

**On agent tab mount:**
- Fetch `GET /agent/sessions?space_id={id}` to populate dropdown.
- `currentSessionId = null` (new chat).
- `messages = []` (blank state).

**When user sends first message:**
- Backend creates session, returns `session_id` via `ready` SSE event.
- Frontend stores `currentSessionId = session_id`.
- After response, refresh sessions list to show new entry in dropdown.

**When user selects a past session:**
- Call `GET /agent/sessions/{session_id}`.
- Set `messages = response.display_messages`.
- Set `currentSessionId = session_id`.
- User can now send a new message to continue that conversation.

**When user starts a new chat (e.g. "New Chat" button or selecting "New Chat" in dropdown):**
- Set `currentSessionId = null`.
- Set `messages = []`.
- Next message send will create a new session.

**When space changes:**
- Reset `currentSessionId = null`, `messages = []`.
- Re-fetch sessions for the new space.

### Dropdown UI

Place a compact dropdown above or alongside the existing Clear Chat button. Example layout:

```
[ Past Chats ▼ ]  [ New Chat ]  [ Clear ]

Past Chats dropdown shows:
  • What should I get done today?   Feb 22
  • Check the weather in NYC        Feb 21
  • Add tasks for my project        Feb 20
  ...
```

Each entry shows the truncated title and date. Selecting one loads that session. Selecting "New Chat" (top of list or button) clears the view and resets `currentSessionId`.

---

## Data Flow Diagrams

### Starting a new chat

```
User types + sends
        ↓
Frontend: opens EventSource /agent/stream?q=...&space_id=...
        ↓
Backend: no session_id → create chat_sessions doc → session_id = "abc"
        ↓
SSE: event: ready  {session_id: "abc", ...}
        ↓
Frontend: currentSessionId = "abc"
        ↓
Backend: streams tokens + tool_results
        ↓
SSE: event: done
        ↓
Backend: saves trajectory + display_messages to chat_trajectories
         updates chat_sessions.updated_at
        ↓
Frontend: appends session to dropdown list
```

### Resuming a past chat

```
User opens dropdown → GET /agent/sessions
        ↓
Dropdown shows titles + dates (no messages loaded)
        ↓
User selects "What should I get done today?" (session abc)
        ↓
GET /agent/sessions/abc → {display_messages, trajectory}
        ↓
Frontend: renders display_messages, sets currentSessionId = "abc"
        ↓
User sends new message
        ↓
Frontend: opens EventSource /agent/stream?q=...&session_id=abc
        ↓
Backend: loads trajectory from memory or DB, appends new turn
        ↓
SSE: event: ready {session_id: "abc", ...}
        ↓
Streams response, saves updated trajectory
```

---

## Migration from Current Schema

The existing `chats` collection will remain unchanged and continue to function. It is not migrated. Old message history is not surfaced in the new dropdown UI — it stays as the rolling-context fallback if needed. New sessions use the new `chat_sessions` / `chat_trajectories` schema exclusively.

---

## What Is NOT Stored in the Trajectory

- **Developer instructions / system prompt**: dynamically regenerated per request from current date, space name, categories. Not persisted.
- **Tool schemas**: always loaded fresh from `OPENAI_TOOL_SCHEMAS` and MCP at stream time.
- **Auth tokens**: never stored in chat documents.

---

## Summary of New Collections

| Collection | Purpose | Key fields |
|------------|---------|-----------|
| `chat_sessions` | Dropdown listing — no messages | `user_id`, `space_id`, `title`, `updated_at` |
| `chat_trajectories` | Full LLM trajectory + display messages | `session_id`, `user_id`, `trajectory`, `display_messages` |

The existing `chats` collection is left in place but superseded for new conversations.

---

## Open Questions

1. **Pagination for dropdown**: 50 sessions should be sufficient initially. If users accumulate many sessions, add cursor-based pagination.
2. **Session title update**: title is set from the first message. Should we allow renaming? Deferred for later.
3. **Auto-delete old sessions**: No policy set yet. Could add TTL index or a max-sessions-per-user limit later.
4. **Shared spaces**: sessions are user-scoped, even within a shared space. A collaborator's sessions are not visible to other space members. This is consistent with the current behavior.
