// The website Goal page: canonical kilograms in storage, the member's own unit
// on screen, and the weigh-in row gated on the goal document actually landing.
//
// Every check DRIVES expressions lifted out of the shipped source rather than
// pinning their spelling, so an equivalent rewrite passes and a real regression
// fails. Found by Codex on `6cc2ebf` (one P1, one P2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SRC = fs.readFileSync(new URL('../public/newdesign/dashGoals.jsx', import.meta.url), 'utf8');

const grab = (re, name) => {
  const m = SRC.match(re);
  assert.ok(m, `could not lift ${name} out of dashGoals.jsx — the test is stale, not the code`);
  return m[0];
};

const LB_TO_KG = Number(grab(/const dgoLbToKg = ([\d.]+);/, 'dgoLbToKg').match(/[\d.]+/)[0]);
const kgToDispSrc = grab(/const dgoKgToDisp = \(v\) => \{[\s\S]*?\n  \};/, 'dgoKgToDisp');
const goalsSrc = grab(/const goals = \(dgoDispUnit[\s\S]*?: goalsRaw;/, 'goals');

const kgToDisp = new Function('dgoLbToKg', kgToDispSrc.replace('const dgoKgToDisp =', 'return '))(LB_TO_KG);

// ⚠ THE HARNESS CARRIES THE REAL HELPERS, LIFTED FROM SOURCE. A harness that is
// missing one does not report "incomplete harness" — it throws from inside the
// expression under test and reads as a failure of the code. Same lesson the
// `_liftToLb` harness in this wave paid for.
const ptFieldsSrc = grab(/const DGO_PT_FIELDS = \[[^\]]*\];/, 'DGO_PT_FIELDS');
const convPtSrc = grab(/const dgoConvPoint = \(h\) => \{[\s\S]*?\n  \};/, 'dgoConvPoint');
const convPoint = new Function('dgoKgToDisp',
  `${ptFieldsSrc}\n${convPtSrc.replace('const dgoConvPoint =', 'return ')}`)(kgToDisp);

const runGoals = (dispUnit, src, goalsRaw) =>
  new Function('dgoDispUnit', 'src', 'goalsRaw', 'dgoKgToDisp', 'dgoLbToKg', 'dgoConvPoint',
    goalsSrc.replace('const goals =', 'return '))(dispUnit, src, goalsRaw, kgToDisp, LB_TO_KG, convPoint);

const near = (a, b, label) => assert.ok(Math.abs(Number(a) - Number(b)) <= 0.15, `${label}: ${a} != ${b}`);

test('an Imperial member sees pounds even though the document is canonical kilograms', () => {
  const src = { overall: { unit: 'kg', displayUnit: 'lb', start: 200 * LB_TO_KG, target: 180 * LB_TO_KG, now: 190 * LB_TO_KG } };
  const raw = [{ id: 'overall', metric: 'weight', unit: 'kg', start: src.overall.start, target: src.overall.target, now: src.overall.now, history: [{ on: '2026-09-01', value: 195 * LB_TO_KG }] }];
  const g = runGoals('lb', src, raw)[0];
  assert.equal(g.unit, 'lb', 'the unit label must follow the member');
  // ⚠ THE FIGURES AND THE LABEL MOVE TOGETHER. A label-only conversion prints
  // kilogram-sized numbers under "lb", which is worse than the wrong unit.
  near(g.start, 200, 'start');
  near(g.target, 180, 'target');
  near(g.now, 190, 'now');
  near(g.history[0].value, 195, 'history point');
});

test('history is converted in the shape goalsFromDoc actually emits', () => {
  // ⚠ THE FIXTURE THAT MADE THIS PASS WHILE BROKEN. `weightSeriesIn` normalises
  // every series to `{ on, value }` and `goalSeries` reads `value` first — so an
  // earlier version of this test using `{ on, v }` tested a shape production never
  // produces, and the conversion of `v` alone converted nothing. Derived from the
  // engine rather than assumed: the field precedence is read out of dashSignals.js.
  const ENGINE = fs.readFileSync(new URL('../public/newdesign/dashSignals.js', import.meta.url), 'utf8');
  assert.match(ENGINE, /pts\.map\(function \(p\) \{ return \{ on: iso\(p\.on\), value: p\.value \}; \}\)/,
    'weightSeriesIn must still normalise to {on, value} — if this changed, the converter below must change with it');

  const src = { overall: { unit: 'kg', displayUnit: 'lb' } };
  for (const field of ['value', 'v', 'weight', 'kg']) {
    const raw = [{ id: 'overall', metric: 'weight', unit: 'kg', target: 81.6466, start: 90.71847, now: 86.18248,
                   history: [{ on: '2026-09-01', [field]: 88.4505 }] }];
    const g = runGoals('lb', src, raw)[0];
    near(g.history[0][field], 195, `history point carried as .${field}`);
  }
});

