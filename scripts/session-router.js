#!/usr/bin/env node

/**
 * Session Router — Registry mapping todolist session_id → subagent session.
 *
 * Maintains an in-memory map for routing webhook events to the correct
 * subagent. Handles registration, lookup, status updates, and periodic
 * cleanup of stale/completed sessions.
 * 
 * Now with MongoDB persistence for reliability across restarts.
 */

const { MongoClient } = require('mongodb');

const CLEANUP_INTERVAL_MS = 60 * 1000; // Check every minute
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min inactivity timeout

// MongoDB configuration
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DB_NAME || 'todo_db';
const SESSIONS_COLLECTION = 'agent_subagent_sessions';

/**
 * @typedef {Object} SessionMapping
 * @property {string} todolistSessionId
 * @property {string} subagentSessionKey
 * @property {string} subagentType - 'coding' | 'simple'
 * @property {string} agentId
 * @property {number} createdAt
 * @property {number} lastActivity
 * @property {'active'|'completed'|'timeout'|'error'} status
 * @property {Object|null} metadata - Additional session context (title, todo_id, etc.)
 */

class SessionRouter {
  constructor({ timeoutMs = SESSION_TIMEOUT_MS, cleanupIntervalMs = CLEANUP_INTERVAL_MS, logger, dbClient = null } = {}) {
    /** @type {Map<string, SessionMapping>} */
    this._registry = new Map();
    this._timeoutMs = timeoutMs;
    this._log = typeof logger === 'function' ? logger : this._defaultLogger;
    this._cleanupTimer = null;
    this._mongoClient = dbClient;
    this._db = null;
    this._collection = null;
    this._dbEnabled = false;

    if (cleanupIntervalMs > 0) {
      this._cleanupTimer = setInterval(() => this._evictStale(), cleanupIntervalMs);
      this._cleanupTimer.unref(); // Don't prevent process exit
    }
  }

  /**
   * Initialize MongoDB connection for session persistence.
   */
  async initDatabase() {
    if (!MONGODB_URL) {
      this._log('warn', 'MONGODB_URL not set, running without DB persistence');
      return false;
    }

    try {
      if (!this._mongoClient) {
        this._mongoClient = new MongoClient(MONGODB_URL, {
          maxPoolSize: 10,
          minPoolSize: 2,
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 10000,
        });
        await this._mongoClient.connect();
      }

      this._db = this._mongoClient.db(DB_NAME);
      this._collection = this._db.collection(SESSIONS_COLLECTION);
      this._dbEnabled = true;

      // Create indexes for efficient lookups
      await this._collection.createIndex({ todolist_session_id: 1 }, { unique: true });
      await this._collection.createIndex({ status: 1 });
      await this._collection.createIndex({ updated_at: -1 });

      this._log('info', 'MongoDB connected for session persistence', { database: DB_NAME, collection: SESSIONS_COLLECTION });
      return true;
    } catch (err) {
      this._log('error', 'Failed to connect to MongoDB', { error: err.message });
      this._dbEnabled = false;
      return false;
    }
  }

  /**
   * Load active sessions from DB into memory on startup.
   */
  async loadActiveSessions() {
    if (!this._dbEnabled || !this._collection) {
      this._log('info', 'DB not enabled, skipping session load');
      return 0;
    }

    try {
      const activeDocs = await this._collection.find({ 
        status: { $in: ['active', 'claimed'] } 
      }).toArray();

      let loaded = 0;
      for (const doc of activeDocs) {
        const mapping = {
          todolistSessionId: doc.todolist_session_id,
          subagentSessionKey: doc.subagent_session_key,
          subagentType: doc.agent_type || 'coding',
          agentId: doc.agent_id || '',
          createdAt: doc.created_at?.getTime() || Date.now(),
          lastActivity: doc.updated_at?.getTime() || Date.now(),
          status: doc.status === 'claimed' ? 'active' : doc.status,
          metadata: doc.metadata || null,
        };
        this._registry.set(mapping.todolistSessionId, mapping);
        loaded++;
      }

      this._log('info', `Loaded ${loaded} active sessions from DB`);
      return loaded;
    } catch (err) {
      this._log('error', 'Failed to load sessions from DB', { error: err.message });
      return 0;
    }
  }

