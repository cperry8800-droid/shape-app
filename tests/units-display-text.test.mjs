// tests/units-display-text.test.mjs
//
// MOST OF THIS APP'S MEASUREMENTS ARE TEXT BY THE TIME A COMPONENT SEES THEM.
// A session's stats, a breakdown row and a feed card's hero all arrive as
// '245 lb', '8,150 lb', '3.2 mi', '245 lb × 3' or '9:30/mi' — from demo arrays
// and from live builders alike. There is no number left to convert, so a unit
// preference could only ever have relabelled them, and a 245 that says "kg" is
// a lie where a 245 that says "lb" is merely the wrong unit for that reader.
//
// These drive the real exported helpers. The risk in a text rewriter is not the
// arithmetic, it is the MATCHING — so most of what follows pins what must NOT
// be touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bsSdUnitizeText, bsSdUnitizeLabel, bsSdMeasure, bsSdConvertValue } from '../mobile-app/src/services/sessionLedger.mjs';

const KG = { weight: 'kg', distance: 'km', length: 'cm' };
const LB = { weight: 'lb', distance: 'mi', length: 'in' };

test('a plain weight converts and keeps its shape', () => {
  assert.equal(bsSdUnitizeText('245 lb', KG), '111 kg');
  assert.equal(bsSdUnitizeText('100 kg', LB), '220 lb');
});

test('a thousands separator survives the conversion', () => {
  // Dropping it turns a legible "8,150 lb" into "3697 kg".
  assert.equal(bsSdUnitizeText('8,150 lb', KG), '3,697 kg');
});

test('a composite converts only its measurement', () => {
  assert.equal(bsSdUnitizeText('245 lb × 3', KG), '111 kg × 3');
  assert.equal(bsSdUnitizeText('Z2 · 5.1 mi easy', KG), 'Z2 · 8.2 km easy');
});

test('PACE INVERTS — a per-unit time is not a distance', () => {
  // seconds per mile -> seconds per km is a DIVISION: a mile is longer, so each
  // kilometre takes less time. Treating it as a plain distance token would have
  // made every runner ~60% faster on a unit flip.
  assert.equal(bsSdUnitizeText('9:30/mi', KG), '5:54/km');
  assert.equal(bsSdUnitizeText('5:54/km', LB), '9:30/mi');
});

test('pace round-trips, so a flip back is not a slow drift', () => {
  assert.equal(bsSdUnitizeText(bsSdUnitizeText('9:30/mi', KG), LB), '9:30/mi');
});

test('a value already in the target unit is returned untouched', () => {
  // Idempotence matters: these strings pass through render more than once.
  assert.equal(bsSdUnitizeText('245 lb', LB), '245 lb');
  assert.equal(bsSdUnitizeText(bsSdUnitizeText('245 lb', KG), KG), '111 kg');
});

test('units OUTSIDE the whitelist are never touched', () => {
  for (const s of ['138 bpm', '420', '60 min', '4 × 8 @ 175', '82 spm', '2,340 kcal', '7.5 h', '8/10', '25:31', '42%']) {
    assert.equal(bsSdUnitizeText(s, KG), s, `must not rewrite ${s}`);
  }
});

test('"in" IS NOT A UNIT IN FREE TEXT, because it is a word', () => {
  // The commonest false positive available. Inches are converted structurally,
  // via bsSdMeasure, where the unit is a field rather than a guess.
  assert.equal(bsSdUnitizeText('3 in a row', KG), '3 in a row');
  assert.equal(bsSdUnitizeText('+60 lb in 14 weeks', KG), '+27.2 kg in 14 weeks');
});

test('a hyphenated word is not a unit', () => {
  // `\b` matches inside "km-split", so the guard is (?![\w-]).
  // ⚠ EACH CASE IS CHECKED AGAINST THE PREFS THAT WOULD ACTUALLY CONVERT IT.
  // The first version of this test asked for '12 km-split' under METRIC prefs,
  // where km is already the target and the function returns early — so it
  // passed with the guard removed. A mutation proved it hollow.
  assert.equal(bsSdUnitizeText('12 km-split', LB), '12 km-split');
  assert.equal(bsSdUnitizeText('12 mi-split', KG), '12 mi-split');
  assert.equal(bsSdUnitizeText('40 lb-ish', KG), '40 lb-ish');
  assert.equal(bsSdUnitizeText('mi-cycle', KG), 'mi-cycle');
  // And the same tokens WITHOUT the hyphen must still convert, so the guard is
  // not just refusing everything.
  assert.equal(bsSdUnitizeText('12 km split', LB), '7.5 mi split');
});

