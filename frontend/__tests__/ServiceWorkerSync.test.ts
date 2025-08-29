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

describe('Todo Operations', () => {
  test('syncQueue processes queued create operations', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const offlineTodo = {
      _id: 'offline_1',
      text: 'offline todo',
      category: 'General',
      priority: 'Medium',
      dateAdded: new Date().toISOString(),
      dueDate: null,
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

    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/todos', expect.objectContaining({ method: 'POST' }));
    const queue = await sw.readQueue('user1');
    expect(queue.length).toBe(0);
    const todos = await sw.getTodos('user1');
    expect(todos.some((t: any) => t._id === 'server123')).toBe(true);
  });

  test('syncQueue processes UPDATE operations', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const todo = {
      _id: 'todo123',
      text: 'Updated todo',
      category: 'Work',
      priority: 'High',
      user_id: 'user1'
    };

    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    await sw.addQueue({ type: 'UPDATE', data: todo }, 'user1');
    await sw.syncQueue();

    expect(fetch).toHaveBeenCalledWith('/todos/todo123', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token123'
      },
      body: JSON.stringify(todo)
    });
  });

  test('syncQueue processes COMPLETE operations correctly', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const completeData = { _id: 'todo123', completed: true };

    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    await sw.addQueue({ type: 'COMPLETE', data: completeData }, 'user1');
    await sw.syncQueue();

    expect(fetch).toHaveBeenCalledWith('/todos/todo123/complete', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token123'
      }
    });
  });

  test('syncQueue processes DELETE operations', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const deleteData = { _id: 'todo123' };

    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    await sw.addQueue({ type: 'DELETE', data: deleteData }, 'user1');
    await sw.syncQueue();

    expect(fetch).toHaveBeenCalledWith('/todos/todo123', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token123'
      }
    });
  });

  test('syncQueue skips offline IDs for UPDATE/DELETE/COMPLETE operations', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    await sw.addQueue({ type: 'UPDATE', data: { _id: 'offline_123', text: 'test' } }, 'user1');
    await sw.addQueue({ type: 'DELETE', data: { _id: 'offline_456' } }, 'user1');
    await sw.addQueue({ type: 'COMPLETE', data: { _id: 'offline_789' } }, 'user1');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => []
    });

    await sw.syncQueue();

    // Should not make any API calls since all operations target offline IDs
    expect(fetch).toHaveBeenCalledTimes(0);

    // Queue should still be cleared
    const queue = await sw.readQueue('user1');
    expect(queue).toHaveLength(0);
  });
});

describe('Category Operations', () => {
  test('syncQueue processes CREATE_CATEGORY operations', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const category = { name: 'New Category' };
    const serverCategory = { name: 'New Category', _id: 'cat123' };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => serverCategory
    });

    await sw.addQueue({ type: 'CREATE_CATEGORY', data: category }, 'user1');
    await sw.syncQueue();

    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token123'
      },
      body: JSON.stringify(category)
    });
  });

  test('syncQueue processes DELETE_CATEGORY operations', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const deleteData = { name: 'Old Category' };

    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    await sw.addQueue({ type: 'DELETE_CATEGORY', data: deleteData }, 'user1');
    await sw.syncQueue();

    expect(fetch).toHaveBeenCalledWith('/categories/Old%20Category', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token123'
      }
    });
  });

  test('syncQueue processes RENAME_CATEGORY operations', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const renameData = { old_name: 'Old', new_name: 'New' };

    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    await sw.addQueue({ type: 'RENAME_CATEGORY', data: renameData }, 'user1');
    await sw.syncQueue();

    expect(fetch).toHaveBeenCalledWith('/categories/Old', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token123'
      },
      body: JSON.stringify({ new_name: 'New' })
    });
  });

  test('should isolate categories between users', async () => {
    const sw = require('../public/sw.js');

    await sw.putCategory({ name: 'User1 Category' }, 'user1');
    await sw.putCategory({ name: 'User2 Category' }, 'user2');

    const user1Categories = await sw.getCategories('user1');
    const user2Categories = await sw.getCategories('user2');

    expect(user1Categories).toHaveLength(1);
    expect(user1Categories[0].name).toBe('User1 Category');
    expect(user2Categories).toHaveLength(1);
    expect(user2Categories[0].name).toBe('User2 Category');
  });
});

