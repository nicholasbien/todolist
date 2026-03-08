# AI Todo List App - Agent Instructions

## Keeping This Document Up to Date

**AGENTS.md is the single source of truth for this project.** When a PR introduces major new features, redesigns, new endpoints, new components, or architectural changes, update the relevant sections of this document as part of that PR. This ensures documentation stays accurate for all agents and contributors.

---

## Overview
This is an AI-powered collaborative todo list application with a React/Next.js frontend and FastAPI backend. It supports multi-user spaces, email verification auth, AI task classification, offline-first PWA, AI agent with tool calling, journal entries, and daily email summaries.

## Quick Setup
Run the setup script:
```bash
./setup.sh
```

## Manual Setup

### Backend Setup
```bash
cd backend

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install pre-commit hooks
pre-commit install
```

### Frontend Setup
```bash
cd frontend

# Install dependencies
npm install
```

---

## Running the Application

### Development Mode

**Backend (Terminal 1):**
```bash
cd backend && source venv/bin/activate && uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```
Backend runs on http://localhost:8000

> Alternative (shows deprecation warning): `cd backend && source venv/bin/activate && python app.py`
> If you see environment issues, activate the virtual environment: `source backend/venv/bin/activate`

**Frontend (Terminal 2):**
```bash
cd frontend && npm run dev
```
Frontend runs on http://localhost:3000

### Production Mode

**Frontend Build (web):**
```bash
cd frontend && npm run build && npm start
```

**Frontend Build (iOS/Android Capacitor):**
```bash
cd frontend && npm run cap:build
# Builds with CAPACITOR_BUILD=true (creates 'out' dir) AND syncs to iOS/Android.
# After running, rebuild in Xcode / Android Studio.
```

### Updating Logo/Icons
See the **"Updating Logo/Icons"** section in `README.md`.

---

## Linting and Code Quality

### Pre-commit Hooks (Automatic)
Pre-commit hooks are automatically installed during setup to run linting on every commit.

The hooks include:
- **autoflake**: Removes unused imports and variables
- **trailing-whitespace**: Fixes trailing whitespace
- **black**: Code formatting (120 char line length)
- **isort**: Import sorting
- **flake8**: Style and error checking
- **mypy**: Type checking

```bash
# Run pre-commit on all files manually
cd backend && source venv/bin/activate && pre-commit run --all-files

# Skip pre-commit hooks (not recommended)
git commit -m "message" --no-verify
```

### Manual Linting

#### Frontend Linting
```bash
cd frontend

# Run ESLint
npm run lint

# Fix auto-fixable issues
npm run lint -- --fix
```

#### Backend Linting
```bash
cd backend
source venv/bin/activate

flake8 .    # Run linting
black .     # Format code
isort .     # Sort imports
mypy .      # Type checking
```

---

## Testing

### Test Account for AI Agents and Automated Testing

The system includes a **built-in test account** that completely bypasses email verification for instant testing:

#### IMPORTANT: Agent Testing Protocol

**FOR AI AGENTS: Use this exact flow - DO NOT check email**

```bash
# Step 1: Direct login (skip signup entirely)
# This automatically creates the test user if it doesn't exist
curl -H "Content-Type: application/json" \
     -d '{"email": "test@example.com", "code": "000000"}' \
     http://localhost:8000/auth/login

# Step 2: Use the returned token for all subsequent requests
TOKEN="paste_token_from_above_response"

# Step 3: Test the API immediately
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/todos
```

#### Test Account Details
- **Email**: `test@example.com`
- **Code**: `000000` (always this code)
- **NO EMAIL IS SENT** - the code is hardcoded in the system
- **NO SIGNUP REQUIRED** - login automatically creates the user

#### Complete Testing Example
```bash
RESPONSE=$(curl -s -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "code": "000000"}' \
  http://localhost:8000/auth/login)
TOKEN=$(echo $RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/todos
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/spaces
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/categories
```

#### UI Testing Options

**Option 1: PREFERRED - Direct UI Login**
1. Navigate to `http://localhost:3000`
2. Enter email: `test@example.com`
3. Click "Send Code" *(no email sent)*
4. Enter code: `000000`
5. Click "Login"

**Option 2: API → UI Bridge**
```javascript
// In browser console after API login:
localStorage.setItem('auth_token', 'YOUR_TOKEN_FROM_API');
window.location.reload();
```

Same test credentials work on production: `https://app.todolist.nyc`

---

### Testing the AI Agent

The AI agent (`/agent/stream`) supports sequential tool calling with personalization.

#### Get User's Space ID
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8000/spaces
# Note the "Personal" space _id
```

#### Test Agent Queries
```bash
# Weather query
curl -N -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:8000/agent/stream?q=What%27s%20the%20weather%20in%20New%20York?"

# Task management
curl -N -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:8000/agent/stream?q=Add%20task%20to%20learn%20Python&space_id=SPACE_ID"

# Multi-tool sequential call (list_tasks → search_content → recommendations)
curl -N -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:8000/agent/stream?q=Recommend%20books%20based%20on%20my%20current%20tasks&space_id=SPACE_ID"
```

#### Expected SSE Response Flow
```
event: ready
data: {"ok": true, "tools": [...], "space_id": "..."}

event: tool_result
data: {"tool": "list_tasks", "data": {"ok": true, "tasks": [...]}}

event: token
data: {"token": "Here"}

...more tokens...

