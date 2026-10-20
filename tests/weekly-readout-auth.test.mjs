// /api/ai/weekly-readout reads the app's Bearer token (2026-10-20). The route was cookie-only
// (createClient + getUser), and the installed app posts cross-origin with its access token and no
// cookie, so window.ShapeReadout.get() was always answered 401 and Progress → Overall's "The read ·
// this week" card never rendered. The route now signs in through src/lib/request-auth.ts, as the
// other member AI routes do.
//
// What must not move with it: the claim is still taken AS THE CALLER (the RPC's own self-or-coach
// check decides whose readout this is), the snapshot read is still the caller's (row rules), and
// finalize and release still go through the service-role client.
//
// The route runs for real here, with the real request-auth and request-utils over a fake Supabase.
// Each fake client answers as the account its credential names, the way PostgREST sets auth.uid()
// from the token it is sent: the claim RPC raises "Not permitted" for a caller who is neither the
// member nor their coach (supabase-migrations/2026-08-29-ai-weekly-readouts.sql), and the snapshot
// read returns only rows the caller may see.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import * as readoutLib from '../src/lib/weekly-readout.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(ROOT, 'package.json'));
const nextServer = require_('next/server');
const { AuthSessionMissingError } = require_('@supabase/supabase-js');

const MEMBER = '11111111-1111-4111-8111-111111111111';
const STRANGER = '22222222-2222-4222-8222-222222222222';
const COACH = '33333333-3333-4333-8333-333333333333';
const APP_TOKEN = 'member-app-token';
const COACH_TOKEN = 'coach-app-token';
const STRANGER_TOKEN = 'stranger-app-token';
const TOKENS = { [APP_TOKEN]: MEMBER, [COACH_TOKEN]: COACH, [STRANGER_TOKEN]: STRANGER };
// Who coaches whom (is_coach_on_client).
const COACHES = { [COACH]: [MEMBER] };
const canSee = (uid, subject) => !!uid && (uid === subject || (COACHES[uid] || []).includes(subject));

const CORRELATIONS = [{
  x: 'sleep_quality', y: 'energy', lagDays: 0, label: 'Rested rating ↔ that morning’s energy',
  explanation: 'Both are self-reports.', r: 0.62, n: 12, pValue: 0.01, qValue: 0.05,
  strength: 'strong', direction: 'positive', series: [],
}];
const MODEL = {
  summary: 'One pattern stands out.',
  insights: [{ headline: 'Rested and energy', detail: 'd', correlation_key: 'sleep_quality->energy@lag0', evidence_chart: 'scatter', recommendation: 'r' }],
};

function world({ cookieUser = null } = {}) {
  const w = { ops: [], tokenClients: [], admin: [], ai: [] };
  // One fake Supabase client per credential. `as` is what the client was made from; `uid` is the
  // account the database sees behind it.
  const client = (as, uid) => ({
    auth: {
      getUser: async (jwt) => {
        w.ops.push({ as, op: 'getUser', jwt });
        if (as === 'cookie') return cookieUser ? { data: { user: { id: cookieUser } }, error: null } : { data: { user: null }, error: new AuthSessionMissingError() };
        // A token client reads the token it is handed; with none it has no session to read.
        const id = jwt ? TOKENS[jwt] : null;
        return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: jwt ? { message: 'invalid JWT', status: 403 } : new AuthSessionMissingError() };
      },
    },
    async rpc(name, args) {
      w.ops.push({ as, op: 'rpc', name, args });
      if (name !== 'claim_weekly_readout') return { data: null, error: { code: '42501', message: `permission denied for function ${name}` } };
      if (!uid) return { data: null, error: { code: 'P0001', message: 'Authentication is required.' } };
      if (!canSee(uid, args.p_user_id)) return { data: null, error: { code: 'P0001', message: "Not permitted to read this member's readout." } };
      return { data: [{ outcome: 'claimed', claim_token: `claim-for-${args.p_user_id}`, readout: null, correlations: null, source: null, window_days: null, sample_size: null, generated_at: null }], error: null };
    },
    from(table) {
      const filters = [];
      const q = {
        select: () => q, gte: () => q, order: () => q, returns: () => q,
        eq: (col, v) => { filters.push([col, v]); return q; },
        then: (res, rej) => {
          w.ops.push({ as, op: 'from', table, filters });
          const subject = (filters.find(([c]) => c === 'user_id') || [])[1];
          const rows = canSee(uid, subject) ? [{ snapshot_date: '2026-10-18', user_id: subject }] : [];
          return Promise.resolve({ data: rows, error: null }).then(res, rej);
        },
      };
      return q;
    },
  });
  w.cookie = client('cookie', cookieUser);
  w.makeTokenClient = (authorization) => {
    w.tokenClients.push(authorization);
    const token = String(authorization || '').replace(/^Bearer\s+/i, '');
    return client(`token:${token}`, TOKENS[token] ?? null);
  };
  return w;
}

