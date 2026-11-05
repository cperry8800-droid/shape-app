// Coach payments: the record of what members actually paid each coach (2026-11-05), one row per
// Stripe object in `coach_payments` (supabase-migrations/2026-11-05-coach-payments.sql).
//
// Written by the Stripe webhook (src/app/api/stripe/webhook/route.ts) and by
// scripts/backfill-coach-payments.mjs, which both build their rows here, so a payment the webhook
// recorded and the same payment the backfill reads from Stripe are the same row, byte for byte, and
// the upsert on the Stripe id makes either one idempotent. Read by the coach analytics routes and
// /api/coach/money for "This month so far", "Lifetime on Shape" and "earned Nov 1–4", in the coach's
// own time zone.
//
//   a coach plan's paid invoice   in_…  'first' (subscription_create) · 'renewal' (subscription_cycle)
//                                       · 'adjustment' (a mid-period change)
//   a one-off purchase            cs_…  'one_off': a booking, a meal plan or a program
//   a refund of either            re_…  'refund', NEGATIVE, dated when refunded
//
// The money: gross is what the member paid. Shape's fee on a plan is the subscription's STORED
// fee_bps (what Stripe's application_fee_percent was set from, frozen at checkout), split the way the
// webhook's notices split it; on a one-off it is the PaymentIntent's own application_fee_amount. The
// coach's net is the rest: ⚠ BEFORE Stripe's card fees on a direct charge (Stripe takes those on the
// coach's own account), and never the same thing as a payout, which can carry the coach's other
// business on that account.
//
// ⚠ THE $5 MEMBERSHIP IS NOT COACH MONEY: nothing here builds a row without a coach.
//
// Pure apart from the writers and the reader, which are handed the database and Stripe clients, so
// tests drive every rule without a network. Imported by relative path (no '@/'), so the test
// harnesses that load the webhook and the routes need no new entry.

import { coachCutCents, bpsToRate } from './platform-fee.mjs';

export const COACH_PAYMENTS_TABLE = 'coach_payments';
export const STANDARD_FEE_BPS = 1500;
const COACH_ROLES = new Set(['trainer', 'nutritionist']);
const ONE_OFF_KINDS = new Set(['booking', 'meal_plan', 'program']);
// The invoices of a coach's plan that took money, by Stripe's billing_reason. Anything else (a manual
// invoice a coach made on their own account, an upcoming one) is not a payment of Shape's plan.
export const INVOICE_BILLING = Object.freeze({
  subscription_create: 'first',
  subscription_cycle: 'renewal',
  subscription_update: 'adjustment',
  subscription_threshold: 'adjustment',
});
// A refund that is money going back. A failed or cancelled one returned nothing.
const REFUND_COUNTS = new Set(['succeeded', 'pending']);

const isCount = (v) => Number.isSafeInteger(v) && v >= 0;

/** A Stripe time (seconds) or a date as an ISO instant, or null. */
export function isoAt(v) {
  if (v == null || v === '') return null;
  const t = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : new Date(String(v)).getTime();
  return Number.isFinite(t) && t > 0 ? new Date(t).toISOString() : null;
}

/** A stored fee_bps, or Shape's standard rate for a row from before the column (they paid 15%). */
export function feeBpsOr(bps) {
  return Number.isInteger(bps) && bps >= 0 && bps <= 10000 ? bps : STANDARD_FEE_BPS;
}

/** Shape's fee and the coach's share of `gross` at `bps`, as the webhook's notices split it. */
export function splitCents(gross, bps) {
  const coach = coachCutCents(gross, bpsToRate(feeBpsOr(bps)));
  return { shape: gross - coach, coach };
}

const currencyOf = (v) => (typeof v === 'string' && /^[a-z]{3}$/i.test(v) ? v.toLowerCase() : 'usd');

/**
 * The row for a coach plan's paid invoice, or null when it is not one (the wrong billing reason,
 * not paid, no money, no coach on the plan, no date). `plan` is the subscriptions row:
 * { client_id, provider_role, provider_id, fee_bps, stripe_subscription_id }.
 */
