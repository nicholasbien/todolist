<img width="397" alt="image" src="https://github.com/user-attachments/assets/7b249e00-9f72-4b39-a37c-47b784470d9f" />
<img width="397" alt="image" src="https://github.com/user-attachments/assets/9b421d87-df1a-41bb-8e6e-f53947b9e044" />



# AI-Powered Collaborative Todo List Application

A modern collaborative todo list application with AI-powered task classification, multi-user spaces, email verification authentication, and daily email summaries. Built with Next.js for the frontend and FastAPI for the backend.

## Features

### Core Functionality
- **AI-powered task classification** using OpenAI GPT-4.1-nano
- **Multi-user collaboration spaces** - Create shared workspaces and invite team members
- **Email verification authentication** with JWT sessions
- **Space-specific categories** - Each space has its own set of categories
- **Daily email summaries** with AI-generated insights
- **Space-aware summaries and chatbot** - Emails and chat responses organize todos by space
- **Customizable email instructions** for personalized summaries

### Collaboration Features
- **Default personal spaces** - Every user gets a private "Default" space
- **Shared team spaces** - Create collaborative spaces and invite others by email
- **Real-time collaboration** - Multiple users can work in the same space
- **Access control** - Space ownership and membership management
- **Data isolation** - Complete separation of todos and categories between spaces

### Task Management
- **Category and priority management** with space-specific categories
- **Due date tracking** with upcoming deadlines highlighted in daily summaries
- **Day-of-week aware date parsing** for more accurate due dates
- **Link support** - Add a URL as a task and its page title is fetched automatically
- **Progressive Web App (PWA)** - Install on iPhone/Android like a native app
- **Offline functionality** - Works without internet connection

### Technical Features
- **Modern, responsive UI** with Tailwind CSS
- **Comprehensive testing** with pytest and manual testing
- **Legacy data migration** - Automatic migration of existing data to space system

## Prerequisites

- Node.js (v18 or later)
- Python (v3.9 or later)
- MongoDB (local or cloud)
- OpenAI API key
- SMTP credentials (for email functionality)

## Quick Setup

Run the automated setup script:

```bash
./setup.sh
```

Then configure your environment variables (see below) and start the servers.

## Project Structure

```
.
├── frontend/                 # Next.js React frontend
│   ├── components/           # React components
│   │   ├── AIToDoListApp.tsx # Main todo and spaces interface
│   │   └── AuthForm.jsx      # Login/signup form
│   ├── context/             # Authentication context
│   ├── pages/               # Next.js pages
│   └── public/              # PWA assets and service worker
├── backend/                 # FastAPI Python backend
│   ├── app.py               # Main FastAPI application
│   ├── auth.py              # Authentication system
│   ├── spaces.py            # Multi-user space collaboration
│   ├── todos.py             # Space-aware todo CRUD operations
│   ├── categories.py        # Space-specific category management
│   ├── classify.py          # AI task classification
│   ├── email_summary.py     # Daily email summaries
│   ├── scheduler.py         # Background job scheduling
│   ├── tests/               # Automated pytest tests
│   │   ├── test_spaces.py   # Space collaboration tests
│   │   └── test_space_categories.py # Space-specific category tests
│   └── manual_tests/        # Manual interactive tests
├── setup.sh                 # Automated setup script
└── deploy.sh                # Railway deployment script
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

## Testing

### Automated Tests (Pytest)
**✅ Simplified**: Tests now run standalone with mock databases - no server required!

```bash
cd backend
source venv/bin/activate

# Run all automated tests (11 authentication tests with mock database)
pytest

# Run with coverage
pytest --cov=. --cov-report=term-missing

# Run specific test categories
pytest tests/test_auth.py -v                     # All auth tests
pytest tests/test_auth.py::TestAuthentication -v # Basic auth tests only
pytest -m "not integration" -v                   # Skip integration tests

