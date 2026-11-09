// "Who's on it" for meal plans (owner, 2026-11-09: "only the coaches see who's on what plan or
// program"). The page's states are in tests/libraries-6a.test.mjs and the usage read's in
// tests/coach-plan-usage-route.test.mjs; this file holds:
//   1. the write: POST /api/nutritionist/meal-plan records the library plan a plan was sent from as
//      `payload.template.id`, only when one owner-scoped read of coach_plans says it is the
//      caller's own; anything else is dropped and the plan is still sent, with nothing else about
//      the route changed;
//   2. the core: DashMeals.planWho and mostUsedPlan;
//   3. the privacy scan: a shared client's other coach gets a payload rebuilt from `days` alone
//      (get_shared_client_meal_plan), and no member-facing reader renders a payload key it does not
//      know, so `payload.template` reaches no one but the coach who sent it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const nextServer = require('next/server');
const DashMeals = require('../public/newdesign/dashMealCore.js');

const COACH = { id: '11111111-1111-4111-8111-111111111111' };
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLAN = '0c6f2d8e-3b1a-4c5d-9e7f-1a2b3c4d5e6f';
const DAYS = [{ dow: 0, title: 'Lean week', meals: [{ slot: 'Lunch', title: 'Chicken bowl', kcal: 540 }] }];

// ── 1. The write ─────────────────────────────────────────────────────────────────────────────────
// The shipped route, with each table answering as a nutritionist's own would: their nutritionist
// row, an open subscription for client A, and the coach_plans read answering `owned`.
async function mealPlanRoute({ owned = { data: { id: PLAN }, error: null }, subs = [{ client_id: A }] } = {}) {
  const calls = [], writes = [], notices = [];
  const chain = (table) => {
    const q = {};
    for (const m of ['select', 'eq', 'in']) q[m] = (...args) => { calls.push([table, m, ...args]); return q; };
    q.update = (v) => { writes.push([table, 'update', v]); return q; };
    q.insert = (v) => { writes.push([table, 'insert', v]); return q; };
    q.maybeSingle = async () => { calls.push([table, 'maybeSingle']); return table === 'nutritionists' ? { data: { id: 5 }, error: null } : table === 'coach_plans' ? owned : { data: null, error: null }; };
    q.single = async () => ({ data: { id: 'plan-1' }, error: null });
    q.then = (res, rej) => Promise.resolve(table === 'subscriptions' ? { data: subs, error: null } : { data: null, error: null }).then(res, rej);
    return q;
  };
  const mod = await loadRealModule(join(ROOT, 'src/app/api/nutritionist/meal-plan/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => ({ id: COACH.id }), clientForRequest: async () => ({ from: chain }) }],
      ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) })],
      ['@/lib/access-guards.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/access-guards.mjs')).href)],
      ['@/lib/compliance/server', { gateProviderAction: async () => ({ enforced: false, allowed: true, disclaimer: 'Not medical advice.', scope: 'mnt', reason: null }), blockMessage: () => '' }],
      ['@/lib/supabase/admin', { createAdminClient: () => ({ admin: true }) }],
      ['@/lib/notify', { createNotification: async (c, n) => { notices.push(n); return true; } }],
    ]),
  });
  const post = async (extra = {}) => {
    const res = await mod.POST(new Request('https://x/api/nutritionist/meal-plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: A, title: 'Lean week', weekStart: '2026-11-16', days: DAYS, ...extra }) }));
    return { status: res.status, body: await res.json() };
  };
  const inserted = () => writes.filter(([t, k]) => t === 'client_meal_plans' && k === 'insert').map(([, , v]) => v);
  const planReads = () => calls.filter(([t]) => t === 'coach_plans');
  return { post, calls, writes, notices, inserted, planReads };
}

test('the write: a library plan of the caller\'s own rides beside days, from one owner-scoped read', async () => {
  const r = await mealPlanRoute();
  const out = await r.post({ templateId: PLAN });
  assert.equal(out.status, 200);
  assert.deepEqual(r.inserted(), [{ nutritionist_id: 5, client_id: A, title: 'Lean week', week_start: '2026-11-16', status: 'published', payload: { days: DAYS, template: { id: PLAN } } }]);
  assert.deepEqual(r.planReads(), [['coach_plans', 'select', 'id'], ['coach_plans', 'eq', 'id', PLAN], ['coach_plans', 'eq', 'owner_id', COACH.id], ['coach_plans', 'maybeSingle']], 'one read, by its id and the caller');
  // Nothing else about the route changed: the archive, the notice and the response.
  assert.deepEqual(r.writes.filter(([, k]) => k === 'update'), [['client_meal_plans', 'update', { status: 'archived' }]]);
  assert.equal(r.notices.length, 1);
  assert.deepEqual(r.notices[0].data, { mealPlanId: 'plan-1', copy: { title: ['mealPlan.title'] } }, 'the notice carries no plan id of the library\'s');
  assert.deepEqual(out.body, { ok: true, id: 'plan-1', disclaimer: 'Not medical advice.', compliance: { scope: 'mnt', allowed: true, enforced: false, reason: null } });
  // Trimmed, and stored as the library holds it.
  const padded = await mealPlanRoute();
  await padded.post({ templateId: '  ' + PLAN.toUpperCase() + '\n' });
  assert.equal(padded.planReads()[1][3], PLAN.toUpperCase(), 'read by the trimmed id');
  assert.deepEqual(padded.inserted()[0].payload, { days: DAYS, template: { id: PLAN } });
});

test('the write: an id that is not the caller\'s own, or a read that failed, is dropped, and the plan is still sent', async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    for (const owned of [{ data: null, error: null }, { data: null, error: { message: 'boom' } }, { data: {}, error: null }]) {
      const r = await mealPlanRoute({ owned });
      const out = await r.post({ templateId: PLAN });
      assert.equal(out.status, 200, JSON.stringify(owned));
      assert.equal(out.body.ok, true);
      assert.equal(r.planReads().length, 4, 'it was asked');
      assert.deepEqual(r.inserted()[0].payload, { days: DAYS }, 'no template recorded: ' + JSON.stringify(owned));
      assert.equal(r.notices.length, 1, 'the member is still told');
    }
  } finally { console.warn = warn; }
});

