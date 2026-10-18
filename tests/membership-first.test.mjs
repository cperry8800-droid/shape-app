// Coaching needs an active Shape membership (owner, 2026-10-14: "need to be an active member to
// access platform"), from the 2026-10-14 client-onboarding review (H3, H5, M7, L10).
//
// Before: /api/stripe/checkout-session never asked whether the buyer was a member, so a signed-in
// non-member could pay a coach and then be refused messages, the plan and the dashboard by the
// membership gate; a member could buy a second $5 membership and a second subscription to the
// same coach; and a signed-in non-member on the website's client dashboard was shown the demo
// member's data with a "Sign in" button. These tests drive the shipping routes against scripted
// clients, with the REAL membership rule (membership-core.ts) deciding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(ROOT, 'package.json'));
const nextServer = require_('next/server');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const UID = '11111111-1111-4111-8111-111111111111';
const ADULT = { role: 'client', roles: ['client'], over_18: true, date_of_birth: '1990-04-02', created_at: '2026-10-01T00:00:00Z' };
const MINOR = { role: 'client', roles: ['client'], over_18: false, date_of_birth: '2014-04-02', created_at: '2026-10-01T00:00:00Z' };
const COACH = { ...ADULT, role: 'trainer', roles: ['trainer'] };
const HOME = '/newdesign/ClientApp.html#today';

delete process.env.NEXT_PUBLIC_SITE_URL;
process.env.STRIPE_PLATFORM_PRICE_ID = 'price_platform_test';

/** A Supabase client whose every chain resolves from `tables`; `fail` names tables whose reads reject. */
function scripted({ tables = {}, fail = [], errors = {} } = {}) {
  const calls = { upserts: [], rpc: [] };
  const from = (table) => {
    const rows = tables[table] ?? [];
    const q = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'order', 'limit', 'gte', 'lte', 'not', 'is']) q[m] = () => q;
    const result = () => (fail.includes(table)
      ? Promise.reject(new Error(`${table} read failed`))
      : Promise.resolve({ data: rows, error: errors[table] ?? null }));
    q.maybeSingle = () => (fail.includes(table) ? Promise.reject(new Error(`${table} read failed`)) : Promise.resolve({ data: rows[0] ?? null, error: errors[table] ?? null }));
    q.upsert = (row, opts) => { calls.upserts.push({ table, row, opts }); return Promise.resolve({ data: null, error: errors[`${table}.upsert`] ?? null }); };
    q.then = (res, rej) => result().then(res, rej);
    return q;
  };
  return { client: { from, rpc: async (name, args) => { calls.rpc.push({ name, args }); return { data: null, error: null }; } }, calls };
}

let base;
async function baseModules() {
  if (base) return base;
  const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
  const returnPath = await loadRealModule(join(ROOT, 'src/lib/return-path.ts'), { typescript: true });
  const membershipCore = await loadRealModule(join(ROOT, 'src/lib/membership-core.ts'), { typescript: true });
  const platformFee = await import(pathToFileURL(join(ROOT, 'src/lib/platform-fee.mjs')).href);
  base = { requestUtils, returnPath, membershipCore, platformFee };
  return base;
}

// The Stripe-side duplicate check, against a scripted Stripe. `stripeSubs` are the
// subscriptions on the account's own customer ('cus_stable', stripe-customer.ts);
// `emailSubs` are on an older per-checkout customer found by the buyer's email ('cus_email');
// `stripeThrows` makes the lookup fail.
async function liveSubscriptionLib({ stripeSubs = [], emailSubs = [], stripeThrows = false, afterCheck = null } = {}) {
  const { membershipCore } = await baseModules();
  const stripe = {
    customers: { list: async ({ email }) => { if (stripeThrows) throw new Error('stripe down'); return { data: email ? [{ id: 'cus_email' }] : [] }; } },
    subscriptions: { list: async ({ customer }) => { if (stripeThrows) throw new Error('stripe down'); return { data: customer === 'cus_stable' ? stripeSubs : customer === 'cus_email' ? emailSubs : [] }; } },
  };
  const lib = await loadRealModule(join(ROOT, 'src/lib/stripe-live-subscription.ts'), {
    typescript: true,
    registry: new Map([['@/lib/stripe', { stripe }], ['@/lib/membership-core', membershipCore]]),
  });
  if (!afterCheck) return lib;
  // `afterCheck` runs once Stripe has answered: something that happens right after the check.
  return { hasLiveStripeSubscription: async (...a) => { const r = await lib.hasLiveStripeSubscription(...a); afterCheck(); return r; } };
}

// The claim table (2026-10-14-checkout-claims.sql) as a Map that every request given it shares,
// with the SQL function's rule: taken when free or older than 60 seconds, released by its token.
// `hold(product)` is another request holding a live claim.
function claimsTable() {
  const claims = new Map();
  const calls = [];
  // Another request holding (or taking over) the claim on `product`.
  const hold = (product, userId = UID) => claims.set(`${userId}|${product}`, { token: 'another-request', at: Date.now() });
  const rpc = async (name, { p_user_id, p_product, p_token }) => {
    calls.push(name);
    const key = `${p_user_id}|${p_product}`;
    if (name === 'claim_checkout') {
      const held = claims.get(key);
      if (held && Date.now() - held.at < 60_000) return { data: null, error: null };
      claims.set(key, { token: p_token, at: Date.now() });
      return { data: true, error: null };
    }
    if (name === 'release_checkout') {
      if (claims.get(key)?.token === p_token) claims.delete(key);
      return { data: null, error: null };
    }
    if (name === 'renew_checkout_claim') {
      const held = claims.get(key);
      if (!held || held.token !== p_token) return { data: null, error: null };
      held.at = Date.now();
      return { data: true, error: null };
    }
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  };
  return { claims, calls, hold, rpc };
}

// The one-checkout-at-a-time barrier (checkout-barrier.ts) against a scripted Stripe and the claim
// table. `open` are the open checkout sessions on the account's own customer, listed newest first;
// the create stubs below add theirs, as Stripe would. `expired` collects what it expires.
async function barrierLib({ open = [], expired = [], table = claimsTable(), rpcError = null, onList = null } = {}) {
  const stripe = { checkout: { sessions: {
    list: async ({ customer, status }) => {
      if (onList) onList();
      return { data: customer === 'cus_stable' && status === 'open' ? [...open].reverse().sort((a, b) => b.created - a.created) : [] };
    },
    expire: async (id) => { expired.push(id); const i = open.findIndex((x) => x.id === id); if (i >= 0) open.splice(i, 1); return { id, status: 'expired' }; },
  } } };
  const admin = { rpc: async (name, args) => (rpcError ? { data: null, error: rpcError } : table.rpc(name, args)) };
  return loadRealModule(join(ROOT, 'src/lib/checkout-barrier.ts'), {
    typescript: true,
    registry: new Map([['@/lib/stripe', { stripe }], ['@/lib/supabase/admin', { createAdminClient: () => admin }]]),
  });
}

// The terms a checkout is reused on: the membership's price, and the coach's (Coach T, $150 at the
// marketplace fee, no referral).
// Where a checkout returns to is a term too, keyed as checkoutReturnsKey keys it (checked below).
const returnsKey = (success, cancel) => createHash('sha256').update(`${success}\n${cancel}`).digest('hex').slice(0, 32);
const memberReturns = (next = HOME, cancel = '/newdesign/Pricing.html?error=subscribe_cancelled') =>
  returnsKey(`https://shape.test/api/stripe/platform-return?session_id={CHECKOUT_SESSION_ID}&next=${encodeURIComponent(next)}`, `https://shape.test${cancel}`);
const MEMBER_TERMS = { client_id: UID, plan: 'shape_platform', price_id: 'price_platform_test', returns: memberReturns() };
const COACH_TERMS = { client_id: UID, provider_id: '4', provider_role: 'trainer', price_cents: '15000', fee_bps: '1500', origin: 'marketplace',
  returns: returnsKey('https://shape.test/purchase/success?session_id={CHECKOUT_SESSION_ID}', 'https://shape.test/newdesign/GetApp.html?checkout=cancelled') };
