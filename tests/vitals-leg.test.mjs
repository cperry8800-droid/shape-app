// Case-file DAILY vitals derivation (spec §3B) — per-metric honesty vectors.
//
// Two classes under test:
//
// 1. FABRICATION. `Number(null)` and `Number('')` are both finite 0, so a naive
//    Number() coercion FABRICATES a 0/10 reading for a client who never logged
//    the metric. bsVitalsLeg must drop absence (null/undefined/''/junk), accept
//    numeric strings (PostgREST numeric-as-string), and keep real zeros.
//
// 2. THE LABEL'S CLAIM. The cell is rendered "DAILY ENERGY · 7D", so the window
//    must be seven CALENDAR days — not the last seven populated rows out of the
//    route's 30-row fetch. For a sparse logger those are wildly different: one
//    energy entry from three weeks ago would otherwise be served as the current
//    7-day average, a figure contradicting its own label.
//
// Every case pins `now` so the cutoff is deterministic; a bare `new Date()`
// would make these tests rot the moment the fixtures aged out of the window.

import test from 'node:test';
import assert from 'node:assert/strict';
import { bsVitalsLeg, bsVitals, vitalsCutoffISO, vitalsCeilingISO, VITALS_WINDOW_DAYS } from '../src/lib/vitals-leg.mjs';

const row = (date, cols) => ({ snapshot_date: date, ...cols });
// Pin "today" to a UTC noon so the cutoff never straddles a boundary by clock.
const at = (day) => ({ now: new Date(`${day}T12:00:00Z`) });

test('hydration-only client yields EXACTLY the hydration leg — no fabricated 0/10 gauges', () => {
  const rows = [
    row('2026-08-10', { energy: null, hunger: null, hydration_l: 2.0 }),
    row('2026-08-11', { energy: null, hunger: null, hydration_l: 3.0 }),
  ];
  const v = bsVitals(rows, at('2026-08-11'));
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
  assert.equal(bsVitalsLeg(rows, 'energy', at('2026-08-15')), null, 'no real value ⇒ null leg');
  assert.equal(bsVitals(rows, at('2026-08-15')), null, 'no metric anywhere ⇒ vitals is null');
});

test('numeric strings pass (PostgREST numeric-as-string) and a real 0 is kept', () => {
  const leg = bsVitalsLeg(
    [row('2026-08-10', { energy: '3.5' }), row('2026-08-11', { energy: 0 })],
    'energy',
    at('2026-08-11')
  );
  assert.ok(leg);
  assert.equal(leg.n, 2, 'string 3.5 and real 0 both count');
  assert.equal(leg.avg7, 1.8, '(3.5 + 0) / 2 rounded to 1 decimal');
  assert.deepEqual(leg.series7.map((p) => p.value), [3.5, 0]);
});

test('the window is seven CALENDAR days, per metric — older rows are excluded', () => {
  // 10 chronological days of energy; hunger logged on only 3 of them.
  const rows = [];
  for (let i = 1; i <= 10; i += 1) {
    rows.push(row(`2026-08-${String(i).padStart(2, '0')}`, {
      energy: i, // 1..10
      hunger: i >= 8 ? 5 : null, // only days 8, 9, 10
    }));
  }
  // now = the 10th ⇒ cutoff = the 4th, so days 1-3 fall outside the window.
  const energy = bsVitalsLeg(rows, 'energy', at('2026-08-10'));
  assert.equal(energy.n, 7, 'seven in-window days');
  assert.equal(energy.avg7, 7, 'mean of 4..10 — days 1-3 are outside the window');
  assert.deepEqual(energy.series7.map((p) => p.value), [4, 5, 6, 7, 8, 9, 10]);
  assert.equal(energy.series7[0].date, '2026-08-04', 'first in-window day is today − 6');

  const hunger = bsVitalsLeg(rows, 'hunger', at('2026-08-10'));
  assert.equal(hunger.n, 3, 'a sparse metric reports only ITS OWN in-window days');
  assert.equal(hunger.avg7, 5);
});

test('a stale reading does NOT become the current 7D average (the sparse-logger case)', () => {
  // The exact shape the route can hand over: a 30-row fetch whose only energy
  // entry is three weeks old. "DAILY ENERGY · 7D" must not report it.
  const rows = [
    row('2026-07-20', { energy: 9 }),
    row('2026-08-14', { hunger: 4 }), // in window, but a DIFFERENT metric
  ];
  assert.equal(bsVitalsLeg(rows, 'energy', at('2026-08-16')), null, 'stale energy ⇒ no leg at all');
  const v = bsVitals(rows, at('2026-08-16'));
  assert.deepEqual(Object.keys(v), ['hunger'], 'the stale metric contributes NO cell');
  assert.equal(v.hunger.avg7, 4);
});

test('window boundary is inclusive at today − 6 and excludes the day before it', () => {
  const rows = [
    row('2026-08-09', { energy: 2 }), // today − 7 → out
    row('2026-08-10', { energy: 8 }), // today − 6 → in
  ];
  const leg = bsVitalsLeg(rows, 'energy', at('2026-08-16'));
  assert.equal(leg.n, 1, 'only the boundary day survives');
  assert.equal(leg.avg7, 8, 'the day-7 reading neither counts nor drags the mean');
  assert.equal(leg.series7[0].date, '2026-08-10');
});

