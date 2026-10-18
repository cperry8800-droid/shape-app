// Coach direct charges, PR A: the groundwork (owner, 2026-10-18: "shape is not paying processing
// fee"). Coach charges move from destination charges on Shape's account to direct charges on each
// coach's Standard connected account; this PR changes nothing about how anything is charged, and
// lays what that move needs:
//   · src/lib/stripe-connect.ts: acctOpts, the ORIGIN GUARD, the member's customer on a coach's
//     account, and the platform-only customer read;
//   · the webhook: a second signing secret (the Connect destination), every Stripe read on the
//     event's account, the origin guard before a Connect event writes a row, rows found and stamped
//     by account, never the membership, the price a coach sets, a disconnected account;
//   · refunds, the member's cancel, the renewals list and the return page, each on the row's
//     account (removal: tests/admin-account-actions.test.mjs);
//   · the migration's shape.
// Every module here runs as it ships (loadRealModule); stubs stand only where Stripe or a database
// would.

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
const code = (p) => read(p).replace(/^\s*--.*$/gm, '');

const UID = '55555555-5555-4555-8555-555555555555';
const ACCT = 'acct_1CoachTrainer4';
const OTHER_ACCT = 'acct_1SomeoneElse77';
const APP = 'ca_ShapeConnectApp';

const connect = await loadRealModule(join(ROOT, 'src/lib/stripe-connect.ts'), { typescript: true });

/** Runs `fn` with these env vars set (undefined removes one), then puts them back. */
async function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { return await fn(); } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/**
 * A Supabase client over `tables`: eq / neq / is / in filters, select / insert / upsert / update /
 * maybeSingle, every statement recorded. `errors['op:table']` answers that statement with an error
 * (a function gets the statement, and may return null to let it run).
 */
