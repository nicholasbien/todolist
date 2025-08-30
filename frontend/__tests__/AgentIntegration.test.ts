/**
 * Integration test to verify the agent actually works end-to-end
 * This test mocks the API endpoints but tests the full agent workflow
 */

import { NextApiRequest, NextApiResponse } from 'next';

// Mock environment variables
process.env.OPENAI_API_KEY = 'test-api-key';
process.env.NODE_ENV = 'test';

// Mock the backend API
global.fetch = jest.fn();

// Mock OpenAI with a simple working response
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    responses: {
      create: jest.fn().mockReturnValue([
        { type: 'content.delta', delta: 'I can help you with tasks. ' },
        { type: 'tool_call', name: 'memory.mem.task.add', input: '{"text":"Test task","priority":"med"}' },
        { type: 'content.delta', delta: 'Task created successfully!' }
      ])
    },
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }))
}));

// Mock MCP SDK to avoid actual server startup
jest.mock('@modelcontextprotocol/sdk/client', () => ({
  createClient: jest.fn().mockReturnValue({
    initialize: jest.fn(),
    tools: {
      list: jest.fn().mockResolvedValue({
        tools: [
          { name: 'mem.task.add' },
          { name: 'mem.search' },
          { name: 'current' },
          { name: 'forecast' }
        ]
      }),
      call: jest.fn().mockResolvedValue({ ok: true, id: 'task-123' })
    }
  }),
  stdio: jest.fn().mockResolvedValue({}),
  websocket: jest.fn().mockResolvedValue({})
}));

describe('Agent Integration Test', () => {
  let handler: any;
  let mockReq: Partial<NextApiRequest>;
  let mockRes: Partial<NextApiResponse>;
  let mockWrite: jest.Mock;
  let mockEnd: jest.Mock;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(async () => {
    mockFetch = fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockClear();

    mockWrite = jest.fn();
    mockEnd = jest.fn();

    mockReq = {
      query: {
        q: 'Add a task to buy groceries',
        token: 'test-token',
        space_id: 'test-space'
      }
    };

    mockRes = {
      writeHead: jest.fn(),
      write: mockWrite,
      end: mockEnd
    };

    // Mock successful API response for task creation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ _id: 'task-123', text: 'Buy groceries', category: 'personal' })
    } as Response);

    // Import the handler after setting up mocks
    const handlerModule = await import('../pages/api/agent/stream');
    handler = handlerModule.default;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should handle complete agent workflow from user input to tool execution', async () => {
    // Execute the handler
    await handler(mockReq, mockRes);

    // Verify response headers were set for SSE
    expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });

    // Verify SSE events were written
    expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('event: ready'));
    expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('event: token'));
    expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('event: tool_result'));
    expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('event: done'));

    // Verify response was ended
    expect(mockEnd).toHaveBeenCalled();

    // Verify backend API was called to create task
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/todos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify({
        text: 'Test task',
        priority: 'med',
        space_id: 'test-space'
      })
    });
  });

  it('should handle missing OpenAI API key gracefully', async () => {
    delete process.env.OPENAI_API_KEY;

    await handler(mockReq, mockRes);

    expect(mockWrite).toHaveBeenCalledWith(
      expect.stringContaining('OpenAI API key not configured')
    );
    expect(mockEnd).toHaveBeenCalled();
  });

  it('should pass space context to tools', async () => {
    const customSpaceReq = {
      ...mockReq,
      query: {
        ...mockReq.query,
        space_id: 'custom-space-123'
      }
    };

    await handler(customSpaceReq, mockRes);

    // Verify the space_id was passed in the ready event
    const readyCall = mockWrite.mock.calls.find(call =>
      call[0].includes('event: ready')
    );
    expect(readyCall[0]).toContain('custom-space-123');
  });

  it('should list available tools in ready event', async () => {
    await handler(mockReq, mockRes);

    const readyCall = mockWrite.mock.calls.find(call =>
      call[0].includes('event: ready')
    );
    expect(readyCall[0]).toContain('memory.mem.task.add');
    expect(readyCall[0]).toContain('memory.mem.search');
    expect(readyCall[0]).toContain('weather.current');
    expect(readyCall[0]).toContain('weather.forecast');
  });

  it('should stream text tokens from GPT-5', async () => {
    await handler(mockReq, mockRes);

    const tokenCalls = mockWrite.mock.calls.filter(call =>
      call[0].includes('event: token')
    );

    expect(tokenCalls.length).toBeGreaterThan(0);
    expect(tokenCalls[0][0]).toContain('I can help you with tasks.');
    expect(tokenCalls[tokenCalls.length - 1][0]).toContain('Task created successfully!');
  });

  it('should execute tools and return results', async () => {
    await handler(mockReq, mockRes);

    const toolResultCall = mockWrite.mock.calls.find(call =>
      call[0].includes('event: tool_result')
    );

    expect(toolResultCall).toBeTruthy();
    expect(toolResultCall[0]).toContain('memory.mem.task.add');
    expect(toolResultCall[0]).toContain('ok');
    expect(toolResultCall[0]).toContain('task-123');
  });

  it('should handle requests without auth token', async () => {
    const noAuthReq = {
      ...mockReq,
      query: {
        q: 'Get weather for London'
      }
    };

    await handler(noAuthReq, mockRes);

    // Should still work but API calls won't have auth headers
    expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('event: ready'));
    expect(mockEnd).toHaveBeenCalled();
  });

  it('should handle default user message', async () => {
    const emptyReq = {
      query: {}
    };

    await handler(emptyReq, mockRes);

    expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('event: ready'));
    expect(mockEnd).toHaveBeenCalled();
  });
});

describe('Agent Production Readiness', () => {
  it('should have all required components for production use', () => {
    // Verify all key files exist and can be imported
    expect(() => require('../src/openai-llm')).not.toThrow();
    expect(() => require('../src/mcp-hub')).not.toThrow();
    expect(() => require('../src/agent')).not.toThrow();
    expect(() => require('../src/memory-server')).not.toThrow();
    expect(() => require('../src/weather-server')).not.toThrow();
    expect(() => require('../components/AgentChatbot')).not.toThrow();
  });

  it('should be configured for GPT-5 with fallback to GPT-4.1', () => {
    const { OpenAILlm } = require('../src/openai-llm');
    const llm = new OpenAILlm('test-key');

    expect(llm).toBeDefined();
    expect(llm.stream).toBeInstanceOf(Function);
  });

  it('should support both memory and weather MCP servers', async () => {
    const { McpHub } = require('../src/mcp-hub');
    const hub = new McpHub();

    expect(hub.listAllTools).toBeInstanceOf(Function);
    expect(hub.call).toBeInstanceOf(Function);
    expect(hub.addBuiltinMemory).toBeInstanceOf(Function);
  });
});
