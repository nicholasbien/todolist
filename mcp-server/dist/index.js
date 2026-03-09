#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from '@modelcontextprotocol/sdk/types.js';
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
let cachedDefaultSpaceId = null;
async function getDefaultSpaceId() {
    if (cachedDefaultSpaceId)
        return cachedDefaultSpaceId;
    try {
        const response = await api.get('/spaces');
        const spaces = response.data;
        const defaultSpace = spaces.find((s) => s.is_default);
        if (defaultSpace) {
            cachedDefaultSpaceId = defaultSpace._id;
        }
        else if (spaces.length > 0) {
            cachedDefaultSpaceId = spaces[0]._id;
        }
        return cachedDefaultSpaceId;
    }
    catch {
        return null;
    }
}
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
                    // --- Todo tools ---
                    {
                        name: 'add_todo',
                        description: 'Add a new todo item',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                text: { type: 'string', description: 'The todo item text' },
                                space_id: { type: 'string', description: 'Space ID (auto-detected if not provided)' },
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
                        description: 'Post a message to a session. Use agent_id to claim the session for future routing.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                session_id: { type: 'string', description: 'Session ID' },
                                content: { type: 'string', description: 'Message content' },
                                role: { type: 'string', enum: ['user', 'assistant'], description: 'Message role (default: assistant)' },
                                agent_id: { type: 'string', description: 'Agent ID to claim this session (optional). Followups will route back to this agent.' },
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
                    case 'add_todo': return await this.addTodo(args);
                    case 'list_todos': return await this.listTodos(args);
                    case 'update_todo': return await this.updateTodo(args);
                    case 'complete_todo': return await this.completeTodo(args);
                    case 'delete_todo': return await this.deleteTodo(args);
                    case 'list_spaces': return await this.listSpaces();
                    case 'create_space': return await this.createSpace(args);
                    case 'list_categories': return await this.listCategories(args);
                    case 'list_sessions': return await this.listSessions(args);
                    case 'create_session': return await this.createSession(args);
                    case 'get_session': return await this.getSession(args);
                    case 'get_pending_sessions': return await this.getPendingSessions(args);
                    case 'post_to_session': return await this.postToSession(args);
                    case 'delete_session': return await this.deleteSession(args);
                    case 'get_journal': return await this.getJournal(args);
                    case 'write_journal': return await this.writeJournal(args);
                    case 'get_insights': return await this.getInsights(args);
                    case 'export_data': return await this.exportData(args);
                    default:
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
                }
            }
            catch (error) {
                if (error instanceof McpError)
                    throw error;
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${errorMessage}`);
            }
        });
    }
    // Helper to resolve space ID
    async resolveSpaceId(spaceId) {
        if (spaceId)
            return spaceId;
        const defaultId = await getDefaultSpaceId();
        return defaultId || undefined;
    }
    textResult(text) {
        return { content: [{ type: 'text', text }] };
    }
    jsonResult(data) {
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
    // --- Todo tools ---
    async addTodo(args) {
        const spaceId = await this.resolveSpaceId(args.space_id);
        const response = await api.post('/todos', { text: args.text, space_id: spaceId });
        const todo = response.data;
        return this.textResult(`Added todo: "${todo.text}" (ID: ${todo._id}, Category: ${todo.category})`);
    }
    async listTodos(args) {
        const spaceId = await this.resolveSpaceId(args.space_id);
        const params = {};
        if (spaceId)
            params.space_id = spaceId;
        const response = await api.get('/todos', { params });
        let todos = response.data;
        if (args.completed !== undefined) {
            todos = todos.filter((t) => t.completed === args.completed);
        }
        if (todos.length === 0)
            return this.textResult('No todos found');
        const lines = todos.map((t, i) => `${i + 1}. ${t.completed ? '[done]' : '[  ]'} ${t.text} [${t.category || 'General'}] (ID: ${t._id})`);
        return this.textResult(lines.join('\n'));
    }
    async updateTodo(args) {
        const updateData = {};
        if (args.text !== undefined)
            updateData.text = args.text;
        if (args.completed !== undefined)
            updateData.completed = args.completed;
        if (args.category !== undefined)
            updateData.category = args.category;
        await api.put(`/todos/${args.id}`, updateData);
        const changes = [];
        if (args.text)
            changes.push(`text to "${args.text}"`);
        if (args.completed !== undefined)
            changes.push(`status to ${args.completed ? 'completed' : 'pending'}`);
        if (args.category)
            changes.push(`category to "${args.category}"`);
        return this.textResult(`Updated todo: ${changes.join(', ')}`);
    }
    async completeTodo(args) {
        const response = await api.put(`/todos/${args.id}/complete`);
        return this.textResult(response.data.message || 'Todo completion toggled');
    }
    async deleteTodo(args) {
        await api.delete(`/todos/${args.id}`);
        return this.textResult(`Deleted todo ${args.id}`);
    }
    // --- Space tools ---
    async listSpaces() {
        const response = await api.get('/spaces');
        const spaces = response.data;
        if (spaces.length === 0)
            return this.textResult('No spaces found');
        const lines = spaces.map((s, i) => `${i + 1}. ${s.name} ${s.is_default ? '(Default)' : ''} (ID: ${s._id})`);
        return this.textResult(`Available spaces:\n${lines.join('\n')}`);
    }
    async createSpace(args) {
        const response = await api.post('/spaces', { name: args.name });
        return this.textResult(`Created space: "${args.name}" (ID: ${response.data._id})`);
    }
    // --- Category tools ---
    async listCategories(args) {
        const spaceId = await this.resolveSpaceId(args.space_id);
        const params = {};
        if (spaceId)
            params.space_id = spaceId;
        const response = await api.get('/categories', { params });
        const categories = response.data;
        if (categories.length === 0)
            return this.textResult('No categories found');
        return this.textResult(`Categories: ${categories.join(', ')}`);
    }
    // --- Session tools ---
    async listSessions(args) {
        const spaceId = await this.resolveSpaceId(args.space_id);
        const params = {};
        if (spaceId)
            params.space_id = spaceId;
        const response = await api.get('/agent/sessions', { params });
        const sessions = response.data;
        if (sessions.length === 0)
            return this.textResult('No sessions found');
        const lines = sessions.map((s, i) => `${i + 1}. "${s.title}" (ID: ${s._id}, updated: ${s.updated_at}${s.todo_id ? ', todo: ' + s.todo_id : ''})`);
        return this.textResult(lines.join('\n'));
    }
    async createSession(args) {
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
    async getSession(args) {
        const response = await api.get(`/agent/sessions/${args.session_id}`);
        return this.jsonResult(response.data);
    }
    async getPendingSessions(args) {
        const spaceId = await this.resolveSpaceId(args.space_id);
        const params = {};
        if (spaceId)
            params.space_id = spaceId;
        if (args.agent_id)
            params.agent_id = args.agent_id;
        const response = await api.get('/agent/sessions/pending', { params });
        const sessions = response.data;
        if (sessions.length === 0)
            return this.textResult('No pending sessions');
        const lines = sessions.map((s) => {
            const todoInfo = s.todo_id ? ` (todo: ${s.todo_id})` : '';
            const agentInfo = s.agent_id ? ` [agent: ${s.agent_id}]` : '';
            return `- "${s.title}" (ID: ${s._id})${todoInfo}${agentInfo}`;
        });
        return this.textResult(`Pending sessions:\n${lines.join('\n')}`);
    }
    async postToSession(args) {
        await api.post(`/agent/sessions/${args.session_id}/messages`, {
            role: args.role || 'assistant',
            content: args.content,
            ...(args.agent_id && { agent_id: args.agent_id }),
        });
        return this.textResult(`Posted ${args.role || 'assistant'} message to session ${args.session_id}`);
    }
    async deleteSession(args) {
        await api.delete(`/agent/sessions/${args.session_id}`);
        return this.textResult(`Deleted session ${args.session_id}`);
    }
    // --- Journal tools ---
    async getJournal(args) {
        const spaceId = await this.resolveSpaceId(args.space_id);
        const params = {};
        if (spaceId)
            params.space_id = spaceId;
        if (args.date)
            params.date = args.date;
        const response = await api.get('/journals', { params });
        const data = response.data;
        if (!data)
            return this.textResult('No journal entry found');
        if (Array.isArray(data)) {
            if (data.length === 0)
                return this.textResult('No journal entries found');
            const lines = data.map((e) => `[${e.date}] ${e.text?.substring(0, 100)}${e.text?.length > 100 ? '...' : ''}`);
            return this.textResult(lines.join('\n'));
        }
        return this.textResult(`[${data.date}]\n${data.text}`);
    }
    async writeJournal(args) {
        const spaceId = await this.resolveSpaceId(args.space_id);
        await api.post('/journals', {
            date: args.date,
            text: args.text,
            space_id: spaceId,
        });
        return this.textResult(`Journal entry saved for ${args.date}`);
    }
    // --- Utility tools ---
    async getInsights(args) {
        const spaceId = await this.resolveSpaceId(args.space_id);
        const params = {};
        if (spaceId)
            params.space_id = spaceId;
        const response = await api.get('/insights', { params });
        return this.jsonResult(response.data);
    }
    async exportData(args) {
        const spaceId = await this.resolveSpaceId(args.space_id);
        if (!spaceId)
            return this.textResult('No space found for export');
        const params = { data: args.data, space_id: spaceId, format: args.format || 'json' };
        const response = await api.get('/export', { params });
        return this.textResult(typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2));
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
