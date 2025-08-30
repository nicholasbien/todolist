import { McpHub } from '../src/mcp-hub';

// Mock the MCP SDK
jest.mock('@modelcontextprotocol/sdk/client', () => ({
  createClient: jest.fn(),
  stdio: jest.fn(),
  websocket: jest.fn()
}));

describe('McpHub', () => {
  let hub: McpHub;
  let mockClient: any;
  let mockTransport: any;

  beforeEach(() => {
    const { createClient, stdio, websocket } = require('@modelcontextprotocol/sdk/client');

    mockClient = {
      initialize: jest.fn().mockResolvedValue(undefined),
      tools: {
        list: jest.fn().mockResolvedValue({
          tools: [
            { name: 'task.add' },
            { name: 'task.update' },
            { name: 'search' }
          ]
        }),
        call: jest.fn()
      }
    };

    mockTransport = {};

    createClient.mockReturnValue(mockClient);
    stdio.mockResolvedValue(mockTransport);
    websocket.mockResolvedValue(mockTransport);

    hub = new McpHub();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('addBuiltinMemory', () => {
    it('should add a memory server successfully', async () => {
      const { stdio } = require('@modelcontextprotocol/sdk/client');

      await hub.addBuiltinMemory('memory', 'tsx', ['memory-server.ts']);

      expect(stdio).toHaveBeenCalledWith({
        command: 'tsx',
        args: ['memory-server.ts'],
        env: process.env
      });
      expect(mockClient.initialize).toHaveBeenCalled();
      expect(mockClient.tools.list).toHaveBeenCalled();
    });

    it('should add server with custom environment', async () => {
      const { stdio } = require('@modelcontextprotocol/sdk/client');
      const customEnv = { AUTH_TOKEN: 'test-token', SPACE_ID: 'test-space' };

      await hub.addBuiltinMemory('memory', 'tsx', ['memory-server.ts'], undefined, customEnv);

      expect(stdio).toHaveBeenCalledWith({
        command: 'tsx',
        args: ['memory-server.ts'],
        env: customEnv
      });
    });

    it('should filter allowed tools correctly', async () => {
      await hub.addBuiltinMemory('memory', 'tsx', ['memory-server.ts'], ['task.add', 'nonexistent']);

      const tools = hub.listAllTools();
      expect(tools).toEqual([{ fq: 'memory.task.add' }]);
    });
  });

  describe('addWebsocketServer', () => {
    it('should add a websocket server successfully', async () => {
      const { websocket } = require('@modelcontextprotocol/sdk/client');

      await hub.addWebsocketServer('remote', 'ws://localhost:8080');

      expect(websocket).toHaveBeenCalledWith({ url: 'ws://localhost:8080' });
      expect(mockClient.initialize).toHaveBeenCalled();
      expect(mockClient.tools.list).toHaveBeenCalled();
    });
  });

  describe('listAllTools', () => {
    it('should list all tools from all servers', async () => {
      // Add first server
      await hub.addBuiltinMemory('memory', 'tsx', ['memory-server.ts'], ['task.add']);

      // Add second server with different tools
      mockClient.tools.list.mockResolvedValueOnce({
        tools: [
          { name: 'current' },
          { name: 'forecast' }
        ]
      });
      await hub.addBuiltinMemory('weather', 'tsx', ['weather-server.ts']);

      const tools = hub.listAllTools();
      expect(tools).toEqual([
        { fq: 'memory.task.add' },
        { fq: 'weather.current' },
        { fq: 'weather.forecast' }
      ]);
    });

    it('should return empty array when no servers added', () => {
      const tools = hub.listAllTools();
      expect(tools).toEqual([]);
    });
  });

  describe('call', () => {
    beforeEach(async () => {
      await hub.addBuiltinMemory('memory', 'tsx', ['memory-server.ts']);
    });

    it('should call tool on correct server', async () => {
      const mockResult = { ok: true, id: 'task-123' };
      mockClient.tools.call.mockResolvedValue(mockResult);

      const result = await hub.call('memory.task.add', { text: 'Test task' });

      expect(mockClient.tools.call).toHaveBeenCalledWith({
        name: 'task.add',
        arguments: { text: 'Test task' }
      });
      expect(result).toBe(mockResult);
    });

    it('should handle namespaced tool names correctly', async () => {
      // Add server with nested tool name
      mockClient.tools.list.mockResolvedValueOnce({
        tools: [{ name: 'nested.tool.name' }]
      });
      await hub.addBuiltinMemory('memory', 'tsx', ['server.ts'], ['nested.tool.name']);

      const mockResult = { ok: true };
      mockClient.tools.call.mockResolvedValue(mockResult);

      await hub.call('memory.nested.tool.name', { param: 'value' });

      expect(mockClient.tools.call).toHaveBeenCalledWith({
        name: 'nested.tool.name',
        arguments: { param: 'value' }
      });
    });

    it('should throw error for unknown server', async () => {
      await expect(hub.call('unknown.tool', {})).rejects.toThrow('Unknown server: unknown');
    });

    it('should throw error for disallowed tool', async () => {
      // Add server with limited tools
      await hub.addBuiltinMemory('limited', 'tsx', ['server.ts'], ['allowed']);

      await expect(hub.call('limited.disallowed', {})).rejects.toThrow('Tool not allowed: limited.disallowed');
    });
  });

  describe('tool filtering', () => {
    it('should only allow tools that exist on the server', async () => {
      // Request tools that don't exist on server
      await hub.addBuiltinMemory('memory', 'tsx', ['memory-server.ts'], ['task.add', 'nonexistent', 'also.fake']);

      const tools = hub.listAllTools();
      expect(tools).toEqual([{ fq: 'memory.task.add' }]);
    });

    it('should allow all tools when no filter specified', async () => {
      await hub.addBuiltinMemory('memory', 'tsx', ['memory-server.ts']);

      const tools = hub.listAllTools();
      expect(tools).toEqual([
        { fq: 'memory.task.add' },
        { fq: 'memory.task.update' },
        { fq: 'memory.search' }
      ]);
    });
  });
});
