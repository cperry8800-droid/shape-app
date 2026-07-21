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

// Every rate each origin has EVER been issued at, newest last. A checkout
// session is stamped from the constants above at session-CREATE time and can
// complete days later, so a rate change must ACCEPT the old rate on in-flight
// sessions — the row records what the member was actually charged. RATE-CHANGE
// RULE: append the new value to the origin's list and KEEP the old one (never
// replace), then update the constant it derives from.
export const ISSUED_FEE_BPS = Object.freeze({
  marketplace: Object.freeze([MARKETPLACE_FEE_BPS]),
  coach_invite: Object.freeze([BYO_FEE_BPS]),
  coach_link: Object.freeze([BYO_FEE_BPS]),
});

/**
 * Validate an (origin, fee_bps) pair read back off the wire (Stripe metadata)
 * as ONE atomic unit before it lands on a write-once money row.
 *
 * Origin and fee are only meaningful together: `marketplace/0` is a free ride
 * wearing the wrong label, `coach_invite/1500` is a BYO sale billed 15%.
 * Checkout only ever stamps an origin with a rate from ISSUED_FEE_BPS, so a
 * pair matching any issued rate for its origin passes through EXACTLY (a
 * session created at an old rate persists the rate it was charged); every
 * other combination is corrupted/mixed metadata and the WHOLE pair downgrades
 * to marketplace at the current rate — fail toward Shape's fee, and never
 * persist an origin that contradicts its rate. (Defense-in-depth: sessions are
 * created server-side and the webhook is signature-verified, so this guards
 * corruption, not a caller-editable surface.)
 *
 * @param {string} origin  already vetted against the known origin names
 * @param {number} feeBps  already strictly parsed (digits-only, fail-closed)
 * @returns {{ origin: ('marketplace'|'coach_invite'|'coach_link'), feeBps: number }}
 */
export function attributionPair(origin, feeBps) {
  const issued = ISSUED_FEE_BPS[origin];
  if (issued && issued.includes(feeBps)) return { origin, feeBps };
  return { origin: 'marketplace', feeBps: MARKETPLACE_FEE_BPS };
}
