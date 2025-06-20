import makeServiceWorkerEnv from 'service-worker-mock';
import { IDBFactory } from 'fake-indexeddb';

beforeEach(() => {
  const env = makeServiceWorkerEnv();
  Object.defineProperty(global, 'navigator', { value: env.navigator, configurable: true });
  (global as any).self = env;
  env.navigator.onLine = true;
  (global as any).Request = env.Request;
  (global as any).Response = env.Response;
  (global as any).indexedDB = new IDBFactory();
  (global as any).caches = env.caches;
  if (!(global as any).structuredClone) {
    (global as any).structuredClone = (obj: any) => JSON.parse(JSON.stringify(obj));
  }
  jest.resetModules();
});

test('offline todo creation preserves space_id', async () => {
  const sw = require('../public/sw.js');
  await sw.putAuth('token123', 'user1');

  const request = new Request('/todos', {
    method: 'POST',
    body: JSON.stringify({ text: 'task', space_id: 'spaceA' }),
  });

  const resp = await sw.offlineFallback(request, new URL('http://localhost/todos'));
  const todo = await resp.json();

  expect(todo.space_id).toBe('spaceA');

  const todos = await sw.getTodos('user1');
  expect(todos[0].space_id).toBe('spaceA');

  const queue = await sw.readQueue('user1');
  expect(queue[0].data.space_id).toBe('spaceA');
});

test('offline GET /spaces returns cached spaces', async () => {
  const sw = require('../public/sw.js');
  await sw.putAuth('token123', 'user1');

  await sw.putSpace({ _id: 's1', name: 'My Space' }, 'user1');

  const request = new Request('/spaces');
  const resp = await sw.offlineFallback(request, new URL('http://localhost/spaces'));
  const spaces = await resp.json();

  expect(spaces).toHaveLength(1);
  expect(spaces[0]._id).toBe('s1');
});

test.skip('offline space creation works (not fully supported yet)', async () => {
  // NOTE: Offline space creation is implemented but not fully supported yet
  // because frontend requests for categories with offline space IDs cause 400 errors
  // when sent to the backend. Need to handle offline space ID routing properly.

  const sw = require('../public/sw.js');
  await sw.putAuth('token123', 'user1');

  const request = new Request('/spaces', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test Space' }),
  });

  const resp = await sw.offlineFallback(request, new URL('http://localhost/spaces'));
  const space = await resp.json();

  expect(space.name).toBe('Test Space');
  expect(space._id).toMatch(/^offline_space_/);
  expect(space.owner_id).toBe('user1');
  expect(space.member_ids).toEqual(['user1']);
  expect(space.created_offline).toBe(true);

  // Verify space is stored in IndexedDB
  const spaces = await sw.getSpaces('user1');
  expect(spaces).toHaveLength(1);
  expect(spaces[0].name).toBe('Test Space');

  // Verify space creation is queued for sync
  const queue = await sw.readQueue('user1');
  expect(queue).toHaveLength(1);
  expect(queue[0].type).toBe('CREATE_SPACE');
  expect(queue[0].data.name).toBe('Test Space');
});
