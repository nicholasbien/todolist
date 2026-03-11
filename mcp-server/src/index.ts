#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import { config } from 'dotenv';

// Load environment variables
config();

const API_URL = process.env.TODOLIST_API_URL || 'http://localhost:8000';
const AUTH_TOKEN = process.env.TODOLIST_AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error('TODOLIST_AUTH_TOKEN environment variable is required');
  process.exit(1);
}

// Create axios instance with authentication
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

// Cache for default space ID (auto-detected on first use)
let cachedDefaultSpaceId: string | null = null;

async function getDefaultSpaceId(): Promise<string | null> {
  if (cachedDefaultSpaceId) return cachedDefaultSpaceId;
  try {
    const response = await api.get('/spaces');
    const spaces = response.data;
    const defaultSpace = spaces.find((s: any) => s.is_default);
    if (defaultSpace) {
      cachedDefaultSpaceId = defaultSpace._id;
    } else if (spaces.length > 0) {
      cachedDefaultSpaceId = spaces[0]._id;
    }
    return cachedDefaultSpaceId;
  } catch {
    return null;
  }
}

class TodolistMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'todolist-mcp-server',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // --- Todo tools ---
          {
            name: 'add_todo',
            description: 'Add a new todo item. Pass parent_id to create a sub-task of an existing todo.',
            inputSchema: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'The todo item text' },
                space_id: { type: 'string', description: 'Space ID (auto-detected if not provided)' },
                parent_id: { type: 'string', description: 'Parent todo ID to create as a sub-task (optional). Sub-tasks execute in linear order.' },
              },
              required: ['text'],
            },
          },
          {
            name: 'list_todos',
            description: 'List all todos, optionally filtered by completion status',
            inputSchema: {
              type: 'object',
              properties: {
                space_id: { type: 'string', description: 'Space ID (auto-detected if not provided)' },
                completed: { type: 'boolean', description: 'Filter by completion status (optional)' },
              },
              required: [],
            },
          },
          {
            name: 'update_todo',
            description: 'Update a todo item',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Todo ID' },
                text: { type: 'string', description: 'New todo text (optional)' },
                completed: { type: 'boolean', description: 'Completion status (optional)' },
                category: { type: 'string', description: 'Todo category (optional)' },
              },
              required: ['id'],
            },
          },
          {
            name: 'complete_todo',
            description: 'Toggle a todo item completion status',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Todo ID' },
              },
              required: ['id'],
            },
          },
          {
            name: 'delete_todo',
            description: 'Delete a todo item',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Todo ID' },
              },
              required: ['id'],
            },
          },
          // --- Space tools ---
          {
            name: 'list_spaces',
            description: 'List all accessible spaces',
            inputSchema: { type: 'object', properties: {}, required: [] },
          },
          {
            name: 'create_space',
            description: 'Create a new space',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Space name' },
              },
              required: ['name'],
            },
          },
          // --- Category tools ---
          {
            name: 'list_categories',
            description: 'List categories for a space',
            inputSchema: {
              type: 'object',
              properties: {
                space_id: { type: 'string', description: 'Space ID (auto-detected if not provided)' },
              },
              required: [],
            },
          },
          // --- Session tools ---
          {
            name: 'list_sessions',
            description: 'List chat sessions',
            inputSchema: {
              type: 'object',
              properties: {
                space_id: { type: 'string', description: 'Space ID (auto-detected if not provided)' },
              },
              required: [],
            },
          },
          {
            name: 'create_session',
            description: 'Create a new messaging session, optionally linked to a todo',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Session title' },
                space_id: { type: 'string', description: 'Space ID (auto-detected if not provided)' },
                todo_id: { type: 'string', description: 'Link session to a todo (optional)' },
                initial_message: { type: 'string', description: 'Initial message to post (optional)' },
                initial_role: { type: 'string', enum: ['user', 'assistant'], description: 'Role of initial message (default: user)' },
                agent_id: { type: 'string', description: 'Agent ID to claim this session at creation (optional)' },
              },
              required: ['title'],
            },
          },
          {
            name: 'get_session',
            description: 'Get a session with its messages',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'Session ID' },
              },
              required: ['session_id'],
            },
          },
          {
            name: 'get_pending_sessions',
            description: 'Get sessions that are waiting for an agent response. Use agent_id to include sessions claimed by that agent alongside unclaimed ones.',
            inputSchema: {
              type: 'object',
              properties: {
                space_id: { type: 'string', description: 'Space ID (auto-detected if not provided)' },
                agent_id: { type: 'string', description: 'Agent ID to filter by. Returns claimed + unclaimed sessions. Omit for unclaimed only.' },
              },
              required: [],
            },
          },
          {
            name: 'post_to_session',
            description: 'Post a message to a session. Use agent_id to claim the session for future routing. Set interim=true for progress updates that should not clear the pending flag (e.g. "Working on this..."). The session stays in the pending queue so the final response can be posted later.',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'Session ID' },
                content: { type: 'string', description: 'Message content' },
                role: { type: 'string', enum: ['user', 'assistant'], description: 'Message role (default: assistant)' },
                agent_id: { type: 'string', description: 'Agent ID to claim this session (optional). Followups will route back to this agent.' },
                interim: { type: 'boolean', description: 'If true, post as a progress update without clearing the pending flag. Default: false.' },
              },
              required: ['session_id', 'content'],
            },
          },
          {
            name: 'delete_session',
            description: 'Delete a chat session',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: { type: 'string', description: 'Session ID' },
              },
              required: ['session_id'],
            },
          },
          // --- Journal tools ---
          {
            name: 'get_journal',
            description: 'Get journal entry for a specific date',
            inputSchema: {
              type: 'object',
              properties: {
                date: { type: 'string', description: 'Date in YYYY-MM-DD format (optional, gets recent if omitted)' },
                space_id: { type: 'string', description: 'Space ID (auto-detected if not provided)' },
              },
              required: [],
            },
          },
          {
            name: 'write_journal',
            description: 'Write or append to a journal entry',
            inputSchema: {
              type: 'object',
              properties: {
                date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
                text: { type: 'string', description: 'Journal text content' },
                space_id: { type: 'string', description: 'Space ID (auto-detected if not provided)' },
              },
              required: ['date', 'text'],
            },
          },
          // --- Utility tools ---
          {
            name: 'get_insights',
            description: 'Get insights and analytics for todos',
            inputSchema: {
              type: 'object',
              properties: {
                space_id: { type: 'string', description: 'Space ID (auto-detected if not provided)' },
              },
              required: [],
            },
          },
          {
            name: 'export_data',
            description: 'Export todos or journals as JSON or CSV',
            inputSchema: {
              type: 'object',
              properties: {
                data: { type: 'string', enum: ['todos', 'journals'], description: 'Data type to export' },
                format: { type: 'string', enum: ['json', 'csv'], description: 'Export format (default: json)' },
                space_id: { type: 'string', description: 'Space ID (auto-detected if not provided)' },
              },
              required: ['data'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case 'add_todo': return await this.addTodo(args as any);
          case 'list_todos': return await this.listTodos(args as any);
          case 'update_todo': return await this.updateTodo(args as any);
          case 'complete_todo': return await this.completeTodo(args as any);
          case 'delete_todo': return await this.deleteTodo(args as any);
          case 'list_spaces': return await this.listSpaces();
          case 'create_space': return await this.createSpace(args as any);
          case 'list_categories': return await this.listCategories(args as any);
          case 'list_sessions': return await this.listSessions(args as any);
          case 'create_session': return await this.createSession(args as any);
          case 'get_session': return await this.getSession(args as any);
          case 'get_pending_sessions': return await this.getPendingSessions(args as any);
          case 'post_to_session': return await this.postToSession(args as any);
          case 'delete_session': return await this.deleteSession(args as any);
          case 'get_journal': return await this.getJournal(args as any);
          case 'write_journal': return await this.writeJournal(args as any);
          case 'get_insights': return await this.getInsights(args as any);
          case 'export_data': return await this.exportData(args as any);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${errorMessage}`);
      }
    });
  }

  // Helper to resolve space ID
  private async resolveSpaceId(spaceId?: string): Promise<string | undefined> {
    if (spaceId) return spaceId;
    const defaultId = await getDefaultSpaceId();
    return defaultId || undefined;
  }

  private textResult(text: string) {
    return { content: [{ type: 'text' as const, text }] };
  }

  private jsonResult(data: any) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  }

  // --- Todo tools ---

  private async addTodo(args: { text: string; space_id?: string; parent_id?: string }) {
    const spaceId = await this.resolveSpaceId(args.space_id);
    const body: any = { text: args.text, space_id: spaceId };
    if (args.parent_id) body.parent_id = args.parent_id;
    const response = await api.post('/todos', body);
    const todo = response.data;
    const prefix = args.parent_id ? 'Added sub-task' : 'Added todo';
    return this.textResult(`${prefix}: "${todo.text}" (ID: ${todo._id}, Category: ${todo.category})`);
  }

  private async listTodos(args: { space_id?: string; completed?: boolean }) {
    const spaceId = await this.resolveSpaceId(args.space_id);
    const params: any = {};
    if (spaceId) params.space_id = spaceId;
    const response = await api.get('/todos', { params });
    let todos = response.data;
    if (args.completed !== undefined) {
      todos = todos.filter((t: any) => t.completed === args.completed);
    }
    if (todos.length === 0) return this.textResult('No todos found');
    // Group: top-level first, then sub-tasks indented under parents
    const parents = todos.filter((t: any) => !t.parent_id);
    const childrenMap = new Map<string, any[]>();
    for (const t of todos) {
      if (t.parent_id) {
        const list = childrenMap.get(t.parent_id) || [];
        list.push(t);
        childrenMap.set(t.parent_id, list);
      }
    }
    // Sort children by their position in the parent's subtask_ids array
    childrenMap.forEach((children, parentId) => {
      const parent = todos.find((t: any) => t._id === parentId);
      const subtaskIds: string[] = parent?.subtask_ids || [];
      children.sort((a: any, b: any) => {
        const aIdx = subtaskIds.indexOf(a._id);
        const bIdx = subtaskIds.indexOf(b._id);
        return (aIdx === -1 ? Infinity : aIdx) - (bIdx === -1 ? Infinity : bIdx);
      });
    });
    const lines: string[] = [];
    let i = 1;
    for (const t of parents) {
      const subtasks = childrenMap.get(t._id) || [];
      const subtaskInfo = subtasks.length > 0 ? ` [${subtasks.filter(s => s.completed).length}/${subtasks.length} sub-tasks]` : '';
      lines.push(`${i++}. ${t.completed ? '[done]' : '[  ]'} ${t.text} [${t.category || 'General'}] (ID: ${t._id})${subtaskInfo}`);
      for (const c of subtasks) {
        lines.push(`   └─ ${c.completed ? '[done]' : '[  ]'} ${c.text} (ID: ${c._id})`);
      }
    }
    return this.textResult(lines.join('\n'));
  }

  private async updateTodo(args: { id: string; text?: string; completed?: boolean; category?: string }) {
    const updateData: any = {};
    if (args.text !== undefined) updateData.text = args.text;
    if (args.completed !== undefined) updateData.completed = args.completed;
    if (args.category !== undefined) updateData.category = args.category;
    await api.put(`/todos/${args.id}`, updateData);
    const changes = [];
    if (args.text) changes.push(`text to "${args.text}"`);
    if (args.completed !== undefined) changes.push(`status to ${args.completed ? 'completed' : 'pending'}`);
    if (args.category) changes.push(`category to "${args.category}"`);
    return this.textResult(`Updated todo: ${changes.join(', ')}`);
  }

  private async completeTodo(args: { id: string }) {
    const response = await api.put(`/todos/${args.id}/complete`);
    return this.textResult(response.data.message || 'Todo completion toggled');
  }

  private async deleteTodo(args: { id: string }) {
    await api.delete(`/todos/${args.id}`);
    return this.textResult(`Deleted todo ${args.id}`);
  }

  // --- Space tools ---

  private async listSpaces() {
    const response = await api.get('/spaces');
    const spaces = response.data;
    if (spaces.length === 0) return this.textResult('No spaces found');
    const lines = spaces.map((s: any, i: number) =>
      `${i + 1}. ${s.name} ${s.is_default ? '(Default)' : ''} (ID: ${s._id})`
    );
    return this.textResult(`Available spaces:\n${lines.join('\n')}`);
  }

  private async createSpace(args: { name: string }) {
    const response = await api.post('/spaces', { name: args.name });
    return this.textResult(`Created space: "${args.name}" (ID: ${response.data._id})`);
  }

  // --- Category tools ---

  private async listCategories(args: { space_id?: string }) {
    const spaceId = await this.resolveSpaceId(args.space_id);
    const params: any = {};
    if (spaceId) params.space_id = spaceId;
    const response = await api.get('/categories', { params });
    const categories = response.data;
    if (categories.length === 0) return this.textResult('No categories found');
    return this.textResult(`Categories: ${categories.join(', ')}`);
  }

  // --- Session tools ---

  private async listSessions(args: { space_id?: string }) {
    const spaceId = await this.resolveSpaceId(args.space_id);
    const params: any = {};
    if (spaceId) params.space_id = spaceId;
    const response = await api.get('/agent/sessions', { params });
    const sessions = response.data;
    if (sessions.length === 0) return this.textResult('No sessions found');
    const lines = sessions.map((s: any, i: number) =>
      `${i + 1}. "${s.title}" (ID: ${s._id}, updated: ${s.updated_at}${s.todo_id ? ', todo: ' + s.todo_id : ''})`
    );
    return this.textResult(lines.join('\n'));
  }

  private async createSession(args: { title: string; space_id?: string; todo_id?: string; initial_message?: string; initial_role?: string; agent_id?: string }) {
    const spaceId = await this.resolveSpaceId(args.space_id);
    const response = await api.post('/agent/sessions', {
      title: args.title,
      space_id: spaceId,
      todo_id: args.todo_id,
      initial_message: args.initial_message,
      initial_role: args.initial_role || 'user',
      ...(args.agent_id && { agent_id: args.agent_id }),
    });
    const session = response.data;
    return this.textResult(`Created session: "${args.title}" (ID: ${session._id})`);
  }

  private async getSession(args: { session_id: string }) {
    const response = await api.get(`/agent/sessions/${args.session_id}`);
    return this.jsonResult(response.data);
  }

  private async getPendingSessions(args: { space_id?: string; agent_id?: string }) {
    const spaceId = await this.resolveSpaceId(args.space_id);
    const params: any = {};
    if (spaceId) params.space_id = spaceId;
    if (args.agent_id) params.agent_id = args.agent_id;
    const response = await api.get('/agent/sessions/pending', { params });
    const sessions = response.data;
    if (sessions.length === 0) return this.textResult('No pending sessions');
    const lines = sessions.map((s: any) => {
      const todoInfo = s.todo_id ? ` (todo: ${s.todo_id})` : '';
      const agentInfo = s.agent_id ? ` [agent: ${s.agent_id}]` : '';
      const followup = s.is_followup ? ' **FOLLOW-UP**' : '';
      const msgCount = s.message_count !== undefined ? ` [${s.message_count} msgs]` : '';
      const recentMsgs = s.recent_messages && s.recent_messages.length > 0
        ? '\n  Recent messages:\n' + s.recent_messages.map((m: string) => `    - "${m}"`).join('\n')
        : '';
      return `- "${s.title}" (ID: ${s._id})${todoInfo}${agentInfo}${followup}${msgCount}${recentMsgs}`;
    });
    return this.textResult(`Pending sessions:\n${lines.join('\n')}`);
  }

  private async postToSession(args: { session_id: string; content: string; role?: string; agent_id?: string; interim?: boolean }) {
    await api.post(`/agent/sessions/${args.session_id}/messages`, {
      role: args.role || 'assistant',
      content: args.content,
      ...(args.agent_id && { agent_id: args.agent_id }),
      ...(args.interim !== undefined && { interim: args.interim }),
    });
    return this.textResult(`Posted ${args.role || 'assistant'} message to session ${args.session_id}`);
  }

  private async deleteSession(args: { session_id: string }) {
    await api.delete(`/agent/sessions/${args.session_id}`);
    return this.textResult(`Deleted session ${args.session_id}`);
  }

  // --- Journal tools ---

  private async getJournal(args: { date?: string; space_id?: string }) {
    const spaceId = await this.resolveSpaceId(args.space_id);
    const params: any = {};
    if (spaceId) params.space_id = spaceId;
    if (args.date) params.date = args.date;
    const response = await api.get('/journals', { params });
    const data = response.data;
    if (!data) return this.textResult('No journal entry found');
    if (Array.isArray(data)) {
      if (data.length === 0) return this.textResult('No journal entries found');
      const lines = data.map((e: any) => `[${e.date}] ${e.text?.substring(0, 100)}${e.text?.length > 100 ? '...' : ''}`);
      return this.textResult(lines.join('\n'));
    }
    return this.textResult(`[${data.date}]\n${data.text}`);
  }

  private async writeJournal(args: { date: string; text: string; space_id?: string }) {
    const spaceId = await this.resolveSpaceId(args.space_id);
    await api.post('/journals', {
      date: args.date,
      text: args.text,
      space_id: spaceId,
    });
    return this.textResult(`Journal entry saved for ${args.date}`);
  }

  // --- Utility tools ---

  private async getInsights(args: { space_id?: string }) {
    const spaceId = await this.resolveSpaceId(args.space_id);
    const params: any = {};
    if (spaceId) params.space_id = spaceId;
    const response = await api.get('/insights', { params });
    return this.jsonResult(response.data);
  }

  private async exportData(args: { data: string; format?: string; space_id?: string }) {
    const spaceId = await this.resolveSpaceId(args.space_id);
    if (!spaceId) return this.textResult('No space found for export');
    const params: any = { data: args.data, space_id: spaceId, format: args.format || 'json' };
    const response = await api.get('/export', { params });
    return this.textResult(typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2));
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Todolist MCP server running on stdio');
  }
}

const server = new TodolistMCPServer();
server.run().catch(console.error);