/** An open checkout `minutesAgo` old. */
const openSession = (id, minutesAgo, metadata, mode = 'subscription') => ({ id, created: Math.floor(Date.now() / 1000) - minutesAgo * 60, url: `https://checkout.stripe.test/${id}`, mode, metadata });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A scripted sessions.create: records the args, takes `delay` ms, and leaves the session open (`onCreated` sees it). */
const createInto = ({ created, open, prefix, delay = 0, error = null, onCreated = null, createdOpts = [] }) => async (args, opts) => {
  if (error) throw error;
  created.push(args);
  createdOpts.push(opts);
  const id = `${prefix}${created.length}`;
  if (delay) await sleep(delay);
  const session = { id, created: Math.floor(Date.now() / 1000), url: `https://checkout.stripe.test/${id}`, mode: args.mode, metadata: args.metadata };
  open.push(session);
  if (onCreated) onCreated(session);
  return session;
};
/** As if the buyer paid `session` at once: it is no longer open, and Stripe holds the subscription. */
const paidAtOnce = (open, stripeSubs) => (session) => {
  open.splice(open.indexOf(session), 1);
  stripeSubs.push(stripeSub({ client_id: UID, ...session.metadata }));
};

async function platformMembership({ retrieve = async () => { throw new Error('unexpected retrieve'); }, admin = scripted(), created = [], createdOpts = [], open = [], expired = [], table = claimsTable(), createDelay = 0, createError = null, barrier = null, stripeSubs = [], onCreated = null, afterCheck = null } = {}) {
  const { returnPath, membershipCore } = await baseModules();
  return loadRealModule(join(ROOT, 'src/lib/platform-membership.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/stripe', { stripe: { checkout: { sessions: { create: createInto({ created, createdOpts, open, prefix: 'cs_test_platform', delay: createDelay, error: createError, onCreated }), retrieve } } } }],
      ['@/lib/stripe-live-subscription', await liveSubscriptionLib({ stripeSubs, afterCheck })],
      ['@/lib/supabase/admin', { createAdminClient: () => admin.client }],
      ['@/lib/membership-core', membershipCore],
      ['@/lib/return-path', returnPath],
      ['@/lib/checkout-barrier', barrier ?? await barrierLib({ open, expired, table })],
    ]),
  });
}

// ── appendParam ─────────────────────────────────────────────────────────────────────────────
test('appendParam puts the parameter in the query, before any fragment, whether or not a query exists', async () => {
  const { appendParam } = await baseModules().then((m) => m.returnPath);
  assert.equal(appendParam('/purchase/success', 'session_id', '{CHECKOUT_SESSION_ID}'), '/purchase/success?session_id={CHECKOUT_SESSION_ID}', 'the placeholder stays literal');
  assert.equal(appendParam('/newdesign/MemberProfile.html?u=abc', 'session_id', 'x'), '/newdesign/MemberProfile.html?u=abc&session_id=x', 'a path that has a query gets &, not a second ?');
  assert.equal(appendParam('/newdesign/ClientApp.html#today', 'member', 'joined'), '/newdesign/ClientApp.html?member=joined#today');
  assert.equal(appendParam('/m/?a=1#x', 'member', 'pending'), '/m/?a=1&member=pending#x');
});

// ── /api/stripe/checkout-session: coaching needs the membership ─────────────────────────────
// `screening`: the buyer's own health_profile document (fix 2b). Completed by default, so each
// test here is about what it names; null is a buyer who has not completed it.
async function coachRoute({ profile = ADULT, platform = [], subscriptions = [], fail = [], errors = {}, stripeSubs = [], emailSubs = [], stripeThrows = false, customerFails = false, open = [], table = claimsTable(), rpcError = null, createDelay = 0, onCreated = null, onList = null, afterCheck = null, screening = { consentAt: '2026-10-01T00:00:00Z' }, atCapacity = false, invite = 'no' } = {}) {
  const { requestUtils, returnPath, membershipCore, platformFee } = await baseModules();
  const created = [];
  const createdOpts = [];
  const expired = [];
  const caller = scripted({ tables: { profiles: profile ? [profile] : [], platform_subscriptions: platform, subscriptions, user_goals: screening ? [{ data: screening }] : [] }, fail, errors });
  const admin = scripted({ tables: { trainers: [{ id: 4, name: 'Coach T', owner_id: '22222222-2222-4222-8222-222222222222', price: 150, session_price: 90, stripe_account_id: 'acct_T', stripe_account_status: 'active', at_capacity: atCapacity, capacity_resume_at: null }] } });
  // The real capacity rule and the real "already their client" read (task #10), over the caller's
  // own subscription rows; the invite is scripted ('yes', 'no', 'error').
  const capacity = await loadRealModule(join(ROOT, 'src/lib/capacity.ts'), { typescript: true });
  const waitlist = await loadRealModule(join(ROOT, 'src/lib/waitlist.ts'), { typescript: true, registry: new Map([['@supabase/supabase-js', { createClient: () => null }], ['@/lib/supabase/server', { createClient: async () => null }], ['@/lib/membership-core', membershipCore]]) });
  const route = await loadRealModule(join(ROOT, 'src/app/api/stripe/checkout-session/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/stripe', { stripe: { checkout: { sessions: { create: createInto({ created, createdOpts, open, prefix: 'cs_test_coach', delay: createDelay, onCreated }) } } } }],
      ['@/lib/supabase/admin', { createAdminClient: () => admin.client }],
      ['@/lib/capacity', capacity],
      ['@/lib/waitlist', {
        resolveRequestClient: async () => ({ user: { id: UID, email: 'm@example.invalid', emailConfirmed: true }, supabase: caller.client }),
        hasActiveWaitlistInvite: async () => { if (invite === 'error') throw new Error('invite lookup failed'); return invite === 'yes'; },
        isActiveClientOf: waitlist.isActiveClientOf,
      }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/platform-fee', platformFee],
      ['@/lib/coach-origin', { resolveCoachCheckoutOrigin: async () => ({ origin: 'marketplace', feeBps: 1500, referralId: null }) }],
      ['@/lib/return-path', returnPath],
      ['@/lib/membership-core', membershipCore],
      ['@/lib/stripe-live-subscription', await liveSubscriptionLib({ stripeSubs, emailSubs, stripeThrows, afterCheck })],
      ['@/lib/stripe-customer', { stripeCustomerFor: async () => { if (customerFails) throw new Error('stripe down'); return 'cus_stable'; } }],
      ['@/lib/checkout-barrier', await barrierLib({ open, expired, table, rpcError, onList })],
      ['@/lib/health-screening', await loadRealModule(join(ROOT, 'src/lib/health-screening.ts'), { typescript: true })],
    ]),
  });
  const post = async (body) => {
    const errLog = console.error; console.error = () => {};
    try {
      const res = await route.POST(new Request('https://shape.test/api/stripe/checkout-session', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? { item: { type: 'Subscription', name: 'Monthly coaching' }, coach: { provider_id: 4, provider_role: 'trainer' } }),
      }));
      return { status: res.status, body: await res.json(), created, createdOpts, expired, table };
    } finally { console.error = errLog; }
  };
  return { post, created, expired, table };
}

async function runCoachCheckout({ body, ...opts } = {}) {
  return (await coachRoute(opts)).post(body);
}

test('coach checkout: a signed-in account without the membership is refused with the gate\'s own code, and no payment starts', async () => {
  const r = await runCoachCheckout({ platform: [] });
  assert.equal(r.status, 402);
  assert.equal(r.body.code, 'membership_required', 'the code the website and the app branch on');
  assert.equal(r.created.length, 0, 'Stripe was never asked');
  const cancelled = await runCoachCheckout({ platform: [{ status: 'canceled' }] });
  assert.equal(cancelled.status, 402, 'a cancelled membership is not a membership');
});

test('coach checkout: a member pays; an approved coach is a member by role', async () => {
  const member = await runCoachCheckout({ platform: [{ status: 'active' }] });
  assert.equal(member.status, 200);
  assert.equal(member.created.length, 1);
  assert.equal(member.created[0].mode, 'subscription');
  const coach = await runCoachCheckout({ profile: COACH, platform: [] });
  assert.equal(coach.status, 200);
});

test('coach checkout: a proven minor is refused, and a membership read that fails starts nothing', async () => {
  const minor = await runCoachCheckout({ profile: MINOR, platform: [{ status: 'active' }] });
  assert.equal(minor.status, 403);
  assert.equal(minor.body.code, 'age_restricted');
  const fault = await runCoachCheckout({ fail: ['profiles'] });
  assert.equal(fault.status, 503, 'fail closed: no money moves on an answer we could not read');
  assert.equal(fault.created.length, 0);
});

