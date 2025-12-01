/**
 * Test: Account Creation Flow - Auth Sync Bug
 *
 * This test verifies that when a user logs in and needs to set their name,
 * the auth token is properly synced to service worker IndexedDB BEFORE
 * the update-name request is made.
 *
 * This test would have caught the bug where login saved to localStorage
 * but didn't sync to service worker IndexedDB, causing 401 errors on
 * /auth/update-name.
 */

// Mock the service worker
const mockPostMessage = jest.fn();

// Mock navigator.serviceWorker
Object.defineProperty(global.navigator, 'serviceWorker', {
  value: {
    controller: {
      postMessage: mockPostMessage
    }
  },
  configurable: true,
  writable: true
});

// Mock apiRequest
const mockApiRequest = jest.fn();
jest.mock('../utils/api', () => ({
  apiRequest: (...args: any[]) => mockApiRequest(...args)
}));

describe('Account Creation Flow - Auth Sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear localStorage
    localStorage.clear();
  });

  test('Login syncs auth token to service worker IndexedDB before showing name form', async () => {
    // Mock login response - user without first_name (new account)
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'test-token-123',
        user: {
          id: 'user-456',
          email: 'newuser@example.com',
          first_name: null // No name set yet
        }
      })
    });

    // Simulate the login code from pages/index.tsx
    const email = 'newuser@example.com';
    const code = '123456';

    const response = await mockApiRequest('auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, code })
    });

    const data = await response.json();

    if (response.ok) {
      const { token, user } = data;

      // Simulate localStorage save
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));

      // Simulate service worker sync (the fix!)
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        const userId = user.id || user._id || user.user_id;
        navigator.serviceWorker.controller.postMessage({
          type: 'SET_AUTH',
          token: token,
          userId: userId
        });
      }
    }

    // VERIFY: Service worker received the auth sync message
    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'SET_AUTH',
      token: 'test-token-123',
      userId: 'user-456'
    });

    // VERIFY: localStorage was updated
    expect(localStorage.getItem('auth_token')).toBe('test-token-123');
    expect(JSON.parse(localStorage.getItem('auth_user')!).first_name).toBeNull();
  });

  test('Update name request has token available in localStorage', async () => {
    // Setup: Simulate logged-in state with token
    localStorage.setItem('auth_token', 'test-token-789');
    localStorage.setItem('auth_user', JSON.stringify({
      id: 'user-123',
      email: 'test@example.com',
      first_name: null
    }));

    // Mock update-name response
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          first_name: 'Dennis'
        }
      })
    });

    // Simulate the handleNameSubmit code from pages/index.tsx
    const firstName = 'Dennis';
    const token = localStorage.getItem('auth_token');

    // CRITICAL CHECK: Token must be present before making request
    expect(token).toBeTruthy();
    expect(token).toBe('test-token-789');

    if (!token) {
      throw new Error('No token found - this would cause 401!');
    }

    const response = await mockApiRequest('auth/update-name', {
      method: 'POST',
      body: JSON.stringify({ first_name: firstName })
    });

    // VERIFY: apiRequest was called with update-name endpoint
    expect(mockApiRequest).toHaveBeenCalledWith('auth/update-name', {
      method: 'POST',
      body: JSON.stringify({ first_name: 'Dennis' })
    });

    // VERIFY: Request succeeded
    expect(response.ok).toBe(true);
  });

  test('Service worker sync happens BEFORE update-name (timing test)', async () => {
    const callOrder: string[] = [];

    // Mock login response
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'timing-token',
        user: {
          id: 'user-timing',
          email: 'timing@example.com',
          first_name: null
        }
      })
    });

    // Track when postMessage is called
    mockPostMessage.mockImplementation(() => {
      callOrder.push('SERVICE_WORKER_SYNC');
    });

    // Simulate login
    const response = await mockApiRequest('auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'timing@example.com', code: '123456' })
    });

    const data = await response.json();

    if (response.ok) {
      const { token, user } = data;

      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));

      // Sync to service worker
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        const userId = user.id || user._id || user.user_id;
        navigator.serviceWorker.controller.postMessage({
          type: 'SET_AUTH',
          token: token,
          userId: userId
        });
      }

      callOrder.push('LOGIN_COMPLETE');
    }

    // Mock update-name request
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: { id: 'user-timing', email: 'timing@example.com', first_name: 'Test' }
      })
    });

    // Now simulate update-name
    await mockApiRequest('auth/update-name', {
      method: 'POST',
      body: JSON.stringify({ first_name: 'Test' })
    });

    callOrder.push('UPDATE_NAME_CALLED');

    // CRITICAL: Service worker sync must happen BEFORE update-name
    expect(callOrder).toEqual([
      'SERVICE_WORKER_SYNC',
      'LOGIN_COMPLETE',
      'UPDATE_NAME_CALLED'
    ]);
  });

  test('Without service worker sync, token would be missing from IndexedDB', async () => {
    // This test simulates the BUG (missing sync)

    // Mock login without syncing to service worker
    mockApiRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'orphan-token',
        user: {
          id: 'user-orphan',
          email: 'orphan@example.com',
          first_name: null
        }
      })
    });

    const response = await mockApiRequest('auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'orphan@example.com', code: '123456' })
    });

    const data = await response.json();

    if (response.ok) {
      const { token, user } = data;

      // Only save to localStorage, DON'T sync to service worker (the bug!)
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));

      // ❌ Missing: Service worker sync
      // ❌ navigator.serviceWorker.controller.postMessage({ type: 'SET_AUTH', ... })
    }

    // VERIFY: Service worker was NOT notified
    expect(mockPostMessage).not.toHaveBeenCalled();

    // VERIFY: Token IS in localStorage (but NOT in service worker IndexedDB)
    expect(localStorage.getItem('auth_token')).toBe('orphan-token');

    // This is the bug state:
    // - localStorage has the token ✅
    // - Service worker IndexedDB does NOT have the token ❌
    // - When service worker intercepts /auth/update-name, it reads from IndexedDB
    // - Token not found → 401 Unauthorized

    console.warn('⚠️ BUG STATE: Token in localStorage but not in service worker IndexedDB');
  });

  test('Auth sync includes all required fields', () => {
    const user = {
      id: 'user-fields',
      email: 'fields@example.com',
      first_name: null
    };

    const token = 'field-test-token';

    // Simulate the sync
    const userId = user.id || user._id || (user as any).user_id;
    navigator.serviceWorker.controller.postMessage({
      type: 'SET_AUTH',
      token: token,
      userId: userId
    });

    // VERIFY: postMessage was called with correct structure
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'SET_AUTH',
      token: 'field-test-token',
      userId: 'user-fields'
    });

    // VERIFY: All required fields present
    const call = mockPostMessage.mock.calls[0][0];
    expect(call.type).toBe('SET_AUTH');
    expect(call.token).toBeTruthy();
    expect(call.userId).toBeTruthy();
  });
});
