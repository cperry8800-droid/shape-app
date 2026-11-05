// The Team view of a shared client (owner, 2026-11-05): both coaches' week side by side, the care-team
// thread and "next, and whose", on the website's Clients → Shared and the client drawer's Team tab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { buildTeamView, threadView, mondayOf, weekDays } from '../src/lib/shared-team.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

const TEAM = [
  { provider_role: 'trainer', provider_id: 1, name: 'Maya Cole', owner_id: 'maya', since: '2026-09-01T00:00:00Z' },
  { provider_role: 'nutritionist', provider_id: 2, name: 'Rae Lindqvist', owner_id: 'rae', since: '2026-10-01T00:00:00Z' },
];
const NOW = new Date('2026-11-04T15:00:00Z'); // a Wednesday

test('one lane per coach, each coach\'s work on its own days', () => {
  const v = buildTeamView({
    me: 'maya', team: TEAM, weekStart: '2026-11-04', now: NOW, tz: 'America/New_York',
    ownWorkouts: [{ trainer_id: 1, title: 'Lower A', scheduled_date: '2026-11-02', payload: { duration: '60 min', exercises: [{}, {}, {}] }, done: true }],
    ownWorkoutsNextWeek: [],
    otherWorkouts: [],
    ownMenus: [],
    otherMenus: [{ title: 'Lean bulk', week_start: null, nutritionist_name: 'Rae Lindqvist', payload: { days: [{ dow: 0, title: 'Train day', tag: 'TRAIN', meals: [{ kcal: 600 }, { kcal: 900.4 }] }, { dow: 1, title: 'Rest day', tag: 'REST', meals: [{ kcal: 1800 }] }] } }],
    sessions: [
      { provider_role: 'nutritionist', provider_id: 2, scheduled_at: '2026-11-05T18:30:00Z', status: 'confirmed', topic: 'Carbs' },
      { provider_role: 'trainer', provider_id: 1, scheduled_at: '2026-11-03T23:00:00Z', status: 'completed' },
      { provider_role: 'trainer', provider_id: 1, scheduled_at: '2026-11-06T23:00:00Z', status: 'cancelled' },
    ],
    checkins: [{ week_of: '2026-11-02', question: 'Can Friday be shorter?' }],
  });
  assert.equal(v.week.start, '2026-11-02');
  assert.deepEqual(v.week.days, weekDays('2026-11-02'));
  assert.deepEqual(v.team.map((t) => [t.name, t.role, t.me]), [['Maya Cole', 'trainer', true], ['Rae Lindqvist', 'nutritionist', false]]);
  const [maya, rae] = v.lanes;
  assert.deepEqual(maya.days['2026-11-02'], [{ kind: 'workout', title: 'Lower A', detail: '60 min · 3 exercises', done: true }]);
  assert.equal(maya.days['2026-11-03'][0].title, 'Session');
  assert.equal(maya.days['2026-11-03'][0].done, true);
  assert.ok(!maya.days['2026-11-06'], 'a cancelled session is not on the week');
  // A menu without a start date repeats weekly from this Monday; the day's kcal summed.
  assert.deepEqual(rae.days['2026-11-02'], [{ kind: 'menu', title: 'Train day', detail: 'Training day · 1500 kcal' }]);
  assert.deepEqual(rae.days['2026-11-03'], [{ kind: 'menu', title: 'Rest day', detail: 'Rest day · 1800 kcal' }]);
  assert.equal(rae.days['2026-11-05'][0].title, 'Consult');
  assert.match(rae.days['2026-11-05'][0].detail, /Thu, Nov 5, 1:30 PM · Carbs/);
  // Next, and whose: Rae's consult, the question for either of them, Maya's unwritten next week.
  assert.deepEqual(v.next.map((n) => [n.whose, n.kind]), [['Rae Lindqvist', 'session'], ['both', 'question'], ['you', 'plan']]);
  assert.match(v.next[1].label, /"Can Friday be shorter\?"/);
  assert.match(v.next[2].label, /from 2026-11-09/);
});

