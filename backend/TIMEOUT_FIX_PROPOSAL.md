# Todo Classification Timeout Fix

## Problem

When adding a todo, users experience duplicate todos due to a timeout mismatch:

1. **Frontend timeout**: 5 seconds (AIToDoListApp.tsx:661)
2. **Backend classification timeout**: 10 seconds (classify.py:27)

### Current Flow (Broken)
```
User submits todo
  ↓
Frontend: Wait up to 5s
  ↓
[5s passes]
  ↓
Frontend: Timeout! Abort request, show error to user
  ↓
Backend: Still processing classification...
  ↓
[10s total passes]
  ↓
Backend: Timeout! Use default classification (General/Medium)
  ↓
Backend: Create todo in database with defaults
  ↓
User doesn't see the todo (thinks it failed)
  ↓
User adds another todo successfully
  ↓
UI refreshes, shows BOTH todos → Appears as duplicate
```

## Root Cause

The backend classification timeout (10s) is **longer** than the frontend request timeout (5s). This means:
- Frontend gives up and shows error
- Backend continues processing and eventually succeeds with fallback values
- Todo gets created but UI doesn't update
- Next successful request shows the "failed" todo

## Proposed Solution

### Option 1: Reduce Backend Classification Timeout (RECOMMENDED)

**Change**: Reduce OpenAI client timeout in `classify.py` from 10s to 3s

**Rationale**:
- Keeps classification fast and responsive
- Ensures backend finishes (with fallback) before frontend times out
- 3 seconds is plenty for gpt-4.1-nano (typically <1s)
- If OpenAI is slow, fall back to default classification quickly

**Changes needed**:
```python
# backend/classify.py line 27
# Before:
client = OpenAI(api_key=api_key, timeout=10.0, max_retries=0)

# After:
client = OpenAI(api_key=api_key, timeout=3.0, max_retries=0)  # 3 second timeout
```

**Benefits**:
- ✅ Simple one-line fix
- ✅ Backend completes before frontend timeout
- ✅ User sees immediate result (with default classification if needed)
- ✅ No duplicates
- ✅ Falls back to manual date parsing which is fast

**Tradeoffs**:
- ⚠️ More requests will fall back to default classification during network issues
- ⚠️ But this is better than silently creating duplicate todos

### Option 2: Increase Frontend Timeout

**Change**: Increase frontend timeout from 5s to 15s

**Rationale**: Give backend enough time to complete classification

**Tradeoffs**:
- ❌ Poor user experience (15s wait is too long)
- ❌ Doesn't solve the root issue
- ❌ Users will still experience delays

### Option 3: Smart Offline Fallback (Future Enhancement)

When frontend times out:
1. Immediately add todo with offline mode (no classification)
2. Mark as "pending classification"
3. Background process retries classification later
4. Update todo when classification completes

**Tradeoffs**:
- ❌ Complex implementation
- ❌ Requires background sync logic
- ❌ Overkill for this issue

## Recommendation

**Implement Option 1**: Reduce backend timeout to 3 seconds

This is the simplest fix that addresses the root cause. It ensures the backend completes processing (even if falling back to defaults) before the frontend times out, preventing the duplicate todo issue.

### Implementation

1. Change `backend/classify.py` line 27:
   ```python
   client = OpenAI(api_key=api_key, timeout=3.0, max_retries=0)  # 3 second timeout
   ```

2. Add comment explaining the relationship:
   ```python
   # 3 second timeout - must be less than frontend timeout (5s) to prevent duplicates
   ```

3. Test scenarios:
   - Normal classification (should work fine, usually <1s)
   - Slow OpenAI API (falls back to defaults within 3s, frontend gets response)
   - Network issues (falls back to defaults, no duplicates)

### Additional Improvement (Optional)

Add better error messaging when classification falls back:
```python
logger.warning(
    f"Classification timed out after {time.time() - start_time:.2f}s for '{text[:30]}...', "
    "using default classification"
)
```

This helps with debugging and monitoring classification performance.
