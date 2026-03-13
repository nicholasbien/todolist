# Online Transition Race Condition Fix

## Problem

When transitioning from offline to online, todos would not load properly due to a race condition:

1. **OfflineContext** triggers `SYNC_WHEN_ONLINE` → starts `syncQueue()`
2. **AIToDoListApp** calls `fetchTodos()` simultaneously
3. `fetchTodos()` completes **BEFORE** `syncQueue()` finishes uploading offline changes
4. Server returns old data (without offline changes)
5. Service worker blindly caches this stale data to IndexedDB
6. **Offline changes get overwritten** with old server data

## Root Cause

The service worker had race condition protection for **journals** but NOT for **todos**:

### Journals (had protection):
```javascript
// sw.js lines 707-709
if (syncInProgress || hasPendingJournals) {
  console.log(`⏸️ BLOCKING journal server data`);
  // Don't cache server data during sync
}
```

### Todos (no protection):
```javascript
// sw.js lines 667-680 (BEFORE fix)
if (url.pathname === '/todos') {
  const serverTodos = await response.clone().json();
  // ⚠️ NO CHECK for syncInProgress or pending operations!
  for (const todo of serverTodos) {
    await putTodo(todo, authData.userId);  // Blindly overwrites IndexedDB
  }
}
```

## The Fix

Added the same protection for todos that journals have:

```javascript
// sw.js lines 673-694 (AFTER fix)
if (url.pathname === '/todos') {
  const spaceId = url.searchParams.get('space_id');

  // Check if sync is in progress or there are pending todo operations
  const queue = await readQueue(authData.userId);
  const hasPendingTodos = queue.some(op =>
    (op.type === 'CREATE' || op.type === 'UPDATE' || op.type === 'DELETE') &&
    (op.data.space_id === spaceId || (!spaceId && !op.data.space_id))
  );

  if (syncInProgress || hasPendingTodos) {
    console.log(`⏸️ BLOCKING todo server data - sync: ${syncInProgress}, pending: ${hasPendingTodos}`);
    // Don't cache server data during sync to prevent race condition
  } else {
    // Safe to cache server data
    const serverTodos = await response.clone().json();
    for (const todo of serverTodos) {
      if (todo && todo._id) {
        await putTodo(todo, authData.userId);
      }
    }
    console.log(`✅ Cached ${serverTodos.length} todos to IndexedDB`);
  }
}
```

## Changes Made

### 1. Service Worker (`public/sw.js`)
- **Lines 3-4**: Bumped cache versions to v109
- **Lines 673-694**: Added sync protection for GET /todos
- **Protection logic**:
  - Checks if `syncInProgress` flag is true
  - Checks if queue has pending CREATE/UPDATE/DELETE operations
  - Filters by space_id to allow independent space operations
  - Blocks caching if sync is in progress or pending operations exist

### 2. Test Coverage (`__tests__/OnlineTransitionRaceCondition.test.ts`)
Created comprehensive test suite with 4 tests (all passing):

1. **Server todo data is NOT cached when there are pending CREATE operations**
   - Verifies offline todos aren't overwritten during sync

2. **Server todo data IS cached when there are NO pending operations**
   - Verifies normal online operation works correctly

3. **Server todo data is NOT cached when there are pending UPDATE operations**
   - Verifies offline edits aren't lost during sync

4. **Pending operations in different spaces do not block caching**
   - Verifies space isolation works correctly

## Result

Users can now transition from offline to online without losing their offline changes. The service worker waits for sync to complete before caching fresh server data, preventing the race condition.

## Flow Diagram

### Before (Race Condition):
```
Offline → Online
    ├─ OfflineContext: SYNC_WHEN_ONLINE → syncQueue() starts
    └─ AIToDoListApp: fetchTodos() → GET /todos
        ├─ Server returns old data (no offline changes yet)
        └─ SW caches old data to IndexedDB ❌ OVERWRITES OFFLINE CHANGES
```

### After (Protected):
```
Offline → Online
    ├─ OfflineContext: SYNC_WHEN_ONLINE → syncQueue() starts
    │   └─ syncInProgress = true
    └─ AIToDoListApp: fetchTodos() → GET /todos
        ├─ Server returns old data
        └─ SW checks: syncInProgress=true → BLOCKS caching ✅

Later (after sync completes):
    └─ Next fetchTodos() → Server has new data → SW caches safely ✅
```

## Test Results

All offline tests passing:
- ✅ OfflineAuthPersistence: 5/5
- ✅ OfflineCategoriesSpaces: 5/5
- ✅ OnlineTransitionRaceCondition: 4/4
- ✅ All other offline tests: 54/54
