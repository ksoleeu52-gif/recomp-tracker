import { test, assertEqual, assert } from './harness.js';
import { validateTargets, getSettings, updateSettings, DEFAULT_SETTINGS } from '../js/db/settings.js';

test('settings: defaults on first run, then saved values round-trip through IndexedDB', async () => {
  const first = await getSettings();
  assertEqual(first.calorieTarget, DEFAULT_SETTINGS.calorieTarget);

  await updateSettings({ calorieTarget: 2600, proteinTarget: 170 });
  const saved = await getSettings();
  assertEqual([saved.calorieTarget, saved.proteinTarget], [2600, 170]);
});

test('validateTargets accepts normal values (and "2,400")', () => {
  const result = validateTargets({ calorieTarget: '2,400', proteinTarget: '160' });
  assert(result.valid);
  assertEqual(result.values, { calorieTarget: 2400, proteinTarget: 160 });
});

test('validateTargets rejects empty and out-of-range values', () => {
  const result = validateTargets({ calorieTarget: '24000', proteinTarget: '' });
  assert(!result.valid);
  assert(result.errors.calorieTarget.includes('between'));
  assertEqual(result.errors.proteinTarget, 'Enter a number.');
});