test('a written next week, a menu on the week and an old check-in leave nothing waiting', () => {
  const v = buildTeamView({
    me: 'rae', team: TEAM, weekStart: '2026-11-02', now: NOW,
    ownWorkouts: [], ownWorkoutsNextWeek: [],
    otherWorkouts: [{ trainer_name: 'Maya Cole', title: 'Upper', scheduled_date: '2026-11-10', runs: [] }],
    ownMenus: [{ nutritionist_id: 2, title: 'Cut', week_start: '2026-10-26', payload: { days: [{ dow: 2, title: 'Wed', tag: 'TRAIN', targets: { cal: 2100 }, meals: [] }] } }],
    otherMenus: [], sessions: [],
    checkins: [{ week_of: '2026-10-12', question: 'Old question' }],
  });
  assert.deepEqual(v.next, []);
  assert.deepEqual(v.lanes[1].days['2026-11-04'], [{ kind: 'menu', title: 'Wed', detail: 'Training day · 2100 kcal target' }], 'a menu dated before this week runs on into it');
  // Someone not on the team, or a row with no owner, makes no lane.
  const odd = buildTeamView({ me: 'x', team: [...TEAM, { provider_role: 'coach', owner_id: 'z' }, { provider_role: 'trainer', provider_id: 9 }], weekStart: '2026-11-02' });
  assert.equal(odd.lanes.length, 2);
  assert.equal(mondayOf('2026-11-08'), '2026-11-02', 'a Sunday belongs to the week before');
});

test('the thread reads oldest first, with whose and the hand-off lines marked', () => {
  const rows = [
    { id: '2', sender_id: 'rae', body: 'Rae raised carbs on training days, 160 → 190 g from Mon, Nov 2.', metadata: { kind: 'handoff' }, created_at: '2026-11-02T10:00:00Z' },
    { id: '1', sender_id: 'maya', body: 'Shorter Friday?', metadata: {}, created_at: '2026-11-01T10:00:00Z' },
  ];
  assert.deepEqual(threadView(rows, 'maya', TEAM).map((m) => [m.id, m.from, m.mine, m.handoff]), [['1', 'You', true, false], ['2', 'Rae Lindqvist', false, true]]);
});

// ── the route ──────────────────────────────────────────────────────────────────────────────────
function fakeDb(answer) {
  const calls = [];
  const db = {
    calls,
    rpc(name, args) { calls.push({ rpc: name, args }); return Promise.resolve(answer({ rpc: name, args })); },
    from(table) {
      const q = { table, ops: [] };
      calls.push(q);
      const b = new Proxy({}, {
        get(_, op) {
          if (op === 'then') { const r = answer(q); return (res, rej) => Promise.resolve(r).then(res, rej); }
          return (...args) => { q.ops.push([op, ...args]); return b; };
        },
      });
      return b;
    },
  };
  return db;
}
const C = '11111111-2222-4333-8444-555555555555';
const routeWith = async (db, user = { id: 'maya' }) => {
  const mod = await loadRealModule(join(ROOT, 'src/app/api/me/shared-clients/[clientId]/team/route.ts'), {
    typescript: true,
    registry: new Map([['next/server', nextServer], ['@/lib/request-auth', { currentUser: async () => user, clientForRequest: async () => db }]]),
  });
  return async (qs = '') => {
    const res = await mod.GET(new Request(`https://x/api/me/shared-clients/${C}/team${qs}`), { params: Promise.resolve({ clientId: C }) });
    return { status: res.status, body: await res.json() };
  };
};

