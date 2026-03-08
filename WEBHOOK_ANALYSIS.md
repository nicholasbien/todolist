## Webhook System Evaluation - CRITICAL BUGS FOUND

### 🔴 FINDING: KEEP but FIX immediately

The webhook system is **fundamentally broken** in 3 key areas:

---

## **CRITICAL BUG #1: Environment Variables Lost**
**File:** `scripts/subagent-integration.js` (line ~232)

The `postMessageToTodolist` function does NOT pass environment variables:
```javascript
execSync(
  `node "${cliPath}" post-message -s ${sessionId} -c "..."`,
  { stdio: 'pipe', timeout: 15000 }  // ❌ NO env vars!
);
```

**Impact:** Webhook claims session but cannot post responses - they fail silently.

**Fix:**
```javascript
{ stdio: 'pipe', timeout: 15000, env: { ...process.env } }
```

---

## **CRITICAL BUG #2: Config Template Not Resolved**
**File:** `openclaw-config.json`

Has literal template string instead of actual token:
```json
"TODOLIST_AUTH_TOKEN": "${TODOLIST_AUTH_TOKEN}"
```

This doesn't get expanded - it's literally the string `${TODOLIST_AUTH_TOKEN}`.

**Fix:** Use actual token value or load from env at runtime.

---

## **CRITICAL BUG #3: Wrong Backend Config**

The webhook server and config point to old test backend (`todolist-backend-production-a83b`) while production is now at `backend-openclaw`.

---

## **Root Cause Analysis:**

| Step | What Happens | Status |
|------|--------------|--------|
| 1. `session.created` webhook fires | ✅ Works |
| 2. `claimSessionCli()` claims session | ✅ Works |
| 3. `spawnSubagentForSession()` spawns Codex | ✅ Works |
| 4. **Codex completes work** | ✅ Works |
| 5. **`postMessageToTodolist()` posts results** | ❌ **FAILS** - no env vars |
| 6. Session appears "claimed but no response" | Result |

---

## **Recommendation:**

**DO NOT REMOVE** the webhook - it's architecturally sound. Just fix these bugs:

1. **Immediate fix** (5 min): Add `env: { ...process.env }` to execSync
2. **Config fix**: Hardcode correct values or use actual env loading
3. **Monitoring**: Add better error logging to catch posting failures

---

## **Current Workaround:**
I (Marlin) am acting as a **manual webhook** - checking sessions via CLI with proper env vars, claiming, and responding directly. 

This proves the **todolist backend is fine** - the issue is just the webhook's environment handling.

---

## **To Fix:**
```bash
# 1. Edit scripts/subagent-integration.js line ~232
# Change: { stdio: 'pipe', timeout: 15000 }
# To: { stdio: 'pipe', timeout: 15000, env: { ...process.env } }

# 2. Update openclaw-config.json with actual token/URL

# 3. Redeploy webhook to Railway
git add . && git commit -m "Fix webhook env var passing"
git push origin main
```
