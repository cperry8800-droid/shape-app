// The Home check-in asks about a night only when the member typed it or nobody did, and it
// never re-types a watch's night as the member's own. It used to take any day with a resting
// heart rate, HRV or sleep efficiency as a watch's night; a watch worn by day and charged at
// night reports a resting heart rate with no night, so the hours the member then typed read as
// the watch's, locked and never copied. `/api/client/progress` now sends the nights a watch
// wrote, from the snapshot's per-field sources: every device sync stamps
// `sources.sleep_hours` through upsertSnapshot, and a typed check-in never does.
// Run as written: the real route on a stub client.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

function stubClient(tables) {
  const chain = (table) => {
    const rows = tables[table] || [];
    const q = {
      select: () => q, eq: () => q, neq: () => q, in: () => q, gte: () => q, lte: () => q, lt: () => q, gt: () => q,
      order: () => q, limit: () => q, not: () => q, is: () => q, or: () => q, filter: () => q,
      maybeSingle: async () => ({ data: rows[0] || null, error: null }),
      single: async () => ({ data: rows[0] || null, error: null }),
      then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej),
    };
    return q;
  };
  return { auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) }, from: chain, rpc: async () => ({ data: null, error: { message: 'not applied' } }) };
}

async function progress(snapshots) {
  const lib = (f) => loadRealModule(join(ROOT, 'src/lib', f), { typescript: true });
  const [time, setLoad, e1rm, readiness] = await Promise.all([lib('time.ts'), lib('set-load.ts'), lib('e1rm.ts'), lib('recovery-readiness.ts')]);
  const client = stubClient({ daily_health_snapshot: snapshots });
  const mod = await loadRealModule(join(ROOT, 'src/app/api/client/progress/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/time', time],
      ['@/lib/set-load', setLoad],
      ['@/lib/e1rm', e1rm],
      ['@/lib/recovery-readiness', readiness],
      ['@/lib/require-membership', { requireMembership: async () => null }],
      ['@/lib/supabase/server', { createClient: async () => client }],
      ['@/lib/request-auth', { clientForRequest: async () => client, currentUser: async () => ({ id: 'u-1' }) }],
    ]),
  });
  const res = await mod.GET(new Request('https://shape.test/api/client/progress'));
  return res.json();
}

test('the progress route sends the nights a watch wrote, and only those', async () => {
  // Newest first, as the route reads them.
  const body = await progress([
    { snapshot_date: '2026-10-18', sleep_hours: 7, resting_hr: 58, sources: { resting_hr: 'apple_health' } },
    { snapshot_date: '2026-10-17', sleep_hours: 7.2, hrv_ms: 50, sources: { sleep_hours: 'apple_health', hrv_ms: 'apple_health' } },
    { snapshot_date: '2026-10-16', sleep_hours: 6.5, sources: {} },
    { snapshot_date: '2026-10-15', sleep_hours: 8, sources: null },
    { snapshot_date: '2026-10-14', resting_hr: 60, sources: { sleep_hours: 'garmin' } },
    // Hours the member typed over a watch's night (Codex P2 on #2398).
    { snapshot_date: '2026-10-13', sleep_hours: 7.5, sources: { sleep_hours: 'manual', hrv_ms: 'oura' } },
  ]);
  assert.equal(body.ok, true);
  assert.deepEqual(body.series.sleepFromDevice, [{ date: '2026-10-17', value: 1 }],
    "a typed night on a day with a watch heart rate, a source with no night, or hours typed over a watch's night read as a watch night");
  assert.deepEqual(body.series.sleep.map((p) => p.date), ['2026-10-13', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
});

test('with no watch nights the series is sent empty, so the app knows the server reads sources', async () => {
  const body = await progress([{ snapshot_date: '2026-10-18', sleep_hours: 7, resting_hr: 58 }]);
  assert.deepEqual(body.series.sleepFromDevice, []);
});
