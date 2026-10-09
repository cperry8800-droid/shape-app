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

// ── Regression: the two parser faults found in review on #1827 ──────────────

test('the catalogue\'s own "wk"/"wks" duration reads as weeks', () => {
  // The live catalogue writes "12 wk · 48 on it · 4.9 ★" and "4 wks · fast &
  // balanced · $130", and the Assign flow's parser already accepts `wk|week`.
  // Reading only the long form silently dropped the Weeks register on every one
  // of those plans — stated information lost in the preview alone.
  const split = ['Mon — Upper (push)', 'Wed — Lower', 'Fri — Full'];
  assert.equal(bsPlanPreview({ name: 'x', meta: '12 wk · 48 on it', detail: { blocks: split } }).weeks, 12);
  assert.equal(bsPlanPreview({ name: 'x', meta: '4 wks · fast & balanced', detail: { blocks: split } }).weeks, 4);
  // The long form still works, and the 3-digit guard still holds for both.
  assert.equal(bsPlanPreview({ name: 'x', meta: '6 week block', detail: { blocks: split } }).weeks, 6);
  assert.equal(bsPlanPreview({ name: 'x', meta: '106 wks', detail: { blocks: split } }).weeks, null);
});

test('a nutrition plan with weekday-prefixed meals is a MENU, never a workout split', () => {
  // Meals can legitimately carry weekday prefixes, which clears the ≥3 day-line
  // bar. Classifying that as a split labelled the rows as DAYS, exposed every
  // meal with locked:0, and skipped the kcal treatment — a preview that
  // disagreed with what the buyer is actually assigned. The Assign flow gates
  // the same test on !isNutri; this mirrors it.
  const blocks = [
    'Mon — Breakfast — oats · 420 kcal',
    'Tue — Lunch — chicken bowl · 610 kcal',
    'Wed — Dinner — salmon · 580 kcal',
  ];
  const p = bsPlanPreview({ name: 'x', detail: { blocks } }, { isNutri: true });
  assert.equal(p.kind, 'menu');
  assert.equal(p.sessionsPerWeek, null);          // a menu has no days/week
  // Assert the ACTUAL parse, not a predicate an empty array satisfies:
  // `[].every(...)` is true, so a regression that dropped every meal would have
  // slipped straight through the kcal check. Pin the count and the values.
  assert.equal(p.units.length, 3);
  assert.deepEqual(p.units.map((u) => u.kcal), [420, 610, 580]);
  // The slot degrades to the generic MEAL when a weekday prefix sits in front of
  // it — and that is pinned deliberately, because `bsAssignMeal` is SHARED with
  // the assign flow and gives it the same answer. The contract this test defends
  // is that the preview matches what the buyer is assigned, so "fixing" the slot
  // here alone would break it; the fix belongs in the shared parser or nowhere.
  assert.deepEqual(p.units.map((u) => u.label), ['MEAL', 'MEAL', 'MEAL']);
  // …and the same blocks for a TRAINER still read as a split.
  assert.equal(bsPlanPreview({ name: 'x', detail: { blocks } }).kind, 'split');
});

