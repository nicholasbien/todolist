#!/usr/bin/env node
/**
 * Helper script to post rich markdown messages to todolist sessions
 * Handles proper escaping of special characters (|, `, ---, etc.)
 * 
 * Usage: node post-rich-message.js <session_id> <message_file>
 * Or:    echo "message" | node post-rich-message.js <session_id>
 */

const fs = require('fs');
const { execSync } = require('child_process');

const API_URL = process.env.TODOLIST_API_URL || 'http://localhost:8000';
const AUTH_TOKEN = process.env.TODOLIST_AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error('Error: TODOLIST_AUTH_TOKEN required');
  process.exit(1);
}

const sessionId = process.argv[2];
if (!sessionId) {
  console.error('Usage: node post-rich-message.js <session_id> [message_file]');
  console.error('   or: echo "message" | node post-rich-message.js <session_id>');
  process.exit(1);
}

// Read message from file or stdin
let message;
if (process.argv[3]) {
  message = fs.readFileSync(process.argv[3], 'utf8');
} else {
  message = fs.readFileSync(0, 'utf8'); // stdin
}

// Use Node.js to make HTTP request (no shell escaping issues!)
const https = require('https');
const http = require('http');
const { URL } = require('url');

const url = new URL(`/agent/sessions/${sessionId}/messages`, API_URL);
const payload = JSON.stringify({
  role: 'assistant',
  content: message
});

const options = {
  method: 'POST',
  hostname: url.hostname,
  port: url.port || (url.protocol === 'https:' ? 443 : 80),
  path: url.pathname,
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const mod = url.protocol === 'https:' ? https : http;

const req = mod.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode === 200 || res.statusCode === 201) {
      console.log(`✅ Posted rich message to session ${sessionId}`);
      console.log(`   ${message.split('\n')[0].substring(0, 50)}...`);
    } else {
      console.error(`❌ Failed: HTTP ${res.statusCode}`);
      console.error(data);
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  console.error('❌ Request failed:', err.message);
  process.exit(1);
});

req.write(payload);
req.end();
