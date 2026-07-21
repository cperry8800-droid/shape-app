// tests/coach-origin.test.mjs — the pure origin→fee decision.
// The DB reads (waitlist, bound-row lookup, bind touch) live in coach-origin.ts;
// this covers the mapping every checkout site depends on. Expired / cross-provider
// / no-referral all surface to the decision as boundChannel === null.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveOriginDecision,
  MARKETPLACE_FEE_BPS,
  BYO_FEE_BPS,
} from '../src/lib/coach-origin.mjs';

test('fee-bps constants tie to the fee rates (1500 / 0)', () => {
  assert.equal(MARKETPLACE_FEE_BPS, 1500);
  assert.equal(BYO_FEE_BPS, 0);
});

test('waitlist wins, full stop — even with an unexpired bound referral', () => {
  // AC#4: a waitlist first-dibs conversion is marketplace even when a bound
  // referral exists for the same coach↔client pair.
  assert.deepEqual(resolveOriginDecision({ onWaitlist: true, boundChannel: 'dm' }), {
    origin: 'marketplace',
    feeBps: 1500,
  });
  assert.deepEqual(resolveOriginDecision({ onWaitlist: true, boundChannel: 'link' }), {
    origin: 'marketplace',
    feeBps: 1500,
  });
});

test('an in-app invite (channel dm) → coach_invite at 0%', () => {
  assert.deepEqual(resolveOriginDecision({ onWaitlist: false, boundChannel: 'dm' }), {
    origin: 'coach_invite',
    feeBps: 0,
  });
});

test('a ref link (channel link) → coach_link at 0%', () => {
  assert.deepEqual(resolveOriginDecision({ onWaitlist: false, boundChannel: 'link' }), {
    origin: 'coach_link',
    feeBps: 0,
  });
});

test('no bound row / expired / cross-provider (null) → marketplace at 15%', () => {
  assert.deepEqual(resolveOriginDecision({ onWaitlist: false, boundChannel: null }), {
    origin: 'marketplace',
    feeBps: 1500,
  });
  assert.deepEqual(resolveOriginDecision({ onWaitlist: false, boundChannel: undefined }), {
    origin: 'marketplace',
    feeBps: 1500,
  });
});
