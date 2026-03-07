# OpenClaw Integration Setup

This guide explains how to set up OpenClaw as a persistent agent orchestrator for the todolist app's messaging system.

## Overview

OpenClaw's Gateway daemon replaces the CLI-based `/loop 1m /check-messages` pattern with a persistent background service that survives session restarts. It uses the heartbeat system to poll for pending user messages and dispatch agent responses.

## Prerequisites

1. OpenClaw installed and running (`openclaw gateway run`)
2. The todolist MCP server configured in OpenClaw (see [MCP Configuration](#mcp-configuration))

## HEARTBEAT.md

Create `HEARTBEAT.md` in the todolist workspace directory:

```markdown
# Heartbeat checklist

- Call mcp__todolist__get_pending_sessions to check for unread user messages
- For each pending session without a [Claimed by: ...] tag:
  1. Claim it with mcp__todolist__claim_session (use a unique agent_id)
  2. Read the full conversation with mcp__todolist__get_session
  3. Do the requested work (answer questions, manage todos, edit code, etc.)
  4. Post your response with mcp__todolist__post_to_session
- Skip sessions that are already claimed by another agent
- If no pending messages, reply HEARTBEAT_OK
```

## Heartbeat Configuration

In your `openclaw.json` (or via `openclaw config set`):

```json5
agents: {
  defaults: {
    heartbeat: {
      every: "1m",        // Poll every minute (adjust as needed)
      target: "none"      // Runs internally, no external notification
    }
  }
}
```

- Default interval is 30m; set to `1m` or `5m` for faster response times
- Use `target: "none"` since responses go back through the todolist app, not a chat channel
- Set `0m` to disable heartbeat entirely

## MCP Configuration

Add the todolist MCP server to OpenClaw's MCP config:

```json
{
  "mcpServers": {
    "todolist": {
      "command": "node",
      "args": ["/path/to/todolist/mcp-server/dist/index.js"],
      "env": {
        "TODOLIST_API_URL": "http://localhost:8000",
        "TODOLIST_AUTH_TOKEN": "<your-auth-token>",
        "DEFAULT_SPACE_ID": "<your-space-id>"
      }
    }
  }
}
```

This gives OpenClaw access to all 28+ todolist MCP tools including:
- `get_pending_sessions` — poll for unread messages
- `claim_session` / `release_session` — atomic agent deduplication
- `get_session` / `post_to_session` — read and respond to conversations
- `add_todo` / `update_todo` / `complete_todo` — task management
- `list_todos` / `list_categories` — read app state

## How It Works

1. **Gateway daemon** runs persistently in the background
2. **Every heartbeat tick**, it reads `HEARTBEAT.md` and follows the instructions
3. It calls `get_pending_sessions` to check for new user messages
4. For each pending session, it **claims** it (atomic, prevents duplicates) and handles it
5. When done, it posts the response via `post_to_session`, which auto-clears the claim
6. If nothing needs attention, it replies `HEARTBEAT_OK` (silently dropped by Gateway)

## Session Claiming

The `claim_session` / `release_session` system prevents duplicate work:

- `claim_session(session_id, agent_id)` — atomically claims a session; fails if already claimed by a different agent
- When an agent posts a response (`post_to_session`), the claim is automatically released
- If a user sends a follow-up message, the `agent_id` is preserved so the same agent can resume with context
- `get_pending_sessions` shows `[Claimed by: agent_id]` for claimed sessions

## Comparison: CLI Loop vs OpenClaw Gateway

| Feature | CLI `/loop` | OpenClaw Gateway |
|---------|------------|-----------------|
| Persistence | Dies with CLI session | Runs as system daemon |
| Polling | `/loop 1m /check-messages` | Heartbeat every Nm |
| Agent context | Lost between sessions | Managed by Gateway |
| Multi-agent | Manual worktree isolation | Native session management |
| Setup | Zero config | Requires openclaw.json |

## Webhook Integration (Future)

For even faster response times, a webhook endpoint can be added to the backend that POSTs to OpenClaw's Gateway when a user sends a message. This eliminates polling latency entirely. See the orchestrator integration guide in `AGENTS.md` for the planned webhook API.