test('a Week 1..N outline is a PROGRAM, never a single session', () => {
  // Both builders emit exactly this for their multi-week products — the
  // trainer's paid `plan` (iosAppBroadsheetPros.jsx) and the nutritionist's
  // `program`. None of the lines is a weekday, so before this they fell to the
  // exercise parser: a six-week program was labelled "Single session" and its
  // WEEKS were listed as moves.
  const p = bsPlanPreview({ name: 'Hypertrophy Plan', detail: { blocks: [
    'Week 1 — Accumulation', 'Week 2 — Accumulation', 'Week 3 — Intensification',
    'Week 4 — Deload', 'Week 5 — Peak', 'Week 6 — Retest',
  ] } });
  assert.equal(p.kind, 'block');
  assert.equal(p.units.length, 6);
  assert.deepEqual(p.units.slice(0, 2), [
    { label: 'WEEK 1', title: 'Accumulation' },
    { label: 'WEEK 2', title: 'Accumulation' },
  ]);
  // The outline STATES its week numbers, so 6 is read information — not a guess
  // from the block count. The nutrition program proves the difference: 5 blocks,
  // only 4 of them weeks.
  assert.equal(p.weeks, 6);
  const n = bsPlanPreview({ name: 'Reset', detail: { blocks: [
    'Week 1 — Reset & habits', 'Week 2 — Build routine', 'Week 3 — Dial macros',
    'Week 4 — Lock it in', 'Grocery + prep guide',
  ] } }, { isNutri: true });
  assert.equal(n.kind, 'block');
  assert.equal(n.weeks, 4);
  assert.equal(n.units.length, 4);
  // A stated duration in the metadata still wins over the outline's numbers.
  assert.equal(bsPlanPreview({ name: 'x', meta: '12 wks', detail: { blocks: [
    'Week 1 — A', 'Week 2 — B',
  ] } }).weeks, 12);
});

test('an estimated-kcal suffix strips whole, leaving no dangling "~"', () => {
  // The nutrition builder's default outline writes "Breakfast · ~500 kcal".
  // Removing only the digits left titles reading "Breakfast · ~" on every
  // generated paid meal plan.
  const p = bsPlanPreview({ name: 'x', detail: { blocks: [
    'Breakfast · ~500 kcal', 'Lunch · ~600 kcal', 'Snack · ~250 kcal',
  ] } }, { isNutri: true });
  assert.equal(p.kind, 'menu');
  for (const u of p.units) {
    assert.ok(!/[~≈]/.test(u.title), `dangling approximation marker in: ${u.title}`);
    assert.ok(!/·\s*$/.test(u.title), `dangling separator in: ${u.title}`);
  }
  assert.deepEqual(p.units.map((u) => u.kcal), [500, 600, 250]);
});

test('ONE week line is below the block threshold — not a program', () => {
  // The >=2 threshold is deliberate: a single "Week 1 — …" line among ordinary
  // exercise blocks is a heading, not a multi-week product, and promoting it
  // would relabel a single session as a Program. Boundary pinned in both
  // directions so the threshold can't drift silently.
  const one = bsPlanPreview({ name: 'x', detail: { blocks: [
    'Week 1 — Base', 'Back squat · 5×5', 'Romanian deadlift · 3×8',
  ] } });
  assert.notEqual(one.kind, 'block');
  const two = bsPlanPreview({ name: 'x', detail: { blocks: [
    'Week 1 — Base', 'Week 2 — Build',
  ] } });
  assert.equal(two.kind, 'block');
});

// ── The server-reduced shape (2026-10-09, the open half of C2) ───────────────
// The public sale-plan functions hand out counts plus the first day's two meals
// (sale_plan_preview_detail). bsPreviewReduce is that rule in JavaScript, the
// tests' oracle: the model of a reduced plan must equal the model of the full
// one, and the reduced shape must carry no meal text beyond the two shown.
import fs from 'node:fs';
import { bsPreviewReduce } from '../mobile-app/src/services/planPreview.mjs';

