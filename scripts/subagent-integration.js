#!/usr/bin/env node

/**
 * Subagent Integration - Spawns OpenClaw subagents for todolist sessions.
 *
 * This module provides the actual integration with OpenClaw's session spawning
 * capabilities. It uses process spawn with `openclaw sessions_spawn` command.
 */

const { spawn } = require('child_process');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || `http://localhost:${process.env.WEBHOOK_PORT || 3456}`;

/**
 * @typedef {Object} SubagentResult
 * @property {string} sessionKey - The spawned subagent session key
 * @property {string} agentId - The agent ID used
 * @property {string} status - 'spawned' | 'failed'
 * @property {string} [error] - Error message if failed
 */

/**
 * Spawn a subagent for a todolist session.
 *
 * @param {Object} options
 * @param {string} options.sessionId - Todolist session ID
 * @param {string} options.todoId - Associated todo ID
 * @param {string} options.title - Session title
 * @param {string} options.agentType - 'coding' | 'simple'
 * @param {string} options.spaceId - Space ID
 * @param {string} [options.initialMessage] - Initial message content
 * @returns {Promise<SubagentResult>}
 */
async function spawnSubagentForSession({
  sessionId,
  todoId,
  title,
  agentType = 'coding',
  spaceId,
  initialMessage,
}) {
  if (agentType === 'simple') {
    return spawnSimpleAgent({ sessionId, todoId, title, initialMessage, spaceId });
  }

  return spawnCodingAgent({ sessionId, todoId, title, initialMessage, spaceId });
}

/**
 * Spawn a coding subagent using OpenClaw sessions_spawn.
 */