// ── Task #10: at capacity means no new clients, not no sales ─────────────────────────────────
// Owner, 2026-10-15: at capacity "basically makes it so they cant add new clients, but clients can
// still be added to waitlist".
test('coach checkout at capacity: a new client is refused, an invited one pays, and a current client still buys sessions', async () => {
  const member = { platform: [{ status: 'active' }], atCapacity: true };
  const session = { item: { type: 'booking', name: 'Session' }, coach: { provider_id: 4, provider_role: 'trainer' } };
  // Someone who is not yet a client: refused with the flag the pages read, for a subscription and a session alike.
  const sub = await runCoachCheckout(member);
  assert.equal(sub.status, 409);
  assert.equal(sub.body.reason, 'at_capacity');
  const buy = await runCoachCheckout({ ...member, body: session });
  assert.equal(buy.status, 409);
  assert.equal(buy.body.reason, 'at_capacity');
  assert.equal(sub.created.length + buy.created.length, 0);
  // Invited off the waiting list: their spot is held.
  const invited = await runCoachCheckout({ ...member, invite: 'yes' });
  assert.equal(invited.status, 200, JSON.stringify(invited.body));
  // A current client buys a session from their own coach while the coach is full.
  const client = await runCoachCheckout({ ...member, subscriptions: [{ id: 's1', status: 'active' }], body: session });
  assert.equal(client.status, 200, JSON.stringify(client.body));
  assert.equal(client.created[0].mode, 'payment');
  // A failed invite read is never a yes.
  const unread = await runCoachCheckout({ ...member, invite: 'error' });
  assert.equal(unread.status, 503);
  // A client's read that fails refuses too (isActiveClientOf throws).
  const clientUnread = await runCoachCheckout({ ...member, body: session, errors: { subscriptions: { code: 'XX000', message: 'down' } } });
  assert.equal(clientUnread.status, 503);
  // Not at capacity: neither is asked.
  const open = await runCoachCheckout({ platform: [{ status: 'active' }] });
  assert.equal(open.status, 200);
});

// ── Fix 2b: hiring a coach needs the health screening ───────────────────────────────────────
test('coach checkout: hiring a coach without the health screening is refused with its own code, and no payment starts', async () => {
  const sub = await runCoachCheckout({ platform: [{ status: 'active' }], screening: null });
  assert.equal(sub.status, 409);
  assert.equal(sub.body.code, 'screening_required', 'the code the website and the app branch on');
  assert.equal(sub.created.length, 0, 'Stripe was never asked');
  const booking = await runCoachCheckout({ platform: [{ status: 'active' }], screening: null, body: { item: { type: 'booking', name: 'Session' }, coach: { provider_id: 4, provider_role: 'trainer' } } });
  assert.equal(booking.body.code, 'screening_required', 'a session with a trainer hires a coach too');
  const unsigned = await runCoachCheckout({ platform: [{ status: 'active' }], screening: { parq: [false, false, false, false, false, false, false] } });
  assert.equal(unsigned.body.code, 'screening_required', 'answers without the confirmation are not a completed screening');
  const plan = await runCoachCheckout({ platform: [{ status: 'active' }], screening: null, body: { item: { type: 'plan', name: 'Program', planId: '33333333-3333-4333-8333-333333333333' }, coach: { provider_id: 4, provider_role: 'trainer' } } });
  assert.notEqual(plan.body.code, 'screening_required', 'a program is a product, not a hire');
  const screened = await runCoachCheckout({ platform: [{ status: 'active' }] });
  assert.equal(screened.status, 200);
  const nonMember = await runCoachCheckout({ platform: [], screening: null });
  assert.equal(nonMember.body.code, 'membership_required', 'the membership is asked first: it is the first thing they need');
  const unread = await runCoachCheckout({ platform: [{ status: 'active' }], fail: ['user_goals'] });
  assert.equal(unread.status, 503, 'a screening we could not read starts nothing');
  assert.equal(unread.created.length, 0);
  const errored = await runCoachCheckout({ platform: [{ status: 'active' }], errors: { user_goals: { code: 'XX000', message: 'connection reset' } } });
  assert.equal(errored.status, 503, 'nor one that came back with an error');
});

test('coach checkout: a second live subscription to the same coach is refused; a cancelled one is not in the way', async () => {
  for (const status of ['active', 'trialing', 'past_due']) {
    const r = await runCoachCheckout({ platform: [{ status: 'active' }], subscriptions: [{ status }] });
    assert.equal(r.status, 409, status);
    assert.equal(r.body.reason, 'already_subscribed', status);
    assert.equal(r.created.length, 0, status);
  }
  const again = await runCoachCheckout({ platform: [{ status: 'active' }], subscriptions: [{ status: 'canceled' }] });
  assert.equal(again.status, 200, 'resubscribing after a cancellation works');
  const unreadable = await runCoachCheckout({ platform: [{ status: 'active' }], errors: { subscriptions: { code: 'XX000', message: 'boom' } } });
  assert.equal(unreadable.status, 503, 'a failed lookup refuses rather than risking a double charge');
  const booking = await runCoachCheckout({ platform: [{ status: 'active' }], subscriptions: [{ status: 'active' }], body: { item: { type: 'booking', name: 'Session' }, coach: { provider_id: 4, provider_role: 'trainer' } } });
  assert.equal(booking.status, 200, 'a subscriber can still book a single session');
});

test('coach checkout: the success URL keeps the return page\'s own query', async () => {
  const plain = await runCoachCheckout({ platform: [{ status: 'active' }] });
  assert.equal(plain.created[0].success_url, 'https://shape.test/purchase/success?session_id={CHECKOUT_SESSION_ID}');
  const withQuery = await runCoachCheckout({ platform: [{ status: 'active' }], body: { item: { type: 'Subscription' }, coach: { provider_id: 4, provider_role: 'trainer' }, successPath: '/newdesign/MemberProfile.html?u=abc' } });
  assert.equal(withQuery.created[0].success_url, 'https://shape.test/newdesign/MemberProfile.html?u=abc&session_id={CHECKOUT_SESSION_ID}');
});

