// /api/coach/score reads the app's Bearer token (2026-10-18, WORKLOG known gap: "/api/coach/score
// returns 401 to the app's Bearer token"). The route was cookie-only (createClient + getUser), so
// the installed app's coach Score page could never read its own score. It now signs in through
// src/lib/request-auth.ts, as the analytics routes do, and answers an auth outage 503: a 401 is
// "signed out", which the website's Score page reads as "show the sample".
//
// The route runs for real here, with a fake Supabase behind the real request-auth and auth-lookup
// (tests/coach-analytics-routes.test.mjs's pattern).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(ROOT, 'package.json'));
const nextServer = require_('next/server');
const { AuthRetryableFetchError, AuthSessionMissingError, AuthApiError } = require_('@supabase/supabase-js');
const COACH = { id: '33333333-3333-4333-8333-333333333333' };
const APP_TOKEN = 'app-access-token';
const noUser = (error) => ({ data: { user: null }, error });
const NO_COOKIE = noUser(new AuthSessionMissingError());

// Every table answers from `tables`, with eq/in filters honoured, so a count is the matching rows.
// `cookieAuth` is what the cookie client's getUser resolves; `bearerAuth` what a token client's does
// (by default: APP_TOKEN is the coach, any other token nobody).
function fakeDb(tables, { cookieAuth = { data: { user: COACH }, error: null }, bearerAuth = null, errors = {} } = {}) {
  const db = { reads: [], readsAs: { cookie: [], token: [] }, bearer: [], providerOwner: [] };
  const client = (authFor, who) => ({
    from(table) {
      db.reads.push(table);
      db.readsAs[who].push(table);
      const ops = [];
      const rows = () => (tables[table] || []).filter((r) => ops.every(([op, col, v]) => (
        op === 'eq' ? r[col] === v : op === 'in' ? v.includes(r[col]) : true)));
      const q = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') {
            const owner = ops.find(([op, col]) => op === 'eq' && col === 'owner_id');
            if (owner) db.providerOwner.push(owner[2]);
            if (errors[table]) return (res, rej) => Promise.resolve({ data: null, error: errors[table], count: null }).then(res, rej);
            const order = ops.find(([op]) => op === 'order');
            const list = order ? rows().slice().sort((a, b) => (a[order[1]] < b[order[1]] ? -1 : 1) * (order[2] && order[2].ascending === false ? -1 : 1)) : rows();
            return (res, rej) => Promise.resolve({ data: list, error: null, count: list.length }).then(res, rej);
          }
          if (prop === 'maybeSingle') return async () => {
            const owner = ops.find(([op, col]) => op === 'eq' && col === 'owner_id');
            db.providerOwner.push(owner && owner[2]);
            return { data: rows()[0] ?? null, error: null };
          };
          return (...args) => { ops.push([prop, ...args]); return q; };
        },
      });
      return q;
    },
    auth: { getUser: authFor },
  });
  db.cookie = client(async () => cookieAuth, 'cookie');
  db.token = client(async (token) => bearerAuth ?? { data: { user: token === APP_TOKEN ? COACH : null }, error: null }, 'token');
  return db;
}

async function call(tables, opts = {}) {
  const db = fakeDb(tables, opts);
  const ts = (p, registry) => loadRealModule(join(ROOT, p), { typescript: true, registry });
  const requestAuth = await ts('src/lib/request-auth.ts', new Map([
    ['@/lib/supabase/server', { createClient: async () => db.cookie }],
    ['@supabase/supabase-js', { createClient: (_url, _key, o) => { db.bearer.push(o?.global?.headers?.Authorization); return db.token; } }],
  ]));
  const route = await ts('src/app/api/coach/score/route.ts', new Map([
    ['next/server', nextServer],
    ['@/lib/supabase/server', { createClient: async () => db.cookie }],
    ['@/lib/request-auth', requestAuth],
    ['@/lib/auth-lookup', await ts('src/lib/auth-lookup.ts', new Map())],
    ['@/lib/read-all-by-id', await ts('src/lib/read-all-by-id.ts', new Map())],
    ['@/lib/coach-trajectory.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/coach-trajectory.mjs')).href)],
  ]));
  const res = await route.GET(new Request(`https://shape.test/api/coach/score?role=${opts.role || 'trainer'}${opts.query || ''}`, { headers: opts.headers || {} }));
  return { status: res.status, body: await res.json(), ...db };
}

