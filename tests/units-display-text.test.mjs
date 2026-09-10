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
