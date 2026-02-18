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

describe('Bug 1: Per-operation queue deletion with retry tracking', () => {
  test('failed CREATE keeps op in queue with retryCount', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const offlineTodo = { _id: 'offline_1', text: 'test', user_id: 'user1' };
    await sw.putTodo(offlineTodo, 'user1');
    await sw.addQueue({ type: 'CREATE', data: offlineTodo }, 'user1');

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    await sw.syncQueue();

    const queue = await sw.readQueue('user1');
    expect(queue).toHaveLength(1);
    expect(queue[0].retryCount).toBe(1);
    expect(queue[0].type).toBe('CREATE');
  });

  test('mixed batch: success removes op, failure keeps op', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const todo1 = { _id: 'offline_1', text: 'todo1', user_id: 'user1' };
    const todo2 = { _id: 'offline_2', text: 'todo2', user_id: 'user1' };
    await sw.putTodo(todo1, 'user1');
    await sw.putTodo(todo2, 'user1');
    await sw.addQueue({ type: 'CREATE', data: todo1 }, 'user1');
    await sw.addQueue({ type: 'CREATE', data: todo2 }, 'user1');

    const serverTodo1 = { ...todo1, _id: 'server_1' };
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => serverTodo1 })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    await sw.syncQueue();

    const queue = await sw.readQueue('user1');
    expect(queue).toHaveLength(1);
    expect(queue[0].data._id).toBe('offline_2');
    expect(queue[0].retryCount).toBe(1);

    // Successfully synced todo should be in IndexedDB with server ID
    const todos = await sw.getTodos('user1');
    expect(todos.some((t: any) => t._id === 'server_1')).toBe(true);
  });

  test('retry count drops op after 3 failures', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const offlineTodo = { _id: 'offline_1', text: 'test', user_id: 'user1' };
    await sw.putTodo(offlineTodo, 'user1');
    await sw.addQueue({ type: 'CREATE', data: offlineTodo }, 'user1');

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    // First sync: retryCount = 1
    await sw.syncQueue();
    let queue = await sw.readQueue('user1');
    expect(queue).toHaveLength(1);
    expect(queue[0].retryCount).toBe(1);

    // Second sync: retryCount = 2
    await sw.syncQueue();
    queue = await sw.readQueue('user1');
    expect(queue).toHaveLength(1);
    expect(queue[0].retryCount).toBe(2);

    // Third sync: retryCount = 3, should be dropped
    await sw.syncQueue();
    queue = await sw.readQueue('user1');
    expect(queue).toHaveLength(0);
  });
});

describe('Bug 2: idMap survives clearQueue', () => {
  test('idMap persists after clearQueue', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Store an ID mapping
    await sw.putIdMap({ offline_1: 'server_1' }, 'user1');

    // Clear the queue
    await sw.clearQueue('user1');

    // idMap should still be there
    const idMap = await sw.getIdMap('user1');
    expect(idMap).toEqual({ offline_1: 'server_1' });
  });

  test('idMap persists across sync sessions', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // First sync: create offline todo -> server todo
    const offlineTodo = { _id: 'offline_1', text: 'test', user_id: 'user1' };
    await sw.putTodo(offlineTodo, 'user1');
    await sw.addQueue({ type: 'CREATE', data: offlineTodo }, 'user1');

    const serverTodo = { ...offlineTodo, _id: 'server_1' };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => serverTodo });

    await sw.syncQueue();

    // Second sync: update with offline ID should use mapping
    await sw.addQueue({ type: 'UPDATE', data: { _id: 'offline_1', text: 'updated', user_id: 'user1' } }, 'user1');

    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    await sw.syncQueue();

    // Should have translated offline_1 -> server_1 in the UPDATE call
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/todos/server_1',
      expect.objectContaining({ method: 'PUT' })
    );
  });
});

describe('Bug 3/4: All sync URLs are absolute', () => {
  test('syncQueue uses absolute URLs for all operation types', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Queue various operations
    await sw.addQueue({ type: 'UPDATE', data: { _id: 'todo1', text: 'test' } }, 'user1');
    await sw.addQueue({ type: 'COMPLETE', data: { _id: 'todo2', completed: true } }, 'user1');
    await sw.addQueue({ type: 'DELETE', data: { _id: 'todo3' } }, 'user1');
    await sw.addQueue({ type: 'DELETE_CATEGORY', data: { name: 'Work' } }, 'user1');
    await sw.addQueue({ type: 'RENAME_CATEGORY', data: { old_name: 'Old', new_name: 'New' } }, 'user1');

    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    await sw.syncQueue();

    // Verify NO relative URLs were used
    const calls = (fetch as jest.Mock).mock.calls;
    for (const [url] of calls) {
      expect(url).toMatch(/^https?:\/\//);
    }
  });
});