test('an absent string is handled rather than stringified', () => {
  assert.equal(bsSdUnitizeText(null, KG), null);
  assert.equal(bsSdUnitizeText('', KG), '');
  assert.equal(bsSdUnitizeText('245 lb', null), '245 lb', 'no prefs means leave it alone');
});

test('a bare unit label converts and keeps its casing', () => {
  assert.equal(bsSdUnitizeLabel('lb', KG), 'kg');
  assert.equal(bsSdUnitizeLabel('LB', KG), 'KG');
  assert.equal(bsSdUnitizeLabel('bpm', KG), 'bpm');
  assert.equal(bsSdUnitizeLabel('%', KG), '%');
});

test('a structured value+unit converts, INCLUDING length', () => {
  // `in` is safe here precisely because it is a field, not prose.
  assert.deepEqual(bsSdMeasure(32, 'in', KG), { value: 81.3, unit: 'cm' });
  assert.deepEqual(bsSdMeasure(81.3, 'cm', LB), { value: 32, unit: 'in' });
  // >= 100 rounds to whole, the same rule the text path uses.
  assert.deepEqual(bsSdMeasure(245, 'lb', KG), { value: 111, unit: 'kg' });
});

test('a structured measure leaves an unknown unit and its value alone', () => {
  assert.deepEqual(bsSdMeasure(138, 'bpm', KG), { value: 138, unit: 'bpm' });
  assert.deepEqual(bsSdMeasure(null, 'lb', KG), { value: null, unit: 'lb' });
  assert.deepEqual(bsSdMeasure('', 'lb', KG), { value: '', unit: 'lb' });
});

test('a family cannot be crossed', () => {
  assert.equal(bsSdConvertValue(245, 'lb', 'km'), null);
  assert.equal(bsSdConvertValue(245, 'lb', 'lb'), null, 'same unit is not a conversion');
  assert.ok(Math.abs(bsSdConvertValue(245, 'lb', 'kg') - 111.13) < 0.01);
});

test('THE TEXT PATH CANNOT CONVERT A LENGTH, WHATEVER THE PREFS SAY', () => {
  // Two independent layers keep `in` out of prose, and this pins the second.
  // Layer one is the regex whitelist. Layer two is that bsSdUnitizeText only
  // ever resolves a weight or a distance target — so even if a length unit
  // reached the matcher, bsSdConvertValue refuses to cross families and the
  // token is returned untouched.
  //
  // Recorded because a mutation admitting `in` to the unit table SURVIVED: it
  // is a no-op, not a gap. Defeating this needs three coordinated edits, which
  // is the honest measure of how protected the property is.
  for (const prefs of [KG, LB, { weight: 'kg', distance: 'km', length: 'cm' }]) {
    assert.equal(bsSdUnitizeText('3 in a row', prefs), '3 in a row');
    assert.equal(bsSdUnitizeText('waist 32 in', prefs), 'waist 32 in');
    assert.equal(bsSdUnitizeText('81 cm', prefs), '81 cm');
  }
  // ...while the STRUCTURED path, where the unit is a field, converts it fine.
  assert.deepEqual(bsSdMeasure(32, 'in', KG), { value: 81.3, unit: 'cm' });
});

