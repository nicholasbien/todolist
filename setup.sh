#!/bin/bash

# TodoList App Setup Script
# Usage:
#   ./setup.sh          — Local development setup (Python + Node)
#   ./setup.sh --docker — Start with Docker Compose
#   ./setup.sh --check  — Validate prerequisites only

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─────────────────────────────────────────────
# .env setup helper
# ─────────────────────────────────────────────
setup_env_files() {
    # Root .env
    if [ ! -f "$SCRIPT_DIR/.env" ]; then
        if [ -f "$SCRIPT_DIR/.env.example" ]; then
            cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
            info "Created .env from .env.example"

            # Auto-generate JWT_SECRET if it's still the placeholder
            if grep -q "JWT_SECRET=change-me" "$SCRIPT_DIR/.env" 2>/dev/null; then
                JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_urlsafe(32))")
                if [ "$(uname)" = "Darwin" ]; then
                    sed -i '' "s|JWT_SECRET=change-me|JWT_SECRET=$JWT_SECRET|" "$SCRIPT_DIR/.env"
                else
                    sed -i "s|JWT_SECRET=change-me|JWT_SECRET=$JWT_SECRET|" "$SCRIPT_DIR/.env"
                fi
                info "Auto-generated JWT_SECRET"
            fi
        fi
    else
        info ".env already exists — skipping"
    fi

    # Backend .env
    if [ ! -f "$SCRIPT_DIR/backend/.env" ]; then
        if [ -f "$SCRIPT_DIR/backend/.env.example" ]; then
            cp "$SCRIPT_DIR/backend/.env.example" "$SCRIPT_DIR/backend/.env"
            info "Created backend/.env from backend/.env.example"

            # Auto-generate JWT_SECRET in backend .env too
            if grep -q "JWT_SECRET=your-jwt-secret-here" "$SCRIPT_DIR/backend/.env" 2>/dev/null; then
                JWT_SECRET=${JWT_SECRET:-$(openssl rand -base64 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_urlsafe(32))")}
                if [ "$(uname)" = "Darwin" ]; then
                    sed -i '' "s|JWT_SECRET=your-jwt-secret-here|JWT_SECRET=$JWT_SECRET|" "$SCRIPT_DIR/backend/.env"
                else
                    sed -i "s|JWT_SECRET=your-jwt-secret-here|JWT_SECRET=$JWT_SECRET|" "$SCRIPT_DIR/backend/.env"
                fi
                info "Auto-generated JWT_SECRET in backend/.env"
            fi
        fi
    else
        info "backend/.env already exists — skipping"
    fi

    # Frontend .env.local
    if [ ! -f "$SCRIPT_DIR/frontend/.env.local" ]; then
        if [ -f "$SCRIPT_DIR/frontend/.env.example" ]; then
            cp "$SCRIPT_DIR/frontend/.env.example" "$SCRIPT_DIR/frontend/.env.local"
            info "Created frontend/.env.local from frontend/.env.example"
        fi
    else
        info "frontend/.env.local already exists — skipping"
    fi
}

# ─────────────────────────────────────────────
# Prerequisites check
# ─────────────────────────────────────────────
check_prerequisites() {
    local has_errors=false

    # Python
    if command -v python3 &>/dev/null; then
        info "Python 3 found: $(python3 --version)"
    else
        error "Python 3 is required but not installed"
        has_errors=true
    fi

    # Node.js
    if command -v node &>/dev/null; then
        info "Node.js found: $(node --version)"
    else
        error "Node.js is required but not installed"
        has_errors=true
    fi

    # MongoDB connectivity (optional for --docker mode)
    if command -v mongosh &>/dev/null; then
        if mongosh --quiet --eval "db.adminCommand('ping')" &>/dev/null; then
            info "MongoDB is running and accessible"
        else
            warn "MongoDB is installed but not running (needed for local dev, not Docker)"
        fi
    else
        warn "mongosh not found — install MongoDB or use --docker mode"
    fi

    # Docker (optional)
    if command -v docker &>/dev/null; then
        info "Docker found: $(docker --version | head -1)"
    else
        warn "Docker not found — install Docker for --docker mode"
    fi

    if $has_errors; then
        error "Missing required prerequisites"
        return 1
    fi

    info "All required prerequisites are met"
    return 0
}

# ─────────────────────────────────────────────
# Docker mode
# ─────────────────────────────────────────────
docker_setup() {
    if ! command -v docker &>/dev/null; then
        error "Docker is required for --docker mode but not installed"
        exit 1
    fi

    setup_env_files

    info "Starting services with Docker Compose..."
    docker compose up --build "$@"
}

# ─────────────────────────────────────────────
# Local development setup
# ─────────────────────────────────────────────
local_setup() {
    echo ""
    info "Setting up TodoList App for local development..."
    echo ""

    # Check prerequisites
    if ! command -v python3 &>/dev/null; then
        error "Python 3 is required but not installed"
        exit 1
    fi
    if ! command -v node &>/dev/null; then
        error "Node.js is required but not installed"
        exit 1
    fi

    # Set up .env files
    setup_env_files

    # Backend setup
    info "Installing backend dependencies..."
    cd "$SCRIPT_DIR/backend"

    if [ ! -d ".venv" ]; then
        info "Creating Python virtual environment..."
        python3 -m venv .venv
    fi

    source .venv/bin/activate
    pip install -r requirements.txt --quiet

    # Install pre-commit hooks if available
    if command -v pre-commit &>/dev/null; then
        pre-commit install 2>/dev/null || true
    fi

    cd "$SCRIPT_DIR"

    # Frontend setup
    info "Installing frontend dependencies..."
    cd "$SCRIPT_DIR/frontend"
    if command -v pnpm &>/dev/null; then
        pnpm install
    else
        npm install
    fi

    cd "$SCRIPT_DIR"

    # MCP server setup
    if [ -d "$SCRIPT_DIR/mcp-server" ]; then
        info "Installing MCP server dependencies..."
        cd "$SCRIPT_DIR/mcp-server"
        npm install --quiet
        npm run build 2>/dev/null || warn "MCP server build failed (non-critical)"
        cd "$SCRIPT_DIR"
    fi

    echo ""
    info "Setup complete!"
    echo ""
    echo "To start development servers:"
    echo "  Backend:  cd backend && source .venv/bin/activate && python app.py"
    echo "  Frontend: cd frontend && npm run dev"
    echo ""
    echo "Access the app at http://localhost:3000"
    echo "Test account: test@example.com / 000000"
    echo ""

    if ! grep -q "OPENAI_API_KEY=." "$SCRIPT_DIR/.env" 2>/dev/null && \
       ! grep -q "OPENAI_API_KEY=." "$SCRIPT_DIR/backend/.env" 2>/dev/null; then
        warn "OPENAI_API_KEY is not set — AI features (classification, assistant) are disabled."
        warn "The app works fully without it. Add your key to .env to enable AI features."
        echo ""
    fi
}

# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────
case "${1:-}" in
    --docker)
        shift
        docker_setup "$@"
        ;;
    --check)
        check_prerequisites
        ;;
    --help|-h)
        echo "Usage: ./setup.sh [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  (none)     Local development setup (Python + Node)"
        echo "  --docker   Start with Docker Compose"
        echo "  --check    Validate prerequisites only"
        echo "  --help     Show this help message"
        ;;
    *)
        local_setup
        ;;
esac