export function invoicePaymentRow(invoice, plan, { account = null, subscriptionId = null, fallbackPaidAt = null } = {}) {
  if (!invoice || typeof invoice.id !== 'string' || !invoice.id) return null;
  const billing = INVOICE_BILLING[invoice.billing_reason];
  if (!billing) return null;
  if (invoice.status != null && invoice.status !== 'paid') return null;
  const gross = invoice.amount_paid;
  if (!Number.isSafeInteger(gross) || gross <= 0) return null;
  if (!plan || !COACH_ROLES.has(plan.provider_role)) return null;
  const providerId = Number(plan.provider_id);
  if (!Number.isSafeInteger(providerId) || providerId <= 0) return null;
  const paidAt = isoAt(invoice.status_transitions && invoice.status_transitions.paid_at) || isoAt(fallbackPaidAt);
  if (!paidAt) return null;
  const bps = feeBpsOr(plan.fee_bps);
  const { shape, coach } = splitCents(gross, bps);
  return {
    stripe_object_id: invoice.id,
    stripe_object_type: 'invoice',
    stripe_account_id: account || null,
    stripe_subscription_id: subscriptionId || plan.stripe_subscription_id || null,
    refund_of: null,
    client_id: plan.client_id || null,
    provider_role: plan.provider_role,
    provider_id: providerId,
    kind: 'plan',
    billing,
    gross_cents: gross,
    shape_fee_cents: shape,
    coach_net_cents: coach,
    fee_bps: bps,
    currency: currencyOf(invoice.currency),
    paid_at: paidAt,
  };
}

/**
 * The row for a one-off purchase (a checkout in payment mode), or null when it is not one.
 * `applicationFeeCents` is the PaymentIntent's application_fee_amount (0 when the fee was left off:
 * a brought client, or store credit that took the whole fee); when it could not be read, the rate.
 */
export function purchasePaymentRow({
  sessionId, paymentIntentId = null, account = null, clientId = null, providerRole, providerId, kind,
  grossCents, applicationFeeCents = null, feeBps = null, currency = 'usd', paidAt,
}) {
  if (typeof sessionId !== 'string' || !sessionId) return null;
  if (!COACH_ROLES.has(providerRole) || !ONE_OFF_KINDS.has(kind)) return null;
  const pid = Number(providerId);
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  if (!Number.isSafeInteger(grossCents) || grossCents <= 0) return null;
  const at = isoAt(paidAt);
  if (!at) return null;
  const fee = isCount(applicationFeeCents) ? Math.min(applicationFeeCents, grossCents) : splitCents(grossCents, feeBps).shape;
  return {
    stripe_object_id: sessionId,
    stripe_object_type: 'checkout_session',
    stripe_account_id: account || null,
    stripe_subscription_id: null,
    ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
    refund_of: null,
    client_id: clientId || null,
    provider_role: providerRole,
    provider_id: pid,
    kind,
    billing: 'one_off',
    gross_cents: grossCents,
    shape_fee_cents: fee,
    coach_net_cents: grossCents - fee,
    fee_bps: feeBps == null ? null : feeBpsOr(feeBps),
    currency: currencyOf(currency),
    paid_at: at,
  };
}

/**
 * The NEGATIVE row for one refund of a recorded payment, or null (no id, a refund that returned
 * nothing, no payment). Shape's share goes back in the same proportion as the money: the webhook
 * returns the application fee that way (reconcileConnectRefund). A refund larger than what is left
 * of the payment is cut to it.
 */
export function refundRow(refund, payment) {
  if (!refund || typeof refund.id !== 'string' || !refund.id || !payment) return null;
  if (!REFUND_COUNTS.has(refund.status)) return null;
  const gross = Number(payment.gross_cents);
  if (!Number.isSafeInteger(gross) || gross <= 0 || !isCount(refund.amount) || refund.amount <= 0) return null;
  const amount = Math.min(refund.amount, gross);
  const fee = Math.round((Math.max(0, Number(payment.shape_fee_cents) || 0) * amount) / gross);
  const at = isoAt(refund.created);
  if (!at) return null;
  return {
    stripe_object_id: refund.id,
    stripe_object_type: 'refund',
    stripe_account_id: payment.stripe_account_id || null,
    stripe_subscription_id: payment.stripe_subscription_id || null,
    ...(payment.stripe_payment_intent_id ? { stripe_payment_intent_id: payment.stripe_payment_intent_id } : {}),
    refund_of: payment.stripe_object_id,
    client_id: payment.client_id || null,
    provider_role: payment.provider_role,
    provider_id: payment.provider_id,
    kind: payment.kind,
    billing: 'refund',
    gross_cents: 0 - amount,
    shape_fee_cents: 0 - fee,
    coach_net_cents: 0 - (amount - fee),
    fee_bps: payment.fee_bps ?? null,
    currency: payment.currency || 'usd',
    paid_at: at,
  };
}

// ── Writing ─────────────────────────────────────────────────────────────────────────────────────

