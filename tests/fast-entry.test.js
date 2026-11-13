import { test, assertEqual, assert } from './harness.js';
import { saveFood, getFood, setFavourite } from '../js/db/foods.js';
import {
  logFood, logQuickAdd, updateQuickEntry, validateQuickAdd, copyEntries, getDayLog, undoLogging, usageOf,
} from '../js/db/log.js';
import { saveMeal, getMeal, logSavedMeal } from '../js/db/meals.js';

const newFood = (name) =>
  saveFood({ name, basis: 'per100g', kcal: 100, protein: 10, carbs: 10, fat: 2, servingLabel: '', servingGrams: null });

// ---------- Favourites ----------

test('setFavourite stars and un-stars a food', async () => {
  const food = await newFood('Fav test');
  await setFavourite(food.id, true);
  assert((await getFood(food.id)).isFavourite);
  await setFavourite(food.id, false);
  assert(!(await getFood(food.id)).isFavourite);
});

// ---------- Quick add ----------

test('validateQuickAdd: calories required, others optional, decimal commas ok', () => {
  assert(!validateQuickAdd({ kcal: '' }).valid);
  const { valid, fields } = validateQuickAdd({ name: '', kcal: '650', protein: '35,5' });
  assert(valid);
  assertEqual(fields, { name: 'Quick add', kcal: 650, protein: 35.5, carbs: 0, fat: 0 });
  assert(validateQuickAdd({ kcal: '9000' }).errors.kcal, 'too many calories');
});

test('quick add logs raw numbers with no food, and can be edited', async () => {
  const entry = await logQuickAdd({ date: '2026-03-01', meal: 'dinner', name: 'Chipper', kcal: 900, protein: 30, carbs: 100, fat: 40 });
  assertEqual([entry.foodId, entry.foodSnapshot, entry.quickAdd], [null, null, true]);

  await updateQuickEntry(entry, { kcal: 950, meal: 'snacks' });
  const [saved] = await getDayLog('2026-03-01');
  assertEqual([saved.kcal, saved.protein, saved.meal, saved.name], [950, 30, 'snacks', 'Chipper']);
});

// ---------- Copy a previous day ----------

test('copyEntries duplicates a meal onto another day, in order, as new entries', async () => {
  const a = await newFood('Copy A');
  const b = await newFood('Copy B');
  const e1 = await logFood(a, { date: '2026-03-10', meal: 'breakfast', amount: 50, unit: 'g' });
  const e2 = await logFood(b, { date: '2026-03-10', meal: 'breakfast', amount: 200, unit: 'g' });

  const copies = await copyEntries([e1, e2], { date: '2026-03-11', meal: 'breakfast' });
  const day = await getDayLog('2026-03-11');
  assertEqual(day.map((e) => [e.name, e.kcal]), [['Copy A', 50], ['Copy B', 200]]);
  assert(copies.every((c) => c.id !== e1.id && c.id !== e2.id), 'new ids');
  assertEqual((await getDayLog('2026-03-10')).length, 2, 'original day untouched');
});

// ---------- Undo leaves no trace ----------

test('undoLogging restores Recent order and the remembered portion', async () => {
  const food = await newFood('Undo food');
  await logFood(food, { date: '2026-03-20', meal: 'lunch', amount: 80, unit: 'g' });
  const before = await getFood(food.id); // lastUsedAt set, default 80 g

  const previous = { foods: [{ id: food.id, usage: usageOf(before) }] };
  const entry = await logFood(before, { date: '2026-03-20', meal: 'lunch', amount: 250, unit: 'g' });
  await undoLogging([entry], previous);

  const after = await getFood(food.id);
  assertEqual(
    [after.lastUsedAt, after.useCount, after.defaultAmount],
    [before.lastUsedAt, before.useCount, 80],
  );
  assertEqual((await getDayLog('2026-03-20')).length, 1, 'only the undone entry removed');
});

test('undoLogging a saved meal restores the meal and its foods', async () => {
  const food = await newFood('Undo meal food');
  const meal = await saveMeal({ name: 'Undo meal', mealType: 'lunch', items: [{ foodId: food.id, amount: 100, unit: 'g' }] });
  const previous = { foods: [{ id: food.id, usage: usageOf(food) }], meals: [{ id: meal.id, usage: usageOf(meal) }] };

  const entries = await logSavedMeal(meal, new Map([[food.id, food]]), { date: '2026-03-21', slot: 'lunch' });
  await undoLogging(entries, previous);

  assertEqual((await getMeal(meal.id)).useCount, 0);
  assertEqual((await getFood(food.id)).lastUsedAt, 0);
  assertEqual((await getDayLog('2026-03-21')).length, 0);
});