const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)) ? Object.fromEntries(Object.keys(x).sort().map((kk) => [kk, x[kk]])) : x);
const MEAL_FIXTURES = [
  { name: 'authored Wednesday, empty authored Monday, a junk day, a duplicate dow; the sample day inherits',
    detail: { builder: { weeks: [] }, note: 'n', media: [{ url: 'https://x/y.jpg', type: 'image' }], blocks: ['Breakfast · Oats', '  ', 'Lunch · Bowl', { text: 'Dinner · Fish' }], days: [{ dow: 2, blocks: ['Breakfast · Eggs', 'Lunch · Soup'] }, { dow: 0, blocks: [] }, { dow: 9, blocks: ['x'] }, { dow: 2, blocks: ['dup'] }] } },
  { name: 'an authored first day is the sample', detail: { blocks: ['Breakfast · Oats', 'Lunch · Bowl'], days: [{ dow: 0, blocks: ['Breakfast · Eggs', 'Lunch · Soup', 'Dinner · Stew'] }] } },
  { name: 'a uniform week with no days key', detail: { blocks: ['Breakfast · Oats', 'Lunch · Bowl', 'Dinner · Fish'] } },
  { name: 'an empty default, two identical authored days', detail: { blocks: [], days: [{ dow: 3, blocks: ['Breakfast · Toast · 300 kcal', 'Snack · Nuts', 'Lunch · Rice', 'Dinner · Curry'] }, { dow: 5, blocks: ['Breakfast · Toast · 300 kcal', 'Snack · Nuts', 'Lunch · Rice', 'Dinner · Curry'] }] } },
  { name: 'seven authored days that deliver one menu (whitespace, an empty, a false, an object)', detail: { blocks: ['Breakfast · Oats'], days: [{ dow: 0, blocks: ['Breakfast · Oats '] }, { dow: 1, blocks: ['Breakfast · Oats', ''] }, { dow: 2, blocks: ['Breakfast · Oats', false] }, { dow: 3, blocks: [{ text: 'Breakfast · Oats' }] }, { dow: 4, blocks: ['Breakfast · Oats'] }, { dow: 5, blocks: ['Breakfast · Oats'] }, { dow: 6, blocks: ['Breakfast · Oats'] }] } },
  { name: 'junk dows and junk blocks', detail: { blocks: ['a', 'b', 'c'], days: [{ dow: '1', blocks: ['x'] }, { dow: 1.5, blocks: ['y'] }, { dow: 6, blocks: 'nope' }, { dow: 4 }, { dow: 2, blocks: [0, true, null, [], [1], { text: null }, { no: 'text' }, '  Z  '] }] } },
  { name: 'nothing authored', detail: {} },
  { name: 'seven empty authored days and an eighth entry past the scan', detail: { blocks: ['a'], days: [{ dow: 0, blocks: [] }, { dow: 1, blocks: [] }, { dow: 2, blocks: [] }, { dow: 3, blocks: [] }, { dow: 4, blocks: [] }, { dow: 5, blocks: [] }, { dow: 6, blocks: [] }, { dow: 0, blocks: ['late'] }] } },
  { name: 'a different meal every day', detail: { blocks: ['Breakfast · 1'], days: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, blocks: [`Breakfast · ${dow + 2}`] })) } },
  { name: 'a day past the 40-block cap', detail: { blocks: Array.from({ length: 45 }, (_, i) => `Snack · ${i + 1}`) } },
  // The two text rules disagree here: `true` delivers "true" (so the week varies by day) but is
  // not a meal the preview counts. perDay must follow delivery; the count must follow the preview.
  { name: 'a block that delivers but is not a meal', detail: { blocks: ['Breakfast · Oats'], days: [{ dow: 0, blocks: ['Breakfast · Oats', true] }] } },
  // Seven junk entries and an eighth real day: the eighth is past the seven-entry scan on both
  // sides, so it inherits the default rather than serving its own menu.
  { name: 'an eighth entry past the scan with a menu of its own', detail: { blocks: ['Breakfast · Oats'], days: [{ dow: 'x' }, { dow: 'x' }, { dow: 'x' }, { dow: 'x' }, { dow: 'x' }, { dow: 'x' }, { dow: 'x' }, { dow: 3, blocks: ['Breakfast · Late', 'Lunch · Late', 'Dinner · Late'] }] } },
];

