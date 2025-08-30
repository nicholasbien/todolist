// Production Memory MCP server - Connected to real backend APIs
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Backend API configuration
const BACKEND_URL = process.env.NODE_ENV === 'production'
  ? 'https://backend-production-e920.up.railway.app'
  : 'http://localhost:8000';

// Get auth token from environment or headers (in production, this would be passed properly)
const getAuthToken = (): string | null => {
  return process.env.AUTH_TOKEN || null;
};

// Get current space ID (defaulting to user's default space)
const getCurrentSpaceId = (): string | null => {
  return process.env.CURRENT_SPACE_ID || null;
};

// API request helper
async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }

  return response.json();
}

// Task and Journal types matching backend models
interface Task {
  _id: string;
  text: string;
  category?: string;
  priority?: "low" | "med" | "high";
  dateAdded: string;
  completed: boolean;
  space_id?: string;
}

interface Journal {
  _id: string;
  date: string;
  content: string;
  space_id?: string;
}

// Using JSON Schema directly instead of Zod for MCP compatibility

export async function startMemoryServerOverStdio() {
  const server = new McpServer({
    name: "memory",
    version: "0.1.0",
  }, { capabilities: {} });

  const TaskAddSchema = z.object({
    text: z.string().min(1).describe("Task description"),
    category: z.string().optional().describe("Task category (optional)"),
    priority: z.enum(['low', 'med', 'high']).default('med').describe("Task priority"),
    space_id: z.string().optional().describe("Space ID for the task")
  });

  server.registerTool("mem.task.add", {
    description: "Create a task in the user's todo list",
    inputSchema: TaskAddSchema.shape
  }, async (args) => {
      const spaceId = args.space_id || getCurrentSpaceId();
      const payload = {
        text: args.text,
        category: args.category,
        priority: args.priority ?? "med",
        ...(spaceId && { space_id: spaceId }),
      };

      const result = await apiRequest('/todos', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      return { ok: true, id: result._id, task: result };
    });

  const TaskUpdateSchema = z.object({
    id: z.string().min(1).describe("Task ID to update"),
    completed: z.boolean().optional().describe("Mark as completed/incomplete"),
    text: z.string().optional().describe("New task text (optional)"),
    priority: z.enum(['low', 'med', 'high']).optional().describe("New priority (optional)")
  });

  server.registerTool("mem.task.update", {
    description: "Patch an existing task",
    inputSchema: TaskUpdateSchema.shape
  }, async ({ id, completed, text, priority }) => {
      const patch: any = {};
      if (completed !== undefined) patch.completed = completed;
      if (text !== undefined) patch.text = text;
      if (priority !== undefined) patch.priority = priority;

      const result = await apiRequest(`/todos/${id}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });

      return { ok: true, task: result };
    });

  const TaskListSchema = z.object({
    space_id: z.string().optional().describe("Space ID (optional)"),
    completed: z.boolean().optional().describe("Filter by completion status (optional)")
  });

  server.registerTool("mem.task.list", {
    description: "List all tasks in the current space",
    inputSchema: TaskListSchema.shape
  }, async ({ space_id, completed }) => {
      const spaceId = space_id || getCurrentSpaceId();
      const params = new URLSearchParams();
      if (spaceId) params.append('space_id', spaceId);
      if (completed !== undefined) params.append('completed', completed.toString());

      const result = await apiRequest(`/todos?${params.toString()}`);
      return { ok: true, tasks: result };
    });

  const JournalAddSchema = z.object({
    content: z.string().min(1).describe("Journal entry content"),
    date: z.string().optional().describe("Date in YYYY-MM-DD format (optional, defaults to today)")
  });

  server.registerTool("mem.journal.add", {
    description: "Create or update a journal entry for a specific date",
    inputSchema: JournalAddSchema.shape
  }, async ({ content, date, space_id }) => {
      const spaceId = space_id || getCurrentSpaceId();
      const entryDate = date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      const payload = {
        content,
        date: entryDate,
        ...(spaceId && { space_id: spaceId }),
      };

      const result = await apiRequest('/journals', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      return { ok: true, id: result._id, journal: result };
    });

  const SearchSchema = z.object({
    query: z.string().min(1).describe("Search query"),
    types: z.array(z.enum(['task', 'journal'])).optional().describe("Types to search (optional)"),
    limit: z.number().min(1).max(50).default(8).describe("Maximum results")
  });

  server.registerTool("mem.search", {
    description: "Search over tasks and journal entries",
    inputSchema: SearchSchema.shape
  }, async ({ query, types, limit, space_id }) => {
      const spaceId = space_id || getCurrentSpaceId();
      const hits: Array<{ type: "task" | "journal"; id: string; snippet: string }> = [];

      if (!types || types.includes("task")) {
        const params = new URLSearchParams();
        if (spaceId) params.append('space_id', spaceId);

        const todos = await apiRequest(`/todos?${params.toString()}`);
        for (const todo of todos) {
          if ((todo.text + " " + (todo.category ?? "")).toLowerCase().includes(query.toLowerCase())) {
            hits.push({ type: "task", id: todo._id, snippet: todo.text });
          }
        }
      }

      if (!types || types.includes("journal")) {
        // Note: This would need a search endpoint on the backend for full functionality
        // For now, we'll just return a placeholder
        hits.push({ type: "journal", id: "search-placeholder", snippet: `Journal search for "${query}" not fully implemented` });
      }

      return { results: hits.slice(0, limit) };
    });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Start the server when this file is executed directly
if (require.main === module) {
  startMemoryServerOverStdio();
}