# Verbose output for debugging
pytest -v --tb=short
```

**Key Test Features:**
- **Mock Database**: All tests use `AsyncMongoMockClient` for fast, isolated testing
- **Async Support**: Proper `pytest-asyncio` fixtures with event loop safety
- **Email Mocking**: SMTP operations are mocked for testing
- **No External Dependencies**: Tests run without MongoDB or SMTP server

### Manual Tests
```bash
cd backend
source venv/bin/activate

# Interactive authentication test
python manual_tests/auth_manual.py

# Email functionality test (requires SMTP config)
python manual_tests/email_manual.py
```

### Linting and Code Quality
```bash
cd backend
source venv/bin/activate

# Pre-commit hooks run automatically on commit
# Run manually on all files:
pre-commit run --all-files

# Individual tools:
flake8 .      # Style checking
black .       # Code formatting
isort .       # Import sorting
mypy .        # Type checking
```

## PWA (Progressive Web App) Setup

This application is configured as a PWA and can be installed on mobile devices like a native app.

### Installing on iPhone/iPad

1. **Deploy with HTTPS** (required for PWA):
   ```bash
   # Option 1: Quick testing with localtunnel
   npx localtunnel --port 3000  # Frontend tunnel
   npx localtunnel --port 8000  # Backend tunnel

   # Update frontend/.env.local with backend tunnel URL:
   NEXT_PUBLIC_API_URL=https://your-backend-tunnel.loca.lt
   ```

2. **On iPhone**: Open Safari → Go to your HTTPS URL
3. **Install**: Tap Share button → "Add to Home Screen"
4. **App launches fullscreen** like a native app!

### PWA Features Included

- **App Manifest** (`public/manifest.json`) - Defines app metadata and icons
- **Service Worker** (`public/sw.js`) - Enables offline functionality and caching
- **App Icons** - Custom 192x192 and 512x512 icons with checkmark design
- **iOS Safari optimization** - Proper meta tags for iOS home screen installation
- **Offline support** - Basic caching allows app to load without internet

## Production Deployment with Railway

This application is configured for easy deployment on Railway with separate frontend and backend services.

### Deployment Files Added

- `backend/railway.json` - Backend service configuration
- `backend/Procfile` - Process definition for backend
- `backend/runtime.txt` - Python version specification
- `frontend/railway.json` - Frontend service configuration
- `frontend/nixpacks.toml` - Node.js build configuration
- `frontend/.eslintrc.json` - ESLint configuration for build process

### Railway Deployment Steps

1. **Connect Repository**: Link your GitHub repo to Railway

2. **Create Two Services**:
   - **Backend Service**:
     - Set Root Directory: `backend`
     - Railway auto-detects Python and uses `railway.json` config
   - **Frontend Service**:
     - Set Root Directory: `frontend`
     - Railway auto-detects Node.js and uses Nixpacks for build

3. **Environment Variables**:
   - **Backend Service**:
     ```
     OPENAI_API_KEY=your_api_key_here
     MONGODB_URL=mongodb+srv://user:pass@cluster.mongodb.net/todo_db
     ```
   - **Frontend Service**: No environment variables needed

4. **Database Setup**:
   - Option A: Add Railway MongoDB service, copy connection URL to `MONGODB_URL`
   - Option B: Use MongoDB Atlas free tier, set connection string as `MONGODB_URL`

5. **Deploy**: Both services deploy automatically on git push

### Deployment Configuration Details

- **Backend** (`backend/railway.json`):
  - Uses Nixpacks builder
  - Installs dependencies: `pip install -r requirements.txt`
  - Starts with: `python app.py` (automatically uses Railway's PORT)
  - Restart policy: ON_FAILURE

- **Frontend** (`frontend/railway.json` + `nixpacks.toml`):
  - Uses Node.js 18
  - Installs: `npm install`
  - Builds: `npm run build`
  - Starts: `npm start`

### Alternative Deployment Options

For other hosting platforms:
- **Frontend**: Vercel, Netlify, or GitHub Pages
- **Backend**: Render, DigitalOcean, or Heroku
- **Database**: MongoDB Atlas (cloud) instead of local MongoDB

## Environment Variables

### Backend (.env)
```bash
# Required
OPENAI_API_KEY=your_openai_api_key
JWT_SECRET=your_jwt_secret_key

