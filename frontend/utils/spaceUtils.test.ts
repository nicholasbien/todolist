import { sortSpaces, Space } from './spaceUtils';

describe('sortSpaces', () => {
  it('places personal space first and sorts others alphabetically', () => {
    const spaces: Space[] = [
      { _id: '2', name: 'Work' },
      { _id: '1', name: 'Personal', is_default: true },
      { _id: '3', name: 'Family' }
    ];
    const result = sortSpaces(spaces).map(s => s.name);
    expect(result).toEqual(['Personal', 'Family', 'Work']);
  });
});
