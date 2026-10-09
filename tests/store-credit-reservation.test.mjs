// H5 of the 2026-10-08 security review: store credit is RESERVED when a checkout starts.
//
// Before: /api/stripe/checkout-session read the wallet and lowered the charge with no write, and
// the webhook debited `least(balance, amount)` on completion, ignoring the return value. Five
// checkouts opened against one $25 credit each charged $25 less; the first webhook debited $25,
// the other four debited nothing, all five purchases stood. Now the checkout reserves the credit
// (a negative `reservation` row under the member's wallet lock), stamps the reservation ref on the
// session, and the webhook converts the reservation into the checkout debit on completion or
// releases it on `checkout.session.expired`; a sweep releases anything older than 48 hours.
//
// The database half is 2026-10-09-store-credit-reservations-and-lead-boost-redemption.sql, tested
// on the PostgreSQL 16 replica of production (the PR description has the table). What this file
// pins: the definer model's reading of the four wallet functions (SECURITY DEFINER, pinned,
// service_role only, one consume_store_credit signature), the migration's shape, and the two
// SHIPPING routes driven through loadRealModule against scripted Stripe and Supabase clients:
// the checkout charges the full price less exactly what was reserved, never less what was read;
// the webhook names the reservation when it consumes, says a shortfall out loud, falls back to
// the 4-argument function on a database without the 5-argument one, and releases on expiry.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as M from './helpers/definer-model.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'supabase-migrations');
const FILE = '2026-10-09-store-credit-reservations-and-lead-boost-redemption.sql';
const SQL = fs.readFileSync(join(DIR, FILE), 'utf8');
const UID = '11111111-1111-4111-8111-111111111111';

// ── the migration, as the definer model reads it ───────────────────────────────────────────
let realModel;
const real = () => (realModel ??= M.replayDir(DIR));
const fnsNamed = (name) => [...real().fns.values()].filter((f) => f.schema === 'public' && f.name === name);

test('the four wallet functions are pinned SECURITY DEFINERs that only the service role can execute, and consume_store_credit has one signature', () => {
  for (const [name, sig] of [
    ['reserve_store_credit', 'uuid,text,text,integer'],
    ['release_store_credit_reservation', 'text'],
    ['sweep_store_credit_reservations', 'uuid,interval'],
    ['consume_store_credit', 'uuid,text,text,integer,text'],
  ]) {
    const fns = fnsNamed(name);
    assert.equal(fns.length, 1, `${name}: one signature`);
    const fn = fns[0];
    assert.equal(fn.sig, sig, `${name}: the signature the routes call`);
    assert.equal(fn.definer, true, `${name}: SECURITY DEFINER`);
    assert.equal(M.pgTempPinned(fn), true, `${name}: pg_temp pinned`);
    const d = M.describeFunction(fn);
    assert.equal(d.anon, false, `${name}: anon cannot execute`);
    assert.equal(d.authenticated, false, `${name}: a member cannot name a wallet and move it`);
    assert.equal(d.service_role, true, `${name}: the server can`);
  }
  assert.match(SQL, /drop function if exists public\.consume_store_credit\(uuid, text, text, integer\);\ncreate or replace function public\.consume_store_credit\(p_user_id uuid, p_kind text, p_session_id text, p_amount_cents integer, p_reservation_ref text default null\)/,
    'the live 4-argument signature is replaced, not overloaded (two would make the RPC call ambiguous)');
});

