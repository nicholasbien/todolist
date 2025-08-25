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

    const mockActiveSpace = { _id: 'test-space-123' };
    render(<TodoChatbot token="abc" activeSpace={mockActiveSpace} />);

    fireEvent.change(screen.getByPlaceholderText(/Ask a question/i), { target: { value: 'What is the meaning?' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith('/api/chat', expect.any(Object));
  });
});
