import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// Types for our data structures
export interface Todo {
  _id: string;
  text: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  dateAdded: string;
  completed: boolean;
  space_id?: string;
}

export interface Category {
  id?: number;
  name: string;
  space_id?: string;
}

export interface Space {
  _id: string;
  name: string;
  owner_id: string;
  member_ids: string[];
  pending_emails?: string[];
}

export interface Journal {
  _id: string;
  date: string;
  content: string;
  space_id?: string;
}

export interface QueueItem {
  id?: number;
  method: string;
  url: string;
  data?: any;
  timestamp: number;
}

export interface AuthData {
  token: string;
  userId: string;
}

// Configuration
const DB_CONFIG = {
  GLOBAL_DB_NAME: 'TodoGlobalDB',
  USER_DB_PREFIX: 'TodoUserDB_',
  DB_VERSION: 11,
  STORES: {
    TODOS: 'todos',
    CATEGORIES: 'categories',
    SPACES: 'spaces',
    QUEUE: 'queue',
    AUTH: 'auth',
    JOURNALS: 'journals'
  }
};

class OfflineStorageService {
  private isCapacitor = Capacitor.isNativePlatform();
  private globalDB: IDBDatabase | null = null;
  private userDBs = new Map<string, IDBDatabase>();

  // Initialize databases - simplified approach like service worker
  async init(): Promise<void> {
    console.log('🗄️ OfflineStorageService.init() called - isCapacitor:', this.isCapacitor);
    if (!this.isCapacitor) {
      console.log('🗄️ Initializing IndexedDB...');
      this.globalDB = await this.openGlobalDB();
      console.log('🗄️ IndexedDB initialized');
    } else {
      console.log('🗄️ Capacitor mode - no IndexedDB init needed');
    }
  }

  private openGlobalDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      console.log('🗄️ Opening IndexedDB with name:', DB_CONFIG.GLOBAL_DB_NAME, 'version:', DB_CONFIG.DB_VERSION);
      const request = indexedDB.open(DB_CONFIG.GLOBAL_DB_NAME, DB_CONFIG.DB_VERSION);

