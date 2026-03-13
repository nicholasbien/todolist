# GitHub Launch Plan — TodoList App

> **Date:** 2026-03-13
> **Goal:** Ship your-domain.com as an open-source dev tool on GitHub, positioned for developers who work with AI agents.

---

## Part 1: Vision & Positioning

### What It Is

TodoList is a **developer tool for orchestrating AI agents from anywhere**. It combines task management, a journaling system, and a real-time communication bus that lets multiple AI agents — Claude Code, OpenClaw, or custom agents — pick up work, collaborate, and report back.

Think of it as a **personal operating system for AI-augmented productivity**:

- **Dispatch tasks to AI agents** — tag a task with `#claude` and Claude Code picks it up autonomously, breaks it into subtasks, and executes them in parallel.
- **Store and review agent communications** — every agent interaction is a persistent session with full message history, accessible from your phone, laptop, or any browser.
- **Work from anywhere, even offline** — the offline-first PWA architecture means the entire app works without a network connection, with background sync when you reconnect.
- **Integrate via MCP** — the built-in Model Context Protocol server exposes 20+ tools, letting any MCP-compatible agent manage tasks, write journal entries, and query analytics.

### Target Audience

1. **Developers using AI coding assistants** (Claude Code, Cursor, Copilot) who want a persistent task tracker their agents can read and write to.
2. **Power users running multiple AI agents** who need a routing layer to dispatch work and prevent agents from stepping on each other.
3. **Self-hosters and tinkerers** who want a private, offline-capable productivity system they fully control.

### Key Differentiators

| Feature | Why It Matters |
|---------|---------------|
| **MCP Server with 20+ tools** | Any MCP-compatible agent can manage your tasks, journals, and sessions out of the box |
| **Multi-agent routing** | `agent_id` claims prevent conflicts — each agent only sees its own sessions + unclaimed ones |
| **Parallel subtask orchestration** | Complex tasks auto-decompose into subtasks dispatched to parallel agent workers |
| **Offline-first PWA** | Full functionality offline via service worker + IndexedDB; installable on iOS/Android |
| **Session-based communication** | Post-and-poll messaging with streaming SSE — agents and humans share persistent conversation threads |
| **Self-hostable** | Docker Compose up and you own your data — MongoDB, no vendor lock-in |

---

## Part 2: MVP Code Changes Required

### P0 — Must Have for Launch

#### 2.1 Graceful OpenAI Degradation
**Effort:** ~2 hours | **Files:** `backend/app.py`, `backend/todos.py`, `backend/agent/agent.py`

Currently the app hard-requires `OPENAI_API_KEY`. Without it, task creation fails (AI classification) and the assistant tab crashes.

**Changes needed:**
- In `backend/todos.py`: wrap AI classification in try/except; if no key or API error, skip classification and save the todo with no category/priority (let the user set them manually).
- In `backend/agent/agent.py`: if no OpenAI key, return a clear error message in the SSE stream ("AI assistant requires OPENAI_API_KEY to be configured") instead of crashing.
- In `backend/app.py` startup: log a warning if `OPENAI_API_KEY` is missing but don't block startup.

#### 2.2 Docker Compose Setup
**Effort:** ~3 hours | **Files:** new `Dockerfile` (backend), new `Dockerfile` (frontend), new `docker-compose.yml`

No Docker setup exists today. This is the #1 barrier to adoption for self-hosters.

**Create:**
- `backend/Dockerfile` — Python 3.11 slim, pip install, uvicorn entrypoint
- `frontend/Dockerfile` — Node 20, `npm run build`, `next start` entrypoint
- `docker-compose.yml` at repo root — three services: `backend`, `frontend`, `mongo` (official mongo:7 image), with a shared `.env` file, health checks, and a named volume for MongoDB data
- `docker-compose.override.yml` — dev overrides (hot reload, mounted volumes)

**Target experience:**
```bash
cp .env.example .env
# Edit .env with your OPENAI_API_KEY (optional) and JWT_SECRET
docker compose up
# App at http://localhost:3000
```

#### 2.3 Root `.env.example`
**Effort:** ~30 min | **Files:** new `.env.example` (root)

Currently `.env.example` only exists in `backend/` and `mcp-server/`. The root needs one that covers all services for Docker Compose.

