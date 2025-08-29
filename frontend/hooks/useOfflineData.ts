import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { useOfflineStorage, Todo, Category, Space, Journal, QueueItem } from './useOfflineStorage';
import { apiRequest } from '../utils/apiWithOffline';
import { useAuth } from '../context/AuthContext';

interface OfflineDataState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  queuedCount: number;
  isInitialized: boolean;
}

interface OfflineDataActions {
  // Todo operations
  getTodos: (spaceId?: string) => Promise<Todo[]>;
  addTodo: (todo: Omit<Todo, '_id'>) => Promise<Todo>;
  updateTodo: (todo: Todo) => Promise<Todo>;
  deleteTodo: (id: string) => Promise<void>;

  // Category operations
  getCategories: (spaceId?: string) => Promise<Category[]>;
  addCategory: (category: Omit<Category, 'id'>) => Promise<Category>;

  // Space operations
  getSpaces: () => Promise<Space[]>;
  addSpace: (space: Omit<Space, '_id'>) => Promise<Space>;

  // Journal operations
  getJournals: (spaceId?: string) => Promise<Journal[]>;
  saveJournal: (journal: Omit<Journal, '_id'>) => Promise<Journal>;

  // Sync operations
  syncNow: () => Promise<void>;
  clearOfflineData: () => Promise<void>;
}

