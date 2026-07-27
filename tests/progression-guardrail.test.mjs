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

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bsInterpolateAnchors,
  bsClassifySession,
  bsWeekLoad,
  bsLocalWeek,
  bsBucketWeeks,
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
  assert.deepEqual(week, { eligible: 0, rated: 0, loadAu: 0, measured: false, malformed: [] });
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
