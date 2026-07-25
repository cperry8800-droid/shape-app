import test from 'node:test';
import assert from 'node:assert/strict';
import { bsPlanPreview, BS_PREVIEW_FREE_UNITS } from '../mobile-app/src/services/planPreview.mjs';

// The preview model behind the Listing's "what's inside" sheet. It only ever
// describes what the coach actually authored in coach_plans.detail.blocks —
// never an invented session — and it decides what a buyer sees before paying.

test('a weekday split reads as structure: every day shown, nothing locked', () => {
  const p = bsPlanPreview({
    name: 'Strength Block 3',
    meta: '6 weeks · 4 days',
    detail: {
      note: 'Two heavy days, two builders.',
      blocks: ['Mon — Lower (squat)', 'Tue — Upper (push)', 'Thu — Lower (hinge)', 'Fri — Upper (pull)'],
    },
  }, { isNutri: false });

  assert.equal(p.kind, 'split');
  assert.equal(p.weeks, 6);
  assert.equal(p.sessionsPerWeek, 4);
  // The split IS the table of contents — the sessions' exercises are not in the
  // data, so there is nothing deeper to withhold. Showing it all is honest.
  assert.equal(p.units.length, 4);
  assert.equal(p.free.length, 4);
  assert.equal(p.locked, 0);
  assert.equal(p.free[0].label, 'MON');
  assert.equal(p.free[0].title, 'Lower (squat)');
  assert.equal(p.note, 'Two heavy days, two builders.');
});

test('a rest day is marked, not dropped', () => {
  const p = bsPlanPreview({
    name: 'Three-day', meta: '4 weeks',
    detail: { blocks: ['Mon — Push', 'Wed — Rest', 'Fri — Pull'] },
  }, { isNutri: false });
  assert.equal(p.kind, 'split');
  assert.equal(p.sessionsPerWeek, 2); // rest days are not sessions
  assert.equal(p.units[1].rest, true);
});

test('a single session shows the first N moves and locks the remainder', () => {
  const p = bsPlanPreview({
    name: 'Heavy singles — squat day',
    meta: 'One session · 52 min',
    detail: {
      blocks: ['Back squat · 5×3', 'Front squat · 3×6', 'Bulgarian split squat · 3×8', 'Hanging leg raise · 3×12'],
    },
  }, { isNutri: false });

  assert.equal(p.kind, 'session');
  assert.equal(p.units.length, 4);
  assert.equal(p.free.length, BS_PREVIEW_FREE_UNITS);
  assert.equal(p.locked, 4 - BS_PREVIEW_FREE_UNITS);
  assert.equal(p.free[0].title, 'Back squat');
  assert.equal(p.free[0].scheme, '5×3');
});

test('a menu shows the first meals and locks the rest, carrying real kcal only', () => {
  const p = bsPlanPreview({
    name: 'The Lean Block', meta: '6 weeks · 1,900 kcal base',
    detail: {
      blocks: [
        'Breakfast — Greek yogurt, berries, honey · 420 kcal',
        'Lunch — chicken rice bowl, slaw · 610 kcal',
        'Dinner — salmon, potatoes, greens · 630 kcal',
      ],
    },
  }, { isNutri: true });

  assert.equal(p.kind, 'menu');
  assert.equal(p.free.length, BS_PREVIEW_FREE_UNITS);
  assert.equal(p.locked, 1);
  assert.equal(p.free[0].label, 'BREAKFAST');
  assert.equal(p.free[0].kcal, 420);
  // The kcal is carried by the kcal field only — the title must not repeat it
  // (bsAssignMeal keeps the whole tail, incl. "· 420 kcal", as the title).
  assert.ok(!/kcal/i.test(p.free[0].title), 'title must not repeat the kcal value');
  assert.ok(/Greek yogurt/.test(p.free[0].title), 'title keeps the meal name');
});

test('a stated weeks reads only a standalone number — "106 weeks" is not 6', () => {
  // 6 weeks is a real duration; a 3-digit number is not one this parser accepts.
  assert.equal(bsPlanPreview({ name: 'x', meta: '6 week block', detail: { blocks: ['Mon — Upper (push)', 'Wed — Lower', 'Fri — Full'] } }).weeks, 6);
  assert.equal(bsPlanPreview({ name: 'x', meta: '106 week block', detail: { blocks: ['Mon — Upper (push)', 'Wed — Lower', 'Fri — Full'] } }).weeks, null);
});

test('a meal with no stated kcal reports null, never 0', () => {
  const p = bsPlanPreview({
    name: 'x', detail: { blocks: ['Lunch — leftovers', 'Dinner — whatever', 'Snack — fruit'] },
  }, { isNutri: true });
  assert.equal(p.free[0].kcal, null);
});

test('no authored blocks → an honest empty model, not a fabricated outline', () => {
  for (const plan of [null, {}, { detail: {} }, { detail: { blocks: [] } }, { detail: { blocks: ['   ', ''] } }]) {
    const p = bsPlanPreview(plan, { isNutri: false });
    assert.equal(p.kind, null);
    assert.equal(p.units.length, 0);
    assert.equal(p.free.length, 0);
    assert.equal(p.locked, 0);
  }
});

test('block objects (the PR-E authored shape) parse the same as bare strings', () => {
  const p = bsPlanPreview({
    name: 'x', detail: { blocks: [{ text: 'Back squat · 5×3' }, { text: 'Front squat · 3×6' }] },
  }, { isNutri: false });
  assert.equal(p.kind, 'session');
  assert.equal(p.free[0].title, 'Back squat');
});

test('weeks/sessions come only from stated metadata — never guessed', () => {
  const noMeta = bsPlanPreview({ name: 'Block', detail: { blocks: ['Back squat · 5×3'] } }, { isNutri: false });
  assert.equal(noMeta.weeks, null);
  // "6 weeks" in the NAME counts as stated too — coaches title plans that way.
  const named = bsPlanPreview({ name: '6 week hypertrophy', detail: { blocks: ['Back squat · 5×3'] } }, { isNutri: false });
  assert.equal(named.weeks, 6);
});

test('media is passed through only for entries with a url', () => {
  const p = bsPlanPreview({
    name: 'x',
    detail: { blocks: ['Back squat · 5×3'], media: [{ url: 'a.webp', type: 'image' }, { type: 'image' }, null] },
  }, { isNutri: false });
  assert.equal(p.media.length, 1);
});

test('a hostile blocks payload cannot blow up the model', () => {
  const p = bsPlanPreview({
    name: 'x',
    detail: { blocks: [{ text: 'a'.repeat(5000) }, 42, [], { nope: true }, 'Back squat · 5×3'] },
  }, { isNutri: false });
  assert.ok(p.units.length <= 40);
  for (const u of p.units) assert.ok(u.title.length <= 120);
});
