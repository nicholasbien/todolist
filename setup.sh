#!/bin/bash
set -e

# Todo List App Setup Script (Development)
echo ""
echo "===================================="
echo "  TodoList - Development Setup"
echo "===================================="
echo ""

# ── Helpers ──────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo "ERROR: $1 is required but not installed."
        echo "  $2"
        exit 1
    fi
}

print_version() {
    local name=$1
    local version=$2
    printf "  %-12s %s\n" "$name" "$version"
}

# ── Prerequisites ────────────────────────────────────────────────────────────

echo "Checking prerequisites..."
echo ""

check_command python3 "Install Python 3.11+: https://www.python.org/downloads/"
check_command node    "Install Node.js 18+: https://nodejs.org/"
check_command npm     "npm should come with Node.js"

PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
NODE_VERSION=$(node --version 2>&1)
NPM_VERSION=$(npm --version 2>&1)

print_version "Python:" "$PYTHON_VERSION"
print_version "Node.js:" "$NODE_VERSION"
print_version "npm:" "$NPM_VERSION"

# Check minimum Python version (3.11+)
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)
if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 11 ]); then
    echo ""
    echo "WARNING: Python 3.11+ is recommended. You have $PYTHON_VERSION."
    echo "  Some features may not work correctly with older versions."
fi

# Check minimum Node.js version (18+)
NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo ""
    echo "WARNING: Node.js 18+ is recommended. You have $NODE_VERSION."
fi

echo ""

# ── Backend Setup ────────────────────────────────────────────────────────────

echo "Setting up backend..."

cd backend

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "  Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install Python dependencies
echo "  Installing Python dependencies..."
pip install -r requirements.txt --quiet

# Install pre-commit hooks
echo "  Installing pre-commit hooks..."
pre-commit install > /dev/null 2>&1

# Copy .env.example if .env doesn't exist
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "  Created backend/.env from .env.example"
        echo "  --> Edit backend/.env to add your API keys and secrets"
    fi
else
    echo "  backend/.env already exists (skipping)"
fi

cd "$SCRIPT_DIR"

# ── Frontend Setup ───────────────────────────────────────────────────────────

echo ""
echo "Setting up frontend..."

cd frontend

echo "  Installing npm dependencies..."
npm install --silent 2>&1 | tail -1

cd "$SCRIPT_DIR"

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "===================================="
echo "  Setup complete!"
echo "===================================="
echo ""
echo "Next steps:"
echo ""
echo "  1. Configure environment variables:"
echo "     Edit backend/.env and set at minimum:"
echo "       MONGODB_URL=mongodb://localhost:27017"
echo "       JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
echo "       OPENAI_API_KEY=your-key-here  (for AI features)"
echo ""
echo "  2. Start the development servers:"
echo ""
echo "     Backend:   cd backend && source venv/bin/activate && python app.py"
echo "     Frontend:  cd frontend && npm run dev"
echo ""
echo "  3. Open http://localhost:3000"
echo "     Log in with: test@example.com / code 000000"
echo ""
echo "  See CONTRIBUTING.md for the full development guide."
echo ""