// ── /api/stripe/platform-checkout: one membership, and back to where they started ───────────
async function runPlatformCheckout({ signedIn = true, profile = ADULT, platform = [], fail = [], errors = {}, body = {}, stripeSubs = [], email = 'm@example.invalid', open = [], table = claimsTable(), rpcError = null, onList = null } = {}) {
  const { requestUtils, returnPath, membershipCore } = await baseModules();
  const created = [];
  const createdOpts = [];
  const expired = [];
  const barrier = await barrierLib({ open, expired, table, rpcError, onList });
  const caller = scripted({ tables: { profiles: profile ? [profile] : [], platform_subscriptions: platform }, fail, errors });
  const pm = await platformMembership({ created, createdOpts, open, barrier, stripeSubs });
  const route = await loadRealModule(join(ROOT, 'src/app/api/stripe/platform-checkout/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/server', { createClient: async () => scripted().client }],
      ['@/lib/request-auth', { currentUser: async () => (signedIn ? { id: UID, email, email_confirmed_at: '2026-10-01T00:00:00Z' } : null), clientForRequest: async () => caller.client }],
      ['@/lib/membership-core', membershipCore],
      ['@/lib/platform-membership', pm],
      ['@/lib/return-path', returnPath],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/stripe-live-subscription', await liveSubscriptionLib({ stripeSubs })],
      ['@/lib/stripe-customer', { stripeCustomerFor: async () => 'cus_stable' }],
      ['@/lib/checkout-barrier', barrier],
    ]),
  });
  const errLog = console.error; console.error = () => {};
  try {
    const res = await route.POST(new Request('https://shape.test/api/stripe/platform-checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json(), created, createdOpts, expired, table };
  } finally { console.error = errLog; }
}

const returnUrl = (next) => `https://shape.test/api/stripe/platform-return?session_id={CHECKOUT_SESSION_ID}&next=${encodeURIComponent(next)}`;

test('membership checkout: a member cannot buy a second membership, and neither can a coach', async () => {
  const member = await runPlatformCheckout({ platform: [{ status: 'active' }] });
  assert.equal(member.status, 409);
  assert.equal(member.body.code, 'already_member');
  assert.equal(member.created.length, 0);
  const coach = await runPlatformCheckout({ profile: COACH });
  assert.equal(coach.status, 409);
  assert.equal((await runPlatformCheckout({ signedIn: false })).status, 401);
  const fault = await runPlatformCheckout({ fail: ['platform_subscriptions'] });
  assert.equal(fault.status, 503, 'fail closed');
  assert.equal(fault.created.length, 0);
});

test('membership checkout: Stripe returns through the confirmation step, then to the page that asked', async () => {
  const r = await runPlatformCheckout({ body: { returnTo: '/newdesign/MemberProfile.html?u=abc' } });
  assert.equal(r.status, 200);
  const s = r.created[0];
  assert.equal(s.mode, 'subscription');
  assert.equal(s.metadata.plan, 'shape_platform');
  assert.equal(s.metadata.client_id, UID);
  assert.equal(s.success_url, returnUrl('/newdesign/MemberProfile.html?u=abc'));
  assert.equal((await runPlatformCheckout()).created[0].success_url, returnUrl(HOME), 'the dashboard when nothing asked');
  assert.equal((await runPlatformCheckout({ body: { successPath: '/m/' } })).created[0].success_url, returnUrl('/m/'), 'installed app builds still send successPath');
  assert.equal((await runPlatformCheckout({ body: { returnTo: '//evil.example/x' } })).created[0].success_url, returnUrl(HOME), 'L10: never another site');
  assert.equal((await runPlatformCheckout({ body: { cancelPath: 'https://evil.example' } })).created[0].cancel_url, 'https://shape.test/newdesign/Pricing.html?error=subscribe_cancelled');
});

// ── /api/stripe/platform-return: confirm, write the row, continue ───────────────────────────
async function runReturn(query, { session, retrieveThrows = false, upsertError = null } = {}) {
  const { returnPath } = await baseModules();
  const admin = scripted({ errors: upsertError ? { 'platform_subscriptions.upsert': upsertError } : {} });
  const retrieved = [];
  const pm = await platformMembership({ admin, retrieve: async (id, opts) => { retrieved.push({ id, opts }); if (retrieveThrows) throw new Error('stripe down'); return session; } });
  const route = await loadRealModule(join(ROOT, 'src/app/api/stripe/platform-return/route.ts'), {
    typescript: true,
    registry: new Map([['next/server', nextServer], ['@/lib/platform-membership', pm], ['@/lib/return-path', returnPath]]),
  });
  const errLog = console.error; console.error = () => {};
  try {
    const res = await route.GET(new Request(`https://shape.test/api/stripe/platform-return?${query}`));
    return { status: res.status, location: res.headers.get('location'), upserts: admin.calls.upserts, retrieved };
  } finally { console.error = errLog; }
}
const liveSession = (over = {}) => ({
  id: 'cs_test_platform1', status: 'complete', metadata: { plan: 'shape_platform', client_id: UID }, client_reference_id: UID,
  customer: 'cus_1', amount_total: 500,
  subscription: { id: 'sub_1', status: 'active', items: { data: [{ current_period_end: 1793000000 }] } },
  ...over,
});
const next = encodeURIComponent('/newdesign/MemberProfile.html?u=abc');

test('membership return: a live subscription writes the member\'s row before they are sent on, so the next click finds a member', async () => {
  const r = await runReturn(`session_id=cs_test_platform1&next=${next}`, { session: liveSession() });
  assert.equal(r.status, 303);
  assert.equal(r.location, 'https://shape.test/newdesign/MemberProfile.html?u=abc&member=joined');
  assert.deepEqual(r.retrieved[0], { id: 'cs_test_platform1', opts: { expand: ['subscription'] } });
  assert.equal(r.upserts.length, 1);
  const { table, row, opts } = r.upserts[0];
  assert.equal(table, 'platform_subscriptions');
  assert.deepEqual(opts, { onConflict: 'stripe_subscription_id' }, 'the webhook\'s key, so its write and this one are one row');
  assert.equal(row.client_id, UID);
  assert.equal(row.stripe_subscription_id, 'sub_1');
  assert.equal(row.status, 'active', 'Stripe\'s status, not an assumed one');
  assert.equal(row.price_cents, 500);
  assert.equal(row.current_period_end, new Date(1793000000 * 1000).toISOString());
});

test('membership return: anything short of a live membership writes nothing and says pending', async () => {
  const cases = [
    ['an open session', { session: liveSession({ status: 'open' }) }],
    ['another product', { session: liveSession({ metadata: { plan: 'coach', client_id: UID } }) }],
    ['an incomplete subscription', { session: liveSession({ subscription: { id: 'sub_1', status: 'incomplete', items: { data: [] } } }) }],
    ['Stripe unreachable', { session: liveSession(), retrieveThrows: true }],
    ['the write failing', { session: liveSession(), upsertError: { message: 'boom' } }],
  ];
  for (const [name, opts] of cases) {
    const r = await runReturn(`session_id=cs_test_platform1&next=${next}`, opts);
    assert.equal(r.location, 'https://shape.test/newdesign/MemberProfile.html?u=abc&member=pending', name);
    if (name !== 'the write failing') assert.equal(r.upserts.length, 0, name);
  }
  const bad = await runReturn(`session_id=not-a-session&next=${next}`, { session: liveSession() });
  assert.equal(bad.retrieved.length, 0, 'a malformed id is never sent to Stripe');
  assert.match(bad.location, /member=pending$/);
});

test('membership return: `next` stays on this site, and the fragment stays last', async () => {
  const evil = await runReturn(`session_id=cs_test_platform1&next=${encodeURIComponent('//evil.example')}`, { session: liveSession() });
  assert.equal(evil.location, 'https://shape.test/newdesign/ClientApp.html?member=joined#today');
});

// ── /api/me/membership ──────────────────────────────────────────────────────────────────────
async function runMe({ user = { id: UID, email: 'm@example.invalid', email_confirmed_at: 'x' }, profile = ADULT, platform = [], fail = [], errors = {} } = {}) {
  const { membershipCore } = await baseModules();
  const caller = scripted({ tables: { profiles: profile ? [profile] : [], platform_subscriptions: platform }, fail, errors });
  const route = await loadRealModule(join(ROOT, 'src/app/api/me/membership/route.ts'), {
    typescript: true,
    registry: new Map([['next/server', nextServer], ['@/lib/request-auth', { currentUser: async () => user, clientForRequest: async () => caller.client }], ['@/lib/membership-core', membershipCore]]),
  });
  const errLog = console.error; console.error = () => {};
  try {
    const res = await route.GET(new Request('https://shape.test/api/me/membership'));
    return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
  } finally { console.error = errLog; }
}

test('me/membership answers the gate\'s question: signed out, a member, a non-member, a coach, or unknown', async () => {
  assert.deepEqual((await runMe({ user: null })).body, { signedIn: false });
  const member = await runMe({ platform: [{ status: 'active' }] });
  assert.equal(member.body.member, true);
  assert.equal(member.cache, 'no-store', 'per-account, never cached');
  assert.equal((await runMe()).body.member, false);
  const coach = await runMe({ profile: COACH });
  assert.equal(coach.body.member, true);
  assert.equal(coach.body.coach, true);
  const unknown = await runMe({ fail: ['profiles'] });
  assert.equal(unknown.status, 503, 'a lookup that failed is not a non-member');
});

// ── Codex on #2353: the webhook lags, and Supabase reports a failure as a value ──────────────
const PG_FAIL = { code: 'XX000', message: 'connection reset' };
const stripeSub = (metadata, status = 'active') => ({ id: 'sub_x', status, metadata });

test('coach checkout: a subscription Stripe already holds blocks a second one, before our row exists', async () => {
  const paid = await runCoachCheckout({ platform: [{ status: 'active' }], subscriptions: [], stripeSubs: [stripeSub({ client_id: UID, provider_id: '4', provider_role: 'trainer' })] });
  assert.equal(paid.status, 409, 'paid seconds ago, webhook not in yet: still one subscription');
  assert.equal(paid.body.reason, 'already_subscribed');
  assert.equal(paid.created.length, 0);
  const other = await runCoachCheckout({ platform: [{ status: 'active' }], stripeSubs: [stripeSub({ client_id: UID, provider_id: '9', provider_role: 'trainer' })] });
  assert.equal(other.status, 200, 'a subscription to another coach is not in the way');
  const ended = await runCoachCheckout({ platform: [{ status: 'active' }], stripeSubs: [stripeSub({ client_id: UID, provider_id: '4', provider_role: 'trainer' }, 'canceled')] });
  assert.equal(ended.status, 200, 'nor is a cancelled one');
  const down = await runCoachCheckout({ platform: [{ status: 'active' }], stripeThrows: true });
  assert.equal(down.status, 503, 'Stripe unreadable: refuse rather than risk a second charge');
  assert.equal(down.created.length, 0);
  const older = await runCoachCheckout({ platform: [{ status: 'active' }], emailSubs: [stripeSub({ client_id: UID, provider_id: '4', provider_role: 'trainer' })] });
  assert.equal(older.status, 409, 'a subscription on an older per-checkout customer, found by email, counts too');
  const noCustomer = await runCoachCheckout({ platform: [{ status: 'active' }], customerFails: true });
  assert.equal(noCustomer.status, 503);
  assert.equal(noCustomer.created.length, 0);
});

test('every checkout lands on the account\'s own Stripe customer', async () => {
  const coach = await runCoachCheckout({ platform: [{ status: 'active' }] });
  assert.equal(coach.created[0].customer, 'cus_stable');
  assert.equal(coach.created[0].customer_email, undefined, 'no new customer per checkout');
  const member = await runPlatformCheckout();
  assert.equal(member.created[0].customer, 'cus_stable');
  assert.equal(member.created[0].customer_email, undefined);
});

test('a phone sign-up (no email) is still checked at Stripe, through its own customer', async () => {
  const lib = await liveSubscriptionLib({ stripeSubs: [stripeSub({ client_id: UID, plan: 'shape_platform' })] });
  assert.equal(await lib.hasLiveStripeSubscription({ customerId: 'cus_stable', email: null }, { client_id: UID, plan: 'shape_platform' }), true);
  assert.equal(await lib.hasLiveStripeSubscription({ customerId: null, email: null }, { client_id: UID, plan: 'shape_platform' }), false, 'nothing to look up');
  const r = await runPlatformCheckout({ email: null, stripeSubs: [stripeSub({ client_id: UID, plan: 'shape_platform' })] });
  assert.equal(r.status, 409, 'paid a moment ago, no email on the account: still one membership');
});

// ── Codex on #2353, rounds 3 and 4: two presses opened two payable checkouts ───────────────
test('checkout barrier: one claim per account and product, released by its holder; an unreadable claim refuses', async () => {
  const table = claimsTable();
  const lib = await barrierLib({ table });
  const claim = await lib.claimCheckout(UID, 'shape_platform');
  assert.ok(table.claims.has(`${UID}|shape_platform`));
  await (await lib.claimCheckout(UID, 'coach-trainer-4')).release();
  await (await lib.claimCheckout('22222222-2222-4222-8222-222222222222', 'shape_platform')).release();
  await claim.release();
  assert.equal(table.claims.size, 0, 'released, and only by its holder');
  await (await lib.claimCheckout(UID, 'shape_platform')).release();
  const down = await barrierLib({ rpcError: { message: 'connection reset' } });
  await assert.rejects(down.claimCheckout(UID, 'shape_platform'), { message: 'connection reset' }, 'no claim, no checkout');
  assert.equal(lib.isCheckoutInProgress(new lib.CheckoutInProgressError()), true);
  assert.equal(lib.isCheckoutInProgress(Object.assign(new Error('x'), { code: 'checkout_in_progress' })), true, 'by its code, whichever bundle threw it');
  assert.equal(lib.isCheckoutInProgress(new Error('card declined')), false);
});

test('checkout barrier: the newest open checkout for the product is handed back while fresh; every other is expired; other products are left alone', async () => {
  const expired = [];
  const open = [
    openSession('cs_member_old', 30, { plan: 'shape_platform' }),
    openSession('cs_coach_old', 30, { provider_id: '4', provider_role: 'trainer' }),
    openSession('cs_member_earlier', 5, { plan: 'shape_platform' }),
    openSession('cs_member_now', 2, { plan: 'shape_platform' }),
    openSession('cs_coach_now', 1, { provider_id: '4', provider_role: 'trainer' }),
  ];
  const lib = await barrierLib({ open, expired });
  const member = (x) => x.metadata?.plan === 'shape_platform';
  const any = () => true;
  assert.equal(await lib.currentCheckout('cus_stable', member, any), 'https://checkout.stripe.test/cs_member_now');
  assert.deepEqual(expired.sort(), ['cs_member_earlier', 'cs_member_old'], 'one payable membership checkout is left; the coach ones are another product');
  assert.equal(await lib.currentCheckout('cus_other', member, any), null, 'another customer\'s checkouts are not this account\'s');
  const staleOnly = await barrierLib({ open: [openSession('cs_member_old', 11, { plan: 'shape_platform' })], expired: [] });
  assert.equal(await staleOnly.currentCheckout('cus_stable', member, any), null, 'ten minutes on, a new checkout is made');
  const changed = [];
  const termsLib = await barrierLib({ open: [openSession('cs_member_old_price', 1, { plan: 'shape_platform', price_id: 'price_old' })], expired: changed });
  assert.equal(await termsLib.currentCheckout('cus_stable', member, (x) => x.metadata?.price_id === 'price_new'), null, 'on other terms: not handed back');
  assert.deepEqual(changed, ['cs_member_old_price'], 'and expired, so its old terms can no longer be paid');
});

test('two Join presses at once make one checkout, and both are handed it', async () => {
  const created = [];
  const table = claimsTable();
  const pm = await platformMembership({ created, table, createDelay: 50 });
  const start = () => pm.createPlatformCheckout({ priceId: 'price_platform_test', userId: UID, customerId: 'cus_stable', email: 'm@example.invalid', origin: 'https://shape.test', next: HOME, cancelPath: '/newdesign/Pricing.html' });
  const [a, b] = await Promise.all([start(), start()]);
  assert.equal(created.length, 1, 'Codex on #2353: the second waited for the first, then found its checkout');
  assert.deepEqual(a, { alreadyMember: false, url: 'https://checkout.stripe.test/cs_test_platform1' });
  assert.deepEqual(b, a);
  assert.equal(table.claims.size, 0, 'both released');
  const failing = claimsTable();
  const broken = await platformMembership({ table: failing, createError: new Error('stripe down') });
  await assert.rejects(broken.createPlatformCheckout({ priceId: 'p', userId: UID, customerId: 'cus_stable', email: null, origin: 'https://shape.test', next: HOME, cancelPath: '/' }), /stripe down/);
  assert.equal(failing.claims.size, 0, 'a failed create releases the claim, so the next press is not held up');
});

test('two Subscribe presses at once make one checkout for the coach, and both are handed it', async () => {
  const coach = await coachRoute({ platform: [{ status: 'active' }], createDelay: 50 });
  const [a, b] = await Promise.all([coach.post(), coach.post()]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(coach.created.length, 1);
  assert.equal(b.body.url, a.body.url);
  assert.equal(coach.table.claims.size, 0);
});

test('a press that waited while the first checkout was paid is refused, not sold a second subscription', async () => {
  // Codex on #2353: the claim serialised creation but the "already paying?" check ran before it.
  // Here the first checkout is paid the moment it is made, while the second request waits.
  const open = [];
  const subs = [];
  const created = [];
  const pm = await platformMembership({ created, open, stripeSubs: subs, createDelay: 50, onCreated: paidAtOnce(open, subs) });
  const start = () => pm.createPlatformCheckout({ priceId: 'price_platform_test', userId: UID, customerId: 'cus_stable', email: null, origin: 'https://shape.test', next: HOME, cancelPath: '/' });
  const [a, b] = await Promise.all([start(), start()]);
  assert.equal(a.alreadyMember, false);
  assert.deepEqual(b, { alreadyMember: true }, 'asked again under the claim: one membership');
  assert.equal(created.length, 1);

  const coachOpen = [];
  const coachSubs = [];
  const coach = await coachRoute({ platform: [{ status: 'active' }], open: coachOpen, stripeSubs: coachSubs, createDelay: 50, onCreated: paidAtOnce(coachOpen, coachSubs) });
  const [x, y] = await Promise.all([coach.post(), coach.post()]);
  assert.equal(x.status, 200);
  assert.equal(y.status, 409);
  assert.equal(y.body.reason, 'already_subscribed');
  assert.equal(coach.created.length, 1, 'one subscription to the coach');
});

test('a request that lost its claim while working creates nothing; the create is bounded inside the claim', async () => {
  // Codex on #2353: past 60 seconds another request may take the claim over. Right before the
  // create the claim is renewed, and a request that no longer holds it stops.
  const table = claimsTable();
  const lib = await barrierLib({ table });
  const claim = await lib.claimCheckout(UID, 'shape_platform');
  const at = table.claims.get(`${UID}|shape_platform`).at;
  await sleep(5);
  await claim.confirm();
  assert.ok(table.claims.get(`${UID}|shape_platform`).at > at, 'confirm renews the claim');
  table.hold('shape_platform');
  await assert.rejects(claim.confirm(), (e) => lib.isCheckoutInProgress(e), 'taken over: this request stops');
  await claim.release();
  assert.equal(table.claims.get(`${UID}|shape_platform`).token, 'another-request', 'and never releases the new holder\'s claim');

  const memberTable = claimsTable();
  const member = await runPlatformCheckout({ table: memberTable, onList: () => memberTable.hold('shape_platform') });
  assert.equal(member.status, 409);
  assert.equal(member.body.code, 'checkout_in_progress');
  assert.equal(member.created.length, 0);
  const coachTable = claimsTable();
  const coach = await runCoachCheckout({ platform: [{ status: 'active' }], table: coachTable, onList: () => coachTable.hold('coach-trainer-4') });
  assert.equal(coach.status, 409);
  assert.equal(coach.body.reason, 'checkout_in_progress');
  assert.equal(coach.created.length, 0);

  const bounded = { timeout: 20_000, maxNetworkRetries: 0 };
  assert.deepEqual(lib.CHECKOUT_CREATE_OPTIONS, bounded);
  assert.ok(bounded.timeout < 60_000 / 2, 'well inside the claim\'s 60 seconds');
  assert.deepEqual((await runPlatformCheckout()).createdOpts[0], bounded);
  assert.deepEqual((await runCoachCheckout({ platform: [{ status: 'active' }] })).createdOpts[0], bounded);
  const oneTime = await runCoachCheckout({ platform: [{ status: 'active' }], body: { item: { type: 'booking', name: 'Session' }, coach: { provider_id: 4, provider_role: 'trainer' } } });
  assert.equal(oneTime.createdOpts[0], undefined, 'a one-time purchase is not held to the claim');
  assert.match(read('supabase-migrations/2026-10-14-checkout-claims.sql'), /where c\.claimed_at < now\(\) - interval '60 seconds'/, 'the 60 seconds these numbers are measured against');
});

test('an open checkout on other terms is replaced, not handed back', async () => {
  // Codex on #2353: a coach's changed rate, or a buyer who opened a marketplace checkout and then
  // followed the coach's own referral (no Shape fee), was handed the old checkout and its terms.
  const repriced = await runCoachCheckout({ platform: [{ status: 'active' }], open: [openSession('cs_coach_old_rate', 1, { ...COACH_TERMS, price_cents: '9900' })] });
  assert.deepEqual(repriced.expired, ['cs_coach_old_rate']);
  assert.equal(repriced.created.length, 1);
  assert.equal(repriced.body.url, 'https://checkout.stripe.test/cs_test_coach1');
  const referred = await runCoachCheckout({ platform: [{ status: 'active' }], open: [openSession('cs_coach_referred', 1, { ...COACH_TERMS, origin: 'byo', fee_bps: '0', referral_id: 'ref-1' })] });
  assert.deepEqual(referred.expired, ['cs_coach_referred']);
  assert.equal(referred.created.length, 1);
  // Each term on its own: the same price and fee, another referral, origin or return.
  for (const terms of [{ referral_id: 'ref-1' }, { origin: 'byo' }, { returns: returnsKey('https://shape.test/m/', 'https://shape.test/m/') }]) {
    const r = await runCoachCheckout({ platform: [{ status: 'active' }], open: [openSession('cs_coach_other', 1, { ...COACH_TERMS, ...terms })] });
    assert.deepEqual(r.expired, ['cs_coach_other'], JSON.stringify(terms));
  }
  const membership = await runPlatformCheckout({ open: [openSession('cs_member_old_price', 1, { ...MEMBER_TERMS, price_id: 'price_old' })] });
  assert.deepEqual(membership.expired, ['cs_member_old_price']);
  assert.equal(membership.created[0].metadata.price_id, 'price_platform_test', 'the price rides on the checkout, to be matched next time');
});

test('a checkout completed in another tab while the open checkouts are read is caught before anything is handed out', async () => {
  // Codex on #2353: asked before the open checkouts were read, Stripe could say "not paying", the
  // buyer could then complete the open checkout in another tab, and the list would show nothing
  // open, so a second one was made. Stripe is asked after the read now.
  const open = [openSession('cs_member_tab', 2, { ...MEMBER_TERMS, returns: memberReturns(HOME, '/') })];
  const subs = [];
  const completeInOtherTab = () => { open.splice(0, open.length); subs.push(stripeSub({ client_id: UID, plan: 'shape_platform' })); };
  const created = [];
  // Completed the moment the open checkouts have been read.
  const pm = await platformMembership({ created, open, stripeSubs: subs, barrier: await barrierLib({ open, onList: () => setTimeout(completeInOtherTab, 0) }) });
  const r = await pm.createPlatformCheckout({ priceId: 'price_platform_test', userId: UID, customerId: 'cus_stable', email: null, origin: 'https://shape.test', next: HOME, cancelPath: '/' });
  assert.equal(created.length, 0);
  // Either answer is safe: the checkout just paid, or "already a member". Never a new one.
  assert.ok(r.alreadyMember || r.url === 'https://checkout.stripe.test/cs_member_tab');
  // Completed right after Stripe was asked, before anything is handed out: the list was read
  // first, so the paid checkout is the one handed back (Stripe shows it as paid), not a new one.
  const open2 = [openSession('cs_member_tab2', 2, { ...MEMBER_TERMS, returns: memberReturns(HOME, '/') })];
  const subs2 = [];
  const created2 = [];
  const pm2 = await platformMembership({ created: created2, open: open2, stripeSubs: subs2, afterCheck: () => { open2.splice(0, open2.length); subs2.push(stripeSub({ client_id: UID, plan: 'shape_platform' })); } });
  const r2 = await pm2.createPlatformCheckout({ priceId: 'price_platform_test', userId: UID, customerId: 'cus_stable', email: null, origin: 'https://shape.test', next: HOME, cancelPath: '/' });
  assert.equal(created2.length, 0, 'no second checkout');
  assert.deepEqual(r2, { alreadyMember: false, url: 'https://checkout.stripe.test/cs_member_tab2' });

  const coachOpen = [openSession('cs_coach_tab', 1, COACH_TERMS)];
  const coachSubs = [];
  const coach = await coachRoute({ platform: [{ status: 'active' }], open: coachOpen, stripeSubs: coachSubs, afterCheck: () => { coachOpen.splice(0, coachOpen.length); coachSubs.push(stripeSub(COACH_TERMS)); } });
  const c = await coach.post();
  assert.equal(coach.created.length, 0, 'the coach path reads the open checkouts first too');
  assert.equal(c.body.url, 'https://checkout.stripe.test/cs_coach_tab');
});

test('membership checkout: a second press reopens the checkout already open; a stale one is replaced', async () => {
  const profile = '/newdesign/MemberProfile.html?u=abc';
  const again = await runPlatformCheckout({ body: { returnTo: profile }, open: [openSession('cs_member_now', 2, { ...MEMBER_TERMS, returns: memberReturns(profile) })] });
  assert.equal(again.status, 200);
  assert.equal(again.body.url, 'https://checkout.stripe.test/cs_member_now', 'the same checkout, not a second payable one');
  assert.equal(again.created.length, 0);
  // Codex on #2353: a checkout opened in the app returns to its close page, so the website's
  // coach profile gets its own, and the app's is expired.
  const fromApp = await runPlatformCheckout({ body: { returnTo: profile }, open: [openSession('cs_member_app', 2, { ...MEMBER_TERMS, returns: memberReturns('/membership/done', '/membership/done') })] });
  assert.deepEqual(fromApp.expired, ['cs_member_app']);
  assert.equal(fromApp.created.length, 1);
  assert.equal(fromApp.created[0].metadata.returns, memberReturns(profile), 'where it returns rides on the checkout, to be matched next time');
  const lib = await barrierLib();
  assert.equal(lib.checkoutReturnsKey('a', 'b'), returnsKey('a', 'b'), 'the tests key returns as the barrier does');
  assert.notEqual(lib.checkoutReturnsKey('a', 'b'), lib.checkoutReturnsKey('a', 'c'));
  const stale = await runPlatformCheckout({ open: [openSession('cs_member_old', 30, MEMBER_TERMS)] });
  assert.deepEqual(stale.expired, ['cs_member_old']);
  assert.equal(stale.created.length, 1, 'then a fresh one');
  const down = await runPlatformCheckout({ rpcError: { message: 'connection reset' } });
  assert.equal(down.status, 500);
  assert.equal(down.created.length, 0, 'no claim, no checkout');
});

test('coach checkout: a second press reopens the checkout already open for this coach; one-time purchases are not held to it', async () => {
  const again = await runCoachCheckout({ platform: [{ status: 'active' }], open: [openSession('cs_coach_now', 1, COACH_TERMS)] });
  assert.equal(again.status, 200);
  assert.equal(again.body.url, 'https://checkout.stripe.test/cs_coach_now');
  assert.equal(again.created.length, 0);
  const otherCoach = await runCoachCheckout({ platform: [{ status: 'active' }], open: [openSession('cs_coach9_now', 1, { client_id: UID, provider_id: '9', provider_role: 'trainer' })] });
  assert.equal(otherCoach.created.length, 1, 'a checkout for another coach is not this one');
  const stale = await runCoachCheckout({ platform: [{ status: 'active' }], open: [openSession('cs_coach_old', 30, COACH_TERMS)] });
  assert.deepEqual(stale.expired, ['cs_coach_old']);
  assert.equal(stale.created.length, 1);
  const oneTime = await runCoachCheckout({ platform: [{ status: 'active' }], body: { item: { type: 'booking', name: 'Session' }, coach: { provider_id: 4, provider_role: 'trainer' } }, open: [openSession('cs_coach_now', 1, { client_id: UID, provider_id: '4', provider_role: 'trainer' })] });
  assert.equal(oneTime.created.length, 1);
  assert.deepEqual(oneTime.table.calls, [], 'no claim taken');
});

test('a claim another request keeps holding is waited for, then refused as checkout_in_progress, in every caller', async () => {
  const heldTable = (product) => { const t = claimsTable(); t.hold(product); return t; };
  const lib = await barrierLib({ table: heldTable('shape_platform') });
  const [direct, member, coach, detour] = await Promise.all([
    lib.claimCheckout(UID, 'shape_platform').then(() => null, (e) => e),
    runPlatformCheckout({ table: heldTable('shape_platform') }),
    runCoachCheckout({ platform: [{ status: 'active' }], table: heldTable('coach-trainer-4') }),
    runDetour({ table: heldTable('shape_platform') }),
  ]);
  assert.equal(lib.isCheckoutInProgress(direct), true);
  assert.equal(member.status, 409);
  assert.equal(member.body.code, 'checkout_in_progress');
  assert.equal(member.created.length, 0);
  assert.equal(coach.status, 409);
  assert.equal(coach.body.reason, 'checkout_in_progress');
  assert.equal(coach.created.length, 0);
  assert.equal(detour.out, '/newdesign/MemberProfile.html?u=abc&error=checkout_in_progress');
});

async function runCustomerFor({ stored = null, afterUpdate = undefined, updateError = null, platformCustomer = null, coachCustomer = null, recordError = null } = {}) {
  const calls = { creates: [], updates: [] };
  let value = stored;
  // `platformCustomer` / `coachCustomer`: the customer a member who paid before this has on their
  // platform_subscriptions / subscriptions rows (the webhook kept it there only).
  const onRecord = { platform_subscriptions: platformCustomer, subscriptions: coachCustomer };
  const admin = {
    from: (table) => {
      const q = {};
      q.select = () => q; q.eq = () => q; q.not = () => q; q.limit = () => q; q.is = (col, v) => { q._is = [col, v]; return q; };
      q.maybeSingle = async () => (table === 'profiles'
        ? { data: { stripe_customer_id: value }, error: null }
        : recordError ? { data: null, error: recordError } : { data: onRecord[table] ? { stripe_customer_id: onRecord[table] } : null, error: null });
      q.update = (row) => { calls.updates.push({ row }); q._update = row; return q; };
      q.then = (res, rej) => { calls.updates[calls.updates.length - 1].is = q._is; if (!updateError) value = afterUpdate === undefined ? q._update.stripe_customer_id : afterUpdate; return Promise.resolve({ data: null, error: updateError }).then(res, rej); };
      return q;
    },
  };
  const stripe = { customers: { create: async (params, opts) => { calls.creates.push({ params, opts }); return { id: 'cus_new' }; } } };
  const lib = await loadRealModule(join(ROOT, 'src/lib/stripe-customer.ts'), { typescript: true, registry: new Map([['@/lib/stripe', { stripe }], ['@/lib/supabase/admin', { createAdminClient: () => admin }], ['@/lib/stripe-connect', await loadRealModule(join(ROOT, 'src/lib/stripe-connect.ts'), { typescript: true })]]) });
  let result, error;
  try { result = await lib.stripeCustomerFor(UID, 'm@example.invalid'); } catch (e) { error = e; }
  return { result, error, calls };
}

test('stripeCustomerFor: one customer per account, made once, never replaced', async () => {
  const saved = await runCustomerFor({ stored: 'cus_saved' });
  assert.equal(saved.result, 'cus_saved');
  assert.equal(saved.calls.creates.length, 0, 'an account with a customer gets that one');
  const first = await runCustomerFor();
  assert.equal(first.result, 'cus_new');
  assert.equal(first.calls.creates.length, 1);
  assert.deepEqual(first.calls.creates[0].opts, { idempotencyKey: `shape-customer-${UID}` }, 'two first checkouts together get one customer');
  assert.deepEqual(first.calls.creates[0].params.metadata, { client_id: UID });
  assert.deepEqual(first.calls.updates[0].is, ['stripe_customer_id', null], 'only an empty column is filled');
  const raced = await runCustomerFor({ afterUpdate: 'cus_other' });
  assert.equal(raced.result, 'cus_other', 'a customer saved by a concurrent request wins');
  const failed = await runCustomerFor({ updateError: { message: 'boom' } });
  assert.ok(failed.error, 'a failed save throws; the checkout refuses');
  // Codex on #2353: a member who paid before this keeps their customer, the one the portal opens.
  const member = await runCustomerFor({ platformCustomer: 'cus_platform', coachCustomer: 'cus_coach' });
  assert.equal(member.result, 'cus_platform', 'the membership\'s customer first, as the billing portal opens it');
  assert.equal(member.calls.creates.length, 0, 'no second customer');
  assert.equal(member.calls.updates[0].row.stripe_customer_id, 'cus_platform', 'and kept on the profile from now on');
  const coachOnly = await runCustomerFor({ coachCustomer: 'cus_coach' });
  assert.equal(coachOnly.result, 'cus_coach');
  assert.equal(coachOnly.calls.creates.length, 0);
  const unreadable = await runCustomerFor({ recordError: { message: 'connection reset' } });
  assert.ok(unreadable.error, 'an unreadable record refuses rather than making a second customer');
  assert.equal(unreadable.calls.creates.length, 0);
});

// membershipDetour, the server actions' rule.
async function runDetour({ profile = ADULT, platform = [], errors = {}, stripeSubs = [], noPrice = false, table = claimsTable() } = {}) {
  const { membershipCore, returnPath } = await baseModules();
  const created = [];
  const barrier = await barrierLib({ table });
  const pm = await platformMembership({ created, barrier, stripeSubs });
  const caller = scripted({ tables: { profiles: profile ? [profile] : [], platform_subscriptions: platform }, errors });
  const lib = await loadRealModule(join(ROOT, 'src/lib/membership-detour.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/membership-core', membershipCore],
      ['@/lib/platform-membership', pm],
      ['@/lib/stripe-customer', { stripeCustomerFor: async () => 'cus_stable' }],
      ['@/lib/stripe-live-subscription', await liveSubscriptionLib({ stripeSubs })],
      ['@/lib/checkout-barrier', barrier],
    ]),
  });
  const saved = process.env.STRIPE_PLATFORM_PRICE_ID;
  if (noPrice) delete process.env.STRIPE_PLATFORM_PRICE_ID;
  const errLog = console.error; console.error = () => {};
  try {
    const out = await lib.membershipDetour({ supabase: caller.client, user: { id: UID, email: 'm@example.invalid', email_confirmed_at: 'x' }, backHref: '/newdesign/MemberProfile.html?u=abc', origin: 'https://shape.test' });
    return { out, created };
  } finally { console.error = errLog; process.env.STRIPE_PLATFORM_PRICE_ID = saved; }
}