describe('Bug 5: Stale data cleanup on GET responses', () => {
  test('stale server todos removed after GET /todos', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Pre-populate with local data
    const activeTodo = { _id: 'server_1', text: 'Active', space_id: 'space1', user_id: 'user1' };
    const staleTodo = { _id: 'server_old', text: 'Stale', space_id: 'space1', user_id: 'user1' };
    const offlineTodo = { _id: 'offline_1', text: 'Offline', space_id: 'space1', user_id: 'user1' };
    await sw.putTodo(activeTodo, 'user1');
    await sw.putTodo(staleTodo, 'user1');
    await sw.putTodo(offlineTodo, 'user1');

    // Mock server returning only the active todo
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [activeTodo],
      clone: function() { return { json: async () => [activeTodo] }; }
    });

    Object.defineProperty(global.navigator, 'onLine', { writable: true, value: true });
    (global as any).self.location = { hostname: 'localhost' };

    const request = new Request('/todos?space_id=space1', { method: 'GET' });
    await sw.handleApiRequest(request);
    // Allow async stale cleanup to complete
    await new Promise(r => setTimeout(r, 50));

    const localTodos = await sw.getTodos('user1', 'space1');
    // Active todo should exist
    expect(localTodos.some((t: any) => t._id === 'server_1')).toBe(true);
    // Stale todo should be removed
    expect(localTodos.some((t: any) => t._id === 'server_old')).toBe(false);
    // Offline todo should be preserved
    expect(localTodos.some((t: any) => t._id === 'offline_1')).toBe(true);
  });

  test('different space data untouched by stale cleanup', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Todo in different space
    const otherSpaceTodo = { _id: 'server_other', text: 'Other Space', space_id: 'space2', user_id: 'user1' };
    await sw.putTodo(otherSpaceTodo, 'user1');

    // Mock server returning empty for space1
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
      clone: function() { return { json: async () => [] }; }
    });

    Object.defineProperty(global.navigator, 'onLine', { writable: true, value: true });
    (global as any).self.location = { hostname: 'localhost' };

    const request = new Request('/todos?space_id=space1', { method: 'GET' });
    await sw.handleApiRequest(request);
    // Allow async stale cleanup to complete
    await new Promise(r => setTimeout(r, 50));

    // Other space's todo should be untouched
    const otherSpaceTodos = await sw.getTodos('user1', 'space2');
    expect(otherSpaceTodos).toHaveLength(1);
    expect(otherSpaceTodos[0]._id).toBe('server_other');
  });

  test('stale journals removed after unfiltered GET /journals', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Pre-populate with local journals
    const activeJournal = { _id: 'journal_1', date: '2024-01-01', space_id: 'space1', text: 'Active' };
    const staleJournal = { _id: 'journal_old', date: '2024-01-02', space_id: 'space1', text: 'Stale' };
    await sw.putJournal(activeJournal, 'user1');
    await sw.putJournal(staleJournal, 'user1');

    // Mock server returning only the active journal (unfiltered request)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [activeJournal],
      clone: function() { return { json: async () => [activeJournal] }; }
    });

    Object.defineProperty(global.navigator, 'onLine', { writable: true, value: true });
    (global as any).self.location = { hostname: 'localhost' };

    // Mock syncQueue to prevent automatic execution
    const origSync = sw.syncQueue;
    sw.syncQueue = jest.fn().mockResolvedValue(undefined);

    // Unfiltered request (no date param) — should run stale cleanup
    const request = new Request('/journals?space_id=space1', { method: 'GET' });
    await sw.handleApiRequest(request);
    // Allow async stale cleanup to complete
    await new Promise(r => setTimeout(r, 50));

    sw.syncQueue = origSync;

    const localJournals = await sw.getJournals('user1', null, 'space1');
    expect(localJournals.some((j: any) => j._id === 'journal_1')).toBe(true);
    expect(localJournals.some((j: any) => j._id === 'journal_old')).toBe(false);
  });

  test('date-filtered GET /journals does NOT delete other journals', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Pre-populate with journals for different dates
    const dec1Journal = { _id: 'journal_dec1', date: '2024-12-01', space_id: 'space1', text: 'Dec 1' };
    const dec2Journal = { _id: 'journal_dec2', date: '2024-12-02', space_id: 'space1', text: 'Dec 2' };
    await sw.putJournal(dec1Journal, 'user1');
    await sw.putJournal(dec2Journal, 'user1');

    // Mock server returning only dec1 journal (date-filtered response)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => dec1Journal,
      clone: function() { return { json: async () => dec1Journal }; }
    });

    Object.defineProperty(global.navigator, 'onLine', { writable: true, value: true });
    (global as any).self.location = { hostname: 'localhost' };

    const origSync = sw.syncQueue;
    sw.syncQueue = jest.fn().mockResolvedValue(undefined);

    // Date-filtered request — should NOT run stale cleanup
    const request = new Request('/journals?date=2024-12-01&space_id=space1', { method: 'GET' });
    await sw.handleApiRequest(request);

    sw.syncQueue = origSync;

    // Both journals should still exist
    const localJournals = await sw.getJournals('user1');
    expect(localJournals.some((j: any) => j._id === 'journal_dec1')).toBe(true);
    expect(localJournals.some((j: any) => j._id === 'journal_dec2')).toBe(true);
  });
});

