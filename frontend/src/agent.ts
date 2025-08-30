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

interface ToolCall {
  tool: string;
  args: any;
}

export async function* runAgent({
  llm,
  hub,
  userMessage,
}: {
  llm: Llm;
  hub: McpHub;
  userMessage: string;
}): AsyncGenerator<StreamChunk> {
  const toolsCatalog = hub.listAllTools();

  const toolDescriptions = toolsCatalog.map(tool => {
    const [server, ...toolPath] = tool.fq.split('.');
    const toolName = toolPath.join('.');

    // Add specific descriptions for when to call each tool
    const descriptions = {
      'weather.current': 'Call when user asks about current weather conditions, temperature, or "what\'s the weather like" in any location',
      'weather.forecast': 'Call when user asks for multi-day weather forecast, weather predictions, or "weather this week"',
      'weather.alerts': 'Call when user asks about weather warnings, alerts, storms, or weather safety',
      'mem.task.add': 'Call when user wants to add, create, or save a new task, todo, or reminder',
      'mem.task.list': 'Call when user asks to see, list, show, or view their tasks or todos',
      'mem.task.update': 'Call when user wants to mark task complete, update task text, change priority, or modify existing tasks',
      'mem.journal.add': 'Call when user wants to add journal entry, diary entry, or save notes for a specific date',
      'mem.search': 'Call when user wants to search through their tasks or journal entries for specific content'
    };

    return `- ${tool.fq}: ${descriptions[toolName] || 'MCP tool for ' + toolName}`;
  }).join('\n');

  const system = [
    "You are an AI assistant with access to MCP (Model Context Protocol) tools for managing tasks and checking weather.",
    "You have been provided with function tools that you should use proactively to help users.",
    "",
    "TOOL USAGE GUIDELINES:",
    toolDescriptions,
    "",
    "CRITICAL INSTRUCTIONS:",
    "1. When user asks about weather → IMMEDIATELY call appropriate weather tool",
    "2. When user wants to add task → IMMEDIATELY call mem.task.add",
    "3. When user wants to see tasks → IMMEDIATELY call mem.task.list",
    "4. When user wants to complete/update task → IMMEDIATELY call mem.task.update",
    "5. When user wants to add journal → IMMEDIATELY call mem.journal.add",
    "6. When user wants to search → IMMEDIATELY call mem.search",
    "",
    "DO NOT just describe what you could do - actually call the tools!",
    "The tools are available as functions - use them to provide real, actionable results.",
    "Always call tools when they can help answer the user's request.",
  ].join("\n");

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
      // Simple validation - check if tool and args exist and are valid types
      if (!chunk.tool || typeof chunk.tool !== 'string') {
        console.error('Tool call validation failed: invalid tool name');
        continue;
      }

      const toolCall: ToolCall = { tool: chunk.tool, args: chunk.args };
      console.log('Calling tool:', toolCall.tool, 'with args:', toolCall.args);
      try {
        const res = await hub.call(toolCall.tool, toolCall.args);
        console.log('Tool result:', res);
        yield { type: "tool_result", tool: toolCall.tool, data: res };
      } catch (error) {
        console.error('Tool call error:', error);
        yield { type: "tool_result", tool: toolCall.tool, data: { error: error.message } };
      }
    }
  }
}
