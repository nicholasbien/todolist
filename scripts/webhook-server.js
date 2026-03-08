#!/usr/bin/env node

/**
 * Webhook Server - HTTP server that receives webhooks from todolist backend.
 *
 * Express server with:
 * - POST /webhook/agent-message - Main webhook endpoint
 * - GET /health - Health check
 * - GET /stats - Session router stats
 * - POST /webhook/test - Test endpoint
 */

const express = require('express');
const cors = require('cors');
const { WebhookReceiver } = require('./webhook-receiver');
const { SessionRouter } = require('./session-router');
const { MessageRouter, setOpenClawTools } = require('./message-router');

// Configuration
const PORT = process.env.WEBHOOK_PORT || 3456;
const HOST = process.env.WEBHOOK_HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Logger
function logger(level, message, meta) {
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}] [webhook-server]`;
  if (meta) {
    console.log(`${prefix} ${message}`, JSON.stringify(meta));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger('info', `${req.method} ${req.path}`, { ip: req.ip || req.connection.remoteAddress });
  next();
});

// Create shared session router and message router
const sessionRouter = new SessionRouter({ logger });
const messageRouter = new MessageRouter({ sessionRouter, logger });
const webhookReceiver = new WebhookReceiver({ sessionRouter, messageRouter, logger });

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  const stats = sessionRouter.stats();
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    sessions: stats,
    environment: NODE_ENV,
  });
});

/**
 * Stats endpoint - detailed router stats
 */
app.get('/stats', (req, res) => {
  const stats = sessionRouter.stats();
  const activeSessions = sessionRouter.getActiveSessions().map(s => ({
    session_id: s.todolistSessionId,
    subagent_type: s.subagentType,
    agent_id: s.agentId,
    created_at: new Date(s.createdAt).toISOString(),
    last_activity: new Date(s.lastActivity).toISOString(),
    metadata: s.metadata,
  }));

  res.json({
    stats,
    active_sessions: activeSessions,
  });
});

/**
 * Main webhook endpoint - receives events from todolist backend
 */
app.post('/webhook/agent-message', webhookReceiver.expressHandler());

/**
 * Test webhook endpoint - echo back what was received
 */
app.post('/webhook/test', (req, res) => {
  logger('info', 'Test webhook received', {
    body: req.body,
    headers: {
      'content-type': req.headers['content-type'],
      'x-webhook-signature': req.headers['x-webhook-signature'] ? 'present' : 'absent',
    },
  });
  res.json({
    received: true,
    echo: req.body,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get session status
 */
app.get('/sessions/:sessionId/status', async (req, res) => {
  const { sessionId } = req.params;
  const status = await messageRouter.checkSessionStatus(sessionId, 10);
  res.json(status);
});

/**
 * Force mark session complete (for testing/admin)
 */
app.post('/sessions/:sessionId/complete', (req, res) => {
  const { sessionId } = req.params;
  sessionRouter.complete(sessionId);
  res.json({ completed: true, session_id: sessionId });
});

/**
 * List all active sessions
 */
app.get('/sessions', (req, res) => {
  const active = sessionRouter.getActiveSessions();
  res.json({
    count: active.length,
    sessions: active.map(s => ({
      session_id: s.todolistSessionId,
      subagent_session_key: s.subagentSessionKey,
      subagent_type: s.subagentType,
      agent_id: s.agentId,
      status: s.status,
      created_at: new Date(s.createdAt).toISOString(),
      last_activity: new Date(s.lastActivity).toISOString(),
    })),
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger('error', 'Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error', message: NODE_ENV === 'development' ? err.message : undefined });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Start server
const server = app.listen(PORT, HOST, () => {
  logger('info', `Webhook server started`, {
    host: HOST,
    port: PORT,
    environment: NODE_ENV,
    endpoints: {
      health: `http://${HOST}:${PORT}/health`,
      webhook: `http://${HOST}:${PORT}/webhook/agent-message`,
      test: `http://${HOST}:${PORT}/webhook/test`,
      stats: `http://${HOST}:${PORT}/stats`,
    },
  });
});

// Graceful shutdown
function gracefulShutdown(signal) {
  logger('info', `Received ${signal}, shutting down gracefully...`);
  
  sessionRouter.shutdown();
  messageRouter.shutdown();
  
  server.close(() => {
    logger('info', 'Server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger('error', 'Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Export for testing
module.exports = { app, server, sessionRouter, messageRouter, webhookReceiver };

// If run directly, keep server running
if (require.main === module) {
  logger('info', 'Webhook server running as main process');
}