  /**
   * Save session mapping to DB.
   */
  async _saveToDb(mapping) {
    if (!this._dbEnabled || !this._collection) return;

    try {
      await this._collection.updateOne(
        { todolist_session_id: mapping.todolistSessionId },
        {
          $set: {
            todolist_session_id: mapping.todolistSessionId,
            subagent_session_key: mapping.subagentSessionKey,
            agent_type: mapping.subagentType,
            agent_id: mapping.agentId,
            status: mapping.status,
            created_at: new Date(mapping.createdAt),
            updated_at: new Date(mapping.lastActivity),
            metadata: mapping.metadata,
          },
        },
        { upsert: true }
      );
    } catch (err) {
      this._log('error', 'Failed to save session to DB', { 
        session_id: mapping.todolistSessionId, 
        error: err.message 
      });
    }
  }

  /**
   * Update session status in DB.
   */
  async _updateDbStatus(todolistSessionId, status, lastActivity = Date.now()) {
    if (!this._dbEnabled || !this._collection) return;

    try {
      await this._collection.updateOne(
        { todolist_session_id: todolistSessionId },
        {
          $set: {
            status: status,
            updated_at: new Date(lastActivity),
          },
        }
      );
    } catch (err) {
      this._log('error', 'Failed to update session status in DB', { 
        session_id: todolistSessionId, 
        error: err.message 
      });
    }
  }