const recent = new Date(Date.now() - 5 * 86400000).toISOString();
// Trainer 7: three clients on active plans (one more ended), four sessions in 90 days with three
// completed, two programs. 3 × 50 + 75 × 10 + 2 × 80 = 1,060, a Pro.
const PRACTICE = {
  trainers: [{ id: 7, owner_id: COACH.id }],
  nutritionists: [{ id: 9, owner_id: COACH.id }],
  subscriptions: [
    { id: 's1', client_id: 'c1', provider_id: 7, provider_role: 'trainer', status: 'active' },
    { id: 's2', client_id: 'c2', provider_id: 7, provider_role: 'trainer', status: 'active' },
    { id: 's3', client_id: 'c3', provider_id: 7, provider_role: 'trainer', status: 'trialing' },
    { id: 's4', client_id: 'c4', provider_id: 7, provider_role: 'trainer', status: 'canceled' },
  ],
  sessions: [
    { provider_id: 7, provider_role: 'trainer', status: 'completed', scheduled_at: recent },
    { provider_id: 7, provider_role: 'trainer', status: 'completed', scheduled_at: recent },
    { provider_id: 7, provider_role: 'trainer', status: 'completed', scheduled_at: recent },
    { provider_id: 7, provider_role: 'trainer', status: 'scheduled', scheduled_at: recent },
  ],
  client_workouts: [{ trainer_id: 7 }, { trainer_id: 7 }],
};
const BEARER = { Authorization: `Bearer ${APP_TOKEN}` };

test('the app\'s Bearer token is read as the coach, and the reads run as that token', async () => {
  // No cookie session at all, as in the installed app.
  const r = await call(PRACTICE, { headers: BEARER, cookieAuth: NO_COOKIE });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.total, 1060);
  assert.equal(r.body.current_tier, 'Pro');
  assert.deepEqual(r.body.breakdown.map((b) => [b.label, b.points]), [['Active clients', 150], ['Session completion', 750], ['Programs published', 160]]);
  assert.deepEqual(r.providerOwner, [COACH.id], 'the listing read is the token\'s owner');
  assert.ok(r.bearer.length >= 1 && r.bearer.every((h) => h === `Bearer ${APP_TOKEN}`), `the token client was made for the token: ${r.bearer.join(', ')}`);
  // Every read ran on the token's client (RLS sees the coach), none on the cookie's (RLS sees nobody).
  assert.deepEqual(r.readsAs.cookie, [], 'a read ran on the cookie client');
  assert.deepEqual(r.readsAs.token.slice(0, 1), ['trainers']);
});

test('a token the auth server refuses, or one nobody owns, is a 401 and reads nothing', async () => {
  const unknown = await call(PRACTICE, { headers: { Authorization: 'Bearer expired' }, cookieAuth: NO_COOKIE });
  assert.equal(unknown.status, 401);
  assert.deepEqual(unknown.reads, []);
  const refused = await call(PRACTICE, { headers: BEARER, cookieAuth: NO_COOKIE, bearerAuth: noUser(new AuthApiError('invalid JWT', 403, 'bad_jwt')) });
  assert.equal(refused.status, 401);
  // A presented token is what is checked, as in every request-auth route: a refused token does not
  // fall through to whatever cookie rides along (the old route read only the cookie, and answered
  // the cookie's coach whatever token came with it).
  const withCookie = await call(PRACTICE, { headers: { Authorization: 'Bearer expired' } });
  assert.equal(withCookie.status, 401, JSON.stringify(withCookie.body));
  assert.deepEqual(withCookie.reads, []);
});

