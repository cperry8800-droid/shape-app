// The record of what members paid each coach (coach_payments, 2026-11-05) and a plan's cancellation
// on its subscriptions row: the pure builders (src/lib/coach-payments.mjs, src/lib/plan-cancellation.mjs),
// the Stripe webhook that writes them, the member's cancel step (/api/stripe/cancel-plan), the slim
// money route (/api/coach/money), the payout reads (src/lib/stripe.ts, coachForecast.js) and the
// backfill script. Every module runs as it ships (loadRealModule); stubs stand only where Stripe or the
// database would.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { coachCheckoutEntries } from './helpers/coach-checkout-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(ROOT, 'package.json'));
const nextServer = require_('next/server');
const read = (p) => fs.readFileSync(join(ROOT, p), 'utf8');
const pay = await import(pathToFileURL(join(ROOT, 'src/lib/coach-payments.mjs')).href);
const pc = await import(pathToFileURL(join(ROOT, 'src/lib/plan-cancellation.mjs')).href);
const traj = await import(pathToFileURL(join(ROOT, 'src/lib/coach-trajectory.mjs')).href);
const CF = require_(join(ROOT, 'public/newdesign/coachForecast.js'));

const UID = '55555555-5555-4555-8555-555555555555';
const OTHER = '66666666-6666-4666-8666-666666666666';
const SUB_ROW = '77777777-7777-4777-8777-777777777777';
const ACCT = 'acct_1CoachTrainer4';
const plan = { client_id: UID, provider_role: 'trainer', provider_id: 4, fee_bps: 1500, stripe_subscription_id: 'sub_1' };
const paidInvoice = (o = {}) => ({ id: 'in_1', status: 'paid', billing_reason: 'subscription_cycle', amount_paid: 18000, currency: 'usd', status_transitions: { paid_at: 1798761600 }, ...o });

// ── The builders ──────────────────────────────────────────────────────────────────────────────
test('a plan invoice: its billing reason, Shape\'s fee from the stored rate, the rest the coach\'s', () => {
  const row = pay.invoicePaymentRow(paidInvoice(), plan, { account: ACCT });
  assert.deepEqual(row, {
    stripe_object_id: 'in_1', stripe_object_type: 'invoice', stripe_account_id: ACCT, stripe_subscription_id: 'sub_1', refund_of: null,
    client_id: UID, provider_role: 'trainer', provider_id: 4, kind: 'plan', billing: 'renewal',
    gross_cents: 18000, shape_fee_cents: 2700, coach_net_cents: 15300, fee_bps: 1500, currency: 'usd', paid_at: '2027-01-01T00:00:00.000Z',
  });
  assert.equal(pay.invoicePaymentRow(paidInvoice({ billing_reason: 'subscription_create' }), plan).billing, 'first');
  assert.equal(pay.invoicePaymentRow(paidInvoice({ billing_reason: 'subscription_update' }), plan).billing, 'adjustment');
  // A brought client pays 0%; a row from before fee_bps paid the standard 15%.
  assert.deepEqual([pay.invoicePaymentRow(paidInvoice(), { ...plan, fee_bps: 0 }).shape_fee_cents, pay.invoicePaymentRow(paidInvoice(), { ...plan, fee_bps: null }).shape_fee_cents], [0, 2700]);
  // Not a payment of a coach plan: nothing.
  for (const [inv, p] of [
    [paidInvoice({ billing_reason: 'manual' }), plan], [paidInvoice({ status: 'open' }), plan], [paidInvoice({ amount_paid: 0 }), plan],
    [paidInvoice({ id: '' }), plan], [paidInvoice(), { ...plan, provider_role: 'gym' }], [paidInvoice(), { ...plan, provider_id: null }], [paidInvoice(), null],
  ]) assert.equal(pay.invoicePaymentRow(inv, p), null);
  // No paid_at on the invoice: the event's time.
  assert.equal(pay.invoicePaymentRow(paidInvoice({ status_transitions: null }), plan, { fallbackPaidAt: 1798848000 }).paid_at, '2027-01-02T00:00:00.000Z');
  assert.equal(pay.invoicePaymentRow(paidInvoice({ status_transitions: null }), plan), null, 'no date at all: not recorded as now');
  // The PaymentIntent is never written as null by the webhook (the backfill's would be wiped on replay).
  assert.ok(!('stripe_payment_intent_id' in pay.invoicePaymentRow(paidInvoice(), plan)));
});

test('a one-off purchase: the fee its payment carried, else the rate; never more than was paid', () => {
  const base = { sessionId: 'cs_1', paymentIntentId: 'pi_1', clientId: UID, providerRole: 'trainer', providerId: '4', kind: 'booking', grossCents: 16500, applicationFeeCents: 2700, feeBps: 1500, paidAt: 1798761600 };
  const row = pay.purchasePaymentRow(base);
  assert.deepEqual([row.stripe_object_type, row.billing, row.kind, row.gross_cents, row.shape_fee_cents, row.coach_net_cents, row.stripe_payment_intent_id, row.provider_id], ['checkout_session', 'one_off', 'booking', 16500, 2700, 13800, 'pi_1', 4]);
  assert.equal(pay.purchasePaymentRow({ ...base, applicationFeeCents: 0 }).shape_fee_cents, 0, 'a real $0 fee (brought client, credit)');
  assert.equal(pay.purchasePaymentRow({ ...base, applicationFeeCents: null }).shape_fee_cents, 2475, 'unread: the rate on what was paid');
  assert.equal(pay.purchasePaymentRow({ ...base, applicationFeeCents: 99999 }).shape_fee_cents, 16500);
  for (const k of ['program', 'meal_plan']) assert.equal(pay.purchasePaymentRow({ ...base, kind: k }).kind, k);
  for (const bad of [{ kind: 'subscription' }, { providerRole: 'gym' }, { grossCents: 0 }, { sessionId: '' }, { paidAt: null }]) {
    assert.equal(pay.purchasePaymentRow({ ...base, ...bad }), null, JSON.stringify(bad));
  }
});

test('a refund is its own negative row, Shape\'s fee going back in proportion', () => {
  const payment = pay.invoicePaymentRow(paidInvoice(), plan, { account: ACCT });
  const half = pay.refundRow({ id: 're_1', amount: 9000, status: 'succeeded', created: 1799366400 }, payment);
  assert.deepEqual([half.stripe_object_type, half.billing, half.refund_of, half.gross_cents, half.shape_fee_cents, half.coach_net_cents, half.stripe_account_id, half.paid_at],
    ['refund', 'refund', 'in_1', -9000, -1350, -7650, ACCT, '2027-01-08T00:00:00.000Z']);
  assert.equal(half.gross_cents - half.shape_fee_cents, half.coach_net_cents, 'the database checks this');
  assert.equal(pay.refundRow({ id: 're_2', amount: 50000, status: 'succeeded', created: 1 }, payment).gross_cents, -18000, 'never more than the payment');
  assert.equal(pay.refundRow({ id: 're_3', amount: 100, status: 'failed', created: 1 }, payment), null);
  assert.equal(pay.refundRow({ id: 're_4', amount: 100, status: 'pending', created: 1 }, payment).gross_cents, -100);
  assert.equal(pay.refundRow({ id: 're_5', amount: 100, status: 'succeeded', created: 1 }, null), null);
  const free = pay.refundRow({ id: 're_6', amount: 18000, status: 'succeeded', created: 1 }, { ...payment, shape_fee_cents: 0 });
  assert.ok(Object.is(free.shape_fee_cents, 0), 'a zero fee is +0, not -0');
});

