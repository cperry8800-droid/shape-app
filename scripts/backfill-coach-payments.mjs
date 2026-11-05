#!/usr/bin/env node
// Backfill coach_payments and the subscription cancellation columns from Stripe (2026-11-05).
//
// The webhook records every coach payment from the day it ships (src/app/api/stripe/webhook/route.ts).
// This fills in what came before, and restores anything a webhook delivery failed to write. It reads
// only what Shape already knows of:
//   · each coach plan in `subscriptions` (never the $5 membership, which lives in
//     platform_subscriptions and is not coach money): its paid invoices, their refunds, and the
//     Subscription itself for the cancellation columns;
//   · each one-off purchase in `one_time_purchases`: its checkout session, its PaymentIntent and the
//     refunds of it.
// Each read goes to the account the row lives on (a coach's own account for a direct charge, Shape's
// for a plan from before the move). Rows are built by src/lib/coach-payments.mjs, the same builder
// the webhook uses, and upserted on the Stripe id, so running it twice, or after the webhook, writes
// the same rows.
//
// DRY RUN BY DEFAULT: it reads Stripe and prints what it would write. Nothing is written without --write.
//
//   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… STRIPE_SECRET_KEY=… \
//     node scripts/backfill-coach-payments.mjs                 # dry run: what would be written
//   … node scripts/backfill-coach-payments.mjs --write         # write it
//   flags: --since 2026-01-01   only invoices and purchases created on or after that day
//          --no-refunds         skip the refund reads (two Stripe calls a payment fewer)
//          --no-cancellations   skip the subscription cancellation columns
//          --json out.json      the full plan as JSON
//
// Needs supabase-migrations/2026-11-05-coach-payments.sql (and, for the cancellation columns,
// 2026-11-05-subscription-cancellations.sql) to have run first; it says so and stops if not.

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  COACH_PAYMENTS_TABLE, invoicePaymentRow, isoAt, missingRelation, purchasePaymentRow, refundRow,
} from '../src/lib/coach-payments.mjs';
import { cancellationPatch } from '../src/lib/plan-cancellation.mjs';

const ACCT = /^acct_[A-Za-z0-9]{6,64}$/;
const opts = (account) => (account && ACCT.test(account) ? { stripeAccount: account } : undefined);
const PAGE = 1000;
const LIST_PAGES = 50;

/** Every row of `table` a page at a time by id (service role), filtered by `filter(q)`. */
async function readAll(admin, table, filter = (q) => q) {
  const out = [];
  let after = null;
  for (let page = 0; page < LIST_PAGES; page++) {
    let q = filter(admin.from(table).select('*'));
    if (after) q = q.gt('id', after);
    const { data, error } = await q.order('id', { ascending: true }).limit(PAGE);
    if (error) throw Object.assign(new Error(`${table} read failed: ${error.message}`), { code: error.code });
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
    after = data[data.length - 1].id;
  }
  throw new Error(`${table} read past ${LIST_PAGES * PAGE} rows`);
}

/** Every item of a Stripe list, a page of 100 at a time. */
async function listAll(list, params, requestOpts, max = 20) {
  const out = [];
  let startingAfter;
  for (let page = 0; page < max; page++) {
    const res = await list({ limit: 100, ...params, ...(startingAfter ? { starting_after: startingAfter } : {}) }, requestOpts);
    out.push(...(res.data || []));
    if (!res.has_more || !res.data || !res.data.length) break;
    startingAfter = res.data[res.data.length - 1].id;
  }
  return out;
}

const idOf = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof v.id === 'string' ? v.id : null);

/**
 * Reads Stripe for every coach plan and one-off purchase Shape holds, and returns what to write:
 * { payments: rows, cancellations: [{ id, patch }], problems: [...] }. Writes nothing.
 */