test('an auth outage is a 503, not a 401, on the token and on the cookie', async () => {
  const down = await call(PRACTICE, { headers: BEARER, cookieAuth: NO_COOKIE, bearerAuth: noUser(new AuthRetryableFetchError('fetch failed', 0)) });
  assert.equal(down.status, 503, JSON.stringify(down.body));
  assert.deepEqual(down.reads, []);
  const cookieDown = await call(PRACTICE, { cookieAuth: noUser(new AuthRetryableFetchError('fetch failed', 502)) });
  assert.equal(cookieDown.status, 503);
  assert.deepEqual(cookieDown.reads, []);
  // A 5xx with no session behind it is still a read that did not finish.
  const fiveHundred = await call(PRACTICE, { headers: BEARER, cookieAuth: NO_COOKIE, bearerAuth: noUser(new AuthApiError('upstream', 500, 'unexpected_failure')) });
  assert.equal(fiveHundred.status, 503);
});

test('the website\'s cookie still works, and a visitor with no session is a 401', async () => {
  const web = await call(PRACTICE);
  assert.equal(web.status, 200);
  assert.equal(web.body.total, 1060);
  assert.deepEqual(web.bearer, [], 'no token, no token client');
  assert.deepEqual(web.readsAs.token, []);
  const nutri = await call(PRACTICE, { role: 'nutritionist' });
  assert.equal(nutri.status, 200);
  assert.ok(nutri.reads.includes('nutritionists') && !nutri.reads.includes('client_workouts'));
  const out = await call(PRACTICE, { cookieAuth: NO_COOKIE });
  assert.equal(out.status, 401);
  assert.deepEqual(out.reads, []);
});

// ⚠ TWO LISTINGS OF ONE ROLE (Codex on #2400). owner_id is not unique; the listing read was
// maybeSingle, which errors on two rows, so the route answered 404 and the coach's Score page
// stayed unread for good.
test('a coach with two listings of one role gets a score: the oldest, or the one ?provider_id names when it is theirs', async () => {
  const two = {
    ...PRACTICE,
    trainers: [{ id: 8, owner_id: COACH.id }, { id: 7, owner_id: COACH.id }, { id: 12, owner_id: 'someone-else' }],
    subscriptions: [...PRACTICE.subscriptions, { provider_id: 8, provider_role: 'trainer', status: 'active' }, { provider_id: 12, provider_role: 'trainer', status: 'active' }],
  };
  const oldest = await call(two, { headers: BEARER, cookieAuth: NO_COOKIE });
  assert.equal(oldest.status, 200, JSON.stringify(oldest.body));
  assert.equal(oldest.body.total, 1060, 'listing 7, the oldest: the same score as with one listing');
  const named = await call(two, { headers: BEARER, cookieAuth: NO_COOKIE, query: '&provider_id=8' });
  assert.equal(named.status, 200);
  assert.equal(named.body.breakdown.find((b) => b.label === 'Active clients').points, 50, 'listing 8: its one client');
  const notTheirs = await call(two, { headers: BEARER, cookieAuth: NO_COOKIE, query: '&provider_id=12' });
  assert.equal(notTheirs.body.total, 1060, 'another coach\'s listing is never read: back to their own oldest');
});

test('a listing read that failed is a 503, not "no listing"', async () => {
  const failed = await call(PRACTICE, { headers: BEARER, cookieAuth: NO_COOKIE, errors: { trainers: { message: 'canceling statement due to statement timeout' } } });
  assert.equal(failed.status, 503, JSON.stringify(failed.body));
  const none = await call({ ...PRACTICE, trainers: [] }, { headers: BEARER, cookieAuth: NO_COOKIE });
  assert.equal(none.status, 404, 'no listing at all is still a 404');
});

