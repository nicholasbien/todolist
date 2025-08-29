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

describe('Offline Journal Functionality', () => {
  test('creates journal entry offline and queues for sync', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const journalData = {
      date: '2023-12-01',
      text: 'Today was a great day!',
      space_id: 'space123'
    };

    // Mock fetch to simulate offline POST request
    const mockFetch = jest.fn();
    global.fetch = mockFetch;

    // Create offline journal request
    const request = new Request('/journals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer token123' },
      body: JSON.stringify(journalData)
    });

    const response = await sw.handleRequest(request);
    expect(response.status).toBe(200);

    const responseData = await response.json();
    expect(responseData._id).toMatch(/^offline_journal_/);
    expect(responseData.text).toBe('Today was a great day!');
    expect(responseData.date).toBe('2023-12-01');
    expect(responseData.space_id).toBe('space123');

    // Verify journal was stored in IndexedDB
    const journals = await sw.getJournals('user1');
    expect(journals.length).toBe(1);
    expect(journals[0].text).toBe('Today was a great day!');

    // Verify sync operation was queued
    const queue = await sw.readQueue('user1');
    expect(queue.length).toBe(1);
    expect(queue[0].type).toBe('CREATE_JOURNAL');
    expect(queue[0].data.text).toBe('Today was a great day!');
  });

  test('syncs offline journal to server and replaces with server version', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const offlineJournal = {
      _id: 'offline_journal_2023-12-01_12345',
      user_id: 'user1',
      date: '2023-12-01',
      text: 'Offline journal entry',
      space_id: 'space123',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await sw.putJournal(offlineJournal, 'user1');
    await sw.addQueue({ type: 'CREATE_JOURNAL', data: offlineJournal }, 'user1');

    // Mock successful server response
    const serverJournal = {
      ...offlineJournal,
      _id: 'server_journal_456',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => serverJournal,
    });

    await sw.syncQueue();

    // Verify correct API call was made (should use backend URL due to sync routing)
    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/journals', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Authorization': 'Bearer token123',
        'Content-Type': 'application/json'
      })
    }));

    // Verify queue was cleared
    const queue = await sw.readQueue('user1');
    expect(queue.length).toBe(0);

    // Verify offline journal was replaced with server journal
    const journals = await sw.getJournals('user1');
    expect(journals.length).toBe(1);
    expect(journals[0]._id).toBe('server_journal_456');
    expect(journals[0].text).toBe('Offline journal entry');
  });

  test('marks journal updates made offline', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const journalData = {
      date: '2023-12-02',
      text: 'First version',
      space_id: 'space123'
    };

    // Initial offline create
    let request = new Request('/journals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer token123' },
      body: JSON.stringify(journalData)
    });
    await sw.handleRequest(request);

    // Offline update to same journal
    request = new Request('/journals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer token123' },
      body: JSON.stringify({ ...journalData, text: 'Updated offline' })
    });
    await sw.handleRequest(request);

    const journals = await sw.getJournals('user1');
    expect(journals.length).toBe(1);
    expect(journals[0].text).toBe('Updated offline');
    expect(journals[0].updated_offline).toBe(true);
  });

  test('deletes offline journal and cancels pending create operation', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const offlineJournal = {
      _id: 'offline_journal_2023-12-01_12345',
      user_id: 'user1',
      date: '2023-12-01',
      text: 'Journal to delete',
      space_id: 'space123'
    };

    // Store journal and create queue operation
    await sw.putJournal(offlineJournal, 'user1');
    await sw.addQueue({ type: 'CREATE_JOURNAL', data: offlineJournal }, 'user1');

    // Mock DELETE request
    const request = new Request('/journals/offline_journal_2023-12-01_12345', {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer token123' }
    });

    const response = await sw.handleRequest(request);
    expect(response.status).toBe(204);

    // Verify journal was deleted from storage
    const journals = await sw.getJournals('user1');
    expect(journals.length).toBe(0);

    // Verify pending create operation was cancelled
    const queue = await sw.readQueue('user1');
    expect(queue.length).toBe(0);
  });

  test('deletes synced journal and queues server delete', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const syncedJournal = {
      _id: 'server_journal_456',
      user_id: 'user1',
      date: '2023-12-01',
      text: 'Synced journal to delete',
      space_id: 'space123'
    };

    await sw.putJournal(syncedJournal, 'user1');

    // Mock DELETE request
    const request = new Request('/journals/server_journal_456', {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer token123' }
    });

    const response = await sw.handleRequest(request);
    expect(response.status).toBe(204);

    // Verify journal was deleted from storage
    const journals = await sw.getJournals('user1');
    expect(journals.length).toBe(0);

    // Verify delete operation was queued for server
    const queue = await sw.readQueue('user1');
    expect(queue.length).toBe(1);
    expect(queue[0].type).toBe('DELETE_JOURNAL');
    expect(queue[0].data._id).toBe('server_journal_456');
  });

  test('syncs journal delete operation to server', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const deleteOp = {
      type: 'DELETE_JOURNAL',
      data: { _id: 'server_journal_456' }
    };

    await sw.addQueue(deleteOp, 'user1');

    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    await sw.syncQueue();

    // Verify correct DELETE API call was made (should use backend URL due to sync routing)
    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/journals/server_journal_456', expect.objectContaining({
      method: 'DELETE',
      headers: expect.objectContaining({
        'Authorization': 'Bearer token123'
      })
    }));

    // Verify queue was cleared
    const queue = await sw.readQueue('user1');
    expect(queue.length).toBe(0);
  });

  test('handles journal sync failure gracefully', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const offlineJournal = {
      _id: 'offline_journal_2023-12-01_12345',
      user_id: 'user1',
      date: '2023-12-01',
      text: 'Failed sync journal',
      space_id: 'space123'
    };

    await sw.putJournal(offlineJournal, 'user1');
    await sw.addQueue({ type: 'CREATE_JOURNAL', data: offlineJournal }, 'user1');

    // Mock server error
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500
    });

    await sw.syncQueue();

    // Verify queue was cleared even on failure (to prevent infinite retries)
    const queue = await sw.readQueue('user1');
    expect(queue.length).toBe(0);

    // Verify offline journal is still preserved
    const journals = await sw.getJournals('user1');
    expect(journals.length).toBe(1);
    expect(journals[0]._id).toBe('offline_journal_2023-12-01_12345');
  });

  test('filters journals by date and space for GET requests', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const journals = [
      {
        _id: 'journal1',
        user_id: 'user1',
        date: '2023-12-01',
        text: 'Journal 1',
        space_id: 'space123'
      },
      {
        _id: 'journal2',
        user_id: 'user1',
        date: '2023-12-02',
        text: 'Journal 2',
        space_id: 'space123'
      },
      {
        _id: 'journal3',
        user_id: 'user1',
        date: '2023-12-03',
        text: 'Journal 3',
        space_id: 'space456'
      }
    ];

    for (const journal of journals) {
      await sw.putJournal(journal, 'user1');
    }

    // Test date filtering
    const request1 = new Request('/journals?date=2023-12-01', {
      headers: { 'Authorization': 'Bearer token123' }
    });

    const response1 = await sw.handleRequest(request1);
    const data1 = await response1.json();
    expect(data1._id).toBe('journal1');

    // Test date and space filtering
    const request2 = new Request('/journals?date=2023-12-01&space_id=space123', {
      headers: { 'Authorization': 'Bearer token123' }
    });

    const response2 = await sw.handleRequest(request2);
    const data2 = await response2.json();
    expect(data2._id).toBe('journal1');
    expect(data2.space_id).toBe('space123');
  });

  test('maintains user isolation for journal data', async () => {
    const sw = require('../public/sw.js');

    // Setup two different users
    await sw.putAuth('token123', 'user1');

    const user1Journal = {
      _id: 'journal_user1',
      user_id: 'user1',
      date: '2023-12-01',
      text: 'User 1 journal',
      space_id: 'space123'
    };

    const user2Journal = {
      _id: 'journal_user2',
      user_id: 'user2',
      date: '2023-12-01',
      text: 'User 2 journal',
      space_id: 'space123'
    };

    await sw.putJournal(user1Journal, 'user1');
    await sw.putJournal(user2Journal, 'user2');

    // Verify user1 only sees their journal
    const user1Journals = await sw.getJournals('user1');
    expect(user1Journals.length).toBe(1);
    expect(user1Journals[0].text).toBe('User 1 journal');

    // Verify user2 only sees their journal
    const user2Journals = await sw.getJournals('user2');
    expect(user2Journals.length).toBe(1);
    expect(user2Journals[0].text).toBe('User 2 journal');
  });
});

describe('Journal Auto-save Integration', () => {
  test('handles rapid auto-save updates efficiently', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const baseJournal = {
      date: '2023-12-01',
      text: 'Initial text',
      space_id: 'space123'
    };

    // Simulate rapid auto-save updates
    for (let i = 1; i <= 5; i++) {
      const request = new Request('/journals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer token123' },
        body: JSON.stringify({ ...baseJournal, text: `Update ${i}` })
      });

      await sw.handleRequest(request);
    }

    // Should only have the latest version
    const journals = await sw.getJournals('user1');
    expect(journals.length).toBe(1);
    expect(journals[0].text).toBe('Update 5');

    // Should only have one create operation in queue (latest)
    const queue = await sw.readQueue('user1');
    expect(queue.length).toBe(1);
    expect(queue[0].data.text).toBe('Update 5');
  });
});