test('the migration\'s shape: the ledger rows, the lock, the sweep floor, the indexes, one transaction', () => {
  assert.match(SQL, /\nbegin;\nset local lock_timeout = '10s';\n/);
  assert.match(SQL, /\$guard\$;\n\ncommit;\n$/);
  // reservation and release are ledger rows under the same per-member lock the live functions take
  assert.match(SQL, /values \(p_user_id, p_kind, -v_take, 'reservation', p_ref, 'Reserved at checkout'\)/);
  assert.match(SQL, /values \(r\.user_id, r\.kind, r\.cents, 'reservation_release', p_ref, 'Reservation released'\)/);
  assert.equal((SQL.match(/pg_advisory_xact_lock\(hashtext\('shape_store_credit:' \|\| (?:p_user_id|r\.user_id)::text\)\)/g) ?? []).length, 3, 'reserve, release and consume each take the wallet lock');
  // conversion: the release and the checkout debit are written together, so the wallet does not move
  assert.match(SQL, /values \(p_user_id, p_kind, v_res, 'reservation_release', p_reservation_ref, 'Reservation converted at checkout'\);\n\s+v_take := least\(v_res, p_amount_cents\);/);
  // a converted or released reservation is never released twice
  assert.match(SQL, /if exists \(select 1 from public\.store_credits where ref = p_ref and source = 'reservation_release'\) then\n\s+return 0;/);
  // the sweep never touches a reservation younger than a live Stripe session
  assert.match(SQL, /v_age interval := case when p_older_than is null or p_older_than < interval '24 hours' then interval '48 hours' else p_older_than end;/);
  assert.match(SQL, /perform public\.sweep_store_credit_reservations\(p_user_id, interval '48 hours'\);/, 'reserve releases this member\'s stale reservations first');
  // the idempotency the functions check is also enforced by the database
  assert.match(SQL, /create unique index if not exists store_credits_reservation_uniq\n\s+on public\.store_credits \(ref\) where source = 'reservation';/);
  assert.match(SQL, /create unique index if not exists store_credits_reservation_release_uniq\n\s+on public\.store_credits \(ref\) where source = 'reservation_release';/);
  // the guard checks every function's definer, pin and grants, and the replaced signature is gone
  const guard = SQL.slice(SQL.indexOf('do $guard$'), SQL.lastIndexOf('$guard$;'));
  for (const name of ['reserve_store_credit', 'release_store_credit_reservation', 'sweep_store_credit_reservations', 'consume_store_credit', 'redeem_lead_boost']) {
    assert.ok(guard.includes(`('${name}', '`), `the guard names ${name}`);
  }
  assert.match(guard, /when has_function_privilege\('anon', v_oid, 'EXECUTE'\) then 'executable by anon'/);
  assert.match(guard, /the 4-argument consume_store_credit still exists beside the 5-argument one/);
  assert.doesNotMatch(guard, /\bexecute\b/, 'no dynamic SQL: the definer model reads the block as inert');
  for (const m of guard.matchAll(/raise exception '((?:[^']|'')*)'((?:,\s*[\w.()':]+)*)\s*;/g)) {
    const pct = (m[1].match(/%/g) ?? []).length;
    const args = m[2].trim() ? m[2].split(',').filter((s) => s.trim()).length : 0;
    assert.equal(pct, args, `RAISE "${m[1].slice(0, 60)}": ${pct} placeholder(s), ${args} argument(s)`);
  }
});

// ── the shipping routes, against scripted clients ──────────────────────────────────────────
const require_ = createRequire(join(ROOT, 'package.json'));
const nextServer = require_('next/server');
let shared;
async function sharedModules() {
  if (shared) return shared;
  const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
  // platform-fee.ts only re-exports ./platform-fee.mjs with types; the routes get the module itself.
  const platformFee = await import(pathToFileURL(join(ROOT, 'src/lib/platform-fee.mjs')).href);
  const coachOrigin = await import(pathToFileURL(join(ROOT, 'src/lib/coach-origin.mjs')).href);
  const retryable = await loadRealModule(join(ROOT, 'src/lib/db-retryable.ts'), { typescript: true });
  shared = { requestUtils, platformFee, coachOrigin, retryable };
  return shared;
}

