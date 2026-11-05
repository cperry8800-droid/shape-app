// A coach plan's cancellation, kept on its subscriptions row (2026-11-05;
// supabase-migrations/2026-11-05-subscription-cancellations.sql).
//
// What Stripe says about it (the webhook and the backfill write it, from the Subscription object):
// whether it is set to end and when, when it was asked for, when it ended, and Stripe's
// cancellation_details. And what the member said: the owner chose Shape's own question (2026-11-05,
// "user types response"), asked in Shape's cancel step (POST /api/stripe/cancel-plan): one optional
// free-text answer, stored with its time. ⚠ It is the member's own words: the coach whose plan it was
// reads it (Retention, "Why did people leave?"), and Shape; no other coach and nothing public.
//
// Pure: rows and Stripe objects in, values out. Imported by relative path.

/** The most a member's reason may hold, where it is typed and in the database. */
export const MEMBER_REASON_MAX = 500;
// Stripe's own comment field takes more; the column holds 5,000.
const STRIPE_COMMENT_MAX = 5000;

const iso = (sec) => (Number.isFinite(sec) && sec > 0 ? new Date(sec * 1000).toISOString() : null);
const text = (v, max) => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
};

/**
 * A member's typed reason, cleaned: control characters out (a line break stays), runs of blank lines
 * shortened, trimmed and cut to MEMBER_REASON_MAX. null when nothing is left: the question is optional.
 */
export function memberReason(raw) {
  if (raw == null) return null;
  const s = String(raw)
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!s) return null;
  return [...s].slice(0, MEMBER_REASON_MAX).join('').trim() || null;
}

/** The cancellation columns from a Stripe Subscription, as the row stores them. */
export function cancellationPatch(sub) {
  const d = (sub && sub.cancellation_details) || {};
  return {
    cancel_at_period_end: !!(sub && sub.cancel_at_period_end),
    cancel_at: iso(sub && sub.cancel_at),
    canceled_at: iso(sub && sub.canceled_at),
    ended_at: iso(sub && sub.ended_at),
    cancellation_reason: text(d.reason, 100),
    cancellation_feedback: text(d.feedback, 100),
    cancellation_comment: text(d.comment, STRIPE_COMMENT_MAX),
  };
}

/** The columns a database before the migration doesn't have: a write retries without them. */
export const CANCELLATION_COLUMNS = Object.freeze([
  'cancel_at_period_end', 'cancel_at', 'canceled_at', 'ended_at',
  'cancellation_reason', 'cancellation_feedback', 'cancellation_comment', 'cancel_synced_at',
  'member_cancel_reason', 'member_cancel_reason_at',
]);

/** `patch` without the cancellation columns. */
export function withoutCancellation(patch) {
  const out = { ...patch };
  for (const c of CANCELLATION_COLUMNS) delete out[c];
  return out;
}

/**
 * Whether a cancellation write from a Stripe event at `eventSec` may land on a row last written at
 * `storedAt` (cancel_synced_at). ⚠ AN OLDER EVENT DELIVERED LATE MUST NOT UNDO A NEWER ONE: Stripe
 * retries and doesn't promise order, so an update from before a member cancelled, arriving after it,
 * would read "renews" again. A row never written (null, or a database before the column) takes it;
 * `final` (the subscription was deleted) always lands.
 */
export function cancellationLands(storedAt, eventSec, final = false) {
  if (final) return true;
  if (storedAt == null || storedAt === '') return true;
  const stored = new Date(String(storedAt)).getTime();
  if (!Number.isFinite(stored) || !Number.isFinite(eventSec)) return true;
  return eventSec * 1000 >= Math.floor(stored / 1000) * 1000;
}

/** When a set-to-end plan ends: Stripe's cancel_at, else the period's end. null when it renews. */
export function planEndsAt(row) {
  if (!row) return null;
  if (row.cancel_at) return String(row.cancel_at);
  if (row.cancel_at_period_end === true) return row.current_period_end ? String(row.current_period_end) : null;
  return null;
}

/**
 * For the coach roster and the signals engine (P2): whether a client's open plans with this coach
 * are ALL set to end, and the last of their end dates.
 *   planEnding  true: every open plan ends (they are leaving) · false: one renews · null: unknown (a
 *               row not synced yet, or a database before the migration, which can't say either way)
 *   planEndsAt  ISO, when planEnding is true
 * A client with one plan ending and another renewing is not leaving.
 */
export function planEndingOf(rows) {
  const open = (rows || []).filter(Boolean);
  if (!open.length) return { planEnding: null, planEndsAt: null };
  let last = null;
  let unknown = false;
  for (const r of open) {
    const ends = planEndsAt(r);
    if (ends) { if (!last || new Date(ends).getTime() > new Date(last).getTime()) last = ends; continue; }
    // Neither flag set: renews, if the row has been synced at all.
    if (r.cancel_at_period_end === false) return { planEnding: false, planEndsAt: null };
    unknown = true;
  }
  if (unknown) return { planEnding: null, planEndsAt: null };
  return { planEnding: true, planEndsAt: last ? new Date(last).toISOString() : null };
}

/**
 * Why a plan ended, for its coach's "Why did people leave?": the member's own words from Shape's
 * cancel step, else what Stripe holds as the comment (the same words, when the step sent them; or a
 * comment from before). null when there is none.
 */
export function churnReason(row) {
  if (!row) return null;
  return text(row.member_cancel_reason, MEMBER_REASON_MAX) || text(row.cancellation_comment, MEMBER_REASON_MAX) || null;
}
