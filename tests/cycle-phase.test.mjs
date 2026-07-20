// tests/cycle-phase.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsDeriveCycle, bsCycleRead } from '../public/newdesign/cyclePhase.mjs';

const D = (s) => s; // ISO helper for readability
// 4 starts, perfect 28s: intervals [28,28,28]
const REG = ['2026-07-01', '2026-06-03', '2026-05-06', '2026-04-08'];

test('L: rounded half-up mean of kept intervals, clamped [15,60]; outliers discarded', () => {
  assert.equal(bsDeriveCycle(REG, '2026-07-10').L, 28);
  // intervals [27, 28] → mean 27.5 → round half-up 28
  assert.equal(bsDeriveCycle(['2026-07-01', '2026-06-04', '2026-05-07'], '2026-07-02').L, 28);
  // a 90-day gap is data-entry noise — excluded from L, not averaged in
  const gap = bsDeriveCycle(['2026-07-01', '2026-04-02', '2026-03-05'], '2026-07-02');
  assert.equal(gap.L, 28);
});

test('windows: textbook L=28 → M 1–5 · F 6–11 · O 12–16 · Lu 17–28', () => {
  const c = bsDeriveCycle(REG, '2026-07-10');
  assert.deepEqual(c.windows, { menstrual: [1, 5], follicular: [6, 11], ovulatory: [12, 16], luteal: [17, 28] });
  assert.equal(c.day, 10);
  assert.equal(c.phase, 'follicular');
});

test('short cycles: L=17/16/15 → M 1–5 · Lu 6–L · O and F EMPTY (never fabricated)', () => {
  for (const L of [17, 16, 15]) {
    const starts = []; let d = new Date('2026-07-01');
    for (let i = 0; i < 4; i++) { starts.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() - L * 86400000); }
    const c = bsDeriveCycle(starts, '2026-07-03');
    assert.deepEqual(c.windows.menstrual, [1, 5]);
    assert.deepEqual(c.windows.luteal, [6, L]);
    assert.equal(c.windows.ovulatory, null);
    assert.equal(c.windows.follicular, null);
  }
});

test('confidence ladder: ordered, population stdev, stdev>5 outranks n=2 medium', () => {
  assert.equal(bsDeriveCycle(['2026-07-01'], '2026-07-02').confidence, 'low');            // n=0
  assert.equal(bsDeriveCycle(['2026-07-01', '2026-06-03'], '2026-07-02').confidence, 'low'); // n=1
  // n=2, intervals [18, 38]: stdev 10 > 5 → LOW (not medium) + widened ovulatory
  const wild = bsDeriveCycle(['2026-07-01', '2026-06-13', '2026-05-06'], '2026-07-02');
  assert.equal(wild.confidence, 'low');
  assert.equal(bsDeriveCycle(REG, '2026-07-02').confidence, 'high');                      // n=3, stdev 0
  // n=2, stdev ≤5 → medium: intervals [27, 29]
  assert.equal(bsDeriveCycle(['2026-07-01', '2026-06-04', '2026-05-06'], '2026-07-02').confidence, 'medium');
});

test('late then paused; no starts → phase null', () => {
  // Day arithmetic against REG (last start 2026-07-01, L=28, L+7=35):
  // Jul 30 = day 30 · Aug 4 = day 35 (the last 'late' day) · Aug 5 = day 36.
  assert.equal(bsDeriveCycle(REG, '2026-07-30').phase, 'late');   // L < 30 ≤ L+7
  assert.equal(bsDeriveCycle(REG, '2026-08-04').phase, 'late');   // day 35 == L+7 boundary, still late
  assert.equal(bsDeriveCycle(REG, '2026-08-05').phase, 'paused'); // day 36 > L+7
  const none = bsDeriveCycle([], '2026-07-10');
  assert.equal(none.phase, null);
  const paused = bsDeriveCycle(REG, '2026-09-01');
  assert.equal(paused.predictedStart, null);                      // every prediction field null
});

test('Date inputs normalize to the LOCAL calendar date (no midnight drift)', () => {
  // Logged starts are date-only; `today` as a Date must resolve to the same
  // day number a plain ISO string does, at any wall-clock time — 23:59 local
  // must NOT read as tomorrow (or yesterday) via UTC epoch math.
  const evening = new Date(2026, 6, 10, 23, 59);   // LOCAL Jul 10, 23:59
  const morning = new Date(2026, 6, 10, 0, 1);     // LOCAL Jul 10, 00:01
  assert.equal(bsDeriveCycle(REG, evening).day, bsDeriveCycle(REG, '2026-07-10').day);
  assert.equal(bsDeriveCycle(REG, morning).day, bsDeriveCycle(REG, '2026-07-10').day);
});