/** A Supabase client whose every query chain resolves from `tables`, recording writes and rpc calls. */
function scriptedClient({ tables = {}, rpc = async () => ({ data: null, error: null }) } = {}) {
  const calls = { rpc: [], upserts: [], updates: [] };
  const from = (table) => {
    const rows = tables[table] ?? [];
    const q = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'lt', 'gt', 'order', 'limit', 'not', 'is', 'ilike', 'or', 'filter']) q[m] = () => q;
    q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
    q.single = async () => ({ data: rows[0] ?? null, error: null });
    q.upsert = (row, opts) => { calls.upserts.push({ table, row, opts }); return q; };
    q.update = (row) => { calls.updates.push({ table, row }); return q; };
    q.insert = () => q;
    q.then = (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej);
    return q;
  };
  const client = {
    from,
    rpc: async (name, args) => { calls.rpc.push({ name, args }); return rpc(name, args); },
    auth: { getUser: async () => ({ data: { user: { id: UID } } }) },
  };
  return { client, calls };
}

const TRAINER = { id: 4, name: 'Coach T', owner_id: '22222222-2222-4222-8222-222222222222', price: 180, session_price: 180, stripe_account_id: 'acct_T', stripe_account_status: 'active', at_capacity: false, capacity_resume_at: null };

async function runCheckout({ reserve, stripeCreate = 'ok' }) {
  const { requestUtils, platformFee } = await sharedModules();
  const created = [];
  const { client: admin, calls } = scriptedClient({
    tables: { trainers: [TRAINER] },
    rpc: async (name, args) => {
      if (name === 'sweep_store_credit_reservations') return { data: 0, error: null };
      if (name === 'get_store_credit_for') return { data: { session: 2500, nutrition: 0 }, error: null };
      if (name === 'reserve_store_credit') return reserve(args);
      if (name === 'release_store_credit_reservation') return { data: 2500, error: null };
      return { data: null, error: { message: `unexpected rpc ${name}` } };
    },
  });
  const route = await loadRealModule(join(ROOT, 'src/app/api/stripe/checkout-session/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/stripe', { stripe: { checkout: { sessions: { create: async (args) => { created.push(args); if (stripeCreate === 'throw') throw new Error('stripe down'); return { id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' }; } } } } }],
      ['@/lib/supabase/admin', { createAdminClient: () => admin }],
      ['@/lib/capacity', { isEffectivelyAtCapacity: () => false }],
      ['@/lib/waitlist', { resolveRequestClient: async () => ({ user: { id: UID, email: 'a@example.invalid' }, supabase: scriptedClient().client }), hasActiveWaitlistInvite: async () => false }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/platform-fee', platformFee],
      ['@/lib/coach-origin', { resolveCoachCheckoutOrigin: async () => ({ origin: 'marketplace', feeBps: 1500, referralId: null }) }],
    ]),
  });
  const req = new Request('https://shape.test/api/stripe/checkout-session', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ item: { type: 'booking', name: 'Session' }, coach: { provider_id: 4, provider_role: 'trainer' } }),
  });
  const res = await route.POST(req);
  const body = await res.json();
  return { status: res.status, body, created, calls };
}

test('checkout: the credit is reserved before the session exists, and the charge is the price less exactly what was reserved', async () => {
  const { status, body, created, calls } = await runCheckout({ reserve: async () => ({ data: 2500, error: null }) });
  assert.equal(status, 200);
  assert.equal(body.creditAppliedCents, 2500);
  assert.deepEqual(calls.rpc.map((c) => c.name), ['sweep_store_credit_reservations', 'get_store_credit_for', 'reserve_store_credit'], 'this member\'s stale reservations are swept, the balance read, the credit reserved; nothing else');
  const reserve = calls.rpc[2].args;
  assert.equal(reserve.p_user_id, UID);
  assert.equal(reserve.p_kind, 'session');
  assert.equal(reserve.p_amount_cents, 2500, 'the amount the wallet showed, capped at Shape\'s cut');
  assert.match(reserve.p_ref, /^[0-9a-f-]{36}$/, 'a fresh uuid names the reservation');
  assert.equal(created.length, 1);
  const s = created[0];
  assert.equal(s.line_items[0].price_data.unit_amount, 15500, '$180 less the $25 reserved');
  assert.equal(s.metadata.store_credit_cents, '2500');
  assert.equal(s.metadata.store_credit_kind, 'session');
  assert.equal(s.metadata.store_credit_ref, reserve.p_ref, 'the webhook can name the reservation it converts or releases');
  assert.equal(s.metadata.gross_price_cents, '18000');
});

test('checkout: a short reservation (another checkout got there first) discounts only what was reserved', async () => {
  const { body, created } = await runCheckout({ reserve: async () => ({ data: 1000, error: null }) });
  assert.equal(body.creditAppliedCents, 1000);
  assert.equal(created[0].line_items[0].price_data.unit_amount, 17000);
  assert.equal(created[0].metadata.store_credit_cents, '1000');
});

test('checkout: nothing reserved means full price, no credit metadata and no ref', async () => {
  const { body, created } = await runCheckout({ reserve: async () => ({ data: 0, error: null }) });
  assert.equal(body.creditAppliedCents, 0);
  assert.equal(created[0].line_items[0].price_data.unit_amount, 18000);
  assert.equal(created[0].metadata.store_credit_cents, undefined);
  assert.equal(created[0].metadata.store_credit_kind, undefined);
  assert.equal(created[0].metadata.store_credit_ref, undefined);
});

test('checkout: a database without reserve_store_credit yet charges full price (the credit stays in the wallet) and releases nothing', async () => {
  const { status, body, created, calls } = await runCheckout({ reserve: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }) });
  assert.equal(status, 200);
  assert.equal(body.creditAppliedCents, 0);
  assert.equal(created[0].line_items[0].price_data.unit_amount, 18000);
  assert.equal(calls.rpc.filter((c) => c.name === 'release_store_credit_reservation').length, 0);
});

