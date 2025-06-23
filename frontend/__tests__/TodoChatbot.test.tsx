import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TodoChatbot from '../components/TodoChatbot';

describe('TodoChatbot', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('sends question and shows answer', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ answer: '42' })
    });

    render(<TodoChatbot token="abc" />);

    fireEvent.change(screen.getByPlaceholderText(/Ask a question/i), { target: { value: 'What is the meaning?' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith('/chat', expect.any(Object));
  });
});
