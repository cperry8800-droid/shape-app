import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bsDraftMode,
  bsDraftOutline,
  bsDraftFromResponse,
  bsMealSlots,
  bsMealCalories,
  bsMealPlanTemplate,
  BS_DRAFT_MODES,
  bsAssignDayLine,
  bsAssignWeekLine,
  bsAssignMeal,
} from '../mobile-app/src/services/planOutline.mjs';

// ── bsDraftMode ──────────────────────────────────────────────────────────────
// The whole point of this map: before it existed, four of the six builder kinds
// were silently coerced to 'workout' by the route, so both nutritionist meal
// builders asked the model for a strength workout.

test('bsDraftMode maps all six real builder kinds', () => {
  assert.equal(bsDraftMode('training', 'workout'), 'workout');
  assert.equal(bsDraftMode('training', 'program'), 'training_program');
  assert.equal(bsDraftMode('training', 'plan'), 'training_plan');
  assert.equal(bsDraftMode('nutrition', 'mealplan'), 'meal_plan');
  assert.equal(bsDraftMode('nutrition', 'program'), 'nutrition_program');
  assert.equal(bsDraftMode('nutrition', 'diet'), 'diet');
});

test('bsDraftMode keeps the two "program" kinds APART', () => {
  // A trainer program is a weekly split; a nutrition program is a multi-week
  // arc. They parse differently, so collapsing them is the original bug.
  assert.notEqual(bsDraftMode('training', 'program'), bsDraftMode('nutrition', 'program'));
});

test('bsDraftMode returns null rather than guessing', () => {
  assert.equal(bsDraftMode('training', 'mealplan'), null);   // wrong discipline
  assert.equal(bsDraftMode('nutrition', 'workout'), null);
  assert.equal(bsDraftMode('gym', 'workout'), null);
  assert.equal(bsDraftMode('', ''), null);
  assert.equal(bsDraftMode(null, undefined), null);
});

test('every mode bsDraftMode can emit is a declared mode', () => {
  for (const d of ['training', 'nutrition']) {
    for (const k of ['workout', 'program', 'plan', 'mealplan', 'diet']) {
      const m = bsDraftMode(d, k);
      if (m !== null) assert.ok(BS_DRAFT_MODES.includes(m), `${d}/${k} -> ${m}`);
    }
  }
});

// ── bsDraftOutline: the grammar gate ─────────────────────────────────────────
const blocks = (...pairs) => pairs.map(([title, detail]) => ({ title, detail }));

test('training_program accepts weekday lines and they parse as weekdays', () => {
  const out = bsDraftOutline('training_program', blocks(
    ['Mon', 'Upper (push)'], ['Tue', 'Lower (squat)'], ['Wed', 'Rest / mobility'],
  ));
  assert.deepEqual(out, ['Mon — Upper (push)', 'Tue — Lower (squat)', 'Wed — Rest / mobility']);
  // The real proof: the delivery parser reads back what we produced.
  assert.equal(bsAssignDayLine(out[0]).dow, 0);
  assert.equal(bsAssignDayLine(out[1]).dow, 1);
  assert.equal(bsAssignDayLine(out[2]).rest, true);
});

test('training_program REFUSES a plausible-but-unparseable outline', () => {
  // This is the failure this module exists to stop: it publishes cleanly, looks
  // right in the editor, and then mis-assigns, silently.
  assert.equal(bsDraftOutline('training_program', blocks(
    ['Session 1', 'Upper push'], ['Session 2', 'Lower'], ['Session 3', 'Full body'],
  )), null);
});

test('training_program refuses when ONE line is bad, not just when all are', () => {
  // A partial outline is the dangerous shape — it looks authored, and the coach
  // cannot see which day the model failed to write.
  assert.equal(bsDraftOutline('training_program', blocks(
    ['Mon', 'Upper'], ['Someday', 'Lower'], ['Wed', 'Full body'],
  )), null);
});

test('training_plan and nutrition_program both accept week arcs', () => {
  const t = bsDraftOutline('training_plan', blocks(['Week 1', 'Accumulation'], ['Week 2', 'Intensification']));
  assert.deepEqual(t, ['Week 1 — Accumulation', 'Week 2 — Intensification']);
  assert.equal(bsAssignWeekLine(t[0]).week, 1);

  const n = bsDraftOutline('nutrition_program', blocks(['Week 1', 'Reset & habits'], ['Week 2', 'Build routine']));
  assert.equal(bsAssignWeekLine(n[1]).week, 2);
});

