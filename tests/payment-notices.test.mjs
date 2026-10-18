// A notice for every successful payment, to the member, the coach and the owner (owner,
// 2026-10-18: "all 3"). src/lib/payment-notices.ts decides who hears what and says it; the Stripe
// webhook calls it once a payment is recorded: a one-time purchase, a coach plan's first month,
// the membership's first month (checkout.session.completed), and every later month (invoice.paid).
// Both run as they ship (loadRealModule); stubs stand only where Stripe, a database or the
// notification writer would.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(ROOT, 'package.json'));
const nextServer = require_('next/server');
const read = (p) => fs.readFileSync(join(ROOT, p), 'utf8');

const UID = '55555555-5555-4555-8555-555555555555';
const OWNER = '11111111-1111-4111-8111-111111111111';
const COACH_USER = '22222222-2222-4222-8222-222222222222';
const IMPOSTOR = '33333333-3333-4333-8333-333333333333';
const UNCONFIRMED = '44444444-4444-4444-8444-444444444444';
const ACCT = 'acct_1CoachTrainer4';

// ── The module ────────────────────────────────────────────────────────────────────────────────
/** createNotification as notifications_dedupe_uidx makes it: a second (user, type, dedupe) is not stored. */
function fakeNotify({ fail = false } = {}) {
  const sent = [];
  const keys = new Set();
  return {
    sent,
    createNotification: async (_c, n) => {
      if (fail) throw new Error('notifications down');
      const k = `${n.userId}|${n.type}|${n.data?.dedupe}`;
      if (keys.has(k)) return false;
      keys.add(k);
      sent.push(n);
      return true;
    },
  };
}

async function loadNotices(notify, owners = ['owner@shape.test', 'second@shape.test']) {
  return loadRealModule(join(ROOT, 'src/lib/payment-notices.ts'), {
    typescript: true,
    registry: new Map([
      ['@supabase/supabase-js', {}],
      ['@/lib/notify', { createNotification: notify.createNotification }],
      ['@/lib/admin-access', { getOwnerEmails: () => owners }],
    ]),
  });
}

/**
 * The service-role client payment-notices reads: profiles (names, and the owners' lead by email),
 * trainers / nutritionists, and Supabase Auth's account for each lead.
 */
function fakeAdmin({ profiles = [], coaches = { trainers: [{ id: 4, name: 'Tom Trainer', owner_id: COACH_USER }] }, users = {}, errors = {} } = {}) {
  const reads = [];
  return {
    reads,
    from(table) {
      const st = { table, eqs: [], ins: [] };
      const run = () => {
        reads.push(st);
        if (errors[table]) return { data: null, error: errors[table] };
        const rows = table === 'profiles' ? profiles : coaches[table] ?? [];
        return { data: rows.filter((r) => st.eqs.every(([c, v]) => r[c] === v) && st.ins.every(([c, vs]) => vs.includes(r[c]))), error: null };
      };
      const q = {
        select: () => q,
        eq(c, v) { st.eqs.push([c, v]); return q; },
        in(c, v) { st.ins.push([c, v]); return q; },
        maybeSingle: async () => { const r = run(); return { data: r.data?.[0] ?? null, error: r.error }; },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      };
      return q;
    },
    auth: { admin: { getUserById: async (id) => ({ data: { user: users[id] ?? null }, error: null }) } },
  };
}

const PROFILES = [
  { id: UID, full_name: 'Cara Diaz', email: 'cara@example.com' },
  { id: OWNER, full_name: 'Chris Owner', email: 'owner@shape.test' },
  // Typed an owner's address into their profile; their account is someone else's.
  { id: IMPOSTOR, full_name: 'Ivy', email: 'second@shape.test' },
  { id: UNCONFIRMED, full_name: 'Una', email: 'owner@shape.test' },
];
const USERS = {
  [OWNER]: { id: OWNER, email: 'Owner@Shape.test', email_confirmed_at: '2026-01-01T00:00:00Z' },
  [IMPOSTOR]: { id: IMPOSTOR, email: 'ivy@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' },
  [UNCONFIRMED]: { id: UNCONFIRMED, email: 'owner@shape.test', email_confirmed_at: null },
};
const renewal = (extra = {}) => ({
  key: 'in_1', clientId: UID, amountCents: 12000, paidFor: 'coaching', renewal: true,
  provider: { role: 'trainer', id: 4 }, shapeFeeCents: 1800, coachCents: 10200, ...extra,
});

