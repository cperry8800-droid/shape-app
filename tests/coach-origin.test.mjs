// tests/coach-origin.test.mjs — the pure origin→fee decision.
// The DB reads (waitlist, the coach's existing-client list, an in-flight tag) live in the RPC
// resolve_coach_checkout_origin (2026-11-12-coach-existing-clients.sql, run for real in
// tests/coach-existing-clients-sql.test.mjs); this covers the mapping every checkout site depends on.
// The rule (owner, 2026-11-12): 15% on clients who sign up through Shape, 0% on a coach's existing
// clients. No tag / expired / cross-provider all surface to the decision as boundChannel === null.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveOriginDecision,
  attributionPair,
  ISSUED_FEE_BPS,
  MARKETPLACE_FEE_BPS,
  BYO_FEE_BPS,
  KNOWN_ORIGINS,
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

test('a client on the coach\'s existing-client list → coach_existing at 0%', () => {
  assert.deepEqual(resolveOriginDecision({ onWaitlist: false, onExistingList: true, boundChannel: null }), {
    origin: 'coach_existing',
    feeBps: 0,
  });
  // The list wins over an in-flight tag: both 0%, and the list says why.
  assert.deepEqual(resolveOriginDecision({ onWaitlist: false, onExistingList: true, boundChannel: 'dm' }), {
    origin: 'coach_existing',
    feeBps: 0,
  });
});

test('waitlist wins over the existing-client list too', () => {
  assert.deepEqual(resolveOriginDecision({ onWaitlist: true, onExistingList: true, boundChannel: null }), {
    origin: 'marketplace',
    feeBps: 1500,
  });
});

test('only a real true counts as listed: anything else is not on the list', () => {
  for (const onExistingList of [undefined, null, false, 'true', 1]) {
    assert.deepEqual(resolveOriginDecision({ onWaitlist: false, onExistingList, boundChannel: null }), {
      origin: 'marketplace',
      feeBps: 1500,
    }, String(onExistingList));
  }
});

// The 2026-07-21 tags, honoured until they expire (owner, 2026-11-12); none is written after it.
test('an in-flight invite tag (channel dm) → coach_invite at 0%', () => {
  assert.deepEqual(resolveOriginDecision({ onWaitlist: false, boundChannel: 'dm' }), {
    origin: 'coach_invite',
    feeBps: 0,
  });
});

test('an in-flight link tag (channel link) → coach_link at 0%', () => {
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

test('attributionPair: the supported pairs pass through untouched', () => {
  assert.deepEqual(attributionPair('marketplace', 1500), { origin: 'marketplace', feeBps: 1500 });
  assert.deepEqual(attributionPair('coach_invite', 0), { origin: 'coach_invite', feeBps: 0 });
  assert.deepEqual(attributionPair('coach_link', 0), { origin: 'coach_link', feeBps: 0 });
  assert.deepEqual(attributionPair('coach_existing', 0), { origin: 'coach_existing', feeBps: 0 });
});

test('attributionPair: incoherent pairs downgrade WHOLE to marketplace/1500', () => {
  // A defaulted/garbage origin next to a genuine "0" fee — the free-ride vector:
  // must never persist marketplace at 0 bps.
  assert.deepEqual(attributionPair('marketplace', 0), { origin: 'marketplace', feeBps: 1500 });
  // A BYO origin next to fail-closed fee metadata: must never persist a BYO
  // label billed at 1500 (attribution ≠ rate on a write-once row).
  assert.deepEqual(attributionPair('coach_invite', 1500), { origin: 'marketplace', feeBps: 1500 });
  assert.deepEqual(attributionPair('coach_link', 1500), { origin: 'marketplace', feeBps: 1500 });
  assert.deepEqual(attributionPair('coach_existing', 1500), { origin: 'marketplace', feeBps: 1500 });
  // A name that is not an origin, including one an object carries by inheritance.
  assert.deepEqual(attributionPair('coach_brought', 0), { origin: 'marketplace', feeBps: 1500 });
  assert.deepEqual(attributionPair('constructor', 0), { origin: 'marketplace', feeBps: 1500 });
  // Off-menu rates never survive under any origin.
  assert.deepEqual(attributionPair('marketplace', 500), { origin: 'marketplace', feeBps: 1500 });
  assert.deepEqual(attributionPair('coach_invite', 1), { origin: 'marketplace', feeBps: 1500 });
});

test('attributionPair: every ISSUED rate passes through exactly (historical rates preserved)', () => {
  // The rate-change contract: an origin's list holds every rate ever stamped at
  // checkout, and a pair matching ANY of them persists unchanged — so a rate
  // change (append, never replace) can't rewrite in-flight old-rate sessions.
  for (const [origin, rates] of Object.entries(ISSUED_FEE_BPS)) {
    for (const feeBps of rates) {
      assert.deepEqual(attributionPair(origin, feeBps), { origin, feeBps });
    }
  }
  // The current constants are always issued rates.
  assert.ok(ISSUED_FEE_BPS.marketplace.includes(MARKETPLACE_FEE_BPS));
  assert.ok(ISSUED_FEE_BPS.coach_invite.includes(BYO_FEE_BPS));
  assert.ok(ISSUED_FEE_BPS.coach_link.includes(BYO_FEE_BPS));
  assert.ok(ISSUED_FEE_BPS.coach_existing.includes(BYO_FEE_BPS));
});

test('ISSUED_FEE_BPS keeps every rate it ever issued (append, never remove)', () => {
  // The rates each origin had been issued at by 2026-11-12. A later change appends to these lists.
  const EVER = { marketplace: [1500], coach_invite: [0], coach_link: [0], coach_existing: [0] };
  for (const [origin, rates] of Object.entries(EVER)) {
    for (const r of rates) assert.ok(ISSUED_FEE_BPS[origin]?.includes(r), `${origin} lost ${r}`);
  }
  assert.deepEqual([...KNOWN_ORIGINS].sort(), Object.keys(EVER).sort());
});
