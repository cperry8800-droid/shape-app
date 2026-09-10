// tests/units-weight-canonical.test.mjs
//
// BODY WEIGHT IS KILOGRAM-NATIVE; A LIFT IS POUND-NATIVE. Those two facts used
// to live nowhere, and the cost was real: `client_weigh_ins.weight` was written
// in POUNDS by the weekly check-in (`t.isMetric ? 'kg' : 'lb'`) and in the GOAL
// DOCUMENT's unit by the weigh-in sheet, while the read hardcoded every row's
// field name to `kg` and converted nothing. An Imperial member's 180 lb was
// therefore read back as 180 kg — and because `bsGoalNow` feeds the trend line,
// the weekly pace and the distance-to-target, one check-in moved a member's
// whole body-composition chart by a factor of 2.2.
//
// These tests DRIVE the shipped helpers — lifted out of the real modules and
// evaluated — rather than matching their text. A spelling pin cannot tell a
// correct rewrite from a regression, and this is arithmetic: it either round
// trips or it does not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CHROME = 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx';
const BACKEND = 'mobile-app/src/services/shapeBackend.js';
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';

// Lift a top-level `function name(...) { ... }` out of a module by matching
// braces from its own opening brace, so an equivalent rewrite still resolves.
function lift(src, decl) {
  const at = src.indexOf(decl);
  assert.notEqual(at, -1, `not found: ${decl}`);
  const open = src.indexOf('{', at + decl.length - 1);
  assert.notEqual(open, -1, `no body brace: ${decl}`);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  assert.ok(depth === 0, `unbalanced braces: ${decl}`);
  return src.slice(at, i + 1);
}

const chromeSrc = readFileSync(CHROME, 'utf8');
const backendSrc = readFileSync(BACKEND, 'utf8');
const clientSrc = readFileSync(CLIENT, 'utf8');

// ── the theme formatters ────────────────────────────────────────────────────
const fmtFactory = new Function(
  'const LB_TO_KG = 0.45359237, MI_TO_KM = 1.609344;\n'
  + lift(chromeSrc, 'function bsUnitFormatters(')
  + '\nreturn bsUnitFormatters;',
)();
const KG = { weight: 'kg', distance: 'km' };
const LB = { weight: 'lb', distance: 'mi' };
const imperial = fmtFactory('imperial');
const metric = fmtFactory('metric');

test('kgToDisplay leaves kilograms alone on metric and yields pounds on imperial', () => {
  assert.equal(metric.kgToDisplay(80), 80);
  assert.ok(Math.abs(imperial.kgToDisplay(80) - 176.37) < 0.01);
});

test('displayToKg is the exact inverse of kgToDisplay in both systems', () => {
  for (const f of [imperial, metric]) {
    for (const kg of [0.5, 45, 72.5, 80, 130]) {
      assert.ok(Math.abs(f.displayToKg(f.kgToDisplay(kg)) - kg) < 1e-9,
        `round trip failed for ${kg} in ${f.units}`);
    }
  }
});

test('null survives as null rather than becoming a confident zero', () => {
  // `Number(null)` is 0 AND finite, so a bare Number() guard renders an absent
  // weight as "0 kg" — the exact class the Wall's own helpers were fixed for.
  for (const f of [imperial, metric]) {
    assert.equal(f.kgToDisplay(null), null);
    assert.equal(f.displayToKg(null), null);
    assert.equal(f.fmtBodyWeight(null), '');
  }
});

test('the kg-native pair is NOT the lb-native pair — swapping them is the bug', () => {
  // convWeight takes POUNDS (a lift); kgToDisplay takes KILOGRAMS (a body
  // weight). On metric they diverge by the conversion factor, which is what
  // makes an 80 kg member render as 36 if the wrong one is reached for.
  assert.ok(Math.abs(metric.convWeight(80) - 36.29) < 0.01, 'convWeight must read its argument as pounds');
  assert.equal(metric.kgToDisplay(80), 80, 'kgToDisplay must read its argument as kilograms');
  assert.notEqual(metric.convWeight(80), metric.kgToDisplay(80));
});

test('fmtBodyWeight names the unit it actually converted to', () => {
  assert.equal(metric.fmtBodyWeight(80, 1), '80.0 kg');
  assert.equal(imperial.fmtBodyWeight(80, 1), '176.4 lb');
});

// ── the storage canonicaliser ───────────────────────────────────────────────
const weighInToKg = new Function(
  'const LB_TO_KG_BACKEND = 0.45359237;\n'
  + lift(backendSrc, 'function _weighInToKg(')
  + '\nreturn _weighInToKg;',
)();

test('a row stored in pounds is converted; a row stored in kilograms is not', () => {
  assert.ok(Math.abs(weighInToKg(180, 'lb') - 81.65) < 0.01);
  assert.ok(Math.abs(weighInToKg(180, 'lbs') - 81.65) < 0.01);
  assert.equal(weighInToKg(81.65, 'kg'), 81.65);
});