async function post({ headers = {}, body, cookieUser = null } = {}) {
  const w = world({ cookieUser });
  const ts = (p, registry) => loadRealModule(join(ROOT, p), { typescript: true, registry });
  const requestAuth = await ts('src/lib/request-auth.ts', new Map([
    ['@/lib/supabase/server', { createClient: async () => w.cookie }],
    ['@supabase/supabase-js', { createClient: (_url, _key, o) => w.makeTokenClient(o?.global?.headers?.Authorization) }],
  ]));
  const route = await ts('src/app/api/ai/weekly-readout/route.ts', new Map([
    ['next/server', nextServer],
    ['@/lib/request-auth', requestAuth],
    ['@/lib/request-utils', await ts('src/lib/request-utils.ts', new Map([['next/server', nextServer]]))],
    ['@/lib/ai', { hasOpenAIKey: () => true, callAI: async (req) => { w.ai.push(req); return { ok: true, data: { output_text: JSON.stringify(MODEL) } }; } }],
    ['@/lib/require-membership', { requireMembership: async () => null }],
    ['@/lib/correlations', { computeCorrelations: () => CORRELATIONS, SNAPSHOT_SELECT: '*' }],
    ['@/lib/weekly-readout.mjs', readoutLib],
    ['@/lib/supabase/admin', { createAdminClient: () => ({
      async rpc(name, args) { w.admin.push({ name, args }); return { data: null, error: null }; },
      from() { throw new Error('the service-role client never reads the snapshot'); },
    }) }],
  ]));
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await route.POST(new Request('https://theshapecommunity.com/api/ai/weekly-readout', init));
  const data = await res.json();
  const dbOps = w.ops.filter((o) => o.op !== 'getUser');
  return { status: res.status, body: data, ...w, dbOps };
}

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const opsAs = (r, as) => r.dbOps.filter((o) => o.as === as).map((o) => (o.op === 'rpc' ? `rpc:${o.name}` : `from:${o.table}`));

