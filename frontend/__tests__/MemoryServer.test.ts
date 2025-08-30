/**
 * @jest-environment node
 */

// Mock fetch globally
global.fetch = jest.fn();

// Mock the MCP Server
const mockServer = {
  tool: jest.fn(),
  startStdio: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@modelcontextprotocol/sdk/server', () => ({
  Server: jest.fn().mockImplementation(() => mockServer)
}));

describe('Memory Server', () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    mockFetch = fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockClear();
    mockServer.tool.mockClear();
    mockServer.startStdio.mockClear();

    // Set environment variables
    process.env.AUTH_TOKEN = 'test-token';
    process.env.CURRENT_SPACE_ID = 'test-space-id';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Memory Server Tools', () => {
    it('should register all required tools', async () => {
      // Import after mocks are set up
      await import('../src/memory-server');

      expect(mockServer.tool).toHaveBeenCalledWith('mem.task.add', expect.objectContaining({
        description: 'Create a task in the user\'s todo list',
        inputSchema: expect.any(Object),
        handler: expect.any(Function)
      }));

      expect(mockServer.tool).toHaveBeenCalledWith('mem.task.update', expect.objectContaining({
        description: 'Patch an existing task',
        inputSchema: expect.any(Object),
        handler: expect.any(Function)
      }));

      expect(mockServer.tool).toHaveBeenCalledWith('mem.task.list', expect.objectContaining({
        description: 'List all tasks in the current space',
        inputSchema: expect.any(Object),
        handler: expect.any(Function)
      }));

      expect(mockServer.tool).toHaveBeenCalledWith('mem.journal.add', expect.objectContaining({
        description: 'Create or update a journal entry for a specific date',
        inputSchema: expect.any(Object),
        handler: expect.any(Function)
      }));

      expect(mockServer.tool).toHaveBeenCalledWith('mem.search', expect.objectContaining({
        description: 'Search over tasks and journal entries',
        inputSchema: expect.any(Object),
        handler: expect.any(Function)
      }));
    });
  });

  describe('Task Operations', () => {
    let taskAddHandler: Function;
    let taskUpdateHandler: Function;
    let taskListHandler: Function;

    beforeEach(async () => {
      await import('../src/memory-server');

      // Extract handlers from mock calls
      const taskAddCall = mockServer.tool.mock.calls.find(call => call[0] === 'mem.task.add');
      const taskUpdateCall = mockServer.tool.mock.calls.find(call => call[0] === 'mem.task.update');
      const taskListCall = mockServer.tool.mock.calls.find(call => call[0] === 'mem.task.list');

      taskAddHandler = taskAddCall[1].handler;
      taskUpdateHandler = taskUpdateCall[1].handler;
      taskListHandler = taskListCall[1].handler;
    });

    it('should add a task via backend API', async () => {
      const mockTask = { _id: 'task-123', text: 'Buy groceries', category: 'personal' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTask
      } as Response);

      const result = await taskAddHandler({
        text: 'Buy groceries',
        category: 'personal',
        priority: 'med'
      });

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/todos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          text: 'Buy groceries',
          category: 'personal',
          priority: 'med',
          space_id: 'test-space-id'
        })
      });

      expect(result).toEqual({
        ok: true,
        id: 'task-123',
        task: mockTask
      });
    });

    it('should update a task via backend API', async () => {
      const mockUpdatedTask = { _id: 'task-123', text: 'Buy organic groceries', completed: false };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockUpdatedTask
      } as Response);

      const result = await taskUpdateHandler({
        id: 'task-123',
        patch: { text: 'Buy organic groceries' }
      });

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/todos/task-123', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({ text: 'Buy organic groceries' })
      });

      expect(result).toEqual({
        ok: true,
        task: mockUpdatedTask
      });
    });

    it('should list tasks with space filtering', async () => {
      const mockTasks = [
        { _id: 'task-1', text: 'Task 1', completed: false },
        { _id: 'task-2', text: 'Task 2', completed: true }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTasks
      } as Response);

      const result = await taskListHandler({
        space_id: 'custom-space',
        completed: false
      });

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/todos?space_id=custom-space&completed=false', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        }
      });

      expect(result).toEqual({
        ok: true,
        tasks: mockTasks
      });
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(taskAddHandler({ text: 'Test task' })).rejects.toThrow('Network error');
    });
  });

  describe('Journal Operations', () => {
    let journalAddHandler: Function;

    beforeEach(async () => {
      await import('../src/memory-server');

      const journalAddCall = mockServer.tool.mock.calls.find(call => call[0] === 'mem.journal.add');
      journalAddHandler = journalAddCall[1].handler;
    });

    it('should add a journal entry via backend API', async () => {
      const mockJournal = { _id: 'journal-123', content: 'Today was great!', date: '2024-01-01' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockJournal
      } as Response);

      const result = await journalAddHandler({
        content: 'Today was great!',
        date: '2024-01-01'
      });

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/journals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          content: 'Today was great!',
          date: '2024-01-01',
          space_id: 'test-space-id'
        })
      });

      expect(result).toEqual({
        ok: true,
        id: 'journal-123',
        journal: mockJournal
      });
    });

    it('should use current date when none provided', async () => {
      const mockJournal = { _id: 'journal-456', content: 'Quick note' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockJournal
      } as Response);

      const today = new Date().toISOString().split('T')[0];

      await journalAddHandler({ content: 'Quick note' });

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/journals',
        expect.objectContaining({
          body: JSON.stringify({
            content: 'Quick note',
            date: today,
            space_id: 'test-space-id'
          })
        })
      );
    });
  });

  describe('Search Operations', () => {
    let searchHandler: Function;

    beforeEach(async () => {
      await import('../src/memory-server');

      const searchCall = mockServer.tool.mock.calls.find(call => call[0] === 'mem.search');
      searchHandler = searchCall[1].handler;
    });

    it('should search tasks and return formatted results', async () => {
      const mockTasks = [
        { _id: 'task-1', text: 'Buy groceries for dinner', category: 'shopping' },
        { _id: 'task-2', text: 'Grocery store visit', category: 'errands' }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTasks
      } as Response);

      const result = await searchHandler({
        query: 'grocery',
        types: ['task'],
        limit: 5
      });

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/todos?space_id=test-space-id',
        expect.objectContaining({
          method: 'GET'
        })
      );

      expect(result.results).toEqual([
        { type: 'task', id: 'task-1', snippet: 'Buy groceries for dinner' },
        { type: 'task', id: 'task-2', snippet: 'Grocery store visit' }
      ]);
    });

    it('should limit search results correctly', async () => {
      const mockTasks = Array.from({ length: 10 }, (_, i) => ({
        _id: `task-${i}`,
        text: `Task ${i} about groceries`,
        category: 'test'
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTasks
      } as Response);

      const result = await searchHandler({
        query: 'groceries',
        types: ['task'],
        limit: 3
      });

      expect(result.results).toHaveLength(3);
    });

    it('should handle journal search placeholder', async () => {
      const result = await searchHandler({
        query: 'test query',
        types: ['journal'],
        limit: 5
      });

      expect(result.results).toEqual([
        { type: 'journal', id: 'search-placeholder', snippet: 'Journal search for "test query" not fully implemented' }
      ]);
    });
  });

  describe('Environment Configuration', () => {
    it('should use production backend URL in production', async () => {
      process.env.NODE_ENV = 'production';

      // Re-import to pick up environment changes
      jest.resetModules();
      await import('../src/memory-server');

      const taskAddCall = mockServer.tool.mock.calls.find(call => call[0] === 'mem.task.add');
      const taskAddHandler = taskAddCall[1].handler;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ _id: 'test' })
      } as Response);

      await taskAddHandler({ text: 'Test task' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://backend-production-e920.up.railway.app'),
        expect.any(Object)
      );
    });

    it('should handle missing auth token', async () => {
      delete process.env.AUTH_TOKEN;

      jest.resetModules();
      await import('../src/memory-server');

      const taskAddCall = mockServer.tool.mock.calls.find(call => call[0] === 'mem.task.add');
      const taskAddHandler = taskAddCall[1].handler;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ _id: 'test' })
      } as Response);

      await taskAddHandler({ text: 'Test task' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(options.headers).not.toHaveProperty('Authorization');
    });
  });
});
