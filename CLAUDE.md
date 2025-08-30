# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Frontend (Next.js)
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Check API route synchronization
node scripts/check-api-routes.js
```

### Backend (FastAPI)
```bash
# Activate virtual environment
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r backend/requirements.txt

# Run development server
cd backend && python app.py

# The backend runs on http://localhost:8000
```

## Architecture Overview

This is an AI-powered collaborative todo list application with a React/Next.js frontend and FastAPI backend, supporting multi-user spaces for team collaboration.

### Frontend Architecture
- **Framework**: Next.js 14 with React 18
- **Styling**: Tailwind CSS
- **Main Component**: `AIToDoListApp.tsx` - handles todo management, categories, and spaces
- **API Communication**: `/api/*` proxy pattern through Next.js for unified same-origin requests
- **Service Worker**: Offline-first PWA with IndexedDB storage and intelligent sync
- **State Management**: React useState hooks for local state
- **Collaboration**: Real-time space switching and member management

### Backend Architecture
- **Framework**: FastAPI with async support
- **Database**: MongoDB with Motor (async driver)
- **AI Integration**: OpenAI GPT-5-nano for task classification and GPT-5-mini for the chatbot
- **Authentication**: JWT-based session management with email verification
- **Key Modules**:
  - `app.py`: Main FastAPI application with CORS setup
  - `todos.py`: Todo CRUD operations and MongoDB integration
  - `classify.py`: OpenAI API integration for task categorization
  - `categories.py`: Space-aware category management
  - `spaces.py`: Multi-user space collaboration system
  - `auth.py`: User authentication and session management
  - `agent/`: AI agent module with streaming SSE endpoint and direct tool functions

### AI Agent Architecture
- **Backend Implementation**: AI agent runs entirely on Python FastAPI backend (migrated from Node.js MCP)
- **Streaming SSE Endpoint**: `/agent/stream` provides real-time responses with Server-Sent Events
- **Direct Tool Integration**: Tools directly call existing backend functions (no IPC overhead)
- **OpenAI GPT-4.1**: Chat completions with function calling for weather, tasks, journals, and search
- **Cross-Platform**: Works seamlessly on web (via service worker) and mobile (Capacitor direct calls)
- **Available Tools**:
  - Weather: `get_current_weather`, `get_weather_forecast`, `get_weather_alerts`
  - Tasks: `add_task`, `list_tasks`, `update_task`
  - Content: `add_journal_entry`, `search_content`

### Spaces System
- **Default Spaces**: Every user gets a personal "Default" space automatically
- **Collaborative Spaces**: Users can create shared spaces and invite others by email
- **Access Control**: Space ownership and membership validation on all operations
- **Isolation**: Todos and categories are completely isolated between spaces
- **Email Invitations**: Support for inviting both existing and new users

### Service Worker Routing Architecture

The app uses an **offline-first service worker proxy** for all API communication, providing seamless online/offline functionality.

#### Request Flow
1. **Frontend API Layer** (`utils/api.ts`):
   - Detects environment (Capacitor native vs web)
   - Routes Capacitor directly to production backend
   - Routes web requests through relative URLs for service worker interception

2. **Service Worker Proxy** (`public/sw.js`):
   - Intercepts all same-origin API requests (`/todos`, `/categories`, `/spaces`, `/journals`, `/auth`, etc.)
   - Routes to appropriate backend based on environment:
     - **Production**: `https://backend-production-e920.up.railway.app`
     - **Local Development**: `http://localhost:8000`
     - **Capacitor**: Direct to production backend (bypasses service worker)

3. **Offline-First Functionality**:
   - **Online**: Forwards requests to backend, caches responses in IndexedDB
   - **Offline**: Serves from IndexedDB, queues write operations for later sync
   - **Sync**: Automatically syncs queued operations when back online

#### Authentication Handling
- **No Auth Required**: `/auth/signup`, `/auth/login` (no auth headers sent)
- **Auth Required**: `/auth/logout`, `/auth/me`, all other endpoints (includes JWT token)
- **Token Management**: Stored in localStorage and IndexedDB for offline access

#### Environment Detection
```javascript
const isCapacitor = Capacitor.isNativePlatform(); // Mobile app
const isProdHost = hostname.endsWith('todolist.nyc'); // Production web
const backendUrl = (isProdHost || isCapacitor)
  ? CONFIG.PRODUCTION_BACKEND
  : CONFIG.LOCAL_BACKEND;
```

### Data Flow (Current Architecture)
1. User selects or creates a space in the frontend
2. User adds a task within the active space context
3. Frontend calls `apiRequest('/todos')` with space_id
4. Service Worker intercepts request and routes to backend
5. Backend classifies task using space-specific categories and stores in MongoDB
6. Service Worker caches response in IndexedDB for offline access
7. Frontend displays updated todo list filtered by active space

### Database Schema
- **Spaces Collection**: `{_id, name, owner_id, member_ids, pending_emails}`
- **Todos Collection**: `{_id, text, category, priority, dateAdded, completed, space_id}`
- **Categories Collection**: `{name, space_id}` with space-specific default categories
- **Users Collection**: `{_id, email, name, email_enabled, summary_hour, summary_minute}`
- **Sessions Collection**: `{_id, user_id, token, expires_at}` for JWT session management

## Environment Setup

Both frontend and backend require OpenAI API keys:
- Frontend: `.env.local` with `OPENAI_API_KEY`
- Backend: `.env` with `OPENAI_API_KEY`
- Backend also supports `MONGODB_URL` (defaults to `mongodb://localhost:27017`)

## Development Workflow

1. Start MongoDB (if not using cloud MongoDB)
2. Start backend server: `cd backend && python app.py`
3. Start frontend server: `npm run dev`
4. Frontend runs on http://localhost:3000, backend on http://localhost:8000

## Key Implementation Details

- **Next.js API Proxy**: All frontend requests use `/api/*` pattern routed through `pages/api/[...proxy].js`
- **Service Worker Offline-First**: PWA with IndexedDB storage, request interception, and intelligent sync
- **Space-Aware Operations**: All todo and category operations include space context
- **Legacy Data Migration**: Automatic migration of data without space_id to default space on startup
- **Optional Space Parameters**: Backend APIs support optional space_id for backward compatibility
- **Access Control**: Membership validation on all space-related operations
- **AI Classification**: Task classification uses space-specific categories for better accuracy
- **Real-time Collaboration**: Multiple users can work in the same space simultaneously
- **Email Invitations**: Handles both existing users and pending signups
- **Error Handling**: Comprehensive error handling for network requests and space operations
- **Data Isolation**: Complete separation of todos and categories between spaces
- **Auto-save Optimization**: Journal entries use queue optimization to prevent duplicate operations
- **Immediate Replacement**: Offline todos are immediately replaced with server versions upon successful sync

## API Endpoints

**Note**: All frontend requests use direct paths (e.g., `/todos`, `/auth/signup`) that are intercepted by the service worker and routed to the appropriate backend.

### AI Agent
- `GET /agent/stream?q={query}&space_id={id}` - AI agent streaming endpoint with tool calling

### Spaces
- `GET /spaces` - List user's accessible spaces
- `POST /spaces` - Create new space
- `PUT /spaces/{id}` - Rename space (owner only)
- `DELETE /spaces/{id}` - Delete space (owner only)
- `POST /spaces/{id}/invite` - Invite users to space

### Todos (Space-Aware)
- `GET /todos?space_id={id}` - Get todos for specific space
- `POST /todos` - Create todo with space_id
- `PUT /todos/{id}` - Update todo
- `DELETE /todos/{id}` - Delete todo

### Categories (Space-Aware)
- `GET /categories?space_id={id}` - Get categories for space
- `POST /categories` - Add category to space
- `PUT /categories/{name}?space_id={id}` - Rename category
- `DELETE /categories/{name}?space_id={id}` - Delete category

### Authentication
- `POST /auth/signup` - Sign up with email (no auth required)
- `POST /auth/login` - Login with email and verification code (no auth required)
- `POST /auth/logout` - Logout and invalidate session (auth required)
- `GET /auth/me` - Get current user info (auth required)

### Journals
- `GET /api/journals?date={date}&space_id={id}` - Get journal entry for specific date and space
- `POST /api/journals` - Create/update journal entry with space_id
- `DELETE /api/journals/{id}` - Delete journal entry

### Insights
- `GET /api/insights?space_id={id}` - Get analytics/insights for specific space

### Chat
- `POST /api/chat` - AI chatbot for todo assistance

- go into the virtual environment if you see environment issues and are not in it

## Service Worker Architecture

### Overview
The app uses an offline-first PWA architecture with a sophisticated service worker that:
- **Intercepts `/api/*` requests** for offline capability
- **Stores data in IndexedDB** for offline access
- **Syncs queued operations** when back online
- **Immediately replaces offline IDs** with server IDs upon successful sync
- **Provides intelligent fallback** to cached data when offline

### Key Features
- **Request Interception**: All `/api/*` same-origin requests are intercepted
- **Offline Storage**: Todos, journals, categories stored in user-isolated IndexedDB stores
- **Sync Queue**: Failed operations queued for retry when online
- **Auto-save Optimization**: Journal entries update existing queue entries to prevent duplicates
- **ID Mapping**: Offline IDs (`offline_*`) are immediately replaced with server IDs after sync
- **User Isolation**: All data strictly isolated by `user_id` in separate IndexedDB stores
- **Concurrency Protection**: Sync operations use flags to prevent race conditions

### Service Worker Updates

**CRITICAL**: Always bump service worker cache versions when modifying `public/sw.js`:
- Increment `STATIC_CACHE` version: `todo-static-v41` → `todo-static-v42`
- Increment `API_CACHE` version: `todo-api-v41` → `todo-api-v42`
- Increment `DB_VERSION` if changing IndexedDB schema: `10` → `11`

Without version bumps, browsers will continue using the cached old service worker, and changes won't take effect in production.

### Request Flow
1. Frontend makes request to `/api/todos`
2. Service Worker intercepts same-origin request
3. If online: Forward to Next.js proxy → Backend
4. If offline: Serve from IndexedDB with offline ID generation
5. Queue failed operations for sync when back online
6. On successful sync: Immediately replace offline data with server data

## Common Issues

### Field Serialization Bug: `_id` vs `id`

**Problem**: Service worker expects `_id` fields for IndexedDB storage, but inconsistent backend serialization can return `id` instead.

**Symptoms**:
- Journal/todo data cached successfully when online
- "Found 0 items" when retrieving the same data offline
- `ERR_INTERNET_DISCONNECTED` errors for cached requests

**Root Cause**:
- IndexedDB stores are configured with `keyPath: '_id'`
- Pydantic models use `Field(alias="_id")` but serialize differently based on method:
  - `model.dict()` → returns `{"id": "value"}` (Python field name)
  - `model.dict(by_alias=True)` → returns `{"_id": "value"}` (alias name)
  - FastAPI `response_model` → automatically uses aliases correctly

**Solution**: Always use consistent serialization in FastAPI endpoints:
```python
# ❌ WRONG - Uses Python field name
@app.get("/items")
async def get_items():
    items = await get_items_from_db()
    return [item.dict() for item in items]  # Returns {"id": ...}

# ✅ CORRECT - Use response_model for consistency
@app.get("/items", response_model=List[Item])
async def get_items():
    return await get_items_from_db()  # FastAPI handles serialization

# ✅ ALTERNATIVE - Explicit by_alias=True
@app.get("/items")
async def get_items():
    items = await get_items_from_db()
    return [item.dict(by_alias=True) for item in items]  # Returns {"_id": ...}
```

**Prevention**:
- Always use `response_model` in FastAPI endpoints for consistency
- Test offline functionality after adding new endpoints
- Monitor service worker logs for "Found 0" vs expected counts

## API Routing Maintenance

### ⚠️ CRITICAL: When Adding New Backend Endpoints

**THE #1 CAUSE OF 404 ERRORS**: New backend endpoints added without updating service worker routes.

**Problem**: Service worker only intercepts whitelisted paths. New endpoints fall through to Next.js and return 404.

**Solution**: Always follow these steps when adding backend endpoints:

1. **Add endpoint to backend** (`backend/app.py`)
2. **Update service worker routes** (`public/sw.js`) - ADD TO BOTH LOCATIONS:
   - `isCapacitorLocal` check (line ~560)
   - `isApi` check (line ~570)
3. **Increment cache versions** (`STATIC_CACHE` and `API_CACHE`)
4. **Test both routes**: Service worker + proxy fallback

**Quick Check**:
```bash
# Verify route synchronization
node scripts/check-api-routes.js

# Test both routing layers
curl http://localhost:3000/new-endpoint      # Service worker
curl http://localhost:3000/api/new-endpoint  # Proxy fallback
```

**Current API Routes** (as of 2025-08-30):
- `/todos`, `/categories`, `/spaces`, `/journals`, `/insights`, `/chat`
- `/agent`, `/auth`, `/email`, `/contact`, `/export`, `/health`

**Documentation**: See `docs/API_ROUTING_ARCHITECTURE.md` for complete details.

**Automated Testing**: `__tests__/ServiceWorkerRouteValidation.test.ts` catches missing routes.
