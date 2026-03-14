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

describe('Offline Chat - Phase 1: IndexedDB Stores and Cache', () => {
  test('chat_sessions store exists after DB init', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // putChatSession should work (store exists)
    const session = {
      _id: 'session1',
      title: 'Test Session',
      space_id: 'space1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await sw.putChatSession(session, 'user1');
    const sessions = await sw.getChatSessions('user1');
    expect(sessions.length).toBe(1);
    expect(sessions[0]._id).toBe('session1');
    expect(sessions[0].cached_at).toBeDefined();
  });

  test('filters sessions by space_id', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    await sw.putChatSession({ _id: 's1', space_id: 'spaceA', title: 'A' }, 'user1');
    await sw.putChatSession({ _id: 's2', space_id: 'spaceB', title: 'B' }, 'user1');
    await sw.putChatSession({ _id: 's3', space_id: 'spaceA', title: 'C' }, 'user1');

    const filtered = await sw.getChatSessions('user1', 'spaceA');
    expect(filtered.length).toBe(2);
    expect(filtered.every((s: any) => s.space_id === 'spaceA')).toBe(true);
  });

  test('stores and retrieves chat messages by session', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const msg1 = { _id: 'msg1', session_id: 'sess1', role: 'user', content: 'Hello', created_at: '2026-01-01T00:00:00Z' };
    const msg2 = { _id: 'msg2', session_id: 'sess1', role: 'assistant', content: 'Hi', created_at: '2026-01-01T00:01:00Z' };
    const msg3 = { _id: 'msg3', session_id: 'sess2', role: 'user', content: 'Other', created_at: '2026-01-01T00:00:00Z' };

    await sw.putChatMessage(msg1, 'user1');
    await sw.putChatMessage(msg2, 'user1');
    await sw.putChatMessage(msg3, 'user1');

    const sess1Messages = await sw.getChatMessages('user1', 'sess1');
    expect(sess1Messages.length).toBe(2);

    const sess2Messages = await sw.getChatMessages('user1', 'sess2');
    expect(sess2Messages.length).toBe(1);
  });

  test('deletes messages by session', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    await sw.putChatMessage({ _id: 'msg1', session_id: 'sess1', role: 'user', content: 'A' }, 'user1');
    await sw.putChatMessage({ _id: 'msg2', session_id: 'sess1', role: 'assistant', content: 'B' }, 'user1');
    await sw.putChatMessage({ _id: 'msg3', session_id: 'sess2', role: 'user', content: 'C' }, 'user1');

    await sw.delChatMessagesBySession('sess1', 'user1');

    const remaining1 = await sw.getChatMessages('user1', 'sess1');
    expect(remaining1.length).toBe(0);

    const remaining2 = await sw.getChatMessages('user1', 'sess2');
    expect(remaining2.length).toBe(1);
  });

  test('cacheGetChatSessions stores sessions from response', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const mockSessions = [
      { _id: 'cs1', title: 'Chat 1', space_id: 'sp1' },
      { _id: 'cs2', title: 'Chat 2', space_id: 'sp1' },
    ];
    const mockResponse = { json: async () => mockSessions };
    const mockUrl = new URL('http://localhost/agent/sessions?space_id=sp1');

    await sw.cacheGetChatSessions(mockUrl, mockResponse, { userId: 'user1' });

    const cached = await sw.getChatSessions('user1');
    expect(cached.length).toBe(2);
  });

  test('cacheGetChatSession stores session with messages', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const mockSessionData = {
      _id: 'sess1',
      title: 'Test',
      messages: [
        { _id: 'msg1', role: 'user', content: 'Hello' },
        { _id: 'msg2', role: 'assistant', content: 'Hi there' },
      ],
    };
    const mockResponse = { json: async () => mockSessionData };
    const mockUrl = new URL('http://localhost/agent/sessions/sess1');

    await sw.cacheGetChatSession(mockUrl, mockResponse, { userId: 'user1' });

    const sessions = await sw.getChatSessions('user1');
    expect(sessions.length).toBe(1);
    expect(sessions[0]._id).toBe('sess1');

    const messages = await sw.getChatMessages('user1', 'sess1');
    expect(messages.length).toBe(2);
    expect(messages.every((m: any) => m.session_id === 'sess1')).toBe(true);
  });

  test('clearChatSessions removes all sessions and messages', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    await sw.putChatSession({ _id: 's1', title: 'A' }, 'user1');
    await sw.putChatMessage({ _id: 'm1', session_id: 's1', role: 'user', content: 'X' }, 'user1');

    await sw.clearChatSessions('user1');

    expect((await sw.getChatSessions('user1')).length).toBe(0);
    expect((await sw.getChatMessages('user1', 's1')).length).toBe(0);
  });
});

describe('Offline Chat - Phase 2: Offline Message Sending', () => {
  test('syncQueue processes SEND_CHAT_MESSAGE operations', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Enqueue an offline message
    await sw.addQueue({
      type: 'SEND_CHAT_MESSAGE',
      data: {
        session_id: 'sess1',
        role: 'user',
        content: 'Hello from offline',
        offline_msg_id: 'offline_msg_123',
      },
    }, 'user1');

    // Store the offline message in cache
    await sw.putChatMessage({
      _id: 'offline_msg_123',
      session_id: 'sess1',
      role: 'user',
      content: 'Hello from offline',
      pending_sync: true,
    }, 'user1');

    // Mock the server response
    const serverMsg = { _id: 'server_msg_456', role: 'user', content: 'Hello from offline', created_at: '2026-01-01T00:00:00Z' };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => serverMsg,
    });

    await sw.syncQueue();

    // Offline message should be removed from queue
    const queue = await sw.readQueue('user1');
    expect(queue.length).toBe(0);

    // Server message should replace offline message
    const messages = await sw.getChatMessages('user1', 'sess1');
    expect(messages.some((m: any) => m._id === 'server_msg_456')).toBe(true);
    expect(messages.some((m: any) => m._id === 'offline_msg_123')).toBe(false);
  });
});