export async function planBackfill({ admin, stripe, since = null, refunds = true, cancellations = true, log = () => {} }) {
  const sinceSec = since ? Math.floor(new Date(`${since}T00:00:00Z`).getTime() / 1000) : null;
  const payments = new Map();
  const cancels = [];
  const problems = [];
  const keep = (row) => { if (row) payments.set(row.stripe_object_id, { ...(payments.get(row.stripe_object_id) || {}), ...row }); };

  const addRefunds = async (payment, pi, account) => {
    if (!refunds || !pi || !payment) return;
    const list = await listAll((p, o) => stripe.refunds.list(p, o), { payment_intent: pi }, opts(account), 5);
    for (const r of list) keep(refundRow(r, payment));
  };

  // ── Coach plans ──
  const subs = (await readAll(admin, 'subscriptions', (q) => q.in('provider_role', ['trainer', 'nutritionist'])))
    .filter((r) => r.stripe_subscription_id);
  log(`coach plans: ${subs.length}`);
  for (const row of subs) {
    const account = row.stripe_account_id || null;
    const ro = opts(account);
    try {
      if (cancellations) {
        const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id, undefined, ro);
        const patch = cancellationPatch(sub);
        cancels.push({ id: row.id, subscription: row.stripe_subscription_id, patch: { ...patch, cancel_synced_at: new Date().toISOString() } });
      }
      const invoices = await listAll((p, o) => stripe.invoices.list(p, o), {
        subscription: row.stripe_subscription_id, status: 'paid', ...(sinceSec ? { created: { gte: sinceSec } } : {}),
      }, ro);
      for (const inv of invoices) {
        const payment = invoicePaymentRow(inv, row, { account, subscriptionId: row.stripe_subscription_id, fallbackPaidAt: inv.created });
        if (!payment) continue;
        // The PaymentIntent behind the invoice, for its refunds (and so a later refund finds it).
        let pi = null;
        if (refunds && stripe.invoicePayments) {
          const ips = await listAll((p, o) => stripe.invoicePayments.list(p, o), { invoice: inv.id }, ro, 2);
          const paid = ips.find((x) => x && x.status === 'paid') || ips[0];
          pi = paid ? idOf(paid.payment && paid.payment.payment_intent) : null;
        }
        if (pi) payment.stripe_payment_intent_id = pi;
        keep(payment);
        await addRefunds(payment, pi, account);
      }
    } catch (err) {
      problems.push({ kind: 'plan', id: row.id, subscription: row.stripe_subscription_id, account, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ── One-off purchases ──
  const purchases = (await readAll(admin, 'one_time_purchases', (q) => q.in('status', ['paid', 'refunded', 'disputed'])))
    .filter((r) => r.stripe_checkout_session_id && (!sinceSec || new Date(r.created_at).getTime() / 1000 >= sinceSec));
  log(`one-off purchases: ${purchases.length}`);
  for (const row of purchases) {
    const account = row.stripe_account_id || null;
    const ro = opts(account);
    try {
      const session = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id, undefined, ro);
      if (session.payment_status !== 'paid') continue;
      const pi = idOf(session.payment_intent) || row.stripe_payment_intent_id || null;
      const intent = pi ? await stripe.paymentIntents.retrieve(pi, { expand: ['latest_charge'] }, ro) : null;
      const charge = intent && intent.latest_charge && typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
      const payment = purchasePaymentRow({
        sessionId: session.id,
        paymentIntentId: pi,
        account,
        clientId: row.client_id,
        providerRole: row.provider_role,
        providerId: row.provider_id,
        kind: row.kind,
        grossCents: session.amount_total ?? row.price_cents,
        applicationFeeCents: intent ? intent.application_fee_amount ?? 0 : row.application_fee_cents,
        feeBps: row.fee_bps ?? null,
        currency: session.currency,
        paidAt: (charge && charge.created) || session.created,
      });
      keep(payment);
      await addRefunds(payment, pi, account);
    } catch (err) {
      problems.push({ kind: 'purchase', id: row.id, session: row.stripe_checkout_session_id, account, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { payments: [...payments.values()], cancellations: cancels, problems };
}

/** Writes a plan: the payments upserted on their Stripe id, the cancellation columns by row id. */
export async function writeBackfill(admin, plan, { log = () => {} } = {}) {
  const out = { payments: 0, cancellations: 0, cancellationsSkipped: false };
  for (let i = 0; i < plan.payments.length; i += 200) {
    const batch = plan.payments.slice(i, i + 200);
    const { error } = await admin.from(COACH_PAYMENTS_TABLE).upsert(batch, { onConflict: 'stripe_object_id' });
    if (error) {
      if (missingRelation(error)) throw new Error('coach_payments is not set up: run supabase-migrations/2026-11-05-coach-payments.sql first');
      throw new Error(`coach_payments write failed: ${error.message}`);
    }
    out.payments += batch.length;
    log(`payments written: ${out.payments}/${plan.payments.length}`);
  }
  for (const c of plan.cancellations) {
    const { error } = await admin.from('subscriptions').update(c.patch).eq('id', c.id);
    if (error && missingRelation(error)) {
      out.cancellationsSkipped = true;
      log('the cancellation columns are not there: run 2026-11-05-subscription-cancellations.sql, then this again');
      break;
    }
    if (error) throw new Error(`subscriptions cancellation write failed (${c.id}): ${error.message}`);
    out.cancellations += 1;
  }
  return out;
}

/** Per coach: payments, gross, Shape's fee and net, in dollars, for the dry run's table. */
export function summarize(plan) {
  const by = new Map();
  for (const r of plan.payments) {
    const k = `${r.provider_role}:${r.provider_id}`;
    const s = by.get(k) || { coach: k, payments: 0, refunds: 0, grossCents: 0, feeCents: 0, netCents: 0, first: null, last: null };
    if (r.billing === 'refund') s.refunds += 1; else s.payments += 1;
    s.grossCents += r.gross_cents; s.feeCents += r.shape_fee_cents; s.netCents += r.coach_net_cents;
    if (!s.first || r.paid_at < s.first) s.first = r.paid_at;
    if (!s.last || r.paid_at > s.last) s.last = r.paid_at;
    by.set(k, s);
  }
  return [...by.values()].sort((a, b) => a.coach.localeCompare(b.coach));
}

async function main() {
  const args = process.argv.slice(2);
  const has = (f) => args.includes(`--${f}`);
  const flag = (f) => { const i = args.indexOf(`--${f}`); return i >= 0 ? args[i + 1] : null; };
  const write = has('write');
  const since = flag('since');
  if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('--since takes a day, YYYY-MM-DD');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!url || !key || !sk) throw new Error('needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and STRIPE_SECRET_KEY');
  const { createClient } = await import('@supabase/supabase-js');
  const { default: Stripe } = await import('stripe');
  const admin = createClient(url, key, { auth: { persistSession: false } });
  // The API version src/lib/stripe.ts pins, so the objects read here are the ones the webhook reads.
  const stripe = new Stripe(sk, { apiVersion: '2026-08-26.dahlia', appInfo: { name: 'Shape backfill' } });

  // Before reading Stripe at all: is the table there?
  const probe = await admin.from(COACH_PAYMENTS_TABLE).select('id').limit(1);
  if (probe.error && missingRelation(probe.error)) throw new Error('coach_payments is not set up: run supabase-migrations/2026-11-05-coach-payments.sql first');

  const log = (m) => console.error(`[backfill] ${m}`);
  log(write ? 'WRITE: rows will be upserted' : 'dry run: nothing is written (pass --write to write)');
  const plan = await planBackfill({ admin, stripe, since, refunds: !has('no-refunds'), cancellations: !has('no-cancellations'), log });
  const table = summarize(plan).map((s) => ({
    coach: s.coach, payments: s.payments, refunds: s.refunds,
    gross: (s.grossCents / 100).toFixed(2), shapeFee: (s.feeCents / 100).toFixed(2), net: (s.netCents / 100).toFixed(2),
    first: isoAt(s.first)?.slice(0, 10), last: isoAt(s.last)?.slice(0, 10),
  }));
  console.table(table);
  log(`payments: ${plan.payments.length} · cancellations to sync: ${plan.cancellations.length} · problems: ${plan.problems.length}`);
  for (const p of plan.problems) log(`problem: ${JSON.stringify(p)}`);
  const json = flag('json');
  if (json) writeFileSync(json, JSON.stringify(plan, null, 2));
  if (!write) return;
  const done = await writeBackfill(admin, plan, { log });
  log(`written: ${done.payments} payments, ${done.cancellations} cancellations${done.cancellationsSkipped ? ' (cancellation columns missing: skipped)' : ''}`);
}

// Run when called as a script; imported (the tests), it only exports.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => { console.error(`[backfill] ${err instanceof Error ? err.message : err}`); process.exit(1); });
}