test('reduced: the model of a reduced meal plan equals the model of the full one, on every fixture', () => {
  for (const f of MEAL_FIXTURES) {
    const full = bsPlanPreview({ detail: f.detail }, { isNutri: true });
    const reduced = bsPreviewReduce('meal_plan', f.detail);
    const red = bsPlanPreview({ detail: reduced }, { isNutri: true });
    const strip = (m) => canon({ ...m, units: m.units.length });
    assert.equal(strip(red), strip(full), f.name);
    assert.ok(!('builder' in reduced), `${f.name}: builder gone`);
    assert.equal(reduced.preview, true);
  }
});

test('reduced: the shape carries no meal text beyond the two meals the sheet shows, and a program is untouched', () => {
  const texts = (d) => {
    const out = [];
    const take = (b) => { const t = (b && b.text != null) ? b.text : b; const s = String(t || '').trim(); if (s) out.push(s); };
    (Array.isArray(d.blocks) ? d.blocks : []).forEach(take);
    (Array.isArray(d.days) ? d.days : []).forEach((e) => (Array.isArray(e && e.blocks) ? e.blocks : []).forEach(take));
    return out;
  };
  for (const f of MEAL_FIXTURES) {
    const reduced = bsPreviewReduce('meal_plan', f.detail);
    const shown = bsPlanPreview({ detail: f.detail }, { isNutri: true }).free.length;
    assert.ok(texts(reduced).length <= Math.max(shown, 0) + 0, `${f.name}: ${texts(reduced).length} text(s) for ${shown} shown`);
    assert.ok(texts(reduced).length <= BS_PREVIEW_FREE_UNITS);
  }
  const first = bsPreviewReduce('meal_plan', MEAL_FIXTURES[0].detail);
  assert.deepEqual(first.days, [{ dow: 0, count: 0, blocks: [] }, { dow: 2, count: 2, blocks: [] }], 'authored days: counts, no text; the junk and the duplicate dropped');
  assert.deepEqual(first.blocks, ['Breakfast · Oats', 'Lunch · Bowl'], 'the sample is the inherited default, its first two meals');
  assert.equal(first.blocksCount, 3);
  assert.equal(first.perDay, true);
  assert.equal(first.note, 'n');
  const authoredFirst = bsPreviewReduce('meal_plan', MEAL_FIXTURES[1].detail);
  assert.deepEqual(authoredFirst.blocks, [], 'an authored first day: the default keeps no text');
  assert.deepEqual(authoredFirst.days[0].blocks, ['Breakfast · Eggs', 'Lunch · Soup']);
  const uniform = bsPreviewReduce('meal_plan', MEAL_FIXTURES[2].detail);
  assert.equal('days' in uniform, false, 'no days key stays no days key');
  assert.equal(uniform.perDay, false);
  const program = bsPreviewReduce('program', { builder: { weeks: [] }, blocks: ['Mon — Push', 'Wed — Pull', 'Fri — Legs'], days: [{ dow: 0, blocks: ['x'] }] });
  assert.deepEqual(program, { blocks: ['Mon — Push', 'Wed — Pull', 'Fri — Legs'], days: [{ dow: 0, blocks: ['x'] }] });
  assert.equal(bsPreviewReduce('meal_plan', null), null);
});