function fakeDb({ tables = {}, errors = {}, rpc = async () => ({ data: 0, error: null }) } = {}) {
  const calls = [];
  const from = (table) => {
    const st = { table, op: 'select', cols: null, eqs: [], neqs: [], iss: [], ins: [], ors: [], payload: null, opts: null };
    const rows = () => (tables[table] ??= []);
    const run = () => {
      calls.push(st);
      const injected = errors[`${st.op}:${table}`];
      const err = typeof injected === 'function' ? injected(st) : injected;
      if (err) return { data: null, error: err };
      const hit = rows().filter((r) =>
        st.eqs.every(([c, v]) => r[c] === v)
        // neq is SQL's <>: a NULL is neither equal nor unequal, so its row is filtered out.
        && st.neqs.every(([c, v]) => r[c] != null && r[c] !== v)
        && st.iss.every(([c, v]) => (r[c] ?? null) === v)
        && st.ins.every(([c, vs]) => vs.includes(r[c]))
        && st.ors.every((alts) => alts.some((f) => f(r))));
      if (st.op === 'insert' || st.op === 'upsert') {
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
      select(c) { if (st.op === 'select') st.cols = c; return q; },
      insert(p) { st.op = 'insert'; st.payload = p; return q; },
      upsert(p, o) { st.op = 'upsert'; st.payload = p; st.opts = o; return q; },
      update(p) { st.op = 'update'; st.payload = p; return q; },
      eq(c, v) { st.eqs.push([c, v]); return q; },
      neq(c, v) { st.neqs.push([c, v]); return q; },
      is(c, v) { st.iss.push([c, v]); return q; },
      in(c, v) { st.ins.push([c, v]); return q; },
      // PostgREST's or('col.op.value,…'), for is / eq / neq; neq on a NULL is false, as in SQL.
      or(expr) {
        st.ors.push(expr.split(',').map((part) => {
          const [c, op, ...rest] = part.split('.');
          const v = rest.join('.');
          if (op === 'is') return (r) => (r[c] ?? null) === (v === 'null' ? null : v);
          if (op === 'eq') return (r) => r[c] === v;
          if (op === 'neq') return (r) => r[c] != null && r[c] !== v;
          throw new Error(`fake or(): ${op}`);
        }));
        return q;
      },
      not() { return q; }, limit() { return q; }, order() { return q; }, gt() { return q; },
      maybeSingle: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return q;
  };
  return { client: { from, rpc: async (name, args) => { calls.push({ rpc: name, args }); return rpc(name, args); } }, calls, tables };
}
const stmts = (calls, table, op) => calls.filter((c) => c.table === table && (!op || c.op === op));

// ── stripe-connect.ts ─────────────────────────────────────────────────────────────────────────
test('acctOpts sends a call to a connected account, and is nothing for a platform row', () => {
  assert.deepEqual(connect.acctOpts(ACCT), { stripeAccount: ACCT });
  for (const none of [null, undefined, '']) assert.equal(connect.acctOpts(none), undefined, String(none));
  assert.equal(connect.isAccountId(ACCT), true);
  for (const bad of ['acct_', 'acct_x', 'cus_1234567', ' acct_1CoachTrainer4', 'acct_1Coach/../x', null, 42, ['acct_1CoachTrainer4']]) {
    assert.equal(connect.isAccountId(bad), false, String(bad));
  }
  assert.equal(connect.missingColumn({ code: '42703' }), true);
  assert.equal(connect.missingColumn({ code: 'PGRST204' }), true);
  assert.equal(connect.missingColumn({ code: '57014' }), false);
  assert.equal(connect.missingColumn(null), false);
});

test('madeByShape: the object\'s application must be Shape\'s, and with STRIPE_CONNECT_APPLICATION_ID unset nothing is', () => {
  assert.equal(connect.madeByShape('ca_whatever', ''), false, 'unset: refused, never waved through');
  assert.equal(connect.madeByShape(null, undefined), false);
  assert.equal(connect.madeByShape('ca_whatever', '  '), false);
  assert.equal(connect.madeByShape(APP, APP), true);
  assert.equal(connect.madeByShape({ id: APP, object: 'application' }, APP), true, 'an expanded application');
  assert.equal(connect.madeByShape('ca_other', APP), false);
  assert.equal(connect.madeByShape(null, APP), false, 'no application at all: a coach made it themselves');
  assert.equal(connect.madeByShape({ id: 'ca_other' }, ` ${APP} `), false);
});

const coaches = () => ({
  trainers: [{ id: 4, stripe_account_id: ACCT }, { id: 5, stripe_account_id: OTHER_ACCT }, { id: 6, stripe_account_id: null }],
  nutritionists: [{ id: 4, stripe_account_id: 'acct_1NutritionistN4' }],
});

test('the origin guard: the account must be the named coach\'s, and the object Shape\'s', async () => {
  const guard = (args, app = APP, tables = coaches(), errors = {}) => connect.checkConnectOrigin(fakeDb({ tables, errors }).client, { account: ACCT, ...args }, app);
  assert.deepEqual(await guard({ providerRole: 'trainer', providerId: '4', application: APP }), { ok: true });
  assert.deepEqual(await guard({ providerRole: 'trainer', providerId: '5', application: APP }), { ok: false, reason: 'account_mismatch' }, 'another coach named: never their rows');
  assert.deepEqual(await guard({ providerRole: 'trainer', providerId: '6', application: APP }), { ok: false, reason: 'account_mismatch' }, 'a coach with no account');
  assert.deepEqual(await guard({ providerRole: 'nutritionist', providerId: '4', application: APP }), { ok: false, reason: 'account_mismatch' }, 'the same number in the other table');
  assert.deepEqual(await guard({ providerRole: 'trainer', providerId: '9', application: APP }), { ok: false, reason: 'no_coach_row' });
  for (const [role, id] of [['admin', '4'], [undefined, '4'], ['trainer', ''], ['trainer', 'x'], ['trainer', '0'], ['trainer', '-4'], ['trainer', '4.5']]) {
    assert.deepEqual(await guard({ providerRole: role, providerId: id, application: APP }), { ok: false, reason: 'not_a_coach' }, `${role}/${id}`);
  }
  assert.deepEqual(await connect.checkConnectOrigin(fakeDb({ tables: coaches() }).client, { account: 'nope', providerRole: 'trainer', providerId: '4', application: APP }, APP), { ok: false, reason: 'not_a_coach' });
  assert.deepEqual(await guard({ providerRole: 'trainer', providerId: '4', application: 'ca_other' }), { ok: false, reason: 'application_mismatch' }, 'the coach\'s own checkout, outside Shape and its fee');
  assert.deepEqual(await guard({ providerRole: 'trainer', providerId: '4', application: null }), { ok: false, reason: 'application_mismatch' });
  assert.deepEqual(await guard({ providerRole: 'trainer', providerId: '4', application: APP }, ''), { ok: false, reason: 'application_unset' }, 'unset: refused, even for the right coach');
  assert.deepEqual(await guard({ providerRole: 'trainer', providerId: '4', application: null, checkApplication: false }, ''), { ok: true }, 'unset: an event with no payment object still checks the account alone');
  assert.deepEqual(await guard({ providerRole: 'trainer', providerId: '4', application: null, checkApplication: false }), { ok: true }, 'an event with no payment object skips it');
  const failed = await guard({ providerRole: 'trainer', providerId: '4', application: APP }, APP, coaches(), { 'select:trainers': { code: '57014', message: 'timeout' } });
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'read_failed');
  assert.equal(failed.error.code, '57014');
  // It reads the row the metadata names, by id, in the table the role names.
  const db = fakeDb({ tables: coaches() });
  await connect.checkConnectOrigin(db.client, { account: ACCT, providerRole: 'trainer', providerId: '4', application: APP }, APP);
  assert.deepEqual(db.calls.map((c) => [c.table, c.cols, c.eqs]), [['trainers', 'stripe_account_id', [['id', 4]]]]);
});

test('connectedCustomerFor: one customer per member and coach account, made on that account, never replaced', async () => {
  const created = [];
  const stripe = { customers: { create: async (params, opts) => { created.push({ params, opts }); return { id: 'cus_onCoach' }; } } };
  const fresh = fakeDb();
  assert.equal(await connect.connectedCustomerFor(stripe, fresh.client, { userId: UID, account: ACCT, email: 'm@example.invalid' }), 'cus_onCoach');
  assert.deepEqual(created, [{ params: { email: 'm@example.invalid', metadata: { client_id: UID } }, opts: { stripeAccount: ACCT, idempotencyKey: `shape-customer-${UID}-${ACCT}` } }]);
  const [saved] = stmts(fresh.calls, 'stripe_connected_customers', 'upsert');
  assert.deepEqual(saved.payload, { user_id: UID, stripe_account_id: ACCT, customer_id: 'cus_onCoach' });
  assert.deepEqual(saved.opts, { onConflict: 'user_id,stripe_account_id', ignoreDuplicates: true }, 'a row saved first by a concurrent request is kept');
  // A customer already on record is used, and nothing is made.
  created.length = 0;
  const known = fakeDb({ tables: { stripe_connected_customers: [{ user_id: UID, stripe_account_id: ACCT, customer_id: 'cus_known' }, { user_id: UID, stripe_account_id: OTHER_ACCT, customer_id: 'cus_elsewhere' }] } });
  assert.equal(await connect.connectedCustomerFor(stripe, known.client, { userId: UID, account: ACCT, email: null }), 'cus_known');
  assert.equal(created.length, 0);
  // Another account's customer is not this one's.
  const elsewhere = fakeDb({ tables: { stripe_connected_customers: [{ user_id: UID, stripe_account_id: OTHER_ACCT, customer_id: 'cus_elsewhere' }] } });
  assert.equal(await connect.connectedCustomerFor(stripe, elsewhere.client, { userId: UID, account: ACCT, email: null }), 'cus_onCoach');
  assert.deepEqual(created[0].params, { metadata: { client_id: UID } }, 'no email, no email field');
  // A raced row wins over the one just made.
  const raced = fakeDb();
  raced.client.from = ((from) => (t) => {
    const q = from(t);
    const up = q.upsert;
    q.upsert = (p, o) => { raced.tables.stripe_connected_customers = [{ user_id: UID, stripe_account_id: ACCT, customer_id: 'cus_raced' }]; return up(p, o); };
    return q;
  })(raced.client.from);
  // (the fake inserts anyway; the read returns the first row, the raced one)
  assert.equal(await connect.connectedCustomerFor(stripe, raced.client, { userId: UID, account: ACCT, email: null }), 'cus_raced');
  await assert.rejects(connect.connectedCustomerFor(stripe, fakeDb({ errors: { 'select:stripe_connected_customers': { message: 'down' } } }).client, { userId: UID, account: ACCT, email: null }));
  await assert.rejects(connect.connectedCustomerFor(stripe, fakeDb({ errors: { 'upsert:stripe_connected_customers': { message: 'down' } } }).client, { userId: UID, account: ACCT, email: null }));
  await assert.rejects(connect.connectedCustomerFor(stripe, fakeDb().client, { userId: UID, account: 'cus_notAnAccount', email: null }), /connected account/);
});

test('platformCoachCustomer: a coaching row\'s customer counts only when the row is on Shape\'s own account', async () => {
  const tables = () => ({ subscriptions: [
    { client_id: UID, stripe_customer_id: 'cus_onCoach', stripe_account_id: ACCT },
    { client_id: UID, stripe_customer_id: 'cus_platform', stripe_account_id: null },
  ] });
  const db = fakeDb({ tables: tables() });
  const got = await connect.platformCoachCustomer(db.client, UID);
  assert.equal(got.data.stripe_customer_id, 'cus_platform');
  assert.equal(got.error, null);
  assert.deepEqual(stmts(db.calls, 'subscriptions')[0].iss, [['stripe_account_id', null]]);
  const onlyCoach = fakeDb({ tables: { subscriptions: [{ client_id: UID, stripe_customer_id: 'cus_onCoach', stripe_account_id: ACCT }] } });
  assert.equal((await connect.platformCoachCustomer(onlyCoach.client, UID)).data, null, 'a coach-account customer is never the platform one');
  // Before the migration the column is not there: every row is a platform one.
  const before = fakeDb({ tables: { subscriptions: [{ client_id: UID, stripe_customer_id: 'cus_legacy' }] }, errors: { 'select:subscriptions': (st) => (st.iss.length ? { code: '42703', message: 'column subscriptions.stripe_account_id does not exist' } : null) } });
  assert.equal((await connect.platformCoachCustomer(before.client, UID)).data.stripe_customer_id, 'cus_legacy');
  const down = fakeDb({ errors: { 'select:subscriptions': { code: '57014', message: 'timeout' } } });
  assert.equal((await connect.platformCoachCustomer(down.client, UID)).error.code, '57014', 'any other error is the caller\'s to handle');
});

test('stripeCustomerFor, the billing portal and the card read use the platform customer only', async () => {
  for (const rel of ['src/lib/stripe-customer.ts', 'src/app/api/stripe/billing-portal/route.ts', 'src/app/api/stripe/payment-method/route.ts']) {
    const src = read(rel);
    assert.match(src, /import \{ platformCoachCustomer \} from '@\/lib\/stripe-connect';/, rel);
    assert.doesNotMatch(src, /from\('subscriptions'\)/, `${rel}: no unfiltered read of a coaching row's customer`);
  }
  // The real stripeCustomerFor adopts a legacy coaching customer, never a coach-account one.
  const made = [];
  const run = async (subscriptions) => {
    const db = fakeDb({ tables: { profiles: [{ id: UID, stripe_customer_id: null }], platform_subscriptions: [], subscriptions } });
    const lib = await loadRealModule(join(ROOT, 'src/lib/stripe-customer.ts'), {
      typescript: true,
      registry: new Map([
        ['@/lib/stripe', { stripe: { customers: { create: async (p, o) => { made.push(o); return { id: 'cus_new' }; } } } }],
        ['@/lib/supabase/admin', { createAdminClient: () => db.client }],
        ['@/lib/stripe-connect', connect],
      ]),
    });
    return lib.stripeCustomerFor(UID, null);
  };
  assert.equal(await run([{ client_id: UID, stripe_customer_id: 'cus_onCoach', stripe_account_id: ACCT }]), 'cus_new', 'a coach-account customer is not adopted');
  assert.equal(made.length, 1);
  assert.equal(await run([{ client_id: UID, stripe_customer_id: 'cus_legacy', stripe_account_id: null }]), 'cus_legacy', 'a legacy one still is');
});

// ── The webhook ───────────────────────────────────────────────────────────────────────────────
const PLATFORM_SECRET = 'whsec_platform';
const CONNECT_SECRET = 'whsec_connect';

function fakeStripe({ pi = {}, sub = {}, fee = null, charge = null } = {}) {
  const calls = [];
  const stripe = {
    // A signature verifies only against the secret it was made with ('signed:<secret>').
    webhooks: { constructEvent: (raw, sig, secret) => { if (sig !== `signed:${secret}`) throw new Error('No signatures found matching the expected signature for payload'); return JSON.parse(raw); } },
    paymentIntents: { retrieve: async (id, params, opts) => { calls.push(['paymentIntents.retrieve', id, opts]); return { id, application_fee_amount: 2700, application: APP, ...pi }; } },
    subscriptions: { retrieve: async (id, params, opts) => { calls.push(['subscriptions.retrieve', id, opts]); return { id, status: 'active', application: APP, items: { data: [{ current_period_end: 1800000000 }] }, ...sub }; } },
    invoices: { retrieve: async (id, params, opts) => { calls.push(['invoices.retrieve', id, opts]); return { id, parent: { subscription_details: { subscription: 'sub_d1' } } }; } },
    applicationFees: {
      retrieve: async (id, params, opts) => { calls.push(['applicationFees.retrieve', id, opts]); return fee ?? { id, amount: 2700, amount_refunded: 0, account: ACCT, charge: 'ch_d1' }; },
      createRefund: async (id, params, opts) => { calls.push(['applicationFees.createRefund', id, params, opts]); return {}; },
    },
    transfers: {
      retrieve: async (id) => { calls.push(['transfers.retrieve', id]); return { amount: 15300, amount_reversed: 0 }; },
      createReversal: async (id, params, opts) => { calls.push(['transfers.createReversal', id, params, opts]); return {}; },
    },
    charges: { retrieve: async (id) => { calls.push(['charges.retrieve', id]); return charge ?? { id }; } },
  };
  return { stripe, calls };
}

async function runWebhook(event, { secret = CONNECT_SECRET, tables = {}, errors = {}, stripeOpts = {}, env = {} } = {}) {
  const db = fakeDb({ tables, errors });
  const { stripe, calls } = fakeStripe(stripeOpts);
  const started = [];
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
      ['@/lib/coach-thread', {
        startCoaching: async (_a, args) => { started.push(['coach', args]); return {}; },
        welcomeMember: async (_a, id) => { started.push(['member', id]); return false; },
        coachPaid: async (_a, args) => { started.push(['paid', args]); return {}; },
      }],
    ]),
  });
  const logs = [];
  const orig = { warn: console.warn, error: console.error };
  console.warn = (...a) => logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  console.error = console.warn;
  try {
    return await withEnv({ STRIPE_WEBHOOK_SECRET: PLATFORM_SECRET, STRIPE_CONNECT_WEBHOOK_SECRET: CONNECT_SECRET, STRIPE_CONNECT_APPLICATION_ID: APP, ...env }, async () => {
      const res = await route.POST(new Request('https://shape.test/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': `signed:${secret}` }, body: JSON.stringify(event) }));
      return { status: res.status, body: await res.json(), db, calls, started, logs };
    });
  } finally {
    console.warn = orig.warn; console.error = orig.error;
  }
}

