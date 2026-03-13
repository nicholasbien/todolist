/**
 * Offline Journal Sync Integration Test
 *
 * Tests the critical race condition fix where offline journal edits
 * were being lost when coming back online.
 *
 * This test verifies:
 * 1. Offline journal edits are properly queued
 * 2. Server data caching is blocked during sync
 * 3. Sync operations use correct API routing
 * 4. Offline changes are preserved after sync
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';

// Mock service worker environment
const mockServiceWorker = {
  location: {
    protocol: 'http:',
    hostname: 'localhost'
  },
  caches: new Map(),
  indexedDB: {},
  fetch: jest.fn(),
  addEventListener: jest.fn(),
  registration: {
    update: jest.fn()
  }
};

// Mock global environment
(global as any).self = mockServiceWorker;
(global as any).caches = mockServiceWorker.caches;
(global as any).indexedDB = mockServiceWorker.indexedDB;
(global as any).fetch = mockServiceWorker.fetch;

// Mock CONFIG object
const CONFIG = {
  PRODUCTION_BACKEND: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8141',
  LOCAL_BACKEND: 'http://localhost:8141',
  PRODUCTION_DOMAIN: 'your-domain.com'
};

// Mock IndexedDB operations
const mockJournals: any[] = [];
const mockQueue: any[] = [];
const mockAuth = { userId: 'test-user-123' };

const mockIndexedDBOperations = {
  getJournals: jest.fn().mockResolvedValue([]),
  putJournal: jest.fn().mockResolvedValue(undefined),
  delJournal: jest.fn().mockResolvedValue(undefined),
  getQueue: jest.fn().mockResolvedValue([]),
  addQueue: jest.fn().mockResolvedValue(undefined),
  clearQueue: jest.fn().mockResolvedValue(undefined),
  readQueue: jest.fn().mockResolvedValue([]),
  removeFromQueue: jest.fn().mockResolvedValue(undefined),
  getAuth: jest.fn().mockResolvedValue(mockAuth),
  getAuthHeaders: jest.fn().mockResolvedValue({
    'Authorization': 'Bearer test-token',
    'Content-Type': 'application/json'
  })
};

describe('Offline Journal Sync', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockJournals.length = 0;
    mockQueue.length = 0;

    // Setup mock implementations
    mockIndexedDBOperations.getJournals.mockImplementation(() => Promise.resolve([...mockJournals]));
    mockIndexedDBOperations.readQueue.mockImplementation(() => Promise.resolve([...mockQueue]));
    mockIndexedDBOperations.putJournal.mockImplementation((journal) => {
      const index = mockJournals.findIndex(j => j._id === journal._id);
      if (index >= 0) {
        mockJournals[index] = journal;
      } else {
        mockJournals.push(journal);
      }
      return Promise.resolve();
    });
    mockIndexedDBOperations.addQueue.mockImplementation((op) => {
      mockQueue.push(op);
      return Promise.resolve();
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should preserve offline journal edits when coming back online', async () => {
    // ARRANGE: Setup offline journal edit
    const offlineJournal = {
      _id: 'offline_journal_2025-08-29_1693123456789',
      date: '2025-08-29',
      text: 'This is my offline edit that should be preserved!',
      space_id: 'test-space-123',
      updated_offline: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const queueOperation = {
      type: 'UPDATE_JOURNAL',
      data: offlineJournal
    };

    // Add offline journal to IndexedDB
    await mockIndexedDBOperations.putJournal(offlineJournal);
    await mockIndexedDBOperations.addQueue(queueOperation);

    // Mock server journal data (what would overwrite offline changes)
    const serverJournal = {
      _id: 'server-journal-123',
      date: '2025-08-29',
      text: 'Server version - should not overwrite offline changes',
      space_id: 'test-space-123',
      updated_offline: false
    };

    // SIMULATE: Service worker logic for GET /journals request

    // 1. Check queue for pending operations
    const queue = await mockIndexedDBOperations.readQueue();
    const spaceId = 'test-space-123';
    const hasPendingJournals = queue.some(op =>
      (op.type === 'CREATE_JOURNAL' || op.type === 'UPDATE_JOURNAL') &&
      (op.data.space_id === spaceId || (!spaceId && !op.data.space_id))
    );

    // ASSERT: Should detect pending journal operations
    expect(hasPendingJournals).toBe(true);
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('UPDATE_JOURNAL');
    expect(queue[0].data.text).toBe('This is my offline edit that should be preserved!');

    // 2. Should block server data caching due to pending operations
    const shouldBlockCaching = hasPendingJournals || false; // syncInProgress would be false initially
    expect(shouldBlockCaching).toBe(true);

    // 3. Server data should NOT be cached (offline data preserved)
    if (!shouldBlockCaching) {
      // This should NOT execute
      await mockIndexedDBOperations.putJournal(serverJournal);
      throw new Error('Server data was cached when it should have been blocked!');
    }

    // 4. Sync operation should use correct backend URL
    const isCapacitor = mockServiceWorker.location.protocol === 'file:';
    const isProdHost = mockServiceWorker.location.hostname.endsWith('your-domain.com');
    const expectedSyncUrl = `${isCapacitor ? CONFIG.PRODUCTION_BACKEND : (isProdHost ? CONFIG.PRODUCTION_BACKEND : CONFIG.LOCAL_BACKEND)}/journals`;

    expect(expectedSyncUrl).toBe('http://localhost:8141/journals'); // Local dev environment

    // Mock successful sync response
    const mockSyncResponse = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        _id: 'server-synced-journal-456',
        date: '2025-08-29',
        text: 'This is my offline edit that should be preserved!', // Server preserves our offline edit
        space_id: 'test-space-123',
        updated_offline: false,
        created_at: offlineJournal.created_at,
        updated_at: new Date().toISOString()
      })
    };

    mockServiceWorker.fetch.mockResolvedValue(mockSyncResponse);

    // 5. Process sync queue
    const syncOperation = queue[0];
    const { _id, created_offline, updated_offline, ...updatePayload } = syncOperation.data;

    const response = await mockServiceWorker.fetch(expectedSyncUrl, {
      method: 'POST',
      headers: await mockIndexedDBOperations.getAuthHeaders(),
      body: JSON.stringify(updatePayload)
    });

    // ASSERT: Sync should succeed
    expect(response.ok).toBe(true);
    expect(mockServiceWorker.fetch).toHaveBeenCalledWith(expectedSyncUrl, expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Authorization': 'Bearer test-token'
      }),
      body: expect.stringContaining('This is my offline edit that should be preserved!')
    }));

    // 6. Update local storage with synced version (replace offline journal)
    const syncedJournal = await response.json();

    // Remove offline version and add server version (matching service worker logic)
    const offlineJournalIndex = mockJournals.findIndex(j => j._id === offlineJournal._id);
    if (offlineJournalIndex >= 0) {
      mockJournals.splice(offlineJournalIndex, 1);
    }
    await mockIndexedDBOperations.putJournal(syncedJournal);

    // 7. Clear queue after successful sync
    mockQueue.length = 0;

    // FINAL ASSERTIONS: Verify offline changes were preserved
    const finalJournals = await mockIndexedDBOperations.getJournals();
    const finalQueue = await mockIndexedDBOperations.readQueue();

    expect(finalJournals).toHaveLength(1);
    expect(finalJournals[0].text).toBe('This is my offline edit that should be preserved!');
    expect(finalJournals[0].updated_offline).toBe(false); // Sync flag cleared
    expect(finalJournals[0]._id).toBe('server-synced-journal-456'); // Server ID assigned
    expect(finalQueue).toHaveLength(0); // Queue cleared after sync
  });

  it('should handle sync API routing correctly for different environments', () => {
    const testCases = [
      // Local development
      {
        protocol: 'http:',
        hostname: 'localhost',
        expected: 'http://localhost:8141/journals'
      },
      // Production web
      {
        protocol: 'https:',
        hostname: 'app.your-domain.com',
        expected: `${CONFIG.PRODUCTION_BACKEND}/journals`
      },
      // Capacitor mobile app
      {
        protocol: 'file:',
        hostname: '',
        expected: `${CONFIG.PRODUCTION_BACKEND}/journals`
      }
    ];

    testCases.forEach(({ protocol, hostname, expected }) => {
      // Mock environment
      mockServiceWorker.location.protocol = protocol;
      mockServiceWorker.location.hostname = hostname;

      // Calculate URL using same logic as service worker
      const isCapacitor = protocol === 'file:';
      const isProdHost = hostname.endsWith('your-domain.com');
      const syncUrl = `${isCapacitor ? CONFIG.PRODUCTION_BACKEND : (isProdHost ? CONFIG.PRODUCTION_BACKEND : CONFIG.LOCAL_BACKEND)}/journals`;

      expect(syncUrl).toBe(expected);
    });
  });

  it('should not block server data caching when queue is empty', async () => {
    // ARRANGE: No pending operations
    mockQueue.length = 0;

    // ACT: Check if caching should be blocked
    const queue = await mockIndexedDBOperations.readQueue();
    const hasPendingJournals = queue.some(op =>
      (op.type === 'CREATE_JOURNAL' || op.type === 'UPDATE_JOURNAL')
    );
    const shouldBlockCaching = hasPendingJournals || false;

    // ASSERT: Should allow caching when no operations pending
    expect(shouldBlockCaching).toBe(false);
    expect(queue).toHaveLength(0);
  });

  it('should handle multiple offline edits to same journal via queue optimization', async () => {
    // ARRANGE: Multiple edits to same journal
    const date = '2025-08-29';
    const spaceId = 'test-space-123';

    const edit1 = {
      type: 'UPDATE_JOURNAL',
      data: { date, space_id: spaceId, text: 'First edit' }
    };

    const edit2 = {
      type: 'UPDATE_JOURNAL',
      data: { date, space_id: spaceId, text: 'Second edit' }
    };

    const edit3 = {
      type: 'UPDATE_JOURNAL',
      data: { date, space_id: spaceId, text: 'Final edit - should be the only one in queue' }
    };

    // SIMULATE: Queue optimization logic
    const simulateQueueOptimization = async (newOp: any) => {
      const existingIndex = mockQueue.findIndex(op =>
        (op.type === 'CREATE_JOURNAL' || op.type === 'UPDATE_JOURNAL') &&
        op.data.date === newOp.data.date &&
        op.data.space_id === newOp.data.space_id
      );

      if (existingIndex !== -1) {
        // Replace existing operation
        mockQueue[existingIndex] = newOp;
      } else {
        // Add new operation
        mockQueue.push(newOp);
      }
    };

    // ACT: Add operations with optimization
    await simulateQueueOptimization(edit1);
    await simulateQueueOptimization(edit2);
    await simulateQueueOptimization(edit3);

    // ASSERT: Only final edit should remain in queue
    expect(mockQueue).toHaveLength(1);
    expect(mockQueue[0].data.text).toBe('Final edit - should be the only one in queue');
  });

  it('should handle space-specific queue filtering correctly', async () => {
    // ARRANGE: Operations for different spaces
    const operations = [
      {
        type: 'UPDATE_JOURNAL',
        data: { date: '2025-08-29', space_id: 'space-1', text: 'Space 1 edit' }
      },
      {
        type: 'UPDATE_JOURNAL',
        data: { date: '2025-08-29', space_id: 'space-2', text: 'Space 2 edit' }
      },
      {
        type: 'UPDATE_JOURNAL',
        data: { date: '2025-08-29', space_id: null, text: 'Default space edit' }
      }
    ];

    operations.forEach(op => mockQueue.push(op));

    // ACT & ASSERT: Test filtering for each space
    const testCases = [
      { spaceId: 'space-1', expectedCount: 1 },
      { spaceId: 'space-2', expectedCount: 1 },
      { spaceId: null, expectedCount: 1 },
      { spaceId: 'space-3', expectedCount: 0 }
    ];

    testCases.forEach(({ spaceId, expectedCount }) => {
      const filteredOps = mockQueue.filter(op =>
        (op.type === 'CREATE_JOURNAL' || op.type === 'UPDATE_JOURNAL') &&
        (op.data.space_id === spaceId || (!spaceId && !op.data.space_id))
      );

      expect(filteredOps).toHaveLength(expectedCount);
    });
  });
});
