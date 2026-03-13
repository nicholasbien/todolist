/**
 * Tests for the "-1 day ago" timezone / clock-skew fix.
 *
 * Root cause: When the server clock is slightly ahead of the client, or
 * when a UTC timestamp is parsed in a timezone west of UTC, the diff
 * `now - date` becomes negative. Without clamping, Math.floor of a small
 * negative number yields -1, producing "-1d ago" or "-1m ago".
 *
 * Fix: Both formatSessionDate() (AgentChatbot.tsx) and formatRelativeTime()
 * (ActivityFeed.tsx) now clamp diffMs to a minimum of 0 using Math.max(0, ...).
 *
 * These functions are component-local, so we replicate them here with the
 * fix applied and verify correctness across normal, edge, and clock-skew cases.
 */

// ── Replicated helper from ActivityFeed.tsx ──────────────────────────

function ensureTimezone(isoString: string): string {
  if (!/[Zz]|[+-]\d{2}:?\d{2}$/.test(isoString)) {
    return isoString + 'Z';
  }
  return isoString;
}

/**
 * formatRelativeTime — mirrors ActivityFeed.tsx (with Math.max fix)
 */
function formatRelativeTime(isoString: string, now: Date = new Date()): string {
  const normalizedTimestamp = ensureTimezone(isoString).replace(/\.(\d{3})\d*/, '.$1');
  const date = new Date(normalizedTimestamp);
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * formatSessionDate — mirrors AgentChatbot.tsx (with Math.max fix)
 */
function formatSessionDate(dateStr: string, now: Date = new Date()): string {
  const date = new Date(dateStr);
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Unfixed versions (for comparison / regression proof) ─────────────

function formatRelativeTime_UNFIXED(isoString: string, now: Date = new Date()): string {
  const normalizedTimestamp = ensureTimezone(isoString).replace(/\.(\d{3})\d*/, '.$1');
  const date = new Date(normalizedTimestamp);
  const diffMs = now.getTime() - date.getTime(); // NO clamp
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatSessionDate_UNFIXED(dateStr: string, now: Date = new Date()): string {
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime(); // NO clamp
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Helpers ──────────────────────────────────────────────────────────

function minutesAgo(n: number, from: Date = new Date()): string {
  return new Date(from.getTime() - n * 60000).toISOString();
}

function hoursAgo(n: number, from: Date = new Date()): string {
  return new Date(from.getTime() - n * 3600000).toISOString();
}

function daysAgo(n: number, from: Date = new Date()): string {
  return new Date(from.getTime() - n * 86400000).toISOString();
}

function minutesFromNow(n: number, from: Date = new Date()): string {
  return new Date(from.getTime() + n * 60000).toISOString();
}

function secondsFromNow(n: number, from: Date = new Date()): string {
  return new Date(from.getTime() + n * 1000).toISOString();
}

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-03-13T12:00:00.000Z');

describe('formatRelativeTime (ActivityFeed)', () => {
  describe('normal past timestamps', () => {
    it('returns "Just now" for timestamp a few seconds ago', () => {
      expect(formatRelativeTime(minutesAgo(0, NOW), NOW)).toBe('Just now');
    });

    it('returns "1m ago" for 1 minute ago', () => {
      expect(formatRelativeTime(minutesAgo(1, NOW), NOW)).toBe('1m ago');
    });

    it('returns "30m ago" for 30 minutes ago', () => {
      expect(formatRelativeTime(minutesAgo(30, NOW), NOW)).toBe('30m ago');
    });

    it('returns "59m ago" for 59 minutes ago', () => {
      expect(formatRelativeTime(minutesAgo(59, NOW), NOW)).toBe('59m ago');
    });

    it('returns "1h ago" for 1 hour ago', () => {
      expect(formatRelativeTime(hoursAgo(1, NOW), NOW)).toBe('1h ago');
    });

    it('returns "23h ago" for 23 hours ago', () => {
      expect(formatRelativeTime(hoursAgo(23, NOW), NOW)).toBe('23h ago');
    });

    it('returns "1d ago" for 1 day ago', () => {
      expect(formatRelativeTime(daysAgo(1, NOW), NOW)).toBe('1d ago');
    });

    it('returns "6d ago" for 6 days ago', () => {
      expect(formatRelativeTime(daysAgo(6, NOW), NOW)).toBe('6d ago');
    });

    it('returns formatted date for 7+ days ago', () => {
      const result = formatRelativeTime(daysAgo(10, NOW), NOW);
      // Should be a date like "Mar 3"
      expect(result).toMatch(/\w{3}\s+\d{1,2}/);
    });
  });

  describe('clock skew / future timestamps (THE BUG)', () => {
    it('returns "Just now" when server timestamp is 5 seconds in the future', () => {
      expect(formatRelativeTime(secondsFromNow(5, NOW), NOW)).toBe('Just now');
    });

    it('returns "Just now" when server timestamp is 30 seconds in the future', () => {
      expect(formatRelativeTime(secondsFromNow(30, NOW), NOW)).toBe('Just now');
    });

    it('returns "Just now" when server timestamp is 2 minutes in the future', () => {
      expect(formatRelativeTime(minutesFromNow(2, NOW), NOW)).toBe('Just now');
    });

    it('returns "Just now" when server timestamp is 1 hour in the future', () => {
      const future = new Date(NOW.getTime() + 3600000).toISOString();
      expect(formatRelativeTime(future, NOW)).toBe('Just now');
    });

    it('UNFIXED version: negative diffMin still passes "< 1" check so bug is hidden', () => {
      // In formatRelativeTime, the unfixed version accidentally works for
      // future timestamps because negative diffMin/diffHr/diffDay are all
      // < their thresholds, cascading down to "Just now".
      // The bug is specific to formatSessionDate where === 0 / === 1 checks
      // miss negative values.
      const result = formatRelativeTime_UNFIXED(minutesFromNow(2, NOW), NOW);
      expect(result).toBe('Just now');
      // But the Math.max fix is still correct defensive programming
    });
  });

  describe('edge case: exactly now', () => {
    it('returns "Just now" for the exact same timestamp as now', () => {
      expect(formatRelativeTime(NOW.toISOString(), NOW)).toBe('Just now');
    });
  });

  describe('timestamps without timezone suffix (backend UTC issue)', () => {
    it('handles timestamp without Z suffix (ensureTimezone adds Z)', () => {
      // Backend sends "2026-03-13T11:59:00.000" without Z
      const noTz = '2026-03-13T11:59:00.000';
      expect(formatRelativeTime(noTz, NOW)).toBe('1m ago');
    });

    it('handles timestamp with extra precision (truncated to 3 decimals)', () => {
      // After truncation: .123Z, so date = 11:59:00.123Z
      // diff from 12:00:00.000Z = 59877ms ≈ 0.99 minutes → diffMin = 0 → "Just now"
      const extraPrecision = '2026-03-13T11:59:00.123456789Z';
      expect(formatRelativeTime(extraPrecision, NOW)).toBe('Just now');
    });
  });
});

describe('formatSessionDate (AgentChatbot)', () => {
  describe('normal past timestamps', () => {
    it('returns "Today" for timestamp from today', () => {
      expect(formatSessionDate(minutesAgo(30, NOW), NOW)).toBe('Today');
    });

    it('returns "Today" for timestamp a few hours ago', () => {
      expect(formatSessionDate(hoursAgo(5, NOW), NOW)).toBe('Today');
    });

    it('returns "Yesterday" for timestamp 1 day ago', () => {
      expect(formatSessionDate(daysAgo(1, NOW), NOW)).toBe('Yesterday');
    });

    it('returns "2d ago" for timestamp 2 days ago', () => {
      expect(formatSessionDate(daysAgo(2, NOW), NOW)).toBe('2d ago');
    });

    it('returns "6d ago" for timestamp 6 days ago', () => {
      expect(formatSessionDate(daysAgo(6, NOW), NOW)).toBe('6d ago');
    });

    it('returns formatted date for 7+ days ago', () => {
      const result = formatSessionDate(daysAgo(10, NOW), NOW);
      expect(result).toMatch(/\w{3}\s+\d{1,2}/);
    });
  });

  describe('clock skew / future timestamps (THE BUG)', () => {
    it('returns "Today" when server timestamp is 5 seconds in the future', () => {
      expect(formatSessionDate(secondsFromNow(5, NOW), NOW)).toBe('Today');
    });

    it('returns "Today" when server timestamp is 2 minutes in the future', () => {
      expect(formatSessionDate(minutesFromNow(2, NOW), NOW)).toBe('Today');
    });

    it('returns "Today" when server timestamp is 1 hour in the future', () => {
      const future = new Date(NOW.getTime() + 3600000).toISOString();
      expect(formatSessionDate(future, NOW)).toBe('Today');
    });

    it('UNFIXED version produces "-1d ago" for timestamp just seconds in the future', () => {
      // Even 5 seconds in the future: diffMs = -5000
      // diffDays = Math.floor(-5000 / 86400000) = Math.floor(-0.0000578) = -1
      // -1 is not 0 (skip "Today"), not 1 (skip "Yesterday"), but < 7 → "-1d ago"
      const future = secondsFromNow(5, NOW);
      const result = formatSessionDate_UNFIXED(future, NOW);
      expect(result).toBe('-1d ago');
    });
  });

  describe('edge case: exactly now', () => {
    it('returns "Today" for the exact same timestamp as now', () => {
      expect(formatSessionDate(NOW.toISOString(), NOW)).toBe('Today');
    });
  });
});

describe('Math.max(0, ...) clamp correctness', () => {
  it('clamping negative diff to 0 always produces the "just now" / "today" bucket', () => {
    // For any future offset from 1ms to 2 days, the clamped result should be 0
    const offsets = [1, 100, 1000, 60000, 3600000, 86400000, 172800000];
    for (const offset of offsets) {
      const future = new Date(NOW.getTime() + offset).toISOString();
      expect(formatRelativeTime(future, NOW)).toBe('Just now');
      expect(formatSessionDate(future, NOW)).toBe('Today');
    }
  });

  it('does not affect past timestamps — Math.max(0, positive) = positive', () => {
    // 5 minutes ago should still be "5m ago", not "Just now"
    expect(formatRelativeTime(minutesAgo(5, NOW), NOW)).toBe('5m ago');
    // 2 days ago should still be "2d ago", not "Today"
    expect(formatSessionDate(daysAgo(2, NOW), NOW)).toBe('2d ago');
  });
});
