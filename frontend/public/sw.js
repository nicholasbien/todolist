// IMPORTANT: Always increment these versions when modifying this service worker file
// This forces browsers to download and use the updated service worker
const STATIC_CACHE = 'todo-static-v102';
const API_CACHE = 'todo-api-v102';

const GLOBAL_DB_NAME = 'TodoGlobalDB';
const USER_DB_PREFIX = 'TodoUserDB_';
const DB_VERSION = 11;

// Configuration
const CONFIG = {
  PRODUCTION_BACKEND: 'https://backend-production-e920.up.railway.app',
  LOCAL_BACKEND: 'http://localhost:8000',
  PRODUCTION_DOMAIN: 'todolist.nyc'
};
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

const clearTodos = async (userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  return userDbTx(effectiveUserId, TODOS, 'readwrite', (s) => s.clear());
};

const clearJournals = async (userId) => {
  const authData = userId ? null : await getAuth();
  const effectiveUserId = userId || (authData ? authData.userId : null);
  return userDbTx(effectiveUserId, JOURNALS, 'readwrite', (s) => s.clear());
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
  // For IndexedDB operations, we need to determine which user database to access
  let effectiveUserId = userId;
  if (!effectiveUserId) {
    const authData = await getAuth();
    effectiveUserId = authData ? authData.userId : null;
  }

  if (!effectiveUserId) {
    console.log('🚫 getJournals: No user ID available');
    return [];
  }

  const allJournals = await userDbTx(effectiveUserId, JOURNALS, 'readonly', (s) => s.getAll());

  let filteredJournals = allJournals;

  if (date) {
    filteredJournals = filteredJournals.filter(j => j.date === date);
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

    // Fetch and store journals
    try {
      const journalsResponse = await fetch('/journals', { headers });
      if (journalsResponse.ok) {
        const serverJournals = await journalsResponse.json();

        // Handle both single journal and array responses
        if (serverJournals !== null) {
          const journalArray = Array.isArray(serverJournals) ? serverJournals : [serverJournals];
          for (const journal of journalArray) {
            if (journal && journal._id) {
              await putJournal(journal, authData.userId);
            }
          }
        }
      }
    } catch (err) {
      console.log('Failed to sync journals:', err);
    }
  } catch (err) {
    console.log('Failed to sync server data:', err);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      // Pre-cache static files with individual error handling
      cacheStaticFiles(),
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


  // Check if this is a same-origin request or a Capacitor file:// request
  const isSameOrigin = url.origin === self.location.origin;
  const isCapacitorLocal = self.location.protocol === 'file:' &&
                        (url.pathname.startsWith('/todos') ||
                         url.pathname.startsWith('/categories') ||
                         url.pathname.startsWith('/spaces') ||
                         url.pathname.startsWith('/journals') ||
                         url.pathname.startsWith('/insights') ||
                         url.pathname.startsWith('/chat') ||
                         url.pathname.startsWith('/auth') ||
                         url.pathname.startsWith('/email') ||
                         url.pathname.startsWith('/contact') ||
                         url.pathname.startsWith('/export') ||
                         url.pathname.startsWith('/health'));

  // Handle all API requests including auth
  const isApi = (isSameOrigin || isCapacitorLocal) &&
                (url.pathname.startsWith('/todos') ||
                 url.pathname.startsWith('/categories') ||
                 url.pathname.startsWith('/spaces') ||
                 url.pathname.startsWith('/journals') ||
                 url.pathname.startsWith('/insights') ||
                 url.pathname.startsWith('/chat') ||
                 url.pathname.startsWith('/auth') ||
                 url.pathname.startsWith('/email') ||
                 url.pathname.startsWith('/contact') ||
                 url.pathname.startsWith('/export') ||
                 url.pathname.startsWith('/health'));


  // Special handling for /api/agent - pass through to Next.js instead of backend
  if (isSameOrigin && url.pathname.startsWith('/api/agent')) {
    // Let Next.js handle /api/agent requests directly
    return;
  }

  if (isApi) {
    event.respondWith(handleApiRequest(event.request));
    return;
  }

  // Cache static assets so the app can load offline
  if (isSameOrigin) {
    event.respondWith(handleStaticRequest(event.request));
  }
});

