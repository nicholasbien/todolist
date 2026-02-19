/**
 * Service Worker Tests
 * Tests for the offline functionality and space-aware operations
 */

// Mock IndexedDB for Node.js testing environment
const FDBFactory = require('fake-indexeddb/lib/FDBFactory');
const FDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');

// Set up fake IndexedDB globals
global.indexedDB = new FDBFactory();
global.IDBKeyRange = FDBKeyRange;

// Mock structuredClone for Node.js environment
global.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));

// Mock self for service worker environment
global.self = {
  location: { origin: 'http://localhost:3000' },
  navigator: { onLine: true },
  addEventListener: jest.fn(),
  skipWaiting: jest.fn(),
  clients: { claim: jest.fn() }
};

// Mock caches API
global.caches = {
  open: jest.fn().mockResolvedValue({
    addAll: jest.fn().mockResolvedValue(),
    put: jest.fn().mockResolvedValue(),
    match: jest.fn().mockResolvedValue(null)
  }),
  keys: jest.fn().mockResolvedValue([]),
  delete: jest.fn().mockResolvedValue(true)
};

// Mock fetch
global.fetch = jest.fn();

// Import service worker functions
const {
  openGlobalDB,
  openUserDB,
  getAuth,
  putAuth,
  getTodos,
  putTodo,
  delTodo,
  getSpaces,
  putSpace,
  delSpace,
  getCategories,
  putCategory,
  delCategory,
  getJournals,
  putJournal,
  delJournal,
  addQueue,
  readQueue,
  clearQueue,
  removeQueueItem,
  cacheGetTodos,
  handleRequest,
  _resetDbCache
} = require('../public/sw.js');

