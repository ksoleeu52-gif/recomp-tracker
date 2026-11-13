/**
 * Pure nutrition maths. No DOM or database access, so it's easy to unit test.
 * Macro fields everywhere in the app: kcal, protein, carbs, fat (grams except kcal).
 */
export const MACROS = ['kcal', 'protein', 'carbs', 'fat'];

export const emptyTotals = () => ({ kcal: 0, protein: 0, carbs: 0, fat: 0 });

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
