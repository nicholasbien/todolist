import { z } from "zod";
import { McpHub } from "./mcp-hub";

export type StreamChunk =
  | { type: "text"; token: string }
  | { type: "tool_call"; tool: string; args: any }
  | { type: "tool_result"; tool: string; data: any };

export interface Llm {
  stream(opts: {
    system: string;
    messages: { role: "user" | "assistant" | "tool"; content: string }[];
    toolsCatalog: { fq: string }[];
  }): AsyncGenerator<StreamChunk>;
}

const ToolCall = z.object({
  tool: z.string(),
  args: z.any(),
});

export async function* runAgent({
  llm,
  hub,
  userMessage,
}: {
  llm: Llm;
  hub: McpHub;
  userMessage: string;
}): AsyncGenerator<StreamChunk> {
  const system = [
    "You are an assistant that can call tools via MCP.",
    "Use tools only when they help.",
    'When you call a tool, emit a single JSON line: {"tool":"<server.tool>","args":{...}}',
    "Otherwise, just stream text.",
  ].join("\n");

  const toolsCatalog = hub.listAllTools();

  for await (const chunk of llm.stream({
    system,
    toolsCatalog,
    messages: [{ role: "user", content: userMessage }],
  })) {
    if (chunk.type === "text") {
      yield chunk;
      continue;
    }
    if (chunk.type === "tool_call") {
      const parsed = ToolCall.safeParse({ tool: chunk.tool, args: chunk.args });
      if (!parsed.success) continue;

      const res = await hub.call(parsed.data.tool, parsed.data.args);
      yield { type: "tool_result", tool: parsed.data.tool, data: res };
    }
  }
}
