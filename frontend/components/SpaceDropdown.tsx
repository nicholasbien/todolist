import React, { useState, useRef, useEffect, useMemo } from 'react';
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

export default function SpaceDropdown({
  spaces,
  activeSpace,
  user,
  loadingSpaces,
  onSpaceSelect,
  onCreateSpace,
  onEditSpace
}: SpaceDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sortedSpaces = useMemo(() => sortSpaces(spaces), [spaces]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSpaceClick = (space: Space) => {
    onSpaceSelect(space);
    setIsOpen(false);
  };

  const handleCreateClick = () => {
    onCreateSpace();
    setIsOpen(false);
  };

  const handleEditClick = (space: Space, e: React.MouseEvent) => {
    e.stopPropagation();
    onEditSpace(space);
    setIsOpen(false);
  };

  const canEditSpace = (space: Space) => {
    return space.owner_id === (user?.id || user?._id);
  };

  const isCollaborativeSpace = (space: Space) => {
    return (space.member_ids?.length ?? 0) > 1 || (space.pending_emails?.length ?? 0) > 0;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Dropdown trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 hover:bg-gray-900 rounded-lg text-gray-100 text-sm transition-colors"
      >
        <span className="text-base">🏠</span>
        <span className="font-medium text-sm">
          {loadingSpaces ? 'Loading...' : activeSpace?.name || 'No Space'}
        </span>
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-black border border-gray-800 rounded-xl shadow-2xl z-50 max-h-80 overflow-y-auto">
          {/* Current spaces */}
          <div>
            {sortedSpaces.map((space, index) => (
              <div
                key={space._id}
                className={`group flex items-center justify-between px-4 py-3 hover:bg-gray-900 transition-colors ${
                  activeSpace?._id === space._id ? 'bg-gray-900 border-l-2 border-accent' : ''
                } ${index === 0 ? 'rounded-t-xl' : ''}`}
              >
                {/* Clickable area for space selection */}
                <div
                  className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                  onClick={() => handleSpaceClick(space)}
                >
                  <span className="text-sm flex-shrink-0">
                    {space.is_default ? '🏠' : isCollaborativeSpace(space) ? '👥' : '📁'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      {space.name}
                    </div>
                    {isCollaborativeSpace(space) && (
                      <div className="text-sm text-gray-400 leading-none">
                        {space.member_ids?.length || 0} member{(space.member_ids?.length || 0) !== 1 ? 's' : ''}
                        {(space.pending_emails?.length ?? 0) > 0 &&
                          `, ${space.pending_emails?.length} pending`
                        }
                      </div>
                    )}
                  </div>
                </div>

                {/* Edit button for owned spaces - always visible on mobile */}
                {!space.is_default && (canEditSpace(space) || isCollaborativeSpace(space)) && (
                  <button
                    onClick={(e) => handleEditClick(space, e)}
                    className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-gray-200 transition-all flex-shrink-0 opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label={canEditSpace(space) ? "Edit space" : "Space options"}
                    title={canEditSpace(space) ? "Edit space" : "Space options"}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-800"></div>

          {/* New space option */}
          <div>
            <button
              onClick={handleCreateClick}
              className="flex items-center gap-2 px-4 py-3 w-full text-left hover:bg-gray-900 text-gray-300 hover:text-gray-100 transition-colors rounded-b-xl"
            >
              <span className="text-sm">➕</span>
              <span>New Space...</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
