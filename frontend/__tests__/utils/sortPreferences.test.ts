import {
  getSortModeStorageKey,
  loadSortModePreference,
  saveSortModePreference,
  type SortMode,
} from '../../utils/sortPreferences';

describe('sortPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('builds user-and-space scoped storage keys', () => {
    const key = getSortModeStorageKey({ email: 'test@example.com' }, 'space-1');
    expect(key).toBe('sortMode_test@example.com_space-1');
  });

  it('saves and loads a per-space preference for a user', () => {
    const user = { email: 'test@example.com' };
    const mode: SortMode = 'dueDate';

    saveSortModePreference(user, 'space-abc', mode);

    expect(loadSortModePreference(user, 'space-abc')).toBe('dueDate');
    expect(loadSortModePreference(user, 'other-space')).toBe('auto');
  });

  it('falls back to legacy space-only key when scoped key is missing', () => {
    localStorage.setItem('sortMode_space-legacy', 'custom');

    expect(loadSortModePreference({ email: 'test@example.com' }, 'space-legacy')).toBe('custom');
  });
});