test('the app\'s Bearer token with no cookie is the member, and the claim and the read run as that token', async () => {
  const r = await post({ headers: bearer(APP_TOKEN), body: { window_days: 28 } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.user_id, MEMBER, 'the readout is about the token\'s account');
  assert.equal(r.body.source, 'openai');
  assert.ok(r.tokenClients.length >= 1 && r.tokenClients.every((h) => h === `Bearer ${APP_TOKEN}`), `token clients: ${r.tokenClients.join(', ')}`);
  // The user came from the token itself, not from a session the token client does not have.
  assert.ok(r.ops.some((o) => o.op === 'getUser' && o.as === `token:${APP_TOKEN}` && o.jwt === APP_TOKEN));
  assert.ok(!r.ops.some((o) => o.op === 'getUser' && o.as === `token:${APP_TOKEN}` && !o.jwt), 'getUser() with no token on a Bearer client finds nobody');
  // Every query the caller makes runs on the token's client; none on the cookie's.
  assert.deepEqual(opsAs(r, `token:${APP_TOKEN}`), ['rpc:claim_weekly_readout', 'from:daily_health_snapshot']);
  assert.deepEqual(opsAs(r, 'cookie'), []);
  const claim = r.dbOps.find((o) => o.op === 'rpc');
  assert.equal(claim.args.p_user_id, MEMBER);
  assert.deepEqual(r.dbOps.find((o) => o.op === 'from').filters, [['user_id', MEMBER]]);
  // The write is the server's, under the claim the token's call won: never the caller's client.
  assert.deepEqual(r.admin.map((a) => [a.name, a.args.p_user_id, a.args.p_claim_token]), [['finalize_weekly_readout', MEMBER, `claim-for-${MEMBER}`]]);
  assert.ok(!r.dbOps.some((o) => o.op === 'rpc' && /finalize|release/.test(o.name)), 'finalize or release ran on the caller\'s client');
  assert.equal(r.ai.length, 1, 'one model call, under the claim');
});

test('no token and no cookie is a 401, and nothing is claimed, read, written or generated', async () => {
  for (const r of [
    await post({}),
    await post({ body: { user_id: MEMBER } }),
    // A token nobody owns, with no cookie behind it, as an expired app session.
    await post({ headers: bearer('expired-token') }),
  ]) {
    assert.equal(r.status, 401, JSON.stringify(r.body));
    assert.equal(r.body.error, 'Authentication required.');
    assert.deepEqual(r.dbOps, [], 'a query ran for a caller nobody signed in');
    assert.deepEqual(r.admin, []);
    assert.deepEqual(r.ai, []);
  }
  // A presented token is what is checked (request-auth's rule): a refused token does not fall
  // through to a cookie riding along with it.
  const refused = await post({ headers: bearer('expired-token'), cookieUser: MEMBER });
  assert.equal(refused.status, 401);
  assert.deepEqual(refused.dbOps, []);
  assert.deepEqual(refused.ai, []);
});

test('the website\'s cookie still works as before, on the cookie client alone', async () => {
  const r = await post({ cookieUser: MEMBER, body: { window_days: 28 } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.user_id, MEMBER);
  assert.deepEqual(r.tokenClients, [], 'no token, no token client');
  assert.deepEqual(opsAs(r, 'cookie'), ['rpc:claim_weekly_readout', 'from:daily_health_snapshot']);
  assert.equal(r.dbOps.find((o) => o.op === 'rpc').args.p_user_id, MEMBER);
  assert.ok(r.ops.some((o) => o.op === 'getUser' && o.as === 'cookie'));
  assert.deepEqual(r.admin.map((a) => a.name), ['finalize_weekly_readout']);
  // An empty body, as the hosted /m/ app sends none, reads the caller's own readout.
  const empty = await post({ cookieUser: MEMBER });
  assert.equal(empty.status, 200);
  assert.equal(empty.dbOps.find((o) => o.op === 'rpc').args.p_user_id, MEMBER);
});

test('a coach\'s request for a client goes through the claim RPC\'s check, on the coach\'s token', async () => {
  const r = await post({ headers: bearer(COACH_TOKEN), body: { user_id: MEMBER } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.user_id, MEMBER);
  assert.deepEqual(opsAs(r, `token:${COACH_TOKEN}`), ['rpc:claim_weekly_readout', 'from:daily_health_snapshot']);
  assert.equal(r.dbOps[0].args.p_user_id, MEMBER, 'the claim names the client, so the RPC checks is_coach_on_client');
  assert.deepEqual(r.dbOps[1].filters, [['user_id', MEMBER]]);
  assert.deepEqual(r.admin.map((a) => [a.name, a.args.p_user_id]), [['finalize_weekly_readout', MEMBER]]);
});

test('a caller-supplied user_id is never trusted without the RPC: a stranger is a 403 that reads and spends nothing', async () => {
  for (const r of [
    // A member's token naming someone else, a coach naming someone they don't coach, and the
    // same over the cookie.
    await post({ headers: bearer(STRANGER_TOKEN), body: { user_id: MEMBER } }),
    await post({ headers: bearer(COACH_TOKEN), body: { user_id: STRANGER } }),
    await post({ cookieUser: STRANGER, body: { user_id: MEMBER } }),
  ]) {
    assert.equal(r.status, 403, JSON.stringify(r.body));
    assert.equal(r.body.error, 'Not permitted to read this readout.');
    // The claim RPC was asked, and it was the only thing asked: no read, no write, no model call.
    assert.equal(r.dbOps.length, 1);
    assert.equal(r.dbOps[0].op, 'rpc');
    assert.equal(r.dbOps[0].name, 'claim_weekly_readout');
    assert.notEqual(r.dbOps[0].args.p_user_id, undefined);
    assert.deepEqual(r.admin, []);
    assert.deepEqual(r.ai, []);
  }
  // The cookie's account does not lend its rights to a token for another: the member's own cookie
  // riding along with a stranger's token is still the stranger asking.
  const mixed = await post({ headers: bearer(STRANGER_TOKEN), cookieUser: MEMBER, body: { user_id: MEMBER } });
  assert.equal(mixed.status, 403);
  assert.deepEqual(opsAs(mixed, 'cookie'), []);
});
