import { runAgent, Llm, StreamChunk } from '../src/agent';
import { McpHub } from '../src/mcp-hub';

describe('Agent Integration', () => {
  let mockLlm: Llm;
  let mockHub: McpHub;

  beforeEach(() => {
    mockLlm = {
      stream: jest.fn()
    };

    mockHub = {
      listAllTools: jest.fn().mockReturnValue([
        { fq: 'memory.task.add' },
        { fq: 'memory.search' },
        { fq: 'weather.current' }
      ]),
      call: jest.fn()
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('runAgent', () => {
    it('should pass through text chunks from LLM', async () => {
      const mockStream: StreamChunk[] = [
        { type: 'text', token: 'Hello ' },
        { type: 'text', token: 'there!' }
      ];

      (mockLlm.stream as jest.Mock).mockImplementation(async function* () {
        for (const chunk of mockStream) {
          yield chunk;
        }
      });

      const results: StreamChunk[] = [];
      for await (const chunk of runAgent({
        llm: mockLlm,
        hub: mockHub,
        userMessage: 'Hello'
      })) {
        results.push(chunk);
      }

      expect(results).toEqual([
        { type: 'text', token: 'Hello ' },
        { type: 'text', token: 'there!' }
      ]);
    });

    it('should execute tool calls and return results', async () => {
      const mockStream: StreamChunk[] = [
        { type: 'text', token: 'Let me add that task. ' },
        { type: 'tool_call', tool: 'memory.task.add', args: { text: 'Buy groceries' } }
      ];

      const mockToolResult = { ok: true, id: 'task-123' };
      (mockHub.call as jest.Mock).mockResolvedValue(mockToolResult);

      (mockLlm.stream as jest.Mock).mockImplementation(async function* () {
        for (const chunk of mockStream) {
          yield chunk;
        }
      });

      const results: StreamChunk[] = [];
      for await (const chunk of runAgent({
        llm: mockLlm,
        hub: mockHub,
        userMessage: 'Add a task to buy groceries'
      })) {
        results.push(chunk);
      }

      expect(results).toEqual([
        { type: 'text', token: 'Let me add that task. ' },
        { type: 'tool_result', tool: 'memory.task.add', data: mockToolResult }
      ]);

      expect(mockHub.call).toHaveBeenCalledWith('memory.task.add', { text: 'Buy groceries' });
    });

    it('should pass correct system prompt and tools to LLM', async () => {
      (mockLlm.stream as jest.Mock).mockImplementation(async function* () {
        yield { type: 'text', token: 'Hello' };
      });

      const agent = runAgent({
        llm: mockLlm,
        hub: mockHub,
        userMessage: 'Help me with tasks'
      });

      await agent.next(); // Execute first chunk

      expect(mockLlm.stream).toHaveBeenCalledWith({
        system: [
          "You are an assistant that can call tools via MCP.",
          "Use tools only when they help.",
          'When you call a tool, emit a single JSON line: {"tool":"<server.tool>","args":{...}}',
          "Otherwise, just stream text."
        ].join("\n"),
        toolsCatalog: [
          { fq: 'memory.task.add' },
          { fq: 'memory.search' },
          { fq: 'weather.current' }
        ],
        messages: [{ role: 'user', content: 'Help me with tasks' }]
      });
    });

    it('should handle invalid tool calls gracefully', async () => {
      const mockStream: StreamChunk[] = [
        { type: 'tool_call', tool: 'invalid.tool', args: null }
      ];

      (mockLlm.stream as jest.Mock).mockImplementation(async function* () {
        for (const chunk of mockStream) {
          yield chunk;
        }
      });

      const results: StreamChunk[] = [];
      for await (const chunk of runAgent({
        llm: mockLlm,
        hub: mockHub,
        userMessage: 'Test'
      })) {
        results.push(chunk);
      }

      // Should not call hub or return tool result for invalid calls
      expect(mockHub.call).not.toHaveBeenCalled();
      expect(results).toEqual([]);
    });

    it('should handle tool execution errors', async () => {
      const mockStream: StreamChunk[] = [
        { type: 'tool_call', tool: 'memory.task.add', args: { text: 'Test' } }
      ];

      (mockHub.call as jest.Mock).mockRejectedValue(new Error('Tool execution failed'));

      (mockLlm.stream as jest.Mock).mockImplementation(async function* () {
        for (const chunk of mockStream) {
          yield chunk;
        }
      });

      // Should not throw, but also shouldn't yield tool_result
      const results: StreamChunk[] = [];
      await expect(async () => {
        for await (const chunk of runAgent({
          llm: mockLlm,
          hub: mockHub,
          userMessage: 'Test'
        })) {
          results.push(chunk);
        }
      }).rejects.toThrow('Tool execution failed');

      expect(mockHub.call).toHaveBeenCalledWith('memory.task.add', { text: 'Test' });
    });

    it('should handle multiple tool calls in sequence', async () => {
      const mockStream: StreamChunk[] = [
        { type: 'text', token: 'Let me search first. ' },
        { type: 'tool_call', tool: 'memory.search', args: { query: 'groceries' } },
        { type: 'text', token: 'Now adding the task. ' },
        { type: 'tool_call', tool: 'memory.task.add', args: { text: 'Buy milk' } }
      ];

      (mockHub.call as jest.Mock)
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ ok: true, id: 'task-456' });

      (mockLlm.stream as jest.Mock).mockImplementation(async function* () {
        for (const chunk of mockStream) {
          yield chunk;
        }
      });

      const results: StreamChunk[] = [];
      for await (const chunk of runAgent({
        llm: mockLlm,
        hub: mockHub,
        userMessage: 'Search for groceries then add milk task'
      })) {
        results.push(chunk);
      }

      expect(results).toEqual([
        { type: 'text', token: 'Let me search first. ' },
        { type: 'tool_result', tool: 'memory.search', data: { results: [] } },
        { type: 'text', token: 'Now adding the task. ' },
        { type: 'tool_result', tool: 'memory.task.add', data: { ok: true, id: 'task-456' } }
      ]);

      expect(mockHub.call).toHaveBeenCalledTimes(2);
      expect(mockHub.call).toHaveBeenNthCalledWith(1, 'memory.search', { query: 'groceries' });
      expect(mockHub.call).toHaveBeenNthCalledWith(2, 'memory.task.add', { text: 'Buy milk' });
    });

    it('should validate tool call schema with Zod', async () => {
      const mockStream: StreamChunk[] = [
        { type: 'tool_call', tool: undefined as any, args: {} }
      ];

      (mockLlm.stream as jest.Mock).mockImplementation(async function* () {
        for (const chunk of mockStream) {
          yield chunk;
        }
      });

      const results: StreamChunk[] = [];
      for await (const chunk of runAgent({
        llm: mockLlm,
        hub: mockHub,
        userMessage: 'Test'
      })) {
        results.push(chunk);
      }

      // Should skip invalid tool calls
      expect(mockHub.call).not.toHaveBeenCalled();
      expect(results).toEqual([]);
    });
  });
});
