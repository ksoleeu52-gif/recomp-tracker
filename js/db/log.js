/**
 * The food log: one record per logged item.
 *
 * Log entry:
 * {
 *   id, date: 'YYYY-MM-DD', meal: 'breakfast' | 'lunch' | 'dinner' | 'snacks',
 *   foodId,                     // null for quick-add entries
 *   quickAdd,                   // true when logged as raw calories/macros (no food, no snapshot)
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
import { macrosFor, round1 } from '../lib/nutrition.js';
import { parseNumber } from '../lib/format.js';
import { MEALS } from '../config.js';

export const MEAL_IDS = MEALS.map((meal) => meal.id);

/** The parts of a food needed to re-scale an entry later. */
export function snapshotOf(food) {
  const { basis, kcal, protein, carbs, fat, servingGrams = null, servingLabel = '' } = food;
  return { basis, kcal, protein, carbs, fat, servingGrams, servingLabel };
}

/**
 * Builds (but doesn't save) a log entry for an amount of a food.
 * Throws if the meal is unknown or the unit can't be calculated for this food.
 */
export function buildEntry(food, { date, meal, amount, unit, savedMealId = null, now = Date.now() }) {
  if (!MEAL_IDS.includes(meal)) throw new Error(`Unknown meal: ${meal}`);
  const macros = macrosFor(food, amount, unit);
  return {
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
}

/**
 * Logs an amount of a food and remembers that amount as the food's new default
 * (so next time it's one tap). Both writes happen in one transaction.
 * @returns the new entry
 */
export async function logFood(food, { date, meal, amount, unit, rememberPortion = true }) {
  const now = Date.now();
  const entry = buildEntry(food, { date, meal, amount, unit, now });

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

/** Deletes several entries at once (used to undo logging a whole saved meal). */
export function deleteEntries(ids) {
  return transaction(STORES.log, 'readwrite', (s) => Promise.all(ids.map((id) => promisify(s[STORES.log].delete(id)))));
}

/**
 * Undoes logging: deletes the entries AND puts back the usage stats (Recent order,
 * remembered portion) that logging changed, so Undo leaves no trace.
 * @param {object[]} entries
 * @param {{ foods?: {id:string, usage:object}[], meals?: {id:string, usage:object}[] }} previous
 *        usage captured with usageOf() before logging
 */
export async function undoLogging(entries, { foods = [], meals = [] } = {}) {
  await transaction([STORES.log, STORES.foods, STORES.meals], 'readwrite', async (s) => {
    for (const entry of entries) s[STORES.log].delete(entry.id);
    for (const [store, list] of [[STORES.foods, foods], [STORES.meals, meals]]) {
      for (const { id, usage } of list) {
        const stored = await promisify(s[store].get(id));
        if (stored) s[store].put({ ...stored, ...usage });
      }
    }
  });
}

/** The fields logging changes on a food or saved meal (captured for undo). */
export function usageOf(record) {
  const { lastUsedAt = 0, useCount = 0, defaultAmount = null, defaultUnit = null } = record;
  return record.items ? { lastUsedAt, useCount } : { lastUsedAt, useCount, defaultAmount, defaultUnit };
}

// ---------- Quick add (calories/macros without a food) ----------

/**
 * Validates quick-add input. Only calories are required.
 * @returns {{ valid: boolean, errors: Record<string,string>, fields: object }}
 */
export function validateQuickAdd(input) {
  const errors = {};
  const name = String(input.name ?? '').trim().replace(/\s+/g, ' ') || 'Quick add';
  if (name.length > 60) errors.name = 'Keep the name under 60 characters.';

  const number = (field, max, required = false) => {
    const raw = String(input[field] ?? '').trim();
    if (raw === '') {
      if (required) errors[field] = 'Required.';
      return 0;
    }
    const n = parseNumber(raw);
    if (!Number.isFinite(n) || n < 0) errors[field] = 'Enter a number (0 or more).';
    else if (n > max) errors[field] = `Max ${max}.`;
    return round1(n);
  };

  const fields = {
    name,
    kcal: number('kcal', 5000, true),
    protein: number('protein', 500),
    carbs: number('carbs', 1000),
    fat: number('fat', 500),
  };
  return { valid: Object.keys(errors).length === 0, errors, fields };
}

/** Logs raw calories/macros with no food attached. */
export async function logQuickAdd({ date, meal, name, kcal, protein, carbs, fat }) {
  if (!MEAL_IDS.includes(meal)) throw new Error(`Unknown meal: ${meal}`);
  const now = Date.now();
  const entry = {
    id: newId(),
    date,
    meal,
    foodId: null,
    name,
    brand: '',
    amount: null,
    unit: null,
    kcal,
    protein,
    carbs,
    fat,
    foodSnapshot: null,
    savedMealId: null,
    quickAdd: true,
    createdAt: now,
    updatedAt: now,
  };
  await put(STORES.log, entry);
  return entry;
}

/** Edits a quick-add entry's values and/or meal. */
export async function updateQuickEntry(entry, { meal = entry.meal, ...fields }) {
  if (!MEAL_IDS.includes(meal)) throw new Error(`Unknown meal: ${meal}`);
  const updated = { ...entry, ...fields, meal, updatedAt: Date.now() };
  await put(STORES.log, updated);
  return updated;
}

// ---------- Copy a previous day's meal ----------

/**
 * Copies entries (e.g. yesterday's breakfast) into another day/meal as new entries.
 * Snapshots and totals are copied as-is, so the copy matches exactly what was eaten.
 * @returns the new entries
 */
export async function copyEntries(entries, { date, meal }) {
  const now = Date.now();
  const copies = entries.map((entry, i) => ({
    ...entry,
    id: newId(),
    date,
    meal,
    createdAt: now + i, // keep the original order
    updatedAt: now + i,
  }));
  await transaction(STORES.log, 'readwrite', (s) => Promise.all(copies.map((c) => promisify(s[STORES.log].put(c)))));
  return copies;
}

/** { breakfast: [...], lunch: [...], dinner: [...], snacks: [...] } */
export function groupByMeal(entries) {
  const groups = Object.fromEntries(MEAL_IDS.map((id) => [id, []]));
  for (const entry of entries) (groups[entry.meal] ?? groups.snacks).push(entry);
  return groups;
}
