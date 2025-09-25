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

# Install pre-commit hooks
pre-commit install
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

### Test Account for Quick Testing

The system includes a built-in test account that bypasses email verification for rapid testing:

**Test Credentials:**
- **Email**: `test@example.com`
- **Code**: `000000`

**Usage:**
```bash
# Instant login without email verification
curl -H "Content-Type: application/json" \
     -d '{"email": "test@example.com", "code": "000000"}' \
     http://localhost:8000/auth/login
```

This test account:
- Works on any server without environment configuration
- Automatically creates the user and default space on first use
- Bypasses the normal email verification flow
- Perfect for agent testing, CI/CD, and development

### Frontend Tests
```bash
cd frontend

# Run all tests
npm test

# Run specific test suites
npm test -- AppMain.test.tsx                     # Component tests
npm test -- AuthForm.test.tsx                    # Auth form tests
npm test -- ServiceWorkerSync.test.ts            # Service worker tests

# Run tests with coverage
npm test -- --coverage

# Run tests in watch mode
npm test -- --watch
```

**Test Structure:**
- `__tests__/AppMain.test.tsx` - Main app component tests
- `__tests__/AuthForm.test.tsx` - Authentication form tests
- `__tests__/ServiceWorkerSync.test.ts` - Comprehensive service worker tests (13 tests)
- `docs/ServiceWorkerTests.md` - Detailed test documentation

**Service Worker Tests Cover:**
- Todo operations (CREATE, UPDATE, COMPLETE, DELETE)
- Category operations (CREATE_CATEGORY, DELETE_CATEGORY)
- User isolation (multi-account support)
- Authentication & security
- Error handling & resilience
- Integration workflows

### Backend Tests

**✅ SIMPLIFIED**: Backend tests now run standalone with mock databases - no server startup required!

```bash
cd backend
source venv/bin/activate

# Install test dependencies first
pip install -r requirements.txt

# Run all pytest tests (automated with mock database)
pytest

# Run specific test files
pytest tests/test_auth.py -v                     # Authentication tests
pytest tests/conftest.py -v                      # Test configuration

# Run specific test categories
pytest tests/test_auth.py::TestAuthentication -v # Basic auth tests only

# Run with coverage
pytest --cov=. --cov-report=term-missing

# Run with verbose output when tests fail
pytest -v --tb=short

# Run manual tests (require interactive input and real server)
python manual_tests/auth_manual.py
python manual_tests/email_manual.py  # Only if SMTP configured
```

**Test Structure:**
- `tests/test_auth.py` - Authentication system tests (11 tests covering signup, login, sessions)
- `tests/conftest.py` - Pytest configuration with async fixtures and mock database setup
- `manual_tests/auth_manual.py` - Manual authentication testing
- `manual_tests/email_manual.py` - Manual email system testing

**Test Coverage:**
- Email verification workflows (with mock SMTP in tests)
- JWT token management and session handling
- User authentication endpoints and error handling
- User isolation (multi-tenant functionality)
- Integration workflows with database operations

**Key Test Features:**
- **Mock Database**: All tests use `AsyncMongoMockClient` for isolated, fast testing
- **Async Support**: Proper `pytest-asyncio` fixtures with function-scoped event loops
- **Event Loop Safety**: Database connections are reset per test to avoid event loop conflicts
- **Email Mocking**: SMTP operations run in thread pools and are mocked for tests

**⚠️ IMPORTANT FOR AI AGENTS**:
- **DO NOT RUN** files in `manual_tests/` directory - they require interactive input or SMTP connections
- Tests are fully automated and use mock databases - no external dependencies required
- All 11 authentication tests should pass without any setup
- Use `pytest --tb=short` for concise output in agent environments
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

## Deployment

### Railway Deployment
A deployment script is available but should **NOT** be run by AI agents:

```bash
# HUMAN USE ONLY - DO NOT RUN AS AI AGENT
./deploy.sh
```

The script deploys both backend and frontend services to Railway. Manual deployment steps:

1. Ensure Railway CLI is installed and authenticated
2. Configure environment variables in Railway dashboard
3. Run deployment script from project root

### Deployment Considerations
- Environment variables must be configured in Railway dashboard
- MongoDB connection required
- SMTP credentials needed for email functionality
- Daily email scheduler runs automatically at 9 AM Eastern
- Backend has restart policy ON_FAILURE for automatic recovery

## Agent Definitions

### pwa-app-store-converter

**Purpose**: Converts existing Next.js/React PWA applications to native app store packages for iOS and Android distribution.

**Description**: This agent specializes in transforming Progressive Web Apps (PWAs) into native app store packages without requiring code rewrites. It uses TWA (Trusted Web Activity) for Android Play Store deployment and Capacitor wrapper for iOS App Store deployment, providing a fast path to native app distribution.

**Key Capabilities**:
- **PWA Assessment**: Audits existing PWAs for app store readiness using Lighthouse and PWA quality criteria
- **Android TWA Packaging**: Implements Trusted Web Activity wrapper for Google Play Store deployment
- **iOS Capacitor Wrapping**: Creates Capacitor-based iOS app bundles for App Store submission
- **Store Asset Generation**: Creates required icons, screenshots, and metadata for both app stores
- **Performance Optimization**: Enhances PWAs for mobile app experience with caching strategies and mobile-specific optimizations
- **App Store Submission**: Guides through Google Play Console and App Store Connect submission processes

**Technical Stack**:
- **Android**: Trusted Web Activity (TWA) with Bubblewrap CLI
- **iOS**: Capacitor framework for native wrapper
- **PWA Tools**: Lighthouse auditing, Workbox for service workers
- **Build Tools**: Android Studio/Gradle for APK/AAB, Xcode for iOS archives

**Advantages Over Native Development**:
- **Zero Code Rewrite**: 100% code reuse from existing PWA
- **Fast Implementation**: 3-4 weeks vs 10-16 weeks for React Native conversion
- **Single Codebase Maintenance**: Web updates automatically reflect in mobile apps
- **Lower Development Cost**: Minimal resources required for native presence
- **Instant Updates**: No app store approval needed for web functionality updates

**Use Cases**:
- Converting existing PWAs to native app store presence
- Rapid mobile app deployment for web-first applications
- Maintaining web development velocity while gaining native distribution
- Teams wanting app store presence without native development complexity

**Deliverables**:
- App store-ready Android APK/AAB packages
- iOS app archives ready for App Store Connect
- Store listing assets (icons, screenshots, descriptions)
- PWA optimization recommendations and implementations
- Submission guidance and app store compliance verification

**Timeline**: Typically 3-4 weeks from PWA assessment to app store submission, significantly faster than traditional native development approaches.
