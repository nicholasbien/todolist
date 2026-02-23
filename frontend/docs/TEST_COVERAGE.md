# Frontend Test Coverage

**As of February 2026 — 24 test suites, 221 tests, all passing**

## What's covered

### Service Worker — Offline Sync Engine

The offline-first sync engine (`public/sw.js`) is the most heavily tested area, with five dedicated test suites.

#### `ServiceWorkerSync.test.ts` (56 tests)
Core sync queue behavior: CREATE, UPDATE, COMPLETE, DELETE, CREATE_CATEGORY, DELETE_CATEGORY, RENAME_CATEGORY, CREATE_JOURNAL, DELETE_JOURNAL, CREATE_SPACE, UPDATE_SPACE, DELETE_SPACE. Also covers:
- Offline-to-online ID remapping (server-assigned IDs replace `offline_*` IDs)
- Concurrency protection (only one `syncQueue` runs at a time; queues a follow-up)
- User/space data isolation in IndexedDB
- GET /todos and GET /journals caching
- Network failure fallback (returns IndexedDB data)
- Error handling when no auth data available
- Complete offline → online workflow with immediate UI replacement

#### `ServiceWorkerSyncBugFixes.test.ts` (16 tests)
Regression tests for bugs found and fixed in the sync engine:
- **Bug 1**: Failed CREATE keeps op in queue with `retryCount` incremented
- **Bug 2**: Mixed batches — success removes op, failure keeps op (not all-or-nothing)
- **Bug 3**: Retry count drops op after 3 failures (avoids infinite retry loops)
- **Bug 4**: `idMap` persists after `clearQueue` and across sync sessions
- **Bug 5**: Absolute URLs used for all operation types in `syncQueue`
- **Bug 6**: Stale server todos cleaned from IDB after GET /todos
- **Bug 7**: Different-space data untouched by stale cleanup (space isolation)
- **Bug 8**: Stale journals removed after unfiltered GET /journals
- **Bug 9**: Date-filtered GET /journals does NOT delete journals for other dates
- **Bug 10**: Journal queue update is atomic (queue length stays 1)
- **Bug 11**: Other ops survive journal queue update
- **Bug 12**: Concurrent sync calls — only one runs, pending flag triggers follow-up
- **Bug 13**: UPDATE/COMPLETE/DELETE for unmapped offline IDs deferred in queue
- **Bug 14**: Deferred ops execute after CREATE succeeds in next sync cycle
- **Bug 15**: Completing offline todo with pending UPDATE updates both queue entries

#### `ServiceWorkerRoutingCaching.test.ts`
URL routing logic and caching behavior:
- Auth endpoints bypass service worker routing
- Production vs. dev URL handling
- `cacheGetTodos` blocked when pending CREATE operations exist (prevents stale data overwriting pending work)

#### `OfflineCategoriesSpaces.test.ts`
GET /categories and GET /spaces caching and offline serving from IndexedDB, including space_id filtering.

#### `ServiceWorkerRouteValidation.test.ts`
Validates that all API endpoints have corresponding IndexedDB operations and that online caching logic exists for all data types.

### Offline Operation Tests

#### `OfflineBasicOperations.test.ts` (19 tests)
Unit tests for pure SW utility functions: offline ID generation/detection, priority normalization, URL parsing, query param extraction, link todo detection, todo filtering, queue operation creation, JSON error handling, category name generation and validation, auth data validation.

#### `OfflineAuthPersistence.test.ts` (5 tests)
Auth token stored in SW's IndexedDB, available offline, persists across SW restart, per-user data accessible with stored auth, offline requests include auth headers.

#### `OfflineJournal.test.ts` / `OfflineJournalSync.test.ts` / `OfflineJournalSyncIntegration.test.ts`
Journal-specific offline behavior: offline journal ID handling, CREATE_JOURNAL queueing, offline-to-online journal sync (server version replaces offline version), space_id filtering in journal queries.

#### `OfflineOpsAfterSync.test.ts` (8 tests)
Operations after partial sync: DELETE, COMPLETE, UPDATE each queue correctly; stale `offline_*` IDs return 404 after their CREATE has already been synced and the ID remapped.

