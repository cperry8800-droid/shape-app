// The night-before prep reminder (src/app/api/cron/prep-reminders/route.ts), run as written
// against a table-driven database: who is owed one at 7 pm in their own zone, what it says,
// what it remembers, and that a read it cannot make is never read as "nothing prepped".
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const notifyLayer = await import('../src/lib/ai/notifications.mjs');
const time = await loadRealModule(join(ROOT, 'src/lib/time.ts'), { typescript: true });

const OATS = 'Overnight oats, three ways';
const SECRET = 'prep-secret';
// Sunday 4 October 2026, 19:30 UTC: 7 pm in UTC and Accra, 3 pm in New York.
const NOW = Date.parse('2026-10-04T19:30:00Z');
const week = (breakfast = OATS) => ({ days: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, meals: [
  { slot: 'BREAKFAST', title: breakfast }, { slot: 'DINNER', title: 'Chickpea shakshuka' },
] })) });
// A plan's id defaults to sort by its date, so the oldest plan comes first in id order: the scan
// reads by id, and only created_at says which plan is a member's newest.
const plan = (client_id, payload = week(), created_at = '2026-09-28T10:00:00Z', status = 'published', id = `p-${client_id}-${created_at}`) => ({ id, client_id, payload, created_at, status });
const forDate = (user, dates) => ({ user_id: user, kind: 'meal_prep', data: { entries: dates.map((d, i) => ({
  mealId: `live-${i}-0`, recipeTitle: OATS, forDate: d, preppedAt: NOW - 3600000,
})) } });

async function run(t, tables, { fail = [], secret = SECRET, failPayloads = false, zoneOf = null, stored = () => true } = {}) {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  process.env.CRON_SECRET = SECRET;
  const db = fakeSupabase({ tables, fail });
  if (zoneOf) {
    // Each member's zone straight from `zoneOf(id)`, for a run over more members than the fake
    // can filter by id list in reasonable time.
    const from = db.from;
    db.from = (table) => {
      const chain = from(table);
      if (table !== 'client_profiles' && table !== 'notification_settings') return chain;
      chain.in = (_col, ids) => {
        const rows = table === 'client_profiles' ? ids.map((id) => ({ user_id: id, timezone: zoneOf(id) })) : [];
        chain.then = (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej);
        return chain;
      };
      return chain;
    };
  }
  if (failPayloads) {
    // Only the second read of the plans fails: the scan answers, the payloads do not.
    const from = db.from;
    db.from = (table) => {
      const chain = from(table);
      if (table !== 'client_meal_plans') return chain;
      const select = chain.select;
      chain.select = (cols) => {
        select(cols);
        if (String(cols).includes('payload')) chain.then = (res, rej) => Promise.resolve({ data: null, error: { message: 'payload read failed' } }).then(res, rej);
        return chain;
      };
      return chain;
    };
  }
  const sent = [];
  const mod = await loadRealModule(join(ROOT, 'src/app/api/cron/prep-reminders/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/admin', { createAdminClient: () => db }],
      ['@/lib/notify', { createPreferredNotification: async (_admin, n) => { sent.push(n); return stored(n); } }],
      ['@/lib/time', time],
      ['@/lib/ai/notifications.mjs', notifyLayer],
    ]),
  });
  const res = await mod.GET(new Request('https://x/api/cron/prep-reminders', { headers: { 'x-cron-secret': secret } }));
  return { status: res.status, body: await res.json(), sent, calls: db._calls };
}

