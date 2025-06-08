const STATIC_CACHE = 'todo-static-v25';
const API_CACHE = 'todo-api-v25';

const DB_NAME = 'TodoOfflineDB';
const DB_VERSION = 1;
const TODOS = 'todos';
const QUEUE = 'queue';

const DEFAULT_CATEGORIES = ['Work', 'Personal', 'Shopping', 'Finance', 'Health', 'General'];

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(TODOS)) {
        db.createObjectStore(TODOS, { keyPath: '_id' });
      }
      if (!db.objectStoreNames.contains(QUEUE)) {
        db.createObjectStore(QUEUE, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function dbTx(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([store], mode);
    const st = tx.objectStore(store);
    const req = fn(st);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const getTodos = () => dbTx(TODOS, 'readonly', (s) => s.getAll());
const putTodo = (t) => dbTx(TODOS, 'readwrite', (s) => s.put(t));
const delTodo = (id) => dbTx(TODOS, 'readwrite', (s) => s.delete(id));

const addQueue = (action) =>
  dbTx(QUEUE, 'readwrite', (s) => s.add({ ...action, timestamp: Date.now() }));
const readQueue = () => dbTx(QUEUE, 'readonly', (s) => s.getAll());
const clearQueue = () => dbTx(QUEUE, 'readwrite', (s) => s.clear());

self.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([caches.open(STATIC_CACHE), caches.open(API_CACHE), openDB()]));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.map((n) => {
          if (![STATIC_CACHE, API_CACHE].includes(n)) return caches.delete(n);
          return null;
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isApi =
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/todos') ||
      url.pathname.startsWith('/categories') ||
      url.pathname.startsWith('/classify'));
  if (!isApi) return;
  event.respondWith(handleApiRequest(event.request));
});

async function handleApiRequest(request) {
  const online = self.navigator.onLine;
  const url = new URL(request.url);

  // Check if this is an offline-generated ID that shouldn't go to server
  const isOfflineId = url.pathname.includes('offline_');

  if (online && !isOfflineId) {
    try {
      const response = await fetch(request.clone());
      if (request.method === 'GET' && response.ok) {
        const cache = await caches.open(API_CACHE);
        cache.put(request, response.clone());

        // For GET /todos, sync server data to IndexedDB and merge with offline todos
        if (url.pathname === '/todos') {
          const serverTodos = await response.clone().json();

          // Save all server todos to IndexedDB for offline access
          for (const todo of serverTodos) {
            await putTodo(todo);
          }

          // Get offline-only todos (not yet synced)
          const offlineTodos = await getTodos();
          const offlineOnlyTodos = offlineTodos.filter(t => t._id.startsWith('offline_'));

          // Merge server todos with offline-only todos
          const mergedTodos = [...serverTodos, ...offlineOnlyTodos];

          return new Response(JSON.stringify(mergedTodos), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      if (request.method !== 'GET' && response.ok) {
        syncQueue();
      }
      return response;
    } catch (err) {
      return offlineFallback(request, url);
    }
  }
  return offlineFallback(request, url);
}

async function offlineFallback(request, url) {
  // Handle core todo operations offline
  if (request.method === 'GET') {
    if (url.pathname === '/todos') {
      const todos = await getTodos();
      return new Response(JSON.stringify(todos), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.pathname === '/categories') {
      const cats = DEFAULT_CATEGORIES.map((name) => ({ name }));
      return new Response(JSON.stringify(cats), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.pathname.startsWith('/classify')) {
      return new Response(
        JSON.stringify({ category: 'General', priority: 'Medium' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // Handle core todo mutations offline
  else {
    const dataText = await request.clone().text();
    let data = {};
    try { data = JSON.parse(dataText); } catch (_) {}

    // Create new todo
    if (url.pathname === '/todos' && request.method === 'POST') {
      const newTodo = {
        _id: 'offline_' + Date.now(),
        text: data.text,
        category: data.category || 'General',
        priority: normalizePriority(data.priority),
        dateAdded: new Date().toISOString(),
        completed: false,
      };
      await putTodo(newTodo);
      await addQueue({ type: 'CREATE', data: newTodo });
      return new Response(JSON.stringify(newTodo), { headers: { 'Content-Type': 'application/json' } });
    }

    // Update todo (category, priority changes)
    if (url.pathname.startsWith('/todos/') && request.method === 'PUT' && !url.pathname.endsWith('/complete')) {
      const id = url.pathname.split('/')[2]; // Get ID from /todos/{id}
      const existingTodos = await getTodos();
      const existingTodo = existingTodos.find(t => t._id === id);

      if (existingTodo) {
        const updated = { ...existingTodo, ...data };
        await putTodo(updated);
        await addQueue({ type: 'UPDATE', data: updated });
        return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Complete/uncomplete todo
    if (url.pathname.endsWith('/complete') && request.method === 'PUT') {
      const id = url.pathname.split('/')[2]; // Get ID from /todos/{id}/complete
      const existingTodos = await getTodos();
      const existingTodo = existingTodos.find(t => t._id === id);

      if (existingTodo) {
        const updated = { ...existingTodo, completed: !existingTodo.completed };
        await putTodo(updated);
        await addQueue({ type: 'UPDATE', data: updated });
        return new Response(JSON.stringify({ message: 'Todo updated' }), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Delete todo
    if (url.pathname.startsWith('/todos/') && request.method === 'DELETE') {
      const id = url.pathname.split('/')[2]; // Get ID from /todos/{id}
      await delTodo(id);
      await addQueue({ type: 'DELETE', data: { _id: id } });
      return new Response(null, { status: 204 });
    }
  }

  // Gracefully fail all other requests when offline
  return new Response(JSON.stringify({
    error: 'This feature is not available offline. Please check your connection and try again.'
  }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}

function normalizePriority(p) {
  if (!p) return 'Medium';
  const v = p.toLowerCase();
  if (v === 'high') return 'High';
  if (v === 'low') return 'Low';
  return 'Medium';
}

async function syncQueue() {
  const queue = await readQueue();
  for (const op of queue) {
    try {
      let res;
      switch (op.type) {
        case 'CREATE':
          if (op.data._id.startsWith('offline_')) {
            const { _id, ...payload } = op.data;
            res = await fetch('/todos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            if (res.ok) {
              const serverTodo = await res.json();
              await delTodo(_id);
              await putTodo(serverTodo);
            }
          }
          break;
        case 'UPDATE':
          if (!op.data._id.startsWith('offline_')) {
            await fetch(`/todos/${op.data._id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(op.data),
            });
          }
          break;
        case 'DELETE':
          if (!op.data._id.startsWith('offline_')) {
            await fetch(`/todos/${op.data._id}`, { method: 'DELETE' });
          }
          break;
      }
    } catch (err) {
      // keep in queue on error
      continue;
    }
  }
  await clearQueue();
  try {
    const res = await fetch('/todos');
    if (res.ok) {
      const todos = await res.json();
      for (const t of todos) await putTodo(t);
    }
  } catch (e) {}
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_WHEN_ONLINE') {
    syncQueue();
  }
});
