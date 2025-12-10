# Bug Proposal #3: Failed Sync Operations Create Zombie Data

## Status
🟡 **MODERATE** - Causes data inconsistency but not immediate loss

## Location
`public/sw.js` lines 1305-1546 (syncQueue function)

## Current Code
```javascript
async function syncQueue() {
  // ...
  try {
    const queue = await readQueue(authData.userId);

    for (const op of queue) {
      try {
        // Attempt to sync operation
        let res = await fetch(/* ... */);
        if (res && res.ok) {
          // Success: Update IndexedDB with server ID
        } else {
          console.log(`❌ Sync FAILED: Offline todo will be preserved`);
        }
      } catch (err) {
        console.log('Sync operation failed:', err);
        continue;  // ⚠️ Skip to next operation
      }
    }

    // ⚠️ ALWAYS clears queue, even if operations failed!
    await clearQueue(authData.userId);
  } finally {
    syncInProgress = false;
  }
}
```

## The Problem

### Scenario: Network Error During Sync
```
Initial State:
- IndexedDB: [{ _id: 'offline_1', text: 'Buy milk' }]
- Queue: [{ type: 'CREATE', data: { _id: 'offline_1', text: 'Buy milk' } }]

Sync Attempt 1:
- fetch('/todos', POST) → Network error / 500 / timeout
- catch block: console.log('Sync operation failed')
- continue to next operation
- clearQueue() → Queue is now empty ✅
- offline_1 remains in IndexedDB ⚠️

Later (user goes online again):
- syncQueue() runs
- Queue is empty → hasPendingTodos = false
- fetchTodos() runs
- Server returns: [] (doesn't have 'Buy milk')
- Protection check: hasPendingTodos = false → ALLOW CACHING
- IndexedDB gets overwritten with []
- offline_1 is DELETED ❌

Result: Silent data loss!
```

### Scenario: Partial Sync Success
```
Initial State:
- IndexedDB: [offline_1, offline_2, offline_3]
- Queue: [CREATE offline_1, CREATE offline_2, CREATE offline_3]

Sync Attempt:
- offline_1 → Success → Mapped to server_123
- offline_2 → NETWORK ERROR → Stays as offline_2
- offline_3 → Success → Mapped to server_456
- clearQueue() → All removed from queue

Result:
- IndexedDB: [server_123, offline_2, server_456]
- Queue: []
- Next sync: offline_2 is orphaned (not in queue, not on server)
- Next fetchTodos(): offline_2 gets deleted when server data is cached
```

## Root Cause

**Queue is not persistent across failed sync attempts:**
1. Operations are removed from queue whether they succeed or fail
2. Failed operations have no retry mechanism
3. No way to distinguish between "successfully synced" vs "failed to sync"
4. Protection logic (`hasPendingTodos`) relies on queue, so empty queue = "safe to cache"

## Current Mitigation

The system has **partial** protection:
- Offline IDs (`offline_*`) are preserved in IndexedDB even after sync fails
- They won't be sent to server (isOfflineId check prevents this)

But **fails when**:
- Next online session triggers fetch before another sync attempt
- User manually refreshes
- Server data gets cached and overwrites offline data

## Proposed Solutions

### Option A: Retry Queue with Exponential Backoff
Keep failed operations in queue for retry.

```javascript
async function syncQueue() {
  try {
    const queue = await readQueue(authData.userId);
    const successfulOps = [];
    const failedOps = [];

    for (const op of queue) {
      try {
        let res = await fetch(/* ... */);
        if (res && res.ok) {
          successfulOps.push(op);
          // Update IndexedDB with server ID
        } else {
          console.log(`❌ Sync FAILED (HTTP ${res.status})`);
          failedOps.push({
            ...op,
            retryCount: (op.retryCount || 0) + 1,
            lastAttempt: Date.now()
          });
        }
      } catch (err) {
        console.log('Sync operation failed:', err);
        failedOps.push({
          ...op,
          retryCount: (op.retryCount || 0) + 1,
          lastAttempt: Date.now(),
          lastError: err.message
        });
      }
    }

    // Clear only successful operations
    await clearQueue(authData.userId);

    // Re-add failed operations with retry metadata
    for (const failedOp of failedOps) {
      if (failedOp.retryCount < 5) { // Max 5 retries
        await addQueue(failedOp, authData.userId);
      } else {
        console.error('Operation exceeded max retries:', failedOp);
        // TODO: Notify user or move to dead letter queue
      }
    }
  } finally {
    syncInProgress = false;
  }
}
```