// ⚠ CLIENTS, NOT PLANS, AND A RETRYING CLIENT COUNTS (owner, 2026-10-18; Codex on #2400). The term is
// "50 a client": a client on two plans with one coach is one client, a client whose payment is
// retrying keeps their coach and counts, and an ended plan does not.
test('the score counts distinct open clients: two plans are one client, a retrying client counts, an ended one does not', async () => {
  const subs = [
    { id: 's1', client_id: 'c1', provider_id: 7, provider_role: 'trainer', status: 'active' },
    { id: 's2', client_id: 'c1', provider_id: 7, provider_role: 'trainer', status: 'active' },
    { id: 's3', client_id: 'c2', provider_id: 7, provider_role: 'trainer', status: 'past_due' },
    { id: 's4', client_id: 'c3', provider_id: 7, provider_role: 'trainer', status: 'trialing' },
    { id: 's5', client_id: 'c4', provider_id: 7, provider_role: 'trainer', status: 'canceled' },
    { id: 's6', client_id: 'c5', provider_id: 7, provider_role: 'trainer', status: 'unpaid' },
    { id: 's7', client_id: null, provider_id: 7, provider_role: 'trainer', status: 'active' },
    { id: 's8', client_id: 'c1', provider_id: 8, provider_role: 'trainer', status: 'active' },
  ];
  const r = await call({ ...PRACTICE, subscriptions: subs }, { headers: BEARER, cookieAuth: NO_COOKIE });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const active = r.body.breakdown.find((b) => b.label === 'Active clients');
  assert.equal(active.points, 4 * 50, 'c1 (two plans), c2 (retrying), c3 (trialing) and one row with no client');
  assert.equal(active.sub, '4 clients');
  // A failed or overlong walk is a failed count, never a zero.
  const failed = await call(PRACTICE, { headers: BEARER, cookieAuth: NO_COOKIE, errors: { subscriptions: { message: 'timeout' } } });
  assert.equal(failed.status, 500);
});

test('the directory and the leaderboard count the same way (2026-10-18-coach-score-distinct-clients.sql)', () => {
  const sql = readFileSync(join(ROOT, 'supabase-migrations/2026-10-18-coach-score-distinct-clients.sql'), 'utf8');
  const code = sql.replace(/--[^\n]*/g, '');
  for (const name of ['get_coach_scores', 'shape_coach_score_parts']) {
    const at = code.indexOf(`create or replace function public.${name}(`);
    assert.ok(at >= 0, name);
    const body = code.slice(at, code.indexOf('$function$;', at));
    assert.match(body, /count\(distinct coalesce\(s\.client_id::text, 'sub:' \|\| s\.id::text\)\)\s+filter \(where s\.status in \('active', 'trialing', 'past_due'\)\) as active_clients/, name + ': distinct open clients');
    assert.doesNotMatch(body, /count\(\*\) filter \(where s\.status in \('active', 'trialing'\)\)/, name + ': still counts plans');
    assert.match(body, /set search_path = public, pg_temp/, name);
  }
  const scores = code.slice(code.indexOf('function public.get_coach_scores('), code.indexOf('function public.shape_coach_score_parts('));
  assert.match(scores, /language plpgsql\s+stable\s+security definer/, 'get_coach_scores stays a definer');
  const parts = code.slice(code.indexOf('function public.shape_coach_score_parts('));
  assert.doesNotMatch(parts.slice(0, parts.indexOf('$function$')), /security definer/, 'the score parts stay an invoker');
  assert.doesNotMatch(code, /^\s*(grant|revoke|drop function|alter function)\b/im, 'create or replace keeps owner and grants');
  assert.match(code, /^begin;/m);
  assert.match(code, /do \$check\$[\s\S]*raise exception '%: does not count distinct open clients'[\s\S]*\$check\$;\s*commit;/);
  // the route says where its twin lives
  assert.match(readFileSync(join(ROOT, 'src/app/api/coach/score/route.ts'), 'utf8'), /KEEP IN SYNC with supabase-migrations\/2026-10-18-coach-score-distinct-clients\.sql/);
});
