// RPE was the fourth `loadType`, which made it EXCLUSIVE with a weight: a coach
// could prescribe 100 kg or RPE 8 and never "100 kg @ RPE 8" — the ordinary thing
// most strength programming says. Owner: "the unit drop down i should be able to
// select multiple options, if i want RPE, that should be a seperate drop down
// from KG or IBS".
//
// ⚠ THE MIGRATION IS ON READ, NOT IN THE DATABASE. `normalizeWorkoutPlan` runs on
// every GET, POST and PATCH of a coach plan (src/app/api/coach/plans/route.ts) and
// on every mobile library read, so a stored document is converted the first time
// it is looked at and persisted the next time it is saved. No migration is owed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const W = require('../public/newdesign/workoutDocument.js');
const DB = require('../public/newdesign/dashBuilderCore.js');
const ND = fileURLToPath(new URL('../public/newdesign/', import.meta.url));

test('a row can carry a weight and an effort at once — the thing the old model could not say', () => {
  assert.equal(W.loadLabel({ load: 100, loadType: 'kg', rpe: 8 }), '100 kg · RPE 8');
  assert.equal(W.loadLabel({ load: 225, loadType: 'lb', rpe: 9.5 }), '225 lb · RPE 9.5');
  assert.equal(W.loadLabel({ load: 75, loadType: 'pct', rpe: 7 }), '75% 1RM · RPE 7');
  assert.equal(W.loadLabel({ load: 100, loadType: 'kg' }), '100 kg', 'a weight alone is still a weight alone');
  assert.equal(W.loadLabel({ load: '', loadType: 'kg', rpe: 8 }), 'RPE 8', 'and an effort alone still reads as one');
  assert.equal(W.loadLabel({ load: '', loadType: 'kg' }), '', 'neither is nothing, not "0 kg"');
});

// ⚠ THE SCALE IS 1–10, SO ANYTHING ELSE IS NOT A READING. A card that printed
// "RPE abc" or "RPE 0" would be stating a prescription nobody wrote — the
// honest-data rule, one field down.
test('an RPE that is not on the scale is not printed', () => {
  for (const rpe of [0, '', null, undefined, 'abc', NaN, -3, 11, [], {}]) {
    assert.equal(W.rpeValue({ rpe }), null, `${JSON.stringify(rpe)} is not an RPE`);
    assert.equal(W.loadLabel({ load: 100, loadType: 'kg', rpe }), '100 kg');
  }
  assert.equal(W.rpeValue({ rpe: 10 }), 10, 'the top of the scale is on it');
  assert.equal(W.rpeValue({ rpe: 1 }), 1, 'and so is the bottom — an easy run is RPE 3, not 7');
});

test('a legacy effort-as-load row is migrated on read, and reads the same either way', () => {
  const legacy = { id: 'r', name: 'Pull-up', sets: 4, reps: '6-8', loadType: 'rpe', load: 8 };
  assert.equal(W.loadLabel(legacy), 'RPE 8', 'the retired shape still reads before it is touched');
  const split = W.splitLegacyRpe(legacy);
  assert.equal(split.loadType, 'kg');
  assert.equal(split.load, '');
  assert.equal(split.rpe, 8);
  assert.equal(W.loadLabel(split), 'RPE 8', 'and reads identically after — the migration is invisible to a member');
  // ⚠ A HALF-MIGRATED ROW STATES IT ONCE. Without the legacy arm's `loadType`
  // guard a row carrying both would render "RPE 8 · RPE 8".
  assert.equal(W.loadLabel({ loadType: 'rpe', load: 8, rpe: 8 }), 'RPE 8');
  assert.equal(W.splitLegacyRpe({ loadType: 'kg', load: 100, rpe: 8 }).load, 100, 'a row already on the new shape is untouched');
  assert.equal(W.splitLegacyRpe(null), null, 'and a ragged row is not a crash');
});

test('the whole document is migrated, not just the row somebody looked at', () => {
  const detail = { builder: { version: 1, goalTag: 'strength', weeks: [{ deload: false, days: [{ name: 'D', blocks: [
    { kind: 'main', rows: [{ id: 'a', name: 'Squat', loadType: 'kg', load: 100 }, { id: 'b', name: 'Pull-up', loadType: 'rpe', load: 8 }] },
    { kind: 'accessory', rows: [{ id: 'c', name: 'Run', loadType: 'rpe', load: 3 }] },
  ] }] }] } };
  const rows = W.normalizeWorkoutDetail(detail).builder.weeks[0].days[0].blocks.flatMap((b) => b.rows);
  assert.equal(rows.length, 3, 'every block is walked, not only the first');
  assert.ok(!rows.some((r) => r.loadType === 'rpe'), 'no row keeps the retired shape');
  assert.deepEqual(rows.map((r) => W.loadLabel(r)), ['100 kg', 'RPE 8', 'RPE 3']);
});

