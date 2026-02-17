/**
 * Regression test: create todo offline → go online (sync) → go offline → delete todo.
 *
 * The bug was that React state held stale offline_ IDs after sync replaced them
 * with server IDs in IndexedDB. The service worker's offline delete handler couldn't
 * find the offline_ ID, so the delete silently failed and the todo reappeared.
 *
 * Fix: Listen for SYNC_COMPLETE to refresh React state with server IDs.
 * This test validates the service worker side of the fix (IndexedDB operations).
 */
import makeServiceWorkerEnv from 'service-worker-mock';
import { IDBFactory } from 'fake-indexeddb';

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
});

test('delete synced todo while offline removes it from IndexedDB', async () => {
  const sw = require('../public/sw.js');
  await sw.putAuth('token123', 'user1');

  // Step 1: Create todo offline
  const offlineTodo = {
    _id: 'offline_1',
    text: 'Buy groceries',
    category: 'General',
    priority: 'Medium',
    completed: false,
    user_id: 'user1',
    space_id: 'space1',
  };
  await sw.putTodo(offlineTodo, 'user1');
  await sw.addQueue({ type: 'CREATE', data: offlineTodo }, 'user1');

  // Step 2: Go online — sync creates todo on server with real ID
  const serverTodo = { ...offlineTodo, _id: 'server_abc123' };
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => serverTodo,
  });

  await sw.syncQueue();

  // Verify sync worked: offline_ ID replaced with server ID
  const todosAfterSync = await sw.getTodos('user1', 'space1');
  expect(todosAfterSync.some((t: any) => t._id === 'server_abc123')).toBe(true);
  expect(todosAfterSync.some((t: any) => t._id === 'offline_1')).toBe(false);

  // Step 3: Go offline
  Object.defineProperty(global.navigator, 'onLine', { writable: true, value: false });

  // Step 4: Delete the todo via handleApiRequest (offline path) using SERVER ID
  const deleteRequest = new Request('/todos/server_abc123', { method: 'DELETE' });
  const deleteResponse = await sw.handleApiRequest(deleteRequest);
  expect(deleteResponse.status).toBe(204);

  // Step 5: Fetch todos (what frontend does after delete) — should be empty
  const getRequest = new Request('/todos?space_id=space1', { method: 'GET' });
  const getResponse = await sw.handleApiRequest(getRequest);
  const todos = await getResponse.json();
  expect(todos).toHaveLength(0);

  // Step 6: Verify DELETE is queued for server sync
  const queue = await sw.readQueue('user1');
  const deleteOp = queue.find((op: any) => op.type === 'DELETE');
  expect(deleteOp).toBeDefined();
  expect(deleteOp.data._id).toBe('server_abc123');
});

test('delete with stale offline_ ID fails silently (the bug this fix prevents)', async () => {
  const sw = require('../public/sw.js');
  await sw.putAuth('token123', 'user1');

  // Simulate the state AFTER sync: todo has server ID in IndexedDB
  const serverTodo = {
    _id: 'server_abc123',
    text: 'Buy groceries',
    category: 'General',
    priority: 'Medium',
    completed: false,
    user_id: 'user1',
    space_id: 'space1',
  };
  await sw.putTodo(serverTodo, 'user1');

  Object.defineProperty(global.navigator, 'onLine', { writable: true, value: false });

  // Try to delete using the STALE offline_ ID (what happened before the fix)
  const deleteRequest = new Request('/todos/offline_1', { method: 'DELETE' });
  const deleteResponse = await sw.handleApiRequest(deleteRequest);
  // Returns 204 but doesn't actually delete anything (ID not found)
  expect(deleteResponse.status).toBe(204);

  // Todo still exists because the offline_ ID didn't match
  const todos = await sw.getTodos('user1', 'space1');
  expect(todos).toHaveLength(1);
  expect(todos[0]._id).toBe('server_abc123');

  // No DELETE was queued (nothing was found to delete)
  const queue = await sw.readQueue('user1');
  expect(queue.filter((op: any) => op.type === 'DELETE')).toHaveLength(0);
});
