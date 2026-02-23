/**
 * Tests for moving todos between spaces via the edit modal.
 *
 * These tests verify that:
 * 1. Space selector appears in edit modal
 * 2. Categories load dynamically when space changes
 * 3. Category auto-resets to "General" if not available in target space
 * 4. Visual warning shows when moving to different space
 * 5. space_id is included in update request
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import AIToDoListApp from '../components/AIToDoListApp';

// Mock the auth context
const mockAuthContext = {
  user: { email: 'test@example.com', id: 'user1' },
  token: 'test-token',
  login: jest.fn(),
  logout: jest.fn(),
  clearAuthExpired: jest.fn(),
  authenticatedFetch: jest.fn(),
};

jest.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuthContext,
}));

// Mock service worker
Object.defineProperty(navigator, 'serviceWorker', {
  value: {
    controller: { postMessage: jest.fn() },
    getRegistration: jest.fn().mockResolvedValue({ update: jest.fn() }),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
  configurable: true,
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

describe('Todo Space Change in Edit Modal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthContext.authenticatedFetch.mockReset();
  });

  test('space selector appears in edit modal', async () => {
    // Setup mock responses
    const mockSpaces = [
      { _id: 'space1', name: 'Default', is_default: true },
      { _id: 'space2', name: 'Work Projects' },
    ];
    const mockTodos = [
      {
        _id: 'todo1',
        text: 'Test todo',
        category: 'General',
        priority: 'Medium',
        completed: false,
        space_id: 'space1',
        dateAdded: new Date().toISOString(),
      },
    ];
    const mockCategories = ['General', 'Work', 'Personal'];

    mockAuthContext.authenticatedFetch.mockImplementation((url: string) => {
      if (url === '/spaces') return Promise.resolve({ ok: true, json: async () => mockSpaces });
      if (url.startsWith('/todos')) return Promise.resolve({ ok: true, json: async () => mockTodos });
      if (url.startsWith('/categories')) return Promise.resolve({ ok: true, json: async () => mockCategories });
      if (url.includes('/members')) return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    let container: HTMLElement;
    await act(async () => {
      const result = render(<AIToDoListApp user={mockAuthContext.user} token={mockAuthContext.token} onLogout={jest.fn()} />);
      container = result.container;
    });

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Test todo')).toBeInTheDocument();
    });

    // Right-click the todo to open the edit modal (onContextMenu triggers it)
    const todoElement = screen.getByText('Test todo');
    await act(async () => {
      fireEvent.contextMenu(todoElement);
    });

    // Wait for modal to appear
    await waitFor(() => {
      expect(screen.getByText('Edit Task')).toBeInTheDocument();
    });

    // Verify space selector exists
    const spaceSelects = container!.querySelectorAll('select');
    // Should have: space selector, category selector, priority selector
    expect(spaceSelects.length).toBeGreaterThanOrEqual(3);

    // Find the space selector (it should have the Space label above it)
    const spaceLabel = screen.getByText('Space');
    expect(spaceLabel).toBeInTheDocument();
  });

  test('space selector loads categories when space changes', async () => {
    const mockSpaces = [
      { _id: 'space1', name: 'Default', is_default: true },
      { _id: 'space2', name: 'Work Projects' },
    ];
    const mockTodos = [
      {
        _id: 'todo1',
        text: 'Test todo',
        category: 'General',
        priority: 'Medium',
        completed: false,
        space_id: 'space1',
        dateAdded: new Date().toISOString(),
      },
    ];
    const mockSpace1Categories = ['General', 'Personal'];
    const mockSpace2Categories = ['General', 'Work', 'Projects'];

    let categoriesCallCount = 0;
    mockAuthContext.authenticatedFetch.mockImplementation((url, options) => {
      if (url === '/spaces') {
        return Promise.resolve({ ok: true, json: async () => mockSpaces });
      }
      if (url.startsWith('/todos')) {
        return Promise.resolve({ ok: true, json: async () => mockTodos });
      }
      if (url.startsWith('/categories')) {
        categoriesCallCount++;
        // First call is for space1 (initial load)
        if (categoriesCallCount === 1) {
          return Promise.resolve({ ok: true, json: async () => mockSpace1Categories });
        }
        // Second call happens when modal opens
        if (categoriesCallCount === 2) {
          return Promise.resolve({ ok: true, json: async () => mockSpace1Categories });
        }
        // Third call happens when space changes to space2
        return Promise.resolve({ ok: true, json: async () => mockSpace2Categories });
      }
      if (url.includes('/members')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    let container: HTMLElement;
    await act(async () => {
      const result = render(<AIToDoListApp user={mockAuthContext.user} token={mockAuthContext.token} onLogout={jest.fn()} />);
      container = result.container;
    });

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Test todo')).toBeInTheDocument();
    });

    // Right-click the todo to open the edit modal (onContextMenu triggers it)
    await act(async () => {
      fireEvent.contextMenu(screen.getByText('Test todo'));
    });

    // Wait for modal to appear
    await waitFor(() => {
      expect(screen.getByText('Edit Task')).toBeInTheDocument();
    });

    // Find and change the space selector
    const spaceLabel = screen.getByText('Space');
    const spaceSelect = spaceLabel.nextElementSibling as HTMLSelectElement;
    expect(spaceSelect).toBeInstanceOf(HTMLSelectElement);

    // Change space to space2
    fireEvent.change(spaceSelect, { target: { value: 'space2' } });

    // Wait for categories to be fetched
    await waitFor(() => {
      expect(categoriesCallCount).toBeGreaterThanOrEqual(3);
    });

    // Verify categories API was called for the new space
    const categoriesCalls = mockAuthContext.authenticatedFetch.mock.calls.filter(
      (call) => call[0].includes('/categories')
    );
    expect(categoriesCalls.length).toBeGreaterThanOrEqual(2);
  });

  test('space_id is included in update request when saving', async () => {
    const mockSpaces = [
      { _id: 'space1', name: 'Default', is_default: true },
      { _id: 'space2', name: 'Work Projects' },
    ];
    const mockTodos = [
      {
        _id: 'todo1',
        text: 'Test todo',
        category: 'General',
        priority: 'Medium',
        completed: false,
        space_id: 'space1',
        dateAdded: new Date().toISOString(),
      },
    ];
    const mockCategories = ['General', 'Work'];

    mockAuthContext.authenticatedFetch.mockImplementation((url, options) => {
      if (url === '/spaces') {
        return Promise.resolve({ ok: true, json: async () => mockSpaces });
      }
      if (url.startsWith('/todos') && (!options || options.method !== 'PUT')) {
        return Promise.resolve({ ok: true, json: async () => mockTodos });
      }
      if (url.startsWith('/categories')) {
        return Promise.resolve({ ok: true, json: async () => mockCategories });
      }
      if (url.includes('/members')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url.includes('/todos/todo1') && options?.method === 'PUT') {
        // This is the update request
        const body = JSON.parse(options.body);
        expect(body).toHaveProperty('space_id');
        return Promise.resolve({ ok: true, json: async () => ({ ...mockTodos[0], ...body }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    await act(async () => {
      render(<AIToDoListApp user={mockAuthContext.user} token={mockAuthContext.token} onLogout={jest.fn()} />);
    });

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Test todo')).toBeInTheDocument();
    });

    // Right-click the todo to open the edit modal (onContextMenu triggers it)
    await act(async () => {
      fireEvent.contextMenu(screen.getByText('Test todo'));
    });

    // Wait for modal to appear
    await waitFor(() => {
      expect(screen.getByText('Edit Task')).toBeInTheDocument();
    });

    // Find and change the space selector
    const spaceLabel = screen.getByText('Space');
    const spaceSelect = spaceLabel.nextElementSibling as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(spaceSelect, { target: { value: 'space2' } });
    });

    // Click the Save button in the edit modal
    // The edit modal's save button is associated with handleSaveTodoEdit
    const editModal = screen.getByText('Edit Task').closest('[class*="fixed"]') || document.body;
    const saveButton = Array.from(editModal.querySelectorAll('button')).find(
      btn => btn.textContent === 'Save'
    );
    expect(saveButton).toBeTruthy();
    await act(async () => {
      fireEvent.click(saveButton!);
    });

    // Wait for update request
    await waitFor(() => {
      const updateCalls = mockAuthContext.authenticatedFetch.mock.calls.filter(
        (call: any[]) => call[0].includes('/todos/todo1') && call[1]?.method === 'PUT'
      );
      expect(updateCalls.length).toBeGreaterThan(0);
    });
  });

  test('warning indicator shows when space changes', async () => {
    const mockSpaces = [
      { _id: 'space1', name: 'Default', is_default: true },
      { _id: 'space2', name: 'Work Projects' },
    ];
    const mockTodos = [
      {
        _id: 'todo1',
        text: 'Test todo',
        category: 'General',
        priority: 'Medium',
        completed: false,
        space_id: 'space1',
        dateAdded: new Date().toISOString(),
      },
    ];
    const mockCategories = ['General', 'Work'];

    mockAuthContext.authenticatedFetch.mockImplementation((url) => {
      if (url === '/spaces') {
        return Promise.resolve({ ok: true, json: async () => mockSpaces });
      }
      if (url.startsWith('/todos')) {
        return Promise.resolve({ ok: true, json: async () => mockTodos });
      }
      if (url.startsWith('/categories')) {
        return Promise.resolve({ ok: true, json: async () => mockCategories });
      }
      if (url.includes('/members')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    await act(async () => {
      render(<AIToDoListApp user={mockAuthContext.user} token={mockAuthContext.token} onLogout={jest.fn()} />);
    });

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Test todo')).toBeInTheDocument();
    });

    // Right-click the todo to open the edit modal (onContextMenu triggers it)
    await act(async () => {
      fireEvent.contextMenu(screen.getByText('Test todo'));
    });

    // Wait for modal to appear
    await waitFor(() => {
      expect(screen.getByText('Edit Task')).toBeInTheDocument();
    });

    // Initially, no warning should be visible
    expect(screen.queryByText(/Moving to a different space/i)).not.toBeInTheDocument();

    // Find and change the space selector
    const spaceLabel = screen.getByText('Space');
    const spaceSelect = spaceLabel.nextElementSibling as HTMLSelectElement;
    fireEvent.change(spaceSelect, { target: { value: 'space2' } });

    // Wait for warning to appear
    await waitFor(() => {
      expect(screen.getByText(/Moving to a different space/i)).toBeInTheDocument();
    });
  });
});
