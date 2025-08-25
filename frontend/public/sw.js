const STATIC_CACHE = 'todo-static-v40';
const API_CACHE = 'todo-api-v40';

const GLOBAL_DB_NAME = 'TodoGlobalDB';
const USER_DB_PREFIX = 'TodoUserDB_';
const DB_VERSION = 9;
const TODOS = 'todos';
const CATEGORIES = 'categories';
const SPACES = 'spaces';
const QUEUE = 'queue';
const AUTH = 'auth';
const JOURNALS = 'journals';

const DEFAULT_CATEGORIES = ['General'];

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
        db.createObjectStore(CATEGORIES, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(SPACES)) {
        db.createObjectStore(SPACES, { keyPath: '_id' });
      }
      if (!db.objectStoreNames.contains(QUEUE)) {
        db.createObjectStore(QUEUE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(JOURNALS)) {
        db.createObjectStore(JOURNALS, { keyPath: '_id' });
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
const getTodos = async (userId, spaceId = null) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  const allTodos = await userDbTx(effectiveUserId, TODOS, 'readonly', (s) => s.getAll());

  if (spaceId) {
    // Filter by space_id
    return allTodos.filter(t => t.space_id === spaceId);
  } else {
    // Return all todos
    return allTodos;
  }
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

const getSpaces = async (userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  return userDbTx(effectiveUserId, SPACES, 'readonly', (s) => s.getAll());
};

const putSpace = async (space, userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  return userDbTx(effectiveUserId, SPACES, 'readwrite', (s) => s.put(space));
};

const delSpace = async (id, userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  return userDbTx(effectiveUserId, SPACES, 'readwrite', (s) => s.delete(id));
};

const getCategories = async (userId, spaceId = null) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  const allCategories = await userDbTx(effectiveUserId, CATEGORIES, 'readonly', (s) => s.getAll());

  if (spaceId) {
    // Get categories for specific space
    return allCategories.filter(c => c.space_id === spaceId);
  } else {
    // Get all categories
    return allCategories;
  }
};

const putCategory = async (category, userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  // Ensure category has space_id (default to null for backward compatibility)
  const categoryWithSpace = { space_id: null, ...category };

  // Log warning if no space_id provided (should be rare after migration)
  if (!category.space_id) {
    console.warn('Category created without space_id:', category.name);
  }

  return userDbTx(effectiveUserId, CATEGORIES, 'readwrite', (s) => s.put(categoryWithSpace));
};

const delCategory = async (name, userId, spaceId = null) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);

  // Find and delete categories matching name and space_id
  const allCategories = await userDbTx(effectiveUserId, CATEGORIES, 'readonly', (s) => s.getAll());
  const toDelete = allCategories.filter(c => c.name === name && c.space_id === spaceId);

  for (const category of toDelete) {
    await userDbTx(effectiveUserId, CATEGORIES, 'readwrite', (s) => s.delete(category.id));
  }
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

// Journal operations
const getJournals = async (userId, date = null, spaceId = null) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  const allJournals = await userDbTx(effectiveUserId, JOURNALS, 'readonly', (s) => s.getAll());

  let filteredJournals = allJournals;

  if (date) {
    filteredJournals = allJournals.filter(j => j.date === date);
  }

  if (spaceId !== null) {
    filteredJournals = filteredJournals.filter(j => j.space_id === spaceId);
  }

  return filteredJournals;
};

const putJournal = async (journal, userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  return userDbTx(effectiveUserId, JOURNALS, 'readwrite', (s) => s.put(journal));
};

const delJournal = async (id, userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  return userDbTx(effectiveUserId, JOURNALS, 'readwrite', (s) => s.delete(id));
};

// ID mapping functions for persisting offline → server ID mappings
const getIdMap = async (userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  try {
    const result = await userDbTx(effectiveUserId, QUEUE, 'readonly', (s) => s.get('idMap'));
    return result ? result.mappings : {};
  } catch (e) {
    return {};
  }
};

const putIdMap = async (idMap, userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  return userDbTx(effectiveUserId, QUEUE, 'readwrite', (s) => s.put({ id: 'idMap', mappings: idMap }));
};

