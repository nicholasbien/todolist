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

test('syncQueue processes queued create operations', async () => {
  const sw = require('../public/sw.js');
  await sw.putAuth('token123', 'user1');

  const offlineTodo = {
    _id: 'offline_1',
    text: 'offline todo',
    category: 'General',
    priority: 'Medium',
    dateAdded: new Date().toISOString(),
    completed: false,
    user_id: 'user1',
  };
  await sw.putTodo(offlineTodo, 'user1');
  await sw.addQueue({ type: 'CREATE', data: offlineTodo }, 'user1');

  const serverTodo = { ...offlineTodo, _id: 'server123' };
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => serverTodo,
  });

  await sw.syncQueue();

  expect(fetch).toHaveBeenCalledWith('/todos', expect.objectContaining({ method: 'POST' }));
  const queue = await sw.readQueue('user1');
  expect(queue.length).toBe(0);
  const todos = await sw.getTodos('user1');
  expect(todos.some((t: any) => t._id === 'server123')).toBe(true);
});
