# OpenClaw Integration Setup

This guide explains how to set up OpenClaw as a persistent agent orchestrator for the todolist app's messaging system.

## Overview

OpenClaw's Gateway daemon replaces the CLI-based `/loop 1m /check-messages` pattern with a persistent background service that survives session restarts. It uses the heartbeat system to poll for pending user messages and dispatch agent responses.

**CLI-first approach:** All agent interactions use `node cli/todolist-cli.js` commands (no MCP dependency). The MCP server is optional — configure it if you want richer tool integration, but the CLI covers all session operations.

**Key difference from Claude Code:** OpenClaw agents stay claimed on sessions across heartbeats, enabling persistent multi-turn conversations with users.

## Quick Start

### 1. Install the MCP server dependencies

```bash
cd /path/to/todolist/mcp-server
npm install
npm run build
```

### 2. Get your auth token

```bash
# For test account (instant, no email):
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "code": "000000"}' \
  https://backend-openclaw.up.railway.app/auth/login
# Response: {"token": "your-session-token", ...}
```

Or log in to the web app → DevTools → Application → Local Storage → copy `auth_token`.

### 3. Get your space ID

```bash
curl -s https://backend-openclaw.up.railway.app/spaces \
  -H "Authorization: Bearer your-session-token"
# Response: [{"_id": "your-space-id", "name": "Personal", ...}]
```

### 4. Configure OpenClaw

Add the todolist MCP server to your OpenClaw config:

```json
{
  "mcpServers": {
    "todolist": {
      "command": "node",
      "args": ["/absolute/path/to/todolist/mcp-server/dist/index.js"],
      "env": {
        "TODOLIST_API_URL": "https://backend-openclaw.up.railway.app",
        "TODOLIST_AUTH_TOKEN": "your-session-token",
        "DEFAULT_SPACE_ID": "your-space-id"
      }
    }
  }
}
```

### 5. HEARTBEAT.md

`HEARTBEAT.md` is already included in the repo root. It's a short checklist (per OpenClaw best practices — keep it small since it's injected every heartbeat cycle). Detailed subagent instructions are in `AGENTS.md` under "OpenClaw Subagent Dispatch".

**Important:** Do NOT put secrets (tokens, API keys) in HEARTBEAT.md — use env vars in the config instead.

**Orchestrator role:** OpenClaw is the high-level orchestrator. It does NOT do coding work itself. On each heartbeat, it checks for pending sessions, claims them, and spawns coding subagents (Codex, Claude Code) via `sessions_spawn`. It tracks session-to-subagent mappings in `.openclaw/session-agents.json` so follow-up messages route to the same subagent. See AGENTS.md for the full dispatch flow and prompt templates.

### 6. Configure heartbeat interval

```bash
openclaw config set agents.defaults.heartbeat.every "1m"
openclaw config set agents.defaults.heartbeat.target "none"
```

### 7. Verify it works

```bash
# Check that OpenClaw can see the todolist tools
openclaw tools list | grep todolist

# Send a test message from the web app's Assistant tab and wait ~1 minute
```

## Architecture

```
┌───────────────────────────────────────────┐        ┌──────────────────┐
│  Your machine                             │        │  Railway          │
│                                           │        │                  │
│  OpenClaw Gateway (orchestrator)          │        │  Backend API     │
│    ├── Heartbeat (every 1m)               │        │  (FastAPI)       │
│    │     ├── list-pending via CLI ────────────HTTP──→               │
│    │     ├── claim-session ──────────────────HTTP──→               │
│    │     ├── sessions_spawn codex ──┐     │        │  MongoDB         │
│    │     │    (or claude, etc.)     │     │        │                  │
│    │     └── save runId mapping     │     │        │                  │
│    │                                │     │        │                  │
│    ├── Codex subagent (run_xyz) ────┘     │        │                  │
│    │     ├── get-session ────────────────────HTTP──→               │
│    │     ├── (do coding work)             │        │                  │
│    │     ├── post-message ──────────────────HTTP──→               │
│    │     └── watch-session ─────────────────HTTP──→               │
│    │                                      │        │                  │
│    └── session-agents.json (tracking)     │        │                  │
└───────────────────────────────────────────┘        └──────────────────┘
```

## Persistent Session Lifecycle

Sessions support multi-turn conversations between users and agents:

```
1. User sends message        → needs_agent_response = true
2. Agent claims session      → agent_id = "oc-abc123"
3. Agent posts response      → needs_agent_response = false, agent_id KEPT
4. User sends follow-up      → needs_agent_response = true, same agent_id
5. Heartbeat detects pending → resumes same subagent via saved runId mapping
6. Repeat steps 3-5...
7. After 10 agent responses  → agent_id auto-released (MAX_SESSION_TURNS)
8. Or agent explicitly calls → release_session() when done
```

**Why this matters for OpenClaw:** The orchestrator saves session→subagent mappings in `.openclaw/session-agents.json`. On follow-ups, it resumes the same subagent (preserving its context) rather than spawning a new one. If the subagent died, it spawns a fresh one that reads the full conversation history.

## CLI Commands (Primary)

All agent interactions use the CLI. Set env vars first:

```bash
export TODOLIST_API_URL="https://backend-openclaw.up.railway.app"
export TODOLIST_AUTH_TOKEN="your-token"
export DEFAULT_SPACE_ID="your-space-id"
```

**Session commands:**
```bash
node cli/todolist-cli.js list-pending                        # Check for pending messages
node cli/todolist-cli.js get-session <id>                    # Read full conversation
node cli/todolist-cli.js claim-session <id> --agent-id oc-1  # Claim a session
node cli/todolist-cli.js post-message -s <id> -c "response"  # Post a message
node cli/todolist-cli.js watch-session <id> --since <ISO>    # Poll for new messages
node cli/todolist-cli.js release-session <id>                # Release when done
```

**Task commands:**
```bash
node cli/todolist-cli.js list-todos                          # List active tasks
node cli/todolist-cli.js add-todo "task text" --priority High # Create a task
node cli/todolist-cli.js complete-todo <id>                  # Mark complete
node cli/todolist-cli.js update-todo <id> --notes "details"  # Update task
```

**Other commands:**
```bash
node cli/todolist-cli.js list-sessions                       # List all sessions
node cli/todolist-cli.js create-session --title "New chat"   # Create a session
node cli/todolist-cli.js help                                # Full command list
```

## MCP Tools (Optional)

If you prefer MCP over CLI, configure the MCP server (see step 4 above). Available tools:

| Category | Tools |
|----------|-------|
| Messages | `get_pending_sessions`, `get_session`, `post_to_session`, `claim_session`, `release_session` |
| Tasks | `add_todo`, `update_todo`, `complete_todo`, `delete_todo`, `list_todos`, `reorder_todos` |
| Sessions | `create_session`, `list_sessions`, `delete_session` |
| Spaces | `create_space`, `list_spaces`, `update_space`, `invite_to_space`, `list_space_members` |
| Categories | `add_category`, `rename_category`, `delete_category`, `list_categories` |
| Journal | `write_journal`, `get_journal`, `delete_journal` |
| Other | `get_insights`, `export_data` |

## API Endpoints

For direct HTTP integration (no MCP):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/agent/sessions/pending` | GET | Sessions with `needs_agent_response=true` |
| `/agent/sessions/{id}` | GET | Full session with messages |
| `/agent/sessions/{id}/claim` | POST | Atomically claim (body: `{agent_id}`) |
| `/agent/sessions/{id}/release` | POST | Release claim |
| `/agent/sessions/{id}/messages` | POST | Post message (body: `{role, content}`) |
| `/agent/sessions/{id}/watch?since=<ISO>` | GET | New messages since timestamp |
| `/agent/sessions` | POST | Create session (body: `{title, space_id?, todo_id?}`) |
| `/agent/sessions` | GET | List all sessions |

All endpoints require `Authorization: Bearer <token>` header.

## Comparison: Claude Code vs OpenClaw

| Feature | Claude Code `/loop` | OpenClaw Gateway |
|---------|---------------------|------------------|
| Persistence | Dies with CLI session | Runs as system daemon |
| Polling | `/loop 1m /check-messages` | Heartbeat every Nm |
| Agent context | Lost between sessions | Managed by Gateway |
| Multi-agent | Manual worktree isolation | Native session management |
| Setup | Zero config | Requires openclaw config |
| Session resume | Via Agent `resume` param | Native agent persistence |

## Troubleshooting

- **MCP server not found**: Make sure the path in `args` is absolute and `npm run build` has been run
- **Auth errors (401)**: Token expired — re-login to get a fresh one (tokens last 30 days)
- **No pending messages**: Check `TODOLIST_API_URL` and `DEFAULT_SPACE_ID` are correct
- **Heartbeat not firing**: Verify with `openclaw config get agents.defaults.heartbeat`
- **Session stuck as pending**: The MongoDB `-1` index bug was fixed — make sure backend is up to date