const meta = (extra = {}) => ({ client_id: UID, provider_id: '4', provider_role: 'trainer', price_cents: '18000', gross_price_cents: '18000', origin: 'marketplace', fee_bps: '1500', ...extra });
const purchaseEvent = (extra = {}, account = ACCT) => ({
  id: 'evt_p', type: 'checkout.session.completed', ...(account ? { account } : {}),
  data: { object: { id: 'cs_test_direct1', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_d1', metadata: meta({ kind: 'booking', ...extra }) } },
});
const subEvent = (extra = {}, account = ACCT) => ({
  id: 'evt_s', type: 'checkout.session.completed', ...(account ? { account } : {}),
  data: { object: { id: 'cs_test_direct2', mode: 'subscription', payment_status: 'paid', subscription: 'sub_d1', customer: 'cus_onCoach', metadata: meta(extra) } },
});
const wrote = (r) => r.db.calls.filter((c) => c.op !== 'select' && !(c.table === 'trainers' || c.table === 'nutritionists')).length + r.db.calls.filter((c) => c.rpc).length;

test('webhook: the Connect destination\'s secret verifies on the same URL; a signature neither secret made is refused', async () => {
  const viaConnect = await runWebhook(purchaseEvent(), { tables: coaches() });
  assert.equal(viaConnect.status, 200);
  assert.equal(stmts(viaConnect.db.calls, 'one_time_purchases', 'upsert').length, 1, 'a Connect-signed purchase is recorded');
  const viaPlatform = await runWebhook(purchaseEvent({}, null), { secret: PLATFORM_SECRET, tables: coaches() });
  assert.equal(viaPlatform.status, 200);
  assert.equal(stmts(viaPlatform.db.calls, 'one_time_purchases', 'upsert').length, 1, 'the platform destination is unchanged');
  const forged = await runWebhook(purchaseEvent(), { secret: 'whsec_forged', tables: coaches() });
  assert.equal(forged.status, 400);
  assert.equal(forged.db.calls.length, 0, 'nothing read, nothing written');
  const noConnectSecret = await runWebhook(purchaseEvent(), { tables: coaches(), env: { STRIPE_CONNECT_WEBHOOK_SECRET: undefined } });
  assert.equal(noConnectSecret.status, 400, 'without the Connect secret, only the platform secret verifies');
  const noPlatformSecret = await runWebhook(purchaseEvent(), { tables: coaches(), env: { STRIPE_WEBHOOK_SECRET: undefined } });
  assert.equal(noPlatformSecret.status, 500, 'the platform secret is still required');
  // A Connect-signed event that names no account would run as a platform one (the membership too).
  const noAccount = await runWebhook(subEvent({ plan: 'shape_platform', provider_id: '' }, null), { tables: coaches() });
  assert.equal(noAccount.status, 200);
  assert.equal(noAccount.body.ignored, 'no_account');
  assert.equal(wrote(noAccount), 0);
  assert.equal(stmts(noAccount.db.calls, 'platform_subscriptions').length, 0);
});

test('webhook: a Connect purchase reads its payment on the account, and stamps the row with it', async () => {
  const r = await runWebhook(purchaseEvent(), { tables: coaches() });
  assert.deepEqual(r.calls.find((c) => c[0] === 'paymentIntents.retrieve'), ['paymentIntents.retrieve', 'pi_d1', { stripeAccount: ACCT }]);
  const [row] = stmts(r.db.calls, 'one_time_purchases', 'upsert');
  assert.equal(row.payload.stripe_account_id, ACCT);
  assert.equal(row.payload.application_fee_cents, 2700);
  assert.deepEqual(r.started.map(([k]) => k), ['paid'], 'the coach is told, as for any purchase');
  // A platform purchase sends no account option and writes no account key: exactly as before.
  const p = await runWebhook(purchaseEvent({}, null), { secret: PLATFORM_SECRET, tables: coaches() });
  assert.deepEqual(p.calls.find((c) => c[0] === 'paymentIntents.retrieve'), ['paymentIntents.retrieve', 'pi_d1', undefined]);
  assert.ok(!('stripe_account_id' in stmts(p.db.calls, 'one_time_purchases', 'upsert')[0].payload));
});

test('webhook: a Connect subscription is read on the account and stamped; it starts the coaching', async () => {
  const r = await runWebhook(subEvent(), { tables: coaches() });
  assert.equal(r.status, 200);
  assert.deepEqual(r.calls.find((c) => c[0] === 'subscriptions.retrieve'), ['subscriptions.retrieve', 'sub_d1', { stripeAccount: ACCT }]);
  const [row] = stmts(r.db.calls, 'subscriptions', 'upsert');
  assert.equal(row.payload.stripe_account_id, ACCT);
  assert.equal(row.payload.stripe_subscription_id, 'sub_d1');
  assert.deepEqual(r.started.map(([k]) => k), ['coach']);
  const p = await runWebhook(subEvent({}, null), { secret: PLATFORM_SECRET, tables: coaches() });
  assert.ok(!('stripe_account_id' in stmts(p.db.calls, 'subscriptions', 'upsert')[0].payload));
  assert.equal(p.calls.find((c) => c[0] === 'subscriptions.retrieve')[2], undefined);
});

test('webhook ORIGIN GUARD: a checkout from another coach\'s account, or one Shape did not make, writes nothing', async () => {
  for (const [label, event, opts, reason] of [
    ['another coach\'s account named', purchaseEvent({ provider_id: '5' }), {}, 'account_mismatch'],
    ['a coach with no account named', purchaseEvent({ provider_id: '6' }), {}, 'account_mismatch'],
    ['a coach who does not exist', purchaseEvent({ provider_id: '99' }), {}, 'no_coach_row'],
    ['no coach named', purchaseEvent({ provider_role: 'admin' }), {}, 'not_a_coach'],
    ['the coach\'s own payment, not Shape\'s', purchaseEvent(), { stripeOpts: { pi: { application: 'ca_someoneElse' } } }, 'application_mismatch'],
    ['a payment with no application', purchaseEvent(), { stripeOpts: { pi: { application: null } } }, 'application_mismatch'],
    ['a subscription from another coach\'s account', subEvent({ provider_id: '5' }), {}, 'account_mismatch'],
    ['the coach\'s own subscription, not Shape\'s', subEvent(), { stripeOpts: { sub: { application: 'ca_someoneElse' } } }, 'application_mismatch'],
  ]) {
    const r = await runWebhook(event, { tables: coaches(), ...opts });
    assert.equal(r.status, 200, `${label}: answered 200, so Stripe does not retry a refusal`);
    assert.equal(r.body.ignored, reason, label);
    assert.equal(wrote(r), 0, `${label}: nothing written`);
    assert.deepEqual(r.started, [], `${label}: nobody told`);
    assert.ok(r.logs.some((l) => l.includes('refused by the origin guard')), `${label}: said`);
  }
  // The same, carried by the platform destination: the account the event names is what counts.
  const viaPlatform = await runWebhook(purchaseEvent({ provider_id: '5' }), { secret: PLATFORM_SECRET, tables: coaches() });
  assert.equal(wrote(viaPlatform), 0, 'an event that names an account is a Connect event, whichever secret signed it');
  // With STRIPE_CONNECT_APPLICATION_ID unset, a Connect payment writes nothing, even one Shape made
  // for the right coach: the account half alone would let a coach record their own sale as Shape's.
  const unset = await runWebhook(purchaseEvent(), { tables: coaches(), env: { STRIPE_CONNECT_APPLICATION_ID: undefined } });
  assert.equal(wrote(unset), 0, 'unset: refused');
  assert.ok(unset.logs.some((l) => l.includes('application_unset')), 'unset: says why');
  const unsetSub = await runWebhook(subEvent(), { tables: coaches(), env: { STRIPE_CONNECT_APPLICATION_ID: undefined } });
  assert.equal(wrote(unsetSub), 0, 'unset: a subscription too');
  const unsetWrongCoach = await runWebhook(purchaseEvent({ provider_id: '5' }), { tables: coaches(), env: { STRIPE_CONNECT_APPLICATION_ID: undefined } });
  assert.equal(wrote(unsetWrongCoach), 0);
  // A coach row that cannot be read for a passing reason is retried, not refused.
  const down = await runWebhook(purchaseEvent(), { tables: coaches(), errors: { 'select:trainers': { code: '57014', message: 'canceling statement due to statement timeout' } } });
  assert.equal(down.status, 503);
  assert.equal(wrote(down), 0);
});

test('webhook: a Connect event never touches the membership', async () => {
  const r = await runWebhook(subEvent({ plan: 'shape_platform', provider_id: '', provider_role: '' }), { tables: coaches() });
  assert.equal(r.status, 200);
  assert.equal(wrote(r), 0);
  assert.equal(stmts(r.db.calls, 'platform_subscriptions').length, 0);
  assert.deepEqual(r.started, [], 'no welcome');
  // Even one naming the coach whose account it is, on a subscription Shape made: never the membership.
  const named = await runWebhook(subEvent({ plan: 'shape_platform' }), { tables: coaches() });
  assert.equal(named.status, 200);
  assert.equal(stmts(named.db.calls, 'platform_subscriptions').length, 0);
  assert.equal(wrote(named), 0);
  assert.deepEqual(named.started, []);
  const changed = (type, account) => ({ id: 'evt_u', type, ...(account ? { account } : {}), data: { object: { id: 'sub_d1', status: 'past_due', application: APP, items: { data: [{ current_period_end: 1800000000, price: { unit_amount: 21000 } }] } } } });
  for (const type of ['customer.subscription.updated', 'customer.subscription.deleted']) {
    const c = await runWebhook(changed(type, ACCT), { tables: { subscriptions: [{ stripe_subscription_id: 'sub_d1', status: 'active', stripe_account_id: ACCT }], platform_subscriptions: [{ stripe_subscription_id: 'sub_d1', status: 'active' }] } });
    assert.equal(stmts(c.db.calls, 'platform_subscriptions').length, 0, `${type}: the membership table is not touched`);
    assert.equal(c.db.tables.platform_subscriptions[0].status, 'active');
  }
  // A platform event still updates both, as before.
  const p = await runWebhook(changed('customer.subscription.updated', null), { secret: PLATFORM_SECRET, tables: { subscriptions: [], platform_subscriptions: [{ stripe_subscription_id: 'sub_d1', status: 'active' }] } });
  assert.equal(p.db.tables.platform_subscriptions[0].status, 'past_due');
});

test('webhook: a Connect subscription change finds only its own account\'s row, and records the price the coach set', async () => {
  const tables = () => ({ subscriptions: [
    { stripe_subscription_id: 'sub_d1', status: 'active', price_cents: 18000, stripe_account_id: ACCT },
    { stripe_subscription_id: 'sub_d1', status: 'active', price_cents: 18000, stripe_account_id: OTHER_ACCT },
  ] });
  const changed = (type, extra = {}) => ({ id: 'evt_u', type, account: ACCT, data: { object: { id: 'sub_d1', status: 'past_due', application: APP, items: { data: [{ current_period_end: 1800000000, price: { unit_amount: 21000 } }] }, ...extra } } });
  const r = await runWebhook(changed('customer.subscription.updated'), { tables: tables() });
  const [upd] = stmts(r.db.calls, 'subscriptions', 'update');
  assert.deepEqual(upd.eqs, [['stripe_subscription_id', 'sub_d1'], ['stripe_account_id', ACCT]]);
  assert.deepEqual(r.db.tables.subscriptions.map((s) => [s.stripe_account_id, s.status, s.price_cents]), [[ACCT, 'past_due', 21000], [OTHER_ACCT, 'active', 18000]], 'the other account\'s row is untouched');
  const gone = await runWebhook(changed('customer.subscription.deleted'), { tables: tables() });
  assert.deepEqual(stmts(gone.db.calls, 'subscriptions', 'update')[0].payload, { status: 'canceled', current_period_end: '2027-01-15T08:00:00.000Z' }, 'a deletion writes no price');
  const notShape = await runWebhook(changed('customer.subscription.updated', { application: 'ca_someoneElse' }), { tables: tables() });
  assert.equal(stmts(notShape.db.calls, 'subscriptions', 'update').length, 0, 'a subscription Shape did not make is ignored');
  // A platform change writes no price and no account filter: as before.
  const p = await runWebhook({ ...changed('customer.subscription.updated'), account: undefined }, { secret: PLATFORM_SECRET, tables: tables() });
  const [pu] = stmts(p.db.calls, 'subscriptions', 'update');
  assert.deepEqual(pu.eqs, [['stripe_subscription_id', 'sub_d1']]);
  assert.ok(!('price_cents' in pu.payload));
});

test('webhook: a Connect row is never recorded without its account (before the migration it waits)', async () => {
  const missing = { code: '42703', message: 'column "stripe_account_id" of relation does not exist' };
  const purchase = await runWebhook(purchaseEvent(), { tables: coaches(), errors: { 'upsert:one_time_purchases': missing } });
  assert.equal(purchase.status, 503, 'Stripe retries; the purchase is not written as a platform one');
  assert.ok(stmts(purchase.db.calls, 'one_time_purchases', 'upsert').every((u) => u.payload.stripe_account_id === ACCT), 'every attempt carried the account');
  const sub = await runWebhook(subEvent(), { tables: coaches(), errors: { 'upsert:subscriptions': missing } });
  assert.equal(sub.status, 503);
  assert.ok(stmts(sub.db.calls, 'subscriptions', 'upsert').every((u) => u.payload.stripe_account_id === ACCT));
});

test('webhook: a coach who disconnects is marked disconnected, and a late update does not reconnect them', async () => {
  const tables = () => ({
    trainers: [{ id: 4, stripe_account_id: ACCT, stripe_account_status: 'active' }, { id: 5, stripe_account_id: OTHER_ACCT, stripe_account_status: 'active' }],
    nutritionists: [{ id: 2, stripe_account_id: ACCT, stripe_account_status: 'active' }],
  });
  const deauth = (account) => ({ id: 'evt_d', type: 'account.application.deauthorized', ...(account ? { account } : {}), data: { object: { id: APP, object: 'application', name: 'Shape' } } });
  const r = await runWebhook(deauth(ACCT), { tables: tables() });
  assert.equal(r.status, 200);
  assert.deepEqual(r.db.tables.trainers.map((t) => t.stripe_account_status), ['disconnected', 'active'], 'the account\'s own coach, nobody else');
  assert.equal(r.db.tables.nutritionists[0].stripe_account_status, 'disconnected', 'both tables');
  assert.ok(r.logs.some((l) => l.includes('ADMIN') && l.includes(ACCT)), 'said for an admin');
  const noAccount = await runWebhook(deauth(null), { secret: PLATFORM_SECRET, tables: tables() });
  assert.deepEqual(noAccount.db.tables.trainers.map((t) => t.stripe_account_status), ['active', 'active']);
  const down = await runWebhook(deauth(ACCT), { tables: tables(), errors: { 'update:trainers': { code: '57014', message: 'timeout' } } });
  assert.equal(down.status, 503, 'a write that can pass is retried');
  // account.updated on a disconnected row leaves it; about another account it is ignored.
  const updated = (id, account = ACCT) => ({ id: 'evt_a', type: 'account.updated', account, data: { object: { id, charges_enabled: true, payouts_enabled: true, requirements: {}, metadata: {} } } });
  const off = { trainers: [{ id: 4, stripe_account_id: ACCT, stripe_account_status: 'disconnected' }], nutritionists: [] };
  const late = await runWebhook(updated(ACCT), { tables: off });
  assert.equal(late.db.tables.trainers[0].stripe_account_status, 'disconnected');
  const pending = { trainers: [{ id: 4, stripe_account_id: ACCT, stripe_account_status: 'pending' }], nutritionists: [] };
  assert.equal((await runWebhook(updated(ACCT), { tables: pending })).db.tables.trainers[0].stripe_account_status, 'active', 'the status logic is the same for any other row');
  const unset = { trainers: [{ id: 4, stripe_account_id: ACCT, stripe_account_status: null }], nutritionists: [] };
  assert.equal((await runWebhook(updated(ACCT), { tables: unset })).db.tables.trainers[0].stripe_account_status, 'active', 'a row with no status yet is not "disconnected"');
  const foreign = await runWebhook(updated(ACCT, OTHER_ACCT), { tables: { trainers: [{ id: 4, stripe_account_id: ACCT, stripe_account_status: 'pending' }], nutritionists: [] } });
  assert.equal(foreign.db.tables.trainers[0].stripe_account_status, 'pending', 'an event about another account than its own');
});

test('webhook: a coach\'s refund returns Shape\'s fee in proportion, on that account\'s rows only', async () => {
  const refunded = (extra = {}) => ({ id: 'evt_r', type: 'charge.refunded', account: ACCT, data: { object: {
    id: 'ch_d1', amount: 18000, amount_refunded: 9000, payment_intent: 'pi_d1', application: APP, application_fee: 'fee_1', transfer: 'tr_coachOwn', invoice: 'in_d1', ...extra,
  } } });
  const tables = () => ({
    one_time_purchases: [{ id: 'otp1', stripe_payment_intent_id: 'pi_d1', status: 'paid', stripe_account_id: ACCT }, { id: 'otp2', stripe_payment_intent_id: 'pi_d1', status: 'paid', stripe_account_id: OTHER_ACCT }],
    subscriptions: [{ id: 's1', stripe_subscription_id: 'sub_d1', stripe_account_id: ACCT }],
    refund_requests: [],
  });
  const r = await runWebhook(refunded(), { tables: tables() });
  assert.equal(r.status, 200);
  // The expected idempotency key, built from its parts (the charge and the refunded amount): a
  // quoted literal beside a "Key" name trips the secret scan's generic-api-key rule.
  const feeRefundIdem = ['refund-appfee', 'ch_d1', 9000].join('-');
  assert.deepEqual(r.calls.find((c) => c[0] === 'applicationFees.createRefund'), ['applicationFees.createRefund', 'fee_1', { amount: 1350 }, { idempotencyKey: feeRefundIdem }], 'half the charge refunded: half the fee');
  assert.ok(!r.calls.some((c) => c[0].startsWith('transfers.')), 'a direct charge\'s transfer is the coach\'s own: never reversed');
  assert.deepEqual(r.db.tables.one_time_purchases.map((p) => p.status), ['refunded', 'paid'], 'only the row on this account');
  assert.deepEqual(stmts(r.db.calls, 'one_time_purchases', 'update')[0].eqs, [['stripe_payment_intent_id', 'pi_d1'], ['stripe_account_id', ACCT]]);
  assert.deepEqual(r.calls.find((c) => c[0] === 'invoices.retrieve'), ['invoices.retrieve', 'in_d1', { stripeAccount: ACCT }]);
  assert.deepEqual(stmts(r.db.calls, 'subscriptions', 'select')[0].eqs, [['stripe_subscription_id', 'sub_d1'], ['stripe_account_id', ACCT]]);
  // A fee that is not this account's charge's is left alone.
  const foreignFee = await runWebhook(refunded(), { tables: tables(), stripeOpts: { fee: { id: 'fee_1', amount: 2700, amount_refunded: 0, account: OTHER_ACCT, charge: 'ch_d1' } } });
  assert.ok(!foreignFee.calls.some((c) => c[0] === 'applicationFees.createRefund'));
  const otherCharge = await runWebhook(refunded(), { tables: tables(), stripeOpts: { fee: { id: 'fee_1', amount: 2700, amount_refunded: 0, account: ACCT, charge: 'ch_other' } } });
  assert.ok(!otherCharge.calls.some((c) => c[0] === 'applicationFees.createRefund'));
  // A charge Shape did not make: nothing at all.
  const notShape = await runWebhook(refunded({ application: 'ca_someoneElse' }), { tables: tables() });
  assert.equal(notShape.calls.length, 0);
  assert.equal(stmts(notShape.db.calls, 'one_time_purchases').length, 0);
  // The platform path is as it was: the transfer is reversed too, with no account filter.
  const p = await runWebhook({ ...refunded({ invoice: null }), account: undefined }, { secret: PLATFORM_SECRET, tables: tables(), stripeOpts: { fee: { id: 'fee_1', amount: 2700, amount_refunded: 0 } } });
  assert.ok(p.calls.some((c) => c[0] === 'transfers.createReversal'));
  assert.ok(p.calls.some((c) => c[0] === 'applicationFees.createRefund'));
  assert.deepEqual(stmts(p.db.calls, 'one_time_purchases', 'update')[0].eqs, [['stripe_payment_intent_id', 'pi_d1']]);
});

test('webhook: a Connect dispute, and an expired checkout\'s credit, stay on their own account', async () => {
  const dispute = { id: 'evt_x', type: 'charge.dispute.created', account: ACCT, data: { object: { id: 'dp_1', payment_intent: 'pi_d1' } } };
  const tables = () => ({ one_time_purchases: [{ id: 'otp1', stripe_payment_intent_id: 'pi_d1', status: 'paid', stripe_account_id: OTHER_ACCT }] });
  const d = await runWebhook(dispute, { tables: tables() });
  assert.deepEqual(stmts(d.db.calls, 'one_time_purchases', 'update')[0].eqs, [['stripe_payment_intent_id', 'pi_d1'], ['stripe_account_id', ACCT]]);
  assert.equal(d.db.tables.one_time_purchases[0].status, 'paid', 'another account\'s purchase is not marked disputed');
  const expired = (provider_id) => ({ id: 'evt_e', type: 'checkout.session.expired', account: ACCT, data: { object: { id: 'cs_test_x', metadata: meta({ provider_id, store_credit_ref: 'ref-9' }) } } });
  // ⚠ No checkout on a coach's account releases credit (Codex on #2401): an expired one carries no
  // payment, so nothing proves Shape made it, and one naming a live checkout's ref would free credit
  // that checkout still holds. The 48-hour sweep returns it.
  for (const provider_id of ['5', '4']) {
    const r = await runWebhook(expired(provider_id), { tables: coaches() });
    assert.equal(r.status, 200);
    assert.equal(r.db.calls.filter((c) => c.rpc).length, 0, `coach ${provider_id}: no release on a connected account`);
    assert.ok(r.logs.some((l) => l.includes('left to the 48-hour sweep')), 'says why');
  }
  // Shape's own account still releases at once, as before.
  const platform = await runWebhook({ id: 'evt_p', type: 'checkout.session.expired', data: { object: { id: 'cs_test_p', metadata: { store_credit_ref: 'ref-7' } } } }, { secret: PLATFORM_SECRET, tables: coaches() });
  assert.deepEqual(platform.db.calls.filter((c) => c.rpc).map((c) => [c.rpc, c.args]), [['release_store_credit_reservation', { p_ref: 'ref-7' }]]);
});

// ── Admin refunds ─────────────────────────────────────────────────────────────────────────────
async function runRefund({ purchase = null, subscription = null, charge = {} } = {}) {
  const tables = {
    refund_requests: [{ id: 'rr1', status: 'pending', client_id: UID, one_time_purchase_id: purchase ? 'otp1' : null, subscription_id: subscription ? 'sub1' : null, created_at: '2026-10-18T12:00:00Z' }],
    one_time_purchases: purchase ? [{ id: 'otp1', client_id: UID, stripe_payment_intent_id: 'pi_1', ...purchase }] : [],
    subscriptions: subscription ? [{ id: 'sub1', client_id: UID, stripe_subscription_id: 'sub_s1', ...subscription }] : [],
  };
  const db = fakeDb({ tables });
  const calls = [];
  const stripe = {
    paymentIntents: { retrieve: async (id, params, opts) => { calls.push(['paymentIntents.retrieve', id, params, opts]); return { latest_charge: 'ch_1' }; } },
    invoices: { list: async (params, opts) => { calls.push(['invoices.list', params, opts]); return { data: [{ created: 1700000000, charge: 'ch_inv' }] }; } },
    charges: { retrieve: async (id, params, opts) => { calls.push(['charges.retrieve', id, opts]); return { id, transfer: 'tr_1', application_fee: 'fee_1', ...charge }; } },
    refunds: { create: async (params, opts) => { calls.push(['refunds.create', params, opts]); return { id: 're_1' }; } },
    subscriptions: { cancel: async (id, params, opts) => { calls.push(['subscriptions.cancel', id, opts]); return {}; } },
  };
  const actions = await loadRealModule(join(ROOT, 'src/app/dashboard/refunds/actions.ts'), {
    typescript: true,
    registry: new Map([
      ['next/cache', { revalidatePath: () => {} }],
      ['next/navigation', { redirect: (to) => { const e = new Error('REDIRECT'); e.to = to; throw e; } }],
      ['@/lib/supabase/admin', { createAdminClient: () => db.client }],
      ['@/lib/admin-access', { requireAdminUser: async () => ({ id: 'admin' }) }],
      ['@/lib/stripe', { stripe }],
      ['@/lib/stripe-connect', connect],
      ['@/lib/refund-session', { cancelRefundedSession: async () => 'none' }],
    ]),
  });
  const fd = new FormData();
  fd.set('request_id', 'rr1');
  let to = null;
  try { await actions.approveRefund(fd); } catch (e) { if (!e.to) throw e; to = e.to; }
  return { to, calls };
}

test('refunds: a direct charge is refunded on the coach\'s account, Shape\'s fee given back, no transfer reversed', async () => {
  const r = await runRefund({ purchase: { stripe_account_id: ACCT } });
  assert.equal(r.to, '/dashboard/refunds?updated=refunded');
  assert.deepEqual(r.calls.find((c) => c[0] === 'paymentIntents.retrieve')[3], { stripeAccount: ACCT });
  assert.deepEqual(r.calls.find((c) => c[0] === 'charges.retrieve'), ['charges.retrieve', 'ch_1', { stripeAccount: ACCT }]);
  assert.deepEqual(r.calls.find((c) => c[0] === 'refunds.create'), ['refunds.create', { charge: 'ch_1', refund_application_fee: true }, { idempotencyKey: 'refund-req-rr1', stripeAccount: ACCT }]);
  const noFee = await runRefund({ purchase: { stripe_account_id: ACCT }, charge: { application_fee: null } });
  assert.deepEqual(noFee.calls.find((c) => c[0] === 'refunds.create')[1], { charge: 'ch_1' }, 'a 0% sale has no fee to give back');
  // A coach subscription: its invoices, the refund and the cancel all on the account.
  const s = await runRefund({ subscription: { stripe_account_id: ACCT } });
  assert.deepEqual(s.calls.find((c) => c[0] === 'invoices.list'), ['invoices.list', { subscription: 'sub_s1', limit: 100 }, { stripeAccount: ACCT }]);
  assert.deepEqual(s.calls.find((c) => c[0] === 'refunds.create'), ['refunds.create', { charge: 'ch_inv', refund_application_fee: true }, { idempotencyKey: 'refund-req-rr1', stripeAccount: ACCT }]);
  assert.deepEqual(s.calls.find((c) => c[0] === 'subscriptions.cancel'), ['subscriptions.cancel', 'sub_s1', { stripeAccount: ACCT }]);
  // A legacy destination charge, exactly as before.
  for (const legacy of [{ stripe_account_id: null }, {}]) {
    const l = await runRefund({ purchase: legacy });
    assert.deepEqual(l.calls.find((c) => c[0] === 'refunds.create'), ['refunds.create', { charge: 'ch_1', reverse_transfer: true, refund_application_fee: true }, { idempotencyKey: 'refund-req-rr1' }]);
    assert.equal(l.calls.find((c) => c[0] === 'charges.retrieve')[2], undefined);
  }
});

// ── The member's cancel ───────────────────────────────────────────────────────────────────────
test('the member\'s cancel is sent to the account the subscription lives on', async () => {
  const run = async (row) => {
    const sent = [];
    const db = fakeDb({ tables: { subscriptions: [{ id: 'sub1', client_id: UID, stripe_subscription_id: 'sub_s1', ...row }] } });
    const client = { ...db.client, auth: { getUser: async () => ({ data: { user: { id: UID } } }) } };
    const stub = new Proxy({}, { get: (_t, k) => (k === '__esModule' ? false : () => { throw new Error(`unused: ${String(k)}`); }) });
    const actions = await loadRealModule(join(ROOT, 'src/app/subscribe/actions.ts'), {
      typescript: true,
      registry: new Map([
        ['next/navigation', { redirect: (to) => { const e = new Error('REDIRECT'); e.to = to; throw e; } }],
        ['@/lib/supabase/server', { createClient: async () => client }],
        ['@/lib/stripe', { stripe: { subscriptions: { update: async (id, params, opts) => { sent.push([id, params, opts]); return {}; } } } }],
        ['@/lib/stripe-connect', connect],
        ...['@/lib/supabase/admin', '@/lib/capacity', '@/lib/waitlist', '@/lib/coach-profile-href', '@/lib/coach-origin', '@/lib/platform-fee', '@/lib/membership-core', '@/lib/membership-detour', '@/lib/health-screening', '@/lib/stripe-customer', '@/lib/stripe-live-subscription', '@/lib/checkout-barrier'].map((m) => [m, stub]),
      ]),
    });
    const fd = new FormData();
    fd.set('subscription_id', 'sub1');
    try { await actions.cancelSubscription(fd); } catch (e) { if (!e.to) throw e; }
    return { sent, cols: stmts(db.calls, 'subscriptions', 'select')[0].cols };
  };
  const direct = await run({ stripe_account_id: ACCT });
  assert.deepEqual(direct.sent, [['sub_s1', { cancel_at_period_end: true }, { stripeAccount: ACCT }]]);
  assert.equal(direct.cols, '*', 'migration-safe: the account comes with the row when the column exists');
  assert.deepEqual((await run({ stripe_account_id: null })).sent, [['sub_s1', { cancel_at_period_end: true }, undefined]]);
  assert.deepEqual((await run({})).sent, [['sub_s1', { cancel_at_period_end: true }, undefined]], 'before the migration: the platform');
});

// ── Renewals ──────────────────────────────────────────────────────────────────────────────────
async function loadStripeLib(client) {
  function FakeStripe() { return client; }
  return loadRealModule(join(ROOT, 'src/lib/stripe.ts'), { typescript: true, registry: new Map([['stripe', { __esModule: true, default: FakeStripe }]]) });
}

test('renewals: one paged list per coach account replaces the per-row retrieves; legacy rows are still retrieved, under the cap', async () => {
  const asked = [];
  const accountSubs = {
    [ACCT]: Array.from({ length: 150 }, (_, i) => ({ id: `sub_a${i}`, status: 'active', cancel_at_period_end: i === 120, cancel_at: null })),
    [OTHER_ACCT]: [{ id: 'sub_o1', status: 'canceled', cancel_at_period_end: false, cancel_at: null }],
  };
  const client = { subscriptions: {
    retrieve: async (id, params, opts) => { asked.push(['retrieve', id, opts]); return { id, status: 'active', cancel_at_period_end: id === 'sub_legacy2', cancel_at: null }; },
    list: async (params, opts) => {
      asked.push(['list', params, opts]);
      const all = accountSubs[opts.stripeAccount] ?? [];
      const from = params.starting_after ? all.findIndex((s) => s.id === params.starting_after) + 1 : 0;
      const data = all.slice(from, from + params.limit);
      return { data, has_more: from + params.limit < all.length };
    },
  } };
  const S = await loadStripeLib(client);
  const rows = [
    { id: 'sub_a3', account: ACCT }, { id: 'sub_a120', account: ACCT }, { id: 'sub_gone', account: ACCT },
    { id: 'sub_o1', account: OTHER_ACCT },
    { id: 'sub_legacy1', account: null }, 'sub_legacy2', { id: 'sub_legacy3' },
  ];
  const flags = await S.loadCancelFlags(rows, 2);
  assert.deepEqual(['sub_a3', 'sub_a120', 'sub_gone', 'sub_o1', 'sub_legacy1', 'sub_legacy2', 'sub_legacy3'].map((id) => flags.get(id)), [false, true, null, true, false, true, null],
    'found on the account: renews or ends; not on it: could not ask; legacy past the cap of two: could not ask');
  const lists = asked.filter((a) => a[0] === 'list');
  assert.deepEqual(lists.filter((l) => l[2].stripeAccount === ACCT).map((l) => l[1]), [{ status: 'all', limit: 100 }, { status: 'all', limit: 100, starting_after: 'sub_a99' }], 'paged, including cancelled ones');
  assert.equal(lists.filter((l) => l[2].stripeAccount === OTHER_ACCT).length, 1, 'one list per account');
  assert.deepEqual(asked.filter((a) => a[0] === 'retrieve').map((a) => [a[1], a[2]]), [['sub_legacy1', undefined], ['sub_legacy2', undefined]], 'legacy rows only, on the platform, under the cap');
  // A list stops once every wanted id is found; a failed list leaves its rows unknown.
  asked.length = 0;
  await S.loadCancelFlags([{ id: 'sub_a3', account: ACCT }], 25);
  assert.equal(asked.filter((a) => a[0] === 'list').length, 1, 'found on the first page: no second');
  const broken = await loadStripeLib({ subscriptions: { list: async () => { throw new Error('rate limited'); }, retrieve: async () => ({}) } });
  assert.equal((await broken.loadCancelFlags([{ id: 'sub_a3', account: ACCT }], 25)).get('sub_a3'), null);
  // Past the page bound the rows not found read as unknown, never as renewing.
  let pages = 0;
  const endless = await loadStripeLib({ subscriptions: { list: async (p) => { pages++; return { data: [{ id: `sub_n${pages}`, status: 'active' }], has_more: true }; } } });
  assert.equal((await endless.loadCancelFlags([{ id: 'sub_never', account: ACCT }], 25)).get('sub_never'), null);
  assert.equal(pages, endless.ACCOUNT_LIST_PAGES);
});

// ── The return page ───────────────────────────────────────────────────────────────────────────
async function loadReturn({ retrieve, tables = coaches(), errors = {} }) {
  const db = fakeDb({ tables, errors });
  const mod = await loadRealModule(join(ROOT, 'src/lib/checkout-return.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/stripe', { stripe: { checkout: { sessions: { retrieve } } } }],
      ['@/lib/stripe-connect', connect],
      ['@/lib/supabase/server', { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: UID } } }) } }) }],
      ['@/lib/supabase/admin', { createAdminClient: () => db.client }],
    ]),
  });
  return { mod, db };
}

