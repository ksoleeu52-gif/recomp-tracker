import { test, assertEqual, assert } from './harness.js';
import { saveFood, getFood } from '../js/db/foods.js';
import { logFood, getDayLog, updateEntry, deleteEntry, restoreEntry, groupByMeal } from '../js/db/log.js';
import { convertAmount, sumMacros } from '../js/lib/nutrition.js';

const DAY = '2026-01-10';
const OTHER_DAY = '2026-01-11';

const newOats = () => saveFood({ name: 'Log oats', basis: 'per100g', kcal: 375, protein: 12, carbs: 60, fat: 8, servingLabel: '', servingGrams: null });
const newWhey = () => saveFood({ name: 'Log whey', basis: 'per100g', kcal: 400, protein: 78, carbs: 6, fat: 6, servingLabel: 'scoop', servingGrams: 30 });

test('convertAmount keeps the same quantity across units', () => {
  const whey = { servingGrams: 30 };
  assertEqual(convertAmount(whey, 1, 'serving', 'g'), 30);
  assertEqual(convertAmount(whey, 45, 'g', 'serving'), 1.5);
  assertEqual(convertAmount(whey, 80, 'g', 'g'), 80);
  assert(Number.isNaN(convertAmount({ servingGrams: null }, 1, 'serving', 'g')));
});

test('logFood stores scaled macros and remembers the portion on the food', async () => {
  const oats = await newOats();
  const entry = await logFood(oats, { date: DAY, meal: 'breakfast', amount: 80, unit: 'g' });
  assertEqual([entry.kcal, entry.protein, entry.carbs, entry.fat], [300, 9.6, 48, 6.4]);

  const updatedFood = await getFood(oats.id);
  assertEqual([updatedFood.defaultAmount, updatedFood.defaultUnit, updatedFood.useCount], [80, 'g', 1]);
  assert(updatedFood.lastUsedAt > 0, 'lastUsedAt set');
});

test('logFood rejects unknown meals and impossible units', async () => {
  const oats = await newOats();
  let threw = 0;
  try { await logFood(oats, { date: DAY, meal: 'brunch', amount: 1, unit: 'g' }); } catch { threw++; }
  try { await logFood(oats, { date: DAY, meal: 'lunch', amount: 1, unit: 'serving' }); } catch { threw++; }
  assertEqual(threw, 2);
});

test('getDayLog returns only that day, oldest first', async () => {
  const whey = await newWhey();
  await logFood(whey, { date: OTHER_DAY, meal: 'snacks', amount: 1, unit: 'serving' });
  const day = await getDayLog(OTHER_DAY);
  assertEqual(day.length, 1);
  assertEqual(day[0].kcal, 120);
  assert((await getDayLog('1999-01-01')).length === 0);
});

test('editing an entry re-scales from its snapshot, not the current food', async () => {
  const whey = await newWhey();
  const entry = await logFood(whey, { date: DAY, meal: 'breakfast', amount: 1, unit: 'serving' });

  // Food is "corrected" after logging…
  await saveFood({ ...whey, kcal: 999 }, whey.id);

  // …but doubling the logged amount still uses the original 400 kcal/100g.
  const edited = await updateEntry(entry, { amount: 2, meal: 'lunch' });
  assertEqual([edited.kcal, edited.protein, edited.meal], [240, 46.8, 'lunch']);
});

test('delete then restore an entry', async () => {
  const oats = await newOats();
  const entry = await logFood(oats, { date: '2026-01-12', meal: 'dinner', amount: 50, unit: 'g' });
  const removed = await deleteEntry(entry.id);
  assertEqual((await getDayLog('2026-01-12')).length, 0);
  await restoreEntry(removed);
  assertEqual((await getDayLog('2026-01-12')).length, 1);
});

test('groupByMeal and day totals', async () => {
  const entries = await getDayLog(DAY);
  const groups = groupByMeal(entries);
  assertEqual(Object.keys(groups), ['breakfast', 'lunch', 'dinner', 'snacks']);
  assertEqual(groups.breakfast.length + groups.lunch.length, entries.length);
  assertEqual(sumMacros(entries).kcal, 300 + 240);
});