test('the copy: what the owner, the member and the coach are each told', async () => {
  const m = await loadNotices(fakeNotify());
  assert.equal(m.usd(12000), '$120.00');
  assert.equal(m.usd(-5), '$0.00');

  assert.deepEqual(m.ownerNotice(renewal(), 'Cara Diaz', 'Tom Trainer'), {
    title: '$120.00 from Cara Diaz',
    body: "Tom Trainer's monthly plan, a monthly renewal. Shape's fee: $18.00.",
  });
  assert.deepEqual(m.ownerNotice(renewal({ renewal: false, shapeFeeCents: 0 }), '', ''), {
    title: '$120.00 from A member',
    body: "A coach's monthly plan, the first month. No Shape fee on this one.",
  });
  assert.deepEqual(m.ownerNotice({ key: 'cs', clientId: UID, amountCents: 500, paidFor: 'membership', renewal: false }, 'Cara Diaz', ''), {
    title: '$5.00 from Cara Diaz',
    body: 'Shape membership, the first month.',
  }, 'the membership states no fee: it is all Shape\'s');
  assert.equal(m.ownerNotice({ key: 'in', clientId: UID, amountCents: 500, paidFor: 'membership', renewal: true }, 'Cara', '').body, 'Shape membership, a monthly renewal.');
  assert.equal(m.ownerNotice(renewal({ paidFor: 'booking', renewal: false, shapeFeeCents: 900 }), 'Cara', 'Tom').body, "A session with Tom. Shape's fee: $9.00.");
  assert.equal(m.ownerNotice(renewal({ paidFor: 'program', renewal: false, itemName: 'Strength 12', shapeFeeCents: null }), 'Cara', 'Tom').body, 'Strength 12 from Tom.');
  assert.equal(m.ownerNotice(renewal({ paidFor: 'meal_plan', renewal: false, itemName: '  ' }), 'Cara', '').body, "A meal plan from a coach. Shape's fee: $18.00.");

  assert.deepEqual(m.memberReceipt(renewal(), 'Tom Trainer'), { title: 'Payment received: $120.00', body: 'Your monthly plan with Tom Trainer renewed for another month.' });
  assert.equal(m.memberReceipt(renewal({ renewal: false }), '').body, 'Your monthly plan with your coach is paid for its first month.');
  assert.equal(m.memberReceipt({ key: 'cs', clientId: UID, amountCents: 500, paidFor: 'membership', renewal: false }, '').body, 'Your Shape membership is paid for its first month.');
  assert.equal(m.memberReceipt({ key: 'in', clientId: UID, amountCents: 500, paidFor: 'membership', renewal: true }, '').body, 'Your Shape membership renewed for another month.');
  assert.equal(m.memberReceipt(renewal({ paidFor: 'program', itemName: 'Strength 12' }), 'Tom').body, 'You bought Strength 12 from Tom.');
  assert.equal(m.memberReceipt(renewal({ paidFor: 'meal_plan' }), 'Tom').body, 'You bought a meal plan from Tom.');

  assert.deepEqual(m.coachRenewal(renewal(), 'Cara Diaz'), { title: 'Monthly payment: Cara Diaz', body: "Cara Diaz's monthly plan renewed · $102.00 to you." });
  assert.deepEqual(m.coachRenewal(renewal({ coachCents: null }), ''), { title: 'Monthly payment: A client', body: "A client's monthly plan renewed." });
});

test('who hears what: no second receipt for a paid session, and the coach hears only of a renewal', async () => {
  const m = await loadNotices(fakeNotify());
  assert.equal(m.memberGetsReceipt({ paidFor: 'booking' }), false, '"Your session is paid" is its receipt');
  for (const paidFor of ['membership', 'coaching', 'program', 'meal_plan']) assert.equal(m.memberGetsReceipt({ paidFor }), true, paidFor);
  assert.equal(m.coachGetsRenewal({ paidFor: 'coaching', renewal: true, provider: { role: 'trainer', id: 4 } }), true);
  assert.equal(m.coachGetsRenewal({ paidFor: 'coaching', renewal: false, provider: { role: 'trainer', id: 4 } }), false, 'the first month is the "New client" alert');
  assert.equal(m.coachGetsRenewal({ paidFor: 'membership', renewal: true, provider: null }), false);
  assert.equal(m.coachGetsRenewal({ paidFor: 'coaching', renewal: true, provider: null }), false);
});

