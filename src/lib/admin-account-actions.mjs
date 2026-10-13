// src/lib/admin-account-actions.mjs
//
// The rules behind the admin console's account actions (src/app/admin/accounts): who may be
// acted on, what a reason and a removal confirmation must be, and which Stripe subscriptions a
// removal cancels first. Pure apart from cancelSubscriptions, which is handed the Stripe client,
// so tests/admin-account-actions.test.mjs drives every rule directly.

import { atLeast } from './staff-levels.mjs';

/** The lowest staff level for each account action. */
export const ACCOUNT_ACTION_LEVELS = {
  view: 'support',
  freeze: 'support',
  unfreeze: 'support',
  handle_request: 'support',
  suspend_listing: 'admin',
  lift_listing: 'admin',
  remove: 'admin',
};

export function canDoAccountAction(level, action) {
  const min = ACCOUNT_ACTION_LEVELS[action];
  return Boolean(min) && atLeast(level, min);
}

/**
 * Why staff may not freeze, suspend or remove this account, or '' when they may.
 *   'self'   nobody acts on their own account from the console
 *   'owner'  an owner is never acted on (owners are named in code, not rows)
 *   'staff'  someone with a staff level is acted on by an owner only; anyone else removes them
 *            from staff first (the Staff page is owner only)
 */
export function accountRefusal({ actorId, actorLevel, targetId, targetEmail, ownerEmails, targetStaffLevel } = {}) {
  if (!targetId || targetId === actorId) return 'self';
  const email = String(targetEmail || '').trim().toLowerCase();
  const owners = (Array.isArray(ownerEmails) ? ownerEmails : []).map((e) => String(e || '').trim().toLowerCase());
  if (email && owners.includes(email)) return 'owner';
  if (targetStaffLevel && actorLevel !== 'owner') return 'staff';
  return '';
}

export const REASON_MIN = 3;
export const REASON_MAX = 500;

/** A typed reason on one line, or '' when it is too short to say anything. */
export function cleanReason(value) {
  const r = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, REASON_MAX);
  return r.length >= REASON_MIN ? r : '';
}

/**
 * A removal goes through only when the staff member typed the account's email (any case,
 * surrounding spaces ignored), or its id when it has no email.
 */
export function confirmsRemoval(typed, { id, email } = {}) {
  const t = String(typed ?? '').trim().toLowerCase();
  if (!t) return false;
  const want = String(email || '').trim().toLowerCase() || String(id || '').trim().toLowerCase();
  return Boolean(want) && t === want;
}

/** Statuses on which Stripe can still charge. canceled and incomplete_expired cannot. */
export const BILLING_STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'];

/** The Stripe subscription ids a removal cancels: each once, only those that can still charge. */
export function subscriptionsToCancel(rows) {
  const ids = new Set();
  for (const r of Array.isArray(rows) ? rows : []) {
    const id = String(r?.stripe_subscription_id || '').trim();
    if (id && BILLING_STATUSES.includes(r?.status)) ids.add(id);
  }
  return [...ids];
}

const ENDED = new Set(['canceled', 'incomplete_expired']);

/**
 * Cancels each subscription now. One Stripe has never heard of, or that has already ended,
 * counts as done: nothing will charge on it. Anything else that fails is returned in `failed`,
 * and the caller erases nothing.
 */
export async function cancelSubscriptions(stripe, ids) {
  const cancelled = [];
  const failed = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    try {
      await stripe.subscriptions.cancel(id);
      cancelled.push(id);
    } catch (e) {
      if (e?.code === 'resource_missing') continue;
      let ended = false;
      try {
        const sub = await stripe.subscriptions.retrieve(id);
        ended = ENDED.has(sub?.status);
      } catch {
        ended = false;
      }
      if (!ended) failed.push(id);
    }
  }
  return { cancelled, failed };
}

export const REQUEST_OUTCOMES = ['done', 'declined'];

export function parseRequestOutcome(value) {
  const v = String(value ?? '').trim().toLowerCase();
  return REQUEST_OUTCOMES.includes(v) ? v : '';
}

/** A request's note: one line, at most 500 characters, '' for none (a note is optional). */
export function cleanNote(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, REASON_MAX);
}
