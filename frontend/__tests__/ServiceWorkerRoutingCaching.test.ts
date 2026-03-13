/**
 * Tests for the service worker routing and caching refactor:
 * - API_ROUTES single source of truth
 * - isApiPath() helper
 * - buildBackendRequest() extraction
 * - GET_CACHE_HANDLERS lookup table
 * - Extracted cache handler functions
 */

import makeServiceWorkerEnv from 'service-worker-mock';
import { IDBFactory } from 'fake-indexeddb';

/** Create a mock Response with .clone() and .json() support */
function mockResponse(data: any) {
  const body = JSON.stringify(data);
  return {
    ok: true,
    status: 200,
    clone() { return mockResponse(data); },
    json() { return Promise.resolve(data); },
    text() { return Promise.resolve(body); },
    headers: new Map([['Content-Type', 'application/json']]),
  };
}

/** Create a mock Request with .blob() support */
function mockRequest(url: string, init?: RequestInit) {
  const req = new Request(url, init);
  if (!req.blob) {
    (req as any).blob = async () => new Blob([init?.body as string || '']);
  }
  return req;
}

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

describe('API_ROUTES and isApiPath', () => {
  test('API_ROUTES contains all expected route prefixes', () => {
    const sw = require('../public/sw.js');
    const expected = [
      '/todos', '/categories', '/spaces', '/journals', '/insights',
      '/agent', '/auth', '/email', '/contact', '/export', '/health',
      '/briefings', '/activity-feed', '/memories', '/memory-logs'
    ];
    expect(sw.API_ROUTES).toEqual(expected);
  });

  test('isApiPath matches API routes', () => {
    const sw = require('../public/sw.js');
    expect(sw.isApiPath('/todos')).toBe(true);
    expect(sw.isApiPath('/todos?space_id=123')).toBe(true);
    expect(sw.isApiPath('/auth/login')).toBe(true);
    expect(sw.isApiPath('/auth/me')).toBe(true);
    expect(sw.isApiPath('/journals')).toBe(true);
    expect(sw.isApiPath('/agent/stream')).toBe(true);
    expect(sw.isApiPath('/health')).toBe(true);
  });

  test('isApiPath rejects non-API routes', () => {
    const sw = require('../public/sw.js');
    expect(sw.isApiPath('/')).toBe(false);
    expect(sw.isApiPath('/manifest.json')).toBe(false);
    expect(sw.isApiPath('/icon-192x192.png')).toBe(false);
    expect(sw.isApiPath('/_next/static/chunk.js')).toBe(false);
    expect(sw.isApiPath('/privacy')).toBe(false);
  });
});

describe('GET_CACHE_HANDLERS', () => {
  test('has handlers for cacheable GET endpoints', () => {
    const sw = require('../public/sw.js');
    expect(sw.GET_CACHE_HANDLERS['/todos']).toBeDefined();
    expect(sw.GET_CACHE_HANDLERS['/journals']).toBeDefined();
    expect(sw.GET_CACHE_HANDLERS['/categories']).toBeDefined();
    expect(sw.GET_CACHE_HANDLERS['/spaces']).toBeDefined();
  });

  test('does not have handlers for non-cacheable endpoints', () => {
    const sw = require('../public/sw.js');
    expect(sw.GET_CACHE_HANDLERS['/auth']).toBeUndefined();
    expect(sw.GET_CACHE_HANDLERS['/agent']).toBeUndefined();
    expect(sw.GET_CACHE_HANDLERS['/health']).toBeUndefined();
  });
});

describe('buildBackendRequest', () => {
  test('builds correct URL for production backend', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Override self.location after require — getBackendUrl reads it at call time
    Object.defineProperty((global as any).self, 'location', {
      value: { hostname: 'todolist.nyc', protocol: 'https:', origin: 'https://todolist.nyc' },
      configurable: true,
      writable: true,
    });

    const request = mockRequest('https://todolist.nyc/todos?space_id=abc');
    const url = new URL('https://todolist.nyc/todos?space_id=abc');
    const { targetUrl } = await sw.buildBackendRequest(request, url);

    expect(targetUrl).toBe('https://todolist.nyc/api/todos?space_id=abc');
  });

  test('builds correct URL for local development', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Use Object.defineProperty to reliably override self.location (plain assignment
    // doesn't work on the service-worker-mock env object)
    Object.defineProperty((global as any).self, 'location', {
      value: { hostname: 'localhost', protocol: 'http:', origin: 'http://localhost:3141' },
      configurable: true,
      writable: true,
    });

    const request = mockRequest('http://localhost:3141/categories?space_id=abc');
    const url = new URL('http://localhost:3141/categories?space_id=abc');
    const { targetUrl } = await sw.buildBackendRequest(request, url);

    expect(targetUrl).toBe('http://localhost:3141/api/categories?space_id=abc');
  });

  test('does not include auth headers for login/signup', async () => {
    (global as any).self.location = { hostname: 'localhost', protocol: 'http:', origin: 'http://localhost:3141' };
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const request = mockRequest('http://localhost:3141/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@test.com' })
    });
    const url = new URL('http://localhost:3141/auth/login');
    const { proxyRequest } = await sw.buildBackendRequest(request, url);

    // Should not have Authorization header
    expect(proxyRequest.headers.get('Authorization')).toBeFalsy();
    expect(proxyRequest.headers.get('Content-Type')).toBe('application/json');
  });

  test('includes auth headers for authenticated endpoints', async () => {
    (global as any).self.location = { hostname: 'localhost', protocol: 'http:', origin: 'http://localhost:3141' };
    const sw = require('../public/sw.js');
    await sw.putAuth('mytoken', 'user1');

    const request = mockRequest('http://localhost:3141/todos');
    const url = new URL('http://localhost:3141/todos');
    const { proxyRequest } = await sw.buildBackendRequest(request, url);

    expect(proxyRequest.headers.get('Authorization')).toBe('Bearer mytoken');
  });
});