test('predictedStart window scales with confidence', () => {
  const c = bsDeriveCycle(REG, '2026-07-10');                           // high → ±1
  assert.deepEqual(c.predictedStart, { from: '2026-07-28', to: '2026-07-30' });
});

test('bsCycleRead: floors → null; powered + material + significant → fires', () => {
  // days: [{date, phase-resolvable via cycle, sleepH, energy, adherence}] —
  // build 2 complete cycles of synthetic days: luteal sleep 6.5h vs follicular 7.6h
  const mk = (n, phase, sleepH) => Array.from({ length: n }, (_, i) => ({ sleepH, phase }));
  const days = [...mk(12, 'follicular', 7.6), ...mk(12, 'luteal', 6.5)];
  const read = bsCycleRead(days, { completeCycles: 2 });
  assert.ok(read);
  assert.equal(read.metric, 'sleep');
  assert.ok(Math.abs(read.gap) >= 0.5);
  assert.equal(bsCycleRead(days, { completeCycles: 1 }), null);          // <2 cycles → null
  assert.equal(bsCycleRead(days.slice(0, 14), { completeCycles: 2 }), null); // <8 days a bucket → null
  const noise = [...mk(12, 'follicular', 7.2), ...mk(12, 'luteal', 7.0)];
  assert.equal(bsCycleRead(noise, { completeCycles: 2 }), null);         // 12 min < 30-min materiality floor
});

// Never-throws on hostile inputs (the nora-sets class, pinned proactively this
// time): Number() and Date.parse() both RAISE on a Symbol — a hostile field in
// caller-shaped data must drop the value, never take the engine down.
test('never throws: Symbols and garbage through every entry point', () => {
  assert.equal(bsDeriveCycle(['2026-07-01'], Symbol('x')).phase, null);
  assert.equal(bsDeriveCycle([Symbol('x'), '2026-07-01'], '2026-07-10').day, 10);
  assert.equal(bsCycleRead([{ phase: 'luteal', sleepH: Symbol('x') }], { completeCycles: 2 }), null);
  assert.equal(bsCycleRead([], { completeCycles: Symbol('x') }), null);
  assert.equal(bsCycleRead(null, { completeCycles: 2 }), null);
  assert.equal(bsCycleRead([{ phase: 42, sleepH: 7 }], { completeCycles: 2 }), null);
});

// A missing observation is ABSENCE, never a zero-value day (Codex P1 — the
// food-search lesson: Number(null) and Number('') are both finite 0). Eight
// null-sleep rows against real values must yield honest null, not a fabricated
// significant gap. Numeric STRINGS (the PostgREST shape) still count as real.
test('null/blank observations never fabricate a read; numeric strings still count', () => {
  const mk = (n, phase, sleepH) => Array.from({ length: n }, () => ({ sleepH, phase }));
  assert.equal(bsCycleRead([...mk(12, 'follicular', 7.6), ...mk(8, 'luteal', null)], { completeCycles: 2 }), null);
  assert.equal(bsCycleRead([...mk(12, 'follicular', 7.6), ...mk(8, 'luteal', '')], { completeCycles: 2 }), null);
  assert.equal(bsCycleRead([...mk(12, 'follicular', 7.6), ...mk(8, 'luteal', undefined)], { completeCycles: 2 }), null);
  const strDays = [...mk(12, 'follicular', '7.6'), ...mk(12, 'luteal', '6.5')];
  const r = bsCycleRead(strDays, { completeCycles: 2 });
  assert.ok(r && r.metric === 'sleep');
});

// 'late' and 'paused' are internal engine states, not physiological phases
// (Codex P2 — doctrine): they must never form a compared bucket or reach copy.
test('late/paused days are excluded from read buckets', () => {
  const mk = (n, phase, sleepH) => Array.from({ length: n }, () => ({ sleepH, phase }));
  assert.equal(bsCycleRead([...mk(12, 'follicular', 7.6), ...mk(12, 'paused', 6.5)], { completeCycles: 2 }), null);
  assert.equal(bsCycleRead([...mk(12, 'follicular', 7.6), ...mk(12, 'late', 6.5)], { completeCycles: 2 }), null);
  const real = [...mk(12, 'follicular', 7.6), ...mk(12, 'luteal', 6.5), ...mk(12, 'paused', 1)];
  const r = bsCycleRead(real, { completeCycles: 2 });
  assert.ok(r && !r.copy.includes('paused') && !/\blate\b/.test(r.copy));
});
