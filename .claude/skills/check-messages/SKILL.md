---
name: check-messages
description: Poll for pending user messages from the todolist web app's Assistant tab and respond to them. Use with /loop to continuously monitor for new messages.
user-invocable: true
---

# Check Messages

Check for pending user messages posted via the todolist web app's Assistant tab and respond to them.

## Instructions

1. Call `mcp__todolist__get_pending_sessions` to check for sessions with unread user messages.
2. If there are no pending messages, respond only with "No pending messages." and stop.
3. For each pending session found, launch a **background Agent** to handle it independently:
   - Use the Agent tool with `run_in_background: true`
   - Pass the session ID and last message to the agent
   - The agent should: read the full session with `mcp__todolist__get_session`, do the requested work, and post the response with `mcp__todolist__post_to_session`
4. Do NOT block waiting for agents to finish — dispatch all pending messages in parallel and return immediately.

## Important: Always create tasks for new work

When an agent picks up a message that involves new work (coding, features, fixes, research), it should **always create a todolist task** via `mcp__todolist__add_todo` before starting. This ensures all work is tracked and visible in the web app. When subtasks are supported, use those for breaking down larger tasks.

## Agent prompt template

For each pending session, launch a background agent with this prompt:

```
You have a pending message from a user in the todolist web app.
Session ID: {session_id}
Session title: {title}
Last message: {last_message}

1. Call mcp__todolist__get_session with session_id "{session_id}" to read the full conversation
2. Understand what the user is asking — it may be about a linked task, a question, or a request for work
3. If this involves new work, create a task via mcp__todolist__add_todo before starting
4. Do the requested work (edit code, answer questions, create tasks, manage todos, etc.)
5. Post your response using mcp__todolist__post_to_session with session_id "{session_id}"
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
