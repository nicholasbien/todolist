import React, { useMemo } from 'react';
import { sortSpaces } from '../utils/spaceUtils';

interface Space {
  _id: string;
  name: string;
  is_default?: boolean;
  owner_id?: string;
  member_ids?: string[];
  pending_emails?: string[];
}

interface SpaceDropdownProps {
  spaces: Space[];
  activeSpace: Space | null;
  user: any;
  loadingSpaces: boolean;
  onSpaceSelect: (space: Space) => void;
  onCreateSpace: () => void;
  onEditSpace: (space: Space) => void;
}

const NEW_SPACE_VALUE = '__new__';

export default function SpaceDropdown({
  spaces,
  activeSpace,
  user,
  loadingSpaces,
  onSpaceSelect,
  onCreateSpace,
  onEditSpace,
}: SpaceDropdownProps) {
  const sortedSpaces = useMemo(() => sortSpaces(spaces), [spaces]);

  const canEditSpace = (space: Space) =>
    !space.is_default &&
    (space.owner_id === (user?.id || user?._id) ||
      (space.member_ids?.length ?? 0) > 1 ||
      (space.pending_emails?.length ?? 0) > 0);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === NEW_SPACE_VALUE) {
      onCreateSpace();
    } else {
      const space = sortedSpaces.find((s) => s._id === value);
      if (space) onSpaceSelect(space);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <select
        value={activeSpace?._id ?? ''}
        onChange={handleChange}
        disabled={loadingSpaces}
        className="bg-transparent text-gray-100 text-sm rounded border-0 focus:outline-none cursor-pointer"
      >
        {loadingSpaces && <option value="">Loading...</option>}
        {sortedSpaces.map((space) => (
          <option key={space._id} value={space._id}>
            {space.name}
          </option>
        ))}
        <option value={NEW_SPACE_VALUE}>New Space…</option>
      </select>

      {activeSpace && canEditSpace(activeSpace) && (
        <button
          onClick={() => onEditSpace(activeSpace)}
          className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-900 rounded transition-colors"
          aria-label="Edit space"
          title="Edit space"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
      )}
    </div>
  );
}
