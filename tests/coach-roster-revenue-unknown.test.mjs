// `coachClientsResponse`, DRIVEN with a failing subscriptions read.
//
// ⚠ WHY DRIVEN. The defect is invisible to a source scan and cannot be produced
// by a real database here: PostgREST returns `{ data: null, error }` for a
// subscriptions query that RLS, a schema drift or a transient fault rejects, and
// the route went on to build session-derived clients with mrrCents 0. The
// roster then rendered a confident "$0/mo" on every row — reporting "we could
// not ask what this client pays" as the measurement "they pay nothing".
// Only scripting the error puts the route in that state at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const UID = '11111111-1111-4111-8111-111111111111';

// A scripted client: the provider lookup resolves, then `subscriptions` and
// `sessions` answer from the table name. It answers whatever it was scripted with, whatever the
// filters (so the route's own handling of each row is what is tested), and RECORDS every filter as
// [table, op, column, value], so a test can say which statuses the read asked for.
function makeClient({ subs = { data: [], error: null }, sess = { data: [], error: null }, names = { data: [], error: null } } = {}) {
  const filters = [];
  const thenable = (table, result) => {
    const chain = {
      select: () => chain,
      eq: (col, v) => { filters.push([table, 'eq', col, v]); return chain; },
      in: (col, v) => { filters.push([table, 'in', col, v]); return Promise.resolve(result); },
      order: () => chain,
      limit: () => Promise.resolve(result),
      maybeSingle: async () => result,
      then: (res, rej) => Promise.resolve(result).then(res, rej),
    };
    return chain;
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: UID } } }) },
    // get_display_names (fix 4, M12): the roster's names.
    rpcs: [],
    filters,
    async rpc(name, args) { this.rpcs.push([name, args]); return names; },
    from(table) {
      if (table === 'subscriptions') return thenable(table, subs);
      if (table === 'sessions') return thenable(table, sess);
      return thenable(table, { data: { id: 7 }, error: null }); // trainers / nutritionists
    },
  };
}

async function load(client) {
  return loadRealModule(join(ROOT, 'src/lib/coach-roster.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', {
        clientForRequest: async () => client,
        currentUser: async () => ({ id: UID }),
      }],
      ['@/lib/time', await import(pathToFileURL(join(ROOT, 'src/lib/time.ts')).href).catch(() => ({ DAY_MS: 86400000 }))],
      ['@/lib/coach-messages', await loadRealModule(join(ROOT, 'src/lib/coach-messages.ts'), { typescript: true, registry: new Map([['@/lib/supabase/server', {}]]) })],
    ]),
  });
}

const SESSIONS = {
  data: [
    { client_id: 'u1', client_name: 'Ana R.', scheduled_at: new Date(Date.now() - 2 * 86400000).toISOString() },
    { client_id: 'u2', client_name: 'Ben T.', scheduled_at: new Date(Date.now() - 3 * 86400000).toISOString() },
  ],
  error: null,
};

test('a failed subscriptions read reports unknown revenue, not $0', async () => {
  const mod = await load(makeClient({
    subs: { data: null, error: { message: 'permission denied for table subscriptions' } },
    sess: SESSIONS,
  }));
  const res = await mod.coachClientsResponse('trainer', new Request('https://x/api/trainer/clients'));
  const body = await res.json();

  assert.equal(body.isTrainer, true, 'the route still answers — only the money is unknown');
  assert.equal(body.clients.length, 2, 'the session-derived roster still renders');
  for (const c of body.clients) {
    assert.equal(c.mrrCents, null, `${c.name}: an unreadable leg must be null, never 0`);
  }
  assert.equal(body.totals.mrrCents, null, 'and the total cannot be a measured zero either');
  assert.equal(body.totals.active, 2, 'the headcount is session-derived and still known');
});

test('a successful read with no subscriptions is a real $0, not unknown', async () => {
  // ⚠ THE OTHER HALF OF THE SAME DISTINCTION. If this returned null too, the
  // fix would have traded one collapse for its mirror image.
  const mod = await load(makeClient({ subs: { data: [], error: null }, sess: SESSIONS }));
  const body = await (await mod.coachClientsResponse('trainer', new Request('https://x/api/trainer/clients'))).json();
  for (const c of body.clients) assert.equal(c.mrrCents, 0, `${c.name}: a client on no paid plan is a measured zero`);
  assert.equal(body.totals.mrrCents, 0);
});

test('a successful read sums the subscription rows and dates the tenure', async () => {
  const joined = new Date(Date.now() - 120 * 86400000).toISOString();
  const mod = await load(makeClient({
    subs: { data: [{ client_id: 'u1', price_cents: 18000, status: 'active', created_at: joined }], error: null },
    sess: SESSIONS,
  }));
  const body = await (await mod.coachClientsResponse('trainer', new Request('https://x/api/trainer/clients'))).json();
  const ana = body.clients.find((c) => c.id === 'u1');
  assert.equal(ana.mrrCents, 18000);
  assert.equal(ana.joinedAt, joined);
  assert.equal(body.totals.mrrCents, 18000);
});

