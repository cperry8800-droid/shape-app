// The daily score job charges −7 for a missed weekly check-in, except to a member who
// has Check-ins switched off (owner ruling, 2026-10-18).
//
// The switch hides every prompt that would have reminded the member — the Home
// bulletins, the check-in pushes — so charging for the miss was a penalty for using a
// setting. The job reads the stored preference the way the notification routes do
// (`dailyCheckinOn`: a missing doc or key reads ON), and a failed read of it skips the
// chunk, as the job's other reads already do, rather than charging a member who may be
// off. Run as written: the real route, a table-driven fake client, the real
// notification layer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const notifyLayer = await import('../src/lib/ai/notifications.mjs');
const membership = await loadRealModule(join(ROOT, 'src/lib/membership-core.ts'), { typescript: true });
const SECRET = 'score-secret';

const TABLES = () => ({
  platform_subscriptions: [
    { client_id: 'on', status: 'active' },
    { client_id: 'off', status: 'active' },
    { client_id: 'no-doc', status: 'active' },
    { client_id: 'false', status: 'trialing' },
  ],
  sessions: [],
  client_workouts: [],
  user_habits: [],
  user_goals: [
    { user_id: 'on', kind: 'client_settings', data: { dailyCheckin: 'On' } },
    { user_id: 'off', kind: 'client_settings', data: { dailyCheckin: 'Off' } },
    { user_id: 'false', kind: 'client_settings', data: { dailyCheckin: false } },
    // Another member's other doc must not be read as their settings.
    { user_id: 'no-doc', kind: 'notify_state', data: { dailyCheckin: 'Off' } },
  ],
});

async function run({ fail = [] } = {}) {
  process.env.CRON_SECRET = SECRET;
  const charged = [];
  const db = fakeSupabase({
    tables: TABLES(),
    fail,
    rpcs: {
      sweep_store_credit_reservations: () => 0,
      apply_obligation_penalty: (args) => { charged.push(`${args.p_kind}:${args.p_uid}`); return { applied: true, amount: -7 }; },
      award_session_kept: () => ({ awarded: false }),
      settle_commitment: () => ({ settled: false }),
    },
  });
  const mod = await loadRealModule(join(ROOT, 'src/app/api/cron/score-accountability/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/admin', { createAdminClient: () => db }],
      ['@/lib/notify', { createNotification: async () => true }],
      ['@/lib/membership-core', membership],
      ['@/lib/ai/notifications.mjs', notifyLayer],
    ]),
  });
  const res = await mod.GET(new Request('https://x/api/cron/score-accountability', { headers: { 'x-cron-secret': SECRET } }));
  return { status: res.status, body: await res.json(), charged };
}

test('a member with Check-ins off is not charged for a missed weekly check-in', async () => {
  const { status, body, charged } = await run();
  assert.equal(status, 200);
  assert.equal(body.evaluated, 4, 'the job no longer evaluates every active member');
  assert.ok(charged.includes('checkin:on'), 'a member with Check-ins on was not charged');
  assert.ok(charged.includes('checkin:no-doc'), 'a member with no settings saved reads as on, as the notification routes read it');
  assert.ok(!charged.includes('checkin:off'), "a member who turned Check-ins off was charged −7 for one");
  assert.ok(!charged.includes('checkin:false'), 'the legacy boolean false is off too');
});

test('a failed read of the setting charges nobody in that chunk', async () => {
  const { status, charged } = await run({ fail: ['user_goals'] });
  assert.equal(status, 200);
  assert.deepEqual(charged, [], 'a member who may have Check-ins off was charged on a read that failed');
});
