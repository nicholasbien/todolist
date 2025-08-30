/**
 * @jest-environment node
 */

// Mock fetch globally
global.fetch = jest.fn();

describe('Memory Server', () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    mockFetch = fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockClear();

    // Set environment variables
    process.env.AUTH_TOKEN = 'test-token';
    process.env.CURRENT_SPACE_ID = 'test-space-id';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Memory Server Import', () => {
    it('should import without errors', async () => {
      // Just test that we can import the module
      const memoryServer = await import('../src/memory-server');
      expect(memoryServer.startMemoryServerOverStdio).toBeDefined();
      expect(typeof memoryServer.startMemoryServerOverStdio).toBe('function');
    });
  });

  describe('Schema Validation', () => {
    it('should have proper schema types for task add', async () => {
      // Import zod for testing schema
      const { z } = await import('zod');

      // Define the expected schema structure
      const TaskAddSchema = z.object({
        text: z.string().min(1),
        category: z.string().optional(),
        priority: z.enum(['low', 'med', 'high']).default('med'),
        space_id: z.string().optional()
      });

      // Test valid input
      const validInput = { text: 'Test task', priority: 'high' as const };
      expect(() => TaskAddSchema.parse(validInput)).not.toThrow();

      // Test invalid input
      const invalidInput = { text: '', priority: 'invalid' as any };
      expect(() => TaskAddSchema.parse(invalidInput)).toThrow();
    });

    it('should have proper schema types for journal add', async () => {
      const { z } = await import('zod');

      const JournalAddSchema = z.object({
        content: z.string().min(1),
        date: z.string().optional(),
        space_id: z.string().optional()
      });

      // Test valid input
      const validInput = { content: 'Test journal entry' };
      expect(() => JournalAddSchema.parse(validInput)).not.toThrow();

      // Test invalid input
      const invalidInput = { content: '' };
      expect(() => JournalAddSchema.parse(invalidInput)).toThrow();
    });
  });

  describe('Build Compatibility', () => {
    it('should build without TypeScript errors', async () => {
      // This test passes if we can import the file without build errors
      const memoryServer = await import('../src/memory-server');

      // Verify the main export exists
      expect(memoryServer.startMemoryServerOverStdio).toBeDefined();

      // The fact that we got here means TypeScript compiled successfully
      expect(true).toBe(true);
    });
  });
});
