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
import { habitWatchDue, habitWatchText, habitWatchDedupe, HABIT_WATCH_HOUR, HABIT_WATCH_CATCHUP } from '../src/lib/habit-watch.mjs';

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
  assert.equal(HABIT_WATCH_CATCHUP, 2);
  assert.deepEqual(rule({ hourOf: () => 19 }), [], 'before 8 pm: nothing');
  assert.equal(rule({ hourOf: () => 21 }).length, 1, '9 pm catches up a notice that did not land');
  assert.equal(rule({ hourOf: () => 22 }).length, 1, 'and 10 pm');
  assert.deepEqual(rule({ hourOf: () => 23 }), [], 'after the catch-up hours: nothing');
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
    body: 'Their day isn’t over yet. A quick message could help them get it done.',
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

async function run(t, tables = TABLES(), { fail = [], secret = SECRET, failQuiet = false, notify = null, now = NOW, maxRows = null, wrapDb = null } = {}) {
  t.mock.timers.enable({ apis: ['Date'], now });
  process.env.CRON_SECRET = SECRET;
  const db = fakeSupabase({ tables, fail, maxRows });
  if (wrapDb) wrapDb(db);
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
      ['@/lib/notify', { preferredNotificationOutcome: notify ? (admin, n) => notify(admin, n, sent) : async (_admin, n) => { sent.push(n); return 'stored'; } }],
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
  assert.deepEqual(body, { ok: true, owed: 4, sent: 4, failed: 0, unsent: 0, truncated: false });
  const walk = sent.find((n) => n.data.habitId === 'h1' && n.userId === 'yan');
  assert.equal(walk.type, 'friend_habit');
  assert.equal(walk.route, 'person', 'it opens Ann\'s profile, where she can be messaged (a follow\'s `profile` opens the reader\'s own)');
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
  assert.deepEqual(quiet.body, { ok: true, owed: 0, sent: 0, failed: 0, unsent: 0, truncated: false });
  assert.ok(!quiet.calls.some((c) => c.table === 'habit_watchers'));
  t.mock.timers.reset();
  const denied = await run(t, TABLES(), { secret: 'nope' });
  assert.equal(denied.status, 401);
  assert.equal(denied.calls.length, 0);
});

// Twenty people on Ann's walk, all connected to her.
const CROWD = () => {
  const tables = TABLES();
  const people = Array.from({ length: 20 }, (_, i) => `p${String(i).padStart(2, '0')}`);
  tables.habit_watchers = people.map((w) => ({ habit_id: 'h1', owner_id: 'ann', watcher_id: w }));
  tables.user_follows = people.map((w) => ({ follower_id: w, following_id: 'ann', status: 'accepted' }));
  tables.user_habits = tables.user_habits.filter((h) => h.id === 'h1');
  return tables;
};

test('the notices go out several at a time, never all at once (Codex on #2413)', async (t) => {
  let inFlight = 0, most = 0;
  const notify = async (_admin, n, sent) => {
    inFlight += 1; most = Math.max(most, inFlight);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    inFlight -= 1;
    sent.push(n);
    return 'stored';
  };
  const { body, sent } = await run(t, CROWD(), { notify });
  assert.deepEqual(body, { ok: true, owed: 20, sent: 20, failed: 0, unsent: 0, truncated: false });
  assert.equal(new Set(sent.map((n) => n.userId)).size, 20, 'each person once');
  assert.equal(most, 8, 'eight at a time');
});

test('none is started once the run nears its limit, and what is left is reported', async (t) => {
  // Each notice takes 40 s of the run: three start inside the 90 s budget, and the rest are
  // reported as unsent rather than cut off when the function is stopped.
  const notify = async (_admin, n, sent) => { t.mock.timers.tick(40_000); sent.push(n); return 'stored'; };
  const errors = [];
  t.mock.method(console, 'error', (...a) => errors.push(a.join(' ')));
  const { body, sent } = await run(t, CROWD(), { notify });
  assert.deepEqual(body, { ok: true, owed: 20, sent: 3, failed: 0, unsent: 17, truncated: false });
  assert.equal(sent.length, 3);
  assert.ok(errors.some((e) => /out of time with 17 notices unsent/.test(e)), 'the shortfall is logged');
});

