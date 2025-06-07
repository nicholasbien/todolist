# AI Todo List App - Agent Instructions

## Overview
This is an AI-powered todo list application with a React/Next.js frontend and FastAPI backend. It includes email verification auth, AI task classification, offline functionality, and daily email summaries.

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
```

### Frontend Setup
```bash
cd frontend

# Install dependencies
npm install
```

## Running the Application

### Development Mode

**Backend (Terminal 1):**
```bash
cd backend
source venv/bin/activate
python app.py
```
Backend runs on http://localhost:8000

**Frontend (Terminal 2):**
```bash
cd frontend
npm run dev
```
Frontend runs on http://localhost:3000

### Production Mode

**Frontend Build:**
```bash
cd frontend
npm run build
npm start
```

## Linting and Code Quality

### Pre-commit Hooks (Recommended)
Set up pre-commit hooks to run linting automatically on every commit:

```bash
# Install pre-commit (included in backend requirements.txt)
cd backend && source venv/bin/activate && pip install pre-commit

# Install the git hooks
pre-commit install

# Run on all files (optional)
pre-commit run --all-files
```

Now linting will run automatically on every `git commit`.

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

# Run linting
flake8 .

# Format code
black .

# Sort imports
isort .

# Type checking
mypy .
```

## Testing

### Frontend Tests
```bash
cd frontend

# No tests currently configured
# To add: npm install --save-dev @testing-library/react @testing-library/jest-dom jest
```

### Backend Tests
```bash
cd backend
source venv/bin/activate

# Run existing tests
python test_auth.py
python test_auth_automated.py
python test_email.py

# Run with pytest (if installed)
pytest
```

## Architecture

### Backend (FastAPI)
- **Framework**: FastAPI with async support
- **Database**: MongoDB with Motor (async driver)
- **AI Integration**: OpenAI GPT-4o-mini for task classification
- **Authentication**: JWT tokens with email verification
- **Email**: SMTP for verification codes and daily summaries
- **Scheduling**: APScheduler for daily emails at 9 AM Eastern

**Key Files:**
- `app.py` - Main FastAPI application
- `todos.py` - Todo CRUD operations
- `auth.py` - Authentication and user management
- `classify.py` - OpenAI task classification
- `categories.py` - Category management
- `email_summary.py` - Daily email summaries
- `scheduler.py` - Background job scheduling

### Frontend (Next.js/React)
- **Framework**: Next.js 14 with React 18 (CSR mode)
- **Styling**: Tailwind CSS
- **State Management**: React useState/useContext
- **Authentication**: JWT tokens in localStorage
- **Offline Support**: Service Worker with IndexedDB

**Key Files:**
- `components/AIToDoListApp.jsx` - Main todo interface
- `components/AuthForm.jsx` - Login/signup form
- `context/AuthContext.js` - Authentication state management
- `public/sw.js` - Service worker for offline functionality

## Environment Variables

### Backend (.env)
```
MONGODB_URL=mongodb://localhost:27017
OPENAI_API_KEY=your_openai_api_key
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
FROM_EMAIL=your_email@gmail.com
SMTP_PASSWORD=your_app_password
ADMIN_EMAIL=your_email@gmail.com
JWT_SECRET=your-secret-key
```

### Frontend (.env.local)
```
OPENAI_API_KEY=your_openai_api_key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Key Features

### Authentication
- Email-based signup/login with verification codes
- JWT session management
- User profile management

### Todo Management
- AI-powered task classification (category/priority)
- Real-time CRUD operations
- Category management
- Priority-based sorting

### Email System
- Verification codes for auth
- Daily summary emails (admin only by default)
- Manual summary trigger button

### Offline Support
- Service worker caches API requests
- IndexedDB for offline data storage
- Sync queue for offline operations

## API Endpoints

### Authentication
- `POST /auth/signup` - Send verification code
- `POST /auth/login` - Verify code and login
- `POST /auth/logout` - Logout user
- `GET /auth/me` - Get current user
- `POST /auth/update-name` - Update user name

### Todos
- `GET /todos` - Get user's todos
- `POST /todos` - Create todo
- `PUT /todos/{id}` - Update todo
- `PUT /todos/{id}/complete` - Toggle completion
- `DELETE /todos/{id}` - Delete todo

### Categories
- `GET /categories` - Get all categories
- `POST /categories` - Add category
- `DELETE /categories/{name}` - Delete category

### AI Classification
- `POST /classify` - Classify task text

### Email
- `POST /email/send-summary` - Send summary to current user
- `GET /email/scheduler-status` - Check scheduler status

## Development Notes

### Database Schema
- **todos**: `{_id, text, category, priority, dateAdded, completed, user_id}`
- **users**: `{_id, email, first_name, is_verified, verification_code, code_expires_at}`
- **sessions**: `{_id, user_id, token, expires_at}`
- **categories**: `{name}`

### Security Features
- CORS configured for development
- JWT token authentication
- Email verification required
- Sanitized error logging (no SMTP credential exposure)
- Admin-only endpoints for bulk operations

### Deployment Considerations
- Environment variables must be configured
- MongoDB connection required
- SMTP credentials needed for email functionality
- Daily email scheduler runs automatically at 9 AM Eastern