test('checkout: when Stripe fails to create the session, the reservation is handed back at once', async () => {
  const { status, calls } = await runCheckout({ reserve: async () => ({ data: 2500, error: null }), stripeCreate: 'throw' });
  assert.equal(status, 500);
  const ref = calls.rpc.find((c) => c.name === 'reserve_store_credit').args.p_ref;
  const releases = calls.rpc.filter((c) => c.name === 'release_store_credit_reservation');
  assert.equal(releases.length, 1, 'released once');
  assert.equal(releases[0].args.p_ref, ref, 'the same reservation');
});

async function runWebhook(event, { rpc }) {
  const { platformFee, coachOrigin, retryable } = await sharedModules();
  const { client: admin, calls } = scriptedClient({ tables: { trainers: [TRAINER], coach_plans: [], one_time_purchases: [] }, rpc });
  const errors = [];
  const origError = console.error;
  const origWarn = console.warn;
  console.error = (...a) => errors.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  console.warn = () => {};
  try {
    const route = await loadRealModule(join(ROOT, 'src/app/api/stripe/webhook/route.ts'), {
      typescript: true,
      registry: new Map([
        ['next/server', nextServer],
        ['@/lib/stripe', { stripe: { webhooks: { constructEvent: (raw) => JSON.parse(raw) }, paymentIntents: { retrieve: async () => ({ application_fee_amount: 0 }) } } }],
        ['@/lib/supabase/admin', { createAdminClient: () => admin }],
        ['@/lib/notify', { createNotification: async () => true }],
        ['@/lib/platform-fee', platformFee],
        ['@/lib/coach-origin.mjs', coachOrigin],
        ['@/lib/db-retryable', retryable],
      ]),
    });
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    const req = new Request('https://shape.test/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=x' }, body: JSON.stringify(event) });
    const res = await route.POST(req);
    return { status: res.status, body: await res.json(), calls, errors };
  } finally {
    console.error = origError;
    console.warn = origWarn;
  }
}

const completed = (metadata) => ({
  id: 'evt_1', type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_1', mode: 'payment', payment_intent: 'pi_1', metadata: {
    client_id: UID, provider_id: '4', provider_role: 'trainer', price_cents: '15500', gross_price_cents: '18000', kind: 'booking',
    item_name: 'Session', origin: 'marketplace', fee_bps: '1500', ...metadata,
  } } },
});