/** "Not set up yet": the table (or a column) the migration adds is not there. */
export function missingRelation(err) {
  const code = String((err && err.code) || '');
  return code === '42P01' || code === 'PGRST205' || code === '42703' || code === 'PGRST204';
}

/**
 * Upserts one row on its Stripe id. Never throws: { ok } or { ok: false, missing, error }. A missing
 * table (the migration has not run) is logged once per call as such; the backfill fills it later.
 */
export async function savePayment(admin, row) {
  if (!row) return { ok: false, missing: false, error: null };
  try {
    const { error } = await admin.from(COACH_PAYMENTS_TABLE).upsert(row, { onConflict: 'stripe_object_id' });
    if (!error) return { ok: true };
    const missing = missingRelation(error);
    console.error(missing
      ? '[coach-payments] NOT RECORDED: coach_payments is not set up (run 2026-11-05-coach-payments.sql, then the backfill)'
      : '[coach-payments] NOT RECORDED: the write failed — scripts/backfill-coach-payments.mjs restores it', {
      object: row.stripe_object_id, error: error.message ?? null, code: error.code ?? null,
    });
    return { ok: false, missing, error };
  } catch (err) {
    console.error('[coach-payments] NOT RECORDED: the write threw — scripts/backfill-coach-payments.mjs restores it', {
      object: row.stripe_object_id, error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, missing: false, error: err };
  }
}

/** The recorded payment a refund belongs to: by its PaymentIntent, else by the invoice it paid. */
export async function findPayment(admin, { account = null, paymentIntentId = null, invoiceId = null }) {
  const one = async (col, v) => {
    let q = admin.from(COACH_PAYMENTS_TABLE).select('*').eq(col, v);
    if (account) q = q.eq('stripe_account_id', account);
    const { data, error } = await q.neq('billing', 'refund').limit(1);
    if (error) return { row: null, error };
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    return { row: rows[0] || null, error: null };
  };
  if (paymentIntentId) {
    const hit = await one('stripe_payment_intent_id', paymentIntentId);
    if (hit.row || hit.error) return hit;
  }
  if (invoiceId) return one('stripe_object_id', invoiceId);
  return { row: null, error: null };
}

/**
 * Every refund of `charge` as its own negative row, against the payment it reverses. `stripe` is the
 * client (refunds.list, and invoicePayments.list to find a plan's invoice from its PaymentIntent);
 * `opts` the request options for the account. Never throws: { recorded, skipped }.
 */
export async function recordRefunds(admin, stripe, charge, { account = null, opts = undefined, invoiceId = null } = {}) {
  const out = { recorded: 0, skipped: null };
  try {
    const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent && charge.payment_intent.id || null;
    let invoice = invoiceId;
    let found = await findPayment(admin, { account, paymentIntentId: pi, invoiceId: invoice });
    // ⚠ A PLAN'S CHARGE NAMES ITS INVOICE ONLY ON OLDER API VERSIONS. Asked by the PaymentIntent instead.
    if (!found.row && !found.error && !invoice && pi && stripe.invoicePayments && stripe.invoicePayments.list) {
      const list = await stripe.invoicePayments.list({ payment: { type: 'payment_intent', payment_intent: pi }, limit: 1 }, opts);
      const ip = list && Array.isArray(list.data) ? list.data[0] : null;
      invoice = ip ? (typeof ip.invoice === 'string' ? ip.invoice : ip.invoice && ip.invoice.id) || null : null;
      if (invoice) found = await findPayment(admin, { account, invoiceId: invoice });
    }
    if (found.error) { out.skipped = 'payment_unread'; console.error('[coach-payments] refund NOT RECORDED: the payment could not be read', { charge: charge.id, error: found.error.message ?? null }); return out; }
    if (!found.row) { out.skipped = 'no_payment'; return out; }
    const refunds = await stripe.refunds.list({ charge: charge.id, limit: 100 }, opts);
    for (const r of (refunds && Array.isArray(refunds.data) ? refunds.data : [])) {
      const row = refundRow(r, found.row);
      if (row && (await savePayment(admin, row)).ok) out.recorded += 1;
    }
  } catch (err) {
    out.skipped = 'error';
    console.error('[coach-payments] refund NOT RECORDED: Stripe or the database failed — scripts/backfill-coach-payments.mjs restores it', {
      charge: charge && charge.id, error: err instanceof Error ? err.message : String(err),
    });
  }
  return out;
}

// ── Reading ─────────────────────────────────────────────────────────────────────────────────────

export const PAYMENT_PAGE = 1000;
// 50 pages is 50,000 rows for one coach: far past any practice. Past it the read is unread, never cut.
export const PAYMENT_PAGES = 50;

/**
 * Every row of one coach, a page at a time by id, with the caller's client (RLS: the coach's own).
 * → { rows } | { rows: null, state: 'not_set_up' | 'unread', error }
 */
export async function readCoachPayments(client, role, providerId) {
  const rows = [];
  let after = null;
  for (let page = 0; page < PAYMENT_PAGES; page++) {
    let q = client.from(COACH_PAYMENTS_TABLE).select('*').eq('provider_role', role).eq('provider_id', providerId);
    if (after) q = q.gt('id', after);
    // capped-read-ok: one page of a cursor walk over every row, not a cap.
    const { data, error } = await q.order('id', { ascending: true }).limit(PAYMENT_PAGE);
    if (error) return { rows: null, state: missingRelation(error) ? 'not_set_up' : 'unread', error };
    const got = Array.isArray(data) ? data : [];
    rows.push(...got);
    if (got.length < PAYMENT_PAGE) return { rows, state: 'ready' };
    after = got[got.length - 1].id;
  }
  return { rows: null, state: 'unread', error: { message: 'coach_payments read past its ceiling' } };
}

/** The calendar day ('YYYY-MM-DD') an instant falls on in `zone`, UTC when the zone can't be used. */
export function dayIn(at, zone) {
  const t = typeof at === 'number' ? at : new Date(String(at ?? '')).getTime();
  if (!Number.isFinite(t)) return null;
  const fmt = (z) => new Intl.DateTimeFormat('en-CA', { timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
  try { return fmt(zone || 'UTC'); } catch { return fmt('UTC'); }
}

const emptySum = () => ({ grossCents: 0, feeCents: 0, netCents: 0, refundedCents: 0, payments: 0 });
function add(sum, r) {
  sum.grossCents += Number(r.gross_cents) || 0;
  sum.feeCents += Number(r.shape_fee_cents) || 0;
  sum.netCents += Number(r.coach_net_cents) || 0;
  if (r.billing === 'refund') sum.refundedCents -= Number(r.gross_cents) || 0;
  else sum.payments += 1;
}

/**
 * What a coach collected, from their rows, in their own time zone:
 *   month     this calendar month so far (the 1st to today, both in `zone`): "This month so far",
 *             "earned Nov 1–4", Settings' "This month"
 *   lifetime  every row: "Lifetime on Shape", with `since`, the first payment recorded
 * Each sum is { grossCents, feeCents, netCents, refundedCents, payments }; refunds are already taken
 * off. Only US dollars are summed (every coach price is in dollars); a row in another currency is
 * counted in `otherCurrency` and left out rather than added as if it were dollars.
 */
export function earningsFrom(rows, { zone = null, now = Date.now() } = {}) {
  const usedZone = (() => { try { if (zone) { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return zone; } } catch { /* below */ } return 'UTC'; })();
  const today = dayIn(now, usedZone);
  const monthFrom = `${today.slice(0, 8)}01`;
  const month = emptySum();
  const lifetime = emptySum();
  let sinceMs = null;
  let otherCurrency = 0;
  for (const r of rows || []) {
    if (!r) continue;
    if ((r.currency || 'usd') !== 'usd') { otherCurrency += 1; continue; }
    const day = dayIn(r.paid_at, usedZone);
    if (!day) continue;
    add(lifetime, r);
    const t = new Date(String(r.paid_at)).getTime();
    if (r.billing !== 'refund' && (sinceMs == null || t < sinceMs)) sinceMs = t;
    if (day >= monthFrom && day <= today) add(month, r);
  }
  return {
    zone: usedZone,
    currency: 'usd',
    month: { from: monthFrom, to: today, ...month },
    lifetime: { since: sinceMs == null ? null : new Date(sinceMs).toISOString(), ...lifetime },
    otherCurrency,
  };
}

/**
 * The payload the routes send: { state: 'ready', ...earningsFrom } | { state: 'not_set_up' } |
 * { state: 'unread' }. ⚠ An unread ledger is never a $0 month: the page says it could not read it.
 */
export async function coachEarnings(client, { role, providerId, zone = null, now = Date.now() }) {
  const read = await readCoachPayments(client, role, providerId);
  if (!read.rows) {
    if (read.state !== 'not_set_up') console.warn(`[coach-payments] ${role} earnings unread:`, read.error && read.error.message);
    return { state: read.state };
  }
  return { state: 'ready', ...earningsFrom(read.rows, { zone, now }) };
}