test('training_plan refuses a non-week label', () => {
  assert.equal(bsDraftOutline('training_plan', blocks(['Phase 1', 'Base'], ['Phase 2', 'Peak'])), null);
});

test('meal_plan requires a REAL slot, not the MEAL fallback', () => {
  const ok = bsDraftOutline('meal_plan', blocks(
    ['Breakfast', 'Greek yogurt bowl · 420 kcal'], ['Lunch', 'Chicken rice bowl · 620 kcal'],
  ));
  assert.deepEqual(ok, ['Breakfast — Greek yogurt bowl · 420 kcal', 'Lunch — Chicken rice bowl · 620 kcal']);
  assert.equal(bsAssignMeal(ok[0]).slot, 'BREAKFAST');
  assert.equal(bsAssignMeal(ok[0]).kcal, 420);

  // bsAssignMeal NEVER returns null — it falls back to slot 'MEAL'. Accepting a
  // non-null return would therefore accept every string on earth.
  assert.equal(bsAssignMeal('Meal 1 — Oats').slot, 'MEAL');
  assert.equal(bsDraftOutline('meal_plan', blocks(['Meal 1', 'Oats'], ['Meal 2', 'Rice'])), null);
});

test('workout and diet are free-form lists (no downstream grammar)', () => {
  assert.deepEqual(
    bsDraftOutline('workout', blocks(['Back squat', '4 × 6 · RPE 8'], ['Bench press', '3 × 8'])),
    ['Back squat — 4 × 6 · RPE 8', 'Bench press — 3 × 8'],
  );
  assert.deepEqual(
    bsDraftOutline('diet', blocks(['Breakfast options', 'oats, eggs'], ['Foods to avoid', 'fried food'])),
    ['Breakfast options — oats, eggs', 'Foods to avoid — fried food'],
  );
});

// ── Refusal contract ─────────────────────────────────────────────────────────
// null means "unusable, keep the template". It must never be [] — an empty
// outline opens the editor on a blank plan and reads as a successful generation
// that produced nothing.

test('null (never []) on every unusable input', () => {
  assert.equal(bsDraftOutline('training_plan', []), null);
  assert.equal(bsDraftOutline('training_plan', null), null);
  assert.equal(bsDraftOutline('training_plan', undefined), null);
  assert.equal(bsDraftOutline('training_plan', 'not an array'), null);
  assert.equal(bsDraftOutline('training_plan', {}), null);
  assert.equal(bsDraftOutline('nope', blocks(['Week 1', 'Base'], ['Week 2', 'Peak'])), null);
  assert.equal(bsDraftOutline(undefined, blocks(['Week 1', 'Base'])), null);
});

test('minimum line counts are enforced per mode', () => {
  assert.equal(bsDraftOutline('training_program', blocks(['Mon', 'Upper'], ['Tue', 'Lower'])), null); // needs 3
  assert.ok(bsDraftOutline('training_program', blocks(['Mon', 'Upper'], ['Tue', 'Lower'], ['Wed', 'Rest'])));
  assert.equal(bsDraftOutline('training_plan', blocks(['Week 1', 'Base'])), null); // needs 2
  assert.ok(bsDraftOutline('training_plan', blocks(['Week 1', 'Base'], ['Week 2', 'Peak'])));
});

// ── Hostile input ────────────────────────────────────────────────────────────
// The blocks arrive over the wire from a model. The function must be total.

test('control characters are stripped, not rendered', () => {
  const nasty = 'Upper' + String.fromCharCode(0) + String.fromCharCode(27) + '[31m push';
  const out = bsDraftOutline('training_program', blocks(
    ['Mon', nasty], ['Tue', 'Lower'], ['Wed', 'Rest'],
  ));
  assert.ok(out);
  assert.ok(!/[\x00-\x1f\x7f]/.test(out[0]), 'no control byte survives');
  assert.ok(out[0].startsWith('Mon — Upper'));
});

