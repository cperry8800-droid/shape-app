// src/lib/coach-origin.mjs — framework-free origin→fee decision (unit-tested).
//
// The PURE half of BYO origin resolution: given the resolved account state
// (is the client on this coach's waitlist? what channel, if any, is their
// unexpired bound referral?), decide the immutable `origin` and the resolved
// `fee_bps`. The DB reads (waitlist, bound-row lookup, the bind touch) live in
// ./coach-origin.ts, which feeds this the state. Both the resolver and the tests
// import THIS module — one implementation, no drift.

import { PLATFORM_FEE_RATE, BYO_FEE_RATE, rateToBps } from './platform-fee.mjs';

// The three immutable origins and the rate each pays. Derived from the fee rates
// so origin ⇄ fee can never disagree with the money math.
export const MARKETPLACE_FEE_BPS = rateToBps(PLATFORM_FEE_RATE); // 1500
export const BYO_FEE_BPS = rateToBps(BYO_FEE_RATE);              // 0

/**
 * Map the resolved account state to the checkout origin + fee.
 *
 * Waitlist wins, full stop (a member on the coach's waiting room found them on
 * Shape — Shape-originated demand, never BYO). Otherwise the channel of an
 * UNEXPIRED client-bound referral decides: 'dm' → coach_invite, 'link' →
 * coach_link. Anything else (no bound row, expired, or a cross-provider token
 * that never bound for THIS provider — all surfaced here as boundChannel null)
 * → marketplace. Fail toward Shape's fee, never toward a free ride.
 *
 * @param {{ onWaitlist: boolean, boundChannel: ('dm'|'link'|null|undefined) }} state
 * @returns {{ origin: ('marketplace'|'coach_invite'|'coach_link'), feeBps: number }}
 */
export function resolveOriginDecision({ onWaitlist, boundChannel }) {
  if (onWaitlist) return { origin: 'marketplace', feeBps: MARKETPLACE_FEE_BPS };
  if (boundChannel === 'dm') return { origin: 'coach_invite', feeBps: BYO_FEE_BPS };
  if (boundChannel === 'link') return { origin: 'coach_link', feeBps: BYO_FEE_BPS };
  return { origin: 'marketplace', feeBps: MARKETPLACE_FEE_BPS };
}

/**
 * Validate an (origin, fee_bps) pair read back off the wire (Stripe metadata)
 * as ONE atomic unit before it lands on a write-once money row.
 *
 * Origin and fee are only meaningful together: `marketplace/0` is a free ride
 * wearing the wrong label, `coach_invite/1500` is a BYO sale billed 15%.
 * Checkout only ever stamps the pairs this function accepts, so any other
 * combination is corrupted/hand-crafted metadata — the WHOLE pair downgrades to
 * marketplace at the full rate (fail toward Shape's fee, and never persist an
 * origin that contradicts its rate). KEEP IN SYNC: a future rate change (new
 * MARKETPLACE_FEE_BPS / BYO_FEE_BPS value) changes what checkout stamps, and
 * in-flight sessions created at the OLD rate will downgrade to the new
 * marketplace pair here — acceptable for a fee decrease, revisit before any
 * other kind of change.
 *
 * @param {string} origin  already vetted against the known origin names
 * @param {number} feeBps  already strictly parsed (digits-only, fail-closed)
 * @returns {{ origin: ('marketplace'|'coach_invite'|'coach_link'), feeBps: number }}
 */
export function attributionPair(origin, feeBps) {
  if ((origin === 'coach_invite' || origin === 'coach_link') && feeBps === BYO_FEE_BPS) {
    return { origin, feeBps };
  }
  if (origin === 'marketplace' && feeBps === MARKETPLACE_FEE_BPS) {
    return { origin, feeBps };
  }
  return { origin: 'marketplace', feeBps: MARKETPLACE_FEE_BPS };
}