// ⚠ `exerciseFromRow` IS THE LOSSY CHOKEPOINT — an explicit field list, where the
// normalizer's row map spreads. A field not named there never reaches the client's
// own copy of the workout, however well it is stored.
test('the effort reaches the client’s own copy of the workout', () => {
  const ex = W.exerciseFromRow({ id: 'r', name: 'Squat', sets: 3, reps: '5', loadType: 'kg', load: 100, rpe: 8 });
  assert.equal(ex.load, '100 kg · RPE 8', 'the card states both');
  assert.equal(ex.rpe, 8, 'and the raw effort travels with it, for a target a session player can compare against');
  assert.ok(!('rpe' in W.exerciseFromRow({ id: 'r', name: 'Squat', loadType: 'kg', load: 100 })),
    'a row with no effort carries no key — an absent prescription is not RPE 0');
});

test('the demo templates a coach is shown first carry the new shape', () => {
  const rows = DB.demoTemplates().flatMap((t) => t.detail.builder.weeks.flatMap((w) => w.days).flatMap((d) => d.blocks).flatMap((b) => b.rows));
  assert.ok(rows.length > 20, `expected a real demo corpus; found ${rows.length}`);
  assert.ok(!rows.some((r) => r.loadType === 'rpe'), 'the demo never passes through normalize, so it must be authored on the new shape');
  const efforts = rows.filter((r) => W.rpeValue(r) != null);
  assert.ok(efforts.length >= 3, `expected the effort-prescribed demo rows to survive; found ${efforts.length}`);
  assert.deepEqual([...new Set(efforts.map((r) => W.loadLabel(r)))].sort(), ['RPE 3', 'RPE 4', 'RPE 7', 'RPE 8']);
});

// ⚠ BOTH EDITORS WRITE ONE DOCUMENT. A unit list that still offered 'rpe' on
// either surface would put the retired shape straight back into a plan the other
// had just migrated — so the absence is asserted on both, not just the one the
// owner was looking at.
test('neither row editor offers RPE as a load unit any more', () => {
  const sites = [
    [ND + 'dashBuilder.jsx', /value={row\.loadType \|\| 'kg'}[\s\S]{0,400}?<\/select>/],
    [fileURLToPath(new URL('../mobile-app/src/broadsheet/BSWorkoutDocumentEditor.jsx', import.meta.url)), /value={row\.loadType \|\| 'kg'}[\s\S]{0,400}?<\/select>/],
  ];
  for (const [file, re] of sites) {
    const m = re.exec(readFileSync(file, 'utf8'));
    assert.ok(m, `${file}: the load-unit select is gone — this guard is reading nothing`);
    assert.ok(/kg/.test(m[0]) && /lb/.test(m[0]) && /pct/.test(m[0]), `${file}: the units it should offer are missing`);
    assert.ok(!/rpe/i.test(m[0]), `${file}: RPE is still a load unit, so it is still exclusive with a weight`);
  }
});

test('and both offer it as its own control', () => {
  for (const file of [ND + 'dashBuilder.jsx', fileURLToPath(new URL('../mobile-app/src/broadsheet/BSWorkoutDocumentEditor.jsx', import.meta.url))]) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /value={row\.rpe \?\? ''}/, `${file}: no RPE control`);
    assert.match(src, /1 \+ i \* 0\.5/, `${file}: the scale is not in half points`);
  }
});

// ── The effort travels to the member, and never lands in the weight box ────────
import { bsLoadPrefill, bsLoggedSet } from '../mobile-app/src/services/workoutSession.mjs';

// ⚠ THE LABEL IS FOR READING; THE BOX IS FOR A WEIGHT. `loadLabel` now composes
// "100 kg · RPE 8", and the session player pre-filled the member's load box with
// that label verbatim — which `bsLoggedSet`'s number match rejects, so a set logged
// as prescribed recorded NO load. The prefill strips the effort, and only the effort.
test('the load box takes the weight out of a composed label', () => {
  const cases = [
    ['100 kg · RPE 8', '100 kg'], ['225 lb · RPE 9.5', '225 lb'], ['75% 1RM · RPE 7', '75% 1RM'],
    ['RPE 8', ''], ['100 kg', '100 kg'], ['', ''], [undefined, ''],
    // Not an effort token, so kept exactly as typed: a range, and free text.
    ['RPE 7-8', 'RPE 7-8'], ['bodyweight · slow', 'bodyweight · slow'],
  ];
  for (const [l, want] of cases) assert.equal(bsLoadPrefill({ l }), want, `${JSON.stringify(l)} pre-fills ${JSON.stringify(want)}`);
});

