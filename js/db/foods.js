/**
 * The "My Foods" library: validation, storage and search.
 *
 * Food record:
 * {
 *   id, name, brand,
 *   basis: 'per100g' | 'perServing',
 *   kcal, protein, carbs, fat,     // per 100 g, or per 1 serving
 *   servingLabel, servingGrams,    // e.g. "scoop", 30 (both optional for per-100g foods)
 *   defaultAmount, defaultUnit,    // last-used portion, pre-filled when logging
 *   isFavourite, lastUsedAt, useCount,
 *   barcode, source: 'manual' | 'starter' | 'barcode' | 'recipe',
 *   archived, createdAt, updatedAt
 * }
 *
 * Deleting a food only archives it: past log entries keep their own copy of the
 * numbers, and saved meals can still show what they referred to.
 */
import { get, getAll, put, transaction, promisify, newId, STORES } from './idb.js';
import { parseNumber } from '../lib/format.js';
import { unitsFor } from '../lib/nutrition.js';

export const BASES = ['per100g', 'perServing'];

const NEW_FOOD_DEFAULTS = {
  brand: '',
  servingLabel: '',
  servingGrams: null,
  isFavourite: false,
  lastUsedAt: 0,
  useCount: 0,
  barcode: null,
  source: 'manual',
  archived: false,
};

// ---------- Validation (pure) ----------

/**
 * Validates and normalises raw form input into food fields.
 * Limits catch typos and mis-read labels (nothing has more than ~900 kcal per 100 g).
 * @returns {{ valid: boolean, errors: Record<string,string>, food: object }}
 */
export function validateFood(input) {
  const errors = {};
  const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

  const name = clean(input.name);
  if (!name) errors.name = 'Give the food a name.';
  else if (name.length > 80) errors.name = 'Keep the name under 80 characters.';

  const basis = BASES.includes(input.basis) ? input.basis : 'per100g';
  const per100g = basis === 'per100g';

  /** Parses an optional/required non-negative number with an upper bound. */
  const number = (field, { required = false, max, empty = 0 }) => {
    const raw = clean(input[field]);
    if (raw === '') {
      if (required) errors[field] = 'Required.';
      return empty;
    }
    const n = parseNumber(raw);
    if (!Number.isFinite(n) || n < 0) errors[field] = 'Enter a number (0 or more).';
    else if (n > max) errors[field] = `More than ${max}? Check the label.`;
    return n;
  };

  const kcal = number('kcal', { required: true, max: per100g ? 900 : 5000 });
  const protein = number('protein', { max: per100g ? 100 : 500 });
  const carbs = number('carbs', { max: per100g ? 100 : 1000 });
  const fat = number('fat', { max: per100g ? 100 : 500 });
  if (per100g && !errors.protein && !errors.carbs && !errors.fat && protein + carbs + fat > 101) {
    errors.fat = 'Protein + carbs + fat can’t be more than 100g per 100g.';
  }

  const servingGrams = number('servingGrams', { max: 5000, empty: null });
  if (servingGrams === 0) errors.servingGrams = 'Must be more than 0.';

  // "1 egg" / "1x egg" -> "egg" (we display "2 × egg"); "10 almonds" is left alone.
  let servingLabel = clean(input.servingLabel).replace(/^1(?:\s*[x×])?\s+/i, '');
  if (servingLabel.length > 40) errors.servingLabel = 'Keep it under 40 characters.';
  if (!servingLabel && (!per100g || servingGrams)) servingLabel = 'serving';

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    food: { name, brand: clean(input.brand), basis, kcal, protein, carbs, fat, servingLabel, servingGrams },
  };
}

// ---------- Search (pure) ----------

/** Lowercase, accents removed ("Café" -> "cafe"), single spaces. */
export function normalise(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Filters foods so that every word of the query appears in the name or brand.
 * Names that start with the first word are ranked first ("egg" finds "Eggs" before "Nutella egg").
 */
export function matchFoods(foods, query) {
  const words = normalise(query).split(' ').filter(Boolean);
  if (words.length === 0) return foods;
  return foods
    .map((food) => ({ food, name: normalise(food.name), text: normalise(`${food.name} ${food.brand ?? ''}`) }))
    .filter(({ text }) => words.every((word) => text.includes(word)))
    .sort((a, b) => Number(b.name.startsWith(words[0])) - Number(a.name.startsWith(words[0])))
    .map(({ food }) => food);
}

// ---------- Storage ----------

export const getFood = (id) => get(STORES.foods, id);

/** All active foods, sorted A–Z. */
export async function listFoods({ includeArchived = false } = {}) {
  const foods = await getAll(STORES.foods);
  return foods
    .filter((food) => includeArchived || !food.archived)
    .sort((a, b) => a.name.localeCompare(b.name, 'en-IE', { sensitivity: 'base' }));
}

/**
 * Creates (no id) or updates (id given) a food from validated fields.
 * @returns the stored food record
 */
export async function saveFood(fields, id = null) {
  const now = Date.now();
  const existing = id ? await getFood(id) : null;
  const food = {
    ...NEW_FOOD_DEFAULTS,
    ...existing,
    ...fields,
    id: existing?.id ?? newId(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  // If an edit removed the unit we used to pre-fill (e.g. serving weight deleted), forget it.
  if (food.defaultUnit && !unitsFor(food).includes(food.defaultUnit)) {
    food.defaultAmount = null;
    food.defaultUnit = null;
  }
  await put(STORES.foods, food);
  return food;
}

/** Soft delete. Returns the food so the caller can offer "Undo". */
export async function archiveFood(id) {
  const food = await getFood(id);
  if (!food) return null;
  await put(STORES.foods, { ...food, archived: true, updatedAt: Date.now() });
  return food;
}

export async function restoreFood(id) {
  const food = await getFood(id);
  if (food) await put(STORES.foods, { ...food, archived: false, updatedAt: Date.now() });
}

/** Adds several foods in one transaction (used for the starter pack and, later, backup import). */
export async function addFoods(list, source = 'manual') {
  const now = Date.now();
  await transaction(STORES.foods, 'readwrite', (s) =>
    Promise.all(
      list.map((fields) =>
        promisify(s[STORES.foods].put({ ...NEW_FOOD_DEFAULTS, source, ...fields, id: newId(), createdAt: now, updatedAt: now }))
      )
    )
  );
}