# Database (optional, defaults to localhost)
MONGODB_URL=mongodb://localhost:27017

# Email (required for authentication and daily summaries)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
FROM_EMAIL=your_email@gmail.com
SMTP_PASSWORD=your_app_password

# Optional
ADMIN_EMAIL=your_email@gmail.com
# Public URL of your site for invite links
WEBSITE_URL=https://your-site-url.com
```

### Frontend (.env.local)
```bash
# Local development uses a proxy to http://localhost:8000
OPENAI_API_KEY=your_openai_api_key
# NEXT_PUBLIC_API_URL=https://your-backend-tunnel.loca.lt
```

### Generating JWT Secret
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Gmail App Password Setup
1. Enable 2-factor authentication on your Gmail account
2. Go to Google Account settings → Security → 2-Step Verification → App passwords
3. Generate an app password and use it as `SMTP_PASSWORD`

## API Endpoints

### Authentication
- `POST /auth/signup` - Send verification code to email
- `POST /auth/login` - Verify code and login
- `POST /auth/logout` - Logout user
- `GET /auth/me` - Get current user info
- `POST /auth/update-name` - Update user's first name

### Spaces (Collaboration)
- `GET /spaces` - List user's accessible spaces
- `POST /spaces` - Create new shared space
- `PUT /spaces/{id}` - Rename space (owner only)
- `DELETE /spaces/{id}` - Delete space (owner only)
- `POST /spaces/{id}/invite` - Invite users to space by email

### Todos (Space-Aware)
- `GET /todos?space_id={id}` - Get todos for specific space
- `POST /todos` - Create new todo with space context
- `PUT /todos/{id}` - Update todo
- `PUT /todos/{id}/complete` - Toggle completion
- `DELETE /todos/{id}` - Delete todo

### Categories (Space-Specific)
- `GET /categories?space_id={id}` - Get categories for a space
- `POST /categories` - Add new category to a space (`{ "name": "Work", "space_id": "..." }`)
- `PUT /categories/{name}?space_id={id}` - Rename category within a space
- `DELETE /categories/{name}?space_id={id}` - Delete category from a space

### AI Classification - now handled fully on the backend as part of adding task
Todos are automatically classified when created. You can also use
the manual endpoint if needed:
- `POST /classify` - Classify task text
  - Request: `{ "text": "task description" }`
  - Response: `{ "category": "Work", "priority": "High", "text": "cleaned task", "dueDate": "2024-06-10" }`

### Email
- `POST /email/send-summary` - Send daily summary to current user
- `GET /email/scheduler-status` - Check scheduler status
- `POST /email/update-instructions` - Set custom instructions for summaries

## Deployment

### Railway Deployment
```bash
# Deploy both services
./deploy.sh
```

### Manual Railway Setup
1. Create backend service with root directory: `backend`
2. Create frontend service with root directory: `frontend`
3. Configure environment variables in Railway dashboard
4. Deploy automatically on git push

## Troubleshooting

### Common Issues

1. **CORS errors**: Ensure both servers are running and CORS is configured correctly in `app.py`

2. **AI classification not working**:
   - Verify OpenAI API key in backend `.env`
   - Check backend console for errors

3. **Authentication issues**:
   - Ensure JWT_SECRET is set in backend `.env`
   - Check that SMTP credentials are configured for email verification

4. **Email not sending**:
   - Verify SMTP settings in backend `.env`
   - Check Gmail app password setup
   - Verification codes are printed to backend console for testing

5. **Database connection issues**:
   - Ensure MongoDB is running (local) or connection string is correct (cloud)
   - Check MONGODB_URL in backend `.env`

6. **Tests failing**:
   - All automated tests use mock databases and should pass without setup
   - Run `pytest -v --tb=short` for detailed error output
   - Manual tests require interactive input and a running server

## License

MIT