event: done
data: {"ok": true}
```

#### Available Agent Tools
- **Tasks**: `add_task`, `list_tasks`, `update_task`
- **Journals**: `add_journal_entry`, `read_journal_entry`
- **Search**: `search_content`
- **Weather**: `get_current_weather`, `get_weather_forecast`
- **Web**: `web_search` (Brave API), `web_scraping`
- **External APIs**: `get_book_recommendations`, `get_inspirational_quotes`
- **Email**: `send_email_to_user`

---

### Frontend Tests

**Run after any change to frontend TypeScript/JavaScript code.** No server required — Jest runs with mocks.

```bash
cd frontend

npm test                                                    # Run all 221 tests (default)
npm test -- --no-coverage                                   # Faster (skip coverage report)
npm test -- ServiceWorkerSync.test.ts                       # Single file
npm test -- --testPathPattern="ServiceWorker"               # All SW tests
npm test -- --coverage                                      # With coverage report
```

#### When to run which tests

| Change you made | Tests to run |
|---|---|
| Any frontend JS/TS file | `npm test` (run all) |
| `public/sw.js` | `npm test` — especially `ServiceWorkerSync`, `ServiceWorkerSyncBugFixes`, `ServiceWorkerRoutingCaching` |
| `components/AIToDoListApp.tsx` | `npm test` — especially `AppMain`, `TodoSpaceChangeModal` |
| Auth/login flows | `npm test -- AuthForm.test.tsx AccountCreationFlow.test.tsx` |
| Journal feature | `npm test -- OfflineJournal.test.ts` |
| Category/space logic | `npm test -- TodoSpaceChangeModal.test.tsx` |
| Email/notification settings | `npm test -- EmailSettings.test.tsx` |

#### Test file map (24 suites, 221 tests)

**Service worker / offline sync:**
- `tests/sw.test.js` — core SW primitives (IDB read/write, queue ops, ID mapping, sync logic)
- `__tests__/ServiceWorkerSync.test.ts` — `handleApiRequest` end-to-end, online/offline routing, caching
- `__tests__/ServiceWorkerSyncBugFixes.test.ts` — regression tests for sync bugs 1-9
- `__tests__/ServiceWorkerRoutingCaching.test.ts` — `API_ROUTES`, `isApiPath`, `buildBackendRequest`, `GET_CACHE_HANDLERS`
- `__tests__/ServiceWorkerRouteValidation.test.ts` — route allow/deny list validation
- `__tests__/OfflineJournal.test.ts` — journal offline create/update flows

**UI components:**
- `__tests__/AppMain.test.tsx` — main app renders, tab switching, todo CRUD
- `__tests__/AuthForm.test.tsx` — login/signup form behavior
- `__tests__/TodoSpaceChangeModal.test.tsx` — moving todos between spaces in edit modal
- `__tests__/AccountCreationFlow.test.tsx` — account creation edge cases
- `__tests__/EmailSettings.test.tsx` — email notification preferences
- `__tests__/OfflineInsights.test.ts` — insights generation (timezone-safe week bucketing)

---

### Backend Tests

Backend tests run standalone with mock databases - no server startup required.

```bash
cd backend && source venv/bin/activate

pytest                              # Run all tests
pytest tests/test_auth.py -v        # Authentication tests
pytest -v --tb=short                # Verbose output (good for agents)
pytest --cov=. --cov-report=term-missing  # With coverage
```

**When to run:** After any change to Python backend files (`backend/app.py`, `backend/routers/`, etc.).

**Test Structure:**
- `tests/test_auth.py` - Authentication system tests (11 tests)
- `tests/conftest.py` - Pytest configuration with async fixtures and mock database setup
- `manual_tests/` - **DO NOT RUN** - require interactive input or SMTP connections

---

## Offline/Online Sync — E2E Testing

The Jest unit tests in `__tests__/` cover service worker internals (IndexedDB ops, queue logic, sync deduplication) with mocked fetch and fake-indexeddb. The Playwright E2E script covers the full browser flow that Jest cannot: real service worker registration, real IndexedDB, real network toggling, and UI reflecting correct state after sync.

### Run offline sync tests

Both servers must be running (same as screenshots):

```bash
node scripts/test-offline-sync.js
```

### What it tests

| Test | Scenario |
|------|----------|
| 1 | Create task while offline → go online → task has real server ID |
| 2 | Update task text offline → sync → server reflects new text |
| 3 | Delete task offline → sync → task gone from server |
| 4 | Complete task offline → sync → visible in "Show Completed" |
| 5 | Write journal offline → sync → server has correct entry text |
| 6 | Data created online still accessible after going offline (IndexedDB cache) |
| 7 | Multiple offline ops (update + delete + create) all sync in one batch |

### When to run these tests

**Run `node scripts/test-offline-sync.js` whenever you change offline sync behavior**, including:
- Any modification to `frontend/public/sw.js`
- Changes to `context/OfflineContext.tsx`
- New API endpoints that need to work offline (must be added to `API_ROUTES` in the SW)
- Changes to how queued operations are serialized, ordered, or replayed

**When adding new offline behavior, add a new test** to `scripts/test-offline-sync.js` that covers it. See `docs/OFFLINE_SYNC_TESTING.md` for patterns, helper reference, gotchas, and step-by-step guidance on writing new tests.

### How sync works (reference)

1. Browser goes offline → `navigator.onLine = false` → SW routes all API requests to IndexedDB
2. Mutations are queued in IndexedDB (`queue` object store) with types `CREATE`, `UPDATE`, `DELETE`, etc.
3. Browser comes back online → `online` event fires → `OfflineContext` sends `SYNC_WHEN_ONLINE` to SW
4. SW runs `syncQueue()` → processes every queued op against the real backend → sends `SYNC_COMPLETE` postMessage to all tabs
5. App receives `SYNC_COMPLETE` → refreshes task list from server

### Playwright patterns used

```js
// Simulate offline/online
await context.setOffline(true);   // navigator.onLine → false
await context.setOffline(false);  // fires 'online' event → triggers sync

