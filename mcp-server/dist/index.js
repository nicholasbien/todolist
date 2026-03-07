#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import { config } from 'dotenv';
config();
const API_URL = process.env.TODOLIST_API_URL || 'http://localhost:8000';
const AUTH_TOKEN = process.env.TODOLIST_AUTH_TOKEN;
const DEFAULT_SPACE_ID = process.env.DEFAULT_SPACE_ID || '';
if (!AUTH_TOKEN) {
    console.error('TODOLIST_AUTH_TOKEN environment variable is required');
    process.exit(1);
}
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
    },
});
class TodolistMCPServer {
    server;
    constructor() {
        this.server = new Server({
            name: 'todolist-mcp-server',
            version: '2.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupToolHandlers();
        this.setupErrorHandling();
    }
    setupErrorHandling() {
        this.server.onerror = (error) => {
            console.error('[MCP Error]', error);
        };
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }
    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    // ── Todos ──
                    {
                        name: 'list_todos',
                        description: 'List all todos, optionally filtered by completion status',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                space_id: { type: 'string', description: 'Space ID (uses default if not provided)' },
                                completed: { type: 'boolean', description: 'Filter by completion status' },
                            },
                        },
                    },
                    {
                        name: 'add_todo',
                        description: 'Add a new todo item. The backend auto-classifies category/priority/due date from the text.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                text: { type: 'string', description: 'The todo item text' },
                                space_id: { type: 'string', description: 'Space ID (uses default if not provided)' },
                                category: { type: 'string', description: 'Category (optional, auto-classified if omitted)' },
                                priority: { type: 'string', enum: ['High', 'Medium', 'Low'], description: 'Priority level' },
                                dueDate: { type: 'string', description: 'Due date in ISO format' },
                                notes: { type: 'string', description: 'Additional notes' },
                            },
                            required: ['text'],
                        },
                    },
                    {
                        name: 'update_todo',
                        description: 'Update fields on a todo item (text, notes, category, priority, dueDate, space_id)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', description: 'Todo ID' },
                                text: { type: 'string', description: 'New text' },
                                notes: { type: 'string', description: 'New notes' },
                                category: { type: 'string', description: 'New category' },
                                priority: { type: 'string', enum: ['High', 'Medium', 'Low'], description: 'New priority' },
                                dueDate: { type: 'string', description: 'New due date in ISO format' },
                                space_id: { type: 'string', description: 'Move todo to a different space' },
                            },
                            required: ['id'],
                        },
                    },
                    {
                        name: 'complete_todo',
                        description: 'Toggle a todo\'s completion status (complete <-> incomplete)',
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
                    {
                        name: 'reorder_todos',
                        description: 'Reorder todos by providing an ordered list of todo IDs',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                todoIds: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Ordered array of todo IDs',
                                },
                            },
                            required: ['todoIds'],
                        },
                    },
                    // ── Spaces ──
                    {
                        name: 'list_spaces',
                        description: 'List all spaces the user has access to',
                        inputSchema: { type: 'object', properties: {} },
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
                    {
                        name: 'update_space',
                        description: 'Update a space (rename or toggle collaborative mode)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                space_id: { type: 'string', description: 'Space ID' },
                                name: { type: 'string', description: 'New name' },
                                collaborative: { type: 'boolean', description: 'Whether the space is collaborative' },
                            },
                            required: ['space_id'],
                        },
                    },
                    {
                        name: 'delete_space',
                        description: 'Delete a space and all its todos/categories (owner only)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                space_id: { type: 'string', description: 'Space ID' },
                            },
                            required: ['space_id'],
                        },
                    },
                    {
                        name: 'list_space_members',
                        description: 'List members of a space',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                space_id: { type: 'string', description: 'Space ID' },
                            },
                            required: ['space_id'],
                        },
                    },
                    {
                        name: 'invite_to_space',
                        description: 'Invite users to a space by email (owner only)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                space_id: { type: 'string', description: 'Space ID' },
                                emails: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Email addresses to invite',
                                },
                            },
                            required: ['space_id', 'emails'],
                        },
                    },
                    {
                        name: 'leave_space',
                        description: 'Leave a space (non-owners only)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                space_id: { type: 'string', description: 'Space ID' },
                            },
                            required: ['space_id'],
                        },
                    },
                    // ── Categories ──
                    {
                        name: 'list_categories',
                        description: 'List categories for a space',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                space_id: { type: 'string', description: 'Space ID (uses default if not provided)' },
                            },
                        },
                    },
                    {
                        name: 'add_category',
                        description: 'Add a new category to a space',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                name: { type: 'string', description: 'Category name' },
                                space_id: { type: 'string', description: 'Space ID (uses default if not provided)' },
                            },
                            required: ['name'],
                        },
                    },
                    {
                        name: 'rename_category',
                        description: 'Rename an existing category (updates all todos using it)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                name: { type: 'string', description: 'Current category name' },
                                new_name: { type: 'string', description: 'New category name' },
                                space_id: { type: 'string', description: 'Space ID' },
                            },
                            required: ['name', 'new_name'],
                        },
                    },
                    {
                        name: 'delete_category',
                        description: 'Delete a category (reassigns its todos to "General")',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                name: { type: 'string', description: 'Category name to delete' },
                                space_id: { type: 'string', description: 'Space ID' },
                            },
                            required: ['name'],
                        },
                    },
                    // ── Journals ──
                    {
                        name: 'get_journal',
                        description: 'Get journal entry for a specific date, or list recent entries if no date provided',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                date: { type: 'string', description: 'Date in YYYY-MM-DD format (omit for recent entries)' },
                                space_id: { type: 'string', description: 'Space ID' },
                            },
                        },
                    },
                    {
                        name: 'write_journal',
                        description: 'Create or update a journal entry for a specific date',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
                                text: { type: 'string', description: 'Journal entry text' },
                                space_id: { type: 'string', description: 'Space ID' },
                            },
                            required: ['date', 'text'],
                        },
                    },
                    {
                        name: 'delete_journal',
                        description: 'Delete a journal entry by ID',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                entry_id: { type: 'string', description: 'Journal entry ID' },
                            },
                            required: ['entry_id'],
                        },
                    },
                    // ── Chat Sessions ──
                    {
                        name: 'list_sessions',
                        description: 'List chat sessions (task tracking threads). Returns session IDs, titles, and timestamps.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                space_id: { type: 'string', description: 'Space ID (omit for all spaces)' },
                            },
                        },
                    },
                    {
                        name: 'create_session',
                        description: 'Create a new chat session for tracking a task or project. Optionally include an initial status message.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                title: { type: 'string', description: 'Session title (e.g. task or project name)' },
                                space_id: { type: 'string', description: 'Space ID' },
                                message: { type: 'string', description: 'Optional initial message to post' },
                                todo_id: { type: 'string', description: 'Optional todo ID to link this session to a specific task' },
                            },
                            required: ['title'],
                        },
                    },
                    {
                        name: 'get_session',
                        description: 'Read all messages in a chat session (to see user responses and history)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                session_id: { type: 'string', description: 'Session ID' },
                            },
                            required: ['session_id'],
                        },
                    },
                    {
                        name: 'post_to_session',
                        description: 'Post a message to a chat session (status update, question, or deliverable)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                session_id: { type: 'string', description: 'Session ID' },
                                content: { type: 'string', description: 'Message content (supports markdown)' },
                                role: { type: 'string', enum: ['user', 'assistant'], description: 'Message role (default: assistant)' },
                            },
                            required: ['session_id', 'content'],
                        },
                    },
                    {
                        name: 'get_pending_sessions',
                        description: 'Get sessions with pending user messages awaiting agent response. Use this to poll for new messages from the user.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                space_id: { type: 'string', description: 'Space ID (omit for all spaces)' },
                            },
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
                    // ── Insights ──
                    {
                        name: 'get_insights',
                        description: 'Get analytics and insights about your todos (completion rates, category breakdown, etc.)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                space_id: { type: 'string', description: 'Space ID (omit for all spaces)' },
                            },
                        },
                    },
                    // ── Export ──
                    {
                        name: 'export_data',
                        description: 'Export todos or journal entries as JSON or CSV',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                data: { type: 'string', enum: ['todos', 'journals'], description: 'Type of data to export' },
                                space_id: { type: 'string', description: 'Space ID' },
                                format: { type: 'string', enum: ['json', 'csv'], description: 'Export format (default: csv)' },
                            },
                            required: ['data', 'space_id'],
                        },
                    },
                ],
            };
        });
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                switch (name) {
                    // Todos
                    case 'list_todos': return await this.listTodos(args);
                    case 'add_todo': return await this.addTodo(args);
                    case 'update_todo': return await this.updateTodo(args);
                    case 'complete_todo': return await this.completeTodo(args);
                    case 'delete_todo': return await this.deleteTodo(args);
                    case 'reorder_todos': return await this.reorderTodos(args);
                    // Spaces
                    case 'list_spaces': return await this.listSpaces();
                    case 'create_space': return await this.createSpace(args);
                    case 'update_space': return await this.updateSpace(args);
                    case 'delete_space': return await this.deleteSpace(args);
                    case 'list_space_members': return await this.listSpaceMembers(args);
                    case 'invite_to_space': return await this.inviteToSpace(args);
                    case 'leave_space': return await this.leaveSpace(args);
                    // Categories
                    case 'list_categories': return await this.listCategories(args);
                    case 'add_category': return await this.addCategory(args);
                    case 'rename_category': return await this.renameCategory(args);
                    case 'delete_category': return await this.deleteCategory(args);
                    // Journals
                    case 'get_journal': return await this.getJournal(args);
                    case 'write_journal': return await this.writeJournal(args);
                    case 'delete_journal': return await this.deleteJournal(args);
                    // Chat Sessions
                    case 'list_sessions': return await this.listSessions(args);
                    case 'create_session': return await this.createSession2(args);
                    case 'get_session': return await this.getSession(args);
                    case 'post_to_session': return await this.postToSession(args);
                    case 'get_pending_sessions': return await this.getPendingSessions(args);
                    case 'delete_session': return await this.deleteSession2(args);
                    // Insights & Export
                    case 'get_insights': return await this.getInsights(args);
                    case 'export_data': return await this.exportData(args);
                    default:
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
                }
            }
            catch (error) {
                if (error instanceof McpError)
                    throw error;
                const msg = error instanceof Error ? error.message : 'Unknown error';
                // Include axios response data if available
                const detail = error?.response?.data?.detail;
                throw new McpError(ErrorCode.InternalError, detail ? `${msg}: ${detail}` : msg);
            }
        });
    }
    text(content) {
        return { content: [{ type: 'text', text: content }] };
    }
    spaceId(args) {
        return args?.space_id || DEFAULT_SPACE_ID || undefined;
    }
    // ── Todos ──
    async listTodos(args) {
        const params = {};
        const sid = this.spaceId(args);
        if (sid)
            params.space_id = sid;
        const response = await api.get('/todos', { params });
        let todos = response.data;
        if (args?.completed !== undefined) {
            todos = todos.filter((t) => t.completed === args.completed);
        }
        if (todos.length === 0)
            return this.text('No todos found.');
        const lines = todos.map((t, i) => {
            const status = t.completed ? '[x]' : '[ ]';
            const priority = t.priority ? ` (${t.priority})` : '';
            const category = t.category ? ` [${t.category}]` : '';
            const due = t.dueDate ? ` due:${t.dueDate}` : '';
            const notes = t.notes ? `\n     Notes: ${t.notes}` : '';
            return `${i + 1}. ${status} ${t.text}${priority}${category}${due} (ID: ${t._id})${notes}`;
        });
        return this.text(lines.join('\n'));
    }
    async addTodo(args) {
        const body = { text: args.text };
        const sid = this.spaceId(args);
        if (sid)
            body.space_id = sid;
        if (args.category)
            body.category = args.category;
        if (args.priority)
            body.priority = args.priority;
        if (args.dueDate)
            body.dueDate = args.dueDate;
        if (args.notes)
            body.notes = args.notes;
        body.dateAdded = new Date().toISOString();
        const response = await api.post('/todos', body);
        const todo = response.data;
        return this.text(`Added todo: "${todo.text}" [${todo.category}] (${todo.priority}) (ID: ${todo._id})`);
    }
    async updateTodo(args) {
        const { id, ...fields } = args;
        const body = {};
        for (const key of ['text', 'notes', 'category', 'priority', 'dueDate', 'space_id']) {
            if (fields[key] !== undefined)
                body[key] = fields[key];
        }
        await api.put(`/todos/${id}`, body);
        const changes = Object.entries(body).map(([k, v]) => `${k}="${v}"`).join(', ');
        return this.text(`Updated todo ${id}: ${changes}`);
    }
    async completeTodo(args) {
        const response = await api.put(`/todos/${args.id}/complete`);
        return this.text(response.data.message || `Toggled completion for todo ${args.id}`);
    }
    async deleteTodo(args) {
        await api.delete(`/todos/${args.id}`);
        return this.text(`Deleted todo ${args.id}`);
    }
    async reorderTodos(args) {
        await api.put('/todos/reorder', { todoIds: args.todoIds });
        return this.text(`Reordered ${args.todoIds.length} todos`);
    }
    // ── Spaces ──
    async listSpaces() {
        const response = await api.get('/spaces');
        const spaces = response.data;
        if (spaces.length === 0)
            return this.text('No spaces found.');
        const lines = spaces.map((s, i) => {
            const flags = [
                s.is_default ? 'default' : '',
                s.collaborative ? 'collaborative' : '',
            ].filter(Boolean).join(', ');
            const suffix = flags ? ` (${flags})` : '';
            return `${i + 1}. ${s.name}${suffix} (ID: ${s._id})`;
        });
        return this.text(lines.join('\n'));
    }
    async createSpace(args) {
        const response = await api.post('/spaces', { name: args.name });
        return this.text(`Created space "${args.name}" (ID: ${response.data._id})`);
    }
    async updateSpace(args) {
        const body = {};
        if (args.name !== undefined)
            body.name = args.name;
        if (args.collaborative !== undefined)
            body.collaborative = args.collaborative;
        await api.put(`/spaces/${args.space_id}`, body);
        return this.text(`Updated space ${args.space_id}`);
    }
    async deleteSpace(args) {
        await api.delete(`/spaces/${args.space_id}`);
        return this.text(`Deleted space ${args.space_id}`);
    }
    async listSpaceMembers(args) {
        const response = await api.get(`/spaces/${args.space_id}/members`);
        const members = response.data;
        if (!Array.isArray(members) || members.length === 0)
            return this.text('No members found.');
        const lines = members.map((m, i) => {
            const role = m.role ? ` (${m.role})` : '';
            const name = m.first_name || m.email || 'Unknown';
            return `${i + 1}. ${name}${role}`;
        });
        return this.text(lines.join('\n'));
    }
    async inviteToSpace(args) {
        await api.post(`/spaces/${args.space_id}/invite`, { emails: args.emails });
        return this.text(`Invited ${args.emails.length} user(s) to space ${args.space_id}`);
    }
    async leaveSpace(args) {
        await api.post(`/spaces/${args.space_id}/leave`);
        return this.text(`Left space ${args.space_id}`);
    }
    // ── Categories ──
    async listCategories(args) {
        const params = {};
        const sid = this.spaceId(args);
        if (sid)
            params.space_id = sid;
        const response = await api.get('/categories', { params });
        const categories = response.data;
        if (categories.length === 0)
            return this.text('No categories found.');
        return this.text(categories.join(', '));
    }
    async addCategory(args) {
        const body = { name: args.name };
        const sid = this.spaceId(args);
        if (sid)
            body.space_id = sid;
        await api.post('/categories', body);
        return this.text(`Added category "${args.name}"`);
    }
    async renameCategory(args) {
        const params = {};
        const sid = this.spaceId(args);
        if (sid)
            params.space_id = sid;
        await api.put(`/categories/${encodeURIComponent(args.name)}`, { new_name: args.new_name }, { params });
        return this.text(`Renamed category "${args.name}" to "${args.new_name}"`);
    }
    async deleteCategory(args) {
        const params = {};
        const sid = this.spaceId(args);
        if (sid)
            params.space_id = sid;
        await api.delete(`/categories/${encodeURIComponent(args.name)}`, { params });
        return this.text(`Deleted category "${args.name}"`);
    }
    // ── Journals ──
    async getJournal(args) {
        const params = {};
        if (args?.date)
            params.date = args.date;
        const sid = this.spaceId(args);
        if (sid)
            params.space_id = sid;
        const response = await api.get('/journals', { params });
        const data = response.data;
        if (!data || (Array.isArray(data) && data.length === 0)) {
            return this.text(args?.date ? `No journal entry for ${args.date}.` : 'No journal entries found.');
        }
        if (Array.isArray(data)) {
            const lines = data.map((e) => `[${e.date}] ${e.text}`);
            return this.text(lines.join('\n\n'));
        }
        return this.text(`[${data.date}]\n${data.text}`);
    }
    async writeJournal(args) {
        const body = { date: args.date, text: args.text };
        const sid = this.spaceId(args);
        if (sid)
            body.space_id = sid;
        await api.post('/journals', body);
        return this.text(`Journal entry saved for ${args.date}`);
    }
    async deleteJournal(args) {
        await api.delete(`/journals/${args.entry_id}`);
        return this.text(`Deleted journal entry ${args.entry_id}`);
    }
    // ── Chat Sessions ──
    async listSessions(args) {
        const params = {};
        const sid = this.spaceId(args);
        if (sid)
            params.space_id = sid;
        const response = await api.get('/agent/sessions', { params });
        const sessions = response.data;
        if (sessions.length === 0)
            return this.text('No chat sessions found.');
        const lines = sessions.map((s, i) => {
            const date = s.updated_at ? new Date(s.updated_at).toLocaleDateString() : '';
            return `${i + 1}. ${s.title} (${date}) (ID: ${s._id})`;
        });
        return this.text(lines.join('\n'));
    }
    async createSession2(args) {
        const body = { title: args.title };
        const sid = this.spaceId(args);
        if (sid)
            body.space_id = sid;
        if (args.message) {
            body.message = args.message;
            body.message_role = 'assistant';
        }
        if (args.todo_id)
            body.todo_id = args.todo_id;
        const response = await api.post('/agent/sessions', body);
        return this.text(`Created session "${args.title}" (ID: ${response.data.session_id})`);
    }
    async getPendingSessions(args) {
        const params = {};
        const sid = this.spaceId(args);
        if (sid)
            params.space_id = sid;
        const response = await api.get('/agent/sessions/pending', { params });
        const pending = response.data;
        if (pending.length === 0)
            return this.text('No pending messages.');
        const lines = pending.map((s, i) => {
            const todoInfo = s.todo_id ? ` [Todo: ${s.todo_id}]` : '';
            return `${i + 1}. ${s.title}${todoInfo} (ID: ${s._id})\n   Message: ${s.last_message}`;
        });
        return this.text(lines.join('\n\n'));
    }
    async getSession(args) {
        const response = await api.get(`/agent/sessions/${args.session_id}`);
        const data = response.data;
        const messages = data.display_messages || [];
        if (messages.length === 0) {
            return this.text(`Session "${data.title}" — no messages yet.`);
        }
        const lines = messages.map((m) => {
            const prefix = m.role === 'user' ? 'USER' : 'AGENT';
            const ts = m.timestamp ? ` (${new Date(m.timestamp).toLocaleString()})` : '';
            return `[${prefix}${ts}]\n${m.content}`;
        });
        return this.text(`Session: ${data.title}\n\n${lines.join('\n\n---\n\n')}`);
    }
    async postToSession(args) {
        const body = {
            role: args.role || 'assistant',
            content: args.content,
        };
        await api.post(`/agent/sessions/${args.session_id}/messages`, body);
        return this.text(`Message posted to session ${args.session_id}`);
    }
    async deleteSession2(args) {
        await api.delete(`/agent/sessions/${args.session_id}`);
        return this.text(`Deleted session ${args.session_id}`);
    }
    // ── Insights ──
    async getInsights(args) {
        const params = {};
        const sid = this.spaceId(args);
        if (sid)
            params.space_id = sid;
        const response = await api.get('/insights', { params });
        return this.text(JSON.stringify(response.data, null, 2));
    }
    // ── Export ──
    async exportData(args) {
        const params = {
            data: args.data,
            space_id: args.space_id,
            format: args.format || 'csv',
        };
        const response = await api.get('/export', { params });
        return this.text(typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2));
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Todolist MCP server running on stdio');
    }
}
const server = new TodolistMCPServer();
server.run().catch(console.error);
//# sourceMappingURL=index.js.map