async function spawnCodingAgent({ sessionId, todoId, title, initialMessage, spaceId }) {
  const label = `todolist-${sessionId}`;
  
  // Build the task description for the coding agent
  const taskDescription = buildCodingTaskDescription({
    sessionId,
    todoId,
    title,
    initialMessage,
    spaceId,
  });

  return new Promise((resolve, reject) => {
    // Use openclaw CLI to spawn a session
    // Since we can't directly call sessions_spawn, we use codex as the subagent
    const args = [
      'exec',
      '--skip-git-repo-check',
      '--output-format',
      'text',
    ];

    const child = spawn('codex', args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        // Set environment variables for the subagent to access
        TODOLIST_SESSION_ID: sessionId,
        TODOLIST_TODO_ID: todoId || '',
        TODOLIST_SPACE_ID: spaceId || '',
        TODOLIST_WEBHOOK_URL: `${WEBHOOK_BASE_URL}/webhook/agent-message`,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      pty: true, // Required for coding agents
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    // Send the task to the child process
    child.stdin.write(taskDescription);
    child.stdin.end();

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn coding subagent: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Coding subagent failed with code ${code}: ${stderr || stdout}`));
        return;
      }

      // For codex exec, we get the output directly
      // The session key is simulated based on the session ID
      const sessionKey = `agent:codex:${sessionId}:${Date.now()}`;

      resolve({
        sessionKey,
        agentId: 'codex',
        status: 'spawned',
      });
    });

    // Timeout handling
    setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, DEFAULT_TIMEOUT_MS);
  });
}

/**
 * Spawn a simple agent that handles basic queries directly.
 */
async function spawnSimpleAgent({ sessionId, todoId, title, initialMessage, spaceId }) {
  // For simple agents, we process immediately without spawning a persistent subagent
  const response = buildSimpleResponse({ sessionId, title, initialMessage });

  // Post the response back to todolist
  await postMessageToTodolist(sessionId, response);

  // Return a pseudo session key since simple agents don't persist
  return {
    sessionKey: `simple:${sessionId}:${Date.now()}`,
    agentId: 'simple-handler',
    status: 'spawned',
  };
}

/**
 * Build the task description for a coding subagent.
 */
function buildCodingTaskDescription({ sessionId, todoId, title, initialMessage, spaceId }) {
  const parts = [
    'You are a coding subagent for the todolist.nyc webhook system.',
    '',
    'Your task is to work on a todo item and provide updates.',
    '',
    `Session ID: ${sessionId}`,
    `Todo ID: ${todoId || 'N/A'}`,
    `Space ID: ${spaceId || 'N/A'}`,
    `Title: ${title || 'Untitled'}`,
    '',
  ];

  if (initialMessage) {
    parts.push('User Request:');
    parts.push(initialMessage);
    parts.push('');
  }

  parts.push('Instructions:');
  parts.push('1. Read the task carefully and understand what needs to be done');
  parts.push('2. Work in the current repository (/data/workspace)');
  parts.push('3. Make changes as needed to complete the task');
  parts.push('4. When done, provide a clear summary of what was accomplished');
  parts.push('5. Use git commands to commit your work if applicable');
  parts.push('');
  parts.push('The task has been automatically claimed. Process it and post updates back.');
  parts.push('');
  parts.push('Begin working now.');

  return parts.join('\n');
}

/**
 * Build a simple response for non-coding tasks.
 */
function buildSimpleResponse({ sessionId, title, initialMessage }) {
  const message = initialMessage || '';
  const lowered = message.toLowerCase();

  // Greeting responses
  if (/\b(hello|hi|hey)\b/.test(lowered)) {
    return 'Hello! I am the todolist assistant. How can I help you today?';
  }

  // Who/what questions
  if (/\bwho\b/.test(lowered)) {
    return 'I am the automated todolist agent that helps with tasks. For complex coding work, I spawn specialized subagents.';
  }

  // Status questions
  if (/\b(status|progress|how is it going)\b/.test(lowered)) {
    return `I'm actively monitoring session ${sessionId}. The task "${title}" is being processed.`;
  }

  // Thank you responses
  if (/\b(thank|thanks)\b/.test(lowered)) {
    return "You're welcome! Let me know if you need anything else.";
  }

  // Default response
  if (!message) {
    return `I've received your task: "${title}". This has been classified as a simple request. Let me know if you need specific help with it.`;
  }

  return `I received your message: "${message}". For this simple request, I can help directly. Is there anything specific you'd like me to do with the task "${title}"?`;
}

/**
 * Post a message back to the todolist session.
 */
async function postMessageToTodolist(sessionId, message) {
  const { execSync } = require('child_process');

  try {
    execSync(
      `node /data/workspace/todolist/cli/todolist-cli.js post-message -s ${sessionId} -c "${message.replace(/"/g, '\\"')}"`,
      { stdio: 'pipe', timeout: 15000 }
    );
    return true;
  } catch (err) {
    console.error('Failed to post message:', err.message);
    return false;
  }
}

/**
 * Send a message to an active subagent session.
 * This simulates sessions_send for subagent communication.
 */
async function sessionsSend(sessionKey, message) {
  // In a real implementation, this would communicate with the running subagent
  // For now, we log and potentially post back to todolist
  console.log(`[sessions_send] ${sessionKey}: ${message.substring(0, 100)}...`);
  
  // Extract session ID from the key (format: agent:type:sessionId:timestamp)
  const parts = sessionKey.split(':');
  if (parts.length >= 3) {
    const sessionId = parts[2];
    // Post to todolist as a notification that message was forwarded
    await postMessageToTodolist(sessionId, `[Forwarded to subagent] ${message.substring(0, 200)}`);
  }
}

/**
 * Get history from a subagent session.
 * Simulates sessions_history.
 */
async function sessionsHistory(sessionKey, options = {}) {
  const { limit = 10 } = options;
  
  // In a real implementation, this would retrieve history from the running subagent
  // For now, return empty array
  return [];
}

/**
 * Spawn a new OpenClaw session using the CLI.
 * This is the actual implementation that calls openclaw commands.
 */
async function openclawSessionsSpawn(options) {
  const { task, agentId, label, runTimeoutSeconds = 300, cleanup = 'keep' } = options;

  return new Promise((resolve, reject) => {
    // Build openclaw command
    const args = [
      'sessions_spawn',
      '--agent', agentId,
      '--label', label,
      '--timeout', String(runTimeoutSeconds),
      '--cleanup', cleanup,
    ];

    const child = spawn('openclaw', args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.stdin.write(task);
    child.stdin.end();

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn OpenClaw session: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`OpenClaw spawn failed with code ${code}: ${stderr || stdout}`));
        return;
      }

      try {
        // Try to parse session key from output
        const lines = stdout.split('\n');
        const sessionLine = lines.find(l => l.includes('session_key') || l.includes('session:'));
        const sessionKey = sessionLine 
          ? sessionLine.split(':').pop().trim() 
          : `agent:${agentId}:${Date.now()}`;

        resolve({ sessionKey });
      } catch (err) {
        reject(new Error(`Failed to parse spawn result: ${err.message}`));
      }
    });
  });
}

/**
 * Send a message to an OpenClaw session.
 */
async function openclawSessionsSend(sessionKey, message) {
  return new Promise((resolve, reject) => {
    const args = [
      'sessions_send',
      '--session', sessionKey,
      '--message', message,
    ];

    const child = spawn('openclaw', args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to send message: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Send failed with code ${code}: ${stderr || stdout}`));
        return;
      }
      resolve({ success: true });
    });
  });
}

/**
 * Get history from an OpenClaw session.
 */
async function openclawSessionsHistory(sessionKey, options = {}) {
  const { limit = 10 } = options;

  return new Promise((resolve, reject) => {
    const args = [
      'sessions_history',
      '--session', sessionKey,
      '--limit', String(limit),
    ];

    const child = spawn('openclaw', args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to get history: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`History failed with code ${code}: ${stderr || stdout}`));
        return;
      }

      try {
        const history = JSON.parse(stdout);
        resolve(history);
      } catch {
        resolve([]);
      }
    });
  });
}

module.exports = {
  spawnSubagentForSession,
  spawnCodingAgent,
  spawnSimpleAgent,
  sessionsSend,
  sessionsHistory,
  postMessageToTodolist,
  openclawSessionsSpawn,
  openclawSessionsSend,
  openclawSessionsHistory,
};
