/**
 * Tests for online transition race condition fix.
 *
 * REGRESSION TEST: This test verifies that going back online doesn't overwrite
 * pending offline changes due to a race condition between sync and fetch.
 *
 * The bug: When transitioning from offline to online:
 * 1. OfflineContext triggers syncQueue()
 * 2. AIToDoListApp calls fetchTodos()
 * 3. fetchTodos() might complete BEFORE syncQueue() uploads offline changes
 * 4. Service worker caches stale server data to IndexedDB
 * 5. Offline changes get overwritten with old server data
 *
 * The fix: Added sync protection to GET /todos (sw.js lines 673-694)
 * - Check if syncInProgress or there are pending todo operations
 * - Block caching server data during sync to prevent race condition
 * - Similar to existing protection for journals
 *
 * These tests verify that:
 * 1. Server todo data is NOT cached when sync is in progress
 * 2. Server todo data is NOT cached when there are pending operations
 * 3. Server todo data IS cached when sync is complete and no pending operations
 * 4. The fix prevents offline changes from being overwritten
 */

import makeServiceWorkerEnv from 'service-worker-mock';
import { IDBFactory } from 'fake-indexeddb';

beforeEach(() => {
  const env = makeServiceWorkerEnv();

  // Set navigator.onLine to true to simulate online mode
  Object.defineProperty(global, 'navigator', {
    value: { ...env.navigator, onLine: true },
    configurable: true,
    writable: true
  });

  (global as any).self = env;
  // Also set self.navigator.onLine for service worker context
  Object.defineProperty((global as any).self, 'navigator', {
    value: { ...env.navigator, onLine: true },
    configurable: true,
    writable: true
  });

  (global as any).indexedDB = new IDBFactory();
  (global as any).caches = env.caches;
  if (!(global as any).structuredClone) {
    (global as any).structuredClone = (obj: any) => JSON.parse(JSON.stringify(obj));
  }
  jest.resetModules();
});

