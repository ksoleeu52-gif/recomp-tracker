import { test, assertEqual, assert } from './harness.js';
import { macrosFor, scaleFactor, unitsFor, defaultPortion, kcalFromMacros } from '../js/lib/nutrition.js';
import { validateFood, matchFoods, saveFood, getFood, listFoods, archiveFood, restoreFood } from '../js/db/foods.js';

const oats = { name: 'Oats', basis: 'per100g', kcal: 375, protein: 12, carbs: 60, fat: 8, servingGrams: null };
const whey = { name: 'Whey', basis: 'per100g', kcal: 400, protein: 78, carbs: 6, fat: 6, servingLabel: 'scoop', servingGrams: 30 };
const egg = { name: 'Egg', basis: 'perServing', kcal: 72, protein: 6.3, carbs: 0.4, fat: 4.8, servingLabel: 'egg', servingGrams: 50 };
const bar = { name: 'Protein bar', basis: 'perServing', kcal: 200, protein: 20, carbs: 20, fat: 7, servingLabel: 'bar', servingGrams: null };

// ---------- Maths ----------

test('per 100g food logged in grams', () => {
  assertEqual(macrosFor(oats, 80, 'g'), { kcal: 300, protein: 9.6, carbs: 48, fat: 6.4 });
});

test('per 100g food logged in servings uses the serving weight', () => {
  assertEqual(macrosFor(whey, 1, 'serving'), { kcal: 120, protein: 23.4, carbs: 1.8, fat: 1.8 });
});

test('per serving food logged in servings and in grams', () => {
  assertEqual(macrosFor(egg, 2, 'serving'), { kcal: 144, protein: 12.6, carbs: 0.8, fat: 9.6 });
  assertEqual(macrosFor(egg, 30, 'g'), { kcal: 43.2, protein: 3.8, carbs: 0.2, fat: 2.9 });
});

test('impossible units are rejected', () => {
  assert(Number.isNaN(scaleFactor(oats, 1, 'serving')), 'oats have no serving weight');
  assert(Number.isNaN(scaleFactor(bar, 50, 'g')), 'bar has no weight');
  assert(Number.isNaN(scaleFactor(oats, -5, 'g')), 'negative amount');
});

test('unitsFor lists only units that can be calculated', () => {
  assertEqual(unitsFor(oats), ['g']);
  assertEqual(unitsFor(whey), ['g', 'serving']);
  assertEqual(unitsFor(egg), ['serving', 'g']);
  assertEqual(unitsFor(bar), ['serving']);
});

test('defaultPortion: last used, else 1 serving, else 100g', () => {
  assertEqual(defaultPortion({ ...oats, defaultAmount: 80, defaultUnit: 'g' }), { amount: 80, unit: 'g' });
  assertEqual(defaultPortion(whey), { amount: 1, unit: 'serving' });
  assertEqual(defaultPortion(oats), { amount: 100, unit: 'g' });
  assertEqual(defaultPortion({ ...oats, defaultAmount: 1, defaultUnit: 'serving' }), { amount: 100, unit: 'g' });
});

test('kcalFromMacros uses 4/4/9', () => {
  assertEqual(kcalFromMacros({ protein: 10, carbs: 10, fat: 10 }), 170);
});

// ---------- Validation ----------

test('validateFood: normal per-100g input with EU decimal commas', () => {
  const { valid, food } = validateFood({ name: '  Greek  yogurt ', basis: 'per100g', kcal: '57', protein: '10,3', carbs: '', fat: '0,2' });
  assert(valid);
  assertEqual([food.name, food.protein, food.carbs, food.fat, food.servingGrams], ['Greek yogurt', 10.3, 0, 0.2, null]);
});

test('validateFood: required name and calories', () => {
  const { valid, errors } = validateFood({ name: '', basis: 'per100g', kcal: '' });
  assert(!valid);
  assert(errors.name && errors.kcal);
});

test('validateFood: impossible per-100g values are caught', () => {
  assert(validateFood({ name: 'x', basis: 'per100g', kcal: '1200' }).errors.kcal, 'kcal > 900');
  assert(validateFood({ name: 'x', basis: 'per100g', kcal: '400', protein: '60', carbs: '50' }).errors.fat, 'macros > 100g');
});

test('validateFood: per-serving labels are cleaned up and defaulted', () => {
  assertEqual(validateFood({ name: 'Egg', basis: 'perServing', kcal: '72', servingLabel: '1 egg' }).food.servingLabel, 'egg');
  assertEqual(validateFood({ name: 'Nuts', basis: 'perServing', kcal: '70', servingLabel: '10 almonds' }).food.servingLabel, '10 almonds');
  assertEqual(validateFood({ name: 'Bar', basis: 'perServing', kcal: '200', servingLabel: '' }).food.servingLabel, 'serving');
  assert(validateFood({ name: 'x', basis: 'perServing', kcal: '1', servingGrams: '0' }).errors.servingGrams);
});

// ---------- Search ----------

test('matchFoods: every word must match, accents ignored, prefix matches first', () => {
  const foods = [
    { name: 'Chocolate egg', brand: '' },
    { name: 'Eggs', brand: '' },
    { name: 'Café latte', brand: 'Costa' },
  ];
  assertEqual(matchFoods(foods, 'egg').map((f) => f.name), ['Eggs', 'Chocolate egg']);
  assertEqual(matchFoods(foods, 'cafe costa').map((f) => f.name), ['Café latte']);
  assertEqual(matchFoods(foods, '  ').length, 3);
});

// ---------- Storage ----------

test('foods: save, edit, list A–Z, archive and restore', async () => {
  const created = await saveFood(validateFood({ name: 'Zucchini', basis: 'per100g', kcal: '17' }).food);
  await saveFood(validateFood({ name: 'apple', basis: 'perServing', kcal: '80', servingLabel: 'apple' }).food);

  const edited = await saveFood({ ...created, kcal: 18 }, created.id);
  assertEqual(edited.createdAt, created.createdAt, 'createdAt kept on edit');
  assertEqual((await getFood(created.id)).kcal, 18);

  assertEqual((await listFoods()).map((f) => f.name), ['apple', 'Zucchini']);

  await archiveFood(created.id);
  assertEqual((await listFoods()).map((f) => f.name), ['apple']);
  await restoreFood(created.id);
  assertEqual((await listFoods()).length, 2);
});

test('foods: removing the serving weight forgets a now-impossible default portion', async () => {
  const food = await saveFood({ ...whey, defaultAmount: 1, defaultUnit: 'serving' });
  const edited = await saveFood({ ...food, servingGrams: null }, food.id);
  assertEqual([edited.defaultAmount, edited.defaultUnit], [null, null]);
});
