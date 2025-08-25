/**
 * Tests for offline category CRUD operations
 *
 * These tests verify that users can create, read, update, and delete categories
 * when offline, and that these operations are properly queued for sync.
 */

import { handleApiRequest } from '../public/sw.js';

// Mock IndexedDB for testing
import 'fake-indexeddb/auto';

describe('Offline Category Operations', () => {
  let mockAuthData: any;

  beforeEach(async () => {
    // Reset IndexedDB state
    await new Promise(resolve => {
      const deleteReq = indexedDB.deleteDatabase('TodoGlobalDB');
      deleteReq.onsuccess = () => resolve(void 0);
      deleteReq.onerror = () => resolve(void 0);
    });

    await new Promise(resolve => {
      const deleteReq = indexedDB.deleteDatabase('TodoUserDB_testuser');
      deleteReq.onsuccess = () => resolve(void 0);
      deleteReq.onerror = () => resolve(void 0);
    });

    // Setup mock auth data
    mockAuthData = { userId: 'testuser', token: 'test-token' };

    // Mock getAuth to return our test user
    global.getAuth = jest.fn().mockResolvedValue(mockAuthData);

    // Mock navigator.onLine to simulate offline
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET Categories Offline (GET /api/categories)', () => {
    beforeEach(async () => {
      // Create test categories using the database functions directly
      const { putCategory } = require('../public/sw.js');

      await putCategory({ name: 'Work', space_id: 'space1' }, 'testuser');
      await putCategory({ name: 'Personal', space_id: 'space1' }, 'testuser');
      await putCategory({ name: 'General', space_id: 'space2' }, 'testuser');
      await putCategory({ name: 'Ideas', space_id: null }, 'testuser'); // Legacy category
    });

    it('should return all categories as string array when no space filter', async () => {
      const getCategoriesRequest = new Request('/api/categories', {
        method: 'GET'
      });

      const response = await handleApiRequest(getCategoriesRequest);
      expect(response.ok).toBe(true);

      const categories = await response.json();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories).toContain('Work');
      expect(categories).toContain('Personal');
      expect(categories).toContain('General');
      expect(categories).toContain('Ideas');
    });

    it('should filter categories by space_id when provided', async () => {
      const getCategoriesRequest = new Request('/api/categories?space_id=space1', {
        method: 'GET'
      });

      const response = await handleApiRequest(getCategoriesRequest);
      const categories = await response.json();

      expect(categories).toContain('Work');
      expect(categories).toContain('Personal');
      expect(categories).not.toContain('General'); // This is in space2
    });

    it('should return empty array for non-existent space', async () => {
      const getCategoriesRequest = new Request('/api/categories?space_id=nonexistent', {
        method: 'GET'
      });

      const response = await handleApiRequest(getCategoriesRequest);
      const categories = await response.json();

      expect(categories.length).toBe(0);
    });
  });

  describe('CREATE Category Offline (POST /api/categories)', () => {
    it('should create a new category for a space', async () => {
      const createRequest = new Request('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Category',
          space_id: 'space123'
        })
      });

      const response = await handleApiRequest(createRequest);
      expect(response.ok).toBe(true);

      const category = await response.json();
      expect(category.name).toBe('New Category');
      expect(category.space_id).toBe('space123');
    });

    it('should create category with auto-generated name if none provided', async () => {
      const createRequest = new Request('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          space_id: 'space123'
        })
      });

      const response = await handleApiRequest(createRequest);
      const category = await response.json();

      expect(category.name).toMatch(/^offline_\d+$/);
      expect(category.space_id).toBe('space123');
    });

    it('should handle null space_id for legacy categories', async () => {
      const createRequest = new Request('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Legacy Category'
        })
      });

      const response = await handleApiRequest(createRequest);
      const category = await response.json();

      expect(category.name).toBe('Legacy Category');
      expect(category.space_id).toBe(null);
    });

    it('should queue CREATE_CATEGORY operation', async () => {
      const createRequest = new Request('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Queued Category',
          space_id: 'space123'
        })
      });

      await handleApiRequest(createRequest);

      // Verify queue contains the operation
      const { readQueue } = require('../public/sw.js');
      const queue = await readQueue('testuser');

      expect(queue.length).toBe(1);
      expect(queue[0].type).toBe('CREATE_CATEGORY');
      expect(queue[0].data.name).toBe('Queued Category');
      expect(queue[0].data.space_id).toBe('space123');
    });
  });

  describe('UPDATE/RENAME Category Offline (PUT /api/categories/{name})', () => {
    beforeEach(async () => {
      // Create test category and todos that reference it
      const createCategoryRequest = new Request('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Original Category',
          space_id: 'space123'
        })
      });
      await handleApiRequest(createCategoryRequest);

      // Create todos that use this category
      const createTodo1Request = new Request('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Todo 1',
          category: 'Original Category',
          space_id: 'space123'
        })
      });
      await handleApiRequest(createTodo1Request);

      const createTodo2Request = new Request('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Todo 2',
          category: 'Original Category',
          space_id: 'space123'
        })
      });
      await handleApiRequest(createTodo2Request);
    });

    it('should rename category and update all associated todos', async () => {
      const renameRequest = new Request('/api/categories/Original%20Category?space_id=space123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_name: 'Renamed Category'
        })
      });

      const response = await handleApiRequest(renameRequest);
      expect(response.ok).toBe(true);

      const result = await response.json();
      expect(result.message).toBe('Category renamed');

      // Verify todos were updated
      const getTodosRequest = new Request('/api/todos?space_id=space123', {
        method: 'GET'
      });

      const todosResponse = await handleApiRequest(getTodosRequest);
      const todos = await todosResponse.json();

      expect(todos.every((t: any) => t.category === 'Renamed Category')).toBe(true);
    });

    it('should return error for empty category name', async () => {
      const renameRequest = new Request('/api/categories/Original%20Category?space_id=space123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_name: '   '  // Empty/whitespace name
        })
      });

      const response = await handleApiRequest(renameRequest);
      expect(response.status).toBe(400);

      const error = await response.json();
      expect(error.error).toBe('Invalid name');
    });

    it('should queue RENAME_CATEGORY operation', async () => {
      const renameRequest = new Request('/api/categories/Original%20Category?space_id=space123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_name: 'New Name'
        })
      });

      await handleApiRequest(renameRequest);

      // Verify queue contains the operation (plus the todo updates)
      const { readQueue } = require('../public/sw.js');
      const queue = await readQueue('testuser');

      const renameOperation = queue.find((op: any) => op.type === 'RENAME_CATEGORY');
      expect(renameOperation).toBeDefined();
      expect(renameOperation.data.old_name).toBe('Original Category');
      expect(renameOperation.data.new_name).toBe('New Name');
      expect(renameOperation.data.space_id).toBe('space123');
    });
  });

  describe('DELETE Category Offline (DELETE /api/categories/{name})', () => {
    beforeEach(async () => {
      // Create test categories
      const createRequest1 = new Request('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'To Delete',
          space_id: 'space123'
        })
      });
      await handleApiRequest(createRequest1);

      const createRequest2 = new Request('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Work',
          space_id: 'space123'
        })
      });
      await handleApiRequest(createRequest2);

      // Create todos that use the category to be deleted
      const createTodoRequest = new Request('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Todo with deleted category',
          category: 'To Delete',
          space_id: 'space123'
        })
      });
      await handleApiRequest(createTodoRequest);
    });

    it('should delete category and update todos to use General', async () => {
      const deleteRequest = new Request('/api/categories/To%20Delete?space_id=space123', {
        method: 'DELETE'
      });

      const response = await handleApiRequest(deleteRequest);
      expect(response.status).toBe(204);

      // Verify todos were updated to General category
      const getTodosRequest = new Request('/api/todos?space_id=space123', {
        method: 'GET'
      });

      const todosResponse = await handleApiRequest(getTodosRequest);
      const todos = await todosResponse.json();
      const affectedTodo = todos.find((t: any) => t.text === 'Todo with deleted category');

      expect(affectedTodo.category).toBe('General');
    });

    it('should ensure General category exists after deletion', async () => {
      const deleteRequest = new Request('/api/categories/To%20Delete?space_id=space123', {
        method: 'DELETE'
      });

      await handleApiRequest(deleteRequest);

      // Verify General category was created
      const getCategoriesRequest = new Request('/api/categories?space_id=space123', {
        method: 'GET'
      });

      const response = await handleApiRequest(getCategoriesRequest);
      const categories = await response.json();

      expect(categories).toContain('General');
      expect(categories).toContain('Work'); // Other categories preserved
      expect(categories).not.toContain('To Delete');
    });

    it('should queue DELETE_CATEGORY operation', async () => {
      const deleteRequest = new Request('/api/categories/To%20Delete?space_id=space123', {
        method: 'DELETE'
      });

      await handleApiRequest(deleteRequest);

      // Verify queue contains the operation
      const { readQueue } = require('../public/sw.js');
      const queue = await readQueue('testuser');

      const deleteOperation = queue.find((op: any) => op.type === 'DELETE_CATEGORY');
      expect(deleteOperation).toBeDefined();
      expect(deleteOperation.data.name).toBe('To Delete');
      expect(deleteOperation.data.space_id).toBe('space123');
    });

    it('should handle deletion of non-existent category gracefully', async () => {
      const deleteRequest = new Request('/api/categories/Nonexistent?space_id=space123', {
        method: 'DELETE'
      });

      const response = await handleApiRequest(deleteRequest);
      expect(response.status).toBe(204); // Should still return success
    });
  });

  describe('Space Isolation', () => {
    beforeEach(async () => {
      // Create categories in different spaces
      const createRequests = [
        { name: 'Work', space_id: 'space1' },
        { name: 'Personal', space_id: 'space1' },
        { name: 'Work', space_id: 'space2' }, // Same name, different space
        { name: 'Ideas', space_id: 'space2' }
      ];

      for (const categoryData of createRequests) {
        const createRequest = new Request('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(categoryData)
        });
        await handleApiRequest(createRequest);
      }
    });

    it('should only delete categories in specified space', async () => {
      const deleteRequest = new Request('/api/categories/Work?space_id=space1', {
        method: 'DELETE'
      });

      await handleApiRequest(deleteRequest);

      // Verify only space1's Work category was deleted
      const getSpace1Request = new Request('/api/categories?space_id=space1', {
        method: 'GET'
      });
      const space1Response = await handleApiRequest(getSpace1Request);
      const space1Categories = await space1Response.json();

      expect(space1Categories).not.toContain('Work');
      expect(space1Categories).toContain('Personal');

      // Verify space2's Work category still exists
      const getSpace2Request = new Request('/api/categories?space_id=space2', {
        method: 'GET'
      });
      const space2Response = await handleApiRequest(getSpace2Request);
      const space2Categories = await space2Response.json();

      expect(space2Categories).toContain('Work');
      expect(space2Categories).toContain('Ideas');
    });

    it('should only rename categories in specified space', async () => {
      const renameRequest = new Request('/api/categories/Work?space_id=space1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_name: 'Business'
        })
      });

      await handleApiRequest(renameRequest);

      // Verify only space1's category was renamed
      const getSpace1Request = new Request('/api/categories?space_id=space1', {
        method: 'GET'
      });
      const space1Response = await handleApiRequest(getSpace1Request);
      const space1Categories = await space1Response.json();

      expect(space1Categories).toContain('Business');
      expect(space1Categories).not.toContain('Work');

      // Verify space2's Work category unchanged
      const getSpace2Request = new Request('/api/categories?space_id=space2', {
        method: 'GET'
      });
      const space2Response = await handleApiRequest(getSpace2Request);
      const space2Categories = await space2Response.json();

      expect(space2Categories).toContain('Work');
    });
  });

  describe('Authentication Requirements', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Mock unauthenticated state
      global.getAuth = jest.fn().mockResolvedValue(null);

      const createRequest = new Request('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Unauthorized Category' })
      });

      const response = await handleApiRequest(createRequest);

      expect(response.status).toBe(401);
      const error = await response.json();
      expect(error.error).toBe('Not authenticated');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON in request body', async () => {
      const createRequest = new Request('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{'
      });

      // Should not crash - invalid JSON should be handled gracefully
      const response = await handleApiRequest(createRequest);
      expect(response.ok).toBe(true);

      const category = await response.json();
      expect(category.name).toMatch(/^offline_\d+$/); // Default name when parsing fails
    });

    it('should handle empty request body', async () => {
      const createRequest = new Request('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: ''
      });

      const response = await handleApiRequest(createRequest);
      expect(response.ok).toBe(true);

      const category = await response.json();
      expect(category.name).toMatch(/^offline_\d+$/);
      expect(category.space_id).toBe(null);
    });
  });
});
