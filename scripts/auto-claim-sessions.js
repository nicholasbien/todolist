#!/usr/bin/env node

const http = require('http');
const https = require('https');
const os = require('os');
const { URL } = require('url');

const { classifySession, getLastUserMessage } = require('./session-classifier');
const { handleSession, DEFAULT_TIMEOUT_MS } = require('./subagent-spawner');

const API_URL = process.env.TODOLIST_API_URL || 'http://localhost:8000';
const AUTH_TOKEN = process.env.TODOLIST_AUTH_TOKEN;
const DEFAULT_SPACE_ID = process.env.DEFAULT_SPACE_ID || '';

const AGENT_ID = process.env.AUTO_CLAIM_AGENT_ID || `auto-claim-${os.hostname()}-${process.pid}`;
const POLL_INTERVAL_MS = parseIntegerEnv('AUTO_CLAIM_POLL_INTERVAL_MS', 15000);
const REQUEST_TIMEOUT_MS = parseIntegerEnv('AUTO_CLAIM_REQUEST_TIMEOUT_MS', 30000);
const REQUEST_RETRIES = parseIntegerEnv('AUTO_CLAIM_REQUEST_RETRIES', 2);
const HANDLER_TIMEOUT_MS = parseIntegerEnv('AUTO_CLAIM_HANDLER_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
const HANDLER_RETRIES = parseIntegerEnv('AUTO_CLAIM_HANDLER_RETRIES', 2);
const LOG_LEVEL = String(process.env.AUTO_CLAIM_LOG_LEVEL || 'info').toLowerCase();

let shuttingDown = false;

function parseIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const LOG_LEVEL_ORDER = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function log(level, message, meta = undefined) {
  const target = LOG_LEVEL_ORDER[level] || LOG_LEVEL_ORDER.info;
  const current = LOG_LEVEL_ORDER[LOG_LEVEL] || LOG_LEVEL_ORDER.info;
  if (target < current) return;

  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  if (meta) {
    process.stdout.write(`${prefix} ${message} ${JSON.stringify(meta)}\n`);
    return;
  }
  process.stdout.write(`${prefix} ${message}\n`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPathWithSpace(basePath) {
  if (!DEFAULT_SPACE_ID) return basePath;
  const separator = basePath.includes('?') ? '&' : '?';
  return `${basePath}${separator}space_id=${encodeURIComponent(DEFAULT_SPACE_ID)}`;
}

function isRetryableError(err) {
  if (!err) return false;
  if (err.retryable) return true;
  if (typeof err.statusCode === 'number') {
    return err.statusCode === 429 || err.statusCode >= 500;
  }
  return ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ECONNREFUSED'].includes(err.code);
}

function request(method, path, body, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const mod = url.protocol === 'https:' ? https : http;

    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    };
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = mod.request(
      {
        method,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk.toString();
        });

        res.on('end', () => {
          let parsed = null;
          if (raw) {
            try {
              parsed = JSON.parse(raw);
            } catch {
              parsed = raw;
            }
          }

          if (res.statusCode >= 400) {
            const detail =
              (parsed && typeof parsed === 'object' && (parsed.detail || parsed.message)) ||
              (typeof parsed === 'string' ? parsed : `HTTP ${res.statusCode}`);
            const err = new Error(`HTTP ${res.statusCode}: ${detail}`);
            err.statusCode = res.statusCode;
            err.retryable = res.statusCode === 429 || res.statusCode >= 500;
            reject(err);
            return;
          }

          resolve({ status: res.statusCode, data: parsed });
        });
      },
    );

    req.on('error', (err) => {
      err.retryable = isRetryableError(err);
      reject(err);
    });

    req.setTimeout(timeoutMs, () => {
      const err = new Error(`Request timeout after ${timeoutMs}ms`);
      err.code = 'ETIMEDOUT';
      err.retryable = true;
      req.destroy(err);
    });

    if (payload) req.write(payload);
    req.end();
  });
}

async function requestWithRetry(method, path, body, { retries = REQUEST_RETRIES, timeoutMs = REQUEST_TIMEOUT_MS, label = path } = {}) {
  const attempts = Math.max(1, retries + 1);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await request(method, path, body, timeoutMs);
    } catch (err) {
      lastError = err;
      if (attempt >= attempts || !isRetryableError(err)) {
        throw err;
      }

      const backoffMs = Math.min(1000 * attempt * 2, 10000);
      log('warn', `Request failed, retrying ${label}`, {
        attempt,
        remainingRetries: attempts - attempt,
        backoffMs,
        error: err.message,
      });
      await delay(backoffMs);
    }
  }

  throw lastError || new Error(`Request failed: ${label}`);
}

async function getPendingSessions() {
  const path = buildPathWithSpace('/agent/sessions/pending');
  const { data } = await requestWithRetry('GET', path, null, { label: 'get pending sessions' });
  if (!Array.isArray(data)) {
    return [];
  }
  return data;
}

function chooseNextSession(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) return null;
  return sessions.find((session) => !session?.agent_id || session.agent_id === AGENT_ID) || null;
}

function buildFallbackErrorReply(errorMessage) {
  return [
    'I started processing this session but hit an automation error before completing the task.',
    `Error: ${String(errorMessage || 'unknown error')}`,
    'Please resend the request or provide additional detail and I will retry.',
  ].join('\n');
}

async function postAssistantMessage(sessionId, content) {
  const path = `/agent/sessions/${sessionId}/messages`;
  await requestWithRetry('POST', path, { role: 'assistant', content }, { label: `post message ${sessionId}` });
}