test('a point carrying two numeric fields leaves no stale kilogram twin', () => {
  const src = { overall: { unit: 'kg', displayUnit: 'lb' } };
  const raw = [{ id: 'overall', metric: 'weight', unit: 'kg', target: 81.6466, start: 90.71847, now: 86.18248,
                 history: [{ on: '2026-09-01', value: 88.4505, kg: 88.4505 }] }];
  const g = runGoals('lb', src, raw)[0];
  near(g.history[0].value, 195, 'value converted');
  near(g.history[0].kg, 195, 'the sibling field must not be left in kilograms');
});

test('the display unit comes from the shared settings store, not only the document', () => {
  // ⚠ `displayUnit` is written by THIS FILE ALONE; four mobile paths stamp
  // `unit: 'kg'` without it, and mobile is the primary app. `client_settings.units`
  // is the store both surfaces share, so it is authoritative and cannot go stale
  // when the member changes their preference.
  const load = grab(/let prefUnit = null;[\s\S]*?\n      \} catch \(e\) \{\}/, 'prefUnit read');
  assert.match(load, /getUserGoals\("client_settings"\)/, 'it must read the shared settings doc');
  assert.match(load, /metric/i, 'and map the stored label to a unit');
  const pick = grab(/const dgoDispUnit = [^\n]*/, 'dgoDispUnit');
  assert.ok(pick.indexOf('prefUnit') < pick.indexOf('displayUnit'),
    'settings must be preferred over the document stamp, which is only a fallback');
});

test('the stored settings label maps to the right unit', () => {
  // ⚠ ASSERTING THAT THE READ EXISTS SAYS NOTHING ABOUT WHICH WAY IT MAPS. A
  // mutation that swapped kg and lb survived the whole suite until this test —
  // it would have shown every Metric member pounds. The expression is EXECUTED
  // against the exact labels the app stores in PREF_OPTIONS.units.
  const expr = grab(/\/metric\/i\.test\(String\(u\)\)[^;]*/, 'unit mapping');
  const mapUnit = new Function('u', `return ${expr};`);
  assert.equal(mapUnit('Metric · kg / km'), 'kg', 'Metric must map to kg');
  assert.equal(mapUnit('Imperial · lb / mi'), 'lb', 'Imperial must map to lb');
  assert.equal(mapUnit('something else'), null, 'an unrecognised label must not guess');
});

test('prefUnit is actually wired into the state the page reads', () => {
  // ⚠ THE READ AND THE CONSUMER CAN BOTH BE CORRECT AND THE FIX STILL INERT if
  // the value never reaches `src`. A mutation dropping it from setSrc survived
  // until this test; the whole conversion silently stopped running.
  const load = grab(/setSrc\(\{[\s\S]*?share: doc\.share !== false,\s*\}\);/, 'setSrc payload');
  assert.match(load, /\bprefUnit\b/, 'the resolved preference must be put into src');
  const consumer = grab(/const dgoDispUnit = [^\n]*/, 'dgoDispUnit');
  assert.match(consumer, /src\.prefUnit/, 'and the consumer must read it off src');
});

test('converted figures are rounded for display, not raw floats', () => {
  // ⚠ `near()` above has a tolerance, so it CANNOT see this: 90.71847 kg becomes
  // 199.99999999999997 lb, which renders as a twenty-character number on a card.
  // A mutation that deleted the rounding survived the whole suite until this test
  // existed. The invariant is the shape of the output, not its magnitude.
  const src = { overall: { unit: 'kg', displayUnit: 'lb' } };
  const raw = [{ id: 'overall', metric: 'weight', unit: 'kg', start: 90.71847, target: 81.6466, now: 86.18248, history: [{ on: '2026-09-01', v: 88.45 }] }];
  const g = runGoals('lb', src, raw)[0];
  const decimals = (v) => { const s = String(v); const i = s.indexOf('.'); return i === -1 ? 0 : s.length - i - 1; };
  for (const [label, v] of [['start', g.start], ['target', g.target], ['now', g.now], ['history', g.history[0].v]]) {
    assert.ok(Number.isFinite(v), `${label} must be a number, got ${v}`);
    assert.ok(decimals(v) <= 1, `${label} must be rounded to at most 1 decimal for display, got ${v}`);
  }
});

