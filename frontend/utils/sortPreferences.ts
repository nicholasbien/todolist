export type SortMode = 'auto' | 'date' | 'dueDate' | 'custom';

function getUserSortScope(user: { id?: string; _id?: string; email?: string } | null | undefined): string {
  return user?.id || user?._id || user?.email || 'anonymous';
}

function getSpaceSortScope(spaceId?: string | null): string {
  return spaceId || 'default';
}

export function getSortModeStorageKey(
  user: { id?: string; _id?: string; email?: string } | null | undefined,
  spaceId?: string | null
): string {
  const userScope = getUserSortScope(user);
  const spaceScope = getSpaceSortScope(spaceId);
  return `sortMode_${userScope}_${spaceScope}`;
}

export function loadSortModePreference(
  user: { id?: string; _id?: string; email?: string } | null | undefined,
  spaceId?: string | null
): SortMode {
  const key = getSortModeStorageKey(user, spaceId);
  const current = localStorage.getItem(key) as SortMode | null;
  if (current) return current;

  // Backward compatibility for existing installs that used space-only keys.
  const legacy = localStorage.getItem(`sortMode_${getSpaceSortScope(spaceId)}`) as SortMode | null;
  return legacy || 'auto';
}

export function saveSortModePreference(
  user: { id?: string; _id?: string; email?: string } | null | undefined,
  spaceId: string | null | undefined,
  mode: SortMode
) {
  localStorage.setItem(getSortModeStorageKey(user, spaceId), mode);
}
