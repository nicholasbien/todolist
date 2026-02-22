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
```bash
cd frontend

npm test                                         # Run all tests
npm test -- AppMain.test.tsx                     # Component tests
npm test -- AuthForm.test.tsx                    # Auth form tests
npm test -- ServiceWorkerSync.test.ts            # Service worker tests
npm test -- --coverage                           # With coverage
```

**Test Structure:**
- `__tests__/AppMain.test.tsx` - Main app component tests
- `__tests__/AuthForm.test.tsx` - Authentication form tests
- `__tests__/ServiceWorkerSync.test.ts` - Service worker sync tests
- `__tests__/ServiceWorkerRouteValidation.test.ts` - Route validation tests
- Plus 19 additional test files covering offline ops, journals, email settings, account creation, etc.

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

**Test Structure:**
- `tests/test_auth.py` - Authentication system tests (11 tests)
- `tests/conftest.py` - Pytest configuration with async fixtures and mock database setup
- `manual_tests/` - **DO NOT RUN** - require interactive input or SMTP connections

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
     - **Production**: `https://backend-production-e920.up.railway.app`
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

**Todos Collection:**
`{_id, text, link, category, priority, dateAdded, dueDate, sortOrder, notes, completed, dateCompleted, user_id, space_id, created_offline}`

**Categories Collection:**
`{name, space_id}` with compound unique index on (space_id, name)

**Journals Collection:**
`{_id, user_id, space_id, date, text, created_at, updated_at}` with indexes on (user_id, date) and (user_id, space_id, date)

**Chats Collection:**
`{_id, user_id, role, content, space_id, created_at}` with index on (user_id, space_id, created_at)

---

## Environment Setup

See `docs/ENVIRONMENT_SETUP.md` for complete environment variable documentation.

Quick setup:
- Backend: Copy `backend/.env.example` to `backend/.env` and fill in your API keys
- Frontend: Create `frontend/.env.local` with `OPENAI_API_KEY` and optionally `NEXT_PUBLIC_API_URL`

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
OPENAI_API_KEY=your_openai_api_key
# NEXT_PUBLIC_API_URL is intentionally NOT set for local dev (defaults to localhost:8000 via service worker)
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
- `DELETE /agent/history?space_id={id}` - Clear chat history for space

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
- `scripts/populate_sample_data.py` - Populates sample data for testing

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

---

## Agent Definitions

### pwa-app-store-converter

**Purpose**: Converts existing Next.js/React PWA applications to native app store packages for iOS and Android distribution.

**Description**: Uses TWA (Trusted Web Activity) for Android Play Store deployment and Capacitor wrapper for iOS App Store deployment, providing a fast path to native app distribution without code rewrites.

**Technical Stack**:
- **Android**: Trusted Web Activity (TWA) with Bubblewrap CLI
- **iOS**: Capacitor framework for native wrapper
- **PWA Tools**: Lighthouse auditing, Workbox for service workers
- **Build Tools**: Android Studio/Gradle for APK/AAB, Xcode for iOS archives

**Timeline**: Typically 3-4 weeks from PWA assessment to app store submission.
