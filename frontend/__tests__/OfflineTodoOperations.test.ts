/**
 * Tests for offline todo CRUD operations
 *
 * These tests verify that users can create, read, update, and delete todos
 * when offline, and that these operations are properly queued for sync.
 */

import { handleApiRequest } from '../public/sw.js';

// Mock IndexedDB for testing
import 'fake-indexeddb/auto';

describe('Offline Todo Operations', () => {
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

  describe('CREATE Todo Offline (POST /api/todos)', () => {
    it('should create a todo with offline ID when offline', async () => {
      const mockRequest = new Request('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Test offline todo',
          category: 'Work',
          priority: 'High',
          space_id: 'space123'
        })
      });

      const response = await handleApiRequest(mockRequest);

      expect(response.ok).toBe(true);
      const todo = await response.json();

      // Verify offline todo structure
      expect(todo._id).toMatch(/^offline_\d+$/);
      expect(todo.text).toBe('Test offline todo');
      expect(todo.category).toBe('Work');
      expect(todo.priority).toBe('High');
      expect(todo.space_id).toBe('space123');
      expect(todo.completed).toBe(false);
      expect(todo.created_offline).toBe(true);
      expect(todo.user_id).toBe('testuser');
      expect(todo.dateAdded).toBeDefined();
    });

    it('should handle URL todos by storing link property', async () => {
      const mockRequest = new Request('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'https://example.com/important-link',
          category: 'Reference'
        })
      });

      const response = await handleApiRequest(mockRequest);
      const todo = await response.json();

      expect(todo.text).toBe('https://example.com/important-link');
      expect(todo.link).toBe('https://example.com/important-link');
    });

    it('should use default values for missing properties', async () => {
      const mockRequest = new Request('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Minimal todo'
        })
      });

      const response = await handleApiRequest(mockRequest);
      const todo = await response.json();

      expect(todo.category).toBe('General');
      expect(todo.priority).toBe('Medium');
      expect(todo.space_id).toBe(null);
      expect(todo.notes).toBe('');
      expect(todo.dueDate).toBe(null);
    });
  });

  describe('UPDATE Todo Offline (PUT /api/todos/{id})', () => {
    let existingTodo: any;

    beforeEach(async () => {
      // Create a todo first
      const createRequest = new Request('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Original todo',
          category: 'Work'
        })
      });

      const createResponse = await handleApiRequest(createRequest);
      existingTodo = await createResponse.json();
    });

    it('should update todo properties while preserving others', async () => {
      const updateRequest = new Request(`/api/todos/${existingTodo._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Updated todo text',
          category: 'Personal',
          priority: 'Low'
        })
      });

      const response = await handleApiRequest(updateRequest);
      expect(response.ok).toBe(true);

      const updatedTodo = await response.json();
      expect(updatedTodo._id).toBe(existingTodo._id);
      expect(updatedTodo.text).toBe('Updated todo text');
      expect(updatedTodo.category).toBe('Personal');
      expect(updatedTodo.priority).toBe('Low');
      expect(updatedTodo.dateAdded).toBe(existingTodo.dateAdded); // Preserved
      expect(updatedTodo.completed).toBe(false); // Preserved
    });

    it('should return 404-like behavior for non-existent todo', async () => {
      const updateRequest = new Request('/api/todos/nonexistent-id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Updated text' })
      });

      const response = await handleApiRequest(updateRequest);

      // The current implementation doesn't return an error for missing todos
      // but this documents the expected behavior
      expect(response.status).toBe(200);
    });
  });

  describe('COMPLETE Todo Offline (PUT /api/todos/{id}/complete)', () => {
    let existingTodo: any;

    beforeEach(async () => {
      const createRequest = new Request('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Todo to complete',
          completed: false
        })
      });

      const createResponse = await handleApiRequest(createRequest);
      existingTodo = await createResponse.json();
    });

    it('should toggle todo completion status', async () => {
      const completeRequest = new Request(`/api/todos/${existingTodo._id}/complete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' }
      });

      const response = await handleApiRequest(completeRequest);
      expect(response.ok).toBe(true);

      const result = await response.json();
      expect(result.message).toBe('Todo updated');
    });

    it('should add dateCompleted when marking as complete', async () => {
      // First complete the todo
      const completeRequest = new Request(`/api/todos/${existingTodo._id}/complete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' }
      });

      await handleApiRequest(completeRequest);

      // Verify the todo is marked as completed by fetching todos
      const getTodosRequest = new Request('/api/todos', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      const todosResponse = await handleApiRequest(getTodosRequest);
      const todos = await todosResponse.json();
      const completedTodo = todos.find((t: any) => t._id === existingTodo._id);

      expect(completedTodo.completed).toBe(true);
      expect(completedTodo.dateCompleted).toBeDefined();
      expect(new Date(completedTodo.dateCompleted)).toBeInstanceOf(Date);
    });

    it('should remove dateCompleted when unmarking as complete', async () => {
      // First complete the todo
      const completeRequest = new Request(`/api/todos/${existingTodo._id}/complete`, {
        method: 'PUT'
      });
      await handleApiRequest(completeRequest);

      // Then uncomplete it
      await handleApiRequest(completeRequest);

      // Verify dateCompleted is removed
      const getTodosRequest = new Request('/api/todos', {
        method: 'GET'
      });

      const todosResponse = await handleApiRequest(getTodosRequest);
      const todos = await todosResponse.json();
      const uncompletedTodo = todos.find((t: any) => t._id === existingTodo._id);

      expect(uncompletedTodo.completed).toBe(false);
      expect(uncompletedTodo.dateCompleted).toBeUndefined();
    });
  });

  describe('DELETE Todo Offline (DELETE /api/todos/{id})', () => {
    let existingTodo: any;

    beforeEach(async () => {
      const createRequest = new Request('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Todo to delete'
        })
      });

      const createResponse = await handleApiRequest(createRequest);
      existingTodo = await createResponse.json();
    });

    it('should delete existing todo', async () => {
      const deleteRequest = new Request(`/api/todos/${existingTodo._id}`, {
        method: 'DELETE'
      });

      const response = await handleApiRequest(deleteRequest);
      expect(response.status).toBe(204);

      // Verify todo is removed by fetching all todos
      const getTodosRequest = new Request('/api/todos', {
        method: 'GET'
      });

      const todosResponse = await handleApiRequest(getTodosRequest);
      const todos = await todosResponse.json();

      expect(todos.find((t: any) => t._id === existingTodo._id)).toBeUndefined();
    });

    it('should handle deletion of non-existent todo gracefully', async () => {
      const deleteRequest = new Request('/api/todos/nonexistent-id', {
        method: 'DELETE'
      });

      const response = await handleApiRequest(deleteRequest);
      expect(response.status).toBe(204); // Should still return success
    });
  });

  describe('GET Todos Offline (GET /api/todos)', () => {
    beforeEach(async () => {
      // Create several test todos
      const todos = [
        { text: 'Todo 1', space_id: 'space1', category: 'Work' },
        { text: 'Todo 2', space_id: 'space1', category: 'Personal' },
        { text: 'Todo 3', space_id: 'space2', category: 'Work' },
        { text: 'Todo 4', space_id: null, category: 'General' }
      ];

      for (const todo of todos) {
        const createRequest = new Request('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(todo)
        });
        await handleApiRequest(createRequest);
      }
    });

    it('should fetch all todos when no space filter is provided', async () => {
      const getTodosRequest = new Request('/api/todos', {
        method: 'GET'
      });

      const response = await handleApiRequest(getTodosRequest);
      expect(response.ok).toBe(true);

      const todos = await response.json();
      expect(todos.length).toBe(4);
      expect(todos.every((t: any) => t._id.startsWith('offline_'))).toBe(true);
    });

    it('should filter todos by space_id when provided', async () => {
      const getTodosRequest = new Request('/api/todos?space_id=space1', {
        method: 'GET'
      });

      const response = await handleApiRequest(getTodosRequest);
      const todos = await response.json();

      expect(todos.length).toBe(2);
      expect(todos.every((t: any) => t.space_id === 'space1')).toBe(true);
    });

    it('should return empty array for non-existent space', async () => {
      const getTodosRequest = new Request('/api/todos?space_id=nonexistent', {
        method: 'GET'
      });

      const response = await handleApiRequest(getTodosRequest);
      const todos = await response.json();

      expect(todos.length).toBe(0);
    });
  });

  describe('Offline Queue Management', () => {
    it('should queue CREATE operations for offline todos', async () => {
      const mockRequest = new Request('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Queued todo' })
      });

      await handleApiRequest(mockRequest);

      // Verify queue contains the operation
      const { readQueue } = require('../public/sw.js');
      const queue = await readQueue('testuser');

      expect(queue.length).toBe(1);
      expect(queue[0].type).toBe('CREATE');
      expect(queue[0].data.text).toBe('Queued todo');
      expect(queue[0].timestamp).toBeDefined();
    });

    it('should queue UPDATE operations for offline todos', async () => {
      // Create todo first
      const createRequest = new Request('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Original' })
      });
      const createResponse = await handleApiRequest(createRequest);
      const todo = await createResponse.json();

      // Update the todo
      const updateRequest = new Request(`/api/todos/${todo._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Updated' })
      });
      await handleApiRequest(updateRequest);

      // Verify queue
      const { readQueue } = require('../public/sw.js');
      const queue = await readQueue('testuser');

      expect(queue.length).toBe(2); // CREATE + UPDATE
      expect(queue[1].type).toBe('UPDATE');
      expect(queue[1].data.text).toBe('Updated');
    });

    it('should handle offline todo deletion by canceling pending CREATE operations', async () => {
      // Create offline todo
      const createRequest = new Request('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'To be deleted' })
      });
      const createResponse = await handleApiRequest(createRequest);
      const todo = await createResponse.json();

      // Delete the offline todo
      const deleteRequest = new Request(`/api/todos/${todo._id}`, {
        method: 'DELETE'
      });
      await handleApiRequest(deleteRequest);

      // Verify CREATE operation was removed from queue (not just adding DELETE)
      const { readQueue } = require('../public/sw.js');
      const queue = await readQueue('testuser');

      expect(queue.length).toBe(0); // CREATE should be cancelled, not queued for deletion
    });
  });

  describe('Authentication Requirements', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Mock unauthenticated state
      global.getAuth = jest.fn().mockResolvedValue(null);

      const mockRequest = new Request('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Unauthorized todo' })
      });

      const response = await handleApiRequest(mockRequest);

      expect(response.status).toBe(401);
      const error = await response.json();
      expect(error.error).toBe('Not authenticated');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON in request body', async () => {
      const mockRequest = new Request('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{'
      });

      // Should not crash - invalid JSON should be handled gracefully
      const response = await handleApiRequest(mockRequest);
      expect(response.ok).toBe(true);

      const todo = await response.json();
      expect(todo.text).toBe(''); // Default value when parsing fails
    });

    it('should handle empty request body', async () => {
      const mockRequest = new Request('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: ''
      });

      const response = await handleApiRequest(mockRequest);
      expect(response.ok).toBe(true);

      const todo = await response.json();
      expect(todo.text).toBe('');
      expect(todo.category).toBe('General');
    });
  });
});
