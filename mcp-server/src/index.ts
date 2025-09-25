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

class TodolistMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'todolist-mcp-server',
        version: '1.0.0',
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
          {
            name: 'add_todo',
            description: 'Add a new todo item',
            inputSchema: {
              type: 'object',
              properties: {
                text: {
                  type: 'string',
                  description: 'The todo item text',
                },
                space_id: {
                  type: 'string',
                  description: 'Optional space ID (uses default if not provided)',
                },
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
                space_id: {
                  type: 'string',
                  description: 'Optional space ID (uses default if not provided)',
                },
                completed: {
                  type: 'boolean',
                  description: 'Filter by completion status (optional)',
                },
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
                id: {
                  type: 'string',
                  description: 'Todo ID',
                },
                text: {
                  type: 'string',
                  description: 'New todo text (optional)',
                },
                completed: {
                  type: 'boolean',
                  description: 'Completion status (optional)',
                },
                category: {
                  type: 'string',
                  description: 'Todo category (optional)',
                },
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
                id: {
                  type: 'string',
                  description: 'Todo ID',
                },
              },
              required: ['id'],
            },
          },
          {
            name: 'list_spaces',
            description: 'List all accessible spaces',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'create_space',
            description: 'Create a new space',
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Space name',
                },
              },
              required: ['name'],
            },
          },
          {
            name: 'list_categories',
            description: 'List categories for a space',
            inputSchema: {
              type: 'object',
              properties: {
                space_id: {
                  type: 'string',
                  description: 'Optional space ID (uses default if not provided)',
                },
              },
              required: [],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case 'add_todo':
            return await this.addTodo(args as { text: string; space_id?: string });

          case 'list_todos':
            return await this.listTodos(args as { space_id?: string; completed?: boolean });

          case 'update_todo':
            return await this.updateTodo(args as {
              id: string;
              text?: string;
              completed?: boolean;
              category?: string;
            });

          case 'delete_todo':
            return await this.deleteTodo(args as { id: string });

          case 'list_spaces':
            return await this.listSpaces();

          case 'create_space':
            return await this.createSpace(args as { name: string });

          case 'list_categories':
            return await this.listCategories(args as { space_id?: string });

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${errorMessage}`
        );
      }
    });
  }

  private async addTodo(args: { text: string; space_id?: string }) {
    try {
      const spaceId = args.space_id || DEFAULT_SPACE_ID;
      const response = await api.post('/todos', {
        text: args.text,
        space_id: spaceId,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully added todo: "${args.text}"`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to add todo: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async listTodos(args: { space_id?: string; completed?: boolean }) {
    try {
      const spaceId = args.space_id || DEFAULT_SPACE_ID;
      const params: any = {};
      if (spaceId) params.space_id = spaceId;

      const response = await api.get('/todos', { params });
      let todos = response.data;

      // Filter by completion status if specified
      if (args.completed !== undefined) {
        todos = todos.filter((todo: any) => todo.completed === args.completed);
      }

      const todoText = todos.length === 0
        ? 'No todos found'
        : todos.map((todo: any, index: number) =>
            `${index + 1}. ${todo.completed ? '✅' : '⭕'} ${todo.text} [${todo.category || 'No category'}] (ID: ${todo._id})`
          ).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: todoText,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list todos: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async updateTodo(args: { id: string; text?: string; completed?: boolean; category?: string }) {
    try {
      const updateData: any = {};
      if (args.text !== undefined) updateData.text = args.text;
      if (args.completed !== undefined) updateData.completed = args.completed;
      if (args.category !== undefined) updateData.category = args.category;

      await api.put(`/todos/${args.id}`, updateData);

      const changes = [];
      if (args.text) changes.push(`text to "${args.text}"`);
      if (args.completed !== undefined) changes.push(`status to ${args.completed ? 'completed' : 'pending'}`);
      if (args.category) changes.push(`category to "${args.category}"`);

      return {
        content: [
          {
            type: 'text',
            text: `Successfully updated todo: ${changes.join(', ')}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to update todo: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async deleteTodo(args: { id: string }) {
    try {
      await api.delete(`/todos/${args.id}`);

      return {
        content: [
          {
            type: 'text',
            text: `Successfully deleted todo with ID: ${args.id}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to delete todo: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async listSpaces() {
    try {
      const response = await api.get('/spaces');
      const spaces = response.data;

      if (spaces.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No spaces found',
            },
          ],
        };
      }

      const spaceText = spaces.map((space: any, index: number) =>
        `${index + 1}. ${space.name} ${space.is_default ? '(Default)' : ''} (ID: ${space._id})`
      ).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Available spaces:\n${spaceText}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list spaces: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async createSpace(args: { name: string }) {
    try {
      const response = await api.post('/spaces', { name: args.name });
      const space = response.data;

      return {
        content: [
          {
            type: 'text',
            text: `Successfully created space: "${args.name}" (ID: ${space._id})`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create space: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async listCategories(args: { space_id?: string }) {
    try {
      const spaceId = args.space_id || DEFAULT_SPACE_ID;
      const params: any = {};
      if (spaceId) params.space_id = spaceId;

      const response = await api.get('/categories', { params });
      const categories = response.data;

      if (categories.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No categories found',
            },
          ],
        };
      }

      const categoryText = categories.map((category: any, index: number) =>
        `${index + 1}. ${category.name}`
      ).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Available categories:\n${categoryText}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list categories: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Todolist MCP server running on stdio');
  }
}

const server = new TodolistMCPServer();
server.run().catch(console.error);