#### `OnlineTransitionRaceCondition.test.ts` (5 tests)
Race condition fix: server data is NOT cached to IDB when pending CREATE ops exist (prevents server stale data from overwriting unsynced offline work). Verified per-space (pending in space A doesn't block caching for space B).

### UI Components

#### `TodoSpaceChangeModal.test.tsx` (4 tests)
Context menu on todo row opens an edit modal with a space selector; changing space loads that space's categories; space_id is included in the PATCH request on save; warning indicator shown when space changes.

#### `JournalNavigation.test.tsx` (1 test)
Previous/next arrows on the journal tab change the selected date.

#### `OnlineOfflineEvents.test.tsx` (8 tests)
Component mounts with online/offline event listeners; online event triggers `fetchTodos`; offline event does not; no-op when no token/user; listeners cleaned up on unmount; multiple online events don't race; service worker sync message not sent on online event; documents immediate replacement workflow.

#### `EmailSettingsDefaults.test.tsx` (1 test)
Personal space is checked by default in email notification settings.

#### `MessageRendererLists.test.tsx`
Markdown list rendering in the AI assistant message bubble.

### Auth / Account Flows

#### `AccountCreationFlow.test.ts` (4 tests)
Login syncs auth token to SW IndexedDB before showing the name form; token is available in localStorage for the update-name request; SW sync happens before update-name; documents token-missing scenario without SW sync.

#### `AuthSignupErrorHandling.test.ts` (5 tests)
Signup handles 422 invalid email, 422 without detail field, network errors, malformed JSON, and success.

#### `OfflineInsights.test.ts`
Insights/summary generation (including timezone handling for UTC date bucketing).

### Infrastructure

#### `ProxyFallbackBasic.test.ts` (6 tests)
Next.js API proxy: proxy file exists and exports handler, path parsing, URL building, request body handling, environment-based backend URL selection, handles all required API endpoints.

#### `EmailHeaderRegression.test.ts` (1 test)
Documents the service worker header preservation fix (ensures custom headers are forwarded through the proxy).

#### `utils/sortPreferences.test.ts` (3 tests)
User+space scoped sort preference storage: key format, save/load, fallback to legacy space-only key.

---

## How tests are organized

```
frontend/__tests__/
├── Service Worker / Offline Sync
│   ├── ServiceWorkerSync.test.ts          # Core sync queue
│   ├── ServiceWorkerSyncBugFixes.test.ts  # Regression tests
│   ├── ServiceWorkerRoutingCaching.test.ts
│   ├── ServiceWorkerRouteValidation.test.ts
│   ├── OfflineBasicOperations.test.ts
│   ├── OfflineAuthPersistence.test.ts
│   ├── OfflineCategoriesSpaces.test.ts
│   ├── OfflineJournal.test.ts
│   ├── OfflineJournalSync.test.ts
│   ├── OfflineJournalSyncIntegration.test.ts
│   ├── OfflineOpsAfterSync.test.ts
│   └── OnlineTransitionRaceCondition.test.ts
├── UI Components
│   ├── TodoSpaceChangeModal.test.tsx
│   ├── JournalNavigation.test.tsx
│   ├── OnlineOfflineEvents.test.tsx
│   ├── EmailSettingsDefaults.test.tsx
│   └── MessageRendererLists.test.tsx
├── Auth / Account
│   ├── AccountCreationFlow.test.ts
│   └── AuthSignupErrorHandling.test.ts
├── Infrastructure
│   ├── ProxyFallbackBasic.test.ts
│   ├── EmailHeaderRegression.test.ts
│   └── OfflineInsights.test.ts
└── utils/
    └── sortPreferences.test.ts
```

---

## Gaps and improvement opportunities

### High priority

**1. Sync retry exhaustion (DROP after 3 failures)**
`ServiceWorkerSyncBugFixes.test.ts` tests the drop after 3 retries, but there's no test that the user is notified or that the operation is logged/recoverable. A dropped CREATE means data loss — this should post a message to all clients.

**2. Token expiry during sync**
No test covers what happens when the auth token expires mid-sync (server returns 401). Currently the SW will mark ops as failed and increment retryCount, eventually dropping them. Correct behavior would be to pause sync and prompt re-login.

**3. `syncQueue` ordering guarantees**
Tests verify individual operation types but don't exhaustively test that the queue processes operations in insertion order when a mix of types for the same todo is in the queue (e.g., CREATE → UPDATE → DELETE for the same item). The deferred-ops test (`Bug 14`) covers the CREATE → UPDATE case but not CREATE → DELETE.

**4. Background sync via `sync` event**
The SW registers a `sync` event handler (`SYNC_WHEN_ONLINE`), but there are no tests that exercise the actual `sync` event dispatch via `self.registration.sync`. The existing tests invoke `syncQueue()` directly.

### Medium priority

**5. Space deletion cascades**
No test verifies that deleting a space also cleans up that space's todos/journals/categories from IDB.

**6. Multiple spaces — full round-trip**
Tests verify space isolation at the IDB query level, but there's no end-to-end test that creates todos in two spaces, goes offline, syncs them both, and verifies the correct server calls were made for each space.

**7. `cacheGetJournals` date-filter + stale cleanup interaction**
The stale journals test (`Bug 9`) verifies that a date-filtered GET doesn't delete journals from other dates, but there's no test that a date-filtered GET AND an unfiltered GET run concurrently and the result is consistent.

**8. Large queue performance**
No test exercises the queue with >100 items to catch N+1 IDB read patterns or slow sync cycles.

### Lower priority / nice to have

**9. Component coverage beyond happy paths**
`TodoSpaceChangeModal` tests the happy path (context menu → modal → save). Missing: cancel button, network error on save, modal closing when clicking outside.

**10. AI assistant message rendering**
`MessageRendererLists.test.tsx` tests list rendering, but no tests for code blocks, links, bold/italic, or mixed content.

**11. `generateInsights` output format**
`OfflineInsights.test.ts` tests timezone handling but not the actual text/structure of the generated insights (productivity score calculation, streaks, overdue count).

**12. `sortPreferences` with multiple users**
The sort preference tests use a single user. No test verifies that user A's preference doesn't bleed into user B's key.

**13. E2E Playwright coverage**
The `scripts/test-offline-sync.js` Playwright test covers the offline sync workflow against a real backend, but it requires a live server. Consider adding Playwright tests for:
- Journal offline create → sync
- Space create offline → sync
- Category reassignment offline
