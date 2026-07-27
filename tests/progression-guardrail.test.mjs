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
//   Section 3  load derivation - eligible / rated / session AU (F17-F29,
//              plus the ordered rating rule F130-F133)
//   Section 4a week bucketing - client-local Monday weeks (F41, F42, F112,
//              F119-F128)
//   Section 4b the baseline - bounded trailing window, median, 500 AU floor
//              (F35-F41, F99-F104, F106-F109, F113-F116, F129)
//   Section 5  the proposed week + the cold-start ceilings and axes
//              (F43-F50, F69-F71, F85-F87, F89, F105, F115)
//   Section 6  the measured regime - the ramp curve at the client's baseline
//              (F52-F57)
//   Section 7  the return regime + regime resolution - the gap, the return
//              cap, the 84-day handoff (F58-F67, F82, F101, F117)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bsInterpolateAnchors,
  bsClassifySession,
  bsWeekLoad,
  bsLocalWeek,
  bsBucketWeeks,
  bsMedian,
  bsBaseline,
  bsIsUsableBaseline,
  BS_RAMP_ANCHORS,
  BS_RED_ANCHORS,
  BS_RETURN_ANCHORS,
  BS_SESSION_MINUTES_CEILING,
  BS_BASELINE_FLOOR_AU,
  BS_WINDOW_MAX_WEEKS,
  BS_WINDOW_MIN_WEEKS,
  bsProposedWeek,
  bsColdStartAxes,
  BS_COLD_START_WEEKLY_AMBER_PER_SESSION,
  BS_COLD_START_WEEKLY_RED_PER_SESSION,
  BS_PEAK_AMBER_AU,
  BS_PEAK_RED_AU,
  BS_SHARE_OF_WEEK_AMBER_PCT,
  bsMeasuredCeilings,
  bsMeasuredVolumeAxis,
  bsMeasuredAxes,
  bsHistoryGap,
  bsReturnFraction,
  bsReturnCeilings,
  bsReturnVolumeAxis,
  bsReturnAxes,
  bsResolveRegime,
  BS_GAP_SESSION_FLOOR_AU,
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
// duration-confirmed. Section 3's rows are written as S(min, rpe), but a real
// history row always carries the instant it happened at — Section 4a validates
// that — so the helpers supply a valid one.
const AT = '2026-07-29T17:00:00Z'; // Wednesday afternoon in New York
const TZ = 'America/New_York';
const S = (min, rpe, confirmed = false) => ({
  startedAtISO: AT,
  timezone: TZ,
  durationSec: min * 60,
  sessionRpe: rpe,
  durationConfirmed: confirmed,
});
/** A complete valid row with one field overridden, so each test has one defect. */
const row = (over = {}) => ({
  startedAtISO: AT,
  timezone: TZ,
  durationSec: 3600,
  sessionRpe: 7,
  ...over,
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
    const c = bsClassifySession(row({ durationSec: bad }), 3);
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
  // Integers outside [1, 10] — step 3 of the rating rule. NaN and Infinity are
  // caught one step earlier by the integer test. A numeric STRING is NOT in
  // this list: since F133 it parses, so `'7'` is a valid rating.
  for (const bad of [11, -2, 100, NaN, Infinity, '11', '-2']) {
    const c = bsClassifySession(row({ sessionRpe: bad }), 5);
    assert.equal(c.malformed, true, `F29 sessionRpe = ${String(bad)} must be malformed`);
    assert.equal(c.au, null, 'F29 never clamped into a usable value');
    assert.deepEqual(
      c.issues.map((i) => ({ index: i.index, field: i.field })),
      [{ index: 5, field: 'sessionRpe' }],
      'F29 the offending row is named',
    );
  }
});

test('F130-F132 — a NON-INTEGER rating is malformed across the whole range', () => {
  // Storable is not producible. numeric(3,1) holds one decimal place across the
  // entire range, so 7.5 is exactly as impossible from a whole-number 1-10
  // prompt as 0.5 is. Ruling a mid-range fraction valid while a sub-1 fraction
  // is malformed would be worse than either reading alone: it would compute a
  // load from a value we know the app never wrote.
  for (const bad of [0.5, 7.5, 10.5, 6.5, 1.1, 9.99, -0.5]) {
    const c = bsClassifySession(S(60, bad));
    assert.equal(c.malformed, true, `rpe ${bad} must be malformed`);
    assert.equal(c.rated, false);
    assert.equal(c.au, null, `rpe ${bad} must not compute a load`);
    assert.equal(c.issues[0].field, 'sessionRpe');
  }
});

test('the rating rule runs in order: step 1 (absent) before step 2 (integer)', () => {
  // Exactly 0 is ABSENT in any wire form, and must never reach the integer
  // test. Every whole number 1-10 rates.
  for (const zero of [0, -0, '0', '0.0', '0.00']) {
    const c = bsClassifySession(row({ sessionRpe: zero }));
    assert.equal(c.malformed, false, `rpe ${String(zero)} is absent, not a defect`);
    assert.equal(c.rated, false);
    assert.equal(c.au, null, 'and never 0 AU');
  }
  for (let n = 1; n <= 10; n += 1) {
    const c = bsClassifySession(S(60, n));
    assert.equal(c.rated, true, `rpe ${n} rates`);
    near(c.au, n * 60, `rpe ${n} load`);
  }
});

test('F133 — a valid rating arriving as a STRING parses before the integer test', () => {
  // session_rpe is `numeric`, and PostgREST returns numeric as TEXT to preserve
  // precision, so a stored 7 crosses the wire as "7.0". Testing the integer
  // rule before parsing would mark every valid rating in production malformed.
  const c = bsClassifySession(S(60, '7.0'));
  assert.equal(c.malformed, false, 'F133 "7.0" is a valid rating');
  assert.equal(c.rated, true);
  near(c.au, 420, 'F133 S(60, "7.0") -> 420 AU');
  // Other real wire forms of the same value.
  for (const s of ['7', ' 7 ', '7.00', '07']) {
    near(bsClassifySession(S(60, s)).au, 420, `F133 ${JSON.stringify(s)} -> 420 AU`);
  }
  // A string fraction is still malformed — parsing does not relax the rule.
  assert.equal(bsClassifySession(S(60, '7.5')).malformed, true, 'F133 "7.5" is still a defect');
});

test('F133 — the three coercions that fabricate a rating are all malformed', () => {
  // Under a naive Number(): '' -> 0 (would read as "absent"), true -> 1 (a
  // perfectly valid-looking rating), Symbol() -> THROWS. None may pass.
  for (const bad of ['', '   ', true, false, 'seven', [], {}, [7]]) {
    const c = bsClassifySession(row({ sessionRpe: bad }));
    assert.equal(c.malformed, true, `rpe ${JSON.stringify(bad)} must be malformed`);
    assert.equal(c.au, null);
  }
  assert.doesNotThrow(() => bsClassifySession(row({ sessionRpe: Symbol('r') })));
  assert.equal(
    bsClassifySession(row({ sessionRpe: Symbol('r') })).malformed,
    true,
    'a Symbol rating is malformed, and does not throw on the way there',
  );
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
  assert.deepEqual(week, {
    eligible: 0, rated: 0, loadAu: 0, measured: false, realSessions: 0, malformed: [],
  });
});

