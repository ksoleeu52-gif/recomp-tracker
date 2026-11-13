/**
 * Pure nutrition maths. No DOM or database access, so it's easy to unit test.
 *
 * Macro fields everywhere in the app: kcal, protein, carbs, fat (grams except kcal).
 *
 * A food stores its values on one of two bases:
 *   - 'per100g'    values are per 100 g (how EU/Irish packets are labelled)
 *   - 'perServing' values are per 1 serving/item (1 egg, 1 protein bar)
 * An optional servingGrams links the two, so either kind can be logged in grams
 * or in servings.
 */
export const MACROS = ['kcal', 'protein', 'carbs', 'fat'];

export const emptyTotals = () => ({ kcal: 0, protein: 0, carbs: 0, fat: 0 });

/** Rounds to one decimal place (what we store, to avoid float noise like 10.600000001). */
export const round1 = (n) => Math.round(n * 10) / 10;

/** Adds up the macros of any list of objects that have kcal/protein/carbs/fat fields. */
export function sumMacros(items) {
  return items.reduce((totals, item) => {
    for (const key of MACROS) totals[key] += Number(item[key]) || 0;
    return totals;
  }, emptyTotals());
}

/**
 * How much of a target is left, as a whole number.
 *   remaining(2400, 1250) -> { amount: 1150, over: false }
 *   remaining(2400, 2650) -> { amount: 250,  over: true  }
 */
export function remaining(target, eaten) {
  const diff = Math.round(target - eaten);
  return { amount: Math.abs(diff), over: diff < 0 };
}

/** Fraction of a target reached (can exceed 1). */
export function progress(eaten, target) {
  return target > 0 ? eaten / target : 0;
}

// ---------- Scaling foods to an amount ----------

/** Units a food can be logged in, most natural first. */
export function unitsFor(food) {
  const hasWeight = Number(food.servingGrams) > 0;
  if (food.basis === 'perServing') return hasWeight ? ['serving', 'g'] : ['serving'];
  return hasWeight ? ['g', 'serving'] : ['g'];
}

/**
 * The multiplier to apply to a food's stored values for `amount` of `unit`.
 * Returns NaN when the combination is impossible (e.g. grams of a per-serving
 * food with no serving weight).
 */
export function scaleFactor(food, amount, unit) {
  const servingGrams = Number(food.servingGrams);
  if (!(amount >= 0)) return NaN;

  if (food.basis === 'per100g') {
    if (unit === 'g') return amount / 100;
    if (unit === 'serving' && servingGrams > 0) return (amount * servingGrams) / 100;
  } else if (food.basis === 'perServing') {
    if (unit === 'serving') return amount;
    if (unit === 'g' && servingGrams > 0) return amount / servingGrams;
  }
  return NaN;
}

/**
 * Macros for an amount of a food, rounded to 1 decimal.
 *   macrosFor(oats per100g {kcal: 379, ...}, 80, 'g') -> { kcal: 303.2, ... }
 */
export function macrosFor(food, amount, unit) {
  const factor = scaleFactor(food, amount, unit);
  if (Number.isNaN(factor)) throw new Error(`Can't measure "${food.name}" in ${unit}`);
  return Object.fromEntries(MACROS.map((key) => [key, round1((Number(food[key]) || 0) * factor)]));
}

/** The portion to pre-fill when logging: last used, else one serving, else 100 g. */
export function defaultPortion(food) {
  const units = unitsFor(food);
  if (food.defaultAmount > 0 && units.includes(food.defaultUnit)) {
    return { amount: food.defaultAmount, unit: food.defaultUnit };
  }
  if (units.includes('serving')) return { amount: 1, unit: 'serving' };
  return { amount: 100, unit: 'g' };
}

/** Energy implied by the macros (Atwater factors 4/4/9). Used to sanity-check labels. */
export function kcalFromMacros({ protein = 0, carbs = 0, fat = 0 }) {
  return 4 * protein + 4 * carbs + 9 * fat;
}