test('lines are length-bounded', () => {
  const out = bsDraftOutline('training_program', blocks(
    ['Mon', 'x'.repeat(500)], ['Tue', 'Lower'], ['Wed', 'Rest'],
  ));
  assert.ok(out);
  for (const line of out) assert.ok(line.length <= 120, `line too long: ${line.length}`);
});

test('does not throw on Symbols, throwing getters, or junk block shapes', () => {
  const throwing = { get title() { throw new Error('boom'); }, detail: 'Upper' };
  assert.doesNotThrow(() => bsDraftOutline('training_program', [throwing, { title: 'Tue', detail: 'Lower' }]));

  const symbolic = [{ title: Symbol('s'), detail: 'Upper' }, { title: 'Tue', detail: 'Lower' }, { title: 'Wed', detail: 'Rest' }];
  assert.doesNotThrow(() => bsDraftOutline('training_program', symbolic));
  // A Symbol title yields no head, so the line cannot parse as a weekday and the
  // whole draft is refused — the template stands.
  assert.equal(bsDraftOutline('training_program', symbolic), null);

  assert.doesNotThrow(() => bsDraftOutline('diet', [null, undefined, 1, 'x']));
  assert.equal(bsDraftOutline('diet', [null, undefined]), null);
});

test('an oversized block array is bounded', () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ title: 'Week ' + ((i % 52) + 1), detail: 'W' }));
  const out = bsDraftOutline('training_plan', many);
  assert.ok(out);
  assert.ok(out.length <= 40, `expected <= 40, got ${out.length}`);
});

// ── bsDraftFromResponse ──────────────────────────────────────────────────────

test('bsDraftFromResponse returns lines + name + note when the draft is usable', () => {
  const got = bsDraftFromResponse('training_plan', {
    title: 'Hypertrophy block',
    blocks: [{ title: 'Week 1', detail: 'Accumulation' }, { title: 'Week 2', detail: 'Peak' }],
    coachNotes: ['Check injury history.', 'Retest at the end.'],
  });
  assert.deepEqual(got.lines, ['Week 1 — Accumulation', 'Week 2 — Peak']);
  assert.equal(got.name, 'Hypertrophy block');
  assert.equal(got.note, 'Check injury history.\nRetest at the end.');
});

test('bsDraftFromResponse refuses name/note when the BLOCKS were refused', () => {
  // Stamping a rejected draft's title over the builder's template outline would
  // advertise a generation that did not survive.
  assert.equal(bsDraftFromResponse('training_plan', {
    title: 'Hypertrophy block',
    blocks: [{ title: 'Phase 1', detail: 'Base' }, { title: 'Phase 2', detail: 'Peak' }],
    coachNotes: ['Check injury history.'],
  }), null);
});

test('bsDraftFromResponse is total against junk and missing fields', () => {
  assert.equal(bsDraftFromResponse('training_plan', null), null);
  assert.equal(bsDraftFromResponse('training_plan', undefined), null);
  assert.equal(bsDraftFromResponse('training_plan', {}), null);
  assert.equal(bsDraftFromResponse(null, { blocks: [] }), null);

  const throwing = { get blocks() { throw new Error('boom'); } };
  assert.doesNotThrow(() => bsDraftFromResponse('training_plan', throwing));
  assert.equal(bsDraftFromResponse('training_plan', throwing), null);

  // Usable blocks, hostile metadata: keep the lines, drop the junk.
  const odd = {
    get title() { throw new Error('boom'); },
    blocks: [{ title: 'Week 1', detail: 'Base' }, { title: 'Week 2', detail: 'Peak' }],
    coachNotes: 'not an array',
  };
  const got = bsDraftFromResponse('training_plan', odd);
  assert.ok(got);
  assert.equal(got.name, '');
  assert.equal(got.note, '');
});

// ── The two chip bugs ────────────────────────────────────────────────────────
// MEALS / DAY and DAILY CALORIES were both ignored by the outline template: it
// always emitted five fixed lines summing to ~2150 kcal.

test('bsMealSlots honours the 3-6 chip range and clamps outside it', () => {
  assert.equal(bsMealSlots(3).length, 3);
  assert.equal(bsMealSlots(4).length, 4);
  assert.equal(bsMealSlots(5).length, 5);
  assert.equal(bsMealSlots(6).length, 6);
  assert.equal(bsMealSlots(0).length, 4);
  assert.equal(bsMealSlots(99).length, 6);
  assert.equal(bsMealSlots(undefined).length, 4);
});

