import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuthForm from '../components/AuthForm';
import { AuthProvider } from '../context/AuthContext';

describe('AuthForm', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.resetAllMocks();
  });

  it('submits email and shows code input', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ message: 'sent' }) }) as jest.Mock;

    render(
      <AuthProvider>
        <AuthForm />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: 'test@example.com' } });
    fireEvent.submit(screen.getByRole('button', { name: /Send Verification Code/i }).closest('form')!);

    await waitFor(() => expect(screen.getByLabelText(/Verification Code/i)).toBeInTheDocument());
  });
});