// ── The coach case file's body-weight series ────────────────────────────────
// ⚠ `weighIns[].kg` is canonical KILOGRAMS and the demo series is kilograms
// too, so BODY rendered `79.2kg` and `-1.2 kg · 8 weeks` to a coach whose
// Settings say Imperial. The units wave reached the member's own surfaces and
// stopped at the coach's case file — an outside-the-diff finding, which is
// exactly the kind a diff-scoped review does not have to catch.
test('the coach body chart converts the series before deriving anything from it', () => {
  const src = readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx', 'utf8');

  // The converter is a pure function of (bwUnit, t) — lifted and driven, so an
  // equivalent rewrite passes and a wrong converter fails.
  const line = src.split('\n').find((l) => l.includes('String(bwUnit).toLowerCase().includes(') && l.includes('kgToDisplay'));
  assert.ok(line, 'the doc-unit-aware converter is gone');

  const LB_TO_KG = 0.45359237;
  const theme = (metric) => ({
    kgToDisplay: (kg) => (kg == null ? null : (metric ? Number(kg) : Number(kg) / LB_TO_KG)),
    convWeight: (lb) => (lb == null ? null : (metric ? lb * LB_TO_KG : lb)),
    weightUnit: metric ? 'kg' : 'lb',
  });
  const pick = (bwUnit, t) => (v) => (v == null ? null
    : (String(bwUnit).toLowerCase().includes('kg') ? t.kgToDisplay(v) : t.convWeight(v)));

  // A canonical kg doc, read by an Imperial coach: 79.2 kg is 174.6 lb.
  assert.equal(Math.round(pick('kg', theme(false))(79.2) * 10) / 10, 174.6);
  // ...and by a metric coach, untouched.
  assert.equal(pick('kg', theme(true))(79.2), 79.2);
  // ⚠ A LEGACY doc still stating `lb` holds POUNDS in a field named `kg`, so
  // the stated unit picks the converter. Handing pounds to `kgToDisplay` is the
  // 2.2x mistake this whole wave exists to remove.
  assert.equal(pick('lb', theme(false))(174.6), 174.6, 'a pound doc shown to a pound coach is untouched');
  assert.equal(Math.round(pick('lb', theme(true))(174.6) * 10) / 10, 79.2, 'and converts for a metric coach');

  // ⚠ THE INVARIANT, NOT TWO SPELLINGS OF IT. Pinning the two template forms
  // let `unit: bwUnit` — the delta's tr() argument — survive a mutation, and
  // a guard that names the shapes a defect can wear only catches those shapes.
  // `bwUnit` is the DOCUMENT's unit: it may pick a converter and nothing else.
  // Anywhere else it reaches a reader, who has their own preference.
  const bwUnitLines = src.split('\n')
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /\bbwUnit\b/.test(l));
  assert.equal(bwUnitLines.length, 2,
    `bwUnit should appear exactly twice — its declaration and the converter — got:\n${bwUnitLines.map(([n, l]) => `${n}: ${l.trim()}`).join('\n')}`);
  assert.match(bwUnitLines[0][1], /const bwUnit =/, 'the first use is not the declaration');
  assert.match(bwUnitLines[1][1], /kgToDisplay|convWeight/, 'the second use is not the converter selector');

  // ⚠ AND THE DISPLAY SERIES MUST ACTUALLY BE CONVERTED. Replacing the map with
  // a copy left every downstream source assertion true — they name
  // `bwSeriesDisp`, which still exists — so the series has to be pinned to the
  // converter that produces it.
  assert.match(src, /const bwSeriesDisp = bwSeries\.map\(bwToDisplay\)/,
    'the display series is no longer derived from the converter');

  // And the CHART must plot the converted series — a converted delta over an
  // unconverted series would draw kilograms under a pound label.
  assert.match(src, /const vals = bwSeriesDisp\.map\(Number\)/,
    'the chart still reads the unconverted series');
  assert.match(src, /const bwWeeks = bwSeriesDisp\.length/,
    'the week count is taken over a different series than the figures');
});

// ── One system per post: swims, speed, elevation, stride ────────────────────
// ⚠ THE OWNER'S SCREENSHOT, 2026-10-05: a swim read "Masters swim · 1.2 mi" over
// a "2,000 m" plate and a "1:42/100m" pace. The title's km was on the whitelist
// and the plate's metres were not, so one card quoted two systems. These pin
// that every figure on a post lands in the reader's.
import { bsSdUnitizeStat, bsSdElevTraceIn } from '../mobile-app/src/services/sessionLedger.mjs';

const SWIM = { sport: 'swim' };

test('a swim reads in the pool unit of the reader\'s system, title and plate alike', () => {
  // Imperial: yards, and the title says the same distance as the plate.
  assert.equal(bsSdUnitizeText('Masters swim · 2 km', LB, SWIM), 'Masters swim · 2,187 yd');
  assert.equal(bsSdUnitizeStat('Distance', '2,000 m', LB, SWIM), '2,187 yd');
  // Metric: metres, and a kilometre title becomes metres too, so the two match.
  assert.equal(bsSdUnitizeText('Masters swim · 2 km', KG, SWIM), 'Masters swim · 2,000 m');
  assert.equal(bsSdUnitizeStat('Distance', '2,000 m', KG, SWIM), '2,000 m');
  // A swim stored in miles (the importers' format) lands in the pool unit too.
  assert.equal(bsSdUnitizeStat('Distance', '1.24 mi', KG, SWIM), '1,996 m');
  assert.equal(bsSdUnitizeStat('Distance', '2,187 yd', KG, SWIM), '2,000 m');
});

test('a swim pace is per 100 of the pool unit, both ways, and round-trips', () => {
  // 100 yd is 91.44 m, so a pace per 100 yd is 0.9144 of the pace per 100 m.
  assert.equal(bsSdUnitizeText('1:42/100m', LB), '1:33/100yd');
  assert.equal(bsSdUnitizeText('1:33/100yd', KG), '1:42/100m');
  assert.equal(bsSdUnitizeText(bsSdUnitizeText('1:42/100m', LB), KG), '1:42/100m');
  assert.equal(bsSdUnitizeText('1:42/100m', KG), '1:42/100m', 'already metric');
  // The distance rule never reads the 100 of a pace as a distance.
  assert.equal(bsSdUnitizeText('1:42/100m', LB, SWIM), '1:33/100yd');
});

