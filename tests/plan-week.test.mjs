// The per-day menu contract — docs/superpowers/specs/2026-07-26-per-day-menu-contract.md
//
// bsPlanWeek is the ONE normalizer BSProAssignPage and planPreview.mjs both call.
// The contract's central claim is that adding it is BEHAVIOR-PRESERVING for every
// already-published plan, so the first tests here pin exactly that: a plan with
// no `days` key must come out the same seven-identical-days it does today.

import test from 'node:test';
import assert from 'node:assert/strict';
import { bsPlanWeek } from '../mobile-app/src/services/planOutline.mjs';
import { bsPlanPreview, BS_PREVIEW_FREE_UNITS } from '../mobile-app/src/services/planPreview.mjs';

const MENU = ['Breakfast · Oats · 500 kcal', 'Lunch · Chicken bowl · 620 kcal'];
const texts = (blocks) => blocks.map((b) => ((b && b.text != null) ? b.text : b));

test('legacy: no `days` key → seven identical days from detail.blocks, perDay false', () => {
  const w = bsPlanWeek({ blocks: MENU });
  assert.equal(w.perDay, false);
  assert.equal(w.days.length, 7);
  w.days.forEach((d, i) => {
    assert.equal(d.dow, i);
    assert.deepEqual(d.blocks, MENU);
  });
});

test('legacy: absent/!object detail never throws, still returns seven empty days', () => {
  for (const bad of [undefined, null, 'x', 42, [], { blocks: 'not-an-array' }]) {
    const w = bsPlanWeek(bad);
    assert.equal(w.days.length, 7, `input ${JSON.stringify(bad)}`);
    assert.equal(w.perDay, false);
    w.days.forEach((d) => assert.deepEqual(d.blocks, []));
  }
});

test('per-day: days for Mon/Wed/Fri → those three, default on the other four', () => {
  const mon = ['Breakfast · Eggs · 400 kcal'];
  const wed = ['Breakfast · Skyr · 300 kcal'];
  const fri = ['Breakfast · Pancakes · 700 kcal'];
  const w = bsPlanWeek({ blocks: MENU, days: [
    { dow: 0, blocks: mon }, { dow: 2, blocks: wed }, { dow: 4, blocks: fri },
  ] });
  assert.equal(w.perDay, true);
  assert.deepEqual(w.days[0].blocks, mon);
  assert.deepEqual(w.days[2].blocks, wed);
  assert.deepEqual(w.days[4].blocks, fri);
  // The unauthored days INHERIT the default rather than coming back blank —
  // a coach who authored three days has a full week, not four empty ones.
  for (const dow of [1, 3, 5, 6]) assert.deepEqual(w.days[dow].blocks, MENU);
});

test('per-day: `days` present but every day equals the default → perDay false', () => {
  // Not a per-day plan, and must not be sold as one. Compared on TEXT, so fresh
  // objects for an unmodified day (what an editing UI produces) still match.
  const w = bsPlanWeek({ blocks: MENU, days: [
    { dow: 0, blocks: [...MENU] },
    { dow: 1, blocks: MENU.map((tx) => ({ text: tx })) },
  ] });
  assert.equal(w.perDay, false);
  assert.deepEqual(texts(w.days[1].blocks), MENU);
});

test('per-day: one differing day is enough to make it a per-day plan', () => {
  const w = bsPlanWeek({ blocks: MENU, days: [
    { dow: 0, blocks: [...MENU] },
    { dow: 3, blocks: ['Dinner · Salmon · 550 kcal'] },
  ] });
  assert.equal(w.perDay, true);
});

test('per-day: an authored EMPTY day is a real choice, not an inherit', () => {
  // A coach who clears Sunday means "nothing on Sunday". `blocks: []` differs
  // from the default, so it must survive as empty rather than falling back.
  const w = bsPlanWeek({ blocks: MENU, days: [{ dow: 6, blocks: [] }] });
  assert.equal(w.perDay, true);
  assert.deepEqual(w.days[6].blocks, []);
  assert.deepEqual(w.days[0].blocks, MENU);
});

