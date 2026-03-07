#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_RETRIES = 2;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(text, maxLength = 2000) {
  const value = String(text || '');
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

function defaultLogger(level, message, meta = undefined) {
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  if (meta) {
    process.stdout.write(`${prefix} ${message} ${JSON.stringify(meta)}\n`);
    return;
  }
  process.stdout.write(`${prefix} ${message}\n`);
}

function getLogger(logger) {
  return typeof logger === 'function' ? logger : defaultLogger;
}

function getLatestUserMessage(session) {
  const messages = Array.isArray(session?.display_messages) ? session.display_messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role === 'user' && msg?.content) {
      return String(msg.content).trim();
    }
  }
  return '';
}

function buildSimpleResponse({ session, prompt }) {
  const userMessage = getLatestUserMessage(session) || String(prompt || '').trim();
  const lowered = userMessage.toLowerCase();

  if (!userMessage) {
    return 'I could not find a user message in this session. Please send your request again with more detail.';
  }

  if (/\b(hello|hi|hey)\b/.test(lowered)) {
    return 'Hello. I picked up your session and I am ready to help. Share the task details and I will handle it.';
  }

  if (/\bwho\b/.test(lowered)) {
    return 'I am the automated todolist session worker that routes requests and posts responses back to this chat.';
  }

  if (/\bwhat\b|\bquestion\b|\?/.test(lowered)) {
    return `I received your question: "${truncate(userMessage, 400)}". Please share any extra context if you want a deeper or code-focused answer.`;
  }

  if (/\btest\b/.test(lowered)) {
    return 'Test message received. The auto-claim pipeline is working and can process coding or simple sessions.';
  }

  return `I received: "${truncate(userMessage, 400)}". This was classified as a simple request, so I replied directly without spawning a coding subagent.`;
}

function buildCodexPrompt({ session, prompt }) {
  const title = String(session?.title || '').trim();
  const messages = Array.isArray(session?.display_messages) ? session.display_messages : [];
  const recentMessages = messages.slice(-12).map((msg) => {
    const role = String(msg?.role || 'unknown').toUpperCase();
    return `${role}: ${String(msg?.content || '').trim()}`;
  });

  const latestRequest = getLatestUserMessage(session) || String(prompt || '').trim();

  return [
    'You are a coding subagent for the todolist.nyc auto-claim system.',
    'Work in the current repository when coding work is requested.',
    'Produce a final assistant response suitable for posting into the user chat session.',
    'If you cannot complete work, explain the blocker and next action clearly.',
    '',
    `Session title: ${title || '(untitled)'}`,
    `Latest user request: ${latestRequest || '(empty)'}`,
    '',
    'Recent conversation:',
    recentMessages.length ? recentMessages.join('\n\n') : '(no recent messages)',
  ].join('\n');
}

function cleanupTempDir(tempDir) {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup only.
  }
}

function loadCodexMessageFile(outputFile) {
  try {
    if (fs.existsSync(outputFile)) {
      return String(fs.readFileSync(outputFile, 'utf8') || '').trim();
    }
  } catch {
    return '';
  }
  return '';
}

async function spawnCodingSubagent({ session, prompt, timeoutMs = DEFAULT_TIMEOUT_MS, logger }) {
  const log = getLogger(logger);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-claim-codex-'));
  const outputFile = path.join(tempDir, 'last-message.txt');

  const codexPrompt = buildCodexPrompt({ session, prompt });
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--output-last-message',
    outputFile,
    codexPrompt,
  ];

  log('info', 'Spawning codex subagent', { timeoutMs });

  return new Promise((resolve, reject) => {
    const child = spawn('codex', args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1500);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      cleanupTempDir(tempDir);
      reject(err);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);

      const fileMessage = loadCodexMessageFile(outputFile);
      cleanupTempDir(tempDir);

      if (timedOut) {
        const err = new Error(`Codex subagent timed out after ${timeoutMs}ms`);
        err.code = 'ETIMEOUT';
        reject(err);
        return;
      }

      if (code !== 0) {
        const output = fileMessage || stdout || stderr;
        const err = new Error(`Codex subagent failed (code=${code}, signal=${signal || 'none'}): ${truncate(output, 800)}`);
        err.code = 'ECODEXFAILED';
        reject(err);
        return;
      }

      const response = fileMessage || stdout.trim();
      if (!response) {
        const err = new Error(`Codex subagent returned empty output. stderr: ${truncate(stderr, 800)}`);
        err.code = 'EEMPTY';
        reject(err);
        return;
      }

      resolve(response.trim());
    });
  });
}

async function runWithRetries(work, { retries, logger, label }) {
  const log = getLogger(logger);
  const totalAttempts = Math.max(1, retries + 1);
  let lastError = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      const value = await work(attempt);
      return { value, attempt };
    } catch (err) {
      lastError = err;
      if (attempt >= totalAttempts) {
        break;
      }
      const backoffMs = Math.min(3000 * attempt, 15000);
      log('warn', `${label} failed, retrying`, {
        attempt,
        remainingRetries: totalAttempts - attempt,
        backoffMs,
        error: err.message,
      });
      await delay(backoffMs);
    }
  }

  throw lastError || new Error(`${label} failed after ${totalAttempts} attempts`);
}

async function handleSession({ type, prompt, session, timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES, logger }) {
  const log = getLogger(logger);

  if (type === 'simple') {
    const response = buildSimpleResponse({ session, prompt });
    return {
      ok: true,
      handler: 'simple',
      attempts: 1,
      response,
    };
  }

  try {
    const { value, attempt } = await runWithRetries(
      () => spawnCodingSubagent({ session, prompt, timeoutMs, logger: log }),
      {
        retries,
        logger: log,
        label: 'coding subagent',
      },
    );

    return {
      ok: true,
      handler: 'coding',
      attempts: attempt,
      response: value,
    };
  } catch (err) {
    return {
      ok: false,
      handler: 'coding',
      attempts: retries + 1,
      error: err.message,
    };
  }
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_RETRIES,
  buildSimpleResponse,
  buildCodexPrompt,
  spawnCodingSubagent,
  handleSession,
};

if (require.main === module) {
  const [, , rawType, ...rest] = process.argv;
  const type = rawType === 'coding' ? 'coding' : 'simple';
  const prompt = rest.join(' ').trim();

  handleSession({ type, prompt, session: { display_messages: [{ role: 'user', content: prompt }] } })
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exit(0);
    })
    .catch((err) => {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    });
}
