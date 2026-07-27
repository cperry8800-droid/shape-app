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
//   Section 8  the concentration axis finished - the hard day against the
//              client's own hardest logged session (F72-F75)
//   Section 9  state resolution - green / amber / red, the curve and compound
//              paths, the sub-3-session suppression (F48-F50, F76-F84)
//   Section 10 bsProgressionGuardrail - the one entry point, honest absence,
//              determinism, purity, non-mutation (F85-F92, F110-F112, F118)
//   Section 11 bsGuardrailCopy - the only source of guardrail wording, the two
//              doctrine phrasings, and display rounding (F51, F68, F93-F98)

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  bsConcentrationAxis,
  bsJumpBounds,
  bsResolveState,
  bsAxisEnabled,
  BS_AXIS_REGISTRY,
  BS_COMPOUND_MIN_SESSIONS,
  BS_GAP_SESSION_FLOOR_AU,
  bsProgressionGuardrail,
  bsGuardrailCopy,
  BS_AXIS_LABELS,
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
  const before = shuffled.map((a) => ({ ...a }));
  for (const x of [0, 400, 500, 600, 1000, 1500, 1680, 2250, 3000, 3375, 4000, 5000, 6000]) {
    near(
      bsInterpolateAnchors(shuffled, x),
      ramp(x),
      `F15 shuffled anchors @ ${x}`,
    );
  }
  // ⚠ THE ORDER CHECK IS ONLY HALF THE TEST. An in-place sort would reorder
  // `shuffled` on the FIRST call and every later iteration would read an
  // already-sorted table — identical results, defect invisible. Assert the
  // caller's array came back untouched.
  assert.deepEqual(shuffled, before, 'F15 a caller table must not be reordered');
});