test('a set logged from the pre-filled box records the prescribed weight', () => {
  const move = { m: 'Back squat', reps: '5', l: W.loadLabel({ load: 100, loadType: 'kg', rpe: 8 }) };
  const logged = bsLoggedSet({ move, moveIndex: 0, setIndex: 0, input: { reps: '5', load: bsLoadPrefill(move), rpe: '' }, now: 1700000120000, unit: 'lb' });
  assert.equal(logged.actualLoad, 100);
  assert.equal(logged.unit, 'kg');
  assert.equal(logged.targetLoad, '100 kg · RPE 8', 'the target keeps the whole prescription');
  // ⚠ THE CONTROL: the label itself, pre-filled as it used to be, records nothing.
  const before = bsLoggedSet({ move, moveIndex: 0, setIndex: 0, input: { reps: '5', load: move.l, rpe: '' }, now: 1700000120000, unit: 'lb' });
  assert.equal(before.actualLoad, null, 'the defect this fixes: the composed label is not a weight');
});

// ⚠ AN EXPLICIT WHITELIST DROPS EVERY FIELD IT DOES NOT NAME. The member's plan route
// rebuilds each exercise field by field, so a structured prescription it does not list
// never reaches the app — driven here against the shipped `mapExercises`.
test('the member\'s plan route carries the target RPE as a number', async () => {
  const { loadRealModule } = await import('./helpers/load-real-module.mjs');
  const { join, dirname } = await import('node:path');
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
  const route = await loadRealModule(join(ROOT, 'src/app/api/client/plan/route.ts'), {
    typescript: true,
    appendExports: 'export { mapExercises };',
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { clientForRequest: async () => null, currentUser: async () => null }],
      ['@/lib/require-membership', { requireMembership: async () => null }],
    ]),
  });
  const ex = W.exerciseFromRow({ id: 'r1', name: 'Back squat', sets: 3, reps: '5', loadType: 'kg', load: 100, rpe: 8, group: 'A' });
  const [out] = route.mapExercises({ exercises: [ex] });
  assert.equal(out.rpe, 8, 'the structured effort survives the whitelist');
  assert.equal(out.load, '100 kg · RPE 8', 'beside the label that already reads it');
  for (const [rpe, want] of [[undefined, null], ['', null], ['8.5', 8.5], [0, null], [11, null], ['hard', null], [null, null]]) {
    assert.equal(route.mapExercises({ exercises: [{ name: 'X', rpe }] })[0].rpe, want, `rpe ${JSON.stringify(rpe)} → ${want}`);
  }
});

// ⚠ AND EVERY PREFILL SITE, NOT ONE. The player builds a set's inputs in five places
// (the initial set table, an added set, an edit's stand-in, the suggestion's "is this
// still the default" test, the plate maths) and each read the label on its own. The
// drive test proves the initial table; this proves the rest by asking where the label
// is still read at all: inside the player, `move.l` may feed only what is DISPLAYED.
test('inside the session player the load label is only ever displayed', async () => {
  const { parse } = await import('@babel/parser');
  const src = readFileSync(fileURLToPath(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url)), 'utf8');
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });
  const player = ast.program.body.find((n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === 'BSSession');
  assert.ok(player, 'BSSession is gone — this guard is reading nothing');
  const reads = [], offenders = [];
  // "Displayed" is decided by the NEAREST boundary, not by any JSX somewhere above:
  // ⚠ the first version let everything under a JSX tree count, so a `.map` callback
  // building an input's fallback value — `{ load: String(move.l || '') }` inside the
  // set table — read as display, and that prefill could return with the suite green.
  // A function body resets the context (code in a callback is code, not markup), a
  // JSX element sets it, and a `value` / `defaultValue` attribute is never display:
  // it IS the input.
  const FN = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration']);
  const walk = (n, display) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach((c) => walk(c, display)); return; }
    let here = display;
    if (FN.has(n.type)) here = false;
    if (n.type === 'JSXElement' || n.type === 'JSXFragment') here = true;
    if (n.type === 'JSXAttribute' && n.name && /^(value|defaultValue)$/.test(n.name.name)) here = false;
    if (n.type === 'MemberExpression' && !n.computed && n.property && n.property.name === 'l') {
      reads.push(n.loc.start.line);
      if (!here) offenders.push(n.loc.start.line);
    }
    for (const k of Object.keys(n)) if (k !== 'loc' && !/Comments$/.test(k)) walk(n[k], here);
  };
  walk(player.body, false);
  assert.ok(reads.length >= 2, 'found no reads of the label at all — the sweep has stopped matching');
  assert.deepEqual(offenders, [], 'the display label feeds an input, a comparison or a calculation here — route it through bsLoadPrefill');
});
