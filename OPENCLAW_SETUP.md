# OpenClaw Integration Setup

This guide explains how to set up OpenClaw as a persistent agent orchestrator for the todolist app's messaging system.

## Overview

OpenClaw's Gateway daemon replaces the CLI-based `/loop 1m /check-messages` pattern with a persistent background service that survives session restarts. It uses the heartbeat system to poll for pending user messages and dispatch agent responses.

## Quick Start

### 1. Install the MCP server dependencies

```bash
cd /path/to/todolist/mcp-server
npm install
npm run build
```

### 2. Get your auth token

Log in to the todolist web app, then grab your session token:
- Open browser DevTools → Application → Local Storage
- Copy the `token` value

Alternatively, use the API directly:
```bash
# Request OTP
curl -X POST https://your-app-url.com/auth/send-code \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com"}'

# Verify OTP and get token
curl -X POST https://your-app-url.com/auth/verify-code \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com", "code": "123456"}'
# Response: {"token": "your-session-token", ...}
```

### 3. Get your space ID

```bash
curl https://your-app-url.com/spaces \
  -H "Authorization: Bearer your-session-token"
# Response: [{"_id": "your-space-id", "name": "My Space", ...}]
```

### 4. Configure OpenClaw MCP server

Run this to add the todolist MCP server to OpenClaw:

```bash
openclaw config set mcpServers.todolist '{
  "command": "node",
  "args": ["/absolute/path/to/todolist/mcp-server/dist/index.js"],
  "env": {
    "TODOLIST_API_URL": "https://your-app-url.com",
    "TODOLIST_AUTH_TOKEN": "your-session-token",
    "DEFAULT_SPACE_ID": "your-space-id"
  }
}'
```

Or add it directly to your `openclaw.json`:

```json
{
  "mcpServers": {
    "todolist": {
      "command": "node",
      "args": ["/absolute/path/to/todolist/mcp-server/dist/index.js"],
      "env": {
        "TODOLIST_API_URL": "https://your-app-url.com",
        "TODOLIST_AUTH_TOKEN": "your-session-token",
        "DEFAULT_SPACE_ID": "your-space-id"
      }
    }
  }
}
```

> **Note:** The MCP server runs locally as a child process of OpenClaw. It makes HTTP requests to your backend API — no server deployment needed.

### 5. Create HEARTBEAT.md

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

### 6. Configure heartbeat interval

```bash
openclaw config set agents.defaults.heartbeat.every "1m"
openclaw config set agents.defaults.heartbeat.target "none"
```

Or in `openclaw.json`:

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

### 7. Verify it works

```bash
# Check that OpenClaw can see the todolist tools
openclaw tools list | grep todolist

# Or just send a test message from the web app and wait for a response
```

## Architecture

```
┌─────────────────────────────────────┐        ┌──────────────────┐
│  Your machine                       │        │  Production      │
│                                     │        │                  │
│  OpenClaw Gateway                   │        │  Backend API     │
│    ├── Heartbeat (every 1m)         │        │  (FastAPI)       │
│    └── MCP Server (child process) ──────HTTP──→               │
│         (node dist/index.js)        │        │                  │
└─────────────────────────────────────┘        └──────────────────┘
```

The MCP server is a thin translation layer: it receives tool calls from OpenClaw via stdin/stdout and turns them into HTTP requests to the backend API. It runs locally — no deployment needed.

## Available MCP Tools

Once configured, OpenClaw has access to 28+ todolist tools:

| Category | Tools |
|----------|-------|
| Messages | `get_pending_sessions`, `get_session`, `post_to_session`, `claim_session`, `release_session` |
| Tasks | `add_todo`, `update_todo`, `complete_todo`, `delete_todo`, `list_todos`, `reorder_todos` |
| Sessions | `create_session`, `list_sessions`, `delete_session` |
| Spaces | `create_space`, `list_spaces`, `update_space`, `invite_to_space`, `list_space_members` |
| Categories | `add_category`, `rename_category`, `delete_category`, `list_categories` |
| Journal | `write_journal`, `get_journal`, `delete_journal` |
| Other | `get_insights`, `export_data` |

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

## Troubleshooting

- **MCP server not found**: Make sure the path in `args` is absolute and `npm run build` has been run
- **Auth errors**: Token may have expired — grab a fresh one from the web app
- **No pending messages**: Check that `TODOLIST_API_URL` points to the right backend and `DEFAULT_SPACE_ID` is correct
- **Heartbeat not firing**: Verify with `openclaw config get agents.defaults.heartbeat` — interval should not be `0m`

## Webhook Integration (Future)

For even faster response times, a webhook endpoint can be added to the backend that POSTs to OpenClaw's Gateway when a user sends a message. This eliminates polling latency entirely. See the orchestrator integration guide in `AGENTS.md` for the planned webhook API.
