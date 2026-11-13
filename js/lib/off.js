/**
 * Open Food Facts lookup (https://world.openfoodfacts.org) — a free, open,
 * crowd-sourced food database. No API key needed, and it allows browser requests.
 *
 * The data is community-entered, so it can be incomplete or wrong. That's why the
 * result is only ever used to pre-fill the food editor, never saved directly.
 */
import { round1 } from './nutrition.js';

const API = 'https://world.openfoodfacts.org/api/v2/product/';
// Ask only for the fields we use: a much smaller, faster response.
const FIELDS = 'code,product_name,product_name_en,generic_name,brands,serving_size,serving_quantity,nutriments';
const KJ_PER_KCAL = 4.184;

/**
 * @param {string} code  barcode digits
 * @returns {Promise<{ found: false } | { found: true, food: object, missing: string[] }>}
 * @throws if the network fails or times out (the caller offers "try again / enter manually")
 */
export async function lookupBarcode(code, options) {
  const result = await lookupOnce(code, options);
  // UPC-A (12 digits) is often stored as EAN-13 with a leading zero.
  if (!result.found && code.length === 12) {
    const padded = await lookupOnce(`0${code}`, options);
    if (padded.found) padded.food.barcode = code;
    return padded;
  }
  return result;
}

async function lookupOnce(code, { timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API}${encodeURIComponent(code)}.json?fields=${FIELDS}`, { signal: controller.signal });
    if (response.status === 404) return { found: false };
    if (!response.ok) throw new Error(`Open Food Facts returned ${response.status}`);
    const data = await response.json();
    if (data.status !== 1 || !data.product) return { found: false };
    return { found: true, ...productToFood(data.product, code) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Converts an Open Food Facts product into our food fields (per 100 g).
 * Missing values are left blank (not 0) so the user has to fill them in,
 * and are listed in `missing` so the editor can point them out.
 * Pure function — unit tested with sample API responses.
 */
export function productToFood(product, code) {
  const n = product.nutriments ?? {};
  const number = (value) => {
    const x = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
    return Number.isFinite(x) && x >= 0 ? round1(x) : '';
  };

  // Prefer kcal; fall back to converting kJ (some products only list kJ).
  let kcal = number(n['energy-kcal_100g']);
  if (kcal === '') {
    const kj = number(n['energy-kj_100g'] ?? n.energy_100g);
    kcal = kj === '' ? '' : Math.round(kj / KJ_PER_KCAL);
  }

  const food = {
    name: cleanText(product.product_name_en || product.product_name || product.generic_name).slice(0, 80),
    brand: cleanText(String(product.brands ?? '').split(',')[0]),
    basis: 'per100g',
    kcal,
    protein: number(n.proteins_100g),
    carbs: number(n.carbohydrates_100g),
    fat: number(n.fat_100g),
    ...serving(product),
    barcode: code,
  };

  const labels = { name: 'name', kcal: 'calories', protein: 'protein', carbs: 'carbs', fat: 'fat' };
  const missing = Object.entries(labels).filter(([key]) => food[key] === '').map(([, label]) => label);
  return { food, missing };
}

/** "1 bar (45 g)" + 45 -> { servingLabel: 'bar', servingGrams: 45 } */
function serving(product) {
  const grams = Number(product.serving_quantity);
  if (!(grams > 0 && grams <= 2000)) return { servingLabel: '', servingGrams: '' };
  let label = cleanText(String(product.serving_size ?? ''))
    .replace(/\(.*?\)/g, '') // drop "(45 g)"
    .replace(/^1(?:\s*[x×])?\s+/i, '') // "1 bar" -> "bar" ("10 almonds" is left alone)
    .trim();
  // A label that's only a weight ("30 g") says nothing new.
  if (!label || /^[\d.,\s]+(g|ml|gr|grams?)$/i.test(label)) label = 'serving';
  return { servingLabel: label.slice(0, 40), servingGrams: round1(grams) };
}

const cleanText = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
