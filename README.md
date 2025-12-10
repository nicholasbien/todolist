<img width="397" alt="image" src="https://github.com/user-attachments/assets/7b249e00-9f72-4b39-a37c-47b784470d9f" />
<img width="397" alt="image" src="https://github.com/user-attachments/assets/9b421d87-df1a-41bb-8e6e-f53947b9e044" />



# AI-Powered Collaborative Todo List Application

A modern collaborative todo list application with AI-powered task classification, multi-user spaces, email verification authentication, and daily email summaries. Built with Next.js for the frontend and FastAPI for the backend.

## Features

### Core Functionality
- **AI-powered task classification** using OpenAI GPT-5-nano
- **Multi-user collaboration spaces** - Create shared workspaces and invite team members
- **Email verification authentication** with JWT sessions
- **Space-specific categories** - Each space has its own set of categories
- **Daily email summaries** with AI-generated insights
- **Space-aware AI agent** - Intelligent assistant with tool calling for weather, tasks, journals, and recommendations
- **Customizable email instructions** for personalized summaries
- **Book recommendations** via Open Library integration

### Collaboration Features
- **Default personal spaces** - Every user gets a private "Default" space
- **Shared team spaces** - Create collaborative spaces and invite others by email
- **Real-time collaboration** - Multiple users can work in the same space
- **Access control** - Space ownership and membership management
- **Data isolation** - Complete separation of todos and categories between spaces

### Task Management
- **Category and priority management** with space-specific categories
- **Due date tracking** with upcoming deadlines highlighted in daily summaries
- **Balanced daily email summaries** with structured sections and thoughtful prose, priority focus, and quick wins
- **Day-of-week aware date parsing** for more accurate due dates
- **Link support** - Add a URL as a task and its page title is fetched automatically
- **Progressive Web App (PWA)** - Install on iPhone/Android like a native app
- **Offline functionality** - Works without internet connection

### Technical Features
- **Modern, responsive UI** with Tailwind CSS and Lucide React icons
- **Professional icon library** - Scalable SVG icons with consistent styling throughout the app
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

