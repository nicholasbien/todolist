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

    expect(fetch).toHaveBeenCalledWith('/todos', expect.objectContaining({ method: 'POST' }));
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

    // Should only make the final GET /todos call, not the individual operations
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/todos', expect.objectContaining({
      headers: expect.objectContaining({
        'Authorization': 'Bearer token123'
      })
    }));
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

    expect(fetch).toHaveBeenCalledWith('/categories', {
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

describe('Integration Tests', () => {
  test('complete offline todo lifecycle with completion sync', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // 1. Create offline todo
    const offlineTodo = {
      _id: 'offline_' + Date.now(),
      text: 'Complete offline todo',
      category: 'General',
      priority: 'Medium',
      dateAdded: new Date().toISOString(),
      dueDate: null,
      completed: false,
      user_id: 'user1',
      created_offline: true
    };

    await sw.putTodo(offlineTodo, 'user1');
    await sw.addQueue({ type: 'CREATE', data: offlineTodo }, 'user1');

    // 2. Complete todo offline (this tests the fix we implemented)
    const completedTodo = {
      ...offlineTodo,
      completed: true,
      dateCompleted: new Date().toISOString()
    };
    await sw.putTodo(completedTodo, 'user1');
    await sw.addQueue({ type: 'COMPLETE', data: { _id: offlineTodo._id, completed: true } }, 'user1');

    // Verify queue has both operations
    const queue = await sw.readQueue('user1');
    expect(queue).toHaveLength(2);
    expect(queue[0].type).toBe('CREATE');
    expect(queue[1].type).toBe('COMPLETE');

    // Mock server responses
    const serverTodo = { ...offlineTodo, _id: 'server_123', created_offline: false };
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => serverTodo })  // CREATE
      .mockResolvedValueOnce({ ok: true, json: async () => [serverTodo] }); // Final GET

    // Sync
    await sw.syncQueue();

    // Verify CREATE was synced but COMPLETE was skipped (offline ID)
    expect(fetch).toHaveBeenCalledWith('/todos', expect.objectContaining({ method: 'POST' }));
    expect(fetch).toHaveBeenCalledWith('/todos', expect.objectContaining({ headers: expect.any(Object) }));

    // Verify queue cleared
    const finalQueue = await sw.readQueue('user1');
    expect(finalQueue).toHaveLength(0);
  });
});