test('the route reads on the coach\'s session, finds the thread without creating one, and says what it could not read', async () => {
  const db = fakeDb((q) => {
    if (q.rpc === 'get_client_coaches') return { data: TEAM, error: null };
    if (q.rpc === 'get_shared_client_workouts') return { data: [], error: null };
    if (q.rpc === 'get_shared_client_meal_plan') return { data: null, error: { message: 'down' } };
    if (q.rpc === 'get_client_checkins') return { data: [], error: null };
    if (q.table === 'client_workouts') return { data: [{ trainer_id: 1, title: 'Lower A', scheduled_date: '2026-11-03', payload: {} }, { trainer_id: 77, title: 'Not mine', scheduled_date: '2026-11-03', payload: {} }], error: null };
    if (q.table === 'profiles') return { data: { full_name: 'Marcus T.' }, error: null };
    if (q.table === 'conversations') return { data: [{ id: 'conv-1' }, { id: 'conv-2' }], error: null };
    if (q.table === 'conversation_participants') return { data: [{ conversation_id: 'conv-1', user_id: 'maya' }, { conversation_id: 'conv-2', user_id: 'maya' }, { conversation_id: 'conv-2', user_id: 'rae' }], error: null };
    if (q.table === 'messages') return { data: [{ id: 'm1', sender_id: 'rae', body: 'Hi', metadata: {}, created_at: '2026-11-02T10:00:00Z' }], error: null };
    return { data: [], error: null };
  });
  const get = await routeWith(db);
  const r = await get('?week=2026-11-04&tz=America/New_York');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.shared, true);
  assert.equal(r.body.client.name, 'Marcus T.');
  assert.equal(r.body.week.start, '2026-11-02');
  assert.deepEqual(r.body.lanes[0].days['2026-11-03'].map((x) => x.title), ['Lower A'], 'a row of another trainer id is not the caller\'s');
  assert.deepEqual(r.body.partial, ["the other nutritionists' menus"]);
  assert.equal(r.body.thread.conversationId, 'conv-2');
  assert.equal(r.body.thread.messages[0].from, 'Rae Lindqvist');
  assert.ok(!db.calls.some((c) => c.rpc === 'get_or_create_coach_coach_conversation'), 'a read never creates a thread');
  assert.ok(!db.calls.some((c) => c.ops && c.ops.some((o) => o[0] === 'insert' || o[0] === 'update')), 'a read writes nothing');
});

test('the route refuses a stranger, a bad id and a signed-out caller, and fails loudly on an unreadable team', async () => {
  const stranger = await routeWith(fakeDb((q) => (q.rpc === 'get_client_coaches' ? { data: TEAM, error: null } : { data: [], error: null })), { id: 'someone' });
  assert.equal((await stranger()).status, 403);
  const anon = await routeWith(fakeDb(() => ({ data: [], error: null })), null);
  assert.equal((await anon()).status, 401);
  const down = await routeWith(fakeDb((q) => (q.rpc === 'get_client_coaches' ? { data: null, error: { message: 'x' } } : { data: [], error: null })));
  assert.equal((await down()).status, 502);
  const lone = await routeWith(fakeDb((q) => (q.rpc === 'get_client_coaches' ? { data: [TEAM[0]], error: null } : { data: [], error: null })));
  const r = await lone();
  assert.equal(r.status, 200);
  assert.equal(r.body.shared, false);
  assert.equal(r.body.thread, null);
});

test('the website: Clients → Shared opens the Team view, and the drawer has a Team tab for a shared client', () => {
  for (const p of ['public/newdesign/trainerClientsPage.jsx', 'public/newdesign/nutritionistClientsPage.jsx']) assert.match(read(p), /\{ key: "shared", label: "Shared",/);
  for (const h of ['TrainerApp.html', 'NutritionistApp.html', 'TrainerClients.html', 'NutritionistClients.html']) {
    const html = read('public/newdesign/' + h);
    assert.ok(html.indexOf('src="sharedTeam.jsx"') > html.indexOf('src="sharedClientsTab.jsx"'), h);
  }
  const tab = read('public/newdesign/sharedClientsTab.jsx');
  assert.match(tab, /<window\.SharedTeamPanel clientId=\{r\.clientId\} role=\{role\} withUserId=\{r\.counterpart\.userId\} \/>/);
  const drawer = read('public/newdesign/dashRoster.jsx');
  assert.match(drawer, /const isShared = Array\.isArray\(sharedRows\) && sharedRows\.some\(\(r\) => r && r\.clientId === rowId\)/);
  assert.match(drawer, /\{isShared && tab === "team" \? <window\.SharedTeamPanel clientId=\{rowId\} role=\{role\} compact \/> :/);
  // The hook is called before the drawer's early return.
  assert.ok(drawer.indexOf('window.useSharedClients()') < drawer.indexOf('  if (!row) return null;\n  const isShared'));
  const team = read('public/newdesign/sharedTeam.jsx');
  assert.match(team, /fetch\("\/api\/me\/shared-clients\/" \+ encodeURIComponent\(clientId\) \+ "\/team\?"/);
  assert.match(team, /fetch\("\/api\/conversations\/" \+ encodeURIComponent\(cid\) \+ "\/messages"/);
  assert.match(team, /never sees this care-team thread/);
  assert.match(read('src/lib/warroom.ts'), /\['\/api\/me\/shared-clients\/\[clientId\]\/team', 'GET'\]/);
});