test('a row that cannot prove its recency is dropped, never assumed current', () => {
  const rows = [
    row('2026-08-14', { energy: 6 }),
    { energy: 10 }, // no snapshot_date at all
    row(20260814, { energy: 10 }), // non-string date
    row('', { energy: 10 }),
  ];
  const leg = bsVitalsLeg(rows, 'energy', at('2026-08-16'));
  assert.equal(leg.n, 1, 'only the dated row counts');
  assert.equal(leg.avg7, 6, 'undated rows do not inflate the average');
});

test('gap days are skipped, not padded: the window spans unlogged days', () => {
  const rows = [
    row('2026-08-01', { energy: 8 }),
    row('2026-08-02', { energy: null }), // unlogged day sits INSIDE the range
    row('2026-08-03', { energy: 6 }),
  ];
  const leg = bsVitalsLeg(rows, 'energy', at('2026-08-03'));
  assert.equal(leg.n, 2);
  assert.equal(leg.avg7, 7, '(8+6)/2 — the null day neither counts nor zeros');
});

test('rounding is 1 decimal, matching the sleep leg', () => {
  const leg = bsVitalsLeg(
    [row('2026-08-10', { energy: 7 }), row('2026-08-11', { energy: 6 }), row('2026-08-12', { energy: 6 })],
    'energy',
    at('2026-08-12')
  );
  assert.equal(leg.avg7, 6.3, '19/3 = 6.333… → 6.3');
});

test('hostile shapes: non-array rows, junk rows, bad key ⇒ null, never a throw', () => {
  assert.equal(bsVitalsLeg(null, 'energy'), null);
  assert.equal(bsVitalsLeg(undefined, 'energy'), null);
  assert.equal(bsVitalsLeg('rows', 'energy'), null);
  assert.equal(bsVitalsLeg([], 'energy'), null);
  assert.equal(bsVitalsLeg([null, 42, 'x'], 'energy'), null);
  assert.equal(bsVitalsLeg([row('2026-08-10', { energy: 5 })], '', at('2026-08-10')), null);
  assert.equal(bsVitals(null), null);
  assert.equal(bsVitals([]), null);
});

test('hydration reports avg7L (liters key), not avg7', () => {
  const v = bsVitals([row('2026-08-10', { hydration_l: '2.75' })], at('2026-08-10'));
  assert.equal(v.hydration.avg7L, 2.8, 'string liters accepted, rounded to 1 decimal');
  assert.equal('avg7' in v.hydration, false, 'hydration leg uses the spec key avg7L');
  assert.equal(v.hydration.n, 1);
});

test('a FUTURE-dated snapshot is refused, not served forever as the current 7D', () => {
  // `/api/client/checkin` takes the day from the request, so a row can carry a
  // date years ahead. A floor-only window would clear it on every future run.
  const rows = [
    row('2099-01-01', { energy: 10 }),
    row('2026-08-14', { energy: 4 }),
  ];
  const leg = bsVitalsLeg(rows, 'energy', at('2026-08-16'));
  assert.equal(leg.n, 1, 'only the real day counts');
  assert.equal(leg.avg7, 4, 'the future row neither counts nor lifts the mean');
  const only = bsVitalsLeg([row('2099-01-01', { energy: 10 })], 'energy', at('2026-08-16'));
  assert.equal(only, null, 'a future-only client has no leg at all');
});

test('the ceiling tolerates a member one day ahead of UTC, and nothing beyond', () => {
  const inWindow = bsVitalsLeg([row('2026-08-17', { energy: 6 })], 'energy', at('2026-08-16'));
  assert.equal(inWindow.n, 1, 'tomorrow-in-UTC is a real local day for someone');
  const beyond = bsVitalsLeg([row('2026-08-18', { energy: 6 })], 'energy', at('2026-08-16'));
  assert.equal(beyond, null, 'two days ahead is not a timezone artifact');
  assert.equal(vitalsCeilingISO(new Date('2026-08-16T12:00:00Z')), '2026-08-17');
  assert.equal(vitalsCeilingISO(new Date('2026-12-31T12:00:00Z')), '2027-01-01', 'rolls the year');
});

test('vitalsCutoffISO spans month and year boundaries by real date maths', () => {
  // Naive `day - 6` string maths would produce '2026-03-(-3)'; Date.UTC rolls.
  assert.equal(vitalsCutoffISO(new Date('2026-03-03T12:00:00Z')), '2026-02-25');
  assert.equal(vitalsCutoffISO(new Date('2026-01-03T12:00:00Z')), '2025-12-28');
  // A leap-year February, where the roll-back crosses the 29th.
  assert.equal(vitalsCutoffISO(new Date('2028-03-02T12:00:00Z')), '2028-02-25');
  assert.equal(VITALS_WINDOW_DAYS, 7, 'the label says 7D; the constant must agree');
});

test('an unusable `now` degrades to the real clock rather than throwing', () => {
  assert.doesNotThrow(() => vitalsCutoffISO(new Date('nonsense')));
  assert.doesNotThrow(() => vitalsCutoffISO('2026-08-16'));
  assert.match(vitalsCutoffISO(new Date('nonsense')), /^\d{4}-\d{2}-\d{2}$/);
});
