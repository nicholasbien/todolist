import { render } from '@testing-library/react';
import { MessageRenderer } from '../components/MessageRenderer';

describe('MessageRenderer', () => {
  it('renders numbered lists with sequential items', () => {
    const content = '1. First\n2. Second\n3. Third';
    const { container } = render(<MessageRenderer content={content} />);
    const ol = container.querySelector('ol');
    expect(ol).not.toBeNull();
    expect(ol?.className).toContain('list-decimal');
    const items = ol?.querySelectorAll('li');
    expect(items?.length).toBe(3);
  });
});
