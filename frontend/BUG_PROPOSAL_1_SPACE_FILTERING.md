# Bug Proposal #1: Incorrect Space Filtering in Sync Protection

## Status
🔴 **CRITICAL** - Can cause data loss

## Location
`public/sw.js` lines 675-678

## Current Code
```javascript
const hasPendingTodos = queue.some(op =>
  (op.type === 'CREATE' || op.type === 'UPDATE' || op.type === 'DELETE') &&
  (op.data.space_id === spaceId || (!spaceId && !op.data.space_id))
);
```

## The Problem

### Scenario 1: Fetching All Spaces with Pending Specific Space Operations
```
State:
- Queue has pending CREATE for space_id="space1"
- Frontend fetches /todos (no space_id parameter)

Logic evaluation:
- spaceId = null (from URL params)
- op.data.space_id = "space1"
- First condition: op.data.space_id === spaceId
  → "space1" === null → FALSE
- Second condition: (!spaceId && !op.data.space_id)
  → (true && false) → FALSE
- Result: hasPendingTodos = FALSE

Consequence: ❌ CACHING PROCEEDS despite pending operations!
- Server returns old data (without "space1" changes)
- Service worker caches this stale data
- Offline changes in "space1" get overwritten
```

### Scenario 2: Global Operations Not Blocking Space-Specific Fetches
```
State:
- Queue has pending operation with space_id=null (global)
- Frontend fetches /todos?space_id=space1

Logic evaluation:
- spaceId = "space1"
- op.data.space_id = null
- First condition: op.data.space_id === spaceId
  → null === "space1" → FALSE
- Second condition: (!spaceId && !op.data.space_id)
  → (false && true) → FALSE
- Result: hasPendingTodos = FALSE

Consequence: ⚠️ Might or might not be a problem depending on semantics
- If global operations should block all space queries, this is wrong
- If global operations are independent, this is correct
```

## Root Cause

The logic assumes a **symmetric relationship** between query scope and operation scope:
- Query for specific space → only block for that specific space
- Query for all spaces → only block for global operations

But this creates a **dangerous gap**:
- Query for all spaces → **doesn't block for ANY specific space operations**

## Proposed Fix

### Option A: Conservative (Recommended)
Block any query if there are ANY pending operations, regardless of space matching.

```javascript
const hasPendingTodos = queue.some(op =>
  op.type === 'CREATE' || op.type === 'UPDATE' || op.type === 'DELETE'
);
```

**Pros:**
- ✅ Simple logic, impossible to get wrong
- ✅ Guarantees data consistency
- ✅ No edge cases

**Cons:**
- ⚠️ Overly conservative - blocks unrelated spaces
- ⚠️ Slight performance impact (blocks more than necessary)

### Option B: Sophisticated
Properly handle the relationship between query scope and operation scope.

```javascript
const hasPendingTodos = queue.some(op => {
  if (op.type !== 'CREATE' && op.type !== 'UPDATE' && op.type !== 'DELETE') {
    return false; // Not a todo operation
  }

  // If querying all spaces (no spaceId param)
  if (!spaceId) {
    return true; // Block for ANY todo operation (specific space OR global)
  }

  // If querying specific space
  // Block if operation is for this space OR operation is global (affects all)
  return op.data.space_id === spaceId || !op.data.space_id;
});
```

**Pros:**
- ✅ Correct semantics
- ✅ Minimal blocking - only blocks when necessary
- ✅ Handles all edge cases properly

**Cons:**
- ⚠️ More complex logic
- ⚠️ Harder to verify correctness

## Test Cases

### Test 1: Global query with pending specific space operation
```javascript
test('Fetching all spaces blocks when there are pending operations in any space', async () => {
  // Add pending operation for space1
  await addQueue({ type: 'CREATE', data: { _id: 'offline_1', space_id: 'space1' }});

  // Fetch all spaces (no space_id param)
  const response = await handleApiRequest('/todos');

  // Should block and return IndexedDB data
  expect(/* returned IndexedDB data, not server data */);
});
```

### Test 2: Specific space query with pending global operation
```javascript
test('Fetching specific space blocks when there are pending global operations', async () => {
  // Add pending global operation (no space_id)
  await addQueue({ type: 'CREATE', data: { _id: 'offline_1', space_id: null }});

  // Fetch specific space
  const response = await handleApiRequest('/todos?space_id=space1');

  // Should block if global operations affect all queries
  expect(/* behavior depends on semantics decision */);
});
```

### Test 3: Cross-space isolation (existing test - should still pass)
```javascript
test('Fetching space1 does not block when there are pending operations in space2', async () => {
  await addQueue({ type: 'CREATE', data: { _id: 'offline_1', space_id: 'space2' }});
  const response = await handleApiRequest('/todos?space_id=space1');
  // Should NOT block - different spaces
});
```

## Impact Assessment

### Data Loss Risk
**HIGH** - If user creates offline todo in space1, then:
1. Goes online
2. Opens "All Spaces" view → triggers `/todos` (no space_id)
3. Sync is in progress
4. Server returns empty array (sync not complete)
5. **Bug: Caching proceeds because hasPendingTodos=false**
6. IndexedDB gets overwritten with empty array
7. Offline todo is lost

### Frequency
- Happens when user switches from specific space to "All Spaces" view during sync
- Depends on sync duration (usually <1s, but could be longer with many operations)
- More likely with slow networks

### Severity
**CRITICAL** - Silent data loss with no user notification

## Recommendation

**Implement Option B immediately** (sophisticated fix):
1. Provides correct behavior
2. Minimal performance impact
3. Handles all edge cases

Add comprehensive test coverage for all scenarios.

## Related Issues
- Similar logic exists for journals (sw.js lines 700-705)
- Should audit and fix there too if affected

## Estimated Effort
- Fix: 10 minutes
- Testing: 30 minutes
- Total: 40 minutes
