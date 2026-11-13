import { test, assertEqual, assert } from './harness.js';
import { saveFood, getFood } from '../js/db/foods.js';
import { getDayLog, deleteEntries } from '../js/db/log.js';
import {
  validateMeal, resolveItems, mealTotals, saveMeal, getMeal, listMeals, deleteMeal, restoreMeal, logSavedMeal,
} from '../js/db/meals.js';

async function breakfastFoods() {
  const oats = await saveFood({ name: 'Meal oats', basis: 'per100g', kcal: 375, protein: 12, carbs: 60, fat: 8, servingLabel: '', servingGrams: null });
  const whey = await saveFood({ name: 'Meal whey', basis: 'per100g', kcal: 400, protein: 78, carbs: 6, fat: 6, servingLabel: 'scoop', servingGrams: 30 });
  const banana = await saveFood({ name: 'Meal banana', basis: 'perServing', kcal: 105, protein: 1.3, carbs: 27, fat: 0.4, servingLabel: 'banana', servingGrams: 118 });
  return { oats, whey, banana, byId: new Map([oats, whey, banana].map((f) => [f.id, f])) };
}

const usualBreakfast = ({ oats, whey, banana }) => ({
  name: 'My usual breakfast',
  mealType: 'breakfast',
  items: [
    { foodId: oats.id, amount: 80, unit: 'g' },
    { foodId: whey.id, amount: 1, unit: 'serving' },
    { foodId: banana.id, amount: 1, unit: 'serving' },
  ],
});

test('validateMeal: needs a name, a meal type, and at least one valid item', () => {
  const empty = validateMeal({ name: ' ', mealType: 'brunch', items: [] });
  assert(!empty.valid);
  assert(empty.errors.name && empty.errors.mealType && empty.errors.items);

  const badAmount = validateMeal({ name: 'x', mealType: 'lunch', items: [{ foodId: 'a', amount: '0', unit: 'g' }] });
  assert(badAmount.errors.items, 'zero amount rejected');

  const ok = validateMeal({ name: ' Usual  lunch ', mealType: 'lunch', items: [{ foodId: 'a', amount: '12,5', unit: 'g' }] });
  assert(ok.valid);
  assertEqual(ok.meal, { name: 'Usual lunch', mealType: 'lunch', items: [{ foodId: 'a', amount: 12.5, unit: 'g' }] });
});

test('mealTotals adds up every item (80g oats + 1 scoop whey + 1 banana)', async () => {
  const foods = await breakfastFoods();
  const totals = mealTotals(usualBreakfast(foods), foods.byId);
  // oats 300 / 9.6P, whey 120 / 23.4P, banana 105 / 1.3P
  assertEqual(totals.kcal, 525);
  assertEqual(Math.round(totals.protein * 10) / 10, 34.3);
});

test('resolveItems marks missing foods instead of crashing', () => {
  const resolved = resolveItems({ items: [{ foodId: 'gone', amount: 1, unit: 'g' }] }, new Map());
  assertEqual([resolved[0].food, resolved[0].macros], [null, null]);
});

test('logSavedMeal logs every item in order, in one go, and can be undone', async () => {
  const foods = await breakfastFoods();
  const meal = await saveMeal(usualBreakfast(foods));
  const date = '2026-02-01';

  const entries = await logSavedMeal(meal, foods.byId, { date, slot: 'breakfast' });
  const day = await getDayLog(date);
  assertEqual(day.map((e) => e.name), ['Meal oats', 'Meal whey', 'Meal banana']);
  assert(day.every((e) => e.savedMealId === meal.id && e.meal === 'breakfast'));
  assertEqual(day.reduce((sum, e) => sum + e.kcal, 0), 525);

  // Meal usage is tracked; the foods' single-log default portion is NOT overwritten.
  assertEqual((await getMeal(meal.id)).useCount, 1);
  const oats = await getFood(foods.oats.id);
  assert(oats.lastUsedAt > 0 && oats.defaultAmount == null, 'recent updated, default portion untouched');

  await deleteEntries(entries.map((e) => e.id));
  assertEqual((await getDayLog(date)).length, 0);
});

test('a saved meal can be logged into a different slot', async () => {
  const foods = await breakfastFoods();
  const meal = await saveMeal(usualBreakfast(foods));
  await logSavedMeal(meal, foods.byId, { date: '2026-02-02', slot: 'dinner' });
  assert((await getDayLog('2026-02-02')).every((e) => e.meal === 'dinner'));
});

test('meals: edit keeps createdAt, list is grouped by meal type, delete + restore', async () => {
  const foods = await breakfastFoods();
  const lunch = await saveMeal({ ...usualBreakfast(foods), name: 'Lunch box', mealType: 'lunch' });
  const edited = await saveMeal({ ...lunch, items: lunch.items.slice(0, 1) }, lunch.id);
  assertEqual([edited.createdAt, edited.items.length], [lunch.createdAt, 1]);

  const types = (await listMeals()).map((m) => m.mealType);
  assertEqual(types, [...types].sort((a, b) => ['breakfast', 'lunch', 'dinner', 'snacks'].indexOf(a) - ['breakfast', 'lunch', 'dinner', 'snacks'].indexOf(b)));

  const removed = await deleteMeal(lunch.id);
  assert(!(await getMeal(lunch.id)));
  await restoreMeal(removed);
  assertEqual((await getMeal(lunch.id)).name, 'Lunch box');
});
