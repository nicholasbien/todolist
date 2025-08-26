import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    authenticatedFetch: undefined
  })
}));

jest.mock('../context/OfflineContext', () => ({
  useOffline: () => false
}));

import JournalComponent from '../components/JournalComponent';

describe('JournalComponent date navigation', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2024-05-15'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test('arrows change the selected date', () => {
    render(<JournalComponent token="token" activeSpace={null} />);

    const dateInput = screen.getByLabelText('Date:') as HTMLInputElement;
    const prevButton = screen.getByRole('button', { name: 'Previous day' });
    const nextButton = screen.getByRole('button', { name: 'Next day' });

    expect(dateInput.value).toBe('2024-05-15');

    fireEvent.click(prevButton);
    expect(dateInput.value).toBe('2024-05-14');

    fireEvent.click(nextButton);
    fireEvent.click(nextButton);
    expect(dateInput.value).toBe('2024-05-16');
  });
});