test('reduced: the counts are the server\'s, and a reduced plan never reads a locked meal', () => {
  const p = bsPlanPreview({ meta: '4 weeks', detail: { preview: true, perDay: true, blocksCount: 3, blocks: ['Breakfast · Oats', 'Lunch · Bowl'], days: [{ dow: 2, count: 5, blocks: [] }, { dow: 4, count: 0, blocks: [] }], note: 'n' } }, { isNutri: true });
  assert.equal(p.kind, 'menu');
  assert.equal(p.perDay, true);
  assert.deepEqual(p.days.map((d) => d.count), [3, 3, 5, 3, 0, 3, 3]);
  assert.equal(p.units.length, 20);
  assert.equal(p.free.length, 2);
  assert.equal(p.free[0].title, 'Breakfast · Oats');
  assert.equal(p.locked, 18);
  assert.equal(p.weeks, 4);
  assert.ok(p.units.slice(2).every((u) => u.locked === true && u.title === ''), 'a locked unit carries nothing');
  const counts = bsPlanPreview({ detail: { preview: true, perDay: true, blocksCount: 99, blocks: [], days: [{ dow: 0, count: -4, blocks: [] }] } }, { isNutri: true });
  assert.equal(counts.units.length, 40 * 6, 'a count is capped at the 40-block scan, and never negative');
  assert.equal(counts.free.length, 0);
  assert.equal(counts.locked, 240);
  const uniform = bsPlanPreview({ detail: { preview: true, perDay: false, blocksCount: 5, blocks: ['Breakfast · Oats', 'Lunch · Bowl'] } }, { isNutri: true });
  assert.equal(uniform.units.length, 5, 'a uniform week counts one day, as the full path does');
  assert.equal(uniform.locked, 3);
  assert.equal('perDay' in uniform, false);
  const empty = bsPlanPreview({ detail: { preview: true, perDay: false, blocksCount: 0, blocks: [] } }, { isNutri: true });
  assert.equal(empty.kind, null);
  assert.deepEqual(empty.units, []);
  const notNutri = bsPlanPreview({ detail: { preview: true, blocks: ['Mon — Push', 'Tue — Pull', 'Thu — Legs'] } }, { isNutri: false });
  assert.equal(notNutri.kind, 'split', 'the reduced path is the nutrition preview\'s only');
});

test('reduced: the migration applies the rule inside both public functions and keeps the helpers private', () => {
  const sql = fs.readFileSync(new URL('../supabase-migrations/2026-10-09-sale-plan-preview-menus.sql', import.meta.url), 'utf8');
  assert.equal((sql.match(/public\.sale_plan_preview_detail\(cp\.kind, cp\.detail\) as detail/g) ?? []).length, 2, 'both public functions');
  assert.doesNotMatch(sql, /\(cp\.detail - 'builder'\) as detail/, 'the old shape is gone');
  assert.match(sql, /if p_kind is distinct from 'meal_plan' then return v; end if;/, 'a program is untouched');
  assert.match(sql, /where n <= 40\n/, 'the 40-block scan');
  assert.match(sql, /where n <= 7 order by n loop/, 'the seven-entry scan');
  assert.match(sql, /filter \(where rn <= 2\)/, 'two meals kept');
  assert.match(sql, /if v_sample is not null and v_authored\[v_sample\] is null then\n\s+v_blocks := v_first2\[v_sample\];/, 'the default keeps text only when the sample day inherits');
  assert.match(sql, /'blocks', case when v_sample = i then v_first2\[i\] else '\[\]'::jsonb end/, 'an authored day keeps text only when it is the sample');
  for (const fn of ['sale_plan_block_text(jsonb)', 'sale_plan_preview_detail(text, jsonb)']) {
    assert.ok(sql.includes(`revoke all on function public.${fn} from anon;`) && sql.includes(`revoke all on function public.${fn} from authenticated;`), `${fn} is private`);
  }
  assert.match(sql, /\nbegin;\nset local lock_timeout = '10s';\n/);
  assert.match(sql, /\$guard\$;\n\ncommit;\n$/);
  const guard = sql.slice(sql.indexOf('do $guard$'), sql.lastIndexOf('$guard$;'));
  assert.doesNotMatch(guard, /\bexecute\b/);
  for (const m of guard.matchAll(/raise exception '((?:[^']|'')*)'((?:,\s*[\w.()':]+)*)\s*;/g)) {
    const pct = (m[1].match(/%/g) ?? []).length;
    const args = m[2].trim() ? m[2].split(',').filter((s) => s.trim()).length : 0;
    assert.equal(pct, args, `RAISE "${m[1].slice(0, 60)}": ${pct} placeholder(s), ${args} argument(s)`);
  }
});
