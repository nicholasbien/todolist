const STATIC_CACHE = 'todo-static-v34';
const API_CACHE = 'todo-api-v34';

const GLOBAL_DB_NAME = 'TodoGlobalDB';
const USER_DB_PREFIX = 'TodoUserDB_';
const DB_VERSION = 2;
const TODOS = 'todos';
const CATEGORIES = 'categories';
const QUEUE = 'queue';
const AUTH = 'auth';

const DEFAULT_CATEGORIES = ['Work', 'Personal', 'Shopping', 'Finance', 'Health', 'General'];

// Static files to cache for offline use
const STATIC_FILES = [
  '/',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// Open global database for auth data
function openGlobalDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(GLOBAL_DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(AUTH)) {
        db.createObjectStore(AUTH, { keyPath: 'key' });
      }
    };
  });
}

// Open user-specific database for todos, categories, and queue
function openUserDB(userId) {
  const dbName = userId ? `${USER_DB_PREFIX}${userId}` : `${USER_DB_PREFIX}guest`;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);
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
    };
  });
}

// Global database transaction for auth
async function globalDbTx(store, mode, fn) {
  const db = await openGlobalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([store], mode);
    const st = tx.objectStore(store);
    const req = fn(st);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// User-specific database transaction
async function userDbTx(userId, store, mode, fn) {
  const db = await openUserDB(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction([store], mode);
    const st = tx.objectStore(store);
    const req = fn(st);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Auth operations (global)
const getAuth = () => globalDbTx(AUTH, 'readonly', (s) => s.get('token'));
const putAuth = (token, userId) => globalDbTx(AUTH, 'readwrite', (s) => s.put({ key: 'token', token, userId }));

// User-specific operations
const getTodos = async (userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  return userDbTx(effectiveUserId, TODOS, 'readonly', (s) => s.getAll());
};

const putTodo = async (todo, userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  return userDbTx(effectiveUserId, TODOS, 'readwrite', (s) => s.put(todo));
};


const delTodo = async (id, userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  return userDbTx(effectiveUserId, TODOS, 'readwrite', (s) => s.delete(id));
};

const getCategories = async (userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  return userDbTx(effectiveUserId, CATEGORIES, 'readonly', (s) => s.getAll());
};

const putCategory = async (category, userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  return userDbTx(effectiveUserId, CATEGORIES, 'readwrite', (s) => s.put(category));
};

const delCategory = async (name, userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  return userDbTx(effectiveUserId, CATEGORIES, 'readwrite', (s) => s.delete(name));
};

const addQueue = async (action, userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  return userDbTx(effectiveUserId, QUEUE, 'readwrite', (s) => s.add({ ...action, timestamp: Date.now() }));
};

const readQueue = async (userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  return userDbTx(effectiveUserId, QUEUE, 'readonly', (s) => s.getAll());
};

const clearQueue = async (userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  return userDbTx(effectiveUserId, QUEUE, 'readwrite', (s) => s.clear());
};


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

    const authData = await getAuth();
    if (!authData || !authData.userId) return; // No user to sync for

    const headers = await getAuthHeaders();

    // Fetch and store categories
    try {
      const categoriesResponse = await fetch('/categories', { headers });
      if (categoriesResponse.ok) {
        const serverCategories = await categoriesResponse.json();
        for (const categoryName of serverCategories) {
          await putCategory({ name: categoryName }, authData.userId);
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
          await putTodo(todo, authData.userId);
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
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_FILES)),
      caches.open(API_CACHE),
      openGlobalDB()
    ])
  );
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

  // Handle API requests
  const isApi =
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/todos') ||
      url.pathname.startsWith('/categories') ||
      url.pathname.startsWith('/email') ||
      url.pathname.startsWith('/contact') ||
      url.pathname.startsWith('/auth/'));

  if (isApi) {
    event.respondWith(handleApiRequest(event.request));
    return;
  }

  // Handle static file requests (including page navigation)
  if (url.origin === self.location.origin) {
    event.respondWith(handleStaticRequest(event.request));
  }
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

        // For GET /todos, sync pending operations then merge with fresh server data
        if (url.pathname === '/todos') {
          const authData = await getAuth();
          if (!authData || !authData.userId) return response; // No user context

          // Sync pending offline operations FIRST (this does immediate ID replacements)
          await syncQueue();

          // After sync, get fresh server data and merge with any remaining offline todos
          const freshResponse = await fetch(request.clone());
          if (!freshResponse.ok) return response; // Fallback to original response

          const serverTodos = await freshResponse.json();

          // Get current local todos (may include unsynced offline todos)
          const localTodos = await getTodos(authData.userId);
          const offlineOnlyTodos = localTodos.filter(t => t._id.startsWith('offline_'));

          // Remove any non-offline todos that no longer exist on the server
          const serverIds = new Set(serverTodos.map(t => t._id));
          for (const t of localTodos) {
            if (!t._id.startsWith('offline_') && !serverIds.has(t._id)) {
              await delTodo(t._id, authData.userId);
            }
          }

          // Save fresh server data to IndexedDB
          for (const todo of serverTodos) {
            await putTodo(todo, authData.userId);
          }

          // Merge server todos with any remaining offline todos
          const mergedTodos = [...serverTodos, ...offlineOnlyTodos];

          // Return the merged data
          return new Response(JSON.stringify(mergedTodos), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // For GET /categories, sync server data to IndexedDB and merge with offline categories
        if (url.pathname === '/categories') {
          const authData = await getAuth();
          if (!authData || !authData.userId) return response; // No user context

          const serverCategories = await response.clone().json(); // Array of strings like ["Work", "Personal"]

          const localCategories = await getCategories(authData.userId);
          const offlineOnlyCategories = localCategories.filter(c => c.name.startsWith('offline_'));
          const offlineOnlyNames = offlineOnlyCategories.map(c => c.name);

          // Remove any local categories that are not on the server and not offline entries
          const serverSet = new Set(serverCategories);
          for (const c of localCategories) {
            if (!c.name.startsWith('offline_') && !serverSet.has(c.name)) {
              await delCategory(c.name, authData.userId);
            }
          }

          // Save all server categories to IndexedDB for offline access (as objects)
          for (const categoryName of serverCategories) {
            await putCategory({ name: categoryName }, authData.userId);
          }

          // Merge server categories with offline-only categories (return as strings)
          const mergedCategories = [...serverCategories, ...offlineOnlyNames];

          return new Response(JSON.stringify(mergedCategories), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Trigger sync for non-GET requests
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

async function handleStaticRequest(request) {
  const url = new URL(request.url);

  try {
    // Try network first for static files
    const response = await fetch(request);

    // Cache successful responses
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    // Network failed, try cache
    const cache = await caches.open(STATIC_CACHE);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // For navigation requests (page loads), return the root page
    if (request.mode === 'navigate') {
      const rootResponse = await cache.match('/');
      if (rootResponse) {
        return rootResponse;
      }
    }

    // Fallback for other requests
    return new Response('Offline', { status: 503 });
  }
}

async function offlineFallback(request, url) {
  const authData = await getAuth();

  // Handle core todo operations offline
  if (request.method === 'GET') {
    if (url.pathname === '/todos' || url.pathname.endsWith('/todos')) {
      const todos = await getTodos(authData ? authData.userId : null);
      return new Response(JSON.stringify(todos), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.pathname === '/categories' || url.pathname.endsWith('/categories')) {
      const offlineCategories = await getCategories(authData ? authData.userId : null);

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
      const text = data.text || '';

      // Check if it's a URL - if so, store as link and use basic classification
      let todoData = {
        _id: 'offline_' + Date.now(),
        text: text,
        category: data.category || 'General',
        priority: normalizePriority(data.priority),
        dateAdded: new Date().toISOString(),
        dueDate: null,
        completed: false,
        user_id: authData ? authData.userId : 'offline_user',
        created_offline: true,
      };

      // If it's a URL, store it as a link (title fetching will happen when synced)
      if (text.startsWith('http://') || text.startsWith('https://')) {
        todoData.link = text;
      }

      await putTodo(todoData, authData ? authData.userId : null);
      await addQueue({ type: 'CREATE', data: todoData }, authData ? authData.userId : null);
      return new Response(JSON.stringify(todoData), { headers: { 'Content-Type': 'application/json' } });
    }

    // Update todo (category, priority changes)
    if (url.pathname.startsWith('/todos/') && request.method === 'PUT' && !url.pathname.endsWith('/complete')) {
      const id = url.pathname.split('/')[2]; // Get ID from /todos/{id}
      const existingTodos = await getTodos(authData ? authData.userId : null);
      const existingTodo = existingTodos.find(t => t._id === id);

      if (existingTodo) {
        const updated = { ...existingTodo, ...data };
        await putTodo(updated, authData ? authData.userId : null);
        await addQueue({ type: 'UPDATE', data: updated }, authData ? authData.userId : null);
        return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Complete/uncomplete todo
    if (url.pathname.endsWith('/complete') && request.method === 'PUT') {
      const id = url.pathname.split('/')[2]; // Get ID from /todos/{id}/complete
      const existingTodos = await getTodos(authData ? authData.userId : null);
      const existingTodo = existingTodos.find(t => t._id === id);

      if (existingTodo) {
        const updated = { ...existingTodo, completed: !existingTodo.completed };
        if (updated.completed) {
          updated.dateCompleted = new Date().toISOString();
        } else {
          delete updated.dateCompleted;
        }
        await putTodo(updated, authData ? authData.userId : null);
        await addQueue({ type: 'COMPLETE', data: { _id: id, completed: updated.completed } }, authData ? authData.userId : null);
        return new Response(JSON.stringify({ message: 'Todo updated' }), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Delete todo
    if (url.pathname.startsWith('/todos/') && request.method === 'DELETE') {
      const id = url.pathname.split('/')[2]; // Get ID from /todos/{id}
      await delTodo(id, authData ? authData.userId : null);
      await addQueue({ type: 'DELETE', data: { _id: id } }, authData ? authData.userId : null);
      return new Response(null, { status: 204 });
    }

    // Create new category
    if ((url.pathname === '/categories' || url.pathname.endsWith('/categories')) && request.method === 'POST') {
      const categoryName = data.name || `offline_${Date.now()}`;
      const newCategory = { name: categoryName };

      await putCategory(newCategory, authData ? authData.userId : null);
      await addQueue({ type: 'CREATE_CATEGORY', data: newCategory }, authData ? authData.userId : null);
      return new Response(JSON.stringify(newCategory), { headers: { 'Content-Type': 'application/json' } });
    }

    // Rename category
    if (url.pathname.startsWith('/categories/') && request.method === 'PUT') {
      const oldName = decodeURIComponent(url.pathname.split('/')[2]);
      const newName = (data.new_name || '').trim();
      if (!newName) {
        return new Response(JSON.stringify({ error: 'Invalid name' }), { status: 400 });
      }

      // Update all todos referencing this category
      const todos = await getTodos(authData ? authData.userId : null);
      for (const t of todos) {
        if (t.category === oldName) {
          const updated = { ...t, category: newName };
          await putTodo(updated, authData ? authData.userId : null);
          await addQueue({ type: 'UPDATE', data: updated }, authData ? authData.userId : null);
        }
      }

      await delCategory(oldName, authData ? authData.userId : null);
      await putCategory({ name: newName }, authData ? authData.userId : null);

      const queueEntries = await readQueue(authData ? authData.userId : null);
      const createIdx = queueEntries.findIndex(q => q.type === 'CREATE_CATEGORY' && q.data.name === oldName);
      if (createIdx !== -1) {
        queueEntries[createIdx].data.name = newName;
        await clearQueue(authData ? authData.userId : null);
        for (const entry of queueEntries) {
          await addQueue({ type: entry.type, data: entry.data }, authData ? authData.userId : null);
        }
      } else {
        await addQueue({ type: 'RENAME_CATEGORY', data: { old_name: oldName, new_name: newName } }, authData ? authData.userId : null);
      }

      return new Response(JSON.stringify({ message: 'Category renamed' }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Delete category
    if (url.pathname.startsWith('/categories/') && request.method === 'DELETE') {
      const categoryName = decodeURIComponent(url.pathname.split('/')[2]); // Get name from /categories/{name}

      // Update todos that use this category to "General"
      const todos = await getTodos(authData ? authData.userId : null);
      for (const t of todos) {
        if (t.category === categoryName) {
          const updated = { ...t, category: 'General' };
          await putTodo(updated, authData ? authData.userId : null);
          await addQueue({ type: 'UPDATE', data: updated }, authData ? authData.userId : null);
        }
      }

      await delCategory(categoryName, authData ? authData.userId : null);

      const queueEntries = await readQueue(authData ? authData.userId : null);
      const createIdx = queueEntries.findIndex(q => q.type === 'CREATE_CATEGORY' && q.data.name === categoryName);
      if (createIdx !== -1) {
        queueEntries.splice(createIdx, 1); // Cancel pending create if never synced
        await clearQueue(authData ? authData.userId : null);
        for (const entry of queueEntries) {
          await addQueue({ type: entry.type, data: entry.data }, authData ? authData.userId : null);
        }
      } else {
        await addQueue({ type: 'DELETE_CATEGORY', data: { name: categoryName } }, authData ? authData.userId : null);
      }

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

// Global sync lock to prevent concurrent syncing
let syncInProgress = false;

async function syncQueue() {
  const authData = await getAuth();
  if (!authData || !authData.userId) return; // No user to sync for

  // Prevent concurrent sync operations
  if (syncInProgress) {
    console.log('Sync already in progress, skipping...');
    return;
  }

  syncInProgress = true;
  console.log('Starting sync...');

  try {
    const queue = await readQueue(authData.userId);
    const headers = await getAuthHeaders();

  for (const op of queue) {
    try {
      let res;
      switch (op.type) {
        case 'CREATE':
          if (op.data._id.startsWith('offline_')) {
            const { _id: offlineId, ...payload } = op.data;
            res = await fetch('/todos', {
              method: 'POST',
              headers,
              body: JSON.stringify(payload),
            });
            if (res && res.ok) {
              // Immediately replace offline todo with server version
              const serverTodo = await res.json();
              await delTodo(offlineId, authData.userId); // Remove offline version
              await putTodo(serverTodo, authData.userId); // Add server version
              console.log(`Synced offline todo ${offlineId} -> ${serverTodo._id}`);
            }
          }
          break;
        case 'UPDATE':
          if (!op.data._id.startsWith('offline_')) {
            res = await fetch(`/todos/${op.data._id}`, {
              method: 'PUT',
              headers,
              body: JSON.stringify(op.data),
            });
            if (res && res.ok) {
              // Update local copy with the changes
              await putTodo(op.data, authData.userId);
            }
          }
          break;
        case 'COMPLETE':
          if (!op.data._id.startsWith('offline_')) {
            res = await fetch(`/todos/${op.data._id}/complete`, {
              method: 'PUT',
              headers
            });
            if (res && res.ok) {
              // Update local todo completion status
              const existingTodos = await getTodos(authData.userId);
              const existingTodo = existingTodos.find(t => t._id === op.data._id);
              if (existingTodo) {
                const updated = { ...existingTodo, completed: op.data.completed };
                if (updated.completed) {
                  updated.dateCompleted = new Date().toISOString();
                } else {
                  delete updated.dateCompleted;
                }
                await putTodo(updated, authData.userId);
              }
            }
          }
          break;
        case 'DELETE':
          if (!op.data._id.startsWith('offline_')) {
            res = await fetch(`/todos/${op.data._id}`, {
              method: 'DELETE',
              headers
            });
            if (res && res.ok) {
              // Remove from local storage
              await delTodo(op.data._id, authData.userId);
            }
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
            await putCategory(serverCategory, authData.userId);
          }
          break;
        case 'DELETE_CATEGORY':
          res = await fetch(`/categories/${encodeURIComponent(op.data.name)}`, {
            method: 'DELETE',
            headers
          });
          if (res.ok) {
            await delCategory(op.data.name, authData.userId);
          }
          break;
        case 'RENAME_CATEGORY':
          res = await fetch(`/categories/${encodeURIComponent(op.data.old_name)}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ new_name: op.data.new_name })
          });
          if (res.ok) {
            await delCategory(op.data.old_name, authData.userId);
            await putCategory({ name: op.data.new_name }, authData.userId);
          }
          break;
      }
    } catch (err) {
      // Continue processing other operations on error
      // Failed operations remain in offline state until next sync attempt
      console.log('Sync operation failed:', err);
      continue;
    }
  }

    // Always clear queue after processing (prevents infinite retry loops)
    await clearQueue(authData.userId);
    console.log('Sync completed');
  } finally {
    syncInProgress = false;
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_WHEN_ONLINE') {
    syncQueue();
  }
  if (event.data && event.data.type === 'SET_AUTH') {
    putAuth(event.data.token, event.data.userId);
  }
});

// Export functions for unit testing in Node environment
if (typeof module !== 'undefined') {
  module.exports = {
    openGlobalDB,
    openUserDB,
    getAuth,
    putAuth,
    getTodos,
    putTodo,
    delTodo,
    getCategories,
    putCategory,
    delCategory,
    addQueue,
    readQueue,
    clearQueue,
    getAuthHeaders,
    syncQueue,
  };
}
