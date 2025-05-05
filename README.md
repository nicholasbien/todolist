# AI-Powered Todo List Application

A modern todo list application with AI-powered task classification. Built with Next.js for the frontend and FastAPI for the backend.

## Features

- AI-powered task classification
- Drag-and-drop task organization
- Category management
- Priority levels
- Modern, responsive UI

## Prerequisites

- Node.js (v14 or later)
- Python (v3.8 or later)
- OpenAI API key

## Project Structure

```
.
├── components/           # Frontend React components
│   └── AIToDoListApp.jsx
├── pages/               # Next.js pages
│   └── api/
│       └── classify.js
├── backend/             # Python FastAPI backend
│   ├── app.py
│   └── classify.py
├── requirements.txt     # Python dependencies
└── .env                 # Environment variables
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

## Environment Variables

Create a `.env` file in both the root directory (for frontend) and backend directory with:

```
OPENAI_API_KEY=your_api_key_here
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