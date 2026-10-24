// The WHOOP and Strava syncs write their typed activities rows on every sync, not only on Import
// (Codex P2 on #2437). Train's Burned this week and Home's Week so far read those rows, and the
// routine sync (the check-in card, the Sync button) never asks for ?import=1. Only the feed posts
// stay behind Import, and a refused row is reported.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

function db({ refuse = false } = {}) {
  const writes = { activities: [], posts: [] };
  const client = {
    writes,
    from(table) {
      const chain = {
        select: () => chain, eq: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
        upsert: async (row) => {
          if (table === 'activities') {
            writes.activities.push(row);
            return refuse ? { error: { message: 'violates check constraint' } } : { error: null };
          }
          return { error: null };
        },
        insert: async (row) => { if (table === 'community_posts') writes.posts.push(row); return { error: null }; },
        update: () => ({ eq: async () => ({ error: null }) }),
      };
      return chain;
    },
  };
  return client;
}

async function load(file, client, extra) {
  return loadRealModule(join(ROOT, file), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@supabase/supabase-js', {}],
      ['@/lib/request-auth', { currentUser: async () => ({ id: 'u1', email: 'ann@shape.test' }), clientForRequest: async () => client }],
      ['@/lib/request-utils', { dbError: (_e, _tag, code, msg) => nextServer.NextResponse.json({ error: msg }, { status: code }) }],
      ['@/lib/integrations/tokens', { getFreshAccessToken: async () => 'tok' }],
      ['@/lib/workout-share', { resolveWorkoutSharePrivacy: async () => 'private', findCrossSourceDuplicate: async () => null, maybeSendFirstShareNotice: async () => {}, activityStartISO: (x) => x }],
      ...extra,
    ]),
  });
}

async function withFetch(answer, fn) {
  const was = globalThis.fetch;
  const quiet = console.error;
  const logged = [];
  console.error = (...a) => logged.push(a.join(' '));
  globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => answer(String(url)), text: async () => '' });
  try { return { out: await fn(), logged }; } finally { globalThis.fetch = was; console.error = quiet; }
}

const WHOOP_WORKOUT = { id: 'wk-1', sport_name: 'Running', start: '2026-10-24T07:00:00Z', end: '2026-10-24T07:45:00Z', score: { kilojoule: 2092, strain: 11.2 } };
const whoopAnswer = (url) => (url.includes('/activity/workout') ? { records: [WHOOP_WORKOUT] } : url.includes('/user/') ? {} : { records: [] });

test('a routine WHOOP sync saves the workout rows and posts nothing', async () => {
  const client = db();
  const route = await load('src/app/api/integrations/whoop/sync/route.ts', client, [['@/lib/health-snapshot', { writeWhoopSnapshots: async () => ({ days: 0 }) }]]);
  const { out } = await withFetch(whoopAnswer, async () => route.GET(new Request('https://shape.test/api/integrations/whoop/sync')));
  const body = await out.json();
  assert.equal(out.status, 200);
  assert.equal(client.writes.activities.length, 1);
  assert.equal(client.writes.activities[0].source, 'whoop');
  assert.equal(client.writes.activities[0].calories, 500, '2,092 kJ is 500 kcal');
  assert.deepEqual(body.activities, { written: 1, errors: [] });
  assert.equal(body.import, null);
  assert.equal(client.writes.posts.length, 0, 'the feed post waits for Import');
});

test('WHOOP Import still posts, and writes each row once', async () => {
  const client = db();
  const route = await load('src/app/api/integrations/whoop/sync/route.ts', client, [['@/lib/health-snapshot', { writeWhoopSnapshots: async () => ({ days: 0 }) }]]);
  const { out } = await withFetch(whoopAnswer, async () => route.GET(new Request('https://shape.test/api/integrations/whoop/sync?import=1')));
  const body = await out.json();
  assert.equal(client.writes.activities.length, 1, 'the import no longer writes the row a second time');
  assert.equal(client.writes.posts.length, 1);
  assert.equal(body.import.imported, 1);
});

test('a refused WHOOP row is reported', async () => {
  const client = db({ refuse: true });
  const route = await load('src/app/api/integrations/whoop/sync/route.ts', client, [['@/lib/health-snapshot', { writeWhoopSnapshots: async () => ({ days: 0 }) }]]);
  const { out, logged } = await withFetch(whoopAnswer, async () => route.GET(new Request('https://shape.test/api/integrations/whoop/sync')));
  const body = await out.json();
  assert.deepEqual(body.activities, { written: 0, errors: ['Could not save an activity.'] });
  assert.ok(logged.some((l) => /whoop activity row failed/.test(l)));
});

test('a routine Strava sync saves the activity rows and posts nothing', async () => {
  const client = db();
  const route = await load('src/app/api/integrations/strava/sync/route.ts', client, [['@/lib/health-snapshot', { writeStravaSnapshots: async () => ({ days: 0 }) }]]);
  const run = { id: 42, name: 'Morning run', sport_type: 'Run', start_date: '2026-10-24T07:00:00Z', moving_time: 1800, distance: 5000 };
  const { out } = await withFetch((url) => (url.includes('/athlete/activities') ? [run] : { id: 7 }), async () => route.GET(new Request('https://shape.test/api/integrations/strava/sync')));
  const body = await out.json();
  assert.equal(out.status, 200);
  assert.equal(client.writes.activities.length, 1);
  assert.equal(client.writes.activities[0].source, 'strava');
  assert.equal(client.writes.activities[0].external_id, '42');
  assert.deepEqual(body.activities, { written: 1, errors: [] });
  assert.equal(client.writes.posts.length, 0);
});