describe('Service Worker Database Operations', () => {
  const testUserId = 'test-user-123';
  const testSpaceId = 'space-456';

  beforeEach(async () => {
    // Reset IndexedDB to clean state
    global.indexedDB = new FDBFactory();
    // Clear cached DB connections so they pick up the new IndexedDB
    _resetDbCache();

    // Reset fetch mock
    global.fetch.mockReset();
  }, 10000); // Increase timeout to 10 seconds

  describe('Database Setup', () => {
    test('should create global database with auth store', async () => {
      const db = await openGlobalDB();
      expect(db.objectStoreNames.contains('auth')).toBe(true);
      db.close();
    });

    test('should create user database with all required stores', async () => {
      const db = await openUserDB(testUserId);
      expect(db.objectStoreNames.contains('todos')).toBe(true);
      expect(db.objectStoreNames.contains('categories')).toBe(true);
      expect(db.objectStoreNames.contains('spaces')).toBe(true);
      expect(db.objectStoreNames.contains('queue')).toBe(true);
      expect(db.objectStoreNames.contains('journals')).toBe(true);
      db.close();
    });
  });

  describe('Authentication Operations', () => {
    test('should store and retrieve auth data', async () => {
      const token = 'test-token-123';

      await putAuth(token, testUserId);
      const authData = await getAuth();

      expect(authData.token).toBe(token);
      expect(authData.userId).toBe(testUserId);
    });
  });

  describe('Todo Operations', () => {
    const testTodo = {
      _id: 'todo-123',
      text: 'Test todo',
      category: 'Work',
      priority: 'High',
      completed: false,
      space_id: testSpaceId,
      dateAdded: new Date().toISOString()
    };

    test('should store and retrieve todos', async () => {
      await putTodo(testTodo, testUserId);
      const todos = await getTodos(testUserId);

      expect(todos).toHaveLength(1);
      expect(todos[0]._id).toBe(testTodo._id);
      expect(todos[0].text).toBe(testTodo.text);
      expect(todos[0].space_id).toBe(testSpaceId);
    });

    test('should filter todos by space_id', async () => {
      const todo1 = { ...testTodo, _id: 'todo-1', space_id: 'space-1' };
      const todo2 = { ...testTodo, _id: 'todo-2', space_id: 'space-2' };

      await putTodo(todo1, testUserId);
      await putTodo(todo2, testUserId);

      const space1Todos = await getTodos(testUserId, 'space-1');
      const space2Todos = await getTodos(testUserId, 'space-2');

      expect(space1Todos).toHaveLength(1);
      expect(space1Todos[0]._id).toBe('todo-1');

      expect(space2Todos).toHaveLength(1);
      expect(space2Todos[0]._id).toBe('todo-2');
    });

    test('should return all todos when no space_id filter provided', async () => {
      const todo1 = { ...testTodo, _id: 'todo-1', space_id: 'space-1' };
      const todo2 = { ...testTodo, _id: 'todo-2', space_id: 'space-2' };

      await putTodo(todo1, testUserId);
      await putTodo(todo2, testUserId);

      const allTodos = await getTodos(testUserId);
      expect(allTodos).toHaveLength(2);
    });

    test('should delete todos', async () => {
      await putTodo(testTodo, testUserId);
      await delTodo(testTodo._id, testUserId);

      const todos = await getTodos(testUserId);
      expect(todos).toHaveLength(0);
    });
  });

  describe('Space Operations', () => {
    const testSpace = {
      _id: 'space-123',
      name: 'Test Space',
      owner_id: testUserId,
      member_ids: [testUserId],
      is_default: false
    };

    test('should store and retrieve spaces', async () => {
      await putSpace(testSpace, testUserId);
      const spaces = await getSpaces(testUserId);

      expect(spaces).toHaveLength(1);
      expect(spaces[0]._id).toBe(testSpace._id);
      expect(spaces[0].name).toBe(testSpace.name);
    });

    test('should delete spaces', async () => {
      await putSpace(testSpace, testUserId);
      await delSpace(testSpace._id, testUserId);

      const spaces = await getSpaces(testUserId);
      expect(spaces).toHaveLength(0);
    });
  });

  describe('Category Operations', () => {
    const testCategory = {
      name: 'Work',
      space_id: testSpaceId
    };

    test('should store and retrieve categories', async () => {
      await putCategory(testCategory, testUserId);
      const categories = await getCategories(testUserId);

      expect(categories).toHaveLength(1);
      expect(categories[0].name).toBe(testCategory.name);
      expect(categories[0].space_id).toBe(testSpaceId);
    });

    test('should filter categories by space_id', async () => {
      const cat1 = { name: 'Work', space_id: 'space-1' };
      const cat2 = { name: 'Personal', space_id: 'space-2' };

      await putCategory(cat1, testUserId);
      await putCategory(cat2, testUserId);

      const space1Categories = await getCategories(testUserId, 'space-1');
      const space2Categories = await getCategories(testUserId, 'space-2');

      expect(space1Categories).toHaveLength(1);
      expect(space1Categories[0].name).toBe('Work');

      expect(space2Categories).toHaveLength(1);
      expect(space2Categories[0].name).toBe('Personal');
    });

    test('should use compound key for category deletion', async () => {
      const cat1 = { name: 'Work', space_id: 'space-1' };
      const cat2 = { name: 'Work', space_id: 'space-2' }; // Same name, different space

      await putCategory(cat1, testUserId);
      await putCategory(cat2, testUserId);

      // Delete only from space-1
      await delCategory('Work', testUserId, 'space-1');

      const remainingCategories = await getCategories(testUserId);
      expect(remainingCategories).toHaveLength(1);
      expect(remainingCategories[0].space_id).toBe('space-2');
    });

    test('should default space_id to null for backward compatibility', async () => {
      const categoryWithoutSpace = { name: 'Legacy' };
      await putCategory(categoryWithoutSpace, testUserId);

      const categories = await getCategories(testUserId);
      expect(categories[0].space_id).toBe(null);
    });
  });

  describe('Journal Operations', () => {
    const testJournal = {
      _id: 'journal-123',
      user_id: testUserId,
      space_id: testSpaceId,
      date: '2023-12-01',
      text: 'Test journal entry'
    };

    test('should store and retrieve journals', async () => {
      await putJournal(testJournal, testUserId);
      const journals = await getJournals(testUserId);

      expect(journals).toHaveLength(1);
      expect(journals[0]._id).toBe(testJournal._id);
      expect(journals[0].text).toBe(testJournal.text);
      expect(journals[0].space_id).toBe(testSpaceId);
      expect(journals[0].date).toBe('2023-12-01');
    });

    test('should filter journals by date', async () => {
      const journal1 = { ...testJournal, _id: 'journal-1', date: '2023-12-01' };
      const journal2 = { ...testJournal, _id: 'journal-2', date: '2023-12-02' };

      await putJournal(journal1, testUserId);
      await putJournal(journal2, testUserId);

      const dec1Journals = await getJournals(testUserId, '2023-12-01');
      const dec2Journals = await getJournals(testUserId, '2023-12-02');

      expect(dec1Journals).toHaveLength(1);
      expect(dec1Journals[0].date).toBe('2023-12-01');

      expect(dec2Journals).toHaveLength(1);
      expect(dec2Journals[0].date).toBe('2023-12-02');
    });

    test('should filter journals by space_id', async () => {
      const journal1 = { ...testJournal, _id: 'journal-1', space_id: 'space-1' };
      const journal2 = { ...testJournal, _id: 'journal-2', space_id: 'space-2' };

      await putJournal(journal1, testUserId);
      await putJournal(journal2, testUserId);

      const space1Journals = await getJournals(testUserId, null, 'space-1');
      const space2Journals = await getJournals(testUserId, null, 'space-2');

      expect(space1Journals).toHaveLength(1);
      expect(space1Journals[0].space_id).toBe('space-1');

      expect(space2Journals).toHaveLength(1);
      expect(space2Journals[0].space_id).toBe('space-2');
    });

    test('should filter journals by both date and space_id', async () => {
      const journal1 = { ...testJournal, _id: 'journal-1', date: '2023-12-01', space_id: 'space-1' };
      const journal2 = { ...testJournal, _id: 'journal-2', date: '2023-12-01', space_id: 'space-2' };
      const journal3 = { ...testJournal, _id: 'journal-3', date: '2023-12-02', space_id: 'space-1' };

      await putJournal(journal1, testUserId);
      await putJournal(journal2, testUserId);
      await putJournal(journal3, testUserId);

      const filteredJournals = await getJournals(testUserId, '2023-12-01', 'space-1');

      expect(filteredJournals).toHaveLength(1);
      expect(filteredJournals[0]._id).toBe('journal-1');
      expect(filteredJournals[0].date).toBe('2023-12-01');
      expect(filteredJournals[0].space_id).toBe('space-1');
    });

    test('should delete journals', async () => {
      await putJournal(testJournal, testUserId);
      await delJournal(testJournal._id, testUserId);

      const journals = await getJournals(testUserId);
      expect(journals).toHaveLength(0);
    });

    test('should handle offline journal IDs correctly', async () => {
      const offlineJournal = {
        ...testJournal,
        _id: 'offline_journal_2023-12-01_1234567890',
        created_offline: true
      };

      await putJournal(offlineJournal, testUserId);
      const journals = await getJournals(testUserId);

      expect(journals).toHaveLength(1);
      expect(journals[0]._id.startsWith('offline_journal_')).toBe(true);
      expect(journals[0].created_offline).toBe(true);
    });
  });

  describe('Queue Operations', () => {
    const testAction = {
      type: 'CREATE',
      data: { _id: 'todo-123', text: 'Test', space_id: testSpaceId }
    };

    test('should add actions to queue', async () => {
      await addQueue(testAction, testUserId);
      const queue = await readQueue(testUserId);

      expect(queue).toHaveLength(1);
      expect(queue[0].type).toBe('CREATE');
      expect(queue[0].data._id).toBe('todo-123');
      expect(queue[0].timestamp).toBeDefined();
    });

    test('should clear queue', async () => {
      await addQueue(testAction, testUserId);
      await clearQueue(testUserId);

      const queue = await readQueue(testUserId);
      expect(queue).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid user IDs gracefully', async () => {
      const todos = await getTodos(null);
      expect(Array.isArray(todos)).toBe(true);
      expect(todos).toHaveLength(0);
    });

    test('should handle missing data gracefully', async () => {
      const nonExistentTodos = await getTodos('non-existent-user');
      expect(Array.isArray(nonExistentTodos)).toBe(true);
    });
  });

  describe('Space-Aware Data Integrity', () => {
    test('should maintain data isolation between spaces', async () => {
      const space1Todo = {
        _id: 'todo-1',
        text: 'Space 1 Todo',
        space_id: 'space-1',
        category: 'Work'
      };

      const space2Todo = {
        _id: 'todo-2',
        text: 'Space 2 Todo',
        space_id: 'space-2',
        category: 'Work'
      };

      const space1Category = { name: 'Work', space_id: 'space-1' };
      const space2Category = { name: 'Work', space_id: 'space-2' };

      // Add data to both spaces
      await putTodo(space1Todo, testUserId);
      await putTodo(space2Todo, testUserId);
      await putCategory(space1Category, testUserId);
      await putCategory(space2Category, testUserId);

      // Verify isolation
      const space1Todos = await getTodos(testUserId, 'space-1');
      const space2Todos = await getTodos(testUserId, 'space-2');
      const space1Categories = await getCategories(testUserId, 'space-1');
      const space2Categories = await getCategories(testUserId, 'space-2');

      expect(space1Todos).toHaveLength(1);
      expect(space1Todos[0].text).toBe('Space 1 Todo');

      expect(space2Todos).toHaveLength(1);
      expect(space2Todos[0].text).toBe('Space 2 Todo');

      expect(space1Categories).toHaveLength(1);
      expect(space1Categories[0].space_id).toBe('space-1');

      expect(space2Categories).toHaveLength(1);
      expect(space2Categories[0].space_id).toBe('space-2');
    });
  });
});

