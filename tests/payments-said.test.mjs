// Client-onboarding review, fix 3c: payments that say what happened (M8, M10, M11).
//   - M8: a suspended listing takes no payment and no booking, on every path that charges or books.
//   - M10: the coach is told who paid, once, and only after the purchase is saved; a paid session
//     opens the thread and waits on the coach's To schedule list until it is booked; a program is
//     recorded as a program.
//   - M11: the page Stripe returns to reads the checkout before it says anything.
// The coach's booking of a paid session (/api/sessions/manage) and the Schedule's strip are driven
// in tests/schedule-step2.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { coachCheckoutEntries } from './helpers/coach-checkout-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const require = createRequire(import.meta.url);
const nextServer = require('next/server');
const UID = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const PLAN = '33333333-3333-4333-8333-333333333333';

// ── M8 + M10 at the checkout ───────────────────────────────────────────────────────────────────
const TRAINER = { id: 4, name: 'Coach T', owner_id: OWNER, price: 180, session_price: 120, stripe_account_id: 'acct_T', stripe_account_status: 'active', at_capacity: false, capacity_resume_at: null, suspended_at: null };
const NUTRI = { ...TRAINER, id: 5, name: 'Coach N', meal_plan_price: 90 };

async function runCheckout({ trainer = TRAINER, nutritionist = NUTRI, plans = [], body }) {
  const created = [];
  const tables = { trainers: [trainer], nutritionists: [nutritionist], coach_plans: plans };
  const admin = {
    from(table) {
      const q = {};
      const filters = [];
      for (const m of ['select', 'order', 'limit']) q[m] = () => q;
      q.eq = (col, v) => { filters.push((r) => String(r[col]) === String(v)); return q; };
      q.maybeSingle = async () => ({ data: (tables[table] || []).find((r) => filters.every((f) => f(r))) ?? null, error: null });
      return q;
    },
    rpc: async (name) => (name === 'get_store_credit_for' ? { data: { session: 0, nutrition: 0 }, error: null } : { data: 0, error: null }),
  };
  const route = await loadRealModule(join(ROOT, 'src/app/api/stripe/checkout-session/route.ts'), {
    typescript: true,
    registry: new Map([
      ...(await coachCheckoutEntries()),
      ['next/server', nextServer],
      ['@/lib/stripe', { stripe: { checkout: { sessions: { create: async (args) => { created.push(args); return { id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' }; } } } } }],
      ['@/lib/supabase/admin', { createAdminClient: () => admin }],
      ['@/lib/capacity', { isEffectivelyAtCapacity: () => false }],
      ['@/lib/waitlist', { resolveRequestClient: async () => ({ user: { id: UID, email: 'a@example.invalid', emailConfirmed: true }, supabase: fakeSupabase({ tables: { subscriptions: [] } }) }), hasActiveWaitlistInvite: async () => false }],
      ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) })],
      ['@/lib/platform-fee', await import(pathToFileURL(join(ROOT, 'src/lib/platform-fee.mjs')).href)],
      ['@/lib/coach-origin', { resolveCoachCheckoutOrigin: async () => ({ origin: 'marketplace', feeBps: 1500, referralId: null }) }],
      ['@/lib/return-path', await loadRealModule(join(ROOT, 'src/lib/return-path.ts'), { typescript: true })],
      ['@/lib/membership-core', { ACTIVE_SUB: new Set(['active', 'trialing', 'past_due']), computeMembership: async () => ({ isMember: true, isKnownMinor: false }) }],
      ['@/lib/stripe-live-subscription', { hasLiveStripeSubscription: async () => false }],
      ['@/lib/stripe-customer', { stripeCustomerFor: async () => 'cus_1' }],
      ['@/lib/health-screening', { hiresCoach: () => false, hasCompletedScreening: async () => true, SCREENING_REQUIRED: { error: 'x', code: 'screening_required' } }],
      ['@/lib/checkout-barrier', { claimCheckout: async () => ({ confirm: async () => {}, release: async () => {} }), currentCheckout: async () => null, isCheckoutInProgress: () => false, checkoutReturnsKey: () => 'k', CHECKOUT_CREATE_OPTIONS: {} }],
    ]),
  });
  const res = await route.POST(new Request('https://shape.test/api/stripe/checkout-session', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  return { status: res.status, body: await res.json(), created };
}

const session = { item: { type: 'booking', name: 'Session' }, coach: { provider_id: 4, provider_role: 'trainer' } };

test('checkout: a suspended listing takes no payment, and says so as a flag (M8)', async () => {
  const r = await runCheckout({ trainer: { ...TRAINER, suspended_at: '2026-10-13T10:00:00Z' }, body: session });
  assert.equal(r.status, 409);
  assert.equal(r.body.reason, 'suspended');
  assert.equal(r.created.length, 0, 'no checkout is opened');
  // The two server actions refuse it too, and the member's session request.
  for (const rel of ['src/app/subscribe/actions.ts', 'src/app/purchase/actions.ts']) {
    const src = read(rel);
    assert.match(src, /stripe_account_status, at_capacity, capacity_resume_at, suspended_at/, rel);
    assert.match(src, /\.suspended_at\) (return \{ error: 'provider_suspended' \}|redirect\(`\$\{backHref\}&error=provider_suspended`\));/, rel);
  }
  assert.match(read('src/app/api/sessions/request/route.ts'), /if \(\(provider as \{ suspended_at\?: unknown \}\)\.suspended_at\) \{\s+return NextResponse\.json\(\{ error: "This coach isn't taking bookings right now\.", code: 'suspended' \}, \{ status: 409 \}\);/);
});

test('checkout: the sale is recorded as what it is: a session, a program, a meal plan (M10)', async () => {
  const s = await runCheckout({ body: session });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.equal(s.created[0].metadata.kind, 'booking');
  const program = await runCheckout({ plans: [{ id: PLAN, price: '49', published: true, owner_id: OWNER, kind: 'program' }], body: { item: { type: 'plan', name: 'Strength 12', planId: PLAN }, coach: { provider_id: 4, provider_role: 'trainer' } } });
  assert.equal(program.status, 200, JSON.stringify(program.body));
  assert.equal(program.created[0].metadata.kind, 'program', 'a trainer\'s program is not a paid session');
  assert.equal(program.created[0].metadata.plan_id, PLAN);
  // The plan's own name, not the request's (Fable on #2373): it reaches the coach's notice.
  const renamed = await runCheckout({ plans: [{ id: PLAN, price: '49', published: true, owner_id: OWNER, kind: 'program', name: 'Strength 12' }], body: { item: { type: 'plan', name: 'Refund me now or else', planId: PLAN }, coach: { provider_id: 4, provider_role: 'trainer' } } });
  assert.equal(renamed.created[0].metadata.item_name, 'Strength 12');
  const meal = await runCheckout({ plans: [{ id: PLAN, price: '29', published: true, owner_id: OWNER, kind: 'meal_plan' }], body: { item: { type: 'plan', name: 'Lean 4', planId: PLAN }, coach: { provider_id: 5, provider_role: 'nutritionist' } } });
  assert.equal(meal.created[0].metadata.kind, 'meal_plan');
  const consult = await runCheckout({ body: { item: { type: 'booking', name: 'Consult' }, coach: { provider_id: 5, provider_role: 'nutritionist' } } });
  assert.equal(consult.created[0].metadata.kind, 'meal_plan', 'a nutritionist\'s one-time sale without a plan, as before');
});

// ── M10 at the webhook ─────────────────────────────────────────────────────────────────────────
test('webhook: the coach is told who paid, only after the purchase is saved; the nameless alert is gone', () => {
  const src = read('src/app/api/stripe/webhook/route.ts');
  assert.doesNotMatch(src, /notifyProviderOwner|from a client\$\{kind ===/);
  const at = src.indexOf('await coachPaid(admin, {');
  assert.ok(at > 0);
  assert.match(src.slice(src.lastIndexOf('if (', at), at), /^if \(!purchaseErr\) \{/);
  assert.ok(at > src.indexOf(".from('one_time_purchases')\n            .upsert(withSnapshot"), 'after the save');
  assert.match(src.slice(at, at + 500), /kind: kind === 'program' \|\| kind === 'meal_plan' \? kind : 'booking',\s+checkoutId: session\.id,\s+coachCents,/);
  // The coach's cut: at the resolved rate of the gross on Shape's account; on a coach's own account
  // (part B), what Stripe charged less the fee on that payment.
  assert.match(src, /const coachCents = acct\n\s+\? Math\.max\(0, priceCents - \(applicationFeeCents \?\? 0\)\)\n\s+: coachCutCents\(grossCents, payoutRate\);/);
  // The coach's notice names the plan read from coach_plans, never the checkout's item_name (Fable on #2373).
  assert.match(src.slice(at, at + 900), /itemName: planSnapshot && typeof planSnapshot\.name === 'string' && planSnapshot\.name\.trim\(\) \? planSnapshot\.name\.trim\(\) : null,/);
  assert.doesNotMatch(src.slice(at, at + 900), /metadata\?\.item_name/);
  // Before the migration the table refuses 'program': the sale is recorded as a booking, not lost.
  assert.match(src, /if \(purchaseErr\?\.code === '23514' && kind === 'program'\) \{[\s\S]{0,400}withSnapshot\.kind = 'booking';/);
});

function fakeAdmin({ provider = { name: 'Tom Trainer', owner_id: 'coach-1' }, client = { full_name: 'Cara Diaz' }, rpcResult = { data: [{ thread_id: 'conv-1', welcomed: true }], error: null } } = {}) {
  const calls = { rpc: [] };
  const emails = { 'coach-1': 'tom@example.com', 'client-1': 'cara@example.com' };
  return {
    calls,
    admin: {
      from(table) {
        const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: table === 'profiles' ? client : provider, error: null }) };
        return q;
      },
      async rpc(name, args) { calls.rpc.push([name, args]); return rpcResult; },
      auth: { admin: { getUserById: async (id) => ({ data: { user: emails[id] ? { email: emails[id] } : null } }) } },
    },
  };
}
async function loadCoachThread({ stored = true } = {}) {
  const sent = { notifications: [], emails: [] };
  const emails = await loadRealModule(join(ROOT, 'src/lib/coach-application-emails.ts'), { typescript: true });
  const mod = await loadRealModule(join(ROOT, 'src/lib/coach-thread.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/notify', { createNotification: async (_c, n) => { sent.notifications.push(n); return stored; } }],
      ['@/lib/email', { sendEmail: async (e) => { sent.emails.push(e); return { ok: true }; } }],
      ['@/lib/coach-application-emails', emails],
    ]),
  });
  return { mod, sent };
}

test('coachPaid: a paid session opens the thread, tells the coach who paid and what to do, and tells the member what is next', async () => {
  const { mod, sent } = await loadCoachThread();
  const { admin, calls } = fakeAdmin();
  const out = await mod.coachPaid(admin, { clientId: 'client-1', providerRole: 'trainer', providerId: 7, kind: 'booking', checkoutId: 'cs_1', coachCents: 10200 });
  assert.deepEqual(out, { conversationId: 'conv-1', coachAlerted: true, memberTold: true });
  assert.equal(calls.rpc[0][0], 'open_coach_thread');
  const [coach, member] = sent.notifications;
  assert.equal(coach.userId, 'coach-1');
  assert.equal(coach.title, 'Session to schedule: Cara Diaz');
  assert.match(coach.body, /^Cara Diaz paid for a session · \$102\.00 to you\. It waits on your Schedule under To schedule/);
  assert.equal(coach.route, 'schedule');
  assert.deepEqual(coach.data, { dedupe: 'paid:cs_1', clientId: 'client-1', conversationId: 'conv-1', providerRole: 'trainer' });
  assert.equal(member.userId, 'client-1');
  assert.equal(member.route, 'chat:conv-1', 'the thread where they agree the time');
  assert.equal(member.data.dedupe, 'paid-member:cs_1');
  assert.deepEqual(sent.emails.map((e) => [e.to, e.subject]), [
    ['tom@example.com', 'Session to schedule: Cara Diaz'],
    ['cara@example.com', 'Your session with Tom Trainer is paid'],
  ]);
  assert.match(sent.emails[0].text, /\/newdesign\/TrainerApp\.html#schedule/);
  assert.match(sent.emails[0].text, /\/newdesign\/TrainerMessages\.html\?client=client-1/);
  assert.match(sent.emails[1].text, /\/newdesign\/ClientApp\.html#team/);
});

test('coachPaid: a redelivered event sends nothing twice, and a product is a sale, not a coaching start', async () => {
  {
    const { mod, sent } = await loadCoachThread({ stored: false });
    const { admin } = fakeAdmin();
    const out = await mod.coachPaid(admin, { clientId: 'client-1', providerRole: 'trainer', providerId: 7, kind: 'booking', checkoutId: 'cs_1' });
    assert.equal(out.coachAlerted, false);
    assert.equal(sent.emails.length, 0, 'the dedupe rows exist, so no email goes again');
  }
  for (const [kind, itemName, what] of [['program', 'Strength 12', 'Strength 12'], ['meal_plan', null, 'a meal plan'], ['program', '', 'a program']]) {
    const { mod, sent } = await loadCoachThread();
    const { admin, calls } = fakeAdmin();
    const out = await mod.coachPaid(admin, { clientId: 'client-1', providerRole: 'trainer', providerId: 7, kind, checkoutId: 'cs_2', coachCents: 4165, itemName });
    assert.equal(calls.rpc.length, 0, `${kind}: no thread is opened for a product`);
    assert.equal(out.memberTold, false);
    assert.equal(sent.notifications.length, 1);
    const n = sent.notifications[0];
    assert.equal(n.title, 'Payment received: Cara Diaz');
    assert.equal(n.body, `Cara Diaz bought ${what} · $41.65 to you.`);
    assert.equal(n.data.dedupe, 'paid:cs_2');
    assert.equal(n.route, 'business', "the coach's Business page: the buyer is not a coaching client, so not their page");
    assert.equal(n.data.providerRole, 'trainer', 'which listing\'s Business');
    assert.equal(sent.emails.length, 0);
  }
});

// ── M10: what is still to schedule ─────────────────────────────────────────────────────────────
async function paidSessions() {
  return loadRealModule(join(ROOT, 'src/lib/paid-sessions.ts'), { typescript: true, registry: new Map([['@supabase/supabase-js', {}]]) });
}
const paid = (id, extra = {}) => ({ id, client_id: 'member-7', provider_id: 7, provider_role: 'trainer', kind: 'booking', status: 'paid', price_cents: 6000, created_at: '2026-10-01T10:00:00Z', session_id: null, ...extra });

test('a paid session is open until a session that will happen is booked against it', async () => {
  const P = await paidSessions();
  const db = fakeSupabase({ tables: {
    one_time_purchases: [
      paid('p-new'),
      paid('p-cancelled', { session_id: 's-c', created_at: '2026-10-02T10:00:00Z' }),
      paid('p-declined', { session_id: 's-d', created_at: '2026-10-03T10:00:00Z' }),
      paid('p-booked', { session_id: 's-b' }),
      paid('p-done', { session_id: 's-x' }),
      paid('p-refunded', { status: 'refunded' }),
      paid('p-program', { kind: 'program' }),
      // A program recorded as a booking before the migration names its plan: never a session (Fable on #2373).
      paid('p-fallback', { plan_id: 'plan-9' }),
      paid('p-other', { provider_id: 8 }),
    ],
    sessions: [{ id: 's-c', status: 'cancelled' }, { id: 's-d', status: 'declined' }, { id: 's-b', status: 'confirmed' }, { id: 's-x', status: 'completed' }],
  } });
  const r = await P.openPaidSessions(db, { role: 'trainer', providerId: 7 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows.map((x) => [x.purchaseId, x.sessionId]), [['p-new', null], ['p-cancelled', 's-c'], ['p-declined', 's-d']]);
  assert.equal((await P.openPaidSessions(fakeSupabase({ tables: {}, fail: ['one_time_purchases'] }), { role: 'trainer', providerId: 7 })).ok, false, 'unreadable is not "none"');
  assert.equal((await P.openPaidSessions(fakeSupabase({ tables: { one_time_purchases: [paid('p', { session_id: 's' })] }, fail: ['sessions'] }), { role: 'trainer', providerId: 7 })).ok, false);
  // The link is conditional on what the payment was read with: two bookings racing link it once.
  const writes = [];
  const upd = (filters) => {
    const q = {
      eq: (c, v) => { filters.push(['eq', c, v]); return q; }, is: (c, v) => { filters.push(['is', c, v]); return q; },
      select: async () => ({ data: [{ id: 'p' }], error: null }),
    };
    return q;
  };
  const admin = { from: () => ({ update: (patch) => { const f = []; writes.push({ patch, f }); return upd(f); } }) };
  assert.equal(await P.linkPaidSession(admin, { purchaseId: 'p-new', sessionId: null }, 's-1'), true);
  assert.equal(await P.linkPaidSession(admin, { purchaseId: 'p-cancelled', sessionId: 's-c' }, 's-2'), true);
  assert.deepEqual(writes.map((w) => [w.patch, w.f]), [
    [{ session_id: 's-1' }, [['eq', 'id', 'p-new'], ['is', 'session_id', null]]],
    [{ session_id: 's-2' }, [['eq', 'id', 'p-cancelled'], ['eq', 'session_id', 's-c']]],
  ]);
});

test('GET /api/coach/to-schedule: the coach\'s own listing, names by display fields, and a failed read said', async () => {
  const P = await paidSessions();
  const state = { user: { id: 'coach-1' }, client: null, admin: null };
  const route = await loadRealModule(join(ROOT, 'src/app/api/coach/to-schedule/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => state.user, clientForRequest: async () => state.client }],
      ['@/lib/supabase/admin', { createAdminClient: () => state.admin }],
      ['@/lib/paid-sessions', P],
    ]),
  });
  const get = async (q) => { const res = await route.GET(new Request('https://shape.test/api/coach/to-schedule' + q)); return { status: res.status, body: await res.json() }; };
  const tables = { trainers: [{ id: 7, owner_id: 'coach-1' }], one_time_purchases: [paid('p-1'), paid('p-2', { client_id: 'member-8', created_at: '2026-10-02T10:00:00Z' }), paid('p-x', { provider_id: 9 })] };
  state.client = fakeSupabase({ tables, rpcs: { get_display_names: ({ p_ids }) => p_ids.map((id) => ({ user_id: id, full_name: id === 'member-7' ? 'Lee Park' : null })) } });
  state.admin = fakeSupabase({ tables });
  const ok = await get('?role=trainer');
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.items.map((i) => [i.purchaseId, i.clientId, i.clientName]), [['p-1', 'member-7', 'Lee Park'], ['p-2', 'member-8', 'Client']]);
  assert.equal((await get('?role=nutritionist')).body.items.length, 0, 'no listing in that role: nothing');
  assert.equal((await get('?role=admin')).status, 400);
  state.admin = fakeSupabase({ tables, fail: ['one_time_purchases'] });
  assert.equal((await get('?role=trainer')).status, 503);
  state.user = null;
  assert.equal((await get('?role=trainer')).status, 401);
  assert.ok(read('src/lib/warroom.ts').includes("['/api/coach/to-schedule', 'GET'],"), 'registered in the War Room');
});

test('migration: programs are a kind of their own, and a paid session links the session that settles it', () => {
  const sql = read('supabase-migrations/2026-10-15-paid-sessions.sql').replace(/--[^\n]*/g, '');
  assert.match(sql, /add constraint one_time_purchases_kind_check\s+check \(kind in \('booking', 'meal_plan', 'program'\)\);/);
  assert.match(sql, /add column if not exists session_id uuid references public\.sessions\(id\) on delete set null;/);
  assert.match(sql, /c\.confdeltype = 'n'/, 'the guard checks the set-null');
  // A program the webhook recorded as a booking before this ran is corrected, and the guard checks it.
  assert.match(sql, /update public\.one_time_purchases\s+set kind = 'program'\s+where kind = 'booking'\s+and \(plan_id is not null or \(plan_snapshot is not null and plan_snapshot \? 'id'\)\);/);
  assert.match(sql, /raise exception 'a purchase that names a plan is still recorded as a booking';/);
});

// ── M10 on the coach's phone ───────────────────────────────────────────────────────────────────
test('the app: paid sessions wait on the coach\'s Today, Book opens the session sheet for that client, in 13 languages', () => {
  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  assert.match(pros, /window\.ShapeSessions\.listToSchedule\(role\)\.then\(\(items\) => \{ if \(live\) setToSchedule\(items\); \}, \(\) => \{ if \(live\) setToSchedule\(false\); \}\);/);
  assert.match(pros, /\}, \[coachSignedIn, role, schedFor\]\);/, 're-read when the session sheet closes');
  assert.match(pros, /onClick=\{\(\) => setSchedFor\(\{ n: p\.clientName, userId: p\.clientId \}\)\}/);
  assert.match(pros, /toSchedule === false\s+\? tr\('coach:today\.toScheduleFailed'/);
  const backend = read('mobile-app/src/services/shapeBackend.js');
  assert.match(backend, /\/api\/coach\/to-schedule\?role=\$\{encodeURIComponent\(role\)\}/);
  assert.match(backend, /if \(!res\.ok \|\| !Array\.isArray\(data\.items\)\) throw new Error/);
  for (const loc of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/coach.json`));
    assert.match(cat['today.toScheduleHead'], /\{count\}/, loc);
    assert.match(cat['today.toSchedulePaid'], /\{date\}/, loc);
    assert.ok(cat['today.toScheduleBook'] && cat['today.toScheduleFailed'], loc);
  }
});

// ── M11: the return page ───────────────────────────────────────────────────────────────────────
async function loadReturn({ user = { id: UID }, retrieve, provider = { name: 'Tom Trainer' } } = {}) {
  return loadRealModule(join(ROOT, 'src/lib/checkout-return.ts'), {
    typescript: true,
    registry: new Map([
      ...(await coachCheckoutEntries()),
      ['@/lib/stripe', { stripe: { checkout: { sessions: { retrieve } } } }],
      // acctOpts / isAccountId for a direct-charge return (coach direct charges, 2026-10-18), as they ship.
      ['@/lib/stripe-connect', await loadRealModule(join(ROOT, 'src/lib/stripe-connect.ts'), { typescript: true })],
      ['@/lib/supabase/server', { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) }],
      ['@/lib/supabase/admin', { createAdminClient: () => ({ from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: provider, error: null }) }; return q; } }) }],
    ]),
  });
}
const cs = (extra = {}) => ({ id: 'cs_test_abcdefghij', status: 'complete', payment_status: 'paid', mode: 'payment', client_reference_id: UID, metadata: { client_id: UID, provider_id: '4', provider_role: 'trainer', kind: 'booking' }, ...extra });

test('the return page says only what the checkout shows, to its buyer (M11)', async () => {
  const ID = 'cs_test_abcdefghij';
  const at = async (session, opts = {}) => (await loadReturn({ retrieve: async () => session, ...opts })).readCheckoutReturn(opts.id ?? ID);
  assert.deepEqual(await at(cs()), { state: 'paid', kind: 'booking', coachName: 'Tom Trainer', itemName: null });
  assert.deepEqual(await at(cs({ payment_status: 'unpaid' })), { state: 'processing', kind: 'booking', coachName: 'Tom Trainer', itemName: null }, 'a bank debit still clearing');
  assert.deepEqual(await at(cs({ status: 'expired', payment_status: 'unpaid' })), { state: 'not_paid' });
  // A bank debit that bounced is not "processing" (Fable on #2373): the payment says so.
  assert.deepEqual(await at(cs({ payment_status: 'unpaid', payment_intent: { status: 'requires_payment_method' } })), { state: 'failed' });
  assert.deepEqual(await at(cs({ payment_status: 'unpaid', payment_intent: { status: 'canceled' } })), { state: 'failed' });
  assert.deepEqual(await at(cs({ payment_status: 'unpaid', payment_intent: { status: 'processing' } })), { state: 'processing', kind: 'booking', coachName: 'Tom Trainer', itemName: null });
  assert.deepEqual(await at(cs({ mode: 'subscription', payment_status: 'unpaid', subscription: { status: 'incomplete_expired' }, metadata: { client_id: UID, provider_id: '4', provider_role: 'trainer' } })), { state: 'failed' });
  assert.deepEqual(await at(cs({ mode: 'subscription', payment_status: 'unpaid', subscription: { status: 'incomplete' }, metadata: { client_id: UID, provider_id: '4', provider_role: 'trainer' } })), { state: 'processing', kind: 'subscription', coachName: 'Tom Trainer', itemName: null });
  const asked = [];
  await (await loadReturn({ retrieve: async (...a) => { asked.push(a); return cs(); } })).readCheckoutReturn(ID);
  assert.deepEqual(asked[0][1], { expand: ['payment_intent', 'subscription'] });
  assert.deepEqual(await at(cs({ mode: 'subscription', metadata: { client_id: UID, provider_id: '4', provider_role: 'trainer' } })), { state: 'paid', kind: 'subscription', coachName: 'Tom Trainer', itemName: null });
  assert.deepEqual(await at(cs({ metadata: { client_id: UID, provider_id: '4', provider_role: 'trainer', kind: 'program', item_name: 'Strength 12' } })), { state: 'paid', kind: 'program', coachName: 'Tom Trainer', itemName: 'Strength 12' });
  // Someone else's checkout, a made-up id, Stripe unreachable: nothing is claimed.
  assert.deepEqual(await at(cs({ client_reference_id: 'other', metadata: { client_id: 'other' } })), { state: 'unconfirmed' });
  assert.deepEqual(await at(cs(), { id: 'cs_nope' }), { state: 'unconfirmed' });
  assert.deepEqual(await at(cs(), { id: '' }), { state: 'unconfirmed' });
  assert.deepEqual(await (await loadReturn({ retrieve: async () => { throw new Error('down'); } })).readCheckoutReturn(ID), { state: 'unconfirmed' });
  // Signed out (the app's checkout returns to a browser that often is not): where the payment
  // stands, naming no one. Signed in as someone else: nothing.
  const signedOut = async (session) => (await loadReturn({ user: null, retrieve: async () => session })).readCheckoutReturn(ID);
  assert.deepEqual(await signedOut(cs()), { state: 'paid', kind: 'booking', coachName: '', itemName: null });
  assert.deepEqual(await signedOut(cs({ payment_status: 'unpaid' })), { state: 'processing', kind: 'booking', coachName: '', itemName: null });
  assert.deepEqual(await signedOut(cs({ metadata: { client_id: UID, provider_id: '4', provider_role: 'trainer', kind: 'program', item_name: 'Strength 12' } })), { state: 'paid', kind: 'program', coachName: '', itemName: null });
  assert.deepEqual(await signedOut(cs({ status: 'expired', payment_status: 'unpaid' })), { state: 'not_paid' });
});

test('the return page\'s words: no "went through" until it did, and each kind points somewhere real', async () => {
  const { checkoutReturnCopy: c } = await loadReturn({ retrieve: async () => cs() });
  const say = (r) => c(r);
  assert.deepEqual(say({ state: 'failed' }), { title: "Your payment didn't go through", body: 'Your bank turned it down, so nothing was charged and nothing has started. You can try again from the coach’s page.', cta: { href: '/newdesign/ClientApp.html', label: 'Back to Shape' } });
  for (const r of [{ state: 'processing', kind: 'booking', coachName: 'Tom', itemName: null }, { state: 'not_paid' }, { state: 'failed' }, { state: 'unconfirmed' }]) {
    const x = say(r);
    assert.doesNotMatch(x.title + ' ' + x.body, /went through|is paid|is active|is yours/i, r.state);
  }
  assert.equal(say({ state: 'not_paid' }).body, 'Nothing was charged. You can start again from the coach’s page whenever you like.');
  // Nameless (signed out): no sentence opens on a lowercase "your coach".
  for (const kind of ['booking', 'subscription', 'program', 'meal_plan', 'membership']) {
    for (const state of ['paid', 'processing']) {
      const x = say({ state, kind, coachName: '', itemName: null });
      assert.doesNotMatch(x.title + ' ' + x.body, /(^|[.:] )your coach/, `${state} ${kind}`);
      assert.doesNotMatch(x.title + ' ' + x.body + ' ' + x.cta.label, /undefined|null|  /, `${state} ${kind}`);
    }
  }
  assert.equal(say({ state: 'paid', kind: 'booking', coachName: '', itemName: null }).body.split(' books')[0], 'Your coach');
  assert.deepEqual(say({ state: 'paid', kind: 'booking', coachName: 'Tom', itemName: null }), {
    title: 'Your session with Tom is paid',
    body: "Tom books the time with you. Say when suits you in your thread; you'll get the time and the call link by email once it's booked.",
    cta: { href: '/newdesign/ClientApp.html#team', label: 'Message Tom' },
  });
  assert.equal(say({ state: 'paid', kind: 'subscription', coachName: 'Tom', itemName: null }).title, "You're working with Tom");
  assert.equal(say({ state: 'paid', kind: 'program', coachName: 'Tom', itemName: 'Strength 12' }).cta.href, '/newdesign/ClientApp.html#library');
  // Both return addresses use it; neither says anything of its own.
  for (const rel of ['src/app/purchase/success/page.tsx', 'src/app/subscribe/success/page.tsx']) {
    const src = read(rel).replace(/^\/\/[^\n]*\n/gm, '');
    // With the return address's acct (a direct charge's coach account), which readCheckoutReturn checks.
    assert.match(src, /const result = await readCheckoutReturn\(sessionId, acct\);/, rel);
    assert.match(src, /<CheckoutReturnView result=\{result\} \/>/, rel);
    assert.doesNotMatch(src, /went through|Payment confirmed|You&rsquo;re subscribed/, rel);
  }
});

// ── A refund takes a booked paid session off both calendars (Fable on #2373) ───────────────────────
async function refundSession({ purchase, session, fail = [] }) {
  const sent = [];
  const mod = await loadRealModule(join(ROOT, 'src/lib/refund-session.ts'), {
    typescript: true,
    registry: new Map([['@supabase/supabase-js', {}], ['@/lib/notify', { createNotification: async (_c, n) => { sent.push(n); return true; } }]]),
  });
  const updates = [];
  const db = fakeSupabase({ tables: {
    one_time_purchases: purchase ? [purchase] : [],
    trainers: [{ id: 7, owner_id: 'coach-1', name: 'Tom Trainer' }],
    profiles: [{ id: 'member-7', full_name: 'Cara Diaz' }],
  }, fail });
  // The session update, with the filters it was made under.
  db.from = ((from) => (table) => {
    if (table !== 'sessions') return from(table);
    const f = [];
    const q = {
      update: (patch) => { updates.push({ patch, f }); return q; },
      eq: (c, v) => { f.push(['eq', c, v]); return q; }, in: (c, v) => { f.push(['in', c, v]); return q; }, gt: (c, v) => { f.push(['gt', c, v]); return q; },
      select: async () => {
        if (fail.includes('sessions')) return { data: null, error: { message: 'down' } };
        const hit = session && f.every(([op, c, v]) => op === 'eq' ? session[c] === v : op === 'in' ? v.includes(session[c]) : String(session[c]) > String(v));
        return { data: hit ? [{ id: session.id }] : [], error: null };
      },
    };
    return q;
  })(db.from);
  const out = await mod.cancelRefundedSession(db, 'p-1');
  return { out, sent, updates };
}

test('a refunded paid session that is still ahead is cancelled, and both sides are told', async () => {
  const later = new Date(Date.now() + 3 * 86400000).toISOString();
  const earlier = new Date(Date.now() - 3 * 86400000).toISOString();
  const r = await refundSession({ purchase: paid('p-1', { status: 'refunded', session_id: 's-1' }), session: { id: 's-1', status: 'confirmed', scheduled_at: later } });
  assert.equal(r.out, 'cancelled');
  assert.deepEqual(r.updates[0].patch, { status: 'cancelled' });
  assert.deepEqual(r.updates[0].f.slice(0, 2), [['eq', 'id', 's-1'], ['in', 'status', ['requested', 'confirmed']]]);
  assert.deepEqual(r.sent.map((n) => [n.userId, n.type, n.route]), [['member-7', 'session_cancelled', 'sessions'], ['coach-1', 'session_cancelled', 'schedule']]);
  assert.match(r.sent[0].body, /with Tom Trainer was refunded/);
  assert.match(r.sent[1].body, /^Cara Diaz's paid session was refunded/);
  const R = await import(pathToFileURL(join(ROOT, 'public/newdesign/notificationRoutes.mjs')).href);
  assert.equal(R.canonicalRoute(r.sent[1].route, r.sent[1].data), 'schedule:trainer');
  // One that already happened, or was never booked, or a program: nothing to cancel, nobody told.
  for (const [purchase, session] of [
    [paid('p-1', { status: 'refunded', session_id: 's-1' }), { id: 's-1', status: 'confirmed', scheduled_at: earlier }],
    [paid('p-1', { status: 'refunded', session_id: 's-1' }), { id: 's-1', status: 'completed', scheduled_at: later }],
    [paid('p-1', { status: 'refunded' }), null],
    [paid('p-1', { status: 'refunded', kind: 'program', session_id: 's-1' }), { id: 's-1', status: 'confirmed', scheduled_at: later }],
  ]) {
    const x = await refundSession({ purchase, session });
    assert.equal(x.out, 'none');
    assert.equal(x.sent.length, 0);
  }
  assert.equal((await refundSession({ purchase: null, session: null, fail: ['one_time_purchases'] })).out, 'failed');
  // Both refund paths call it once the purchase is marked refunded.
  assert.match(read('src/app/dashboard/refunds/actions.ts'), /update\(\{ status: 'refunded' \}\)\.eq\('id', claimed\.one_time_purchase_id\);\s+\/\/[^\n]*\n\s+await cancelRefundedSession\(admin, claimed\.one_time_purchase_id\);/);
  assert.match(read('src/app/api/stripe/webhook/route.ts'), /\.eq\('status', 'pending'\);\s+\/\/[^\n]*\n\s+await cancelRefundedSession\(admin, purchase\.id\);/);
});
