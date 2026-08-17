// vitalsFromProgress (spec §3A): the vitals leg is built from the SAME cached
// progress response the sleep leg reads. The load-bearing property is the
// absence doctrine — a null/junk value is a DROPPED observation, never a
// fabricated 0 (Number(null) is finite 0: the documented fabrication class) —
// and a hydration target is never defaulted, so the rule structurally cannot
// fire against a target the member never set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vitalsFromProgress, recordFromSelfData, recordFromCoachData } from '../mobile-app/src/services/signalsMap.mjs';

const series = (over) => ({ series: over });
const pts = (...vals) => vals.map((value, i) => ({ date: '2026-08-' + String(10 + i).padStart(2, '0'), value }));

test('a normal week builds every leg with avg-of-last-7 + n', () => {
  const v = vitalsFromProgress(series({
    energy: pts(3, 4, 5, 4, 3, 4, 5),
    hunger: pts(8, 9, 8, 7, 8, 9, 8),
    hydration: pts(1.5, 2, 1, 1.5, 2, 1, 1.5),
    sleepQuality: pts(6, 7, 6, 7, 6, 7, 6),
  }), { hydrationTargetL: 3 });
  assert.ok(v);
  assert.equal(v.energy.n, 7);
  assert.ok(Math.abs(v.energy.avg7 - 4) < 1e-9);
  assert.equal(v.hunger.n, 7);
  assert.equal(v.hydration.n, 7);
  assert.equal(v.hydration.targetL, 3);
  assert.ok(Math.abs(v.hydration.avg7L - 1.5) < 1e-9);
  assert.equal(v.rested.n, 7);
});

test('only the LAST 7 real values feed the average (older days age out)', () => {
  // 9 points: the first two (10, 10) must not contaminate the last-7 average.
  const v = vitalsFromProgress(series({ energy: pts(10, 10, 4, 4, 4, 4, 4, 4, 4) }));
  assert.equal(v.energy.n, 7);
  assert.ok(Math.abs(v.energy.avg7 - 4) < 1e-9);
});

test('a sparse leg (2 logged days) still reports honestly with its small n', () => {
  const v = vitalsFromProgress(series({ energy: pts(3, 4) }));
  assert.equal(v.energy.n, 2);
  assert.ok(Math.abs(v.energy.avg7 - 3.5) < 1e-9);
  assert.equal(v.hunger, undefined);
});

test('null-riddled series: nulls are ABSENCE — dropped from numerator AND denominator, never 0', () => {
  // Number(null) === 0; if nulls leaked in, avg would be (4+4+0+0)/4 = 2 and
  // the ≤4 energy rule would fire on data that does not exist.
  const v = vitalsFromProgress(series({ energy: pts(4, null, 4, null, '', undefined) }));
  assert.equal(v.energy.n, 2);
  assert.ok(Math.abs(v.energy.avg7 - 4) < 1e-9);
});

test('an all-null leg is ABSENT, not a zero-average leg', () => {
  const v = vitalsFromProgress(series({ energy: pts(null, null, null), hunger: pts(8, 8, 8) }));
  assert.equal(v.energy, undefined);
  assert.equal(v.hunger.n, 3);
});

test('no real data anywhere → null (never an empty object that reads as a leg)', () => {
  assert.equal(vitalsFromProgress(series({ energy: pts(null), hydration: [] })), null);
  assert.equal(vitalsFromProgress(series({})), null);
  assert.equal(vitalsFromProgress(null), null);
  assert.equal(vitalsFromProgress({}), null);
});

test('hydration target is NEVER defaulted: absent/junk target → targetL null → rule cannot fire', () => {
  const noTarget = vitalsFromProgress(series({ hydration: pts(1, 1, 1, 1) }));
  assert.equal(noTarget.hydration.targetL, null);
  const junkTarget = vitalsFromProgress(series({ hydration: pts(1, 1, 1, 1) }), { hydrationTargetL: 0 });
  assert.equal(junkTarget.hydration.targetL, null);
  const realTarget = vitalsFromProgress(series({ hydration: pts(1, 1, 1, 1) }), { hydrationTargetL: 3 });
  assert.equal(realTarget.hydration.targetL, 3);
});

test('a zero reading is dropped (indistinguishable from a row another metric created)', () => {
  const v = vitalsFromProgress(series({ hydration: pts(0, 2, 0, 2) }), { hydrationTargetL: 3 });
  assert.equal(v.hydration.n, 2);
  assert.ok(Math.abs(v.hydration.avg7L - 2) < 1e-9);
});

// ── the record builders carry the leg (second-receiver class) ───────────────
test('recordFromSelfData attaches vitals when present and omits it when absent', () => {
  const withV = recordFromSelfData({ uid: 'u1', name: 'Q', vitals: { energy: { avg7: 3, n: 5 } } }, {});
  assert.deepEqual(withV.vitals, { energy: { avg7: 3, n: 5 } });
  const without = recordFromSelfData({ uid: 'u1', name: 'Q' }, {});
  assert.equal(without.vitals, undefined);
});

test('recordFromCoachData attaches vitals when present and omits it when absent', () => {
  const withV = recordFromCoachData({ id: 'c1', name: 'Q', vitals: { hunger: { avg7: 9, n: 4 } } }, {});
  assert.deepEqual(withV.vitals, { hunger: { avg7: 9, n: 4 } });
  const without = recordFromCoachData({ id: 'c1', name: 'Q' }, {});
  assert.equal(without.vitals, undefined);
});
