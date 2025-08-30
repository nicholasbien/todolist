import { OpenAILlm } from '../src/openai-llm';

// Mock OpenAI
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      responses: {
        create: jest.fn()
      },
      chat: {
        completions: {
          create: jest.fn()
        }
      }
    }))
  };
});

describe('OpenAILlm', () => {
  let mockOpenAI: any;
  let llm: OpenAILlm;

  beforeEach(() => {
    const OpenAI = require('openai').default;
    mockOpenAI = {
      responses: {
        create: jest.fn()
      },
      chat: {
        completions: {
          create: jest.fn()
        }
      }
    };
    OpenAI.mockImplementation(() => mockOpenAI);
    llm = new OpenAILlm('test-api-key');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('stream', () => {
    it('should stream text tokens correctly', async () => {
      const mockStream = [
        { type: 'content.delta', delta: 'Hello' },
        { type: 'content.delta', delta: ' world' },
        { type: 'content.delta', delta: '!' }
      ];

      mockOpenAI.responses.create.mockReturnValue(mockStream);

      const results = [];
      const streamOpts = {
        system: 'You are a helpful assistant',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        toolsCatalog: []
      };

      for await (const chunk of llm.stream(streamOpts)) {
        results.push(chunk);
      }

      expect(results).toEqual([
        { type: 'text', token: 'Hello' },
        { type: 'text', token: ' world' },
        { type: 'text', token: '!' }
      ]);
    });

    it('should handle tool calls correctly', async () => {
      const mockStream = [
        {
          choices: [{
            delta: {
              tool_calls: [
                {
                  function: {
                    name: 'memory.mem.task.add',
                    arguments: '{"text": "Buy groceries", "priority": "med"}'
                  }
                }
              ]
            }
          }]
        }
      ];

      mockOpenAI.chat.completions.create.mockResolvedValue(mockStream);

      const results = [];
      const streamOpts = {
        system: 'You are a helpful assistant',
        messages: [{ role: 'user' as const, content: 'Add a task to buy groceries' }],
        toolsCatalog: [{ fq: 'memory.mem.task.add' }]
      };

      for await (const chunk of llm.stream(streamOpts)) {
        results.push(chunk);
      }

      expect(results).toEqual([
        {
          type: 'tool_call',
          tool: 'memory.mem.task.add',
          args: { text: 'Buy groceries', priority: 'med' }
        }
      ]);
    });

    it('should format tools correctly for OpenAI API', async () => {
      const streamOpts = {
        system: 'You are a helpful assistant',
        messages: [{ role: 'user' as const, content: 'Help me' }],
        toolsCatalog: [
          { fq: 'memory.mem.task.add' },
          { fq: 'weather.current' }
        ]
      };

      mockOpenAI.chat.completions.create.mockResolvedValue([]);

      await llm.stream(streamOpts).next();

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Help me' }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'memory.mem.task.add',
              description: 'MCP tool: memory.mem.task.add',
              parameters: {
                type: 'object',
                properties: {},
                additionalProperties: true
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'weather.current',
              description: 'MCP tool: weather.current',
              parameters: {
                type: 'object',
                properties: {},
                additionalProperties: true
              }
            }
          }
        ],
        stream: true,
        temperature: 0.7
      });
    });

    it('should handle API errors gracefully', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const results = [];
      const streamOpts = {
        system: 'You are a helpful assistant',
        messages: [{ role: 'user' as const, content: 'Hello' }],
        toolsCatalog: []
      };

      for await (const chunk of llm.stream(streamOpts)) {
        results.push(chunk);
      }

      expect(results).toEqual([
        { type: 'text', token: 'Sorry, I encountered an error processing your request.' }
      ]);
    });

    it('should handle malformed tool call arguments', async () => {
      const mockStream = [
        {
          choices: [{
            delta: {
              tool_calls: [
                {
                  function: {
                    name: 'memory.mem.task.add',
                    arguments: 'invalid json'
                  }
                }
              ]
            }
          }]
        }
      ];

      mockOpenAI.chat.completions.create.mockResolvedValue(mockStream);

      const results = [];
      const streamOpts = {
        system: 'You are a helpful assistant',
        messages: [{ role: 'user' as const, content: 'Add task' }],
        toolsCatalog: [{ fq: 'memory.mem.task.add' }]
      };

      for await (const chunk of llm.stream(streamOpts)) {
        results.push(chunk);
      }

      // Should not yield any chunks for malformed tool calls
      expect(results).toEqual([]);
    });
  });
});
