// Case-file DAILY vitals derivation (spec §3B) — per-metric honesty vectors.
//
// The class under test: `Number(null)` and `Number('')` are both finite 0, so
// a naive Number() coercion FABRICATES a 0/10 reading for a client who never
// logged the metric. bsVitalsLeg must drop absence (null/undefined/''/junk),
// accept numeric strings (PostgREST numeric-as-string), keep real zeros, and
// window on the 7 most recent snapshot DAYS that carry a real value for THAT
// metric — per metric, never shared across metrics.

import test from 'node:test';
import assert from 'node:assert/strict';
import { bsVitalsLeg, bsVitals } from '../src/lib/vitals-leg.mjs';

const row = (date, cols) => ({ snapshot_date: date, ...cols });

test('hydration-only client yields EXACTLY the hydration leg — no fabricated 0/10 gauges', () => {
  const rows = [
    row('2026-08-10', { energy: null, hunger: null, hydration_l: 2.0 }),
    row('2026-08-11', { energy: null, hunger: null, hydration_l: 3.0 }),
  ];
  const v = bsVitals(rows);
  assert.ok(v, 'vitals leg exists');
  assert.deepEqual(Object.keys(v), ['hydration'], 'only hydration is present');
  assert.equal(v.hydration.avg7L, 2.5);
  assert.equal(v.hydration.n, 2);
  assert.equal('energy' in v, false, 'energy absent, not 0');
  assert.equal('hunger' in v, false, 'hunger absent, not 0');
});

test('null, undefined, empty-string and junk are ABSENCE — never coerced to 0', () => {
  const rows = [
    row('2026-08-10', { energy: null }),
    row('2026-08-11', {}), // column undefined
    row('2026-08-12', { energy: '' }), // Number('') === 0 — the fabrication class
    row('2026-08-13', { energy: 'abc' }),
    row('2026-08-14', { energy: NaN }),
    row('2026-08-15', { energy: 'Infinity' }),
  ];
  assert.equal(bsVitalsLeg(rows, 'energy'), null, 'no real value ⇒ null leg');
  assert.equal(bsVitals(rows), null, 'no metric anywhere ⇒ vitals is null');
});

test('numeric strings pass (PostgREST numeric-as-string) and a real 0 is kept', () => {
  const leg = bsVitalsLeg(
    [row('2026-08-10', { energy: '3.5' }), row('2026-08-11', { energy: 0 })],
    'energy'
  );
  assert.ok(leg);
  assert.equal(leg.n, 2, 'string 3.5 and real 0 both count');
  assert.equal(leg.avg7, 1.8, '(3.5 + 0) / 2 rounded to 1 decimal');
  assert.deepEqual(leg.series7.map((p) => p.value), [3.5, 0]);
});

test('7-day window = the 7 most recent logged DAYS for the metric, per metric', () => {
  // 10 chronological days of energy; hunger logged on only 3 of them.
  const rows = [];
  for (let i = 1; i <= 10; i += 1) {
    rows.push(row(`2026-08-${String(i).padStart(2, '0')}`, {
      energy: i, // 1..10
      hunger: i >= 8 ? 5 : null, // only days 8, 9, 10
    }));
  }
  const energy = bsVitalsLeg(rows, 'energy');
  assert.equal(energy.n, 7, 'window is capped at 7 logged days');
  assert.equal(energy.avg7, 7, 'mean of 4..10, the LAST seven — not the first');
  assert.deepEqual(energy.series7.map((p) => p.value), [4, 5, 6, 7, 8, 9, 10]);
  assert.equal(energy.series7[0].date, '2026-08-04');

  const hunger = bsVitalsLeg(rows, 'hunger');
  assert.equal(hunger.n, 3, 'sparse metric windows on ITS OWN logged days');
  assert.equal(hunger.avg7, 5);
});

test('gap days are skipped, not padded: 7-window reaches past unlogged days', () => {
  const rows = [
    row('2026-08-01', { energy: 8 }),
    row('2026-08-02', { energy: null }), // unlogged day sits INSIDE the range
    row('2026-08-03', { energy: 6 }),
  ];
  const leg = bsVitalsLeg(rows, 'energy');
  assert.equal(leg.n, 2);
  assert.equal(leg.avg7, 7, '(8+6)/2 — the null day neither counts nor zeros');
});

test('rounding is 1 decimal, matching the sleep leg', () => {
  const leg = bsVitalsLeg(
    [row('2026-08-10', { energy: 7 }), row('2026-08-11', { energy: 6 }), row('2026-08-12', { energy: 6 })],
    'energy'
  );
  assert.equal(leg.avg7, 6.3, '19/3 = 6.333… → 6.3');
});

test('hostile shapes: non-array rows, junk rows, bad key ⇒ null, never a throw', () => {
  assert.equal(bsVitalsLeg(null, 'energy'), null);
  assert.equal(bsVitalsLeg(undefined, 'energy'), null);
  assert.equal(bsVitalsLeg('rows', 'energy'), null);
  assert.equal(bsVitalsLeg([], 'energy'), null);
  assert.equal(bsVitalsLeg([null, 42, 'x'], 'energy'), null);
  assert.equal(bsVitalsLeg([row('2026-08-10', { energy: 5 })], ''), null);
  assert.equal(bsVitals(null), null);
  assert.equal(bsVitals([]), null);
});

test('hydration reports avg7L (liters key), not avg7', () => {
  const v = bsVitals([row('2026-08-10', { hydration_l: '2.75' })]);
  assert.equal(v.hydration.avg7L, 2.8, 'string liters accepted, rounded to 1 decimal');
  assert.equal('avg7' in v.hydration, false, 'hydration leg uses the spec key avg7L');
  assert.equal(v.hydration.n, 1);
});
