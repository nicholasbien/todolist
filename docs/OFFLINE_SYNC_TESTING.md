# Offline Sync Testing

End-to-end Playwright tests for the offline/online sync system. Tests simulate network loss, verify that operations queue correctly in IndexedDB, and confirm they sync to the server when connectivity is restored.

---

## Quick Run

Start both servers, then:

```bash
node scripts/test-offline-sync.js
```

Prerequisites:

```bash
# Terminal 1 — backend
cd backend && source venv/bin/activate && uvicorn app:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — frontend
cd frontend && npm run dev
```

The script launches a real Chromium browser (`headless: false`), logs in as `test@example.com` / `000000`, and runs all 7 tests sequentially. Output:

```
🔌 Offline/Online Sync — E2E Tests
   App:     http://localhost:3000
   Account: test@example.com / 000000

📋 Test 1: Create task offline → sync online
    ✅ Task appears in UI immediately while offline (served from IndexedDB)
    ✅ Task still visible after sync
    ✅ Task exists on server after sync
    ✅ Task has a real server ID (not offline_*) after sync
...
───────────────────────────────────────────────────────
Results: 21 passed, 0 failed
```

---

## What's Tested

| # | Test | What it proves |
|---|------|----------------|
| 1 | Create task offline → sync | Offline task is queued in IDB, synced to server with a real MongoDB ID |
| 2 | Update task offline → sync | Edit made while offline is reflected on server after sync |
| 3 | Delete task offline → sync | Deletion queued offline actually removes the record from the server |
| 4 | Complete task offline → sync | Completion queued offline; task appears in "Show Completed" after sync |
| 5 | Journal entry offline → sync | Journal auto-save queues offline; entry reaches server with correct text |
| 6 | Online data accessible offline | Tasks created online are cached in IDB and visible after going offline |
| 7 | Multiple offline ops sync together | Rename + delete + create in one offline session all sync in a single batch |
| 8 | Close completed task offline → sync | Closed-state toggle queues offline; task appears in "Show Closed" after sync |

---

## How Offline Sync Works

Understanding the sync architecture is essential for writing reliable tests.

### The sync queue

All mutating API calls (POST, PUT, DELETE) go through the service worker (`frontend/public/sw.js`). When offline, the SW saves the operation to IndexedDB's `queue` store and returns a synthetic response to the app immediately. When online, it proxies the request to the backend normally.

### Going online

The frontend's `OfflineContext` listens for `navigator.onLine` to become `true` and sends a `SYNC_WHEN_ONLINE` message to the SW. The SW's message handler calls `syncQueue()`:

```
OfflineContext detects online
  → postMessage({ type: 'SYNC_WHEN_ONLINE' })
    → SW: syncQueue()
      → iterates pending ops in order (CREATE, UPDATE, COMPLETE, CLOSE, DELETE, etc.)
      → POSTs each to the backend
      → updates IDB with server responses (replaces offline IDs with real ones)
      → posts { type: 'SYNC_COMPLETE' } to all clients
        → app's handleSyncMessage calls fetchTodos(false)
```

### The `syncInProgress` race

After **any** successful online non-GET request, the SW calls `syncQueue()` fire-and-forget. `syncQueue()` sets `syncInProgress = true` shortly after it starts. While this flag is set, `GET /todos` returns **stale IDB data** instead of hitting the server — this is intentional to avoid overwriting pending offline operations.

This matters in tests: immediately after an online `addTask`, a `fetchTodos` call can return IDB data that may not yet include the new task. Tests that add a task online and then need to find it must wait for the resulting `SYNC_COMPLETE` before the task list is reliable.

### Service worker auth

On first install, `navigator.serviceWorker.controller` is `null` when the app's `useEffect` fires `SET_AUTH`. The SW has no credentials and sync fails with 401. A single page reload after the SW claims clients lets `SET_AUTH` re-fire with a valid controller. The test setup does this automatically.

---

## Test Helper Reference

### `waitForSync(page, timeoutMs)`

Returns a promise that resolves to `'synced'` when the SW posts `SYNC_COMPLETE`, or `'timeout'` after `timeoutMs`. **Must be set up before going online** — there's a narrow race between `setOffline(false)` and the SW posting the message.

```js
const syncPromise = waitForSync(page, 10000); // register BEFORE going online
await context.setOffline(false);
const result = await syncPromise; // 'synced' or 'timeout'
```