# Install dependencies (includes lucide-react for icons)
npm install
```

**UI Icons:** The app uses [Lucide React](https://lucide.dev) for all UI icons - a modern, lightweight icon library with scalable SVG icons that inherit Tailwind color classes.

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
- **Offline support** - Full offline functionality for viewing and editing todos

### Offline Functionality Details

The app's service worker provides comprehensive offline support:
- **Static caching** - All app assets (CSS, JS, images) are cached for offline use
- **API response caching** - Todo data is cached and served when offline
- **Background sync** - Changes made offline sync automatically when connection returns
- **Offline-first design** - App works fully without internet connection

**⚠️ IndexedDB Schema Management**: When adding new offline stores (todos, journals, etc.), always increment `DB_VERSION` in `sw.js` to trigger database upgrades for existing users. Failure to do this causes "object store not found" errors.

**📚 Journal Offline System**: Journals follow the same offline-first pattern as todos:
1. **Online caching**: GET /journals requests automatically cache journal data in IndexedDB
2. **Offline creation**: New offline journals get `offline_journal_` prefixed IDs and are stored locally
3. **Sync queue**: All offline operations (create, update, delete) are queued for background sync
4. **ID mapping**: Service worker maintains `offline_journal_id → server_id` mappings
5. **Automatic sync**: When connection returns, offline journals sync to server and get replaced with real server versions

This ensures journals work identically to todos in offline mode - you can create, edit, and view journal entries without internet connection.

**⚠️ Service Worker Updates**: ALWAYS bump cache versions when modifying `sw.js`:
- Increment `STATIC_CACHE` version (e.g., `todo-static-v41` → `todo-static-v42`)
- Increment `API_CACHE` version (e.g., `todo-api-v41` → `todo-api-v42`)
- Increment `DB_VERSION` if changing IndexedDB schema (e.g., `10` → `11`)
- This forces browsers to download and use the updated service worker

**🔄 Adding New Offline Features**: When implementing offline functionality for new data types, follow this established pattern:
1. Add the new store to `openUserDB()` in `sw.js` with `{ keyPath: '_id' }`
2. Create get/put/del functions following the existing naming convention
3. Add offline request handlers with `offline_` prefixed IDs for new items
4. Add sync queue operations (CREATE_X, UPDATE_X, DELETE_X) in `syncQueue()`
5. Add online GET request caching in `handleApiRequest()` to store server data in IndexedDB
6. Increment `DB_VERSION` to trigger database upgrades for existing users

Following this pattern ensures consistent offline behavior across all app features.

**⚠️ Critical for Offline**: The app uses a clean `/api/*` URL pattern with Next.js proxy for optimal PWA architecture:

- **All Environments**: Frontend calls `/api/todos`, `/api/journals`, etc. → Service worker intercepts `/api/*` → Full offline functionality
- **Online**: Service worker forwards `/api/*` requests → Next.js API proxy → Backend
- **Offline**: Service worker serves cached data from IndexedDB

The Next.js API proxy (`pages/api/[...proxy].js`) forwards all API requests to the backend while maintaining same-origin requests for the service worker. This clean architecture eliminates environment-specific logic in the service worker.

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
# Local development - OpenAI key for client-side features
OPENAI_API_KEY=your_openai_api_key

# API URL Configuration (Environment-Aware)
# ⚠️ LEAVE UNSET FOR DEVELOPMENT: This enables offline functionality
# When unset: Uses relative URLs (/todos, /chat) → Service Worker can intercept and cache
# When set: Uses absolute URLs → Direct server calls, no offline caching
#
# Development: Leave commented out for full offline PWA functionality
# Production/Testing: Uncomment and set to your deployed backend URL
# NEXT_PUBLIC_API_URL=https://your-backend-url.com
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
- `POST /api/auth/signup` - Send verification code to email
- `POST /api/auth/login` - Verify code and login
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/update-name` - Update user's first name

### Spaces (Collaboration)
- `GET /api/spaces` - List user's accessible spaces
- `POST /api/spaces` - Create new shared space
- `PUT /api/spaces/{id}` - Rename space (owner only)
- `DELETE /api/spaces/{id}` - Delete space (owner only)
- `POST /api/spaces/{id}/invite` - Invite users to space by email
- `GET /api/spaces/{id}/members` - List member names and emails

### Todos (Space-Aware)
- `GET /api/todos?space_id={id}` - Get todos for specific space
- `POST /api/todos` - Create new todo with space context
- `PUT /api/todos/{id}` - Update todo
- `PUT /api/todos/{id}/complete` - Toggle completion
- `DELETE /api/todos/{id}` - Delete todo

### Categories (Space-Specific)
- `GET /api/categories?space_id={id}` - Get categories for a space
- `POST /api/categories` - Add new category to a space (`{ "name": "Work", "space_id": "..." }`)
- `PUT /api/categories/{name}?space_id={id}` - Rename category within a space
- `DELETE /api/categories/{name}?space_id={id}` - Delete category from a space

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
- `POST /email/update-spaces` - Choose which spaces are included in summaries

#### Daily Email Format
The daily summary emails blend structured scanning with thoughtful prose:

```
Good morning Nicholas,

🎯 Today's Overview
• 2 completed tasks today ✅ | 26 pending tasks 📋 | 5 high priority 🔥

✨ Recent Wins
Congratulations on another mindful step forward! Today, you wrapped up "Buy CRWV" and "Julbo sunglasses"—both essential pieces for your Kilimanjaro adventure. These completions reflect more than just crossing items off a list; they show your commitment to preparing thoughtfully for the challenges ahead.

🔥 Priority Focus (Top 5 most important)
• 🚨 Pick up contacts - Dec 1, 2024 (2 weeks ago)
• ⚡ Carta exercise - Dec 16, 2024 (tomorrow)
• ⚡ Trim toenails - Dec 14, 2024 (yesterday)
• 📅 Clean retainer - high priority
• 📅 Order contacts - high priority

Among the 26 pending tasks, these five high-priority items call for your focus. Taking action on these will help clear your path for upcoming adventures and ensure nothing essential is forgotten as you ready yourself for both personal journeys and meaningful transitions.

⚡ Quick Wins (Tasks that take <15 minutes)
• Trim toenails
• Clean retainer
• Pick up contacts

📊 Insights & Reflection
Finance has been your most productive category over the past 24 hours, reflecting tangible progress in your preparation efforts. Yet don't let the older health-related tasks become burdens on your mind—each small action plants seeds for tomorrow's ease. The momentum you're building with gear and financial planning deserves the same attention to personal care and maintenance.

A monk asked Baso, "What is Buddha?" Baso answered, "No mind, no Buddha."

---

The end of spring--
the poet is brooding
about editors. 🌸
—Anonymous
```

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

## Updating Logo/Icons

The app uses a browser-based HTML canvas script to generate PWA icons. No npm packages required.

### Quick Update

```bash
# 1. Open the HTML icon generator in a browser
open frontend/public/create_icons.html

# 2. The browser will automatically download:
#    - icon-192x192.png
#    - icon-512x512.png

# 3. Move the downloaded files to replace the existing icons
mv ~/Downloads/icon-192x192.png frontend/public/icon-192x192.png
mv ~/Downloads/icon-512x512.png frontend/public/icon-512x512.png

# 4. Update service worker cache version to force PWA icon refresh
# Edit frontend/public/sw.js and increment STATIC_CACHE version
```

### Customizing the Logo

Edit `frontend/public/create_icons.html` to change colors, shapes, or design:

**Current Design Specifications:**
- **Canvas**: 192x192px (scaled to 512x512px for larger icon)
- **Colors**:
  - Background: `#ff7b4a` (orange)
  - Notebook borders: `#000000` (black, 3.5px)
  - Spiral binding: `#000000` (black circles and rings)
  - Unchecked items: `#7f3d25` (brown - opacity blend)
  - Checked item: `#000000` (solid black)
  - Checkbox fill: `#ffb8a3` (pink/salmon)
- **Dimensions**:
  - Notebook: 130x130px with 4px corner radius
  - Spine: 20px width
  - 3D offset: 6px
  - Checkboxes: 18x18px with 2px corner radius
  - Spiral rings: 5 rings with calculated spacing
- **Line thickness**: Borders 3.5px, checkboxes/text 2.5-3.5px, checkmark 2.5px
- **No npm packages required** - just open in browser and it generates the PNGs

The script uses HTML5 Canvas API to draw the notebook icon with all elements positioned using center-based calculations.

### Updating iOS/Capacitor App Icon

After updating the PWA icons, also update the iOS native app icon:

```bash
# The HTML generator now creates a 1024x1024 icon as well
# Copy the 1024x1024 icon to the iOS AppIcon directory (AppIcon-512@2x.png requires 1024x1024)
cp .playwright-mcp/icon-1024x1024.png frontend/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png

# Or if you downloaded manually:
# cp ~/Downloads/icon-1024x1024.png frontend/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png

# Sync changes to iOS
cd frontend
npx cap sync ios

# Rebuild the iOS app in Xcode or via CLI
npx cap run ios  # For simulator
# The updated icon will appear after rebuilding and reinstalling the app
```

**Note**: iOS requires 1024x1024 for the `@2x` icon (the `@2x` suffix means 2x resolution: 512 * 2 = 1024). The HTML generator creates three sizes: 192x192, 512x512, and 1024x1024. After copying the icon, you need to rebuild and reinstall the app for the changes to take effect.

### Updating iOS Splash Screen

The app also has a custom splash screen generator for iOS:

```bash
# 1. Open the splash screen generator
open frontend/public/create_splash.html

# 2. The browser will automatically download splash-2732x2732.png

# 3. Copy to all three iOS splash screen files
cp .playwright-mcp/splash-2732x2732.png frontend/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png
cp .playwright-mcp/splash-2732x2732.png frontend/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png
cp .playwright-mcp/splash-2732x2732.png frontend/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png

# Or if you downloaded manually:
# cp ~/Downloads/splash-2732x2732.png frontend/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png
# (and repeat for -1.png and -2.png)

# 4. Sync and rebuild
cd frontend
npx cap sync ios
npx cap run ios  # For simulator
```

**Splash Design**: Orange background (#ff7b4a) with centered logo (400x400) and "todolist.nyc" in black Georgia serif font below. Matches the app's color scheme and branding.

## License

MIT
