import { createClient } from "@modelcontextprotocol/sdk/client/index.js";
import { stdio } from "@modelcontextprotocol/sdk/client/node/stdio.js";
import { websocket } from "@modelcontextprotocol/sdk/client/web/websocket.js";

type Conn = {
  name: string;
  client: ReturnType<typeof createClient>;
  allowed: Set<string>;
};

export class McpHub {
  #conns = new Map<string, Conn>();

  listAllTools() {
    return [...this.#conns.values()].flatMap((c) =>
      [...c.allowed].map((t) => ({ fq: `${c.name}.${t}` }))
    );
  }

  async addBuiltinMemory(name: string, command: string, args: string[], allowedTools?: string[]) {
    const transport = await stdio({ command, args, env: process.env });
    const client = createClient(transport);
    await client.initialize();
    const tools = await client.tools.list();
    const allowed = new Set(
      (allowedTools ?? tools.tools.map((t) => t.name)).filter((tool) =>
        tools.tools.some((tt) => tt.name === tool)
      )
    );
    this.#conns.set(name, { name, client, allowed });
  }

  async addWebsocketServer(name: string, url: string, allowedTools?: string[]) {
    const transport = await websocket({ url });
    const client = createClient(transport);
    await client.initialize();
    const tools = await client.tools.list();
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
    return conn.client.tools.call({ name: tool, arguments: args });
  }
}
