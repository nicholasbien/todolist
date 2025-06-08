const STATIC_CACHE = 'todo-static-v28';
const API_CACHE = 'todo-api-v28';

const DB_NAME = 'TodoOfflineDB';
const DB_VERSION = 2;
const TODOS = 'todos';
const CATEGORIES = 'categories';
const QUEUE = 'queue';
const AUTH = 'auth';

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
      if (!db.objectStoreNames.contains(CATEGORIES)) {
        db.createObjectStore(CATEGORIES, { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains(QUEUE)) {
        db.createObjectStore(QUEUE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(AUTH)) {
        db.createObjectStore(AUTH, { keyPath: 'key' });
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

const getCategories = () => dbTx(CATEGORIES, 'readonly', (s) => s.getAll());
const putCategory = (c) => dbTx(CATEGORIES, 'readwrite', (s) => s.put(c));
const delCategory = (name) => dbTx(CATEGORIES, 'readwrite', (s) => s.delete(name));

const addQueue = (action) =>
  dbTx(QUEUE, 'readwrite', (s) => s.add({ ...action, timestamp: Date.now() }));
const readQueue = () => dbTx(QUEUE, 'readonly', (s) => s.getAll());
const clearQueue = () => dbTx(QUEUE, 'readwrite', (s) => s.clear());

const getAuth = () => dbTx(AUTH, 'readonly', (s) => s.get('token'));
const putAuth = (token, userId) => dbTx(AUTH, 'readwrite', (s) => s.put({ key: 'token', token, userId }));


// Function to get authenticated headers
async function getAuthHeaders() {
  const authData = await getAuth();
  const headers = { 'Content-Type': 'application/json' };
  if (authData && authData.token) {
    headers['Authorization'] = `Bearer ${authData.token}`;
  }
  return headers;
}

// Function to sync server data to local database on startup
async function syncServerDataToLocal() {
  try {
    // Only sync if we're online
    if (!self.navigator.onLine) return;

    const headers = await getAuthHeaders();

    // Fetch and store categories
    try {
      const categoriesResponse = await fetch('/categories', { headers });
      if (categoriesResponse.ok) {
        const serverCategories = await categoriesResponse.json();
        for (const categoryName of serverCategories) {
          await putCategory({ name: categoryName });
        }
      }
    } catch (err) {
      console.log('Failed to sync categories:', err);
    }

    // Fetch and store todos
    try {
      const todosResponse = await fetch('/todos', { headers });
      if (todosResponse.ok) {
        const serverTodos = await todosResponse.json();
        for (const todo of serverTodos) {
          await putTodo(todo);
        }
      }
    } catch (err) {
      console.log('Failed to sync todos:', err);
    }
  } catch (err) {
    console.log('Failed to sync server data:', err);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([caches.open(STATIC_CACHE), caches.open(API_CACHE), openDB()]));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((names) =>
        Promise.all(
          names.map((n) => {
            if (![STATIC_CACHE, API_CACHE].includes(n)) return caches.delete(n);
            return null;
          })
        )
      ),
      // Sync server data to local database when service worker activates
      syncServerDataToLocal()
    ])
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isApi =
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/todos') ||
      url.pathname.startsWith('/categories'));
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

        // For GET /categories, sync server data to IndexedDB and merge with offline categories
        if (url.pathname === '/categories') {
          const serverCategories = await response.clone().json(); // Array of strings like ["Work", "Personal"]

          // Save all server categories to IndexedDB for offline access (as objects)
          for (const categoryName of serverCategories) {
            await putCategory({ name: categoryName });
          }

          // Get offline-only categories (not yet synced)
          const offlineCategories = await getCategories();
          const offlineOnlyCategories = offlineCategories.filter(c => c.name.startsWith('offline_'));
          const offlineOnlyNames = offlineOnlyCategories.map(c => c.name);

          // Merge server categories with offline-only categories (return as strings)
          const mergedCategories = [...serverCategories, ...offlineOnlyNames];

          return new Response(JSON.stringify(mergedCategories), {
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
    if (url.pathname === '/todos' || url.pathname.endsWith('/todos')) {
      const todos = await getTodos();
      return new Response(JSON.stringify(todos), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.pathname === '/categories' || url.pathname.endsWith('/categories')) {
      const offlineCategories = await getCategories();

      // If we have stored categories, return their names; otherwise use defaults
      if (offlineCategories && offlineCategories.length > 0) {
        const categoryNames = offlineCategories.map(c => c.name);
        return new Response(JSON.stringify(categoryNames), { headers: { 'Content-Type': 'application/json' } });
      } else {
        return new Response(JSON.stringify(DEFAULT_CATEGORIES), { headers: { 'Content-Type': 'application/json' } });
      }
    }
  }

  // Handle core todo mutations offline
  else {
    const dataText = await request.clone().text();
    let data = {};
    try { data = JSON.parse(dataText); } catch (_) {}

    // Create new todo
    if ((url.pathname === '/todos' || url.pathname.endsWith('/todos')) && request.method === 'POST') {
      const authData = await getAuth();
      const text = data.text || '';

      // Check if it's a URL - if so, store as link and use basic classification
      let todoData = {
        _id: 'offline_' + Date.now(),
        text: text,
        category: data.category || 'General',
        priority: normalizePriority(data.priority),
        dateAdded: new Date().toISOString(),
        completed: false,
        user_id: authData ? authData.userId : 'offline_user',
        created_offline: true,
      };

      // If it's a URL, store it as a link (title fetching will happen when synced)
      if (text.startsWith('http://') || text.startsWith('https://')) {
        todoData.link = text;
      }

      await putTodo(todoData);
      await addQueue({ type: 'CREATE', data: todoData });
      return new Response(JSON.stringify(todoData), { headers: { 'Content-Type': 'application/json' } });
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

    // Create new category
    if ((url.pathname === '/categories' || url.pathname.endsWith('/categories')) && request.method === 'POST') {
      const categoryName = data.name || `offline_${Date.now()}`;
      const newCategory = { name: categoryName };

      await putCategory(newCategory);
      await addQueue({ type: 'CREATE_CATEGORY', data: newCategory });
      return new Response(JSON.stringify(newCategory), { headers: { 'Content-Type': 'application/json' } });
    }

    // Delete category
    if (url.pathname.startsWith('/categories/') && request.method === 'DELETE') {
      const categoryName = decodeURIComponent(url.pathname.split('/')[2]); // Get name from /categories/{name}
      await delCategory(categoryName);
      await addQueue({ type: 'DELETE_CATEGORY', data: { name: categoryName } });
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
  const headers = await getAuthHeaders();

  for (const op of queue) {
    try {
      let res;
      switch (op.type) {
        case 'CREATE':
          if (op.data._id.startsWith('offline_')) {
            const { _id, ...payload } = op.data;
            res = await fetch('/todos', {
              method: 'POST',
              headers,
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
              headers,
              body: JSON.stringify(op.data),
            });
          }
          break;
        case 'DELETE':
          if (!op.data._id.startsWith('offline_')) {
            await fetch(`/todos/${op.data._id}`, {
              method: 'DELETE',
              headers
            });
          }
          break;
        case 'CREATE_CATEGORY':
          res = await fetch('/categories', {
            method: 'POST',
            headers,
            body: JSON.stringify(op.data),
          });
          if (res.ok) {
            const serverCategory = await res.json();
            await putCategory(serverCategory);
          }
          break;
        case 'DELETE_CATEGORY':
          await fetch(`/categories/${encodeURIComponent(op.data.name)}`, {
            method: 'DELETE',
            headers
          });
          break;
      }
    } catch (err) {
      // keep in queue on error
      continue;
    }
  }
  await clearQueue();
  try {
    const res = await fetch('/todos', { headers });
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
  if (event.data && event.data.type === 'SET_AUTH') {
    putAuth(event.data.token, event.data.userId);
  }
});