test('membershipDetour: a member goes on; anyone else is sent to the $5 checkout, back to the coach', async () => {
  assert.equal((await runDetour({ platform: [{ status: 'active' }] })).out, null);
  const join_ = await runDetour();
  assert.equal(join_.out, 'https://checkout.stripe.test/cs_test_platform1');
  assert.equal(join_.created[0].customer, 'cus_stable');
  assert.equal(join_.created[0].success_url, returnUrl('/newdesign/MemberProfile.html?u=abc'));
  assert.equal((await runDetour({ profile: MINOR })).out, '/newdesign/MemberProfile.html?u=abc&error=age_restricted');
  assert.equal((await runDetour({ errors: { platform_subscriptions: PG_FAIL } })).out, '/newdesign/MemberProfile.html?u=abc&error=membership_check_failed', 'a failed read never reads as "not a member"');
  const paid = await runDetour({ stripeSubs: [stripeSub({ client_id: UID, plan: 'shape_platform' })] });
  assert.equal(paid.out, '/newdesign/MemberProfile.html?u=abc&member=pending', 'Codex on #2353: paid a moment ago, no second membership');
  assert.equal(paid.created.length, 0);
  assert.equal((await runDetour({ noPrice: true })).out, '/newdesign/MemberProfile.html?u=abc&error=membership_required');
});