async function handleApiRequest(request) {
  const online = self.navigator.onLine;
  const url = new URL(request.url);


  // Extract space_id from query parameters
  const spaceId = url.searchParams.get('space_id');

  // Check if this is an offline-generated ID that shouldn't go to server
  const pathParts = url.pathname.split('/');
  const isOfflineId = pathParts.some(part => part.startsWith('offline_'));

  if (online && !isOfflineId) {
    try {
      // For GET requests, we need to be careful about sync timing to preserve offline data
      // Sync will be triggered after response handling to avoid overwriting offline changes

      // Determine environment
      const isCapacitor = self.location.protocol === 'file:';
      const isProdHost = self.location.hostname.endsWith(CONFIG.PRODUCTION_DOMAIN);

      // Route directly to backend
      const apiPath = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
      const queryString = url.search;


      // Use production backend for deployed domains and Capacitor
      const backendUrl = (isProdHost || isCapacitor)
        ? CONFIG.PRODUCTION_BACKEND
        : CONFIG.LOCAL_BACKEND;

      const targetUrl = `${backendUrl}/${apiPath}${queryString}`;

      // Forward the request with auth headers (except for signup/login endpoints)
      const noAuthRequired = ['/auth/signup', '/auth/login'];
      const needsAuth = !noAuthRequired.includes(url.pathname);
      const headers = needsAuth
        ? await getAuthHeaders()
        : { 'Content-Type': 'application/json' };

      const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.blob() : null
      });

      console.log(`🔗 Service worker routing: ${request.url} -> ${targetUrl}`);
      console.log(`📱 Is Capacitor: ${isCapacitor}, Prod host: ${isProdHost}, Protocol: ${self.location.protocol}`);


      let response;
      try {
        response = await fetch(proxyRequest);
      } catch (error) {
        throw error;
      }

      // Don't cache auth requests
      if (request.method === 'GET' && response.ok && !url.pathname.startsWith('/auth')) {
        const cache = await caches.open(API_CACHE);
        cache.put(request, response.clone());

        // For GET /todos, sync pending operations then merge with fresh server data
        if (url.pathname === '/todos') {
          const authData = await getAuth();
          if (!authData || !authData.userId) return response; // No user context

          const serverTodos = await response.clone().json();

          // Save all server todos to IndexedDB for offline access
          for (const todo of serverTodos) {
            if (todo && todo._id) {
              await putTodo(todo, authData.userId);
            }
          }

          return response; // Return original response
        }

        // For GET /journals, sync server data to IndexedDB
        if (url.pathname === '/journals') {
          const authData = await getAuth();
          if (!authData || !authData.userId) {
            console.log('⚠️ No auth data for journal caching');
            return response; // No user context
          }

          const serverResponse = await response.clone().json();

          // Only process non-null responses
          if (serverResponse !== null) {
            // Simple approach: Don't cache ANY server journal data if sync is in progress or there's pending data
            const queue = await readQueue(authData.userId);
            console.log(`🔍 JOURNAL DEBUG - Queue length: ${queue.length}, User: ${authData.userId}`);
            console.log(`🔍 JOURNAL DEBUG - Queue contents:`, queue.map(op => `${op.type}:${op.data.date}`));

            const hasPendingJournals = queue.some(op =>
              (op.type === 'CREATE_JOURNAL' || op.type === 'UPDATE_JOURNAL') &&
              (op.data.space_id === spaceId || (!spaceId && !op.data.space_id))
            );
            console.log(`🔍 JOURNAL DEBUG - Pending journals for space ${spaceId}: ${hasPendingJournals}`);
            console.log(`🔍 JOURNAL DEBUG - Sync in progress: ${syncInProgress}`);

            if (syncInProgress || hasPendingJournals) {
              console.log(`⏸️ BLOCKING journal server data - sync: ${syncInProgress}, pending: ${hasPendingJournals}`);
              // Don't cache server data, return original response
            } else {
              // Safe to cache server data
              const serverJournals = Array.isArray(serverResponse) ? serverResponse : [serverResponse];
              let cachedCount = 0;
              for (const journal of serverJournals) {
                if (journal && journal._id && journal.date) {
                  await putJournal(journal, authData.userId);
                  cachedCount++;
                }
              }
              if (cachedCount > 0) {
                console.log(`📝 Cached ${cachedCount} journal(s) to IndexedDB`);
              }
            }
          } else {
            console.log('📝 No journal data to cache');
          }

          // Now sync queued journal operations after response caching to preserve offline changes
          if (url.pathname === '/journals' && request.method === 'GET') {
            console.log(`🔄 Syncing journal queue after GET response caching`);
            syncQueue().catch(err => console.error('Journal sync error:', err));
          }

          return response; // Return original response
        }
      }

      // Trigger sync for non-GET requests and GET requests that weren't already synced
      if (response.ok) {
        if (request.method !== 'GET') {
          syncQueue();
        } else if (url.pathname !== '/journals') {
          // Sync for other GET requests after caching
          console.log(`🔄 Syncing queue after GET ${url.pathname}`);
          syncQueue().catch(err => console.error('GET sync error:', err));
        }
      }
      return response;
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return new Response(JSON.stringify({ error: 'Request aborted' }), {
          status: 408,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return handleOfflineRequest(request, url);
    }
  }
  console.log(`📱 Falling back to offline handler for: ${request.method} ${url.pathname}`);
  return handleOfflineRequest(request, url);
}