test('the owners: a profile email is only a lead; the Auth account must have that address, confirmed', async () => {
  const m = await loadNotices(fakeNotify());
  const admin = fakeAdmin({ profiles: PROFILES, users: USERS });
  assert.deepEqual(await m.ownerAccountIds(admin), [OWNER]);
  const lead = admin.reads.find((r) => r.table === 'profiles');
  assert.deepEqual(lead.ins, [['email', ['owner@shape.test', 'second@shape.test']]]);

  const logs = [];
  const orig = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  try {
    assert.deepEqual(await m.ownerAccountIds(fakeAdmin({ profiles: PROFILES, users: USERS, errors: { profiles: { message: 'down' } } })), []);
  } finally { console.error = orig; }
  assert.ok(logs.some((l) => /owner accounts not read: down/.test(l)));
});

test('a renewal of a coach plan: the owner, the member and the coach are each told once, keyed on the invoice', async () => {
  const notify = fakeNotify();
  const m = await loadNotices(notify);
  const admin = fakeAdmin({ profiles: PROFILES, users: USERS });
  assert.deepEqual(await m.announcePayment(admin, renewal()), { owners: 1, member: true, coach: true });
  assert.deepEqual(notify.sent.map((n) => [n.userId, n.type, n.data.dedupe]), [
    [OWNER, 'platform_payment', 'pay:in_1'],
    [UID, 'payment_receipt', 'receipt:in_1'],
    [COACH_USER, 'payment', 'renewal:in_1'],
  ]);
  assert.equal(notify.sent[0].title, '$120.00 from Cara Diaz');
  assert.equal(notify.sent[1].body, 'Your monthly plan with Tom Trainer renewed for another month.');
  assert.equal(notify.sent[2].body, "Cara Diaz's monthly plan renewed · $102.00 to you.");
  assert.equal(notify.sent[0].data.side, 'owner');
  assert.equal(notify.sent[1].data.side, 'client');
  assert.equal(notify.sent[2].data.side, 'coach');

  // Stripe delivers the same event again: nothing is stored twice.
  assert.deepEqual(await m.announcePayment(admin, renewal()), { owners: 0, member: false, coach: false });
  assert.equal(notify.sent.length, 3);
});

test('a first month, a paid session, a nutritionist and the membership each reach the right people', async () => {
  const notify = fakeNotify();
  const m = await loadNotices(notify);
  const admin = fakeAdmin({ profiles: PROFILES, users: USERS, coaches: { trainers: [{ id: 4, name: 'Tom Trainer', owner_id: COACH_USER }], nutritionists: [{ id: 9, name: 'Nia Nutrition', owner_id: 'nia-user' }] } });

  assert.deepEqual(await m.announcePayment(admin, renewal({ key: 'cs_first', renewal: false })), { owners: 1, member: true, coach: false }, 'the first month: startCoaching already alerts the coach');
  assert.deepEqual(await m.announcePayment(admin, renewal({ key: 'cs_session', paidFor: 'booking', renewal: false })), { owners: 1, member: false, coach: false });
  assert.deepEqual(await m.announcePayment(admin, renewal({ key: 'in_n', provider: { role: 'nutritionist', id: 9 } })), { owners: 1, member: true, coach: true });
  assert.equal(notify.sent.find((n) => n.data.dedupe === 'renewal:in_n').userId, 'nia-user');
  assert.deepEqual(await m.announcePayment(admin, { key: 'in_m', clientId: UID, amountCents: 500, paidFor: 'membership', renewal: true }), { owners: 1, member: true, coach: false });
});

test('nothing for a payment that moved no money, and a failure never escapes', async () => {
  const notify = fakeNotify();
  const m = await loadNotices(notify);
  const admin = fakeAdmin({ profiles: PROFILES, users: USERS });
  for (const p of [renewal({ amountCents: 0 }), renewal({ amountCents: null }), renewal({ key: '' }), renewal({ clientId: '' })]) {
    assert.deepEqual(await m.announcePayment(admin, p), { owners: 0, member: false, coach: false });
  }
  assert.equal(admin.reads.length, 0, 'not even a read');
  assert.equal(notify.sent.length, 0);

  const failing = await loadNotices(fakeNotify({ fail: true }));
  const logs = [];
  const orig = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  try {
    assert.deepEqual(await failing.announcePayment(admin, renewal()), { owners: 0, member: false, coach: false });
  } finally { console.error = orig; }
  assert.ok(logs.some((l) => /announcePayment failed: notifications down/.test(l)));
});

