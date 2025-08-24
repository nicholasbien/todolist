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
- **API Communication**: Direct fetch calls to backend endpoints with JWT authentication
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

### Data Flow
1. User selects or creates a space in the frontend
2. User adds a task within the active space context
3. Frontend sends task with space_id to `/todos`
4. Backend classifies the task using space-specific categories and stores in MongoDB
5. Frontend refreshes todo list filtered by active space

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

- **Space-Aware Operations**: All todo and category operations include space context
- **Legacy Data Migration**: Automatic migration of data without space_id to default space on startup
- **Optional Space Parameters**: Backend APIs support optional space_id for backward compatibility
- **Access Control**: Membership validation on all space-related operations
- **AI Classification**: Task classification uses space-specific categories for better accuracy
- **Real-time Collaboration**: Multiple users can work in the same space simultaneously
- **Email Invitations**: Handles both existing users and pending signups
- **Error Handling**: Comprehensive error handling for network requests and space operations
- **Data Isolation**: Complete separation of todos and categories between spaces

## API Endpoints

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
- `POST /auth/signup` - Sign up with email
- `POST /auth/login` - Login with email and verification code
- `POST /auth/logout` - Logout and invalidate session