### `goOnlineAndSync(page, context)`

Convenience wrapper: registers the sync listener, takes the browser online, awaits `SYNC_COMPLETE`, and adds a 1.2s buffer for the UI to re-render. Use this for the typical offline→online pattern.

```js
await goOnlineAndSync(page, context);
await goToTasks(page); // re-navigate to refresh the task list view
```

### `addTask(page, text)`

Clicks the task textarea, fills it, presses Enter, then **waits for the textarea to become enabled again** before returning. This is critical: `handleAddTodo` sets `loading=true` during the POST + `fetchTodos` cycle. If you call `addTask` again while `loading=true`, the textarea is disabled and the browser's `SwipeableViews` layout can switch tabs unexpectedly. A fixed timeout (e.g. 600ms) is not reliable under load — waiting for `input.waitFor({ state: 'enabled' })` is.

### `updateTaskText(page, oldText, newText)`

Opens the Edit Task modal via right-click, changes the text, and saves. Key implementation details:

- Right-clicks the **task row `div`** (not the `<p>` inside it) because `onContextMenu` is registered on the div.
- Uses `page.mouse.click(x, y, { button: 'right' })` with coordinates from `boundingBox()` rather than `element.click()`. This is necessary because the app uses `ReactSwipeableViews`, which renders all three tabs (Tasks, Assistant, Journal) in the DOM simultaneously. When the Tasks tab is off-screen (negative x), `element.click()` at the off-screen coordinates misses. Getting the bounding box after `scrollIntoViewIfNeeded()` gives the correct on-screen position.

```js
const row = taskRow(page, oldText);
await row.scrollIntoViewIfNeeded();
await page.waitForTimeout(150); // let layout settle
const box = await row.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
```

### `fetchTodosFromServer(page)`

Fetches `/todos` from the server (bypassing IDB cache) for verification. Reads `active_space_id` from localStorage and includes it as a query param — the backend filters by `space_id`, so omitting it returns no results when a space is active.

```js
function fetchTodosFromServer(page) {
  return page.evaluate(async () => {
    const spaceId = localStorage.getItem('active_space_id');
    const url = spaceId ? `/todos?space_id=${encodeURIComponent(spaceId)}` : '/todos';
    const resp = await fetch(url);
    return resp.ok ? resp.json() : null;
  });
}
```

### `taskRow(page, text)`

Returns a Playwright locator for the task container `div` that holds a `<p>` with the given text. Used by `completeTask`, `deleteTask`, and `updateTaskText` to scope clicks to the correct task when multiple tasks are in the list.

---

## Gotchas

These were discovered through debugging. Violating any of them causes flakiness or test failures.

### 1. Set up `waitForSync` BEFORE going online

```js
// ✅ correct — listener registered first
const syncPromise = waitForSync(page, 10000);
await context.setOffline(false);
await syncPromise;

// ❌ wrong — SYNC_COMPLETE can fire before the listener is registered
await context.setOffline(false);
const syncPromise = waitForSync(page, 10000); // may never resolve
await syncPromise;
```

### 2. Navigate away and back after online `addTask` to get a fresh task list

After an online POST, the SW calls `syncQueue()` fire-and-forget. While `syncInProgress=true`, `GET /todos` returns stale IDB data. To force a fresh fetch, wait for `SYNC_COMPLETE` then trigger a tab change (journal → tasks):

```js
const afterAddSync = waitForSync(page, 5000);
await addTask(page, taskText);
await afterAddSync; // wait for syncQueue to finish
await page.getByRole('button', { name: 'Journal', exact: true }).nth(0).click();
await page.waitForTimeout(200);
await goToTasks(page); // activeTab change fires fetchTodos(false)
await page.waitForSelector(`p:has-text("${taskText}")`, { timeout: 8000 });
```

This pattern is used in Tests 2 and 4. Without it, `waitForSelector` times out because `fetchTodos` silently returns IDB data that doesn't yet include the new task.

### 3. Include `space_id` in all server verification fetches

The backend queries todos and journals with `space_id` as a filter. A fetch to `/todos` without `?space_id=...` returns tasks from the default space only. A fetch to `/journals?date=...` without `&space_id=...` returns nothing (MongoDB finds no match for `{space_id: null}`).

Always use `localStorage.getItem('active_space_id')` in `page.evaluate` fetches that verify server state.

