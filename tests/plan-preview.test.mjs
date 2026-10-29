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

test('reduced: the shape carries no meal text beyond the two meals the sheet shows', () => {
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
  assert.equal(notNutri.kind, 'split', 'the counted path is the nutrition preview\'s only');
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

// ── A program's server-reduced shape (2026-10-29) ────────────────────────────
// The public sale-plan functions hand out a program's names, weeks and days, and one
// video (sale_plan_program_preview). bsProgramReduce is that rule in JavaScript; the
// fixture file holds what the PostgreSQL 16 replica returned for each detail.
import { bsProgramReduce, bsProgramLine } from '../mobile-app/src/services/planPreview.mjs';

const REPLICA = JSON.parse(fs.readFileSync(new URL('./fixtures/program-preview-replica.json', import.meta.url), 'utf8')).fixtures;
const fixture = (name) => REPLICA.find((f) => f.name.startsWith(name));
const BLOCK_KEYS = ['week', 'day', 'dayName', 'weekday', 'name', 'equipment', 'muscle', 'text'];

test('program: the JavaScript rule is the replica\'s, on every fixture', () => {
  assert.ok(REPLICA.length >= 20);
  for (const f of REPLICA) assert.deepEqual(bsPreviewReduce(f.kind, f.detail), f.sql, f.name);
  assert.equal(bsProgramReduce(null), null);
  assert.deepEqual(bsProgramReduce([1]), [1]);
});

test('program: names, weeks, days, equipment and one video come out; the prescription, cues and clips stay in', () => {
  for (const f of REPLICA) {
    const out = f.sql;
    assert.deepEqual(Object.keys(out).filter((k) => !['preview', 'blocks', 'media', 'note', 'buildType', 'weeks', 'firstWeek'].includes(k)), [], `${f.name}: no other key`);
    assert.equal(out.preview, true);
    assert.ok(!JSON.stringify(out).includes('SECRET'), `${f.name}: no rest, tempo or cue`);
    assert.ok(out.blocks.length <= 40);
    for (const b of out.blocks) {
      if (typeof b === 'string') continue;
      assert.deepEqual(Object.keys(b).filter((k) => !BLOCK_KEYS.includes(k)), [], `${f.name}: a row keeps names only`);
      assert.equal(b.text, b.name);
    }
    assert.ok(out.media.filter((m) => m.type === 'video').length <= 1, `${f.name}: one video at most`);
    assert.ok(out.media.length <= 8);
  }
  const app = fixture('a program saved in the app').sql;
  assert.equal(app.blocks.length, 24, '3 weeks of 8 named moves; the unnamed row is skipped');
  assert.deepEqual(app.blocks[0], { week: 0, day: 0, dayName: 'Push', weekday: 0, name: 'Bench press', equipment: 'Barbell', muscle: 'Chest', text: 'Bench press' });
  assert.deepEqual(app.blocks.at(-1), { week: 2, day: 2, dayName: 'Legs', weekday: 4, name: 'Walking lunge', text: 'Walking lunge' });
  assert.deepEqual(app.media, [{ type: 'video', url: 'https://video.example/intro.mp4' }, { type: 'image', url: 'https://img.example/cover.jpg' }], 'the program video is the free one; the workout clips are kept for buyers');
  assert.ok(!JSON.stringify(app).includes('clip.example'));
  assert.deepEqual(fixture('the same program saved on the website').sql.blocks, app.blocks, 'the app and the website preview one program alike');
  assert.equal(app.weeks, 3, 'how many weeks the builder holds, past the 40 rows');
  assert.deepEqual(app.firstWeek, [{ week: 0, day: 0, dayName: 'Push', weekday: 0, moves: 3 }, { week: 0, day: 1, dayName: 'Pull', weekday: 2, moves: 2 }, { week: 0, day: 2, dayName: 'Legs', weekday: 4, moves: 3 }]);
  const long = fixture('a first day of 45 moves').sql;
  assert.deepEqual(long.firstWeek.map((d) => [d.dayName, d.moves]), [['Long', 45], ['Short', 5], ['Shorter', 3]], 'counted past the 40 names (Codex P2 on #2501)');
  assert.equal(long.blocks.length, 40);
  assert.equal(fixture('the 53rd week').sql.weeks, 52);
  assert.equal('weeks' in fixture('a weekday split').sql, false, 'a text outline states its own weeks');
  assert.deepEqual(fixture('media: no program video').sql.media, [{ type: 'video', url: 'https://clip.example/ok.mp4' }, { type: 'image', url: 'http://img.example/plain.jpg' }], 'no program video: the first usable clip');
  assert.deepEqual(fixture('a single session of text lines').sql.blocks, ['Back squat', 'Romanian deadlift', 'Hip thrust', 'Plank', 'Curl', 'Walk', 'Squat · 2', 'Bench —', 'Face pull · light', 'Dip']);
  assert.deepEqual(fixture('a weekday split').sql.blocks, ['Mon — Upper (push)', 'Tue — Lower', 'Wed — Rest', 'Thu — Upper (pull)', 'Fri — Lower: squat 5×5'], 'a split\'s days are its structure, whole');
  assert.deepEqual(fixture('an outline-only builder').sql.blocks, ['Mon — Push', 'Wed — Pull', 'Fri — Legs']);
  assert.deepEqual(fixture('outlineOnly as text').sql.blocks.map((b) => b.name), ['Shown']);
  assert.deepEqual(fixture('past the scans').sql.blocks, [], 'the 15th day, the 13th block and the 41st row are past the scans');
  assert.deepEqual(fixture('past 400 rows').sql.blocks, []);
  assert.deepEqual(fixture('the 53rd week').sql.blocks, []);
  assert.equal(fixture('45 rows').sql.blocks.length, 40);
  assert.deepEqual(fixture('50 rows over two blocks').sql.blocks.map((b) => b.name).slice(-2), ['B14', 'B15'], 'forty in all, across blocks');
});

test('program: a line keeps its weekday or week whole and loses its scheme otherwise', () => {
  assert.equal(bsProgramLine('Mon — Push'), 'Mon — Push');
  assert.equal(bsProgramLine('Thurs: Lower 5×5'), 'Thurs: Lower 5×5');
  assert.equal(bsProgramLine('sunday. — Long run 12 km'), 'sunday. — Long run 12 km');
  assert.equal(bsProgramLine('Week 12 — Peak 3×3 @ 90%'), 'Week 12 — Peak 3×3 @ 90%');
  assert.equal(bsProgramLine('Monster walk — 3 × 10'), 'Monster walk', 'an exercise that starts like a weekday');
  assert.equal(bsProgramLine('Sunrise run: 5 km'), 'Sunrise run');
  assert.equal(bsProgramLine('Week 53 — x'), 'Week 53');
  assert.equal(bsProgramLine('Back squat – 4 × 6'), 'Back squat', 'an en dash');
  assert.equal(bsProgramLine('Plank · 3 × 30s'), 'Plank');
  assert.equal(bsProgramLine('Face pull · light'), 'Face pull · light', 'no number after the dot: nothing to cut');
  assert.equal(bsProgramLine('Bench —'), 'Bench —', 'a separator with nothing after it');
  assert.equal(bsProgramLine('— 3 × 8'), '');
  assert.equal(bsProgramLine(''), '');
});

test('program: the sheet classes a reduced outline as it classed the full one, with names alone', () => {
  const view = (m) => canon({ kind: m.kind, weeks: m.weeks, sessionsPerWeek: m.sessionsPerWeek, units: m.units.map((u) => [u.label, u.title, !!u.rest]), free: m.free.map((u) => [u.label, u.title]), locked: m.locked, note: m.note });
  // Crafted: a block's text of 5, and a note of 5, read "5" in full and nothing reduced; only less shows.
  const crafted = ['junk blocks', 'a note that is not text', 'the same program saved on the website'];
  const compared = [];
  for (const f of REPLICA.filter((x) => !crafted.some((c) => x.name.startsWith(c)))) {
    const plan = { name: 'P', meta: '6 weeks', detail: f.detail };
    const full = bsPlanPreview(plan, { isNutri: false });
    const red = bsPlanPreview({ ...plan, detail: f.sql }, { isNutri: false });
    // The server reads a builder where there is one, as delivery does, and its rows carry
    // their week and day, which the full path never had: those preview as a program (below).
    const b = f.detail.builder;
    if (b && typeof b === 'object' && Array.isArray(b.weeks) && b.outlineOnly !== true) continue;
    assert.equal(view(red), view(full), f.name);
    compared.push(f.name);
    if (red.kind) assert.equal(red.namesOnly, true, `${f.name}: the sheet says what buying unlocks`);
    for (const u of red.units) if (!u.rest && u.label === '') assert.ok(!u.scheme && !u.load || /^(mon|tue|wed|thu|fri|sat|sun)/i.test(u.title), `${f.name}: ${u.title} carries no scheme`);
  }
  assert.ok(['a weekday split', 'a week-block outline', 'a single session', 'lines that look like structure', 'an outline-only builder'].every((n) => compared.some((c) => c.startsWith(n))), compared.join(' | '));
  // "Squat · 2" is the name as the coach wrote it, not Squat with a load of 2.
  const session = bsPlanPreview({ detail: fixture('a single session of text lines').sql }, { isNutri: false });
  assert.deepEqual(session.units.map((u) => u.title).slice(6, 8), ['Squat · 2', 'Bench —']);
  assert.ok(session.units.every((u) => u.scheme === '' && u.load === ''));
  // A meal plan's full path, and the nutrition path, never take the flag.
  assert.equal('namesOnly' in bsPlanPreview({ detail: { blocks: ['Mon — A', 'Tue — B', 'Wed — C'] } }, { isNutri: false }), false);
});

test('program: a builder\'s program previews its first week\'s days with their moves; one day is a session (Codex P1 on #2501)', () => {
  for (const name of ['a program saved in the app', 'the same program saved on the website']) {
    const p = bsPlanPreview({ name: 'Rack Strength', detail: fixture(name).sql }, { isNutri: false });
    assert.equal(p.kind, 'program', `${name}: a program, not a single session`);
    assert.equal(p.namesOnly, true);
    assert.equal(p.weeks, 3, 'the builder\'s weeks, with nothing stated');
    assert.equal(p.sessionsPerWeek, 3);
    assert.deepEqual(p.units.map((u) => [u.label, u.title, u.moves]), [
      ['MON', 'Push', ['Bench press', 'Incline dumbbell press', 'Cable fly']],
      ['WED', 'Pull', ['Lat pulldown', 'Seated row']],
      ['FRI', 'Legs', ['Back squat', 'Leg press', 'Walking lunge']],
    ]);
    assert.deepEqual(p.free, p.units, 'names and days are free');
    assert.equal(p.locked, 0);
  }
  assert.equal(bsPlanPreview({ name: 'P', detail: fixture('the same program saved on the website').detail }, { isNutri: false }).kind, null, 'the website save had no outline at all before');
  assert.equal(bsPlanPreview({ meta: '6 weeks', detail: fixture('a program saved in the app').sql }, { isNutri: false }).weeks, 6, 'stated weeks still win');
  // Days with no weekday read DAY n; the first week with moves is the one shown.
  const junk = bsPlanPreview({ detail: fixture('junk builder').sql }, { isNutri: false });
  assert.equal(junk.kind, 'program');
  assert.deepEqual(junk.units.map((u) => [u.label, u.title, u.moves]), [['DAY 3', '', ['A', 'B']], ['DAY 4', 'Day', ['C']], ['DAY 5', '', ['D']]]);
  assert.equal(junk.weeks, 3);
  // One day of moves is a single session of names.
  const one = bsPlanPreview({ detail: fixture('50 rows over two blocks').sql }, { isNutri: false });
  assert.equal(one.kind, 'session');
  assert.equal(one.units.length, 40);
  assert.deepEqual(one.free.map((u) => [u.title, u.scheme, u.load]), [['A1', '', ''], ['A2', '', '']]);
  // A first day of 45 moves fills the 40 names; its later days still come, with their counts
  // (Codex P2 on #2501).
  const long = bsPlanPreview({ detail: fixture('a first day of 45 moves').sql }, { isNutri: false });
  assert.equal(long.kind, 'program');
  assert.equal(long.weeks, 2);
  assert.deepEqual(long.units.map((u) => [u.label, u.title, u.moves.length, u.more]), [['MON', 'Long', 40, 5], ['WED', 'Short', 0, 5], ['FRI', 'Shorter', 0, 3]]);
  // A crafted first week: a day missing its week or day is no day of it.
  const odd = bsPlanPreview({ detail: { preview: true, blocks: [{ week: 0, day: 0, text: 'A' }], firstWeek: [{ week: 0, day: 0, moves: 1 }, { week: '0', day: 1, moves: 2 }, null] } }, { isNutri: false });
  assert.equal(odd.kind, 'session');
  // A crafted week or day is no row of a program.
  const crafted = bsPlanPreview({ detail: { preview: true, blocks: [{ week: '0', day: 0, text: 'A' }, { week: 0, day: 1.5, text: 'B' }, { week: 0, day: 0, text: 'C' }] } }, { isNutri: false });
  assert.equal(crafted.kind, 'session');
});

test('program: the migration routes a program through the cut, keeps a meal plan\'s body and keeps every helper private', () => {
  const sql = fs.readFileSync(new URL('../supabase-migrations/2026-10-29-program-preview-names.sql', import.meta.url), 'utf8');
  const before = fs.readFileSync(new URL('../supabase-migrations/2026-10-09-sale-plan-preview-menus.sql', import.meta.url), 'utf8');
  const body = (text) => text.slice(text.indexOf('create or replace function public.sale_plan_preview_detail('), text.indexOf('$$;', text.indexOf('create or replace function public.sale_plan_preview_detail(')));
  const was = body(before).replace("  v := v - 'builder';\n  if p_kind is distinct from 'meal_plan' then return v; end if;\n", '');
  const now = body(sql).replace("  if p_kind is distinct from 'meal_plan' then return public.sale_plan_program_preview(v); end if;\n  v := v - 'builder';\n", '');
  assert.notEqual(was, body(before), 'the old program branch was found');
  assert.notEqual(now, body(sql), 'the new program branch was found');
  assert.equal(now, was, 'a meal plan runs the 2026-10-09 body, line for line');
  for (const fn of ['sale_plan_program_clean(text, integer)', 'sale_plan_program_line(text)', 'sale_plan_program_preview(jsonb)', 'sale_plan_preview_detail(text, jsonb)']) {
    for (const role of ['public', 'anon', 'authenticated']) assert.ok(sql.includes(`revoke all on function public.${fn} from ${role};`), `${fn} revoked from ${role}`);
  }
  assert.equal((sql.match(/^set search_path = public, pg_temp$/gm) ?? []).length, 4, 'every function pinned');
  assert.doesNotMatch(sql, /^\s*(?:stable |immutable )?security definer\s*$/im, 'the helpers run as the caller: only the two public functions are definers');
  assert.equal((sql.match(/^immutable$/gm) ?? []).length, 4);
  assert.match(sql, /where n <= 52 order by n loop/);
  assert.match(sql, /where n <= 14 order by n loop/);
  assert.match(sql, /where n <= 12 order by n loop/);
  assert.match(sql, /exit rows when v_visits > 400;/);
  assert.match(sql, /exit rows when v_count >= 40 and v_first is not null;/);
  assert.match(sql, /            continue when v_count >= 40;\n/);
  assert.match(sql, /    v_weeks := least\(jsonb_array_length\(v_builder->'weeks'\), 52\);\n/, 'a builder\'s weeks, counted');
  assert.match(sql, /if v_weeks is not null then v_out := v_out \|\| jsonb_build_object\('weeks', v_weeks, 'firstWeek', v_first_week\); end if;/);
  assert.match(sql, /\nbegin;\nset local lock_timeout = '10s';\n/);
  assert.match(sql, /\$guard\$;\n\ncommit;\n$/);
  const guard = sql.slice(sql.indexOf('do $guard$'), sql.lastIndexOf('$guard$;'));
  assert.doesNotMatch(guard, /\bexecute\b/);
  for (const m of guard.matchAll(/raise exception '((?:[^']|'')*)'((?:,\s*[\w.()':]+)*)\s*;/g)) {
    const pct = (m[1].match(/%/g) ?? []).length;
    const args = m[2].trim() ? m[2].split(',').filter((x) => x.trim()).length : 0;
    assert.equal(pct, args, `RAISE "${m[1].slice(0, 60)}": ${pct} placeholder(s), ${args} argument(s)`);
  }
  assert.ok([...guard.matchAll(/raise exception/g)].length >= 10);
});