const clearIdMap = async (userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  try {
    return userDbTx(effectiveUserId, QUEUE, 'readwrite', (s) => s.delete('idMap'));
  } catch (e) {
    // Ignore if doesn't exist
  }
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

// Generate insights from todos data (shared logic with backend)
function generateInsights(todos) {
  // Convert todos to consistent format
  const todoArray = Array.isArray(todos) ? todos : Object.values(todos);

  // Calculate basic stats
  const totalTasks = todoArray.length;
  const completedTasks = todoArray.filter(todo => todo.completed).length;
  const pendingTasks = totalTasks - completedTasks;
  const completionRate = totalTasks > 0 ? (completedTasks / totalTasks * 100) : 0;

  // Weekly stats tracking
  const weeklyStats = {};

  // Category stats tracking
  const categoryStats = {};

  // Priority stats tracking
  const priorityStats = {};

  // Process each todo
  for (const todo of todoArray) {
    // Parse dateAdded for weekly creation stats
    try {
      if (todo.dateAdded) {
        const dateAdded = new Date(todo.dateAdded.replace('Z', '+00:00'));
        if (!isNaN(dateAdded.getTime())) {
          // Get Monday of the week (ISO week)
          const weekStart = new Date(dateAdded);
          weekStart.setDate(dateAdded.getDate() - dateAdded.getDay() + (dateAdded.getDay() === 0 ? -6 : 1));
          const weekKey = weekStart.toISOString().split('T')[0];

          if (!weeklyStats[weekKey]) {
            weeklyStats[weekKey] = { created: 0, completed: 0 };
          }
          weeklyStats[weekKey].created += 1;
        }
      }
    } catch (error) {
      // Ignore invalid dates
    }

    // Parse dateCompleted for weekly completion stats
    try {
      if (todo.completed && todo.dateCompleted) {
        const dateCompleted = new Date(todo.dateCompleted.replace('Z', '+00:00'));
        if (!isNaN(dateCompleted.getTime())) {
          const weekStart = new Date(dateCompleted);
          weekStart.setDate(dateCompleted.getDate() - dateCompleted.getDay() + (dateCompleted.getDay() === 0 ? -6 : 1));
          const weekKey = weekStart.toISOString().split('T')[0];

          if (!weeklyStats[weekKey]) {
            weeklyStats[weekKey] = { created: 0, completed: 0 };
          }
          weeklyStats[weekKey].completed += 1;
        }
      }
    } catch (error) {
      // Ignore invalid dates
    }

    // Category stats
    const category = todo.category || 'General';
    if (!categoryStats[category]) {
      categoryStats[category] = { total: 0, completed: 0 };
    }
    categoryStats[category].total += 1;
    if (todo.completed) {
      categoryStats[category].completed += 1;
    }

    // Priority stats
    const priority = todo.priority || 'Medium';
    if (!priorityStats[priority]) {
      priorityStats[priority] = { total: 0, completed: 0 };
    }
    priorityStats[priority].total += 1;
    if (todo.completed) {
      priorityStats[priority].completed += 1;
    }
  }

  // Convert weekly stats to sorted array
  const weeklyData = Object.keys(weeklyStats)
    .sort()
    .map(week => ({
      week,
      created: weeklyStats[week].created,
      completed: weeklyStats[week].completed
    }));

  // Convert category stats to array
  const categoryData = Object.entries(categoryStats).map(([category, stats]) => {
    const completionRate = stats.total > 0 ? (stats.completed / stats.total * 100) : 0;
    return {
      category,
      total: stats.total,
      completed: stats.completed,
      completion_rate: Math.round(completionRate * 10) / 10
    };
  });

  // Convert priority stats to array
  const priorityData = Object.entries(priorityStats).map(([priority, stats]) => {
    const completionRate = stats.total > 0 ? (stats.completed / stats.total * 100) : 0;
    return {
      priority,
      total: stats.total,
      completed: stats.completed,
      completion_rate: Math.round(completionRate * 10) / 10
    };
  });

  return {
    overview: {
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      pending_tasks: pendingTasks,
      completion_rate: Math.round(completionRate * 10) / 10
    },
    weekly_stats: weeklyData,
    category_breakdown: categoryData,
    priority_breakdown: priorityData
  };
}

// Function to sync server data to local database on startup
async function syncServerDataToLocal() {
  try {
    // Only sync if we're online
    if (!self.navigator.onLine) return;

    const authData = await getAuth();
    if (!authData || !authData.userId) return; // No user to sync for

    const headers = await getAuthHeaders();

    // Fetch and store spaces first
    try {
      const spacesResponse = await fetch('/spaces', { headers });
      if (spacesResponse.ok) {
        const serverSpaces = await spacesResponse.json();
        for (const space of serverSpaces) {
          await putSpace(space, authData.userId);
        }
      }
    } catch (err) {
      console.log('Failed to sync spaces:', err);
    }

    // Fetch and store categories (now space-aware)
    try {
      const categoriesResponse = await fetch('/categories', { headers });
      if (categoriesResponse.ok) {
        const serverCategories = await categoriesResponse.json();
        for (const categoryName of serverCategories) {
          await putCategory({ name: categoryName, space_id: null }, authData.userId);
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
  const isDevelopment = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

  event.waitUntil(
    Promise.all([
      // Only pre-cache static files in production, with individual error handling
      isDevelopment ? Promise.resolve() : cacheStaticFiles(),
      caches.open(API_CACHE),
      openGlobalDB()
    ])
  );
  self.skipWaiting();
});

// Helper function to cache static files with individual error handling
async function cacheStaticFiles() {
  const cache = await caches.open(STATIC_CACHE);

  // Cache files individually to avoid failing if one file is missing
  const cachePromises = STATIC_FILES.map(async (url) => {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response);
        console.log(`✅ Cached: ${url}`);
      } else {
        console.log(`⚠️ Failed to cache ${url}: ${response.status}`);
      }
    } catch (error) {
      console.log(`⚠️ Error caching ${url}:`, error);
    }
  });

  await Promise.allSettled(cachePromises);
}

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

  // Only handle API requests (both same-origin and backend API)
  const isApiPath =
    url.pathname.startsWith('/todos') ||
    url.pathname.startsWith('/categories') ||
    url.pathname.startsWith('/spaces') ||
    url.pathname.startsWith('/email') ||
    url.pathname.startsWith('/contact') ||
    url.pathname.startsWith('/chat') ||
    url.pathname.startsWith('/insights') ||
    url.pathname.startsWith('/journals') ||
    url.pathname.startsWith('/auth/');

  const isApi =
    (url.origin === self.location.origin && isApiPath) ||
    (url.hostname.includes('railway.app') && isApiPath) ||
    (url.hostname === 'localhost' && url.port === '8000' && isApiPath);

  if (isApi) {
    event.respondWith(handleApiRequest(event.request));
    return;
  }

  // Cache static assets so the app can load offline
  if (url.origin === self.location.origin) {
    event.respondWith(handleStaticRequest(event.request));
  }
});

