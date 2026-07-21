// tests/platform-fee.test.mjs — rate-aware fee math.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLATFORM_FEE_RATE,
  BYO_FEE_RATE,
  bpsToRate,
  bpsToPercent,
  rateToBps,
  parseFeeBpsMeta,
  coachCutCents,
  maxCreditCents,
  feeSplit,
} from '../src/lib/platform-fee.mjs';

test('rate constants', () => {
  assert.equal(PLATFORM_FEE_RATE, 0.15);
  assert.equal(BYO_FEE_RATE, 0);
});

test('bps ⇄ rate/percent conversions are defined once and consistent', () => {
  assert.equal(bpsToRate(1500), 0.15);
  assert.equal(bpsToRate(0), 0);
  assert.equal(bpsToPercent(1500), 15);
  assert.equal(bpsToPercent(0), 0);
  assert.equal(rateToBps(0.15), 1500);
  assert.equal(rateToBps(0), 0);
});

test('bps validation rejects out-of-range / non-integer', () => {
  assert.throws(() => bpsToRate(10001));
  assert.throws(() => bpsToRate(-1));
  assert.throws(() => bpsToRate(1.5));
  assert.throws(() => rateToBps(1.2));
});

test('parseFeeBpsMeta: strict digit-string parse, fails closed to 1500', () => {
  assert.equal(parseFeeBpsMeta('1500'), 1500);
  assert.equal(parseFeeBpsMeta('0'), 0); // a genuine stored BYO zero passes
  assert.equal(parseFeeBpsMeta(' 750 '), 750); // tolerant of whitespace
  // The Number('') === 0 hole: empty/absent/malformed must NEVER read as 0%.
  assert.equal(parseFeeBpsMeta(''), 1500);
  assert.equal(parseFeeBpsMeta(undefined), 1500);
  assert.equal(parseFeeBpsMeta(null), 1500);
  assert.equal(parseFeeBpsMeta('abc'), 1500);
  assert.equal(parseFeeBpsMeta('-1'), 1500);
  assert.equal(parseFeeBpsMeta('1.5'), 1500);
  assert.equal(parseFeeBpsMeta('99999'), 1500); // >10000 → fail closed
});

test('coachCutCents: standard 85%, BYO 100%', () => {
  assert.equal(coachCutCents(20000), 17000); // default 15%
  assert.equal(coachCutCents(20000, PLATFORM_FEE_RATE), 17000);
  assert.equal(coachCutCents(20000, BYO_FEE_RATE), 20000); // BYO: coach keeps all
});

test('maxCreditCents: 15% cut at standard, ZERO at BYO (no-credit rule by the math)', () => {
  assert.equal(maxCreditCents(20000), 3000); // default 15%
  assert.equal(maxCreditCents(20000, BYO_FEE_RATE), 0); // AC#12: caps at 0 by the math
});

test('feeSplit: standard rate takes 15% on a full charge', () => {
  const s = feeSplit(20000);
  assert.equal(s.applicationFeeCents, 3000);
  assert.equal(s.coachTopupCents, 0);
});

test('feeSplit: store credit is absorbed by the fee (charge < gross, no top-up)', () => {
  // Credit capped at the 15% cut → charge 17000 exactly covers the coach cut.
  const s = feeSplit(20000, 17000, PLATFORM_FEE_RATE);
  assert.equal(s.applicationFeeCents, 0);
  assert.equal(s.coachTopupCents, 0);
});

test('feeSplit: BYO rate 0 takes NOTHING (Shape absorbs Stripe processing)', () => {
  const s = feeSplit(20000, 20000, BYO_FEE_RATE);
  assert.equal(s.applicationFeeCents, 0);
  assert.equal(s.coachTopupCents, 0);
});

test('feeSplit rejects a negative amount (fail loud, never a wrong split)', () => {
  assert.throws(() => feeSplit(-1));
  assert.throws(() => feeSplit(20000, -1));
});