test('hardening: invalid dow is DROPPED, never clamped onto a real day', () => {
  // Clamping would silently move a coach's menu to the wrong day. Each of these
  // must leave every day serving the default.
  const evil = ['Dinner · WRONG DAY · 900 kcal'];
  for (const dow of [99, -1, 7, 1.5, '1', null, undefined, NaN, true, {}]) {
    const w = bsPlanWeek({ blocks: MENU, days: [{ dow, blocks: evil }] });
    assert.equal(w.perDay, false, `dow ${String(dow)} should not register`);
    w.days.forEach((d) => assert.deepEqual(d.blocks, MENU, `dow ${String(dow)} leaked`));
  }
});

test('hardening: duplicate dow → first authored entry wins', () => {
  const first = ['Lunch · First · 500 kcal'];
  const second = ['Lunch · Second · 500 kcal'];
  const w = bsPlanWeek({ blocks: MENU, days: [
    { dow: 2, blocks: first }, { dow: 2, blocks: second },
  ] });
  assert.deepEqual(w.days[2].blocks, first);
});

test('hardening: a day entry with no blocks array inherits the default', () => {
  for (const bad of [{ dow: 1 }, { dow: 1, blocks: null }, { dow: 1, blocks: 'x' }]) {
    const w = bsPlanWeek({ blocks: MENU, days: [bad] });
    assert.deepEqual(w.days[1].blocks, MENU);
    assert.equal(w.perDay, false);
  }
});

test('hardening: a crafted oversized payload is bounded, and never throws', () => {
  const huge = Array.from({ length: 500 }, (_, i) => `Meal ${i} · 100 kcal`);
  const w = bsPlanWeek({
    blocks: huge,
    days: Array.from({ length: 200 }, (_, i) => ({ dow: i % 7, blocks: huge })),
  });
  assert.equal(w.days.length, 7);
  // Both the day scan and each day's block list are capped.
  w.days.forEach((d) => assert.ok(d.blocks.length <= 40, 'block scan bounded'));
});

test('hardening: junk `days` shapes are skipped without throwing', () => {
  for (const days of ['x', 42, [null], [undefined], [[]], ['str'], [{ }]]) {
    const w = bsPlanWeek({ blocks: MENU, days });
    assert.equal(w.days.length, 7);
    w.days.forEach((d) => assert.deepEqual(d.blocks, MENU));
  }
});

test('block objects (PR E authored steps) survive the per-day path intact', () => {
  // The Cook door reads meal.steps, so a per-day meal must keep its authored
  // method rather than being flattened to text on the way through.
  const authored = [{ text: 'Dinner · Roast chicken · 700 kcal', steps: [{ t: 'Sear 3 min', station: 'stove' }] }];
  const w = bsPlanWeek({ blocks: MENU, days: [{ dow: 5, blocks: authored }] });
  assert.equal(w.days[5].blocks[0].steps[0].t, 'Sear 3 min');
  assert.equal(w.perDay, true);
});

// ── The paid preview (§5.4) ──────────────────────────────────────────────────
// The acceptance test that matters most is the first one: an existing published
// meal plan's preview must be unchanged, field for field.

test('preview: a legacy menu plan is byte-identical to the pre-contract model', () => {
  const plan = { name: 'Reset', detail: { blocks: [
    'Breakfast · Oats · 500 kcal', 'Lunch · Chicken bowl · 620 kcal', 'Dinner · Salmon · 700 kcal',
  ] } };
  const p = bsPlanPreview(plan, { isNutri: true });
  assert.equal(p.kind, 'menu');
  assert.equal(p.perDay, undefined, 'legacy model must not grow a perDay field');
  assert.equal(p.days, undefined, 'legacy model must not grow a days field');
  assert.equal(p.units.length, 3);
  assert.equal(p.free.length, BS_PREVIEW_FREE_UNITS);
  assert.equal(p.locked, 1);
  assert.equal(p.units[0].label, 'BREAKFAST');
  assert.equal(p.units[0].kcal, 500);
  // NOTE — pre-existing bsAssignMeal behavior, pinned here deliberately rather
  // than "fixed": it splits slot from dish only on an em/en-dash or colon, so a
  // middot line keeps its slot in the title. The nutrition builder emits middot
  // form ("Breakfast · ~500 kcal"), so this is what real plans look like. The
  // per-day work must not change it — a title shift would move every published
  // plan's preview text.
  assert.equal(p.units[0].title, 'Breakfast · Oats');
  const dashed = bsPlanPreview({ name: 'D', detail: { blocks: ['Breakfast — Oats · 500 kcal'] } }, { isNutri: true });
  assert.equal(dashed.units[0].title, 'Oats', 'dashed form still splits slot from dish');
});

