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

// Codex P2 on #2437: the latest 10 left a busy week's earlier workouts without a row. The sync now
// pages through the last eight days as well, following next_token.
test('a WHOOP sync saves every workout of the week, page by page', async () => {
  const client = db();
  const route = await load('src/app/api/integrations/whoop/sync/route.ts', client, [['@/lib/health-snapshot', { writeWhoopSnapshots: async () => ({ days: 0 }) }]]);
  const w = (id, day) => ({ ...WHOOP_WORKOUT, id, start: `2026-10-${day}T07:00:00Z`, end: `2026-10-${day}T07:45:00Z` });
  const asked = [];
  const answer = (url) => {
    if (!url.includes('/activity/workout')) return url.includes('/user/') ? {} : { records: [] };
    const q = new URL(url).searchParams;
    asked.push(Object.fromEntries(q));
    if (!q.get('start')) return { records: [w('a', 24)] };
    return q.get('nextToken') === 'p2' ? { records: [w('c', 19)] } : { records: [w('a', 24), w('b', 21)], next_token: 'p2' };
  };
  const { out } = await withFetch(answer, async () => route.GET(new Request('https://shape.test/api/integrations/whoop/sync')));
  const body = await out.json();
  assert.deepEqual(client.writes.activities.map((r) => r.external_id).sort(), ['a', 'b', 'c'], 'each workout once, the second page included');
  assert.deepEqual(body.activities, { written: 3, errors: [] });
  const paged = asked.filter((q) => q.start);
  assert.equal(paged.length, 2);
  assert.equal(paged[0].limit, '25');
  assert.equal(paged[1].nextToken, 'p2');
  assert.ok(Date.now() - Date.parse(paged[0].start) >= 8 * 86_400_000 - 60_000, 'eight days back');
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

// Codex P2 on #2437: the app's callers read only response.ok, so a reply carrying refused rows
// read as a sync that worked (the Integrations page's "synced" toast, the check-in card's 30-minute
// wait). The app's syncWhoop and syncStrava, cut from shapeBackend.js and run, now fail on them.
const { readFileSync } = await import('node:fs');
const BACKEND = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
const from = BACKEND.indexOf('async function syncWhoop(');
const to = BACKEND.indexOf('async function syncOura(');
assert.ok(from > 0 && to > from, 'the sync functions moved: re-point this cut');
const appSync = (reply) => new Function('fetch', 'apiBaseUrl', 'state', `${BACKEND.slice(from, to)}\nreturn { syncWhoop, syncStrava };`)(
  async () => ({ ok: true, json: async () => reply }), 'https://shape.test', { session: { access_token: 'tok' } },
);

test('the app’s WHOOP and Strava syncs fail when the server could not save the workout rows', async () => {
  const refused = appSync({ activities: { written: 0, errors: ['Could not save an activity.'] } });
  await assert.rejects(refused.syncWhoop(), /WHOOP synced, but its workouts weren’t saved/);
  await assert.rejects(refused.syncStrava({ importActivities: true }), /Strava synced, but its workouts weren’t saved/);
  const saved = appSync({ activities: { written: 2, errors: [] }, snapshot: { days: 1 } });
  assert.deepEqual((await saved.syncWhoop()).activities, { written: 2, errors: [] });
  assert.equal((await appSync({ snapshot: { days: 0 } }).syncStrava()).snapshot.days, 0, 'a reply with no rows field is a sync that worked');
});
