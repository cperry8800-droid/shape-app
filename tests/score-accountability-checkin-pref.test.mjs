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

// A change stamped now is after last week ended; one 8 days ago is before it.
const AFTER = () => new Date().toISOString();
const BEFORE = () => new Date(Date.now() - 8 * 86400000).toISOString();
// Five hours before this Monday 00:00 UTC: 08:00 on Monday in Tokyo, after that member's week ended.
const UTC_MONDAY = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.getTime(); };
const EAST = () => new Date(UTC_MONDAY() - 5 * 3600000).toISOString();

const TABLES = () => ({
  platform_subscriptions: [
    { client_id: 'on', status: 'active' },
    { client_id: 'off', status: 'active' },
    { client_id: 'no-doc', status: 'active' },
    { client_id: 'false', status: 'trialing' },
    { client_id: 'back-on', status: 'active' },
    { client_id: 'on-long', status: 'active' },
    { client_id: 'off-after', status: 'active' },
    { client_id: 'east', status: 'active' },
    { client_id: 'clock-ahead', status: 'active' },
    { client_id: 'clock-ok', status: 'active' },
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
    // Off all last week, turned back on since it ended: that week is not charged.
    { user_id: 'back-on', kind: 'client_settings', data: { dailyCheckin: 'On', dailyCheckinSince: AFTER() } },
    // On since before last week ended: charged as usual.
    { user_id: 'on-long', kind: 'client_settings', data: { dailyCheckin: 'On', dailyCheckinSince: BEFORE() } },
    { user_id: 'off-after', kind: 'client_settings', data: { dailyCheckin: 'Off', dailyCheckinSince: AFTER() } },
    // Turned back on early on their own Monday, east of UTC: still before Monday in UTC.
    { user_id: 'east', kind: 'client_settings', data: { dailyCheckin: 'On', dailyCheckinSince: EAST() } },
    // A device clock a month ahead stamped the change; the database wrote the row 8 days ago,
    // before last week ended, so the week is charged (Codex P2 on #2398).
    { user_id: 'clock-ahead', kind: 'client_settings', updated_at: BEFORE(), data: { dailyCheckin: 'On', dailyCheckinSince: new Date(Date.now() + 30 * 86400000).toISOString() } },
    // A true stamp since the week ended, on a row written just now: not charged.
    { user_id: 'clock-ok', kind: 'client_settings', updated_at: AFTER(), data: { dailyCheckin: 'On', dailyCheckinSince: AFTER() } },
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
  assert.equal(body.evaluated, 10, 'the job no longer evaluates every active member');
  assert.ok(charged.includes('checkin:on'), 'a member with Check-ins on was not charged');
  assert.ok(charged.includes('checkin:no-doc'), 'a member with no settings saved reads as on, as the notification routes read it');
  assert.ok(!charged.includes('checkin:off'), "a member who turned Check-ins off was charged −7 for one");
  assert.ok(!charged.includes('checkin:false'), 'the legacy boolean false is off too');
});

test("last week is judged by the switch as it stood when the week ended (Codex P2 on #2398)", async () => {
  const { charged } = await run();
  assert.ok(!charged.includes('checkin:back-on'), 'a member who turned Check-ins back on was charged for the week they had it off');
  assert.ok(charged.includes('checkin:on-long'), 'a member on since before the week ended was not charged');
  assert.ok(!charged.includes('checkin:off-after'), 'a member with Check-ins off now was charged');
  assert.ok(!charged.includes('checkin:east'), "a member east of UTC who turned it on after their own week ended was charged for it");
  assert.ok(charged.includes('checkin:clock-ahead'), "a device clock set ahead exempted a week the database says the switch was already on");
  assert.ok(!charged.includes('checkin:clock-ok'), 'a true stamp on a fresh row was charged');
});

test('a failed read of the setting charges nobody in that chunk', async () => {
  const { status, charged } = await run({ fail: ['user_goals'] });
  assert.equal(status, 200);
  assert.deepEqual(charged, [], 'a member who may have Check-ins off was charged on a read that failed');
});
