# todolist.nyc

An AI-powered collaborative task manager with multi-agent support, offline-first architecture, and a built-in Model Context Protocol (MCP) server for AI agent integration.

<p align="center">
  <img width="397" alt="Tasks view" src="https://github.com/user-attachments/assets/7b249e00-9f72-4b39-a37c-47b784470d9f" />
  <img width="397" alt="Assistant view" src="https://github.com/user-attachments/assets/9b421d87-df1a-41bb-8e6e-f53947b9e044" />
</p>

## Features

**AI-Powered Task Management**
- Automatic task classification (category, priority, due date) via OpenAI
- AI assistant with tool calling for task management, journaling, weather, and book recommendations
- Daily email summaries with AI-generated insights

**Multi-Agent Architecture**
- Built-in MCP server for connecting AI agents (Claude Code, OpenClaw, custom agents)
- Multi-agent routing via agent dropdown -- assign tasks to Claude, OpenClaw, or custom agents
- Post-and-poll messaging sessions for async agent communication
- Agents can create tasks, write journal entries, and collaborate autonomously

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

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.9+, async MongoDB (Motor) |
| Database | MongoDB |
| AI | OpenAI (gpt-4.1-nano for classification, gpt-5.2 for agent/summaries) |
| MCP Server | TypeScript, Model Context Protocol SDK |
| Auth | JWT with email verification (SMTP) |
| Deployment | Railway (or any platform) |

## Architecture

```
todolist/
├── frontend/          # Next.js React app (PWA with service worker)
│   ├── components/    # React components (AIToDoListApp, TodoItem, AgentChatbot, etc.)
│   ├── context/       # Auth and offline contexts
│   ├── pages/         # Next.js pages and API proxy
│   ├── public/        # Service worker, manifest, icons
│   └── utils/         # API layer with Capacitor detection
├── backend/           # FastAPI Python server
│   ├── app.py         # Main application with all routes
│   ├── agent/         # AI agent (streaming SSE + session management)
│   ├── todos.py       # Todo CRUD with AI classification
│   ├── spaces.py      # Multi-user collaboration
│   ├── auth.py        # JWT authentication
│   └── tests/         # pytest test suite
├── mcp-server/        # Model Context Protocol server
│   └── src/index.ts   # 20+ tools for AI agent integration
└── scripts/           # E2E tests, screenshots, utilities
```

The frontend communicates through a service worker that intercepts `/api/*` requests, enabling full offline support. Online requests are proxied through Next.js to the FastAPI backend. The MCP server connects external AI agents to the backend via stdio transport.

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.9+
- MongoDB (local or [MongoDB Atlas](https://www.mongodb.com/atlas) free tier)
- OpenAI API key

### Quick Setup

```bash
# Clone the repository
git clone https://github.com/nicholasbien/todolist.git
cd todolist

# Run the setup script
./setup.sh
```

The setup script creates Python virtual environments, installs dependencies, and sets up pre-commit hooks.

### Manual Setup

**Backend:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pre-commit install

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your values (see Environment Variables below)
```

**Frontend:**
```bash
cd frontend
npm install
```

**MCP Server (optional, for AI agent integration):**
```bash
cd mcp-server
npm install
npm run build
cp .env.example .env
# Edit .env with your API URL and auth token
```

### Environment Variables

**Backend** (`backend/.env`):
```bash
# Required
OPENAI_API_KEY=your_openai_api_key
JWT_SECRET=your_jwt_secret    # Generate: python3 -c "import secrets; print(secrets.token_urlsafe(32))"
MONGODB_URL=mongodb://localhost:27017

# Optional -- email features
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
FROM_EMAIL=your_email@gmail.com
SMTP_PASSWORD=your_app_password

# Optional -- agent tools
OPENWEATHER_API_KEY=your_key
BRAVE_API_KEY=your_key
```

**Frontend** (`frontend/.env.local`):
```bash
BACKEND_URL=http://localhost:8141
```

### Running

```bash
# Terminal 1 -- Backend
cd backend && source venv/bin/activate && python app.py
# Runs on http://localhost:8141

# Terminal 2 -- Frontend
cd frontend && npm run dev
# Runs on http://localhost:3141
```

### Test Account

For local development, use the built-in test account (no email required):
- **Email:** `test@example.com`
- **Code:** `000000`

## Mobile Access (Tailscale)

Want to access the app from your phone while running it locally? See [docs/MOBILE_ACCESS.md](docs/MOBILE_ACCESS.md) for a guide on using Tailscale to reach your dev server from any device on your network.

## MCP Server

The MCP server exposes 20+ tools for AI agents to manage tasks, sessions, journals, and spaces. See [AGENTS.md](AGENTS.md) for full documentation.

Quick example with Claude Code:

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

Available tools include `add_todo`, `list_todos`, `complete_todo`, `create_session`, `post_to_session`, `get_pending_sessions`, `write_journal`, `get_insights`, and more.

## Screenshots

<!-- TODO: Add screenshots of key features -->
<!-- Suggested screenshots:
  - Task list with AI classification
  - Assistant chat tab
  - Journal view
  - Dark mode
  - Multi-space collaboration
  - Offline mode indicator
  - MCP agent interaction
-->

## Testing

```bash
# Backend tests (mock database, no server required)
cd backend && source venv/bin/activate && pytest -v

# Frontend tests
cd frontend && npm test

# E2E offline sync tests (requires both servers running)
node scripts/test-offline-sync.js
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to get started.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
