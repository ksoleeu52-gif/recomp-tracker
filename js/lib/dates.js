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

/** Short, friendly label: "Today", "Yesterday", or e.g. "Wed 11 Nov". */
export function dayLabel(key, today = todayKey()) {
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  if (key === addDays(today, 1)) return 'Tomorrow';
  return fromDayKey(key).toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Long form, e.g. "Friday 13 November". */
export function longDate(key) {
  return fromDayKey(key).toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' });
}