test('every emitted slot is one bsAssignMeal actually recognises', () => {
  for (const n of [3, 4, 5, 6]) {
    for (const slot of bsMealSlots(n)) {
      const parsed = bsAssignMeal(`${slot} — Something · 400 kcal`);
      assert.notEqual(parsed.slot, 'MEAL', `${slot} fell back to the generic slot`);
    }
  }
});

test('meal calories sum EXACTLY to the target, at every chip combination', () => {
  for (const n of [3, 4, 5, 6]) {
    for (const target of [1800, 2100, 2600, 3000]) {
      const slots = bsMealSlots(n);
      const parts = bsMealCalories(target, slots);
      assert.equal(parts.length, n);
      assert.equal(parts.reduce((a, b) => a + b, 0), target, `${n} meals @ ${target}`);
      for (const p of parts) assert.ok(p > 0, `non-positive meal: ${p}`);
    }
  }
});

test('the meal template reflects BOTH chips and parses back', () => {
  const lines = bsMealPlanTemplate(6, 3000);
  assert.equal(lines.length, 6);
  const total = lines.reduce((sum, l) => sum + bsAssignMeal(l).kcal, 0);
  assert.equal(total, 3000);
  for (const l of lines) assert.notEqual(bsAssignMeal(l).slot, 'MEAL');

  // The old behaviour, pinned as the regression: 5 lines summing to ~2150
  // regardless of what the coach picked.
  const three = bsMealPlanTemplate(3, 1800);
  assert.equal(three.length, 3);
  assert.equal(three.reduce((s, l) => s + bsAssignMeal(l).kcal, 0), 1800);
});

test('bsMealCalories is total against junk input', () => {
  assert.doesNotThrow(() => bsMealCalories(NaN, null));
  assert.doesNotThrow(() => bsMealCalories(undefined, []));
  assert.equal(bsMealCalories(0, bsMealSlots(3)).reduce((a, b) => a + b, 0), 0);
});

// ── Distinct-key validation ──────────────────────────────────────────────────
// A per-LINE check is not enough. "Mon — Upper" seven times passes every line
// check and then stacks seven sessions onto one calendar day, because the
// weekday path has no downstream dedupe (the week path has bsWeekUnits).

test('training_program refuses a repeated weekday', () => {
  assert.equal(bsDraftOutline('training_program', blocks(
    ['Mon', 'Upper'], ['Mon', 'Lower'], ['Mon', 'Full body'],
  )), null);
  // ...and still accepts a legitimately distinct week.
  assert.ok(bsDraftOutline('training_program', blocks(
    ['Mon', 'Upper'], ['Tue', 'Lower'], ['Wed', 'Rest'],
  )));
});

test('week modes refuse a repeated week number', () => {
  assert.equal(bsDraftOutline('training_plan', blocks(['Week 1', 'Base'], ['Week 1', 'Peak'])), null);
  assert.equal(bsDraftOutline('nutrition_program', blocks(['Week 2', 'A'], ['Week 2', 'B'])), null);
  assert.ok(bsDraftOutline('training_plan', blocks(['Week 1', 'Base'], ['Week 2', 'Peak'])));
});

test('meal_plan STILL allows a repeated Snack (a real day does)', () => {
  const out = bsDraftOutline('meal_plan', blocks(
    ['Breakfast', 'Oats · 400 kcal'],
    ['Snack', 'Fruit · 200 kcal'],
    ['Lunch', 'Bowl · 600 kcal'],
    ['Snack', 'Nuts · 200 kcal'],
  ));
  assert.ok(out, 'a day with two snacks must be accepted');
  assert.equal(out.length, 4);
});

test('the six-meal template survives its own validator (no self-refusal)', () => {
  // The builder template repeats Snack three times at mealsDay=6. If the
  // dedup rule ever grew to cover meal_plan, this pins the regression.
  const lines = bsMealPlanTemplate(6, 3000);
  const asBlocks = lines.map((l) => {
    const [title, detail] = l.split(' — ');
    return { title, detail };
  });
  assert.ok(bsDraftOutline('meal_plan', asBlocks), 'our own template must pass our own gate');
});
