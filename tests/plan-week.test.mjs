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

test('hardening: crafted oversized `days` are bounded, and never throw', () => {
  const huge = Array.from({ length: 500 }, (_, i) => `Meal ${i} · 100 kcal`);
  const w = bsPlanWeek({
    blocks: [],
    days: Array.from({ length: 200 }, (_, i) => ({ dow: i % 7, blocks: huge })),
  });
  assert.equal(w.days.length, 7);
  // AUTHORED day entries are capped — they are new data with no legacy
  // expectations, and the attack surface (a crafted public-read row).
  w.days.forEach((d) => assert.ok(d.blocks.length <= 40, 'authored day bounded'));
});

test('legacy: the DEFAULT blocks are deliberately UNCAPPED — delivery must not drop sold meals', () => {
  // Legacy Assign delivered every block with no limit. A 45-block plan that
  // already sold must keep delivering 45 — truncating in the preview is
  // cosmetic, truncating in DELIVERY is taking content someone paid for.
  const big = Array.from({ length: 45 }, (_, i) => `Snack — Meal ${i} · 100 kcal`);
  const w = bsPlanWeek({ blocks: big });
  w.days.forEach((d) => assert.equal(d.blocks.length, 45));
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

test('preview: locked derives from the ROWS SHOWN, not the constant allowance', () => {
  // A light first day is the common case, and the constant made meals vanish
  // from BOTH sides of the paywall: free showed 1, locked subtracted 2, so one
  // paid meal was counted nowhere. free.length + locked must always == units.length.
  const plan = { name: 'Light Monday', detail: {
    blocks: [],
    days: [
      { dow: 0, blocks: ['Breakfast — Toast · 200 kcal'] },
      { dow: 1, blocks: [
        'Breakfast — Eggs · 400 kcal', 'Lunch — Bowl · 600 kcal',
        'Dinner — Salmon · 700 kcal', 'Snack — Nuts · 200 kcal', 'Snack — Skyr · 150 kcal',
      ] },
    ],
  } };
  const p = bsPlanPreview(plan, { isNutri: true });
  assert.equal(p.units.length, 6, 'units is the WHOLE plan, so the Meals register is right');
  assert.equal(p.free.length, 1, 'the sampled day only had one meal');
  assert.equal(p.locked, 5);
  assert.equal(p.free.length + p.locked, p.units.length, 'nothing may fall between free and locked');
});

test('preview: units carries the whole plan so the Meals register cannot lie', () => {
  const plan = { name: 'S', detail: { blocks: [], days: [
    { dow: 0, blocks: ['Breakfast — Eggs · 400 kcal', 'Lunch — Bowl · 600 kcal'] },
    { dow: 1, blocks: ['Breakfast — Skyr · 300 kcal'] },
  ] } };
  const p = bsPlanPreview(plan, { isNutri: true });
  // The sheet renders units.length as the product's meal count. Sampling it
  // would have shown "Meals 2" for a three-meal plan.
  assert.equal(p.units.length, 3);
});

// ── perDay is a claim about what is DELIVERED (round-2 review) ───────────────

test('perDay: seven days authored IDENTICALLY are one menu, not a per-day plan', () => {
  // Every delivered day is the same, so selling this as per-day would advertise
  // variation that does not exist — even though every day differs from a
  // detail.blocks nobody will ever be served.
  const authored = ['Breakfast — Eggs · 400 kcal'];
  const w = bsPlanWeek({ blocks: MENU, days: Array.from({ length: 7 }, (_, dow) => ({ dow, blocks: [...authored] })) });
  assert.equal(w.perDay, false);
  w.days.forEach((d) => assert.deepEqual(d.blocks, authored, 'the AUTHORED menu is still what is delivered'));
});

test('perDay: a uniform-override plan previews the DELIVERED menu, not detail.blocks', () => {
  // The one case where the resolved day differs from detail.blocks while
  // perDay is false. The preview must show what Assign installs.
  const authored = Array.from({ length: 7 }, (_, dow) => ({ dow, blocks: ['Breakfast — Eggs · 400 kcal'] }));
  const p = bsPlanPreview({ name: 'U', detail: { blocks: ['Breakfast — Oats · 500 kcal'], days: authored } }, { isNutri: true });
  assert.equal(p.perDay, undefined, 'uniform week renders the non-per-day model');
  assert.equal(p.units.length, 1);
  assert.equal(p.units[0].title, 'Eggs', 'shows the menu that is DELIVERED');
});

test('perDay: uniform override over an EMPTY default still previews (not an empty plan)', () => {
  const authored = Array.from({ length: 7 }, (_, dow) => ({ dow, blocks: ['Lunch — Bowl · 600 kcal'] }));
  const p = bsPlanPreview({ name: 'U', detail: { blocks: [], days: authored } }, { isNutri: true });
  assert.equal(p.kind, 'menu');
  assert.equal(p.units[0].title, 'Bowl');
});

test('preview: the PUBLIC preview re-caps uncapped legacy fallbacks (DoS bound)', () => {
  // bsPlanWeek leaves the fallback uncapped for DELIVERY, but the preview is a
  // public workload: one authored day makes six inherited days each carry the
  // uncapped fallback, a 6x amplified scan of a crafted public-read row. The
  // preview scans at most 40 per day; delivery still serves every meal.
  const big = Array.from({ length: 300 }, (_, i) => `Snack — Meal ${i} · 100 kcal`);
  const detail = { blocks: big, days: [{ dow: 0, blocks: ['Breakfast — Eggs · 400 kcal'] }] };
  const p = bsPlanPreview({ name: 'Big', detail }, { isNutri: true });
  assert.equal(p.perDay, true);
  assert.equal(p.days[0].count, 1, 'the authored day');
  for (let i = 1; i < 7; i += 1) assert.equal(p.days[i].count, 40, 'inherited days scan at most BLOCK_SCAN');
  assert.equal(p.units.length, 1 + 6 * 40, 'preview counts are display-bounded');
  // Delivery is NOT capped — the same detail serves all 300 on inherited days.
  const w = bsPlanWeek(detail);
  assert.equal(w.days[1].blocks.length, 300, 'delivery keeps every sold meal');
});