async function handleApiRequest(request) {
  const online = self.navigator.onLine;
  const url = new URL(request.url);

  // Extract space_id from query parameters
  const spaceId = url.searchParams.get('space_id');

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
          // Filter by space if space_id parameter is provided
          const localTodos = await getTodos(authData.userId, spaceId);
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


          // Merge server todos with any remaining offline todos (for the specific space)
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

          // Get local categories for the specific space
          const localCategories = await getCategories(authData.userId, spaceId);
          const offlineOnlyCategories = localCategories.filter(c => c.name.startsWith('offline_'));
          const offlineOnlyNames = offlineOnlyCategories.map(c => c.name);

          // Remove any local categories that are not on the server and not offline entries
          const serverSet = new Set(serverCategories);
          for (const c of localCategories) {
            if (!c.name.startsWith('offline_') && !serverSet.has(c.name)) {
              await delCategory(c.name, authData.userId, spaceId);
            }
          }

          // Save all server categories to IndexedDB for offline access (as objects with space_id)
          for (const categoryName of serverCategories) {
            await putCategory({ name: categoryName, space_id: spaceId }, authData.userId);
          }

          // Merge server categories with offline-only categories (return as strings)
          const mergedCategories = [...serverCategories, ...offlineOnlyNames];

          return new Response(JSON.stringify(mergedCategories), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // For GET /spaces, sync server data to IndexedDB
        if (url.pathname === '/spaces') {
          const authData = await getAuth();
          if (!authData || !authData.userId) return response; // No user context

          const serverSpaces = await response.clone().json();

          // Save all server spaces to IndexedDB for offline access
          for (const space of serverSpaces) {
            await putSpace(space, authData.userId);
          }

          return response; // Return original response
        }

        // For GET /journals, sync server data to IndexedDB (same pattern as todos)
        if (url.pathname === '/journals') {
          const authData = await getAuth();
          if (!authData || !authData.userId) return response; // No user context

          const serverResponse = await response.clone().json();

          // Handle both single journal and array responses
          const serverJournals = Array.isArray(serverResponse) ? serverResponse : [serverResponse];

          // Save all server journals to IndexedDB for offline access
          for (const journal of serverJournals) {
            if (journal && journal._id) {
              await putJournal(journal, authData.userId);
            }
          }

          return response; // Return original response
        }
      }

      // Trigger sync for non-GET requests
      if (request.method !== 'GET' && response.ok) {
        syncQueue();
      }
      return response;
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return new Response(JSON.stringify({ error: 'Request aborted' }), {
          status: 408,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return offlineFallback(request, url);
    }
  }
  console.log(`📱 Falling back to offline handler for: ${request.method} ${url.pathname}`);
  return offlineFallback(request, url);
}

