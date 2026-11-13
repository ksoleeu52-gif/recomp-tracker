import { test, assertEqual, assert } from './harness.js';
import { toDayKey, addDays, isDayKey, daysBetween, dayLabel, dayHeading, msUntilMidnight } from '../js/lib/dates.js';

test('toDayKey uses local date with zero padding', () => {
  assertEqual(toDayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('addDays crosses month, year and leap-day boundaries', () => {
  assertEqual(addDays('2026-11-30', 1), '2026-12-01');
  assertEqual(addDays('2026-12-31', 1), '2027-01-01');
  assertEqual(addDays('2028-03-01', -1), '2028-02-29');
});

test('addDays is safe across the Irish daylight-saving change', () => {
  assertEqual(addDays('2026-03-28', 1), '2026-03-29');
  assertEqual(addDays('2026-03-29', 1), '2026-03-30');
  assertEqual(addDays('2026-10-25', 1), '2026-10-26');
});

test('isDayKey validates real dates only', () => {
  assert(isDayKey('2026-11-13'));
  assert(!isDayKey('2026-02-30'));
  assert(!isDayKey('13/11/2026'));
  assert(!isDayKey(undefined));
});

test('daysBetween', () => {
  assertEqual(daysBetween('2026-11-06', '2026-11-13'), 7);
  assertEqual(daysBetween('2026-11-13', '2026-11-06'), -7);
});

test('dayHeading avoids repeating the date', () => {
  assertEqual(dayHeading('2026-11-13', '2026-11-13').title, 'Today');
  assertEqual(dayHeading('2026-11-12', '2026-11-13').title, 'Yesterday');
  assertEqual(dayHeading('2026-11-11', '2026-11-13'), { title: 'Wednesday', subtitle: '11 November' });
  assert(dayHeading('2025-12-31', '2026-11-13').subtitle.includes('2025'), 'shows year for other years');
});

test('msUntilMidnight', () => {
  assertEqual(msUntilMidnight(new Date(2026, 10, 13, 23, 59, 0)), 60_000);
  assertEqual(msUntilMidnight(new Date(2026, 10, 13, 0, 0, 0)), 86_400_000);
});

test('dayLabel: Today / Yesterday / short date', () => {
  assertEqual(dayLabel('2026-11-13', '2026-11-13'), 'Today');
  assertEqual(dayLabel('2026-11-12', '2026-11-13'), 'Yesterday');
  assert(dayLabel('2026-11-11', '2026-11-13').includes('11'));
});
