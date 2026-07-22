import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BS_PREP_WINDOW_MS, bsQtyParse, bsScaleQty, bsMergeMise, bsPrepEstimate,
  bsPrepOrder, bsPrepWeekKey, bsPrunePrep, bsPrepMatch, bsPrepSummary,
} from '../mobile-app/src/services/mealPrep.mjs';

const NOW = 1753142400000; // fixed epoch — injected clock everywhere
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

test('bsQtyParse: numbers, fractions, units, tails, junk', () => {
  assert.deepEqual(bsQtyParse('200 g'), { num: 200, unit: 'g', unitKey: 'g', rest: '' });
  assert.deepEqual(bsQtyParse('1.5 cups'), { num: 1.5, unit: 'cups', unitKey: 'cup', rest: '' });
  assert.equal(bsQtyParse('1/2 tsp').num, 0.5);
  assert.equal(bsQtyParse('6 oz chicken, skin-on').rest, 'chicken, skin-on');
  assert.equal(bsQtyParse('a pinch'), null);
  assert.equal(bsQtyParse(''), null);
  assert.equal(bsQtyParse('0 g'), null);          // zero is not a quantity
});

test('bsScaleQty: scales parseable, null for unparseable, identity at 1', () => {
  assert.equal(bsScaleQty('200 g', 2), '400 g');
  assert.equal(bsScaleQty('1/2 cup', 3), '1.5 cup');
  assert.equal(bsScaleQty('a pinch', 2), null);    // caller annotates ×2 instead
  assert.equal(bsScaleQty('200 g', 1), '200 g');   // no arithmetic at 1
});

test('bsMergeMise: same-unit sums, clashing units keep both lines, honest annotation', () => {
  const a = { title: 'Chicken bowl', ingredients: [
    { n: '200 g', m: 'Chicken thigh' }, { n: '1 cup', m: 'Rice' }, { n: 'a pinch', m: 'Salt' },
  ], prepNote: 'Dice the onion' };
  const b = { title: 'Turkey cups', ingredients: [
    { n: '150 g', m: 'chicken thigh' },            // case-insensitive name merge
    { n: '200 g', m: 'Rice' },                     // CLASHING unit vs "1 cup" — both lines
    { n: 'a pinch', m: 'Salt' },                   // identical raw → ×2 collapse
  ], prepNote: 'Dice the onion' };                 // duplicate prep note dedupes
  const m = bsMergeMise([{ cookable: a }, { cookable: b }]);
  const chicken = m.ingredients.filter((r) => r.m === 'Chicken thigh');
  assert.equal(chicken.length, 1);
  assert.equal(chicken[0].n, '350 g');             // 200 + 150 SUMMED
  assert.equal(chicken[0].from, 'Chicken bowl · Turkey cups');
  const rice = m.ingredients.filter((r) => r.m === 'Rice');
  assert.equal(rice.length, 2);                    // cup + g never converted
  assert.deepEqual(rice.map((r) => r.n).sort(), ['1 cup', '200 g']);
  const salt = m.ingredients.filter((r) => r.m === 'Salt');
  assert.equal(salt.length, 1);
  assert.equal(salt[0].n, 'a pinch ×2');
  assert.equal(m.prep.length, 1);                  // deduped prep task
  assert.equal(m.prep[0].label, 'Dice the onion');
});

test('bsMergeMise: servings mult scales parseable + annotates unparseable', () => {
  const c = { title: 'Bowl', ingredients: [
    { n: '100 g', m: 'Oats' }, { n: 'a handful', m: 'Berries' },
  ] };
  const m = bsMergeMise([{ cookable: c, mult: 2 }]);
  assert.equal(m.ingredients.find((r) => r.m === 'Oats').n, '200 g');
  assert.equal(m.ingredients.find((r) => r.m === 'Berries').n, 'a handful ×2');
});

test('bsPrepEstimate + bsPrepOrder: longest first, deterministic, no fabricated time', () => {
  const roast = { title: 'Roast', steps: ['Roast 40 minutes', 'Rest 10 minutes'] };
  const salad = { title: 'Salad', steps: ['Toss everything', 'Dress it'] };
  const eggs = { title: 'Eggs', steps: ['Boil 8 minutes'] };
  assert.equal(bsPrepEstimate(roast), 40 * 60 + 10 * 60 + 90);   // timers + 45s/step
  assert.equal(bsPrepEstimate(salad), 90);                        // steps only, no invented minutes
  const order = bsPrepOrder([{ cookable: salad }, { cookable: eggs }, { cookable: roast }]);
  assert.deepEqual(order.map((x) => x.cookable.title), ['Roast', 'Eggs', 'Salad']);
});