test('F15 — reading a table does not mutate it', () => {
  // ⚠ MIS-SORTED ON PURPOSE. `BS_RAMP_ANCHORS` is already ascending, so an
  // in-place sort of it is a no-op and deepEqual would pass over the bug this
  // test exists to catch. A table that is wrong-way-round cannot hide one.
  const table = [...BS_RAMP_ANCHORS].reverse();
  const before = table.map((a) => ({ ...a }));
  near(bsInterpolateAnchors(table, 1680), ramp(1680), 'a reversed table still reads correctly');
  assert.deepEqual(table, before, 'F15 the anchor table must be untouched');
  // ...and the exported constant itself, which is shared module state.
  const shared = BS_RAMP_ANCHORS.map((a) => ({ ...a }));
  bsInterpolateAnchors(BS_RAMP_ANCHORS, 1680);
  assert.deepEqual(BS_RAMP_ANCHORS, shared, 'F15 the exported table must be untouched');
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
    eligible: 0, rated: 0, loadAu: 0, measured: false, hardestAu: 0,
    malformed: [],
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

test('the zone cache is bounded, and eviction never changes an answer', () => {
  // The formatter cache is capped so a long-lived server process cannot grow it
  // without limit on caller-supplied zone strings. The CAP is a resource bound,
  // not a rule — no behavioural test can observe it. What a test CAN observe is
  // the risk the cap introduces: a zone evicted and rebuilt must bucket
  // identically. Push well past the cap with real zones, then re-read the first.
  const ZONES = ['America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney',
    'America/Sao_Paulo', 'Africa/Lagos', 'Asia/Kolkata', 'Europe/Berlin'];
  const one = (tz) => bsLocalWeek({ startedAtISO: '2026-07-29T02:30:00Z', timezone: tz });
  const first = one('Pacific/Auckland');

  // 80+ distinct zone strings through the cache — more than the cap holds.
  for (let i = 0; i < 12; i += 1) {
    for (const tz of ZONES) one(tz);
    // ...including ones that will never resolve, which are cached as misses.
    one(`Not/AZone${i}`);
  }

  assert.deepEqual(one('Pacific/Auckland'), first,
    'a zone that was evicted and rebuilt buckets identically');
  assert.equal(one('Not/AZone0'), null, 'and an invalid zone is still rejected after eviction');
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
  const twoWeekHistory = [...wk(M4, 2000), ...wk(M3, 2000), ...wk(M2, 1200), ...wk(M1, 1200)];
  const threeWeekHistory = [...wk(M4, 2000), ...wk(M3, 1200), ...wk(M2, 1200), ...wk(M1, 1200)];

  near(bsBaseline(twoWeekHistory, TODAY).au, 1600,
    'F109 window [1200,1200,2000,2000] -> mean of the middle pair');
  near(bsBaseline(threeWeekHistory, TODAY).au, 1200,
    'F129 a third deload week drops the baseline to 1200');

  // ⚠ THE ROWS SPECIFY A STATE, NOT A BASELINE. These two exist so a retune of
  // the anchor curves is deliberate and visible — and a baseline-only assertion
  // cannot see one: at 1600 the ramp is 21.4% (amber over 1942.4) and the red
  // curve 44% (over 2304), while at 1200 they are 27.4% (1528.8) and 54%
  // (1848). The SAME 2000 AU week is amber against the two-week deload and red
  // against the three-week one. Assert that.
  assert.equal(
    bsProgressionGuardrail(hist(twoWeekHistory), proposeTotal(2000)).state, 'amber',
    'F109 — 2000 sits between 1942.4 and 2304',
  );
  const deeper = bsProgressionGuardrail(hist(threeWeekHistory), proposeTotal(2000));
  assert.equal(deeper.state, 'red', 'F129 — 2000 is past the 1848 red ceiling');
  assert.equal(deeper.redPath, 'curve');
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

test('the ceilings are strictly OVER — pinned against the computed value itself', () => {
  // ⚠ WHY THIS EXISTS BESIDE F53/F55. Those feed a `proposeTotal()` figure
  // derived by one float path and compare it against a ceiling derived by
  // another: at a 2000 AU baseline the amber ceiling actually lands on
  // 2380.0000000000005, so "2380 is green" passes on where the arithmetic
  // happened to fall — flip that last bit and the row fails against a CORRECT
  // implementation. Feeding the ceiling back in tests it against ITSELF, which
  // is exact at any precision, so the strict-vs-non-strict semantics are pinned
  // rather than inferred.
  const c = bsMeasuredCeilings(2000);
  const at = (totalAu) => bsMeasuredVolumeAxis(
    { totalAu, hardestAu: totalAu / 5, sessions: 5, incomplete: [] }, 2000,
  ).state;
  const justOver = (x) => x * (1 + Number.EPSILON);

  assert.equal(at(c.amberAu), 'green', 'exactly AT the amber ceiling is green');
  assert.equal(at(c.redAu), 'amber', 'exactly AT the red ceiling is amber');
  assert.equal(at(justOver(c.amberAu)), 'amber', 'one ulp over the amber ceiling flags');
  assert.equal(at(justOver(c.redAu)), 'red', 'one ulp over the red ceiling reds');
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
  // against. F72's jump_vs_history comparison arrives through `bounds` (§8).
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

  // 900 AU is a session this client has actually done, so 800 is unremarkable.
  const measured = bsMeasuredAxes(balanced, 5000, { hardestLoggedAu: 900 })
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

  // ⚠ THE FLOOR IS PINNED WITH LITERALS ON BOTH SIDES, and that matters more
  // than it looks. A test written in terms of the constant moves WITH the
  // constant: `on(D10, BS_GAP_SESSION_FLOOR_AU, 1)` builds a session at
  // whatever the floor happens to be, so it passes at 90 and at 110 alike. A
  // perturbation sweep found exactly that — the floor could drift either way
  // with the whole suite green, and 60/140 sit too far out to notice.
  //
  // 100 does not reset (so the rule is strictly OVER) and 101 does. Together
  // those two literals admit exactly one floor.
  assert.equal(BS_GAP_SESSION_FLOOR_AU, 100, 'the floor is 100 AU — retuning it is a fixture change');
  assert.equal(bsHistoryGap([anchor, on(D10, 100, 1)], TODAY).gapDays, 40,
    '100 AU exactly does not reset it');
  assert.equal(bsHistoryGap([anchor, on(D10, 101, 1)], TODAY).gapDays, 10,
    '101 AU does');
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

  // The same weeks with the recent one dropped: last real session 16 days back.
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

// ── §8. The concentration axis, finished — the jump against history ──────────

// A week of `n` equal sessions of `au` each — balanced, so share_of_week is
// 100/n and cannot be what fires. RPE 10 keeps minutes at au/10.
const evenWeek = (n, au) => bsProposedWeek(
  { weekStartISO: M0, sessions: Array.from({ length: n }, () => P(au / 10, 10)) },
);
const concentration = (proposed, hardestLoggedAu) =>
  bsConcentrationAxis(proposed, hardestLoggedAu === undefined ? {} : { hardestLoggedAu });

test('F72 — the jump fires while share_of_week stays clean', () => {
  // Four equal 800 AU sessions: share is 25%, so nothing on that check is
  // firing. Against a client whose hardest logged session is 500 AU, the ramp
  // at 500 is its first anchor — 40% — so 700 is the line and 800 clears it.
  const week = evenWeek(4, 800);
  const axis = concentration(week, 500);

  const jump = checkOf(axis, 'jump_vs_history');
  near(jump.value, 800, 'the hardest proposed session');
  near(jump.ceiling, 700, 'F72 500 AU x (1 + its own 40% ramp)');
  near(jump.redCeiling, 875, 'and the red curve read at the same session value');
  assert.equal(jump.state, 'amber');

  near(checkOf(axis, 'share_of_week').value, 25, 'share is clean at four equal sessions');
  assert.equal(checkOf(axis, 'share_of_week').tripped, false);
  assert.equal(axis.state, 'amber', 'F72 the axis is amber on the jump alone');
});

test('F73 — share fires while the jump stays clean', () => {
  // 500/300/200: share is 50%, over the 45% line. The 500 AU hardest is well
  // under this client's own 829.2 jump ceiling, so only one check is firing.
  const week = bsProposedWeek(propose(P(50, 10), P(30, 10), P(20, 10)));
  const axis = concentration(week, 600);

  near(checkOf(axis, 'share_of_week').value, 50, 'F73 share is 50%');
  assert.equal(checkOf(axis, 'share_of_week').state, 'amber');
  near(checkOf(axis, 'jump_vs_history').ceiling, 829.2, '600 AU x (1 + its 38.2% ramp)');
  assert.equal(checkOf(axis, 'jump_vs_history').state, 'green', 'F73 the jump is clean');
  assert.equal(axis.state, 'amber');
});

test('F74 — both checks firing is still ONE axis', () => {
  // The same lopsided week against a client whose hardest is only 300 AU: the
  // jump ceiling falls to 420 and both checks fire. That is one problem
  // described twice, and §9 counts distinct AXES so it can never become a
  // compound red on its own.
  const week = bsProposedWeek(propose(P(50, 10), P(30, 10), P(20, 10)));
  const axis = concentration(week, 300);

  assert.equal(checkOf(axis, 'jump_vs_history').tripped, true);
  assert.equal(checkOf(axis, 'share_of_week').tripped, true);
  assert.equal(axis.checks.length, 2, 'F74 two checks');
  assert.equal(axis.axis, 'concentration', 'F74 on ONE axis');

  const axes = bsMeasuredAxes(week, 2000, { hardestLoggedAu: 300 });
  assert.equal(axes.filter((a) => a.axis === 'concentration').length, 1,
    'F74 and it appears once in the axis list');
});

test('F75 — with no measured hardest session, the ABSOLUTE bound is the honest fallback', () => {
  const week = evenWeek(4, 800);
  const fallback = concentration(week);

  assert.equal(checkOf(fallback, 'jump_vs_history'), undefined,
    'F75 nothing to compare against, so nothing claims to');
  near(checkOf(fallback, 'peak').ceiling, BS_PEAK_AMBER_AU);
  near(checkOf(fallback, 'peak').redCeiling, BS_PEAK_RED_AU);
  assert.equal(fallback.state, 'amber', '800 AU is over the 700 absolute bound');

  // The check's NAME carries which comparison was made. They are different
  // sentences to a coach: "hard by any standard" is not "a big jump for them".
  assert.equal(concentration(week, 500).checks[0].check, 'jump_vs_history');
  assert.equal(concentration(week).checks[0].check, 'peak');
});

test('the client own hardest REPLACES the absolute bound, it does not add to it', () => {
  // A single 1100 AU session. Against the absolute bound that is red — the
  // bound stands in for a capacity we have not measured. This client HAS
  // logged 900 AU, so 1100 is inside their own 1195.2 ramp and is green.
  const week = bsProposedWeek(propose(P(110, 10)));
  assert.equal(concentration(week).state, 'red', 'unknown client: over the 1000 absolute red');

  const known = concentration(week, 900);
  near(checkOf(known, 'jump_vs_history').ceiling, 1195.2, '900 AU x (1 + its 32.8% ramp)');
  assert.equal(known.state, 'green', 'measured client: 1100 is inside what they already do');
});

test('the jump has a RED bound, and both boundaries are strict', () => {
  // DECISION BEYOND THE TABLE: the table states the amber rule only. Without a
  // red, a client with any history could never reach red on this axis — a
  // session at three times their hardest ever would be a mild amber.
  const at = (au) => concentration(bsProposedWeek(propose(P(au / 10, 10))), 500);

  assert.equal(at(700).state, 'green', '700 exactly — the boundary is OVER, not at');
  assert.equal(at(700.0001).state, 'amber');
  assert.equal(at(875).state, 'amber', '875 exactly — red is OVER 875');
  assert.equal(at(875.0001).state, 'red');
  assert.equal(at(1500).state, 'red', 'three times their hardest is unambiguously red');
});

test('the hardest logged session comes from the SAME window as the median', () => {
  // Four qualifying weeks of 3 x 500 AU, with one 700 AU session in M2. Two
  // heavier sessions sit outside the window and must not be the hardest: one
  // in a fifth qualifying week (dropped by the 4-week cap) and one 100 days
  // back (out of the 84-day reach).
  const history = [
    on(M14, 140, 10),                                  // 1400 AU, out of reach
    on(M5, 140, 10),                                   // 1400 AU, the 5th week back
    ...wk(M4, 1500, 3), ...wk(M3, 1500, 3),
    ...wk(M2, 1500, 3), on(M2, 70, 10),                // 700 AU, inside the window
    ...wk(M1, 1500, 3),
  ];
  const base = bsBaseline(history, TODAY);

  assert.equal(base.weeks, BS_WINDOW_MAX_WEEKS, 'the window is the most recent four');
  near(base.au, 1500, 'the median is unmoved by one heavier session');
  near(base.hardestLoggedAu, 700,
    'and the hardest is the heaviest session INSIDE that window, not in all history');

  // End to end: the window feeds the axis.
  const axis = concentration(evenWeek(4, 800), base.hardestLoggedAu);
  near(checkOf(axis, 'jump_vs_history').ceiling, 954.8, '700 AU x (1 + its 36.4% ramp)');
  assert.equal(axis.state, 'green', '800 AU is inside what this client already does');
});

test('no hardest logged session is ABSENCE, not a hardest of zero', () => {
  // A zero would make every proposed session an infinite jump and flag every
  // week ever authored. Unreachable through real sessions — a qualifying week
  // needs a rated one — so the guard can only be pinned by calling it directly.
  assert.equal(bsJumpBounds(0), null);
  assert.equal(bsJumpBounds(-100), null);
  assert.equal(bsJumpBounds(NaN), null);
  assert.equal(bsJumpBounds(null), null);
  assert.equal(bsJumpBounds('700'), null, 'a string is not a measurement');

  assert.equal(bsBaseline([], TODAY).hardestLoggedAu, null);
  assert.equal(concentration(evenWeek(2, 400), null).checks[0].check, 'peak',
    'and the axis falls back rather than dividing by it');
});

test('a returning client is still measured against their PRE-BREAK hardest', () => {
  // Deliberate: the interruption is priced into the volume axis. Pricing it on
  // the concentration axis too would flag the same fact twice, which is the
  // thing F82 exists to prevent.
  // 4 x 400 AU: a light week by this client's standards, but against the 1100
  // return cap the TOTAL still reads as an increase.
  const week = evenWeek(4, 400);
  const axes = bsReturnAxes(week, 2000, 28, { hardestLoggedAu: 900 });
  const conc = axes.find((a) => a.axis === 'concentration');

  near(checkOf(conc, 'jump_vs_history').ceiling, 1195.2, 'the same ceiling as an unbroken client');
  assert.equal(conc.state, 'green');
  assert.equal(axes[0].state, 'amber', 'while the volume axis carries the interruption');
});

// ── §9. State resolution — what the coach actually sees ──────────────────────

// Resolve a proposed week end to end under each regime, so the session count
// the suppression rule reads is the week's own rather than a number restated
// beside it.
const coldState = (week) => {
  const p = bsProposedWeek(week);
  return bsResolveState(bsColdStartAxes(p), p.sessions);
};
const measuredState = (week, baselineAu, hardestLoggedAu) => {
  const p = bsProposedWeek(week);
  return bsResolveState(bsMeasuredAxes(p, baselineAu, { hardestLoggedAu }), p.sessions);
};

test('F76 / F77 — nothing over a ceiling is green; one axis amber is amber', () => {
  const green = coldState(proposeN(3, 40, 10));          // 3 x 400 = 1200, cap 1800
  assert.equal(green.state, 'green', 'F76');
  assert.equal(green.redPath, null);
  assert.deepEqual(green.contributingAxes, []);

  // F49's week: 200 + 200 + 750. Volume is green under the 1800 cap; both
  // concentration checks fire, and they are one axis.
  const amber = coldState(propose(P(20, 10), P(20, 10), P(75, 10)));
  assert.equal(amber.state, 'amber', 'F77');
  assert.equal(amber.redPath, null, 'amber never carries a red path');
  assert.deepEqual(amber.contributingAxes, ['concentration'],
    'F49 two checks firing on one axis is ONE contributor');
});

test('F78 — one axis over its red ceiling is red by the CURVE path', () => {
  // F47: 4 x 900 = 3600 against a 3400 red cap. The concentration axis is
  // amber alongside (900 is over the 700 peak bound) and is deliberately NOT
  // listed — it did not cause the red.
  const red = coldState(proposeN(4, 90, 10));
  assert.equal(red.state, 'red', 'F47 / F78');
  assert.equal(red.redPath, 'curve');
  assert.deepEqual(red.contributingAxes, ['volume'], 'F83 the axis that caused it, named');

  const axes = bsColdStartAxes(bsProposedWeek(proposeN(4, 90, 10)));
  assert.equal(axes.find((a) => a.axis === 'concentration').state, 'amber',
    'the amber axis is still reported in `axes` — it is just not what caused the red');
});

test('F79 / F80 — the compound path needs THREE sessions', () => {
  // Two 800 AU sessions: 1600 against a 1200 cap (volume amber), hardest 800
  // against the 700 bound (concentration amber). Neither is near red — 1600 is
  // under the 1700 weekly red, 800 under the 1000 peak red.
  const two = coldState(propose(P(80, 10), P(80, 10)));
  assert.equal(two.state, 'amber', 'F79 two hard-but-real sessions are amber, not red');
  assert.equal(two.redPath, null);

  // The same load spread over three: now the two axes can fail independently.
  const three = coldState(proposeN(3, 80, 10));
  assert.equal(three.state, 'red', 'F80');
  assert.equal(three.redPath, 'compound');
  assert.deepEqual(three.contributingAxes, ['volume', 'concentration'],
    'F83 every contributing axis, named');
});

test('F81 — suppression touches the COMPOUND path only', () => {
  // 1100 + 200 on two sessions: volume amber (1300 over the 1200 cap), and the
  // hardest session is over the 1000 peak RED bound. Rule 1 runs first, so a
  // genuinely dangerous two-session week is still caught.
  const red = coldState(propose(P(110, 10), P(20, 10)));
  assert.equal(red.state, 'red', 'F81');
  assert.equal(red.redPath, 'curve', 'by the curve, not by compounding');
  assert.deepEqual(red.contributingAxes, ['concentration']);
});

test('F48 — 1680 AU in an even two-way split is amber, not red', () => {
  // ⚠ BOUNDARY-SENSITIVE (margin 1.2%): 1680 is 20 AU under the 1700
  // two-session red cap. And the split is load-bearing — an uneven 1100/580
  // puts the hardest session over the 1000 peak red and turns the row red.
  const even = coldState(propose(P(84, 10), P(84, 10)));
  assert.equal(even.state, 'amber', 'F48 both axes amber, compound suppressed at 2 sessions');
  assert.deepEqual(even.contributingAxes, ['volume', 'concentration'],
    'both are named even though they did not compound');

  const uneven = coldState(propose(P(110, 10), P(58, 10)));
  assert.equal(uneven.state, 'red', 'F48 the uneven split is a different row entirely');
  assert.equal(uneven.redPath, 'curve');
});

test('F50 — a lone 120-minute RPE 9 session: both axes red, both named', () => {
  // 1080 AU on one session. The weekly cap of 850 is exceeded AND the 1000
  // peak bound is — the copy layer picks which to lead with, but the payload
  // lists every contributing axis (F83).
  const red = coldState(propose(P(120, 9)));
  assert.equal(red.state, 'red', 'F50');
  assert.equal(red.redPath, 'curve');
  assert.deepEqual(red.contributingAxes, ['volume', 'concentration']);
});

test('the 3-session suppression holds in EVERY regime, not just cold start', () => {
  // Measured, baseline 2000 (amber over 2380, red over 2800), against a client
  // whose hardest logged session is 950 AU (jump amber over 1253.05, red over
  // 1534.25).
  const two = measuredState(propose(P(130, 10), P(130, 10)), 2000, 950);
  assert.equal(two.state, 'amber', '2600 AU and a 1300 hardest: both amber, suppressed');

  const three = measuredState(propose(P(130, 10), P(70, 10), P(70, 10)), 2000, 950);
  assert.equal(three.state, 'red', 'the same shape over three sessions compounds');
  assert.equal(three.redPath, 'compound');
});

test('F82 — a return week amber on volume alone never compounds', () => {
  // The cap modifies the volume axis; it is not a second axis. Three sessions,
  // so the suppression rule is NOT what is holding this at amber.
  const p = bsProposedWeek(proposeN(3, 50, 10));              // 3 x 500 = 1500
  const axes = bsReturnAxes(p, 2000, 28, { hardestLoggedAu: 900 });
  const state = bsResolveState(axes, p.sessions);

  assert.equal(axes[0].state, 'amber', '1500 over the 1421.2 return ceiling');
  assert.equal(axes[1].state, 'green', 'and the concentration axis is clean');
  assert.equal(state.state, 'amber', 'F82 one axis, one amber');
  assert.deepEqual(state.contributingAxes, ['volume']);
  assert.equal(p.sessions, 3, 'at three sessions — suppression is not what saved it');
});

test('F84 — `distribution` is registered, disabled, and votes on nothing', () => {
  const row = BS_AXIS_REGISTRY.find((a) => a.axis === 'distribution');
  assert.ok(row, 'F84 present in the registry');
  assert.equal(row.enabled, false, 'F84 and disabled');
  assert.equal(bsAxisEnabled('distribution'), false);
  assert.equal(bsAxisEnabled('volume'), true);
  assert.equal(bsAxisEnabled('vloume'), false, 'an unregistered axis does not get a vote');

  const volumeAmber = { axis: 'volume', state: 'amber', checks: [], ceilingPct: null };
  const distAmber = { axis: 'distribution', state: 'amber', checks: [], ceilingPct: null };
  const distRed = { axis: 'distribution', state: 'red', checks: [], ceilingPct: null };

  const compound = bsResolveState([volumeAmber, distAmber], 5);
  assert.equal(compound.state, 'amber', 'F84 a disabled axis cannot compound');
  assert.deepEqual(compound.contributingAxes, ['volume']);

  // DECISION BEYOND THE TABLE: excluded from red too. A flag raised by a
  // measurement we have declared not honestly computable is worse than a
  // missing flag.
  assert.equal(bsResolveState([distRed], 5).state, 'green',
    'and cannot turn a week red on its own');
});

test('the same axis twice is ONE contributor, not a compound', () => {
  // Guards the mechanism the concentration axis depends on: two checks on one
  // axis (F49, F74) must never become two votes. Asserted against the resolver
  // directly, because no regime can currently emit a duplicate axis — which is
  // exactly the assumption worth pinning before one can.
  const a = { axis: 'concentration', state: 'amber', checks: [], ceilingPct: null };
  const b = { axis: 'concentration', state: 'amber', checks: [], ceilingPct: null };
  const state = bsResolveState([a, b], 5);

  assert.equal(state.state, 'amber');
  assert.deepEqual(state.contributingAxes, ['concentration'], 'deduplicated by axis name');
});

test('the resolver survives junk and never invents a state', () => {
  assert.equal(bsResolveState(null, 3).state, 'green');
  assert.equal(bsResolveState([], 3).state, 'green');
  assert.equal(bsResolveState([null, undefined], 3).state, 'green');

  // A missing session count cannot satisfy the compound condition — the
  // suppression fails CLOSED, toward amber, never toward an unearned red.
  const ambers = [
    { axis: 'volume', state: 'amber', checks: [], ceilingPct: null },
    { axis: 'concentration', state: 'amber', checks: [], ceilingPct: null },
  ];
  assert.equal(bsResolveState(ambers, undefined).state, 'amber');
  assert.equal(bsResolveState(ambers, NaN).state, 'amber');
  assert.equal(bsResolveState(ambers, BS_COMPOUND_MIN_SESSIONS).state, 'red');
});

// ── §10. The whole thing — one function, and honest absence ──────────────────

const hist = (sessions, todayISO = TODAY) => ({ todayISO, sessions });

// Three logged 2000 AU weeks: a real measured client, used wherever the row
// under test is about the PROPOSED week rather than the history.
const GOOD_HISTORY = () => [...wk(M3, 2000), ...wk(M2, 2000), ...wk(M1, 2000)];

// Walk a result and collect every non-finite number. F87's "no NaN or division
// anywhere" has to be checked over the whole payload, not one field.
function nonFinite(value, path = '$', found = []) {
  if (typeof value === 'number' && !Number.isFinite(value)) found.push(`${path} = ${value}`);
  else if (Array.isArray(value)) value.forEach((v, i) => nonFinite(v, `${path}[${i}]`, found));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) nonFinite(v, `${path}.${k}`, found);
  }
  return found;
}

// Every key named anywhere in a result — F118 asserts the ABSENCE of the
// scoring vocabulary, which a field-by-field check would miss.
function keysOf(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, found));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { found.add(k); keysOf(v, found); }
  }
  return found;
}

test('F85 / F86 — an unreadable proposed session makes the WEEK unknown', () => {
  const bad = {
    weekStartISO: M0,
    sessions: [
      { id: 'a', plannedMinutes: 60, plannedRpe: 7 },
      { id: 'b', plannedMinutes: 60 },                    // F85 no plannedRpe
      { id: 'c', plannedRpe: 7 },                         // F86 no plannedMinutes
    ],
  };
  const r = bsProgressionGuardrail(hist(GOOD_HISTORY()), bad);

  assert.equal(r.state, 'unknown');
  assert.equal(r.reason, 'incomplete_week');
  assert.deepEqual(r.issues.incompleteWeek.map((i) => [i.id, i.field]),
    [['"b"', 'plannedRpe'], ['"c"', 'plannedMinutes']],
    'F85 / F86 the offending sessions are NAMED, by id and field');
  assert.deepEqual(r.issues.malformedHistory, [], 'the history was fine');
});

test('F87 — a proposed week with zero sessions is unknown, with no NaN anywhere', () => {
  // Every cold-start cap is `sessions x k`, which is 0 at zero sessions — so a
  // path that scored this would find every total over every ceiling and flag a
  // week that does not exist.
  const r = bsProgressionGuardrail(hist([]), { weekStartISO: M0, sessions: [] });

  assert.equal(r.state, 'unknown', 'F87 not green');
  assert.equal(r.reason, 'incomplete_week');
  assert.deepEqual(r.axes, [], 'F87 no flag is raised');
  assert.deepEqual(nonFinite(r), [], 'F87 no NaN or Infinity anywhere in the result');
});

test('F88 / F89 — hostile input is unknown, and never throws', () => {
  const week = proposeN(3, 60, 7);
  const cases = [
    [null, 'malformed_history', 'F88 history null'],
    ['nope', 'malformed_history', 'F88 history not an object'],
    [[], 'malformed_history', 'F88 history is an array'],
    [hist(null), 'malformed_history', 'F88 sessions not an array'],
    [hist('garbage'), 'malformed_history', 'F88 sessions is a string'],
    [hist([{ nonsense: true }, 42, null]), 'malformed_history', 'F88 garbage rows'],
    [hist(GOOD_HISTORY(), null), 'malformed_history', 'F88 no todayISO'],
  ];
  for (const [h, reason, label] of cases) {
    const r = bsProgressionGuardrail(h, week);
    assert.equal(r.state, 'unknown', label);
    assert.equal(r.reason, reason, label);
    assert.ok(r.issues.malformedHistory.length > 0, `${label} — and names what failed`);
  }

  // F89: the proposal, not the history, is what is missing here.
  for (const bad of [null, undefined, 'nope', [], { weekStartISO: M0 }]) {
    const r = bsProgressionGuardrail(hist(GOOD_HISTORY()), bad);
    assert.equal(r.state, 'unknown', 'F89');
    assert.equal(r.reason, 'incomplete_week');
    assert.ok(r.issues.incompleteWeek.length > 0, 'F89 and names it');
  }

  // A Symbol is the row that would CRASH the reporting path built to survive
  // malformed rows: `${Symbol()}` throws, and so does Number(Symbol()).
  const sym = bsProgressionGuardrail(
    hist([{ startedAtISO: Symbol('x'), timezone: 'UTC', durationSec: 3600, sessionRpe: Symbol('y') }]),
    week,
  );
  assert.equal(sym.state, 'unknown', 'a Symbol is reported, not thrown');
});

test('F110 / F111 / F112 — one malformed logged row turns the whole week unknown', () => {
  const week = proposeN(3, 60, 7);
  const rows = [
    [{ ...on(M1, 60, 7), durationSec: -30 }, 'durationSec', 'F110'],
    [{ ...on(M1, 60, 7), sessionRpe: 11 }, 'sessionRpe', 'F111'],
    [{ ...on(M1, 60, 7), startedAtISO: undefined }, 'startedAtISO', 'F112'],
  ];
  for (const [row, field, label] of rows) {
    const r = bsProgressionGuardrail(hist([...GOOD_HISTORY(), row]), week);
    assert.equal(r.state, 'unknown', `${label} rule C — never silently dropped`);
    assert.equal(r.reason, 'malformed_history');
    assert.ok(r.issues.malformedHistory.some((i) => i.field === field),
      `${label} names the offending field`);
    assert.deepEqual(r.axes, [], 'and scores nothing off the rows that were readable');
  }
});

test('F118 — `unknown` is not a flag state, and not a pass', () => {
  const unknowns = [
    bsProgressionGuardrail(null, proposeN(3, 60, 7)),
    bsProgressionGuardrail(hist(GOOD_HISTORY()), null),
    bsProgressionGuardrail(hist([{ ...on(M1, 60, 7), sessionRpe: 11 }]), proposeN(3, 60, 7)),
  ];

  for (const r of unknowns) {
    assert.equal(r.state, 'unknown');
    assert.deepEqual(r.axes, [], 'F118 no axes');
    assert.equal(r.redPath, null, 'F118 no red path');
    assert.deepEqual(r.contributingAxes, []);
    assert.equal(r.baseline.au, null, 'F118 no baseline — it asserts nothing about the client');
    assert.equal(r.baseline.basis, 'none');
    assert.ok(r.reason, 'F118 but it always says WHY');

    const keys = keysOf(r);
    assert.equal(keys.has('ceiling'), false, 'F118 no ceilings anywhere in the payload');
    assert.equal(keys.has('redCeiling'), false);
    assert.equal(keys.has('ceilingPct'), false);
  }
});

test('F90 / F92 — deterministic, and the inputs come back untouched', () => {
  const history = hist([...GOOD_HISTORY(), on(M2, 45, 6)]);
  const week = propose(P(75, 8), P(60, 7), P(90, 9));
  const historyBefore = structuredClone(history);
  const weekBefore = structuredClone(week);

  const a = bsProgressionGuardrail(history, week);
  const b = bsProgressionGuardrail(history, week);
  const c = bsProgressionGuardrail(structuredClone(history), structuredClone(week));

  assert.deepEqual(a, b, 'F90 the same inputs return a deeply-equal result');
  assert.deepEqual(a, c, 'F90 and cloned inputs return the same result again');

  assert.deepEqual(history, historyBefore, 'F92 history is not mutated');
  assert.deepEqual(week, weekBefore, 'F92 proposedWeek is not mutated');

  // The exported anchor tables are shared module state — a sort in place would
  // silently retune every later evaluation.
  assert.deepEqual(BS_RAMP_ANCHORS.map((x) => x.at), [500, 1500, 3000, 5000]);
});

test('F91 — purity: the source contains no clock, no randomness, no I/O', () => {
  // Asserted against the SOURCE rather than by observing behaviour: a clock
  // read only misbehaves when the clock moves, which a test run rarely sees.
  const src = readFileSync(
    new URL('../public/newdesign/progressionGuardrail.mjs', import.meta.url), 'utf8',
  );
  // Comments explain these hazards by name, so the scan reads code only.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const banned = [
    [/\bDate\.now\b/, 'Date.now'],
    [/\bMath\.random\b/, 'Math.random'],
    [/\bnew Date\s*\(\s*\)/, 'new Date() with no argument'],
    [/\bperformance\.now\b/, 'performance.now'],
    [/\bfetch\s*\(/, 'fetch'],
    [/\brequire\s*\(/, 'require'],
    [/\bimport\s*\(/, 'dynamic import'],
    [/\bprocess\./, 'process'],
    [/\bwindow\./, 'window'],
    [/\bdocument\./, 'document'],
    [/\blocalStorage\b/, 'localStorage'],
  ];
  for (const [re, name] of banned) {
    assert.equal(re.test(code), false, `F91 the core must not use ${name}`);
  }

  // `new Date(ms)`, `Date.UTC` and `Date.parse` ARE pure — they convert a value
  // that was passed in. The ban is on reading the ambient clock.
  assert.ok(/new Date\(ms\)/.test(code), 'and the pure Date conversions are still here');
});

test('the three regimes each produce a complete scored result', () => {
  const light = proposeTotal(1500);

  const cold = bsProgressionGuardrail(hist([]), light);
  assert.equal(cold.regime, 'cold_start');
  assert.equal(cold.state, 'green', '1500 AU over 5 sessions is well under a 3000 cap');
  assert.equal(cold.reason, 'no_history', 'a scored cold-start week still says why');
  assert.equal(cold.baseline.au, null);
  assert.deepEqual(cold.axes.map((a) => a.axis), ['volume', 'concentration']);

  const measured = bsProgressionGuardrail(hist(GOOD_HISTORY()), proposeTotal(2500));
  assert.equal(measured.regime, 'measured');
  assert.equal(measured.state, 'amber', '2500 over the 2380 ceiling');
  assert.equal(measured.reason, null, 'the baseline speaks for itself');
  near(measured.baseline.au, 2000);
  assert.equal(measured.baseline.weeks, 3);
  assert.deepEqual(measured.contributingAxes, ['volume']);
  assert.equal(measured.gapDays, 9);

  // The M2 week is 16 days back — an interruption.
  const returning = bsProgressionGuardrail(
    hist([...wk(M4, 2000), ...wk(M3, 2000), ...wk(M2, 2000)]), proposeTotal(1800),
  );
  assert.equal(returning.regime, 'return');
  assert.equal(returning.gapDays, 16, 'and the copy layer can say how many days');
  assert.equal(returning.state, 'amber', '1800 over the 1690.6 return ceiling');
  near(returning.baseline.au, 2000, 'the PRE-BREAK baseline is still reported');

  // A stale history routes to cold start with the baseline withheld.
  const stale = bsProgressionGuardrail(hist([on(D90, 60, 8)]), light);
  assert.equal(stale.regime, 'cold_start');
  assert.equal(stale.baseline.au, null);
  assert.equal(stale.state, 'green');
});

test('a scored result never carries issues, and an unknown never carries a state', () => {
  const scored = bsProgressionGuardrail(hist(GOOD_HISTORY()), proposeTotal(2000));
  assert.deepEqual(scored.issues, { malformedHistory: [], incompleteWeek: [] });
  assert.notEqual(scored.state, 'unknown');

  // Both classes at once: the history defect leads, because a single bad
  // logged row makes EVERY week the coach authors read unknown until it is
  // fixed — pointing them at a blank field first would mask the real cause.
  const both = bsProgressionGuardrail(
    hist([{ ...on(M1, 60, 7), sessionRpe: 11 }]),
    { weekStartISO: M0, sessions: [{ id: 'x', plannedMinutes: 60 }] },
  );
  assert.equal(both.reason, 'malformed_history', 'the persistent cause leads');
  assert.ok(both.issues.malformedHistory.length > 0);
  assert.ok(both.issues.incompleteWeek.length > 0,
    'and the other class is still reported, so telemetry loses nothing');
});

// ── §11. The copy — one voice, so two surfaces cannot disagree ───────────────

// Every string anywhere in a copy object. The doctrine bans ("estimated",
// "days off") have to be checked over the WHOLE payload: a banned word that
// drifted into `detail` while the test only read `line` would ship silently.
function copyStrings(copy, found = []) {
  if (typeof copy === 'string') found.push(copy);
  else if (Array.isArray(copy)) copy.forEach((v) => copyStrings(v, found));
  else if (copy && typeof copy === 'object') {
    Object.values(copy).forEach((v) => copyStrings(v, found));
  }
  return found;
}

// The scenarios the section is specified against, built once and reused so the
// doctrine sweep at the end sees exactly what the individual rows saw.
const COLD_AMBER = () => bsProgressionGuardrail(hist([]), proposeTotal(2100, 3));
const COLD_RED = () => bsProgressionGuardrail(hist([]), proposeTotal(3600, 4));
const RETURN_AMBER = () => bsProgressionGuardrail(
  hist([...wk(M4, 2000), ...wk(M3, 2000), ...wk(M2, 2000)]), proposeTotal(1800),
);
const MEASURED_RED = () => bsProgressionGuardrail(hist(GOOD_HISTORY()), proposeTotal(2900));
// Volume amber (2500 over 2380) AND concentration amber (a 1400 AU hardest
// session over the 1310 AU jump bound), three sessions, nothing red on its own.
const COMPOUND_RED = () => bsProgressionGuardrail(
  hist(GOOD_HISTORY()), propose(P(140, 10), P(55, 10), P(55, 10)),
);

test('a SCORED result survives JSON — no Infinity, no NaN, anywhere', () => {
  // ⚠ THE ONLY nonFinite SWEEP USED TO RUN ON A ZERO-SESSION `unknown`, whose
  // `axes` is []. So nothing checked the payload that actually carries axes.
  // `Infinity` is not JSON-serializable: it crosses the 409 publish-rejection
  // response and `analytics_events.props` as `null`, making "no red bound by
  // design" indistinguishable from "the field was unreadable" — the exact
  // ambiguity this module refuses everywhere else.
  const scored = bsProgressionGuardrail(hist([]), propose(P(75, 10), P(20, 10), P(20, 10)));
  assert.equal(scored.state, 'amber');
  const share = scored.axes.find((a) => a.axis === 'concentration')
    .checks.find((c) => c.check === 'share_of_week');
  assert.equal(share.redCeiling, null, 'no red bound by design reads as null, not Infinity');
  assert.equal(share.state, 'amber', '...and a null red bound can never resolve red');

  assert.deepEqual(nonFinite(scored), [], 'no Infinity or NaN anywhere in a scored result');
  const json = JSON.stringify(scored);
  assert.equal(JSON.stringify(JSON.parse(json)), json, 'round-trips through JSON unchanged');
});

test('F97 — green returns null; there is nothing to say', () => {
  const green = bsProgressionGuardrail(hist(GOOD_HISTORY()), proposeTotal(2000));
  assert.equal(green.state, 'green');
  // A guardrail that speaks when it has no finding trains a coach to stop
  // reading it. Silence here is the whole point.
  assert.equal(bsGuardrailCopy(green), null);
});

test('F93 / F51 — a cold-start flag says "no baseline yet", never "estimated"', () => {
  const r = COLD_AMBER();
  assert.equal(r.regime, 'cold_start');
  assert.equal(r.state, 'amber');

  const copy = bsGuardrailCopy(r);
  assert.equal(copy.chip, 'AMBER');
  // The required phrase, verbatim and lower case, so an exact-string match
  // finds it wherever a surface looks.
  assert.ok(copyStrings(copy).join(' ').includes('no baseline yet'));
  // The claim is that we have NO measurement and are applying a fixed limit.
  // "Estimated" would assert a number we do not have.
  assert.doesNotMatch(copyStrings(copy).join(' '), /estimat/i);
  // 3 sessions x 600 = 1800; the week is 2100.
  assert.match(copy.line, /2100 AU this week against a 1800 AU limit/);
});

test('F134 / F135 — a cold-start RED does not claim a baseline it does not have', () => {
  // F95 is SCOPED by ruling: its phrase names "this baseline", and cold start
  // has none. Saying it would contradict F93 in the same breath.
  const r = COLD_RED();
  assert.equal(r.regime, 'cold_start');
  assert.equal(r.state, 'red');

  const copy = bsGuardrailCopy(r);
  assert.equal(copy.chip, 'RED');
  // F134 — the fixed-limit phrasing, with F93's phrase still riding on it.
  // 4 sessions x 850 = 3400; the week is 3600.
  assert.match(copy.line, /3600 AU this week against a 3400 AU limit — past the red limit/);
  assert.ok(copyStrings(copy).join(' ').includes('no baseline yet'));

  // F135 — the negative, over EVERY cold-start output at every state, not just
  // this one. A scoping rule that only holds for the case under test is not a
  // rule; the next regime-shaped sentence added here would quietly break it.
  const coldOutputs = [COLD_AMBER(), COLD_RED(),
    // cold start amber on concentration alone, and a cold-start compound red
    bsProgressionGuardrail(hist([]), propose(P(75, 10), P(20, 10), P(20, 10))),
    bsProgressionGuardrail(hist([]), propose(P(90, 9), P(60, 8), P(60, 8)))];
  for (const out of coldOutputs) {
    assert.equal(out.regime, 'cold_start');
    assert.notEqual(out.state, 'green', 'a green produces no copy and proves nothing');
    assert.doesNotMatch(copyStrings(bsGuardrailCopy(out)).join(' '), /for this baseline/i);
  }
});

test('F94 / F68 — the return flag says "no sessions logged in N days"', () => {
  const r = RETURN_AMBER();
  assert.equal(r.regime, 'return');
  assert.equal(r.gapDays, 16);
  assert.equal(r.state, 'amber');

  const copy = bsGuardrailCopy(r);
  assert.ok(copyStrings(copy).join(' ').includes('no sessions logged in 16 days'));

  // The NEGATIVE, and it is the half that does the work. A positive assertion
  // proves the right phrase appears somewhere; it does nothing to stop the
  // banned one appearing elsewhere in the payload. Logging is self-report:
  // unlogged training and no training are indistinguishable from here, and the
  // copy must not claim to tell them apart — least of all to a coach who will
  // repeat it to the client. Swept over every return-regime state, not one.
  const returns = [r,
    bsProgressionGuardrail(hist([...wk(M4, 2000), ...wk(M3, 2000), ...wk(M2, 2000)]),
      proposeTotal(2600)),                                        // return, red
    bsProgressionGuardrail(hist([...wk(M4, 2000), ...wk(M3, 2000), ...wk(M2, 2000)]),
      propose(P(120, 10), P(20, 10), P(20, 10)))];                // return, compound
  for (const out of returns) {
    assert.equal(out.regime, 'return');
    assert.doesNotMatch(copyStrings(bsGuardrailCopy(out)).join(' '),
      /took .* off|days off|time off/i, 'never "you took N days off" (F94)');
  }
});

test('F95 — red via the curve names the baseline it exceeded', () => {
  const r = MEASURED_RED();
  assert.equal(r.regime, 'measured');
  assert.equal(r.state, 'red');
  assert.equal(r.redPath, 'curve');

  const copy = bsGuardrailCopy(r);
  assert.ok(copy.line.includes('exceeds the red threshold for this baseline'));
  // Red quotes the RED ceiling, not the amber one it also cleared.
  assert.match(copy.line, /2900 AU this week against a 2800 AU limit/);
  assert.match(copy.detail, /2000 AU baseline/);
});

test('F96 — red via compound says so, and names the axes', () => {
  const r = COMPOUND_RED();
  assert.equal(r.state, 'red');
  assert.equal(r.redPath, 'compound');
  assert.deepEqual(r.contributingAxes, ['volume', 'concentration']);

  const copy = bsGuardrailCopy(r);
  assert.ok(copy.line.includes('multiple limits reached at once'));
  // The axis NAMES, in coach language — the internal keys are never printed.
  assert.match(copy.line, /Weekly volume and hardest session/);
  assert.doesNotMatch(copy.line, /concentration/);
  // ...and the raw keys ride on the object, so a surface can render chips
  // without re-deriving which axes contributed.
  assert.deepEqual(copy.axes, ['volume', 'concentration']);
  // The compound rule's whole content: neither is red alone.
  assert.match(copy.detail, /Each is inside its own red limit/);
});

test('F98 — display rounds here, and the comparison upstream stays unrounded', () => {
  // Nothing long-decimal leaks. The return ceiling is 1691.09... AU, which is
  // exactly the kind of number that reaches a coach if the layer is missing.
  const returning = bsGuardrailCopy(RETURN_AMBER());
  for (const s of copyStrings(returning)) {
    assert.doesNotMatch(s, /\d\.\d/, `un-rounded figure in copy: ${s}`);
  }
  assert.match(returning.line, /1800 AU this week against a 1691 AU limit/);

  // The verdict is made on the unrounded number, whatever the display does.
  const hair = bsProgressionGuardrail(hist(GOOD_HISTORY()), proposeTotal(2380.4));
  assert.equal(hair.state, 'amber');
  // ...and the axis it came from still carries the raw figure, unrounded.
  const volume = hair.axes.find((a) => a.axis === 'volume');
  near(volume.checks[0].value, 2380.4, 'the axis value is untouched by display');
  near(volume.checks[0].ceiling, 2380, 'and so is the ceiling');
});

test('F136 / F137 / F138 — precision escalates only when rounding collapses it', () => {
  const lineFor = (au) => bsGuardrailCopy(
    bsProgressionGuardrail(hist(GOOD_HISTORY()), proposeTotal(au)),
  ).line;

  // F136 — 2380.4 over a 2380 ceiling. Whole numbers would print as equal,
  // which reads to a coach as a broken system. One decimal is shown, and the
  // two printed figures DIFFER. Not nudged: 2380.4 is the number we judged on,
  // shown at the resolution the comparison happened at.
  const collapsed = lineFor(2380.4);
  assert.match(collapsed, /2380\.4 AU this week against a 2380\.0 AU limit/);
  const shown = collapsed.match(/[\d.]+(?= AU)/g);
  // Pin the COUNT first: with one match, `notEqual(x, undefined)` would pass
  // while proving nothing.
  assert.equal(shown.length, 2, `expected two AU figures, got ${JSON.stringify(shown)}`);
  assert.notEqual(shown[0], shown[1], 'the printed figures must differ');

  // F137 — an ordinary amber. The whole numbers already differ, so escalating
  // would be noise: no decimal is shown anywhere in the line.
  const ordinary = lineFor(2500);
  assert.match(ordinary, /2500 AU this week against a 2380 AU limit/);
  assert.doesNotMatch(ordinary, /\d\.\d/);

  // F138 — the boundary. 2380.6 rounds to 2381 against a 2380 ceiling: the
  // figures differ by exactly 1 with no decimal, so escalation must NOT fire.
  const boundary = lineFor(2380.6);
  assert.match(boundary, /2381 AU this week against a 2380 AU limit/);
  assert.doesNotMatch(boundary, /\d\.\d/);
});

test('two figures indistinguishable at full precision say so, never print equal', () => {
  // ⚠ ANY finite precision cap leaves a residual band, and it is REACHABLE
  // with ordinary integer input: a ceiling of 2379.97 against a whole 2380 AU
  // week is amber, and collapses at zero, one, two and three decimals alike.
  // The clause states the relationship instead of quoting a limit it cannot
  // distinguish from the value — the one thing it must never do is print two
  // identical numbers beside an "over the limit" verdict.
  const check = {
    check: 'weekly_total', value: 2380, ceiling: 2379.9999, redCeiling: Infinity,
    state: 'amber', tripped: true,
  };
  const copy = bsGuardrailCopy({
    state: 'amber', regime: 'measured', redPath: null, baseline: { au: 2000 },
    contributingAxes: ['volume'],
    axes: [{ axis: 'volume', state: 'amber', checks: [check] }],
  });
  assert.match(copy.line, /2380 AU this week, just over its limit/);
  // No pair of identical figures around a comparison word.
  assert.doesNotMatch(copy.line, /(\d+) AU this week against a \1 AU limit/);
});

test('unknown gets words, not silence — and cannot be read as a pass', () => {
  // Rule D: an unknown must be VISIBLE and carry its reason. Rendering nothing
  // would be indistinguishable from green, which is the failure §10 exists to
  // prevent — repeated here at the copy layer.
  const bad = bsProgressionGuardrail(
    hist([{ ...on(M1, 60, 7), sessionRpe: 11 }]), proposeTotal(2000),
  );
  assert.equal(bad.state, 'unknown');

  const copy = bsGuardrailCopy(bad);
  assert.notEqual(copy, null);
  assert.equal(copy.chip, 'NOT CHECKED');
  assert.match(copy.line, /could not be checked/);
  assert.match(copy.detail, /could not be read/);
  // Not a flag: no axes, and no threshold vocabulary a coach could read as one.
  assert.deepEqual(copy.axes, []);
  assert.doesNotMatch(copyStrings(copy).join(' '), /limit|threshold/i);

  const incomplete = bsGuardrailCopy(bsProgressionGuardrail(
    hist(GOOD_HISTORY()), propose({ id: 'x', plannedMinutes: 60 }),
  ));
  assert.equal(incomplete.chip, 'NOT CHECKED');
  assert.match(incomplete.detail, /no duration or no effort target/);
});

test('the copy never throws, and an unrecognised state is never silence', () => {
  for (const junk of [null, undefined, 'green', 0, NaN, [], () => {}]) {
    assert.equal(bsGuardrailCopy(junk), null, `no result object: ${String(junk)}`);
  }
  // ⚠ A state this function does not know must NOT fall into green's null —
  // that is precisely where silence would be read as a pass.
  const alien = bsGuardrailCopy({ state: 'chartreuse', regime: 'measured' });
  assert.equal(alien.chip, 'NOT CHECKED');
  // Hostile shapes: every field the copy reads is guarded, none of them throw.
  const shapes = [{}, { state: 'red' }, { state: 'amber', axes: 'no' },
    { state: 'red', redPath: 'compound', contributingAxes: null },
    { state: 'amber', regime: 'return', gapDays: NaN, axes: [{ axis: 'volume' }] }];
  for (const shape of shapes) {
    const copy = bsGuardrailCopy(shape);
    assert.equal(typeof copy.line, 'string');
    assert.ok(copy.line.length > 0, 'a flag always says something');
  }
});

test('every registered axis has a label — no raw key can reach a coach', () => {
  for (const row of BS_AXIS_REGISTRY) {
    assert.equal(typeof BS_AXIS_LABELS[row.axis], 'string',
      `axis "${row.axis}" would print its internal key`);
  }
});

test('the doctrine holds across every flag this section produces', () => {
  const every = [COLD_AMBER, COLD_RED, RETURN_AMBER, MEASURED_RED, COMPOUND_RED]
    .map((f) => bsGuardrailCopy(f()));
  for (const copy of every) {
    const all = copyStrings(copy).join(' ');
    assert.doesNotMatch(all, /estimat/i, 'never "estimated" (F51)');
    assert.doesNotMatch(all, /took .* off|days off|time off/i,
      'never "you took N days off" (F68 / F94)');
    assert.doesNotMatch(all, /\d\.\d/, 'display rounds (F98)');
    // A flag always carries a chip a surface can render and a line to read.
    assert.ok(copy.chip === 'AMBER' || copy.chip === 'RED');
    assert.ok(copy.line.trim().length > 0);
  }
});