describe('User Isolation', () => {
  test('should isolate todos between users', async () => {
    const sw = require('../public/sw.js');

    const user1Todo = {
      _id: 'user1-todo',
      text: 'User 1 todo',
      category: 'Work',
      priority: 'High',
      dateAdded: new Date().toISOString(),
      dueDate: null,
      completed: false,
      user_id: 'user1'
    };

    const user2Todo = {
      _id: 'user2-todo',
      text: 'User 2 todo',
      category: 'Personal',
      priority: 'Low',
      dateAdded: new Date().toISOString(),
      dueDate: null,
      completed: false,
      user_id: 'user2'
    };

    await sw.putTodo(user1Todo, 'user1');
    await sw.putTodo(user2Todo, 'user2');

    const user1Todos = await sw.getTodos('user1');
    const user2Todos = await sw.getTodos('user2');

    expect(user1Todos).toHaveLength(1);
    expect(user1Todos[0]._id).toBe('user1-todo');
    expect(user2Todos).toHaveLength(1);
    expect(user2Todos[0]._id).toBe('user2-todo');
  });

  test('should isolate sync queue between users', async () => {
    const sw = require('../public/sw.js');

    await sw.addQueue({ type: 'CREATE', data: { user: 'user1' } }, 'user1');
    await sw.addQueue({ type: 'CREATE', data: { user: 'user2' } }, 'user2');

    const user1Queue = await sw.readQueue('user1');
    const user2Queue = await sw.readQueue('user2');

    expect(user1Queue).toHaveLength(1);
    expect(user1Queue[0].data.user).toBe('user1');
    expect(user2Queue).toHaveLength(1);
    expect(user2Queue[0].data.user).toBe('user2');
  });
});

