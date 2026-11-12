// src/lib/coach-origin.mjs — framework-free origin→fee decision (unit-tested).
//
// The PURE half of checkout origin resolution: given the resolved account state
// (is the client on this coach's waitlist? on the coach's existing-client list?
// holding an in-flight tag from before 2026-11-12?), decide the immutable
// `origin` and the resolved `fee_bps`. The DB reads live in the RPC
// resolve_coach_checkout_origin (supabase-migrations/2026-11-12-coach-existing-clients.sql),
// which ./coach-origin.ts calls. The tests hold this module and that SQL to each other.
//
// THE RULE (owner, 2026-11-12): "Shape takes 15% cut on clients that sign up through Shape.
// Existing clients, Shape takes no cut from." A coach finds clients on Shape or invites their own;
// both pay 15% when they sign up through Shape. Only a client the coach already had before joining
// Shape pays 0%, and that is a client on the coach's existing-client list: emails the coach lists
// within 60 days of joining (for a coach who joined before 2026-11-12, of 2026-11-12), matched to
// the member's confirmed account email at checkout. Before this, under the 2026-07-21 ruling, any
// client who subscribed within 30 days of the coach's invite or link paid 0%; a tag from then that
// is still live when the migration runs is honoured until it expires (owner, 2026-11-12), and none
// is written or extended after.

import { PLATFORM_FEE_RATE, BYO_FEE_RATE, rateToBps } from './platform-fee.mjs';

// The origins and the rate each pays now. Derived from the fee rates so origin ⇄ fee can never
// disagree with the money math.
export const MARKETPLACE_FEE_BPS = rateToBps(PLATFORM_FEE_RATE); // 1500
export const BYO_FEE_BPS = rateToBps(BYO_FEE_RATE);              // 0: existing clients, and the in-flight tags

// The existing-client list's window (the SQL's coach_existing_clients_closes_at): open for
// EXISTING_CLIENTS_WINDOW_DAYS from the later of the day the coach joined Shape (the provider row's
// created_at) and the day the rule began.
export const EXISTING_CLIENTS_RULE_START = '2026-11-12T00:00:00.000Z';
export const EXISTING_CLIENTS_WINDOW_DAYS = 60;

/**
 * When a coach's existing-client list closes, as an ISO instant.
 * @param {string|number|Date|null|undefined} joinedAt  the provider row's created_at (null: unknown)
 * @returns {string}
 */
export function existingClientsClosesAt(joinedAt) {
  const start = Date.parse(EXISTING_CLIENTS_RULE_START);
  const joined = joinedAt == null ? NaN : new Date(joinedAt).getTime();
  const from = Number.isFinite(joined) && joined > start ? joined : start;
  return new Date(from + EXISTING_CLIENTS_WINDOW_DAYS * 86400000).toISOString();
}

/**
 * Map the resolved account state to the checkout origin + fee, in the RPC's order:
 *   1. on the coach's waitlist → marketplace (Shape-found demand, whatever else is true);
 *   2. on the coach's existing-client list → coach_existing at 0%;
 *   3. an unexpired tag from before the rule changed: 'dm' → coach_invite, 'link' → coach_link, 0%;
 *   4. anything else → marketplace at 15%. Fail toward Shape's fee, never toward a free ride.
 *
 * @param {{ onWaitlist: boolean, onExistingList?: boolean, boundChannel?: ('dm'|'link'|null) }} state
 * @returns {{ origin: ('marketplace'|'coach_existing'|'coach_invite'|'coach_link'), feeBps: number }}
 */
export function resolveOriginDecision({ onWaitlist, onExistingList, boundChannel }) {
  if (onWaitlist) return { origin: 'marketplace', feeBps: MARKETPLACE_FEE_BPS };
  if (onExistingList === true) return { origin: 'coach_existing', feeBps: BYO_FEE_BPS };
  if (boundChannel === 'dm') return { origin: 'coach_invite', feeBps: BYO_FEE_BPS };
  if (boundChannel === 'link') return { origin: 'coach_link', feeBps: BYO_FEE_BPS };
  return { origin: 'marketplace', feeBps: MARKETPLACE_FEE_BPS };
}

// Every rate each origin has EVER been issued at, newest last. A checkout
// session is stamped from the constants above at session-CREATE time and can
// complete days later, so a rate change must ACCEPT the old rate on in-flight
// sessions — the row records what the member was actually charged. RATE-CHANGE
// RULE: append the new value to the origin's list and KEEP the old one (never
// replace), then update the constant it derives from. A new origin gets its own
// list; an origin no longer issued keeps its list (coach_invite and coach_link
// are issued only to in-flight tags from 2026-11-12, and their rows keep 0%).
export const ISSUED_FEE_BPS = Object.freeze({
  marketplace: Object.freeze([MARKETPLACE_FEE_BPS]),
  coach_invite: Object.freeze([BYO_FEE_BPS]),
  coach_link: Object.freeze([BYO_FEE_BPS]),
  coach_existing: Object.freeze([BYO_FEE_BPS]),
});

/** The origin names a checkout can stamp (the money rows' origin check holds the same four). */
export const KNOWN_ORIGINS = Object.freeze(Object.keys(ISSUED_FEE_BPS));

/**
 * Validate an (origin, fee_bps) pair read back off the wire (Stripe metadata)
 * as ONE atomic unit before it lands on a write-once money row.
 *
 * Origin and fee are only meaningful together: `marketplace/0` is a free ride
 * wearing the wrong label, `coach_existing/1500` is an existing client billed 15%.
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
 * @returns {{ origin: ('marketplace'|'coach_existing'|'coach_invite'|'coach_link'), feeBps: number }}
 */
export function attributionPair(origin, feeBps) {
  const issued = Object.prototype.hasOwnProperty.call(ISSUED_FEE_BPS, origin) ? ISSUED_FEE_BPS[origin] : null;
  if (issued && issued.includes(feeBps)) return { origin, feeBps };
  return { origin: 'marketplace', feeBps: MARKETPLACE_FEE_BPS };
}
