/**
 * Saved meals: reusable groups of foods ("My usual breakfast" = 80g oats + 30g whey + 1 banana).
 *
 * Saved meal record:
 * {
 *   id, name,
 *   mealType: 'breakfast' | 'lunch' | 'dinner' | 'snacks',  // where it's offered first
 *   items: [{ foodId, amount, unit }],
 *   lastUsedAt, useCount, createdAt, updatedAt
 * }
 *
 * Items reference foods by id rather than copying them, so fixing a food's values
 * also fixes every meal that uses it. Logging a meal creates one normal log entry
 * per item (each with its own snapshot), so single items can be tweaked afterwards.
 */
import { get, getAll, put, del, transaction, promisify, newId, STORES } from './idb.js';
import { buildEntry, MEAL_IDS } from './log.js';
import { macrosFor, sumMacros } from '../lib/nutrition.js';
import { parseNumber } from '../lib/format.js';

const MAX_AMOUNT = { g: 5000, serving: 100 };

// ---------- Validation & maths (pure) ----------

/**
 * @param {{ name: string, mealType: string, items: {foodId:string, amount:any, unit:string}[] }} input
 * @returns {{ valid: boolean, errors: Record<string,string>, meal: object }}
 */
export function validateMeal(input) {
  const errors = {};
  const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) errors.name = 'Give the meal a name.';
  else if (name.length > 60) errors.name = 'Keep the name under 60 characters.';

  const mealType = MEAL_IDS.includes(input.mealType) ? input.mealType : null;
  if (!mealType) errors.mealType = 'Choose when you usually eat it.';

  const items = (input.items ?? []).map(({ foodId, amount, unit }) => ({ foodId, amount: parseNumber(amount), unit }));
  if (items.length === 0) errors.items = 'Add at least one food.';
  else if (items.some((item) => !(item.amount > 0 && item.amount <= (MAX_AMOUNT[item.unit] ?? 0)))) {
    errors.items = 'Check the amounts: each must be above 0.';
  }

  return { valid: Object.keys(errors).length === 0, errors, meal: { name, mealType, items } };
}

/**
 * Pairs each item with its food and macros. `macros` is null when the food is
 * missing or can no longer be measured in the saved unit.
 */
export function resolveItems(meal, foodsById) {
  return meal.items.map((item) => {
    const food = foodsById.get(item.foodId) ?? null;
    let macros = null;
    if (food) {
      try {
        macros = macrosFor(food, item.amount, item.unit);
      } catch {
        macros = null;
      }
    }
    return { ...item, food, macros };
  });
}

export function mealTotals(meal, foodsById) {
  return sumMacros(resolveItems(meal, foodsById).filter((r) => r.macros).map((r) => r.macros));
}

// ---------- Storage ----------

export const getMeal = (id) => get(STORES.meals, id);

/** All saved meals: grouped in meal order, most recently used first, then A–Z. */
export async function listMeals() {
  const meals = await getAll(STORES.meals);
  return meals.sort(
    (a, b) =>
      MEAL_IDS.indexOf(a.mealType) - MEAL_IDS.indexOf(b.mealType) ||
      (b.lastUsedAt || 0) - (a.lastUsedAt || 0) ||
      a.name.localeCompare(b.name, 'en-IE', { sensitivity: 'base' })
  );
}

export async function saveMeal(fields, id = null) {
  const now = Date.now();
  const existing = id ? await getMeal(id) : null;
  const meal = {
    lastUsedAt: 0,
    useCount: 0,
    ...existing,
    ...fields,
    id: existing?.id ?? newId(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await put(STORES.meals, meal);
  return meal;
}

/** Deletes a saved meal (past log entries are unaffected). Returns it for "Undo". */
export async function deleteMeal(id) {
  const meal = await getMeal(id);
  await del(STORES.meals, id);
  return meal;
}

export const restoreMeal = (meal) => put(STORES.meals, meal);

/**
 * Logs every item of a saved meal into a meal slot, in one transaction.
 * Items whose food is missing are skipped. Unlike single logging, this does
 * not change each food's remembered portion.
 * @returns the created entries
 */
export async function logSavedMeal(meal, foodsById, { date, slot }) {
  const now = Date.now();
  const resolved = resolveItems(meal, foodsById).filter((r) => r.macros);
  // now + i keeps the items in their saved order (the day log sorts by createdAt).
  const entries = resolved.map((r, i) =>
    buildEntry(r.food, { date, meal: slot, amount: r.amount, unit: r.unit, savedMealId: meal.id, now: now + i })
  );

  await transaction([STORES.log, STORES.foods, STORES.meals], 'readwrite', async (s) => {
    for (const entry of entries) s[STORES.log].put(entry);
    for (const { food } of resolved) {
      const stored = await promisify(s[STORES.foods].get(food.id));
      if (stored) s[STORES.foods].put({ ...stored, lastUsedAt: now, useCount: (stored.useCount || 0) + 1 });
    }
    const storedMeal = await promisify(s[STORES.meals].get(meal.id));
    if (storedMeal) s[STORES.meals].put({ ...storedMeal, lastUsedAt: now, useCount: (storedMeal.useCount || 0) + 1 });
  });
  return entries;
}
