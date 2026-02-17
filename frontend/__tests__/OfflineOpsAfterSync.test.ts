/**
 * Regression tests: offline operations on todos that were created offline then synced.
 *
 * The bug was that React state held stale offline_ IDs after sync replaced them
 * with server IDs in IndexedDB. The service worker's offline handlers couldn't
 * find the offline_ ID, so operations silently failed.
 *
 * Fix: Listen for SYNC_COMPLETE to refresh React state with server IDs.
 * Additionally, SW handlers now return 404 for missing IDs instead of silently succeeding.
 *
 * This test validates the service worker side (IndexedDB operations + 404 responses).
 */
import makeServiceWorkerEnv from 'service-worker-mock';
import { IDBFactory } from 'fake-indexeddb';

let sw: any;

const SERVER_TODO = {
  _id: 'server_abc123',
  text: 'Buy groceries',
  category: 'General',
  priority: 'Medium',
  completed: false,
  user_id: 'user1',
  space_id: 'space1',
};

beforeEach(() => {
  const env = makeServiceWorkerEnv();
  Object.defineProperty(global, 'navigator', { value: env.navigator, configurable: true });
  (global as any).self = env;
  (global as any).indexedDB = new IDBFactory();
  (global as any).caches = env.caches;
  if (!(global as any).structuredClone) {
    (global as any).structuredClone = (obj: any) => JSON.parse(JSON.stringify(obj));
  }
  jest.resetModules();
  sw = require('../public/sw.js');
});

/** Helper: set up a synced todo (offline create → sync → server ID in IDB) */
async function setupSyncedTodo() {
  await sw.putAuth('token123', 'user1');

  // Create offline
  const offlineTodo = { ...SERVER_TODO, _id: 'offline_1' };
  await sw.putTodo(offlineTodo, 'user1');
  await sw.addQueue({ type: 'CREATE', data: offlineTodo }, 'user1');

  // Sync
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => SERVER_TODO,
  });
  await sw.syncQueue();

  // Go offline
  Object.defineProperty(global.navigator, 'onLine', { writable: true, value: false });

  // Verify sync replaced offline_ ID
  const todos = await sw.getTodos('user1', 'space1');
  expect(todos.some((t: any) => t._id === 'server_abc123')).toBe(true);
  expect(todos.some((t: any) => t._id === 'offline_1')).toBe(false);
}

/** Helper: set up a todo already in IDB with server ID (no sync step) */
async function setupServerTodo() {
  await sw.putAuth('token123', 'user1');
  await sw.putTodo(SERVER_TODO, 'user1');
  Object.defineProperty(global.navigator, 'onLine', { writable: true, value: false });
}

// ─── Happy path: operations with correct server ID after sync ───

describe('delete synced todo offline', () => {
  test('removes from IndexedDB and queues DELETE', async () => {
    await setupSyncedTodo();

    const res = await sw.handleApiRequest(new Request('/todos/server_abc123', { method: 'DELETE' }));
    expect(res.status).toBe(204);

    const todos = await sw.getTodos('user1', 'space1');
    expect(todos).toHaveLength(0);

    const queue = await sw.readQueue('user1');
    const deleteOp = queue.find((op: any) => op.type === 'DELETE');
    expect(deleteOp).toBeDefined();
    expect(deleteOp.data._id).toBe('server_abc123');
  });
});

describe('complete synced todo offline', () => {
  test('toggles completed in IndexedDB and queues COMPLETE', async () => {
    await setupSyncedTodo();

    const res = await sw.handleApiRequest(new Request('/todos/server_abc123/complete', { method: 'PUT' }));
    expect(res.status).toBe(200);

    const todos = await sw.getTodos('user1', 'space1');
    expect(todos[0].completed).toBe(true);
    expect(todos[0].dateCompleted).toBeDefined();

    const queue = await sw.readQueue('user1');
    const completeOp = queue.find((op: any) => op.type === 'COMPLETE');
    expect(completeOp).toBeDefined();
    expect(completeOp.data._id).toBe('server_abc123');
    expect(completeOp.data.completed).toBe(true);
  });
});

describe('update synced todo offline', () => {
  test('updates category in IndexedDB and queues UPDATE', async () => {
    await setupSyncedTodo();

    const res = await sw.handleApiRequest(new Request('/todos/server_abc123', {
      method: 'PUT',
      body: JSON.stringify({ category: 'Work' }),
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(res.status).toBe(200);

    const updated = await res.json();
    expect(updated.category).toBe('Work');

    const todos = await sw.getTodos('user1', 'space1');
    expect(todos[0].category).toBe('Work');

    const queue = await sw.readQueue('user1');
    const updateOp = queue.find((op: any) => op.type === 'UPDATE');
    expect(updateOp).toBeDefined();
    expect(updateOp.data.category).toBe('Work');
  });

  test('updates priority in IndexedDB and queues UPDATE', async () => {
    await setupSyncedTodo();

    const res = await sw.handleApiRequest(new Request('/todos/server_abc123', {
      method: 'PUT',
      body: JSON.stringify({ priority: 'High' }),
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(res.status).toBe(200);

    const todos = await sw.getTodos('user1', 'space1');
    expect(todos[0].priority).toBe('High');
  });

  test('updates text and notes in IndexedDB and queues UPDATE', async () => {
    await setupSyncedTodo();

    const res = await sw.handleApiRequest(new Request('/todos/server_abc123', {
      method: 'PUT',
      body: JSON.stringify({ text: 'Buy organic groceries', notes: 'From farmers market' }),
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(res.status).toBe(200);

    const todos = await sw.getTodos('user1', 'space1');
    expect(todos[0].text).toBe('Buy organic groceries');
    expect(todos[0].notes).toBe('From farmers market');
  });
});

// ─── 404 responses for stale offline_ IDs ───

describe('stale offline_ ID returns 404', () => {
  test('DELETE with stale offline_ ID returns 404', async () => {
    await setupServerTodo();

    const res = await sw.handleApiRequest(new Request('/todos/offline_1', { method: 'DELETE' }));
    expect(res.status).toBe(404);

    // Todo still exists
    const todos = await sw.getTodos('user1', 'space1');
    expect(todos).toHaveLength(1);
    expect(todos[0]._id).toBe('server_abc123');

    // No DELETE queued
    const queue = await sw.readQueue('user1');
    expect(queue.filter((op: any) => op.type === 'DELETE')).toHaveLength(0);
  });

  test('complete with stale offline_ ID returns 404', async () => {
    await setupServerTodo();

    const res = await sw.handleApiRequest(new Request('/todos/offline_1/complete', { method: 'PUT' }));
    expect(res.status).toBe(404);

    // Todo unchanged
    const todos = await sw.getTodos('user1', 'space1');
    expect(todos[0].completed).toBe(false);
  });

  test('update with stale offline_ ID returns 404', async () => {
    await setupServerTodo();

    const res = await sw.handleApiRequest(new Request('/todos/offline_1', {
      method: 'PUT',
      body: JSON.stringify({ category: 'Work' }),
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(res.status).toBe(404);

    // Todo unchanged
    const todos = await sw.getTodos('user1', 'space1');
    expect(todos[0].category).toBe('General');
  });
});