test('what a coach collected, in their own time zone: this month so far and lifetime, refunds taken off', () => {
  // Nov 5, 2026, 03:00 UTC is still Nov 4 in Los Angeles.
  const now = Date.UTC(2026, 10, 5, 3);
  const row = (id, paid_at, gross, fee, extra = {}) => ({ stripe_object_id: id, paid_at, gross_cents: gross, shape_fee_cents: fee, coach_net_cents: gross - fee, billing: 'renewal', currency: 'usd', ...extra });
  const rows = [
    row('in_oct', '2026-10-15T12:00:00Z', 18000, 2700),
    // Nov 1, 06:00 UTC is Oct 31 in Los Angeles: last month there, this month in UTC.
    row('in_edge', '2026-11-01T06:00:00Z', 10000, 1500),
    // Nov 1, 12:00 UTC is Nov 1 in Los Angeles too: the month's first day counts.
    row('in_first', '2026-11-01T12:00:00Z', 1000, 0),
    row('in_nov', '2026-11-02T18:00:00Z', 18000, 0),
    row('re_nov', '2026-11-03T18:00:00Z', -9000, 0, { billing: 'refund', refund_of: 'in_nov' }),
    row('in_eur', '2026-11-02T18:00:00Z', 5000, 0, { currency: 'eur' }),
  ];
  const la = pay.earningsFrom(rows, { zone: 'America/Los_Angeles', now });
  assert.deepEqual(la.month, { from: '2026-11-01', to: '2026-11-04', grossCents: 10000, feeCents: 0, netCents: 10000, refundedCents: 9000, payments: 2 });
  assert.deepEqual(la.lifetime, { since: '2026-10-15T12:00:00.000Z', grossCents: 38000, feeCents: 4200, netCents: 33800, refundedCents: 9000, payments: 4 });
  assert.equal(la.otherCurrency, 1, 'another currency is left out and counted, never added as dollars');
  const utc = pay.earningsFrom(rows, { zone: 'UTC', now });
  assert.deepEqual([utc.month.from, utc.month.to, utc.month.netCents], ['2026-11-01', '2026-11-05', 18500]);
  assert.equal(pay.earningsFrom(rows, { zone: 'Not/AZone', now }).zone, 'UTC', 'a zone the clock can\'t use counts in UTC');
  assert.deepEqual(pay.earningsFrom([], { zone: 'UTC', now }).lifetime, { since: null, grossCents: 0, feeCents: 0, netCents: 0, refundedCents: 0, payments: 0 });
});

test('the read: a coach\'s rows a page at a time; a missing table is "not set up", a failed read "unread", never $0', async () => {
  const pages = [];
  const client = (rowsFor, error = null) => ({ from: () => {
    const ops = [];
    const q = new Proxy({}, { get(_t, p) {
      if (p === 'then') return (res) => { pages.push(ops); return Promise.resolve(error ? { data: null, error } : { data: rowsFor(ops), error: null }).then(res); };
      return (...a) => { ops.push([p, ...a]); return q; };
    } });
    return q;
  } });
  const many = Array.from({ length: 1500 }, (_, i) => ({ id: String(i).padStart(5, '0'), paid_at: '2026-11-02T00:00:00Z', gross_cents: 100, shape_fee_cents: 0, coach_net_cents: 100, billing: 'renewal', currency: 'usd' }));
  const paged = await pay.readCoachPayments(client((ops) => {
    const after = ops.find((o) => o[0] === 'gt');
    return many.filter((r) => !after || r.id > after[2]).slice(0, 1000);
  }), 'trainer', 4);
  assert.equal(paged.rows.length, 1500, 'past 1,000 the read pages on by id');
  assert.deepEqual(pages[0].filter((o) => o[0] === 'eq'), [['eq', 'provider_role', 'trainer'], ['eq', 'provider_id', 4]]);
  assert.deepEqual(await pay.coachEarnings(client(() => [], { code: '42P01', message: 'relation does not exist' }), { role: 'trainer', providerId: 4 }), { state: 'not_set_up' });
  const orig = console.warn; console.warn = () => {};
  try { assert.deepEqual(await pay.coachEarnings(client(() => [], { message: 'timeout' }), { role: 'trainer', providerId: 4 }), { state: 'unread' }); } finally { console.warn = orig; }
  const ready = await pay.coachEarnings(client(() => many.slice(0, 3)), { role: 'trainer', providerId: 4, zone: 'UTC', now: Date.UTC(2026, 10, 5) });
  assert.equal(ready.state, 'ready');
  assert.equal(ready.month.netCents, 300);
});

test('a write never throws, and says why a row is missing', async () => {
  const logs = [];
  const orig = console.error; console.error = (...a) => logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  try {
    const row = pay.invoicePaymentRow(paidInvoice(), plan);
    const upserts = [];
    assert.deepEqual(await pay.savePayment({ from: () => ({ upsert: async (r, o) => { upserts.push([r, o]); return { error: null }; } }) }, row), { ok: true });
    assert.deepEqual(upserts[0][1], { onConflict: 'stripe_object_id' }, 'idempotent on the Stripe id');
    const missing = await pay.savePayment({ from: () => ({ upsert: async () => ({ error: { code: '42P01', message: 'no table' } }) }) }, row);
    assert.equal(missing.missing, true);
    const threw = await pay.savePayment({ from: () => { throw new Error('boom'); } }, row);
    assert.equal(threw.ok, false);
    assert.deepEqual(await pay.savePayment({}, null), { ok: false, missing: false, error: null });
  } finally { console.error = orig; }
  assert.ok(logs.some((l) => /not set up/.test(l)) && logs.some((l) => /backfill/.test(l)));
});

// ── The cancellation ──────────────────────────────────────────────────────────────────────────
test('the member\'s words: cleaned, capped, optional', () => {
  const bell = String.fromCharCode(7);
  const zw = String.fromCharCode(0x200b);
  assert.equal(pc.memberReason(`  Budget${bell}.${zw} Coming back\r\n\r\n\r\n\r\nin the fall  `), 'Budget. Coming back\n\nin the fall');
  for (const empty of [null, undefined, '', '   ', bell]) assert.equal(pc.memberReason(empty), null);
  assert.equal(pc.memberReason('x'.repeat(900)).length, pc.MEMBER_REASON_MAX);
  assert.equal(pc.memberReason(42), '42');
});

