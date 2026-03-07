---
name: check-messages
description: Poll for pending user messages from the todolist web app and respond to them. Use with /loop to continuously monitor.
user_invocable: true
---

# Check Messages

Check for pending user messages posted via the todolist web app's Assistant tab and respond to them.

## Instructions

1. Call the `mcp__todolist__get_pending_sessions` tool to check for sessions with unread user messages.
2. If there are no pending messages, do nothing — just say "No pending messages."
3. For each pending session found:
   a. Call `mcp__todolist__get_session` with the session ID to read the full conversation history
   b. Understand what the user is asking — it may be about a linked task, a question, or a request for work
   c. Do the requested work (edit code, research, answer questions, etc.)
   d. Post your response back using `mcp__todolist__post_to_session` with the session ID
4. Keep responses concise and actionable.

## Usage

One-time check:
```
/check-messages
```

Continuous polling (every 30 seconds):
```
/loop 30s /check-messages
```

## Context

The todolist app has an Assistant tab where users can send messages. These messages are stored in chat sessions. Sessions may be linked to specific tasks (via todo_id). When you respond via `post_to_session`, the user sees your response in the web app within ~10 seconds (frontend polls).

The `get_pending_sessions` tool returns sessions where the last message has role "user" — meaning the user is waiting for a response.