describe('Online Transition Race Condition', () => {
  test('Server todo data is NOT cached when there are pending CREATE operations', async () => {
    const sw = require('../public/sw.js');

    const testUserId = 'user123';
    const spaceId = 'space456';

    // Setup: User is authenticated
    await sw.putAuth('token123', testUserId);

    // Add an offline todo to IndexedDB
    const offlineTodo = {
      _id: 'offline_1',
      text: 'Offline todo',
      completed: false,
      space_id: spaceId
    };
    await sw.putTodo(offlineTodo, testUserId);

    // Add a pending CREATE operation to the queue (simulating offline changes)
    await sw.addQueue({
      type: 'CREATE',
      data: offlineTodo
    }, testUserId);

    // Verify there's 1 offline todo in IndexedDB
    const todosBefore = await sw.getTodos(testUserId, spaceId);
    expect(todosBefore.length).toBe(1);
    expect(todosBefore[0].text).toBe('Offline todo');

    // Simulate GET /todos request with server data (what happens when coming back online)
    const serverTodos = [
      { _id: 'server1', text: 'Server todo 1', completed: false, space_id: spaceId },
      { _id: 'server2', text: 'Server todo 2', completed: false, space_id: spaceId }
    ];

    // Mock the fetch response - needs to be a proper Response-like object
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      clone: function() {
        return {
          json: async () => serverTodos,
          text: async () => JSON.stringify(serverTodos),
          blob: async () => new Blob([JSON.stringify(serverTodos)]),
          clone: () => this.clone()
        };
      },
      json: async () => serverTodos,
      text: async () => JSON.stringify(serverTodos)
    };
    global.fetch = jest.fn().mockResolvedValue(mockResponse);

    // Simulate the service worker handling GET /todos
    const request = new Request(`http://localhost:3141/todos?space_id=${spaceId}`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer token123' }
    });

    await sw.handleApiRequest(request);

    // KEY TEST: IndexedDB should still have only the offline todo
    // Server data should NOT be cached because there are pending operations
    const todosAfter = await sw.getTodos(testUserId, spaceId);
    expect(todosAfter.length).toBe(1);
    expect(todosAfter[0].text).toBe('Offline todo');
    expect(todosAfter[0]._id).toBe('offline_1');
  });

  test('Server todo data IS cached when there are NO pending operations', async () => {
    const sw = require('../public/sw.js');

    const testUserId = 'user456';
    const spaceId = 'space789';

    // Setup: User is authenticated, NO pending operations
    await sw.putAuth('token456', testUserId);

    // Verify IndexedDB is empty
    const todosBefore = await sw.getTodos(testUserId, spaceId);
    expect(todosBefore.length).toBe(0);

    // Simulate GET /todos request with server data
    const serverTodos = [
      { _id: 'server1', text: 'Server todo 1', completed: false, space_id: spaceId },
      { _id: 'server2', text: 'Server todo 2', completed: false, space_id: spaceId }
    ];

    // Mock the fetch response - needs to be a proper Response-like object
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      clone: function() {
        return {
          json: async () => serverTodos,
          text: async () => JSON.stringify(serverTodos),
          blob: async () => new Blob([JSON.stringify(serverTodos)]),
          clone: () => this.clone()
        };
      },
      json: async () => serverTodos,
      text: async () => JSON.stringify(serverTodos)
    };
    global.fetch = jest.fn().mockResolvedValue(mockResponse);

    // Simulate the service worker handling GET /todos
    const request = new Request(`http://localhost:3141/todos?space_id=${spaceId}`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer token456' }
    });

    await sw.handleApiRequest(request);

    // KEY TEST: IndexedDB should now have the server todos
    // Server data SHOULD be cached because there are NO pending operations
    const todosAfter = await sw.getTodos(testUserId, spaceId);
    expect(todosAfter.length).toBe(2);
    expect(todosAfter[0].text).toBe('Server todo 1');
    expect(todosAfter[1].text).toBe('Server todo 2');
  });

  test('Server todo data is NOT cached when there are pending UPDATE operations', async () => {
    const sw = require('../public/sw.js');

    const testUserId = 'user789';
    const spaceId = 'space101';

    // Setup: User is authenticated
    await sw.putAuth('token789', testUserId);

    // Add a todo to IndexedDB (already synced)
    const existingTodo = {
      _id: 'todo1',
      text: 'Original text',
      completed: false,
      space_id: spaceId
    };
    await sw.putTodo(existingTodo, testUserId);

    // Update the todo offline (simulating offline edit)
    const updatedTodo = {
      ...existingTodo,
      text: 'Updated offline text'
    };
    await sw.putTodo(updatedTodo, testUserId);

    // Add a pending UPDATE operation to the queue
    await sw.addQueue({
      type: 'UPDATE',
      data: updatedTodo
    }, testUserId);

    // Verify the updated text is in IndexedDB
    const todosBefore = await sw.getTodos(testUserId, spaceId);
    expect(todosBefore[0].text).toBe('Updated offline text');

    // Simulate GET /todos with stale server data (doesn't have the update yet)
    const serverTodos = [
      { _id: 'todo1', text: 'Original text', completed: false, space_id: spaceId }
    ];

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      clone: () => ({
        json: jest.fn().mockResolvedValue(serverTodos)
      }),
      json: jest.fn().mockResolvedValue(serverTodos)
    });

    const request = new Request(`http://localhost:3141/todos?space_id=${spaceId}`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer token789' }
    });

    await sw.handleApiRequest(request);

    // KEY TEST: IndexedDB should still have the updated text
    // Stale server data should NOT overwrite the pending update
    const todosAfter = await sw.getTodos(testUserId, spaceId);
    expect(todosAfter.length).toBe(1);
    expect(todosAfter[0].text).toBe('Updated offline text');
  });

  test('Returns IndexedDB data instead of server data when blocking', async () => {
    const sw = require('../public/sw.js');

    const testUserId = 'user888';
    const spaceId = 'space888';

    // Setup: User is authenticated
    await sw.putAuth('token888', testUserId);

    // Add offline todos to IndexedDB
    const offlineTodos = [
      { _id: 'offline_1', text: 'Offline todo 1', completed: false, space_id: spaceId },
      { _id: 'offline_2', text: 'Offline todo 2', completed: false, space_id: spaceId }
    ];
    for (const todo of offlineTodos) {
      await sw.putTodo(todo, testUserId);
    }

    // Add pending operation
    await sw.addQueue({
      type: 'CREATE',
      data: offlineTodos[0]
    }, testUserId);

    // Mock server response (empty - sync hasn't completed yet)
    const serverTodos = [];
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      clone: function() {
        return {
          json: async () => serverTodos,
          text: async () => JSON.stringify(serverTodos),
          blob: async () => new Blob([JSON.stringify(serverTodos)]),
          clone: () => this.clone()
        };
      },
      json: async () => serverTodos,
      text: async () => JSON.stringify(serverTodos)
    };
    global.fetch = jest.fn().mockResolvedValue(mockResponse);

    // Simulate GET /todos during sync
    const request = new Request(`http://localhost:3141/todos?space_id=${spaceId}`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer token888' }
    });

    const response = await sw.handleApiRequest(request);

    // KEY TEST: Response should contain IndexedDB data, not server data
    expect(response.status).toBe(200);
    const responseTodos = await response.json();
    expect(responseTodos.length).toBe(2);
    expect(responseTodos[0].text).toBe('Offline todo 1');
    expect(responseTodos[1].text).toBe('Offline todo 2');
    // NOT empty array from server
  });

  test('Pending operations in spaceA do NOT block caching for spaceB (space-specific approach)', async () => {
    const sw = require('../public/sw.js');

    const testUserId = 'user999';
    const spaceA = 'spaceA';
    const spaceB = 'spaceB';

    // Setup: User is authenticated
    await sw.putAuth('token999', testUserId);

    // Add a pending operation in spaceA
    await sw.addQueue({
      type: 'CREATE',
      data: { _id: 'offline_1', text: 'Offline todo', space_id: spaceA }
    }, testUserId);

    // Simulate GET /todos for spaceB (different space)
    const serverTodos = [
      { _id: 'server1', text: 'Space B todo', completed: false, space_id: spaceB }
    ];

    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      clone: function() {
        return {
          json: async () => serverTodos,
          text: async () => JSON.stringify(serverTodos),
          blob: async () => new Blob([JSON.stringify(serverTodos)]),
          clone: () => this.clone()
        };
      },
      json: async () => serverTodos,
      text: async () => JSON.stringify(serverTodos)
    };
    global.fetch = jest.fn().mockResolvedValue(mockResponse);

    const request = new Request(`http://localhost:3141/todos?space_id=${spaceB}`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer token999' }
    });

    const response = await sw.handleApiRequest(request);

    // KEY TEST: With space-specific approach, a pending op in spaceA does NOT block spaceB.
    // The server response is passed through directly (no early IndexedDB return).
    expect(response.status).toBe(200);
    const responseTodos = await response.json();
    expect(responseTodos.length).toBe(1); // spaceB server data IS returned
    expect(responseTodos[0].text).toBe('Space B todo');
  });
});