// Wait for SYNC_COMPLETE before going online to avoid race
const syncPromise = waitForSync(page, 10000);
await context.setOffline(false);
await syncPromise;

// Verify server state from the page (goes through SW auth proxy)
const todos = await page.evaluate(() => fetch('/todos').then(r => r.json()));
```

### Cleanup note

Test tasks are prefixed with `[E2E]` and left in the test account after the run. Delete them manually via the app if needed.

---

## UI Changes — Screenshot Requirement

**For every PR that touches UI components, you must run the screenshot script and commit updated screenshots.**

### When this applies
Any change to files in `frontend/components/`, `frontend/pages/index.tsx`, or `frontend/pages/home.tsx` that affects visible UI (buttons, modals, layouts, colors, text).

### Steps

1. **Start both servers** (if not already running):
   ```bash
   # Terminal 1
   cd backend && source venv/bin/activate && uvicorn app:app --host 0.0.0.0 --port 8000 --reload
   # Terminal 2
   cd frontend && npm run dev
   ```

2. **Run the screenshot script** from the repo root:
   ```bash
   node scripts/take-screenshots.js
   ```
   Screenshots are saved to `screenshots/{branch-name}/` automatically. Each PR gets its own subdirectory so other PRs' screenshots are never overwritten.

3. **Commit the updated screenshots**:
   ```bash
   git add screenshots/
   git commit -m "Update screenshots for UI changes"
   ```

4. **Include screenshots in the PR description** using `raw.githubusercontent.com` links:
   ```
   ![Modal name](https://raw.githubusercontent.com/nicholasbien/todolist/YOUR-BRANCH/screenshots/YOUR-BRANCH-NAME/modal-name.png)
   ```

### Keeping the script up to date

When adding a **new modal, drawer, or full-screen view**:

1. Add a screenshot step to `scripts/take-screenshots.js`
2. Add the modal's close button to the table in `docs/SCREENSHOT_WORKFLOW.md`
3. Add a row to the Screenshots Reference table in both `docs/SCREENSHOT_WORKFLOW.md` and `docs/UI_SCREENS_NAVIGATION.md`
4. Add navigation instructions for the new screen to `docs/UI_SCREENS_NAVIGATION.md`

Full workflow documentation and Playwright patterns: `docs/SCREENSHOT_WORKFLOW.md`
Navigation reference for all screens: `docs/UI_SCREENS_NAVIGATION.md`

---

## Architecture Overview

### Frontend Architecture
- **Framework**: Next.js 14 with React 18
- **Styling**: Tailwind CSS
- **Main Component**: `AIToDoListApp.tsx` - handles todo management, categories, and spaces
- **API Communication**: Service worker intercepts requests; `pages/api/[...proxy].js` as fallback
- **Service Worker**: Offline-first PWA with IndexedDB storage and intelligent sync
- **State Management**: React useState hooks for local state

**Key Frontend Files:**
- `components/AIToDoListApp.tsx` - Main todo interface (tasks, categories, spaces, modals)
- `components/AgentChatbot.tsx` - AI assistant chat UI
- `components/InsightsComponent.tsx` - Analytics/insights display
- `components/JournalComponent.tsx` - Journal entry management
- `components/SpaceDropdown.tsx` - Space selection dropdown
- `components/TodoItem.tsx` - Individual todo item display
- `components/MessageRenderer.tsx` - Chat message rendering
- `components/NoSwipeZone.tsx` - Touch gesture helper
- `context/AuthContext.tsx` - Authentication state management
- `context/OfflineContext.tsx` - Online/offline status tracking
- `pages/index.tsx` - Main page (includes login form + app)
- `pages/home.tsx` - Marketing/landing page
- `pages/privacy.tsx` - Privacy policy
- `pages/terms.tsx` - Terms of service
- `pages/api/[...proxy].js` - Next.js API proxy to backend
- `public/sw.js` - Service worker for offline functionality
- `utils/api.ts` - API request layer with Capacitor/web detection
- `hooks/useCapacitor.ts` - Capacitor integration hook

### Backend Architecture
- **Framework**: FastAPI with async support
- **Database**: MongoDB with Motor (async driver)
- **AI Integration**: OpenAI API with gpt-4.1-nano (task classification), gpt-5.2 (AI agent, email summaries)
- **Authentication**: JWT-based session management with email verification

**Key Backend Files:**
- `app.py` - Main FastAPI application with CORS and all route definitions
- `db.py` - MongoDB connection manager and collections wrapper
- `todos.py` - Todo CRUD operations
- `categories.py` - Space-aware category management
- `spaces.py` - Multi-user space collaboration system
- `auth.py` - User authentication and session management
- `journals.py` - Journal entry CRUD operations
- `chats.py` - Chat conversation history storage
- `classify.py` - OpenAI API integration for task categorization
- `insights_utils.py` - Analytics/insights computation
- `email_summary.py` - Daily email summaries and contact messages
- `scheduler.py` - APScheduler for daily emails at 9 AM Eastern
- `dateparse.py` - Date parsing utilities
- `agent/` - AI agent module:
  - `agent.py` - Streaming SSE endpoint with OpenAI function calling
  - `tools.py` - 13 tool implementations (tasks, journals, weather, web, email, etc.)
  - `schemas.py` - Pydantic request/response schemas

### AI Agent Architecture
- **Streaming SSE Endpoint**: `/agent/stream` provides real-time responses with Server-Sent Events
- **Direct Tool Integration**: Tools directly call existing backend functions (no IPC overhead)
- **Conversation History**: Stored in `chats` collection, space-aware, max 10 messages in context
- **Cross-Platform**: Works on web (via service worker) and mobile (Capacitor direct calls)

### Spaces System
- **Default Spaces**: Every user gets a personal "Default" space automatically
- **Collaborative Spaces**: Users can create shared spaces and invite others by email
- **Access Control**: Space ownership and membership validation on all operations
- **Isolation**: Todos, categories, journals, and chat history are isolated between spaces
- **Email Invitations**: Support for inviting both existing and new users; pending invites tracked

### Service Worker Routing Architecture

The app uses an **offline-first service worker proxy** for all API communication.

#### Request Flow
1. **Frontend API Layer** (`utils/api.ts`):
   - Detects environment (Capacitor native vs web)
   - Routes Capacitor directly to production backend
   - Routes web requests through relative URLs for service worker interception

2. **Service Worker Proxy** (`public/sw.js`):
   - Intercepts all same-origin API requests matching `API_ROUTES`
   - Routes to appropriate backend based on environment:
     - **Production**: `https://todolist-backend-production-a83b.up.railway.app`
     - **Local Development**: `http://localhost:8000`
     - **Capacitor**: Direct to production backend (bypasses service worker)

3. **Offline-First Functionality**:
   - **Online**: Forwards requests to backend, caches responses in IndexedDB
   - **Offline**: Serves from IndexedDB, queues write operations for later sync
   - **Sync**: Automatically syncs queued operations when back online

#### Service Worker API_ROUTES
```javascript
const API_ROUTES = [
  '/todos', '/categories', '/spaces', '/journals', '/insights',
  '/agent', '/auth', '/email', '/contact', '/export', '/health'
];
```

### Data Flow
1. User selects or creates a space in the frontend
2. User adds a task within the active space context
3. Frontend calls `apiRequest('/todos')` with space_id
4. Service Worker intercepts request and routes to backend
5. Backend classifies task using space-specific categories and stores in MongoDB
6. Service Worker caches response in IndexedDB for offline access
7. Frontend displays updated todo list filtered by active space

### Database Schema

**Users Collection:**
`{_id, email, first_name, is_verified, verification_code, code_expires_at, created_at, last_login, email_enabled, summary_hour, summary_minute, email_instructions, timezone, email_spaces}`

**Sessions Collection:**
`{_id, user_id, token, created_at, expires_at, is_active}`

**Spaces Collection:**
`{_id, name, owner_id, member_ids, pending_emails, is_default}`
> `collaborative` is a derived concept (not a stored field): a space is collaborative when `member_ids.length > 1` or `pending_emails.length > 0`. Sending `collaborative: false` on PUT clears `member_ids` to owner-only and wipes `pending_emails`. Sending `collaborative: true` is a backend no-op.

**Todos Collection:**
`{_id, text, link, category, priority, dateAdded, dueDate, sortOrder, notes, completed, dateCompleted, user_id, space_id, created_offline}`

**Categories Collection:**
`{name, space_id}` with compound unique index on (space_id, name)

**Journals Collection:**
`{_id, user_id, space_id, date, text, created_at, updated_at}` with indexes on (user_id, date) and (user_id, space_id, date)

**Chats Collection:**
`{_id, user_id, role, content, space_id, created_at}` with index on (user_id, space_id, created_at)

---

## Configuration Rules

**No fallback URLs. Ever.** If a URL is wrong, the app must fail loudly — not silently connect to the wrong backend.

- **`openclaw-config.json`** is the MCP server config for Claude/OpenClaw agents. It contains the production backend URL, auth token, and default space ID. All values must be explicit — no `${VAR}` placeholders or hardcoded fallbacks.
- **`backend-config.json`** is the single source of truth for deployment URLs. `cli/production-env.sh` reads from it via `jq`.
- **`cli/production-env.sh`** must NOT have a hardcoded fallback URL. If `jq` or the config file is missing, the script must fail, not silently use a stale URL.
- When changing the backend URL, update `backend-config.json` first, then `openclaw-config.json`, then verify `cli/production-env.sh` has no stale fallbacks.
- Railway URLs use the format `<service>-<project>.up.railway.app` (note: `.up.railway.app` with dots, NOT `up-railway.app` with a hyphen).
- Auth tokens for the test account (`test@example.com` / `000000`) expire after 30 days of inactivity. If you get 401s, re-login and update `openclaw-config.json`.

## Environment Setup

See `docs/ENVIRONMENT_SETUP.md` for complete environment variable documentation.

Quick setup:
- Backend: Copy `backend/.env.example` to `backend/.env` and fill in your API keys
- Frontend: Create `frontend/.env.local` with `BACKEND_URL` (only required env var; no OpenAI key needed in frontend)

### Backend (.env)
```
MONGODB_URL=mongodb://localhost:27017
OPENAI_API_KEY=your_openai_api_key
JWT_SECRET=your-secret-key
OPENWEATHER_API_KEY=your_openweather_key       # Required for weather tools
BRAVE_API_KEY=your_brave_api_key               # Optional, for web search tool
SMTP_SERVER=smtp.gmail.com                     # Optional, for email features
SMTP_PORT=587
FROM_EMAIL=your_email@gmail.com
SMTP_PASSWORD=your_app_password
ADMIN_EMAIL=your_email@gmail.com
```

### Frontend (.env.local)
```
BACKEND_URL=http://localhost:8000   # Used by Next.js API proxy; defaults to localhost:8000 in dev
```

---

## Development Workflow

1. Start MongoDB (if not using cloud MongoDB)
2. Start backend: `cd backend && source venv/bin/activate && uvicorn app:app --host 0.0.0.0 --port 8000 --reload`
3. Start frontend: `cd frontend && npm run dev`
4. Frontend: http://localhost:3000, backend: http://localhost:8000

---

## Key Implementation Details

- **Service Worker Offline-First**: PWA with IndexedDB storage, request interception, and intelligent sync
- **Space-Aware Operations**: All todo, category, and journal operations include space context
- **Legacy Data Migration**: Automatic migration of data without space_id to default space on startup
- **Access Control**: Membership validation on all space-related operations
- **AI Classification**: Task classification uses space-specific categories for better accuracy
- **Auto-save Optimization**: Journal entries use queue optimization to prevent duplicate operations
- **Immediate Replacement**: Offline todos are immediately replaced with server versions upon successful sync
- **Chat Persistence**: Agent conversations stored in DB with space isolation, 10-message context window

---

## API Endpoints

**Note**: All frontend requests use direct paths (e.g., `/todos`, `/auth/signup`) intercepted by the service worker and routed to the backend.

### AI Agent
- `GET /agent/stream?q={query}&space_id={id}` - Streaming AI agent with tool calling
- `GET /agent/sessions?space_id={id}` - List chat sessions
- `GET /agent/sessions/{id}` - Get session with messages
- `POST /agent/sessions` - Create session (body: `{title, space_id?, message?}`)
- `POST /agent/sessions/{id}/messages` - Post message to session (body: `{role, content}`)
- `DELETE /agent/sessions/{id}` - Delete session

### Authentication
- `POST /auth/signup` - Send verification code (no auth required)
- `POST /auth/login` - Verify code and login (no auth required)
- `POST /auth/logout` - Logout and invalidate session
- `GET /auth/me` - Get current user info
- `POST /auth/update-name` - Update user's display name
- `DELETE /auth/me` - Delete user account

### Spaces
- `GET /spaces` - List user's accessible spaces
- `POST /spaces` - Create new space
- `PUT /spaces/{id}` - Rename space (owner only)
- `DELETE /spaces/{id}` - Delete space (owner only)
- `POST /spaces/{id}/invite` - Invite users to space
- `GET /spaces/{id}/members` - List space members
- `POST /spaces/{id}/leave` - Leave a space

### Todos (Space-Aware)
- `GET /todos?space_id={id}` - Get todos for specific space
- `POST /todos` - Create todo with space_id
- `PUT /todos/{id}` - Update todo
- `PUT /todos/{id}/complete` - Toggle completion
- `PUT /todos/reorder` - Reorder todos
- `DELETE /todos/{id}` - Delete todo

### Categories (Space-Aware)
- `GET /categories?space_id={id}` - Get categories for space
- `POST /categories` - Add category to space
- `PUT /categories/{name}?space_id={id}` - Rename category
- `DELETE /categories/{name}?space_id={id}` - Delete category

### Journals
- `GET /journals?date={date}&space_id={id}` - Get journal entries
- `POST /journals` - Create/update journal entry with space_id
- `DELETE /journals/{id}` - Delete journal entry

### Insights
- `GET /insights?space_id={id}` - Get analytics/insights for specific space

### Email
- `POST /email/send-summary` - Send summary to current user
- `GET /email/scheduler-status` - Check scheduler status
- `POST /email/update-schedule` - Update email schedule time
- `POST /email/update-instructions` - Update custom email instructions
- `POST /email/update-spaces` - Update which spaces are included in emails

### Other
- `GET /export` - Export user data (CSV or JSON)
- `POST /contact` - Contact form submission
- `GET /health` - Health check

---

## Service Worker Architecture

### Overview
The app uses an offline-first PWA architecture with a sophisticated service worker that:
- **Intercepts API requests** matching whitelisted routes for offline capability
- **Stores data in IndexedDB** for offline access
- **Syncs queued operations** when back online
- **Immediately replaces offline IDs** with server IDs upon successful sync

### Key Features
- **Offline Storage**: Todos, journals, categories stored in user-isolated IndexedDB stores
- **Sync Queue**: Failed operations queued for retry when online
- **Auto-save Optimization**: Journal entries update existing queue entries to prevent duplicates
- **ID Mapping**: Offline IDs (`offline_*`) are immediately replaced with server IDs after sync
- **User Isolation**: All data strictly isolated by `user_id` in separate IndexedDB stores

### CRITICAL: Service Worker Version Bumps

**Always bump cache versions when modifying `public/sw.js`:**
- Increment `STATIC_CACHE` version (currently `todo-static-v126`)
- Increment `DB_VERSION` if changing IndexedDB schema (currently `13`)

Without version bumps, browsers continue using the old cached service worker and changes won't take effect in production.

### Request Flow
1. Frontend makes request to `/todos`
2. Service Worker intercepts same-origin request
3. If online: Forward to backend (production or localhost)
4. If offline: Serve from IndexedDB with offline ID generation
5. Queue failed operations for sync when back online
6. On successful sync: Immediately replace offline data with server data

---

## Common Issues

### iOS Safe Area Padding (SOLVED)

**Problem**: Header overlaps with iPhone notch/status bar, or unwanted scrolling in Capacitor iOS app.

**Solution**: Use padding approach with `contentInset: 'never'`

```tsx
<div
  className="flex flex-col max-w-md mx-auto overflow-hidden"
  style={{
    height: '100dvh',
    paddingTop: 'env(safe-area-inset-top)',
    paddingBottom: 'env(safe-area-inset-bottom)'
  }}
>
```

**Key Points:**
- Use `height: 100dvh` (don't subtract safe area)
- Use `padding-top/bottom: env(safe-area-inset-*)` to push content into safe area
- DON'T use `calc(100dvh - env(...))` - over-shrinks on iOS Safari

See `docs/IOS_SAFE_AREA_INVESTIGATION.md` for complete debugging history.

### Field Serialization Bug: `_id` vs `id`

**Problem**: Service worker expects `_id` fields for IndexedDB storage, but inconsistent backend serialization can return `id` instead.

**Symptoms**: Data cached successfully online, but "Found 0 items" when retrieving offline.

**Solution**: Always use `response_model` in FastAPI endpoints or `model.dict(by_alias=True)`.

---

## API Routing Maintenance

### CRITICAL: When Adding New Backend Endpoints

**THE #1 CAUSE OF 404 ERRORS**: New backend endpoints added without updating service worker routes.

**Problem**: Service worker only intercepts whitelisted paths in `API_ROUTES`. New endpoints fall through to Next.js and return 404.

**Solution**: Always follow these steps when adding backend endpoints:

1. **Add endpoint to backend** (`backend/app.py`)
2. **Add route to `API_ROUTES`** in `public/sw.js`
3. **Increment `STATIC_CACHE` version**
4. **Test both routes**: Service worker + proxy fallback

Automated testing: `__tests__/ServiceWorkerRouteValidation.test.ts` catches missing routes.

---

## Scripts

- `scripts/take-screenshots.js` - Captures all modal screenshots for UI PRs (see Screenshot Requirement section)
- `scripts/test-offline-sync.js` - Playwright E2E tests for offline/online sync flows (see Offline Testing section below)
- `scripts/populate_sample_data.py` - Populates sample data for testing
- `scripts/auto-claim-sessions.js` - Sequential polling worker that checks pending sessions, classifies requests, spawns handlers, and posts responses
- `scripts/session-classifier.js` - Deterministic classifier that routes sessions to `coding` vs `simple` handlers using keyword and code-signal heuristics
- `scripts/subagent-spawner.js` - Handler runner that spawns `codex` for coding sessions (with timeout/retries) or generates direct simple responses

---

## MCP Server

The MCP server (`mcp-server/`) lets external AI agents (Claude Code, OpenClaw, etc.) interact with the todolist app via the Model Context Protocol. It exposes 26 tools covering all app operations.

### Setup

```bash
cd mcp-server
npm install
npm run build
```

### Configuration

The server needs three environment variables:

| Variable | Description | How to get it |
|---|---|---|
| `TODOLIST_API_URL` | Backend URL | `http://localhost:8000` (local) or `https://backend-openclaw.up.railway.app` (production) |
| `TODOLIST_AUTH_TOKEN` | JWT auth token | Login via API (see test account below) |
| `DEFAULT_SPACE_ID` | Default space for operations | `GET /spaces` with your token |

**Getting a token (test account):**
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","code":"000000"}' \
  http://localhost:8000/auth/login
# Copy the "token" from response

curl -s -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8000/spaces
# Copy the "_id" of your default space
```

**Set via `.env` file** (for `npm run dev`):
```bash
cp .env.example .env
# Edit .env with your values
```

### Adding to Claude Code

Create or edit `~/.claude/projects/<project-path>/settings.json`:
```json
{
  "mcpServers": {
    "todolist": {
      "command": "node",
      "args": ["/absolute/path/to/todolist/mcp-server/dist/index.js"],
      "env": {
        "TODOLIST_API_URL": "http://localhost:8000",
        "TODOLIST_AUTH_TOKEN": "your_token",
        "DEFAULT_SPACE_ID": "your_space_id"
      }
    }
  }
}
```

Restart Claude Code after adding the config. The tools will appear as `mcp__todolist__*`.

### Adding to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):
```json
{
  "mcpServers": {
    "todolist": {
      "command": "node",
      "args": ["/absolute/path/to/todolist/mcp-server/dist/index.js"],
      "env": {
        "TODOLIST_API_URL": "http://localhost:8000",
        "TODOLIST_AUTH_TOKEN": "your_token",
        "DEFAULT_SPACE_ID": "your_space_id"
      }
    }
  }
}
```

### Available Tools

**Todos:** `list_todos`, `add_todo`, `update_todo`, `complete_todo`, `delete_todo`, `reorder_todos`

**Spaces:** `list_spaces`, `create_space`, `update_space`, `delete_space`, `list_space_members`, `invite_to_space`, `leave_space`

**Categories:** `list_categories`, `add_category`, `rename_category`, `delete_category`

**Journals:** `get_journal`, `write_journal`, `delete_journal`

**Chat Sessions:** `list_sessions`, `create_session`, `get_session`, `post_to_session`, `get_pending_sessions`, `delete_session`

**Other:** `get_insights`, `export_data`

### Agent Messaging System

The app uses chat sessions as an asynchronous messaging channel between the user (web app) and external agents (Claude Code, OpenClaw, etc.). Every task automatically gets a linked chat session when created.

**How it works:**
1. User creates a task → backend auto-creates a linked session with task details as a `user` message
2. User can also send messages via the Assistant tab in the web app
3. Agent polls `get_pending_sessions` → finds sessions where `needs_agent_response` is true
4. Agent reads the session via `get_session`, does the work, posts a response via `post_to_session`
5. User sees the response in the web app (frontend polls every 5s)

**Session lifecycle:**
- Posting an assistant message clears `needs_agent_response`
- When the user sends a follow-up, `needs_agent_response` flips back to true

**Key tools (MCP / API):**
- `get_pending_sessions` — Returns sessions where `needs_agent_response` is true
- `get_session(session_id)` — Read full conversation history
- `post_to_session(session_id, content)` — Post agent response
- `create_session(title, todo_id?)` — Create a session, optionally linked to a task
- `GET /agent/sessions/{id}/watch?since=<ISO timestamp>` — Poll for new messages since a timestamp (for subagents checking for follow-ups during long tasks)

**CLI commands** (`cli/todolist-cli.js`):
- `list-pending` — Show pending sessions
- `get-session <id>` — Read session messages
- `post-message -s <id> -c <text>` — Post a message
- `watch-session <id> [--since <ISO timestamp>]` — Poll for new messages since timestamp

### Orchestrator Integration Guide

This section describes how an orchestrator (OpenClaw, Claude Agent SDK, custom service) should integrate with the agent messaging system.

#### Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│  Web App     │────→│  Backend    │────→│  Orchestrator     │
│  (user)      │     │  (API)      │     │  (OpenClaw, etc.) │
│              │←────│             │←────│                   │
└─────────────┘     └─────────────┘     └──────────────────┘
                                          │
                                          ├── Agent Worker 1 (task A)
                                          ├── Agent Worker 2 (task B)
                                          └── Agent Worker 3 (task C)
```

#### Polling Loop (Dispatcher)

The orchestrator runs a central dispatcher that polls for new messages:

```python
# Poll every 10-30 seconds
pending = get_pending_sessions()

for session in pending:
    session_id = session["_id"]
    conversation = get_session(session_id)

    worker = spawn_agent(
        session_id=session_id,
        task_title=session["title"],
        todo_id=session.get("todo_id"),
        last_message=session["last_message"],
    )
    active_workers[session_id] = worker
```

#### Worker Agent Lifecycle

Each worker agent handles a single session/task:

```
1. Read full session:     get_session(session_id)
2. Understand context:    Parse task details, conversation history
3. Do the work:           Edit code, run tests, research, etc.
4. Post progress updates: post_to_session(session_id, "Working on X...")
5. Check for follow-ups:  watch_session(session_id, since=<timestamp>)
6. Post final response:   post_to_session(session_id, result)
   → needs_agent_response set to false
7. When user sends follow-up → needs_agent_response flips to true
8. Orchestrator picks up session again via get_pending_sessions
9. Repeat from step 1
```

#### Subagent Workflow

Each subagent handles one session. The subagent should:

1. Read the conversation: `node cli/todolist-cli.js get-session <session_id>`
2. Post progress updates as it works: `node cli/todolist-cli.js post-message -s <session_id> -c "Looking into this..."`
3. Check for follow-up messages during long tasks: `node cli/todolist-cli.js watch-session <session_id> --since <ISO timestamp>`
4. Post its response when done: `node cli/todolist-cli.js post-message -s <session_id> -c "Here is what I found..."`
5. If the work involves code, use a git worktree to avoid conflicts

#### Webhook Integration (Recommended)

Instead of polling, the orchestrator can register a webhook:

```
POST /agent/webhooks
{
  "url": "https://your-orchestrator.com/webhook",
  "events": ["session.message_created"]
}
```

When a user posts a message, the backend POSTs to the webhook URL with the session_id and message content. The orchestrator can then immediately dispatch a worker. *(Webhook endpoint is not yet implemented — currently polling only.)*

#### Session-Task Linking

Every task has a linked session via `todo_id`:
- `get_pending_sessions` returns `todo_id` for each pending session
- Workers can use `update_todo`, `complete_todo`, etc. to modify the linked task
- This enables workflows like: user creates task → agent picks it up → agent works on it → agent marks it complete

#### Deduplication

The orchestrator must track which sessions have active workers to avoid duplicate work. Use the `session_id` as the key:

```python
active_workers: Dict[str, AgentWorker] = {}

# Before dispatching
if session_id in active_workers:
    if active_workers[session_id].is_alive():
        continue  # Already being handled
    else:
        del active_workers[session_id]  # Worker finished, clean up
```

#### MCP Configuration

The orchestrator connects to the todolist MCP server:

```json
{
  "mcpServers": {
    "todolist": {
      "command": "node",
      "args": ["/path/to/todolist/mcp-server/dist/index.js"],
      "env": {
        "TODOLIST_API_URL": "https://your-backend-url",
        "TODOLIST_AUTH_TOKEN": "your_jwt_token",
        "DEFAULT_SPACE_ID": "your_space_id"
      }
    }
  }
}
```

#### OpenClaw Subagent Dispatch

OpenClaw acts as the **orchestrator** — it checks for pending sessions and routes work to coding subagents (Codex, Claude Code, etc.). OpenClaw does NOT do coding work itself.

**How it works:**

1. Heartbeat fires → main agent runs `node cli/todolist-cli.js list-pending`
2. For each pending session, main agent reads the conversation
3. Main agent spawns a coding subagent via `sessions_spawn` to handle the work
4. Main agent saves the `runId` to a tracking file so follow-ups route to the same subagent
5. On follow-ups, main agent resumes the same subagent with the new user message

**Orchestrator flow:**

```
Heartbeat
  ├── list-pending → found session abc123
  ├── get-session abc123 → read user request
  ├── sessions_spawn codex "<prompt>" → returns runId: "run_xyz"
  ├── Save mapping: abc123 → run_xyz (in .openclaw/session-agents.json)
  └── HEARTBEAT_OK

Next heartbeat (user sent follow-up on abc123)
  ├── list-pending → abc123 has new message
  ├── get-session abc123 → read follow-up
  ├── Load mapping: abc123 → run_xyz
  ├── Route follow-up to run_xyz (resume existing subagent)
  └── HEARTBEAT_OK
```

**Spawning a subagent:**

```
sessions_spawn codex "
You are handling a user session in the todolist app.
Session ID: <session_id>

1. Read the session:
   node cli/todolist-cli.js get-session <session_id>

2. Do the work (code changes, research, etc.)
   - Use a git worktree for code changes to avoid conflicts
   - Post progress updates as you work:
     node cli/todolist-cli.js post-message -s <session_id> -c 'Working on it...'

3. Post your final response:
   node cli/todolist-cli.js post-message -s <session_id> -c 'Done. Here is what I did...'

4. Check for follow-up messages periodically:
   node cli/todolist-cli.js watch-session <session_id> --since <ISO timestamp>

5. Post your final response:
   node cli/todolist-cli.js post-message -s <session_id> -c 'Done. Here is what I did...'

Env vars are set: TODOLIST_API_URL, TODOLIST_AUTH_TOKEN, DEFAULT_SPACE_ID
"
```

**Session-to-subagent tracking:**

The orchestrator tracks which sessions have active workers using an in-memory map keyed by `session_id`. This prevents duplicate dispatches when polling returns the same pending session.

**Fallback: `codex exec` (if `sessions_spawn` unavailable):**

```bash
codex exec --full-auto "Read session <session_id>, do the work, post response via CLI"
```

Note: `codex exec` bypasses OpenClaw's lifecycle tracking — use `sessions_spawn` when available.

**Environment setup for OpenClaw:**

These env vars must be available to both the main agent and subagents:
```bash
export TODOLIST_API_URL="https://backend-openclaw.up.railway.app"
export TODOLIST_AUTH_TOKEN="your-token"
export DEFAULT_SPACE_ID="your-space-id"
```

#### Claude Code Setup (Simple)

For Claude Code (no orchestrator), use the polling skill:

```
/loop 1m /check-messages
```

This runs the `check-messages` skill every minute, which calls `get_pending_sessions` and handles messages inline. Background agents can be dispatched for longer tasks but lack persistent state management.

### Token Expiration

Auth tokens expire after 30 days of inactivity. If you get 401 errors, re-login:
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","code":"000000"}' \
  http://localhost:8000/auth/login
```
Update the token in your MCP config and restart the agent.

---

## Deployment

### Railway Deployment
A deployment script is available but should **NOT** be run by AI agents:

```bash
# HUMAN USE ONLY - DO NOT RUN AS AI AGENT
./deploy.sh
```

### Deployment Considerations
- Environment variables must be configured in Railway dashboard
- MongoDB connection required
- SMTP credentials needed for email functionality
- Daily email scheduler runs automatically at 9 AM Eastern
- Backend has restart policy ON_FAILURE for automatic recovery

### GitHub Actions CI/CD
The repository includes two GitHub Actions workflows in `.github/workflows/`:

- `ci.yml` runs on all pull requests and on pushes to `main`:
  - Backend: `flake8`, `black --check`, `isort --check-only`, `mypy`, `pytest`
  - Frontend: `npm run lint`, `npx tsc --noEmit`, `npm run test -- --ci --runInBand`, `npm run build`
  - Scripts service: `npm ci` and `node --check` on all `scripts/*.js` files

- `deploy.yml` runs on pushes to `main` (and supports manual `workflow_dispatch`) and deploys all three Railway services via Railway CLI:
  - Backend service (from `backend/`)
  - Frontend service (from `frontend/`)
  - Webhook/scripts service (from `scripts/`)

Required GitHub repository secrets for deployment:
- `RAILWAY_TOKEN`
- `RAILWAY_PROJECT_ID`
- `RAILWAY_ENVIRONMENT`
- `RAILWAY_BACKEND_SERVICE`
- `RAILWAY_FRONTEND_SERVICE`
- `RAILWAY_SCRIPTS_SERVICE`