      request.onerror = () => {
        console.error('❌ IndexedDB open failed:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        console.log('✅ IndexedDB opened successfully');
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        console.log('🔄 IndexedDB upgrade needed');
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.AUTH)) {
          console.log('🏪 Creating AUTH object store');
          db.createObjectStore(DB_CONFIG.STORES.AUTH, { keyPath: 'key' });
        }
        console.log('✅ IndexedDB upgrade completed');
      };
    });
  }

  private async openUserDB(userId: string): Promise<IDBDatabase> {
    const dbName = `${DB_CONFIG.USER_DB_PREFIX}${userId || 'guest'}`;

    if (this.userDBs.has(dbName)) {
      return this.userDBs.get(dbName)!;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, DB_CONFIG.DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        this.userDBs.set(dbName, db);
        resolve(db);
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.TODOS)) {
          db.createObjectStore(DB_CONFIG.STORES.TODOS, { keyPath: '_id' });
        }
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.CATEGORIES)) {
          db.createObjectStore(DB_CONFIG.STORES.CATEGORIES, { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.SPACES)) {
          db.createObjectStore(DB_CONFIG.STORES.SPACES, { keyPath: '_id' });
        }
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.QUEUE)) {
          db.createObjectStore(DB_CONFIG.STORES.QUEUE, { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(DB_CONFIG.STORES.JOURNALS)) {
          db.createObjectStore(DB_CONFIG.STORES.JOURNALS, { keyPath: '_id' });
        }
      };
    });
  }

  // Storage abstraction methods
  private async capacitorGet<T>(key: string): Promise<T | null> {
    try {
      const result = await Preferences.get({ key });
      return result.value ? JSON.parse(result.value) : null;
    } catch (error) {
      console.error('Capacitor preferences get error:', error);
      return null;
    }
  }

  private async capacitorSet(key: string, value: any): Promise<void> {
    try {
      await Preferences.set({ key, value: JSON.stringify(value) });
    } catch (error) {
      console.error('Capacitor preferences set error:', error);
    }
  }

  private async capacitorRemove(key: string): Promise<void> {
    try {
      await Preferences.remove({ key });
    } catch (error) {
      console.error('Capacitor preferences remove error:', error);
    }
  }

  private async indexedDBTx<T>(
    db: IDBDatabase,
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([storeName], mode);
      const store = tx.objectStore(storeName);
      const request = operation(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Auth operations - simplified like service worker
  async getAuth(): Promise<AuthData | null> {
    if (this.isCapacitor) {
      return this.capacitorGet<AuthData>('auth_token');
    } else {
      if (!this.globalDB) await this.init();
      return this.indexedDBTx(this.globalDB!, DB_CONFIG.STORES.AUTH, 'readonly',
        store => store.get('token')
      );
    }
  }

  async putAuth(token: string, userId: string): Promise<void> {
    const authData: AuthData = { token, userId };
    if (this.isCapacitor) {
      await this.capacitorSet('auth_token', authData);
    } else {
      if (!this.globalDB) await this.init();
      await this.indexedDBTx(this.globalDB!, DB_CONFIG.STORES.AUTH, 'readwrite',
        store => store.put({ key: 'token', token, userId })
      );
    }
  }

  async clearAuth(): Promise<void> {
    if (this.isCapacitor) {
      await this.capacitorRemove('auth_token');
    } else {
      if (!this.globalDB) await this.init();
      await this.indexedDBTx(this.globalDB!, DB_CONFIG.STORES.AUTH, 'readwrite',
        store => store.delete('token')
      );
    }
  }

  // User-specific data operations
  private async getUserStorageKey(userId: string, type: string, spaceId?: string): Promise<string> {
    const baseKey = `user_${userId}_${type}`;
    return spaceId ? `${baseKey}_space_${spaceId}` : baseKey;
  }

  // Todos operations
  async getTodos(userId: string, spaceId?: string): Promise<Todo[]> {
    if (this.isCapacitor) {
      const key = await this.getUserStorageKey(userId, 'todos', spaceId);
      return (await this.capacitorGet<Todo[]>(key)) || [];
    } else {
      const db = await this.openUserDB(userId);
      const allTodos = await this.indexedDBTx(db, DB_CONFIG.STORES.TODOS, 'readonly',
        store => store.getAll()
      );

      if (spaceId) {
        return allTodos.filter(t => t.space_id === spaceId);
      }
      return allTodos;
    }
  }

  async putTodo(todo: Todo, userId: string): Promise<void> {
    if (this.isCapacitor) {
      // For Capacitor, we need to update the array
      const allTodos = await this.getTodos(userId);
      const index = allTodos.findIndex(t => t._id === todo._id);

      if (index >= 0) {
        allTodos[index] = todo;
      } else {
        allTodos.push(todo);
      }

      // Store by space if space_id exists
      if (todo.space_id) {
        const spaceTodos = allTodos.filter(t => t.space_id === todo.space_id);
        const spaceKey = await this.getUserStorageKey(userId, 'todos', todo.space_id);
        await this.capacitorSet(spaceKey, spaceTodos);
      }

      // Also store all todos
      const key = await this.getUserStorageKey(userId, 'todos');
      await this.capacitorSet(key, allTodos);
    } else {
      const db = await this.openUserDB(userId);
      await this.indexedDBTx(db, DB_CONFIG.STORES.TODOS, 'readwrite',
        store => store.put(todo)
      );
    }
  }

  async deleteTodo(id: string, userId: string): Promise<void> {
    if (this.isCapacitor) {
      const allTodos = await this.getTodos(userId);
      const updatedTodos = allTodos.filter(t => t._id !== id);

      const key = await this.getUserStorageKey(userId, 'todos');
      await this.capacitorSet(key, updatedTodos);
    } else {
      const db = await this.openUserDB(userId);
      await this.indexedDBTx(db, DB_CONFIG.STORES.TODOS, 'readwrite',
        store => store.delete(id)
      );
    }
  }

  // Categories operations
  async getCategories(userId: string, spaceId?: string): Promise<Category[]> {
    if (this.isCapacitor) {
      const key = await this.getUserStorageKey(userId, 'categories', spaceId);
      return (await this.capacitorGet<Category[]>(key)) || [];
    } else {
      const db = await this.openUserDB(userId);
      const allCategories = await this.indexedDBTx(db, DB_CONFIG.STORES.CATEGORIES, 'readonly',
        store => store.getAll()
      );

      if (spaceId) {
        return allCategories.filter(c => c.space_id === spaceId);
      }
      return allCategories;
    }
  }

  async putCategory(category: Category, userId: string): Promise<void> {
    if (this.isCapacitor) {
      const allCategories = await this.getCategories(userId);
      const index = allCategories.findIndex(c => c.id === category.id);

      if (index >= 0) {
        allCategories[index] = category;
      } else {
        // Generate ID if not provided
        if (!category.id) {
          category.id = Math.max(0, ...allCategories.map(c => c.id || 0)) + 1;
        }
        allCategories.push(category);
      }

      const key = await this.getUserStorageKey(userId, 'categories');
      await this.capacitorSet(key, allCategories);
    } else {
      const db = await this.openUserDB(userId);
      await this.indexedDBTx(db, DB_CONFIG.STORES.CATEGORIES, 'readwrite',
        store => store.put(category)
      );
    }
  }

  // Spaces operations
  async getSpaces(userId: string): Promise<Space[]> {
    if (this.isCapacitor) {
      const key = await this.getUserStorageKey(userId, 'spaces');
      return (await this.capacitorGet<Space[]>(key)) || [];
    } else {
      const db = await this.openUserDB(userId);
      return this.indexedDBTx(db, DB_CONFIG.STORES.SPACES, 'readonly',
        store => store.getAll()
      );
    }
  }

  async putSpace(space: Space, userId: string): Promise<void> {
    if (this.isCapacitor) {
      const allSpaces = await this.getSpaces(userId);
      const index = allSpaces.findIndex(s => s._id === space._id);

      if (index >= 0) {
        allSpaces[index] = space;
      } else {
        allSpaces.push(space);
      }

      const key = await this.getUserStorageKey(userId, 'spaces');
      await this.capacitorSet(key, allSpaces);
    } else {
      const db = await this.openUserDB(userId);
      await this.indexedDBTx(db, DB_CONFIG.STORES.SPACES, 'readwrite',
        store => store.put(space)
      );
    }
  }

  // Journals operations
  async getJournals(userId: string, spaceId?: string): Promise<Journal[]> {
    if (this.isCapacitor) {
      const key = await this.getUserStorageKey(userId, 'journals', spaceId);
      return (await this.capacitorGet<Journal[]>(key)) || [];
    } else {
      const db = await this.openUserDB(userId);
      const allJournals = await this.indexedDBTx(db, DB_CONFIG.STORES.JOURNALS, 'readonly',
        store => store.getAll()
      );

      if (spaceId) {
        return allJournals.filter(j => j.space_id === spaceId);
      }
      return allJournals;
    }
  }

  async putJournal(journal: Journal, userId: string): Promise<void> {
    if (this.isCapacitor) {
      const allJournals = await this.getJournals(userId);
      const index = allJournals.findIndex(j => j._id === journal._id);

      if (index >= 0) {
        allJournals[index] = journal;
      } else {
        allJournals.push(journal);
      }

      const key = await this.getUserStorageKey(userId, 'journals');
      await this.capacitorSet(key, allJournals);
    } else {
      const db = await this.openUserDB(userId);
      await this.indexedDBTx(db, DB_CONFIG.STORES.JOURNALS, 'readwrite',
        store => store.put(journal)
      );
    }
  }

  // Queue operations for sync
  async getQueue(userId: string): Promise<QueueItem[]> {
    if (this.isCapacitor) {
      const key = await this.getUserStorageKey(userId, 'queue');
      return (await this.capacitorGet<QueueItem[]>(key)) || [];
    } else {
      const db = await this.openUserDB(userId);
      return this.indexedDBTx(db, DB_CONFIG.STORES.QUEUE, 'readonly',
        store => store.getAll()
      );
    }
  }

  async addToQueue(item: Omit<QueueItem, 'id'>, userId: string): Promise<void> {
    if (this.isCapacitor) {
      const queue = await this.getQueue(userId);
      const newItem: QueueItem = {
        ...item,
        id: Math.max(0, ...queue.map(q => q.id || 0)) + 1
      };
      queue.push(newItem);

      const key = await this.getUserStorageKey(userId, 'queue');
      await this.capacitorSet(key, queue);
    } else {
      const db = await this.openUserDB(userId);
      await this.indexedDBTx(db, DB_CONFIG.STORES.QUEUE, 'readwrite',
        store => store.add(item)
      );
    }
  }

  async clearQueue(userId: string): Promise<void> {
    if (this.isCapacitor) {
      const key = await this.getUserStorageKey(userId, 'queue');
      await this.capacitorSet(key, []);
    } else {
      const db = await this.openUserDB(userId);
      await this.indexedDBTx(db, DB_CONFIG.STORES.QUEUE, 'readwrite',
        store => store.clear()
      );
    }
  }
}

// Singleton instance
const storageService = new OfflineStorageService();

export const useOfflineStorage = () => {
  return storageService;
};
