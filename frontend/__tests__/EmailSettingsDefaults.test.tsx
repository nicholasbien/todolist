import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import AIToDoListApp from '../components/AIToDoListApp';
import { useAuth } from '../context/AuthContext';

jest.mock('../context/AuthContext', () => {
  const original = jest.requireActual('../context/AuthContext');
  return { ...original, useAuth: jest.fn() };
});

Object.defineProperty(navigator, 'serviceWorker', {
  value: {
    controller: { postMessage: jest.fn() },
    getRegistration: jest.fn().mockResolvedValue({ update: jest.fn() })
  },
  configurable: true
});

describe('Email settings initialization', () => {
  test('personal space is checked by default', async () => {
    const mockUser = { id: 'user1', email: 'test@example.com' } as any;
    const mockToken = 'token123';

    const mockAuthenticatedFetch = jest.fn(async (url: string) => {
      if (url === '/api/auth/me') {
        return {
          ok: true,
          json: async () => ({
            summary_hour: 9,
            summary_minute: 0,
            email_instructions: '',
            email_enabled: true,
            email_spaces: []
          })
        } as any;
      }
      if (url === '/api/spaces') {
        return {
          ok: true,
          json: async () => ([
            { _id: 'space1', name: 'Personal', is_default: true },
            { _id: 'space2', name: 'Work', is_default: false }
          ])
        } as any;
      }
      return { ok: true, json: async () => [] } as any;
    });

    (useAuth as jest.Mock).mockReturnValue({
      logout: jest.fn(),
      clearAuthExpired: jest.fn(),
      authenticatedFetch: mockAuthenticatedFetch
    });

    await act(async () => {
      render(
        <AIToDoListApp
          user={mockUser}
          token={mockToken}
          onLogout={jest.fn()}
          onShowEmailSettings={jest.fn()}
          showEmailSettings={true}
          onCloseEmailSettings={jest.fn()}
        />
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Personal')).toBeChecked();
    });
  });
});