test('a notice that failed is tried again the next hour; one that landed is not (Codex on #2413)', async (t) => {
  const tables = TABLES();
  tables.notifications = [];
  // 8:30 pm in New York: the write for Zoe's "No sugar" fails, the rest land.
  const landing = async (_admin, n, sent) => {
    if (n.userId === 'zoe' && n.data.habitId === 'h2') return 'failed';
    tables.notifications.push({ user_id: n.userId, type: n.type, created_at: new Date(Date.now()).toISOString(), data: n.data });
    sent.push(n);
    return 'stored';
  };
  const errors = [];
  t.mock.method(console, 'error', (...a) => errors.push(a.join(' ')));
  const first = await run(t, tables, { notify: landing });
  assert.deepEqual(first.body, { ok: true, owed: 4, sent: 3, failed: 1, unsent: 0, truncated: false });
  assert.ok(errors.some((e) => /1 notices failed/.test(e)), 'the failure is logged');
  t.mock.timers.reset();
  // 9:30 pm: only the one that failed is owed, and it goes.
  const second = await run(t, tables, { now: NOW + 60 * 60 * 1000 });
  assert.deepEqual(second.body, { ok: true, owed: 1, sent: 1, failed: 0, unsent: 0, truncated: false });
  assert.deepEqual(second.sent.map((n) => `${n.data.habitId}>${n.userId}`), ['h2>zoe']);
  assert.equal(second.sent[0].data.dedupe, 'habit:h2:2026-10-19', 'still that evening\'s notice');
  t.mock.timers.reset();
  // 11:30 pm: the evening is over.
  const late = await run(t, TABLES(), { now: NOW + 3 * 60 * 60 * 1000 });
  assert.equal(late.body.owed, 0);
});

