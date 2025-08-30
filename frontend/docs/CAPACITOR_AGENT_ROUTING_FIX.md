# Capacitor Agent Routing Fix

## Problem

The MCP (Model Context Protocol) agent functionality was implemented as a Next.js API route at `/api/agent/stream` but was not accessible from Capacitor mobile apps, causing agent features to fail on iOS/Android.

## Root Cause

**Incorrect Assumption**: Initially assumed Capacitor apps couldn't access the frontend server and would need backend-only agent implementation.

**Actual Issue**: The `AgentChatbot` component was using relative URLs (`/api/agent/stream`) which resolve to `file:///api/agent/stream` in Capacitor's `file://` protocol context, causing requests to fail.

## Architecture Understanding

### Request Flow Comparison

#### Web Browser (localhost:3000 or app.todolist.nyc)
```
User → AgentChatbot → "/api/agent/stream" (relative)
                  ↓ (same-origin)
Service Worker → Next.js API Route → MCP Servers → Backend/Weather APIs
```

#### Capacitor Mobile Apps
```
User → AgentChatbot → "https://app.todolist.nyc/api/agent/stream" (absolute)
                  ↓ (cross-origin, bypasses service worker)
Production Frontend Server → MCP Servers → Backend/Weather APIs
```

## Solution

### Code Changes

**File**: `components/AgentChatbot.tsx`

```typescript
// BEFORE (broken in Capacitor)
const es = new EventSource(`/api/agent/stream?${params.toString()}`);

// AFTER (works in both web and Capacitor)
const agentUrl = Capacitor.isNativePlatform()
  ? `https://app.todolist.nyc/api/agent/stream?${params.toString()}`
  : `/api/agent/stream?${params.toString()}`;

const es = new EventSource(agentUrl);
```

### Key Insight

Capacitor apps **can** make requests to the production frontend server - they just need absolute URLs instead of relative ones. The frontend server (`app.todolist.nyc`) runs the same Next.js application with MCP functionality.

## Implementation Details

### Platform Detection
```typescript
import { Capacitor } from '@capacitor/core';

// Detects native iOS/Android vs web browser
Capacitor.isNativePlatform()
```

### URL Resolution
- **Web**: `/api/agent/stream` → `http://localhost:3000/api/agent/stream` (dev) or `https://app.todolist.nyc/api/agent/stream` (prod)
- **Capacitor**: `https://app.todolist.nyc/api/agent/stream` → Direct to production frontend server

### Service Worker Behavior
- **Web**: Service worker intercepts and passes `/api/agent` to Next.js (not backend)
- **Capacitor**: No service worker involvement due to cross-origin absolute URLs

## Deployment Architecture

### Production Environment
```
app.todolist.nyc (Frontend - Next.js + MCP)
├── /api/agent/stream ← Agent endpoint
├── pages/api/agent/stream.ts ← MCP implementation
└── src/
    ├── mcp-hub.ts ← MCP client hub
    ├── memory-server.ts ← Task/journal tools
    └── weather-server.ts ← Weather tools

backend-production-e920.up.railway.app (Backend - FastAPI)
├── /todos ← Regular API endpoints
├── /auth
└── ... (other backend routes)
```

### Request Routing by Platform

| Platform | Regular APIs | Agent API |
|----------|--------------|-----------|
| Web Browser | `/todos` → Service Worker → Backend | `/api/agent/stream` → Service Worker → Frontend |
| iOS/Android | `/todos` → Direct to Backend | `/api/agent/stream` → Direct to Frontend |

## Benefits

### ✅ Cross-Platform Compatibility
- Same MCP agent functionality on web and mobile
- No code duplication between platforms
- Consistent user experience

### ✅ Architecture Simplicity
- Single MCP implementation serves all platforms
- No need for separate mobile backend endpoints
- Leverages existing Next.js infrastructure

### ✅ Production Ready
- Works with Railway deployment
- Proper process management and cleanup
- All dependencies available in production

## Testing Verification

### Web Browser
```bash
# Local development
curl http://localhost:3000/api/agent/stream?q=weather

# Production
curl https://app.todolist.nyc/api/agent/stream?q=weather
```

### Capacitor Simulation
```javascript
// This is what Capacitor apps will call
fetch('https://app.todolist.nyc/api/agent/stream?q=weather')
```

## Related Issues Fixed

### 1. Process Leaks
- Added `dispose()` method to `McpHub` class
- Proper cleanup in `pages/api/agent/stream.ts`
- Child process termination on request completion

### 2. Production Dependencies
- Moved `tsx` from `devDependencies` to `dependencies`
- Ensures MCP servers can spawn in production

### 3. Service Worker Routing
- Correct `/api/agent` passthrough for web
- No conflicts with Capacitor absolute URLs

## Migration Path

### Current State: ✅ Working
- Web: Relative URLs → Service Worker → Next.js
- Capacitor: Absolute URLs → Direct to Production Frontend

### Future Enhancement: Python Backend
- Move MCP implementation to FastAPI backend
- All platforms call `/agent/stream` on backend
- Eliminates frontend server dependency for mobile

## Error Prevention

### Common Mistakes to Avoid

1. **❌ Don't** assume Capacitor can't call frontend servers
2. **❌ Don't** try to proxy agent requests through service worker in Capacitor
3. **❌ Don't** use relative URLs in Capacitor for cross-service requests
4. **✅ Do** use platform detection for URL strategy
5. **✅ Do** test both web and mobile URL paths
6. **✅ Do** ensure production frontend has MCP dependencies

### Debugging Tips

- Check `Capacitor.isNativePlatform()` in browser dev tools
- Verify EventSource URLs in network tab
- Monitor Next.js logs for MCP server spawning
- Test with production URLs before mobile deployment

## Conclusion

The fix was conceptually simple but architecturally important: **Capacitor apps can absolutely call the frontend production server**, they just need explicit absolute URLs instead of relative ones. This enables full agent functionality across all platforms without requiring backend reimplementation.

**Total Impact**:
- ✅ Web agent functionality maintained
- ✅ Mobile agent functionality enabled
- ✅ Production deployment compatibility
- ✅ Cross-platform feature parity achieved
