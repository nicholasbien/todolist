# iOS Capacitor Offline Functionality Fix

## Problem

On iOS Capacitor app:
- ❌ Adding todos offline showed "Load failed"
- ❌ Journal editing offline showed flickered "Load failed"
- ❌ Service worker was not intercepting API requests

## Root Cause

API requests were bypassing the service worker by going directly to the backend:

### Before (Broken):
```
App loads from: https://app.todolist.nyc
Service worker at: https://app.todolist.nyc (same origin)
API calls go to: https://backend-production-e920.up.railway.app (DIFFERENT origin!)
                 ↑ Service worker CANNOT intercept cross-origin requests
```

**Service workers can only intercept same-origin requests.** Cross-origin requests bypass the service worker entirely, making offline functionality impossible.

## The Fix

Changed all API requests to use relative URLs (same-origin) so the service worker can intercept them:

### After (Fixed):
```
App loads from: https://app.todolist.nyc
Service worker at: https://app.todolist.nyc
API calls go to: /todos, /journals, /agent/stream (SAME origin!)
                 ↑ Service worker CAN intercept and route to backend
                 ↑ When offline, serves from IndexedDB
```

## Files Changed

### 1. `utils/api.ts`
**Before:**
```typescript
function getApiBaseUrl() {
  if (Capacitor.isNativePlatform()) {
    return CONFIG.PRODUCTION_BACKEND;  // Direct to backend - bypasses SW!
  }
  return '';  // Web uses SW
}
```

**After:**
```typescript
function getApiBaseUrl() {
  // ALWAYS use relative URLs so service worker can intercept
  // Critical for offline functionality on both web and Capacitor
  return '';
}
```

### 2. `components/AgentChatbot.tsx`
**Before:**
```typescript
const clearUrl = Capacitor.isNativePlatform()
  ? `https://backend-production-e920.up.railway.app/agent/history?...`
  : `/agent/history?...`;

const agentUrl = Capacitor.isNativePlatform()
  ? `https://backend-production-e920.up.railway.app/agent/stream?...`
  : `/agent/stream?...`;
```

**After:**
```typescript
// Always use relative URLs for service worker interception
const clearUrl = `/agent/history?${params.toString()}`;
const agentUrl = `/agent/stream?${params.toString()}`;
```

## How It Works

1. **App makes request**: `fetch('/todos')` (relative URL)
2. **Service worker intercepts**: Catches same-origin request
3. **Online**: Service worker routes to `https://backend-production-e920.up.railway.app/todos`
4. **Offline**: Service worker serves from IndexedDB, queues writes for later sync

## Testing Checklist

### iOS Capacitor App
- [ ] Build and deploy updated frontend: `npm run build && npx cap sync ios`
- [ ] Open Xcode and run on device
- [ ] Check console logs for: `📡 Request will be intercepted by service worker`
- [ ] Go offline (airplane mode)
- [ ] Try adding a todo → Should work offline with `offline_` ID
- [ ] Try editing a journal → Should work offline
- [ ] Go back online → Should sync automatically
- [ ] Check that offline todos get replaced with server IDs

### Expected Console Logs (Capacitor)
```
✅ Service worker registered
📱 Registering service worker...
🔗 API Request: todos -> /todos (Capacitor: true, via SW: true)
📡 Request will be intercepted by service worker: /todos
🔗 Service worker routing: https://app.todolist.nyc/todos -> https://backend-production-e920.up.railway.app/todos
```

### Expected Console Logs (Web)
```
✅ Service worker registered
🔗 API Request: todos -> /todos (Capacitor: false, via SW: true)
📡 Request will be intercepted by service worker: /todos
```

## Important Notes

### Service Worker in Capacitor Server Mode
- ✅ **WORKS**: Your config uses `server.url: 'https://app.todolist.nyc'`
- ✅ Service worker is supported when loading from HTTPS origin
- ✅ iOS 14.5+ supports service workers in WKWebView
- ⚠️ Service worker must be registered successfully (check logs)

### Why This Approach Works
1. **Same-origin requests**: Service worker can intercept
2. **Service worker routing**: SW detects environment and routes correctly:
   - `protocol === 'file:'` → Capacitor → Route to production backend
   - `hostname.endsWith('todolist.nyc')` → Production → Route to production backend
   - Otherwise → Development → Route to localhost:8141

### Fallback Safety
- If service worker fails to load, requests still go to backend (online only)
- Service worker registration errors are logged to console
- Next.js proxy still works as ultimate fallback

## Troubleshooting

### If offline still doesn't work on iOS:

1. **Check service worker registration**:
   ```typescript
   if (navigator.serviceWorker?.controller) {
     console.log('✅ Service worker active');
   } else {
     console.log('❌ No service worker - offline won't work');
   }
   ```

2. **Check IndexedDB**:
   - Safari Developer Tools → Storage → IndexedDB
   - Should see databases for user

3. **Check service worker status**:
   - Safari Developer Tools → Service Workers
   - Should show active service worker from `https://app.todolist.nyc`

4. **Clear caches and reinstall**:
   - Delete app from device
   - Rebuild and reinstall
   - Service worker will freshly install

### Common iOS Issues
- **Cache cleared too aggressively**: iOS may clear IndexedDB/caches more than browsers
- **Background limits**: iOS restricts background service worker activity
- **WKWebView quirks**: Some APIs behave differently than Safari

## Migration Notes

No database changes needed - this is purely a client-side routing fix.

Existing offline data in IndexedDB will continue to work correctly.