const TABLES = () => ({
  client_meal_plans: [
    plan('ann'),
    // An older plan of Ann's with no oats: the newest published one is what Eat shows.
    plan('ann', week('Greek yogurt power bowl'), '2026-09-01T10:00:00Z'),
    plan('ben'), plan('cat'), plan('dan'), plan('dee'), plan('eve'), plan('fay'),
    plan('gus', week(), '2026-09-28T10:00:00Z', 'archived'),
    // Ivy's newest plan has the SMALLER id, so a scan that kept the last plan it read would
    // take her older one, which has no oats.
    plan('ivy', week(), '2026-09-28T10:00:00Z', 'published', 'p-ivy-1'),
    plan('ivy', week('Greek yogurt power bowl'), '2026-09-01T10:00:00Z', 'published', 'p-ivy-2'),
    // Hal's newest plan is archived; Eat serves his older published one, which has the oats.
    plan('hal', week('Greek yogurt power bowl'), '2026-09-30T10:00:00Z', 'archived'),
    plan('hal', week(), '2026-09-01T10:00:00Z'),
  ],
  client_profiles: [
    { user_id: 'ann', timezone: 'UTC' }, { user_id: 'ben', timezone: 'America/New_York' },
    { user_id: 'dee', timezone: 'UTC' }, { user_id: 'eve', timezone: 'UTC' }, { user_id: 'fay', timezone: 'UTC' },
    { user_id: 'ivy', timezone: 'UTC' }, { user_id: 'hal', timezone: 'UTC' },
  ],
  // Cat and Dan have no profile zone; their notification settings carry one. Cat's quiet hours
  // start at 6 pm. Dan is in Lagos, where it is 8:30 pm: read as UTC, he would be reminded.
  notification_settings: [
    { user_id: 'cat', tz: 'Africa/Accra', quiet_start: 18, quiet_end: 7 },
    { user_id: 'dan', tz: 'Africa/Lagos' },
  ],
  user_goals: [
    forDate('dee', ['2026-10-05', '2026-10-06', '2026-10-07']),
    { user_id: 'fay', kind: 'client_meal_swaps', data: { [OATS]: { title: 'Greek yogurt power bowl' } } },
  ],
  notifications: [{
    user_id: 'eve', type: 'meal_prep', created_at: '2026-10-03T19:00:00Z',
    data: { forMeals: ['2026-10-05|live-0-0', '2026-10-06|live-1-0', '2026-10-07|live-2-0'] },
  }],
});

test('at 7 pm in their own zone, a member whose plan has the oats tomorrow gets one reminder for three days', async (t) => {
  const { status, body, sent } = await run(t, TABLES());
  assert.equal(status, 200);
  assert.deepEqual(sent.map((n) => n.userId).sort(), ['ann', 'cat', 'hal', 'ivy'],
    'ben is at 3 pm and dan at 8:30 pm; dee prepped; eve was told on Saturday; fay swapped the oats out; gus has no published plan');
  assert.deepEqual(body, { ok: true, owed: 4, sent: 4, truncated: false });
  const ann = sent.find((n) => n.userId === 'ann');
  assert.equal(ann.type, 'meal_prep');
  assert.equal(ann.title, `Prep tonight: ${OATS}`);
  assert.equal(ann.body, 'Make 3 tonight, for breakfast on Mon, Tue and Wed.');
  assert.equal(ann.route, 'prep:overnight-oats-three-ways');
  assert.deepEqual(ann.data.forMeals, ['2026-10-05|live-0-0', '2026-10-06|live-1-0', '2026-10-07|live-2-0']);
  // One reminder per member per evening, by the member's own date.
  assert.equal(ann.data.dedupe, 'prep:2026-10-04');
  assert.equal(ann.quiet, false);
  // Cat's zone comes from her notification settings, and 7 pm is inside her quiet hours.
  assert.equal(sent.find((n) => n.userId === 'cat').quiet, true);
});

test('owed counts the members a reminder was owed to, sent only those whose notification was stored', async (t) => {
  // Cat's was not stored (muted, the switch off, unreadable preferences or a duplicate).
  const { body } = await run(t, TABLES(), { stored: (n) => n.userId !== 'cat' });
  assert.deepEqual(body, { ok: true, owed: 4, sent: 3, truncated: false });
});

test("the evening key the reminder carries is the one the migration's unique index holds", () => {
  const sql = readFileSync(join(ROOT, 'supabase-migrations/2026-10-05-notifications-dedupe.sql'), 'utf8');
  assert.match(sql, /create unique index if not exists notifications_dedupe_uidx\s+on public\.notifications \(user_id, type, \(data->>'dedupe'\)\)\s+where data \? 'dedupe';/);
  const route = readFileSync(join(ROOT, 'src/app/api/cron/prep-reminders/route.ts'), 'utf8');
  assert.ok(route.includes('dedupe: `prep:${today}`'), 'the reminder no longer writes the key the index holds');
});

test('a read it cannot make stops the run instead of reading as nothing prepped', async (t) => {
  for (const table of ['user_goals', 'notifications', 'client_profiles', 'client_meal_plans']) {
    const { status, sent } = await run(t, TABLES(), { fail: [table] });
    assert.equal(status, 500, `${table}: a failed read must not send`);
    assert.deepEqual(sent, [], `${table}: reminded on a read that failed`);
    t.mock.timers.reset();
  }
  // The scan answered and the plans' payloads did not.
  const { status, sent } = await run(t, TABLES(), { failPayloads: true });
  assert.equal(status, 500, 'a failed payload read must not send');
  assert.deepEqual(sent, [], 'reminded on a payload read that failed');
});