**Contents:**
```
# Required
JWT_SECRET=change-me          # openssl rand -base64 32
MONGODB_URL=mongodb://mongo:27017

# Optional — AI features (app works without this, but no AI classification or assistant)
OPENAI_API_KEY=

# Optional — Email (prints to console if not set)
FROM_EMAIL=
SMTP_PASSWORD=

# Optional — Agent tools
BRAVE_API_KEY=
```

#### 2.4 Frontend `.env.example`
**Effort:** ~10 min | **Files:** new `frontend/.env.example`

Does not exist today. Create it:
```
BACKEND_URL=http://localhost:8000
```

#### 2.5 Setup Script Improvements
**Effort:** ~1 hour | **Files:** `setup.sh`

Current `setup.sh` installs deps but doesn't handle `.env` creation or Docker.

**Improvements:**
- Auto-copy `.env.example` to `.env` if `.env` doesn't exist, with a prompt to edit it
- Auto-generate `JWT_SECRET` if not set
- Add a `--docker` flag that runs `docker compose up` instead of local setup
- Add a `--check` flag that validates prerequisites (Python, Node, MongoDB connectivity)
- Install MCP server dependencies too (`cd mcp-server && npm install && npm run build`)

#### 2.6 CORS Lockdown for Production
**Effort:** ~1 hour | **Files:** `backend/app.py`

The current `allow_origins=["*"]` with `allow_credentials=True` is a critical security issue flagged in the security audit.

**Changes:**
- Read `ALLOWED_ORIGINS` from env var (comma-separated list)
- Default to `["http://localhost:3000"]` for development
- Remove the wildcard

#### 2.7 Secrets Audit — Remove from Git History
**Effort:** ~1 hour | **User action + code**

The `.env` file at the repo root contains real keys (OpenAI, Anthropic, JWT secret, SMTP creds). Even though `.gitignore` now covers it, the keys may be in git history.

**Action items:**
- Run `git log --all --full-history -- .env backend/.env frontend/.env.local` to check if secrets were ever committed
- If yes: use BFG Repo Cleaner to scrub history before making the repo public
- Rotate ALL keys regardless (OpenAI, Anthropic, Brave, JWT secret, SMTP password)

### P1 — Nice to Have for Launch

#### 2.8 Separate `requirements.txt` for Dev vs Production
**Effort:** ~30 min | **Files:** `backend/requirements.txt`, new `backend/requirements-dev.txt`

Currently `requirements.txt` includes test/lint tools (pytest, flake8, black, mypy, etc.) alongside production deps. Split them:
- `requirements.txt` — production only (fastapi, motor, openai, etc.)
- `requirements-dev.txt` — includes `-r requirements.txt` plus test/lint tools

#### 2.9 Health Check Improvements
**Effort:** ~1 hour | **Files:** `backend/app.py`

The existing `/health` endpoint is basic. Add:
- `/health` — liveness (always 200)
- `/health/ready` — readiness (checks MongoDB connectivity, returns 503 if DB is down)
- Include version info from a `VERSION` file or git tag

#### 2.10 Rate Limiting on Auth Endpoints
**Effort:** ~2 hours | **Files:** `backend/auth.py` or middleware

No rate limiting exists. Add basic rate limiting to `/auth/login` and `/auth/signup` to prevent brute force. Use an in-memory store (or Redis if available).

#### 2.11 Remove Capacitor/iOS Build Artifacts
**Effort:** ~30 min | **Files:** `frontend/ios/`, `frontend/capacitor.config.ts`, Capacitor deps in `package.json`

The iOS/Capacitor code is specific to the App Store build and not relevant for the open-source launch. Either:
- Remove it entirely, or
- Move it to a separate branch (`ios-app`) and document it

#### 2.12 OpenAI Model Configuration via Env Vars
**Effort:** ~1 hour | **Files:** `backend/todos.py`, `backend/agent/agent.py`

Models are currently hardcoded (`gpt-4.1-nano`, `gpt-5.2`). Make them configurable:
```
AI_CLASSIFICATION_MODEL=gpt-4.1-nano
AI_AGENT_MODEL=gpt-5.2
```
This lets users swap in cheaper models or different providers.

---

## Part 3: Repository Cleanup

### 3.1 Files to Remove or Relocate

