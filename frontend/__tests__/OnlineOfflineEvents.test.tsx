import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import AIToDoListApp from '../components/AIToDoListApp';

// Mock the fetch function
global.fetch = jest.fn();

// Mock service worker
Object.defineProperty(navigator, 'serviceWorker', {
  value: {
    controller: {
      postMessage: jest.fn()
    },
    getRegistration: jest.fn().mockResolvedValue({
      update: jest.fn()
    })
  },
  configurable: true
});

describe('Online/Offline Event Handling', () => {
  const mockUser = {
    id: 'user123',
    email: 'test@example.com',
    first_name: 'Test',
    summary_hour: 9,
    summary_minute: 0,
    email_instructions: '',
    email_enabled: false
  };

  const mockToken = 'mock-token-123';
  const mockProps = {
    user: mockUser,
    token: mockToken,
    onLogout: jest.fn(),
    onShowEmailSettings: jest.fn(),
    showEmailSettings: false,
    onCloseEmailSettings: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => []
    });
  });

  test('component adds online event listener on mount', async () => {
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

    await act(async () => {
      render(<AIToDoListApp {...mockProps} />);
    });

    expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

    addEventListenerSpy.mockRestore();
  });

  test('online event triggers todos refresh', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    await act(async () => {
      render(<AIToDoListApp {...mockProps} />);
    });

    // Simulate going online
    await act(async () => {
      const onlineEvent = new Event('online');
      window.dispatchEvent(onlineEvent);
    });

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Browser came back online');
      expect(fetch).toHaveBeenCalledWith('/todos', expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer mock-token-123'
        })
      }));
    });

    consoleSpy.mockRestore();
  });

  test('offline event logs but does not trigger refresh', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    await act(async () => {
      render(<AIToDoListApp {...mockProps} />);
    });

    // Clear initial fetch calls from component mount
    jest.clearAllMocks();

    // Simulate going offline
    await act(async () => {
      const offlineEvent = new Event('offline');
      window.dispatchEvent(offlineEvent);
    });

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Browser went offline');
    });

    // Should not trigger additional fetch calls
    expect(fetch).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  test('online event does not trigger refresh when no token/user', async () => {
    const propsWithoutAuth = {
      ...mockProps,
      user: null,
      token: ''
    };

    await act(async () => {
      render(<AIToDoListApp {...propsWithoutAuth} />);
    });

    // Clear initial mount calls
    jest.clearAllMocks();

    // Simulate going online
    await act(async () => {
      const onlineEvent = new Event('online');
      window.dispatchEvent(onlineEvent);
    });

    await waitFor(() => {
      // Should not make any fetch calls when unauthenticated
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  test('event listeners are properly cleaned up on unmount', async () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = await act(async () => {
      return render(<AIToDoListApp {...mockProps} />);
    });

    await act(async () => {
      unmount();
    });

    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

    removeEventListenerSpy.mockRestore();
  });

  test('multiple online events do not cause race conditions', async () => {
    await act(async () => {
      render(<AIToDoListApp {...mockProps} />);
    });

    // Clear initial mount calls
    jest.clearAllMocks();

    // Simulate multiple rapid online events
    await act(async () => {
      const onlineEvent = new Event('online');
      window.dispatchEvent(onlineEvent);
      window.dispatchEvent(onlineEvent);
      window.dispatchEvent(onlineEvent);
    });

    await waitFor(() => {
      // Should handle multiple events gracefully
      expect(fetch).toHaveBeenCalledWith('/todos', expect.any(Object));
    });

    // All calls should be identical - no corruption
    const fetchCalls = (fetch as jest.Mock).mock.calls;
    expect(fetchCalls.length).toBeGreaterThan(0);

    fetchCalls.forEach(call => {
      expect(call[1]).toEqual(expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer mock-token-123'
        })
      }));
    });
  });

  test('service worker sync message is not sent on online event', async () => {
    // The immediate replacement approach relies on the service worker's internal sync logic
    // triggered by the GET /todos call, not explicit sync messages

    await act(async () => {
      render(<AIToDoListApp {...mockProps} />);
    });

    // Clear any initial setup calls
    jest.clearAllMocks();

    // Simulate going online
    await act(async () => {
      const onlineEvent = new Event('online');
      window.dispatchEvent(onlineEvent);
    });

    // Should NOT send sync message since service worker handles this internally
    expect(navigator.serviceWorker.controller.postMessage).not.toHaveBeenCalledWith({
      type: 'SYNC_WHEN_ONLINE'
    });
  });
});

describe('Immediate Replacement Integration with UI', () => {
  test('documents the immediate replacement workflow from UI perspective', () => {
    // This test documents the expected workflow:
    // 1. User goes offline, creates todos with offline IDs
    // 2. User comes back online
    // 3. UI triggers fetchTodos() via online event listener
    // 4. Service worker intercepts GET /todos
    // 5. Service worker syncs pending operations with concurrency protection
    // 6. Successful syncs immediately replace offline todos with server versions
    // 7. Failed syncs preserve offline todos for retry
    // 8. Service worker fetches fresh server data and merges with remaining offline todos
    // 9. UI displays the correct data with server IDs + any unsynced offline todos

    expect(true).toBe(true); // Documentation test
  });
});
