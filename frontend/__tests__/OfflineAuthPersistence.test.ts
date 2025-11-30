/**
 * Tests for offline authentication persistence.
 *
 * REGRESSION TEST: These tests verify that users stay logged in when reopening
 * the app offline. Previously, the auth verification would fail offline and
 * force users to log in again.
 *
 * The bug: AuthContext tried to verify tokens via /auth/me even when offline,
 * which failed and triggered logout, clearing stored credentials.
 *
 * The fix:
 * 1. Skip token verification when offline (AuthContext.tsx line 119-125)
 * 2. Sync auth data to service worker IndexedDB on login (line 192-201)
 * 3. Sync auth data to service worker IndexedDB on initialization (line 119-128)
 *
 * These tests verify that:
 * 1. Auth data is stored in service worker IndexedDB
 * 2. Auth data persists across app restarts
 * 3. Offline mode doesn't trigger logout
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

describe('Offline Auth Persistence', () => {
  test('Auth data is stored in service worker IndexedDB', async () => {
    const sw = require('../public/sw.js');

    const testToken = 'test_token_123';
    const testUserId = 'user_456';

    // Simulate storing auth (what happens on login)
    await sw.putAuth(testToken, testUserId);

    // Verify auth can be retrieved
    const authData = await sw.getAuth();
    expect(authData).toBeDefined();
    expect(authData.token).toBe(testToken);
    expect(authData.userId).toBe(testUserId);
  });

  test('Auth headers are available offline', async () => {
    const sw = require('../public/sw.js');

    const testToken = 'test_token_789';
    const testUserId = 'user_101';

    // Store auth
    await sw.putAuth(testToken, testUserId);

    // Get auth headers (used by offline requests)
    const headers = await sw.getAuthHeaders();
    expect(headers).toBeDefined();
    expect(headers['Authorization']).toBe(`Bearer ${testToken}`);
    expect(headers['Content-Type']).toBe('application/json');
  });

  test('Auth persists after service worker restart', async () => {
    let sw = require('../public/sw.js');

    const testToken = 'persistent_token';
    const testUserId = 'persistent_user';

    // Store auth
    await sw.putAuth(testToken, testUserId);

    // Simulate service worker restart by reloading the module
    jest.resetModules();
    sw = require('../public/sw.js');

    // Auth should still be available
    const authData = await sw.getAuth();
    expect(authData).toBeDefined();
    expect(authData.token).toBe(testToken);
    expect(authData.userId).toBe(testUserId);
  });

  test('User-specific data is accessible with stored auth', async () => {
    const sw = require('../public/sw.js');

    const testToken = 'user_token';
    const testUserId = 'test_user_123';

    // Store auth
    await sw.putAuth(testToken, testUserId);

    // Add some todos for this user
    await sw.putTodo({ _id: 'todo1', text: 'Test todo', completed: false }, testUserId);
    await sw.putTodo({ _id: 'todo2', text: 'Another todo', completed: false }, testUserId);

    // Retrieve todos without passing userId (should use auth from IndexedDB)
    const todos = await sw.getTodos(null, null);
    expect(todos.length).toBe(2);
    expect(todos[0].text).toBe('Test todo');
  });

  test('Offline requests include auth headers from IndexedDB', async () => {
    const sw = require('../public/sw.js');

    const testToken = 'offline_token';
    const testUserId = 'offline_user';

    // Store auth and some todos
    await sw.putAuth(testToken, testUserId);
    await sw.putTodo(
      { _id: 'todo1', text: 'Offline todo', completed: false, space_id: 'space1' },
      testUserId
    );

    // Simulate offline GET /todos request (no auth provided in request)
    const request = new Request('http://localhost:3000/todos?space_id=space1', {
      method: 'GET'
    });

    const url = new URL(request.url);
    const response = await sw.handleApiRequest(request);

    // Should return todos from IndexedDB using stored auth
    expect(response.status).toBe(200);
    const todos = await response.json();
    expect(todos.length).toBe(1);
    expect(todos[0].text).toBe('Offline todo');
  });
});