test('the write: a malformed id is ignored without a read, and the plan is sent', async () => {
  for (const templateId of [123, {}, [PLAN], true, null, '', '   ', 'not-a-plan', 'x'.repeat(65), PLAN + 'x', PLAN.slice(1), PLAN.replace(/-/g, '')]) {
    const r = await mealPlanRoute();
    const out = await r.post({ templateId });
    assert.equal(out.status, 200, JSON.stringify(templateId));
    assert.equal(r.planReads().length, 0, 'no read for ' + JSON.stringify(templateId));
    assert.deepEqual(r.inserted()[0].payload, { days: DAYS });
  }
});

test('the write: with no id it is the route as it was', async () => {
  const r = await mealPlanRoute();
  const out = await r.post();
  assert.equal(out.status, 200);
  assert.equal(r.planReads().length, 0);
  assert.deepEqual(r.inserted()[0].payload, { days: DAYS });
  assert.deepEqual(Object.keys(out.body), ['ok', 'id', 'disclaimer', 'compliance']);
});

test('the write: a refused send reads no library plan and writes nothing', async () => {
  const r = await mealPlanRoute({ subs: [] });
  const out = await r.post({ templateId: PLAN });
  assert.equal(out.status, 403);
  assert.equal(r.planReads().length, 0);
  assert.equal(r.writes.length, 0);
});

// ── 2. The core ──────────────────────────────────────────────────────────────────────────────────
const client = (id, name, rankPoints = 2240) => ({ profile: { id, name }, rankPoints });
const ROSTER = [client('c1', 'Priya S.'), client('c2', 'Tess B.', null), client('c3', 'Ana K.')];

test('planWho matches ids to the roster, counts an id it does not hold, and names each person once', () => {
  const who = DashMeals.planWho({ clients: 2, clientIds: ['c2', 'c9', 'c1', 'c2', '', 7] }, ROSTER);
  assert.deepEqual([who.count, who.people.map((p) => p.name), who.elsewhere], [3, ['Priya S.', 'Tess B.'], 1]);
  assert.equal(who.people[1].rankPoints, null, 'an unknown tier stays unknown');
  assert.deepEqual(DashMeals.planWho({ clients: 4 }, ROSTER), { count: 4, people: null, elsewhere: 0 }, 'how many, not who');
  assert.deepEqual(DashMeals.planWho(null, ROSTER), { count: 0, people: null, elsewhere: 0 });
  assert.deepEqual(DashMeals.planWho({ clients: 0, clientIds: [] }, ROSTER), { count: 0, people: [], elsewhere: 0 });
  assert.equal(DashMeals.planWho({ clients: 1, clientIds: ['c1'] }, [client('c1', '  ')]).people[0].name, 'A client');
});

test('mostUsedPlan: one top count of at least two, from a read that counted every current plan', () => {
  const map = { m1: { clients: 3 }, m2: { clients: 1 } };
  assert.deepEqual(DashMeals.mostUsedPlan(map, false, 0), { id: 'm1', clients: 3 });
  assert.equal(DashMeals.mostUsedPlan(map, true, 0), null, 'a capped read under-counts');
  assert.equal(DashMeals.mostUsedPlan(map, false, 2), null, 'so does one with plans Shape cannot place');
  assert.equal(DashMeals.mostUsedPlan(map, false, null), null, 'an unknown count of those is not none');
  assert.equal(DashMeals.mostUsedPlan({ m1: { clients: 2 }, m2: { clients: 2 } }, false, 0), null, 'a tie');
  assert.equal(DashMeals.mostUsedPlan({ m1: { clients: 1 } }, false, 0), null, 'one client');
  assert.equal(DashMeals.mostUsedPlan(null, false, 0), null);
});