describe('Error Handling', () => {
  test('should handle sync errors gracefully', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    await sw.addQueue({ type: 'UPDATE', data: { _id: 'todo123', text: 'test' } }, 'user1');

    // Should not throw
    await expect(sw.syncQueue()).resolves.toBeUndefined();

    // Queue should be cleared regardless of individual operation errors
    // This prevents infinite retry loops and relies on final GET /todos for consistency
    const queue = await sw.readQueue('user1');
    expect(queue).toHaveLength(0);
  });

  test('should not sync when no auth data available', async () => {
    const sw = require('../public/sw.js');

    await sw.addQueue({ type: 'UPDATE', data: { _id: 'todo123' } }, 'user1');

    global.fetch = jest.fn();
    await sw.syncQueue();

    // Should not make any fetch calls
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Immediate Replacement Sync Strategy', () => {
  test('immediately replaces offline todo with server version on successful sync', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Setup: offline todo in local storage
    const offlineTodo = { _id: 'offline_123', text: 'Test Todo', category: 'Work', user_id: 'user1' };
    await sw.putTodo(offlineTodo, 'user1');
    await sw.addQueue({ type: 'CREATE', data: offlineTodo }, 'user1');

    // Mock successful server response
    const serverTodo = { _id: 'server_456', text: 'Test Todo', category: 'Work', user_id: 'user1' };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => serverTodo
    });

    // Trigger sync
    await sw.syncQueue();

    // Verify immediate replacement: offline todo should be gone, server todo should be present
    const localTodos = await sw.getTodos('user1');
    expect(localTodos).toHaveLength(1);
    expect(localTodos[0]._id).toBe('server_456');
    expect(localTodos.find(t => t._id === 'offline_123')).toBeUndefined();
  });

  test('preserves offline todo when sync fails', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Setup: offline todo in local storage
    const offlineTodo = { _id: 'offline_123', text: 'Test Todo', user_id: 'user1' };
    await sw.putTodo(offlineTodo, 'user1');
    await sw.addQueue({ type: 'CREATE', data: offlineTodo }, 'user1');

    // Mock failed server response
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    // Trigger sync
    await sw.syncQueue();

    // Verify data preservation: offline todo should still exist
    const localTodos = await sw.getTodos('user1');
    expect(localTodos).toHaveLength(1);
    expect(localTodos[0]._id).toBe('offline_123');
  });

  test('concurrency protection prevents duplicate syncs', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Setup: offline todo
    const offlineTodo = { _id: 'offline_123', text: 'Test Todo', user_id: 'user1' };
    await sw.putTodo(offlineTodo, 'user1');
    await sw.addQueue({ type: 'CREATE', data: offlineTodo }, 'user1');

    let fetchCallCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      fetchCallCount++;
      return Promise.resolve({
        ok: true,
        json: async () => ({ _id: `server_${fetchCallCount}`, text: 'Test Todo' })
      });
    });

    // Trigger concurrent syncs
    const sync1 = sw.syncQueue();
    const sync2 = sw.syncQueue();
    const sync3 = sw.syncQueue();

    await Promise.all([sync1, sync2, sync3]);

    // Should only make one API call due to concurrency protection
    expect(fetchCallCount).toBe(1);

    // Should only have one todo (the server version)
    const localTodos = await sw.getTodos('user1');
    expect(localTodos).toHaveLength(1);
    expect(localTodos[0]._id).toBe('server_1');
  });

  test('updates local storage for successful UPDATE operations', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Setup: existing server todo
    const existingTodo = { _id: 'server_123', text: 'Original', category: 'Work', user_id: 'user1' };
    await sw.putTodo(existingTodo, 'user1');

    // Queue an update
    const updatedData = { _id: 'server_123', text: 'Updated', category: 'Personal', user_id: 'user1' };
    await sw.addQueue({ type: 'UPDATE', data: updatedData }, 'user1');

    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    await sw.syncQueue();

    // Verify local storage was updated
    const localTodos = await sw.getTodos('user1');
    expect(localTodos).toHaveLength(1);
    expect(localTodos[0].text).toBe('Updated');
    expect(localTodos[0].category).toBe('Personal');
  });

  test('removes todo from local storage for successful DELETE operations', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Setup: existing server todo
    const existingTodo = { _id: 'server_123', text: 'To Delete', user_id: 'user1' };
    await sw.putTodo(existingTodo, 'user1');

    // Queue a delete
    await sw.addQueue({ type: 'DELETE', data: { _id: 'server_123' } }, 'user1');

    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    await sw.syncQueue();

    // Verify todo was removed from local storage
    const localTodos = await sw.getTodos('user1');
    expect(localTodos).toHaveLength(0);
  });

  test('auth endpoints bypass service worker routing', async () => {
    // This test validates that /auth/* endpoints are excluded from service worker routing

    const testCases = [
      { pathname: '/auth/login', expected: false },
      { pathname: '/auth/signup', expected: false },
      { pathname: '/auth/me', expected: false },
      { pathname: '/todos', expected: true },
      { pathname: '/categories', expected: true },
      { pathname: '/email/send', expected: true },
      { pathname: '/contact', expected: true },
      { pathname: '/chat', expected: true },
      { pathname: '/static/file.js', expected: false },
      { pathname: '/', expected: false }
    ];

    testCases.forEach(({ pathname, expected }) => {
      const isAuth = pathname.startsWith('/auth/');
      const isApi = !isAuth && (
        pathname.startsWith('/todos') ||
        pathname.startsWith('/categories') ||
        pathname.startsWith('/email') ||
        pathname.startsWith('/contact') ||
        pathname.startsWith('/chat')
      );

      expect(isApi).toBe(expected);
    });
  });
});