// ── The same collapse in both /analytics routes ──────────────────────────────
// `const { data: subRows } = await …` discarded the error, `subs = subRows ?? []`
// turned it into an empty list, and the route still answered with a role-valid
// payload reporting zero active clients and zero MRR. The Goal page then showed
// those under a LIVE label and the revenue calculator adopted a $0 pace.
//
// ⚠ PINNED AT THE SOURCE, NOT DRIVEN, and the reason is worth stating: each
// route makes a dozen further reads and two RPCs before it answers, so scripting
// one to reach its response body tests the script more than the route. The
// CONSUMER half — a null figure rendering as "could not be read" rather than a
// zero — is driven in dash-roster-columns.test.mjs. What is left to pin here is
// that the error reaches the payload at all.
import { readFileSync } from 'node:fs';

for (const role of ['trainer', 'nutritionist']) {
  test(`/api/${role}/analytics keeps its subscriptions error`, () => {
    const src = readFileSync(new URL(`../src/app/api/${role}/analytics/route.ts`, import.meta.url), 'utf8');
    // The primary read destructures the error…
    // (Both routes page it, through readAllById; the error is kept all the same.)
    assert.match(src, /const \{ data: subRows, error: subErr \} = await readAllById</);
    assert.match(src, /const subsUnknown = !!subErr;/);
    // …and every subscription-derived figure it publishes goes null when it fired.
    assert.match(src, /mrrGrossCents: subsUnknown \? null : grossCents,/);
    assert.match(src, /mrrNetCents: subsUnknown \? null : netCents,/);
    // Both routes count each client once (one client can hold two active rows: Codex on #2324 for
    // the trainer route, the Business review of 2026-10-17 for the nutritionist's). Either goes
    // null on a failed read.
    assert.match(src, /const activeClients = subsUnknown \? null : clientIds\.length;/);
    // ⚠ AND NOTHING STILL PUBLISHES THE RAW ROW COUNT. `activeClients: subs.length`
    // appeared THREE times — metrics, clientProgress and ticker — so fixing one
    // and leaving two would have left the same zero on two surfaces.
    assert.ok(
      !/activeClients: subs\.length/.test(src),
      'a surface still publishes the raw row count, which is 0 on a failed read'
    );
  });
}

// ── Fix 4 (client-onboarding review, M12): a subscriber who has not booked has a name ─────────────
test('a new subscriber reads their own name, not "Client", before any booking', async () => {
  const now = Date.now();
  const client = makeClient({
    subs: { data: [{ id: 1, client_id: 'u9', price_cents: 9900, status: 'active', created_at: new Date(now - 86400000).toISOString() }], error: null },
    sess: SESSIONS,
    names: { data: [{ user_id: 'u9', full_name: 'Jordan Reyes' }, { user_id: 'u1', full_name: '  ' }], error: null },
  });
  const mod = await load(client);
  const body = await (await mod.coachClientsResponse('trainer', new Request('https://x/api/trainer/clients'))).json();
  const byId = Object.fromEntries(body.clients.map((c) => [c.id, c]));
  assert.equal(byId.u9.name, 'Jordan Reyes', 'the subscriber with no booking');
  assert.equal(byId.u9.isNew, true);
  assert.equal(byId.u1.name, 'Ana R.', 'a blank display name keeps the booking name');
  assert.equal(byId.u2.name, 'Ben T.');
  assert.deepEqual(client.rpcs.map(([n]) => n), ['get_display_names']);
  assert.deepEqual([...client.rpcs[0][1].p_ids].sort(), ['u1', 'u2', 'u9']);
});

test('a failed name lookup keeps the booking names, and a roster over 200 reads in chunks', async () => {
  const failed = makeClient({ sess: SESSIONS, names: { data: null, error: { message: 'boom' } } });
  const body = await (await (await load(failed)).coachClientsResponse('trainer', new Request('https://x/api/trainer/clients'))).json();
  assert.deepEqual(body.clients.map((c) => c.name).sort(), ['Ana R.', 'Ben T.']);
  const subs = Array.from({ length: 450 }, (_, i) => ({ id: i, client_id: 'c' + i, price_cents: 100, status: 'active', created_at: new Date(Date.now() - 60000).toISOString() }));
  const big = makeClient({ subs: { data: subs, error: null } });
  await (await load(big)).coachClientsResponse('trainer', new Request('https://x/api/trainer/clients'));
  assert.deepEqual(big.rpcs.map(([, a]) => a.p_ids.length), [200, 200, 50], 'get_display_names refuses more than 200 ids');
});

