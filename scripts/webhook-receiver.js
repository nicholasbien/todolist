#!/usr/bin/env node

/**
 * Webhook Receiver - Handles POST /webhook/agent-message from todolist backend.
 *
 * Receives webhook events, validates authentication, and routes to appropriate
 * subagent or spawns a new one if needed.
 */

const crypto = require('crypto');
const { SessionRouter } = require('./session-router');
const { MessageRouter } = require('./message-router');
const { spawnSubagentForSession } = require('./subagent-integration');

// Configuration from environment
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'dev-webhook-secret';
const CLAIM_AGENT_ID = process.env.AGENT_ID || 'openclaw-webhook';
const AUTO_CLAIM_ENABLED = process.env.AUTO_CLAIM_ENABLED !== 'false';

// Default space ID for todolist sessions
const DEFAULT_SPACE_ID = process.env.DEFAULT_SPACE_ID || '';

/**
 * @typedef {Object} WebhookPayload
 * @property {string} event - 'session.created' | 'message.posted' | 'session.claimed' | 'message.reply'
 * @property {string} session_id - Todolist session ID
 * @property {string} [todo_id] - Associated todo ID
 * @property {string} [title] - Session title
 * @property {string} [message] - Message content (for message.posted events)
 * @property {string} [agent_type] - 'coding' | 'simple' | 'auto'
 * @property {string} [space_id] - Space ID
 * @property {boolean} [needs_agent_response] - Whether agent needs to respond
 * @property {string} timestamp - ISO timestamp
 * @property {string} [signature] - HMAC signature for verification
 */

class WebhookReceiver {
  constructor({ sessionRouter = null, messageRouter = null, logger = null } = {}) {
    this.router = sessionRouter || new SessionRouter();
    this.messageRouter = messageRouter || new MessageRouter({ sessionRouter: this.router });
    this._log = typeof logger === 'function' ? logger : this._defaultLogger;
  }