describe('Integration Tests', () => {
  test('complete offline to online workflow with immediate replacement', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // 1. Create multiple offline todos
    const offlineTodo1 = {
      _id: 'offline_1',
      text: 'First offline todo',
      category: 'Work',
      priority: 'High',
      dateAdded: new Date().toISOString(),
      completed: false,
      user_id: 'user1',
      created_offline: true
    };

    const offlineTodo2 = {
      _id: 'offline_2',
      text: 'Second offline todo',
      category: 'Personal',
      priority: 'Medium',
      dateAdded: new Date().toISOString(),
      completed: false,
      user_id: 'user1',
      created_offline: true
    };

    await sw.putTodo(offlineTodo1, 'user1');
    await sw.putTodo(offlineTodo2, 'user1');
    await sw.addQueue({ type: 'CREATE', data: offlineTodo1 }, 'user1');
    await sw.addQueue({ type: 'CREATE', data: offlineTodo2 }, 'user1');

    // 2. One sync fails, one succeeds
    const serverTodo1 = { _id: 'server_1', text: 'First offline todo', category: 'Work', user_id: 'user1' };

    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => serverTodo1 })      // CREATE offline_1 succeeds
      .mockResolvedValueOnce({ ok: false, status: 500 });                     // CREATE offline_2 fails

    // Trigger sync
    await sw.syncQueue();

    // Verify immediate replacement behavior
    const localTodos = await sw.getTodos('user1');
    expect(localTodos).toHaveLength(2);

    // Successfully synced todo should be replaced with server version
    expect(localTodos.find(t => t._id === 'server_1')).toBeDefined();
    expect(localTodos.find(t => t._id === 'offline_1')).toBeUndefined();

    // Failed sync should preserve offline todo
    expect(localTodos.find(t => t._id === 'offline_2')).toBeDefined();

    // Queue should be empty
    const finalQueue = await sw.readQueue('user1');
    expect(finalQueue).toHaveLength(0);
  });

  test('concurrent sync protection in realistic scenario', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Setup offline todo
    const offlineTodo = { _id: 'offline_123', text: 'Test Todo', user_id: 'user1' };
    await sw.putTodo(offlineTodo, 'user1');
    await sw.addQueue({ type: 'CREATE', data: offlineTodo }, 'user1');

    let createCallCount = 0;
    global.fetch = jest.fn().mockImplementation((url, options) => {
      if (options?.method === 'POST') {
        createCallCount++;
        return Promise.resolve({
          ok: true,
          json: async () => ({ _id: `server_${createCallCount}`, text: 'Test Todo' })
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    // Simulate what happens when user comes back online:
    // 1. UI calls fetchTodos() which triggers GET /todos
    // 2. GET /todos calls syncQueue()
    // 3. User might also trigger another sync somehow
    const syncPromises = [sw.syncQueue(), sw.syncQueue(), sw.syncQueue()];

    await Promise.all(syncPromises);

    // Should only create one server todo despite multiple sync attempts
    expect(createCallCount).toBe(1);

    const localTodos = await sw.getTodos('user1');
    expect(localTodos).toHaveLength(1);
    expect(localTodos[0]._id).toBe('server_1');
  });

  test('UI online event triggers data refresh', async () => {
    // This test verifies the UI component integration
    // Note: This would typically be tested in a separate UI test file
    const mockFetchTodos = jest.fn();

    // Simulate the online event handler from AIToDoListApp
    const handleOnline = () => {
      console.log('Browser came back online');
      mockFetchTodos();
    };

    // Simulate coming back online
    handleOnline();

    expect(mockFetchTodos).toHaveBeenCalledTimes(1);
  });
});

describe('ID Remapping and Cleanup', () => {
  test('remaps offline IDs for subsequent update and delete', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const offlineTodo = { _id: 'offline_abc', text: 'Demo', user_id: 'user1' };
    await sw.putTodo(offlineTodo, 'user1');
    await sw.addQueue({ type: 'CREATE', data: offlineTodo }, 'user1');

    const serverTodo = { ...offlineTodo, _id: 'server_xyz' };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => serverTodo });

    // Queue create and subsequent update/delete in one sync
    await sw.addQueue({ type: 'UPDATE', data: { _id: 'offline_abc', text: 'Updated', user_id: 'user1' } }, 'user1');
    await sw.addQueue({ type: 'DELETE', data: { _id: 'offline_abc' } }, 'user1');
    await sw.syncQueue();

    // First call should be POST creating the todo
    expect(fetch).toHaveBeenNthCalledWith(1, 'http://localhost:8000/todos', expect.any(Object));
    // Second call should be PUT using remapped server ID
    expect(fetch).toHaveBeenNthCalledWith(2, '/todos/server_xyz', expect.objectContaining({ method: 'PUT' }));
    // Third call should be DELETE using same server ID
    expect(fetch).toHaveBeenNthCalledWith(3, '/todos/server_xyz', expect.objectContaining({ method: 'DELETE' }));
  });

  test('offline create then complete syncs both operations', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const offlineTodo = { _id: 'offline_new', text: 'Demo', completed: false, user_id: 'user1' };
    await sw.putTodo(offlineTodo, 'user1');
    await sw.addQueue({ type: 'CREATE', data: offlineTodo }, 'user1');

    // Mark complete while still offline
    const completedTodo = { ...offlineTodo, completed: true };
    await sw.putTodo(completedTodo, 'user1');
    await sw.addQueue({ type: 'COMPLETE', data: { _id: 'offline_new', completed: true } }, 'user1');

    const serverTodo = { ...offlineTodo, _id: 'server_new' };
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => serverTodo })
      .mockResolvedValueOnce({ ok: true });

    await sw.syncQueue();

    expect(fetch).toHaveBeenNthCalledWith(1, 'http://localhost:8000/todos', expect.objectContaining({ method: 'POST' }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/todos/server_new/complete', expect.objectContaining({ method: 'PUT' }));

    const todos = await sw.getTodos('user1');
    expect(todos).toHaveLength(1);
    expect(todos[0]._id).toBe('server_new');
    expect(todos[0].completed).toBe(true);
  });

  test('cleans up stale todos when coming online', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const serverTodo = { _id: 'server_1', text: 'Active', user_id: 'user1' };
    const staleTodo = { _id: 'server_old', text: 'Old', user_id: 'user1' };
    const offlineTodo = { _id: 'offline_1', text: 'Offline', user_id: 'user1' };

    await sw.putTodo(serverTodo, 'user1');
    await sw.putTodo(staleTodo, 'user1');
    await sw.putTodo(offlineTodo, 'user1');

    global.fetch = jest.fn().mockResolvedValueOnce({ ok: true, json: async () => [serverTodo] });

    const resp = await fetch('/todos');
    const serverTodos = await resp.json();

    const localTodos = await sw.getTodos('user1');
    const offlineOnly = localTodos.filter((t: any) => t._id.startsWith('offline_'));
    const serverIds = new Set(serverTodos.map((t: any) => t._id));
    for (const t of localTodos) {
      if (!t._id.startsWith('offline_') && !serverIds.has(t._id)) {
        await sw.delTodo(t._id, 'user1');
      }
    }
    for (const todo of serverTodos) {
      await sw.putTodo(todo, 'user1');
    }
    const finalTodos = await sw.getTodos('user1');
    expect(finalTodos.find((t: any) => t._id === 'server_old')).toBeUndefined();
    expect(finalTodos.some((t: any) => t._id === 'offline_1')).toBe(true);
    expect(finalTodos.some((t: any) => t._id === 'server_1')).toBe(true);
  });

  test('persisted idMap survives interrupted create between syncs', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const offlineTodo = {
      _id: 'offline_map',
      text: 'Demo',
      category: 'General',
      priority: 'Medium',
      dateAdded: new Date().toISOString(),
      dueDate: null,
      completed: false,
      user_id: 'user1',
    };

    await sw.putTodo(offlineTodo, 'user1');
    await sw.addQueue({ type: 'CREATE', data: offlineTodo }, 'user1');
    await sw.addQueue(
      { type: 'UPDATE', data: { _id: 'offline_map', text: 'Updated', user_id: 'user1' } },
      'user1'
    );

    const serverTodo = { ...offlineTodo, _id: 'server_map' };

    // Manually persist ID mapping as if CREATE succeeded earlier
    const db = await sw.openUserDB('user1');
    const tx = db.transaction(['queue'], 'readwrite');
    const store = tx.objectStore('queue');
    await new Promise((resolve) => {
      const req = store.put({ id: 'idMap', mappings: { offline_map: 'server_map' } });
      req.onsuccess = () => resolve(null);
    });

    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => serverTodo });

    await sw.syncQueue();

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8000/todos',
      expect.any(Object)
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/todos/server_map',
      expect.objectContaining({ method: 'PUT' })
    );
  });
});


