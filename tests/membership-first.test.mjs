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
async function liveSubscriptionLib({ stripeSubs = [], emailSubs = [], stripeThrows = false } = {}) {
  const { membershipCore } = await baseModules();
  const stripe = {
    customers: { list: async ({ email }) => { if (stripeThrows) throw new Error('stripe down'); return { data: email ? [{ id: 'cus_email' }] : [] }; } },
    subscriptions: { list: async ({ customer }) => { if (stripeThrows) throw new Error('stripe down'); return { data: customer === 'cus_stable' ? stripeSubs : customer === 'cus_email' ? emailSubs : [] }; } },
  };
  return loadRealModule(join(ROOT, 'src/lib/stripe-live-subscription.ts'), {
    typescript: true,
    registry: new Map([['@/lib/stripe', { stripe }], ['@/lib/membership-core', membershipCore]]),
  });
}

async function platformMembership({ retrieve = async () => { throw new Error('unexpected retrieve'); }, admin = scripted(), created = [] } = {}) {
  const { returnPath, membershipCore } = await baseModules();
  return loadRealModule(join(ROOT, 'src/lib/platform-membership.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/stripe', { stripe: { checkout: { sessions: { create: async (args) => { created.push(args); return { id: 'cs_test_platform1', url: 'https://checkout.stripe.test/cs_test_platform1' }; }, retrieve } } } }],
      ['@/lib/supabase/admin', { createAdminClient: () => admin.client }],
      ['@/lib/membership-core', membershipCore],
      ['@/lib/return-path', returnPath],
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
async function runCoachCheckout({ profile = ADULT, platform = [], subscriptions = [], fail = [], errors = {}, body, stripeSubs = [], emailSubs = [], stripeThrows = false, customerFails = false } = {}) {
  const { requestUtils, returnPath, membershipCore, platformFee } = await baseModules();
  const created = [];
  const caller = scripted({ tables: { profiles: profile ? [profile] : [], platform_subscriptions: platform, subscriptions }, fail, errors });
  const admin = scripted({ tables: { trainers: [{ id: 4, name: 'Coach T', owner_id: '22222222-2222-4222-8222-222222222222', price: 150, session_price: 90, stripe_account_id: 'acct_T', stripe_account_status: 'active', at_capacity: false, capacity_resume_at: null }] } });
  const route = await loadRealModule(join(ROOT, 'src/app/api/stripe/checkout-session/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/stripe', { stripe: { checkout: { sessions: { create: async (args) => { created.push(args); return { id: 'cs_test_coach1', url: 'https://checkout.stripe.test/cs_test_coach1' }; } } } } }],
      ['@/lib/supabase/admin', { createAdminClient: () => admin.client }],
      ['@/lib/capacity', { isEffectivelyAtCapacity: () => false }],
      ['@/lib/waitlist', { resolveRequestClient: async () => ({ user: { id: UID, email: 'm@example.invalid', emailConfirmed: true }, supabase: caller.client }), hasActiveWaitlistInvite: async () => false }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/platform-fee', platformFee],
      ['@/lib/coach-origin', { resolveCoachCheckoutOrigin: async () => ({ origin: 'marketplace', feeBps: 1500, referralId: null }) }],
      ['@/lib/return-path', returnPath],
      ['@/lib/membership-core', membershipCore],
      ['@/lib/stripe-live-subscription', await liveSubscriptionLib({ stripeSubs, emailSubs, stripeThrows })],
      ['@/lib/stripe-customer', { stripeCustomerFor: async () => { if (customerFails) throw new Error('stripe down'); return 'cus_stable'; } }],
    ]),
  });
  const errLog = console.error; console.error = () => {};
  try {
    const res = await route.POST(new Request('https://shape.test/api/stripe/checkout-session', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? { item: { type: 'Subscription', name: 'Monthly coaching' }, coach: { provider_id: 4, provider_role: 'trainer' } }),
    }));
    return { status: res.status, body: await res.json(), created };
  } finally { console.error = errLog; }
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
async function runPlatformCheckout({ signedIn = true, profile = ADULT, platform = [], fail = [], errors = {}, body = {}, stripeSubs = [], email = 'm@example.invalid' } = {}) {
  const { requestUtils, returnPath, membershipCore } = await baseModules();
  const created = [];
  const caller = scripted({ tables: { profiles: profile ? [profile] : [], platform_subscriptions: platform }, fail, errors });
  const pm = await platformMembership({ created });
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
    ]),
  });
  const errLog = console.error; console.error = () => {};
  try {
    const res = await route.POST(new Request('https://shape.test/api/stripe/platform-checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json(), created };
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
  assert.equal((await runPlatformCheckout({ body: { cancelPath: 'https://evil.example' } })).created[0].cancel_url, 'https://shape.test/pricing.html?error=subscribe_cancelled');
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

// stripeCustomerFor, against a scripted admin client and Stripe.
async function runCustomerFor({ stored = null, afterUpdate = undefined, updateError = null } = {}) {
  const calls = { creates: [], updates: [] };
  let value = stored;
  const admin = {
    from: () => {
      const q = {};
      q.select = () => q; q.eq = () => q; q.is = (col, v) => { q._is = [col, v]; return q; };
      q.maybeSingle = async () => ({ data: { stripe_customer_id: value }, error: null });
      q.update = (row) => { calls.updates.push({ row }); q._update = row; return q; };
      q.then = (res, rej) => { calls.updates[calls.updates.length - 1].is = q._is; if (!updateError) value = afterUpdate === undefined ? q._update.stripe_customer_id : afterUpdate; return Promise.resolve({ data: null, error: updateError }).then(res, rej); };
      return q;
    },
  };
  const stripe = { customers: { create: async (params, opts) => { calls.creates.push({ params, opts }); return { id: 'cus_new' }; } } };
  const lib = await loadRealModule(join(ROOT, 'src/lib/stripe-customer.ts'), { typescript: true, registry: new Map([['@/lib/stripe', { stripe }], ['@/lib/supabase/admin', { createAdminClient: () => admin }]]) });
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
});

// membershipDetour, the server actions' rule.
async function runDetour({ profile = ADULT, platform = [], errors = {}, stripeSubs = [], noPrice = false } = {}) {
  const { membershipCore, returnPath } = await baseModules();
  const created = [];
  const pm = await platformMembership({ created });
  const caller = scripted({ tables: { profiles: profile ? [profile] : [], platform_subscriptions: platform }, errors });
  const lib = await loadRealModule(join(ROOT, 'src/lib/membership-detour.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/membership-core', membershipCore],
      ['@/lib/platform-membership', pm],
      ['@/lib/stripe-customer', { stripeCustomerFor: async () => 'cus_stable' }],
      ['@/lib/stripe-live-subscription', await liveSubscriptionLib({ stripeSubs })],
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
  assert.match(shell, /fetch\("\/api\/me\/membership", \{ credentials: "same-origin", cache: "no-store" \}\)/);
  assert.match(shell, /if \(!membership\) return null;\n\s+if \(membership\.signedIn && membership\.member === false && route !== "settings"\) return <ClientJoinPage \/>;/);
  assert.match(shell, /window\.__shapeClientMembership = d \|\| \{ unknown: true \};/, 'an unanswered lookup keeps the page as it was');
  const dash = read('public/newdesign/dashClient.jsx');
  assert.match(dash, /function ClientJoinPage\(\)/);
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
  assert.match(read('src/app/subscribe/actions.ts'), /redirect\(`\$\{backHref\}&error=already_subscribed`\);/);
});
