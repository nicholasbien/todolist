#!/bin/bash
# Start both backend and webhook server in same container

echo "[STARTER] Starting combined services..."

# Export webhook config
export WEBHOOK_PORT="${WEBHOOK_PORT:-8081}"
export WEBHOOK_HOST="0.0.0.0"
export NODE_ENV="production"
export MONGODB_URL="${MONGODB_URL}"

# Start backend in background
echo "[STARTER] Starting FastAPI backend on port ${PORT:-8000}..."
cd /app
python3 app.py &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 10

# Start webhook server
echo "[STARTER] Starting webhook server on port ${WEBHOOK_PORT}..."
cd /workspace/scripts
node webhook-server.js &
WEBHOOK_PID=$!

echo "[STARTER] Both services running!"
echo "[STARTER] Backend PID: $BACKEND_PID"
echo "[STARTER] Webhook PID: $WEBHOOK_PID"

# Wait for either to exit
wait -n

# If one exits, kill the other
echo "[STARTER] One service exited, shutting down..."
kill $BACKEND_PID 2>/dev/null
kill $WEBHOOK_PID 2>/dev/null