test('rule C — malformed rows are collected and NEVER throw', () => {
  const week = bsWeekLoad([
    S(60, 7),
    row({ durationSec: -30 }),
    row({ sessionRpe: 11 }),
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
  assert.doesNotThrow(() => bsWeekLoad([row({ durationSec: Symbol('x') })]));
  const week = bsWeekLoad([row({ sessionRpe: Symbol('rpe') })]);
  assert.equal(week.malformed.length, 1);
  assert.equal(week.malformed[0].field, 'sessionRpe');
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
  const c = bsClassifySession(row({ durationSec: 175 * 60 }));
  assert.equal(c.malformed, false, 'an absent flag is not a caller bug');
  assert.equal(c.eligible, false, 'and it does not count as confirmed');
});

test('input is not mutated by derivation', () => {
  const sessions = [S(60, 7), S(0, 7), row({ durationSec: -30 })];
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

// ── Section 4a. Week bucketing — the client's own calendar ───────────────────

const weekOf = (at, tz) => (bsLocalWeek(at, tz) || {}).weekStartISO ?? null;
const localOf = (at, tz) => (bsLocalWeek(at, tz) || {}).localDateISO ?? null;

test('F119-F120 — the SAME instant buckets to different weeks in different zones', () => {
  // The whole reason the conversion lives in the core. Read in New York this is
  // Sunday evening and belongs to the week the client trained it in; read as
  // UTC it is Monday and lands in the next week, shifting load between two
  // baselines.
  const instant = '2026-08-03T02:40:00Z';
  assert.equal(localOf(instant, 'America/New_York'), '2026-08-02', 'F119 local Sun 22:40 EDT');
  assert.equal(weekOf(instant, 'America/New_York'), '2026-07-27', 'F119 week of Mon 07-27');
  assert.equal(localOf(instant, 'UTC'), '2026-08-03', 'F120 the same instant is Monday in UTC');
  assert.equal(weekOf(instant, 'UTC'), '2026-08-03', 'F120 week of Mon 08-03');
  assert.notEqual(
    weekOf(instant, 'America/New_York'),
    weekOf(instant, 'UTC'),
    'F119 and F120 must differ — that is the whole point',
  );
});

test('F121-F122 — the local Monday boundary is exact', () => {
  // Monday 00:00 EDT is 04:00Z; Sunday 23:59 EDT is 03:59Z the next day.
  assert.equal(weekOf('2026-08-03T04:00:00Z', 'America/New_York'), '2026-08-03',
    'F121 local Monday 00:00 starts its own week');
  assert.equal(weekOf('2026-08-03T03:59:00Z', 'America/New_York'), '2026-07-27',
    'F122 local Sunday 23:59 is the last day of the PREVIOUS week');
});

test('F123 — a spring-forward week still contains exactly 7 local days', () => {
  // US DST begins 02:00 local on 2026-03-08, making that local day 23 hours.
  // The week Mon 03-02 .. Sun 03-08 must still hold 7 days, with no session
  // lost, double-counted, or shifted across a boundary. Doing the day
  // arithmetic on the instant instead of on the local calendar date is what
  // breaks here.
  const noon = [
    '2026-03-02T17:00:00Z', '2026-03-03T17:00:00Z', '2026-03-04T17:00:00Z',
    '2026-03-05T17:00:00Z', '2026-03-06T17:00:00Z', '2026-03-07T17:00:00Z', // EST
    '2026-03-08T16:00:00Z',                                                 // EDT
  ];
  const weeks = new Set(noon.map((t) => weekOf(t, 'America/New_York')));
  const days = new Set(noon.map((t) => localOf(t, 'America/New_York')));
  assert.deepEqual([...weeks], ['2026-03-02'], 'F123 all seven days share one week');
  assert.equal(days.size, 7, 'F123 exactly 7 distinct local days');
  assert.equal(weekOf('2026-03-09T16:00:00Z', 'America/New_York'), '2026-03-09',
    'F123 the next Monday opens the next week');
});

test('F126 — a fall-back week is 25 hours long and still holds exactly 7 days', () => {
  // US DST ends 02:00 local on 2026-11-01, so local 01:30 happens TWICE. Going
  // instant -> local is unambiguous in that direction, so both readings resolve
  // deterministically to the same local date and the same bucket.
  const firstOneThirty = '2026-11-01T05:30:00Z';  // 01:30 EDT
  const secondOneThirty = '2026-11-01T06:30:00Z'; // 01:30 EST, the repeat
  for (const t of [firstOneThirty, secondOneThirty]) {
    assert.equal(localOf(t, 'America/New_York'), '2026-11-01', 'F126 both readings are 11-01');
    assert.equal(weekOf(t, 'America/New_York'), '2026-10-26', 'F126 both bucket to Mon 10-26');
  }
  const noon = [
    '2026-10-26T16:00:00Z', '2026-10-27T16:00:00Z', '2026-10-28T16:00:00Z',
    '2026-10-29T16:00:00Z', '2026-10-30T16:00:00Z', '2026-10-31T16:00:00Z', // EDT
    '2026-11-01T17:00:00Z',                                                 // EST
  ];
  assert.deepEqual([...new Set(noon.map((t) => weekOf(t, 'America/New_York')))], ['2026-10-26']);
  assert.equal(new Set(noon.map((t) => localOf(t, 'America/New_York'))).size, 7,
    'F126 neither repeated hour creates an eighth day nor drops one');
});

test('F124 — a positive offset advances the date rather than retreating it', () => {
  assert.equal(localOf('2026-08-03T21:00:00Z', 'Asia/Tokyo'), '2026-08-04', 'F124 local Tue 06:00');
  assert.equal(weekOf('2026-08-03T21:00:00Z', 'Asia/Tokyo'), '2026-08-03', 'F124 week of Mon 08-03');
});

test('F127 — a half-hour offset is honoured, not truncated to whole hours', () => {
  // The instant sits inside (18:30Z, 19:00Z) precisely so the two readings
  // diverge. At +05:30 it is Monday; truncated to +05:00 it is Sunday, a week
  // earlier. Asia/Karachi is a real +05:00 zone, so this compares like for like.
  const instant = '2026-08-02T18:45:00Z';
  assert.equal(localOf(instant, 'Asia/Kolkata'), '2026-08-03', 'F127 +05:30 -> Mon 00:15');
  assert.equal(weekOf(instant, 'Asia/Kolkata'), '2026-08-03', 'F127 week of Mon 08-03');
  assert.equal(localOf(instant, 'Asia/Karachi'), '2026-08-02', 'F127 +05:00 -> Sun 23:45');
  assert.equal(weekOf(instant, 'Asia/Karachi'), '2026-07-27',
    'F127 a whole-hour read lands a week earlier');
});

test('F125 — an unknown or unusable zone is MALFORMED, never bucketed in UTC', () => {
  // Silently falling back to UTC would fabricate a week boundary the client
  // never experienced. Falling back to the RUNTIME zone would be worse still —
  // the answer would depend on which machine evaluated it.
  for (const tz of ['Mars/Olympus', 'Not/AZone', '', '   ', null, undefined, 123, {}, true]) {
    assert.equal(bsLocalWeek('2026-08-03T02:40:00Z', tz), null,
      `F125 zone ${String(tz)} is unusable`);
    const c = bsClassifySession(row({ timezone: tz }), 2);
    assert.equal(c.malformed, true, `F125 zone ${String(tz)} makes the row malformed`);
    assert.equal(c.weekStartISO, null);
    assert.ok(c.issues.some((i) => i.field === 'timezone'), 'F125 the timezone field is named');
  }
  assert.doesNotThrow(() => bsLocalWeek('2026-08-03T02:40:00Z', Symbol('tz')));
});

test('F112 — a missing or unparseable instant is MALFORMED', () => {
  for (const at of [undefined, null, '', 'yesterday', 42, {}, '2026-13-45T00:00:00Z']) {
    const c = bsClassifySession(row({ startedAtISO: at }), 4);
    assert.equal(c.malformed, true, `F112 startedAtISO ${String(at)} is malformed`);
    assert.equal(c.weekStartISO, null);
    assert.ok(c.issues.some((i) => i.field === 'startedAtISO'), 'F112 the field is named');
  }
  assert.doesNotThrow(() => bsClassifySession(row({ startedAtISO: Symbol('t') })));
});

test('an instant with NO offset is rejected, because it is machine-dependent', () => {
  // `Date.parse('2026-08-03T02:40:00')` is interpreted in the RUNTIME's zone by
  // spec, so the same history would bucket differently on two machines — which
  // would break the determinism the whole module rests on. `timestamptz` always
  // serialises with an offset, so nothing legitimate is refused.
  assert.equal(bsLocalWeek('2026-08-03T02:40:00', 'UTC'), null, 'no designator');
  assert.equal(bsLocalWeek('2026-08-03', 'UTC'), null, 'a bare date is not an instant');
  for (const at of ['2026-08-03T02:40:00Z', '2026-08-03T02:40:00+00:00', '2026-08-02T22:40:00-04:00']) {
    assert.equal(weekOf(at, 'America/New_York'), '2026-07-27', `${at} is accepted`);
  }
});

test('F42 — two sessions on the same date both count; a date is not a key', () => {
  const { weeks, malformed } = bsBucketWeeks([S(60, 7), S(45, 8)]);
  assert.deepEqual(malformed, []);
  assert.equal(weeks.length, 1, 'F42 one week');
  assert.equal(weeks[0].sessions, 2, 'F42 both sessions are kept');
  assert.equal(weeks[0].eligible, 2);
  assert.equal(weeks[0].rated, 2);
  near(weeks[0].loadAu, 420 + 360, 'F42 both loads sum');
});

test('F41 — the order sessions arrive in cannot change the answer', () => {
  const at = (iso) => ({ ...S(60, 7), startedAtISO: iso });
  const inOrder = [
    at('2026-07-15T17:00:00Z'), at('2026-07-22T17:00:00Z'), at('2026-07-29T17:00:00Z'),
  ];
  const shuffled = [inOrder[2], inOrder[0], inOrder[1]];
  assert.deepEqual(bsBucketWeeks(shuffled).weeks, bsBucketWeeks(inOrder).weeks,
    'F41 identical result');
  assert.deepEqual(
    bsBucketWeeks(shuffled).weeks.map((w) => w.weekStartISO),
    ['2026-07-13', '2026-07-20', '2026-07-27'],
    'F41 weeks come back in chronological order regardless of input order',
  );
});

test('F128 — changing the client zone re-buckets ALL history, retroactively', () => {
  // Accepted known property, not a bug: there is no per-session stored zone, so
  // a client who moves country sees old weeks re-bucket and a baseline can move
  // without any new training. Recorded so it is not later "fixed".
  const instants = ['2026-08-03T02:40:00Z', '2026-07-30T17:00:00Z'];
  const under = (tz) =>
    bsBucketWeeks(instants.map((i) => ({ ...S(60, 7), startedAtISO: i, timezone: tz })));
  const ny = under('America/New_York');
  const utc = under('UTC');
  assert.deepEqual(ny.weeks.map((w) => w.weekStartISO), ['2026-07-27'],
    'F128 in New York both sessions share one week');
  assert.deepEqual(utc.weeks.map((w) => w.weekStartISO), ['2026-07-27', '2026-08-03'],
    'F128 under UTC the same two sessions split across two weeks');
  assert.notDeepEqual(ny.weeks, utc.weeks, 'F128 weekly totals shift with the current zone');
});

test('bucketing keeps rule C: malformed rows are named, the rest still bucket', () => {
  const { weeks, malformed } = bsBucketWeeks([
    S(60, 7),
    row({ timezone: 'Mars/Olympus' }),
    row({ startedAtISO: 'nope' }),
    S(45, 8),
  ]);
  assert.equal(weeks.length, 1, 'the good rows still form a week');
  assert.equal(weeks[0].sessions, 2);
  assert.deepEqual(
    malformed.map((m) => ({ index: m.index, field: m.field })),
    [{ index: 1, field: 'timezone' }, { index: 2, field: 'startedAtISO' }],
    'each offending row is named by index and field',
  );
  assert.equal(bsBucketWeeks(null).weeks.length, 0, 'a non-array collection is reported, not thrown');
  assert.equal(bsBucketWeeks(null).malformed[0].field, 'sessions');
});

test('a row with several defects reports ALL of them, not just the first', () => {
  const c = bsClassifySession(
    { startedAtISO: 'nope', timezone: 'Mars/Olympus', durationSec: -30, sessionRpe: 11 },
    7,
  );
  assert.equal(c.malformed, true);
  assert.deepEqual(
    c.issues.map((i) => i.field),
    ['startedAtISO', 'timezone', 'durationSec', 'sessionRpe'],
    'one fix at a time would otherwise reveal one defect per round',
  );
  assert.ok(c.issues.every((i) => i.index === 7), 'every issue names the same row');
});

test('a week with no sessions is ABSENT, not present with zeroes', () => {
  // An absent week is not a week of zero training. Section 4b must not read a
  // holiday as a real, very light week and drag the baseline down with it.
  const { weeks } = bsBucketWeeks([
    { ...S(60, 7), startedAtISO: '2026-07-15T17:00:00Z' },
    { ...S(60, 7), startedAtISO: '2026-07-29T17:00:00Z' }, // the week between is empty
  ]);
  assert.deepEqual(weeks.map((w) => w.weekStartISO), ['2026-07-13', '2026-07-27'],
    'the empty week in between does not appear');
});

// ── §4b. The baseline — the bounded trailing window ──────────────────────────
//
// History here is built on bare local dates in UTC: the zone conversion is
// already pinned by the §4a rows, so these fixtures keep the calendar plain and
// exercise the WINDOW instead. Every session in a week is dated on that week's
// Monday — F42 already proved several sessions on one date all count, so
// spreading them across days would add arithmetic without adding coverage.

const TODAY = '2026-08-05';          // a Wednesday
const M0 = '2026-08-03';             // the week being lived — never complete
const M1 = '2026-07-27';
const M2 = '2026-07-20';
const M3 = '2026-07-13';
const M4 = '2026-07-06';
const M5 = '2026-06-29';
const M6 = '2026-06-22';
const M7 = '2026-06-15';
const M8 = '2026-06-08';
const M11 = '2026-05-18';            // 79 days back — the last week IN reach
const M12 = '2026-05-11';            // 86 days back — the first week OUT of reach
const M14 = '2026-04-27';            // 100 days back

const on = (dateISO, min, rpe, confirmed = false) => ({
  startedAtISO: `${dateISO}T12:00:00Z`,
  timezone: 'UTC',
  durationSec: Math.round(min * 60),
  sessionRpe: rpe,
  durationConfirmed: confirmed,
});

// A week totalling exactly `au`, split over equal sessions at RPE 10 — so
// minutes are simply AU/10. The split is sized so no session exceeds the
// 150-minute ceiling (1500 AU at RPE 10): an unconfirmed overrun is EXCLUDED
// by F22, so a naive two-way split of a heavy week would silently produce an
// empty week rather than a heavy one.
const wk = (monday, au, count = Math.max(2, Math.ceil(au / 1500))) =>
  Array.from({ length: count }, () => on(monday, au / count / 10, 10));

// A week that logs sessions but does NOT qualify: 2 eligible, 1 rated, which
// fails `rated > eligible / 2` by F33.
const unmeasuredWeek = (monday) => [on(monday, 60, 7), on(monday, 60, null)];

test('F36-F39 — the baseline is the MEDIAN of the qualifying weeks', () => {
  const mondays = [M4, M3, M2, M1];
  const base = (loads) => bsBaseline(
    loads.flatMap((au, i) => wk(mondays[mondays.length - loads.length + i], au)),
    TODAY,
  );

  near(base([1500, 2000, 2500]).au, 2000, 'F36 three weeks 1500/2000/2500');
  // A median, not a mean: the mean of F37 is ~1533 and the mean of F38 is ~3367.
  near(base([400, 2000, 2200]).au, 2000, 'F37 one very light week must not drag it down');
  near(base([2000, 2100, 6000]).au, 2100, 'F38 one huge week must not inflate it');
  near(base([1000, 2000, 2400, 3000]).au, 2200, 'F39 four weeks -> mean of the middle PAIR');
});

test('F35 / F108 — three qualifying weeks is the handoff boundary', () => {
  const two = bsBaseline([...wk(M2, 2000), ...wk(M1, 2000)], TODAY);
  assert.equal(two.au, null, 'F35 two measured weeks cannot form a baseline');
  assert.equal(two.basis, 'none');
  assert.equal(two.weeks, 2, 'the two weeks it DID find are still reported');

  const three = bsBaseline(
    [...wk(M3, 2000), ...wk(M2, 2000), ...wk(M1, 2000)],
    TODAY,
  );
  assert.equal(three.basis, 'measured', 'F108 exactly three qualifies');
  near(three.au, 2000, 'F108 baseline');
  assert.equal(three.reason, null);
  assert.equal(BS_WINDOW_MIN_WEEKS, 3, 'the boundary is the exported constant');
});

test('F40 — a week with no training never enters the median as a zero', () => {
  // Real weeks at M8, M2 and M1 with a five-week interruption between. If the
  // absent weeks were materialised as 0 AU weeks the most recent four would be
  // [0, 0, 2000, 2000] and the median would read 1000.
  const r = bsBaseline(
    [...wk(M8, 2000), ...wk(M2, 2000), ...wk(M1, 2000)],
    TODAY,
  );
  assert.equal(r.weeks, 3, 'only the weeks that were actually trained');
  assert.deepEqual(r.window.map((w) => w.weekStartISO), [M8, M2, M1]);
  near(r.au, 2000, 'F40 the gap contributes nothing — it is absent, not zero');
});

test('F41 — the order history arrives in cannot change the baseline', () => {
  const inOrder = [...wk(M3, 1000), ...wk(M2, 2000), ...wk(M1, 3000)];
  const shuffled = [inOrder[5], inOrder[0], inOrder[3], inOrder[1], inOrder[4], inOrder[2]];
  const a = bsBaseline(inOrder, TODAY);
  const b = bsBaseline(shuffled, TODAY);
  near(a.au, 2000, 'F41 baseline');
  assert.deepEqual(
    b.window.map((w) => w.weekStartISO),
    a.window.map((w) => w.weekStartISO),
    'F41 the same weeks, in the same order',
  );
  near(b.au, a.au, 'F41 the same baseline');
});

test('F99 — sparse qualifying weeks: the non-qualifying ones are not zeros', () => {
  // Weeks 1, 3 and 5 qualify; 2 and 4 log sessions but are not measured.
  const r = bsBaseline([
    ...wk(M5, 1000),
    ...unmeasuredWeek(M4),
    ...wk(M3, 2000),
    ...unmeasuredWeek(M2),
    ...wk(M1, 3000),
  ], TODAY);
  assert.equal(r.weeks, 3, 'the window reached back five calendar weeks to find three');
  assert.deepEqual(r.window.map((w) => w.weekStartISO), [M5, M3, M1]);
  near(r.au, 2000, 'F99 median of the three qualifying weeks');
});

test('F100 — a week outside the 84-day reach is NOT pulled in to make three', () => {
  const r = bsBaseline([
    ...wk(M14, 2000),   // 100 days back — out of reach
    ...wk(M2, 2000),
    ...wk(M1, 2000),
  ], TODAY);
  assert.equal(r.au, null, 'F100 two in reach is not a baseline');
  assert.equal(r.weeks, 2, 'the week-14 data must not join the window');
  assert.deepEqual(r.window.map((w) => w.weekStartISO), [M2, M1]);
});

test('the reach boundary is 84 days, measured at the week own start', () => {
  const inReach = bsBaseline(
    [...wk(M11, 2000), ...wk(M2, 2000), ...wk(M1, 2000)],
    TODAY,
  );
  assert.equal(inReach.weeks, 3, 'a week starting 79 days back is inside the reach');

  const outOfReach = bsBaseline(
    [...wk(M12, 2000), ...wk(M2, 2000), ...wk(M1, 2000)],
    TODAY,
  );
  assert.equal(outOfReach.weeks, 2, 'a week starting 86 days back is outside it');
});

test('F102 — more qualifying weeks than the cap uses the most recent four', () => {
  const r = bsBaseline([
    ...wk(M7, 9000, 6),
    ...wk(M6, 9000, 6),
    ...wk(M5, 9000, 6),
    ...wk(M4, 4000, 4),
    ...wk(M3, 3000),
    ...wk(M2, 2000),
    ...wk(M1, 1000),
  ], TODAY);
  assert.equal(r.weeks, BS_WINDOW_MAX_WEEKS, 'F102 capped at four');
  assert.deepEqual(r.window.map((w) => w.weekStartISO), [M4, M3, M2, M1],
    'the four most recent, not the four largest');
  // Median of the recent four is 2500; the median of all seven would be 4000.
  near(r.au, 2500, 'F102 weeks five to seven do not enter the median');
});

test('F103 — a sub-floor baseline yields no ratio, no Infinity, no NaN', () => {
  // One-second sessions at RPE 1: (1/60) x 1 = ~0.0167 AU. Each week is measured
  // (one eligible, one rated) and therefore QUALIFIES — reaching the floor test
  // is the point of the row.
  const tiny = (monday) => [{
    startedAtISO: `${monday}T12:00:00Z`,
    timezone: 'UTC',
    durationSec: 1,
    sessionRpe: 1,
    durationConfirmed: false,
  }];
  const r = bsBaseline(
    [...tiny(M4), ...tiny(M3), ...tiny(M2), ...tiny(M1)],
    TODAY,
  );
  assert.equal(r.weeks, 4, 'F103 four qualifying weeks — not filtered out early');
  assert.equal(r.basis, 'none');
  assert.equal(r.reason, 'baseline_below_floor');
  assert.equal(r.au, null, 'no percentage is ever computed against it');
  assert.ok(Number.isFinite(r.rawAu), 'the computed figure survives for telemetry');
  assert.ok(r.rawAu > 0 && r.rawAu < 1, `expected a tiny positive, got ${r.rawAu}`);
});

test('F113 / F114 — the floor is BELOW 500, not at or below it', () => {
  const at = (au) => bsBaseline(
    [...wk(M3, au), ...wk(M2, au), ...wk(M1, au)],
    TODAY,
  );
  const under = at(499);
  assert.equal(under.basis, 'none', 'F113 baseline 499 has no usable baseline');
  assert.equal(under.reason, 'baseline_below_floor');
  near(under.rawAu, 499, 'F113 the figure is still reported');

  const exact = at(500);
  assert.equal(exact.basis, 'measured', 'F114 baseline 500 exactly IS measured');
  near(exact.au, 500, 'F114 baseline');
  assert.equal(exact.reason, null);
  assert.equal(BS_BASELINE_FLOOR_AU, 500, 'the floor is the ramp curve own lowest anchor');
});

test('F104 / F116 — rule B1 is asserted independently of the floor', () => {
  // Unreachable through real sessions (a rated session has positive AU), so the
  // guard is pinned directly. The NaN case is the one that matters: `NaN < 500`
  // is FALSE, so a bare floor check would let it through as a usable baseline.
  assert.equal(bsIsUsableBaseline(0), false, 'F104 exactly zero');
  assert.equal(bsIsUsableBaseline(-1), false, 'F116 negative');
  assert.equal(bsIsUsableBaseline(NaN), false, 'NaN must not pass the floor check');
  assert.equal(bsIsUsableBaseline(Infinity), false, 'not finite');
  assert.equal(bsIsUsableBaseline(null), false);
  assert.equal(bsIsUsableBaseline('2000'), false, 'a numeric string is not a number here');
  assert.equal(bsIsUsableBaseline(499.999), false);
  assert.equal(bsIsUsableBaseline(500), true);
  assert.equal(bsIsUsableBaseline(5000), true);
});

test('F106 / F107 — "nothing logged" and "logged but unusable" differ', () => {
  const empty = bsBaseline([], TODAY);
  assert.equal(empty.reason, 'no_history', 'F107 no history at all');
  assert.equal(empty.weeks, 0);

  const unusable = bsBaseline(
    [...unmeasuredWeek(M3), ...unmeasuredWeek(M2), ...unmeasuredWeek(M1)],
    TODAY,
  );
  assert.equal(unusable.reason, 'no_qualifying_weeks', 'F106 logged, none qualifying');
  assert.equal(unusable.weeks, 0);
});

test('one or two qualifying weeks reports its own reason, not "none found"', () => {
  // DECISION BEYOND THE TABLE: the table names `no_qualifying_weeks` for ZERO
  // (F106) and never names a reason for one or two. Reporting "no qualifying
  // weeks" about a client who has two would be a small lie.
  const one = bsBaseline(wk(M1, 2000), TODAY);
  assert.equal(one.reason, 'insufficient_weeks');
  assert.equal(one.weeks, 1);
});

test('F109 / F129 — a deload pulls the median down by its LENGTH', () => {
  const twoWeek = bsBaseline([
    ...wk(M4, 2000), ...wk(M3, 2000), ...wk(M2, 1200), ...wk(M1, 1200),
  ], TODAY);
  near(twoWeek.au, 1600, 'F109 window [1200,1200,2000,2000] -> mean of the middle pair');

  const threeWeek = bsBaseline([
    ...wk(M4, 2000), ...wk(M3, 1200), ...wk(M2, 1200), ...wk(M1, 1200),
  ], TODAY);
  near(threeWeek.au, 1200, 'F129 a third deload week drops the baseline to 1200');
});

test('a single-session week still qualifies for the window', () => {
  // No minimum session count gates membership of the median — F34 makes a
  // one-session week measured, and nothing downgrades it here.
  const r = bsBaseline([
    on(M3, 150, 10), on(M2, 150, 10), on(M1, 150, 10),
  ], TODAY);
  assert.equal(r.weeks, 3);
  near(r.au, 1500, 'baseline from three single-session weeks');
});

test('the week being lived is not complete, and does not enter the median', () => {
  // DECISION BEYOND THE TABLE, grounded in SPEC-guardrails.md 6.1 ("completed
  // measured weeks"). A partial current week enters as a genuine light week and
  // TIGHTENS every ceiling — the false-positive direction, but still wrong.
  const withCurrent = bsBaseline([
    ...wk(M3, 2000), ...wk(M2, 2000), ...wk(M1, 2000), ...wk(M0, 200),
  ], TODAY);
  assert.equal(withCurrent.weeks, 3, 'the current week is excluded');
  assert.deepEqual(withCurrent.window.map((w) => w.weekStartISO), [M3, M2, M1]);
  near(withCurrent.au, 2000, 'a partial week cannot drag the baseline down');
});

test('a malformed todayISO is reported, never guessed at', () => {
  // DECISION BEYOND THE TABLE: no fixture supplies one. The whole window is
  // measured from this date, so defaulting it would produce a confidently wrong
  // baseline instead of an honest "could not check".
  const history = [...wk(M3, 2000), ...wk(M2, 2000), ...wk(M1, 2000)];
  for (const bad of ['not-a-date', '', null, undefined, 42, '2026-8-5', '2026-02-31']) {
    const r = bsBaseline(history, bad);
    assert.equal(r.reason, 'malformed_history', `todayISO ${String(bad)} must be reported`);
    assert.equal(r.au, null);
    assert.ok(
      r.malformed.some((m) => m.field === 'todayISO'),
      `todayISO ${String(bad)} must be named in the report`,
    );
  }
  assert.equal(bsBaseline(history, TODAY).basis, 'measured', 'a real date still works');
});

test('malformed history rides through the baseline rather than being swallowed', () => {
  const r = bsBaseline([
    ...wk(M3, 2000), ...wk(M2, 2000), ...wk(M1, 2000),
    { startedAtISO: `${M1}T12:00:00Z`, timezone: 'UTC', durationSec: -30, sessionRpe: 7 },
  ], TODAY);
  assert.equal(r.malformed.length, 1, 'the offending row is named');
  assert.equal(r.malformed[0].field, 'durationSec');
  // The good weeks still derive; the regime layer decides what `unknown` does.
  near(r.au, 2000, 'one broken row does not discard the history around it');
});

test('bsMedian — odd takes the middle, even takes the mean of the middle pair', () => {
  near(bsMedian([3, 1, 2]), 2, 'unsorted input is sorted first');
  near(bsMedian([1, 2, 3, 4]), 2.5, 'mean of the middle pair');
  near(bsMedian([5]), 5);
  assert.equal(bsMedian([]), null, 'no values is null, never 0');
  assert.equal(bsMedian('nope'), null);
  near(bsMedian([1, NaN, 3, null, 'x']), 2, 'non-finite entries are dropped, not coerced');
});

test('deriving a baseline does not mutate the history it was given', () => {
  const history = [...wk(M3, 2000), ...wk(M2, 2000), ...wk(M1, 2000)];
  const before = JSON.parse(JSON.stringify(history));
  bsBaseline(history, TODAY);
  assert.deepEqual(history, before, 'history rows must survive derivation untouched');
});

// ── §5. The proposed week and the cold-start ceilings ────────────────────────

// A proposed session: `P(minutes, rpe)`. Ids are stable so an incomplete row
// can be named in the report.
let pid = 0;
const P = (min, rpe) => ({ id: `p${(pid += 1)}`, plannedMinutes: min, plannedRpe: rpe });
const proposeN = (n, min, rpe) => ({
  weekStartISO: M0,
  sessions: Array.from({ length: n }, () => P(min, rpe)),
});
const propose = (...rows) => ({ weekStartISO: M0, sessions: rows });

// The axes as a lookup, so a test reads by name rather than by position.
const axesOf = (week) => {
  const list = bsColdStartAxes(bsProposedWeek(week));
  return Object.fromEntries(list.map((a) => [a.axis, a]));
};
const checkOf = (axis, name) => axis.checks.find((c) => c.check === name);

test('the cold-start ceilings are the numbers the table states', () => {
  // The fixture table opens section 5 with these four figures. Pinning them
  // means the scheduled retune has to change the table and the code together,
  // rather than one drifting silently away from the other.
  assert.equal(BS_COLD_START_WEEKLY_AMBER_PER_SESSION, 600, 'weekly amber per session');
  assert.equal(BS_COLD_START_WEEKLY_RED_PER_SESSION, 850, 'weekly red per session');
  assert.equal(BS_PEAK_AMBER_AU, 700, 'peak amber');
  assert.equal(BS_PEAK_RED_AU, 1000, 'peak red');
  assert.equal(BS_SHARE_OF_WEEK_AMBER_PCT, 45, 'share_of_week amber');
});

test('F43-F45 — the three reference athletes are all green under cold start', () => {
  // The calibration that matters: caps loose enough that a normal intermediate
  // and a normal advanced week are NOT flagged for a client we know nothing
  // about. The original 900/1400 caps made F44 red.
  const beginner = bsProposedWeek(proposeN(3, 40, 5));
  near(beginner.totalAu, 600, 'F43 3 x 40min @ RPE 5');
  assert.equal(axesOf(proposeN(3, 40, 5)).volume.state, 'green', 'F43 cap 1800/2550');
  assert.equal(axesOf(proposeN(3, 40, 5)).concentration.state, 'green');

  const inter = bsProposedWeek(proposeN(4, 60, 7));
  near(inter.totalAu, 1680, 'F44 4 x 60min @ RPE 7');
  assert.equal(axesOf(proposeN(4, 60, 7)).volume.state, 'green', 'F44 cap 2400/3400');
  assert.equal(axesOf(proposeN(4, 60, 7)).concentration.state, 'green');

  // RPE 7.5 — a coach may plan a half point even though a LOGGED 7.5 is a
  // defect. If this ever reads as incomplete, the two rating rules have been
  // wrongly merged.
  const adv = bsProposedWeek(proposeN(6, 75, 7.5));
  assert.deepEqual(adv.incomplete, [], 'F45 a planned half-point RPE is valid');
  near(adv.totalAu, 3375, 'F45 6 x 75min @ RPE 7.5');
  assert.equal(axesOf(proposeN(6, 75, 7.5)).volume.state, 'green', 'F45 cap 3600/5100');
});

test('F46 — an over-prescribed unknown client reaches amber, not red', () => {
  const week = proposeN(3, 100, 7);            // 700 AU x 3 = 2100
  const { volume, concentration } = axesOf(week);
  near(bsProposedWeek(week).totalAu, 2100, 'F46 total');
  assert.equal(volume.state, 'amber', 'F46 2100 over the 1800 cap, under the 2550 red');
  near(checkOf(volume, 'weekly_total').ceiling, 1800);
  near(checkOf(volume, 'weekly_total').redCeiling, 2550);
  // Each session sits EXACTLY on the 700 peak bound: the rule is over, not at.
  assert.equal(concentration.state, 'green', 'F46 700 AU is not OVER the 700 bound');
});

test('F47 — 4 x 90min at RPE 10 is red on the weekly cap', () => {
  const week = proposeN(4, 90, 10);            // 900 AU x 4 = 3600
  const { volume, concentration } = axesOf(week);
  near(bsProposedWeek(week).totalAu, 3600, 'F47 total');
  assert.equal(volume.state, 'red', 'F47 3600 over the 3400 red cap');
  assert.equal(concentration.state, 'amber', 'the hardest session is also over 700');
});

test('F48 — 1680 AU compressed into an even two-way split trips BOTH axes', () => {
  const week = propose(P(120, 7), P(120, 7)); // 840 + 840 = 1680
  const p = bsProposedWeek(week);
  near(p.totalAu, 1680, 'F48 total');
  near(p.hardestAu, 840, 'F48 an EVEN split — the row states it for a reason');
  const { volume, concentration } = axesOf(week);
  assert.equal(volume.state, 'amber', 'F48 1680 over the 1200 two-session cap');
  near(checkOf(volume, 'weekly_total').redCeiling, 1700);
  assert.equal(concentration.state, 'amber', 'F48 840 over the 700 peak bound');
  assert.equal(checkOf(concentration, 'share_of_week'), undefined,
    'F69 share does not apply at two sessions');

  // The row's warning, pinned: an uneven split puts the hardest session over
  // the 1000 peak RED bound and the whole row changes colour.
  const uneven = axesOf(propose(P(110, 10), P(58, 10))); // 1100 + 580
  assert.equal(uneven.concentration.state, 'red', 'F48 an uneven 1100/580 goes red');
});

test('F49 — both concentration checks fire, and it is still ONE axis', () => {
  const week = propose(P(40, 5), P(40, 5), P(75, 10)); // 200 + 200 + 750 = 1150
  const p = bsProposedWeek(week);
  near(p.totalAu, 1150, 'F49 total');
  near(p.hardestAu, 750);
  const { volume, concentration } = axesOf(week);
  assert.equal(volume.state, 'green', 'F49 1150 well under the 1800 cap');

  const peak = checkOf(concentration, 'peak');
  const share = checkOf(concentration, 'share_of_week');
  assert.equal(peak.tripped, true, 'F49 750 > 700');
  assert.equal(share.tripped, true, 'F49 65.2% > 45%');
  near(share.value, (750 / 1150) * 100, 'F49 share_of_week');
  assert.equal(concentration.state, 'amber', 'F74 two checks, one axis, one amber');
  assert.equal(
    bsColdStartAxes(p).filter((a) => a.state !== 'green').length,
    1,
    'F74 it must not register as two amber axes',
  );
});

test('F50 — a lone 120-minute RPE 9 session is red on the peak bound', () => {
  const week = propose(P(120, 9));             // 1080 AU in one session
  const { volume, concentration } = axesOf(week);
  near(bsProposedWeek(week).totalAu, 1080, 'F50 total');
  assert.equal(concentration.state, 'red', 'F50 1080 over the 1000 peak red bound');
  // The weekly cap is exceeded too (850 for one session) — the row says so.
  assert.equal(volume.state, 'red', 'F50 the one-session weekly cap is also crossed');
  assert.equal(checkOf(concentration, 'share_of_week'), undefined,
    'a single session has no meaningful share');
});

test('F105 — a single-session week: share is 100% by arithmetic and must NOT flag', () => {
  const week = propose(P(60, 8));              // 480 AU
  const { volume, concentration } = axesOf(week);
  assert.equal(volume.state, 'green', 'F105 480 under the 600 one-session cap');
  assert.equal(concentration.state, 'green', 'F105 only the peak bound applies');
  assert.equal(checkOf(concentration, 'share_of_week'), undefined,
    'F105 below the three-session floor the check is OMITTED, not passed');
});

test('F115 — the beginner who adds a second session is green, not red', () => {
  // Baseline 200 AU is under the 500 floor, so this routes to cold start and
  // the absolute caps govern. Under a percentage curve it was a 100% increase
  // against a 40%/75% clamp — red, and at its loudest for the person least able
  // to read it.
  const history = [...wk(M3, 200), ...wk(M2, 200), ...wk(M1, 200)];
  const base = bsBaseline(history, TODAY);
  assert.equal(base.basis, 'none', 'F115 a 200 AU baseline is below the floor');
  assert.equal(base.reason, 'baseline_below_floor');

  const week = propose(P(40, 5), P(40, 5));    // 200 + 200 = 400 across 2 sessions
  const { volume, concentration } = axesOf(week);
  near(bsProposedWeek(week).totalAu, 400, 'F115 proposed');
  assert.equal(volume.state, 'green', 'F115 400 under the 1200 two-session cap');
  assert.equal(concentration.state, 'green', 'F115 200 AU is nowhere near the peak bound');
});

test('F69-F71 — share_of_week needs three sessions, and the rule is OVER 45%', () => {
  // Two sessions at 50/50: perfectly balanced, and it must never flag.
  const balanced = axesOf(propose(P(100, 5), P(100, 5)));
  assert.equal(checkOf(balanced.concentration, 'share_of_week'), undefined,
    'F69 the check does not apply at two sessions');

  // 50 / 30 / 20 of a 1000 AU week.
  const over = axesOf(propose(P(100, 5), P(60, 5), P(40, 5)));
  near(checkOf(over.concentration, 'share_of_week').value, 50, 'F70 share is 50%');
  assert.equal(over.concentration.state, 'amber', 'F70 50% is over 45%');

  // 45 / 30 / 25 of a 1000 AU week — exactly at the line.
  const exact = axesOf(propose(P(90, 5), P(60, 5), P(50, 5)));
  near(checkOf(exact.concentration, 'share_of_week').value, 45, 'F71 share is exactly 45%');
  assert.equal(exact.concentration.state, 'green', 'F71 exactly 45% is green — the rule is OVER');
});

test('F87 — a proposed week with zero sessions is INCOMPLETE, never green', () => {
  // Every cold-start cap is `sessions x k`, which is 0 at zero sessions. A path
  // that scored this as an ordinary week would find every total over every
  // ceiling and flag a week that does not exist.
  const p = bsProposedWeek({ weekStartISO: M0, sessions: [] });
  assert.equal(p.sessions, 0);
  assert.ok(p.incomplete.length > 0, 'F87 it must be reported, not scored');
  for (const axis of bsColdStartAxes(p)) {
    for (const c of axis.checks) {
      assert.ok(Number.isFinite(c.value), `${c.check} value must be finite, got ${c.value}`);
      assert.ok(!Number.isNaN(c.ceiling), `${c.check} ceiling must not be NaN`);
    }
  }
});

test('F85 / F86 — an unreadable proposed session is named, never silently dropped', () => {
  const p = bsProposedWeek(propose(
    P(60, 7),
    { id: 'no-rpe', plannedMinutes: 60 },
    { id: 'no-min', plannedRpe: 7 },
  ));
  assert.equal(p.incomplete.length, 2, 'both offending sessions are reported');
  assert.deepEqual(
    p.incomplete.map((i) => ({ field: i.field, id: i.id })),
    [{ field: 'plannedRpe', id: '"no-rpe"' }, { field: 'plannedMinutes', id: '"no-min"' }],
    'F85/F86 each names the session it came from',
  );
  // The session COUNT is what the coach authored, so the cap does not shrink in
  // exactly the weeks we cannot fully read.
  assert.equal(p.sessions, 3, 'the authored count drives the cap');
  near(p.totalAu, 420, 'only the readable session contributes load');
});

test('an out-of-range or junk plannedRpe is reported like a missing one', () => {
  // DECISION BEYOND THE TABLE: F85 covers absence only. `incomplete_week` is
  // the one reason in the vocabulary that describes a proposal we cannot read.
  for (const rpe of [0, 11, -2, null, '7', true, NaN]) {
    const p = bsProposedWeek(propose({ id: 'x', plannedMinutes: 60, plannedRpe: rpe }));
    assert.equal(p.incomplete.length, 1, `plannedRpe ${String(rpe)} must be reported`);
    assert.equal(p.incomplete[0].field, 'plannedRpe');
  }
  for (const min of [0, -30, null, '60', NaN, Infinity]) {
    const p = bsProposedWeek(propose({ id: 'x', plannedMinutes: min, plannedRpe: 7 }));
    assert.equal(p.incomplete.length, 1, `plannedMinutes ${String(min)} must be reported`);
    assert.equal(p.incomplete[0].field, 'plannedMinutes');
  }
});

test('F89 — a null or garbage proposedWeek is reported and never throws', () => {
  for (const junk of [null, undefined, 'week', 42, [], true, { sessions: 'nope' }]) {
    const p = bsProposedWeek(junk);
    assert.equal(p.sessions, 0);
    assert.equal(p.totalAu, 0);
    assert.ok(p.incomplete.length > 0, `garbage proposedWeek ${String(junk)} must be reported`);
  }
});

test('a planned session may run long — the 150-minute ceiling is a TIMER rule', () => {
  // It exists because a wall-clock timer's word is not a measurement. A coach
  // deliberately authoring a 180-minute session is not the timer, so the
  // proposal is read at face value (and flags on load, as it should).
  const p = bsProposedWeek(propose(P(180, 8)));
  assert.deepEqual(p.incomplete, [], 'a long planned session is not a defect');
  near(p.totalAu, 1440, '180 min at RPE 8');
  assert.equal(axesOf(propose(P(180, 8))).concentration.state, 'red', 'it flags on load instead');
});

test('deriving the proposed week does not mutate it', () => {
  const week = propose(P(60, 7), P(75, 8));
  const before = JSON.parse(JSON.stringify(week));
  bsColdStartAxes(bsProposedWeek(week));
  assert.deepEqual(week, before, 'the authored week must survive derivation untouched');
});

test('under cold start there is no percentage to report', () => {
  // The absolute caps are AU, not a percentage of anything — so `ceilingPct` is
  // genuinely null, which is why the documented shape allows it.
  for (const axis of bsColdStartAxes(bsProposedWeek(proposeN(3, 100, 7)))) {
    assert.equal(axis.ceilingPct, null, `${axis.axis} has no percentage in cold start`);
  }
});

// ── §6. The measured regime — the ramp curve ─────────────────────────────────

// A proposed week totalling exactly `au`, spread over five equal sessions at
// RPE 10. Five keeps every session under the 700 peak bound and the share at
// 20%, so the CONCENTRATION axis stays green throughout and the volume axis is
// the only thing moving — which is what these rows are about.
const proposeTotal = (au, n = 5) =>
  propose(...Array.from({ length: n }, () => P(au / n / 10, 10)));

const volumeAt = (au, baselineAu = 2000) =>
  bsMeasuredVolumeAxis(bsProposedWeek(proposeTotal(au)), baselineAu);

test('the curves read 19% and 40% at a 2000 AU baseline', () => {
  const c = bsMeasuredCeilings(2000);
  near(c.rampPct, 19, 'ramp at 2000 — one third of the way from 1500 to 3000');
  near(c.redPct, 40, 'red at 2000');
  near(c.amberAu, 2380, 'amber ceiling');
  near(c.redAu, 2800, 'red ceiling');
});

test('F52-F56 — the measured ladder at a 2000 AU baseline', () => {
  assert.equal(volumeAt(2300).state, 'green', 'F52 2300 under the 2380 ceiling');
  assert.equal(volumeAt(2380).state, 'green', 'F53 2380 exactly — the boundary is OVER, not at');
  assert.equal(volumeAt(2500).state, 'amber', 'F54 2500 over the ceiling');
  assert.equal(volumeAt(2800).state, 'amber', 'F55 2800 exactly — red is OVER 2800');
  assert.equal(volumeAt(3000).state, 'red', 'F56 3000 is red');
});

test('F52-F56 — the boundaries are strict on both ceilings', () => {
  // The rows above sit on the lines; these pin that a hair either side moves.
  assert.equal(volumeAt(2380.0001).state, 'amber', 'a hair over amber is amber');
  assert.equal(volumeAt(2379.9999).state, 'green', 'a hair under amber is green');
  assert.equal(volumeAt(2800.0001).state, 'red', 'a hair over red is red');
  assert.equal(volumeAt(2799.9999).state, 'amber', 'a hair under red is amber');
});

test('F57 — the guardrail never flags going down', () => {
  // A deliberate deload is green, and it must be green by ARITHMETIC: both
  // ceilings are baseline x (1 + pct), so nothing below the baseline can reach
  // either. A special case would be removable by someone who did not know why.
  assert.equal(volumeAt(1200).state, 'green', 'F57 a 1200 AU deload against a 2000 baseline');
  for (const total of [1, 100, 500, 1000, 1999, 2000]) {
    assert.equal(volumeAt(total).state, 'green', `${total} AU is at or below baseline`);
  }
});

test('the reported percentage names the ceiling actually in play', () => {
  near(volumeAt(2300).ceilingPct, 19, 'green reports the ramp');
  near(volumeAt(2500).ceilingPct, 19, 'amber reports the ramp it crossed');
  near(volumeAt(3000).ceilingPct, 40, 'red reports the RED threshold, not the ramp');
});

test('the ceilings scale inversely with the baseline, and clamp at both ends', () => {
  // The same proposed increase means different things at different baselines —
  // that is the entire reason the ceiling is a curve and not a constant.
  const low = bsMeasuredCeilings(500);
  near(low.rampPct, 40, 'at 500 AU a 40% ramp');
  near(low.amberAu, 700);
  near(low.redAu, 875);

  const high = bsMeasuredCeilings(5000);
  near(high.rampPct, 9, 'at 5000 AU only 9%');
  near(high.amberAu, 5450);
  near(high.redAu, 6100);

  // Below the first anchor and above the last the curve is CLAMPED, never
  // extrapolated — an extrapolated ramp eventually returns a negative ceiling.
  const clampedHigh = bsMeasuredCeilings(9000);
  near(clampedHigh.rampPct, 9, 'above the last anchor the ramp holds flat');
  near(clampedHigh.redPct, 22);
});

test('a baseline the floor rejected never reaches the curve', () => {
  // The sub-floor case routes to cold start; if it reached the curve it would
  // clamp to 40%/75% and resolve a beginner's second session as red (F115).
  for (const bad of [null, undefined, NaN, 0, -1, 499.999, '2000']) {
    assert.equal(bsMeasuredCeilings(bad), null, `baseline ${String(bad)} has no curve`);
    assert.equal(
      bsMeasuredVolumeAxis(bsProposedWeek(proposeTotal(1000)), bad),
      null,
      `baseline ${String(bad)} yields no volume axis`,
    );
  }
  assert.ok(bsMeasuredCeilings(500), 'exactly 500 does reach the curve');
});

test('a real history flows through to the measured ceilings', () => {
  // End to end rather than by hand: three logged 2000 AU weeks produce the
  // baseline, and the baseline produces the ceilings.
  const base = bsBaseline([...wk(M3, 2000), ...wk(M2, 2000), ...wk(M1, 2000)], TODAY);
  assert.equal(base.basis, 'measured');
  const axes = bsMeasuredAxes(bsProposedWeek(proposeTotal(2500)), base.au);
  const volume = axes.find((a) => a.axis === 'volume');
  assert.equal(volume.state, 'amber', '2500 against a derived 2000 baseline');
  near(volume.checks[0].ceiling, 2380, 'the ceiling came from the logged weeks');
});

test('the measured concentration axis still falls back to the absolute peak', () => {
  // F75: with no measured hardest session there is nothing else to compare
  // against. F72's jump_vs_history comparison arrives through `bounds`.
  //
  // The week is BALANCED (four equal 800 AU sessions, share 25%) so the peak
  // bound is the only check in play. A lopsided week would keep the axis amber
  // on share_of_week no matter what the peak bound was — which is the axis
  // working, but it would prove nothing about the fallback.
  const balanced = bsProposedWeek(propose(P(100, 8), P(100, 8), P(100, 8), P(100, 8)));
  near(balanced.totalAu, 3200);
  near(balanced.hardestAu, 800);

  const fallback = bsMeasuredAxes(balanced, 5000).find((a) => a.axis === 'concentration');
  near(checkOf(fallback, 'peak').ceiling, BS_PEAK_AMBER_AU, 'falls back to the absolute bound');
  near(checkOf(fallback, 'share_of_week').value, 25, 'share is not what is firing');
  assert.equal(fallback.state, 'amber', '800 AU is over the 700 absolute bound');

  const measured = bsMeasuredAxes(balanced, 5000, { peakAmber: 1200, peakRed: 1600 })
    .find((a) => a.axis === 'concentration');
  assert.equal(measured.state, 'green',
    'against this client own measured hardest, 800 AU is unremarkable');
});

// ── §7. The return regime — coming back from an interruption ─────────────────
//
// Gap days are a direct INPUT to the cap functions, so the arithmetic rows
// (F59-F63, F117) need no history at all. Only gap DETECTION (F64, F65) and
// regime resolution (F66, F101) build a history, and those use the same TODAY
// and `on()` helper as §4b.

// Dates by their distance back from TODAY (2026-08-05, a Wednesday).
const D10 = '2026-07-26';
const D21 = '2026-07-15';            // a Wednesday — a gap ending mid-week (F67)
const D40 = '2026-06-26';
const D90 = '2026-05-07';

test('F59-F61 — the return cap reduces the baseline, then the ramp reads the cap', () => {
  // The two compose: the cap is not the ceiling, it is the number the ordinary
  // ramp curve is then read at. F60 is the row that pins that composition.
  const g14 = bsReturnCeilings(2000, 14);
  near(g14.returnPct, 70, 'F59 14 days -> 70%');
  near(g14.cappedAu, 1400, 'F59 70% of 2000');

  const g28 = bsReturnCeilings(2000, 28);
  near(g28.returnPct, 55, 'F60 28 days -> 55%');
  near(g28.cappedAu, 1100, 'F60 55% of 2000');
  near(g28.rampPct, 29.2, 'F60 the ramp read AT 1100, not at 2000');
  near(g28.amberAu, 1421.2, 'F60 amber over 1421.2');
  near(g28.redPct, 57, 'the red curve reads the cap too');
  near(g28.redAu, 1727);

  const g56 = bsReturnCeilings(2000, 56);
  near(g56.returnPct, 40, 'F61 56 days -> 40%');
  near(g56.cappedAu, 800, 'F61 40% of 2000');
});

test('F62 / F117 — the band is FLAT from 56 days to the horizon', () => {
  // 40% at 56, 70 and 83 days. Defined, not undefined — the same clamp
  // convention that holds the ramp curve flat below 500 AU.
  for (const gap of [56, 70, 83]) {
    near(bsReturnFraction(gap), 40, `F117 ${gap} days is 40%`);
  }
  near(bsReturnFraction(83.999), 40, 'still 40% a hair under the horizon');
});

test('F63 — 84 days is a REGIME HANDOFF, not a fifth fraction', () => {
  // The distinction that matters: the fraction is not "floored at 40% forever".
  // At the horizon there is no fraction at all, because the baseline being
  // reduced is no longer a baseline worth reducing.
  assert.equal(bsReturnFraction(84), null, 'F63 no fraction at 84 days');
  assert.equal(bsReturnFraction(365), null, 'nor at a year');
  assert.equal(bsReturnCeilings(2000, 84), null, 'F63 and therefore no ceilings');
  near(bsReturnFraction(83), 40, 'the boundary is AT 84, strictly');
});

test('F58 — under 14 days there is no return rule at all', () => {
  assert.equal(bsReturnFraction(13), null, 'F58 13 days -> the ordinary ramp');
  assert.equal(bsReturnFraction(13.999), null, 'a hair under is still no rule');
  assert.equal(bsReturnFraction(0), null, 'trained today');
  near(bsReturnFraction(14), 70, 'the boundary is AT 14, strictly');
  near(bsReturnFraction(21), 62.5, 'and interpolates between anchors');

  // The guard is not the clamp: without it, the curve would happily report 70%
  // for a 3-day gap and 40% for a 300-day one. Both are curve values; neither
  // is a return rule.
  near(bsInterpolateAnchors(BS_RETURN_ANCHORS, 3), 70, 'the clamp alone would say 70');
  assert.equal(bsReturnFraction(3), null, 'the guard says there is no rule');
});

test('F82 — the cap MODIFIES the volume axis, it is not a second axis', () => {
  // A return week that also clears the ramp is ONE finding. If the cap were a
  // second axis it would satisfy compound red in §9 all by itself.
  const week = bsProposedWeek(proposeTotal(1600));
  const axes = bsReturnAxes(week, 2000, 28);

  assert.deepEqual(axes.map((a) => a.axis), ['volume', 'concentration'],
    'F82 two axes, and neither of them is a return axis');
  const volume = axes[0];
  assert.equal(volume.checks.length, 1, 'F82 one check — the cap is inside it');
  assert.equal(volume.checks[0].check, 'weekly_total');
  assert.equal(volume.state, 'amber', '1600 over the 1421.2 return ceiling, under 1727');

  // The same week against the same baseline with NO gap is comfortably green —
  // so the cap is what is doing the work here, not the week.
  assert.equal(bsMeasuredVolumeAxis(week, 2000).state, 'green',
    'unbroken, a 1600 AU week against a 2000 baseline is a decrease');
});

test('the return axis reports the percentage over the CAP', () => {
  // Stated because it can be misread: a return week is usually a DECREASE from
  // the pre-break baseline, so reading 29.2% as growth over 2000 would invert
  // the story. The check carries the absolute AU, which cannot be misread.
  const green = bsReturnVolumeAxis(bsProposedWeek(proposeTotal(1200)), 2000, 28);
  assert.equal(green.state, 'green');
  near(green.ceilingPct, 29.2, 'the ramp over the 1100 cap');
  near(green.checks[0].ceiling, 1421.2, 'and the ceiling itself is absolute AU');

  const red = bsReturnVolumeAxis(bsProposedWeek(proposeTotal(1800)), 2000, 28);
  assert.equal(red.state, 'red', '1800 is over the 1727 red ceiling');
  near(red.ceilingPct, 57, 'red reports the RED threshold');
});

test('a capped baseline under the 500 AU floor still produces a real ceiling', () => {
  // DECISION BEYOND THE TABLE. Rule B2 gates the MEASURED baseline; the cap is
  // not a measurement. Routing this to cold start would hand a returning client
  // `sessions x 600` — far looser than the cap that exists to protect them.
  const c = bsReturnCeilings(1000, 56);
  near(c.cappedAu, 400, '40% of 1000 is under the floor');
  near(c.rampPct, 40, 'the curve clamps at its first anchor, which is what a clamp is for');
  near(c.amberAu, 560);

  const coldStartWouldAllow = 3 * BS_COLD_START_WEEKLY_AMBER_PER_SESSION;
  assert.ok(c.amberAu < coldStartWouldAllow,
    'and the return ceiling is TIGHTER than cold start would be — the safe direction');

  // B1 is still asserted on the capped number: a NaN ceiling compares false
  // against everything and would silently pass every week.
  assert.equal(bsReturnCeilings(NaN, 28), null);
  assert.equal(bsReturnCeilings(0, 28), null);
  assert.equal(bsReturnCeilings(499, 28), null, 'the measured baseline still has to clear the floor');
});

test('F64 / F65 — a light session does not reset a gap, a real one does', () => {
  // 480 AU in 60 minutes. AU is rpe x minutes, so a real session has to earn
  // its load through EFFORT — 480 minutes at RPE 1 would be an unconfirmed
  // overrun and excluded entirely (F22).
  const anchor = on(D40, 60, 8);             // 480 AU, 40 days ago

  const walk = bsHistoryGap([anchor, on(D10, 60, 1)], TODAY);
  assert.equal(walk.gapDays, 40, 'F64 a 60 AU walk does not reset three weeks of protection');
  assert.equal(walk.lastRealISO, D40);

  const real = bsHistoryGap([anchor, on(D10, 140, 1)], TODAY);
  assert.equal(real.gapDays, 10, 'F65 a 140 AU session does');
  assert.equal(real.lastRealISO, D10);

  // Strictly OVER the floor, matching the week tally's own test so the two can
  // never disagree about which sessions are real.
  const exact = bsHistoryGap([anchor, on(D10, BS_GAP_SESSION_FLOOR_AU, 1)], TODAY);
  assert.equal(exact.gapDays, 40, '100 AU exactly does not reset it');
});

test('an UNRATED session cannot reset a gap — and that error runs safe', () => {
  // It has no AU at all, so it cannot exceed a floor expressed in AU. A client
  // who trains without rating reads as absent and is held to a TIGHTER return
  // ceiling than they need — the safe direction, and the same honest-absence
  // rule §3 applies everywhere else.
  const gap = bsHistoryGap([on(D40, 60, 8), on(D10, 90, null)], TODAY);
  assert.equal(gap.gapDays, 40, 'the unrated session is absent, not light');
});

test('F67 — a gap ending mid-week makes the WHOLE week the return week', () => {
  // The gap is measured to a session's own DATE, not to a week boundary, and
  // the cap then applies to the week's TOTAL. Nothing is prorated by how much
  // of the week fell inside the gap.
  const gap = bsHistoryGap([on(D21, 60, 8)], TODAY);
  assert.equal(gap.gapDays, 21, 'measured from the Wednesday itself');
  assert.equal(new Date(`${D21}T00:00:00Z`).getUTCDay(), 3, 'and that Wednesday is mid-week');

  const full = bsReturnCeilings(2000, 21);
  near(full.returnPct, 62.5, '21 days interpolates to 62.5%');
  near(full.cappedAu, 1250, 'the WHOLE cap — not a fraction of it for a partial week');

  // The proposed week's own start date changes nothing.
  const week = bsProposedWeek(proposeTotal(1500));
  const a = bsReturnVolumeAxis(week, 2000, 21);
  const b = bsReturnVolumeAxis(
    bsProposedWeek({ weekStartISO: M1, sessions: proposeTotal(1500).sessions }), 2000, 21,
  );
  near(a.checks[0].ceiling, b.checks[0].ceiling, 'the same cap wherever the week starts');
});

test('F101 — the stale rule BEATS the window', () => {
  // Three qualifying weeks sit inside the 84-day reach, but every session in
  // them is under the gap floor: six 90 AU sessions is 540 AU of real training
  // that resets no gap. The last session that DID clear the floor was 90 days
  // ago, so the baseline is stale even though the window found one.
  const lightWeek = (monday) => Array.from({ length: 6 }, () => on(monday, 90, 1));
  const history = [
    on(D90, 60, 8),
    ...lightWeek(M3), ...lightWeek(M2), ...lightWeek(M1),
  ];

  // The window really did produce a usable baseline — this row is about the
  // stale rule beating it, not about the window failing.
  const base = bsBaseline(history, TODAY);
  assert.equal(base.basis, 'measured', 'the window found three qualifying weeks');
  near(base.au, 540, 'and their median clears the 500 AU floor');

  const resolved = bsResolveRegime(history, TODAY);
  assert.equal(resolved.gapDays, 90, 'no session over the floor for 90 days');
  assert.equal(resolved.regime, 'cold_start', 'F101 not measured, and not return');
  assert.equal(resolved.reason, 'stale_baseline');
  assert.equal(resolved.baselineAu, null, 'a baseline you cannot trust is not offered');
});

test('F66 — the week after the return week re-ramps by the ordinary rules', () => {
  // The return week itself closed the gap, so there is no special case to
  // unwind: the next week resolves `measured`, and the return week is now
  // inside the window it re-ramps from.
  const history = [
    ...wk(M4, 2000), ...wk(M3, 2000), ...wk(M2, 2000),
    ...wk(M1, 1400),                                  // the return week, now logged
  ];
  const resolved = bsResolveRegime(history, TODAY);

  assert.equal(resolved.gapDays, 9, 'the return week is 9 days back');
  assert.equal(bsReturnFraction(resolved.gapDays), null, 'so no return rule applies');
  assert.equal(resolved.regime, 'measured', 'F66 ordinary rules, no special case');
  assert.equal(resolved.baseline.weeks, BS_WINDOW_MAX_WEEKS);
  near(resolved.baseline.window[resolved.baseline.window.length - 1].loadAu, 1400,
    'and the return week is inside the window it re-ramps from');
});

test('the regimes resolve in the ruled order', () => {
  const threeWeeks = [...wk(M3, 2000), ...wk(M2, 2000), ...wk(M1, 2000)];

  // Trained 9 days ago -> measured.
  const measured = bsResolveRegime(threeWeeks, TODAY);
  assert.equal(measured.regime, 'measured');
  near(measured.baselineAu, 2000);
  assert.equal(measured.reason, null);

  // The same weeks with the recent one dropped: last real session 23 days back.
  const returning = bsResolveRegime([...wk(M4, 2000), ...wk(M3, 2000), ...wk(M2, 2000)], TODAY);
  assert.equal(returning.gapDays, 16, 'the M2 week is 16 days back');
  assert.equal(returning.regime, 'return');
  near(returning.baselineAu, 2000, 'the pre-break baseline is what gets capped');

  // No usable baseline reports the BASELINE's reason, not staleness — saying
  // "your baseline is stale" implies there is one.
  const nothing = bsResolveRegime([], TODAY);
  assert.equal(nothing.regime, 'cold_start');
  assert.equal(nothing.reason, 'no_history', 'the truer sentence');

  const stranded = bsResolveRegime([on(D90, 60, 8)], TODAY);
  assert.equal(stranded.regime, 'cold_start');
  assert.equal(stranded.reason, 'no_qualifying_weeks',
    'one ancient session is not a stale baseline — it is no baseline');
});

test('no real session anywhere is a "cannot say", not a gap of infinity', () => {
  // DECISION BEYOND THE TABLE. A client training six genuine 90 AU sessions a
  // week would otherwise be declared stale and handed the far LOOSER cold-start
  // caps — the dangerous direction.
  const lightWeek = (monday) => Array.from({ length: 6 }, () => on(monday, 90, 1));
  const history = [...lightWeek(M3), ...lightWeek(M2), ...lightWeek(M1)];

  const gap = bsHistoryGap(history, TODAY);
  assert.equal(gap.gapDays, null, 'there is no last real session to measure from');
  assert.equal(gap.lastRealISO, null);

  const resolved = bsResolveRegime(history, TODAY);
  assert.equal(resolved.regime, 'measured', 'they keep the baseline their weeks produced');
  near(resolved.baselineAu, 540);
});

test('the gap never runs backwards, and malformed history is reported once', () => {
  // A session dated after today is the only way the count goes negative, and a
  // negative gap cannot mean anything. Reading it as "trained today" is the
  // tighter regime, not the looser one.
  const ahead = bsHistoryGap([on('2026-08-09', 60, 8)], TODAY);
  assert.equal(ahead.gapDays, 0, 'clamped, never negative');

  // Both passes classify the same rows through the same classifier, so the
  // resolver takes one list rather than reporting every defect twice.
  const resolved = bsResolveRegime([on(M1, 60, 11), ...wk(M2, 2000)], TODAY);
  assert.equal(resolved.malformed.length, 1, 'named once');
  assert.equal(resolved.malformed[0].field, 'sessionRpe');

  // A malformed todayISO is a caller bug the gap pass reports too.
  const bad = bsHistoryGap([on(D40, 60, 8)], '2026-02-31');
  assert.equal(bad.gapDays, null);
  assert.equal(bad.malformed[0].field, 'todayISO');
});