describe('Offline Chat - Phase 3: TTL and Storage Limits', () => {
  test('evicts sessions older than TTL', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Create a session with very old cached_at
    const oldTimestamp = Date.now() - (sw.CHAT_TTL_DAYS + 1) * 24 * 60 * 60 * 1000;
    await sw.putChatSession({ _id: 'old_sess', title: 'Old', cached_at: oldTimestamp }, 'user1');
    // Override cached_at since putChatSession sets it to now
    const db = await sw.openUserDB('user1');
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['chat_sessions'], 'readwrite');
      const store = tx.objectStore('chat_sessions');
      store.put({ _id: 'old_sess', title: 'Old', cached_at: oldTimestamp });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    await sw.putChatSession({ _id: 'new_sess', title: 'New' }, 'user1');

    await sw.evictStaleChatSessions('user1');

    const remaining = await sw.getChatSessions('user1');
    expect(remaining.length).toBe(1);
    expect(remaining[0]._id).toBe('new_sess');
  });

  test('enforces max session count', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Create more sessions than the limit
    for (let i = 0; i < sw.CHAT_MAX_SESSIONS + 5; i++) {
      await sw.putChatSession({ _id: `sess_${i}`, title: `Session ${i}` }, 'user1');
    }

    await sw.evictStaleChatSessions('user1');

    const remaining = await sw.getChatSessions('user1');
    expect(remaining.length).toBe(sw.CHAT_MAX_SESSIONS);
  });

  test('trims messages beyond per-session limit', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Create more messages than the limit
    for (let i = 0; i < sw.CHAT_MAX_MESSAGES_PER_SESSION + 10; i++) {
      await sw.putChatMessage({
        _id: `msg_${i}`,
        session_id: 'sess1',
        role: 'user',
        content: `Message ${i}`,
        created_at: new Date(2026, 0, 1, 0, i).toISOString(),
      }, 'user1');
    }

    await sw.trimChatMessages('sess1', 'user1');

    const remaining = await sw.getChatMessages('user1', 'sess1');
    expect(remaining.length).toBe(sw.CHAT_MAX_MESSAGES_PER_SESSION);
  });

  test('constants have correct default values', () => {
    const sw = require('../public/sw.js');
    expect(sw.CHAT_MAX_SESSIONS).toBe(50);
    expect(sw.CHAT_MAX_MESSAGES_PER_SESSION).toBe(200);
    expect(sw.CHAT_TTL_DAYS).toBe(30);
  });
});

describe('Offline Chat - Phase 4: Conflict Handling', () => {
  test('cacheGetChatSession replaces existing cached messages', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Pre-populate with old cached messages
    await sw.putChatMessage({ _id: 'old_msg1', session_id: 'sess1', role: 'user', content: 'Old 1' }, 'user1');
    await sw.putChatMessage({ _id: 'old_msg2', session_id: 'sess1', role: 'assistant', content: 'Old 2' }, 'user1');

    // Simulate server GET response with new messages
    const serverData = {
      _id: 'sess1',
      title: 'Test',
      messages: [
        { _id: 'new_msg1', role: 'user', content: 'New 1' },
        { _id: 'new_msg2', role: 'assistant', content: 'New 2' },
        { _id: 'new_msg3', role: 'user', content: 'New 3' },
      ],
    };
    const mockResponse = { json: async () => serverData };
    const mockUrl = new URL('http://localhost/agent/sessions/sess1');

    await sw.cacheGetChatSession(mockUrl, mockResponse, { userId: 'user1' });

    const messages = await sw.getChatMessages('user1', 'sess1');
    // Old messages should be gone, only new ones remain
    expect(messages.length).toBe(3);
    expect(messages.some((m: any) => m._id === 'old_msg1')).toBe(false);
    expect(messages.some((m: any) => m._id === 'new_msg1')).toBe(true);
  });

  test('SEND_CHAT_MESSAGE syncs in FIFO order via syncQueue', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Enqueue two messages in order
    await sw.addQueue({
      type: 'SEND_CHAT_MESSAGE',
      data: { session_id: 'sess1', role: 'user', content: 'First', offline_msg_id: 'off1' },
    }, 'user1');
    await sw.addQueue({
      type: 'SEND_CHAT_MESSAGE',
      data: { session_id: 'sess1', role: 'user', content: 'Second', offline_msg_id: 'off2' },
    }, 'user1');

    await sw.putChatMessage({ _id: 'off1', session_id: 'sess1', role: 'user', content: 'First', pending_sync: true }, 'user1');
    await sw.putChatMessage({ _id: 'off2', session_id: 'sess1', role: 'user', content: 'Second', pending_sync: true }, 'user1');

    const callOrder: string[] = [];
    global.fetch = jest.fn().mockImplementation(async (url: string, opts: any) => {
      const body = JSON.parse(opts.body);
      callOrder.push(body.content);
      return {
        ok: true,
        json: async () => ({ _id: `server_${body.content}`, role: 'user', content: body.content }),
      };
    });

    await sw.syncQueue();

    // Messages should be synced in FIFO order
    expect(callOrder).toEqual(['First', 'Second']);
    const queue = await sw.readQueue('user1');
    expect(queue.length).toBe(0);
  });
});
