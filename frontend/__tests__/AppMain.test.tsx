import { render, screen, waitFor } from '@testing-library/react';
import AppMain from '../components/AppMain';
import { AuthProvider } from '../context/AuthContext';

describe('AppMain', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.resetAllMocks();
  });

  it('renders AuthForm when not authenticated', async () => {
    render(
      <AuthProvider>
        <AppMain />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument());
  });

  it('renders todo app when authenticated', async () => {
    localStorage.setItem('auth_token', 'abc');
    localStorage.setItem('auth_user', JSON.stringify({ email: 'test@test.com' }));

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.endsWith('/auth/me')) {
        return Promise.resolve({ ok: true, json: async () => ({ email: 'test@test.com' }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    }) as jest.Mock;

    render(
      <AuthProvider>
        <AppMain />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText(/Send Email Summary/i)).toBeInTheDocument());
  });
});
