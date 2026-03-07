# Backend URL Change Guide

## Quick Reference

**When changing the backend deployment URL, you only need to edit ONE file:**

```
/backend-config.json
```

## Overview

This project uses a **single source of truth** pattern for backend URLs to make future changes trivial. Instead of hunting through 11+ files, you update the central config and the rest is either automatic or documented below.

## The ONE File to Edit

**`backend-config.json`** (project root)

```json
{
  "environments": {
    "production": {
      "backendUrl": "https://todolist-backend-production-a83b.up.railway.app",
      "frontendUrl": "https://todolist-frontend-production-5d57.up.railway.app"
    },
    "local": {
      "backendUrl": "http://localhost:8000",
      "frontendUrl": "http://localhost:3000"
    }
  }
}
```

**Change the URLs here, commit, push, and redeploy.**

## What Updates Automatically

These files are driven by environment variables or already use the correct URLs:

- ✅ `frontend/utils/api.ts` - Uses `process.env.BACKEND_URL`
- ✅ `frontend/pages/api/[...proxy].js` - Uses `process.env.BACKEND_URL`
- ✅ CLI scripts read from env vars set by `production-env.sh`
- ✅ OpenClaw heartbeat reads from env vars

## Manual Updates Required

After changing `backend-config.json`, you must manually update these:

### 1. Railway Dashboard (Critical!)
- Set `BACKEND_URL` environment variable to new production backend URL
- Found in: Railway Dashboard → Your Service → Variables

### 2. iOS Configuration (if domain changed)
- File: `frontend/ios/App/App/Info.plist`
- Update `WKAppBoundDomains` array with new backend domain

### 3. Environment Shell Scripts
- Update `cli/production-env.sh` export line (reference backend-config.json)
- Update `cli/local-env.sh` if needed
- Update `HEARTBEAT.md` example commands

### 4. OpenClaw Config
- File: `openclaw-config.json` (in project root)
- Update `TODOLIST_API_URL` under mcpServers.todolist.env

### 5. MCP Server Example
- File: `mcp-server/.env.example`
- Update comment showing production URL

### 6. Documentation
- Update `AGENTS.md` if it mentions specific URLs
- Update `OPENCLAW_SETUP.md` example configs
- Update this file's example URLs

## Checklist for Backend URL Change

```bash
# 1. Edit the source of truth
vim backend-config.json

# 2. Update Railway env vars
# Railway Dashboard → todolist-backend-production → Variables → BACKEND_URL

# 3. Update shell scripts (copy from backend-config.json)
vim cli/production-env.sh

# 4. Update OpenClaw config
vim openclaw-config.json

# 5. Update docs/examples
vim mcp-server/.env.example

# 6. Commit and push
git add backend-config.json cli/production-env.sh openclaw-config.json mcp-server/.env.example
git commit -m "chore: update backend URL to new Railway deployment"
git push origin openclaw

# 7. Redeploy
# Railway auto-deploys on push
```

## Testing After Change

```bash
# Check backend health
curl https://YOUR-NEW-BACKEND.railway.app/health

# Check frontend loads
open https://YOUR-NEW-FRONTEND.railway.app

# Test CLI connection
source cli/production-env.sh
node cli/todolist-cli.js list-pending
```

## Troubleshooting

**Frontend shows "Loading..." forever?**
- Check `BACKEND_URL` is set in Railway dashboard
- Check backend health endpoint

**CLI can't connect?**
- Update `cli/production-env.sh` with new URL
- Re-source the file: `source cli/production-env.sh`

**iOS app broken?**
- Update `Info.plist` WKAppBoundDomains
- Rebuild iOS: `cd frontend/ios && pod install && npx cap open ios`

## Files That Should NOT Have Hardcoded URLs

These should use environment variables (already fixed):
- `frontend/.env.production` - Should NOT contain BACKEND_URL (Railway injects it)
- `frontend/utils/api.ts` - Uses `process.env.BACKEND_URL`
- Runtime code should never hardcode production URLs

## Why This Matters

- **DRY Principle**: Don't Repeat Yourself
- **Single Source of Truth**: One place to look, one place to change
- **Reduced Errors**: Fewer places to forget to update
- **Faster Deploys**: Change URL in 1 file vs 11+ files

---

**Remember**: Start with `backend-config.json` - it's your source of truth!
