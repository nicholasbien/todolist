# AI Todo List App - Agent Instructions

## Overview
AI-powered collaborative todo list with React/Next.js frontend, FastAPI backend, MongoDB, offline-first PWA, and an MCP server for agent integration.

## Git Branching Rules

- **Always fetch latest main before starting any work** — before creating a branch, always run `git fetch origin && git checkout -b your-branch origin/main`. This ensures your branch is based on the latest remote main, not a stale local copy. This is a mandatory first step for every new task.
- **Always branch from `main`** — every new feature, fix, or docs branch must be created from the latest `main`. Never branch from other feature branches (e.g., `openclaw`).
- **Always target `main` in PRs** — unless explicitly told otherwise by the user.

## Using the MCP Server

The MCP server lets AI agents (like Claude Code) manage todos, sessions, journals, and spaces directly. It's configured in `.mcp.json`.

### Setup

1. Get an auth token by logging in:
```bash
RESPONSE=$(curl -s -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "code": "000000"}' \
  http://localhost:8000/auth/login)
echo $RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4
```

2. The `.mcp.json` file configures the server. Update the token:
```json
{
  "mcpServers": {
    "todolist": {
      "command": "node",
      "args": ["/path/to/todolist/mcp-server/dist/index.js"],
      "env": {
        "TODOLIST_API_URL": "http://localhost:8000",
        "TODOLIST_AUTH_TOKEN": "your_token_here"
      }
    }
  }
}
```

3. Restart Claude Code (or `/mcp` to restart the MCP server) after token changes.

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `add_todo` | Add a new todo (auto-classifies category/priority) |
| `list_todos` | List todos, optionally filter by completion |
| `update_todo` | Update text, category, or completion status |
| `complete_todo` | Toggle todo completion |
| `delete_todo` | Delete a todo |
| `list_spaces` | List accessible spaces |
| `create_space` | Create a new space |
| `list_categories` | List categories for a space |
| `list_sessions` | List chat sessions |
| `create_session` | Create a messaging session (optionally linked to a todo) |
| `get_session` | Get session with messages |
| `get_pending_sessions` | Get sessions awaiting agent response (supports `agent_id` filtering) |
| `post_to_session` | Post a message to a session (supports `agent_id` to claim routing) |
| `delete_session` | Delete a session |
| `get_journal` | Get journal entry by date |
| `write_journal` | Write/update a journal entry |
| `get_insights` | Get todo analytics |
| `export_data` | Export todos or journals as JSON/CSV |

Most tools auto-detect the default space if `space_id` is omitted.

### Agent Workflow Pattern

For agents that process user messages:
1. `get_pending_sessions` — find sessions needing a response
2. `get_session` — read the conversation history
3. Do work (add/update todos, write journals, etc.)
4. `post_to_session` — reply with results

### Multi-Agent Routing

Sessions support `agent_id` for routing followups to the correct agent:
- **Claiming:** Pass `agent_id` when calling `post_to_session` to stamp the session
- **Filtering:** Pass `agent_id` to `get_pending_sessions` to see your claimed sessions + unclaimed ones
- **Default:** Omitting `agent_id` from `get_pending_sessions` returns only unclaimed sessions

This prevents agents from stealing each other's followup conversations.

### Rebuilding the MCP Server

After editing `mcp-server/src/index.ts`:
```bash
cd mcp-server && npm run build
```

---

## OpenClaw Integration