test('the return page reads a checkout from a coach\'s account only when the account is a coach\'s on record', () => withEnv({ STRIPE_CONNECT_APPLICATION_ID: APP }, async () => {
  const ID = 'cs_test_abcdefghij';
  const session = (metadata = {}) => ({ id: ID, status: 'complete', payment_status: 'paid', mode: 'payment', client_reference_id: UID, payment_intent: { id: 'pi_r', application: APP }, metadata: { client_id: UID, provider_id: '4', provider_role: 'trainer', kind: 'booking', ...metadata } });
  const asked = [];
  const retrieve = async (...a) => { asked.push(a); return session(); };
  const { mod } = await loadReturn({ retrieve, tables: { trainers: [{ id: 4, name: 'Tom', stripe_account_id: ACCT }], nutritionists: [] } });
  assert.equal((await mod.readCheckoutReturn(ID, ACCT)).state, 'paid');
  assert.deepEqual(asked.at(-1)[2], { stripeAccount: ACCT }, 'read on the coach\'s account');
  assert.equal((await mod.readCheckoutReturn(ID)).state, 'paid');
  assert.equal(asked.at(-1)[2], undefined, 'without acct: Shape\'s account, as before');
  asked.length = 0;
  for (const bad of ['acct_1NobodysAccount', 'cus_1234567890', '../x', ['acct_1CoachTrainer4', 'acct_1CoachTrainer4'], 42]) {
    assert.deepEqual(await mod.readCheckoutReturn(ID, bad), { state: 'unconfirmed' }, String(bad));
  }
  assert.equal(asked.length, 0, 'an account that is not a coach\'s is never read');
  // A checkout on the coach's account that names someone else is not Shape's to describe.
  const { mod: other } = await loadReturn({ retrieve: async () => session({ provider_id: '5' }), tables: { trainers: [{ id: 4, name: 'Tom', stripe_account_id: ACCT }, { id: 5, name: 'Ann', stripe_account_id: OTHER_ACCT }], nutritionists: [] } });
  assert.deepEqual(await other.readCheckoutReturn(ID, ACCT), { state: 'unconfirmed' });
  // One person's trainer and nutritionist listings may share the account: either one is that coach.
  const { mod: both } = await loadReturn({ retrieve: async () => session({ provider_role: 'nutritionist', provider_id: '2' }), tables: { trainers: [{ id: 4, name: 'Tom', stripe_account_id: ACCT }], nutritionists: [{ id: 2, name: 'Tom', stripe_account_id: ACCT }] } });
  assert.equal((await both.readCheckoutReturn(ID, ACCT)).state, 'paid');
  const { mod: down } = await loadReturn({ retrieve, errors: { 'select:trainers': { message: 'down' } } });
  assert.deepEqual(await down.readCheckoutReturn(ID, ACCT), { state: 'unconfirmed' });
}));

