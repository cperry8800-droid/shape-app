// Next-load suggestion for the live session: autoregulate off the last session
// by RPE, sanity-bound against the athlete's e1RM, with %-of-e1RM + repeat
// fallbacks. Pure; consumed by BSSession. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestNextLoad, AUTOREG_RPE, BUMP_PCT, E1RM_CEILING } from '../mobile-app/src/services/suggestNextLoad.mjs';

const lift = (over = {}) => ({ currentE1rm: 140, unit: 'kg', series: [{ load: 100, reps: 5, rpe: 7 }], ...over });

test('autoreg: easy last set (rpe <= 8) bumps a gym step at the authored reps', () => {
  const s = suggestNextLoad(lift(), { reps: '5', l: '100' });
  assert.equal(s.basis, 'autoreg');
  assert.equal(s.reps, 5);
  assert.equal(s.load, 102.5); // 100 * 1.025 = 102.5 → kg step 2.5
  assert.equal(s.deltaFromLast, 2.5);
  assert.equal(s.unit, 'kg');
});

test('autoreg: grindy last set (rpe > 8) holds the load', () => {
  const s = suggestNextLoad(lift({ series: [{ load: 100, reps: 5, rpe: 9.5 }] }), { reps: '5', l: '100' });
  assert.equal(s.basis, 'autoreg');
  assert.equal(s.load, 100);
  assert.equal(s.deltaFromLast, 0);
});

test('autoreg: blank RPE bumps only when the authored reps were hit', () => {
  const hit = suggestNextLoad(lift({ series: [{ load: 100, reps: 5, rpe: null }] }), { reps: '5', l: '100' });
  assert.equal(hit.load, 102.5); // hit 5 reps → bump
  const missed = suggestNextLoad(lift({ series: [{ load: 100, reps: 3, rpe: null }] }), { reps: '5', l: '100' });
  assert.equal(missed.load, 100); // only logged 3 of 5 → hold
});

test('sanity bound: floors the cap so the suggestion never exceeds 1.05x the e1RM', () => {
  // The capped load (after floor-to-step) must keep epley(load, reps) <= e1*1.05.
  const s = suggestNextLoad({ currentE1rm: 100, unit: 'kg', series: [{ load: 100, reps: 5, rpe: 6 }] }, { reps: '5', l: '100' });
  assert.ok(s.load > 0);
  assert.ok(s.load * (1 + 5 / 30) <= 100 * E1RM_CEILING + 1e-9);
  // Codex regression: e1RM 141 × 5 → raw cap 126.9 must FLOOR to 125 (not round up to
  // 127.5, whose epley 148.75 > 141*1.05 = 148.05).
  const s2 = suggestNextLoad({ currentE1rm: 141, unit: 'kg', series: [{ load: 130, reps: 5, rpe: 6 }] }, { reps: '5', l: '130' });
  assert.equal(s2.load, 125);
  assert.ok(s2.load * (1 + 5 / 30) <= 141 * E1RM_CEILING + 1e-9);
});

test('range reps target the TOP of the range', () => {
  const s = suggestNextLoad(lift(), { reps: '6-8', l: '100' });
  assert.equal(s.reps, 8);
});

test('%-of-e1RM fallback when an e1RM exists but the last load is unusable', () => {
  const s = suggestNextLoad({ currentE1rm: 150, unit: 'kg', series: [{ load: 0, reps: 5, rpe: 7 }] }, { reps: '5', l: '' });
  assert.equal(s.basis, 'e1rm');
  // 150 * 30/35 = 128.57 → 2.5 step → 130 or 127.5 (nearest)
  assert.equal(s.load, 127.5);
});

test('repeat fallback: no e1RM, no usable history, but an authored load', () => {
  const s = suggestNextLoad(null, { reps: '5', l: '60' });
  assert.equal(s.basis, 'repeat');
  assert.equal(s.load, 60);
});

test('null when there is nothing numeric to suggest', () => {
  assert.equal(suggestNextLoad(null, { reps: '5', l: '' }), null);
  assert.equal(suggestNextLoad(null, {}), null);
});

test('lb gym step is 5', () => {
  // currentE1rm 216 is consistent with 185x5 (epley ~216), so the bump to 190
  // stays under the 1.05x ceiling (226.8) and is NOT clamped.
  const s = suggestNextLoad(lift({ unit: 'lb', currentE1rm: 216, series: [{ load: 185, reps: 5, rpe: 7 }] }), { reps: '5', l: '185' });
  // 185 * 1.025 = 189.625 → nearest 5 = 190
  assert.equal(s.load, 190);
  assert.equal(s.unit, 'lb');
});