| File | Action | Reason |
|------|--------|--------|
| `PRODUCTION_SECURITY_PLAN.md` (39KB) | Move to `docs/` | Internal planning doc, not user-facing |
| `PWA_APP_STORE_MIGRATION_PLAN.md` | Move to `docs/` or delete | App Store specific, not relevant to OSS |
| `APP_STORE_REVIEW_NOTES.md` | Move to `docs/` or delete | App Store specific |
| `TESTFLIGHT_TESTING_GUIDE.md` | Move to `docs/` or delete | TestFlight specific |
| `TESTFLIGHT_WHAT_TO_TEST.txt` | Move to `docs/` or delete | TestFlight specific |
| `HOMEPAGE_SETUP.md` | Move to `docs/` | Marketing site setup, not app setup |
| `THEME_COLORS.md` | Move to `docs/` | Internal design reference |
| `MONGODB_ATLAS_SETUP.md` | Move to `docs/` | Could link from README |
| `HEARTBEAT.md` | Delete or move to `docs/` | Internal monitoring doc |
| `VISION.md` | Keep in root | Great for contributors to understand the project direction |
| `.pw-offline-profile/` | Add to `.gitignore`, delete | Playwright test artifact |
| `frontend/BUG_PROPOSAL_*.md` | Move to `docs/bugs/` | Internal bug analysis |
| `frontend/SYNC_PROTECTION_SUMMARY.md` | Move to `docs/` | Internal architecture doc |

**Net effect:** Root directory goes from 15+ markdown files to just `README.md`, `VISION.md`, `AGENTS.md`, `CLAUDE.md`, `LICENSE`, and `CONTRIBUTING.md`.

### 3.2 Documentation Updates

#### README.md Rewrite Plan

The current README is good but needs reframing for open-source. Key changes:

1. **Hero section** — Replace "AI-powered collaborative task manager" with something punchier: "A dev tool for working with AI agents from anywhere. Dispatch tasks, store conversations, orchestrate parallel agents — online or offline."
2. **Quick start** — Lead with Docker Compose (3 commands), then local setup as alternative
3. **Screenshots section** — Actually add screenshots (currently has TODO placeholders)
4. **"Why TodoList?" section** — Add a brief section on what makes this different from Todoist/Notion/Linear
5. **Agent integration** — Expand the MCP section with a concrete workflow example (create task -> agent picks it up -> agent posts result)
6. **Self-hosting section** — New section covering Docker, Railway, and manual deployment
7. **Remove** internal references (Railway dashboard, specific production URLs)
8. **Add badges** — CI status, license, PRs welcome

#### New: CONTRIBUTING.md

Create `CONTRIBUTING.md` covering:
- Development setup (local and Docker)
- Branch naming conventions (already in AGENTS.md: branch from main)
- PR process (use the existing PR template)
- Testing requirements (backend: pytest, frontend: jest, both must pass CI)
- Code style (Python: black/isort/flake8, Frontend: next lint)
- Where to find things (architecture overview, key files table)
- Issue labels and how to pick up work

### 3.3 AGENTS.md Cleanup

`AGENTS.md` is excellent internal documentation. For the open-source launch:
- Keep it as-is — it's the comprehensive developer guide
- Add a note at the top: "This is the development guide for contributors and AI agents working on the codebase."
- Remove or generalize the production URL references (`https://app.your-domain.com`)

---

## Part 4: GitHub Setup

### 4.1 Repository Settings

**Description (one-liner):**
> Dev tool for AI agent orchestration — dispatch tasks, store conversations, work offline. MCP server included.

**Topics/Tags:**
`ai-agents`, `mcp`, `model-context-protocol`, `task-management`, `pwa`, `offline-first`, `claude-code`, `fastapi`, `nextjs`, `mongodb`, `self-hosted`, `developer-tools`

**About section:**
- Website: `https://your-domain.com` (or GitHub Pages if you want a landing page)
- Check "Releases", "Packages" if using them

### 4.2 Issue Templates

Already exists: `.github/ISSUE_TEMPLATE/bug_report.md` and `feature_request.md`. These are good.

**Add one more template:** `.github/ISSUE_TEMPLATE/agent_integration.md`
- For users requesting new agent integrations or reporting MCP tool issues
- Fields: agent name, MCP tool(s) involved, expected vs actual behavior

### 4.3 PR Template

Already exists at `.github/pull_request_template.md`. It's clean and sufficient. No changes needed.

### 4.4 GitHub Actions CI

