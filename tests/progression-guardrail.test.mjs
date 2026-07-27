// Progression guardrails — the pure core (Deploy 2a).
//
// Every test names the fixture row it pins. The fixture table
// (SPEC-guardrails-2a-fixtures.md) is FROZEN and is the specification: if a test
// here fails, the implementation is wrong, not the fixture.
//
// Auto-discovered by `npm test` (`node --test "tests/**/*.test.mjs"`).
//
// Landed so far:
//   §2  bsInterpolateAnchors + the three anchor tables   (F1-F16)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bsInterpolateAnchors,
  BS_RAMP_ANCHORS,
  BS_RED_ANCHORS,
  BS_RETURN_ANCHORS,
} from '../public/newdesign/progressionGuardrail.mjs';

// The core NEVER rounds — display rounds, comparisons stay unrounded (F98) — so
// a value like 40 + 0.1 * -18 lands at 38.199999999999996. Compare with a
// tolerance far tighter than any threshold this feeds.
const EPS = 1e-9;
function near(actual, expected, label) {
  assert.equal(
    typeof actual,
    'number',
    `${label}: expected a number, got ${String(actual)}`,
  );
  assert.ok(
    Math.abs(actual - expected) < EPS,
    `${label}: expected ~${expected}, got ${actual}`,
  );
}

const ramp = (x) => bsInterpolateAnchors(BS_RAMP_ANCHORS, x);
const red = (x) => bsInterpolateAnchors(BS_RED_ANCHORS, x);
const ret = (x) => bsInterpolateAnchors(BS_RETURN_ANCHORS, x);

// ── §2. Interpolation utility ────────────────────────────────────────────────

test('F1-F4 — the ramp curve reads its own anchors exactly', () => {
  near(ramp(500), 40, 'F1 ramp @ 500');
  near(ramp(1500), 22, 'F2 ramp @ 1500');
  near(ramp(3000), 13, 'F3 ramp @ 3000');
  near(ramp(5000), 9, 'F4 ramp @ 5000');
});

test('F5-F7 — the ramp curve interpolates linearly between anchors', () => {
  // Each of these is the exact midpoint of its span, so the expected value is
  // the mean of the two bracketing anchors — the cheapest possible check that
  // the interpolation is linear and not, say, stepped to the nearest anchor.
  near(ramp(1000), 31, 'F5 ramp @ 1000 (midpoint of 500-1500)');
  near(ramp(2250), 17.5, 'F6 ramp @ 2250 (midpoint of 1500-3000)');
  near(ramp(4000), 11, 'F7 ramp @ 4000 (midpoint of 3000-5000)');
});

test('F8-F9 — the curve is CLAMPED beyond its ends, never extrapolated', () => {
  // Extrapolating below the first anchor would hand a near-zero baseline a
  // ceiling above 40%; above the last it eventually goes negative. Both are
  // outside the curve's own domain.
  near(ramp(400), 40, 'F8 ramp @ 400 (below the first anchor)');
  near(ramp(0), 40, 'F8 ramp @ 0 (far below)');
  near(ramp(6000), 9, 'F9 ramp @ 6000 (above the last anchor)');
  near(ramp(50000), 9, 'F9 ramp @ 50000 (far above)');
});

test('F10 — the three reference athletes read their spec values', () => {
  near(ramp(600), 38.2, 'F10 ramp @ 600 (beginner)');
  near(ramp(1680), 20.92, 'F10 ramp @ 1680 (intermediate)');
  near(ramp(3375), 12.25, 'F10 ramp @ 3375 (advanced)');
});

test('F11-F12 — the red curve reads its anchors and interpolates', () => {
  near(red(500), 75, 'F11 red @ 500');
  near(red(1500), 45, 'F11 red @ 1500');
  near(red(3000), 30, 'F11 red @ 3000');
  near(red(5000), 22, 'F11 red @ 5000');
  near(red(1000), 60, 'F12 red @ 1000');
  near(red(2250), 37.5, 'F12 red @ 2250');
  near(red(4000), 26, 'F12 red @ 4000');
});

test('red sits above amber across the whole curve, by a widening margin', () => {
  // Not a numbered fixture — a property that must hold for the two curves to
  // mean anything. If red ever dipped below amber, a week could be red without
  // being amber and the state resolution in §7 would be incoherent.
  for (const x of [0, 400, 500, 600, 1000, 1500, 1680, 2250, 3000, 3375, 4000, 5000, 9000]) {
    assert.ok(red(x) > ramp(x), `red must exceed amber at ${x} AU`);
  }
  assert.ok(
    red(5000) / ramp(5000) > red(500) / ramp(500),
    'the red-over-amber margin must widen with load (~1.88x at 500 -> ~2.44x at 5000)',
  );
});

