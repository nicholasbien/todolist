# todolist

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**A dev tool for working with AI agents from anywhere.** Dispatch tasks, store conversations, orchestrate parallel agents -- online or offline.

<p align="center">
  <img width="397" alt="Tasks view" src="https://github.com/user-attachments/assets/7b249e00-9f72-4b39-a37c-47b784470d9f" />
  <img width="397" alt="Assistant view" src="https://github.com/user-attachments/assets/9b421d87-df1a-41bb-8e6e-f53947b9e044" />
</p>

## Why TodoList?

This is not another Todoist clone. TodoList is a **personal operating system for AI-augmented productivity**:

- **Dispatch tasks to AI agents** -- tag a task with `#claude` and Claude Code picks it up autonomously, breaks it into subtasks, and executes them in parallel.
- **Store and review agent conversations** -- every agent interaction is a persistent session with full message history, accessible from your phone, laptop, or any browser.
- **Multi-agent routing** -- assign tasks to Claude Code, OpenClaw, or custom agents. Each agent only sees its own sessions, preventing conflicts and double-replies.
- **Work offline** -- the offline-first PWA works without a network connection, with background sync when you reconnect. Installable on iOS and Android.
- **MCP server with 20+ tools** -- any MCP-compatible agent can manage your tasks, write journal entries, and query analytics out of the box.

## Quick Start

### Docker Compose (recommended)

```bash
git clone https://github.com/nicholasbien/todolist.git
cd todolist
cp .env.example .env   # Edit with your settings (app works without OPENAI_API_KEY)
docker compose up
```

App runs at **http://localhost:3000**. Log in with the test account: `test@example.com` / `000000`.

### Local Setup

```bash
git clone https://github.com/nicholasbien/todolist.git
cd todolist
./setup.sh
```

Then start the servers:

```bash
# Terminal 1 -- Backend
cd backend && source venv/bin/activate && python app.py
# http://localhost:8141

# Terminal 2 -- Frontend
cd frontend && npm run dev
# http://localhost:3141
```

See [AGENTS.md](AGENTS.md) for detailed manual setup instructions.

## Features

**AI-Powered Task Management**
- Automatic task classification (category, priority, due date) via OpenAI
- AI assistant with tool calling for task management, journaling, weather, and book recommendations
- Daily email summaries with AI-generated insights
- Works without an OpenAI key -- AI features are optional

**Multi-Agent Architecture**
- Built-in MCP server with 20+ tools for connecting AI agents
- Multi-agent routing via `agent_id` -- assign tasks to Claude, OpenClaw, or custom agents
- Post-and-poll messaging sessions for async agent communication
- Parallel subtask orchestration -- complex tasks auto-decompose into concurrent agent workers

**Collaboration**
- Multi-user spaces with invite-by-email
- Personal default space plus shared team workspaces
- Space-specific categories and data isolation

**Offline-First PWA**
- Full offline functionality via service worker and IndexedDB
- Background sync when connection returns
- Installable as a native app on iOS and Android

**Task Features**
- Subtasks with progress tracking
- Due date parsing with day-of-week awareness
- Link tasks -- paste a URL and the page title is fetched automatically
- Drag-and-drop reordering
- Dark mode

## Agent Integration (MCP)

The MCP server exposes 20+ tools for AI agents to manage tasks, sessions, journals, and spaces. Add it to your Claude Code config:

```json
// .mcp.json
{
  "mcpServers": {
    "todolist": {
      "command": "node",
      "args": ["./mcp-server/dist/index.js"],
      "env": {
        "TODOLIST_API_URL": "http://localhost:8141",
        "TODOLIST_AUTH_TOKEN": "your_token"
      }
    }
  }
}
```

### Example Workflow

1. **User creates a task** in the web app: "Refactor auth module #claude"
2. **Backend routes it** to `agent_id="claude"` and creates a messaging session
3. **Claude Code polls** `get_pending_sessions` and picks up the task
4. **Agent works** -- reads the codebase, creates a branch, makes changes
5. **Agent posts results** back to the session via `post_to_session`
6. **User reviews** the results in the app from any device

Available tools include `add_todo`, `list_todos`, `complete_todo`, `create_session`, `post_to_session`, `get_pending_sessions`, `write_journal`, `get_insights`, and more. See [AGENTS.md](AGENTS.md) for the full tool reference.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.9+, async MongoDB (Motor) |
| Database | MongoDB |
| AI | OpenAI (optional -- app works without it) |
| MCP Server | TypeScript, Model Context Protocol SDK |
| Auth | JWT with email verification (SMTP) |

## Architecture

```
todolist/
├── frontend/          # Next.js React app (PWA with service worker)
│   ├── components/    # React components
│   ├── context/       # Auth and offline contexts
│   ├── pages/         # Next.js pages and API proxy
│   ├── public/        # Service worker, manifest, icons
│   └── utils/         # API layer
├── backend/           # FastAPI Python server
│   ├── app.py         # Main application with all routes
│   ├── agent/         # AI agent (streaming SSE + session management)
│   ├── todos.py       # Todo CRUD with AI classification
│   ├── spaces.py      # Multi-user collaboration
│   ├── auth.py        # JWT authentication
│   └── tests/         # pytest test suite
├── mcp-server/        # Model Context Protocol server
│   └── src/index.ts   # 20+ tools for AI agent integration
└── docs/              # Internal documentation
```

## Self-Hosting

### Docker (recommended)

The simplest way to self-host. See [Quick Start](#quick-start) above.

Configuration is done via the `.env` file. The only required variable is `JWT_SECRET` (auto-generated by the setup script). `OPENAI_API_KEY` is optional -- without it, AI classification and the assistant are disabled but everything else works.

### Manual Deployment

1. Run MongoDB (local install, Docker, or a managed service like [MongoDB Atlas](docs/MONGODB_ATLAS_SETUP.md))
2. Deploy the backend (any Python hosting -- set environment variables)
3. Deploy the frontend (any Node.js hosting -- set `BACKEND_URL`)
4. Point the frontend at the backend and you are done

### Environment Variables

```bash
# Required
JWT_SECRET=change-me              # openssl rand -base64 32
MONGODB_URL=mongodb://localhost:27017

# Optional -- AI features (app works without this)
OPENAI_API_KEY=

# Optional -- Email (prints to console if not set)
FROM_EMAIL=
SMTP_PASSWORD=

# Optional -- Agent tools
BRAVE_API_KEY=
```

## Testing

```bash
# Backend tests
cd backend && source venv/bin/activate && pytest -v

# Frontend tests
cd frontend && npm test

# E2E offline sync tests (requires both servers running)
node scripts/test-offline-sync.js
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