test('preview: a per-day menu shows all seven DAY LABELS free, meals still paid', () => {
  const plan = { name: 'Seven', detail: {
    blocks: ['Breakfast · Oats · 500 kcal'],
    days: [
      { dow: 0, blocks: ['Breakfast · Eggs · 400 kcal', 'Lunch · Bowl · 600 kcal'] },
      { dow: 1, blocks: ['Breakfast · Skyr · 300 kcal'] },
    ],
  } };
  const p = bsPlanPreview(plan, { isNutri: true });
  assert.equal(p.kind, 'menu');
  assert.equal(p.perDay, true);
  // Structure is free and complete — the buyer can see it is a seven-day plan.
  assert.equal(p.days.length, 7);
  assert.deepEqual(p.days.map((d) => d.label), ['MON','TUE','WED','THU','FRI','SAT','SUN']);
  assert.equal(p.days[0].count, 2);
  assert.equal(p.days[1].count, 1);
  assert.equal(p.days[2].count, 1, 'an inherited day still reports its meal count');
  // Content is still paid, counted across the WHOLE week (2 + 1 + 5 inherited).
  assert.equal(p.free.length, BS_PREVIEW_FREE_UNITS);
  assert.equal(p.locked, 8 - BS_PREVIEW_FREE_UNITS);
});

test('preview: the free sample is a REAL day, not an interleaving of seven', () => {
  const plan = { name: 'S', detail: {
    blocks: [],
    days: [{ dow: 3, blocks: ['Breakfast — Eggs · 400 kcal', 'Lunch — Bowl · 600 kcal'] }],
  } };
  const p = bsPlanPreview(plan, { isNutri: true });
  // Thursday is the only day with meals, so the sample is Thursday's — in order.
  // This also covers the empty-DEFAULT case: every day authored individually
  // leaves detail.blocks empty, which used to hit the early `empty` return and
  // preview a paid plan as nothing.
  assert.deepEqual(p.free.map((u) => u.title), ['Eggs', 'Bowl']);
  assert.equal(p.kind, 'menu');
  assert.equal(p.days[3].count, 2);
  assert.equal(p.days[0].count, 0, 'days inheriting an empty default are honestly empty');
});

test('preview: a locked meal never leaks its text into the model', () => {
  const secret = 'Dinner · SECRET RECIPE · 800 kcal';
  const plan = { name: 'S', detail: {
    blocks: ['Breakfast · Oats · 500 kcal'],
    days: [{ dow: 0, blocks: ['Breakfast · Eggs · 400 kcal', 'Lunch · Bowl · 600 kcal', secret] }],
  } };
  const p = bsPlanPreview(plan, { isNutri: true });
  assert.equal(JSON.stringify(p.days).includes('SECRET'), false, 'day structure carries counts only');
  assert.equal(JSON.stringify(p.free).includes('SECRET'), false, 'free units stop at the allowance');
});

test('preview: a per-day plan whose days all match the default previews as legacy', () => {
  const blocks = ['Breakfast · Oats · 500 kcal', 'Lunch · Bowl · 600 kcal'];
  const p = bsPlanPreview({ name: 'S', detail: { blocks, days: [{ dow: 0, blocks: [...blocks] }] } }, { isNutri: true });
  assert.equal(p.perDay, undefined);
  assert.equal(p.units.length, 2);
});

test('preview: a nutrition WEEK BLOCK still wins over the per-day branch (C0)', () => {
  // C0's ruling: an arc is not a menu. Adding per-day must not resurrect the
  // fabrication by routing a week block into the meal parser.
  const p = bsPlanPreview({ name: 'Arc', detail: {
    blocks: ['Week 1 — Reset & habits', 'Week 2 — Build routine', 'Grocery + prep guide'],
    days: [{ dow: 0, blocks: ['Week 1 — Reset & habits'] }],
  } }, { isNutri: true });
  assert.equal(p.kind, 'block');
  assert.equal(p.perDay, undefined);
});