test('F13-F14 — the return curve reads its anchors and interpolates', () => {
  near(ret(14), 70, 'F13 return @ 14 days');
  near(ret(28), 55, 'F13 return @ 28 days');
  near(ret(56), 40, 'F13 return @ 56 days');
  near(ret(21), 62.5, 'F14 return @ 21 days');
  near(ret(42), 47.5, 'F14 return @ 42 days');
});

test('F117 — the return band is FLAT from 56 days to the horizon', () => {
  // 56 is the last anchor; 57-83 hold flat at 40%. Defined, not undefined. The
  // >=84 case is a REGIME handoff to cold_start, decided by the caller, so it
  // is deliberately not expressible in this table.
  near(ret(56), 40, 'F117 return @ 56 days');
  near(ret(70), 40, 'F117 return @ 70 days (F62)');
  near(ret(83), 40, 'F117 return @ 83 days (the last day before the handoff)');
});

test('F15 — anchor ORDER does not matter', () => {
  const shuffled = [
    { at: 3000, pct: 13 },
    { at: 500, pct: 40 },
    { at: 5000, pct: 9 },
    { at: 1500, pct: 22 },
  ];
  for (const x of [0, 400, 500, 600, 1000, 1500, 1680, 2250, 3000, 3375, 4000, 5000, 6000]) {
    near(
      bsInterpolateAnchors(shuffled, x),
      ramp(x),
      `F15 shuffled anchors @ ${x}`,
    );
  }
});

test('F15 — reading a table does not mutate it', () => {
  // The anchor tables are shared module state. An in-place sort inside the
  // reader would silently reorder a caller's config.
  const before = BS_RAMP_ANCHORS.map((a) => ({ ...a }));
  bsInterpolateAnchors(BS_RAMP_ANCHORS, 1680);
  assert.deepEqual(BS_RAMP_ANCHORS, before, 'F15 the anchor table must be untouched');
});

test('F16 — non-finite x returns null and never throws', () => {
  for (const bad of [NaN, null, 'x', undefined, Infinity, -Infinity, '', '1500', {}, [], true]) {
    assert.equal(
      bsInterpolateAnchors(BS_RAMP_ANCHORS, bad),
      null,
      `F16 x = ${String(bad)} must read null`,
    );
  }
  // Symbol is called out separately: `Number(Symbol())` THROWS rather than
  // returning NaN, so a coercion-first implementation would break the
  // never-throws contract on this input specifically.
  assert.doesNotThrow(() => bsInterpolateAnchors(BS_RAMP_ANCHORS, Symbol('x')));
  assert.equal(bsInterpolateAnchors(BS_RAMP_ANCHORS, Symbol('x')), null, 'F16 x = Symbol');
});

test('F16 — a malformed anchor table returns null and never throws', () => {
  for (const bad of [null, undefined, 'anchors', {}, 42, []]) {
    assert.equal(
      bsInterpolateAnchors(bad, 1500),
      null,
      `F16 anchors = ${String(bad)} must read null`,
    );
  }
  // Junk ENTRIES are dropped rather than poisoning the whole read: the good
  // anchors still describe a curve, and returning null for the whole table
  // would lose a ceiling we can legitimately compute.
  const withJunk = [
    { at: 500, pct: 40 },
    null,
    { at: 'x', pct: 22 },
    { at: 1500, pct: NaN },
    { at: 1500, pct: 22 },
    { at: 3000, pct: 13 },
    { at: 5000, pct: 9 },
  ];
  near(bsInterpolateAnchors(withJunk, 1680), 20.92, 'F16 junk entries are dropped');
  // Every entry junk = no curve at all.
  assert.equal(bsInterpolateAnchors([null, { at: 'x' }], 1500), null, 'F16 no usable anchors');
});

test('a single anchor reads flat everywhere', () => {
  // Degenerate but reachable if a retune ever collapses a table. Both clamps
  // fire, so there is no span to divide by.
  const one = [{ at: 1500, pct: 22 }];
  near(bsInterpolateAnchors(one, 0), 22, 'single anchor, below');
  near(bsInterpolateAnchors(one, 1500), 22, 'single anchor, at');
  near(bsInterpolateAnchors(one, 9000), 22, 'single anchor, above');
});

test('duplicate anchors at one x do not divide by zero', () => {
  // No slope to interpolate across. Must read a real percentage, never
  // Infinity or NaN, which would read downstream as a ceiling.
  const dupes = [
    { at: 500, pct: 40 },
    { at: 1500, pct: 22 },
    { at: 1500, pct: 20 },
    { at: 3000, pct: 13 },
  ];
  const v = bsInterpolateAnchors(dupes, 1500);
  assert.ok(Number.isFinite(v), `duplicate anchors must read finite, got ${v}`);
  for (const x of [600, 1000, 1500, 2000, 2999]) {
    assert.ok(
      Number.isFinite(bsInterpolateAnchors(dupes, x)),
      `duplicate anchors must read finite at ${x}`,
    );
  }
});