test('a metric member is not converted', () => {
  const src = { overall: { unit: 'kg', displayUnit: 'kg', start: 90, target: 82, now: 86 } };
  const raw = [{ id: 'overall', metric: 'weight', unit: 'kg', start: 90, target: 82, now: 86, history: [] }];
  const g = runGoals('kg', src, raw)[0];
  assert.equal(g.unit, 'kg');
  assert.equal(g.target, 82);
});

test('a legacy pound document is not double-converted', () => {
  // The document has not been canonicalised yet, so its figures are ALREADY
  // pounds. Converting again would render 180 lb as 397.
  const src = { overall: { unit: 'lb', displayUnit: 'lb', start: 200, target: 180, now: 190 } };
  const raw = [{ id: 'overall', metric: 'weight', unit: 'lb', start: 200, target: 180, now: 190, history: [] }];
  const g = runGoals('lb', src, raw)[0];
  assert.equal(g.target, 180);
  assert.equal(g.start, 200);
});

test('a non-weight goal keeps its own unit — only body weight is canonicalised', () => {
  const src = { overall: { unit: 'kg', displayUnit: 'lb' } };
  const raw = [{ id: 'sq', metric: 'strength', unit: 'kg', target: 115, start: 90, now: 100, history: [] }];
  const g = runGoals('lb', src, raw)[0];
  assert.equal(g.unit, 'kg');
  assert.equal(g.target, 115);
});

test('the document keeps the member display unit when it is canonicalised', () => {
  const line = grab(/const dispUnit = [^\n]*/, 'dispUnit');
  assert.match(line, /displayUnit/, 'an existing displayUnit must be preferred');
  assert.match(line, /wasLb/, 'a first canonicalisation must derive it from the document it replaces');
  const doc = grab(/const nextDoc = \{ \.\.\.doc, overall:[^\n]*/, 'nextDoc');
  assert.match(doc, /unit: "kg"/, 'storage stays canonical');
  assert.match(doc, /displayUnit: dispUnit/, 'and the member unit rides beside it');
});

test('the weigh-in row is gated on the goal document actually landing', () => {
  // ⚠ THE INVARIANT, NOT ITS SPELLING: persistDoc must be AWAITED and its result
  // consulted before the client_weigh_ins upsert. A bare call establishes call
  // order, not completion order — which is the whole defect.
  const fn = grab(/const logWeighIn = async[\s\S]*?\n  \};/, 'logWeighIn');
  const awaitAt = fn.indexOf('await persistDoc(');
  const upsertAt = fn.indexOf('client_weigh_ins');
  assert.ok(awaitAt !== -1, 'persistDoc must be awaited');
  assert.ok(upsertAt !== -1, 'the weigh-in upsert must still be there');
  assert.ok(awaitAt < upsertAt, 'the awaited goal write must precede the weigh-in row');
  const gateAt = fn.search(/if \(saved && saved\.ok === false\) return;/);
  assert.ok(gateAt !== -1 && gateAt < upsertAt, 'a failed goal write must skip the weigh-in row');
});

test('persistDoc reports whether the write landed', () => {
  const fn = grab(/const persistDoc = async[\s\S]*?\n  \};/, 'persistDoc');
  assert.match(fn, /return \{ ok: !failed \}/, 'a real save must report its outcome');
  assert.ok(/return \{ ok: true \}/.test(fn), 'the signed-out sample path must not block the local flow');
});

test('dgoLbToKg is module scope, above the converter that reads it', () => {
  // A `const` read before its initializer is a ReferenceError, and there is no
  // error boundary in public/newdesign — it renders as a blank page.
  const declAt = SRC.indexOf('const dgoLbToKg =');
  const useAt = SRC.indexOf('const dgoKgToDisp =');
  assert.ok(declAt !== -1 && useAt !== -1);
  assert.ok(declAt < useAt, 'the constant must be initialised before the converter that closes over it');
  assert.ok(!/^\s+const dgoLbToKg =/m.test(SRC), 'it must not be re-declared inside a component');
});
