/**
 * The food log: one record per logged item.
 *
 * Log entry:
 * {
 *   id, date: 'YYYY-MM-DD', meal: 'breakfast' | 'lunch' | 'dinner' | 'snacks',
 *   foodId,                     // null for quick-add entries (step 6)
 *   name, brand,
 *   amount, unit: 'g' | 'serving',
 *   kcal, protein, carbs, fat,  // totals for this amount
 *   foodSnapshot,               // the food's nutrition at log time (see below)
 *   savedMealId,                // set when logged as part of a saved meal (step 5)
 *   createdAt, updatedAt
 * }
 *
 * Why a snapshot? If you later correct a food's values, your past days shouldn't
 * silently change. And editing an entry's amount re-scales from the snapshot,
 * so it stays consistent with what was originally logged.
 */
import { transaction, promisify, getAll, put, get, del, newId, STORES } from './idb.js';
import { macrosFor } from '../lib/nutrition.js';
import { MEALS } from '../config.js';

export const MEAL_IDS = MEALS.map((meal) => meal.id);

/** The parts of a food needed to re-scale an entry later. */
export function snapshotOf(food) {
  const { basis, kcal, protein, carbs, fat, servingGrams = null, servingLabel = '' } = food;
  return { basis, kcal, protein, carbs, fat, servingGrams, servingLabel };
}

/**
 * Logs an amount of a food and remembers that amount as the food's new default
 * (so next time it's one tap). Both writes happen in one transaction.
 * @returns the new entry
 */
export async function logFood(food, { date, meal, amount, unit, savedMealId = null, rememberPortion = true }) {
  if (!MEAL_IDS.includes(meal)) throw new Error(`Unknown meal: ${meal}`);
  const macros = macrosFor(food, amount, unit); // throws if the unit is impossible
  const now = Date.now();
  const entry = {
    id: newId(),
    date,
    meal,
    foodId: food.id ?? null,
    name: food.name,
    brand: food.brand ?? '',
    amount,
    unit,
    ...macros,
    foodSnapshot: snapshotOf(food),
    savedMealId,
    createdAt: now,
    updatedAt: now,
  };

  await transaction([STORES.log, STORES.foods], 'readwrite', async (s) => {
    s[STORES.log].put(entry);
    if (!food.id) return;
    const stored = await promisify(s[STORES.foods].get(food.id));
    if (!stored) return;
    const usage = { lastUsedAt: now, useCount: (stored.useCount || 0) + 1 };
    if (rememberPortion) Object.assign(usage, { defaultAmount: amount, defaultUnit: unit });
    s[STORES.foods].put({ ...stored, ...usage });
  });
  return entry;
}

/** All entries for one day, oldest first. */
export async function getDayLog(date) {
  const entries = await getAll(STORES.log, { index: 'date', query: date });
  return entries.sort((a, b) => a.createdAt - b.createdAt);
}

export const getEntry = (id) => get(STORES.log, id);

/** Changes an entry's amount/unit/meal, re-scaling macros from its snapshot. */
export async function updateEntry(entry, { amount = entry.amount, unit = entry.unit, meal = entry.meal }) {
  if (!MEAL_IDS.includes(meal)) throw new Error(`Unknown meal: ${meal}`);
  const macros = entry.foodSnapshot ? macrosFor(entry.foodSnapshot, amount, unit) : {};
  const updated = { ...entry, amount, unit, meal, ...macros, updatedAt: Date.now() };
  await put(STORES.log, updated);
  return updated;
}

/** Deletes an entry. Keep the returned record to offer "Undo" via restoreEntry(). */
export async function deleteEntry(id) {
  const entry = await getEntry(id);
  await del(STORES.log, id);
  return entry;
}

export const restoreEntry = (entry) => put(STORES.log, entry);

/** { breakfast: [...], lunch: [...], dinner: [...], snacks: [...] } */
export function groupByMeal(entries) {
  const groups = Object.fromEntries(MEAL_IDS.map((id) => [id, []]));
  for (const entry of entries) (groups[entry.meal] ?? groups.snacks).push(entry);
  return groups;
}