test('an absent or unknown unit is taken as kilograms, the column default', () => {
  // Never guessed from magnitude: ">120 must be pounds" is wrong for a 130 kg
  // lifter and for a 100 lb client alike, and a silent wrong answer about
  // someone's body weight is worse than trusting the column that exists.
  assert.equal(weighInToKg(130, null), 130);
  assert.equal(weighInToKg(130, ''), 130);
  assert.equal(weighInToKg(130, 'stone'), 130);
});

test('an unreadable weight is null, never zero', () => {
  assert.equal(weighInToKg(null, 'kg'), null);
  assert.equal(weighInToKg('', 'kg'), null);
  assert.equal(weighInToKg('heavy', 'lb'), null);
});

// ── the goal document reader ────────────────────────────────────────────────
const goalDoc = new Function(
  'const BS_GOAL_LB_TO_KG = 0.45359237;\n'
  + lift(clientSrc, 'function bsGoalUnitIsLb(') + '\n'
  + lift(clientSrc, 'function bsGoalDocKg(')
  + '\nreturn { bsGoalUnitIsLb, bsGoalDocKg };',
)();

test('a goal document is read in its own stored unit', () => {
  assert.ok(Math.abs(goalDoc.bsGoalDocKg(180, { unit: 'lb' }) - 81.65) < 0.01);
  assert.equal(goalDoc.bsGoalDocKg(81.65, { unit: 'kg' }), 81.65);
  assert.equal(goalDoc.bsGoalDocKg(81.65, {}), 81.65, 'no unit means kilograms');
});

test('an empty goal figure does not become a real zero', () => {
  assert.equal(goalDoc.bsGoalDocKg('', { unit: 'kg' }), null);
  assert.equal(goalDoc.bsGoalDocKg(null, { unit: 'lb' }), null);
  assert.equal(goalDoc.bsGoalDocKg(undefined, {}), null);
});

test('a canonicalised document is idempotent — reading it twice cannot halve it', () => {
  // The save path stamps `unit: 'kg'` and converts start/target in the SAME
  // step. If it ever stamped without converting, this is the assertion that
  // fails: a kilogram figure re-read under `lb` would convert a second time.
  const doc = { unit: 'lb', start: 200, target: 180 };
  const canon = { unit: 'kg', start: goalDoc.bsGoalDocKg(doc.start, doc), target: goalDoc.bsGoalDocKg(doc.target, doc) };
  assert.equal(goalDoc.bsGoalDocKg(canon.start, canon), canon.start);
  assert.equal(goalDoc.bsGoalDocKg(canon.target, canon), canon.target);
});

