import { test, assertEqual, assert } from './harness.js';
import { normaliseBarcode, isValidBarcode } from '../js/lib/barcode.js';
import { productToFood } from '../js/lib/off.js';
import { getDetector } from '../js/lib/scanner.js';
import { saveFood, findFoodByBarcode, archiveFood } from '../js/db/foods.js';

// ---------- Barcode digits ----------

test('normaliseBarcode keeps digits only', () => {
  assertEqual(normaliseBarcode(' 5 000159 484695 '), '5000159484695');
  assertEqual(normaliseBarcode(null), '');
});

test('isValidBarcode checks length and check digit', () => {
  assert(isValidBarcode('5000159484695'), 'EAN-13');
  assert(isValidBarcode('3017620422003'), 'EAN-13 (Nutella)');
  assert(isValidBarcode('036000291452'), 'UPC-A');
  assert(isValidBarcode('96385074'), 'EAN-8');
  assert(!isValidBarcode('5000159484696'), 'wrong check digit');
  assert(!isValidBarcode('12345'), 'too short');
});

// ---------- Open Food Facts mapping ----------

test('productToFood maps a typical product (per 100 g, first brand)', () => {
  const { food, missing } = productToFood({
    product_name: 'Nutella',
    brands: 'Ferrero, Nutella',
    nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 },
  }, '3017620422003');
  assertEqual(
    [food.name, food.brand, food.basis, food.kcal, food.protein, food.carbs, food.fat, food.barcode],
    ['Nutella', 'Ferrero', 'per100g', 539, 6.3, 57.5, 30.9, '3017620422003'],
  );
  assertEqual(missing, []);
});

test('productToFood converts kJ when kcal is missing, and lists missing values', () => {
  const { food, missing } = productToFood({ product_name: 'Mystery bar', nutriments: { 'energy-kj_100g': 2092, proteins_100g: '20,5' } }, '1');
  assertEqual([food.kcal, food.protein, food.carbs, food.fat], [500, 20.5, '', '']);
  assertEqual(missing, ['carbs', 'fat']);
});

test('productToFood: English name preferred, nothing found means everything missing', () => {
  assertEqual(productToFood({ product_name: 'Lait', product_name_en: 'Milk', nutriments: {} }, '1').food.name, 'Milk');
  assertEqual(productToFood({}, '1').missing, ['name', 'calories', 'protein', 'carbs', 'fat']);
});

test('productToFood reads the serving size', () => {
  const bar = productToFood({ serving_size: '1 bar (45 g)', serving_quantity: 45 }, '1').food;
  assertEqual([bar.servingLabel, bar.servingGrams], ['bar', 45]);
  const weightOnly = productToFood({ serving_size: '30 g', serving_quantity: '30' }, '1').food;
  assertEqual([weightOnly.servingLabel, weightOnly.servingGrams], ['serving', 30]);
  const none = productToFood({ serving_size: '', serving_quantity: 0 }, '1').food;
  assertEqual([none.servingLabel, none.servingGrams], ['', '']);
});

test('productToFood escapes nothing itself — but the html helper does (no markup from the API)', () => {
  const { food } = productToFood({ product_name: '<img src=x onerror=alert(1)>' }, '1');
  assertEqual(food.name, '<img src=x onerror=alert(1)>'); // stored as plain text; rendering escapes it
});

// ---------- Local lookup ----------

test('findFoodByBarcode finds saved foods and ignores deleted ones', async () => {
  const food = await saveFood({ name: 'Scanned yogurt', basis: 'per100g', kcal: 60, protein: 10, carbs: 4, fat: 0, barcode: '5000000000001' });
  assertEqual((await findFoodByBarcode('5000000000001'))?.id, food.id);
  await archiveFood(food.id);
  assertEqual(await findFoodByBarcode('5000000000001'), null);
  assertEqual(await findFoodByBarcode('0000000000000'), null);
});

// ---------- Real decoding (ZXing WebAssembly, or the native detector) ----------

test('the scanner decodes a real EAN-13 image', async () => {
  const image = new Image();
  image.src = 'fixtures/ean13-5000159484695.png';
  await image.decode();
  const detector = await getDetector();
  const codes = await detector.detect(image);
  assertEqual(codes, ['5000159484695'], `decoder: ${detector.name}`);

  // The decoder must come from our own files (works offline), never a CDN.
  const cdnRequests = performance.getEntriesByType('resource').filter((e) => /jsdelivr|unpkg/.test(e.name));
  assertEqual(cdnRequests.map((e) => e.name), []);
});
