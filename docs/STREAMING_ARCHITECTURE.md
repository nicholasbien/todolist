# SSE Streaming Architecture

## Overview

The assistant chat uses Server-Sent Events (SSE) for real-time token streaming from the backend AI agent. The frontend connects **directly** to the backend for SSE, bypassing the service worker and Next.js API proxy.

## Why Direct Connection?

The default request flow is:

```
Browser → Service Worker → Next.js API Proxy → Backend
```

This breaks SSE streaming because:
1. **Service worker** intercepts fetch requests and can buffer/modify responses
2. **Next.js API proxy** (`pages/api/[...proxy].js`) uses `await response.text()`, which buffers the entire response before forwarding — tokens arrive all at once instead of streaming

The fix routes SSE requests directly:

```
Browser → Backend (direct EventSource connection)
```

## How It Works

### 1. Service Worker Skip (`frontend/public/sw.js`)

The SW explicitly skips interception for the streaming endpoint:

```javascript
if (isApi && url.pathname === '/agent/stream') {
  return; // Let browser connect directly
}
```

### 2. Streaming URL Helper (`frontend/utils/api.ts`)

```typescript
export function getStreamingBackendUrl(): string {
  return process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
}
```

### 3. EventSource Connection (`frontend/components/AgentChatbot.tsx`)

```typescript
const backendUrl = getStreamingBackendUrl();
const agentUrl = `${backendUrl}/agent/stream?${params.toString()}`;
const es = new EventSource(agentUrl);
```

### 4. Backend SSE Headers (`backend/agent/agent.py`)

```python
headers = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"  # Prevents nginx/proxy buffering
}
return StreamingResponse(generate(), media_type="text/event-stream", headers=headers)
```

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | Frontend (client-side) | Direct backend URL for SSE streaming |
| `BACKEND_URL` | Frontend (server-side) | Backend URL for the Next.js API proxy |

### Production Values (Railway)

```
NEXT_PUBLIC_BACKEND_URL=https://backend-production-e920.up.railway.app
BACKEND_URL=https://backend-production-e920.up.railway.app
```

### Local Development

```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000  (or omit — defaults to localhost:8000)
```

## Security Notes

### What's exposed?

`NEXT_PUBLIC_` env vars are embedded in the client-side JS bundle at build time. Anyone can see the backend URL in browser devtools. This is fine — it's just a URL, not a secret.

### Authentication

The `/agent/stream` endpoint requires a valid JWT Bearer token (`Depends(get_current_user)` in FastAPI). Unauthenticated requests get a 401.

### CORS

The backend currently uses `allow_origins=["*"]`. This allows the cross-origin EventSource connection to work. For production hardening, restrict origins to your domain (`todolist.nyc`).

### Recommended Hardening

1. **Cloudflare reverse proxy** — Add DDoS protection and rate limiting in front of the backend. Use a custom domain like `api.todolist.nyc`.
   - SSE works through Cloudflare but requires `X-Accel-Buffering: no` and `Cache-Control: no-cache` headers (already set).
2. **Restrict CORS origins** — Change `allow_origins=["*"]` to `allow_origins=["https://todolist.nyc"]`.
3. **Rate limit login endpoints** — The `/auth/*` endpoints accept OTP codes and could be brute-forced.
4. **Monitor usage** — Track API request volume to detect abuse early.
