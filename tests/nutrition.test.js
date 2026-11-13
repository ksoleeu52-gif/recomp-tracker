import { test, assertEqual } from './harness.js';
import { sumMacros, remaining, progress } from '../js/lib/nutrition.js';

test('sumMacros adds all four macros and ignores missing values', () => {
  const totals = sumMacros([
    { kcal: 300, protein: 10, carbs: 50, fat: 5 },
    { kcal: 120, protein: 24 },
  ]);
  assertEqual(totals, { kcal: 420, protein: 34, carbs: 50, fat: 5 });
});

test('sumMacros of nothing is zero', () => {
  assertEqual(sumMacros([]), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
});

test('remaining: under target', () => {
  assertEqual(remaining(2400, 1250), { amount: 1150, over: false });
});

test('remaining: over target', () => {
  assertEqual(remaining(2400, 2650), { amount: 250, over: true });
});

test('remaining: tiny overshoot rounds to exactly on target, not "0 over"', () => {
  assertEqual(remaining(160, 160.3), { amount: 0, over: false });
});

test('progress handles a zero target', () => {
  assertEqual(progress(50, 0), 0);
  assertEqual(progress(80, 160), 0.5);
});
