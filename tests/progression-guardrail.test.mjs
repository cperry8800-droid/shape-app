// Progression guardrails — the pure core (Deploy 2a).
//
// Every test names the fixture row it pins. The fixture table
// (SPEC-guardrails-2a-fixtures.md) is FROZEN and is the specification: if a test
// here fails, the implementation is wrong, not the fixture.
//
// Auto-discovered by `npm test` (`node --test "tests/**/*.test.mjs"`).
//
// Landed so far:
//   Section 2  bsInterpolateAnchors + the three anchor tables  (F1-F16)
//   Section 3  load derivation - eligible / rated / session AU (F17-F29)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bsInterpolateAnchors,
  bsClassifySession,
  bsWeekLoad,
  BS_RAMP_ANCHORS,
  BS_RED_ANCHORS,
  BS_RETURN_ANCHORS,
  BS_SESSION_MINUTES_CEILING,
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

// ── Section 3. Load derivation ───────────────────────────────────────────────

// The fixture table's notation: S(min, rpe) is a session, S(min, rpe, C) is
// duration-confirmed.
const S = (min, rpe, confirmed = false) => ({
  durationSec: min * 60,
  sessionRpe: rpe,
  durationConfirmed: confirmed,
});

test('F17 — an ordinary session contributes rpe x minutes', () => {
  const c = bsClassifySession(S(60, 7));
  assert.equal(c.malformed, false);
  assert.equal(c.eligible, true);
  assert.equal(c.rated, true);
  near(c.au, 420, 'F17 S(60, 7)');
});

test('F18 — a zero-duration session is EXCLUDED, never 0 AU', () => {
  const c = bsClassifySession(S(0, 7));
  assert.equal(c.malformed, false, 'F18 zero duration is absent, not a caller bug');
  assert.equal(c.eligible, false, 'F18 not eligible');
  assert.equal(c.rated, false);
  assert.equal(c.au, null, 'F18 must read null, never 0');
});

test('F19 — an unrated session is eligible but contributes no AU', () => {
  const c = bsClassifySession(S(60, null));
  assert.equal(c.malformed, false);
  assert.equal(c.eligible, true, 'F19 it still happened, so it counts in the denominator');
  assert.equal(c.rated, false);
  assert.equal(c.au, null);
});

test('F20 — RPE 0 is ABSENT, not zero effort', () => {
  // The single most dangerous coercion in this module. 0 x 60 = 0 AU would
  // enter the week as a real, very light session, deflate the baseline, and
  // loosen every future ceiling.
  const c = bsClassifySession(S(60, 0));
  assert.equal(c.malformed, false, 'F20 the DB CHECK permits 0, so it is not a bug');
  assert.equal(c.eligible, true);
  assert.equal(c.rated, false, 'F20 not rated');
  assert.equal(c.au, null, 'F20 must read null, NOT 0');

  // And prove it at the week level, which is where the damage would land.
  const week = bsWeekLoad([S(60, 7), S(60, 0)]);
  near(week.loadAu, 420, 'F20 the RPE-0 session adds nothing to the week');
});

test('F21 — RPE 0 does not count toward the measured share', () => {
  const week = bsWeekLoad([S(60, 7), S(45, 8), S(50, 6), S(60, 0)]);
  assert.equal(week.eligible, 4, 'F21 eligible 4');
  assert.equal(week.rated, 3, 'F21 rated 3');
  assert.equal(week.measured, true, 'F21 3 > 4/2 -> measured');
});

test('F22 — an UNCONFIRMED wall-clock overrun is excluded', () => {
  // The timer runs whether or not anyone is training. Its word alone is not a
  // measurement, and a forgotten timer would inflate the baseline.
  const c = bsClassifySession(S(175, 7));
  assert.equal(c.malformed, false, 'F22 absent, not malformed');
  assert.equal(c.eligible, false);
  assert.equal(c.rated, false);
  assert.equal(c.au, null);
});