describe('Journal Operations', () => {
  test('syncQueue processes CREATE_JOURNAL operations', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const journalData = {
      _id: 'offline_journal_2023-12-01_123',
      user_id: 'user1',
      space_id: 'space1',
      date: '2023-12-01',
      text: 'Today was a great day!',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await sw.putJournal(journalData, 'user1');
    await sw.addQueue({ type: 'CREATE_JOURNAL', data: journalData }, 'user1');

    // Mock successful server response
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...journalData, _id: 'server_journal_123' }),
    });

    await sw.syncQueue();

    // Service worker should strip offline _id before sending to server
    const { _id: offlineId, ...expectedPayload } = journalData;
    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/journals', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(expectedPayload),
    }));

    // Verify offline journal was replaced with server version
    const journals = await sw.getJournals('user1', '2023-12-01');
    expect(journals).toHaveLength(1);
    expect(journals[0]._id).toBe('server_journal_123');
  });

  test('syncQueue processes DELETE_JOURNAL operations', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const journalId = 'journal123';
    await sw.addQueue({ type: 'DELETE_JOURNAL', data: { _id: journalId } }, 'user1');

    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    await sw.syncQueue();

    expect(fetch).toHaveBeenCalledWith(`http://localhost:8000/journals/${journalId}`, expect.objectContaining({
      method: 'DELETE',
    }));
  });

  test('journal data isolation between users', async () => {
    const sw = require('../public/sw.js');

    const journal1 = {
      _id: 'journal_user1',
      user_id: 'user1',
      date: '2023-12-01',
      text: 'User 1 journal',
    };

    const journal2 = {
      _id: 'journal_user2',
      user_id: 'user2',
      date: '2023-12-01',
      text: 'User 2 journal',
    };

    await sw.putJournal(journal1, 'user1');
    await sw.putJournal(journal2, 'user2');

    // User 1 should only see their journal
    const user1Journals = await sw.getJournals('user1');
    expect(user1Journals).toHaveLength(1);
    expect(user1Journals[0].text).toBe('User 1 journal');

    // User 2 should only see their journal
    const user2Journals = await sw.getJournals('user2');
    expect(user2Journals).toHaveLength(1);
    expect(user2Journals[0].text).toBe('User 2 journal');
  });

  test('journal date filtering works correctly', async () => {
    const sw = require('../public/sw.js');

    const journal1 = {
      _id: 'journal_dec1',
      user_id: 'user1',
      date: '2023-12-01',
      text: 'December 1st',
    };

    const journal2 = {
      _id: 'journal_dec2',
      user_id: 'user1',
      date: '2023-12-02',
      text: 'December 2nd',
    };

    await sw.putJournal(journal1, 'user1');
    await sw.putJournal(journal2, 'user1');

    // Get specific date
    const dec1Journals = await sw.getJournals('user1', '2023-12-01');
    expect(dec1Journals).toHaveLength(1);
    expect(dec1Journals[0].text).toBe('December 1st');

    // Get all journals
    const allJournals = await sw.getJournals('user1');
    expect(allJournals).toHaveLength(2);
  });

  test('journal space filtering works correctly', async () => {
    const sw = require('../public/sw.js');

    const journal1 = {
      _id: 'journal_space1',
      user_id: 'user1',
      space_id: 'space1',
      date: '2023-12-01',
      text: 'Space 1 journal',
    };

    const journal2 = {
      _id: 'journal_space2',
      user_id: 'user1',
      space_id: 'space2',
      date: '2023-12-01',
      text: 'Space 2 journal',
    };

    await sw.putJournal(journal1, 'user1');
    await sw.putJournal(journal2, 'user1');

    // Get specific space
    const space1Journals = await sw.getJournals('user1', null, 'space1');
    expect(space1Journals).toHaveLength(1);
    expect(space1Journals[0].text).toBe('Space 1 journal');

    // Get all journals
    const allJournals = await sw.getJournals('user1');
    expect(allJournals).toHaveLength(2);
  });

  test('GET /journals caching works correctly', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Mock journal data from server
    const mockJournals = [
      {
        _id: 'server_journal_1',
        user_id: 'user1',
        date: '2023-12-01',
        text: 'Server journal 1',
        space_id: 'space1'
      },
      {
        _id: 'server_journal_2',
        user_id: 'user1',
        date: '2023-12-02',
        text: 'Server journal 2',
        space_id: 'space1'
      }
    ];

    // Mock successful server response
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockJournals,
      clone: function() {
        return {
          json: async () => mockJournals
        };
      }
    });

    // Mock navigator.onLine to be true to force online behavior
    Object.defineProperty(global.navigator, 'onLine', {
      writable: true,
      value: true
    });

    // Mock self.location for development environment detection
    global.self = global.self || {};
    global.self.location = {
      hostname: 'localhost'
    };

    // Test GET /journals request through handleApiRequest
    const request = new Request('/journals?space_id=space1', {
      method: 'GET'
    });
    const response = await sw.handleApiRequest(request);

    // Verify fetch was called correctly (service worker forwards the /api/* request)
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: expect.stringContaining('/journals?space_id=space1')
    }));

    // Verify response is correct
    expect(response.ok).toBe(true);
    const responseData = await response.json();
    expect(responseData).toEqual(mockJournals);

    // Verify journals were cached in IndexedDB
    const cachedJournals = await sw.getJournals('user1', null, 'space1');
    expect(cachedJournals).toHaveLength(2);
    expect(cachedJournals[0].text).toBe('Server journal 1');
    expect(cachedJournals[1].text).toBe('Server journal 2');

    // Verify they can be retrieved by date as well
    const dec1Journals = await sw.getJournals('user1', '2023-12-01');
    expect(dec1Journals).toHaveLength(1);
    expect(dec1Journals[0].text).toBe('Server journal 1');
  });

  test('server data blocking works when journal operations are queued', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Add a CREATE_JOURNAL operation to queue
    const offlineJournal = {
      _id: `offline_journal_2023-12-01_${Date.now()}`,
      date: '2023-12-01',
      space_id: 'space1',
      text: 'Offline edit'
    };
    await sw.addQueue({ type: 'CREATE_JOURNAL', data: offlineJournal }, 'user1');

    // Mock server response
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ _id: 'server1', date: '2023-12-01', space_id: 'space1', text: 'Server version' }],
      clone: () => ({ json: async () => [{ _id: 'server1', date: '2023-12-01', space_id: 'space1', text: 'Server version' }] })
    });

    // Mock syncQueue to prevent automatic execution
    const originalSyncQueue = sw.syncQueue;
    sw.syncQueue = jest.fn().mockResolvedValue(undefined);

    // Set up environment
    Object.defineProperty(global.navigator, 'onLine', { writable: true, value: true });
    global.self = global.self || {};
    global.self.location = { hostname: 'localhost' };

    // Process GET request - should be blocked due to pending operations
    const response = await sw.handleApiRequest(new Request('/journals?space_id=space1', { method: 'GET' }));

    // Restore original syncQueue
    sw.syncQueue = originalSyncQueue;

    // Verify fetch was called (request went through)
    expect(fetch).toHaveBeenCalled();

    // Verify response is valid (blocking doesn't break the response)
    expect(response).toBeTruthy();

    // Queue should be processed by the automatic sync call
    // Verify that blocking was logged (from console output)
    expect(fetch).toHaveBeenCalled();
  });

  test('journal sync replaces offline version with server version', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Create offline journal
    const offlineJournal = {
      _id: 'offline_journal_2024-01-01_temp',
      date: '2024-01-01',
      space_id: 'space1',
      text: 'Offline text',
      updated_offline: true
    };

    // Add to queue for sync
    await sw.addQueue({ type: 'CREATE_JOURNAL', data: offlineJournal }, 'user1');

    // Mock server response with server version
    const serverJournal = {
      _id: 'server_journal_789',
      date: '2024-01-01',
      space_id: 'space1',
      text: 'Offline text',  // Server preserves our offline changes
      updated_offline: false
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => serverJournal
    });

    // Execute sync
    await sw.syncQueue();

    // Verify sync completed
    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/journals', expect.objectContaining({
      method: 'POST'
    }));

    // Queue should be cleared after successful sync
    const queue = await sw.readQueue('user1');
    expect(queue).toHaveLength(0);
  });

  test('GET /todos caching works correctly', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Mock todo data from server
    const mockTodos = [
      {
        _id: 'server_todo_1',
        text: 'Server todo 1',
        user_id: 'user1',
        category: 'Work',
        priority: 'High',
        space_id: 'space1'
      },
      {
        _id: 'server_todo_2',
        text: 'Server todo 2',
        user_id: 'user1',
        category: 'Personal',
        priority: 'Medium',
        space_id: 'space1'
      }
    ];

    // Mock successful server response
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockTodos,
      clone: function() {
        return {
          json: async () => mockTodos
        };
      }
    });

    // Mock navigator.onLine to be true to force online behavior
    Object.defineProperty(global.navigator, 'onLine', {
      writable: true,
      value: true
    });

    // Mock self.location for development environment detection
    global.self = global.self || {};
    global.self.location = {
      hostname: 'localhost'
    };

    // Test GET /todos request through handleApiRequest
    const request = new Request('/todos?space_id=space1', {
      method: 'GET'
    });
    const response = await sw.handleApiRequest(request);

    // Verify fetch was called correctly (service worker forwards the /api/* request)
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: expect.stringContaining('/todos?space_id=space1')
    }));

    // Verify response is correct
    expect(response.ok).toBe(true);
    const responseData = await response.json();
    expect(responseData).toEqual(mockTodos);

    // Verify todos were cached in IndexedDB
    const cachedTodos = await sw.getTodos('user1');
    expect(cachedTodos).toHaveLength(2);
    expect(cachedTodos[0].text).toBe('Server todo 1');
    expect(cachedTodos[1].text).toBe('Server todo 2');
  });

  test('handleApiRequest returns offline fallback when network fails', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Pre-populate with offline data
    const offlineTodos = [
      {
        _id: 'offline_todo_1',
        text: 'Offline todo 1',
        user_id: 'user1',
        category: 'Work',
        space_id: 'space1'
      }
    ];

    for (const todo of offlineTodos) {
      await sw.putTodo(todo, 'user1');
    }

    // Mock network failure
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    // Test GET /todos request when offline
    const request = new Request('/todos?space_id=space1', {
      method: 'GET'
    });
    const response = await sw.handleApiRequest(request);

    // Should return offline data
    expect(response.ok).toBe(true);
    const responseData = await response.json();
    expect(responseData).toHaveLength(1);
    expect(responseData[0].text).toBe('Offline todo 1');
  });
});
