// A WHOOP night is filed under the morning it ends, in the member's own day. snapshot_date is the
// member's local day and the check-in reads today's row as last night (a watch's night comes
// first, owner 2026-10-18). Filed by its UTC start, a night begun at 23:00 in Paris (21:00 UTC)
// landed on the day before, so the check-in asked for a night the watch had and the next night's
// sync wrote over the typed hours. A nap is not the night. Run as written: the real writer on a
// fake client.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const mod = await loadRealModule(join(ROOT, 'src/lib/health-snapshot.ts'), {
  typescript: true,
  registry: new Map([['@/lib/integrations/reconcile.mjs', await import('../src/lib/integrations/reconcile.mjs')]]),
});

function fakeClient() {
  const rows = [];
  const q = (table) => ({
    upsert: async (row) => { if (table === 'daily_health_snapshot') rows.push(row); return { error: null }; },
    select: () => ({ eq: async () => ({ data: [], error: null }) }),
  });
  return { client: { from: q, rpc: async () => ({ error: null }) }, rows };
}
const hm = (h, m = 0) => (h * 60 + m) * 60_000;
const night = (id, start, end, offset, hours, extra = {}) => ({
  id, start, end, timezone_offset: offset,
  score: { stage_summary: { total_in_bed_time_milli: hm(hours), total_awake_time_milli: 0 }, sleep_performance_percentage: 90 },
  ...extra,
});

test("a night is filed under the member's own wake-up day", () => {
  assert.equal(mod.whoopLocalDate('2026-10-17T21:00:00.000Z', '+01:00'), '2026-10-17');
  assert.equal(mod.whoopLocalDate('2026-10-18T06:00:00.000Z', '+01:00'), '2026-10-18');
  assert.equal(mod.whoopLocalDate('2026-10-18T02:30:00.000Z', '-05:00'), '2026-10-17', 'a night ending before UTC midnight in New York is the day before');
  assert.equal(mod.whoopLocalDate('2026-10-17T22:30:00.000Z', '+09:00'), '2026-10-18', 'a Tokyo morning is a UTC evening');
  assert.equal(mod.whoopLocalDate('2026-10-18T06:00:00.000Z', '-0330'), '2026-10-18');
  assert.equal(mod.whoopLocalDate('2026-10-18T02:00:00.000Z', null), '2026-10-18', 'no offset: the UTC day');
  assert.equal(mod.whoopLocalDate('not a time', '+01:00'), null);
});

test("Paris: last night lands on today's row, its recovery with it, and a nap writes nothing", async () => {
  const { client, rows } = fakeClient();
  await mod.writeWhoopSnapshots(client, 'member-1', {
    sleeps: { records: [
      night('s1', '2026-10-17T21:00:00.000Z', '2026-10-18T05:30:00.000Z', '+02:00', 7.5),
      night('nap', '2026-10-18T12:00:00.000Z', '2026-10-18T12:40:00.000Z', '+02:00', 0.5, { nap: true }),
    ] },
    recoveries: { records: [{ sleep_id: 's1', created_at: '2026-10-17T23:59:00.000Z', score: { recovery_score: 66, resting_heart_rate: 52, hrv_rmssd_milli: 70 } }] },
  });
  const byDay = Object.fromEntries(rows.map((r) => [r.snapshot_date, r]));
  assert.deepEqual(Object.keys(byDay), ['2026-10-18'], 'the night or its recovery was filed under the day it began');
  assert.equal(byDay['2026-10-18'].sleep_hours, 7.5, 'the nap wrote its hours over the night');
  assert.equal(byDay['2026-10-18'].recovery_score, 66);
});
