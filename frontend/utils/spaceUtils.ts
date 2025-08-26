export interface Space {
  _id: string;
  name: string;
  is_default?: boolean;
  owner_id?: string;
  member_ids?: string[];
  pending_emails?: string[];
}

/**
 * Sort spaces so that personal (default) space comes first followed by others in alphabetical order
 */
export function sortSpaces(spaces: Space[]): Space[] {
  const personal = spaces.filter(s => s.is_default);
  const others = spaces.filter(s => !s.is_default).sort((a, b) => a.name.localeCompare(b.name));
  return [...personal, ...others];
}
