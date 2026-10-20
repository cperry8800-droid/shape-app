// Shared habits (owner, 2026-10-20): "habits can be public so that friends on app will be
// notified if you don't complete a habit". The member picks the people per habit, from those
// joined to them by an accepted follow; at 8 pm in the member's own timezone each of them hears
// about a shared habit that is not checked off yet. These drive the rules
// (src/lib/habit-watch.mjs), the real cron route over a fake database, and the wiring around it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import { habitWatchDue, habitWatchText, habitWatchDedupe, HABIT_WATCH_HOUR } from '../src/lib/habit-watch.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const notifyLayer = await import('../src/lib/ai/notifications.mjs');
const time = await loadRealModule(join(ROOT, 'src/lib/time.ts'), { typescript: true });

// 00:30 UTC on 20 October is 8:30 pm on the 19th in New York (EDT), 7:30 pm in Chicago, 1:30 am
// in Lagos.
const NOW = Date.parse('2026-10-20T00:30:00Z');
const SECRET = 'habit-secret';

// ── The rules ───────────────────────────────────────────────────────────────
const habit = (over) => ({ id: 'h1', user_id: 'ann', name: 'Walk', type: 'do', cadence: 'daily', archived_at: null, ...over });
const rule = (over = {}) => habitWatchDue({
  habits: [habit()],
  watchers: [{ habit_id: 'h1', owner_id: 'ann', watcher_id: 'zoe' }],
  doneOn: new Set(),
  zoneOf: () => 'America/New_York',
  hourOf: () => HABIT_WATCH_HOUR,
  dayOf: () => '2026-10-19',
  connected: () => true,
  ...over,
});

test('the rule: 8 pm the owner\'s time, not checked off on their day, a connected person', () => {
  assert.equal(HABIT_WATCH_HOUR, 20);
  assert.deepEqual(rule(), [{ habitId: 'h1', ownerId: 'ann', watcherId: 'zoe', day: '2026-10-19', name: 'Walk', type: 'do' }]);
  assert.deepEqual(rule({ hourOf: () => 19 }), [], 'any other hour sends nothing');
  assert.deepEqual(rule({ doneOn: new Set(['h1|2026-10-19']) }), [], 'checked off today: nothing');
  assert.equal(rule({ doneOn: new Set(['h1|2026-10-20']) }).length, 1, 'a check-off on another day is not today\'s');
  assert.deepEqual(rule({ connected: () => false }), [], 'no longer connected: not told');
});

test('the rule refuses rows that do not belong, and tells each person once', () => {
  assert.deepEqual(rule({ habits: [habit({ archived_at: '2026-10-01' })] }), [], 'an archived habit');
  assert.deepEqual(rule({ habits: [habit({ cadence: 'weekly' })] }), [], 'a habit that is not daily');
  assert.deepEqual(rule({ watchers: [{ habit_id: 'h1', owner_id: 'ben', watcher_id: 'zoe' }] }), [], 'a row whose owner is not the habit\'s');
  assert.deepEqual(rule({ watchers: [{ habit_id: 'h1', owner_id: 'ann', watcher_id: 'ann' }] }), [], 'the owner themself');
  assert.equal(rule({ watchers: [{ habit_id: 'h1', owner_id: 'ann', watcher_id: 'zoe' }, { habit_id: 'h1', owner_id: 'ann', watcher_id: 'zoe' }] }).length, 1);
  assert.equal(rule({ zoneOf: () => null, hourOf: (tz) => (tz === 'UTC' ? 20 : 3) }).length, 1, 'no zone on file reads as UTC');
  assert.equal(rule({ habits: [habit({ type: 'avoid' })] })[0].type, 'avoid');
});

test('the words: first name, the habit, and a to-don\'t reads "checked in on"', () => {
  assert.deepEqual(habitWatchText({ ownerName: 'Ann Lee', habitName: 'Walk 10k steps', type: 'do' }), {
    title: 'Ann hasn\'t done “Walk 10k steps” yet today',
    body: 'It’s 8 pm where they are. A quick message could help them get it done.',
  });
  assert.equal(habitWatchText({ ownerName: 'Ann Lee', habitName: 'No sugar', type: 'avoid' }).title, 'Ann hasn\'t checked in on “No sugar” today');
  assert.match(habitWatchText({ ownerName: '', habitName: 'Walk' }).title, /^Your friend /);
  assert.ok(habitWatchText({ ownerName: 'A', habitName: 'x'.repeat(200) }).title.length < 100, 'a long name is clamped');
  assert.equal(habitWatchDedupe('h1', '2026-10-19'), 'habit:h1:2026-10-19');
});

