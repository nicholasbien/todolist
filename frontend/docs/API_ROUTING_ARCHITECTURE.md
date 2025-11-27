# API Routing Architecture & Troubleshooting Guide

## Overview

This document explains the dual-layer API routing system used in this application and how to prevent routing issues in the future.

## Architecture

The app uses a **two-layer routing system** for maximum reliability:

### Layer 1: Service Worker (Primary - 95% of requests)
- **Path**: Frontend → Service Worker → Backend
- **Purpose**: Offline-first PWA functionality with IndexedDB caching
- **Handles**: All API requests when service worker is active
- **Location**: `public/sw.js`

### Layer 2: Next.js API Proxy (Fallback - 5% of requests)
- **Path**: Frontend → Next.js Proxy → Backend
- **Purpose**: Safety net when service worker is unavailable
- **Handles**: Requests when service worker fails/disabled/unsupported
- **Location**: `pages/api/[...proxy].js`

## Service Worker Route Configuration

The service worker intercepts requests based on path matching in two places:

### 1. Capacitor Local Routes (lines 560-570)
```javascript
const isCapacitorLocal = self.location.protocol === 'file:' &&
                        (url.pathname.startsWith('/todos') ||
                         url.pathname.startsWith('/categories') ||
                         url.pathname.startsWith('/spaces') ||
                         url.pathname.startsWith('/journals') ||
                         url.pathname.startsWith('/insights') ||
                         url.pathname.startsWith('/chat') ||
                         url.pathname.startsWith('/auth') ||
                         url.pathname.startsWith('/email') ||
                         url.pathname.startsWith('/contact') ||
                         url.pathname.startsWith('/export'));
```

### 2. General API Routes (lines 571-583)
```javascript
const isApi = (isSameOrigin || isCapacitorLocal) &&
                (url.pathname.startsWith('/todos') ||
                 url.pathname.startsWith('/categories') ||
                 url.pathname.startsWith('/spaces') ||
                 url.pathname.startsWith('/journals') ||
                 url.pathname.startsWith('/insights') ||
                 url.pathname.startsWith('/chat') ||
                 url.pathname.startsWith('/auth') ||
                 url.pathname.startsWith('/email') ||
                 url.pathname.startsWith('/contact') ||
                 url.pathname.startsWith('/export'));
```

## Current Supported API Endpoints

✅ **Currently Intercepted by Service Worker:**
- `/todos` - Todo CRUD operations
- `/categories` - Category management
- `/spaces` - Space collaboration
- `/journals` - Journal entries
- `/insights` - Analytics
- `/chat` - AI chatbot
- `/auth` - Authentication
- `/email` - Email functionality (added 2025-08-29)
- `/contact` - Contact form (added 2025-08-29)
- `/export` - Data export (added 2025-08-29)

## Backend API Endpoints Inventory

Based on `backend/app.py` analysis:

### ✅ **Properly Routed Endpoints:**
- `GET /` - Root endpoint
- `POST /auth/signup` - User signup
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout
- `GET /auth/me` - Get current user
- `POST /auth/update-name` - Update user name
- `GET /todos` - Get todos
- `POST /todos` - Create todo
- `DELETE /todos/{id}` - Delete todo
- `PUT /todos/{id}/complete` - Complete todo
- `PUT /todos/{id}` - Update todo
- `GET /health` - Health check
- `GET /categories` - Get categories
- `POST /categories` - Create category
- `PUT /categories/{name}` - Update category
- `DELETE /categories/{name}` - Delete category
- `GET /spaces` - Get spaces
- `POST /spaces` - Create space
- `POST /spaces/{id}/invite` - Invite to space
- `GET /spaces/{id}/members` - Get space members
- `POST /spaces/{id}/leave` - Leave space
- `PUT /spaces/{id}` - Update space
- `DELETE /spaces/{id}` - Delete space
- `POST /email/send-summary` - Send email summary
- `GET /email/scheduler-status` - Get scheduler status
- `POST /email/update-schedule` - Update email schedule
- `POST /email/update-instructions` - Update email instructions
- `POST /email/update-spaces` - Update email spaces
- `POST /contact` - Contact form submission
- `GET /insights` - Get insights
- `GET /journals` - Get journal entries
- `POST /journals` - Create/update journal entry
- `DELETE /journals/{id}` - Delete journal entry
- `GET /export` - Export data

## Critical Issue: Missing Route Syndrome

### **Problem**
When a new backend endpoint is added but not included in the service worker's route list, requests fail with `404 Not Found` because:

1. Frontend makes request to `/new-endpoint`
2. Service worker doesn't recognize the path
3. Request falls through to Next.js
4. Next.js has no page/API route at `/new-endpoint`
5. Returns 404 error