  _defaultLogger(level, message, meta = undefined) {
    const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}] [session-router]`;
    if (meta) {
      process.stdout.write(`${prefix} ${message} ${JSON.stringify(meta)}\n`);
      return;
    }
    process.stdout.write(`${prefix} ${message}\n`);
  }

  /**
   * Register a mapping from todolist session to subagent session.
   */
  async register(todolistSessionId, subagentSessionKey, { subagentType = 'coding', agentId = '', metadata = null } = {}) {
    const now = Date.now();
    const mapping = {
      todolistSessionId,
      subagentSessionKey,
      subagentType,
      agentId,
      createdAt: now,
      lastActivity: now,
      status: 'active',
      metadata: metadata || null,
    };

    this._registry.set(todolistSessionId, mapping);
    
    // Persist to DB
    await this._saveToDb(mapping);
    
    this._log('info', 'Registered session mapping', {
      todolistSessionId,
      subagentSessionKey,
      subagentType,
      dbPersisted: this._dbEnabled,
    });

    return mapping;
  }

  /**
   * Look up subagent session by todolist session ID.
   * Returns null if not found or not active.
   */
  lookup(todolistSessionId) {
    const mapping = this._registry.get(todolistSessionId);
    if (!mapping) return null;
    if (mapping.status !== 'active') return null;
    return mapping;
  }

  /**
   * Look up subagent session with DB fallback.
   * Checks memory first, then queries DB if not found.
   * Loads active session from DB into memory if found.
   */
  async lookupWithFallback(todolistSessionId) {
    // Check memory first
    const memoryMapping = this.lookup(todolistSessionId);
    if (memoryMapping) {
      return memoryMapping;
    }

    // If not in memory and DB is enabled, check DB
    if (!this._dbEnabled || !this._collection) {
      return null;
    }

    try {
      const doc = await this._collection.findOne({ 
        todolist_session_id: todolistSessionId,
        status: { $in: ['active', 'claimed'] }
      });

      if (!doc) {
        return null;
      }

      // Load from DB into memory
      const mapping = {
        todolistSessionId: doc.todolist_session_id,
        subagentSessionKey: doc.subagent_session_key,
        subagentType: doc.agent_type || 'coding',
        agentId: doc.agent_id || '',
        createdAt: doc.created_at?.getTime() || Date.now(),
        lastActivity: doc.updated_at?.getTime() || Date.now(),
        status: 'active',
        metadata: doc.metadata || null,
      };

      this._registry.set(todolistSessionId, mapping);
      this._log('info', 'Loaded session from DB into memory', { 
        todolistSessionId,
        subagentSessionKey: mapping.subagentSessionKey 
      });

      return mapping;
    } catch (err) {
      this._log('error', 'DB lookup failed', { 
        todolistSessionId, 
        error: err.message 
      });
      return null;
    }
  }

  /**
   * Touch a session to update lastActivity timestamp.
   */
  async touch(todolistSessionId) {
    const mapping = this._registry.get(todolistSessionId);
    const now = Date.now();
    if (mapping) {
      mapping.lastActivity = now;
      await this._updateDbStatus(todolistSessionId, mapping.status, now);
    }
    return mapping || null;
  }

  /**
   * Mark a session as completed and remove from active routing.
   */
  async complete(todolistSessionId) {
    const mapping = this._registry.get(todolistSessionId);
    const now = Date.now();
    if (mapping) {
      mapping.status = 'completed';
      mapping.lastActivity = now;
      await this._updateDbStatus(todolistSessionId, 'completed', now);
      this._log('info', 'Session marked completed', { todolistSessionId, dbUpdated: this._dbEnabled });
    } else {
      // Update DB even if not in memory (idempotent)
      await this._updateDbStatus(todolistSessionId, 'completed', now);
    }
    return mapping || null;
  }

  /**
   * Mark a session as errored.
   */
  async markError(todolistSessionId, errorMessage) {
    const mapping = this._registry.get(todolistSessionId);
    const now = Date.now();
    if (mapping) {
      mapping.status = 'error';
      mapping.lastActivity = now;
      await this._updateDbStatus(todolistSessionId, 'error', now);
      this._log('warn', 'Session marked error', { todolistSessionId, error: errorMessage, dbUpdated: this._dbEnabled });
    } else {
      await this._updateDbStatus(todolistSessionId, 'error', now);
    }
    return mapping || null;
  }

  /**
   * Remove a session mapping entirely.
   */
  async remove(todolistSessionId) {
    const existed = this._registry.delete(todolistSessionId);
    
    // Also remove from DB
    if (this._dbEnabled && this._collection) {
      try {
        await this._collection.deleteOne({ todolist_session_id: todolistSessionId });
      } catch (err) {
        this._log('error', 'Failed to remove session from DB', { todolistSessionId, error: err.message });
      }
    }
    
    if (existed) {
      this._log('info', 'Removed session mapping', { todolistSessionId, dbRemoved: this._dbEnabled });
    }
    return existed;
  }

  /**
   * Check if a session exists (any status).
   */
  has(todolistSessionId) {
    return this._registry.has(todolistSessionId);
  }

  /**
   * Get all active session mappings.
   */
  getActiveSessions() {
    const active = [];
    for (const mapping of this._registry.values()) {
      if (mapping.status === 'active') {
        active.push(mapping);
      }
    }
    return active;
  }

  /**
   * Get stats about the registry.
   */
  stats() {
    let active = 0;
    let completed = 0;
    let timeout = 0;
    let error = 0;

    for (const mapping of this._registry.values()) {
      switch (mapping.status) {
        case 'active': active += 1; break;
        case 'completed': completed += 1; break;
        case 'timeout': timeout += 1; break;
        case 'error': error += 1; break;
      }
    }

    return { total: this._registry.size, active, completed, timeout, error };
  }

  /**
   * Evict stale sessions (completed or timed out).
   */
  _evictStale() {
    const now = Date.now();
    const evicted = [];

    for (const [id, mapping] of this._registry) {
      if (mapping.status === 'completed' || mapping.status === 'error') {
        evicted.push(id);
        this._registry.delete(id);
      } else if (mapping.status === 'active' && now - mapping.lastActivity > this._timeoutMs) {
        mapping.status = 'timeout';
        evicted.push(id);
        this._registry.delete(id);
      }
    }

    if (evicted.length > 0) {
      this._log('info', 'Evicted stale sessions', { count: evicted.length, ids: evicted });
    }
  }

  /**
   * Stop the cleanup timer (for graceful shutdown).
   */
  async shutdown() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }

    // Close MongoDB connection
    if (this._mongoClient) {
      try {
        await this._mongoClient.close();
        this._log('info', 'MongoDB connection closed');
      } catch (err) {
        this._log('error', 'Error closing MongoDB connection', { error: err.message });
      }
    }

    const stats = this.stats();
    this._log('info', 'Session router shut down', stats);
  }
}

module.exports = { SessionRouter, SESSION_TIMEOUT_MS, CLEANUP_INTERVAL_MS };