Already exists at `.github/workflows/ci.yml` with:
- Backend: lint (flake8, black, isort) + pytest
- Frontend: lint + type-check + jest + build
- Scripts: syntax check

**Additions for launch:**
- Add a `docker` job that builds the Docker images to catch Dockerfile issues
- Add a badge to `README.md`: `![CI](https://github.com/nicholasbien/todolist/actions/workflows/ci.yml/badge.svg)`

### 4.5 Release Strategy

**Versioning:** Semantic versioning (v1.0.0 for launch)

**Process:**
1. Tag `main` with `v1.0.0` when ready
2. Create a GitHub Release with:
   - Changelog (can be auto-generated from PR titles)
   - Docker image tags matching the version
3. Future releases: use GitHub's "Generate release notes" feature which creates notes from merged PRs

**Changelog:** Create a `CHANGELOG.md` with a single entry for v1.0.0 summarizing the initial feature set. Future entries added per release.

### 4.6 Branch Protection

Set up on `main`:
- Require PR reviews (at least 1)
- Require CI to pass before merge
- Require branch to be up to date before merging
- No force pushes

---

## Part 5: User's Checklist (Non-Code Tasks)

These are things only you can do — not code changes, but account/settings/manual actions.

### Before Making Repo Public

- [ ] **Rotate ALL secrets** — OpenAI API key, Anthropic key, Brave Search key, JWT secret, SMTP password, any other keys that have ever touched this repo
- [ ] **Scrub git history** — Run `git log --all --full-history -- .env backend/.env frontend/.env.local .mcp.json` and if any hits, use BFG Repo Cleaner to remove them before going public
- [ ] **Verify `.gitignore`** — Confirm `.env`, `.env.*`, `backend/.env`, `frontend/.env.local`, `.mcp.json` are all ignored and not tracked (`git ls-files --cached .env` should return nothing)
- [ ] **Review `.mcp.json`** — This file contains an auth token and is in `.gitignore`, but verify it's not in history
- [ ] **Check for hardcoded URLs** — Search for `your-domain.com` or `railway.app` in code and decide if those should be parameterized

### GitHub Settings

- [ ] **Set repository visibility to Public** (when ready)
- [ ] **Set repository description and topics** (see 4.1 above)
- [ ] **Enable GitHub Discussions** — better than issues for questions and community
- [ ] **Set up branch protection rules** on `main` (see 4.6 above)
- [ ] **Pin important issues** — create a "good first issue" label and tag 3-5 issues for newcomers

### Announcement Prep

- [ ] **Take screenshots** — Run the screenshot script or manually capture: task list, assistant chat, journal, dark mode, MCP integration, mobile/PWA view
- [ ] **Write a launch post** — For Hacker News, Reddit r/programming, Twitter/X. Focus on the "AI agent orchestration" angle, not "yet another todo app"
- [ ] **Record a 2-minute demo video** — Show: create task -> agent picks it up -> subtasks dispatched -> results posted back. This is the "wow" moment.
- [ ] **Prepare the demo instance** — Ensure `test@example.com / 000000` works on the live site so people can try without signing up

### Post-Launch

- [ ] **Monitor issues** — First 48 hours will surface setup problems; respond quickly
- [ ] **Tag "good first issues"** — Have 5-10 ready for contributors (UI polish, docs improvements, new MCP tools)
- [ ] **Consider a Discord or community channel** — Link from README

---

## Execution Order (Suggested)

**Phase 1: Security (do first, ~2 hours)**
1. Secrets audit and rotation (2.7)
2. CORS lockdown (2.6)

**Phase 2: Core DX (the critical path, ~6 hours)**
3. Docker Compose setup (2.2)
4. Root `.env.example` (2.3)
5. Frontend `.env.example` (2.4)
6. Graceful OpenAI degradation (2.1)
7. Setup script improvements (2.5)

**Phase 3: Cleanup (~3 hours)**
8. File reorganization (3.1)
9. README rewrite (3.2)
10. CONTRIBUTING.md (3.2)
11. AGENTS.md cleanup (3.3)

**Phase 4: GitHub Setup (~1 hour)**
12. CI additions (4.4)
13. Release tag + changelog (4.5)
14. Repository settings (4.1, 4.2, 4.6)

**Phase 5: Launch**
15. User checklist items (Part 5)
16. Make repo public
17. Announce

**Total estimated effort for P0 items: ~12 hours of code work + user checklist tasks.**