test('⚠ A BARE `m` IS ALSO MINUTES, so it is only ever metres in a swim, and never after an hour', () => {
  for (const prefs of [LB, KG]) {
    assert.equal(bsSdUnitizeStat('Time', '1h 05m', prefs, SWIM), '1h 05m');
    assert.equal(bsSdUnitizeStat('Sleep', '8h 10m', prefs), '8h 10m');
    assert.equal(bsSdUnitizeStat('Time', '34 min', prefs, SWIM), '34 min');
    // Outside a swim, a bare `m` is left alone whatever it means.
    assert.equal(bsSdUnitizeText('Ran 400 m repeats', prefs), 'Ran 400 m repeats');
  }
  // In a swim, a split length is a distance.
  assert.equal(bsSdUnitizeText('500m splits', LB, SWIM), '547 yd splits');
});

test('speed converts with the distance setting, and keeps one decimal', () => {
  assert.equal(bsSdUnitizeStat('Avg speed', '19.3 mph', KG), '31.1 km/h');
  assert.equal(bsSdUnitizeStat('Avg speed', '31.1 km/h', LB), '19.3 mph');
  assert.equal(bsSdUnitizeText('19.3 mph', LB), '19.3 mph');
  // ⚠ The distance rule must not read the "km" of "km/h" as a distance.
  assert.equal(bsSdUnitizeText('31.1 km/h', KG), '31.1 km/h');
});

test('elevation: feet convert in free text, metres only where the label says elevation', () => {
  assert.equal(bsSdUnitizeStat('Elevation', '540 ft', KG), '165 m');
  assert.equal(bsSdUnitizeStat('Elevation', '1,240 ft', KG), '378 m');
  assert.equal(bsSdUnitizeText('+12 ft', KG), '+3.7 m');
  assert.equal(bsSdUnitizeStat('Elev gain', '165 m', LB), '541 ft');
  assert.equal(bsSdUnitizeStat('Elevation', '540 ft', LB), '540 ft', 'already imperial');
  // A metre figure under any other label is not assumed to be a height.
  assert.equal(bsSdUnitizeStat('Pool', '25 m', LB), '25 m');
});

test('a stride converts at the precision it is written in', () => {
  assert.equal(bsSdUnitizeStat('Stride', '1.18 m', LB), '3.9 ft');
  assert.equal(bsSdUnitizeStat('Stride', '3.9 ft', KG), '1.19 m');
  assert.equal(bsSdUnitizeStat('Stride', '1.18 m', KG), '1.18 m');
});

test('the new families are idempotent, so a re-render does not drift', () => {
  const once = (x, p, o) => bsSdUnitizeText(x, p, o);
  for (const [x, p, o] of [['Masters swim · 2 km', LB, SWIM], ['19.3 mph', KG], ['540 ft', KG], ['1:42/100m', LB], ['40 yd sled push', KG]]) {
    assert.equal(once(once(x, p, o), p, o), once(x, p, o), `drifted: ${x}`);
  }
});

test('context that is not an object is ignored, so Array.map(uText) still works', () => {
  // map passes (value, index, array); an index must not read as swim context.
  assert.deepEqual(['2 km', '9:30/mi'].map((x, i) => bsSdUnitizeText(x, LB, i)), ['1.2 mi', '9:30/mi']);
  assert.equal(bsSdUnitizeText('2 km', LB, { sport: 'run' }), '1.2 mi');
});

test('yards outside a swim become metres for a metric reader', () => {
  assert.equal(bsSdUnitizeText('40 yd sled push', KG), '36.6 m sled push');
  assert.equal(bsSdUnitizeText('40 yd sled push', LB), '40 yd sled push');
});

test('the elevation trace follows its figure, and the reader when there is none', () => {
  assert.deepEqual(bsSdElevTraceIn([100, 200], '540 ft'), { trace: [100, 200], unit: 'ft' });
  const m = bsSdElevTraceIn([100, 200], '165 m');
  assert.equal(m.unit, 'm');
  assert.ok(Math.abs(m.trace[0] - 30.48) < 1e-9 && Math.abs(m.trace[1] - 60.96) < 1e-9);
  // No figure: the reader's setting decides, since nothing can disagree.
  assert.equal(bsSdElevTraceIn([100], null, true).unit, 'm');
  assert.equal(bsSdElevTraceIn([100], null, false).unit, 'ft');
  // A figure wins over the setting.
  assert.equal(bsSdElevTraceIn([100], '540 ft', true).unit, 'ft');
});