describe('Bug 6: Atomic queue manipulation', () => {
  test('journal queue update is atomic (queue length stays 1)', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Simulate offline journal creation
    const journalData = {
      _id: 'offline_journal_2024-01-01_123',
      user_id: 'user1',
      space_id: 'space1',
      date: '2024-01-01',
      text: 'First version',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_offline: true,
      updated_offline: true,
    };

    await sw.putJournal(journalData, 'user1');
    await sw.addQueue({ type: 'CREATE_JOURNAL', data: journalData }, 'user1');

    // Simulate offline journal update (second save)
    const request = new Request('/journals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2024-01-01', space_id: 'space1', text: 'Updated version' })
    });

    // Force offline handling
    Object.defineProperty(global.navigator, 'onLine', { writable: true, value: false });
    await sw.handleApiRequest(request);

    // Queue should still have exactly 1 entry (atomic update, not read-clear-rewrite)
    const queue = await sw.readQueue('user1');
    const journalOps = queue.filter((op: any) =>
      op.type === 'CREATE_JOURNAL' || op.type === 'UPDATE_JOURNAL'
    );
    expect(journalOps).toHaveLength(1);
    expect(journalOps[0].data.text).toBe('Updated version');
  });

  test('other ops survive journal queue update', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Add a todo CREATE to the queue
    const todoOp = { type: 'CREATE', data: { _id: 'offline_todo', text: 'test', user_id: 'user1' } };
    await sw.addQueue(todoOp, 'user1');

    // Add a journal CREATE to the queue
    const journalData = {
      _id: 'offline_journal_2024-01-01_123',
      user_id: 'user1',
      space_id: null,
      date: '2024-01-01',
      text: 'First version',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_offline: true,
      updated_offline: true,
    };
    await sw.putJournal(journalData, 'user1');
    await sw.addQueue({ type: 'CREATE_JOURNAL', data: journalData }, 'user1');

    // Simulate journal update
    const request = new Request('/journals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2024-01-01', space_id: null, text: 'Updated' })
    });

    Object.defineProperty(global.navigator, 'onLine', { writable: true, value: false });
    await sw.handleApiRequest(request);

    // Both the todo CREATE and the journal op should be present
    const queue = await sw.readQueue('user1');
    expect(queue.some((op: any) => op.type === 'CREATE' && op.data._id === 'offline_todo')).toBe(true);
    expect(queue.some((op: any) => op.type === 'CREATE_JOURNAL')).toBe(true);
    expect(queue).toHaveLength(2);
  });
});

describe('Bug 7: Sync guard race condition', () => {
  test('concurrent sync calls: only one runs, pending flag triggers follow-up', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const offlineTodo = { _id: 'offline_1', text: 'test', user_id: 'user1' };
    await sw.putTodo(offlineTodo, 'user1');
    await sw.addQueue({ type: 'CREATE', data: offlineTodo }, 'user1');

    let fetchCallCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      fetchCallCount++;
      return Promise.resolve({
        ok: true,
        json: async () => ({ _id: `server_${fetchCallCount}`, text: 'test' })
      });
    });

    // Launch concurrent syncs
    const sync1 = sw.syncQueue();
    const sync2 = sw.syncQueue();
    const sync3 = sw.syncQueue();

    await Promise.all([sync1, sync2, sync3]);

    // Wait for any pending follow-up sync
    await new Promise(resolve => setTimeout(resolve, 50));

    // Only one sync should have processed the CREATE (the first one)
    // The follow-up sync should find an empty queue
    expect(fetchCallCount).toBe(1);
  });
});

