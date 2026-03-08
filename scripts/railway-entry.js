#!/usr/bin/env node
/**
 * Railway entry point for webhook server
 * Reads Railway-specific env vars and starts server
 */

// Railway sets PORT env var dynamically
process.env.WEBHOOK_PORT = process.env.PORT || process.env.WEBHOOK_PORT || '8080';
process.env.WEBHOOK_HOST = '0.0.0.0';

// Load and start server
require('./webhook-server.js');
