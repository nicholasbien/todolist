# AI-Powered Todo List Application

A modern todo list application with AI-powered task classification. Built with Next.js for the frontend and FastAPI for the backend.

## Features

- AI-powered task classification
- Drag-and-drop task organization
- Category management
- Priority levels
- Modern, responsive UI
- **Progressive Web App (PWA)** - Install on iPhone/Android like a native app
- **Offline functionality** - Works without internet connection
- **Cross-platform** - Same codebase works on desktop, mobile web, and as installed app

## Prerequisites

- Node.js (v14 or later)
- Python (v3.8 or later)
- OpenAI API key

## Project Structure

```
.
├── frontend/
│   ├── components/           # Frontend React components
│   │   └── AIToDoListApp.jsx
│   └── pages/                # Next.js pages
├── backend/                  # Python FastAPI backend
│   ├── app.py
│   └── classify.py
├── requirements.txt          # Python dependencies
└── .env                      # Environment variables
```

## Setup Instructions

### 1. Frontend Setup

```bash
# Install dependencies
npm install

# Create a .env.local file in the root directory
echo "OPENAI_API_KEY=your_api_key_here" > .env.local
```

### 2. Backend Setup

```bash
# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# Create a .env file in the backend directory
echo "OPENAI_API_KEY=your_api_key_here" > backend/.env
```

## Running the Application

### 1. Start the Backend Server

```bash
# Make sure you're in the virtual environment
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Navigate to the backend directory
cd backend

# Start the FastAPI server
python app.py
```

The backend server will run on `http://localhost:8000`

### 2. Start the Frontend Development Server

```bash
# In a new terminal, from the project root
npm run dev
```

The frontend will be available at `http://localhost:3000`

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

### Local Development

#### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000  # For local development
# NEXT_PUBLIC_API_URL=https://your-backend-tunnel.loca.lt  # For PWA testing
```

#### Backend (.env)
```bash
OPENAI_API_KEY=your_api_key_here
MONGODB_URL=mongodb://localhost:27017  # Optional, defaults to localhost
```

### Production (Railway)

#### Frontend Service
No environment variables needed - frontend calls backend via relative URLs

#### Backend Service
```bash
OPENAI_API_KEY=your_api_key_here
MONGODB_URL=mongodb+srv://user:pass@cluster.mongodb.net/todo_db
```

Replace `your_api_key_here` with your actual OpenAI API key.

## API Endpoints

- `POST /api/classify`
  - Request body: `{ "text": "task description" }`
  - Response: `{ "category": "category name", "priority": "High/Medium/Low" }`

## Troubleshooting

1. If you encounter CORS issues:
   - Make sure both servers are running
   - Check that the backend CORS settings in `app.py` are correct

2. If the AI classification isn't working:
   - Verify your OpenAI API key is correctly set in both `.env` files
   - Check the backend console for any error messages

## License

MIT