// ── The webhook ───────────────────────────────────────────────────────────────────────────────
/** A Supabase client over `tables`: eq / in / is filters, select / upsert / update / maybeSingle, every statement recorded. */
function fakeDb({ tables = {}, errors = {} } = {}) {
  const calls = [];
  const from = (table) => {
    const st = { table, op: 'select', eqs: [], ins: [], iss: [], payload: null };
    const rows = () => (tables[table] ??= []);
    const run = () => {
      calls.push(st);
      const err = errors[`${st.op}:${table}`];
      if (err) return { data: null, error: err };
      const hit = rows().filter((r) => st.eqs.every(([c, v]) => r[c] === v) && st.ins.every(([c, vs]) => vs.includes(r[c])) && st.iss.every(([c, v]) => (r[c] ?? null) === v));
      if (st.op === 'upsert' || st.op === 'insert') {
        const row = { id: `${table}-${rows().length + 1}`, ...st.payload };
        rows().push(row);
        return { data: [row], error: null };
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
      upsert(p) { st.op = 'upsert'; st.payload = p; return q; },
      update(p) { st.op = 'update'; st.payload = p; return q; },
      eq(c, v) { st.eqs.push([c, v]); return q; },
      in(c, v) { st.ins.push([c, v]); return q; },
      is(c, v) { st.iss.push([c, v]); return q; },
      not() { return q; }, limit() { return q; }, order() { return q; }, gt() { return q; }, neq() { return q; },
      maybeSingle: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return q;
  };
  return { client: { from, rpc: async () => ({ data: 0, error: null }) }, calls, tables };
}

const connect = await loadRealModule(join(ROOT, 'src/lib/stripe-connect.ts'), { typescript: true });

async function runWebhook(event, { tables = {}, errors = {}, sub = {}, secret = 'whsec_platform' } = {}) {
  const db = fakeDb({ tables, errors });
  const announced = [];
  const stripe = {
    webhooks: { constructEvent: (raw, sig, s) => { if (sig !== `signed:${s}`) throw new Error('No signatures found'); return JSON.parse(raw); } },
    paymentIntents: { retrieve: async (id) => ({ id, application_fee_amount: 2700, application: 'ca_Shape' }) },
    subscriptions: { retrieve: async (id) => ({ id, status: 'active', application: 'ca_Shape', items: { data: [{ current_period_end: 1800000000 }] }, ...sub }) },
    invoices: { retrieve: async (id) => ({ id }) },
  };
  const route = await loadRealModule(join(ROOT, 'src/app/api/stripe/webhook/route.ts'), {
    typescript: true,
    registry: new Map([
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
const checkout = (object, account) => ({ id: 'evt_c', type: 'checkout.session.completed', ...(account ? { account } : {}), data: { object } });
const purchase = (extra = {}, object = {}) => checkout({ id: 'cs_buy', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_1', amount_total: 16500, metadata: meta({ kind: 'booking', ...extra }), ...object });
const coaching = (object = {}) => checkout({ id: 'cs_sub', mode: 'subscription', payment_status: 'paid', subscription: 'sub_1', customer: 'cus_1', amount_total: 18000, metadata: meta(), ...object });
const invoicePaid = (object = {}, account) => ({ id: 'evt_i', type: 'invoice.paid', ...(account ? { account } : {}), data: { object: { id: 'in_1', billing_reason: 'subscription_cycle', amount_paid: 12000, parent: { subscription_details: { subscription: 'sub_1' } }, ...object } } });

test('webhook: a one-time purchase is announced once saved, for what Stripe charged and the fee its payment carries', async () => {
  const r = await runWebhook(purchase());
  assert.equal(r.status, 200);
  assert.deepEqual(r.announced, [{
    key: 'cs_buy', clientId: UID, amountCents: 16500, paidFor: 'booking', renewal: false,
    provider: { role: 'trainer', id: 4 }, shapeFeeCents: 2700, itemName: null,
  }]);

  // A program names the plan read from coach_plans, never the checkout's item_name.
  const prog = await runWebhook(purchase({ kind: 'program', plan_id: 'plan-1', item_name: 'Anything a buyer typed' }), { tables: { coach_plans: [{ id: 'plan-1', kind: 'program', name: 'Strength 12', meta: {}, detail: {} }] } });
  assert.equal(prog.announced[0].paidFor, 'program');
  assert.equal(prog.announced[0].itemName, 'Strength 12');

  // Without an amount from Stripe, the recorded price.
  const noTotal = await runWebhook(purchase({}, { amount_total: null }));
  assert.equal(noTotal.announced[0].amountCents, 18000);
  // A nutritionist's sale names the nutritionist.
  const nut = await runWebhook(purchase({ provider_role: 'nutritionist', kind: 'meal_plan' }));
  assert.deepEqual(nut.announced[0].provider, { role: 'nutritionist', id: 4 });
  assert.equal(nut.announced[0].paidFor, 'meal_plan');
});

test('webhook: nothing is announced for a purchase that was not saved, or not paid', async () => {
  const notSaved = await runWebhook(purchase(), { errors: { 'upsert:one_time_purchases': { code: '23502', message: 'null value' } } });
  assert.equal(notSaved.status, 200);
  assert.deepEqual(notSaved.announced, []);
  const unpaid = await runWebhook(purchase({}, { payment_status: 'unpaid' }));
  assert.deepEqual(unpaid.announced, []);
});

test('webhook: a coach plan\'s first month is announced with Shape\'s fee at the rate stamped on it', async () => {
  const r = await runWebhook(coaching());
  assert.deepEqual(r.announced, [{
    key: 'cs_sub', clientId: UID, amountCents: 18000, paidFor: 'coaching', renewal: false,
    provider: { role: 'trainer', id: 4 }, shapeFeeCents: 2700,
  }]);
  const byo = await runWebhook(coaching({ metadata: meta({ origin: 'coach_link', fee_bps: '0' }) }));
  assert.equal(byo.announced[0].shapeFeeCents, 0, 'a client the coach brought: no Shape fee');

  // Not saved or not paid: nothing.
  assert.deepEqual((await runWebhook(coaching(), { errors: { 'upsert:subscriptions': { code: '23502', message: 'null value' } } })).announced, []);
  assert.deepEqual((await runWebhook(coaching({ payment_status: 'unpaid' }))).announced, []);
  // Delivered (or retried) after the member cancelled: the money moved, so it is announced; only
  // the coaching start waits on a live plan (Codex on #2402).
  const ended = await runWebhook(coaching(), { sub: { status: 'canceled' } });
  assert.deepEqual(ended.announced, r.announced);
  assert.equal(ended.db.tables.subscriptions[0].status, 'canceled', 'recorded as ended');
});

test('webhook: the membership\'s first month is announced once its row is saved', async () => {
  const membership = coaching({ id: 'cs_member', amount_total: 500, metadata: { client_id: UID, plan: 'shape_platform', price_cents: '500' } });
  const r = await runWebhook(membership);
  assert.deepEqual(r.announced, [{ key: 'cs_member', clientId: UID, amountCents: 500, paidFor: 'membership', renewal: false }]);
  assert.deepEqual((await runWebhook(membership, { errors: { 'upsert:platform_subscriptions': { code: '23502', message: 'x' } } })).announced, []);
  assert.deepEqual((await runWebhook(coaching({ id: 'cs_member', amount_total: 500, payment_status: 'unpaid', metadata: { client_id: UID, plan: 'shape_platform', price_cents: '500' } }))).announced, []);
  // Ended since it was paid: still announced (Codex on #2402).
  assert.deepEqual((await runWebhook(membership, { sub: { status: 'canceled' } })).announced, r.announced);
});

test('webhook: invoice.paid announces each later month, the membership and a coach plan, split at its row\'s fee', async () => {
  const membership = await runWebhook(invoicePaid({ amount_paid: 500 }), { tables: { platform_subscriptions: [{ client_id: UID, stripe_subscription_id: 'sub_1' }] } });
  assert.equal(membership.status, 200);
  assert.deepEqual(membership.announced, [{ key: 'in_1', clientId: UID, amountCents: 500, paidFor: 'membership', renewal: true }]);

  const plan = { client_id: UID, provider_id: 4, provider_role: 'trainer', fee_bps: 1500, stripe_subscription_id: 'sub_1' };
  const coach = await runWebhook(invoicePaid(), { tables: { subscriptions: [plan] } });
  assert.deepEqual(coach.announced, [{
    key: 'in_1', clientId: UID, amountCents: 12000, paidFor: 'coaching', renewal: true,
    provider: { role: 'trainer', id: 4 }, shapeFeeCents: 1800, coachCents: 10200,
  }]);
  const byo = await runWebhook(invoicePaid(), { tables: { subscriptions: [{ ...plan, fee_bps: 0 }] } });
  assert.equal(byo.announced[0].shapeFeeCents, 0);
  assert.equal(byo.announced[0].coachCents, 12000);
  const unknownRate = await runWebhook(invoicePaid(), { tables: { subscriptions: [{ ...plan, fee_bps: null }] } });
  assert.equal(unknownRate.announced[0].shapeFeeCents, null, 'an unreadable rate is not guessed');
  assert.equal(unknownRate.announced[0].coachCents, null);
});

test('webhook: invoice.paid announces nothing for a first invoice, a $0 one, or a subscription Shape does not hold', async () => {
  const tables = () => ({ subscriptions: [{ client_id: UID, provider_id: 4, provider_role: 'trainer', fee_bps: 1500, stripe_subscription_id: 'sub_1' }] });
  assert.deepEqual((await runWebhook(invoicePaid({ billing_reason: 'subscription_create' }), { tables: tables() })).announced, [], 'the checkout announces the first month');
  assert.deepEqual((await runWebhook(invoicePaid({ billing_reason: 'manual' }), { tables: tables() })).announced, []);
  assert.deepEqual((await runWebhook(invoicePaid({ amount_paid: 0 }), { tables: tables() })).announced, []);
  assert.deepEqual((await runWebhook(invoicePaid({ parent: null }), { tables: tables() })).announced, []);
  assert.deepEqual((await runWebhook(invoicePaid({}), { tables: {} })).announced, [], 'no row: not Shape\'s');
  assert.deepEqual((await runWebhook(invoicePaid({}), { tables: { subscriptions: [{ ...tables().subscriptions[0], provider_role: 'gym' }] } })).announced, []);

  const failed = await runWebhook(invoicePaid({}), { tables: tables(), errors: { 'select:subscriptions': { message: 'timeout' } } });
  assert.equal(failed.status, 200, 'a notice is not worth a Stripe retry');
  assert.deepEqual(failed.announced, []);
  assert.ok(failed.logs.some((l) => /renewal: subscription read failed/.test(l)));
});

test('webhook: a connected account\'s invoice finds only rows on that account, and never the membership', async () => {
  const onAcct = { client_id: UID, provider_id: 4, provider_role: 'trainer', fee_bps: 1500, stripe_subscription_id: 'sub_1', stripe_account_id: ACCT };
  const r = await runWebhook(invoicePaid({}, ACCT), { secret: 'whsec_connect', tables: { subscriptions: [onAcct], platform_subscriptions: [{ client_id: UID, stripe_subscription_id: 'sub_1' }] } });
  assert.equal(r.announced.length, 1);
  assert.equal(r.announced[0].paidFor, 'coaching');
  assert.ok(!r.db.calls.some((c) => c.table === 'platform_subscriptions'), 'the membership is never on a coach\'s account');
  const read = r.db.calls.find((c) => c.table === 'subscriptions');
  assert.deepEqual(read.eqs, [['stripe_subscription_id', 'sub_1'], ['stripe_account_id', ACCT]]);

  const elsewhere = await runWebhook(invoicePaid({}, ACCT), { secret: 'whsec_connect', tables: { subscriptions: [{ ...onAcct, stripe_account_id: 'acct_1Other' }] } });
  assert.deepEqual(elsewhere.announced, []);
});

test('the notices sit after each save in the webhook, and the module is the only writer', () => {
  const src = read('src/app/api/stripe/webhook/route.ts');
  assert.doesNotMatch(src, /createNotification/, 'the webhook writes no notification itself');
  const at = (needle, from = 0) => src.indexOf(needle, from);
  // One-time: inside the saved-purchase block, after the coach's notice.
  const paid = at('await coachPaid(admin, {');
  assert.ok(at("key: session.id,\n              clientId,\n              amountCents: session.amount_total ?? priceCents,", paid) > paid);
  // Coaching: inside startCoaching's guard; membership: inside welcomeMember's.
  const start = at('await startCoaching(admin, {');
  assert.ok(at("paidFor: 'coaching',\n            renewal: false,", start) > start);
  assert.match(src, /if \(membershipSaved && moneyMoved && !subEnded\) await welcomeMember\(admin, clientId\);[\s\S]{0,300}if \(membershipSaved && moneyMoved\) \{\s+await announcePayment\(admin, \{/);
  // A paid payment is announced whether or not the plan has ended since; only onboarding waits on a live one.
  assert.match(src, /if \(!subErr && moneyMoved && providerId && \(providerRole === 'trainer' \|\| providerRole === 'nutritionist'\)\) \{\s+const firstMonthCents/);
  assert.match(src, /case 'invoice\.paid': \{[\s\S]{0,600}if \(invoice\.billing_reason !== 'subscription_cycle' \|\| !\(invoice\.amount_paid > 0\) \|\| !invoice\.id\) break;/);
});
