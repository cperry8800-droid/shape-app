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

/**
 * The Stripe subscriptions a removal cancels: each once, only those that can still charge, each
 * with the account it lives on, as [{ id, account }]. A row's `stripe_account_id` says where: an
 * acct_ id is a coach's own account (a direct charge), null is Shape's platform account. ⚠ A row
 * WITHOUT the key (undefined: its account could not be read) is "account unknown", which
 * cancelSubscriptions treats strictly. Of two rows for one subscription, a known account wins.
 */
export function subscriptionsToCancel(rows) {
  const out = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const id = String(r?.stripe_subscription_id || '').trim();
    if (!id || !BILLING_STATUSES.includes(r?.status)) continue;
    const account = r?.stripe_account_id === undefined ? undefined : String(r.stripe_account_id || '').trim() || null;
    if (!out.has(id) || out.get(id).account === undefined) out.set(id, { id, account });
  }
  return [...out.values()];
}

const ENDED = new Set(['canceled', 'incomplete_expired']);

/**
 * Cancels each subscription now, on the account it lives on. One that has already ended counts as
 * done: nothing will charge on it. One Stripe has never heard of counts as done ONLY when its
 * account was known (an acct_ id, or null for the platform), so it was looked for where it lives.
 * ⚠ Asked on the wrong account, every direct charge reads "no such subscription", and the removal
 * would erase a member a coach's account still charges every month. With the account unknown
 * (undefined, or a bare id) a missing subscription is a failure. Anything that fails is returned in
 * `failed`, and the caller erases nothing.
 */
export async function cancelSubscriptions(stripe, items) {
  const cancelled = [];
  const failed = [];
  for (const item of Array.isArray(items) ? items : []) {
    const id = typeof item === 'string' ? item : item?.id;
    if (!id) continue;
    const account = typeof item === 'string' ? undefined : item.account;
    const opts = account ? { stripeAccount: account } : undefined;
    try {
      await stripe.subscriptions.cancel(id, undefined, opts);
      cancelled.push(id);
    } catch (e) {
      if (e?.code === 'resource_missing' && account !== undefined) continue;
      let ended = false;
      try {
        const sub = await stripe.subscriptions.retrieve(id, undefined, opts);
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