test('F23 — a CONFIRMED overrun counts: the member asserted it', () => {
  const c = bsClassifySession(S(175, 7, true));
  assert.equal(c.eligible, true);
  assert.equal(c.rated, true);
  near(c.au, 1225, 'F23 S(175, 7, C)');
});

test('F24-F25 — the overrun boundary is strictly greater than the ceiling', () => {
  assert.equal(BS_SESSION_MINUTES_CEILING, 150, 'the ceiling is 150 minutes');
  const at = bsClassifySession(S(150, 7));
  assert.equal(at.eligible, true, 'F24 exactly 150 minutes is still eligible');
  near(at.au, 1050, 'F24 S(150, 7)');
  const over = bsClassifySession(S(151, 7));
  assert.equal(over.eligible, false, 'F25 one minute over is excluded');
  assert.equal(over.au, null);
});

test('F26 — confirmation is irrelevant below the ceiling', () => {
  near(bsClassifySession(S(60, 7, false)).au, 420, 'F26 unconfirmed');
  near(bsClassifySession(S(60, 7, true)).au, 420, 'F26 confirmed');
});

test('F27 — an excluded overrun is NOT an "unrated" session', () => {
  // It must leave the denominator entirely. It is not a session we failed to
  // rate; it is a session we have no trustworthy length for. Counting it as
  // eligible-but-unrated would push the week below the measured threshold.
  const week = bsWeekLoad([S(175, 7), S(60, 7)]);
  assert.equal(week.eligible, 1, 'F27 eligible 1');
  assert.equal(week.rated, 1, 'F27 rated 1');
  assert.equal(week.measured, true, 'F27 measured');
  near(week.loadAu, 420, 'F27 loadAu 420');
});

test('F28 — a negative or non-finite duration is MALFORMED, not absent', () => {
  for (const bad of [-1800, NaN, null, undefined, '3600', {}, Infinity]) {
    const c = bsClassifySession({ durationSec: bad, sessionRpe: 7 }, 3);
    assert.equal(c.malformed, true, `F28 durationSec = ${String(bad)} must be malformed`);
    assert.equal(c.eligible, false);
    assert.equal(c.au, null);
    assert.deepEqual(
      c.issues.map((i) => ({ index: i.index, field: i.field })),
      [{ index: 3, field: 'durationSec' }],
      'F28 the offending row is named by index and field',
    );
  }
});

test('F29 — an out-of-range RPE is MALFORMED: never clamped, never dropped', () => {
  for (const bad of [11, -2, 100, NaN, '7', Infinity]) {
    const c = bsClassifySession({ durationSec: 3600, sessionRpe: bad }, 5);
    assert.equal(c.malformed, true, `F29 sessionRpe = ${String(bad)} must be malformed`);
    assert.equal(c.au, null, 'F29 never clamped into a usable value');
    assert.deepEqual(
      c.issues.map((i) => ({ index: i.index, field: i.field })),
      [{ index: 5, field: 'sessionRpe' }],
      'F29 the offending row is named',
    );
  }
});

test('F29 — an in-range fractional RPE is rated; a sub-1 one is malformed', () => {
  // Resolving a gap the table leaves open between F20 (0 -> absent) and F29
  // (11 / -2 -> malformed). 7.5 is storable AND producible, so it rates. 0.5 is
  // storable but the prompt cannot produce it, so it can only come from a
  // client-side defect and rule C says report it. Documented in the module.
  near(bsClassifySession(S(60, 7.5)).au, 450, 'F29 RPE 7.5 rates');
  assert.equal(bsClassifySession(S(60, 0.5)).malformed, true, 'F29 RPE 0.5 is a defect');
  assert.equal(bsClassifySession(S(60, 1)).rated, true, 'F29 RPE 1 is the floor of the scale');
  assert.equal(bsClassifySession(S(60, 10)).rated, true, 'F29 RPE 10 is the ceiling');
});