// ⚠ A CHECKOUT THE COACH MADE IS NOT CALLED PAID (Codex on #2401). The coach can make and pay one of
// their own naming themselves; the webhook refuses it, and so does the page.
test('the return page vouches for a checkout on a coach\'s account only when Shape\'s application made it', () => withEnv({ STRIPE_CONNECT_APPLICATION_ID: APP }, async () => {
  const ID = 'cs_test_abcdefghij';
  const tables = { trainers: [{ id: 4, name: 'Tom', stripe_account_id: ACCT }], nutritionists: [] };
  const base = { id: ID, status: 'complete', payment_status: 'paid', client_reference_id: UID, metadata: { client_id: UID, provider_id: '4', provider_role: 'trainer', kind: 'booking' } };
  const read = async (s, acct = ACCT) => (await (await loadReturn({ retrieve: async () => s, tables })).mod.readCheckoutReturn(ID, acct)).state;
  assert.equal(await read({ ...base, mode: 'payment', payment_intent: { id: 'pi_1', application: 'ca_TheCoachesOwnApp' } }), 'unconfirmed', 'another application');
  assert.equal(await read({ ...base, mode: 'payment', payment_intent: { id: 'pi_1', application: null } }), 'unconfirmed', 'made in the coach\'s own dashboard');
  assert.equal(await read({ ...base, mode: 'payment', payment_intent: 'pi_1' }), 'unconfirmed', 'not expanded: nothing proves it');
  assert.equal(await read({ ...base, mode: 'payment', payment_intent: { id: 'pi_1', application: { id: APP } } }), 'paid', 'Shape\'s, expanded');
  assert.equal(await read({ ...base, mode: 'subscription', subscription: { id: 'sub_1', application: APP }, payment_intent: null }), 'paid', 'a subscription: its own application');
  assert.equal(await read({ ...base, mode: 'subscription', subscription: { id: 'sub_1', application: 'ca_Other' }, payment_intent: { id: 'pi_1', application: APP } }), 'unconfirmed', 'a subscription is judged by the subscription');
  // Shape's own account is not asked: a destination charge has no connected application.
  assert.equal(await read({ ...base, mode: 'payment', payment_intent: { id: 'pi_1', application: null } }, null), 'paid');
  // With the variable unset, nothing on a coach's account is vouched for.
  await withEnv({ STRIPE_CONNECT_APPLICATION_ID: undefined }, async () => {
    assert.equal(await read({ ...base, mode: 'payment', payment_intent: { id: 'pi_1', application: APP } }), 'unconfirmed');
  });
}));

