/**
 * User settings: daily targets and housekeeping values.
 * Stored as a single record with key "main".
 */
import { get, put, STORES } from './idb.js';
import { parseNumber } from '../lib/format.js';

const KEY = 'main';

export const DEFAULT_SETTINGS = Object.freeze({
  key: KEY,
  calorieTarget: 2400, // kcal per day
  proteinTarget: 160, // grams per day
  lastBackupAt: null, // timestamp of the last JSON export (used for the weekly reminder)
});

/** Sensible bounds so a typo (e.g. 24000 kcal) can't be saved. */
export const TARGET_LIMITS = Object.freeze({
  calorieTarget: { min: 800, max: 8000, unit: ' kcal' },
  proteinTarget: { min: 20, max: 400, unit: 'g' },
});

export async function getSettings() {
  const stored = await get(STORES.settings, KEY);
  return { ...DEFAULT_SETTINGS, ...stored };
}

/** Merges `patch` into the stored settings and returns the result. */
export async function updateSettings(patch) {
  const next = { ...(await getSettings()), ...patch, key: KEY, updatedAt: Date.now() };
  await put(STORES.settings, next);
  return next;
}

/**
 * Validates raw form input for the daily targets.
 * Pure function (no DB access) so it can be unit tested.
 * @returns {{ valid: boolean, errors: Record<string,string>, values: Record<string,number> }}
 */
export function validateTargets(input) {
  const errors = {};
  const values = {};
  for (const [field, { min, max, unit }] of Object.entries(TARGET_LIMITS)) {
    const n = parseNumber(input[field]);
    if (!Number.isFinite(n)) errors[field] = 'Enter a number.';
    else if (n < min || n > max) errors[field] = `Must be between ${min} and ${max}${unit}.`;
    else values[field] = Math.round(n);
  }
  return { valid: Object.keys(errors).length === 0, errors, values };
}
