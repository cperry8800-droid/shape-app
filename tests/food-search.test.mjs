// Vectors for the pure food-search layer (normalize / merge / rank) —
// fixture payloads shaped like real USDA FDC search hits and Open Food Facts
// products, incl. the honest-data kcal-drop rule and the serving-math paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFdcFood, normalizeOffProduct, mergeAndRank } from '../mobile-app/src/services/foodSearch.mjs';

const FDC_CHICKEN = {
  fdcId: 171077, description: 'Chicken, broilers or fryers, breast, meat only, cooked, roasted',
  dataType: 'SR Legacy',
  foodNutrients: [
    { nutrientNumber: '208', nutrientName: 'Energy', value: 165, unitName: 'KCAL' },
    { nutrientNumber: '203', nutrientName: 'Protein', value: 31, unitName: 'G' },
    { nutrientNumber: '205', nutrientName: 'Carbohydrate, by difference', value: 0, unitName: 'G' },
    { nutrientNumber: '204', nutrientName: 'Total lipid (fat)', value: 3.6, unitName: 'G' },
  ],
};
const FDC_WITH_SERVING = { ...FDC_CHICKEN, fdcId: 999, description: 'Egg, whole, cooked', servingSize: 50, servingSizeUnit: 'g' };
const FDC_NO_KCAL = { fdcId: 1, description: 'Mystery food', foodNutrients: [{ nutrientNumber: '203', value: 10 }] };

const OFF_BAR = {
  code: '0722252100900', product_name: 'Chocolate Chip Cookie Dough Bar', brands: 'Clif Bar',
  serving_size: '68 g', serving_quantity: 68,
  nutriments: { 'energy-kcal_100g': 368, proteins_100g: 13.2, carbohydrates_100g: 60.3, fat_100g: 7.4 },
};
const OFF_SERVING_ONLY = {
  code: '111', product_name: 'Protein Shake', brands: 'Premier Protein', serving_size: '340 ml',
  nutriments: { 'energy-kcal_serving': 160, proteins_serving: 30, carbohydrates_serving: 5, fat_serving: 3 },
};
const OFF_NO_KCAL = { code: '2', product_name: 'Sparkling Water', brands: 'X', nutriments: {} };

test('normalizeFdcFood: per-100g default serving, integers, honest label', () => {
  const r = normalizeFdcFood(FDC_CHICKEN);
  assert.equal(r.source, 'fdc');
  assert.equal(r.qty, '100 g');
  assert.equal(r.kcal, 165);
  assert.equal(r.p, 31);
  assert.equal(r.f, 4); // 3.6 rounds up to an editable integer
  assert.deepEqual(r.per100g, { kcal: 165, p: 31, c: 0, f: 3.6 });
});

test('normalizeFdcFood: serving math from servingSize grams', () => {
  const r = normalizeFdcFood(FDC_WITH_SERVING);
  assert.equal(r.qty, '50 g');
  assert.equal(r.kcal, 83); // 165 × 0.5 → 82.5 → 83
});

test('normalizeFdcFood: kcal-less row is dropped, never a fabricated 0', () => {
  assert.equal(normalizeFdcFood(FDC_NO_KCAL), null);
});

test('normalizeFdcFood: a null energy value never fabricates a 0-kcal row', () => {
  const raw = { fdcId: 3, description: 'Null energy', foodNutrients: [{ nutrientNumber: '208', value: null }] };
  assert.equal(normalizeFdcFood(raw), null);
});

test('normalizeOffProduct: serving from serving_quantity grams', () => {
  const r = normalizeOffProduct(OFF_BAR);
  assert.equal(r.source, 'off');
  assert.equal(r.brand, 'Clif Bar');
  assert.equal(r.qty, '68 g');
  assert.equal(r.kcal, 250); // 368 × 0.68 → 250.24 → 250
  assert.equal(r.barcode, '0722252100900'); // kept for v2 barcode scan
});

test('normalizeOffProduct: per-serving nutriments when no per-100g exists', () => {
  const r = normalizeOffProduct(OFF_SERVING_ONLY);
  assert.equal(r.qty, '340 ml');
  assert.equal(r.kcal, 160);
  assert.equal(r.p, 30);
});

test('normalizeOffProduct: kcal-less product is dropped', () => {
  assert.equal(normalizeOffProduct(OFF_NO_KCAL), null);
});

test('mergeAndRank: generic (FDC) above branded for a whole-food query', () => {
  const fdc = [normalizeFdcFood(FDC_CHICKEN)];
  const off = [normalizeOffProduct({ ...OFF_BAR, product_name: 'Chicken breast strips', brands: 'Tyson' })];
  const out = mergeAndRank(fdc, off, 'chicken breast');
  assert.equal(out[0].source, 'fdc');
});

test('mergeAndRank: brand-looking query surfaces the branded row first', () => {
  const fdc = [normalizeFdcFood({ ...FDC_CHICKEN, description: 'Cookie, chocolate chip' })];
  const off = [normalizeOffProduct(OFF_BAR)];
  const out = mergeAndRank(fdc, off, 'clif bar');
  assert.equal(out[0].source, 'off');
});

test('mergeAndRank: dedupes near-identical name+brand, drops kcal-less, caps at 12', () => {
  const dup = normalizeOffProduct(OFF_BAR);
  const many = Array.from({ length: 20 }, (_, i) => ({ ...normalizeOffProduct(OFF_BAR), id: `off-${i}`, name: `Bar ${i}`, brand: null }));
  const out = mergeAndRank([], [dup, { ...dup }, { ...dup, kcal: null }, ...many], 'bar');
  assert.equal(out.filter(r => r.name === dup.name).length, 1);
  assert.ok(out.every(r => Number.isFinite(r.kcal)));
  assert.equal(out.length, 12);
});

test('mergeAndRank: prefix match outranks substring match', () => {
  const a = { id: 'a', source: 'fdc', name: 'Rice, jasmine, cooked', brand: null, qty: '100 g', kcal: 130, p: 3, c: 28, f: 0, per100g: null, servings: [] };
  const b = { id: 'b', source: 'fdc', name: 'Fried rice', brand: null, qty: '100 g', kcal: 190, p: 5, c: 30, f: 6, per100g: null, servings: [] };
  const out = mergeAndRank([b, a], [], 'rice');
  assert.equal(out[0].id, 'a');
});