// ── the wiring, asserted where a source read is the only way to see it ──────
test('the weigh-in table is written in kilograms by every caller', () => {
  // Two writers filled this column in different units and nothing reconciled
  // them. Both must now hand `logWeighIn` a unit it will canonicalise, and the
  // upsert itself must stamp kg — otherwise the mixing simply resumes.
  assert.match(backendSrc, /logged_on: today, weight: w, unit: 'kg'/,
    'the upsert must stamp kilograms');
  assert.match(backendSrc, /const w = _weighInToKg\(weight, unit\);/,
    'the write must canonicalise before it stores');
  assert.doesNotMatch(clientSrc, /ShapeWeighIns\.log\(\{ weight: kg, unit: overall\.unit/,
    'the goal page must not send the document unit for a kilogram value');
});

test('the goal target editor no longer lets a member type a free-text unit', () => {
  // The free-text box is where mixed-unit documents came from: a member could
  // type "lbs" beside figures the weigh-in table was filling in kilograms.
  assert.doesNotMatch(clientSrc, /setG\(\{ \.\.\.g, unit: e\.target\.value/,
    'the unit must follow Settings, not a text field');
});

// ── the wall's per-record units ─────────────────────────────────────────────
// A wall record is stored in the unit it was SET in, so the board holds pounds
// and kilograms side by side. The reader sees their own unit; what must never
// happen is a figure converted while its gain is not, which would print
// "+10 lb over last best" under a kilogram number.
const wall = new Function(
  'const BS_WALL_LB_TO_KG = 0.45359237;\n'
  + 'const BS_WALL_MI_TO_KM = 1.609344;\n'
  + lift(clientSrc, 'function bsWallUnitFamily(') + '\n'
  + lift(clientSrc, 'function bsWallTargetUnit(') + '\n'
  + lift(clientSrc, 'function bsWallToUnit(') + '\n'
  + lift(clientSrc, 'function bsWallNum(') + '\n'
  + lift(clientSrc, 'function bsWallGain(') + '\n'
  + lift(clientSrc, 'function bsWallHeader(')
  + '\nreturn { bsWallUnitFamily, bsWallTargetUnit, bsWallToUnit, bsWallHeader };',
)();

test('a record set in pounds reads in kilograms for a metric member', () => {
  const rec = { liftLabel: 'Deadlift', best: 245, prev: 235, unit: 'lb', reps: 3 };
  const asIs = wall.bsWallHeader(rec);
  const metricView = wall.bsWallHeader(rec, KG);
  assert.equal(asIs.unit, 'lb');
  assert.equal(asIs.figure, '245');
  assert.equal(metricView.unit, 'kg');
  assert.ok(Math.abs(Number(metricView.figure) - 111.1) < 0.2, `got ${metricView.figure}`);
});

test('the figure and the gain are converted together, never one alone', () => {
  const rec = { liftLabel: 'Deadlift', best: 245, prev: 235, unit: 'lb' };
  const m = wall.bsWallHeader(rec, KG);
  // 10 lb of improvement is 4.5 kg — not a 10 left standing beside a kg figure.
  assert.ok(Math.abs(Number(m.gain) - 4.54) < 0.05, `gain was ${m.gain}`);
  assert.notEqual(Number(m.gain), 10);
});

test('omitting the target unit keeps the record exactly as it was set', () => {
  // The signature is additive: a caller with no theme in hand is unchanged.
  const rec = { liftLabel: 'Squat', best: 100, prev: 95, unit: 'kg' };
  const h = wall.bsWallHeader(rec);
  assert.equal(h.unit, 'kg');
  assert.equal(h.figure, '100');
});

test('converting to the unit a record already uses changes nothing at all', () => {
  assert.equal(wall.bsWallToUnit(245, 'lb', 'lb'), 245);
  assert.equal(wall.bsWallToUnit(100, 'kg', 'kg'), 100);
  assert.equal(wall.bsWallToUnit(18.2, 'mi', 'mi'), 18.2);
});

test('a wall conversion refuses an absent figure rather than returning zero', () => {
  assert.equal(wall.bsWallToUnit(null, 'lb', 'kg'), null);
  assert.equal(wall.bsWallToUnit('', 'lb', 'kg'), null);
  assert.equal(wall.bsWallToUnit('heavy', 'lb', 'kg'), null);
});

test('a unit is recognised by FAMILY, so a distance is never read as a weight', () => {
  assert.deepEqual(wall.bsWallUnitFamily('lb'), { family: 'weight', key: 'lb' });
  assert.deepEqual(wall.bsWallUnitFamily('kilograms'), { family: 'weight', key: 'kg' });
  assert.deepEqual(wall.bsWallUnitFamily('mi'), { family: 'distance', key: 'mi' });
  assert.deepEqual(wall.bsWallUnitFamily('km'), { family: 'distance', key: 'km' });
  assert.equal(wall.bsWallUnitFamily('reps').family, null);
});

test('A DISTANCE RECORD IS NOT A WEIGHT — the wall carries longest runs too', () => {
  // The regression this pins: collapsing every unit onto the weight pair turned
  // an 18.2 mi record into "18.2 lb" the moment a preference was applied.
  const run = { liftLabel: 'Longest run', best: 18.2, prev: 16.4, unit: 'mi' };
  const metricView = wall.bsWallHeader(run, KG);
  assert.equal(metricView.unit, 'km', 'a metric reader sees kilometres');
  assert.ok(Math.abs(Number(metricView.figure) - 29.3) < 0.2, `got ${metricView.figure}`);
  const imperialView = wall.bsWallHeader(run, LB);
  assert.equal(imperialView.unit, 'mi');
  assert.equal(imperialView.figure, '18.2');
  assert.ok(Math.abs(Number(imperialView.gain) - 1.8) < 1e-9);
});

test('a unit outside both families passes through untouched', () => {
  const odd = { liftLabel: 'Plank', best: 240, prev: 200, unit: 'sec' };
  const h = wall.bsWallHeader(odd, KG);
  assert.equal(h.unit, 'sec');
  assert.equal(h.figure, '240');
  assert.equal(wall.bsWallToUnit(240, 'sec', 'kg'), 240);
});

test('a preference naming the wrong family cannot cross-convert', () => {
  // Asking for a weight record in kilometres must keep the record's own unit,
  // not silently multiply it by 1.609.
  assert.equal(wall.bsWallTargetUnit('lb', { weight: 'km', distance: 'km' }), 'lb');
  assert.equal(wall.bsWallToUnit(245, 'lb', 'km'), 245);
});

test('a first record still reads as first after a conversion', () => {
  // `first` is whether a previous best EXISTS — a conversion must not turn a
  // record with a prior best into a "First on the wall", nor the reverse.
  const first = wall.bsWallHeader({ best: 245, prev: null, unit: 'lb' }, KG);
  const notFirst = wall.bsWallHeader({ best: 245, prev: 235, unit: 'lb' }, KG);
  assert.equal(first.first, true);
  assert.equal(notFirst.first, false);
});