describe('PR Review Fix: Unmapped offline ops are deferred, not dropped', () => {
  test('UPDATE/COMPLETE/DELETE for unmapped offline IDs stay in queue', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Queue a CREATE that will fail, plus dependent ops
    const offlineTodo = { _id: 'offline_1', text: 'test', user_id: 'user1' };
    await sw.putTodo(offlineTodo, 'user1');
    await sw.addQueue({ type: 'CREATE', data: offlineTodo }, 'user1');
    await sw.addQueue({ type: 'UPDATE', data: { _id: 'offline_1', text: 'updated', user_id: 'user1' } }, 'user1');
    await sw.addQueue({ type: 'COMPLETE', data: { _id: 'offline_1', completed: true } }, 'user1');

    // CREATE fails — no ID mapping created
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    await sw.syncQueue();

    const queue = await sw.readQueue('user1');
    // CREATE stays (retryCount 1), UPDATE stays (deferred), COMPLETE stays (deferred)
    expect(queue).toHaveLength(3);
    expect(queue.find((op: any) => op.type === 'CREATE').retryCount).toBe(1);
    // UPDATE and COMPLETE should NOT have retryCount (they weren't attempted)
    expect(queue.find((op: any) => op.type === 'UPDATE').retryCount).toBeUndefined();
    expect(queue.find((op: any) => op.type === 'COMPLETE').retryCount).toBeUndefined();
  });

  test('deferred ops execute after CREATE succeeds in next sync', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const offlineTodo = { _id: 'offline_1', text: 'test', completed: false, user_id: 'user1' };
    await sw.putTodo(offlineTodo, 'user1');
    await sw.addQueue({ type: 'CREATE', data: offlineTodo }, 'user1');
    await sw.addQueue({ type: 'COMPLETE', data: { _id: 'offline_1', completed: true } }, 'user1');

    // First sync: CREATE succeeds, COMPLETE gets deferred (mapping created mid-sync)
    const serverTodo = { ...offlineTodo, _id: 'server_1' };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => serverTodo });

    await sw.syncQueue();

    // Wait for follow-up sync (syncPending triggers it)
    await new Promise(resolve => setTimeout(resolve, 100));

    // After follow-up sync, COMPLETE should have been executed using the mapping
    const queue = await sw.readQueue('user1');
    expect(queue).toHaveLength(0);

    // fetch should have been called: POST /todos (CREATE) + PUT /todos/server_1/complete (COMPLETE)
    const fetchCalls = (fetch as jest.Mock).mock.calls;
    const completeCalls = fetchCalls.filter(([url]: any) => url.includes('/complete'));
    expect(completeCalls).toHaveLength(1);
    expect(completeCalls[0][0]).toBe('http://localhost:8000/todos/server_1/complete');
  });
});

describe('Bug 9: Complete offline todo updates all queue entries', () => {
  test('completing offline todo with pending UPDATE updates both queue entries', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Create offline todo
    const offlineTodo = {
      _id: 'offline_1',
      text: 'test',
      category: 'General',
      priority: 'Medium',
      completed: false,
      user_id: 'user1'
    };
    await sw.putTodo(offlineTodo, 'user1');
    await sw.addQueue({ type: 'CREATE', data: offlineTodo }, 'user1');

    // Update the todo (e.g., change category)
    const updatedTodo = { ...offlineTodo, category: 'Work' };
    await sw.putTodo(updatedTodo, 'user1');
    await sw.addQueue({ type: 'UPDATE', data: updatedTodo }, 'user1');

    // Now complete the todo offline
    Object.defineProperty(global.navigator, 'onLine', { writable: true, value: false });
    const completeRequest = new Request('/todos/offline_1/complete', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    });
    await sw.handleApiRequest(completeRequest);

    // Both CREATE and UPDATE queue entries should have completed=true
    const queue = await sw.readQueue('user1');
    const createOp = queue.find((op: any) => op.type === 'CREATE' && op.data._id === 'offline_1');
    const updateOp = queue.find((op: any) => op.type === 'UPDATE' && op.data._id === 'offline_1');

    expect(createOp).toBeDefined();
    expect(createOp.data.completed).toBe(true);
    expect(updateOp).toBeDefined();
    expect(updateOp.data.completed).toBe(true);
  });
});