### **Symptoms**
- `POST http://localhost:3000/endpoint-name 404 (Not Found)` in browser console
- Endpoint works when tested directly against backend
- Works in production if service worker cache is cleared

### **Root Cause**
Service worker route whitelist is not automatically synchronized with backend endpoints.

## Prevention Checklist

### ✅ When Adding New Backend Endpoints

**Step 1: Add Backend Route**
```python
# backend/app.py
@app.post("/new-feature")
async def new_feature_endpoint():
    return {"success": True}
```

**Step 2: Update Service Worker Routes** (CRITICAL!)
```javascript
// public/sw.js - Add to BOTH locations:

// Location 1: isCapacitorLocal check (around line 560)
const isCapacitorLocal = self.location.protocol === 'file:' &&
                        (url.pathname.startsWith('/todos') ||
                         // ... existing routes ...
                         url.pathname.startsWith('/new-feature')); // ADD HERE

// Location 2: isApi check (around line 571)
const isApi = (isSameOrigin || isCapacitorLocal) &&
                (url.pathname.startsWith('/todos') ||
                 // ... existing routes ...
                 url.pathname.startsWith('/new-feature')); // ADD HERE
```

**Step 3: Increment Service Worker Cache Version** (CRITICAL!)
```javascript
// public/sw.js - lines 3-4
const STATIC_CACHE = 'todo-static-v100'; // INCREMENT
const API_CACHE = 'todo-api-v100';       // INCREMENT
```

**Step 4: Test Both Routes**
```bash
# Test service worker route (when SW active)
curl http://localhost:3000/new-feature

# Test proxy fallback (when SW inactive/disabled)
curl http://localhost:3000/api/new-feature
```

### ✅ Service Worker Update Checklist

**Always increment cache versions when modifying `public/sw.js`:**
- Without version bumps, browsers continue using cached old service worker
- Changes won't take effect until cache expires (potentially days/weeks)
- Users will experience broken functionality

**Version Pattern:**
- `STATIC_CACHE = 'todo-static-v99'` → `'todo-static-v100'`
- `API_CACHE = 'todo-api-v99'` → `'todo-api-v100'`

## Testing Strategy

### Manual Testing
```bash
# 1. Start dev servers
npm run dev                    # Frontend (port 3002)
cd backend && python app.py   # Backend (port 8000)

# 2. Test service worker route (primary)
curl http://localhost:3002/endpoint-name

# 3. Test proxy fallback
curl http://localhost:3002/api/endpoint-name
```

### Automated Testing
See `__tests__/ProxyFallbackBasic.test.ts` for examples of:
- Route path parsing logic
- URL building with query parameters
- Environment-based backend selection
- Request body handling

## Common Troubleshooting

### 404 Errors on New Endpoints
1. **Check**: Is endpoint in service worker route list?
2. **Check**: Are cache versions incremented?
3. **Check**: Does proxy handle the route?
4. **Test**: Direct backend request works?

### Service Worker Not Updating
1. **Solution**: Increment cache versions in `public/sw.js`
2. **Browser**: Hard refresh (Cmd+Shift+R)
3. **DevTools**: Application → Service Workers → Update

### Proxy Not Working
1. **Check**: Is `pages/api/[...proxy].js` present?
2. **Check**: Backend URL configuration correct?
3. **Test**: Direct backend connection

## Monitoring & Alerts

### Recommended Monitoring
- Set up alerts for 404 errors on API endpoints
- Monitor service worker registration failures
- Track proxy fallback usage patterns

### Development Workflow
1. **Before deployment**: Test both service worker and proxy routes
2. **After backend changes**: Update service worker routes immediately
3. **Version control**: Always commit SW cache version increments

## Architecture Benefits

### Why This Dual-Layer System?
- **Reliability**: App works even when service worker fails
- **Performance**: 95% of requests use optimized SW with offline caching
- **Compatibility**: Supports older browsers without SW support
- **Development**: Easy debugging by disabling service worker

### Trade-offs
- **Maintenance**: Must keep two route lists synchronized
- **Complexity**: Two different request paths to consider
- **Testing**: Both layers need verification

## Future Improvements

### Potential Enhancements
1. **Auto-sync**: Generate SW routes from backend OpenAPI spec
2. **Validation**: Unit tests that verify route parity
3. **Monitoring**: Runtime checks for missing routes
4. **Documentation**: Auto-generate endpoint documentation

---

## Quick Reference

**Service Worker Routes**: `public/sw.js` lines ~560-583
**Proxy Handler**: `pages/api/[...proxy].js`
**Backend Endpoints**: `backend/app.py`
**Cache Versions**: `public/sw.js` lines 3-4

**Remember**: Every new backend endpoint needs service worker route updates!
