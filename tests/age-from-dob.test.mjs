// The displayed age, pinned to the same clock the 18+ gate reads.
//
// ⚠ WHY THIS EXISTS SEPARATELY FROM THE MIRROR TEST. `tests/age-derive-mirror.test.mjs`
// proves the two implementations of the 18+ RULE answer identically. This proves the
// AGE derivation — a different question, and the one place a fourth copy of anniversary
// arithmetic could have crept in. There is deliberately no SQL twin of `ageFromDob`:
// Postgres CLAMPS an impossible anniversary while `Date.UTC` ROLLS it forward, and this
// repo has already shipped that divergence once. The date crosses to Node and this
// function decides, once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ageFromDob, isMinorFromDob, ADULT_REFERENCE_OFFSET_MS } from '../src/lib/age-derive.mjs';

const at = (iso) => Date.parse(iso);

test('age is whole years, read at the same UTC−12 day as the gate', () => {
  assert.equal(ageFromDob('1990-05-05', at('2026-08-22T12:00:00Z')), 36);

  // ⚠ THE BOUNDARY THE SHARED CLOCK BUYS. UTC−12 is the LAST zone to reach a day,
  // so at 06:00Z the reference day is still Aug 21 and the birthday has not happened
  // anywhere yet; by 13:00Z it has happened everywhere. Using a different clock here
  // than the gate uses would let the two disagree about whether someone's birthday
  // has occurred — one person, two answers.
  assert.equal(ageFromDob('1990-08-22', at('2026-08-22T06:00:00Z')), 35, 'not yet, anywhere');
  assert.equal(ageFromDob('1990-08-22', at('2026-08-22T13:00:00Z')), 36, 'now everywhere');
});

test('a Feb 29 birth CLAMPS to Feb 28 in a non-leap year, never rolls to Mar 1', () => {
  // Rolling forward would leave a leap-day member reading a year younger for one
  // day — and would disagree with Postgres, which clamps.
  assert.equal(ageFromDob('2008-02-29', at('2027-02-27T20:00:00Z')), 18, 'day before');
  assert.equal(ageFromDob('2008-02-29', at('2027-02-28T20:00:00Z')), 19, 'clamped anniversary');
  assert.equal(ageFromDob('2008-02-29', at('2028-02-29T20:00:00Z')), 20, 'real leap-day anniversary');
});

test('absence is null, never a fabricated number', () => {
  for (const bad of [null, undefined, 42, {}, [], '', 'not-a-date', '1990-5-5', ' 1990-05-05x']) {
    assert.equal(ageFromDob(bad, at('2026-08-22T12:00:00Z')), null, `rejects ${JSON.stringify(bad)}`);
  }
  // Calendar-impossible dates are rejected rather than rolled (Feb 30 → Mar 2 is the
  // Date.parse trap this repo has been bitten by).
  assert.equal(ageFromDob('2026-02-30', at('2026-08-22T12:00:00Z')), null);
  // A future birthdate has no age. Null, not a negative number: rendering nothing
  // beats rendering "-3".
  assert.equal(ageFromDob('2099-01-01', at('2026-08-22T12:00:00Z')), null);
});

test('an unreadable clock yields null, not an age', () => {
  // A finite input can still be outside the Date range; every field read then yields
  // NaN, which would fall through the comparisons and fabricate an age.
  assert.equal(ageFromDob('1990-05-05', 9e15), null);
  assert.equal(ageFromDob('1990-05-05', -9e15), null);
});

test('born today reads 0, which is a real answer and not absence', () => {
  assert.equal(ageFromDob('2026-08-22', at('2026-08-22T13:00:00Z')), 0);
});

test('age and the 18+ gate agree about the same person on the same instant', () => {
  // ⚠ THE PROPERTY THAT MATTERS, swept rather than spot-checked: for any birthdate,
  // `age < 18` must equal `isMinorFromDob`. A deterministic sweep across the
  // eighteenth-birthday boundary — the only place they could diverge — plus the
  // leap-day case that has actually broken before.
  const now = at('2026-08-22T13:00:00Z');
  const ref = new Date(now - ADULT_REFERENCE_OFFSET_MS);
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  let checked = 0;
  for (let offset = -400; offset <= 400; offset += 1) {
    const b = new Date(Date.UTC(ref.getUTCFullYear() - 18, ref.getUTCMonth(), ref.getUTCDate() + offset));
    const dob = iso(b.getUTCFullYear(), b.getUTCMonth() + 1, b.getUTCDate());
    const age = ageFromDob(dob, now);
    const minor = isMinorFromDob(dob, now);
    assert.notEqual(age, null, `${dob} should have an age`);
    assert.equal(age < 18, minor, `${dob}: age ${age} vs isMinor ${minor}`);
    checked += 1;
  }
  assert.ok(checked === 801, `swept the whole boundary window, got ${checked}`);

  // The leap-day pair, on the exact instant that has diverged before.
  // ⚠ THE NON-NULL ASSERT IS WHAT MAKES THIS PAIR ABLE TO FAIL. `null < 18` is
  // true, so a regression of ageFromDob to null would satisfy the comparison on
  // both sides and this guard would report nothing — the sweep above asserts
  // non-null for exactly that reason, and the pair was missing it.
  const leapNow = at('2028-02-29T13:00:00Z');
  for (const dob of ['2010-03-01', '2010-02-28']) {
    const age = ageFromDob(dob, leapNow);
    assert.notEqual(age, null, `${dob} should have an age`);
    assert.equal(age < 18, isMinorFromDob(dob, leapNow), `${dob}: age ${age}`);
  }
});
