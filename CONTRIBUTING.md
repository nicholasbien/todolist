# Contributing to todolist

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Development Setup

### Option 1: Docker (fastest)

```bash
git clone https://github.com/nicholasbien/todolist.git
cd todolist
cp .env.example .env
docker compose up
```

### Option 2: Local

```bash
git clone https://github.com/nicholasbien/todolist.git
cd todolist
./setup.sh
```

See the [README](README.md) for full setup instructions.

### Test Account

Set `ALLOW_TEST_ACCOUNT=true`, `TEST_EMAIL=test@example.com`, and `TEST_CODE=000000` in your backend `.env`, then use `test@example.com` with code `000000` for local development (no email required).

## Making Changes

1. **Fork the repo** and create a branch from `main`:
   ```bash
   git checkout -b feature/your-feature main
   ```

2. **Make your changes.** Follow the code style (see below).

3. **Run tests** before submitting:
   ```bash
   # Backend
   cd backend && source .venv/bin/activate && pytest -v

   # Frontend
   cd frontend && npm test
   ```

4. **Open a pull request** against `main`. Fill out the PR template.

## Code Style

### Backend (Python)

- Formatter: **black** (line length 120)
- Import sorting: **isort** (black profile)
- Linting: **flake8**
- Type hints encouraged

Run all checks:
```bash
cd backend && pre-commit run --all-files
```

### Frontend (TypeScript/React)

- Linting: **ESLint** (Next.js config)
- No semicolons, single quotes

Run checks:
```bash
cd frontend && npm run lint
```

## Project Structure

| Directory | What's There |
|-----------|-------------|
| `backend/` | FastAPI server, AI classification, agent, auth |
| `backend/routers/` | API route handlers |
| `backend/agent/` | AI agent with SSE streaming and tool calling |
| `backend/tests/` | pytest test suite |
| `frontend/` | Next.js 14 app with TypeScript |
| `frontend/components/` | React components |
| `frontend/context/` | Auth and offline React contexts |
| `frontend/public/sw.js` | Service worker (offline-first PWA) |
| `mcp-server/` | Model Context Protocol server |
| `docs/` | Architecture and planning documentation |

## Key Files

- `backend/app.py` — FastAPI application entry point
- `backend/classify.py` — AI task classification
- `backend/agent/agent.py` — AI agent with streaming
- `frontend/components/AIToDoListApp.tsx` — Main app component
- `frontend/public/sw.js` — Service worker for offline support
- `mcp-server/src/index.ts` — MCP server with 20+ tools

## What to Work On

- Issues labeled **good first issue** are great starting points
- Check the [GitHub Issues](https://github.com/nicholasbien/todolist/issues) for open work
- Bug fixes, documentation improvements, and test coverage are always welcome

## Questions?

Open a [GitHub Discussion](https://github.com/nicholasbien/todolist/discussions) or file an issue.
