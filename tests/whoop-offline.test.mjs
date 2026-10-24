// WHOOP stays connected (2026-10-24). Shape asked WHOOP for read scopes only, so WHOOP sent no
// refresh token and its hour-long access token was the whole connection: the one WHOOP connection
// on file expired the day it was made and never synced. Sign-in now asks for `offline`, a refresh
// names `offline` as WHOOP's own example does (and keeps the new refresh token WHOOP rotates in),
// and a token WHOOP refuses says to connect again instead of "WHOOP sync failed."
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const providers = await loadRealModule(join(ROOT, 'src/lib/integrations/providers.ts'), { typescript: true });

test('WHOOP sign-in asks for offline, and only WHOOP names a scope on refresh', () => {
  const whoop = providers.getProvider('whoop');
  assert.ok(whoop.scope.split(' ').includes('offline'), 'no refresh token without offline');
  assert.equal(whoop.refreshScope, 'offline');
  for (const id of ['strava', 'spotify', 'garmin', 'oura']) {
    const cfg = providers.getProvider(id);
    if (cfg) assert.equal(cfg.refreshScope, undefined, `${id} sends no refresh scope`);
  }
});

function admin(row) {
  const saved = [];
  return {
    saved,
    createAdminClient: () => ({
      from: () => {
        const chain = {
          select: () => chain, eq: () => chain,
          maybeSingle: async () => ({ data: row, error: null }),
          upsert: async (r) => { saved.push(r); return { error: null }; },
        };
        return chain;
      },
    }),
  };
}

async function refreshWith(provider) {
  const db = admin({ access_token: 'old', refresh_token: 'r1', expires_at: new Date(Date.now() - 3600e3).toISOString(), scope: 'offline read:sleep', provider_user_id: 'p1' });
  const tokens = await loadRealModule(join(ROOT, 'src/lib/integrations/tokens.ts'), {
    typescript: true,
    registry: new Map([['@/lib/supabase/admin', db], ['./providers', providers]]),
  });
  const sent = [];
  const fetchWas = globalThis.fetch;
  const envWas = { ...process.env };
  Object.assign(process.env, { WHOOP_CLIENT_ID: 'id', WHOOP_CLIENT_SECRET: 'sec', STRAVA_CLIENT_ID: 'id', STRAVA_CLIENT_SECRET: 'sec' });
  globalThis.fetch = async (url, init) => { sent.push({ url, body: new URLSearchParams(String(init.body)) }); return { ok: true, json: async () => ({ access_token: 'new', refresh_token: 'r2', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 }) }; };
  try {
    const token = await tokens.getFreshAccessToken('u1', provider);
    return { token, sent, saved: db.saved };
  } finally {
    globalThis.fetch = fetchWas;
    for (const k of Object.keys(process.env)) if (!(k in envWas)) delete process.env[k];
  }
}

test('a WHOOP refresh names offline and keeps the refresh token WHOOP rotates in', async () => {
  const { token, sent, saved } = await refreshWith('whoop');
  assert.equal(token, 'new');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://api.prod.whoop.com/oauth/oauth2/token');
  assert.equal(sent[0].body.get('grant_type'), 'refresh_token');
  assert.equal(sent[0].body.get('refresh_token'), 'r1');
  assert.equal(sent[0].body.get('scope'), 'offline');
  assert.equal(saved[0].refresh_token, 'r2', 'the old refresh token is spent once used');
});

test('a Strava refresh is unchanged: no scope', async () => {
  const { sent } = await refreshWith('strava');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.has('scope'), false);
});

async function syncAnswering(status) {
  const route = await loadRealModule(join(ROOT, 'src/app/api/integrations/whoop/sync/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@supabase/supabase-js', {}],
      ['@/lib/request-auth', { currentUser: async () => ({ id: 'u1', email: 'ann@shape.test' }), clientForRequest: async () => ({ from: () => { const c = { select: () => c, eq: () => c, maybeSingle: async () => ({ data: null, error: null }) }; return c; } }) }],
      ['@/lib/request-utils', { dbError: (_e, _tag, code, msg) => nextServer.NextResponse.json({ error: msg }, { status: code }) }],
      ['@/lib/integrations/tokens', { getFreshAccessToken: async () => 'tok' }],
      ['@/lib/health-snapshot', { writeWhoopSnapshots: async () => ({ days: 0 }) }],
      ['@/lib/workout-share', { resolveWorkoutSharePrivacy: async () => 'private', findCrossSourceDuplicate: async () => null, maybeSendFirstShareNotice: async () => {}, activityStartISO: (x) => x }],
    ]),
  });
  const fetchWas = globalThis.fetch;
  const warn = console.warn;
  console.warn = () => {};
  globalThis.fetch = async () => ({ ok: false, status, statusText: 'nope', text: async () => '' });
  try {
    const res = await route.GET(new Request('https://shape.test/api/integrations/whoop/sync'));
    return { status: res.status, body: await res.json() };
  } finally {
    globalThis.fetch = fetchWas;
    console.warn = warn;
  }
}

test('a token WHOOP refuses says to connect again', async () => {
  const r = await syncAnswering(401);
  assert.equal(r.status, 409);
  assert.equal(r.body.reconnect, true);
  assert.match(r.body.error, /reconnect/i);
});

test('any other WHOOP failure is still a failed sync', async () => {
  const r = await syncAnswering(503);
  assert.equal(r.status, 502);
  assert.equal(r.body.error, 'WHOOP sync failed.');
});
