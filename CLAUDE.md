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

This is an AI-powered todo list application with a React/Next.js frontend and FastAPI backend.

### Frontend Architecture
- **Framework**: Next.js 14 with React 18
- **Styling**: Tailwind CSS
- **Main Component**: `AIToDoListApp.jsx` - handles all todo management, categories, and AI classification
- **API Communication**: Direct fetch calls to backend endpoints
- **State Management**: React useState hooks for local state

### Backend Architecture
- **Framework**: FastAPI with async support
- **Database**: MongoDB with Motor (async driver)
- **AI Integration**: OpenAI GPT-4.1-nano for task classification
- **Key Modules**:
  - `app.py`: Main FastAPI application with CORS setup
  - `todos.py`: Todo CRUD operations and MongoDB integration
  - `classify.py`: OpenAI API integration for task categorization
  - `categories.py`: Category management

### Data Flow
1. User adds a task in the frontend
2. Frontend calls `/classify` endpoint with task text
3. Backend uses OpenAI API to classify task into category and priority
4. Frontend saves classified task via `/todos` endpoint
5. MongoDB stores the todo with generated ObjectId
6. Frontend refreshes todo list from `/todos` endpoint

### Database Schema
- **Todos Collection**: `{_id, text, category, priority, dateAdded, completed}`
- **Categories Collection**: `{name}` with default categories initialized on startup

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

- All API calls have 5-second timeouts to prevent hanging
- ObjectId conversion to strings is handled in the `todos.py` module
- Frontend includes comprehensive error handling for network requests
- Categories are dynamically managed and stored in MongoDB
- Task classification uses structured prompts for consistent JSON responses