// ── Owner, 2026-10-18: a client whose payment is retrying keeps their coach ─────────────────────
// "They stay normal clients until Stripe gives up: on the list, with logs visible, and the coach can
// still send them plans." The roster read stopped at active and trialing, so a past_due client left
// the list while the Clients badge (the dashboard routes' practiceToday) still counted them.
test('a client whose payment is retrying is listed, named, flagged and their plan counted; the read asks for every open status', async () => {
  const joined = new Date(Date.now() - 60 * 86400000).toISOString();
  const client = makeClient({
    subs: { data: [
      { id: 1, client_id: 'u1', price_cents: 18000, fee_bps: 1500, status: 'active', created_at: joined },
      { id: 2, client_id: 'u7', price_cents: 12000, fee_bps: 0, status: 'past_due', created_at: joined, origin: 'coach_link' },
      { id: 3, client_id: 'u8', price_cents: 9000, status: 'trialing', created_at: joined },
    ], error: null },
    sess: SESSIONS,
    names: { data: [{ user_id: 'u7', full_name: 'Priya Shah' }], error: null },
  });
  const body = await (await (await load(client)).coachClientsResponse('trainer', new Request('https://x/api/trainer/clients'))).json();
  // The read itself: this coach's rows, every open status (coach-trajectory.mjs OPEN_SUB_STATUSES).
  assert.deepEqual(client.filters.filter(([t]) => t === 'subscriptions'),
    [['subscriptions', 'eq', 'provider_role', 'trainer'], ['subscriptions', 'eq', 'provider_id', 7], ['subscriptions', 'in', 'status', ['active', 'trialing', 'past_due']]]);
  const byId = Object.fromEntries(body.clients.map((c) => [c.id, c]));
  const priya = byId.u7;
  assert.ok(priya, 'listed');
  assert.equal(priya.name, 'Priya Shah', 'named');
  assert.equal(priya.paymentRetrying, true, 'flagged');
  assert.equal(priya.onPlan, true);
  assert.equal(priya.mrrCents, 12000, 'her plan is counted');
  assert.equal(priya.feeCents, 0);
  assert.equal(priya.origin, 'coach_link');
  assert.equal(priya.joinedAt, joined);
  for (const id of ['u1', 'u8']) {
    assert.equal(byId[id].paymentRetrying, false, id + ' is not retrying');
    assert.equal(byId[id].onPlan, true, id);
  }
  // Ben booked a session and holds no plan: on the list, not on a plan.
  assert.equal(byId.u2.onPlan, false);
  assert.equal(byId.u2.paymentRetrying, false);
  assert.equal(body.totals.mrrCents, 18000 + 12000 + 9000);
  assert.deepEqual([body.totals.active, body.totals.onPlan], [4, 3], 'four people on the list, three of them on a plan');
});

test('the roster keeps exactly the rows the badge counts (openSubsAt): an ended, never-started or not-yet-started row is no plan', async () => {
  const joined = new Date(Date.now() - 60 * 86400000).toISOString();
  const client = makeClient({ subs: { data: [
    { id: 1, client_id: 'u1', price_cents: 18000, status: 'active', created_at: joined },
    // Rows a looser read (or a status nobody filtered) would hand over: none of them is a plan today.
    { id: 2, client_id: 'u3', price_cents: 5000, status: 'canceled', created_at: joined, current_period_end: new Date(Date.now() + 9 * 86400000).toISOString() },
    { id: 3, client_id: 'u4', price_cents: 5000, status: 'incomplete', created_at: joined },
    { id: 4, client_id: 'u5', price_cents: 5000, status: 'unpaid', created_at: joined },
    { id: 5, client_id: 'u6', price_cents: 5000, status: 'past_due', created_at: new Date(Date.now() + 86400000).toISOString() },
  ], error: null } });
  const body = await (await (await load(client)).coachClientsResponse('trainer', new Request('https://x/api/trainer/clients'))).json();
  assert.deepEqual(body.clients.map((c) => c.id), ['u1']);
  assert.deepEqual([body.totals.onPlan, body.totals.mrrCents], [1, 18000]);
});

test('a failed subscriptions read leaves "on a plan" unknown, never "no plan"', async () => {
  const body = await (await (await load(makeClient({ subs: { data: null, error: { message: 'boom' } }, sess: SESSIONS }))).coachClientsResponse('trainer', new Request('https://x/api/trainer/clients'))).json();
  assert.deepEqual(body.clients.map((c) => c.onPlan), [null, null]);
  assert.equal(body.totals.onPlan, null);
  assert.deepEqual(body.clients.map((c) => c.paymentRetrying), [false, false]);
});