test('Stripe\'s cancellation, as the row keeps it', () => {
  assert.deepEqual(pc.cancellationPatch({ cancel_at_period_end: true, cancel_at: null, canceled_at: 1798761600, ended_at: null, cancellation_details: { reason: 'cancellation_requested', feedback: 'too_expensive', comment: '  Budget  ' } }), {
    cancel_at_period_end: true, cancel_at: null, canceled_at: '2027-01-01T00:00:00.000Z', ended_at: null,
    cancellation_reason: 'cancellation_requested', cancellation_feedback: 'too_expensive', cancellation_comment: 'Budget',
  });
  assert.deepEqual(pc.cancellationPatch({}), { cancel_at_period_end: false, cancel_at: null, canceled_at: null, ended_at: null, cancellation_reason: null, cancellation_feedback: null, cancellation_comment: null });
  assert.deepEqual(Object.keys(pc.withoutCancellation({ status: 'active', cancel_at: null, member_cancel_reason: 'x', cancel_synced_at: 'y' })), ['status']);
});

test('an older event delivered late never undoes a newer cancellation; a deletion always lands', () => {
  const stored = '2027-01-01T00:00:10.500Z';
  const at = Date.parse('2027-01-01T00:00:10Z') / 1000;
  assert.equal(pc.cancellationLands(stored, at - 1), false, 'older');
  assert.equal(pc.cancellationLands(stored, at), true, 'the same second: the same change');
  assert.equal(pc.cancellationLands(stored, at + 60), true, 'newer');
  assert.equal(pc.cancellationLands(stored, at - 3600, true), true, 'deleted');
  assert.equal(pc.cancellationLands(null, at - 1), true, 'never written');
  assert.equal(pc.cancellationLands(undefined, at - 1), true, 'before the migration');
});

test('plan ending, for the roster and the engine: every open plan ends, or it is not leaving; unsynced is unknown', () => {
  const ends = { cancel_at_period_end: true, current_period_end: '2026-11-11T00:00:00Z' };
  const renews = { cancel_at_period_end: false, current_period_end: '2026-11-20T00:00:00Z' };
  assert.deepEqual(pc.planEndingOf([ends]), { planEnding: true, planEndsAt: '2026-11-11T00:00:00.000Z' });
  assert.deepEqual(pc.planEndingOf([ends, renews]), { planEnding: false, planEndsAt: null }, 'one plan renews: not leaving');
  assert.deepEqual(pc.planEndingOf([renews]), { planEnding: false, planEndsAt: null });
  assert.deepEqual(pc.planEndingOf([{ current_period_end: '2026-11-20T00:00:00Z' }]), { planEnding: null, planEndsAt: null }, 'not synced: unknown, never "renews"');
  assert.deepEqual(pc.planEndingOf([ends, { cancel_at: '2026-12-01T00:00:00Z' }]), { planEnding: true, planEndsAt: '2026-12-01T00:00:00.000Z' }, 'the last of the dates');
  assert.deepEqual(pc.planEndingOf([]), { planEnding: null, planEndsAt: null });
  assert.equal(pc.planEndsAt({ cancel_at_period_end: true, cancel_at: '2026-11-15T00:00:00Z', current_period_end: '2026-11-20T00:00:00Z' }), '2026-11-15T00:00:00Z');
});

test('why a plan ended: the member\'s words, else Stripe\'s comment', () => {
  assert.equal(pc.churnReason({ member_cancel_reason: 'Budget', cancellation_comment: 'other' }), 'Budget');
  assert.equal(pc.churnReason({ cancellation_comment: ' Moved ' }), 'Moved');
  assert.equal(pc.churnReason({}), null);
});

test('a plan that ended is dated by when it ended, not when the cancel was asked for', () => {
  const now = Date.UTC(2026, 11, 1);
  const row = { status: 'canceled', created_at: '2026-01-01T00:00:00Z', canceled_at: '2026-10-05T00:00:00Z', ended_at: '2026-11-01T00:00:00Z', current_period_end: '2026-11-01T00:00:00Z' };
  assert.equal(traj.subEndedAt(row, now), Date.parse('2026-11-01T00:00:00Z'));
  assert.equal(traj.subEndedAt({ ...row, ended_at: null }, now), Date.parse('2026-10-05T00:00:00Z'), 'no ended_at: the cancel, as before');
});

