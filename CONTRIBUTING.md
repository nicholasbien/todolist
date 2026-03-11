# Contributing to TodoList

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Table of Contents

- [Getting Started](#getting-started)
- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
- [Running the App Locally](#running-the-app-locally)
- [Code Style and Linting](#code-style-and-linting)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/todolist.git
   cd todolist
   ```
3. **Add the upstream remote** so you can pull future changes:
   ```bash
   git remote add upstream https://github.com/<org>/todolist.git
   ```
4. **Create a branch** for your work:
   ```bash
   git checkout -b feature/my-change
   ```

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.11+ | Backend runtime |
| Node.js | 18+ | Frontend runtime |
| MongoDB | 6.0+ | Database (local or [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) free tier) |
| npm | 9+ | Comes with Node.js |

Optional (for full feature set):
- **OpenAI API key** -- needed for AI task classification and the agent
- **SMTP credentials** -- needed for email verification; without them, verification codes print to the backend console

## Development Setup

### Quick Setup

Run the setup script from the repo root:

```bash
./setup.sh
```

This will:
- Verify Python and Node.js are installed
- Create a Python virtual environment in `backend/venv`
- Install backend Python dependencies
- Install pre-commit hooks
- Install frontend npm dependencies

### Manual Setup

If you prefer to set things up step by step:

**Backend:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate
pip install -r requirements.txt
pre-commit install          # Installs git hooks for linting
```

**Frontend:**
```bash
cd frontend
npm install
```

### Environment Variables

Copy the example env files and fill in your values:

```bash
cp backend/.env.example backend/.env
```

At a minimum, set these in `backend/.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URL` | Yes | Connection string (default: `mongodb://localhost:27017`) |
| `JWT_SECRET` | Yes | Random secret for auth tokens. Generate one: `openssl rand -base64 32` |
| `OPENAI_API_KEY` | For AI features | [Get a key](https://platform.openai.com/api-keys) |
| `FROM_EMAIL` | For email | Gmail address for sending verification codes |
| `SMTP_PASSWORD` | For email | Gmail app password ([setup guide](https://support.google.com/accounts/answer/185833)) |

The frontend does not require any environment variables for local development -- API routing is handled by a Next.js proxy and the service worker.

### MCP Server (optional)

If you are working on the MCP server:

```bash
cp mcp-server/.env.example mcp-server/.env
cd mcp-server
npm install
npm run build
```

## Running the App Locally

You need two terminals -- one for the backend and one for the frontend.

**Terminal 1 -- Backend:**
```bash
cd backend
source venv/bin/activate
python app.py
# Runs on http://localhost:8000
```

**Terminal 2 -- Frontend:**
```bash
cd frontend
npm run dev
# Runs on http://localhost:3000
```

Open http://localhost:3000 in your browser. Use the test account (`test@example.com` / code `000000`) to log in without needing email setup.

## Code Style and Linting

Pre-commit hooks run automatically on every commit. They enforce consistent style across the codebase.

### Backend (Python)

| Tool | Purpose |
|------|---------|
| **black** | Code formatting (line length: 120) |
| **isort** | Import sorting (black-compatible profile) |
| **autoflake** | Removes unused imports and variables |
| **flake8** | Style and error checking |
| **mypy** | Static type checking |

Run all hooks manually:
```bash
cd backend
source venv/bin/activate
pre-commit run --all-files
```

### Frontend (TypeScript/React)

| Tool | Purpose |
|------|---------|
| **ESLint** | Linting with Next.js core-web-vitals config |

```bash
cd frontend
npm run lint
```

### General

Pre-commit also checks for:
- Trailing whitespace
- Missing newlines at end of file
- Valid YAML/JSON syntax
- Merge conflict markers
- Accidentally committed large files

## Testing

### Backend Tests

Tests use mock databases (no running MongoDB needed):

```bash
cd backend
source venv/bin/activate

pytest -v --tb=short         # All tests
pytest --cov=. --cov-report=term-missing  # With coverage
pytest tests/test_auth.py -v # Specific file
```

### Frontend Tests

```bash
cd frontend

npm test                     # All tests
npm test -- --no-coverage    # Faster (skip coverage)
npm test -- ServiceWorkerSync.test.ts  # Specific file
```

### End-to-End Tests

Requires both servers running:

```bash
node scripts/test-offline-sync.js
```

### Before Submitting

Run through this checklist:
1. Pre-commit hooks pass: `pre-commit run --all-files`
2. Backend tests pass: `cd backend && pytest -v --tb=short`
3. Frontend tests pass: `cd frontend && npm test`
4. Frontend builds cleanly: `cd frontend && npm run build`

## Pull Request Process

1. **Keep PRs focused.** One logical change per PR. If you find an unrelated issue, open a separate PR for it.
2. **Write a clear title and description.** Explain what changed and why. Include screenshots for UI changes.
3. **Make sure CI passes.** All tests and lint checks should be green.
4. **Update documentation** if your change affects setup steps, environment variables, or public APIs.
5. **Rebase on `main`** before requesting review to avoid merge conflicts:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

### Commit Messages

Write concise commit messages that explain the "why" not just the "what":

- Good: `Fix offline sync race condition when switching spaces`
- Avoid: `Updated sw.js`

### UI Changes

For PRs that touch UI components, include screenshots. You can generate them automatically:

```bash
node scripts/take-screenshots.js   # Both servers must be running
```

## Issue Reporting

When opening an issue, include:

- **What you expected** vs. **what happened**
- **Steps to reproduce** the problem
- **Browser and OS** (for frontend issues)
- **Backend console output** if relevant (redact any secrets)

For feature requests, describe the use case and why it would be valuable.

---

Questions? Open an issue or start a discussion. We are happy to help!
