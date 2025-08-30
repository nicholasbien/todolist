import OpenAI from 'openai';
import { Llm, StreamChunk } from './agent';

export class OpenAILlm implements Llm {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true, // Note: In production, this should be server-side
    });
  }

  async *stream(opts: {
    system: string;
    messages: { role: "user" | "assistant" | "tool"; content: string }[];
    toolsCatalog: { fq: string }[];
  }): AsyncGenerator<StreamChunk> {
    // Convert toolsCatalog to function tools format for Chat Completions API
    const tools = opts.toolsCatalog.map(tool => {
      const [server, ...toolPath] = tool.fq.split('.');
      const toolName = toolPath.join('.');

      // Define specific parameters for each tool
      const toolSchemas = {
        'weather.current': {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City name (e.g., "Tokyo", "New York")' },
            units: { type: 'string', enum: ['metric', 'imperial', 'kelvin'], description: 'Temperature units' }
          },
          required: ['location'],
          additionalProperties: false,
        },
        'weather.forecast': {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City name' },
            days: { type: 'number', minimum: 1, maximum: 5, description: 'Number of forecast days (1-5)' },
            units: { type: 'string', enum: ['metric', 'imperial', 'kelvin'], description: 'Temperature units' }
          },
          required: ['location'],
          additionalProperties: false,
        },
        'weather.alerts': {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City name or coordinates' }
          },
          required: ['location'],
          additionalProperties: false,
        },
        'mem.task.add': {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Task description' },
            category: { type: 'string', description: 'Task category (optional)' },
            priority: { type: 'string', enum: ['low', 'med', 'high'], description: 'Task priority (optional)' }
          },
          required: ['text'],
          additionalProperties: false,
        },
        'mem.task.list': {
          type: 'object',
          properties: {
            completed: { type: 'boolean', description: 'Filter by completion status (optional)' }
          },
          additionalProperties: false,
        },
        'mem.task.update': {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Task ID to update' },
            completed: { type: 'boolean', description: 'Mark as completed/incomplete' },
            text: { type: 'string', description: 'New task text (optional)' },
            priority: { type: 'string', enum: ['low', 'med', 'high'], description: 'New priority (optional)' }
          },
          required: ['id'],
          additionalProperties: false,
        },
        'mem.journal.add': {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Journal entry content' },
            date: { type: 'string', description: 'Date in YYYY-MM-DD format (optional, defaults to today)' }
          },
          required: ['content'],
          additionalProperties: false,
        },
        'mem.search': {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            types: { type: 'array', items: { type: 'string', enum: ['task', 'journal'] }, description: 'Types to search (optional)' },
            limit: { type: 'number', minimum: 1, maximum: 50, default: 8, description: 'Maximum results' }
          },
          required: ['query'],
          additionalProperties: false,
        }
      };

      return {
        type: 'function' as const,
        function: {
          name: tool.fq.replace(/\./g, '_'), // Replace periods with underscores for OpenAI
          description: `MCP tool: ${tool.fq}. Use this when user requests ${toolName} functionality.`,
          parameters: toolSchemas[toolName] || {
            type: 'object',
            properties: {},
            additionalProperties: true,
          },
        },
      };
    });

    // Create a mapping from OpenAI-safe names back to original MCP names
    const nameMapping = new Map(
      opts.toolsCatalog.map(tool => [tool.fq.replace(/\./g, '_'), tool.fq])
    );

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: opts.system },
      ...opts.messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ];

    // Use GPT-4.1 with Chat Completions API (proven to work well)
    try {
      console.log('Using GPT-4.1 with Chat Completions API...');

      const stream = await this.client.chat.completions.create({
        model: 'gpt-4.1',
        messages,
        tools: tools.length > 0 ? tools : undefined,
        stream: true,
        temperature: 0.7,
      });

      // Track partial tool calls across chunks
      const partialToolCalls = new Map<number, { name?: string; arguments: string }>();

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        // Handle text content
        if (choice.delta.content) {
          yield { type: 'text', token: choice.delta.content };
        }

        // Handle streaming tool calls - reassemble across chunks
        if (choice.delta.tool_calls) {
          for (const deltaToolCall of choice.delta.tool_calls) {
            const index = deltaToolCall.index || 0;

            // Initialize or get existing partial tool call
            if (!partialToolCalls.has(index)) {
              partialToolCalls.set(index, { arguments: '' });
            }
            const partial = partialToolCalls.get(index)!;

            // Accumulate function name
            if (deltaToolCall.function?.name) {
              partial.name = deltaToolCall.function.name;
            }

            // Accumulate arguments
            if (deltaToolCall.function?.arguments) {
              partial.arguments += deltaToolCall.function.arguments;
            }

            // Check if we have a complete tool call
            if (partial.name && partial.arguments) {
              try {
                // Try to parse complete JSON arguments
                const args = JSON.parse(partial.arguments);
                const originalName = nameMapping.get(partial.name) || partial.name;

                console.log('Tool call ready:', partial.name, args);
                yield {
                  type: 'tool_call',
                  tool: originalName,
                  args,
                };

                // Clear this tool call
                partialToolCalls.delete(index);
              } catch (e) {
                // JSON not complete yet, continue accumulating
                console.log('Tool call incomplete, continuing...', partial.arguments);
              }
            }
          }
        }

        // Handle finish_reason = "tool_calls"
        if (choice.finish_reason === 'tool_calls') {
          console.log('Tool calls finished, checking remaining partial calls...');
          // Process any remaining partial tool calls
          for (const [index, partial] of partialToolCalls.entries()) {
            if (partial.name && partial.arguments) {
              try {
                const args = JSON.parse(partial.arguments);
                const originalName = nameMapping.get(partial.name) || partial.name;

                console.log('Final tool call:', partial.name, args);
                yield {
                  type: 'tool_call',
                  tool: originalName,
                  args,
                };
              } catch (e) {
                console.error('Failed to parse final tool call arguments:', e, partial);
              }
            }
          }
          partialToolCalls.clear();
        }
      }
    } catch (error) {
      console.error('GPT-4.1 Chat API error:', error);
      yield { type: 'text', token: 'Sorry, I encountered an error processing your request. Please try again.' };
    }
  }
}