test('membership checkout: a membership Stripe already holds blocks a second one', async () => {
  const r = await runPlatformCheckout({ platform: [], stripeSubs: [stripeSub({ client_id: UID, plan: 'shape_platform' })] });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'already_member');
  assert.equal(r.created.length, 0);
  assert.equal((await runPlatformCheckout({ stripeSubs: [stripeSub({ client_id: 'someone-else', plan: 'shape_platform' })] })).status, 200);
});

test('a membership read that comes back with an error is unknown, never "not a member"', async () => {
  // Supabase reports an ordinary failure as { data: null, error }, not a rejection.
  const second = await runPlatformCheckout({ platform: [{ status: 'active' }], errors: { platform_subscriptions: PG_FAIL } });
  assert.equal(second.status, 503, 'an existing member is not sold a second membership on a failed read');
  assert.equal(second.created.length, 0);
  const coach = await runCoachCheckout({ platform: [{ status: 'active' }], errors: { profiles: PG_FAIL } });
  assert.equal(coach.status, 503);
  const me = await runMe({ platform: [{ status: 'active' }], errors: { platform_subscriptions: PG_FAIL } });
  assert.equal(me.status, 503, 'the app must not show a paying member the paywall on a failed read');
  const core = read('src/lib/membership-core.ts');
  assert.match(core, /if \(profileError && opts\.strict\) throw profileError;/);
  assert.match(core, /if \(subError && opts\.strict\) throw subError;/);
  for (const rel of ['src/app/api/me/membership/route.ts', 'src/app/api/stripe/platform-checkout/route.ts', 'src/app/api/stripe/checkout-session/route.ts', 'src/lib/membership-detour.ts']) {
    assert.match(read(rel), /computeMembership\([^)]*strict: true \}\)/, `${rel} reads strictly`);
  }
});

