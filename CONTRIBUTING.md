# Contributing to TodoList

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Development Setup

### Option 1: Docker (quickest)

```bash
git clone https://github.com/nicholasbien/todolist.git
cd todolist
cp .env.example .env
docker compose up
```

### Option 2: Local

**Prerequisites:** Node.js 18+, Python 3.9+, MongoDB

```bash
git clone https://github.com/nicholasbien/todolist.git
cd todolist
./setup.sh
```

Start the servers:

```bash
# Terminal 1 -- Backend
cd backend && source venv/bin/activate && python app.py

# Terminal 2 -- Frontend
cd frontend && npm run dev
```

**Test account:** `test@example.com` / `000000` (no email required, auto-creates on login).

## Branch Naming

Always branch from the latest `main`:

```bash
git fetch origin
git checkout -b your-branch origin/main
```

Use descriptive branch names:
- `feature/add-task-templates`
- `fix/offline-sync-race-condition`
- `docs/update-mcp-examples`

## Making Changes

1. Create a branch from `main`
2. Make your changes
3. Run linting and tests (see below)
4. Push and open a PR targeting `main`

## Testing

### Backend

```bash
cd backend
source venv/bin/activate
pytest -v --tb=short
```

All backend tests use a mock database and do not require a running server.

### Frontend

```bash
cd frontend
npm test                             # All tests with coverage
npm test -- --no-coverage            # Faster, no coverage report
npm test -- ServiceWorkerSync.test.ts  # Single file
```

### E2E (offline sync)

Requires both servers running:

```bash
node scripts/test-offline-sync.js
```

## Code Style

### Python (backend)

Pre-commit hooks run automatically on commit. To run them manually:

```bash
cd backend
source venv/bin/activate
pre-commit run --all-files
```

This runs:
- **black** -- code formatting
- **isort** -- import sorting
- **flake8** -- linting
- **autoflake** -- unused import removal
- **mypy** -- type checking

Configuration lives in `backend/pyproject.toml`.

### TypeScript/JavaScript (frontend)

```bash
cd frontend
npm run lint
```

## Pull Request Process

1. Fill out the PR template (summary, test plan)
2. Ensure CI passes (backend lint + tests, frontend lint + tests + build)
3. Keep PRs focused -- one feature or fix per PR
4. Link related issues in the PR description

## Where to Find Things

- **[AGENTS.md](AGENTS.md)** -- comprehensive development guide, architecture docs, API reference, and agent integration details
- **[docs/](docs/)** -- internal documentation (security plans, design references, bug analyses)
- **Key files table** in AGENTS.md lists the most important source files

## Questions?

Open an issue or start a discussion. We are happy to help!
