/**
 * Date helpers built around local "day keys" ("YYYY-MM-DD").
 *
 * Every log entry stores the day key of the phone's local date. "Today" is just
 * todayKey(), so the daily reset needs no midnight timer: a new day simply
 * has no entries yet. Day keys sort correctly as plain strings.
 */
const pad = (n) => String(n).padStart(2, '0');

/** Date -> "YYYY-MM-DD" using the device's local timezone. */
export function toDayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const todayKey = () => toDayKey(new Date());

/** "YYYY-MM-DD" -> Date at local noon (noon avoids daylight-saving edge cases). */
export function fromDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(key, days) {
  const date = fromDayKey(key);
  date.setDate(date.getDate() + days);
  return toDayKey(date);
}

/** True for a real calendar date in "YYYY-MM-DD" form (rejects "2026-02-30"). */
export function isDayKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && toDayKey(fromDayKey(value)) === value;
}

/** Whole days from key `a` to key `b` (positive if b is later). */
export function daysBetween(a, b) {
  return Math.round((fromDayKey(b) - fromDayKey(a)) / 86_400_000);
}

/** Milliseconds from `now` until the next local midnight. */
export function msUntilMidnight(now = new Date()) {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return midnight - now;
}

/** Short, friendly label: "Today", "Yesterday", or e.g. "Wed 11 Nov". */
export function dayLabel(key, today = todayKey()) {
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  if (key === addDays(today, 1)) return 'Tomorrow';
  return fromDayKey(key).toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Title + subtitle for a day header, without repeating information:
 *   today      -> { title: 'Today',     subtitle: 'Friday 13 November' }
 *   yesterday  -> { title: 'Yesterday', subtitle: 'Thursday 12 November' }
 *   other days -> { title: 'Wednesday', subtitle: '11 November' }  (+ year if not this year)
 */
export function dayHeading(key, today = todayKey()) {
  const date = fromDayKey(key);
  const relative = key === today ? 'Today' : key === addDays(today, -1) ? 'Yesterday' : null;
  if (relative) return { title: relative, subtitle: longDate(key) };
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return {
    title: date.toLocaleDateString('en-IE', { weekday: 'long' }),
    subtitle: date.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) }),
  };
}

/** Long form, e.g. "Friday 13 November". */
export function longDate(key) {
  return fromDayKey(key).toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' });
}