export const useOfflineData = (): OfflineDataState & OfflineDataActions => {
  const storage = useOfflineStorage();
  const { user, isAuthenticated } = useAuth();

  const [state, setState] = useState<OfflineDataState>({
    isOnline: navigator.onLine,
    isSyncing: false,
    lastSyncTime: null,
    queuedCount: 0,
    isInitialized: false
  });

  // Get user ID from AuthContext instead of storage
  console.log('👤 User object from AuthContext:', user);
  console.log('🔍 user?.user_id =', user?.user_id);
  console.log('🔍 typeof user?.user_id =', typeof user?.user_id);
  const currentUserId = user && user.user_id ? user.user_id : null;
  console.log('🆔 Extracted currentUserId:', currentUserId);
  console.log('🔍 useOfflineData state:', {
    isAuthenticated,
    currentUserId,
    isOnline: state.isOnline,
    isInitialized: state.isInitialized
  });
  console.log('🌐 navigator.onLine:', navigator.onLine);
  console.log('🌐 Capacitor.isNativePlatform():', Capacitor.isNativePlatform());

  // Initialize storage and mark as ready
  useEffect(() => {
    console.log('🔄 Initialization useEffect - isAuthenticated:', isAuthenticated, 'currentUserId:', currentUserId, 'user:', !!user);

    // Don't initialize if user is still loading or not available
    if (!user || !isAuthenticated || !currentUserId) {
      console.log('⏳ Waiting for user to be fully loaded: user =', !!user, 'isAuthenticated =', isAuthenticated, 'currentUserId =', currentUserId);
      return;
    }

    const initializeStorage = async () => {
      try {
        console.log('🔑 Initializing offline storage...');

        // Properly initialize storage with error handling
        try {
          await Promise.race([
            storage.init(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Storage init timeout')), 5000))
          ]);
          console.log('✅ Storage initialization completed');
        } catch (error) {
          console.warn('⚠️ Storage init failed, continuing without caching:', error);
          // Continue anyway - we'll just skip caching operations
        }

        // Mark as initialized once we have user ID
        console.log('🎯 Setting isInitialized to true...');
        setState(prev => ({ ...prev, isInitialized: true }));
        console.log('✅ Offline data hook initialized with userId:', currentUserId);
      } catch (error) {
        console.error('❌ Error initializing storage:', error);
      }
    };

    console.log('📋 All conditions met, calling initializeStorage...');
    initializeStorage();
  }, [storage, isAuthenticated, currentUserId]);

  // Network status monitoring
  useEffect(() => {
    const updateNetworkStatus = async () => {
      let online = navigator.onLine;

      // Use Capacitor Network plugin if available for more accurate status
      if (Capacitor.isNativePlatform()) {
        try {
          const status = await Network.getStatus();
          online = status.connected;
        } catch (error) {
          console.error('Failed to get network status:', error);
        }
      }

      setState(prev => ({ ...prev, isOnline: online }));
      console.log('📡 Network status updated:', online ? 'ONLINE' : 'OFFLINE');

      // Auto-sync when coming back online to prevent data loss
      if (online && !state.isSyncing && currentUserId) {
        console.log('🔄 Coming back online - triggering immediate sync to prevent data loss');
        // Use setTimeout to ensure this runs after any immediate fetch attempts
        setTimeout(() => {
          if (!state.isSyncing) {
            syncNow();
          }
        }, 100);
      }
    };

    // Initial check
    updateNetworkStatus();

    // Listen for network changes
    const handleOnline = () => updateNetworkStatus();
    const handleOffline = () => updateNetworkStatus();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Capacitor network listener
    let networkListener: any;
    if (Capacitor.isNativePlatform()) {
      Network.addListener('networkStatusChange', (status) => {
        setState(prev => ({ ...prev, isOnline: status.connected }));
        // Auto-sync commented out to prevent loops
        // if (status.connected && !state.isSyncing && currentUserId) {
        //   syncNow();
        // }
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (networkListener) {
        networkListener.remove();
      }
    };
  }, []);  // Empty dependency array - this effect should only run once

  // Update queued count
  const updateQueuedCount = useCallback(async () => {
    if (!currentUserId) return;
    const queue = await storage.getQueue(currentUserId);
    setState(prev => ({ ...prev, queuedCount: queue.length }));
  }, [currentUserId, storage]);

  // Generate offline ID
  const generateOfflineId = () => `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Queue operation for sync
  const queueOperation = async (method: string, url: string, data?: any) => {
    if (!currentUserId) return;

    await storage.addToQueue({
      method,
      url,
      data,
      timestamp: Date.now()
    }, currentUserId);

    await updateQueuedCount();
  };

  // Todo operations
  const getTodos = useCallback(async (spaceId?: string): Promise<Todo[]> => {
    if (!currentUserId) {
      console.log('❌ getTodos: No current user ID');
      return [];
    }

    console.log('🔍 getTodos called - Online:', state.isOnline, 'UserId:', currentUserId, 'SpaceId:', spaceId);

    if (state.isOnline) {
      try {
        const url = spaceId ? `/todos?space_id=${spaceId}` : '/todos';
        console.log('🌐 Fetching todos from API:', url);
        const response = await apiRequest(url);

        if (!response.ok) {
          console.error('❌ API request failed:', response.status, response.statusText);
          throw new Error(`API request failed: ${response.status}`);
        }

        const todos = await response.json();
        console.log('✅ API returned todos:', todos.length, 'items');
        console.log('📤 About to return todos data to component:', todos);

        // TEMPORARILY DISABLE CACHING - it's causing Promise to hang
        // TODO: Fix storage initialization properly
        // for (const todo of todos) {
        //   await storage.putTodo(todo, currentUserId);
        // }

        console.log('🚀 Returning todos from getTodos:', todos.length, 'items');
        return todos;
      } catch (error) {
        console.error('❌ Failed to fetch todos online, trying cached data:', error);
      }
    }

    // Fallback to cached data
    console.log('💾 Using cached todos...');
    const cachedTodos = await storage.getTodos(currentUserId, spaceId);
    console.log('💾 Cached todos:', cachedTodos.length, 'items');
    return cachedTodos;
  }, [currentUserId, state.isOnline, storage]);

  const addTodo = useCallback(async (todoData: Omit<Todo, '_id'>): Promise<Todo> => {
    if (!currentUserId) throw new Error('No user authenticated');

    const todo: Todo = {
      ...todoData,
      _id: generateOfflineId()
    };

    // Save locally immediately
    await storage.putTodo(todo, currentUserId);

    if (state.isOnline) {
      try {
        const response = await apiRequest('/todos', {
          method: 'POST',
          body: JSON.stringify(todoData)
        });

        const serverTodo = await response.json();
        // Replace offline version with server version
        await storage.putTodo(serverTodo, currentUserId);
        return serverTodo;
      } catch (error) {
        console.error('Failed to save todo online, queued for sync:', error);
        await queueOperation('POST', '/todos', todoData);
      }
    } else {
      // Queue for sync when online
      await queueOperation('POST', '/todos', todoData);
    }

    return todo;
  }, [currentUserId, state.isOnline, storage]);

  const updateTodo = useCallback(async (todo: Todo): Promise<Todo> => {
    if (!currentUserId) throw new Error('No user authenticated');

    // Save locally immediately
    await storage.putTodo(todo, currentUserId);

    if (state.isOnline && !todo._id.startsWith('offline_')) {
      try {
        const response = await apiRequest(`/todos/${todo._id}`, {
          method: 'PUT',
          body: JSON.stringify(todo)
        });

        return response.json();
      } catch (error) {
        console.error('Failed to update todo online, queued for sync:', error);
        await queueOperation('PUT', `/todos/${todo._id}`, todo);
      }
    } else {
      // Queue for sync when online
      await queueOperation('PUT', `/todos/${todo._id}`, todo);
    }

    return todo;
  }, [currentUserId, state.isOnline, storage]);

  const deleteTodo = useCallback(async (id: string): Promise<void> => {
    if (!currentUserId) throw new Error('No user authenticated');

    // Remove locally immediately
    await storage.deleteTodo(id, currentUserId);

    if (state.isOnline && !id.startsWith('offline_')) {
      try {
        await apiRequest(`/todos/${id}`, {
          method: 'DELETE'
        });
      } catch (error) {
        console.error('Failed to delete todo online, queued for sync:', error);
        await queueOperation('DELETE', `/todos/${id}`);
      }
    } else if (!id.startsWith('offline_')) {
      // Queue for sync when online (don't sync offline-only items)
      await queueOperation('DELETE', `/todos/${id}`);
    }
  }, [currentUserId, state.isOnline, storage]);

  // Category operations
  const getCategories = useCallback(async (spaceId?: string): Promise<Category[]> => {
    if (!currentUserId) return [];

    if (state.isOnline) {
      try {
        const url = spaceId ? `/categories?space_id=${spaceId}` : '/categories';
        const response = await apiRequest(url);
        const categoriesRaw = await response.json();

        console.log('📂 Raw categories from API:', categoriesRaw);

        // Transform string array to Category objects
        const categories = categoriesRaw.map((name: string) => ({
          name,
          space_id: spaceId
        }));

        // TEMPORARILY DISABLE CACHING - it's causing Promise to hang
        // TODO: Fix storage initialization properly
        // for (const category of categories) {
        //   await storage.putCategory(category, currentUserId);
        // }

        console.log('🚀 Returning categories from getCategories:', categories.length, 'items');
        return categories;
      } catch (error) {
        console.error('Failed to fetch categories online, using cached data:', error);
      }
    }

    // Fallback to cached data
    return storage.getCategories(currentUserId, spaceId);
  }, [currentUserId, state.isOnline, storage]);

  const addCategory = useCallback(async (categoryData: Omit<Category, 'id'>): Promise<Category> => {
    if (!currentUserId) throw new Error('No user authenticated');

    const category: Category = {
      ...categoryData,
      id: Math.floor(Math.random() * 1000000) // Temporary ID
    };

    // Save locally immediately
    await storage.putCategory(category, currentUserId);

    if (state.isOnline) {
      try {
        const response = await apiRequest('/categories', {
          method: 'POST',
          body: JSON.stringify(categoryData)
        });

        const serverCategory = await response.json();
        await storage.putCategory(serverCategory, currentUserId);
        return serverCategory;
      } catch (error) {
        console.error('Failed to save category online, queued for sync:', error);
        await queueOperation('POST', '/categories', categoryData);
      }
    } else {
      await queueOperation('POST', '/categories', categoryData);
    }

    return category;
  }, [currentUserId, state.isOnline, storage]);

  // Space operations
  const getSpaces = useCallback(async (): Promise<Space[]> => {
    console.log('🔍 getSpaces called - currentUserId:', currentUserId, 'isOnline:', state.isOnline);
    console.trace('📍 Call stack for getSpaces:');

    if (!currentUserId) {
      console.log('❌ getSpaces: No currentUserId');
      return [];
    }

    if (state.isOnline) {
      try {
        console.log('🌐 Making API call to /spaces');
        const response = await apiRequest('/spaces');
        console.log('📡 API response status:', response.status);

        if (!response.ok) {
          console.error('❌ API request failed:', response.status, response.statusText);
          throw new Error(`API request failed: ${response.status}`);
        }

        const spaces = await response.json();
        console.log('✅ API returned spaces:', spaces.length, 'items');
        console.log('📤 About to return spaces data to component:', spaces);

        // TEMPORARILY DISABLE CACHING - it's causing Promise to hang
        // TODO: Fix storage initialization properly
        // try {
        //   console.log('💾 Starting to cache spaces...');
        //   for (const space of spaces) {
        //     await storage.putSpace(space, currentUserId);
        //   }
        //   console.log('💾 Spaces cached successfully');
        // } catch (error) {
        //   console.warn('⚠️ Failed to cache spaces:', error);
        // }

        console.log('🚀 Returning spaces from getSpaces:', spaces.length, 'items');
        return spaces;
      } catch (error) {
        console.error('❌ Failed to fetch spaces online, using cached data:', error);
      }
    }

    // Fallback to cached data
    console.log('💾 Using cached spaces...');
    const cachedSpaces = await storage.getSpaces(currentUserId);
    console.log('💾 Cached spaces:', cachedSpaces.length, 'items');
    return cachedSpaces;
  }, [currentUserId, state.isOnline, storage]);

  const addSpace = useCallback(async (spaceData: Omit<Space, '_id'>): Promise<Space> => {
    if (!currentUserId) throw new Error('No user authenticated');

    const space: Space = {
      ...spaceData,
      _id: generateOfflineId()
    };

    // Save locally immediately
    await storage.putSpace(space, currentUserId);

    if (state.isOnline) {
      try {
        const response = await apiRequest('/spaces', {
          method: 'POST',
          body: JSON.stringify(spaceData)
        });

        const serverSpace = await response.json();
        await storage.putSpace(serverSpace, currentUserId);
        return serverSpace;
      } catch (error) {
        console.error('Failed to save space online, queued for sync:', error);
        await queueOperation('POST', '/spaces', spaceData);
      }
    } else {
      await queueOperation('POST', '/spaces', spaceData);
    }

    return space;
  }, [currentUserId, state.isOnline, storage]);

  // Journal operations - Conservative approach to prevent data loss
  const getJournals = useCallback(async (spaceId?: string): Promise<Journal[]> => {
    if (!currentUserId) return [];

    console.log('📝 getJournals called - isOnline:', state.isOnline, 'spaceId:', spaceId);

    // Always start with cached data to prevent data loss
    const cachedJournals = await storage.getJournals(currentUserId, spaceId);
    console.log('📝 Found', cachedJournals.length, 'cached journals');

    if (state.isOnline) {
      try {
        // Check if there are pending journal operations in the queue
        const queue = await storage.getQueue(currentUserId);
        const hasPendingJournals = queue.some(item => item.url.includes('/journals'));

        if (hasPendingJournals) {
          console.log('📝 Found pending journal operations, using cached data to prevent overwrite');
          return cachedJournals;
        }

        // Only fetch from server if no pending changes AND we've been online for a bit
        // This prevents immediate overwrites when coming back online
        console.log('📝 No pending changes, fetching fresh data from server');
        const url = spaceId ? `/journals?space_id=${spaceId}` : '/journals';
        const response = await apiRequest(url);
        const serverJournals = await response.json();

        console.log('📝 Server returned', serverJournals.length, 'journals, updating cache');

        // Update cache with server data
        for (const journal of serverJournals) {
          await storage.putJournal(journal, currentUserId);
        }

        return serverJournals;
      } catch (error) {
        console.error('❌ Failed to fetch journals online, using cached data:', error);
        return cachedJournals;
      }
    }

    // Offline - use cached data
    console.log('📝 Offline - using cached data');
    return cachedJournals;
  }, [currentUserId, state.isOnline, storage]);

  const saveJournal = useCallback(async (journalData: Omit<Journal, '_id'>): Promise<Journal> => {
    if (!currentUserId) throw new Error('No user authenticated');

    const journal: Journal = {
      ...journalData,
      _id: generateOfflineId()
    };

    console.log('📝 saveJournal called:', {
      isOnline: state.isOnline,
      journalData,
      offlineId: journal._id
    });

    // Save locally immediately
    await storage.putJournal(journal, currentUserId);
    console.log('📝 Journal saved to local storage');

    if (state.isOnline) {
      try {
        console.log('📝 Attempting to save journal online...');
        const response = await apiRequest('/journals', {
          method: 'POST',
          body: JSON.stringify(journalData)
        });

        const serverJournal = await response.json();
        console.log('📝 Journal saved online, updating local storage with server version');
        await storage.putJournal(serverJournal, currentUserId);
        return serverJournal;
      } catch (error) {
        console.error('❌ Failed to save journal online, queuing for sync:', error);
        await queueOperation('POST', '/journals', journalData);
        console.log('📝 Journal queued for sync');
      }
    } else {
      console.log('📱 Offline - queuing journal for sync');
      await queueOperation('POST', '/journals', journalData);
    }

    return journal;
  }, [currentUserId, state.isOnline, storage]);

  // Sync operations
  const syncNow = useCallback(async (): Promise<void> => {
    if (!currentUserId || !state.isOnline || state.isSyncing) return;

    setState(prev => ({ ...prev, isSyncing: true }));

    try {
      const queue = await storage.getQueue(currentUserId);

      for (const item of queue) {
        try {
          const options: RequestInit = {
            method: item.method,
            ...(item.data && { body: JSON.stringify(item.data) })
          };

          const response = await apiRequest(item.url, options);

          if (response.ok) {
            // If it was a POST operation, get the server response and update local data
            if (item.method === 'POST' && item.data) {
              const serverData = await response.json();

              if (item.url.includes('/todos')) {
                await storage.putTodo(serverData, currentUserId);
              } else if (item.url.includes('/categories')) {
                await storage.putCategory(serverData, currentUserId);
              } else if (item.url.includes('/spaces')) {
                await storage.putSpace(serverData, currentUserId);
              } else if (item.url.includes('/journals')) {
                console.log('📝 Syncing journal item, server response:', serverData);
                await storage.putJournal(serverData, currentUserId);
                console.log('📝 Journal updated in local storage with server data');
              }
            }
          }
        } catch (error) {
          console.error('Failed to sync item:', item, error);
          // Keep failed items in queue for next sync attempt
          continue;
        }
      }

      // Clear successfully synced items
      await storage.clearQueue(currentUserId);

      setState(prev => ({
        ...prev,
        lastSyncTime: new Date(),
        queuedCount: 0
      }));

    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setState(prev => ({ ...prev, isSyncing: false }));
    }
  }, [currentUserId, state.isOnline, state.isSyncing, storage]);

  const clearOfflineData = useCallback(async (): Promise<void> => {
    if (!currentUserId) return;

    // Clear all offline data
    await storage.clearQueue(currentUserId);
    setState(prev => ({ ...prev, queuedCount: 0 }));
  }, [currentUserId, storage]);

  return {
    ...state,
    getTodos,
    addTodo,
    updateTodo,
    deleteTodo,
    getCategories,
    addCategory,
    getSpaces,
    addSpace,
    getJournals,
    saveJournal,
    syncNow,
    clearOfflineData
  };
};
