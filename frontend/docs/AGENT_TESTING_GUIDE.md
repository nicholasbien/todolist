# Python Backend Agent Testing Guide

## Overview

This guide covers testing procedures for the Python backend AI agent implementation (`/agent/stream` endpoint).

## Architecture

The agent runs entirely on the Python FastAPI backend with direct tool integration:

```
Frontend → Python Agent (/agent/stream) → Direct Tools → Backend APIs
```

## Backend Testing

### Unit Tests

The comprehensive test suite is located in `backend/tests/test_agent.py`:

```bash
# Run agent tests
cd backend
pytest tests/test_agent.py -v

# Run all tests
pytest -v
```

### Test Coverage

- **Tool Functions**: All weather, task, and content tools
- **Authentication**: JWT token validation
- **Error Handling**: Invalid inputs and edge cases
- **Integration**: End-to-end agent endpoint testing

## Manual Testing

### Agent Endpoint Testing

```bash
# Test weather functionality
curl "http://localhost:8000/agent/stream?q=weather%20in%20tokyo" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Test task operations
curl "http://localhost:8000/agent/stream?q=add%20task%20test%20item" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Test journal functionality
curl "http://localhost:8000/agent/stream?q=add%20journal%20entry%20test" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Frontend Integration Testing

```bash
# Start both servers
npm run dev          # Frontend on http://localhost:3001
cd ../backend && python app.py  # Backend on http://localhost:8000

# Test via service worker (web browser)
curl "http://localhost:3001/agent/stream?q=hello" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Test Features

### Available Tools
- **Weather**: Current conditions, forecasts, alerts
- **Tasks**: Add, update, list, search tasks
- **Journals**: Add entries, search content
- **Authentication**: JWT-based user sessions

### Error Handling
- Invalid authentication tokens
- Malformed requests
- Tool execution failures
- Network timeouts

## Performance Testing

```bash
# Load testing (requires authorization)
ab -n 100 -c 10 "http://localhost:8000/agent/stream?q=test" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Integration with Frontend

The agent integrates seamlessly with the React frontend via:
- **Service Worker**: Routes `/agent/stream` to backend in web browsers
- **Capacitor**: Direct backend calls in mobile apps
- **Real-time Streaming**: Server-Sent Events for live responses

See `components/AgentChatbot.tsx` for the frontend implementation.

## Migration from TypeScript MCP

The Python backend agent replaced the previous TypeScript MCP implementation:
- **Removed**: Node.js MCP servers, protocol overhead
- **Added**: Direct Python tool functions, better performance
- **Improved**: Simpler debugging, unified error handling

For migration details, see `docs/TYPESCRIPT_MCP_TO_PYTHON_MIGRATION_REFERENCE.md`.