// ── The webhook ───────────────────────────────────────────────────────────────────────────────
/** A Supabase client over `tables` that upserts on its conflict column, as Postgres does. */
function fakeDb({ tables = {}, errors = {} } = {}) {
  const calls = [];
  const from = (table) => {
    const st = { table, op: 'select', eqs: [], ins: [], iss: [], neqs: [], payload: null, opts: null };
    const rows = () => (tables[table] ??= []);
    const run = () => {
      calls.push(st);
      const err = typeof errors[`${st.op}:${table}`] === 'function' ? errors[`${st.op}:${table}`](st) : errors[`${st.op}:${table}`];
      if (err) return { data: null, error: err };
      const hit = rows().filter((r) => st.eqs.every(([c, v]) => r[c] === v) && st.neqs.every(([c, v]) => r[c] !== v) && st.ins.every(([c, vs]) => vs.includes(r[c])) && st.iss.every(([c, v]) => (r[c] ?? null) === v));
      if (st.op === 'upsert') {
        const key = st.opts?.onConflict;
        const list = Array.isArray(st.payload) ? st.payload : [st.payload];
        for (const p of list) {
          const prior = key ? rows().find((r) => r[key] === p[key]) : null;
          if (prior) Object.assign(prior, p); else rows().push({ id: `${table}-${rows().length + 1}`, ...p });
        }
        return { data: list, error: null };
      }
      if (st.op === 'update') {
        for (const r of hit) Object.assign(r, st.payload);
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      return { data: hit.map((r) => ({ ...r })), error: null };
    };
    const q = {
      select() { return q; },
      insert(p) { st.op = 'insert'; st.payload = p; return q; },
      upsert(p, o) { st.op = 'upsert'; st.payload = p; st.opts = o; return q; },
      update(p) { st.op = 'update'; st.payload = p; return q; },
      eq(c, v) { st.eqs.push([c, v]); return q; },
      neq(c, v) { st.neqs.push([c, v]); return q; },
      in(c, v) { st.ins.push([c, v]); return q; },
      is(c, v) { st.iss.push([c, v]); return q; },
      not() { return q; }, limit() { return q; }, order() { return q; }, gt() { return q; }, or() { return q; },
      maybeSingle: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return q;
  };
  return { client: { from, rpc: async () => ({ data: 0, error: null }) }, calls, tables };
}
const stmts = (calls, table, op) => calls.filter((c) => c.table === table && c.op === op);

const connect = await loadRealModule(join(ROOT, 'src/lib/stripe-connect.ts'), { typescript: true });

async function runWebhook(event, { tables = {}, errors = {}, stripeOver = {}, secret = 'whsec_platform' } = {}) {
  const db = fakeDb({ tables, errors });
  const announced = [];
  const stripe = {
    webhooks: { constructEvent: (raw, sig, s) => { if (sig !== `signed:${s}`) throw new Error('No signatures found'); return JSON.parse(raw); } },
    paymentIntents: { retrieve: async (id) => ({ id, application_fee_amount: 2700, application: 'ca_Shape', amount: 16500 }) },
    subscriptions: { retrieve: async (id) => ({ id, status: 'active', application: 'ca_Shape', application_fee_percent: 15, items: { data: [{ current_period_end: 1800000000, price: { unit_amount: 18000 }, quantity: 1 }] }, discounts: [] }) },
    invoices: { retrieve: async (id) => ({ id, status: 'paid', billing_reason: 'subscription_create', amount_paid: 18000, currency: 'usd', status_transitions: { paid_at: 1798761600 } }) },
    refunds: { list: async () => ({ data: [] }) },
    applicationFees: { retrieve: async () => ({ amount: 0, amount_refunded: 0 }) },
    ...stripeOver,
  };
  const route = await loadRealModule(join(ROOT, 'src/app/api/stripe/webhook/route.ts'), {
    typescript: true,
    registry: new Map([
      ...(await coachCheckoutEntries()),
      ['next/server', nextServer],
      ['@/lib/stripe', { stripe }],
      ['@/lib/stripe-connect', connect],
      ['@/lib/supabase/admin', { createAdminClient: () => db.client }],
      ['@/lib/platform-fee', await import(pathToFileURL(join(ROOT, 'src/lib/platform-fee.mjs')).href)],
      ['@/lib/coach-origin.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/coach-origin.mjs')).href)],
      ['@/lib/db-retryable', await loadRealModule(join(ROOT, 'src/lib/db-retryable.ts'), { typescript: true })],
      ['@/lib/refund-session', { cancelRefundedSession: async () => 'none' }],
      ['@/lib/coach-thread', { startCoaching: async () => ({}), welcomeMember: async () => false, coachPaid: async () => ({}) }],
      ['@/lib/payment-notices', { announcePayment: async (_a, p) => { announced.push(p); return { owners: 1, member: true, coach: false }; } }],
    ]),
  });
  const saved = { secret: process.env.STRIPE_WEBHOOK_SECRET, connect: process.env.STRIPE_CONNECT_WEBHOOK_SECRET, app: process.env.STRIPE_CONNECT_APPLICATION_ID };
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_platform';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect';
  process.env.STRIPE_CONNECT_APPLICATION_ID = 'ca_Shape';
  const orig = { warn: console.warn, error: console.error };
  const logs = [];
  console.warn = (...a) => logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  console.error = console.warn;
  try {
    const res = await route.POST(new Request('https://shape.test/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': `signed:${secret}` }, body: JSON.stringify(event) }));
    return { status: res.status, announced, db, logs };
  } finally {
    console.warn = orig.warn; console.error = orig.error;
    for (const [k, v] of [['STRIPE_WEBHOOK_SECRET', saved.secret], ['STRIPE_CONNECT_WEBHOOK_SECRET', saved.connect], ['STRIPE_CONNECT_APPLICATION_ID', saved.app]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
}

const meta = (extra = {}) => ({ client_id: UID, provider_id: '4', provider_role: 'trainer', price_cents: '18000', gross_price_cents: '18000', origin: 'marketplace', fee_bps: '1500', ...extra });
const checkout = (object, extra = {}) => ({ id: 'evt_c', created: 1798761600, type: 'checkout.session.completed', data: { object }, ...extra });
const purchase = (o = {}) => checkout({ id: 'cs_buy', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_1', amount_total: 16500, currency: 'usd', metadata: meta({ kind: 'booking' }), ...o });
const coaching = (o = {}) => checkout({ id: 'cs_sub', mode: 'subscription', payment_status: 'paid', subscription: 'sub_1', customer: 'cus_1', invoice: 'in_first', amount_total: 18000, metadata: meta(), ...o });
const invoicePaid = (o = {}, account) => ({ id: 'evt_i', created: 1798761600, type: 'invoice.paid', ...(account ? { account } : {}), data: { object: { id: 'in_1', status: 'paid', billing_reason: 'subscription_cycle', amount_paid: 18000, currency: 'usd', status_transitions: { paid_at: 1798761600 }, parent: { subscription_details: { subscription: 'sub_1' } }, ...o } } });
const subRow = (o = {}) => ({ id: SUB_ROW, client_id: UID, provider_id: 4, provider_role: 'trainer', fee_bps: 1500, stripe_subscription_id: 'sub_1', status: 'active', current_period_end: '2027-01-15T08:00:00.000Z', ...o });

test('webhook: a one-off purchase is recorded once saved, at what Stripe charged and the fee its payment carried', async () => {
  const r = await runWebhook(purchase());
  assert.equal(r.status, 200);
  const [row] = r.db.tables.coach_payments;
  assert.deepEqual([row.stripe_object_id, row.billing, row.kind, row.gross_cents, row.shape_fee_cents, row.coach_net_cents, row.stripe_payment_intent_id, row.client_id, row.provider_id, row.paid_at],
    ['cs_buy', 'one_off', 'booking', 16500, 2700, 13800, 'pi_1', UID, 4, '2027-01-01T00:00:00.000Z']);
  // The same event again: the same row, not a second one.
  const twice = await runWebhook(purchase(), { tables: { coach_payments: [{ ...row }] } });
  assert.equal(twice.db.tables.coach_payments.length, 1);
  // A purchase that was not saved records no money either.
  const unsaved = await runWebhook(purchase(), { errors: { 'upsert:one_time_purchases': { code: '23505', message: 'conflict' } } });
  assert.equal((unsaved.db.tables.coach_payments || []).length, 0);
  // A table that isn't there yet changes nothing about the answer.
  const early = await runWebhook(purchase(), { errors: { 'upsert:coach_payments': { code: '42P01', message: 'relation does not exist' } } });
  assert.equal(early.status, 200);
  assert.ok(early.logs.some((l) => /NOT RECORDED: coach_payments is not set up/.test(l)));
  assert.equal(early.announced.length, 1, 'the notices still go');
});

test('webhook: a plan\'s first month is recorded from its invoice, the row invoice.paid writes too', async () => {
  const r = await runWebhook(coaching());
  assert.equal(r.status, 200);
  const rows = r.db.tables.coach_payments;
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].stripe_object_id, rows[0].billing, rows[0].kind, rows[0].gross_cents, rows[0].shape_fee_cents, rows[0].stripe_subscription_id], ['in_first', 'first', 'plan', 18000, 2700, 'sub_1']);
  // invoice.paid for the same first invoice, after the checkout: the same row, and no notice.
  const again = await runWebhook(invoicePaid({ id: 'in_first', billing_reason: 'subscription_create' }), { tables: { subscriptions: [subRow()], coach_payments: rows.map((x) => ({ ...x })) } });
  assert.equal(again.db.tables.coach_payments.length, 1);
  assert.deepEqual(again.announced, [], 'the checkout announces the first month');
  // A trial (no money) or a session with no invoice records nothing; an unreadable invoice is logged.
  const trial = await runWebhook(coaching({ payment_status: 'no_payment_required', amount_total: 0 }), { stripeOver: { invoices: { retrieve: async (id) => ({ id, status: 'paid', billing_reason: 'subscription_create', amount_paid: 0 }) } } });
  assert.equal((trial.db.tables.coach_payments || []).length, 0);
  const none = await runWebhook(coaching({ invoice: null }));
  assert.equal((none.db.tables.coach_payments || []).length, 0);
  const unread = await runWebhook(coaching(), { stripeOver: { invoices: { retrieve: async () => { throw new Error('rate limited'); } } } });
  assert.equal(unread.status, 200);
  assert.ok(unread.logs.some((l) => /first month NOT RECORDED/.test(l)));
});

test('webhook: invoice.paid records a coach plan\'s renewal, and never the membership', async () => {
  const r = await runWebhook(invoicePaid(), { tables: { subscriptions: [subRow()] } });
  assert.equal(r.status, 200);
  assert.equal(r.announced.length, 1, 'a renewal is still announced');
  assert.deepEqual(r.db.tables.coach_payments.map((x) => [x.stripe_object_id, x.billing, x.gross_cents, x.shape_fee_cents, x.coach_net_cents, x.stripe_account_id]), [['in_1', 'renewal', 18000, 2700, 15300, null]]);
  // On a coach's own account: stamped with it, and only that account's plan.
  const onAcct = await runWebhook(invoicePaid({}, ACCT), { secret: 'whsec_connect', tables: { subscriptions: [subRow({ stripe_account_id: ACCT })] } });
  assert.equal(onAcct.db.tables.coach_payments[0].stripe_account_id, ACCT);
  const elsewhere = await runWebhook(invoicePaid({}, ACCT), { secret: 'whsec_connect', tables: { subscriptions: [subRow({ stripe_account_id: 'acct_1Other' })] } });
  assert.equal((elsewhere.db.tables.coach_payments || []).length, 0);
  // The $5 membership: announced on a renewal, never recorded as coach money.
  const membership = await runWebhook(invoicePaid({ amount_paid: 500 }), { tables: { platform_subscriptions: [{ client_id: UID, stripe_subscription_id: 'sub_1' }], subscriptions: [subRow()] } });
  assert.equal(membership.announced[0].paidFor, 'membership');
  assert.equal((membership.db.tables.coach_payments || []).length, 0);
  const memberFirst = await runWebhook(invoicePaid({ amount_paid: 500, billing_reason: 'subscription_create' }), { tables: { platform_subscriptions: [{ client_id: UID, stripe_subscription_id: 'sub_1' }] } });
  assert.deepEqual([memberFirst.announced, memberFirst.db.tables.coach_payments || []], [[], []]);
  // A mid-period change is recorded as an adjustment, and not announced.
  const adj = await runWebhook(invoicePaid({ id: 'in_adj', billing_reason: 'subscription_update', amount_paid: 3000 }), { tables: { subscriptions: [subRow()] } });
  assert.deepEqual([adj.announced.length, adj.db.tables.coach_payments[0].billing], [0, 'adjustment']);
});

test('webhook: a refund of a recorded payment is its own negative row; any other charge writes nothing', async () => {
  const payment = pay.invoicePaymentRow(paidInvoice(), plan);
  const refunded = { id: 'evt_r', created: 1799366400, type: 'charge.refunded', data: { object: { id: 'ch_1', amount: 18000, amount_refunded: 6000, payment_intent: 'pi_9', invoice: 'in_1' } } };
  const refunds = { list: async (p) => { assert.equal(p.charge, 'ch_1'); return { data: [{ id: 're_1', amount: 6000, status: 'succeeded', created: 1799366400 }, { id: 're_0', amount: 100, status: 'failed', created: 1 }] }; } };
  const r = await runWebhook(refunded, { tables: { coach_payments: [{ ...payment }] }, stripeOver: { refunds, invoices: { retrieve: async (id) => ({ id }) } } });
  assert.equal(r.status, 200);
  const re = r.db.tables.coach_payments.find((x) => x.stripe_object_id === 're_1');
  assert.deepEqual([re.gross_cents, re.shape_fee_cents, re.coach_net_cents, re.refund_of, re.billing], [-6000, -900, -5100, 'in_1', 'refund']);
  assert.ok(!r.db.tables.coach_payments.some((x) => x.stripe_object_id === 're_0'), 'a failed refund returned nothing');
  // A newer API version's charge names no invoice: it is found from the PaymentIntent.
  const noInvoice = { ...refunded, data: { object: { ...refunded.data.object, invoice: undefined } } };
  const viaPi = await runWebhook(noInvoice, { tables: { coach_payments: [{ ...payment }] }, stripeOver: { refunds, invoicePayments: { list: async (p) => ({ data: p.payment.payment_intent === 'pi_9' ? [{ invoice: 'in_1' }] : [] }) } } });
  assert.ok(viaPi.db.tables.coach_payments.some((x) => x.stripe_object_id === 're_1'));
  // A refund on a coach's own account finds only that account's payment.
  const onAcct = { ...refunded, account: ACCT, data: { object: { ...refunded.data.object, invoice: undefined, application: 'ca_Shape' } } };
  const theirs = await runWebhook(onAcct, { secret: 'whsec_connect', tables: { coach_payments: [{ ...payment, stripe_payment_intent_id: 'pi_9', stripe_account_id: 'acct_1Other' }] }, stripeOver: { refunds } });
  assert.ok(!(theirs.db.tables.coach_payments || []).some((x) => x.billing === 'refund'), 'another account\'s payment is not this refund\'s');
  const mine = await runWebhook(onAcct, { secret: 'whsec_connect', tables: { coach_payments: [{ ...payment, stripe_payment_intent_id: 'pi_9', stripe_account_id: ACCT }] }, stripeOver: { refunds } });
  assert.ok(mine.db.tables.coach_payments.some((x) => x.stripe_object_id === 're_1' && x.stripe_account_id === ACCT));
  // A second refund of the same charge, with the first one's row already there (and listed first): the
  // payment is what it is matched against, never the earlier refund.
  const second = { list: async () => ({ data: [{ id: 're_1', amount: 6000, status: 'succeeded', created: 1799366400 }, { id: 're_2', amount: 3000, status: 'succeeded', created: 1799452800 }] }) };
  const prior = pay.refundRow({ id: 're_1', amount: 6000, status: 'succeeded', created: 1799366400 }, { ...payment, stripe_payment_intent_id: 'pi_9' });
  const again = await runWebhook(refunded, { tables: { coach_payments: [{ ...prior }, { ...payment, stripe_payment_intent_id: 'pi_9' }] }, stripeOver: { refunds: second, invoices: { retrieve: async (id) => ({ id }) } } });
  const re2 = again.db.tables.coach_payments.find((x) => x.stripe_object_id === 're_2');
  assert.ok(re2, 'the second refund is recorded');
  assert.deepEqual([re2.gross_cents, re2.shape_fee_cents, re2.refund_of], [-3000, -450, 'in_1']);
  // The membership's charge (no recorded coach payment): nothing, and Stripe's refunds aren't even asked.
  const listed = [];
  const other = await runWebhook(noInvoice, { stripeOver: { refunds: { list: async (p) => { listed.push(p); return { data: [] }; } } } });
  assert.deepEqual([other.status, other.db.tables.coach_payments || [], listed], [200, [], []]);
});

const changed = (type, sub = {}, extra = {}) => ({ id: 'evt_u', created: 1798761600, type, data: { object: { id: 'sub_1', status: 'active', items: { data: [{ current_period_end: 1800000000 }] }, cancel_at_period_end: true, cancel_at: null, canceled_at: 1798761600, ended_at: null, cancellation_details: { reason: 'cancellation_requested', feedback: null, comment: 'Budget' }, ...sub } }, ...extra });

test('webhook: a cancellation is kept on the row, an older event can\'t undo it, and before the migration the status still moves', async () => {
  const r = await runWebhook(changed('customer.subscription.updated'), { tables: { subscriptions: [subRow()] } });
  const s = r.db.tables.subscriptions[0];
  assert.deepEqual([s.status, s.cancel_at_period_end, s.canceled_at, s.cancellation_comment, s.cancel_synced_at], ['active', true, '2027-01-01T00:00:00.000Z', 'Budget', '2027-01-01T00:00:00.000Z']);
  // An update from an hour before, delivered late: the status moves, the cancellation doesn't.
  const late = await runWebhook(changed('customer.subscription.updated', { status: 'past_due', cancel_at_period_end: false, cancellation_details: null }, { created: 1798761600 - 3600 }), { tables: { subscriptions: [{ ...s }] } });
  const l = late.db.tables.subscriptions[0];
  assert.deepEqual([l.status, l.cancel_at_period_end, l.cancellation_comment], ['past_due', true, 'Budget']);
  // A deletion always lands, older or not.
  const gone = await runWebhook(changed('customer.subscription.deleted', { status: 'canceled', ended_at: 1800000000 }, { created: 1798761600 - 7200 }), { tables: { subscriptions: [{ ...s }] } });
  assert.deepEqual([gone.db.tables.subscriptions[0].status, gone.db.tables.subscriptions[0].ended_at], ['canceled', '2027-01-15T08:00:00.000Z']);
  // Before 2026-11-05-subscription-cancellations.sql: the write is retried without the columns.
  const missing = { code: 'PGRST204', message: "Could not find the 'cancel_at' column" };
  const early = await runWebhook(changed('customer.subscription.updated', { status: 'past_due' }), {
    tables: { subscriptions: [subRow()] },
    errors: { 'update:subscriptions': (st) => ('cancel_at' in st.payload ? missing : null) },
  });
  assert.equal(early.db.tables.subscriptions[0].status, 'past_due');
  assert.ok(early.logs.some((l) => /cancellation columns not there yet/.test(l)));
  // A cancelled plan stays cancelled (L9), the cancellation columns with it.
  const reopened = await runWebhook(changed('customer.subscription.updated', { cancel_at_period_end: false }, { created: 1898761600 }), { tables: { subscriptions: [subRow({ status: 'canceled', cancel_at_period_end: true })] } });
  assert.deepEqual([reopened.db.tables.subscriptions[0].status, reopened.db.tables.subscriptions[0].cancel_at_period_end], ['canceled', true]);
});

// ── The member's cancel step ──────────────────────────────────────────────────────────────────
async function runCancel(method, body, { tables = {}, errors = {}, user = { id: UID }, update } = {}) {
  const db = fakeDb({ tables, errors });
  const updates = [];
  const stripe = { subscriptions: { update: update || (async (id, params, opts) => { updates.push([id, params, opts]); return { id, cancel_at_period_end: true, cancel_at: null, canceled_at: 1798761600, items: { data: [{ current_period_end: 1800000000 }] }, cancellation_details: { comment: params.cancellation_details?.comment ?? null } }; }) } };
  const route = await loadRealModule(join(ROOT, 'src/app/api/stripe/cancel-plan/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/stripe', { stripe }],
      ['@/lib/stripe-connect', connect],
      ['@/lib/supabase/admin', { createAdminClient: () => db.client }],
      ['@/lib/request-auth', { currentUser: async () => user, clientForRequest: async () => db.client }],
      ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) })],
    ]),
  });
  const orig = { warn: console.warn, error: console.error };
  const logs = [];
  console.warn = (...a) => logs.push(a.map(String).join(' ')); console.error = console.warn;
  try {
    const res = method === 'GET'
      ? await route.GET(new Request('https://shape.test/api/stripe/cancel-plan'))
      : await route.POST(new Request('https://shape.test/api/stripe/cancel-plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json(), db, updates, logs };
  } finally { console.warn = orig.warn; console.error = orig.error; }
}

test('cancel step: lists the member\'s coach plans with whether each is set to end', async () => {
  const r = await runCancel('GET', null, { tables: {
    subscriptions: [subRow(), subRow({ id: 'x2', provider_role: 'nutritionist', provider_id: 9, stripe_subscription_id: 'sub_2', cancel_at_period_end: true })],
    trainers: [{ id: 4, name: 'Maya Okafor' }], nutritionists: [{ id: 9, name: 'Nia Hart' }],
  } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.plans.map((p) => [p.subscriptionId, p.name, p.ending, p.endsAt]), [[SUB_ROW, 'Maya Okafor', null, null], ['x2', 'Nia Hart', true, '2027-01-15T08:00:00.000Z']]);
  assert.equal(r.body.reasonMax, 500);
  assert.equal((await runCancel('GET', null, { user: null })).status, 401);
});

test('cancel step: cancels at the period\'s end through Stripe, with the member\'s own words kept for that coach', async () => {
  const r = await runCancel('POST', { subscriptionId: SUB_ROW, reason: '  Budget. Back in the fall.  ' }, { tables: { subscriptions: [subRow()] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.updates, [['sub_1', { cancel_at_period_end: true, cancellation_details: { comment: 'Budget. Back in the fall.' } }, undefined]]);
  const s = r.db.tables.subscriptions[0];
  assert.deepEqual([s.cancel_at_period_end, s.member_cancel_reason, typeof s.member_cancel_reason_at, s.status], [true, 'Budget. Back in the fall.', 'string', 'active']);
  assert.deepEqual([r.body.ok, r.body.endsAt, r.body.reasonSaved], [true, '2027-01-15T08:00:00.000Z', true]);
  // No answer: the question is optional, and nothing is stored as one.
  const quiet = await runCancel('POST', { subscriptionId: SUB_ROW }, { tables: { subscriptions: [subRow()] } });
  assert.equal(quiet.status, 200);
  assert.deepEqual(quiet.updates[0][1], { cancel_at_period_end: true });
  assert.ok(!('member_cancel_reason' in quiet.db.tables.subscriptions[0]));
  // On a coach's own account: asked there.
  const direct = await runCancel('POST', { subscriptionId: SUB_ROW, reason: 'x' }, { tables: { subscriptions: [subRow({ stripe_account_id: ACCT })], trainers: [{ id: 4, stripe_account_id: ACCT, stripe_account_status: 'active' }] } });
  assert.deepEqual(direct.updates[0][2], { stripeAccount: ACCT });
});

test('cancel step: never another member\'s plan, never an ended one, and a disconnected coach sends the member to support', async () => {
  assert.equal((await runCancel('POST', { subscriptionId: SUB_ROW }, { tables: { subscriptions: [subRow({ client_id: OTHER })] } })).status, 404);
  assert.equal((await runCancel('POST', { subscriptionId: 'not-a-uuid' }, { tables: { subscriptions: [subRow()] } })).status, 400);
  const ended = await runCancel('POST', { subscriptionId: SUB_ROW }, { tables: { subscriptions: [subRow({ status: 'canceled' })] } });
  assert.deepEqual([ended.status, ended.updates.length], [409, 0]);
  const off = await runCancel('POST', { subscriptionId: SUB_ROW }, { tables: { subscriptions: [subRow({ stripe_account_id: ACCT })], trainers: [{ id: 4, stripe_account_id: ACCT, stripe_account_status: 'disconnected' }] } });
  assert.deepEqual([off.status, off.body.reason, off.updates.length], [409, 'coach_disconnected', 0]);
  assert.equal((await runCancel('POST', { subscriptionId: SUB_ROW }, { user: null })).status, 401);
});

test('cancel step: a failed Stripe call changes nothing; a database before the migration still cancels', async () => {
  const failed = await runCancel('POST', { subscriptionId: SUB_ROW, reason: 'x' }, { tables: { subscriptions: [subRow()] }, update: async () => { throw new Error('stripe down'); } });
  assert.equal(failed.status, 502);
  assert.ok(!('member_cancel_reason' in failed.db.tables.subscriptions[0]), 'nothing written');
  const missing = { code: '42703', message: 'column does not exist' };
  const early = await runCancel('POST', { subscriptionId: SUB_ROW, reason: 'Budget' }, { tables: { subscriptions: [subRow()] }, errors: { 'update:subscriptions': missing } });
  assert.deepEqual([early.status, early.body.ok, early.body.reasonSaved], [200, true, false], 'the cancellation stands; the words are on Stripe');
  assert.equal(early.updates[0][1].cancellation_details.comment, 'Budget');
});

// ── The slim money route ──────────────────────────────────────────────────────────────────────
test('/api/coach/money: what the coach collected in their zone, and their Stripe summary', async () => {
  const db = fakeDb({ tables: {
    trainers: [{ id: 4, owner_id: UID, timezone: 'America/Los_Angeles', stripe_account_id: ACCT, stripe_account_status: 'active' }],
    coach_payments: [{ id: 'a', provider_role: 'trainer', provider_id: 4, paid_at: new Date().toISOString(), gross_cents: 18000, shape_fee_cents: 2700, coach_net_cents: 15300, billing: 'renewal', currency: 'usd' }],
  } });
  const loads = [];
  const route = await loadRealModule(join(ROOT, 'src/app/api/coach/money/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => ({ id: UID }), clientForRequest: async () => db.client }],
      ['@/lib/stripe', { loadStripe: async (...a) => { loads.push(a.slice(0, 2)); return { connected: true, payouts: [] }; } }],
      ['@/lib/time', await loadRealModule(join(ROOT, 'src/lib/time.ts'), { typescript: true })],
    ]),
  });
  const res = await route.GET(new Request('https://shape.test/api/coach/money?role=trainer'));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual([body.isCoach, body.providerId, body.zone, body.earnings.state, body.earnings.zone, body.earnings.lifetime.netCents, body.stripe.connected], [true, 4, 'America/Los_Angeles', 'ready', 'America/Los_Angeles', 15300, true]);
  assert.deepEqual(loads, [[ACCT, 'active']]);
  assert.equal((await route.GET(new Request('https://shape.test/api/coach/money'))).status, 400);
  assert.deepEqual(await (await route.GET(new Request('https://shape.test/api/coach/money?role=nutritionist'))).json(), { isCoach: false });
});

// ── Payouts ───────────────────────────────────────────────────────────────────────────────────
test('payouts: the last four months, a page at a time, and a cut read says so', async () => {
  const listed = [];
  const page = (n, more) => ({ data: Array.from({ length: n }, (_, i) => ({ id: `po_${listed.length}_${i}`, amount: 100, currency: 'usd', status: 'paid', arrival_date: 1798761600, created: 1798761600 })), has_more: more });
  const make = (pages) => loadRealModule(join(ROOT, 'src/lib/stripe.ts'), { typescript: true, registry: new Map([['stripe', class { constructor() {
    this.balance = { retrieve: async () => ({ available: [{ amount: 500 }], pending: [] }) };
    this.payouts = { list: async (p) => { listed.push(p); return pages.shift(); } };
    this.accounts = { retrieve: async () => ({ settings: { payouts: { schedule: { interval: 'daily', delay_days: 2 } } } }) };
  } }]]) });
  const orig = console.warn; console.warn = () => {};
  let S;
  try { S = await make([page(100, true), page(30, false)]); } finally { console.warn = orig; }
  const now = Date.UTC(2026, 10, 5);
  const s = await S.loadStripe(ACCT, 'active', now);
  assert.equal(s.payouts.length, 130);
  assert.equal(listed[0].created.gte, Math.floor((now - S.PAYOUT_HISTORY_DAYS * 86400000) / 1000), 'back about four months');
  assert.ok(listed[1].starting_after, 'the next page');
  assert.deepEqual([s.payoutsSince, s.payoutsCut], [now - S.PAYOUT_HISTORY_DAYS * 86400000, false]);
  listed.length = 0;
  const S2 = await make(Array.from({ length: 6 }, () => page(100, true)));
  const cut = await S2.loadStripe(ACCT, 'active', now);
  assert.deepEqual([listed.length, cut.payoutsCut], [S2.PAYOUT_PAGES, true]);
});

test('payout history and next payout, from the coach\'s own schedule; never Shape\'s net', () => {
  const now = new Date(2026, 10, 5, 10).getTime(); // a Thursday, local
  const p = (id, status, daysAgo) => ({ id, status, amountCents: 1000, arrivalDate: now - daysAgo * 86400000, created: now - daysAgo * 86400000 });
  const h = CF.payoutHistory({ payouts: [p('a', 'paid', 2), p('b', 'failed', 10), p('c', 'canceled', 3), p('d', 'paid', 200), p('e', 'in_transit', 0)], payoutsSince: now - 125 * 86400000, payoutsCut: false }, { now });
  assert.deepEqual(h.rows.map((r) => r.id), ['e', 'a', 'b'], 'newest first, four months, no cancelled payout');
  assert.deepEqual([h.paidCents, h.failed, h.complete], [1000, 1, true]);
  assert.equal(CF.payoutHistory({ payouts: [], payoutsCut: true }, { now }).complete, false);
  assert.equal(CF.payoutHistory({ payouts: [], payoutsSince: now - 30 * 86400000 }, { now }).complete, false, 'a read that didn\'t reach back that far');
  // The next payout from the schedule.
  assert.equal(CF.nextPayout(null), null);
  assert.deepEqual(CF.nextPayout({ schedule: { interval: 'manual' } }, now), { interval: 'manual', delayDays: null });
  assert.deepEqual(CF.nextPayout({ schedule: { interval: 'daily', delayDays: 2 } }, now), { interval: 'daily', delayDays: 2 });
  assert.deepEqual(CF.nextPayout({ schedule: { interval: 'weekly', weeklyAnchor: 'friday', delayDays: 7 } }, now), { interval: 'weekly', date: '2026-11-06', delayDays: 7 });
  assert.equal(CF.nextPayout({ schedule: { interval: 'weekly', weeklyAnchor: 'thursday' } }, now).date, '2026-11-05', 'today, until today\'s is made');
  assert.equal(CF.nextPayout({ schedule: { interval: 'weekly', weeklyAnchor: 'thursday' }, payouts: [{ created: now - 3600000 }] }, now).date, '2026-11-12');
  assert.equal(CF.nextPayout({ schedule: { interval: 'monthly', monthlyAnchor: 31 } }, now).date, '2026-11-30', 'a short month pays on its last day');
  assert.equal(CF.nextPayout({ schedule: { interval: 'monthly', monthlyAnchor: 1 } }, now).date, '2026-12-01');
  // Collected: only a ready record.
  assert.equal(CF.collectedFrom({ state: 'not_set_up' }), null);
  assert.equal(CF.collectedFrom(null), null);
  assert.deepEqual(CF.collectedFrom({ state: 'ready', month: { from: '2026-11-01', to: '2026-11-04', netCents: 5, grossCents: 6, feeCents: 1, refundedCents: 0, payments: 1 }, lifetime: { since: 'x', netCents: 9, grossCents: 10, feeCents: 1, refundedCents: 0, payments: 2 } }).month.netCents, 5);
});

// ── The backfill ──────────────────────────────────────────────────────────────────────────────
test('backfill: coach plans and one-off purchases from Stripe, on each row\'s own account; a dry run writes nothing', async () => {
  const bf = await import(pathToFileURL(join(ROOT, 'scripts/backfill-coach-payments.mjs')).href);
  const db = fakeDb({ tables: {
    subscriptions: [subRow({ stripe_account_id: ACCT })],
    one_time_purchases: [{ id: 'p1', client_id: UID, provider_role: 'nutritionist', provider_id: 9, kind: 'meal_plan', status: 'refunded', price_cents: 5000, stripe_checkout_session_id: 'cs_p1', created_at: '2026-10-01T00:00:00Z' }],
    platform_subscriptions: [{ client_id: UID, stripe_subscription_id: 'sub_m' }],
  } });
  const asked = [];
  const stripe = {
    subscriptions: { retrieve: async (id, _p, o) => { asked.push(['sub', id, o]); return { id, cancel_at_period_end: true, canceled_at: 1798761600, cancellation_details: { comment: 'Budget' } }; } },
    invoices: { list: async (p, o) => { asked.push(['inv', p.subscription, o]); return { data: [paidInvoice({ id: 'in_a', billing_reason: 'subscription_create' }), paidInvoice({ id: 'in_b' }), paidInvoice({ id: 'in_c', billing_reason: 'manual' })], has_more: false }; } },
    invoicePayments: { list: async (p) => ({ data: [{ status: 'paid', payment: { payment_intent: `pi_${p.invoice}` } }] }) },
    refunds: { list: async (p) => ({ data: p.payment_intent === 'pi_in_b' ? [{ id: 're_b', amount: 18000, status: 'succeeded', created: 1799366400 }] : p.payment_intent === 'pi_meal' ? [{ id: 're_m', amount: 5000, status: 'succeeded', created: 1799366400 }] : [] }) },
    checkout: { sessions: { retrieve: async (id, _p, o) => { asked.push(['cs', id, o]); return { id, payment_status: 'paid', amount_total: 5000, currency: 'usd', payment_intent: 'pi_meal', created: 1798000000 }; } } },
    paymentIntents: { retrieve: async (id) => ({ id, application_fee_amount: 750, latest_charge: { created: 1798100000 } }) },
  };
  const plan = await bf.planBackfill({ admin: db.client, stripe });
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.payments.map((r) => [r.stripe_object_id, r.billing, r.gross_cents, r.coach_net_cents, r.stripe_account_id]).sort(), [
    ['cs_p1', 'one_off', 5000, 4250, null], ['in_a', 'first', 18000, 15300, ACCT], ['in_b', 'renewal', 18000, 15300, ACCT], ['re_b', 'refund', -18000, -15300, ACCT], ['re_m', 'refund', -5000, -4250, null],
  ]);
  assert.equal(plan.payments.find((r) => r.stripe_object_id === 'in_b').stripe_payment_intent_id, 'pi_in_b', 'the PaymentIntent, for later refunds');
  assert.ok(asked.filter((a) => a[0] !== 'cs').every((a) => a[2]?.stripeAccount === ACCT), 'the plan is read on the coach\'s account');
  assert.ok(!asked.some((a) => a[1] === 'sub_m'), 'never the membership');
  assert.deepEqual(plan.cancellations.map((c) => [c.id, c.patch.cancel_at_period_end, c.patch.cancellation_comment]), [[SUB_ROW, true, 'Budget']]);
  assert.equal((db.tables.coach_payments || []).length, 0, 'the plan writes nothing');
  const s = bf.summarize(plan);
  assert.deepEqual(s.map((x) => [x.coach, x.payments, x.refunds, x.netCents]), [['nutritionist:9', 1, 1, 0], ['trainer:4', 2, 1, 15300]]);
  // Written: idempotent on the Stripe id.
  const done = await bf.writeBackfill(db.client, plan);
  assert.deepEqual([done.payments, done.cancellations], [5, 1]);
  await bf.writeBackfill(db.client, plan);
  assert.equal(db.tables.coach_payments.length, 5, 'a second run writes the same rows');
  assert.equal(db.tables.subscriptions[0].cancellation_comment, 'Budget');
  // Before the migration it stops and says which.
  const early = fakeDb({ errors: { 'upsert:coach_payments': { code: '42P01', message: 'no table' } } });
  await assert.rejects(bf.writeBackfill(early.client, plan), /run supabase-migrations\/2026-11-05-coach-payments\.sql/);
  // One plan Stripe can't read is a problem in the report, not the end of the run.
  const flaky = await bf.planBackfill({ admin: db.client, stripe: { ...stripe, subscriptions: { retrieve: async () => { throw new Error('No such subscription'); } } } });
  assert.equal(flaky.problems.length, 1);
  assert.ok(flaky.payments.some((r) => r.stripe_object_id === 'cs_p1'));
});

// ── Where it is wired ─────────────────────────────────────────────────────────────────────────
test('wiring: the portal can\'t cancel, the routes are listed, the churn reason and earnings reach the Business page', () => {
  assert.match(read('src/lib/coach-checkout.ts'), /subscription_cancel: \{ enabled: false \},/);
  const war = read('src/lib/warroom.ts');
  assert.match(war, /\['\/api\/stripe\/cancel-plan', 'GET,POST'\]/);
  assert.match(war, /\['\/api\/coach\/money', 'GET'\]/);
  for (const role of ['trainer', 'nutritionist']) {
    const src = read(`src/app/api/${role}/analytics/route.ts`);
    assert.match(src, /reason: churnReason\(r\),/, role);
    assert.match(src, /coachEarnings\(supabase, \{ role: '[a-z]+', providerId, zone:/, role);
    assert.match(src, /^\s+earnings,$/m, role);
  }
  const roster = read('src/lib/coach-roster.ts');
  assert.match(roster, /\.\.\.\(subsUnknown \|\| !e\.plans \? \{ planEnding: null, planEndsAt: null \} : planEndingOf\(e\.open\)\),/);
});
