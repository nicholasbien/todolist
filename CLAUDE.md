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

### Spaces System
- **Default Spaces**: Every user gets a personal "Default" space automatically
- **Collaborative Spaces**: Users can create shared spaces and invite others by email
- **Access Control**: Space ownership and membership validation on all operations
- **Isolation**: Todos and categories are completely isolated between spaces
- **Email Invitations**: Support for inviting both existing and new users

### Data Flow (With Service Worker Architecture)
1. User selects or creates a space in the frontend
2. User adds a task within the active space context
3. Frontend sends task with space_id to `/api/todos` (proxied to backend)
4. Service Worker intercepts same-origin `/api/*` requests for offline capability
5. Backend classifies the task using space-specific categories and stores in MongoDB
6. Service Worker provides offline storage and sync when back online
7. Frontend refreshes todo list filtered by active space

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

**Note**: All frontend requests use `/api/*` pattern (e.g., `/api/todos`) which are proxied to the backend at the corresponding path (e.g., `/todos`).

### Spaces
- `GET /api/spaces` - List user's accessible spaces
- `POST /api/spaces` - Create new space
- `PUT /api/spaces/{id}` - Rename space (owner only)
- `DELETE /api/spaces/{id}` - Delete space (owner only)
- `POST /api/spaces/{id}/invite` - Invite users to space

### Todos (Space-Aware)
- `GET /api/todos?space_id={id}` - Get todos for specific space
- `POST /api/todos` - Create todo with space_id
- `PUT /api/todos/{id}` - Update todo
- `DELETE /api/todos/{id}` - Delete todo

### Categories (Space-Aware)
- `GET /api/categories?space_id={id}` - Get categories for space
- `POST /api/categories` - Add category to space
- `PUT /api/categories/{name}?space_id={id}` - Rename category
- `DELETE /api/categories/{name}?space_id={id}` - Delete category

### Authentication
- `POST /api/auth/signup` - Sign up with email
- `POST /api/auth/login` - Login with email and verification code
- `POST /api/auth/logout` - Logout and invalidate session

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