test("an unreadable list of the evening's notices stops the run: it is the cap's count too (Codex on #2413)", async (t) => {
  const errors = [];
  t.mock.method(console, 'error', (...a) => errors.push(a.join(' ')));
  const { status, sent } = await run(t, TABLES(), { fail: ['notifications'] });
  assert.equal(status, 500);
  assert.equal(sent.length, 0, 'nothing sent on a count it could not read');
  assert.ok(errors.some((e) => /could not read the evening's notices/.test(e)));
  t.mock.timers.reset();
  // 9:30 pm, the read works: all four are still owed and go out.
  const next = await run(t, TABLES(), { now: NOW + 60 * 60 * 1000 });
  assert.equal(next.body.owed, 4);
  assert.equal(next.body.sent, 4);
});

test('every read is paged past PostgREST\'s 1,000-row cap: no watcher or follow is dropped (Codex on #2413)', async (t) => {
  // 60 of Ann's habits, each shared with the same 20 people: 1,200 watcher rows in one chunk. And
  // 1,080 other accepted follows of Ann's that sort before those 20, so the first 1,000 follow rows
  // name none of the people. One request per chunk read 1,000 of each and lost notices.
  const people = Array.from({ length: 20 }, (_, i) => `w${String(i).padStart(2, '0')}`);
  const tables = TABLES();
  tables.user_habits = Array.from({ length: 60 }, (_, i) => ({ id: `hh${String(i).padStart(2, '0')}`, user_id: 'ann', name: `Habit ${i}`, type: 'do', cadence: 'daily', visibility: 'friends', archived_at: null }));
  tables.user_habit_completions = [];
  tables.habit_watchers = tables.user_habits.flatMap((h) => people.map((w) => ({ habit_id: h.id, owner_id: 'ann', watcher_id: w })));
  tables.user_follows = [
    ...Array.from({ length: 1080 }, (_, i) => ({ follower_id: `a${String(i).padStart(4, '0')}`, following_id: 'ann', status: 'accepted' })),
    ...people.map((w) => ({ follower_id: w, following_id: 'ann', status: 'accepted' })),
  ];
  const { status, body, sent } = await run(t, tables, { maxRows: 1000 });
  assert.equal(status, 200);
  assert.equal(body.owed, 1200, 'all 60 habits × 20 people');
  assert.equal(body.sent, 1200);
  assert.equal(new Set(sent.map((n) => `${n.data.habitId}>${n.userId}`)).size, 1200, 'each notice once');
});

test('each read runs its chunks four at a time, and keeps every chunk (Codex on #2413)', async (t) => {
  // 1,000 owners, each sharing one habit with Pia: the owners' zone read is 7 chunks and their
  // follows 14. One after another, the reads before the first notice grow with the owners.
  const owners = Array.from({ length: 1000 }, (_, i) => `o${String(i).padStart(4, '0')}`);
  const tables = TABLES();
  tables.user_habits = owners.map((o) => ({ id: `h-${o}`, user_id: o, name: 'Walk', type: 'do', cadence: 'daily', visibility: 'friends', archived_at: null }));
  tables.user_habit_completions = [];
  tables.habit_watchers = owners.map((o) => ({ habit_id: `h-${o}`, owner_id: o, watcher_id: 'pia' }));
  tables.user_follows = owners.map((o) => ({ follower_id: 'pia', following_id: o, status: 'accepted' }));
  tables.client_profiles = [...owners.map((o) => ({ user_id: o, timezone: 'America/New_York' })), { user_id: 'pia', timezone: 'America/New_York' }];
  tables.profiles = owners.map((o) => ({ id: o, full_name: `Owner ${o}` }));
  tables.notification_settings = [];
  tables.notifications = [];
  // Each request takes 2 ms, and the reads in flight are counted per table.
  const inFlight = {};
  const peak = {};
  const wrapDb = (db) => {
    const from = db.from;
    db.from = (table) => {
      const chain = from(table);
      const then = chain.then.bind(chain);
      chain.then = (res, rej) => {
        inFlight[table] = (inFlight[table] || 0) + 1;
        peak[table] = Math.max(peak[table] || 0, inFlight[table]);
        return new Promise((r) => setTimeout(r, 2))
          .then(() => new Promise((ok, no) => then(ok, no)))
          .finally(() => { inFlight[table] -= 1; })
          .then(res, rej);
      };
      return chain;
    };
  };
  const { status, body } = await run(t, tables, { wrapDb });
  assert.equal(status, 200);
  assert.equal(body.owed, 1000, "every chunk's rows: an owner whose zone was lost would read as UTC, not due");
  assert.equal(body.sent, 1000);
  assert.equal(peak.client_profiles, 4, 'the zone read: four chunks at a time');
  assert.equal(peak.user_follows, 4, 'the follows read: four chunks at a time');
});

// Pia is in New York with a cap of `cap`, connected to Ann, and picked on `n` of Ann's habits.
const CAPPED = ({ n, cap, prior = [] }) => {
  const tables = TABLES();
  tables.user_habits = Array.from({ length: n }, (_, i) => ({ id: `hc${i}`, user_id: 'ann', name: `Habit ${i}`, type: 'do', cadence: 'daily', visibility: 'friends', archived_at: null }));
  tables.user_habit_completions = [];
  tables.habit_watchers = tables.user_habits.map((h) => ({ habit_id: h.id, owner_id: 'ann', watcher_id: 'pia' }));
  tables.user_follows = [{ follower_id: 'pia', following_id: 'ann', status: 'accepted' }];
  tables.client_profiles = [...tables.client_profiles, { user_id: 'pia', timezone: 'America/New_York' }];
  tables.notification_settings = [{ user_id: 'pia', tz: 'America/New_York', quiet_start: 23, quiet_end: 6, daily_cap: cap }];
  tables.notifications = prior;
  return tables;
};

test('the person\'s daily cap bounds the pushes: past it a notice lands in the app without one (Codex on #2413)', async (t) => {
  // One friend's-habit push already today (and one that landed quiet, which doesn't count); a cap
  // of 2 leaves room for one more of the five.
  const prior = [
    { id: 'n0', user_id: 'pia', type: 'friend_habit', created_at: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(), data: { dedupe: 'habit:other:2026-10-19', channels: { inapp: true, push: true } } },
    { id: 'n1', user_id: 'pia', type: 'friend_habit', created_at: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(), data: { dedupe: 'habit:quiet:2026-10-19', channels: { inapp: true, push: false } } },
  ];
  const { body, sent } = await run(t, CAPPED({ n: 5, cap: 2, prior }));
  assert.deepEqual(body, { ok: true, owed: 5, sent: 5, failed: 0, unsent: 0, truncated: false });
  assert.equal(sent.filter((n) => !n.quiet).length, 1, 'one push, the rest in the app only');
  t.mock.timers.reset();
  // A push from yesterday does not count, read as a time and not as text: in +14:00 it reads as
  // later than now.
  const at14 = (ms) => new Date(ms + 14 * 60 * 60 * 1000).toISOString().replace('Z', '+14:00');
  const stale = [{ ...prior[0], created_at: at14(NOW - 30 * 60 * 60 * 1000 + 60_000) }];
  const fresh = await run(t, CAPPED({ n: 5, cap: 2, prior: stale }));
  assert.equal(fresh.sent.filter((n) => !n.quiet).length, 2);
  t.mock.timers.reset();
  // No cap on file: the default 4.
  const tables = CAPPED({ n: 6, cap: 2 });
  tables.notification_settings = [];
  const plain = await run(t, tables);
  assert.equal(plain.sent.filter((n) => !n.quiet).length, 4);
});

test("the cap is per day on the person's own clock: their midnight resets it (Codex on #2413)", async (t) => {
  // NOW is 8:30 pm on Oct 19 in New York, so Pia's day began 20½ hours ago. A push 21 hours ago
  // (11:30 pm on the 18th there) is inside the last 24 hours but not today; one 20 hours ago is.
  const push = (hoursAgo) => [{ id: 'n0', user_id: 'pia', type: 'friend_habit', created_at: new Date(NOW - hoursAgo * 60 * 60 * 1000).toISOString(), data: { dedupe: 'habit:other:2026-10-18', channels: { inapp: true, push: true } } }];
  const before = await run(t, CAPPED({ n: 2, cap: 1, prior: push(21) }));
  assert.equal(before.sent.filter((n) => !n.quiet).length, 1, "yesterday's push leaves today's place");
  t.mock.timers.reset();
  const after = await run(t, CAPPED({ n: 2, cap: 1, prior: push(20) }));
  assert.equal(after.sent.filter((n) => !n.quiet).length, 0, "today's push took it");
});

test('a push that failed gives its place under the cap back to a later notice', async (t) => {
  // Cap 1, nine notices: the first takes the place and fails; the eight that started with it are
  // in the app only; the ninth, started after the failure, takes the place back and pushes.
  let first = true;
  const notify = async (_admin, n, sent) => {
    if (!n.quiet && first) { first = false; return 'failed'; }
    sent.push(n);
    return 'stored';
  };
  const { body, sent } = await run(t, CAPPED({ n: 9, cap: 1 }), { notify });
  assert.equal(body.failed, 1);
  assert.equal(sent.filter((n) => !n.quiet).length, 1, 'the place came back and was used');
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
  assert.doesNotMatch(sql, /create policy[^;]*\bfor (insert|update|all)\b/i, 'members never write the table directly');
  // Two saves for one habit run one after the other (Codex on #2413): the habit's row is locked
  // before its watchers are replaced.
  assert.match(sql, /perform 1 from public\.user_habits h\s+where h\.id = p_habit and h\.user_id = v_me and h\.archived_at is null\s+for update;\s+if not found then/);
  for (const fn of ['habit_watch_candidates()', 'set_habit_watchers(uuid, uuid[])']) {
    assert.ok(sql.includes(`revoke all on function public.${fn} from public, anon;`), fn);
    assert.ok(sql.includes(`grant execute on function public.${fn} to authenticated;`), fn);
  }
  assert.equal((sql.match(/security definer set search_path = public, pg_temp/g) || []).length, 2);
  // Every person the caller may pick, uncut (Codex on #2413): the app pages through them.
  const candidates = sql.slice(sql.indexOf('create or replace function public.habit_watch_candidates'), sql.indexOf('revoke all on function public.habit_watch_candidates'));
  assert.ok(candidates.includes('order by p.full_name nulls last, p.id;'));
  assert.doesNotMatch(candidates, /\blimit\b/i, 'no one is left out');
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