test('bsPrepWeekKey: Monday of the local week', () => {
  // 2026-07-22 is a Wednesday → Monday is 2026-07-20.
  assert.equal(bsPrepWeekKey(new Date(2026, 6, 22)), '2026-07-20');
  assert.equal(bsPrepWeekKey(new Date(2026, 6, 20)), '2026-07-20'); // Monday itself
  assert.equal(bsPrepWeekKey(new Date(2026, 6, 26)), '2026-07-20'); // Sunday closes the week
});

test('bsPrunePrep: the 4-day window, bad stamps drop', () => {
  const entries = [
    { recipeTitle: 'Fresh', preppedAt: NOW - 2 * DAY },
    { recipeTitle: 'Stale', preppedAt: NOW - BS_PREP_WINDOW_MS },      // exactly at the edge → out
    { recipeTitle: 'Future', preppedAt: NOW + HOUR },                  // clock skew → out
    { recipeTitle: 'Junk', preppedAt: 'nope' },
  ];
  const fresh = bsPrunePrep(entries, NOW);
  assert.deepEqual(fresh.map((e) => e.recipeTitle), ['Fresh']);
});

test('bsPrepMatch: mealId wins, exact title only, freshest entry, no fuzzy', () => {
  const entries = [
    { mealId: 'm1', recipeTitle: 'Chicken bowl', preppedAt: NOW - 3 * HOUR },
    { recipeTitle: 'Chicken bowl', mealTitle: 'Lunch bowl', preppedAt: NOW - HOUR },
  ];
  assert.equal(bsPrepMatch(entries, { mealId: 'm1' }, NOW).mealId, 'm1');
  // Title matches either the meal's own title or the recipe title — exact only.
  assert.equal(bsPrepMatch(entries, { title: 'lunch bowl' }, NOW).preppedAt, NOW - HOUR);
  assert.equal(bsPrepMatch(entries, { title: 'Chicken bowl' }, NOW).preppedAt, NOW - HOUR); // freshest
  assert.equal(bsPrepMatch(entries, { title: 'Chicken' }, NOW), null);   // NO substring match
  assert.equal(bsPrepMatch(entries, {}, NOW), null);
});

test('the coach RPC freshness window matches BS_PREP_WINDOW_MS (enforced sync, no drift)', () => {
  // The migration hardcodes the 4-day window (SQL can't import the JS const);
  // this asserts it and BS_PREP_WINDOW_MS agree, so a change to one that isn't
  // mirrored fails CI rather than silently diverging (CodeRabbit).
  const sqlPath = fileURLToPath(new URL('../supabase-migrations/2026-07-22-client-meal-prep-coach-read.sql', import.meta.url));
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const m = /v_window_ms\s+constant\s+bigint\s*:=\s*([0-9*\s]+);/.exec(sql);
  assert.ok(m, 'v_window_ms declaration found in the migration');
  const sqlMs = m[1].split('*').reduce((a, x) => a * Number(x.trim()), 1);
  assert.equal(sqlMs, BS_PREP_WINDOW_MS);
});

test('bsPrepSummary: count + lastAt + ordered day labels over fresh entries', () => {
  const entries = [
    { recipeTitle: 'A', dayIdx: 3, preppedAt: NOW - HOUR },
    { recipeTitle: 'B', dayIdx: 0, preppedAt: NOW - 2 * HOUR },
    { recipeTitle: 'C', dayIdx: 0, preppedAt: NOW - 3 * HOUR },          // dup day collapses
    { recipeTitle: 'Old', dayIdx: 5, preppedAt: NOW - 6 * DAY },         // stale → excluded
  ];
  const s = bsPrepSummary(entries, NOW);
  assert.equal(s.count, 3);
  assert.equal(s.lastAt, NOW - HOUR);
  assert.deepEqual(s.days, ['Mon', 'Thu']);
  assert.equal(bsPrepSummary([], NOW), null);                            // absence renders nothing
});