describe('cacheGetTodos', () => {
  test('caches server todos to IndexedDB', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const serverTodos = [
      { _id: 'todo1', text: 'Task 1', space_id: 'sp1' },
      { _id: 'todo2', text: 'Task 2', space_id: 'sp1' },
    ];
    const response = mockResponse(serverTodos);
    const url = new URL('http://localhost/todos?space_id=sp1');

    const result = await sw.cacheGetTodos(url, response, { userId: 'user1', token: 'token123' });

    expect(result).toBe('cached');
    const todos = await sw.getTodos('user1');
    expect(todos).toHaveLength(2);
    expect(todos.map((t: any) => t._id).sort()).toEqual(['todo1', 'todo2']);
  });

  test('caches even when sync is pending (blocking moved to handleApiRequest)', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');
    await sw.addQueue({ type: 'CREATE', data: { text: 'pending' } }, 'user1');

    const response = mockResponse([{ _id: 'todo1', text: 'Server' }]);
    const url = new URL('http://localhost/todos?space_id=sp1');

    const result = await sw.cacheGetTodos(url, response, { userId: 'user1', token: 'token123' });

    // cacheGetTodos always caches; the caller (handleApiRequest) decides whether to invoke it
    expect(result).toBe('cached');
  });

  test('removes stale local todos not in server response', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Pre-populate a local todo that won't be in server response
    await sw.putTodo({ _id: 'stale1', text: 'Stale', space_id: 'sp1' }, 'user1');

    const serverTodos = [{ _id: 'todo1', text: 'Current', space_id: 'sp1' }];
    const response = mockResponse(serverTodos);
    const url = new URL('http://localhost/todos?space_id=sp1');

    await sw.cacheGetTodos(url, response, { userId: 'user1', token: 'token123' });

    const todos = await sw.getTodos('user1');
    expect(todos).toHaveLength(1);
    expect(todos[0]._id).toBe('todo1');
  });
});

describe('cacheGetCategories', () => {
  test('caches categories to IndexedDB', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const response = mockResponse(['Work', 'Personal', 'Health']);
    const url = new URL('http://localhost/categories?space_id=sp1');

    const result = await sw.cacheGetCategories(url, response, { userId: 'user1', token: 'token123' });

    expect(result).toBe('cached');
    const categories = await sw.getCategories('user1');
    expect(categories).toHaveLength(3);
  });
});

describe('cacheGetSpaces', () => {
  test('caches spaces to IndexedDB', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    const response = mockResponse([
      { _id: 'sp1', name: 'Personal' },
      { _id: 'sp2', name: 'Work' },
    ]);
    const url = new URL('http://localhost/spaces');

    const result = await sw.cacheGetSpaces(url, response, { userId: 'user1', token: 'token123' });

    expect(result).toBe('cached');
    const spaces = await sw.getSpaces('user1');
    expect(spaces).toHaveLength(2);
  });
});

describe('cacheGetJournals', () => {
  test('caches journals and runs stale cleanup on unfiltered GET', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Pre-populate a stale journal
    await sw.putJournal({ _id: 'stale1', date: '2024-01-01', content: 'old', space_id: 'sp1' }, 'user1');

    const serverJournals = [
      { _id: 'j1', date: '2024-01-15', content: 'new', space_id: 'sp1' },
    ];
    const response = mockResponse(serverJournals);
    const url = new URL('http://localhost/journals?space_id=sp1');

    // Mock syncQueue's fetch to avoid real network calls
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    const result = await sw.cacheGetJournals(url, response, { userId: 'user1', token: 'token123' });
    expect(result).toBe('cached');

    const journals = await sw.getJournals('user1');
    // Stale journal should be removed, only server journal remains
    expect(journals).toHaveLength(1);
    expect(journals[0]._id).toBe('j1');
  });

  test('does NOT run stale cleanup on date-filtered GET', async () => {
    const sw = require('../public/sw.js');
    await sw.putAuth('token123', 'user1');

    // Pre-populate a journal for a different date
    await sw.putJournal({ _id: 'other1', date: '2024-01-01', content: 'keep me', space_id: 'sp1' }, 'user1');

    const serverJournal = { _id: 'j2', date: '2024-01-15', content: 'today', space_id: 'sp1' };
    const response = mockResponse(serverJournal);
    const url = new URL('http://localhost/journals?space_id=sp1&date=2024-01-15');

    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    await sw.cacheGetJournals(url, response, { userId: 'user1', token: 'token123' });

    const journals = await sw.getJournals('user1');
    // Both journals should exist — no stale cleanup on date-filtered request
    expect(journals).toHaveLength(2);
  });
});

describe('No API_CACHE references', () => {
  test('sw.js does not reference API_CACHE', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');
    expect(content).not.toContain('API_CACHE');
  });
});