// ── 3. The privacy scan ──────────────────────────────────────────────────────────────────────────
// Every migration that defines get_shared_client_meal_plan, and that function's body.
const SHARED = readdirSync(join(ROOT, 'supabase-migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => [f, read('supabase-migrations/' + f)])
  .filter(([, sql]) => sql.includes('create or replace function public.get_shared_client_meal_plan('))
  .map(([f, sql]) => {
    const at = sql.indexOf('create or replace function public.get_shared_client_meal_plan(');
    const from = sql.indexOf('as $$', at), to = sql.indexOf('$$;', from + 5);
    assert.ok(from > at && to > from, f);
    return [f, sql.slice(from, to)];
  });

test('a shared client\'s other coach gets a payload rebuilt from days alone, so payload.template never reaches them', () => {
  // A new definition is a new reading of this rule: add it here once it is checked.
  assert.deepEqual(SHARED.map(([f]) => f), ['2026-10-29-shared-client-schedules.sql', '2026-10-29-shared-schedules-any-coach.sql']);
  for (const [f, body] of SHARED) {
    assert.match(body, /jsonb_build_object\('days', coalesce\(\(/, f + ': the payload is built, not handed over');
    assert.doesNotMatch(body, /m\.payload(?!->'days')/, f + ': the stored payload is read only for its days');
    assert.doesNotMatch(body, /template/i, f);
    // Each day and each meal is projected key by key: the days carry nothing they were not asked for.
    assert.match(body, /jsonb_build_object\(\s*'dow', d\.day->'dow',\s*'title', d\.day->'title',\s*'tag', d\.day->'tag',\s*'meals',/, f);
    assert.match(body, /jsonb_build_object\('slot', x\.meal->'slot', 'title', x\.meal->'title', 'time', x\.meal->'time', 'kcal', x\.meal->'kcal'\)/, f);
  }
});

test('no member-facing reader renders a meal plan payload key it does not know', () => {
  // The member's plan (/api/client/plan, the app's and the website's Eat): days, and nothing else.
  const plan = read('src/app/api/client/plan/route.ts');
  assert.equal((plan.match(/\bmp\??\.payload\b/g) || []).length, 3);
  assert.match(plan, /const mealDays = mp && mp\.payload && Array\.isArray\(\(mp\.payload as Record<string, unknown>\)\.days\)\s+\? \(mp\.payload as Record<string, unknown>\)\.days\s+: \[\];/);
  // The calendar (the member's, and a coach's view of a client): the menu's days.
  const cal = read('src/app/api/calendar/route.ts');
  assert.equal((cal.match(/\bmp\??\.payload\b/g) || []).length, 3);
  assert.match(cal, /const menuDays: MenuDay\[\] = mp\.payload && Array\.isArray\(\(mp\.payload as Record<string, unknown>\)\.days\)\s+\? \(\(mp\.payload as Record<string, unknown>\)\.days as MenuDay\[\]\)/);
  assert.match(cal, /payload: row\.payload \}, by: row\.nutritionist_name/, 'the other coaches\' menus are the definer\'s projection');
  // Nora's read of the member's day: the plan's days.
  const nora = read('src/lib/ai/memberReads.mjs');
  const declared = "const payload = plan.payload && typeof plan.payload === 'object' ? plan.payload : {};";
  const at = nora.indexOf(declared);
  assert.ok(at > 0);
  const block = nora.slice(at + declared.length, nora.indexOf('if (plan.nutritionist_id != null)', at));
  assert.deepEqual([...block.matchAll(/\bpayload\b(\.\w+)?/g)].map((m) => m[0]), ['payload.days', 'payload.days', 'payload.days']);
  assert.equal((nora.match(/\bplan\.payload\b/g) || []).length, 3, 'read nowhere else');
  // The night-before reminder: the plan's days.
  assert.match(read('src/app/api/cron/prep-reminders/route.ts'), /const days = payload && typeof payload === 'object' \? \(payload as Row\)\.days : null;/);
  // And no screen reads the table itself: the website and the app go through those routes.
  const screens = [
    ...readdirSync(join(ROOT, 'public/newdesign')).filter((f) => /\.(m?js|jsx)$/.test(f)).map((f) => 'public/newdesign/' + f),
    ...readdirSync(join(ROOT, 'mobile-app/src'), { recursive: true }).filter((f) => /\.(m?js|jsx)$/.test(f)).map((f) => 'mobile-app/src/' + f),
  ];
  for (const f of screens) assert.doesNotMatch(read(f), /from\(\s*['"]client_meal_plans['"]\s*\)/, f);
});

// Owner, 2026-11-09: the app records which library plan a meal plan came from too, so the website
// library can say who is on it. The route keeps the id only when it is the caller's own, and an
// older build that sends none still works.
test('the app sends the library plan it assigned from', () => {
  const backend = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');
  assert.match(backend, /async function assignClientMealPlan\(\{ clientId, title, weekStart, days, templateId \}\)/);
  assert.match(backend, /body: JSON\.stringify\(\{ clientId, title, weekStart: weekStart \|\| null, days, \.\.\.\(templateId \? \{ templateId: String\(templateId\) \} : \{\}\) \}\)/);
  const pros = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx', import.meta.url), 'utf8');
  assert.match(pros, /window\.ShapeAssign\.mealPlan\(\{ clientId: uid, title: plan\.name, weekStart: bsAssignIso\(monday\), days, templateId: plan\.id \}\)/);
});
