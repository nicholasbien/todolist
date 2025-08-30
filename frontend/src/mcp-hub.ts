import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";

type Conn = {
  name: string;
  client: Client;
  allowed: Set<string>;
};

export class McpHub {
  #conns = new Map<string, Conn>();

  listAllTools() {
    return [...this.#conns.values()].flatMap((c) =>
      [...c.allowed].map((t) => ({ fq: `${c.name}.${t}` }))
    );
  }

  async addBuiltinMemory(name: string, command: string, args: string[], allowedTools?: string[], env?: Record<string, string>) {
    const transport = new StdioClientTransport({ command, args, env: env || process.env });
    const client = new Client({ name: "mcp-hub", version: "1.0.0" }, {
      capabilities: {}
    });
    await client.connect(transport);
    const tools = await client.listTools();
    const allowed = new Set(
      (allowedTools ?? tools.tools.map((t) => t.name)).filter((tool) =>
        tools.tools.some((tt) => tt.name === tool)
      )
    );
    this.#conns.set(name, { name, client, allowed });
  }

  async addWebsocketServer(name: string, url: string, allowedTools?: string[]) {
    const transport = new WebSocketClientTransport(url);
    const client = new Client({ name: "mcp-hub", version: "1.0.0" }, {
      capabilities: {}
    });
    await client.connect(transport);
    const tools = await client.listTools();
    const allowed = new Set(
      (allowedTools ?? tools.tools.map((t) => t.name)).filter((tool) =>
        tools.tools.some((tt) => tt.name === tool)
      )
    );
    this.#conns.set(name, { name, client, allowed });
  }

  async call(fqTool: string, args: any) {
    const [ns, ...rest] = fqTool.split(".");
    const tool = rest.join(".");
    const conn = this.#conns.get(ns);
    if (!conn) throw new Error(`Unknown server: ${ns}`);
    if (!conn.allowed.has(tool)) throw new Error(`Tool not allowed: ${fqTool}`);
    return conn.client.callTool({ name: tool, arguments: args });
  }

  async dispose() {
    // Close all client connections and terminate child processes
    const closePromises = [...this.#conns.values()].map(async (conn) => {
      try {
        // Close the client connection, which should terminate the child process
        await conn.client.close();
      } catch (error) {
        console.error(`Error closing connection ${conn.name}:`, error);
      }
    });

    await Promise.all(closePromises);
    this.#conns.clear();
  }
}
