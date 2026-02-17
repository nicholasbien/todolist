# Offline Sync Redesign

## Overview
This redesign proposes a robust offline sync system that replaces the current ad‑hoc queue in `frontend/public/sw.js` with a structured outbox, per-entity metadata, explicit conflict handling, deterministic retries/backoff, schema versioning, and richer UI feedback. It keeps the service worker as the network proxy but moves sync orchestration into a dedicated sync module that can run in the service worker and/or the app.

## Goals / Non‑Goals
**Goals**
1. Durable, ordered, and deduplicated queue with per‑op status, retries, and backoff.
2. Conflict detection and resolution strategy with explicit UI surfacing.
3. Stable ID mapping for offline‑created entities across todos, journals, spaces, categories.
4. Deterministic sync behavior under flapping connectivity and multi‑tab scenarios.
5. Schema versioning and safe migrations for IndexedDB.
6. UI feedback: pending count, last sync time, errors, conflict count.

**Non‑Goals**
1. Full CRDT or real‑time multi‑device merge.
2. Replacing the backend API in this phase.
3. Guaranteeing sync order across user devices (server still authoritative).

## Current Issues
1. Queue is a plain array in IndexedDB with no status, retries, or backoff; failures are only re‑queued in bulk (`readQueue` + `clearQueue` + re‑add), which risks lost updates and reordering. (`frontend/public/sw.js`)
2. No explicit conflict handling; server updates can overwrite local changes or vice versa. Conflict resolution is implicit and not visible in UI.
3. ID mapping exists only for todos and journals, not for categories or spaces, and it’s stored as a single map blob. (`ID_MAP` in `frontend/public/sw.js`)
4. Mixed routing: some sync calls use `getBackendUrl()` and others call relative `/todos/...` from inside SW. This is fragile across environments and can bypass intended routing.
5. Sync is triggered on GETs and guarded by a single global `syncInProgress`, but there is no per‑entity lock or proper sequencing; GET responses can still race with local updates.
6. OfflineContext only exposes `isOffline` and does not expose pending queue length, last sync time, last error, or conflicts. (`frontend/context/OfflineContext.tsx`)
7. No schema versioning beyond IndexedDB version bumps. Migrations are implicit and don’t handle data shape changes.

## Proposed Architecture
1. **Split responsibilities**
   - Service Worker: network proxy, cache, and sync runner with Background Sync/Periodic Sync when available.
   - Sync Engine (shared module): deterministic outbox processing, conflict detection, retries/backoff, and ID mapping.
2. Introduce an **Outbox** model with status and metadata instead of a raw queue list.
3. Add per‑entity metadata store for versioning and conflict detection.
4. **Explicit conflict resolution**:
   - Default: Last‑write‑wins with `updated_at` and `server_version`.
   - If server supports `If‑Match`/ETag or a `version` field, use optimistic concurrency and track conflicts on 409.
5. UI feedback via BroadcastChannel or `postMessage` to publish sync status, errors, and conflicts.

## Data Model
IndexedDB stores:
1. `entities`: normalized data by `entityType` + `clientId`
   - key: `${entityType}:${clientId}`
   - data: `{ clientId, serverId, payload, deleted, updatedAt, serverVersion }`
2. `outbox`: ordered operations with status
   - fields: `{ opId, entityType, action, clientId, serverId, payload, baseVersion, createdAt, updatedAt, status, attempts, nextAttemptAt, lastError, dependsOn }`
   - status: `queued | inflight | applied | failed | conflict`
3. `id_map`: `{ clientId -> serverId }` per entityType
4. `meta`: `{ schema_version, last_sync_at, last_error, pending_count }`
5. `conflicts`: `{ conflictId, entityType, clientId, serverPayload, localPayload, detectedAt, resolution }`

## Sync Algorithm
1. **Trigger points**
   - App online event: send `SYNC_REQUEST`.
   - Service worker Background Sync (if supported): `sync` event.
   - Manual UI action: “Sync now”.
2. **Preparation**
   - Load outbox ops where `status=queued` and `nextAttemptAt <= now`.
   - Sort by `createdAt`, and group by entityType with dependencies order: `spaces -> categories -> todos -> journals`.
3. **Execution**
   - For each op:
     - If `dependsOn` unresolved (e.g., create parent space), skip until dependency resolved.
     - Resolve `clientId -> serverId` from `id_map` when needed.
     - Send request with `If‑Match: baseVersion` if supported; else include `updated_at` in payload.
   - On success:
     - Update `entities` with server payload, version, and `serverId`.
     - If create, update `id_map` and rewrite future outbox entries referencing the `clientId`.
     - Mark op `applied`.
   - On 409 or detected conflict:
     - Record in `conflicts`, mark op `conflict`.
     - Do not retry automatically; require UI resolution.
   - On transient failure (network/5xx):
     - Increment `attempts`, set `nextAttemptAt` with backoff + jitter.
4. **Backoff**
   - Exponential: `base=2s`, `max=5m`, jitter ±20%.
   - Reset backoff on any successful op.
5. **Completion**
   - Update `meta.last_sync_at` and `pending_count`.
   - Broadcast `SYNC_STATUS` with counts, last error, and conflicts.

## Edge Cases
1. Offline create → update → delete: collapse into create+delete (net no‑op) before sync.
2. Rename category while offline and todos reference old category: model as category entity with stable `clientId`, so todos reference ID rather than name.
3. Duplicate offline IDs after restart: use stable UUID client IDs instead of `offline_${Date.now()}`.
4. Partial sync: if spaces or categories fail to sync, todos dependent on them are held in `dependsOn`.
5. Multi‑tab concurrency: use BroadcastChannel to coordinate a single active sync leader.
6. Conflict on journal (single per day): treat journal as unique by `{date, space_id}` and detect server changes since local `updated_at`.

## Migration Plan
1. Increment IndexedDB schema version and add new stores `entities`, `outbox`, `meta`, `conflicts`.
2. Migrate existing todos/categories/spaces/journals into `entities` with `clientId=existing _id` and `serverId` if not `offline_`.
3. Convert old `queue` entries into `outbox` ops:
   - Map `CREATE/UPDATE/DELETE` to `action` and create `opId`.
   - Preserve `createdAt` from `timestamp`.
4. Build `id_map` from existing `ID_MAP` store and any `_id` values that are not `offline_`.
5. Set `meta.schema_version` to new version.
6. Keep legacy queue store for one release; after successful sync and verification, delete it in next migration.

## Testing Plan
1. Unit tests for sync engine:
   - Outbox ordering, collapse rules, retry/backoff, conflict detection.
2. Integration tests for SW:
   - Offline create/update/delete flows with migrations.
   - Sync after reconnect with mixed operations and dependencies.
3. Conflict tests:
   - Simulate server version change and expect `conflicts` entry + UI signal.
4. Multi‑tab tests:
   - Ensure a single sync leader and consistent queue drain.
5. Migration tests:
   - Existing DB with legacy queue migrates correctly and no data loss.
6. UI tests:
   - Sync status indicators, error states, conflict UI flows.