  _defaultLogger(level, message, meta) {
    const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}] [webhook-receiver]`;
    if (meta) {
      console.log(`${prefix} ${message}`, JSON.stringify(meta));
    } else {
      console.log(`${prefix} ${message}`);
    }
  }

  /**
   * Verify webhook signature using HMAC-SHA256.
   */
  verifySignature(payload, signature) {
    if (!WEBHOOK_SECRET || WEBHOOK_SECRET === 'dev-webhook-secret') {
      this._log('warn', 'Webhook secret not configured, skipping signature verification');
      return true;
    }

    if (!signature) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch {
      return false;
    }
  }

  /**
   * Main entry point for webhook handling.
   * @param {WebhookPayload} payload
   * @param {Object} headers - Request headers
   * @returns {Promise<{status: number, body: Object}>}
   */
  async handleWebhook(payload, headers = {}) {
    const signature = headers['x-webhook-signature'] || payload.signature;

    // Verify signature
    if (!this.verifySignature(payload, signature)) {
      this._log('error', 'Invalid webhook signature', { session_id: payload.session_id });
      return { status: 401, body: { error: 'Invalid signature' } };
    }

    const { event, session_id } = payload;

    if (!session_id) {
      return { status: 400, body: { error: 'Missing session_id' } };
    }

    this._log('info', `Received webhook: ${event}`, { session_id, event });

    try {
      switch (event) {
        case 'session.created':
          return await this.handleNewSession(payload);
        case 'message.posted':
        case 'message.reply':
          return await this.handleNewMessage(payload);
        case 'session.claimed':
          return await this.handleSessionClaimed(payload);
        case 'session.released':
          return await this.handleSessionReleased(payload);
        default:
          this._log('warn', `Unknown webhook event: ${event}`, { session_id });
          return { status: 400, body: { error: `Unknown event: ${event}` } };
      }
    } catch (err) {
      this._log('error', 'Webhook handler error', { session_id, error: err.message, stack: err.stack });
      return { status: 500, body: { error: 'Internal handler error', details: err.message } };
    }
  }

  /**
   * Handle new session creation - spawn subagent or process directly.
   */
  async handleNewSession(payload) {
    const { session_id, todo_id, title, agent_type = 'auto', space_id } = payload;

    // Check if we should auto-claim
    if (!AUTO_CLAIM_ENABLED) {
      this._log('info', 'Auto-claim disabled, ignoring session', { session_id });
      return { status: 200, body: { action: 'ignored', reason: 'auto_claim_disabled' } };
    }

    // Check if session already has a subagent
    const existingMapping = this.router.lookup(session_id);
    if (existingMapping) {
      this._log('info', 'Session already has active subagent', { session_id, subagentSessionKey: existingMapping.subagentSessionKey });
      return { status: 200, body: { action: 'already_exists', session_id, subagent_session_key: existingMapping.subagentSessionKey } };
    }

    // Claim the session via CLI
    const claimed = await this.claimSessionCli(session_id);
    if (!claimed) {
      this._log('warn', 'Failed to claim session', { session_id });
      return { status: 409, body: { error: 'Session already claimed or not found' } };
    }

    try {
      // Spawn subagent for this session
      const classification = agent_type === 'auto' ? await this.classifySession(payload) : { type: agent_type };
      
      this._log('info', 'Spawning subagent for session', { session_id, agent_type: classification.type });
      
      const subagent = await spawnSubagentForSession({
        sessionId: session_id,
        todoId: todo_id,
        title: title || 'Untitled Task',
        agentType: classification.type,
        spaceId: space_id || DEFAULT_SPACE_ID,
        initialMessage: payload.message,
      });

      // Register the subagent session
      this.router.register(session_id, subagent.sessionKey, {
        subagentType: classification.type,
        agentId: subagent.agentId || CLAIM_AGENT_ID,
        metadata: {
          todo_id: todo_id,
          space_id: space_id,
          title: title,
          created_from: 'webhook',
        },
      });

      this._log('info', 'Subagent spawned successfully', { session_id, subagentSessionKey: subagent.sessionKey });

      return {
        status: 200,
        body: {
          action: 'spawned_subagent',
          session_id,
          subagent_session_key: subagent.sessionKey,
          agent_type: classification.type,
        },
      };
    } catch (err) {
      this._log('error', 'Failed to spawn subagent', { session_id, error: err.message });
      this.router.markError(session_id, err.message);
      return { status: 500, body: { error: 'Failed to spawn subagent', details: err.message } };
    }
  }

  /**
   * Handle new message - route to existing subagent or spawn new one.
   */
  async handleNewMessage(payload) {
    const { session_id, message, needs_agent_response = true } = payload;

    // Try to route to existing subagent
    const routing = await this.messageRouter.forwardUserReply(session_id, message);

    if (routing.success) {
      this._log('info', 'Message routed to existing subagent', { session_id, subagentSessionKey: routing.subagentSessionKey });
      return {
        status: 200,
        body: {
          action: 'routed_to_subagent',
          session_id,
          subagent_session_key: routing.subagentSessionKey,
        },
      };
    }

    // No active subagent - check if we need to spawn one
    if (needs_agent_response) {
      this._log('info', 'No active subagent, treating as new session', { session_id });
      return this.handleNewSession(payload);
    }

    return {
      status: 200,
      body: {
        action: 'no_action_needed',
        reason: routing.error || 'No active subagent and needs_agent_response=false',
      },
    };
  }

  /**
   * Handle session claimed event.
   */
  async handleSessionClaimed(payload) {
    const { session_id, agent_id } = payload;
    
    this._log('info', 'Session claimed by agent', { session_id, agent_id });
    
    // Touch the session to update activity
    this.router.touch(session_id);
    
    return {
      status: 200,
      body: { action: 'acknowledged', event: 'session.claimed', session_id },
    };
  }

  /**
   * Handle session released event.
   */
  async handleSessionReleased(payload) {
    const { session_id } = payload;
    
    this._log('info', 'Session released, marking complete', { session_id });
    
    // Mark the subagent session as complete
    this.router.complete(session_id);
    
    return {
      status: 200,
      body: { action: 'acknowledged', event: 'session.released', session_id },
    };
  }

  /**
   * Classify a session to determine if it needs a coding or simple agent.
   */
  async classifySession(payload) {
    // Check for explicit agent type
    if (payload.agent_type && payload.agent_type !== 'auto') {
      return { type: payload.agent_type };
    }

    // Simple keyword-based classification
    const title = (payload.title || '').toLowerCase();
    const message = (payload.message || '').toLowerCase();
    const combined = `${title} ${message}`;

    // Coding indicators
    const codingKeywords = [
      'code', 'fix', 'bug', 'implement', 'create', 'script', 'function',
      'refactor', 'debug', 'build', 'deploy', 'api', 'database', 'query',
      'error', 'exception', 'crash', 'test', 'unit test', 'integration',
      'git', 'commit', 'pr', 'pull request', 'branch', 'merge',
      'javascript', 'python', 'typescript', 'node', 'react', 'vue',
      'server', 'backend', 'frontend', 'database', 'sql', 'nosql',
      'docker', 'kubernetes', 'ci/cd', 'pipeline', 'railway', 'vercel',
      'performance', 'optimize', 'memory leak', 'race condition',
    ];

    for (const keyword of codingKeywords) {
      if (combined.includes(keyword)) {
        return { type: 'coding', confidence: 'high' };
      }
    }

    // Simple task indicators
    const simpleKeywords = [
      'hello', 'hi', 'hey', 'how are you', 'what time', 'what day',
      'weather', 'reminder', 'note', 'quick question',
      'thank you', 'thanks', 'good bye', 'bye',
      'calculate', 'sum', 'total', 'average', 'count',
      'yes', 'no', 'ok', 'okay', 'sure', 'done',
    ];

    for (const keyword of simpleKeywords) {
      if (combined.includes(keyword)) {
        return { type: 'simple', confidence: 'high' };
      }
    }

    // Default to coding for safety (better to spawn a coding agent)
    return { type: 'coding', confidence: 'low' };
  }

  /**
   * Claim a session via CLI.
   */
  async claimSessionCli(sessionId) {
    const { execSync } = require('child_process');
    
    try {
      execSync(
        `node /data/workspace/todolist/cli/todolist-cli.js claim-session ${sessionId} --agent-id ${CLAIM_AGENT_ID}`,
        { stdio: 'pipe', timeout: 10000 }
      );
      return true;
    } catch (err) {
      // Session might already be claimed - check if by us
      if (err.stdout && err.stdout.toString().includes('already claimed')) {
        return false;
      }
      return false;
    }
  }

  /**
   * Express middleware handler.
   */
  expressHandler() {
    return async (req, res) => {
      try {
        const result = await this.handleWebhook(req.body, req.headers);
        res.status(result.status).json(result.body);
      } catch (err) {
        this._log('error', 'Express handler error', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
      }
    };
  }

  /**
   * Get stats from underlying router.
   */
  getStats() {
    return this.router.stats();
  }

  /**
   * Shutdown - cleanup.
   */
  shutdown() {
    this.router.shutdown();
    this.messageRouter.shutdown();
  }
}

module.exports = { WebhookReceiver };
