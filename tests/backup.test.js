import { test, assertEqual, assert } from './harness.js';
import {
  createBackup, parseBackup, restoreBackup, summarise, backupReminder, lastBackupLabel, backupFileName, REMINDER_DAYS,
} from '../js/db/backup.js';
import { saveFood, getFood, listFoods } from '../js/db/foods.js';
import { getSettings, updateSettings } from '../js/db/settings.js';

const DAY = 86_400_000;

const minimalBackup = (data = {}) => ({
  app: 'recomp',
  format: 1,
  exportedAt: '2026-11-01T10:00:00.000Z',
  dbVersion: 1,
  data: { settings: [], foods: [], meals: [], logEntries: [], ...data },
});

// ---------- Parsing & validation ----------

test('parseBackup rejects files that are not Recomp backups', () => {
  assert(parseBackup('').error.includes('empty'));
  assert(parseBackup('not json').error.includes('JSON'));
  assert(parseBackup('{"app":"other"}').error.includes('Recomp backup'));
  assert(parseBackup(JSON.stringify({ ...minimalBackup(), format: 99 })).error.includes('newer version'));
  assert(parseBackup(JSON.stringify({ app: 'recomp', format: 1, data: { foods: [] } })).error.includes('missing'));
});

test('parseBackup rejects a damaged record and says where', () => {
  const bad = minimalBackup({ foods: [{ id: 'a', name: 'Oats', basis: 'per100g', kcal: 375 }, { id: 'b', name: 'Broken' }] });
  const { ok, error } = parseBackup(JSON.stringify(bad));
  assert(!ok);
  assert(error.includes('record 2') && error.includes('foods'), error);
});

test('parseBackup accepts a valid file and summarises it', () => {
  const backup = minimalBackup({
    foods: [{ id: 'f1', name: 'Oats', basis: 'per100g', kcal: 375 }, { id: 'f2', name: 'Old', basis: 'per100g', kcal: 1, archived: true }],
    logEntries: [
      { id: 'e1', date: '2026-10-30', meal: 'breakfast', kcal: 300, protein: 10 },
      { id: 'e2', date: '2026-10-31', meal: 'lunch', kcal: 500, protein: 40 },
      { id: 'e3', date: '2026-10-31', meal: 'dinner', kcal: 700, protein: 50 },
    ],
  });
  const { ok, summary } = parseBackup(JSON.stringify(backup));
  assert(ok);
  assertEqual(
    [summary.foods, summary.meals, summary.entries, summary.days, summary.firstDate, summary.lastDate],
    [1, 0, 3, 2, '2026-10-30', '2026-10-31'],
  );
  assertEqual(summarise(minimalBackup()).firstDate, null);
});

// ---------- Round trip ----------

test('export -> replace restores exactly what was exported', async () => {
  await updateSettings({ calorieTarget: 2500 });
  const exported = await createBackup();
  const parsed = parseBackup(JSON.stringify(exported));
  assert(parsed.ok, parsed.error);

  // Change things after the backup…
  await saveFood({ name: 'Added after backup', basis: 'per100g', kcal: 100, protein: 1, carbs: 1, fat: 1 });
  await updateSettings({ calorieTarget: 3000 });

  // …then restore: the extra food is gone and the target is back.
  await restoreBackup(parsed.backup, { mode: 'replace' });
  const names = (await listFoods()).map((f) => f.name);
  assert(!names.includes('Added after backup'));
  assertEqual((await getSettings()).calorieTarget, 2500);
  assertEqual((await createBackup()).data, exported.data);
});

test('merge adds missing records, newer copies win, local settings are kept', async () => {
  const local = await saveFood({ name: 'Merge local', basis: 'per100g', kcal: 100, protein: 1, carbs: 1, fat: 1 });
  await updateSettings({ calorieTarget: 2222 });

  const incoming = minimalBackup({
    settings: [{ key: 'main', calorieTarget: 1800, proteinTarget: 100 }],
    foods: [
      { ...local, name: 'Merge local (older copy)', updatedAt: local.updatedAt - 1000 },
      { id: 'merge-new', name: 'Merge new', basis: 'per100g', kcal: 50, protein: 5, carbs: 5, fat: 1, updatedAt: 1 },
    ],
  });
  await restoreBackup(incoming, { mode: 'merge' });

  assertEqual((await getFood(local.id)).name, 'Merge local', 'newer local copy kept');
  assertEqual((await getFood('merge-new'))?.name, 'Merge new', 'missing record added');
  assertEqual((await getSettings()).calorieTarget, 2222, 'settings untouched by merge');

  await restoreBackup({ ...incoming, data: { ...incoming.data, foods: [{ ...local, name: 'Merge local (newer copy)', updatedAt: local.updatedAt + 1000 }] } }, { mode: 'merge' });
  assertEqual((await getFood(local.id)).name, 'Merge local (newer copy)', 'newer incoming copy wins');
});

// ---------- Reminder ----------

test('backupReminder: due after 7 days, respects snooze, silent without data', () => {
  const now = Date.UTC(2026, 10, 13, 12);
  assertEqual(backupReminder({ lastBackupAt: now - 3 * DAY }, { now }).due, false);
  const due = backupReminder({ lastBackupAt: now - REMINDER_DAYS * DAY }, { now });
  assertEqual([due.due, due.days, due.never], [true, 7, false]);

  const never = backupReminder({ lastBackupAt: null, firstRunAt: now - 10 * DAY }, { now });
  assertEqual([never.due, never.never], [true, true]);

  assertEqual(backupReminder({ lastBackupAt: now - 20 * DAY, backupSnoozedUntil: now + DAY }, { now }).due, false);
  assertEqual(backupReminder({ lastBackupAt: now - 20 * DAY }, { now, hasData: false }).due, false);
  assertEqual(backupReminder({}, { now }).due, false, 'no dates at all');
});

test('lastBackupLabel and file name', () => {
  const now = new Date(2026, 10, 13, 12);
  assertEqual(lastBackupLabel(null, now), 'Never');
  assertEqual(lastBackupLabel(new Date(2026, 10, 13, 8).getTime(), now), 'Today');
  assertEqual(lastBackupLabel(new Date(2026, 10, 12, 23).getTime(), now), 'Yesterday');
  assertEqual(lastBackupLabel(new Date(2026, 10, 3, 9).getTime(), now), '10 days ago');
  assertEqual(backupFileName(now), 'recomp-backup-2026-11-13.json');
});
