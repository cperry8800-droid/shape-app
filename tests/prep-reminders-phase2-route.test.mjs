// The night-before prep reminder, Phase 2 (src/app/api/cron/prep-reminders/route.ts; 2026-11-01), run
// as written against a table-driven database: the hour the member chose, a meal they planned
// themselves (user_goals `client_meal_days`) with or without a nutritionist's plan, a dish the
// nutritionist ticked, and that a read it cannot make still stops the run. Phase 1's rules are
// tests/prep-reminders-route.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import { READER_COPY_EN } from './helpers/reader-copy-en.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const notifyLayer = await import('../src/lib/ai/notifications.mjs');
const time = await loadRealModule(join(ROOT, 'src/lib/time.ts'), { typescript: true });

const OATS = 'Overnight oats, three ways';
const OATS_SLUG = 'overnight-oats-three-ways';
const SECRET = 'prep-secret';
// Sunday 4 October 2026, 19:30 UTC: 7 pm in UTC.
const NOW = Date.parse('2026-10-04T19:30:00Z');
const hourAt = (h) => NOW + (h - 19) * 3600000;
const week = (meal) => ({ days: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, meals: [meal] })) });
const plan = (client_id, payload, created_at = '2026-09-28T10:00:00Z', id = `p-${client_id}`) => ({ id, client_id, payload, created_at, status: 'published' });
// A member's own day plan with the oats for Monday (and Tuesday), changed `ago` days back.
const ownOats = (user, ago = 0, dates = ['2026-10-05']) => ({
  user_id: user, kind: 'client_meal_days', updated_at: new Date(NOW - ago * 86400000).toISOString(),
  data: { v: 1, days: Object.fromEntries(dates.map((d, i) => [d, { add: [{ id: `a${i}`, slot: 'BREAKFAST', title: OATS, recipeId: OATS_SLUG, kcal: 480, p: 28, c: 58, f: 14 }] }])) },
});
const hour = (user, h) => ({ user_id: user, kind: 'meal_prep_reminder', updated_at: new Date(NOW).toISOString(), data: { hour: h } });
const utc = (...ids) => ids.map((user_id) => ({ user_id, timezone: 'UTC' }));

async function run(t, tables, { now = NOW, failKind = null, fail = [], elsewhere = false } = {}) {
  t.mock.timers.enable({ apis: ['Date'], now });
  process.env.CRON_SECRET = SECRET;
  const db = fakeSupabase({ tables, fail });
  if (elsewhere) {
    // A run over more members than the fake can filter by id list in reasonable time: every member
    // is in New York (3 pm, not due), with no settings and no hour chosen.
    const from = db.from;
    db.from = (table) => {
      const chain = from(table);
      if (table !== 'client_profiles' && table !== 'notification_settings' && table !== 'user_goals') return chain;
      chain.in = (_col, ids) => {
        const rows = table === 'client_profiles' ? ids.map((id) => ({ user_id: id, timezone: 'America/New_York' })) : [];
        chain.then = (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej);
        return chain;
      };
      return chain;
    };
  }
  if (failKind) {
    // Only the reads that ask user_goals for this one kind fail.
    const from = db.from;
    db.from = (table) => {
      const chain = from(table);
      if (table !== 'user_goals') return chain;
      const eq = chain.eq;
      chain.eq = (col, v) => {
        eq(col, v);
        if (col === 'kind' && v === failKind) chain.then = (res, rej) => Promise.resolve({ data: null, error: { message: `${failKind} read failed` } }).then(res, rej);
        return chain;
      };
      return chain;
    };
  }
  const sent = [];
  const logged = [];
  t.mock.method(console, 'error', (...args) => { logged.push(args.join(' ')); });
  const mod = await loadRealModule(join(ROOT, 'src/app/api/cron/prep-reminders/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/admin', { createAdminClient: () => db }],
      ['@/lib/notify', { createPreferredNotification: async (_admin, n) => { sent.push(n); return true; } }],
      ['@/lib/time', time],
      ['@/lib/ai/notifications.mjs', notifyLayer], ['@/lib/reader-copy', READER_COPY_EN],
    ]),
  });
  const res = await mod.GET(new Request('https://x/api/cron/prep-reminders', { headers: { 'x-cron-secret': SECRET } }));
  return { status: res.status, body: await res.json(), sent, calls: db._calls, logged };
}

test('the hour is the member\'s own: 9 pm is not reminded at 7 and is at 9; an hour off the list reads as 7 pm', async (t) => {
  const tables = () => ({
    client_meal_plans: [plan('ann', week({ slot: 'BREAKFAST', title: OATS })), plan('bob', week({ slot: 'BREAKFAST', title: OATS })), plan('cy', week({ slot: 'BREAKFAST', title: OATS }))],
    client_profiles: utc('ann', 'bob', 'cy'),
    // Ann chose 9 pm; Bob's stored hour is not one the app offers (4 am); Cy chose nothing.
    user_goals: [hour('ann', 21), hour('bob', 4)],
  });
  const seven = await run(t, tables());
  assert.deepEqual(seven.sent.map((n) => n.userId).sort(), ['bob', 'cy']);
  t.mock.timers.reset();
  t.mock.restoreAll();
  const nine = await run(t, tables(), { now: hourAt(21) });
  assert.deepEqual(nine.sent.map((n) => n.userId), ['ann']);
  assert.equal(nine.sent[0].data.dedupe, 'prep:2026-10-04', 'still one per evening, by her own date');
  // The default quiet hours start at 22:00: a chosen 11 pm is inside them, 9 pm is not (above).
  assert.equal(nine.sent[0].quiet, false);
  t.mock.timers.reset();
  t.mock.restoreAll();
  const late = await run(t, { ...tables(), user_goals: [hour('ann', 23)] }, { now: hourAt(23) });
  assert.deepEqual(late.sent.map((n) => [n.userId, n.quiet]), [['ann', true]], 'inside quiet hours it lands in the app with no push');
});