test('the scan reads every page: a member whose plan sorts past the first 1,000 rows is still reminded', async (t) => {
  // 1,200 published plans sort ahead of Ann's by id, none of them owed a reminder.
  const filler = Array.from({ length: 1200 }, (_, i) => plan(`f${String(i).padStart(4, '0')}`, week('Greek yogurt power bowl'), '2026-09-30T10:00:00Z', 'published', `a-${String(i).padStart(4, '0')}`));
  const { status, body, sent, calls } = await run(t, {
    client_meal_plans: [...filler, plan('ann')],
    client_profiles: [{ user_id: 'ann', timezone: 'UTC' }],
  });
  assert.equal(status, 200);
  assert.deepEqual(sent.map((n) => n.userId), ['ann']);
  assert.deepEqual(body, { ok: true, owed: 1, sent: 1, truncated: false });
  const pages = calls.filter((c) => c.table === 'client_meal_plans' && c.select === 'id, client_id, created_at');
  assert.equal(pages.length, 3, 'three pages of 500 for 1,201 plans');
  assert.ok(pages.every((c) => c.limit === 500), 'each page is held under PostgREST\'s 1000-row cap');
});

test('at its ceiling the scan stops and says so, instead of reading as a complete run', async (t) => {
  const plans = Array.from({ length: 50_001 }, (_, i) => plan(`f${i}`, week('Greek yogurt power bowl'), '2026-09-30T10:00:00Z', 'published', `b-${String(i).padStart(6, '0')}`));
  plans.push(plan('ann', week(), '2026-09-28T10:00:00Z', 'published', 'a-ann'));
  const logged = [];
  t.mock.method(console, 'error', (...args) => { logged.push(args.join(' ')); });
  const { status, body, sent, calls } = await run(t, { client_meal_plans: plans }, { zoneOf: (id) => (id === 'ann' ? 'UTC' : 'America/New_York') });
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true, owed: 1, sent: 1, truncated: true });
  assert.deepEqual(sent.map((n) => n.userId), ['ann'], 'a member read before the ceiling is still reminded');
  assert.equal(calls.filter((c) => c.table === 'client_meal_plans' && c.select === 'id, client_id, created_at').length, 100);
  assert.ok(logged.some((l) => l.includes('50000-row ceiling')), 'the ceiling is logged');
});

test('only the cron secret runs it, and no plans means nothing owed', async (t) => {
  const denied = await run(t, TABLES(), { secret: 'wrong' });
  assert.equal(denied.status, 401);
  assert.deepEqual(denied.sent, []);
  t.mock.timers.reset();
  const empty = await run(t, { client_meal_plans: [] });
  assert.deepEqual(empty.body, { ok: true, owed: 0, sent: 0, truncated: false });
});

test('inside quiet hours the reminder still lands in the app, with no push', async () => {
  const inserted = [];
  // Enough of the admin client for createPreferredNotification: no mute, no overrides, one insert.
  const admin = {
    from(table) {
      const rows = [];
      const chain = {
        select() { return chain; }, eq() { return chain; }, gte() { return chain; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        insert(row) { if (table === 'notifications') inserted.push(row); return Promise.resolve({ error: null }); },
        then(res) { return Promise.resolve({ data: rows, error: null, count: 0 }).then(res); },
      };
      return chain;
    },
  };
  const notify = await loadRealModule(join(ROOT, 'src/lib/notify.ts'), {
    typescript: true,
    registry: new Map([['@/lib/email', { sendEmail: async () => {} }], ['@/lib/ai/notifications.mjs', notifyLayer]]),
  });
  await notify.createPreferredNotification(admin, { userId: 'u1', type: 'meal_prep', title: 'Prep tonight', body: 'b', route: 'prep:x', quiet: true, data: { forMeals: ['a'] } });
  await notify.createPreferredNotification(admin, { userId: 'u1', type: 'meal_prep', title: 'Prep tonight', body: 'b', route: 'prep:x', quiet: false });
  assert.equal(inserted.length, 2);
  assert.deepEqual(inserted[0].data, { forMeals: ['a'], channels: { inapp: true, push: false, email: false } });
  assert.equal(inserted[0].route, 'prep:x');
  assert.equal('quiet' in inserted[0], false, 'the quiet flag leaked into the notification row');
  assert.deepEqual(inserted[1].data.channels, { inapp: true, push: true, email: false });
});
