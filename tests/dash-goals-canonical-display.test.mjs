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
const runGoals = (dispUnit, src, goalsRaw) =>
  new Function('dgoDispUnit', 'src', 'goalsRaw', 'dgoKgToDisp', 'dgoLbToKg',
    goalsSrc.replace('const goals =', 'return '))(dispUnit, src, goalsRaw, kgToDisp, LB_TO_KG);

const near = (a, b, label) => assert.ok(Math.abs(Number(a) - Number(b)) <= 0.15, `${label}: ${a} != ${b}`);

test('an Imperial member sees pounds even though the document is canonical kilograms', () => {
  const src = { overall: { unit: 'kg', displayUnit: 'lb', start: 200 * LB_TO_KG, target: 180 * LB_TO_KG, now: 190 * LB_TO_KG } };
  const raw = [{ id: 'overall', metric: 'weight', unit: 'kg', start: src.overall.start, target: src.overall.target, now: src.overall.now, history: [{ on: '2026-09-01', v: 195 * LB_TO_KG }] }];
  const g = runGoals('lb', src, raw)[0];
  assert.equal(g.unit, 'lb', 'the unit label must follow the member');
  // ⚠ THE FIGURES AND THE LABEL MOVE TOGETHER. A label-only conversion prints
  // kilogram-sized numbers under "lb", which is worse than the wrong unit.
  near(g.start, 200, 'start');
  near(g.target, 180, 'target');
  near(g.now, 190, 'now');
  near(g.history[0].v, 195, 'history point');
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