test('webhook: a completed checkout consumes the credit by its reservation ref, once the purchase row is written', async () => {
  const { status, calls, errors } = await runWebhook(completed({ store_credit_kind: 'session', store_credit_cents: '2500', store_credit_ref: 'ref-1' }), {
    rpc: async (name) => (name === 'consume_store_credit' ? { data: 2500, error: null } : { data: null, error: null }),
  });
  assert.equal(status, 200);
  assert.equal(calls.upserts.filter((u) => u.table === 'one_time_purchases').length, 1, 'the purchase row first');
  const consume = calls.rpc.filter((c) => c.name === 'consume_store_credit');
  assert.equal(consume.length, 1);
  assert.deepEqual(consume[0].args, { p_user_id: UID, p_kind: 'session', p_session_id: 'cs_test_1', p_amount_cents: 2500, p_reservation_ref: 'ref-1' });
  assert.deepEqual(errors.filter((e) => e.includes('shortfall')), [], 'a full debit is not a shortfall');
});

test('webhook: a debit smaller than the discount is said out loud', async () => {
  const { errors } = await runWebhook(completed({ store_credit_kind: 'session', store_credit_cents: '2500', store_credit_ref: 'ref-1' }), {
    rpc: async (name) => (name === 'consume_store_credit' ? { data: 1000, error: null } : { data: null, error: null }),
  });
  const shortfall = errors.filter((e) => e.includes('store credit shortfall'));
  assert.equal(shortfall.length, 1);
  assert.match(shortfall[0], /discounted.*2500/);
  assert.match(shortfall[0], /debited.*1000/);
});

test('webhook: a database that still has the 4-argument consume_store_credit is debited through it', async () => {
  const { calls } = await runWebhook(completed({ store_credit_kind: 'session', store_credit_cents: '2500', store_credit_ref: 'ref-1' }), {
    rpc: async (name, args) => {
      if (name !== 'consume_store_credit') return { data: null, error: null };
      if ('p_reservation_ref' in args) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.consume_store_credit(p_amount_cents, p_kind, p_reservation_ref, p_session_id, p_user_id)' } };
      return { data: 2500, error: null };
    },
  });
  const consume = calls.rpc.filter((c) => c.name === 'consume_store_credit');
  assert.equal(consume.length, 2, 'the 5-argument call, then the 4-argument one');
  assert.equal('p_reservation_ref' in consume[1].args, false);
  assert.equal(consume[1].args.p_amount_cents, 2500);
});

test('webhook: a session created before the reservation migration carries no ref and still debits', async () => {
  const { calls } = await runWebhook(completed({ store_credit_kind: 'session', store_credit_cents: '2500' }), {
    rpc: async (name) => (name === 'consume_store_credit' ? { data: 2500, error: null } : { data: null, error: null }),
  });
  const consume = calls.rpc.filter((c) => c.name === 'consume_store_credit');
  assert.equal(consume.length, 1);
  assert.equal(consume[0].args.p_reservation_ref, null);
});

test('webhook: an expired session releases the reservation it named, and one with none releases nothing', async () => {
  const expired = (metadata) => ({ id: 'evt_2', type: 'checkout.session.expired', data: { object: { id: 'cs_test_2', mode: 'payment', metadata } } });
  const a = await runWebhook(expired({ client_id: UID, store_credit_ref: 'ref-2' }), { rpc: async () => ({ data: 2500, error: null }) });
  assert.equal(a.status, 200);
  assert.deepEqual(a.calls.rpc, [{ name: 'release_store_credit_reservation', args: { p_ref: 'ref-2' } }]);
  const b = await runWebhook(expired({ client_id: UID }), { rpc: async () => ({ data: 0, error: null }) });
  assert.deepEqual(b.calls.rpc, []);
});