test('F30-F34 — measured is STRICTLY more than half (the rule lands here)', () => {
  // These are Section 4 rows, tested now because `measured` is implemented in
  // bsWeekLoad. A week split exactly down the middle does NOT qualify: a
  // baseline built from half-guesses is not a measurement.
  const week = (eligibleCount, ratedCount) =>
    bsWeekLoad([
      ...Array.from({ length: ratedCount }, () => S(60, 7)),
      ...Array.from({ length: eligibleCount - ratedCount }, () => S(60, null)),
    ]);
  assert.equal(week(4, 3).measured, true, 'F30 4 eligible, 3 rated');
  assert.equal(week(4, 2).measured, false, 'F31 4 eligible, exactly 2 rated -> NOT measured');
  assert.equal(week(3, 2).measured, true, 'F32 3 eligible, 2 rated');
  assert.equal(week(2, 1).measured, false, 'F33 2 eligible, 1 rated -> 1 is not more than 1');
  assert.equal(week(1, 1).measured, true, 'F34 1 eligible, 1 rated');
});

test('an empty week is not measured, and reads 0 AU without fabricating one', () => {
  const week = bsWeekLoad([]);
  assert.deepEqual(week, { eligible: 0, rated: 0, loadAu: 0, measured: false, malformed: [] });
});

test('rule C — malformed rows are collected and NEVER throw', () => {
  const week = bsWeekLoad([
    S(60, 7),
    { durationSec: -30, sessionRpe: 7 },
    { durationSec: 3600, sessionRpe: 11 },
    S(45, 8),
  ]);
  // The good sessions still derive — the report names what is broken rather
  // than discarding everything.
  assert.equal(week.eligible, 2);
  assert.equal(week.rated, 2);
  assert.equal(week.malformed.length, 2, 'both offending rows reported');
  assert.deepEqual(
    week.malformed.map((m) => ({ index: m.index, field: m.field, value: m.value })),
    [
      { index: 1, field: 'durationSec', value: '-30' },
      { index: 2, field: 'sessionRpe', value: '11' },
    ],
    'rule C names each offending row by index, field and value',
  );
});

test('rule C — garbage rows are malformed, and a Symbol does not crash the report', () => {
  // `${Symbol()}` throws a TypeError, so a naive report builder would crash on
  // exactly the input the reporting path exists to survive.
  for (const junk of [null, undefined, 'session', 42, [], true]) {
    const c = bsClassifySession(junk, 0);
    assert.equal(c.malformed, true, `garbage row ${String(junk)} must be malformed`);
  }
  assert.doesNotThrow(() => bsWeekLoad([{ durationSec: Symbol('x'), sessionRpe: 7 }]));
  const week = bsWeekLoad([{ durationSec: 3600, sessionRpe: Symbol('rpe') }]);
  assert.equal(week.malformed.length, 1);
  assert.equal(typeof week.malformed[0].value, 'string', 'the value is described, never interpolated');
});

test('rule C — a non-array session collection is reported, not thrown', () => {
  for (const bad of [null, undefined, 'sessions', 42, {}]) {
    const week = bsWeekLoad(bad);
    assert.equal(week.measured, false);
    assert.equal(week.loadAu, 0);
    assert.equal(week.malformed.length, 1, `sessions = ${String(bad)} is reported`);
    assert.equal(week.malformed[0].field, 'sessions');
  }
});

test('a missing durationConfirmed reads as UNCONFIRMED, not as a defect', () => {
  // Excluding is the safe direction: it can only understate a baseline, and an
  // understated baseline tightens future ceilings rather than loosening them.
  const c = bsClassifySession({ durationSec: 175 * 60, sessionRpe: 7 });
  assert.equal(c.malformed, false, 'an absent flag is not a caller bug');
  assert.equal(c.eligible, false, 'and it does not count as confirmed');
});

test('input is not mutated by derivation', () => {
  const sessions = [S(60, 7), S(0, 7), { durationSec: -30, sessionRpe: 7 }];
  const before = JSON.parse(JSON.stringify(sessions));
  bsWeekLoad(sessions);
  assert.deepEqual(sessions, before, 'history rows must survive derivation untouched');
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
