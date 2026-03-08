#!/usr/bin/env node

/**
 * Session Router — Registry mapping todolist session_id → subagent session.
 *
 * Maintains an in-memory map for routing webhook events to the correct
 * subagent. Handles registration, lookup, status updates, and periodic
 * cleanup of stale/completed sessions.
 */

const CLEANUP_INTERVAL_MS = 60 * 1000; // Check every minute
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min inactivity timeout

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
  constructor({ timeoutMs = SESSION_TIMEOUT_MS, cleanupIntervalMs = CLEANUP_INTERVAL_MS, logger } = {}) {
    /** @type {Map<string, SessionMapping>} */
    this._registry = new Map();
    this._timeoutMs = timeoutMs;
    this._log = typeof logger === 'function' ? logger : this._defaultLogger;
    this._cleanupTimer = null;

    if (cleanupIntervalMs > 0) {
      this._cleanupTimer = setInterval(() => this._evictStale(), cleanupIntervalMs);
      this._cleanupTimer.unref(); // Don't prevent process exit
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
  register(todolistSessionId, subagentSessionKey, { subagentType = 'coding', agentId = '', metadata = null } = {}) {
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
    this._log('info', 'Registered session mapping', {
      todolistSessionId,
      subagentSessionKey,
      subagentType,
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
   * Touch a session to update lastActivity timestamp.
   */
  touch(todolistSessionId) {
    const mapping = this._registry.get(todolistSessionId);
    if (mapping) {
      mapping.lastActivity = Date.now();
    }
    return mapping || null;
  }

  /**
   * Mark a session as completed and remove from active routing.
   */
  complete(todolistSessionId) {
    const mapping = this._registry.get(todolistSessionId);
    if (mapping) {
      mapping.status = 'completed';
      mapping.lastActivity = Date.now();
      this._log('info', 'Session marked completed', { todolistSessionId });
    }
    return mapping || null;
  }

  /**
   * Mark a session as errored.
   */
  markError(todolistSessionId, errorMessage) {
    const mapping = this._registry.get(todolistSessionId);
    if (mapping) {
      mapping.status = 'error';
      mapping.lastActivity = Date.now();
      this._log('warn', 'Session marked error', { todolistSessionId, error: errorMessage });
    }
    return mapping || null;
  }

  /**
   * Remove a session mapping entirely.
   */
  remove(todolistSessionId) {
    const existed = this._registry.delete(todolistSessionId);
    if (existed) {
      this._log('info', 'Removed session mapping', { todolistSessionId });
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
  shutdown() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }

    const stats = this.stats();
    this._log('info', 'Session router shut down', stats);
  }
}

module.exports = { SessionRouter, SESSION_TIMEOUT_MS, CLEANUP_INTERVAL_MS };
