// 18+ age derivation — the birthday boundary, which is where an off-by-one
// hides silently: one way refuses an adult forever, the other admits a minor.
//
// The bug these vectors exist for: `profiles.over_18` is written by a trigger
// that only fires on a profiles WRITE, so it is a snapshot from when the DOB was
// recorded. An account that signed up at 17 kept over_18=false past its
// eighteenth birthday, and the DOB freeze removed the self-service write that
// used to recompute it. The gate now derives from the date at read time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isMinorFromDob, ADULT_AGE_YEARS } from '../src/lib/age-derive.mjs';

const NOW = Date.UTC(2026, 7, 16); // 2026-08-16 UTC

test('exactly 18 today is an ADULT — the trigger uses dob <= today - 18y', () => {
  assert.equal(isMinorFromDob('2008-08-16', NOW), false);
});

test('one day short of the eighteenth birthday is still a minor', () => {
  assert.equal(isMinorFromDob('2008-08-17', NOW), true);
});

test('the day after turning 18 is an adult', () => {
  assert.equal(isMinorFromDob('2008-08-15', NOW), false);
});

test('the stale-snapshot case: a 17-year-old signup reads adult once the birthday passes', () => {
  const dob = '2008-12-01';
  // Recorded while under 18 — this is what wrote over_18 = false.
  assert.equal(isMinorFromDob(dob, Date.UTC(2026, 7, 16)), true);
  // After the birthday the SAME row derives adult, with no write in between.
  assert.equal(isMinorFromDob(dob, Date.UTC(2026, 11, 2)), false);
});

test('clearly-adult and clearly-minor dates', () => {
  assert.equal(isMinorFromDob('1990-01-01', NOW), false);
  assert.equal(isMinorFromDob('2015-06-30', NOW), true);
});

// A Feb-29 birthday in a non-leap year: 2026 has no Feb 29, and this rule
// (dob <= today - 18y, the trigger's own comparison) makes the transition land
// on Mar 1 rather than Feb 28. Asserted explicitly because it is the one case
// where "turned 18" has no single obvious date — and because the JS derivation
// and the SQL trigger MUST agree here or the two gates disagree about a person.
test('a leap-day birthday transitions on Mar 1 in a non-leap year', () => {
  assert.equal(isMinorFromDob('2008-02-29', Date.UTC(2026, 1, 28)), true);  // 2026-02-28: not yet
  assert.equal(isMinorFromDob('2008-02-29', Date.UTC(2026, 2, 1)), false);  // 2026-03-01: adult
  assert.equal(isMinorFromDob('2012-02-29', Date.UTC(2026, 1, 28)), true);  // still 13
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

test('an unusable clock yields NULL rather than a guess', () => {
  assert.equal(isMinorFromDob('2008-08-16', new Date(NaN)), null);
});

test('the gate is defined against 18', () => {
  assert.equal(ADULT_AGE_YEARS, 18);
});
