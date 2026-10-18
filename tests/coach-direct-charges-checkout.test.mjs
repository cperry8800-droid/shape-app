// Coach direct charges, PR B: checkout on the coach's own Stripe account (owner, 2026-10-18:
// "shape is not paying processing fee"). Part A (tests/coach-direct-charges-groundwork.test.mjs)
// laid the plumbing; this pins what moves the money:
//   · src/lib/coach-checkout.ts: when checkouts move, which coach takes payment, the checkout
//     record, the code box (a Shape code mirrored onto the coach's account, or the coach's own),
//     what a subscription renews at, the portal on a coach's account, a fresh account on reconnect;
//   · the app's checkout route made on the coach's account, with the member's customer there, the
//     fee from the resolved rate, the record written before the address is handed out;
//   · the webhook believing only the record on a coach's account, and taking the money from
//     Stripe's own objects; an expired checkout releasing only the credit recorded against it;
//   · the return page, the billing portal, the Connect routes and the migration.
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
const CONNECT_ENV = { STRIPE_CONNECT_APPLICATION_ID: APP, STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect' };

const connect = await loadRealModule(join(ROOT, 'src/lib/stripe-connect.ts'), { typescript: true });
const cc = await loadRealModule(join(ROOT, 'src/lib/coach-checkout.ts'), { typescript: true, registry: new Map([['@/lib/stripe-connect', connect]]) });

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

/** A Supabase client over `tables`: eq / neq / is / in / or filters, every statement recorded. */
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
        && st.neqs.every(([c, v]) => r[c] != null && r[c] !== v)
        && st.iss.every(([c, v]) => (r[c] ?? null) === v)
        && st.ins.every(([c, vs]) => vs.includes(r[c]))
        && st.ors.every((alts) => alts.some((f) => f(r))));
      if (st.op === 'insert' || st.op === 'upsert') {
        const row = { ...st.payload };
        if (st.op === 'upsert' && st.opts?.ignoreDuplicates) {
          const keys = String(st.opts.onConflict || '').split(',');
          if (rows().some((r) => keys.every((k) => r[k] === row[k]))) return { data: [], error: null };
        }
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
      or(expr) {
        st.ors.push(expr.split(',').map((part) => {
          const [c, op, ...rest] = part.split('.');
          const v = rest.join('.');
          if (op === 'is') return (r) => (r[c] ?? null) === (v === 'null' ? null : v);
          if (op === 'neq') return (r) => r[c] != null && r[c] !== v;
          return (r) => r[c] === v;
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

const record = (extra = {}) => ({
  stripe_checkout_session_id: 'cs_test_direct1', stripe_account_id: ACCT, client_id: UID,
  provider_role: 'trainer', provider_id: 4, mode: 'payment', kind: 'booking', plan_id: null, workout_id: null,
  item_name: null, origin: 'marketplace', fee_bps: 1500, referral_id: null, list_cents: 18000, charge_cents: 18000,
  application_fee_cents: 2700, store_credit_kind: null, store_credit_cents: 0, store_credit_ref: null, code: null, code_source: null,
  ...extra,
});

// ── coach-checkout.ts: the rules ──────────────────────────────────────────────────────────────
test('checkouts move to the coach\'s account only with both Connect variables set', () => {
  assert.equal(cc.directChargesReady({ STRIPE_CONNECT_APPLICATION_ID: APP, STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_x' }), true);
  for (const env of [{}, { STRIPE_CONNECT_APPLICATION_ID: APP }, { STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_x' }, { STRIPE_CONNECT_APPLICATION_ID: ' ', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_x' }]) {
    assert.equal(cc.directChargesReady(env), false, JSON.stringify(env));
  }
});

test('a coach who has not connected, or has disconnected, takes no payment', () => {
  assert.equal(cc.coachNotPayable({ stripe_account_id: ACCT, stripe_account_status: 'active' }), null);
  assert.equal(cc.coachNotPayable({ stripe_account_id: ACCT, stripe_account_status: 'disconnected' }), 'coach_disconnected');
  for (const p of [{ stripe_account_id: null, stripe_account_status: null }, { stripe_account_id: ACCT, stripe_account_status: 'pending' }, { stripe_account_id: ACCT, stripe_account_status: 'restricted' }, { stripe_account_id: '', stripe_account_status: 'active' }]) {
    assert.equal(cc.coachNotPayable(p), 'coach_not_connected', JSON.stringify(p));
  }
});

test('a code is a code shape, or invalid; an empty box is no code', () => {
  assert.equal(cc.normalizeCode('  SPRING25 '), 'SPRING25');
  assert.equal(cc.normalizeCode(''), null);
  assert.equal(cc.normalizeCode(undefined), null);
  for (const bad of ['a', 'has space', 'x'.repeat(65), '<script>', 'SPRING;25']) assert.equal(cc.normalizeCode(bad), 'invalid', bad);
  assert.equal(cc.afterCode(18000, { percentOff: 25, amountOff: null }), 13500);
  assert.equal(cc.afterCode(18000, { percentOff: null, amountOff: 2000 }), 16000);
  assert.equal(cc.afterCode(1000, { percentOff: null, amountOff: 2000 }), 0);
  assert.equal(cc.afterCode(18000, null), 18000);
});

test('what a subscription renews at counts the quantity and the discounts still running', () => {
  const items = (unit, quantity) => ({ data: [{ quantity, price: { unit_amount: unit } }] });
  assert.equal(cc.recurringCents({ items: items(18000, 1) }), 18000);
  assert.equal(cc.recurringCents({ items: items(18000, 2) }), 36000, 'two seats');
  assert.equal(cc.recurringCents({ items: items(18000, 1), discounts: [{ end: null, source: { coupon: { duration: 'forever', percent_off: 20 } } }] }), 14400, '20% off');
  assert.equal(cc.recurringCents({ items: items(18000, 1), discounts: [{ end: null, source: { coupon: { duration: 'forever', amount_off: 3000 } } }] }), 15000);
  assert.equal(cc.recurringCents({ items: items(18000, 1), discounts: [{ end: null, source: { coupon: { duration: 'once', percent_off: 50 } } }] }), 18000, 'a once code was spent on the first invoice');
  assert.equal(cc.recurringCents({ items: items(18000, 1), discounts: [{ end: 1700000000, source: { coupon: { duration: 'repeating', percent_off: 50 } } }] }, 1800000000), 18000, 'a repeating code that ends before the renewal');
  assert.equal(cc.recurringCents({ items: items(18000, 1), discounts: [{ end: 1900000000, source: { coupon: { duration: 'repeating', percent_off: 50 } } }] }, 1800000000), 9000, 'one still running at the renewal');
  assert.equal(cc.recurringCents({ items: items(18000, 1), discounts: [{ end: null, coupon: { duration: 'forever', percent_off: 10 } }] }), 16200, 'the older shape of a discount');
  assert.equal(cc.recurringCents({ items: items(18000, 1), discounts: ['di_123'] }), null, 'a discount not expanded says nothing');
  assert.equal(cc.recurringCents({ items: { data: [{ quantity: 1, price: { unit_amount: null } }] } }), null);
  assert.equal(cc.recurringCents({ items: { data: [] } }), null);
  assert.equal(cc.discountsExpanded({ discounts: ['di_1'] }), false);
  // ⚠ A discount whose coupon is still an id is not expanded either (Codex on #2403): its money is unknown.
  assert.equal(cc.discountsExpanded({ discounts: [{ id: 'di_1', source: { coupon: 'co_1' } }] }), false);
  assert.equal(cc.discountsExpanded({ discounts: [{ id: 'di_1' }] }), false);
  assert.equal(cc.discountsExpanded({ discounts: [{ id: 'di_1', source: { coupon: { id: 'co_1', percent_off: 10 } } }] }), true);
  assert.equal(cc.discountsExpanded({ discounts: [{ id: 'di_1', coupon: { id: 'co_1', percent_off: 10 } }] }), true);
  assert.equal(cc.discountsExpanded({}), true);
  assert.equal(cc.feeBpsOfSubscription({ application_fee_percent: 15 }), 1500);
  assert.equal(cc.feeBpsOfSubscription({ application_fee_percent: null }), 0, 'omitted: the BYO 0%');
  assert.equal(cc.feeBpsOfSubscription({}), 0);
});

test('a checkout\'s record reads back as the metadata the webhook uses, and only on its own account', async () => {
  const meta = cc.metadataFromRecord(record({ store_credit_kind: 'session', store_credit_cents: 2500, store_credit_ref: 'ref-1', referral_id: 'r-1', plan_id: 'p-1', charge_cents: 15500 }));
  assert.deepEqual(meta, {
    client_id: UID, provider_id: '4', provider_role: 'trainer', kind: 'booking', origin: 'marketplace', fee_bps: '1500',
    price_cents: '15500', gross_price_cents: '18000', plan_id: 'p-1', referral_id: 'r-1',
    store_credit_kind: 'session', store_credit_cents: '2500', store_credit_ref: 'ref-1',
  });
  const db = fakeDb({ tables: { coach_checkouts: [record()] } });
  assert.equal((await cc.readCoachCheckout(db.client, 'cs_test_direct1', ACCT)).row.client_id, UID);
  assert.equal((await cc.readCoachCheckout(db.client, 'cs_test_direct1', OTHER_ACCT)).row, null, 'another account\'s checkout of that id is not this one');
  const down = fakeDb({ errors: { 'select:coach_checkouts': { code: '57014', message: 'timeout' } } });
  assert.equal((await cc.readCoachCheckout(down.client, 'cs_test_direct1', ACCT)).error.code, '57014');
  await assert.rejects(cc.recordCoachCheckout(fakeDb({ errors: { 'insert:coach_checkouts': { code: '42P01', message: 'missing' } } }).client, record()), /not recorded/);
});

test('shapeOrUnmarked: no application, or Shape\'s; never another\'s; nothing while the variable is unset', () => {
  assert.equal(connect.shapeOrUnmarked(null, APP), true);
  assert.equal(connect.shapeOrUnmarked(undefined, APP), true);
  assert.equal(connect.shapeOrUnmarked(APP, APP), true);
  assert.equal(connect.shapeOrUnmarked({ id: APP }, APP), true);
  assert.equal(connect.shapeOrUnmarked('ca_other', APP), false);
  assert.equal(connect.shapeOrUnmarked(null, ''), false);
  assert.equal(connect.shapeOrUnmarked(APP, undefined), false);
});

// ── The code box ──────────────────────────────────────────────────────────────────────────────
function codeStripe({ shape = [], coach = [], mirror = null, pageSize = Infinity } = {}) {
  const calls = [];
  return {
    calls,
    stripe: {
      // Pages the way Stripe does: at most `limit` (or the fixture's page size), then has_more.
      promotionCodes: { list: async (params, opts) => {
        calls.push(['promotionCodes.list', params, opts]);
        const all = (opts?.stripeAccount ? coach : shape).filter((p) => p.code.toLowerCase() === params.code.toLowerCase());
        const from = params.starting_after ? all.findIndex((p) => p.id === params.starting_after) + 1 : 0;
        const size = Math.min(params.limit ?? 10, pageSize);
        return { data: all.slice(from, from + size), has_more: from + size < all.length };
      } },
      coupons: {
        retrieve: async (id, params, opts) => { calls.push(['coupons.retrieve', id, opts]); if (!mirror) throw Object.assign(new Error('No such coupon'), { code: 'resource_missing' }); return mirror; },
        create: async (params, opts) => { calls.push(['coupons.create', params, opts]); return { id: params.id, ...params }; },
      },
    },
  };
}
const shapeCode = (extra = {}, coupon = {}) => ({ id: 'promo_shape1', code: 'SPRING25', active: true, expires_at: null, max_redemptions: null, customer: null, restrictions: { first_time_transaction: false, minimum_amount: null }, promotion: { coupon: { id: 'co_shape', valid: true, percent_off: 25, duration: 'once', ...coupon } }, ...extra });
const resolve = (s, args = {}) => cc.resolveCheckoutCode(s.stripe, { code: 'SPRING25', account: ACCT, listCents: 18000, mode: 'payment', platformCustomerId: 'cus_platform', now: 1_750_000_000_000, ...args });

test('a Shape code is mirrored once onto the coach\'s account and applied as that coupon', async () => {
  const s = codeStripe({ shape: [shapeCode({}, { duration: 'repeating', duration_in_months: 3 })] });
  const r = await resolve(s);
  assert.equal(r.ok, true);
  assert.deepEqual(r.code, { source: 'shape', code: 'SPRING25', discount: { coupon: 'shape-promo_shape1' }, percentOff: 25, amountOff: null });
  const [, made, opts] = s.calls.find((c) => c[0] === 'coupons.create');
  assert.deepEqual(opts, { stripeAccount: ACCT, idempotencyKey: `shape-mirror-promo_shape1-${ACCT}` }, 'made on the coach\'s account, once');
  assert.equal(made.id, 'shape-promo_shape1');
  assert.equal(made.percent_off, 25);
  assert.equal(made.duration, 'repeating');
  assert.equal(made.duration_in_months, 3);
  assert.equal(s.calls.find((c) => c[0] === 'promotionCodes.list')[2], undefined, 'looked up on Shape\'s own account first');
  // A mirror already on the account is used as it is.
  const again = codeStripe({ shape: [shapeCode()], mirror: { id: 'shape-promo_shape1' } });
  assert.equal((await resolve(again)).ok, true);
  assert.equal(again.calls.filter((c) => c[0] === 'coupons.create').length, 0);
  // An amount off in dollars is mirrored as one.
  const amount = codeStripe({ shape: [shapeCode({}, { percent_off: null, amount_off: 2000, currency: 'usd' })] });
  const ra = await resolve(amount);
  assert.deepEqual([ra.code.percentOff, ra.code.amountOff], [null, 2000]);
  assert.deepEqual([amount.calls.find((c) => c[0] === 'coupons.create')[1].amount_off, amount.calls.find((c) => c[0] === 'coupons.create')[1].currency], [2000, 'usd']);
});

test('a Shape code with a restriction Shape cannot hold to on the coach\'s account is refused', async () => {
  for (const [label, promo, reason] of [
    ['a redemption limit', shapeCode({ max_redemptions: 100 }), 'code_not_here'],
    ['first-time only', shapeCode({ restrictions: { first_time_transaction: true } }), 'code_not_here'],
    ['limited to Shape\'s products', shapeCode({}, { applies_to: { products: ['prod_x'] } }), 'code_not_here'],
    ['another currency', shapeCode({}, { percent_off: null, amount_off: 500, currency: 'eur' }), 'code_not_here'],
    ['a minimum above the price', shapeCode({ restrictions: { minimum_amount: 20000, minimum_amount_currency: 'usd' } }), 'code_not_here'],
    ['a coupon no longer valid', shapeCode({}, { valid: false }), 'code_not_here'],
    ['expired', shapeCode({ expires_at: 1_700_000_000 }), 'code_invalid'],
    ['made for another customer', shapeCode({ customer: 'cus_someoneElse' }), 'code_invalid'],
  ]) {
    const s = codeStripe({ shape: [promo] });
    const r = await resolve(s);
    assert.deepEqual(r, { ok: false, reason }, label);
    assert.equal(s.calls.filter((c) => c[0] === 'coupons.create').length, 0, `${label}: nothing mirrored`);
  }
  // Made for this member: fine.
  assert.equal((await resolve(codeStripe({ shape: [shapeCode({ customer: 'cus_platform' })] }))).ok, true);
  // A one-time price a code would take under Stripe's 50-cent floor is refused; a subscription is not.
  const full = codeStripe({ shape: [shapeCode({}, { percent_off: 100 })] });
  assert.deepEqual(await resolve(full), { ok: false, reason: 'code_not_here' });
  assert.equal((await resolve(codeStripe({ shape: [shapeCode({}, { percent_off: 100 })] }), { mode: 'subscription' })).ok, true);
});

test('one visible code can be several promotion codes: the member\'s own, then the open one (Codex on #2403)', async () => {
  const mine = shapeCode({ id: 'promo_mine', customer: 'cus_platform' }, { percent_off: 30 });
  const theirs = shapeCode({ id: 'promo_theirs', customer: 'cus_someoneElse' }, { percent_off: 50 });
  const open = shapeCode({ id: 'promo_open' }, { percent_off: 10 });
  assert.equal((await resolve(codeStripe({ shape: [theirs, open] }))).code.percentOff, 10, 'another member\'s first in the list: the open one is used');
  assert.equal((await resolve(codeStripe({ shape: [open, theirs, mine] }))).code.percentOff, 30, 'the member\'s own wins');
  assert.deepEqual(await resolve(codeStripe({ shape: [theirs] })), { ok: false, reason: 'code_invalid' }, 'only someone else\'s');
  // A Shape code that is only other members' falls through to the coach's own code of the same letters.
  const coachSame = { id: 'promo_cs', code: 'SPRING25', restrictions: {}, promotion: { coupon: { id: 'c', valid: true, percent_off: 15 } } };
  const through = await resolve(codeStripe({ shape: [theirs], coach: [coachSame] }));
  assert.deepEqual(through.code.discount, { promotion_code: 'promo_cs' }, 'the coach\'s, not refused');
  // The member's own entry past the first page is still found, on either account (Codex on #2403).
  const crowd = Array.from({ length: 5 }, (_, i) => shapeCode({ id: `promo_other${i}`, customer: `cus_other${i}` }, { percent_off: 50 }));
  const paged = codeStripe({ shape: [...crowd, mine], pageSize: 2 });
  assert.equal((await resolve(paged)).code.percentOff, 30, 'the member\'s own, on the third page');
  assert.deepEqual(paged.calls.filter((c) => c[0] === 'promotionCodes.list').map((c) => c[1].starting_after ?? null), [null, 'promo_other1', 'promo_other3'], 'each page starts after the last');
  const coachCrowd = Array.from({ length: 3 }, (_, i) => ({ id: `promo_cx${i}`, code: 'TOMS10', customer: `cus_x${i}`, restrictions: {}, promotion: { coupon: { id: 'c', valid: true, percent_off: 40 } } }));
  const coachOpen = { id: 'promo_copen', code: 'TOMS10', restrictions: {}, promotion: { coupon: { id: 'c', valid: true, percent_off: 12 } } };
  assert.deepEqual((await resolve(codeStripe({ coach: [...coachCrowd, coachOpen], pageSize: 2 }), { code: 'TOMS10', coachCustomerId: 'cus_onCoach' })).code.discount, { promotion_code: 'promo_copen' }, 'the coach\'s open code on its second page');
  const bounded = codeStripe({ shape: Array.from({ length: 30 }, (_, i) => shapeCode({ id: `promo_b${i}`, customer: `cus_b${i}` })), pageSize: 1 });
  await resolve(bounded);
  assert.equal(bounded.calls.filter((c) => c[0] === 'promotionCodes.list' && !c[2]).length, 10, 'Shape\'s pages are bounded at ten');
  // On the coach's account, the member's customer there picks the coach's code made for them.
  const coachMine = { id: 'promo_cm', code: 'TOMS10', customer: 'cus_onCoach', restrictions: {}, promotion: { coupon: { id: 'c', valid: true, percent_off: 20 } } };
  const coachOther = { id: 'promo_co', code: 'TOMS10', customer: 'cus_x', restrictions: {}, promotion: { coupon: { id: 'c', valid: true, percent_off: 40 } } };
  const r = await resolve(codeStripe({ coach: [coachOther, coachMine] }), { code: 'TOMS10', coachCustomerId: 'cus_onCoach' });
  assert.deepEqual(r.code.discount, { promotion_code: 'promo_cm' });
  assert.deepEqual(await resolve(codeStripe({ coach: [coachOther] }), { code: 'TOMS10', coachCustomerId: 'cus_onCoach' }), { ok: false, reason: 'code_invalid' });
});

test('a Shape coupon\'s own limits: a redemption cap is refused, a deadline is carried onto the mirror (Codex on #2403)', async () => {
  assert.deepEqual(await resolve(codeStripe({ shape: [shapeCode({}, { max_redemptions: 50 })] })), { ok: false, reason: 'code_not_here' });
  assert.deepEqual(await resolve(codeStripe({ shape: [shapeCode({}, { redeem_by: 1_700_000_000 })] })), { ok: false, reason: 'code_invalid' }, 'past its deadline');
  const s = codeStripe({ shape: [shapeCode({}, { redeem_by: 1_900_000_000 })] });
  assert.equal((await resolve(s)).ok, true);
  assert.equal(s.calls.find((c) => c[0] === 'coupons.create')[1].redeem_by, 1_900_000_000, 'the mirror stops when Shape\'s coupon does');
});

test('the coach\'s own code is applied as the coach\'s promotion code; an unknown code is invalid', async () => {
  const own = { id: 'promo_coach1', code: 'TOMS10', active: true, expires_at: null, restrictions: {}, promotion: { coupon: { id: 'co_c', valid: true, percent_off: 10 } } };
  const s = codeStripe({ coach: [own] });
  const r = await resolve(s, { code: 'toms10' });
  assert.deepEqual(r, { ok: true, code: { source: 'coach', code: 'TOMS10', discount: { promotion_code: 'promo_coach1' }, percentOff: 10, amountOff: null } });
  assert.deepEqual(s.calls.filter((c) => c[0] === 'promotionCodes.list').map((c) => c[2]), [undefined, { stripeAccount: ACCT }], 'Shape\'s first, then the coach\'s account');
  assert.deepEqual(await resolve(codeStripe(), { code: 'NOPE' }), { ok: false, reason: 'code_invalid' });
  assert.deepEqual(await resolve(codeStripe({ coach: [{ ...own, expires_at: 1 }] }), { code: 'TOMS10' }), { ok: false, reason: 'code_invalid' });
});

// ── The open checkouts and the live subscription on a coach's account ─────────────────────────
test('on a coach\'s account nothing is handed back: Shape\'s recorded open checkouts are expired, and its completed ones name their subscriptions (Codex on #2403)', async () => {
  // What the coach's account holds, by id. The coach's own checkouts are there too, and never asked.
  const onAccount = {
    cs_shapeOpen: { id: 'cs_shapeOpen', status: 'open', subscription: null },
    cs_shapeOtherCoach: { id: 'cs_shapeOtherCoach', status: 'open', subscription: null },
    cs_otherMember: { id: 'cs_otherMember', status: 'open', subscription: null },
    cs_shapeDone: { id: 'cs_shapeDone', status: 'complete', subscription: 'sub_fromShape' },
    cs_shapeDoneExpanded: { id: 'cs_shapeDoneExpanded', status: 'complete', subscription: { id: 'sub_expanded' } },
    cs_shapeExpired: { id: 'cs_shapeExpired', status: 'expired', subscription: null },
    cs_coachMade: { id: 'cs_coachMade', status: 'open', subscription: null },
  };
  const retrieved = [];
  const expired = [];
  const stripe = { checkout: { sessions: {
    list: async () => { throw new Error('a list the coach can fill is never read'); },
    retrieve: async (id, p, o) => {
      retrieved.push([id, o]);
      if (!onAccount[id]) throw Object.assign(new Error('No such checkout.session'), { code: 'resource_missing' });
      return onAccount[id];
    },
    expire: async (id, p, o) => { expired.push([id, o]); return {}; },
  } } };
  const rec = (id, extra = {}) => record({ stripe_checkout_session_id: id, mode: 'subscription', kind: 'subscription', ...extra });
  const db = fakeDb({ tables: { coach_checkouts: [
    rec('cs_shapeOpen'), rec('cs_shapeOtherCoach', { provider_id: 5 }), rec('cs_otherMember', { client_id: '00000000-0000-4000-8000-0000000000ff' }),
    rec('cs_shapeDone'), rec('cs_shapeDoneExpanded'), rec('cs_shapeExpired'), rec('cs_gone'),
    rec('cs_coachMade', { stripe_account_id: OTHER_ACCT }), rec('cs_shapeOneTime', { mode: 'payment', kind: 'booking' }),
  ] } });
  const barrier = await loadRealModule(join(ROOT, 'src/lib/checkout-barrier.ts'), { typescript: true, registry: new Map([['@/lib/stripe', { stripe }], ['@/lib/supabase/admin', { createAdminClient: () => db.client }]]) });
  const r = await barrier.retireCoachCheckouts(UID, ACCT, { provider_role: 'trainer', provider_id: 4 });
  assert.deepEqual(expired, [['cs_shapeOpen', { stripeAccount: ACCT }]], 'only Shape\'s, for this member and coach: another coach\'s, another member\'s and the coach\'s own are left');
  assert.deepEqual([...r.subscriptions].sort(), ['sub_expanded', 'sub_fromShape'], 'only completed ones name a subscription');
  assert.deepEqual(retrieved.map((c) => c[0]).sort(), ['cs_gone', 'cs_shapeDone', 'cs_shapeDoneExpanded', 'cs_shapeExpired', 'cs_shapeOpen'], 'each recorded checkout is read by its own id; one the account no longer has is skipped');
  assert.ok(retrieved.every((c) => c[1]?.stripeAccount === ACCT), 'on the coach\'s account');
  const down = fakeDb({ errors: { 'select:coach_checkouts': { code: '57014', message: 'timeout' } } });
  const b2 = await loadRealModule(join(ROOT, 'src/lib/checkout-barrier.ts'), { typescript: true, registry: new Map([['@/lib/stripe', { stripe }], ['@/lib/supabase/admin', { createAdminClient: () => down.client }]]) });
  await assert.rejects(b2.retireCoachCheckouts(UID, ACCT, { provider_role: 'trainer', provider_id: 4 }), 'a failed record read refuses');
  const flaky = { checkout: { sessions: { ...stripe.checkout.sessions, retrieve: async () => { throw Object.assign(new Error('api down'), { type: 'StripeAPIError' }); } } } };
  const b3 = await loadRealModule(join(ROOT, 'src/lib/checkout-barrier.ts'), { typescript: true, registry: new Map([['@/lib/stripe', { stripe: flaky }], ['@/lib/supabase/admin', { createAdminClient: () => db.client }]]) });
  await assert.rejects(b3.retireCoachCheckouts(UID, ACCT, { provider_role: 'trainer', provider_id: 4 }), 'a failed Stripe read refuses');
});

test('the live-subscription check on a coach\'s account counts only what the caller says is Shape\'s', async () => {
  const subs = [{ id: 'sub_coach', status: 'active', application: null, metadata: { client_id: UID, provider_id: '4', provider_role: 'trainer' } }];
  const asked = [];
  const stripe = { customers: { list: async () => { throw new Error('no email lookup on a coach account'); } }, subscriptions: { list: async (p, o) => { asked.push(o); return { data: subs }; } } };
  const lib = await loadRealModule(join(ROOT, 'src/lib/stripe-live-subscription.ts'), { typescript: true, registry: new Map([['@/lib/stripe', { stripe }], ['@/lib/membership-core', { ACTIVE_SUB: new Set(['active', 'trialing', 'past_due']) }]]) });
  const wanted = { client_id: UID, provider_id: '4', provider_role: 'trainer' };
  assert.equal(await lib.hasLiveStripeSubscription({ customerId: 'cus_onCoach', email: 'a@example.invalid' }, wanted, ACCT, (s) => connect.madeByShape(s.application, APP)), false, 'the coach\'s own subscription does not block a real checkout');
  assert.deepEqual(asked, [{ stripeAccount: ACCT }]);
  subs[0].application = APP;
  assert.equal(await lib.hasLiveStripeSubscription({ customerId: 'cus_onCoach', email: null }, wanted, ACCT, (s) => connect.madeByShape(s.application, APP)), true, 'Shape\'s does');
});

// ── The billing portal and reconnecting ───────────────────────────────────────────────────────
test('the portal on a coach\'s account uses Shape\'s own configuration, made once', async () => {
  const calls = [];
  const stripe = { billingPortal: {
    configurations: { create: async (params, opts) => { calls.push(['config', params, opts]); return { id: 'bpc_1' }; } },
    sessions: { create: async (params, opts) => { calls.push(['session', params, opts]); return { url: 'https://billing.stripe.test/s' }; } },
  } };
  const db = fakeDb();
  const url = await cc.coachPortalUrl(stripe, db.client, { account: ACCT, customer: 'cus_onCoach', returnUrl: 'https://shape.test/m/' });
  assert.equal(url, 'https://billing.stripe.test/s');
  const [, params, opts] = calls[0];
  assert.deepEqual(opts, { stripeAccount: ACCT, idempotencyKey: `shape-portal-${ACCT}` });
  assert.deepEqual(params.features.subscription_cancel, { enabled: true, mode: 'at_period_end' });
  assert.equal(params.features.subscription_update.enabled, false, 'no plan switching: the price is set on Shape');
  assert.deepEqual(calls[1], ['session', { customer: 'cus_onCoach', configuration: 'bpc_1', return_url: 'https://shape.test/m/' }, { stripeAccount: ACCT }]);
  assert.deepEqual(db.tables.stripe_account_portal, [{ stripe_account_id: ACCT, configuration_id: 'bpc_1' }]);
  calls.length = 0;
  await cc.coachPortalUrl(stripe, db.client, { account: ACCT, customer: 'cus_onCoach', returnUrl: 'https://shape.test/m/' });
  assert.deepEqual(calls.map((c) => c[0]), ['session'], 'the stored configuration is reused');
  await assert.rejects(cc.coachPortalUrl(stripe, db.client, { account: 'cus_x', customer: 'cus_onCoach', returnUrl: 'x' }));
});

test('a disconnected coach is given a new account to onboard on; a connected one keeps theirs', async () => {
  const made = [];
  const stripe = { accounts: { create: async (p, o) => { made.push(p); made.opts = o; return { id: 'acct_1BrandNewOne9' }; } } };
  const user = { id: 'owner-1', email: 'coach@example.invalid' };
  const db = fakeDb({ tables: { trainers: [{ id: 4, stripe_account_id: ACCT, stripe_account_status: 'disconnected' }] } });
  const id = await cc.onboardingAccountFor(stripe, db.client, { table: 'trainers', provider: { id: 4, stripe_account_id: ACCT, stripe_account_status: 'disconnected' }, role: 'trainer', user });
  assert.equal(id, 'acct_1BrandNewOne9');
  assert.deepEqual(db.tables.trainers[0], { id: 4, stripe_account_id: 'acct_1BrandNewOne9', stripe_account_status: 'pending' });
  assert.equal(made[0].type, 'standard');
  assert.deepEqual(stmts(db.calls, 'trainers', 'update')[0].eqs, [['id', 4], ['stripe_account_id', ACCT]], 'only over the row as it was read');
  // ⚠ One account per row and starting point (Codex on #2403): two presses at once get the same one.
  assert.deepEqual(made.opts, { idempotencyKey: `shape-connect-trainers-4-${ACCT}` });
  // Connected: the account on record, nothing made.
  made.length = 0;
  const keep = fakeDb({ tables: { trainers: [{ id: 4, stripe_account_id: ACCT, stripe_account_status: 'active' }] } });
  assert.equal(await cc.onboardingAccountFor(stripe, keep.client, { table: 'trainers', provider: { id: 4, stripe_account_id: ACCT, stripe_account_status: 'active' }, role: 'trainer', user }), ACCT);
  assert.equal(made.length, 0);
  // Two presses: the second's write matches no row, and the first's account is the one used.
  const raced = fakeDb({ tables: { trainers: [{ id: 4, stripe_account_id: 'acct_1FirstPressWon', stripe_account_status: 'pending' }] } });
  assert.equal(await cc.onboardingAccountFor(stripe, raced.client, { table: 'trainers', provider: { id: 4, stripe_account_id: null, stripe_account_status: null }, role: 'trainer', user }), 'acct_1FirstPressWon');
  assert.deepEqual(made.opts, { idempotencyKey: 'shape-connect-trainers-4-first' });
});

test('the Connect routes onboard through onboardingAccountFor, and refresh sends a disconnected coach back to start again', () => {
  for (const p of ['src/app/api/stripe/connect-account/route.ts', 'src/app/api/stripe/connect/onboard/route.ts']) {
    const src = read(p);
    assert.match(src, /accountId = await onboardingAccountFor\(stripe, admin, \{/, p);
    assert.doesNotMatch(src, /stripe\.accounts\.create/, `${p}: the old reuse-or-create is gone`);
    assert.match(src, /stripe_account_id, stripe_account_status'\)/, `${p}: reads the status`);
  }
  assert.match(read('src/app/api/stripe/connect/refresh/route.ts'), /stripe_account_status === 'disconnected'\) \{\n\s+return NextResponse\.redirect\(new URL\('\/dashboard\?error=stripe_disconnected'/);
});

// ── The app's checkout route ──────────────────────────────────────────────────────────────────
const TRAINER = { id: 4, name: 'Coach T', owner_id: 'owner-1', price: 180, session_price: 180, stripe_account_id: ACCT, stripe_account_status: 'active', at_capacity: false, capacity_resume_at: null, suspended_at: null };

async function runCheckout({ body = {}, provider = TRAINER, env = CONNECT_ENV, errors = {}, codes = {}, reserve = 0, created: createdOverride, recordedSubStatus = 'canceled' } = {}) {
  const db = fakeDb({
    tables: { trainers: [{ ...provider }], stripe_connected_customers: [] },
    errors,
    rpc: async (name) => {
      if (name === 'get_store_credit_for') return { data: { session: reserve }, error: null };
      if (name === 'reserve_store_credit') return { data: reserve, error: null };
      return { data: null, error: null };
    },
  });
  const created = [];
  const expired = [];
  const customers = [];
  const cs = codeStripe(codes);
  const stripe = {
    ...cs.stripe,
    customers: { create: async (p, o) => { customers.push([p, o]); return { id: 'cus_onCoach' }; } },
    subscriptions: { retrieve: async (id, p, o) => { customers.push(['sub', id, o]); return { id, status: recordedSubStatus }; } },
    checkout: { sessions: {
      create: async (args, opts) => { created.push([args, opts]); if (createdOverride) return createdOverride(args); return { id: 'cs_test_new1', url: 'https://checkout.stripe.test/cs_test_new1' }; },
      expire: async (id, p, opts) => { expired.push([id, opts]); return {}; },
    } },
  };
  const live = [];
  const open = [];
  const shared = async (p, opts) => loadRealModule(join(ROOT, p), opts);
  const route = await shared('src/app/api/stripe/checkout-session/route.ts', {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/stripe', { stripe }],
      ['@/lib/stripe-connect', connect],
      ['@/lib/coach-checkout', cc],
      ['@/lib/supabase/admin', { createAdminClient: () => db.client }],
      ['@/lib/capacity', { isEffectivelyAtCapacity: () => false }],
      ['@/lib/waitlist', { resolveRequestClient: async () => ({ user: { id: UID, email: 'a@example.invalid' }, supabase: fakeDb({ tables: { subscriptions: [] } }).client }), hasActiveWaitlistInvite: async () => false, isActiveClientOf: async () => false }],
      ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) })],
      ['@/lib/platform-fee', await import(pathToFileURL(join(ROOT, 'src/lib/platform-fee.mjs')).href)],
      ['@/lib/coach-origin', { resolveCoachCheckoutOrigin: async () => ({ origin: 'marketplace', feeBps: 1500, referralId: null }) }],
      ['@/lib/return-path', await loadRealModule(join(ROOT, 'src/lib/return-path.ts'), { typescript: true })],
      ['@/lib/membership-core', { ACTIVE_SUB: new Set(['active', 'trialing', 'past_due']), computeMembership: async () => ({ isMember: true, isKnownMinor: false }) }],
      ['@/lib/stripe-live-subscription', { hasLiveStripeSubscription: async (...a) => { live.push(a); return false; } }],
      ['@/lib/stripe-customer', { stripeCustomerFor: async () => 'cus_platform' }],
      ['@/lib/health-screening', { hiresCoach: () => false, hasCompletedScreening: async () => true, SCREENING_REQUIRED: {} }],
      ['@/lib/checkout-barrier', { claimCheckout: async () => ({ confirm: async () => {}, release: async () => {} }), currentCheckout: async (...a) => { open.push(a); return null; }, retireCoachCheckouts: async (...a) => { open.push(['retire', ...a]); return { subscriptions: new Set(['sub_recordedNoApp']) }; }, isCheckoutInProgress: () => false, checkoutReturnsKey: () => 'returns-key', CHECKOUT_CREATE_OPTIONS: { timeout: 20000, maxNetworkRetries: 0 } }],
    ]),
  });
  const logs = [];
  const orig = { warn: console.warn, error: console.error };
  console.warn = (...a) => logs.push(a.map(String).join(' '));
  console.error = console.warn;
  try {
    return await withEnv({ STRIPE_CONNECT_APPLICATION_ID: undefined, STRIPE_CONNECT_WEBHOOK_SECRET: undefined, ...env }, async () => {
      const res = await route.POST(new Request('https://shape.test/api/stripe/checkout-session', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ item: { type: 'booking', name: 'Session' }, coach: { provider_id: 4, provider_role: 'trainer' }, ...body }),
      }));
      return { status: res.status, body: await res.json(), created, expired, customers, db, live, open, logs, codeCalls: cs.calls };
    });
  } finally {
    console.warn = orig.warn; console.error = orig.error;
  }
}

test('checkout: a one-time sale is made on the coach\'s account, for the member\'s customer there, with Shape\'s fee and no transfer', async () => {
  const r = await runCheckout();
  assert.equal(r.status, 200);
  assert.equal(r.body.url, 'https://checkout.stripe.test/cs_test_new1');
  const [args, opts] = r.created[0];
  assert.deepEqual(opts, { stripeAccount: ACCT }, 'on the coach\'s account');
  assert.equal(args.customer, 'cus_onCoach', 'the member\'s customer on that account, never the platform one');
  assert.deepEqual(r.customers[0][1], { stripeAccount: ACCT, idempotencyKey: `shape-customer-${UID}-${ACCT}` });
  assert.equal(args.payment_intent_data.application_fee_amount, 2700, '15% of $180');
  assert.equal(args.payment_intent_data.transfer_data, undefined, 'a direct charge transfers nothing');
  assert.match(args.success_url, new RegExp(`session_id=\\{CHECKOUT_SESSION_ID\\}&acct=${ACCT}$`), 'the return page reads it on the coach\'s account');
  assert.equal(args.allow_promotion_codes, false, 'a fixed fee: one-time codes go through Shape\'s box');
  // The record, before the address.
  const [rec] = stmts(r.db.calls, 'coach_checkouts', 'insert');
  assert.deepEqual(rec.payload, {
    stripe_checkout_session_id: 'cs_test_new1', stripe_account_id: ACCT, client_id: UID, provider_role: 'trainer', provider_id: 4,
    mode: 'payment', kind: 'booking', plan_id: null, workout_id: null, item_name: 'Session', origin: 'marketplace', fee_bps: 1500,
    referral_id: null, list_cents: 18000, charge_cents: 18000, application_fee_cents: 2700, store_credit_kind: null, store_credit_cents: 0,
    store_credit_ref: null, code: null, code_source: null,
  });
});

test('checkout: a subscription on the coach\'s account takes application_fee_percent, expires Shape-side open checkouts, and asks both accounts whether it is paid', async () => {
  const r = await runCheckout({ body: { item: { type: 'Subscription', name: 'Monthly coaching' } } });
  assert.equal(r.status, 200);
  const [args, opts] = r.created[0];
  assert.deepEqual(opts, { timeout: 20000, maxNetworkRetries: 0, stripeAccount: ACCT });
  assert.equal(args.subscription_data.application_fee_percent, 15);
  assert.equal(args.subscription_data.transfer_data, undefined);
  assert.equal(args.allow_promotion_codes, true, 'with no code typed, the coach\'s own codes go in Stripe\'s box');
  assert.equal(r.open.length, 2);
  assert.equal(r.open[0][0], 'cus_platform');
  assert.equal(r.open[0][2]({}), false, 'every open checkout on Shape\'s account is expired, none handed back');
  // ⚠ On the coach's account nothing is handed back (Codex on #2403): Shape's recorded open ones for
  // this coach are retired by their record, never matched by metadata the coach can rewrite.
  assert.deepEqual(r.open[1], ['retire', UID, ACCT, { provider_role: 'trainer', provider_id: 4 }]);
  assert.deepEqual(r.live.map((a) => [a[0].customerId, a[2] ?? null]), [['cus_platform', null], ['cus_onCoach', ACCT]]);
  // ⚠ On the coach's account only a subscription Shape's application made counts (Codex on #2403):
  // the coach can make one with the member's metadata.
  const shapes = r.live[1][3];
  assert.equal(typeof shapes, 'function');
  await withEnv(CONNECT_ENV, async () => {
    assert.equal(shapes({ application: APP }), true);
    assert.equal(shapes({ application: null }), false, 'the coach\'s own, made off Shape');
    assert.equal(shapes({ application: 'ca_other' }), false);
    // One from a checkout Shape recorded and the member completed counts with no application
    // (Codex on #2403): the window before the webhook writes its row.
    assert.equal(shapes({ id: 'sub_recordedNoApp', application: null }), true);
  });
  assert.equal(stmts(r.db.calls, 'coach_checkouts', 'insert')[0].payload.mode, 'subscription');
  assert.deepEqual(r.customers.find((c) => c[0] === 'sub'), ['sub', 'sub_recordedNoApp', { stripeAccount: ACCT }], 'Shape\'s recorded subscription is read by its id');
  // ⚠ A recorded subscription that is live blocks a second one, however many the coach has piled
  // on top of it in the customer's list (Codex on #2403).
  const paid = await runCheckout({ body: { item: { type: 'Subscription', name: 'Monthly coaching' } }, recordedSubStatus: 'active' });
  assert.deepEqual([paid.status, paid.body.reason], [409, 'already_subscribed']);
  assert.equal(paid.created.length, 0);
});

test('recordedSubscriptionLive reads each recorded subscription by its id', async () => {
  const live = new Set(['active', 'trialing', 'past_due']);
  const subs = { sub_a: 'canceled', sub_b: 'past_due' };
  const stripe = { subscriptions: { retrieve: async (id, p, o) => { assert.deepEqual(o, { stripeAccount: ACCT }); if (!(id in subs)) throw Object.assign(new Error('No such subscription'), { code: 'resource_missing' }); return { id, status: subs[id] }; } } };
  assert.equal(await cc.recordedSubscriptionLive(stripe, ACCT, ['sub_gone', 'sub_a', 'sub_b'], live), true);
  assert.equal(await cc.recordedSubscriptionLive(stripe, ACCT, ['sub_gone', 'sub_a'], live), false);
  assert.equal(await cc.recordedSubscriptionLive(stripe, ACCT, [], live), false);
  const down = { subscriptions: { retrieve: async () => { throw Object.assign(new Error('rate limited'), { code: 'rate_limit' }); } } };
  await assert.rejects(cc.recordedSubscriptionLive(down, ACCT, ['sub_a'], live), /rate limited/);
});

test('checkout: a checkout whose record fails is expired and never handed out, and its credit is released', async () => {
  const r = await runCheckout({ reserve: 2500, errors: { 'insert:coach_checkouts': { code: '57014', message: 'timeout' } } });
  assert.equal(r.status, 503);
  assert.equal(r.body.url, undefined);
  assert.deepEqual(r.expired, [['cs_test_new1', { stripeAccount: ACCT }]]);
  assert.ok(r.db.calls.some((c) => c.rpc === 'release_store_credit_reservation'), 'the reservation goes back at once');
});

test('checkout: store credit on the coach\'s account is bound to its checkout in the record', async () => {
  const r = await runCheckout({ reserve: 2500 });
  const [args] = r.created[0];
  assert.equal(args.line_items[0].price_data.unit_amount, 15500);
  assert.equal(args.payment_intent_data.application_fee_amount, 200, 'Shape absorbs the credit from its fee');
  const rec = stmts(r.db.calls, 'coach_checkouts', 'insert')[0].payload;
  const reserved = r.db.calls.find((c) => c.rpc === 'reserve_store_credit').args.p_ref;
  assert.deepEqual([rec.store_credit_kind, rec.store_credit_cents, rec.store_credit_ref, rec.charge_cents], ['session', 2500, reserved, 15500]);
});

test('checkout: a code is checked before the redirect and Shape takes its rate of the discounted price', async () => {
  const r = await runCheckout({ body: { code: 'SPRING25' }, codes: { shape: [shapeCode()] }, reserve: 2500 });
  assert.equal(r.status, 200);
  const [args] = r.created[0];
  assert.deepEqual(args.discounts, [{ coupon: 'shape-promo_shape1' }]);
  assert.equal(args.allow_promotion_codes, undefined, 'one discount per checkout');
  assert.equal(args.line_items[0].price_data.unit_amount, 18000, 'the code is Stripe\'s discount on the list price');
  assert.equal(args.payment_intent_data.application_fee_amount, 2025, '15% of $135');
  assert.equal(r.db.calls.filter((c) => c.rpc === 'reserve_store_credit').length, 0, 'a code and credit do not stack');
  const rec = stmts(r.db.calls, 'coach_checkouts', 'insert')[0].payload;
  assert.deepEqual([rec.code, rec.code_source, rec.charge_cents, rec.application_fee_cents, rec.list_cents], ['SPRING25', 'shape', 13500, 2025, 18000]);
  // A subscription's percent fee follows the discount by itself.
  const sub = await runCheckout({ body: { code: 'SPRING25', item: { type: 'Subscription' } }, codes: { shape: [shapeCode()] } });
  assert.equal(sub.created[0][0].subscription_data.application_fee_percent, 15);
  assert.deepEqual(sub.created[0][0].discounts, [{ coupon: 'shape-promo_shape1' }]);
  // Refusals say what is wrong with the code, and nothing is created.
  for (const [c, codes, reason] of [['NOPE', {}, 'code_invalid'], ['bad code', {}, 'code_invalid'], ['SPRING25', { shape: [shapeCode({ max_redemptions: 5 })] }, 'code_not_here']]) {
    const x = await runCheckout({ body: { code: c }, codes });
    assert.equal(x.status, 400, c);
    assert.equal(x.body.reason, reason, c);
    assert.equal(x.created.length, 0, c);
  }
});

test('checkout: an unconnected or disconnected coach takes no payment, and says which', async () => {
  const off = await runCheckout({ provider: { ...TRAINER, stripe_account_status: 'disconnected' } });
  assert.deepEqual([off.status, off.body.reason], [409, 'coach_disconnected']);
  const never = await runCheckout({ provider: { ...TRAINER, stripe_account_id: null, stripe_account_status: null } });
  assert.deepEqual([never.status, never.body.reason, never.body.error], [409, 'coach_not_connected', 'Provider has not completed Stripe onboarding.']);
  assert.equal(off.created.length + never.created.length, 0);
});

test('checkout: without the Connect variables the checkout stays a destination charge on Shape\'s account', async () => {
  const r = await runCheckout({ env: {} });
  assert.equal(r.status, 200);
  const [args, opts] = r.created[0];
  assert.equal(opts, undefined);
  assert.equal(args.customer, 'cus_platform');
  assert.deepEqual(args.payment_intent_data.transfer_data, { destination: ACCT });
  assert.doesNotMatch(args.success_url, /acct=/);
  assert.equal(stmts(r.db.calls, 'coach_checkouts').length, 0);
  assert.equal(r.customers.length, 0);
  assert.ok(r.logs.some((l) => l.includes('destination charge')), 'said');
  const coded = await runCheckout({ env: {}, body: { code: 'SPRING25' } });
  assert.deepEqual([coded.status, coded.body.reason], [400, 'code_not_here']);
});

test('the website\'s two forms create on the coach\'s account, record the checkout and carry a code box', () => {
  for (const p of ['src/app/subscribe/actions.ts', 'src/app/purchase/actions.ts']) {
    const src = read(p);
    assert.match(src, /const direct = directChargesReady\(\);/, p);
    assert.match(src, /connectedCustomerFor\(stripe, /, p);
    assert.match(src, /await recordCoachCheckout\(/, p);
    assert.match(src, /\.\.\.\(direct \? \{\} : \{ transfer_data: \{ destination: account \} \}\)/, p);
    assert.match(src, /\$\{direct \? `&acct=\$\{account\}` : ''\}/, p);
    assert.match(src, /normalizeCode\(formData\.get\('code'\)\)/, p);
    assert.match(src, /coachNotPayable\(provider\)/, p);
  }
  assert.match(read('src/app/subscribe/actions.ts'), /\}, onCoach\);\n  const price = await stripe\.prices\.create\(\{/, 'the price is made on the coach\'s account');
  assert.match(read('src/app/purchase/actions.ts'), /const \{ applicationFeeCents \} = feeSplit\(chargeCents, chargeCents, bpsToRate\(feeBps\)\);/, 'the fee of the price after the code');
  for (const p of ['src/app/subscribe/page.tsx', 'src/app/purchase/page.tsx']) assert.match(read(p), /<CheckoutCodeField \/>/, p);
  assert.match(read('src/components/CheckoutCodeField.tsx'), /name="code"/);
  assert.equal((read('public/newdesign/livingShared.jsx').match(/code: lvCheckoutCode\(\),/g) || []).length, 2, 'the website\'s Buy and Subscribe send the code');
  assert.match(read('mobile-app/src/services/shapeBackend.js'), /\.\.\.\(code \? \{ code \} : \{\}\),/);
  const market = read('mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx');
  assert.match(market, /code: checkoutCode\.trim\(\) \|\| undefined,/, 'the app\'s checkout sends the typed code');
  assert.match(market, /code=\{checkoutCode\}\n\s+onCode=\{setCheckoutCode\}/);
  assert.match(market, /<input\n\s+data-checkout-code=""/);
  for (const loc of fs.readdirSync(join(ROOT, 'mobile-app/src/i18n/catalogs'))) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/marketplace.json`));
    assert.ok(typeof cat['panel.codeLabel'] === 'string' && cat['panel.codeLabel'].trim(), `${loc}: the code box is labelled`);
  }
});

// ── The webhook ───────────────────────────────────────────────────────────────────────────────
const coachTables = (extra = {}) => ({
  trainers: [{ id: 4, name: 'Tom', stripe_account_id: ACCT }, { id: 5, name: 'Ann', stripe_account_id: OTHER_ACCT }],
  nutritionists: [],
  coach_checkouts: [record(), record({ stripe_checkout_session_id: 'cs_test_direct2', mode: 'subscription', kind: 'subscription', application_fee_cents: null })],
  ...extra,
});

async function runWebhook(event, { tables = coachTables(), errors = {}, pi = {}, sub = {}, retrieveSub } = {}) {
  const db = fakeDb({ tables, errors });
  const calls = [];
  const stripe = {
    webhooks: { constructEvent: (raw, sig, secret) => { if (sig !== `signed:${secret}`) throw new Error('bad'); return JSON.parse(raw); } },
    paymentIntents: { retrieve: async (id, params, opts) => { calls.push(['paymentIntents.retrieve', id, opts]); return { id, amount: 18000, application_fee_amount: 2700, application: APP, ...pi }; } },
    subscriptions: { retrieve: async (id, params, opts) => {
      calls.push(['subscriptions.retrieve', id, params, opts]);
      if (retrieveSub) return retrieveSub(id, params, opts);
      return { id, status: 'active', application: APP, application_fee_percent: 15, items: { data: [{ current_period_end: 1800000000, quantity: 1, price: { unit_amount: 18000 } }] }, discounts: [], ...sub };
    } },
    invoices: { retrieve: async () => ({}) },
    applicationFees: { retrieve: async () => ({}), createRefund: async () => ({}) },
  };
  const told = [];
  const route = await loadRealModule(join(ROOT, 'src/app/api/stripe/webhook/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/stripe', { stripe }],
      ['@/lib/stripe-connect', connect],
      ['@/lib/coach-checkout', cc],
      ['@/lib/supabase/admin', { createAdminClient: () => db.client }],
      ['@/lib/platform-fee', await import(pathToFileURL(join(ROOT, 'src/lib/platform-fee.mjs')).href)],
      ['@/lib/coach-origin.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/coach-origin.mjs')).href)],
      ['@/lib/db-retryable', await loadRealModule(join(ROOT, 'src/lib/db-retryable.ts'), { typescript: true })],
      ['@/lib/refund-session', { cancelRefundedSession: async () => 'none' }],
      ['@/lib/payment-notices', { announcePayment: async (_a, args) => { told.push(['announce', args]); return {}; } }],
      ['@/lib/coach-thread', {
        startCoaching: async (_a, args) => { told.push(['coach', args]); return {}; },
        welcomeMember: async () => false,
        coachPaid: async (_a, args) => { told.push(['paid', args]); return {}; },
      }],
    ]),
  });
  const logs = [];
  const orig = { warn: console.warn, error: console.error };
  console.warn = (...a) => logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  console.error = console.warn;
  try {
    return await withEnv({ STRIPE_WEBHOOK_SECRET: 'whsec_platform', ...CONNECT_ENV }, async () => {
      const res = await route.POST(new Request('https://shape.test/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': 'signed:whsec_connect' }, body: JSON.stringify(event) }));
      return { status: res.status, body: await res.json(), db, calls, told, logs };
    });
  } finally {
    console.warn = orig.warn; console.error = orig.error;
  }
}

// What a coach could write into a checkout's metadata on their own account: another member, a 0% fee.
const forged = { client_id: '99999999-9999-4999-8999-999999999999', provider_id: '4', provider_role: 'trainer', kind: 'program', origin: 'coach_link', fee_bps: '0', price_cents: '100', gross_price_cents: '100', plan_id: '00000000-0000-4000-8000-000000000000', store_credit_ref: 'someone-elses-ref', store_credit_kind: 'session', store_credit_cents: '5000' };
const purchase = (extra = {}) => ({ id: 'evt_p', type: 'checkout.session.completed', account: ACCT, data: { object: { id: 'cs_test_direct1', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_d1', amount_total: 18000, metadata: forged, ...extra } } });
const subscription = (extra = {}) => ({ id: 'evt_s', type: 'checkout.session.completed', account: ACCT, data: { object: { id: 'cs_test_direct2', mode: 'subscription', payment_status: 'paid', subscription: 'sub_d1', customer: 'cus_onCoach', amount_total: 18000, metadata: forged, ...extra } } });
const wrote = (r) => r.db.calls.filter((c) => c.op !== 'select').length + r.db.calls.filter((c) => c.rpc).length;

test('webhook: a checkout on a coach\'s account that Shape has no record of writes nothing', async () => {
  const r = await runWebhook(purchase(), { tables: coachTables({ coach_checkouts: [] }) });
  assert.equal(r.status, 200);
  assert.equal(r.body.ignored, 'not_recorded');
  assert.equal(wrote(r), 0);
  assert.deepEqual(r.told, []);
  assert.equal(r.calls.length, 0, 'not even its payment is read');
  // Recorded for another account: not this checkout.
  const elsewhere = await runWebhook(purchase(), { tables: coachTables({ coach_checkouts: [record({ stripe_account_id: OTHER_ACCT })] }) });
  assert.equal(elsewhere.body.ignored, 'not_recorded');
  // A record that cannot be read for a passing reason is retried.
  const down = await runWebhook(purchase(), { errors: { 'select:coach_checkouts': { code: '57014', message: 'canceling statement due to statement timeout' } } });
  assert.equal(down.status, 503);
  assert.equal(wrote(down), 0);
});

test('webhook: a coach\'s purchase is recorded from Shape\'s record and Stripe\'s amounts, never the checkout\'s metadata', async () => {
  const r = await runWebhook(purchase({ amount_total: 13500 }), { pi: { amount: 13500, application_fee_amount: 2025 } });
  assert.equal(r.status, 200);
  const [row] = stmts(r.db.calls, 'one_time_purchases', 'upsert');
  assert.equal(row.payload.client_id, UID, 'the buyer Shape recorded');
  assert.equal(row.payload.kind, 'booking');
  assert.equal(row.payload.plan_id, null);
  assert.equal(row.payload.fee_bps, 1500, 'the rate Shape resolved, not the 0 written on the checkout');
  assert.equal(row.payload.origin, 'marketplace');
  assert.equal(row.payload.price_cents, 13500, 'what Stripe charged');
  assert.equal(row.payload.application_fee_cents, 2025, 'the fee on the payment');
  assert.equal(row.payload.stripe_account_id, ACCT);
  assert.equal(r.db.calls.filter((c) => c.rpc === 'consume_store_credit').length, 0, 'no credit recorded, none taken, whatever the metadata names');
  const paid = r.told.find(([k]) => k === 'paid')[1];
  assert.equal(paid.coachCents, 11475, 'what was charged less Shape\'s fee');
  assert.equal(paid.clientId, UID);
});

test('webhook: a recorded checkout\'s payment with no application at all is accepted, and said; another application\'s is refused', async () => {
  const none = await runWebhook(purchase(), { pi: { application: null } });
  assert.equal(stmts(none.db.calls, 'one_time_purchases', 'upsert').length, 1);
  assert.ok(none.logs.some((l) => l.includes('carries no application')), 'the end-to-end test purchase shows which it is');
  const other = await runWebhook(purchase(), { pi: { application: 'ca_someoneElse' } });
  assert.equal(other.body.ignored, 'application_mismatch');
  assert.equal(wrote(other), 0);
  // ⚠ A recorded checkout is judged by its record, not the coach's account now (Codex on #2403): a
  // payment that lands after the coach reconnected on a new account is still recorded, on the
  // account it was made on.
  const reconnected = await runWebhook(purchase(), { tables: coachTables({ trainers: [{ id: 4, name: 'Tom', stripe_account_id: 'acct_1BrandNewOne9' }] }) });
  assert.equal(reconnected.status, 200);
  assert.equal(stmts(reconnected.db.calls, 'one_time_purchases', 'upsert')[0].payload.stripe_account_id, ACCT);
  // The coach must still exist.
  const gone = await runWebhook(purchase(), { tables: coachTables({ trainers: [] }) });
  assert.equal(gone.body.ignored, 'no_coach_row');
});

test('webhook: a coach\'s subscription takes its rate and price from the Subscription', async () => {
  const r = await runWebhook(subscription(), { sub: { application_fee_percent: 15, items: { data: [{ current_period_end: 1800000000, quantity: 2, price: { unit_amount: 18000 } }] }, discounts: [{ end: null, source: { coupon: { duration: 'forever', percent_off: 10 } } }] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.calls.find((c) => c[0] === 'subscriptions.retrieve').slice(2), [{ expand: ['discounts.source.coupon'] }, { stripeAccount: ACCT }]);
  const [row] = stmts(r.db.calls, 'subscriptions', 'upsert');
  assert.equal(row.payload.price_cents, 32400, 'two seats, 10% off');
  assert.equal(row.payload.fee_bps, 1500);
  assert.equal(row.payload.client_id, UID);
  // A BYO record (0%) is recorded at 0 only when the subscription itself carries no fee.
  const byo = await runWebhook(subscription(), { tables: coachTables({ coach_checkouts: [record({ stripe_checkout_session_id: 'cs_test_direct2', mode: 'subscription', kind: 'subscription', origin: 'coach_link', fee_bps: 0 })] }), sub: { application_fee_percent: null } });
  assert.deepEqual([stmts(byo.db.calls, 'subscriptions', 'upsert')[0].payload.origin, stmts(byo.db.calls, 'subscriptions', 'upsert')[0].payload.fee_bps], ['coach_link', 0]);
  // ⚠ The rate recorded is the Subscription's, not the record's: a BYO record (0%) on a
  // subscription that carries 15% is recorded at what Stripe takes.
  const charged = await runWebhook(subscription(), { tables: coachTables({ coach_checkouts: [record({ stripe_checkout_session_id: 'cs_test_direct2', mode: 'subscription', kind: 'subscription', origin: 'coach_link', fee_bps: 0 })] }), sub: { application_fee_percent: 15 } });
  assert.equal(stmts(charged.db.calls, 'subscriptions', 'upsert')[0].payload.fee_bps, 1500);
  // A subscription whose rate differs from its record is said out loud (only Shape sets the rate,
  // so it is a bug to look at); the row keeps a coherent origin and rate (attributionPair).
  const odd = await runWebhook(subscription(), { sub: { application_fee_percent: 20 } });
  assert.ok(odd.logs.some((l) => l.includes('differs from its record')));
  assert.equal(stmts(odd.db.calls, 'subscriptions', 'upsert')[0].payload.origin, 'marketplace');
  // No subscription named: nothing.
  const none = await runWebhook(subscription({ subscription: null }));
  assert.equal(none.body.ignored, 'no_subscription');
  assert.equal(wrote(none), 0);
});

test('webhook: an expired checkout on a coach\'s account releases only the credit recorded against it', async () => {
  const expired = { id: 'evt_e', type: 'checkout.session.expired', account: ACCT, data: { object: { id: 'cs_test_direct1', metadata: { store_credit_ref: 'someone-elses-ref' } } } };
  const r = await runWebhook(expired, { tables: coachTables({ coach_checkouts: [record({ store_credit_ref: 'ref-mine', store_credit_kind: 'session', store_credit_cents: 2500 })] }) });
  assert.deepEqual(r.db.calls.filter((c) => c.rpc).map((c) => [c.rpc, c.args]), [['release_store_credit_reservation', { p_ref: 'ref-mine' }]]);
  const unrecorded = await runWebhook(expired, { tables: coachTables({ coach_checkouts: [] }) });
  assert.equal(unrecorded.db.calls.filter((c) => c.rpc).length, 0, 'no record: nothing released');
  const noCredit = await runWebhook(expired);
  assert.equal(noCredit.db.calls.filter((c) => c.rpc).length, 0);
  const down = await runWebhook(expired, { errors: { 'select:coach_checkouts': { message: 'permission denied', code: '42501' } } });
  assert.equal(down.status, 200);
  assert.equal(down.db.calls.filter((c) => c.rpc).length, 0, 'unreadable: left to the 48-hour sweep');
});

test('webhook: a coach\'s subscription change records what it renews at, quantity and discounts included', async () => {
  const tables = () => coachTables({ subscriptions: [{ stripe_subscription_id: 'sub_d1', status: 'active', price_cents: 18000, stripe_account_id: ACCT }] });
  const changed = (obj) => ({ id: 'evt_u', type: 'customer.subscription.updated', account: ACCT, data: { object: { id: 'sub_d1', status: 'active', application: APP, items: { data: [{ current_period_end: 1800000000, quantity: 3, price: { unit_amount: 18000 } }] }, ...obj } } });
  const qty = await runWebhook(changed({ discounts: [] }), { tables: tables() });
  assert.equal(qty.db.tables.subscriptions[0].price_cents, 54000, 'three seats');
  assert.equal(qty.calls.filter((c) => c[0] === 'subscriptions.retrieve').length, 0, 'nothing to expand: not read again');
  const disc = await runWebhook(changed({ discounts: ['di_1'] }), { tables: tables(), retrieveSub: async (id) => ({ id, items: { data: [{ quantity: 3, price: { unit_amount: 18000 } }] }, discounts: [{ end: null, source: { coupon: { duration: 'forever', amount_off: 4000 } } }] }) });
  assert.deepEqual(disc.calls.find((c) => c[0] === 'subscriptions.retrieve').slice(2), [{ expand: ['discounts.source.coupon'] }, { stripeAccount: ACCT }]);
  assert.equal(disc.db.tables.subscriptions[0].price_cents, 50000);
  const unread = await runWebhook(changed({ discounts: ['di_1'] }), { tables: tables(), retrieveSub: async () => { throw new Error('rate limited'); } });
  assert.equal(unread.db.tables.subscriptions[0].price_cents, 18000, 'unreadable: the price is left as it was');
  assert.equal(unread.db.tables.subscriptions[0].status, 'active');
  // No application at all: the row on this account is still Shape's; another application's is not.
  const bare = await runWebhook(changed({ application: null, status: 'past_due', discounts: [] }), { tables: tables() });
  assert.equal(bare.db.tables.subscriptions[0].status, 'past_due');
  const foreign = await runWebhook(changed({ application: 'ca_other', status: 'past_due', discounts: [] }), { tables: tables() });
  assert.equal(foreign.db.tables.subscriptions[0].status, 'active');
});

// ── The return page ───────────────────────────────────────────────────────────────────────────
async function loadReturn({ session, tables = coachTables() }) {
  const db = fakeDb({ tables });
  const mod = await loadRealModule(join(ROOT, 'src/lib/checkout-return.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/stripe', { stripe: { checkout: { sessions: { retrieve: async () => session } } } }],
      ['@/lib/stripe-connect', connect],
      ['@/lib/coach-checkout', cc],
      ['@/lib/supabase/server', { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: UID } } }) } }) }],
      ['@/lib/supabase/admin', { createAdminClient: () => db.client }],
    ]),
  });
  return mod;
}

test('the return page vouches for a checkout on a coach\'s account from Shape\'s record', () => withEnv(CONNECT_ENV, async () => {
  const ID = 'cs_test_returnpage01';
  const rec = (extra = {}) => coachTables({ coach_checkouts: [record({ stripe_checkout_session_id: ID, ...extra })] });
  const base = { id: ID, status: 'complete', payment_status: 'paid', mode: 'payment', client_reference_id: forged.client_id, payment_intent: { id: 'pi_1', application: null }, metadata: forged };
  const paid = await (await loadReturn({ session: base, tables: rec() })).readCheckoutReturn(ID, ACCT);
  assert.equal(paid.state, 'paid', 'recorded, no application: Shape\'s');
  assert.equal(paid.kind, 'booking', 'the kind Shape recorded, not the metadata\'s program');
  assert.equal((await (await loadReturn({ session: base, tables: coachTables({ coach_checkouts: [] }) })).readCheckoutReturn(ID, ACCT)).state, 'unconfirmed', 'no record');
  assert.equal((await (await loadReturn({ session: { ...base, payment_intent: { id: 'pi_1', application: 'ca_other' } }, tables: rec() })).readCheckoutReturn(ID, ACCT)).state, 'unconfirmed', 'another application');
  assert.equal((await (await loadReturn({ session: { ...base, payment_intent: 'pi_1' }, tables: rec() })).readCheckoutReturn(ID, ACCT)).state, 'unconfirmed', 'not expanded');
  // The buyer is the record's: another signed-in member is told nothing.
  assert.equal((await (await loadReturn({ session: base, tables: rec({ client_id: 'someone-else' }) })).readCheckoutReturn(ID, ACCT)).state, 'unconfirmed');
}));

// ── The billing portal route ──────────────────────────────────────────────────────────────────
test('the billing portal opens on the coach\'s account for a plan billed there', async () => {
  const portal = [];
  let portalThrows = null;
  const coachRows = [{ id: 4, name: 'Tom Trainer', stripe_account_id: ACCT, stripe_account_status: 'active' }, { id: 6, name: 'Old Plan', stripe_account_id: null, stripe_account_status: null }];
  const plans = [
    { client_id: UID, provider_id: 4, provider_role: 'trainer', status: 'active', stripe_account_id: ACCT, stripe_customer_id: 'cus_onCoach' },
    { client_id: UID, provider_id: 6, provider_role: 'trainer', status: 'active', stripe_account_id: null, stripe_customer_id: 'cus_platform' },
  ];
  const member = fakeDb({ tables: { subscriptions: plans.map((p) => ({ ...p })), platform_subscriptions: [{ client_id: UID, stripe_customer_id: 'cus_platform' }] } });
  const route = await loadRealModule(join(ROOT, 'src/app/api/stripe/billing-portal/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/stripe', { stripe: { billingPortal: { sessions: { create: async (p, o) => { portal.push(['platform', p, o]); return { url: 'https://billing.stripe.test/platform' }; } } } } }],
      ['@/lib/stripe-connect', connect],
      ['@/lib/coach-checkout', { ...cc, coachPortalUrl: async (_s, _a, args) => { portal.push(['coach', args]); if (portalThrows) throw portalThrows; return 'https://billing.stripe.test/coach'; } }],
      ['@/lib/membership-core', { ACTIVE_SUB: new Set(['active', 'trialing', 'past_due']) }],
      ['@/lib/supabase/admin', { createAdminClient: () => fakeDb({ tables: { trainers: coachRows } }).client }],
      ['@/lib/request-auth', { currentUser: async () => ({ id: UID }), clientForRequest: async () => member.client }],
      ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) })],
      ['@/lib/return-path', await loadRealModule(join(ROOT, 'src/lib/return-path.ts'), { typescript: true })],
    ]),
  });
  const post = async (body) => {
    const res = await route.POST(new Request('https://shape.test/api/stripe/billing-portal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };
  const coach = await post({ coach: { provider_role: 'trainer', provider_id: 4 }, returnPath: '/m/' });
  assert.equal(coach.body.url, 'https://billing.stripe.test/coach');
  assert.deepEqual(portal.at(-1), ['coach', { account: ACCT, customer: 'cus_onCoach', returnUrl: 'https://shape.test/m/' }]);
  // ⚠ A coach who disconnected took Shape's access with them (Codex on #2403): the member is told who
  // can stop the charge, never a 500, and no portal is attempted on the dead account.
  coachRows[0].stripe_account_status = 'disconnected';
  portal.length = 0;
  const off = await post({ coach: { provider_role: 'trainer', provider_id: 4 } });
  assert.deepEqual([off.status, off.body.reason], [409, 'coach_disconnected']);
  assert.match(off.body.error, /Ask your coach to cancel it, or contact Shape support/);
  assert.equal(portal.length, 0);
  coachRows[0].stripe_account_status = 'active';
  coachRows[0].stripe_account_id = 'acct_1BrandNewOne9';
  assert.equal((await post({ coach: { provider_role: 'trainer', provider_id: 4 } })).body.reason, 'coach_disconnected', 'reconnected on a new account: the old plan\'s account is gone');
  coachRows[0].stripe_account_id = ACCT;
  portalThrows = Object.assign(new Error('The provided key does not have access to account'), { type: 'StripePermissionError' });
  assert.equal((await post({ coach: { provider_role: 'trainer', provider_id: 4 } })).body.reason, 'coach_disconnected', 'Stripe refuses before the webhook has said so');
  portalThrows = Object.assign(new Error('rate limited'), { type: 'StripeRateLimitError' });
  assert.equal((await post({ coach: { provider_role: 'trainer', provider_id: 4 } })).status, 500, 'any other failure is a failure');
  portalThrows = null;
  const legacy = await post({ coach: { provider_role: 'trainer', provider_id: 6 } });
  assert.deepEqual([legacy.status, legacy.body.reason], [404, 'no_coach_plan'], 'a plan from before the move is in Shape\'s own portal');
  assert.equal((await post({ coach: { provider_role: 'admin', provider_id: 4 } })).status, 400);
  const platform = await post({});
  assert.equal(platform.body.url, 'https://billing.stripe.test/platform', 'without a coach: Shape\'s portal, as before');
  // GET lists the plans billed on coaches' own accounts, for the app's Manage rows (Codex on #2403):
  // the one from before the move is in Shape's own portal, so it is not listed.
  const listed = await route.GET(new Request('https://shape.test/api/stripe/billing-portal'));
  assert.deepEqual(await listed.json(), { plans: [{ provider_role: 'trainer', provider_id: 4, name: 'Tom Trainer' }] });
});

test('coachAccountPlans lists each live plan billed on a coach\'s account once', async () => {
  const live = new Set(['active', 'trialing', 'past_due']);
  const db = fakeDb({ tables: { subscriptions: [
    { client_id: UID, provider_role: 'trainer', provider_id: 4, status: 'active', stripe_account_id: ACCT, stripe_customer_id: 'cus_a' },
    { client_id: UID, provider_role: 'trainer', provider_id: 4, status: 'past_due', stripe_account_id: ACCT, stripe_customer_id: 'cus_a' },
    { client_id: UID, provider_role: 'nutritionist', provider_id: 2, status: 'canceled', stripe_account_id: OTHER_ACCT, stripe_customer_id: 'cus_b' },
    { client_id: UID, provider_role: 'trainer', provider_id: 6, status: 'active', stripe_account_id: null, stripe_customer_id: 'cus_p' },
    { client_id: 'someone-else', provider_role: 'trainer', provider_id: 9, status: 'active', stripe_account_id: ACCT, stripe_customer_id: 'cus_x' },
  ] } });
  assert.deepEqual((await cc.coachAccountPlans(db.client, UID, live)).plans, [{ provider_role: 'trainer', provider_id: 4 }]);
  const down = fakeDb({ errors: { 'select:subscriptions': { code: '57014', message: 'timeout' } } });
  assert.equal((await cc.coachAccountPlans(down.client, UID, live)).error.code, '57014');
});

test('the app\'s billing section has a Manage row for each coaching plan billed on a coach\'s account (Codex on #2403)', () => {
  const src = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(src, /bsApi\.fetch\('\/api\/stripe\/billing-portal', \{ credentials: 'same-origin', cache: 'no-store' \}\)/, 'the plans are read');
  assert.match(src, /\.\.\.coachPlans\.map\(\(p\) => \(\{ l: p\.name \|\| [\s\S]{0,260}action: \(\) => openCoachBilling\(p\) \}\)\),/);
  const fn = src.slice(src.indexOf('const openCoachBilling = async (p) => {'), src.indexOf('const openBillingPortal = async () => {'));
  assert.match(fn, /body: JSON\.stringify\(\{ coach: \{ provider_role: p\.provider_role, provider_id: p\.provider_id \}, returnPath: '\/m\/' \}\),/);
  assert.match(fn, /if \(data\?\.reason === 'no_coach_plan'\) \{ openBillingPortal\(\); return; \}/);
  for (const loc of fs.readdirSync(join(ROOT, 'mobile-app/src/i18n/catalogs'))) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/settings.json`));
    assert.ok(typeof cat['billing.coachPlan'] === 'string' && cat['billing.coachPlan'].trim(), loc);
  }
});

test('the website\'s Settings opens each coaching plan\'s billing where it is paid', () => {
  const src = read('public/newdesign/clientMeSettings.jsx');
  assert.match(src, /action="MANAGE" onAction=\{\(\) => openCoachBilling\(c\)\}/, 'a coaching plan\'s MANAGE opens its billing, not the pricing page');
  const fn = src.slice(src.indexOf('async function openCoachBilling('), src.indexOf('function PlanBillingCard('));
  assert.match(fn, /post\(\{ coach: \{ provider_role: c\.provider_role, provider_id: c\.provider_id \}, returnPath: back \}\)/, 'the coach\'s account first');
  assert.match(fn, /if \(!r\.ok && r\.d && r\.d\.reason === "no_coach_plan"\) r = await post\(\{ returnPath: back \}\);/, 'a plan from before the move: Shape\'s own portal');
  assert.match(fn, /if \(!r\.ok && r\.d && r\.d\.reason === "coach_disconnected"\) \{ window\.alert\(r\.d\.error\); return; \}/, 'a disconnected coach: the member is told who can help');
});

// ── The migration ─────────────────────────────────────────────────────────────────────────────
test('migration: coach_checkouts is the service role\'s only, keyed on the checkout, one checkout per reservation', () => {
  const sql = code('supabase-migrations/2026-10-18-coach-checkouts.sql');
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;\s*$/m);
  assert.match(sql, /create table if not exists public\.coach_checkouts \(\n {2}stripe_checkout_session_id text primary key,\n {2}stripe_account_id text not null,\n {2}client_id uuid not null references auth\.users \(id\) on delete cascade,/);
  assert.match(sql, /fee_bps integer not null check \(fee_bps between 0 and 10000\),/);
  assert.match(sql, /create unique index if not exists coach_checkouts_store_credit_ref_key\n\s+on public\.coach_checkouts \(store_credit_ref\) where store_credit_ref is not null;/);
  assert.match(sql, /alter table public\.coach_checkouts enable row level security;\nrevoke all on public\.coach_checkouts from anon, authenticated;/);
  assert.doesNotMatch(sql, /create policy|grant |security definer/i);
  const guard = sql.slice(sql.indexOf('do $guard$'));
  for (const needle of ['relrowsecurity', 'from pg_policies', "has_table_privilege('anon'", 'coach_checkouts_store_credit_ref_key', "is_nullable = 'NO'"]) assert.ok(guard.includes(needle), needle);
  // Every key the routes write is a column.
  const cols = [...sql.matchAll(/^ {2}([a-z_]+) (?:text|uuid|bigint|integer|timestamptz)/gm)].map((m) => m[1]);
  const keys = Object.keys(record());
  for (const k of keys) assert.ok(cols.includes(k), `column ${k}`);
});