// ── The cron, over a fake database ──────────────────────────────────────────
const TABLES = () => ({
  user_habits: [
    { id: 'h1', user_id: 'ann', name: 'Walk 10k steps', type: 'do', cadence: 'daily', visibility: 'friends', archived_at: null },
    { id: 'h2', user_id: 'ann', name: 'No sugar', type: 'avoid', cadence: 'daily', visibility: 'friends', archived_at: null },
    // Checked off today, Ann's time.
    { id: 'h3', user_id: 'ann', name: 'Stretch', type: 'do', cadence: 'daily', visibility: 'friends', archived_at: null },
    // Private, and archived: never scanned.
    { id: 'h4', user_id: 'ann', name: 'Read', type: 'do', cadence: 'daily', visibility: 'private', archived_at: null },
    { id: 'h5', user_id: 'ann', name: 'Old', type: 'do', cadence: 'daily', visibility: 'friends', archived_at: '2026-10-01T00:00:00Z' },
    // Ben is in UTC, where it is 00:30: not his evening.
    { id: 'h6', user_id: 'ben', name: 'Run', type: 'do', cadence: 'daily', visibility: 'friends', archived_at: null },
    // Checked off on the 20th, which is UTC's today and not Ann's: still owed.
    { id: 'h7', user_id: 'ann', name: 'Meditate', type: 'do', cadence: 'daily', visibility: 'friends', archived_at: null },
  ],
  user_habit_completions: [
    { habit_id: 'h3', done_on: '2026-10-19' },
    { habit_id: 'h7', done_on: '2026-10-20' },
  ],
  habit_watchers: [
    { habit_id: 'h1', owner_id: 'ann', watcher_id: 'zoe' },
    { habit_id: 'h1', owner_id: 'ann', watcher_id: 'yan' },
    // Xia only asked to follow Ann: not connected.
    { habit_id: 'h1', owner_id: 'ann', watcher_id: 'xia' },
    // A row that names Ben as the owner of Ann's habit.
    { habit_id: 'h1', owner_id: 'ben', watcher_id: 'wes' },
    { habit_id: 'h2', owner_id: 'ann', watcher_id: 'zoe' },
    { habit_id: 'h3', owner_id: 'ann', watcher_id: 'zoe' },
    { habit_id: 'h6', owner_id: 'ben', watcher_id: 'zoe' },
    { habit_id: 'h7', owner_id: 'ann', watcher_id: 'zoe' },
    // Rows left on a habit made private and on an archived one: the scan reads neither habit.
    { habit_id: 'h4', owner_id: 'ann', watcher_id: 'zoe' },
    { habit_id: 'h5', owner_id: 'ann', watcher_id: 'zoe' },
  ],
  user_follows: [
    { follower_id: 'zoe', following_id: 'ann', status: 'accepted' },
    { follower_id: 'ann', following_id: 'yan', status: 'accepted' },
    { follower_id: 'xia', following_id: 'ann', status: 'pending' },
    { follower_id: 'wes', following_id: 'ben', status: 'accepted' },
  ],
  profiles: [{ id: 'ann', full_name: 'Ann Lee' }, { id: 'ben', full_name: 'Ben Ode' }],
  // Yan is in New York too; Zoe has no profile zone, only her notification one.
  client_profiles: [{ user_id: 'ann', timezone: 'America/New_York' }, { user_id: 'ben', timezone: 'UTC' }, { user_id: 'yan', timezone: 'America/New_York' }],
  // Zoe sleeps from 10 pm UTC (00:30 there). Yan has no settings: the default quiet hours
  // (10 pm to 7 am) on his own clock, where it is 8:30 pm.
  notification_settings: [{ user_id: 'zoe', tz: 'UTC', quiet_start: 22, quiet_end: 7 }],
});

async function run(t, tables = TABLES(), { fail = [], secret = SECRET, failQuiet = false } = {}) {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  process.env.CRON_SECRET = SECRET;
  const db = fakeSupabase({ tables, fail });
  if (failQuiet) {
    // Only the people's quiet-hours read fails: the owners' zones (the same table) answer.
    const from = db.from;
    db.from = (table) => {
      const chain = from(table);
      if (table !== 'notification_settings') return chain;
      const select = chain.select;
      chain.select = (cols) => {
        select(cols);
        if (String(cols).includes('quiet_start')) chain.then = (res, rej) => Promise.resolve({ data: null, error: { message: 'quiet read failed' } }).then(res, rej);
        return chain;
      };
      return chain;
    };
  }
  const sent = [];
  const mod = await loadRealModule(join(ROOT, 'src/app/api/cron/habit-watch/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/admin', { createAdminClient: () => db }],
      ['@/lib/notify', { createPreferredNotification: async (_admin, n) => { sent.push(n); return true; } }],
      ['@/lib/time', time],
      ['@/lib/ai/notifications.mjs', notifyLayer],
      ['@/lib/habit-watch.mjs', await import('../src/lib/habit-watch.mjs')],
    ]),
  });
  const res = await mod.GET(new Request('https://x/api/cron/habit-watch', { headers: { 'x-cron-secret': secret } }));
  return { status: res.status, body: await res.json(), sent, calls: db._calls };
}

