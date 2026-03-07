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
3. For each pending session found:
   a. Call `mcp__todolist__get_session` with the session ID to read the full conversation history and understand context
   b. The session may be linked to a task (todo_id) — check the initial message for task context
   c. Understand what the user is asking and do the requested work (edit code, answer questions, create tasks, etc.)
   d. Post your response back using `mcp__todolist__post_to_session` with the session ID and your response as content

## Usage

One-time check:
```
/check-messages
```

Continuous polling (every 30 seconds):
```
/loop 30s /check-messages
```
