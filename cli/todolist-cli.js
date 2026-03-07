#!/usr/bin/env node

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Config from env vars
const API_URL = process.env.TODOLIST_API_URL || 'http://localhost:8000';
const AUTH_TOKEN = process.env.TODOLIST_AUTH_TOKEN;
const DEFAULT_SPACE_ID = process.env.DEFAULT_SPACE_ID || '';

if (!AUTH_TOKEN) {
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
      port: url.port,
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
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// --- Commands ---

const commands = {
  async 'list-pending'() {
    const params = DEFAULT_SPACE_ID ? `?space_id=${DEFAULT_SPACE_ID}` : '';
    const { data } = await request('GET', `/agent/sessions/pending${params}`);
    if (!data.length) {
      console.log('No pending messages.');
      return;
    }
    for (const s of data) {
      const todo = s.todo_id ? ` [Todo: ${s.todo_id}]` : '';
      const agent = s.agent_id ? ` [Claimed: ${s.agent_id}]` : '';
      console.log(`${s._id} | ${s.title}${todo}${agent}`);
      console.log(`  Message: ${s.last_message}`);
      console.log();
    }
  },

  async 'get-session'(args) {
    const sessionId = args[0];
    if (!sessionId) { console.error('Usage: get-session <session_id>'); process.exit(1); }
    const { data } = await request('GET', `/agent/sessions/${sessionId}`);
    console.log(`Session: ${data.title}`);
    console.log('---');
    for (const m of data.display_messages || []) {
      const prefix = m.role === 'user' ? 'USER' : 'AGENT';
      const ts = m.timestamp ? ` (${new Date(m.timestamp).toLocaleString()})` : '';
      console.log(`[${prefix}${ts}]`);
      console.log(m.content);
      console.log();
    }
  },

  async 'post-message'(args) {
    const sessionId = parseFlag(args, '--session-id') || parseFlag(args, '-s');
    const content = parseFlag(args, '--content') || parseFlag(args, '-c') || args.join(' ');
    const role = parseFlag(args, '--role') || 'assistant';
    if (!sessionId || !content) {
      console.error('Usage: post-message --session-id <id> --content <text> [--role assistant|user]');
      process.exit(1);
    }
    await request('POST', `/agent/sessions/${sessionId}/messages`, { role, content });
    console.log(`Posted ${role} message to session ${sessionId}`);
  },

  async 'claim-session'(args) {
    const sessionId = parseFlag(args, '--session-id') || parseFlag(args, '-s') || args[0];
    const agentId = parseFlag(args, '--agent-id') || parseFlag(args, '-a') || 'openclaw';
    if (!sessionId) { console.error('Usage: claim-session <session_id> [--agent-id <id>]'); process.exit(1); }
    const { data } = await request('POST', `/agent/sessions/${sessionId}/claim`, { agent_id: agentId });
    console.log(data.ok ? `Claimed session ${sessionId}` : `Failed to claim — already taken`);
  },

  async 'release-session'(args) {
    const sessionId = args[0];
    if (!sessionId) { console.error('Usage: release-session <session_id>'); process.exit(1); }
    await request('POST', `/agent/sessions/${sessionId}/release`);
    console.log(`Released session ${sessionId}`);
  },

  async 'list-todos'(args) {
    const completed = args.includes('--completed');
    const params = new URLSearchParams();
    if (DEFAULT_SPACE_ID) params.set('active_space_id', DEFAULT_SPACE_ID);
    const { data } = await request('GET', `/todos?${params}`);
    const todos = (data || []).filter((t) => (completed ? t.completed : !t.completed));
    if (!todos.length) { console.log('No todos found.'); return; }
    for (const t of todos) {
      const check = t.completed ? '[x]' : '[ ]';
      const cat = t.category ? ` [${t.category}]` : '';
      const pri = t.priority ? ` (${t.priority})` : '';
      console.log(`${check} ${t.text}${cat}${pri} (ID: ${t._id})`);
    }
  },

  async 'add-todo'(args) {
    const text = parseFlag(args, '--text') || parseFlag(args, '-t') || args.join(' ');
    if (!text) { console.error('Usage: add-todo <text> [--category <cat>] [--priority High|Medium|Low]'); process.exit(1); }
    const body = { text, dateAdded: new Date().toISOString(), created_by_agent: true };
    if (DEFAULT_SPACE_ID) body.space_id = DEFAULT_SPACE_ID;
    const cat = parseFlag(args, '--category');
    const pri = parseFlag(args, '--priority');
    const notes = parseFlag(args, '--notes');
    if (cat) body.category = cat;
    if (pri) body.priority = pri;
    if (notes) body.notes = notes;
    const { data } = await request('POST', '/todos', body);
    console.log(`Added: "${data.text}" [${data.category}] (${data.priority}) ID: ${data._id}`);
  },

  async 'complete-todo'(args) {
    const id = args[0];
    if (!id) { console.error('Usage: complete-todo <todo_id>'); process.exit(1); }
    await request('PUT', `/todos/${id}`, { completed: true });
    console.log(`Completed todo ${id}`);
  },

  async 'update-todo'(args) {
    const id = args[0];
    if (!id) { console.error('Usage: update-todo <todo_id> [--text <text>] [--priority <p>] [--category <c>]'); process.exit(1); }
    const body = {};
    const text = parseFlag(args, '--text');
    const pri = parseFlag(args, '--priority');
    const cat = parseFlag(args, '--category');
    const notes = parseFlag(args, '--notes');
    if (text) body.text = text;
    if (pri) body.priority = pri;
    if (cat) body.category = cat;
    if (notes) body.notes = notes;
    if (!Object.keys(body).length) { console.error('Nothing to update'); process.exit(1); }
    await request('PUT', `/todos/${id}`, body);
    console.log(`Updated todo ${id}`);
  },

  async 'create-session'(args) {
    const title = parseFlag(args, '--title') || args.join(' ');
    if (!title) { console.error('Usage: create-session --title <title> [--todo-id <id>]'); process.exit(1); }
    const body = { title };
    if (DEFAULT_SPACE_ID) body.space_id = DEFAULT_SPACE_ID;
    const todoId = parseFlag(args, '--todo-id');
    if (todoId) body.todo_id = todoId;
    body.message_role = 'assistant';
    const { data } = await request('POST', '/agent/sessions', body);
    console.log(`Created session ${data.session_id}`);
  },

  async 'list-sessions'() {
    const params = DEFAULT_SPACE_ID ? `?space_id=${DEFAULT_SPACE_ID}` : '';
    const { data } = await request('GET', `/agent/sessions${params}`);
    for (const s of data || []) {
      const todo = s.todo_id ? ` [Todo: ${s.todo_id}]` : '';
      console.log(`${s._id} | ${s.title}${todo}`);
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

// --- Arg parsing helpers ---

function parseFlag(args, flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

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