// ── The env lists and the migration ───────────────────────────────────────────────────────────
test('/api/health names the two new variables', () => {
  const src = read('src/app/api/health/route.ts');
  assert.match(src, /STRIPE_CONNECT_WEBHOOK_SECRET: !!env\.STRIPE_CONNECT_WEBHOOK_SECRET,/);
  assert.match(src, /STRIPE_CONNECT_APPLICATION_ID: !!env\.STRIPE_CONNECT_APPLICATION_ID,/);
});

test('migration: the account columns are frozen once written; the two tables are the service role\'s only; disconnected is a status', () => {
  const sql = code('supabase-migrations/2026-10-18-coach-direct-charges-groundwork.sql');
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;\s*$/m);
  for (const t of ['subscriptions', 'one_time_purchases']) {
    assert.match(sql, new RegExp(`alter table public\\.${t} add column if not exists stripe_account_id text;`), t);
    assert.match(sql, new RegExp(`create index if not exists ${t}_stripe_account_id_idx\\n\\s+on public\\.${t} \\(stripe_account_id\\) where stripe_account_id is not null;`), `${t}: indexed`);
    assert.match(sql, new RegExp(`drop trigger if exists ${t}_freeze_stripe_account_id on public\\.${t};\\ncreate trigger ${t}_freeze_stripe_account_id\\n\\s+before update on public\\.${t}\\n\\s+for each row execute function public\\.freeze_stripe_account_id\\(\\);`), `${t}: frozen`);
  }
  // As freeze_origin_fee_bps keeps origin/fee_bps: every update keeps the first write's value.
  assert.match(sql, /create or replace function public\.freeze_stripe_account_id\(\)\nreturns trigger\nlanguage plpgsql\nset search_path = public, pg_temp\nas \$\$\nbegin\n {2}new\.stripe_account_id := old\.stripe_account_id;\n {2}return new;\nend;\n\$\$;/);
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(sql, /create table if not exists public\.stripe_connected_customers \(\n {2}user_id uuid not null references auth\.users \(id\) on delete cascade,\n {2}stripe_account_id text not null,\n {2}customer_id text not null,\n {2}created_at timestamptz not null default now\(\),\n {2}primary key \(user_id, stripe_account_id\)\n\);/);
  assert.match(sql, /create table if not exists public\.stripe_account_portal \(\n {2}stripe_account_id text primary key,\n {2}configuration_id text not null,\n {2}created_at timestamptz not null default now\(\)\n\);/);
  for (const t of ['stripe_connected_customers', 'stripe_account_portal']) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;\\nrevoke all on public\\.${t} from anon, authenticated;`), t);
  }
  assert.doesNotMatch(sql, /create policy|grant /i, 'no policy, no grant: the service role only');
  for (const t of ['trainers', 'nutritionists']) {
    assert.match(sql, new RegExp(`alter table public\\.${t} drop constraint if exists ${t}_stripe_account_status_check;\\nalter table public\\.${t} add constraint ${t}_stripe_account_status_check\\n\\s+check \\(stripe_account_status in \\('pending', 'active', 'restricted', 'rejected', 'disconnected'\\)\\);`), t);
  }
  // The guard checks what the migration made.
  const guard = sql.slice(sql.indexOf('do $guard$'));
  for (const needle of ["column_name = 'stripe_account_id'", "t || '_freeze_stripe_account_id'", "t || '_stripe_account_id_idx'", 'relrowsecurity', 'from pg_policies', "has_table_privilege('anon'", "t || '_stripe_account_status_check'", "'disconnected'"]) {
    assert.ok(guard.includes(needle), needle);
  }
  // The webhook writes exactly the status the check allows.
  assert.match(read('src/app/api/stripe/webhook/route.ts'), /\.update\(\{ stripe_account_status: 'disconnected' \}\)/);
});
