// Minimal Memory MCP server (Task/Journal)
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";
import cuid from "cuid";

// Task and Journal types
interface Task {
  id: string;
  title: string;
  category?: string;
  priority?: "low" | "med" | "high";
  due_at?: string | null;
  done: boolean;
  created_at: string;
  updated_at: string;
}

interface Journal {
  id: string;
  markdown: string;
  tags?: string[];
  created_at: string;
}

// In-memory storage
const db = {
  tasks: new Map<string, Task>(),
  journal: new Map<string, Journal>(),
};

// Schemas
const AddTask = z.object({
  title: z.string().min(1),
  category: z.string().optional(),
  priority: z.enum(["low", "med", "high"]).optional(),
  due_at: z.string().datetime().optional(),
});

const UpdateTask = z.object({
  id: z.string(),
  patch: z.object({
    title: z.string().optional(),
    category: z.string().optional(),
    priority: z.enum(["low", "med", "high"]).optional(),
    due_at: z.string().datetime().nullable().optional(),
    done: z.boolean().optional(),
  }),
});

const AddJournal = z.object({
  markdown: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

const Search = z.object({
  query: z.string().min(1),
  types: z.array(z.enum(["task", "journal"])).optional(),
  limit: z.number().int().positive().max(50).default(8),
});

export async function startMemoryServerOverStdio() {
  const server = new Server({
    name: "memory",
    version: "0.1.0",
  });

  server.tool("mem.task.add", {
    description: "Create a task in the user's todo list",
    inputSchema: AddTask,
    handler: async (args) => {
      const now = new Date().toISOString();
      const t: Task = {
        id: cuid(),
        title: args.title,
        category: args.category,
        priority: args.priority ?? "med",
        due_at: args.due_at ?? null,
        done: false,
        created_at: now,
        updated_at: now,
      };
      db.tasks.set(t.id, t);
      return { ok: true, id: t.id, task: t };
    },
  });

  server.tool("mem.task.update", {
    description: "Patch an existing task",
    inputSchema: UpdateTask,
    handler: async ({ id, patch }) => {
      const t = db.tasks.get(id);
      if (!t) throw new Error("Task not found");
      const updated = { ...t, ...patch, updated_at: new Date().toISOString() };
      db.tasks.set(id, updated);
      return { ok: true, task: updated };
    },
  });

  server.tool("mem.journal.add", {
    description: "Append a journal entry",
    inputSchema: AddJournal,
    handler: async ({ markdown, tags }) => {
      const j: Journal = {
        id: cuid(),
        markdown,
        tags,
        created_at: new Date().toISOString(),
      };
      db.journal.set(j.id, j);
      return { ok: true, id: j.id, journal: j };
    },
  });

  server.tool("mem.search", {
    description: "Hybrid-ish search over tasks and journal (very simple demo)",
    inputSchema: Search,
    handler: async ({ query, types, limit }) => {
      const q = query.toLowerCase();
      const hits: Array<{ type: "task" | "journal"; id: string; snippet: string }> = [];

      if (!types || types.includes("task")) {
        for (const t of db.tasks.values()) {
          if ((t.title + " " + (t.category ?? "")).toLowerCase().includes(q)) {
            hits.push({ type: "task", id: t.id, snippet: t.title });
          }
        }
      }
      if (!types || types.includes("journal")) {
        for (const j of db.journal.values()) {
          if (j.markdown.toLowerCase().includes(q)) {
            hits.push({ type: "journal", id: j.id, snippet: j.markdown.slice(0, 160) });
          }
        }
      }
      return { results: hits.slice(0, limit) };
    },
  });

  await server.startStdio();
}

// Start the server when this file is executed directly
startMemoryServerOverStdio();