**Pros:**
- ✅ Automatic retry for transient failures
- ✅ Preserves failed operations
- ✅ No data loss

**Cons:**
- ⚠️ Infinite retry for permanent failures (e.g., validation errors)
- ⚠️ Need to distinguish between retryable (network) and non-retryable (400 errors)
- ⚠️ Queue grows unbounded if server is down for extended period

### Option B: Separate Failed Operations Store
Move failed operations to a separate "failed queue" for manual review.

```javascript
async function syncQueue() {
  try {
    const queue = await readQueue(authData.userId);

    for (const op of queue) {
      try {
        let res = await fetch(/* ... */);
        if (res && res.ok) {
          // Success
        } else {
          // Move to failed queue
          await addToFailedQueue({
            ...op,
            failedAt: Date.now(),
            httpStatus: res.status,
            responseText: await res.text()
          }, authData.userId);
        }
      } catch (err) {
        await addToFailedQueue({
          ...op,
          failedAt: Date.now(),
          error: err.message
        }, authData.userId);
      }
    }

    await clearQueue(authData.userId);
  } finally {
    syncInProgress = false;
  }
}

// Protection logic includes failed queue
const hasPendingTodos = queue.some(/* ... */) ||
                        (await getFailedQueue(authData.userId)).some(/* ... */);
```

**Pros:**
- ✅ Clear separation between active and failed operations
- ✅ Can add UI for user to review/retry failed operations
- ✅ Failed operations still protect against data overwrite

**Cons:**
- ⚠️ Requires new IndexedDB store
- ⚠️ More complex code
- ⚠️ Need UI for users to see failed operations

### Option C: Don't Clear Queue on Failure (Simplest)
Only remove operations from queue when they successfully sync.

```javascript
async function syncQueue() {
  try {
    const queue = await readQueue(authData.userId);
    const successfulOpIds = [];

    for (const op of queue) {
      try {
        let res = await fetch(/* ... */);
        if (res && res.ok) {
          successfulOpIds.push(op.id || op.timestamp);
          // Update IndexedDB
        }
        // Don't continue on failure - just skip
      } catch (err) {
        console.log('Sync operation failed:', err);
        // Don't continue - just skip
      }
    }

    // Only remove successful operations
    if (successfulOpIds.length > 0) {
      const newQueue = queue.filter(op =>
        !successfulOpIds.includes(op.id || op.timestamp)
      );
      await clearQueue(authData.userId);
      for (const op of newQueue) {
        await addQueue(op, authData.userId);
      }
    }
  } finally {
    syncInProgress = false;
  }
}
```

**Pros:**
- ✅ Simple implementation
- ✅ Preserves failed operations automatically
- ✅ Protection logic continues to work

**Cons:**
- ⚠️ No retry limit - failed operations stay forever
- ⚠️ Permanent failures (validation errors) stay in queue forever
- ⚠️ No visibility into why operations failed

### Option D: Hybrid - Smart Retry with Failure Classification
Distinguish between retryable and non-retryable errors.

```javascript
function isRetryableError(statusCode, error) {
  // Network errors - retry
  if (!statusCode) return true;

  // Server errors - retry
  if (statusCode >= 500) return true;

  // Rate limiting - retry
  if (statusCode === 429) return true;

  // Client errors - don't retry (bad data)
  if (statusCode >= 400 && statusCode < 500) return false;

  return false;
}

async function syncQueue() {
  const queue = await readQueue(authData.userId);
  const successfulOps = [];
  const retryableOps = [];
  const permanentFailures = [];

  for (const op of queue) {
    try {
      let res = await fetch(/* ... */);
      if (res && res.ok) {
        successfulOps.push(op);
      } else {
        if (isRetryableError(res.status)) {
          retryableOps.push({
            ...op,
            retryCount: (op.retryCount || 0) + 1,
            lastAttempt: Date.now()
          });
        } else {
          console.error('Permanent failure:', res.status, op);
          permanentFailures.push({
            ...op,
            failedAt: Date.now(),
            httpStatus: res.status
          });
          // Remove from IndexedDB - bad data
          if (op.type === 'CREATE' && op.data._id.startsWith('offline_')) {
            await delTodo(op.data._id, authData.userId);
          }
        }
      }
    } catch (err) {
      // Network errors are retryable
      retryableOps.push({
        ...op,
        retryCount: (op.retryCount || 0) + 1,
        lastAttempt: Date.now()
      });
    }
  }

  // Reconstruct queue
  await clearQueue(authData.userId);
  for (const op of retryableOps) {
    if (op.retryCount < 10) { // Max retries
      await addQueue(op, authData.userId);
    }
  }

  // Log permanent failures for debugging
  if (permanentFailures.length > 0) {
    console.error('Permanent sync failures:', permanentFailures);
  }
}
```

