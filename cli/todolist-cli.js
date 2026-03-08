#!/usr/bin/env node

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Config from env vars
const API_URL = process.env.TODOLIST_API_URL || 'http://localhost:8000';
const AUTH_TOKEN = process.env.TODOLIST_AUTH_TOKEN;
const DEFAULT_SPACE_ID = process.env.DEFAULT_SPACE_ID || '';

if (!AUTH_TOKEN && process.argv[2] !== 'help') {
  console.error('Error: TODOLIST_AUTH_TOKEN environment variable is required');
  process.exit(1);
}

// --- HTTP helper (zero dependencies) ---

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const mod = url.protocol === 'https:' ? https : http;
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };
    const req = mod.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        if (res.statusCode >= 400) {
          const msg = parsed.detail || parsed.message || JSON.stringify(parsed);
          reject(new Error(`HTTP ${res.statusCode}: ${msg}`));
          return;
        }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// --- String helpers ---

/**
 * Decode escape sequences in a string (\n, \t, \r, \\, etc.)
 * Supports: \n, \t, \r, \b, \f, \\, \", \', \xHH (hex), \uHHHH (unicode)
 * @param {string|null|undefined} str - Input string to decode
 * @returns {string} - Decoded string, or empty string for null/undefined input
 */
function decodeEscapes(str) {
  if (str == null) return '';

  // Escape sequence map for common single-char escapes
  const escapes = {
    n: '\n',   // newline
    t: '\t',   // tab
    r: '\r',   // carriage return
    b: '\b',   // backspace
    f: '\f',   // form feed
    v: '\v',   // vertical tab
    '\\': '\\', // backslash
    '"': '"',  // double quote
    "'": "'",  // single quote
  };

  return str.replace(
    /\\(?:([nrtbfv\\"'])|x([0-9a-fA-F]{2})|u([0-9a-fA-F]{4})|(.?))/g,
    (_match, simple, hex, unicode, other) => {
      if (simple) {
        return escapes[simple];
      }
      if (hex) {
        return String.fromCharCode(parseInt(hex, 16));
      }
      if (unicode) {
        return String.fromCharCode(parseInt(unicode, 16));
      }
      // Keep unrecognized escapes as-is (including trailing backslash)
      return other === undefined ? '\\' : '\\' + other;
    }
  );
}

// --- Arg parsing helpers ---

function parseFlags(args) {
  const flags = {};
  const positional = [];
  let i = 0;
  while (i < args.length) {
    if (args[i].startsWith('--') && i + 1 < args.length && !args[i + 1].startsWith('--')) {
      flags[args[i].slice(2)] = args[i + 1];
      i += 2;
    } else if (args[i].startsWith('-') && args[i].length === 2 && i + 1 < args.length && !args[i + 1].startsWith('-')) {
      flags[args[i].slice(1)] = args[i + 1];
      i += 2;
    } else if (args[i] === '--completed') {
      flags.completed = true;
      i++;
    } else {
      positional.push(args[i]);
      i++;
    }
  }
  return { flags, positional };
}

// --- Commands ---

const commands = {
  async 'list-pending'() {
    const params = DEFAULT_SPACE_ID ? `?space_id=${DEFAULT_SPACE_ID}` : '';
    const { data } = await request('GET', `/agent/sessions/pending${params}`);
    if (!Array.isArray(data) || !data.length) {
      console.log('No pending messages.');
      return;
    }
    for (const s of data) {
      const todo = s.todo_id ? ` [Todo: ${s.todo_id}]` : '';
      const agent = s.agent_id ? ` [Claimed: ${s.agent_id}]` : '';
      console.log(`${s._id} | ${s.title || '(untitled)'}${todo}${agent}`);
      console.log(`  Message: ${s.last_message || '(empty)'}`);
      console.log();
    }
  },

  async 'get-session'(args) {
    const { positional } = parseFlags(args);
    const sessionId = positional[0];
    if (!sessionId) { console.error('Usage: get-session <session_id>'); process.exit(1); }
    const { data } = await request('GET', `/agent/sessions/${sessionId}`);
    console.log(`Session: ${data.title || '(untitled)'}`);
    console.log('---');
    for (const m of data.display_messages || []) {
      const prefix = m.role === 'user' ? 'USER' : 'AGENT';
      const ts = m.timestamp ? ` (${new Date(m.timestamp).toLocaleString()})` : '';
      console.log(`[${prefix}${ts}]`);
      console.log(m.content || '');
      console.log();
    }
  },

  async 'post-message'(args) {
    const { flags, positional } = parseFlags(args);
    const sessionId = flags['session-id'] || flags.s;
    const rawContent = flags.content || flags.c || positional.join(' ');
    const content = decodeEscapes(rawContent);
    const role = flags.role || 'assistant';
    if (!sessionId || !content) {
      console.error('Usage: post-message --session-id <id> --content <text> [--role assistant|user]');
      process.exit(1);
    }
    await request('POST', `/agent/sessions/${sessionId}/messages`, { role, content });
    console.log(`Posted ${role} message to session ${sessionId}`);
  },

  async 'claim-session'(args) {
    const { flags, positional } = parseFlags(args);
    const sessionId = flags['session-id'] || flags.s || positional[0];
    const agentId = flags['agent-id'] || flags.a || 'openclaw';
    if (!sessionId) { console.error('Usage: claim-session <session_id> [--agent-id <id>]'); process.exit(1); }
    const { data } = await request('POST', `/agent/sessions/${sessionId}/claim`, { agent_id: agentId });
    console.log(data.ok ? `Claimed session ${sessionId}` : `Failed to claim — already taken`);
  },

  async 'release-session'(args) {
    const { positional } = parseFlags(args);
    const sessionId = positional[0];
    if (!sessionId) { console.error('Usage: release-session <session_id>'); process.exit(1); }
    await request('POST', `/agent/sessions/${sessionId}/release`);
    console.log(`Released session ${sessionId}`);
  },

  async 'get-session-by-todo'(args) {
    const { positional } = parseFlags(args);
    const todoId = positional[0];
    if (!todoId) { console.error('Usage: get-session-by-todo <todo_id>'); process.exit(1); }
    const { data } = await request('GET', `/agent/sessions/by-todo/${todoId}`);
    if (data.session_id) {
      console.log(data.session_id);
    } else {
      console.log('No session linked to this todo.');
    }
  },

  async 'list-todos'(args) {
    const { flags } = parseFlags(args);
    const completed = flags.completed || false;
    const params = DEFAULT_SPACE_ID ? `?space_id=${DEFAULT_SPACE_ID}` : '';
    const { data } = await request('GET', `/todos${params}`);
    const todos = (Array.isArray(data) ? data : []).filter((t) => (completed ? t.completed : !t.completed));
    if (!todos.length) { console.log('No todos found.'); return; }
    for (const t of todos) {
      const check = t.completed ? '[x]' : '[ ]';
      const cat = t.category ? ` [${t.category}]` : '';
      const pri = t.priority ? ` (${t.priority})` : '';
      const notes = t.notes ? `\n     Notes: ${t.notes}` : '';
      console.log(`${check} ${t.text || '(no text)'}${cat}${pri} (ID: ${t._id})${notes}`);
    }
  },

  async 'add-todo'(args) {
    const { flags, positional } = parseFlags(args);
    const text = flags.text || flags.t || positional.join(' ');
    if (!text) { console.error('Usage: add-todo <text> [--category <cat>] [--priority High|Medium|Low]'); process.exit(1); }
    const body = { text, dateAdded: new Date().toISOString(), created_by_agent: true };
    if (DEFAULT_SPACE_ID) body.space_id = DEFAULT_SPACE_ID;
    if (flags.category) body.category = flags.category;
    if (flags.priority) body.priority = flags.priority;
    if (flags.notes) body.notes = flags.notes;
    const { data } = await request('POST', '/todos', body);
    console.log(`Added: "${data.text || text}" [${data.category || 'auto'}] (${data.priority || 'auto'}) ID: ${data._id}`);
  },

  async 'complete-todo'(args) {
    const { positional } = parseFlags(args);
    const id = positional[0];
    if (!id) { console.error('Usage: complete-todo <todo_id>'); process.exit(1); }
    await request('PUT', `/todos/${id}`, { completed: true });
    console.log(`Completed todo ${id}`);
  },

  async 'update-todo'(args) {
    const { flags, positional } = parseFlags(args);
    const id = positional[0];
    if (!id) { console.error('Usage: update-todo <todo_id> [--text <text>] [--priority <p>] [--category <c>]'); process.exit(1); }
    const body = {};
    if (flags.text) body.text = flags.text;
    if (flags.priority) body.priority = flags.priority;
    if (flags.category) body.category = flags.category;
    if (flags.notes) body.notes = flags.notes;
    if (!Object.keys(body).length) { console.error('Nothing to update. Use --text, --priority, --category, or --notes'); process.exit(1); }
    await request('PUT', `/todos/${id}`, body);
    console.log(`Updated todo ${id}`);
  },

  async 'watch-session'(args) {
    const { flags, positional } = parseFlags(args);
    const sessionId = flags['session-id'] || flags.s || positional[0];
    const since = flags.since || null;
    if (!sessionId) { console.error('Usage: watch-session <session_id> [--since <ISO timestamp>]'); process.exit(1); }
    const params = since ? `?since=${encodeURIComponent(since)}` : '';
    const { data } = await request('GET', `/agent/sessions/${sessionId}/watch${params}`);
    if (!data.new_messages || !data.new_messages.length) {
      console.log('No new messages.');
    } else {
      for (const m of data.new_messages) {
        const prefix = m.role === 'user' ? 'USER' : 'AGENT';
        const ts = m.timestamp ? ` (${m.timestamp})` : '';
        console.log(`[${prefix}${ts}]`);
        console.log(m.content || '');
        console.log();
      }
    }
    // Output JSON summary on last line for machine parsing
    console.log(JSON.stringify({
      has_new_user_message: data.has_new_user_message,
      agent_id: data.agent_id,
      needs_agent_response: data.needs_agent_response,
      message_count: (data.new_messages || []).length,
    }));
  },

  async 'create-session'(args) {
    const { flags, positional } = parseFlags(args);
    const title = flags.title || positional.join(' ');
    if (!title) { console.error('Usage: create-session --title <title> [--todo-id <id>]'); process.exit(1); }
    const body = { title, message_role: 'assistant' };
    if (DEFAULT_SPACE_ID) body.space_id = DEFAULT_SPACE_ID;
    if (flags['todo-id']) body.todo_id = flags['todo-id'];
    const { data } = await request('POST', '/agent/sessions', body);
    console.log(`Created session ${data.session_id}`);
  },

  async 'list-sessions'() {
    const params = DEFAULT_SPACE_ID ? `?space_id=${DEFAULT_SPACE_ID}` : '';
    const { data } = await request('GET', `/agent/sessions${params}`);
    if (!Array.isArray(data) || !data.length) { console.log('No sessions found.'); return; }
    for (const s of data) {
      const todo = s.todo_id ? ` [Todo: ${s.todo_id}]` : '';
      console.log(`${s._id} | ${s.title || '(untitled)'}${todo}`);
    }
  },

  async help() {
    console.log(`todolist-cli — CLI for the todolist app

Commands:
  list-pending                     Show sessions awaiting agent response
  get-session <session_id>         Read a session's messages
  post-message -s <id> -c <text>   Post a message to a session
  claim-session <session_id>       Claim a session for this agent
  release-session <session_id>     Release a session claim
  get-session-by-todo <todo_id>    Get the session linked to a todo
  watch-session <id> [--since TS]  Poll for new messages since timestamp
  list-todos [--completed]         List todos
  add-todo <text> [--category C] [--priority P] [--notes N]
  complete-todo <todo_id>          Mark a todo complete
  update-todo <id> [--text T] [--priority P] [--category C]
  create-session --title <t> [--todo-id <id>]
  list-sessions                    List all sessions
  help                             Show this help

Environment variables:
  TODOLIST_API_URL      API base URL (default: http://localhost:8000)
  TODOLIST_AUTH_TOKEN    Auth token (required)
  DEFAULT_SPACE_ID      Default space ID`);
  },
};

// --- Main ---

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || !commands[cmd]) {
    if (cmd && !commands[cmd]) console.error(`Unknown command: ${cmd}\n`);
    await commands.help();
    process.exit(cmd ? 1 : 0);
  }
  try {
    await commands[cmd](args);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
