const API_CACHE_NAME = 'ai-todo-api-v3';

// IndexedDB setup for offline data
const DB_NAME = 'TodoOfflineDB';
const DB_VERSION = 1;
const TODOS_STORE = 'todos';
const SYNC_STORE = 'syncQueue';

// Initialize IndexedDB
const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create todos store
      if (!db.objectStoreNames.contains(TODOS_STORE)) {
        const todosStore = db.createObjectStore(TODOS_STORE, { keyPath: '_id' });
        todosStore.createIndex('dateAdded', 'dateAdded', { unique: false });
      }
      
      // Create sync queue store
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        const syncStore = db.createObjectStore(SYNC_STORE, { keyPath: 'id', autoIncrement: true });
        syncStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
};

// Helper functions for IndexedDB operations
const withDB = async (callback) => {
  const db = await initDB();
  return callback(db);
};

const getTodos = () => {
  return withDB(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TODOS_STORE], 'readonly');
      const store = transaction.objectStore(TODOS_STORE);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
};

const saveTodo = (todo) => {
  return withDB(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TODOS_STORE], 'readwrite');
      const store = transaction.objectStore(TODOS_STORE);
      const request = store.put(todo);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
};

const deleteTodo = (id) => {
  return withDB(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TODOS_STORE], 'readwrite');
      const store = transaction.objectStore(TODOS_STORE);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
};

const addToSyncQueue = (action) => {
  return withDB(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SYNC_STORE], 'readwrite');
      const store = transaction.objectStore(SYNC_STORE);
      const request = store.add({
        ...action,
        timestamp: Date.now()
      });
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
};

const getSyncQueue = () => {
  return withDB(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SYNC_STORE], 'readonly');
      const store = transaction.objectStore(SYNC_STORE);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
};

const clearSyncQueue = () => {
  return withDB(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SYNC_STORE], 'readwrite');
      const store = transaction.objectStore(SYNC_STORE);
      const request = store.clear();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
};

// Install event - initialize database
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(API_CACHE_NAME),
      initDB()
    ])
  );
});

// Fetch event - handle offline API requests only
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip all Next.js internal requests and same-origin requests that aren't API calls
  if (event.request.url.includes('/_next/') || 
      event.request.url.includes('/__nextjs') ||
      event.request.url.includes('/favicon')) {
    return;
  }
  
  // Only handle backend API requests (different origin or specific API endpoints)
  const isBackendAPI = url.hostname !== location.hostname || 
                       (url.hostname === location.hostname && url.port === '8000');
  
  if (isBackendAPI && (
    url.pathname.startsWith('/todos') || 
    url.pathname.startsWith('/classify') || 
    url.pathname.startsWith('/categories')
  )) {
    event.respondWith(handleAPIRequest(event.request));
  }
});

// Handle API requests with offline support
const handleAPIRequest = async (request) => {
  const url = new URL(request.url);
  const isOnline = navigator.onLine;

  try {
    if (isOnline) {
      const response = await fetch(request);
      
      // Cache successful GET responses
      if (request.method === 'GET' && response.ok) {
        const cache = await caches.open(API_CACHE_NAME);
        cache.put(request, response.clone());
      }
      
      // If this is a successful sync, sync any queued operations
      if (response.ok && request.method !== 'GET') {
        syncQueuedOperations();
      }
      
      return response;
    } else {
      throw new Error('Offline');
    }
  } catch (error) {
    // Handle offline requests
    if (request.method === 'GET') {
      if (url.pathname === '/todos') {
        const todos = await getTodos();
        return new Response(JSON.stringify(todos), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      if (url.pathname === '/categories') {
        // Return default categories when offline
        const defaultCategories = [
          { name: 'Work' },
          { name: 'Personal' },
          { name: 'Shopping' },
          { name: 'Health' },
          { name: 'General' }
        ];
        return new Response(JSON.stringify(defaultCategories), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
    } else {
      // Handle offline POST/PUT/DELETE requests
      const body = await request.text();
      let data;
      
      try {
        data = JSON.parse(body);
      } catch (e) {
        data = {};
      }
      
      if (url.pathname === '/classify') {
        // Return default classification when offline
        return new Response(JSON.stringify({
          category: 'General',
          priority: 'medium'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      if (url.pathname === '/todos') {
        if (request.method === 'POST') {
          // Create new todo offline
          const newTodo = {
            _id: 'offline_' + Date.now(),
            text: data.text,
            category: data.category || 'General',
            priority: data.priority || 'medium',
            dateAdded: new Date().toISOString(),
            completed: false
          };
          
          await saveTodo(newTodo);
          await addToSyncQueue({
            type: 'CREATE',
            data: newTodo
          });
          
          return new Response(JSON.stringify(newTodo), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        if (request.method === 'PUT') {
          // Update todo offline
          const todoId = url.pathname.split('/').pop();
          const updatedTodo = { ...data, _id: todoId };
          
          await saveTodo(updatedTodo);
          await addToSyncQueue({
            type: 'UPDATE',
            data: updatedTodo
          });
          
          return new Response(JSON.stringify(updatedTodo), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        if (request.method === 'DELETE') {
          // Delete todo offline
          const todoId = url.pathname.split('/').pop();
          
          await deleteTodo(todoId);
          await addToSyncQueue({
            type: 'DELETE',
            data: { _id: todoId }
          });
          
          return new Response('', { status: 204 });
        }
      }
    }
    
    throw error;
  }
};

// Sync queued operations when back online
const syncQueuedOperations = async () => {
  try {
    const queue = await getSyncQueue();
    
    for (const operation of queue) {
      try {
        let response;
        
        switch (operation.type) {
          case 'CREATE':
            // Check if this was an offline todo that needs a real ID
            if (operation.data._id.startsWith('offline_')) {
              const { _id, ...todoData } = operation.data;
              response = await fetch('/todos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(todoData)
              });
              
              if (response.ok) {
                const newTodo = await response.json();
                // Replace offline todo with server todo
                await deleteTodo(_id);
                await saveTodo(newTodo);
              }
            }
            break;
            
          case 'UPDATE':
            if (!operation.data._id.startsWith('offline_')) {
              response = await fetch(`/todos/${operation.data._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(operation.data)
              });
            }
            break;
            
          case 'DELETE':
            if (!operation.data._id.startsWith('offline_')) {
              response = await fetch(`/todos/${operation.data._id}`, {
                method: 'DELETE'
              });
            }
            break;
        }
      } catch (error) {
        console.log('Sync operation failed:', error);
        // Keep the operation in queue for next sync attempt
        continue;
      }
    }
    
    // Clear the sync queue after successful sync
    await clearSyncQueue();
    
    // Refresh todos from server
    const response = await fetch('/todos');
    if (response.ok) {
      const serverTodos = await response.json();
      // Update local cache with server data
      for (const todo of serverTodos) {
        await saveTodo(todo);
      }
    }
    
  } catch (error) {
    console.log('Sync failed:', error);
  }
};

// Listen for online events to trigger sync
self.addEventListener('message', (event) => {
  if (event.data.type === 'SYNC_WHEN_ONLINE') {
    syncQueuedOperations();
  }
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== API_CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});