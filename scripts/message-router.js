#!/usr/bin/env node

/**
 * Message Router — Routes user messages from todolist to subagent sessions.
 *
 * Uses SessionRouter to lookup the subagent session, then forwards messages
 * via OpenClaw's sessions_send. Also provides progress checking via sessions_history.
 */

const { SessionRouter } = require('./session-router');
const { sessionsSend, sessionsHistory } = require('./subagent-integration');

/**
 * MessageRouter — Wraps SessionRouter with OpenClaw session tools.
 */
class MessageRouter {
  constructor({ sessionRouter = null, logger = null } = {}) {
    this.router = sessionRouter || new SessionRouter();
    this._log = typeof logger === 'function' ? logger : this._defaultLogger;
  }

  _defaultLogger(level, message, meta) {
    const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}] [message-router]`;
    if (meta) {
      console.log(`${prefix} ${message}`, JSON.stringify(meta));
    } else {
      console.log(`${prefix} ${message}`);
    }
  }

  /**
   * Register a new subagent session for a todolist session.
   * Called when spawning a subagent for a new task.
   */
  registerSession(todolistSessionId, subagentSessionKey, opts = {}) {
    return this.router.register(todolistSessionId, subagentSessionKey, opts);
  }

  /**
   * Route a user reply to the appropriate subagent session.
   * This is the main entry point for webhook handling.
   */
  async forwardUserReply(todolistSessionId, userMessage) {
    const mapping = this.router.lookup(todolistSessionId);

    if (!mapping) {
      this._log('warn', 'No active subagent found for session', { todolistSessionId });
      return { success: false, error: 'No active subagent session found' };
    }

    try {
      // Touch to update activity timestamp
      this.router.touch(todolistSessionId);

      // Forward message to subagent using actual OpenClaw tool
      await sessionsSend(mapping.subagentSessionKey, userMessage);

      this._log('info', 'Message forwarded to subagent', {
        todolistSessionId,
        subagentSessionKey: mapping.subagentSessionKey,
      });

      return { success: true, subagentSessionKey: mapping.subagentSessionKey };
    } catch (err) {
      this._log('error', 'Failed to forward message', {
        todolistSessionId,
        error: err.message,
      });
      return { success: false, error: err.message };
    }
  }

  /**
   * Send a message to a subagent (alias for forwardUserReply).
   */
  async routeMessage(todolistSessionId, message) {
    return this.forwardUserReply(todolistSessionId, message);
  }

  /**
   * Check the status of a subagent session by looking at recent history.
   * Returns last N messages for monitoring/debugging.
   */
  async checkSessionStatus(todolistSessionId, messageLimit = 5) {
    const mapping = this.router.lookup(todolistSessionId);

    if (!mapping) {
      return {
        active: false,
        status: 'not_found',
        message: 'No active subagent session found',
      };
    }

    try {
      const history = await sessions_history(mapping.subagentSessionKey, { limit: messageLimit });

      return {
        active: true,
        status: mapping.status,
        subagentType: mapping.subagentType,
        agentId: mapping.agentId,
        createdAt: mapping.createdAt,
        lastActivity: mapping.lastActivity,
        recentMessages: history,
      };
    } catch (err) {
      return {
        active: true,
        status: mapping.status,
        error: err.message,
      };
    }
  }

  /**
   * Mark a session as complete (subagent finished the task).
   */
  markComplete(todolistSessionId) {
    return this.router.complete(todolistSessionId);
  }

  /**
   * Mark a session as errored.
   */
  markError(todolistSessionId, errorMessage) {
    return this.router.markError(todolistSessionId, errorMessage);
  }

  /**
   * Get stats from underlying session router.
   */
  getStats() {
    return this.router.stats();
  }

  /**
   * Shutdown — cleanup timers from session router.
   */
  shutdown() {
    this.router.shutdown();
  }
}

/**
 * Wrapper for OpenClaw session tools.
 * In production, these would call the actual OpenClaw APIs.
 * For now, placeholder implementations that can be swapped.
 */
const openclawSessionsWrapper = {
  async sessions_send(sessionKey, message) {
    // TODO: Replace with actual OpenClaw sessions_send call
    // This would call: sessions_send({ sessionKey, message })
    console.log(`[sessions_send] ${sessionKey}: ${message.substring(0, 100)}...`);
  },

  async sessions_history(sessionKey, { limit = 10 } = {}) {
    // TODO: Replace with actual OpenClaw sessions_history call
    // This would call: sessions_history({ sessionKey, limit })
    return [];
  },
};

// Allow injection of real OpenClaw tools
function setOpenClawTools(tools) {
  if (tools.sessions_send) openclawSessionsWrapper.sessions_send = tools.sessions_send;
  if (tools.sessions_history) openclawSessionsWrapper.sessions_history = tools.sessions_history;
}

module.exports = {
  MessageRouter,
  setOpenClawTools,
  openclawSessionsWrapper,
};