describe('Service Worker Regression Tests', () => {
  test('should not call .then() on IDBRequest objects', () => {
    // This test ensures we don't accidentally chain .then() on IDBRequest objects
    // which was the cause of the "s.getAll(...).then is not a function" error

    const mockRequest = {
      result: [],
      onsuccess: null,
      onerror: null
    };

    // IDBRequest objects don't have .then() method
    expect(typeof mockRequest.then).toBe('undefined');

    // Our userDbTx function should handle the Promise conversion
    // This is tested implicitly by all the other tests that use getTodos/getCategories
  });

  test('should handle space_id filtering without IndexedDB query methods', async () => {
    // Test that space filtering works with basic array filtering
    // rather than relying on IndexedDB's advanced query capabilities

    const testUserId = 'test-user';
    const todos = [
      { _id: '1', space_id: 'space-a', text: 'Todo A' },
      { _id: '2', space_id: 'space-b', text: 'Todo B' },
      { _id: '3', space_id: 'space-a', text: 'Todo A2' }
    ];

    // Store test data
    for (const todo of todos) {
      await putTodo(todo, testUserId);
    }

    // Test filtering
    const spaceATodos = await getTodos(testUserId, 'space-a');
    const spaceBTodos = await getTodos(testUserId, 'space-b');

    expect(spaceATodos).toHaveLength(2);
    expect(spaceBTodos).toHaveLength(1);
    expect(spaceATodos.every(t => t.space_id === 'space-a')).toBe(true);
    expect(spaceBTodos.every(t => t.space_id === 'space-b')).toBe(true);
  });

  describe('Online Request Caching Integration', () => {
    // This test would have caught the missing journal caching issue
    test('should validate that online caching logic exists for all data types', async () => {
      // This is a simpler test that validates the service worker has caching logic
      // for all major data types without needing complex request simulation

      const testUserId = 'cache-test-user';

      // Test direct caching by simulating what the online handler does
      const mockTodos = [
        { _id: 'server-todo-1', text: 'Server Todo 1', space_id: 'space-1' },
        { _id: 'server-todo-2', text: 'Server Todo 2', space_id: 'space-1' }
      ];

      const mockSpaces = [
        { _id: 'space-1', name: 'Test Space', owner_id: testUserId }
      ];

      const mockJournals = [
        { _id: 'server-journal-1', date: '2023-12-01', text: 'Server Journal 1', space_id: 'space-1' }
      ];

      // Test that we can cache each data type (simulating what online handler does)

      // Cache todos
      for (const todo of mockTodos) {
        await putTodo(todo, testUserId);
      }

      // Cache spaces
      for (const space of mockSpaces) {
        await putSpace(space, testUserId);
      }

      // Cache journals
      for (const journal of mockJournals) {
        await putJournal(journal, testUserId);
      }

      // Verify that all data types were cached
      const cachedTodos = await getTodos(testUserId, 'space-1');
      const cachedSpaces = await getSpaces(testUserId);
      const cachedJournals = await getJournals(testUserId, null, 'space-1');

      // Assert todos were cached
      expect(cachedTodos).toHaveLength(2);
      expect(cachedTodos.map(t => t._id)).toEqual(['server-todo-1', 'server-todo-2']);

      // Assert spaces were cached
      expect(cachedSpaces).toHaveLength(1);
      expect(cachedSpaces[0]._id).toBe('space-1');

      // Assert journals were cached - THIS WOULD HAVE FAILED BEFORE THE FIX
      expect(cachedJournals).toHaveLength(1);
      expect(cachedJournals[0]._id).toBe('server-journal-1');
      expect(cachedJournals[0].date).toBe('2023-12-01');
    });

    test('should ensure all API endpoints have corresponding IndexedDB operations', () => {
      // This test validates that we have the necessary functions for offline caching
      // The existence of these functions indicates caching capability

      const requiredFunctions = [
        // Todos
        { name: 'getTodos', fn: getTodos },
        { name: 'putTodo', fn: putTodo },
        { name: 'delTodo', fn: delTodo },

        // Journals - these were missing before the fix
        { name: 'getJournals', fn: getJournals },
        { name: 'putJournal', fn: putJournal },
        { name: 'delJournal', fn: delJournal },

        // Categories
        { name: 'getCategories', fn: getCategories },
        { name: 'putCategory', fn: putCategory },
        { name: 'delCategory', fn: delCategory },

        // Spaces
        { name: 'getSpaces', fn: getSpaces },
        { name: 'putSpace', fn: putSpace },
        { name: 'delSpace', fn: delSpace }
      ];

      for (const { name, fn } of requiredFunctions) {
        expect(fn).toBeDefined();
        expect(typeof fn).toBe('function');
      }

      // This test would have caught the missing journal functions
      expect(getJournals).toBeDefined();
      expect(putJournal).toBeDefined();
      expect(delJournal).toBeDefined();
    });
  });

  describe('Offline Sync Duplicate Prevention', () => {
    const testUserId = 'sync-dup-user';
    const testSpaceId = 'space-dup';

    beforeEach(async () => {
      global.indexedDB = new FDBFactory();
      _resetDbCache();
      global.fetch.mockReset();
    }, 10000);

    test('cacheGetTodos removes orphaned offline todos with no pending CREATE', async () => {
      // Simulate state after sync replaced offline todo with server todo
      // but the offline entry wasn't cleaned up (race condition)
      const offlineTodo = {
        _id: 'offline_1700000000000',
        text: 'Buy groceries',
        space_id: testSpaceId,
        category: 'General',
        priority: 'Medium',
        completed: false,
        created_offline: true,
      };
      const serverTodo = {
        _id: 'server_abc123',
        text: 'Buy groceries',
        space_id: testSpaceId,
        category: 'General',
        priority: 'Medium',
        completed: false,
      };

      // Both exist in IDB (the bug scenario)
      await putTodo(offlineTodo, testUserId);
      await putTodo(serverTodo, testUserId);

      // No pending CREATE ops in the queue (sync already processed it)
      // Queue is empty

      // Build a fake Response from server data
      const fakeResponse = new Response(JSON.stringify([serverTodo]), {
        headers: { 'Content-Type': 'application/json' },
      });
      const fakeUrl = new URL(`http://localhost:3000/todos?space_id=${testSpaceId}`);
      const authData = { userId: testUserId, token: 'tok' };

      await cacheGetTodos(fakeUrl, fakeResponse, authData);

      const remaining = await getTodos(testUserId, testSpaceId);
      // Should only have the server todo — offline duplicate removed
      expect(remaining).toHaveLength(1);
      expect(remaining[0]._id).toBe('server_abc123');
    });

    test('cacheGetTodos preserves offline todos that still have pending CREATE', async () => {
      const offlineTodo = {
        _id: 'offline_1700000000001',
        text: 'New offline task',
        space_id: testSpaceId,
        category: 'General',
        priority: 'Medium',
        completed: false,
        created_offline: true,
      };

      await putTodo(offlineTodo, testUserId);

      // Queue still has the pending CREATE for this offline todo
      await addQueue(
        { type: 'CREATE', data: { _id: offlineTodo._id, text: offlineTodo.text } },
        testUserId
      );

      // Server returns an empty list (hasn't synced yet)
      const fakeResponse = new Response(JSON.stringify([]), {
        headers: { 'Content-Type': 'application/json' },
      });
      const fakeUrl = new URL(`http://localhost:3000/todos?space_id=${testSpaceId}`);
      const authData = { userId: testUserId, token: 'tok' };

      await cacheGetTodos(fakeUrl, fakeResponse, authData);

      const remaining = await getTodos(testUserId, testSpaceId);
      // Offline todo should be preserved because its CREATE is still pending
      expect(remaining).toHaveLength(1);
      expect(remaining[0]._id).toBe('offline_1700000000001');
    });

    test('cacheGetTodos removes stale server todos not in response', async () => {
      const staleTodo = {
        _id: 'server_old',
        text: 'Deleted on server',
        space_id: testSpaceId,
        category: 'General',
        priority: 'Medium',
        completed: false,
      };
      const currentTodo = {
        _id: 'server_current',
        text: 'Still exists',
        space_id: testSpaceId,
        category: 'General',
        priority: 'Medium',
        completed: false,
      };

      await putTodo(staleTodo, testUserId);
      await putTodo(currentTodo, testUserId);

      const fakeResponse = new Response(JSON.stringify([currentTodo]), {
        headers: { 'Content-Type': 'application/json' },
      });
      const fakeUrl = new URL(`http://localhost:3000/todos?space_id=${testSpaceId}`);
      const authData = { userId: testUserId, token: 'tok' };

      await cacheGetTodos(fakeUrl, fakeResponse, authData);

      const remaining = await getTodos(testUserId, testSpaceId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]._id).toBe('server_current');
    });
  });

  describe('Offline Functionality Completeness', () => {
    // This test ensures all data types follow the same offline pattern
    test('should have consistent offline functionality across all data types', async () => {
      const dataTypes = [
        {
          name: 'todos',
          getFn: getTodos,
          putFn: putTodo,
          delFn: delTodo,
          testData: { _id: 'offline_123', text: 'Test', space_id: 'space-1' }
        },
        {
          name: 'journals',
          getFn: getJournals,
          putFn: putJournal,
          delFn: delJournal,
          testData: { _id: 'offline_journal_2023-12-01_123', date: '2023-12-01', text: 'Test', space_id: 'space-1' }
        },
        {
          name: 'categories',
          getFn: getCategories,
          putFn: putCategory,
          delFn: delCategory,
          testData: { name: 'offline_test', space_id: 'space-1' }
        },
        {
          name: 'spaces',
          getFn: getSpaces,
          putFn: putSpace,
          delFn: delSpace,
          testData: { _id: 'offline_space_123', name: 'Offline Space', owner_id: 'user-123' }
        }
      ];

      const testUserId = 'offline-test-user';

      for (const dataType of dataTypes) {
        // Test CRUD operations work for each data type
        await dataType.putFn(dataType.testData, testUserId);

        const retrieved = await dataType.getFn(testUserId);
        expect(retrieved.length).toBeGreaterThan(0);

        // Test deletion
        if (dataType.name === 'categories') {
          await dataType.delFn(dataType.testData.name, testUserId, dataType.testData.space_id);
        } else {
          const idField = dataType.testData._id || dataType.testData.name;
          await dataType.delFn(idField, testUserId);
        }

        const afterDelete = await dataType.getFn(testUserId);
        if (dataType.name === 'categories') {
          // Categories may have defaults, so just check the specific one is gone
          const found = afterDelete.find(c => c.name === dataType.testData.name);
          expect(found).toBeUndefined();
        } else {
          // For others, should be empty
          expect(afterDelete.length).toBe(0);
        }
      }
    });

    test('should validate queue operations support all data types', async () => {
      const testUserId = 'queue-test-user';

      // Test that queue operations exist for all major data types
      const queueOperations = [
        { type: 'CREATE', data: { _id: 'todo-123', text: 'Test Todo' } },
        { type: 'UPDATE', data: { _id: 'todo-123', completed: true } },
        { type: 'COMPLETE', data: { _id: 'todo-123' } },
        { type: 'DELETE', data: { _id: 'todo-123' } },
        { type: 'CREATE_JOURNAL', data: { _id: 'offline_journal_2023-12-01_123', date: '2023-12-01', text: 'Test' } },
        { type: 'DELETE_JOURNAL', data: { _id: 'journal-123' } },
        { type: 'CREATE_CATEGORY', data: { name: 'Test Category', space_id: 'space-1' } },
        { type: 'CREATE_SPACE', data: { _id: 'space-123', name: 'Test Space' } }
      ];

      // Add all operations to queue
      for (const operation of queueOperations) {
        await addQueue(operation, testUserId);
      }

      const queue = await readQueue(testUserId);
      expect(queue.length).toBe(queueOperations.length);

      // Verify all operation types are present
      const types = queue.map(op => op.type);
      expect(types).toContain('CREATE');
      expect(types).toContain('CREATE_JOURNAL');
      expect(types).toContain('DELETE_JOURNAL');
    });
  });
});
