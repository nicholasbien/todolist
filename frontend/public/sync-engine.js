// Shared offline sync engine for service worker and (optionally) app
// Plain JS so it can be importScripts()-ed from the service worker.
(function (global) {
  const DEFAULTS = {
    dbVersion: 14,
    userDbPrefix: 'TodoUserDB_',
    baseBackoffMs: 2000,
    maxBackoffMs: 5 * 60 * 1000,
    jitterPct: 0.2,
  };

  const STORES = {
    ENTITIES: 'entities',
    OUTBOX: 'outbox',
    ID_MAP: 'id_map',
    META: 'meta',
    CONFLICTS: 'conflicts',
  };

  const ENTITY_ORDER = ['spaces', 'categories', 'todos', 'journals'];

  let config = { ...DEFAULTS };

  function init(options = {}) {
    config = { ...config, ...options };
  }

  function nowMs() {
    return Date.now();
  }

  function safeRandomId(prefix) {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        return `${prefix}${global.crypto.randomUUID()}`;
      }
    } catch (e) {}
    return `${prefix}${nowMs()}_${Math.floor(Math.random() * 1e9)}`;
  }

  function isTemporaryId(id) {
    if (!id) return false;
    return id.startsWith('offline_') || id.startsWith('offline_journal_') || id.startsWith('client_');
  }

  function openUserDB(userId) {
    const dbName = userId ? `${config.userDbPrefix}${userId}` : `${config.userDbPrefix}guest`;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, config.dbVersion);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Hard reset: drop all existing stores and recreate fresh schema.
        Array.from(db.objectStoreNames).forEach((name) => {
          db.deleteObjectStore(name);
        });

        const entityStore = db.createObjectStore(STORES.ENTITIES, { keyPath: 'key' });
        entityStore.createIndex('entityType', 'entityType', { unique: false });
        entityStore.createIndex('clientId', 'clientId', { unique: false });
        entityStore.createIndex('serverId', 'serverId', { unique: false });

        const outboxStore = db.createObjectStore(STORES.OUTBOX, { keyPath: 'opId' });
        outboxStore.createIndex('status', 'status', { unique: false });
        outboxStore.createIndex('entityType', 'entityType', { unique: false });
        outboxStore.createIndex('createdAt', 'createdAt', { unique: false });
        outboxStore.createIndex('nextAttemptAt', 'nextAttemptAt', { unique: false });

        const idMapStore = db.createObjectStore(STORES.ID_MAP, { keyPath: 'key' });
        idMapStore.createIndex('entityType', 'entityType', { unique: false });

        db.createObjectStore(STORES.META, { keyPath: 'key' });

        const conflictStore = db.createObjectStore(STORES.CONFLICTS, { keyPath: 'conflictId' });
        conflictStore.createIndex('entityType', 'entityType', { unique: false });
      };
    });
  }

  function userDbTx(userId, store, mode, fn) {
    return openUserDB(userId).then((db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction([store], mode);
        const st = tx.objectStore(store);
        const req = fn(st);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
    );
  }


  async function getEntity(userId, entityType, clientId) {
    const key = `${entityType}:${clientId}`;
    return userDbTx(userId, STORES.ENTITIES, 'readonly', (s) => s.get(key));
  }

  async function putEntity(userId, entityType, clientId, payload, extra = {}) {
    const key = `${entityType}:${clientId}`;
    const record = {
      key,
      entityType,
      clientId,
      serverId: extra.serverId || null,
      payload,
      deleted: !!extra.deleted,
      updatedAt: extra.updatedAt || payload.updated_at || payload.updatedAt || null,
      serverVersion: extra.serverVersion || payload.updated_at || payload.updatedAt || null,
    };
    return userDbTx(userId, STORES.ENTITIES, 'readwrite', (s) => s.put(record));
  }

  async function deleteEntity(userId, entityType, clientId) {
    const key = `${entityType}:${clientId}`;
    return userDbTx(userId, STORES.ENTITIES, 'readwrite', (s) => s.delete(key));
  }

  async function getEntitiesByType(userId, entityType) {
    return new Promise((resolve, reject) => {
      openUserDB(userId)
        .then((db) => {
          const tx = db.transaction([STORES.ENTITIES], 'readonly');
          const store = tx.objectStore(STORES.ENTITIES);
          const index = store.index('entityType');
          const req = index.getAll(entityType);
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        })
        .catch(reject);
    });
  }

  async function replaceEntityClientId(userId, entityType, oldClientId, newClientId, serverPayload) {
    const oldRecord = await getEntity(userId, entityType, oldClientId);
    if (!oldRecord) return;
    await deleteEntity(userId, entityType, oldClientId);
    const payload = serverPayload || { ...oldRecord.payload, _id: newClientId };
    await putEntity(userId, entityType, newClientId, payload, {
      serverId: newClientId,
      serverVersion: payload.updated_at || payload.updatedAt || null,
      updatedAt: payload.updated_at || payload.updatedAt || null,
    });
  }

  async function addOutboxOp(userId, op) {
    return userDbTx(userId, STORES.OUTBOX, 'readwrite', (s) => s.put(op));
  }

  async function getOutboxOps(userId) {
    return userDbTx(userId, STORES.OUTBOX, 'readonly', (s) => s.getAll());
  }

  async function updateOutboxOp(userId, opId, patch) {
    const existing = await userDbTx(userId, STORES.OUTBOX, 'readonly', (s) => s.get(opId));
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: nowMs() };
    await userDbTx(userId, STORES.OUTBOX, 'readwrite', (s) => s.put(updated));
    return updated;
  }

  async function deleteOutboxOp(userId, opId) {
    return userDbTx(userId, STORES.OUTBOX, 'readwrite', (s) => s.delete(opId));
  }

  async function rewriteOutboxClientId(userId, entityType, oldClientId, newClientId) {
    const ops = await getOutboxOps(userId);
    const updates = ops.filter(
      (op) => op.entityType === entityType && op.clientId === oldClientId && op.status === 'queued'
    );
    for (const op of updates) {
      await updateOutboxOp(userId, op.opId, { clientId: newClientId });
    }
  }

  async function setIdMapEntry(userId, entityType, clientId, serverId) {
    const key = `${entityType}:${clientId}`;
    return userDbTx(userId, STORES.ID_MAP, 'readwrite', (s) =>
      s.put({ key, entityType, clientId, serverId })
    );
  }

  async function getIdMapEntry(userId, entityType, clientId) {
    const key = `${entityType}:${clientId}`;
    return userDbTx(userId, STORES.ID_MAP, 'readonly', (s) => s.get(key));
  }

  async function getAllIdMap(userId) {
    return userDbTx(userId, STORES.ID_MAP, 'readonly', (s) => s.getAll());
  }

  async function setMeta(userId, key, value) {
    return userDbTx(userId, STORES.META, 'readwrite', (s) => s.put({ key, value }));
  }

  async function getMeta(userId, key) {
    return userDbTx(userId, STORES.META, 'readonly', (s) => s.get(key));
  }

  async function addConflict(userId, conflict) {
    return userDbTx(userId, STORES.CONFLICTS, 'readwrite', (s) => s.put(conflict));
  }

  async function getConflicts(userId) {
    return userDbTx(userId, STORES.CONFLICTS, 'readonly', (s) => s.getAll());
  }

  function computeBackoff(attempts) {
    const base = config.baseBackoffMs;
    const max = config.maxBackoffMs;
    const raw = Math.min(max, base * Math.pow(2, attempts));
    const jitter = raw * config.jitterPct;
    const delta = (Math.random() * 2 - 1) * jitter;
    return Math.max(base, raw + delta);
  }

  async function runSync({
    userId,
    fetchFn,
    getAuthHeaders,
    buildRequest,
    now = nowMs,
    broadcast,
  }) {
    if (!userId) return { applied: 0, failed: 0, conflicts: 0 };
    const ops = (await getOutboxOps(userId)) || [];
    const readyOps = ops
      .filter((op) => op.status === 'queued' && (!op.nextAttemptAt || op.nextAttemptAt <= now()))
      .sort((a, b) => a.createdAt - b.createdAt);

    if (readyOps.length === 0) {
      await setMeta(userId, 'pending_count', 0);
      if (broadcast) broadcast(await buildStatus(userId));
      return { applied: 0, failed: 0, conflicts: 0 };
    }

    const ordered = [];
    for (const type of ENTITY_ORDER) {
      ordered.push(...readyOps.filter((op) => op.entityType === type));
    }
    ordered.push(...readyOps.filter((op) => !ENTITY_ORDER.includes(op.entityType)));

    let applied = 0;
    let failed = 0;
    let conflicts = 0;

    for (const op of ordered) {
      if (op.dependsOn) {
        const [depType, depClientId] = op.dependsOn.split(':');
        const depMap = await getIdMapEntry(userId, depType, depClientId);
        if (!depMap || !depMap.serverId) {
          continue;
        }
      }

      const headers = await getAuthHeaders();
      const request = await buildRequest(op, headers);
      if (!request) {
        await deleteOutboxOp(userId, op.opId);
        continue;
      }

      try {
        await updateOutboxOp(userId, op.opId, { status: 'inflight' });
        const response = await fetchFn(request.url, request.options);
        if (response.status === 409) {
          conflicts += 1;
          const serverPayload = response.headers && response.headers.get('Content-Type')?.includes('application/json')
            ? await response.json().catch(() => null)
            : null;
          await addConflict(userId, {
            conflictId: safeRandomId('conflict_'),
            entityType: op.entityType,
            clientId: op.clientId,
            serverPayload,
            localPayload: op.payload,
            detectedAt: new Date().toISOString(),
            resolution: 'pending',
          });
          await updateOutboxOp(userId, op.opId, { status: 'conflict' });
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        let serverPayload = null;
        try {
          serverPayload = await response.clone().json();
        } catch (e) {}

        await applySuccessfulOp(userId, op, serverPayload);
        await updateOutboxOp(userId, op.opId, { status: 'applied' });
        await deleteOutboxOp(userId, op.opId);
        applied += 1;
      } catch (err) {
        failed += 1;
        const attempts = (op.attempts || 0) + 1;
        const delay = computeBackoff(attempts);
        await updateOutboxOp(userId, op.opId, {
          status: 'queued',
          attempts,
          nextAttemptAt: now() + delay,
          lastError: err && err.message ? err.message : String(err),
        });
      }
    }

    await setMeta(userId, 'last_sync_at', new Date().toISOString());
    const remaining = (await getOutboxOps(userId)).filter((op) => op.status === 'queued').length;
    await setMeta(userId, 'pending_count', remaining);
    if (failed > 0) {
      await setMeta(userId, 'last_error', `${failed} operation(s) failed`);
    } else {
      await setMeta(userId, 'last_error', null);
    }

    if (broadcast) broadcast(await buildStatus(userId));
    return { applied, failed, conflicts };
  }

  async function buildStatus(userId) {
    const pending = await getMeta(userId, 'pending_count');
    const lastSync = await getMeta(userId, 'last_sync_at');
    const lastError = await getMeta(userId, 'last_error');
    const conflicts = await getConflicts(userId);
    return {
      pendingCount: pending ? pending.value || 0 : 0,
      lastSyncAt: lastSync ? lastSync.value || null : null,
      lastError: lastError ? lastError.value || null : null,
      conflictCount: conflicts ? conflicts.length : 0,
    };
  }

  async function applySuccessfulOp(userId, op, serverPayload) {
    if (op.action === 'delete') {
      await deleteEntity(userId, op.entityType, op.clientId);
      return;
    }

    if (op.action === 'create' && serverPayload && serverPayload._id && op.clientId !== serverPayload._id) {
      await setIdMapEntry(userId, op.entityType, op.clientId, serverPayload._id);
      await replaceEntityClientId(userId, op.entityType, op.clientId, serverPayload._id, serverPayload);
      await rewriteOutboxClientId(userId, op.entityType, op.clientId, serverPayload._id);
      return;
    }

    if (serverPayload && serverPayload._id) {
      await putEntity(userId, op.entityType, serverPayload._id, serverPayload, {
        serverId: serverPayload._id,
        serverVersion: serverPayload.updated_at || serverPayload.updatedAt || null,
        updatedAt: serverPayload.updated_at || serverPayload.updatedAt || null,
      });
    } else if (op.payload && op.payload._id) {
      await putEntity(userId, op.entityType, op.payload._id, op.payload, {
        serverId: op.payload._id,
        serverVersion: op.payload.updated_at || op.payload.updatedAt || null,
        updatedAt: op.payload.updated_at || op.payload.updatedAt || null,
      });
    } else if (op.entityType === 'categories' && op.action === 'create') {
      const fallbackPayload = { ...op.payload, _id: op.clientId };
      await putEntity(userId, op.entityType, op.clientId, fallbackPayload, {
        serverId: op.clientId,
        serverVersion: null,
        updatedAt: fallbackPayload.updated_at || fallbackPayload.updatedAt || null,
      });
    }
  }

  global.SyncEngine = {
    STORES,
    init,
    openUserDB,
    userDbTx,
    isTemporaryId,
    safeRandomId,
    getEntity,
    putEntity,
    deleteEntity,
    getEntitiesByType,
    replaceEntityClientId,
    addOutboxOp,
    getOutboxOps,
    updateOutboxOp,
    deleteOutboxOp,
    rewriteOutboxClientId,
    setIdMapEntry,
    getIdMapEntry,
    getAllIdMap,
    setMeta,
    getMeta,
    addConflict,
    getConflicts,
    runSync,
    buildStatus,
  };
})(typeof self !== 'undefined' ? self : globalThis);