async function claimSession(sessionId) {
  const path = `/agent/sessions/${sessionId}/claim`;
  const { data } = await requestWithRetry(
    'POST',
    path,
    { agent_id: AGENT_ID },
    { label: `claim session ${sessionId}` },
  );
  return Boolean(data && data.ok);
}

async function releaseSession(sessionId) {
  const path = `/agent/sessions/${sessionId}/release`;
  await requestWithRetry('POST', path, null, { label: `release session ${sessionId}` });
}

async function fetchFullSession(sessionId) {
  const path = `/agent/sessions/${sessionId}`;
  const { data } = await requestWithRetry('GET', path, null, { label: `get session ${sessionId}` });
  return data || {};
}

function extractPrompt(sessionSummary, fullSession) {
  const latestUserMessage = getLastUserMessage(fullSession);
  if (latestUserMessage) return latestUserMessage;
  if (sessionSummary?.last_message) return String(sessionSummary.last_message);
  if (fullSession?.title) return String(fullSession.title);
  return '';
}

async function processSession(sessionSummary) {
  const sessionId = String(sessionSummary._id || '').trim();
  if (!sessionId) {
    log('warn', 'Skipping pending session with no ID', { sessionSummary });
    return;
  }

  log('info', 'Processing pending session', {
    sessionId,
    title: sessionSummary.title || '(untitled)',
    claimedBy: sessionSummary.agent_id || null,
  });

  const claimed = await claimSession(sessionId);
  if (!claimed) {
    log('info', 'Session claim failed, likely taken by another agent', { sessionId });
    return;
  }

  let shouldRelease = true;

  try {
    const fullSession = await fetchFullSession(sessionId);
    const prompt = extractPrompt(sessionSummary, fullSession);
    const classification = classifySession({
      ...sessionSummary,
      ...fullSession,
      user_message: prompt,
      last_message: prompt || sessionSummary.last_message,
    });

    log('info', 'Session classified', {
      sessionId,
      type: classification.type,
      reason: classification.reason,
      keywords: classification.matchedKeywords,
    });

    const handlerResult = await handleSession({
      type: classification.type,
      prompt,
      session: fullSession,
      timeoutMs: HANDLER_TIMEOUT_MS,
      retries: HANDLER_RETRIES,
      logger: log,
    });

    const assistantMessage = handlerResult.ok
      ? String(handlerResult.response || '').trim()
      : buildFallbackErrorReply(handlerResult.error || 'Unknown handler error');

    if (!assistantMessage) {
      throw new Error('Handler produced empty assistant message');
    }

    await postAssistantMessage(sessionId, assistantMessage);

    log('info', 'Session response posted', {
      sessionId,
      handler: handlerResult.handler,
      attempts: handlerResult.attempts,
      ok: handlerResult.ok,
    });

    if (!handlerResult.ok) {
      log('error', 'Handler reported failure and fallback response was posted', {
        sessionId,
        error: handlerResult.error,
      });
    }
  } catch (err) {
    log('error', 'Session processing failed', { sessionId, error: err.message });

    try {
      await postAssistantMessage(sessionId, buildFallbackErrorReply(err.message));
      log('info', 'Posted fallback error reply to session', { sessionId });
    } catch (postErr) {
      log('error', 'Failed to post fallback error reply', {
        sessionId,
        error: postErr.message,
      });
    }
  } finally {
    if (shouldRelease) {
      try {
        await releaseSession(sessionId);
        log('info', 'Released session claim', { sessionId });
      } catch (releaseErr) {
        log('error', 'Failed to release session claim', {
          sessionId,
          error: releaseErr.message,
        });
      }
    }
  }
}

async function loopOnce() {
  const pendingSessions = await getPendingSessions();
  if (pendingSessions.length === 0) {
    log('debug', 'No pending sessions found');
    return;
  }

  const session = chooseNextSession(pendingSessions);
  if (!session) {
    log('debug', 'Pending sessions exist but all are claimed by other agents', {
      count: pendingSessions.length,
    });
    return;
  }

  await processSession(session);
}

async function run() {
  if (!AUTH_TOKEN) {
    process.stderr.write('Error: TODOLIST_AUTH_TOKEN is required\n');
    process.exit(1);
  }

  log('info', 'Starting auto-claim session worker', {
    apiUrl: API_URL,
    agentId: AGENT_ID,
    pollIntervalMs: POLL_INTERVAL_MS,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    requestRetries: REQUEST_RETRIES,
    handlerTimeoutMs: HANDLER_TIMEOUT_MS,
    handlerRetries: HANDLER_RETRIES,
    defaultSpaceId: DEFAULT_SPACE_ID || null,
  });

  while (!shuttingDown) {
    try {
      await loopOnce();
    } catch (err) {
      log('error', 'Polling loop failed', { error: err.message });
    }

    if (shuttingDown) break;
    await delay(POLL_INTERVAL_MS);
  }

  log('info', 'Auto-claim worker stopped');
}

function requestShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('info', `Received ${signal}, shutting down after current session`);
}

process.on('SIGINT', () => requestShutdown('SIGINT'));
process.on('SIGTERM', () => requestShutdown('SIGTERM'));

module.exports = {
  run,
  loopOnce,
  processSession,
  chooseNextSession,
  getPendingSessions,
  requestWithRetry,
};

if (require.main === module) {
  run().catch((err) => {
    process.stderr.write(`Fatal error: ${err.message}\n`);
    process.exit(1);
  });
}
