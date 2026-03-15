/**
 * Ensure an ISO timestamp string includes timezone information.
 *
 * Backend timestamps from Python's `datetime.utcnow().isoformat()` omit the
 * "Z" suffix, causing JavaScript's `new Date()` to parse them as local time
 * instead of UTC.  This helper appends "Z" when no timezone indicator is
 * present so the resulting Date object represents the correct instant.
 */
export function ensureTimezone(isoString: string): string {
  if (!/[Zz]|[+-]\d{2}:?\d{2}$/.test(isoString)) {
    return isoString + 'Z';
  }
  return isoString;
}

/**
 * Parse a backend timestamp string into a proper Date object.
 *
 * Handles the common case where the backend returns UTC timestamps without
 * a "Z" suffix by normalising the string first.  Also truncates microsecond
 * precision beyond 3 digits which some browsers cannot parse.
 */
export function parseBackendDate(isoString: string): Date {
  const normalised = ensureTimezone(isoString).replace(/\.(\d{3})\d*/, '.$1');
  return new Date(normalised);
}
