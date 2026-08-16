// 18+ age derivation — the birthday boundary, which is where an off-by-one
// hides silently: one way refuses an adult forever, the other admits a minor.
//
// The bug these vectors exist for: `profiles.over_18` is written by a trigger
// that only fires on a profiles WRITE, so it is a snapshot from when the DOB was
// recorded. An account that signed up at 17 kept over_18=false past its
// eighteenth birthday, and the DOB freeze removed the self-service write that
// used to recompute it. The gate now derives from the date at read time.
//
// ⚠ EVERY REFERENCE INSTANT HERE IS 12:00 UTC, AND THAT IS NOT COSMETIC. The
// function reads the calendar day at UTC−12 (see ADULT_REFERENCE_OFFSET_MS), so
// 12:00Z is the instant at which the "anywhere on Earth" day equals the UTC day.
// A bare Date.UTC(y, m, d) is midnight, which is still the PREVIOUS day at
// UTC−12 — the vectors would then all be testing the day before the one named.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isMinorFromDob, ADULT_AGE_YEARS, ADULT_REFERENCE_OFFSET_MS } from '../src/lib/age-derive.mjs';

const NOW = Date.UTC(2026, 7, 16, 12); // 2026-08-16 everywhere on Earth

test('exactly 18 today is an ADULT — the trigger uses dob <= today - 18y', () => {
  assert.equal(isMinorFromDob('2008-08-16', NOW), false);
});

test('one day short of the eighteenth birthday is still a minor', () => {
  assert.equal(isMinorFromDob('2008-08-17', NOW), true);
});

test('the day after turning 18 is an adult', () => {
  assert.equal(isMinorFromDob('2008-08-15', NOW), false);
});

// ⚠ THE COUNTEREXAMPLE THAT CHANGED THE RULE. Comparing at UTC declared this
// member an adult at 00:30Z on their birthday — while it was still the day
// BEFORE in Los Angeles and New York, i.e. before their local eighteenth
// birthday. That is admitting a minor early, the direction this gate exists to
// prevent, and the file's header had explicitly claimed it could not happen.
test('a birthday instant west of UTC does NOT admit a minor early', () => {
  const justPastUtcMidnight = Date.parse('2026-08-17T00:30:00Z');
  assert.equal(isMinorFromDob('2008-08-17', justPastUtcMidnight), true);
});

// The flip lands when the LAST timezone reaches the birthday — 12:00Z, since the
// westernmost civil offset is UTC−12. Both sides asserted, or the test would pass
// on a function that simply never returns adult.
test('adulthood begins when the last timezone reaches the birthday, not the first', () => {
  assert.equal(isMinorFromDob('2008-08-17', Date.parse('2026-08-17T11:59:59Z')), true);
  assert.equal(isMinorFromDob('2008-08-17', Date.parse('2026-08-17T12:00:00Z')), false);
});

test('the stale-snapshot case: a 17-year-old signup reads adult once the birthday passes', () => {
  const dob = '2008-12-01';
  // Recorded while under 18 — this is what wrote over_18 = false.
  assert.equal(isMinorFromDob(dob, Date.UTC(2026, 7, 16, 12)), true);
  // After the birthday the SAME row derives adult, with no write in between.
  assert.equal(isMinorFromDob(dob, Date.UTC(2026, 11, 2, 12)), false);
});

test('clearly-adult and clearly-minor dates', () => {
  assert.equal(isMinorFromDob('1990-01-01', NOW), false);
  assert.equal(isMinorFromDob('2015-06-30', NOW), true);
});

// A Feb-29 birthday in a non-leap year: 2026 has no Feb 29, and this rule
// (dob <= today - 18y, the trigger's own comparison) makes the transition land
// on Mar 1 rather than Feb 28. Asserted explicitly because it is the one case
// where "turned 18" has no single obvious date.
test('a leap-day birthday transitions on Mar 1 in a non-leap year', () => {
  assert.equal(isMinorFromDob('2008-02-29', Date.UTC(2026, 1, 28, 12)), true);  // 2026-02-28: not yet
  assert.equal(isMinorFromDob('2008-02-29', Date.UTC(2026, 2, 1, 12)), false);  // 2026-03-01: adult
  assert.equal(isMinorFromDob('2012-02-29', Date.UTC(2026, 1, 28, 12)), true);  // still 13
});

// ⚠ The REFERENCE date can be a leap day too — and that is the case the original
// vectors missed, because they only ever varied the BIRTHDAY. Postgres clamps
// `2028-02-29 - interval '18 years'` to 2010-02-28; `Date.UTC(2010, 1, 29)` rolls
// forward to 2010-03-01. Unclamped, a member born 2010-03-01 read as an ADULT here
// (admitted) at 17 years 364 days. Both cutoffs verified against production Postgres.
test('a leap-day REFERENCE date clamps like Postgres rather than rolling forward', () => {
  const feb29 = Date.UTC(2028, 1, 29, 12);
  assert.equal(isMinorFromDob('2010-03-01', feb29), true);  // 17y364d — still a minor
  assert.equal(isMinorFromDob('2010-02-28', feb29), false); // adult by the clamped cutoff
  // The day they actually turn 18 — no clamp applies, and they read adult.
  assert.equal(isMinorFromDob('2010-03-01', Date.UTC(2028, 2, 1, 12)), false);
});

test('absence and junk are NULL — never coerced to adult', () => {
  for (const v of [null, undefined, '', '   ', 'not-a-date', '2008', '2008-08', '08/16/2008',
                   0, 1, {}, [], true, NaN, Symbol('x')]) {
    assert.equal(isMinorFromDob(v, NOW), null, `expected null for ${String(v)}`);
  }
});

test('a calendar-impossible date is NULL, never rolled forward (the Feb-30 trap)', () => {
  assert.equal(isMinorFromDob('2008-02-30', NOW), null);
  assert.equal(isMinorFromDob('2008-13-01', NOW), null);
  assert.equal(isMinorFromDob('2008-00-10', NOW), null);
  assert.equal(isMinorFromDob('2008-04-31', NOW), null);
});

test('surrounding whitespace is tolerated', () => {
  assert.equal(isMinorFromDob('  2008-08-16  ', NOW), false);
});

// ⚠ An unusable clock must never resolve to ADULT. A finite number can still be
// outside the Date range, and every field read then yields NaN — which falls
// through `born > NaN` as false, i.e. adult. Validating the resulting Date rather
// than the input number is what closes that.
test('an unusable clock yields NULL rather than a guess', () => {
  assert.equal(isMinorFromDob('2008-08-16', new Date(NaN)), null);
  assert.equal(isMinorFromDob('2008-08-16', NaN), null);
  assert.equal(isMinorFromDob('2008-08-16', 9e15), null);   // finite, past the Date range
  assert.equal(isMinorFromDob('2008-08-16', -9e15), null);
});

test('the gate is defined against 18, read at the westernmost offset', () => {
  assert.equal(ADULT_AGE_YEARS, 18);
  assert.equal(ADULT_REFERENCE_OFFSET_MS, 12 * 60 * 60 * 1000);
});