// Handle offline API requests
async function handleOfflineRequest(request, url) {
  const authData = await getAuth();
  if (!authData || !authData.userId) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Handle GET requests from cache/IndexedDB
  if (request.method === 'GET') {
    // Extract the actual API path (remove /api prefix)
    const apiPath = url.pathname.replace('/api', '');

    if (apiPath === '/todos') {
      const spaceId = url.searchParams.get('space_id');
      const todos = await getTodos(authData.userId);

      // Filter by space if specified
      const filteredTodos = spaceId ? todos.filter(t => t.space_id === spaceId) : todos;

      console.log(`📱 Offline GET /todos - Found ${filteredTodos.length} todos`);
      return new Response(JSON.stringify(filteredTodos), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (apiPath === '/journals') {
      const spaceId = url.searchParams.get('space_id');
      const date = url.searchParams.get('date');
      const journals = await getJournals(authData.userId, date, spaceId);

      console.log(`📱 Offline GET /journals - Found ${journals.length} journals`);

      if (date && journals.length > 0) {
        // Return single entry for specific date (one journal per day)
        return new Response(JSON.stringify(journals[0]), { headers: { 'Content-Type': 'application/json' } });
      } else if (date) {
        // No entry found for date
        return new Response(JSON.stringify(null), { headers: { 'Content-Type': 'application/json' } });
      } else {
        // Return all journals as array
        return new Response(JSON.stringify(journals), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (apiPath === '/categories') {
      const spaceId = url.searchParams.get('space_id');
      const categories = await getCategories(authData.userId, spaceId);

      // Return category names as strings to match backend format
      const categoryNames = categories.map(c => c.name || c);
      return new Response(JSON.stringify(categoryNames), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (apiPath === '/spaces') {
      const spaces = await getSpaces(authData.userId);

      return new Response(JSON.stringify(spaces), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (apiPath === '/insights') {
      const spaceId = url.searchParams.get('space_id');
      const todos = await getTodos(authData.userId, spaceId);
      const insights = generateInsights(todos);

      return new Response(JSON.stringify(insights), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Handle non-GET requests (POST, PUT, DELETE)
  // Extract the actual API path (remove /api prefix)
  const apiPath = url.pathname.replace('/api', '');

  // Parse request body for write operations
  let data = {};
  try {
    const dataText = await request.clone().text();
    if (dataText) data = JSON.parse(dataText);
  } catch (e) {}

  // Handle journal POST requests
  if (request.method === 'POST' && apiPath === '/journals') {
    console.log('📝 Processing offline journal POST:', data);
    const existing = await getJournals(
      authData ? authData.userId : null,
      data.date,
      data.space_id || null
    );
    console.log('📝 Found existing journals:', existing.length);

    let journalData;
    let operationType;

    if (existing && existing.length > 0) {
      // Update existing entry
      journalData = {
        ...existing[0],
        text: data.text,
        updated_at: new Date().toISOString(),
        updated_offline: true, // last updated offline
      };
      operationType = existing[0]._id.startsWith('offline_journal_') ? 'CREATE_JOURNAL' : 'UPDATE_JOURNAL';
    } else {
      // Create new offline entry
      journalData = {
        _id: `offline_journal_${data.date}_${Date.now()}`,
        user_id: authData ? authData.userId : 'offline_user',
        space_id: data.space_id || null,
        date: data.date,
        text: data.text,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_offline: true,
        updated_offline: true,
      };
      operationType = 'CREATE_JOURNAL';
    }

    await putJournal(journalData, authData ? authData.userId : null);

    // Use queue optimization for all journal operations - replace existing entries with latest state
    const queue = await readQueue(authData ? authData.userId : null);
    const existingQueueIndex = queue.findIndex(op =>
      (op.type === 'CREATE_JOURNAL' || op.type === 'UPDATE_JOURNAL') &&
      op.data.date === data.date &&
      op.data.space_id === (data.space_id || null)
    );

    if (existingQueueIndex !== -1) {
      // Replace existing queue entry with latest state
      queue[existingQueueIndex] = { type: operationType, data: journalData };
      await clearQueue(authData ? authData.userId : null);
      for (const op of queue) {
        await addQueue(op, authData ? authData.userId : null);
      }
    } else {
      // Add new queue entry
      await addQueue({ type: operationType, data: journalData }, authData ? authData.userId : null);
    }

    return new Response(JSON.stringify(journalData), { headers: { 'Content-Type': 'application/json' } });
  }

  // Handle journal DELETE requests
  if (request.method === 'DELETE' && apiPath.startsWith('/journals/')) {
    const id = apiPath.split('/')[2]; // Get ID from /journals/{id}
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

      return new Response(null, { status: 204 });
    }

    return new Response(JSON.stringify({ error: 'Journal not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ========= TODO OPERATIONS =========

  // Create new todo
  if (request.method === 'POST' && apiPath === '/todos') {
    const text = data.text || '';

    let todoData = {
      _id: 'offline_' + Date.now(),
      text: text,
      category: data.category || 'General',
      priority: normalizePriority(data.priority),
      dateAdded: new Date().toISOString(),
      dueDate: null,
      notes: data.notes || '',
      completed: false,
      user_id: authData.userId,
      space_id: data.space_id || null,
      created_offline: true,
    };

    // If it's a URL, store it as a link (title fetching will happen when synced)
    if (text.startsWith('http://') || text.startsWith('https://')) {
      todoData.link = text;
    }

    await putTodo(todoData, authData.userId);
    await addQueue({ type: 'CREATE', data: todoData }, authData.userId);
    return new Response(JSON.stringify(todoData), { headers: { 'Content-Type': 'application/json' } });
  }

  // Update todo (category, priority changes)
  if (request.method === 'PUT' && apiPath.startsWith('/todos/') && !apiPath.endsWith('/complete')) {
    const id = apiPath.split('/')[2];
    const existingTodos = await getTodos(authData.userId);
    const existingTodo = existingTodos.find(t => t._id === id);

    if (existingTodo) {
      const updated = { ...existingTodo, ...data };
      await putTodo(updated, authData.userId);
      await addQueue({ type: 'UPDATE', data: updated }, authData.userId);
      return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
    }
  }

  // Complete/uncomplete todo
  if (request.method === 'PUT' && apiPath.endsWith('/complete')) {
    const id = apiPath.split('/')[2];
    const existingTodos = await getTodos(authData.userId);
    const existingTodo = existingTodos.find(t => t._id === id);

    if (existingTodo) {
      const updated = { ...existingTodo, completed: !existingTodo.completed };
      if (updated.completed) {
        updated.dateCompleted = new Date().toISOString();
      } else {
        delete updated.dateCompleted;
      }
      await putTodo(updated, authData.userId);

      // Handle offline todo completion - update the queued CREATE operation
      if (id.startsWith('offline_')) {
        const queue = await readQueue(authData.userId);
        const updatedQueue = queue.map(op => {
          if (op.type === 'CREATE' && op.data._id === id) {
            return { ...op, data: { ...op.data, completed: updated.completed, dateCompleted: updated.dateCompleted } };
          }
          return op;
        });

        if (JSON.stringify(queue) !== JSON.stringify(updatedQueue)) {
          await clearQueue(authData.userId);
          for (const op of updatedQueue) {
            await addQueue(op, authData.userId);
          }
        }
      } else {
        await addQueue({ type: 'COMPLETE', data: { _id: id, completed: updated.completed } }, authData.userId);
      }

      return new Response(JSON.stringify({ message: 'Todo updated' }), { headers: { 'Content-Type': 'application/json' } });
    }
  }

  // Delete todo
  if (request.method === 'DELETE' && apiPath.startsWith('/todos/')) {
    const id = apiPath.split('/')[2];
    const existingTodos = await getTodos(authData.userId);
    const todoExists = existingTodos.find(t => t._id === id);

    if (todoExists) {
      await delTodo(id, authData.userId);

      if (id.startsWith('offline_')) {
        // Remove the CREATE operation from queue to prevent resurrection
        const queue = await readQueue(authData.userId);
        const filteredQueue = queue.filter(op => !(op.type === 'CREATE' && op.data._id === id));
        if (filteredQueue.length !== queue.length) {
          await clearQueue(authData.userId);
          for (const op of filteredQueue) {
            await addQueue(op, authData.userId);
          }
        }
      } else {
        await addQueue({ type: 'DELETE', data: { _id: id } }, authData.userId);
      }
    }

    return new Response(null, { status: 204 });
  }

  // ========= CATEGORY OPERATIONS =========

  // Create new category
  if (request.method === 'POST' && apiPath === '/categories') {
    const categoryName = data.name || `offline_${Date.now()}`;
    const newCategory = { name: categoryName, space_id: data.space_id || null };

    await putCategory(newCategory, authData.userId);
    await addQueue({ type: 'CREATE_CATEGORY', data: newCategory }, authData.userId);
    return new Response(JSON.stringify(newCategory), { headers: { 'Content-Type': 'application/json' } });
  }

  // Update/rename category
  if (request.method === 'PUT' && apiPath.startsWith('/categories/')) {
    const oldName = decodeURIComponent(apiPath.split('/')[2]);
    const newName = (data.new_name || '').trim();
    const spaceId = url.searchParams.get('space_id');

    if (!newName) {
      return new Response(JSON.stringify({ error: 'Invalid name' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Update all todos referencing this category in the specified space
    const todos = await getTodos(authData.userId, spaceId);
    for (const t of todos) {
      if (t.category === oldName && t.space_id === spaceId) {
        const updated = { ...t, category: newName };
        await putTodo(updated, authData.userId);
        await addQueue({ type: 'UPDATE', data: updated }, authData.userId);
      }
    }

    await delCategory(oldName, authData.userId, spaceId);
    await putCategory({ name: newName, space_id: spaceId }, authData.userId);
    await addQueue({ type: 'RENAME_CATEGORY', data: { old_name: oldName, new_name: newName, space_id: spaceId } }, authData.userId);

    return new Response(JSON.stringify({ message: 'Category renamed' }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Delete category
  if (request.method === 'DELETE' && apiPath.startsWith('/categories/')) {
    const categoryName = decodeURIComponent(apiPath.split('/')[2]);
    const spaceId = url.searchParams.get('space_id');

    // Update todos that use this category to "General" in the specified space
    const todos = await getTodos(authData.userId, spaceId);
    for (const t of todos) {
      if (t.category === categoryName && t.space_id === spaceId) {
        const updated = { ...t, category: 'General' };
        await putTodo(updated, authData.userId);
        await addQueue({ type: 'UPDATE', data: updated }, authData.userId);
      }
    }

    await delCategory(categoryName, authData.userId, spaceId);
    await addQueue({ type: 'DELETE_CATEGORY', data: { name: categoryName, space_id: spaceId } }, authData.userId);

    // Ensure a General category exists after deletion
    const remainingCategories = await getCategories(authData.userId, spaceId);
    const hasGeneral = remainingCategories.some(c => c.name === 'General' && c.space_id === spaceId);
    if (!hasGeneral) {
      const generalCategory = { name: 'General', space_id: spaceId };
      await putCategory(generalCategory, authData.userId);
    }

    return new Response(null, { status: 204 });
  }

  // ========= SPACE OPERATIONS =========

  // Create new space
  if (request.method === 'POST' && apiPath === '/spaces') {
    const spaceData = {
      _id: 'offline_space_' + Date.now(),
      name: data.name || 'New Space',
      owner_id: authData.userId,
      member_ids: [authData.userId],
      pending_emails: [],
      created_offline: true,
    };

    await putSpace(spaceData, authData.userId);
    await addQueue({ type: 'CREATE_SPACE', data: spaceData }, authData.userId);
    return new Response(JSON.stringify(spaceData), { headers: { 'Content-Type': 'application/json' } });
  }

  // Update space
  if (request.method === 'PUT' && apiPath.startsWith('/spaces/')) {
    const spaceId = apiPath.split('/')[2];
    const spaces = await getSpaces(authData.userId);
    const currentSpace = spaces.find(s => s._id === spaceId);

    if (currentSpace) {
      const updatedSpace = { ...currentSpace, ...data, _id: spaceId };
      await putSpace(updatedSpace, authData.userId);
      await addQueue({ type: 'UPDATE_SPACE', id: spaceId, data: updatedSpace }, authData.userId);
      return new Response(JSON.stringify(updatedSpace), { headers: { 'Content-Type': 'application/json' } });
    }
  }

  // Delete space
  if (request.method === 'DELETE' && apiPath.startsWith('/spaces/')) {
    const spaceId = apiPath.split('/')[2];
    const spaces = await getSpaces(authData.userId);
    const spaceToDelete = spaces.find(s => s._id === spaceId);

    if (spaceToDelete) {
      await delSpace(spaceId, authData.userId);
      await addQueue({ type: 'DELETE_SPACE', id: spaceId, data: spaceToDelete }, authData.userId);
    }

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  // For other write operations, return service unavailable
  return new Response(JSON.stringify({ error: 'Write operation not available offline' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleStaticRequest(request) {
  try {
    // Try network first for static files
    const response = await fetch(request);

    // Cache successful GET requests
    if (response.ok && request.method === 'GET') {
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

  // Determine environment for sync requests
  const isCapacitor = self.location?.protocol === 'file:';
  const isProdHost = self.location?.hostname?.endsWith(CONFIG.PRODUCTION_DOMAIN);

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
            const todoSyncUrl = `${isCapacitor ? CONFIG.PRODUCTION_BACKEND : (isProdHost ? CONFIG.PRODUCTION_BACKEND : CONFIG.LOCAL_BACKEND)}/todos`;
            res = await fetch(todoSyncUrl, {
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
          const categorySyncUrl = `${isCapacitor ? CONFIG.PRODUCTION_BACKEND : (isProdHost ? CONFIG.PRODUCTION_BACKEND : CONFIG.LOCAL_BACKEND)}/categories`;
          res = await fetch(categorySyncUrl, {
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
            const createJournalUrl = `${isCapacitor ? CONFIG.PRODUCTION_BACKEND : (isProdHost ? CONFIG.PRODUCTION_BACKEND : CONFIG.LOCAL_BACKEND)}/journals`;
            res = await fetch(createJournalUrl, {
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
              // Store synced version without offline flags
              await putJournal({ ...serverJournal, updated_offline: false }, authData.userId);
              console.log(`✅ Synced offline journal ${offlineId} -> ${serverJournal._id}`);
            } else {
              console.log(`❌ Journal Sync FAILED: Offline journal ${offlineId} will be preserved`);
            }
          } else {
            // Handle both offline-generated and regular journal updates
            const createJournalUrl2 = `${isCapacitor ? CONFIG.PRODUCTION_BACKEND : (isProdHost ? CONFIG.PRODUCTION_BACKEND : CONFIG.LOCAL_BACKEND)}/journals`;
            res = await fetch(createJournalUrl2, {
              method: 'POST',
              headers,
              body: JSON.stringify(op.data),
            });
            if (res && res.ok) {
              const serverJournal = await res.json();
              await putJournal({ ...serverJournal, updated_offline: false }, authData.userId);
            }
          }
          break;
        case 'UPDATE_JOURNAL':
          // Update existing server journal with offline changes
          const { _id, created_offline, updated_offline, ...updatePayload } = op.data;
          console.log(`🔄 Processing UPDATE_JOURNAL for ${op.data.date}, ID: ${_id}`);
          console.log(`📝 UPDATE_JOURNAL payload:`, updatePayload);
          // Use the proper API routing for sync requests
          const updateJournalUrl = `${isCapacitor ? CONFIG.PRODUCTION_BACKEND : (isProdHost ? CONFIG.PRODUCTION_BACKEND : CONFIG.LOCAL_BACKEND)}/journals`;
          res = await fetch(updateJournalUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(updatePayload),
          });
          console.log(`📡 UPDATE_JOURNAL response status: ${res?.status}`);
          if (res && res.ok) {
            const serverJournal = await res.json();
            console.log(`✅ UPDATE_JOURNAL Sync SUCCESS: Updated server journal ${serverJournal._id} for date ${op.data.date}`);
            console.log(`📝 UPDATE_JOURNAL server response:`, serverJournal);
            console.log(`📝 UPDATE_JOURNAL original offline data:`, op.data);
            // Store synced version without offline flags but preserve any local changes
            await putJournal({ ...serverJournal, updated_offline: false }, authData.userId);
          } else {
            const errorText = res ? await res.text() : 'No response';
            console.log(`❌ UPDATE_JOURNAL Sync FAILED: Journal ${_id} offline changes preserved`);
            console.log(`❌ Error details: Status ${res?.status}, Response: ${errorText}`);
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
            const deleteJournalUrl = `${isCapacitor ? CONFIG.PRODUCTION_BACKEND : (isProdHost ? CONFIG.PRODUCTION_BACKEND : CONFIG.LOCAL_BACKEND)}/journals/${deleteJournalId}`;
            res = await fetch(deleteJournalUrl, {
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

    // Notify all clients that sync has completed
    if (self.clients && self.clients.matchAll) {
      const clientList = await self.clients.matchAll({ type: 'window' });
      for (const client of clientList) {
        client.postMessage({ type: 'SYNC_COMPLETE' });
      }
    }
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
    clearTodos,
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
    handleApiRequest,
    generateInsights,
  };
}