test('a member with no plan who planned the oats for tomorrow is reminded, and a stale day plan is not read', async (t) => {
  const { status, body, sent } = await run(t, {
    client_meal_plans: [],
    client_profiles: utc('dee', 'eve', 'fay'),
    // Dee planned Monday's and Tuesday's oats today; Eve's day plan was last changed ten days ago;
    // Fay planned a dish that needs no night before.
    user_goals: [
      ownOats('dee', 0, ['2026-10-05', '2026-10-06']),
      ownOats('eve', 10),
      { user_id: 'fay', kind: 'client_meal_days', updated_at: new Date(NOW).toISOString(), data: { v: 1, days: { '2026-10-05': { add: [{ id: 'f1', slot: 'BREAKFAST', title: 'Greek yogurt power bowl', recipeId: 'greek-yogurt-power-bowl' }] } } } },
    ],
  });
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true, owed: 1, sent: 1, truncated: false });
  assert.deepEqual(sent.map((n) => n.userId), ['dee']);
  assert.equal(sent[0].title, `Prep tonight: ${OATS}`);
  assert.equal(sent[0].body, 'Make 2 tonight, for breakfast on Mon and Tue.');
  assert.equal(sent[0].route, `prep:${OATS_SLUG}`);
  assert.deepEqual(sent[0].data.forMeals, ['2026-10-05|own-a0', '2026-10-06|own-a1']);
});

test('a member with a plan and a day plan of their own is looked at once, and both count', async (t) => {
  const { sent } = await run(t, {
    client_meal_plans: [plan('gus', week({ slot: 'DINNER', title: 'Lentil soup', prepNightBefore: true }))],
    client_profiles: utc('gus'),
    user_goals: [ownOats('gus', 1)],
  });
  assert.equal(sent.length, 1, 'one reminder, not one per source');
  assert.equal(sent[0].title, 'Prep tonight for tomorrow');
  assert.deepEqual(sent[0].data.recipes.sort(), ['lentil-soup', OATS_SLUG].sort());
  assert.deepEqual(sent[0].data.forMeals.sort(), ['2026-10-05|live-0-0', '2026-10-05|own-a0'].sort());
});

test("a dish the nutritionist ticked is owed like the oats, and its reminder opens Eat", async (t) => {
  const { sent } = await run(t, {
    client_meal_plans: [plan('hal', week({ slot: 'LUNCH', title: 'Lentil soup', prepNightBefore: true }))],
    client_profiles: utc('hal'),
  });
  assert.deepEqual(sent.map((n) => [n.userId, n.title, n.body, n.route]), [['hal', 'Prep tonight: Lentil soup', "For tomorrow's lunch. Make it tonight so it is ready.", 'eat']]);
  assert.deepEqual(sent[0].data.forMeals, ['2026-10-05|live-0-0']);
});

test('the day-plan scan reads every page, and at its ceiling it stops and says so', async (t) => {
  // 1,200 day plans with nothing owed sort ahead of Ivy's.
  const filler = Array.from({ length: 1200 }, (_, i) => ({ user_id: `a-${String(i).padStart(4, '0')}`, kind: 'client_meal_days', updated_at: new Date(NOW).toISOString(), data: {} }));
  const { body, sent, calls } = await run(t, { client_meal_plans: [], client_profiles: utc('ivy'), user_goals: [...filler, ownOats('ivy')] });
  assert.deepEqual(sent.map((n) => n.userId), ['ivy']);
  assert.equal(body.truncated, false);
  const pages = calls.filter((c) => c.table === 'user_goals' && c.select === 'user_id');
  assert.equal(pages.length, 3, 'three pages of 500 for 1,201 day plans');
  assert.ok(pages.every((c) => c.limit === 500));
  t.mock.timers.reset();
  t.mock.restoreAll();
  const many = Array.from({ length: 50_001 }, (_, i) => ({ user_id: `b-${String(i).padStart(6, '0')}`, kind: 'client_meal_days', updated_at: new Date(NOW).toISOString(), data: {} }));
  const capped = await run(t, { client_meal_plans: [], user_goals: many }, { elsewhere: true });
  assert.equal(capped.status, 200);
  assert.equal(capped.body.truncated, true, 'the ceiling is reported, not read as a complete run');
  assert.ok(capped.logged.some((l) => l.includes('day-plan scan stopped at its 50000-row ceiling')), 'and logged');
  assert.equal(capped.calls.filter((c) => c.table === 'user_goals' && c.select === 'user_id').length, 100);
});

test('a read it cannot make stops the run: the day-plan scan, the hours chosen, the day plans of those due', async (t) => {
  const tables = () => ({
    client_meal_plans: [plan('jo', week({ slot: 'BREAKFAST', title: OATS }))],
    client_profiles: utc('jo', 'kim'),
    user_goals: [ownOats('kim')],
  });
  for (const failKind of ['client_meal_days', 'meal_prep_reminder']) {
    const { status, sent } = await run(t, tables(), { failKind });
    assert.equal(status, 500, `${failKind}: a failed read must not send`);
    assert.deepEqual(sent, [], `${failKind}: reminded on a read that failed`);
    t.mock.timers.reset();
    t.mock.restoreAll();
  }
  // The documents of those due are read with the swaps and prep records: a failure there stops it too.
  const { status, sent } = await run(t, tables(), { fail: ['user_goals'] });
  assert.equal(status, 500);
  assert.deepEqual(sent, []);
});