test('the cron tells each connected person about each shared habit not done by 8 pm the owner\'s time', async (t) => {
  const { status, body, sent } = await run(t);
  assert.equal(status, 200);
  const got = sent.map((n) => `${n.data.habitId}>${n.userId}`).sort();
  assert.deepEqual(got, ['h1>yan', 'h1>zoe', 'h2>zoe', 'h7>zoe'],
    'Stretch was done, Run is not Ben\'s evening, Xia only asked to follow, and the forged row speaks for no one');
  assert.deepEqual(body, { ok: true, owed: 4, sent: 4, truncated: false });
  const walk = sent.find((n) => n.data.habitId === 'h1' && n.userId === 'yan');
  assert.equal(walk.type, 'friend_habit');
  assert.equal(walk.route, 'profile', 'it opens Ann\'s profile, where she can be messaged');
  assert.equal(walk.data.actorId, 'ann');
  assert.equal(walk.data.dedupe, 'habit:h1:2026-10-19', 'one per person, per habit, per Ann\'s day');
  assert.equal(walk.title, 'Ann hasn\'t done “Walk 10k steps” yet today');
  assert.equal(walk.quiet, false, 'Yan\'s quiet hours are read on his clock, not UTC');
  assert.equal(sent.find((n) => n.data.habitId === 'h1' && n.userId === 'zoe').quiet, true, 'inside Zoe\'s quiet hours: in the app, no push');
  assert.equal(sent.find((n) => n.data.habitId === 'h2').title, 'Ann hasn\'t checked in on “No sugar” today');
});

test('a failed read sends nothing: a check-off or a follow read as "none" would tell the wrong people', async (t) => {
  for (const table of ['user_habit_completions', 'user_follows', 'habit_watchers', 'client_profiles', 'notification_settings', 'user_habits']) {
    const { status, sent } = await run(t, TABLES(), { fail: [table] });
    assert.equal(status, 500, table);
    assert.equal(sent.length, 0, table);
    t.mock.timers.reset();
  }
});

test('a failed quiet-hours read sends nothing: a push into someone\'s night is the failure to avoid', async (t) => {
  const { status, sent } = await run(t, TABLES(), { failQuiet: true });
  assert.equal(status, 500);
  assert.equal(sent.length, 0);
});

test('nobody at 8 pm reads no watchers, and the wrong secret reads nothing', async (t) => {
  const tables = TABLES();
  tables.client_profiles = [{ user_id: 'ann', timezone: 'Asia/Tokyo' }, { user_id: 'ben', timezone: 'UTC' }];
  const quiet = await run(t, tables);
  assert.deepEqual(quiet.body, { ok: true, owed: 0, sent: 0, truncated: false });
  assert.ok(!quiet.calls.some((c) => c.table === 'habit_watchers'));
  t.mock.timers.reset();
  const denied = await run(t, TABLES(), { secret: 'nope' });
  assert.equal(denied.status, 401);
  assert.equal(denied.calls.length, 0);
});

// ── The wiring ──────────────────────────────────────────────────────────────
test('the cron runs hourly', () => {
  const crons = JSON.parse(read('vercel.json')).crons;
  assert.ok(crons.some((c) => c.path === '/api/cron/habit-watch' && c.schedule === '0 * * * *'));
});

test('the migration: RLS on, no direct writes, both functions closed to anon and pinned to pg_temp', () => {
  const sql = read('supabase-migrations/2026-10-20-habit-watchers.sql');
  assert.match(sql, /create table if not exists public\.habit_watchers/);
  assert.match(sql, /alter table public\.habit_watchers enable row level security/);
  assert.doesNotMatch(sql, /for insert|for update|for all/i, 'members never write the table directly');
  for (const fn of ['habit_watch_candidates()', 'set_habit_watchers(uuid, uuid[])']) {
    assert.ok(sql.includes(`revoke all on function public.${fn} from public, anon;`), fn);
    assert.ok(sql.includes(`grant execute on function public.${fn} to authenticated;`), fn);
  }
  assert.equal((sql.match(/security definer set search_path = public, pg_temp/g) || []).length, 2);
  // set_habit_watchers checks the caller, the habit, the count and every person before writing.
  const body = sql.slice(sql.indexOf('create or replace function public.set_habit_watchers'));
  const firstWrite = body.indexOf('delete from public.habit_watchers');
  for (const check of ['if v_me is null', "h.user_id = v_me and h.archived_at is null", 'cardinality(v_wanted) > 20', "f.status = 'accepted'"]) {
    const at = body.indexOf(check);
    assert.ok(at > 0 && at < firstWrite, `${check} is not checked before the write`);
  }
});

test('a friend can turn these off: "Friends\' habits" is in the app\'s and the website\'s settings', () => {
  assert.ok(read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx').includes(`['friend_habit', "Friends' habits", "When a friend hasn't done a habit they shared with you"]`));
  assert.ok(read('public/newdesign/clientMeSettings.jsx').includes(`["friend_habit", "Friends' habits", "When a friend hasn't done a habit they shared with you"]`));
});
