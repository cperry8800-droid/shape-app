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
// `sessions` answer from the table name.
function makeClient({ subs = { data: [], error: null }, sess = { data: [], error: null } } = {}) {
  const thenable = (result) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => Promise.resolve(result),
      order: () => chain,
      limit: () => Promise.resolve(result),
      maybeSingle: async () => result,
      then: (res, rej) => Promise.resolve(result).then(res, rej),
    };
    return chain;
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: UID } } }) },
    from(table) {
      if (table === 'subscriptions') return thenable(subs);
      if (table === 'sessions') return thenable(sess);
      return thenable({ data: { id: 7 }, error: null }); // trainers / nutritionists
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
    assert.match(src, /const \{ data: subRows, error: subErr \} = await supabase/);
    assert.match(src, /const subsUnknown = !!subErr;/);
    // …and every subscription-derived figure it publishes goes null when it fired.
    assert.match(src, /mrrGrossCents: subsUnknown \? null : grossCents,/);
    assert.match(src, /mrrNetCents: subsUnknown \? null : netCents,/);
    assert.match(src, /const activeClients = subsUnknown \? null : subs\.length;/);
    // ⚠ AND NOTHING STILL PUBLISHES THE RAW ROW COUNT. `activeClients: subs.length`
    // appeared THREE times — metrics, clientProgress and ticker — so fixing one
    // and leaving two would have left the same zero on two surfaces.
    assert.ok(
      !/activeClients: subs\.length/.test(src),
      'a surface still publishes the raw row count, which is 0 on a failed read'
    );
  });
}
