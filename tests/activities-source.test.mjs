// activities.source lets every provider's workouts in (2026-10-24-activities-source.sql). The
// table's check allowed 'apple' but the Apple Health sync writes 'apple_health', and Oura 'oura',
// so their workouts were refused and nothing said so (checked live 2026-10-24: the old check, and
// no rows at all). The check now lists every source a writer uses, and a refused row is reported.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const SQL = read('supabase-migrations/2026-10-24-activities-source.sql');

// Every writer of activities, and the source it stamps on its rows.
const WRITERS = [
  ['src/app/api/integrations/apple-health/sync/route.ts', 'apple_health'],
  ['src/app/api/integrations/oura/sync/route.ts', 'oura'],
  ['src/app/api/integrations/strava/sync/route.ts', 'strava'],
  ['src/app/api/integrations/whoop/sync/route.ts', 'whoop'],
  ['src/app/api/integrations/garmin/webhook/route.ts', 'garmin'],
  ['src/app/api/client/activities/route.ts', 'manual'],
];

test('the check lists every source a writer stamps, and the migration re-runs', () => {
  assert.match(SQL, /alter table public\.activities drop constraint if exists activities_source_check;/);
  const m = /add constraint activities_source_check\s+check \(source in \(([^)]*)\)\);/.exec(SQL);
  assert.ok(m, 'the widened check is missing');
  const allowed = new Set([...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
  for (const [file, source] of WRITERS) {
    assert.match(read(file), new RegExp(`source: '${source}'`), `${file} no longer writes '${source}': re-point this list`);
    assert.ok(allowed.has(source), `${source} (${file}) is refused by the check`);
  }
  assert.ok(allowed.has('apple'), 'a row already under the old Apple key would fail the new check');
});

test('Oura reports a refused activity row as Apple Health does', () => {
  const oura = read('src/app/api/integrations/oura/sync/route.ts');
  assert.match(oura, /const \{ error: activityError \} = await client\n\s+\.from\('activities'\)\n\s+\.upsert\(ouraActivityRow\(workout, userId\)/);
  assert.match(oura, /if \(activityError\) \{\n\s+console\.error\('\[shape-api\] oura activity row failed:', activityError\.message\);\n\s+errors\.push\('Could not save an activity\.'\);/);
});

test('the Apple Health sync reports a refused activity row and still posts the workout', async () => {
  const posts = [];
  const db = {
    from(table) {
      const chain = {
        select: () => chain, eq: () => chain,
        maybeSingle: async () => ({ data: table === 'profiles' ? { full_name: 'Ann', role: 'client' } : null, error: null }),
        upsert: async () => (table === 'activities'
          ? { error: { code: '23514', message: 'new row for relation "activities" violates check constraint "activities_source_check"' } }
          : { error: null }),
        insert: async (row) => { posts.push(row); return { error: null }; },
      };
      return chain;
    },
  };
  const route = await loadRealModule(join(ROOT, 'src/app/api/integrations/apple-health/sync/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@supabase/supabase-js', {}],
      ['@/lib/request-auth', { currentUser: async () => ({ id: 'u1', email: 'ann@shape.test' }), clientForRequest: async () => db }],
      ['@/lib/supabase/admin', { createAdminClient: () => ({ from: () => ({ upsert: async () => ({ error: null }) }) }) }],
      ['@/lib/health-snapshot', { upsertSnapshot: async () => ({ written: 0 }) }],
      ['@/lib/device-sleep', { recordDeviceNights: async () => ({ recorded: 0 }) }],
      ['@/lib/request-utils', { readJson: async (req) => ({ ok: true, data: await req.json() }) }],
      ['@/lib/workout-share', { resolveWorkoutSharePrivacy: async () => 'private', findCrossSourceDuplicate: async () => null, maybeSendFirstShareNotice: async () => {}, activityStartISO: (x) => x }],
    ]),
  });
  const logged = [];
  const was = console.error;
  console.error = (...a) => logged.push(a.join(' '));
  try {
    const res = await route.POST(new Request('https://shape.test/api/integrations/apple-health/sync', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workouts: [{ externalId: 'hk-1', activity: 'Running', startedAt: '2026-10-24T07:00:00Z', durationMin: 30, calories: 310 }] }),
    }));
    const body = await res.json();
    assert.deepEqual(body.import.errors, ['Could not save an activity.'], 'the refused row was dropped in silence');
    assert.deepEqual(body.activities, { errors: ['Could not save an activity.'] }, 'reported apart, so the app’s sync fails on it');
    assert.equal(body.import.imported, 1, 'the workout is still posted');
    assert.equal(posts.length, 1);
    assert.ok(logged.some((l) => /apple-health activity row failed: .*activities_source_check/.test(l)));
  } finally {
    console.error = was;
  }
});
