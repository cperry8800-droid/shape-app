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
