#!/bin/bash

# Todo List App Setup Script (Development)
echo "🚀 Setting up Todo List App for development..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed"
    exit 1
fi

echo "📦 Installing backend dependencies..."
cd backend

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

echo "📦 Installing frontend dependencies..."
cd ../frontend
npm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "🚀 To start development servers:"
echo "Backend:  cd backend && source venv/bin/activate && python app.py"
echo "Frontend: cd frontend && npm run dev"
echo ""
echo "📱 Access the app at http://localhost:3000"