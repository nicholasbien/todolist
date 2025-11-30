# AI Agent Architecture Documentation

## Overview
The AI agent system provides intelligent assistance for task management, weather queries, and content search through a streaming interface. It was migrated from a Node.js MCP (Model Context Protocol) implementation to a pure Python backend for better performance and maintainability.

## Architecture Components

### Backend Agent Module (`/backend/agent/`)
```
agent/
├── __init__.py      # Package exports
├── agent.py         # FastAPI router with streaming SSE endpoint
├── schemas.py       # Pydantic models and OpenAI function schemas
└── tools.py         # Direct tool implementations
```

### Core Technologies
- **FastAPI**: Streaming Server-Sent Events (SSE) endpoint
- **OpenAI GPT-4.1**: Chat completions with function calling
- **Pydantic**: Request/response validation and OpenAI schema generation
- **MongoDB**: Direct database access via existing backend functions

## Agent Endpoint

### `/agent/stream` (GET)
Streaming SSE endpoint that provides real-time AI responses with tool execution.

**Parameters:**
- `q` (string, required): User query
- `space_id` (string, optional): Space context for operations
- Requires JWT authentication via `Depends(verify_session)`

**Response Events:**
- `ready`: Agent initialized with available tools
- `token`: Streaming text response tokens
- `tool_result`: Results from executed tools
- `done`: Response completion
- `error`: Error messages

## Available Tools

### Task Management Tools
1. **add_task**: Create new todos with category/priority
2. **list_tasks**: Retrieve tasks with optional completion filter
3. **update_task**: Modify task text, priority, or completion status

### Content Tools
4. **add_journal_entry**: Create/update journal entries by date
5. **search_content**: Search through tasks and journal entries

### Weather Tools
6. **get_current_weather**: Current conditions for any location
7. **get_weather_forecast**: Multi-day forecast (1-5 days)

## Implementation Details

### Tool Execution Pipeline
1. **Request Processing**: User query triggers GPT-4.1 with function calling
2. **Streaming Response**: Tokens streamed in real-time via SSE
3. **Tool Call Detection**: Parse function calls from streaming chunks
4. **Tool Execution**: Direct calls to backend functions with Pydantic validation
5. **Result Streaming**: Tool results sent as SSE events

### Direct Database Integration
Tools directly access MongoDB through existing backend functions:
- `get_todos()` for task retrieval
- `create_todo()` for task creation
- `update_todo_fields()` for task updates
- `create_journal_entry()` for journal operations

### Cross-Platform Routing
- **Web**: `/agent/stream` → Service Worker → Backend
- **Capacitor**: Direct to production backend URL

## Key Benefits Over Previous MCP Architecture

### Performance Improvements
- ❌ **Eliminated**: Node.js subprocess overhead
- ❌ **Eliminated**: IPC communication between processes
- ✅ **Added**: Direct function calls within Python backend
- ✅ **Added**: Single-process architecture

### Reliability Improvements
- ❌ **Eliminated**: Process leak potential
- ❌ **Eliminated**: tsx production dependency
- ✅ **Added**: Unified error handling
- ✅ **Added**: Better debugging and logging

### Maintainability Improvements
- ❌ **Eliminated**: Multi-language codebase complexity
- ❌ **Eliminated**: MCP protocol overhead
- ✅ **Added**: Pure Python implementation
- ✅ **Added**: Consistent with existing backend patterns

## Error Handling

### Tool Execution Errors
Tools return structured error responses:
```json
{
  "ok": false,
  "error": "Description of what went wrong"
}
```

### Authentication Errors
Missing or invalid JWT tokens return `422 Unprocessable Entity` with validation details.

### Streaming Errors
Connection or OpenAI API errors are sent as `error` SSE events.

## Configuration

### Required Environment Variables
- `OPENAI_API_KEY`: OpenAI API access key
- Standard FastAPI/MongoDB configuration

### OpenAI Settings
- Model: `gpt-4.1`
- Temperature: `0.7`
- Streaming: `true`
- Tools: All 8 agent tools with function calling

## Testing

### Live Verification
The system has been tested with real user sessions:
- Weather queries: "what is the weather in New York" ✅
- Task queries: "what todos are due today" ✅
- Tool execution: Weather, task listing, and search tools ✅
- Streaming: Real-time token delivery ✅

### Backend Logs
Successful requests show:
```
INFO: GET /agent/stream?q=...&space_id=...&token=... HTTP/1.1 200 OK
INFO: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
```

## Migration Summary

Successfully migrated from Node.js MCP servers to Python backend implementation:
- **Before**: Frontend → Node.js subprocess → Python backend
- **After**: Frontend → Python backend (direct)

This elimination of the middle layer resulted in improved performance, reliability, and maintainability while preserving all existing functionality.
