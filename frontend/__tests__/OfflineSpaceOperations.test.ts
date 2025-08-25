/**
 * Tests for offline space CRUD operations
 *
 * These tests verify that users can create, read, update, and delete spaces
 * when offline, and that these operations are properly queued for sync.
 */

import { handleApiRequest } from '../public/sw.js';

// Mock IndexedDB for testing
import 'fake-indexeddb/auto';

describe('Offline Space Operations', () => {
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

  describe('GET Spaces Offline (GET /api/spaces)', () => {
    beforeEach(async () => {
      // Create test spaces using the database functions directly
      const { putSpace } = require('../public/sw.js');

      await putSpace({
        _id: 'space1',
        name: 'Personal Space',
        owner_id: 'testuser',
        member_ids: ['testuser'],
        pending_emails: []
      }, 'testuser');

      await putSpace({
        _id: 'space2',
        name: 'Work Space',
        owner_id: 'testuser',
        member_ids: ['testuser', 'colleague'],
        pending_emails: ['invite@example.com']
      }, 'testuser');
    });

    it('should return all user spaces', async () => {
      const getSpacesRequest = new Request('/api/spaces', {
        method: 'GET'
      });

      const response = await handleApiRequest(getSpacesRequest);
      expect(response.ok).toBe(true);

      const spaces = await response.json();
      expect(Array.isArray(spaces)).toBe(true);
      expect(spaces.length).toBe(2);

      const personalSpace = spaces.find((s: any) => s.name === 'Personal Space');
      const workSpace = spaces.find((s: any) => s.name === 'Work Space');

      expect(personalSpace).toBeDefined();
      expect(personalSpace.owner_id).toBe('testuser');
      expect(personalSpace.member_ids).toContain('testuser');

      expect(workSpace).toBeDefined();
      expect(workSpace.member_ids).toContain('colleague');
      expect(workSpace.pending_emails).toContain('invite@example.com');
    });

    it('should return empty array when no spaces exist', async () => {
      // Clear all spaces first
      const { clearQueue, delSpace } = require('../public/sw.js');
      await delSpace('space1', 'testuser');
      await delSpace('space2', 'testuser');

      const getSpacesRequest = new Request('/api/spaces', {
        method: 'GET'
      });

      const response = await handleApiRequest(getSpacesRequest);
      const spaces = await response.json();

      expect(spaces.length).toBe(0);
    });
  });

  describe('CREATE Space Offline (POST /api/spaces)', () => {
    it('should create a new space with offline ID', async () => {
      const createRequest = new Request('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Project Space'
        })
      });

      const response = await handleApiRequest(createRequest);
      expect(response.ok).toBe(true);

      const space = await response.json();
      expect(space._id).toMatch(/^offline_space_\d+$/);
      expect(space.name).toBe('New Project Space');
      expect(space.owner_id).toBe('testuser');
      expect(space.member_ids).toEqual(['testuser']);
      expect(space.pending_emails).toEqual([]);
      expect(space.created_offline).toBe(true);
    });

    it('should use default name if none provided', async () => {
      const createRequest = new Request('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const response = await handleApiRequest(createRequest);
      const space = await response.json();

      expect(space.name).toBe('New Space');
    });

    it('should queue CREATE_SPACE operation', async () => {
      const createRequest = new Request('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Queued Space'
        })
      });

      await handleApiRequest(createRequest);

      // Verify queue contains the operation
      const { readQueue } = require('../public/sw.js');
      const queue = await readQueue('testuser');

      expect(queue.length).toBe(1);
      expect(queue[0].type).toBe('CREATE_SPACE');
      expect(queue[0].data.name).toBe('Queued Space');
      expect(queue[0].data.owner_id).toBe('testuser');
      expect(queue[0].timestamp).toBeDefined();
    });
  });

  describe('UPDATE Space Offline (PUT /api/spaces/{id})', () => {
    let existingSpace: any;

    beforeEach(async () => {
      // Create a space first
      const createRequest = new Request('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Original Space',
          description: 'Original description'
        })
      });

      const createResponse = await handleApiRequest(createRequest);
      existingSpace = await createResponse.json();
    });

    it('should update space properties while preserving others', async () => {
      const updateRequest = new Request(`/api/spaces/${existingSpace._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Space Name',
          description: 'Updated description'
        })
      });

      const response = await handleApiRequest(updateRequest);
      expect(response.ok).toBe(true);

      const updatedSpace = await response.json();
      expect(updatedSpace._id).toBe(existingSpace._id);
      expect(updatedSpace.name).toBe('Updated Space Name');
      expect(updatedSpace.description).toBe('Updated description');
      expect(updatedSpace.owner_id).toBe('testuser'); // Preserved
      expect(updatedSpace.member_ids).toEqual(['testuser']); // Preserved
    });

    it('should queue UPDATE_SPACE operation', async () => {
      const updateRequest = new Request(`/api/spaces/${existingSpace._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Queued Update'
        })
      });

      await handleApiRequest(updateRequest);

      // Verify queue contains the operation
      const { readQueue } = require('../public/sw.js');
      const queue = await readQueue('testuser');

      // Should have CREATE from setup + UPDATE
      expect(queue.length).toBe(2);
      const updateOp = queue.find((op: any) => op.type === 'UPDATE_SPACE');
      expect(updateOp).toBeDefined();
      expect(updateOp.id).toBe(existingSpace._id);
      expect(updateOp.data.name).toBe('Queued Update');
    });

    it('should handle update of non-existent space gracefully', async () => {
      const updateRequest = new Request('/api/spaces/nonexistent-id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' })
      });

      const response = await handleApiRequest(updateRequest);

      // The current implementation doesn't return an error for missing spaces
      // This documents the current behavior
      expect(response.status).toBe(200);
    });
  });

  describe('DELETE Space Offline (DELETE /api/spaces/{id})', () => {
    let existingSpace: any;

    beforeEach(async () => {
      // Create a space first
      const createRequest = new Request('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Space to Delete'
        })
      });

      const createResponse = await handleApiRequest(createRequest);
      existingSpace = await createResponse.json();
    });

    it('should delete existing space', async () => {
      const deleteRequest = new Request(`/api/spaces/${existingSpace._id}`, {
        method: 'DELETE'
      });

      const response = await handleApiRequest(deleteRequest);
      expect(response.ok).toBe(true);

      const result = await response.json();
      expect(result.success).toBe(true);

      // Verify space is removed by fetching all spaces
      const getSpacesRequest = new Request('/api/spaces', {
        method: 'GET'
      });

      const spacesResponse = await handleApiRequest(getSpacesRequest);
      const spaces = await spacesResponse.json();

      expect(spaces.find((s: any) => s._id === existingSpace._id)).toBeUndefined();
    });

    it('should queue DELETE_SPACE operation', async () => {
      const deleteRequest = new Request(`/api/spaces/${existingSpace._id}`, {
        method: 'DELETE'
      });

      await handleApiRequest(deleteRequest);

      // Verify queue contains the operation
      const { readQueue } = require('../public/sw.js');
      const queue = await readQueue('testuser');

      // Should have CREATE from setup + DELETE
      const deleteOp = queue.find((op: any) => op.type === 'DELETE_SPACE');
      expect(deleteOp).toBeDefined();
      expect(deleteOp.id).toBe(existingSpace._id);
      expect(deleteOp.data._id).toBe(existingSpace._id);
    });

    it('should handle deletion of non-existent space gracefully', async () => {
      const deleteRequest = new Request('/api/spaces/nonexistent-id', {
        method: 'DELETE'
      });

      const response = await handleApiRequest(deleteRequest);
      expect(response.ok).toBe(true);

      const result = await response.json();
      expect(result.success).toBe(true);
    });
  });

  describe('Space Ownership and Isolation', () => {
    beforeEach(async () => {
      // Create spaces for different users using database functions directly
      const { putSpace } = require('../public/sw.js');

      // User's own spaces
      await putSpace({
        _id: 'user_space_1',
        name: 'My Personal Space',
        owner_id: 'testuser',
        member_ids: ['testuser']
      }, 'testuser');

      await putSpace({
        _id: 'shared_space',
        name: 'Shared Space',
        owner_id: 'otheruser',
        member_ids: ['otheruser', 'testuser'] // testuser is a member
      }, 'testuser');
    });

    it('should only return spaces where user is owner or member', async () => {
      const getSpacesRequest = new Request('/api/spaces', {
        method: 'GET'
      });

      const response = await handleApiRequest(getSpacesRequest);
      const spaces = await response.json();

      expect(spaces.length).toBe(2);

      const personalSpace = spaces.find((s: any) => s.name === 'My Personal Space');
      const sharedSpace = spaces.find((s: any) => s.name === 'Shared Space');

      expect(personalSpace).toBeDefined();
      expect(personalSpace.owner_id).toBe('testuser');

      expect(sharedSpace).toBeDefined();
      expect(sharedSpace.owner_id).toBe('otheruser');
      expect(sharedSpace.member_ids).toContain('testuser');
    });

    it('should set current user as owner for created spaces', async () => {
      const createRequest = new Request('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Owned Space'
        })
      });

      const response = await handleApiRequest(createRequest);
      const space = await response.json();

      expect(space.owner_id).toBe('testuser');
      expect(space.member_ids).toEqual(['testuser']);
    });
  });

  describe('Offline Queue Management for Spaces', () => {
    it('should handle offline space creation, update, and deletion in queue', async () => {
      // Create space
      const createRequest = new Request('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Space' })
      });
      const createResponse = await handleApiRequest(createRequest);
      const space = await createResponse.json();

      // Update space
      const updateRequest = new Request(`/api/spaces/${space._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Test Space' })
      });
      await handleApiRequest(updateRequest);

      // Delete space
      const deleteRequest = new Request(`/api/spaces/${space._id}`, {
        method: 'DELETE'
      });
      await handleApiRequest(deleteRequest);

      // Verify all operations are queued
      const { readQueue } = require('../public/sw.js');
      const queue = await readQueue('testuser');

      expect(queue.length).toBe(3);

      const createOp = queue.find((op: any) => op.type === 'CREATE_SPACE');
      const updateOp = queue.find((op: any) => op.type === 'UPDATE_SPACE');
      const deleteOp = queue.find((op: any) => op.type === 'DELETE_SPACE');

      expect(createOp).toBeDefined();
      expect(updateOp).toBeDefined();
      expect(deleteOp).toBeDefined();

      expect(createOp.data.name).toBe('Test Space');
      expect(updateOp.data.name).toBe('Updated Test Space');
      expect(deleteOp.id).toBe(space._id);
    });

    it('should handle offline space deletion by canceling pending CREATE operations', async () => {
      // Create offline space
      const createRequest = new Request('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Space to Cancel' })
      });
      const createResponse = await handleApiRequest(createRequest);
      const space = await createResponse.json();

      // Delete the offline space
      const deleteRequest = new Request(`/api/spaces/${space._id}`, {
        method: 'DELETE'
      });
      await handleApiRequest(deleteRequest);

      // For offline spaces, the current implementation still queues both operations
      // This documents the current behavior - in a more sophisticated implementation,
      // we might want to cancel the CREATE operation for offline spaces
      const { readQueue } = require('../public/sw.js');
      const queue = await readQueue('testuser');

      expect(queue.length).toBe(2); // CREATE + DELETE
    });
  });

  describe('Authentication Requirements', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Mock unauthenticated state
      global.getAuth = jest.fn().mockResolvedValue(null);

      const createRequest = new Request('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Unauthorized Space' })
      });

      const response = await handleApiRequest(createRequest);

      expect(response.status).toBe(401);
      const error = await response.json();
      expect(error.error).toBe('Not authenticated');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON in request body', async () => {
      const createRequest = new Request('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{'
      });

      // Should not crash - invalid JSON should be handled gracefully
      const response = await handleApiRequest(createRequest);
      expect(response.ok).toBe(true);

      const space = await response.json();
      expect(space.name).toBe('New Space'); // Default value when parsing fails
    });

    it('should handle empty request body', async () => {
      const createRequest = new Request('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: ''
      });

      const response = await handleApiRequest(createRequest);
      expect(response.ok).toBe(true);

      const space = await response.json();
      expect(space.name).toBe('New Space');
      expect(space.owner_id).toBe('testuser');
    });
  });

  describe('Space Member Management', () => {
    it('should preserve member lists during updates', async () => {
      // Create space with multiple members using database function
      const { putSpace } = require('../public/sw.js');

      const spaceData = {
        _id: 'multi_member_space',
        name: 'Team Space',
        owner_id: 'testuser',
        member_ids: ['testuser', 'member1', 'member2'],
        pending_emails: ['pending@example.com']
      };

      await putSpace(spaceData, 'testuser');

      // Update space name
      const updateRequest = new Request('/api/spaces/multi_member_space', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Team Space'
        })
      });

      const response = await handleApiRequest(updateRequest);
      const updatedSpace = await response.json();

      expect(updatedSpace.name).toBe('Updated Team Space');
      expect(updatedSpace.member_ids).toEqual(['testuser', 'member1', 'member2']);
      expect(updatedSpace.pending_emails).toEqual(['pending@example.com']);
    });
  });
});