// ── the website ─────────────────────────────────────────────────────────────────────────────
test('website: the client app asks first, and a signed-in non-member gets the join panel on every tab but Settings', () => {
  const shell = read('public/newdesign/ClientApp.html');
  assert.match(shell, /fetch\("\/api\/me\/membership", \{ credentials: "same-origin", cache: "no-store", signal: ctl \? ctl\.signal : undefined \}\)/);
  // Codex on #2353: a lookup that never answers is unknown after 8 seconds, not a blank page.
  assert.match(shell, /const timer = setTimeout\(\(\) => \{ try \{ if \(ctl\) ctl\.abort\(\); \} catch \(e\) \{\} settle\(\{ unknown: true \}\); \}, 8000\);/);
  assert.match(shell, /if \(settled\) return;\n\s+settled = true;/, 'one answer: the late reply does not overwrite the timeout');
  assert.match(shell, /if \(!membership\) return null;\n(?:\s*\/\/.*\n)*\s+if \(membership\.signedIn && membership\.ageRestricted === true && route !== "settings"\) return <ClientAgeRestrictedPage \/>;\n\s+if \(membership\.signedIn && membership\.member === false && route !== "settings"\) return <ClientJoinPage \/>;/);
  assert.match(shell, /window\.__shapeClientMembership = d \|\| \{ unknown: true \};/, 'an unanswered lookup keeps the page as it was');
  const dash = read('public/newdesign/dashClient.jsx');
  assert.match(dash, /function ClientJoinPage\(\)/);
  // Codex on #2353: each pending-membership try is called off after 8 seconds.
  assert.match(dash, /const late = setTimeout\(\(\) => \{ try \{ if \(ctl\) ctl\.abort\(\); \} catch \(e\) \{\} \}, 8000\);\n\s+fetch\("\/api\/me\/membership", \{ credentials: "same-origin", cache: "no-store", signal: ctl \? ctl\.signal : undefined \}\)/);
  assert.match(dash, /\.then\(\(d\) => \{\n\s+clearTimeout\(late\);/);
  assert.match(dash, /window\.ShapeMembership\.start\("\/newdesign\/ClientApp\.html#today"\)/);
  assert.match(dash, /Object\.assign\(window, \{ ClientDashboardPage, ClientJoinPage,/);
  const tour = read('public/newdesign/dashTour.js');
  assert.match(tour, /if \(m\.signedIn && m\.member === false\) return;/, 'no first-run tour over the join panel');
});

test('website: every membership button goes through one helper that posts returnTo, and the coach profile branches on the code', () => {
  const shell = read('public/newdesign/pageShell.jsx');
  assert.match(shell, /fetch\("\/api\/stripe\/platform-checkout", \{\n\s+method: "POST", credentials: "same-origin", headers: \{ "Content-Type": "application\/json" \},\n\s+body: JSON\.stringify\(\{ returnTo: back, cancelPath: cancelTo \|\| back \}\),/);
  assert.match(shell, /Object\.assign\(window, \{ ShapeMembership: \{ start: shapeStartMembership, here: shapeMembershipHere \} \}\);/);
  assert.match(shell, /q\.delete\("member"\);/, 'a second trip does not stack member= parameters');
  const profile = read('public/newdesign/livingShared.jsx');
  assert.match(profile, /if \(res\.status === 402 && j && j\.code === "membership_required"\) \{ setNeedsMember\(true\); return; \}/);
  assert.match(profile, /if \(res\.status === 402 && j\.code === "membership_required" && window\.ShapeMembership\)/);
  assert.doesNotMatch(profile, /j\.error === "membership_required"/, 'the old branch compared the wrong field and never ran');
  assert.equal((profile.match(/\{joinPrompt\}/g) ?? []).length, 2, 'under both Subscribe buttons');
  assert.match(read('public/newdesign/pricing.jsx'), /window\.ShapeMembership\.start\(home, "\/newdesign\/Pricing\.html"\)/);
});

test('the server-action checkouts (/subscribe and /purchase) take the detour, outside any try', () => {
  for (const rel of ['src/app/subscribe/actions.ts', 'src/app/purchase/actions.ts']) {
    const src = read(rel);
    assert.match(src, /const detour = await membershipDetour\(\{ supabase, user, backHref, origin: [^}]+\}\);\n\s+if \(detour\) redirect\(detour\);/, rel);
    assert.match(src, /customer: customerId,/, `${rel}: the account's own Stripe customer`);
    assert.doesNotMatch(src, /customer_email:/, rel);
  }
  const subscribe = read('src/app/subscribe/actions.ts');
  assert.match(subscribe, /redirect\(`\$\{backHref\}&error=already_subscribed`\);/);
  // Codex on #2353, rounds 3 and 4: claimed first, the open checkout handed back before a product
  // or price is made, and the claim released in a finally (which passes redirect()'s throw on).
  const at = (needle) => { const i = subscribe.indexOf(needle); assert.ok(i >= 0, needle); return i; };
  // Under the claim: the price and fee, then the open checkouts on those terms, then Stripe, then
  // the hand-back or the create.
  assert.ok(at('claim = await claimCheckout(user.id, `coach-${providerRole}-${providerId}`);') < at('priceResult = await getProviderConnectInfo('));
  assert.ok(at('await resolveCoachCheckoutOrigin(') < at('open = await currentCheckout(customerId,'));
  assert.match(subscribe, /\(s\) => s\.metadata\?\.price_cents === String\(priceResult\.priceCents\) && s\.metadata\?\.fee_bps === String\(feeBps\)\n\s+&& s\.metadata\?\.origin === coachOrigin && \(s\.metadata\?\.referral_id \?\? null\) === \(referralId \?\? null\)\n\s+&& s\.metadata\?\.returns === returns\)/, 'on this request\'s terms, returns included');
  assert.ok(at('open = await currentCheckout(customerId,') < at('paid = await hasLiveStripeSubscription('), 'Stripe is asked after the read');
  assert.equal((subscribe.match(/hasLiveStripeSubscription\(/g) ?? []).length, 1, 'and only there');
  assert.match(subscribe, /if \(paid\) redirect\(`\$\{backHref\}&error=already_subscribed`\);\n\s+if \(open\) redirect\(open\);/);
  assert.match(subscribe, /if \(isCheckoutInProgress\(e\)\) redirect\(`\$\{backHref\}&error=checkout_in_progress`\);/);
  assert.doesNotMatch(subscribe, /idempotencyKey/, 'the claim replaced the 10-minute keys');
  assert.match(subscribe, /await claim\.confirm\(\);\n\s+session = await stripe\.checkout\.sessions\.create\(/, 'renewed right before the create');
  assert.match(subscribe, /\}, CHECKOUT_CREATE_OPTIONS\);/);
  assert.match(subscribe, /\} finally \{\n    await claim\.release\(\);\n  \}/);
});