**Pros:**
- ✅ Smart retry logic
- ✅ Removes bad data automatically
- ✅ Retry limit prevents infinite loops
- ✅ Best balance of automation and safety

**Cons:**
- ⚠️ More complex
- ⚠️ Might auto-delete data user wanted to keep

## Additional Considerations

### Race Condition with Existing Fix
Bug #2 fix (returning IndexedDB data during sync) **partially mitigates** this:
- Even if queue is empty, offline data in IndexedDB is preserved temporarily
- BUT if sync fails AND next fetch happens when syncInProgress=false, data is still lost

### User Notification
Consider notifying users when sync fails:
```javascript
if (failedOps.length > 0) {
  // Send message to all clients
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage({
      type: 'SYNC_PARTIAL_FAILURE',
      failedCount: failedOps.length
    });
  }
}
```

## Recommendation

**Implement Option D (Hybrid) in phases:**

**Phase 1 (Immediate - 2 hours):**
- Implement Option C (don't clear failed operations)
- Prevents data loss with minimal changes

**Phase 2 (Next sprint - 1 day):**
- Add retry classification (Option D)
- Add retry count limits
- Add user notification for permanent failures

**Phase 3 (Future - 2 days):**
- Add UI for viewing failed operations
- Allow manual retry
- Add analytics for failure patterns

## Test Cases

### Test 1: Network error preserves operation
```javascript
test('Failed sync due to network error preserves operation in queue', async () => {
  await addQueue({ type: 'CREATE', data: offlineTodo });
  global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

  await syncQueue();

  const queue = await readQueue(userId);
  expect(queue.length).toBe(1); // Still in queue

  const todos = await getTodos(userId);
  expect(todos[0]._id).toBe('offline_1'); // Still in IndexedDB
});
```

### Test 2: Successful sync removes operation
```javascript
test('Successful sync removes operation from queue', async () => {
  await addQueue({ type: 'CREATE', data: offlineTodo });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => ({ _id: 'server_123' })
  });

  await syncQueue();

  const queue = await readQueue(userId);
  expect(queue.length).toBe(0); // Removed from queue

  const todos = await getTodos(userId);
  expect(todos[0]._id).toBe('server_123'); // Updated to server ID
});
```

### Test 3: Partial success
```javascript
test('Partial sync success only clears successful operations', async () => {
  await addQueue({ type: 'CREATE', data: offlineTodo1 });
  await addQueue({ type: 'CREATE', data: offlineTodo2 });

  let callCount = 0;
  global.fetch = jest.fn().mockImplementation(() => {
    callCount++;
    if (callCount === 1) return { ok: true, json: () => ({ _id: 'server_123' }) };
    throw new Error('Network error');
  });

  await syncQueue();

  const queue = await readQueue(userId);
  expect(queue.length).toBe(1); // Only failed op remains
  expect(queue[0].data._id).toBe('offline_2');
});
```

## Impact Assessment

### Data Loss Risk
**MODERATE-HIGH** with current implementation:
- Requires specific sequence: sync fail → go offline → come back online → fetch
- But when it happens, data is silently lost

### Frequency
- Depends on network reliability
- More common on mobile with spotty connections
- Rare with stable connections

### User Impact
- Users may not notice immediately
- When they do, data is already gone
- No way to recover

## Estimated Effort

**Phase 1 (Option C):**
- Implementation: 1-2 hours
- Testing: 1 hour
- Total: 2-3 hours

**Phase 2 (Option D):**
- Implementation: 4-6 hours
- Testing: 2 hours
- Total: 6-8 hours

**Phase 3 (UI):**
- Design: 2 hours
- Implementation: 4-6 hours
- Testing: 2 hours
- Total: 8-10 hours