async function handleStaticRequest(request) {
  const url = new URL(request.url);
  const isDevelopment = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

  try {
    // Try network first for static files
    const response = await fetch(request);

    // Only cache in production to avoid development reload issues
    if (response.ok && request.method === 'GET' && !isDevelopment) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    // In development, don't use cache fallbacks - let it fail naturally
    if (isDevelopment) {
      return new Response('Development server unavailable', { status: 503 });
    }

    // Production: Network failed, try cache
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
  const spaceId = url.searchParams.get('space_id');

  // Handle core operations offline
  if (request.method === 'GET') {
    // Handle spaces
    if (url.pathname === '/spaces' || url.pathname.endsWith('/spaces')) {
      const spaces = await getSpaces(authData ? authData.userId : null);
      return new Response(JSON.stringify(spaces), { headers: { 'Content-Type': 'application/json' } });
    }

    // Handle journals
    if (url.pathname === '/journals' || url.pathname.endsWith('/journals')) {
      const date = url.searchParams.get('date');
      const spaceId = url.searchParams.get('space_id');
      const journals = await getJournals(authData ? authData.userId : null, date, spaceId);

      if (date && journals.length > 0) {
        // Return single entry for specific date (one journal per day)
        return new Response(JSON.stringify(journals[0]), { headers: { 'Content-Type': 'application/json' } });
      } else if (date) {
        // No entry found for date
        return new Response('null', { headers: { 'Content-Type': 'application/json' } });
      } else {
        // Return all journals as array
        return new Response(JSON.stringify(journals), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Handle todos (space-aware)
    if (url.pathname === '/todos' || url.pathname.endsWith('/todos')) {
      const todos = await getTodos(authData ? authData.userId : null, spaceId);
      console.log('📱 Offline GET /todos - Todo IDs:', todos.map(t => t._id));
      return new Response(JSON.stringify(todos), { headers: { 'Content-Type': 'application/json' } });
    }

    // Handle categories (space-aware)
    if (url.pathname === '/categories' || url.pathname.endsWith('/categories')) {
      const offlineCategories = await getCategories(authData ? authData.userId : null, spaceId);

      // If we have stored categories, return their names; otherwise use defaults
      if (offlineCategories && offlineCategories.length > 0) {
        const categoryNames = offlineCategories.map(c => c.name);
        return new Response(JSON.stringify(categoryNames), { headers: { 'Content-Type': 'application/json' } });
      } else {
        return new Response(JSON.stringify(DEFAULT_CATEGORIES), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    // Handle insights by reusing the todos path so analytics logic is shared
    if (url.pathname === '/insights' || url.pathname.endsWith('/insights')) {
      try {
        // Build a request for /todos with the same query params and headers
        const headers = new Headers(request.headers);
        const todosRequest = new Request(`/todos${url.search}`, { method: 'GET', headers });

        // Use existing handler to get merged todo data (online or offline)
        const todosResponse = await handleApiRequest(todosRequest);
        if (!todosResponse || !todosResponse.ok) {
          return todosResponse;
        }

        const todos = await todosResponse.clone().json();
        const insights = generateInsights(todos);
        return new Response(JSON.stringify(insights), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        // Fallback to locally stored todos if any step fails
        const authData = await getAuth();
        const todos = await getTodos(authData ? authData.userId : null, spaceId);
        const insights = generateInsights(todos);
        return new Response(JSON.stringify(insights), {
          headers: { 'Content-Type': 'application/json' }
        });
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
        notes: data.notes || '',
        completed: false,
        user_id: authData ? authData.userId : 'offline_user',
        space_id: data.space_id || null, // Include space_id from request data
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
      // console.log(`✅ Offline COMPLETE request for todo ID: ${id}`);

      const existingTodos = await getTodos(authData ? authData.userId : null);
      const existingTodo = existingTodos.find(t => t._id === id);

      if (existingTodo) {
        // console.log(`✅ Todo ${id} found in IndexedDB, updating completion status...`);
        const updated = { ...existingTodo, completed: !existingTodo.completed };
        if (updated.completed) {
          updated.dateCompleted = new Date().toISOString();
        } else {
          delete updated.dateCompleted;
        }
        await putTodo(updated, authData ? authData.userId : null);

        // Handle offline todo completion - update the queued CREATE operation
        if (id.startsWith('offline_')) {
          // Update the CREATE operation in queue with completion status
          const queue = await readQueue(authData ? authData.userId : null);
          const updatedQueue = queue.map(op => {
            if (op.type === 'CREATE' && op.data._id === id) {
              // console.log(`✅ Updating queued CREATE operation for ${id} with completion status`);
              return { ...op, data: { ...op.data, completed: updated.completed, dateCompleted: updated.dateCompleted } };
            }
            return op;
          });

          if (JSON.stringify(queue) !== JSON.stringify(updatedQueue)) {
            await clearQueue(authData ? authData.userId : null);
            for (const op of updatedQueue) {
              await addQueue(op, authData ? authData.userId : null);
            }
          }
          // console.log(`✅ Offline todo ${id} completion status updated in CREATE queue`);
        } else {
          await addQueue({ type: 'COMPLETE', data: { _id: id, completed: updated.completed } }, authData ? authData.userId : null);
          // console.log(`✅ Added server COMPLETE to queue for ${id} (completed: ${updated.completed})`);
        }

        return new Response(JSON.stringify({ message: 'Todo updated' }), { headers: { 'Content-Type': 'application/json' } });
      } else {
        console.log(`⚠️ Todo ${id} not found in IndexedDB for completion`);
      }
    }

    // Delete todo
    if (url.pathname.startsWith('/todos/') && request.method === 'DELETE') {
      const id = url.pathname.split('/')[2]; // Get ID from /todos/{id}
      console.log(`🗑️ Offline DELETE request for todo ID: ${id}`);

      // Check if todo exists before deleting
      const existingTodos = await getTodos(authData ? authData.userId : null);
      const todoExists = existingTodos.find(t => t._id === id);

      if (todoExists) {
        console.log(`🗑️ Todo ${id} found in IndexedDB, deleting...`);
        await delTodo(id, authData ? authData.userId : null);

        // Check if there's a pending CREATE for this offline todo
        if (id.startsWith('offline_')) {
          // Remove the CREATE operation from queue to prevent resurrection
          const queue = await readQueue(authData ? authData.userId : null);
          const filteredQueue = queue.filter(op => !(op.type === 'CREATE' && op.data._id === id));
          if (filteredQueue.length !== queue.length) {
            console.log(`🗑️ Removed pending CREATE operation for deleted offline todo ${id}`);
            await clearQueue(authData ? authData.userId : null);
            for (const op of filteredQueue) {
              await addQueue(op, authData ? authData.userId : null);
            }
          }
          console.log(`🗑️ Offline todo ${id} deleted and CREATE operation cancelled`);
        } else {
          await addQueue({ type: 'DELETE', data: { _id: id } }, authData ? authData.userId : null);
          console.log(`🗑️ Added server DELETE to queue for ${id}`);
        }
      } else {
        console.log(`⚠️ Todo ${id} not found in IndexedDB`);
      }

      return new Response(null, { status: 204 });
    }

    // Create new category
    if ((url.pathname === '/categories' || url.pathname.endsWith('/categories')) && request.method === 'POST') {
      const categoryName = data.name || `offline_${Date.now()}`;
      const newCategory = { name: categoryName, space_id: data.space_id || null };

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

      // Update all todos referencing this category in the specified space
      const todos = await getTodos(authData ? authData.userId : null, spaceId);
      for (const t of todos) {
        if (t.category === oldName && t.space_id === spaceId) {
          const updated = { ...t, category: newName };
          await putTodo(updated, authData ? authData.userId : null);
          await addQueue({ type: 'UPDATE', data: updated }, authData ? authData.userId : null);
        }
      }

      await delCategory(oldName, authData ? authData.userId : null, spaceId);
      await putCategory({ name: newName, space_id: spaceId }, authData ? authData.userId : null);

      const queueEntries = await readQueue(authData ? authData.userId : null);
      const createIdx = queueEntries.findIndex(q => q.type === 'CREATE_CATEGORY' && q.data.name === oldName && q.data.space_id === spaceId);
      if (createIdx !== -1) {
        queueEntries[createIdx].data.name = newName;
        await clearQueue(authData ? authData.userId : null);
        for (const entry of queueEntries) {
          await addQueue({ type: entry.type, data: entry.data }, authData ? authData.userId : null);
        }
      } else {
        await addQueue({ type: 'RENAME_CATEGORY', data: { old_name: oldName, new_name: newName, space_id: spaceId } }, authData ? authData.userId : null);
      }

      return new Response(JSON.stringify({ message: 'Category renamed' }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Delete category
    if (url.pathname.startsWith('/categories/') && request.method === 'DELETE') {
      const categoryName = decodeURIComponent(url.pathname.split('/')[2]); // Get name from /categories/{name}

      // Update todos that use this category to "General" in the specified space
      const todos = await getTodos(authData ? authData.userId : null, spaceId);
      for (const t of todos) {
        if (t.category === categoryName && t.space_id === spaceId) {
          const updated = { ...t, category: 'General' };
          await putTodo(updated, authData ? authData.userId : null);
          await addQueue({ type: 'UPDATE', data: updated }, authData ? authData.userId : null);
        }
      }

      await delCategory(categoryName, authData ? authData.userId : null, spaceId);

      const queueEntries = await readQueue(authData ? authData.userId : null);
      const createIdx = queueEntries.findIndex(q => q.type === 'CREATE_CATEGORY' && q.data.name === categoryName && q.data.space_id === spaceId);
      if (createIdx !== -1) {
        queueEntries.splice(createIdx, 1); // Cancel pending create if never synced
        await clearQueue(authData ? authData.userId : null);
        for (const entry of queueEntries) {
          await addQueue({ type: entry.type, data: entry.data }, authData ? authData.userId : null);
        }
      } else {
        await addQueue({ type: 'DELETE_CATEGORY', data: { name: categoryName, space_id: spaceId } }, authData ? authData.userId : null);
      }

      // Ensure a General category exists after deletion
      const remainingCategories = await getCategories(authData ? authData.userId : null, spaceId);
      const hasGeneral = remainingCategories.some(c => c.name === 'General' && c.space_id === spaceId);
      if (!hasGeneral) {
        const generalCategory = { name: 'General', space_id: spaceId };
        await putCategory(generalCategory, authData ? authData.userId : null);
        // Server will recreate General automatically; no need to queue
      }

      return new Response(null, { status: 204 });
    }

    // Create or update journal entry (optimized for auto-save)
    if ((url.pathname === '/journals' || url.pathname.endsWith('/journals')) && request.method === 'POST') {
      const existing = await getJournals(
        authData ? authData.userId : null,
        data.date,
        data.space_id || null
      );

      let journalData;
      if (existing && existing.length > 0) {
        // Update existing entry (perfect for auto-save!)
        journalData = {
          ...existing[0],
          text: data.text,
          updated_at: new Date().toISOString(),
        };
      } else {
        // Create new offline entry only when needed
        journalData = {
          _id: `offline_journal_${data.date}_${Date.now()}`,
          user_id: authData ? authData.userId : 'offline_user',
          space_id: data.space_id || null,
          date: data.date,
          text: data.text,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_offline: true,
        };
      }

      await putJournal(journalData, authData ? authData.userId : null);

      // For auto-save optimization: only add to queue if this is a new journal
      // For updates to existing journals, replace the existing queue entry
      if (existing && existing.length > 0) {
        // Update existing queue entry for auto-save efficiency
        const queue = await readQueue(authData ? authData.userId : null);
        const existingQueueIndex = queue.findIndex(op =>
          op.type === 'CREATE_JOURNAL' &&
          op.data.date === data.date &&
          op.data.space_id === (data.space_id || null)
        );

        if (existingQueueIndex !== -1) {
          // Replace existing queue entry
          queue[existingQueueIndex].data = journalData;
          await clearQueue(authData ? authData.userId : null);
          for (const op of queue) {
            await addQueue(op, authData ? authData.userId : null);
          }
        } else {
          // No existing queue entry, add new one
          await addQueue({ type: 'CREATE_JOURNAL', data: journalData }, authData ? authData.userId : null);
        }
      } else {
        // New journal, add to queue
        await addQueue({ type: 'CREATE_JOURNAL', data: journalData }, authData ? authData.userId : null);
      }

      return new Response(JSON.stringify(journalData), { headers: { 'Content-Type': 'application/json' } });
    }

    // Delete journal entry
    if (url.pathname.startsWith('/journals/') && request.method === 'DELETE') {
      const id = url.pathname.split('/')[2];
      console.log(`🗑️ Offline DELETE journal request for ID: ${id}`);

      const existingJournals = await getJournals(authData ? authData.userId : null);
      const journalExists = existingJournals.find(j => j._id === id);

      if (journalExists) {
        console.log(`🗑️ Journal ${id} found in IndexedDB, deleting...`);
        await delJournal(id, authData ? authData.userId : null);

        if (id.startsWith('offline_journal_')) {
          // Remove the CREATE operation from queue to prevent resurrection
          const queue = await readQueue(authData ? authData.userId : null);
          const filteredQueue = queue.filter(op => !(op.type === 'CREATE_JOURNAL' && op.data._id === id));
          if (filteredQueue.length !== queue.length) {
            console.log(`🗑️ Removed pending CREATE_JOURNAL operation for deleted offline journal ${id}`);
            await clearQueue(authData ? authData.userId : null);
            for (const op of filteredQueue) {
              await addQueue(op, authData ? authData.userId : null);
            }
          }
          console.log(`🗑️ Offline journal ${id} deleted and CREATE operation cancelled`);
        } else {
          await addQueue({ type: 'DELETE_JOURNAL', data: { _id: id } }, authData ? authData.userId : null);
          console.log(`🗑️ Added server DELETE_JOURNAL to queue for ${id}`);
        }
      } else {
        console.log(`⚠️ Journal ${id} not found in IndexedDB`);
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
  // console.log('Starting sync...');

  try {
    const queue = await readQueue(authData.userId);
    const headers = await getAuthHeaders();

    // Load persistent ID mapping
    let idMap = await getIdMap(authData.userId);
    // console.log('📋 Loaded ID mapping:', idMap);

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
              console.log(`🔄 Sync SUCCESS: Replacing offline todo ${offlineId} with server todo ${serverTodo._id}`);

              // Update ID mapping
              idMap[offlineId] = serverTodo._id;
              console.log(`🗺️ Added ID mapping: ${offlineId} -> ${serverTodo._id}`);

              // Persist mapping immediately in case sync is interrupted
              await putIdMap(idMap, authData.userId);

              await delTodo(offlineId, authData.userId); // Remove offline version
              await putTodo(serverTodo, authData.userId); // Add server version
              console.log(`✅ Synced offline todo ${offlineId} -> ${serverTodo._id}`);
            } else {
              console.log(`❌ Sync FAILED: Offline todo ${offlineId} will be preserved`);
            }
          }
          break;
        case 'UPDATE':
          // Check if we need to translate offline ID to server ID
          let updateId = op.data._id;
          if (updateId.startsWith('offline_') && idMap[updateId]) {
            updateId = idMap[updateId];
            console.log(`🗺️ Translating UPDATE ID: ${op.data._id} -> ${updateId}`);
          }

          if (!updateId.startsWith('offline_')) {
            res = await fetch(`/todos/${updateId}`, {
              method: 'PUT',
              headers,
              body: JSON.stringify({ ...op.data, _id: updateId }),
            });
            if (res && res.ok) {
              // Update local copy with the changes
              await putTodo({ ...op.data, _id: updateId }, authData.userId);
            }
          }
          break;
        case 'COMPLETE':
          // Check if we need to translate offline ID to server ID
          let completeId = op.data._id;
          if (completeId.startsWith('offline_') && idMap[completeId]) {
            completeId = idMap[completeId];
            console.log(`🗺️ Translating COMPLETE ID: ${op.data._id} -> ${completeId}`);
          }

          if (!completeId.startsWith('offline_')) {
            res = await fetch(`/todos/${completeId}/complete`, {
              method: 'PUT',
              headers
            });
            if (res && res.ok) {
              // Update local todo completion status
              const existingTodos = await getTodos(authData.userId);
              const existingTodo = existingTodos.find(t => t._id === completeId);
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
          // Check if we need to translate offline ID to server ID
          let deleteId = op.data._id;
          if (deleteId.startsWith('offline_') && idMap[deleteId]) {
            deleteId = idMap[deleteId];
            console.log(`🗺️ Translating DELETE ID: ${op.data._id} -> ${deleteId}`);
          }

          if (!deleteId.startsWith('offline_')) {
            res = await fetch(`/todos/${deleteId}`, {
              method: 'DELETE',
              headers
            });
            if (res && res.ok) {
              // Remove from local storage
              await delTodo(deleteId, authData.userId);
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
            await putCategory({ ...serverCategory, space_id: op.data.space_id }, authData.userId);
          }
          break;
        case 'DELETE_CATEGORY':
          const deleteUrl = op.data.space_id
            ? `/categories/${encodeURIComponent(op.data.name)}?space_id=${op.data.space_id}`
            : `/categories/${encodeURIComponent(op.data.name)}`;
          res = await fetch(deleteUrl, {
            method: 'DELETE',
            headers
          });
          if (res.ok) {
            await delCategory(op.data.name, authData.userId, op.data.space_id);
          }
          break;
        case 'RENAME_CATEGORY':
          const renameUrl = op.data.space_id
            ? `/categories/${encodeURIComponent(op.data.old_name)}?space_id=${op.data.space_id}`
            : `/categories/${encodeURIComponent(op.data.old_name)}`;
          res = await fetch(renameUrl, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ new_name: op.data.new_name })
          });
          if (res.ok) {
            await delCategory(op.data.old_name, authData.userId, op.data.space_id);
            await putCategory({ name: op.data.new_name, space_id: op.data.space_id }, authData.userId);
          }
          break;
        case 'CREATE_JOURNAL':
          if (op.data._id.startsWith('offline_journal_')) {
            const { _id: offlineId, ...payload } = op.data;
            res = await fetch('/journals', {
              method: 'POST',
              headers,
              body: JSON.stringify(payload),
            });
            if (res && res.ok) {
              // Immediately replace offline journal with server version
              const serverJournal = await res.json();
              console.log(`🔄 Journal Sync SUCCESS: Replacing offline journal ${offlineId} with server journal ${serverJournal._id}`);

              // Update ID mapping
              idMap[offlineId] = serverJournal._id;
              console.log(`🗺️ Added Journal ID mapping: ${offlineId} -> ${serverJournal._id}`);

              // Persist mapping immediately
              await putIdMap(idMap, authData.userId);

              await delJournal(offlineId, authData.userId); // Remove offline version
              await putJournal(serverJournal, authData.userId); // Add server version
              console.log(`✅ Synced offline journal ${offlineId} -> ${serverJournal._id}`);
            } else {
              console.log(`❌ Journal Sync FAILED: Offline journal ${offlineId} will be preserved`);
            }
          } else {
            // Handle both offline-generated and regular journal updates
            res = await fetch('/journals', {
              method: 'POST',
              headers,
              body: JSON.stringify(op.data),
            });
            if (res && res.ok) {
              const serverJournal = await res.json();
              await putJournal(serverJournal, authData.userId);
            }
          }
          break;
        case 'DELETE_JOURNAL':
          // Check if we need to translate offline ID to server ID
          let deleteJournalId = op.data._id;
          if (deleteJournalId.startsWith('offline_journal_') && idMap[deleteJournalId]) {
            deleteJournalId = idMap[deleteJournalId];
            console.log(`🗺️ Translating DELETE_JOURNAL ID: ${op.data._id} -> ${deleteJournalId}`);
          }

          if (!deleteJournalId.startsWith('offline_journal_')) {
            res = await fetch(`/journals/${deleteJournalId}`, {
              method: 'DELETE',
              headers
            });
            if (res && res.ok) {
              // Remove from local storage
              await delJournal(deleteJournalId, authData.userId);
            }
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

    // Persist the updated ID mapping
    await putIdMap(idMap, authData.userId);
    // console.log('📋 Saved updated ID mapping:', idMap);

    // Always clear queue after processing (prevents infinite retry loops)
    await clearQueue(authData.userId);
    // console.log('Sync completed');
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
    getAuthHeaders,
    syncQueue,
    handleRequest: handleApiRequest,
    generateInsights,
  };
}
