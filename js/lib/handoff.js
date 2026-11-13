/**
 * Passes a value from one screen to the next (e.g. a scanned product from the
 * Scan screen to the food editor) without stuffing it into the URL.
 * Values are read once: take() removes them, so a reload never re-applies stale data.
 */
const values = new Map();

export function handOff(key, value) {
  values.set(key, value);
}

export function take(key) {
  const value = values.get(key);
  values.delete(key);
  return value;
}