An OpenClaw skill is available in `openclaw-skill/` for connecting [OpenClaw](https://openclaw.ai/) agents to the app.

### Quick Setup

```bash
# Copy skill to OpenClaw workspace
cp -r openclaw-skill ~/.openclaw/workspace/skills/todolist

# Login and get a token
cd ~/.openclaw/workspace/skills/todolist
./scripts/login.sh

# Set env vars (or add to OpenClaw config)
export TODOLIST_API_URL="https://app.todolist.nyc"
export TODOLIST_AUTH_TOKEN="your_token_here"
```

Then just tell your OpenClaw agent things like "show my todos" or "add task: Buy groceries".

See `openclaw-skill/README.md` for full details.

---

## Claude Code Agent Integration

A Claude Code skill and subagent are available in `.claude/skills/todolist/` for autonomous task management using Claude Code.

### How It Works

1. Users create tasks with `#claude` in the text (e.g., "Fix login bug #claude")
2. The backend auto-routes these to `agent_id="claude"`
3. The task manager skill polls for pending sessions every 5 minutes
4. Each task gets its own subagent worker (runs in background for parallelism)
5. Follow-up messages from users route back to the correct worker
6. Workers post results via the MCP server with `agent_id="claude"`

### Quick Start

**Option 1: Start polling (recommended)**
```
/todolist                # Check now + schedule /loop 5m /todolist check
/todolist check          # Run one check cycle
/todolist status         # Check assignments
```

**Option 2: Background daemon (headless)**
```bash
.claude/skills/todolist/scripts/start-daemon.sh     # Start
.claude/skills/todolist/scripts/stop-daemon.sh      # Stop
```

### Agent Routing

The app supports multi-agent routing via `agent_id` on sessions:

| Agent ID | Handler |
|----------|---------|
| `claude` | Claude Code `/todolist` skill |
| `openclaw` | OpenClaw agent |
| (none) | Built-in AI agent |

Routing is based on `agent_id`, not hashtags. Agents only see their own claimed sessions + unclaimed ones when polling `GET /agent/sessions/pending?agent_id=<id>`. This prevents conflicts and double-replies.

### Files

| File | Purpose |
|------|---------|
| `.claude/skills/todolist/SKILL.md` | Skill definition (slash command) |
| `.claude/agents/todolist.md` | Subagent definition |
| `.claude/skills/todolist/scripts/check.sh` | Single check cycle script |
| `.claude/skills/todolist/scripts/start-daemon.sh` | Background daemon |
| `.claude/skills/todolist/scripts/stop-daemon.sh` | Stop daemon |

---

## Quick Setup

```bash
./setup.sh
```

### Manual Setup
```bash
# Backend
cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && pre-commit install

# Frontend
cd frontend && npm install
```

---

## Running the App

**Backend:** `cd backend && source venv/bin/activate && uvicorn app:app --host 0.0.0.0 --port 8000 --reload`

**Frontend:** `cd frontend && npm run dev`

Frontend: http://localhost:3000 | Backend: http://localhost:8000

---

## Testing

### Test Account
- **Email**: `test@example.com` | **Code**: `000000`
- No email sent, no signup required — login auto-creates the user
- Works on production too: `https://app.todolist.nyc`

```bash
# Get a token
curl -s -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "code": "000000"}' \
  http://localhost:8000/auth/login
```

### Frontend Tests
```bash
cd frontend && npm test              # All tests
npm test -- --no-coverage            # Faster
npm test -- ServiceWorkerSync.test.ts  # Single file
```

### Backend Tests
```bash
cd backend && source venv/bin/activate && pytest -v --tb=short
```

### Offline Sync E2E Tests
```bash
node scripts/test-offline-sync.js    # Both servers must be running
```

Run these after changes to `public/sw.js`, `context/OfflineContext.tsx`, or offline sync behavior.

---

## Linting

Pre-commit hooks run automatically: autoflake, black, isort, flake8, mypy.

```bash
# Run manually
cd backend && source venv/bin/activate && pre-commit run --all-files

# Frontend
cd frontend && npm run lint
```

---

## Architecture

### Frontend
- **Next.js 14 / React 18** with Tailwind CSS
- Three-tab layout (Tasks | Assistant | Journal) via ReactSwipeableViews — all tabs always in DOM
- Offline-first PWA with service worker + IndexedDB
- `utils/api.ts` detects Capacitor vs web and routes accordingly

### Backend
- **FastAPI** with async MongoDB (Motor)
- AI: OpenAI gpt-4.1-nano (classification), gpt-5.2 (agent, summaries)
- JWT auth with email verification
- Agent router mounted at `/agent/` prefix

### Key Files
| File | Purpose |
|------|---------|
| `frontend/components/AIToDoListApp.tsx` | Main todo interface |
| `frontend/components/AgentChatbot.tsx` | AI assistant chat |
| `frontend/public/sw.js` | Service worker (offline-first) |
| `frontend/utils/api.ts` | API layer with Capacitor detection |
| `backend/app.py` | FastAPI app with all routes |
| `backend/agent/agent.py` | Streaming SSE agent + session routes |
| `backend/chat_sessions.py` | Session/trajectory storage |
| `backend/todos.py` | Todo CRUD |
| `mcp-server/src/index.ts` | MCP server source |

### Agent Sessions

Sessions can be:
1. **Streaming AI sessions** — used by the Assistant tab, have trajectories
2. **Task-linked messaging sessions** — linked to a todo via `todo_id`, use post-and-poll
3. **Direct-chat sessions** — have `agent_id` set but no `todo_id`. These are direct conversations a user started with a specific agent. Agents should treat these as conversational exchanges and not create/update todos unless explicitly asked.

Session flags: `needs_agent_response` (user posted, awaiting reply), `has_unread_reply` (agent replied, user hasn't seen it), `needs_human_response` (agent asked a question, pauses polling until human replies).

### Service Worker

- Intercepts API requests matching `API_ROUTES` for offline capability
- Stores data in IndexedDB, queues writes for sync when back online
- **Always bump `STATIC_CACHE` version** when modifying `sw.js`
- **Always add new backend routes** to `API_ROUTES` in `sw.js` — the #1 cause of 404s

---

## API Endpoints

All requests use paths like `/todos`, `/agent/stream` — the service worker routes them to the backend.

### Auth
- `POST /auth/signup` — send verification code
- `POST /auth/login` — verify code and login
- `POST /auth/logout` — logout
- `GET /auth/me` — current user
- `POST /auth/update-name` — update display name
- `DELETE /auth/me` — delete account

### Todos
- `GET /todos?space_id={id}` — list todos
- `GET /todos/{id}` — get single todo
- `POST /todos` — create (auto-classifies)
- `PUT /todos/{id}` — update fields
- `PUT /todos/{id}/complete` — toggle completion
- `PUT /todos/reorder` — reorder
- `DELETE /todos/{id}` — delete

### Agent Sessions (prefix: `/agent/`)
- `GET /agent/stream?q={query}&space_id={id}&session_id={id}` — streaming AI agent
- `GET /agent/sessions?space_id={id}` — list sessions
- `GET /agent/sessions/pending?space_id={id}` — pending sessions
- `GET /agent/sessions/unread-todos?space_id={id}` — unread todo IDs
- `GET /agent/sessions/todo-statuses?space_id={id}` — status per todo
- `GET /agent/sessions/by-todo/{todo_id}` — find session by todo
- `GET /agent/sessions/{id}` — get session with messages
- `POST /agent/sessions` — create session
- `POST /agent/sessions/{id}/messages` — post message
- `POST /agent/sessions/{id}/mark-read` — mark as read
- `DELETE /agent/sessions/{id}` — delete session

### Spaces
- `GET /spaces` — list spaces
- `POST /spaces` — create
- `PUT /spaces/{id}` — update
- `DELETE /spaces/{id}` — delete
- `POST /spaces/{id}/invite` — invite members
- `GET /spaces/{id}/members` — list members
- `POST /spaces/{id}/leave` — leave space

### Categories, Journals, Insights, Email, Export
- `GET /categories?space_id={id}` | `POST /categories` | `PUT /categories/{name}` | `DELETE /categories/{name}`
- `GET /journals?date={date}&space_id={id}` | `POST /journals` | `DELETE /journals/{id}`
- `GET /insights?space_id={id}`
- `POST /email/send-summary` | `GET /email/scheduler-status` | `POST /email/update-schedule` | `POST /email/update-instructions` | `POST /email/update-spaces`
- `GET /export?data={todos|journals}&space_id={id}&format={csv|json}`
- `POST /contact`
- `GET /health`

---

## Environment Variables

**Backend** (`backend/.env`):
```
MONGODB_URL=mongodb://localhost:27017
OPENAI_API_KEY=your_key
JWT_SECRET=your-secret
OPENWEATHER_API_KEY=your_key        # For weather tools
BRAVE_API_KEY=your_key              # Optional, web search
SMTP_SERVER=smtp.gmail.com          # Optional, email features
SMTP_PORT=587
FROM_EMAIL=your_email
SMTP_PASSWORD=your_app_password
ADMIN_EMAIL=your_email
```

**Frontend** (`frontend/.env.local`):
```
BACKEND_URL=http://localhost:8000
```

---

## UI Changes — Screenshots

For PRs touching UI components, run screenshots and commit them:
```bash
node scripts/take-screenshots.js   # Both servers must be running
git add screenshots/
```

See `docs/SCREENSHOT_WORKFLOW.md` and `docs/UI_SCREENS_NAVIGATION.md` for details.

---

## Deployment

```bash
# HUMAN USE ONLY
./deploy.sh
```

Production: Railway. Env vars configured in Railway dashboard.