### 4. Backend AI can normalize task text

The backend AI classifier may modify task text. Task names with common action verbs get processed: for example, `"Update me"`, `"Complete me"`, and `"Finish-task"` have their `[E2E]` prefix stripped. Use neutral, noun-style names for test tasks: `"Rename-target"`, `"Mark-done"`, `"Multi-A"`, `"Delete me"`, `"Offline create"` are all safe.

To diagnose text normalization, temporarily add a route interceptor:

```js
await context.route('**/api/todos', async route => {
  const req = route.request();
  const response = await route.fetch();
  if (req.method() === 'POST') {
    const body = await response.text();
    console.log(`POST → ${response.status()} | ${body.substring(0, 120)}`);
    await route.fulfill({ response, body });
  } else {
    await route.fulfill({ response });
  }
});
```

### 5. All three tabs are always in the DOM

The app uses `ReactSwipeableViews` which renders Tasks, Assistant, and Journal simultaneously. Playwright selectors like `page.locator('p', { hasText: text })` match elements in off-screen tabs. `scrollIntoViewIfNeeded()` may not bring off-screen tab content into the viewport (the swipeable view uses CSS transforms, not scrolling).

Always call `goToTasks(page)` before interacting with task elements. After adding tasks, do not assume you're still on the Tasks tab — the tab can switch if `addTask`'s loading state is not fully cleared.

### 6. The "Show Completed" section persists across tests

Test 4 opens the "Show Completed" section and doesn't close it. Test 7 starts by checking for the "Hide Completed" button and closing it if present.

When searching for task elements after Test 4, be aware that completed tasks are in the DOM inside the Show Completed section. The `taskRow` locator filters by text, so it still finds the right task, but it may match a completed task if the text appears in both sections.

### 7. Journal sync goes through the same `syncQueue`

The journal auto-save (fires 2s after typing stops) queues a `CREATE_JOURNAL` or `UPDATE_JOURNAL` operation. When `goOnlineAndSync` fires and `syncQueue` processes this operation, it POSTs to `/journals` and stores the result in IDB. The same `SYNC_COMPLETE` event covers both todo and journal sync.

Test 5 waits 2.8s for the auto-save to fire (2s inactivity trigger + 0.8s buffer), then calls `goOnlineAndSync`.

---

## Adding a New Offline Test

1. **Choose task names carefully** — use neutral nouns (see Gotcha #4 above). Suffix all names with `${ts}` (the timestamp computed once at the start) to make them unique per run.

2. **Create test tasks online before going offline** when the operation requires a real server ID (e.g. update, delete, complete). Offline-created tasks get `offline_*` IDs that are replaced during sync.

3. **Wait for the task to appear in the UI before going offline** — use `page.waitForSelector('p:has-text("...")')` after `addTask`, then `page.waitForTimeout(1000)` to let the SW cache the updated list.

4. **Use `goOnlineAndSync` then `goToTasks`** — after sync, the tab might have drifted. Re-navigating to Tasks triggers `fetchTodos` via the `activeTab` useEffect.

5. **Verify on the server with `fetchTodosFromServer`** or a `page.evaluate` fetch — IDB state can lag behind server state during sync. Direct server verification catches sync failures that the UI might not surface.

6. **Wrap each test in try/catch** and call `fail('Test N error', err.message)` in the catch — this keeps other tests running even if one throws.

---

## Troubleshooting

**"No SYNC_COMPLETE received (queue may have been empty)"**
The SW didn't trigger sync. Possible causes: the OfflineContext didn't detect the online transition, the SW has no auth token (check the `SW auth verified` log in setup), or `syncQueue` ran but the queue was empty. Run the test again — this is sometimes transient.

**`waitForSelector: Timeout` for a task that was just added online**
The `syncInProgress` race: the SW is returning stale IDB data. Apply the journal-bounce pattern (Gotcha #2 above).

**Edit Task modal doesn't open on right-click**
The app may be showing a different tab. Add `goToTasks(page)` immediately before `updateTaskText`. If the bounding box `x` value is negative, the task element is off-screen in the SwipeableViews layout.

**Task text not found on server after sync**
Check whether the backend normalized the text (Gotcha #4). Add a route interceptor to log the POST response body and compare the actual stored text to what you're querying for. Also verify the `space_id` is included in the verification fetch (Gotcha #3).
