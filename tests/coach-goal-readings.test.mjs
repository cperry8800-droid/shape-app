// What the Goal page's pace reads beyond the analytics payload (P4, 2026-11-05): the weekly adherence
// readings the analytics routes record (src/lib/coach-goal-readings.ts, coach_goal_readings), the days
// a coach's programs were first published (coach_plans.published_at), the route that serves both
// (GET /api/coach/goal-readings), the coach's own Score history (GET /api/coach/score/history), and
// the migrations behind them.
// Run: node --test tests/coach-goal-readings.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const require_ = createRequire(join(ROOT, 'package.json'));
const COACH = '33333333-3333-4333-8333-333333333333';
const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();

// A route with its own imports mapped; `auth` is what the sign-in lookup answers, `db` the caller's
// own client, `admin` the service role's.
async function routeOf(rel, { db, admin = null, auth = { user: { id: COACH }, error: null } }) {
  return loadRealModule(join(ROOT, rel), {
    typescript: true,
    registry: new Map([
      ['next/server', require_('next/server')],
      ['@/lib/request-auth', { clientForRequest: async () => db, userLookupForRequest: async () => auth }],
      ['@/lib/auth-lookup', await loadRealModule(join(ROOT, 'src/lib/auth-lookup.ts'), { typescript: true })],
      ['@/lib/read-all-by-id', await loadRealModule(join(ROOT, 'src/lib/read-all-by-id.ts'), { typescript: true })],
      ['@/lib/supabase/admin', { createAdminClient: () => admin }],
    ]),
  });
}
const get = async (route, query) => {
  const res = await route.GET(new Request('https://shape.test/api/x' + query));
  return { status: res.status, body: await res.json() };
};
const quiet = async (fn) => { const w = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = w; } };

// ── GET /api/coach/goal-readings ────────────────────────────────────────────────────────────
const READINGS = 'src/app/api/coach/goal-readings/route.ts';
const coachTables = (over = {}) => ({
  trainers: [{ id: 7, owner_id: COACH }, { id: 9, owner_id: COACH }, { id: 8, owner_id: 'someone-else' }],
  coach_goal_readings: [
    { provider_role: 'trainer', provider_id: 7, metric: 'adherencePct', week_of: '2026-10-19', on_day: '2026-10-22', value: 78 },
    { provider_role: 'trainer', provider_id: 7, metric: 'adherencePct', week_of: '2026-10-26', on_day: '2026-10-30', value: '81' },
    { provider_role: 'trainer', provider_id: 9, metric: 'adherencePct', week_of: '2026-10-26', on_day: '2026-10-30', value: 50 },
    { provider_role: 'nutritionist', provider_id: 7, metric: 'adherencePct', week_of: '2026-10-26', on_day: '2026-10-30', value: 40 },
  ],
  coach_plans: [
    { id: 'p1', owner_id: COACH, kind: 'program', published: true, published_at: '2026-10-28T10:00:00Z', created_at: '2026-09-01T10:00:00Z' },
    { id: 'p2', owner_id: COACH, kind: 'program', published: true, published_at: '2026-10-10T10:00:00Z', created_at: '2026-10-10T09:00:00Z' },
    { id: 'p3', owner_id: COACH, kind: 'program', published: false, published_at: '2026-10-11T10:00:00Z', created_at: '2026-10-11T10:00:00Z' },
    { id: 'p4', owner_id: COACH, kind: 'meal_plan', published: true, published_at: '2026-10-12T10:00:00Z', created_at: '2026-10-12T10:00:00Z' },
    { id: 'p5', owner_id: 'someone-else', kind: 'program', published: true, published_at: '2026-10-13T10:00:00Z', created_at: '2026-10-13T10:00:00Z' },
  ],
  ...over,
});

test('goal readings: the adherence weeks of the caller\'s listing and the days their programs were first published', async () => {
  const route = await routeOf(READINGS, { db: fakeSupabase({ tables: coachTables() }) });
  const { status, body } = await get(route, '?role=trainer');
  assert.equal(status, 200);
  assert.equal(body.providerId, 7, 'their oldest listing');
  assert.deepEqual(body.adherence, [{ on: '2026-10-22', value: 78 }, { on: '2026-10-30', value: 81 }], 'the day each week\'s reading was taken, oldest first, numbers');
  assert.deepEqual(body.programs, { kind: 'program', published: ['2026-10-10', '2026-10-28'], source: 'published_at' }, 'published ones only, by the day they were published, not created');
  const other = await get(route, '?role=trainer&provider_id=9');
  assert.deepEqual([other.body.providerId, other.body.adherence], [9, [{ on: '2026-10-30', value: 50 }]]);
  const notMine = await get(route, '?role=trainer&provider_id=8');
  assert.equal(notMine.body.providerId, 7, 'a listing the caller does not own is never read');
});

test('goal readings: a nutritionist\'s are their meal plans; before the migrations, created days stand in and the readings are unread', async () => {
  const tables = coachTables({ nutritionists: [{ id: 3, owner_id: COACH }] });
  const route = await routeOf(READINGS, { db: fakeSupabase({ tables }) });
  const { body } = await get(route, '?role=nutritionist');
  assert.deepEqual(body.programs.published, ['2026-10-12']);
  // published_at not there yet: PostgreSQL's undefined_column on the first read, then created_at.
  const db = fakeSupabase({ tables: coachTables(), fail: ['coach_goal_readings'] });
  const from = db.from;
  db.from = (t) => {
    const chain = from(t);
    if (t !== 'coach_plans') return chain;
    const select = chain.select;
    chain.select = (cols, o) => (String(cols).includes('published_at')
      ? { eq() { return this; }, gt() { return this; }, order() { return this; }, limit() { return Promise.resolve({ data: null, error: { code: '42703', message: 'column coach_plans.published_at does not exist' } }); } }
      : select(cols, o));
    return chain;
  };
  const before = await routeOf(READINGS, { db });
  const pre = await quiet(() => get(before, '?role=trainer'));
  assert.equal(pre.status, 200);
  assert.deepEqual(pre.body.programs, { kind: 'program', published: ['2026-09-01', '2026-10-10'], source: 'created_at' }, 'said, not hidden');
  assert.equal(pre.body.adherence, null, 'unread, never an empty history');
  const failed = await routeOf(READINGS, { db: fakeSupabase({ tables: coachTables(), fail: ['coach_plans'] }) });
  assert.equal((await quiet(() => get(failed, '?role=trainer'))).body.programs, null);
});

test('goal readings: signed out is 401, an auth outage 503, no listing 404, a bad role 400', async () => {
  const db = fakeSupabase({ tables: coachTables() });
  assert.equal((await get(await routeOf(READINGS, { db, auth: { user: null, error: null } }), '?role=trainer')).status, 401);
  assert.equal((await quiet(async () => get(await routeOf(READINGS, { db, auth: { user: null, error: { status: 500, message: 'down' } } }), '?role=trainer'))).status, 503);
  assert.equal((await get(await routeOf(READINGS, { db: fakeSupabase({ tables: { trainers: [] } }) }), '?role=trainer')).status, 404);
  assert.equal((await quiet(async () => get(await routeOf(READINGS, { db: fakeSupabase({ tables: coachTables(), fail: ['trainers'] }) }), '?role=trainer'))).status, 503);
  assert.equal((await get(await routeOf(READINGS, { db }), '?role=client')).status, 400);
});

// ── Recording a week's reading ──────────────────────────────────────────────────────────────
test('a week\'s reading: recorded with the coach\'s own session, never for an unread figure, never failing the read', async () => {
  const { recordGoalReading } = await loadRealModule(join(ROOT, 'src/lib/coach-goal-readings.ts'), { typescript: true });
  const db = fakeSupabase();
  assert.equal(await recordGoalReading(db, 'trainer', 7, 86), true);
  assert.deepEqual(db._calls, [{ rpc: 'record_coach_goal_reading', args: { p_role: 'trainer', p_provider_id: 7, p_metric: 'adherencePct', p_value: 86 } }]);
  assert.equal(await recordGoalReading(db, 'trainer', 7, null), false);
  assert.equal(await recordGoalReading(db, 'trainer', 7, NaN), false);
  assert.equal(db._calls.length, 1, 'an unread figure records nothing');
  const warned = [];
  const w = console.warn; console.warn = (...a) => warned.push(a.join(' '));
  try {
    assert.equal(await recordGoalReading(fakeSupabase({ fail: ['rpc:record_coach_goal_reading'] }), 'nutritionist', 3, 50), false);
    assert.equal(await recordGoalReading({ rpc() { throw new Error('boom'); } }, 'trainer', 7, 50), false);
  } finally { console.warn = w; }
  assert.equal(warned.length, 2, 'logged, not thrown');
  for (const [role, figure] of [['trainer', 'avgAdherencePct'], ['nutritionist', 'proteinAdherencePct']]) {
    const src = stripComments(read(`src/app/api/${role}/analytics/route.ts`));
    assert.match(src, new RegExp(`const goalReading = recordGoalReading\\(supabase, '${role}', providerId, ${figure}\\);`), role);
    assert.match(src, /await goalReading;\n\s+return NextResponse\.json\(\{/, role + ': finished before the answer goes');
  }
});

// ── GET /api/coach/score/history ────────────────────────────────────────────────────────────
const HISTORY = 'src/app/api/coach/score/history/route.ts';
const day = (d) => iso(d).slice(0, 10);
const snapshots = () => [
  ...Array.from({ length: 100 }, (_, d) => ({ provider_role: 'trainer', provider_id: 7, day: day(d), points: 1000 + d })),
  { provider_role: 'trainer', provider_id: 8, day: day(1), points: 5 },
  { provider_role: 'nutritionist', provider_id: 7, day: day(1), points: 6 },
];

test('score history: the caller\'s own listing, one reading a day, oldest first, 30 days by default and 90 at most', async () => {
  const admin = fakeSupabase({ tables: { coach_score_snapshots: snapshots() } });
  const route = await routeOf(HISTORY, { db: fakeSupabase({ tables: { trainers: [{ id: 7, owner_id: COACH }, { id: 8, owner_id: 'x' }] } }), admin });
  const def = await get(route, '?role=trainer');
  assert.equal(def.status, 200);
  assert.deepEqual([def.body.providerId, def.body.days, def.body.history.length], [7, 30, 30]);
  assert.deepEqual(def.body.history[0], { day: day(29), points: 1029 });
  assert.deepEqual(def.body.history.at(-1), { day: day(0), points: 1000 });
  assert.equal((await get(route, '?role=trainer&days=90')).body.history.length, 90);
  assert.equal((await get(route, '?role=trainer&days=400')).body.days, 90, 'never more than 90');
  assert.equal((await get(route, '?role=trainer&days=-3')).body.days, 30);
  assert.equal((await get(route, '?role=trainer&provider_id=8')).body.providerId, 7, 'another coach\'s listing is never read');
  assert.ok(admin._calls.every((c) => c.table === 'coach_score_snapshots'));
});

test('score history: 401 signed out, 503 on an outage or a failed read, 404 with no listing, 400 for a bad role', async () => {
  const db = fakeSupabase({ tables: { trainers: [{ id: 7, owner_id: COACH }] } });
  const admin = fakeSupabase({ tables: { coach_score_snapshots: snapshots() } });
  assert.equal((await get(await routeOf(HISTORY, { db, admin, auth: { user: null, error: null } }), '?role=trainer')).status, 401);
  assert.equal((await quiet(async () => get(await routeOf(HISTORY, { db, admin, auth: { user: null, error: { status: 502 } } }), '?role=trainer'))).status, 503);
  assert.equal((await get(await routeOf(HISTORY, { db: fakeSupabase({ tables: { trainers: [] } }), admin }), '?role=trainer')).status, 404);
  assert.equal((await quiet(async () => get(await routeOf(HISTORY, { db, admin: fakeSupabase({ fail: ['coach_score_snapshots'] }) }), '?role=trainer'))).status, 503);
  assert.equal((await get(await routeOf(HISTORY, { db, admin }), '?role=member')).status, 400);
  const src = stripComments(read(HISTORY));
  assert.match(src, /import \{ clientForRequest, userLookupForRequest \} from '@\/lib\/request-auth';/, 'the app\'s Bearer token reads it too');
  assert.match(src, /\.eq\('owner_id', user\.id\)/);
});

// ── The migrations ──────────────────────────────────────────────────────────────────────────
test('migration: readings are written only for the caller\'s own listing, one a week, read only by their coach', () => {
  const code = read('supabase-migrations/2026-11-05-coach-goal-readings.sql').replace(/--.*$/gm, '');
  assert.match(code, /^\s*begin;/m);
  assert.match(code, /commit;\s*$/);
  assert.match(code, /primary key \(provider_role, provider_id, metric, week_of\)/);
  assert.match(code, /alter table public\.coach_goal_readings enable row level security;/);
  assert.match(code, /revoke all on table public\.coach_goal_readings from public, anon, authenticated;/);
  assert.match(code, /grant select on table public\.coach_goal_readings to authenticated;/);
  assert.match(code, /create policy coach_goal_readings_owner_read on public\.coach_goal_readings\s+for select to authenticated/);
  assert.match(code, /v_uid uuid := auth\.uid\(\);/);
  assert.match(code, /if v_uid is null or p_role is null/);
  assert.match(code, /t\.id = p_provider_id and t\.owner_id = v_uid/);
  assert.match(code, /n\.id = p_provider_id and n\.owner_id = v_uid/);
  assert.match(code, /if p_value is null or p_value < 0 or p_value > 100 then/);
  assert.match(code, /v_week date := date_trunc\('week', \(now\(\) at time zone 'UTC'\)\)::date;/);
  assert.match(code, /on conflict \(provider_role, provider_id, metric, week_of\)\s+do update set value = excluded\.value, on_day = excluded\.on_day/);
  assert.match(code, /revoke all on function public\.record_coach_goal_reading\(text, bigint, text, numeric\) from public, anon;/);
  assert.match(code, /grant execute on function public\.record_coach_goal_reading\(text, bigint, text, numeric\) to authenticated, service_role;/);
  assert.match(code, /do \$guard\$[\s\S]*raise exception/);
});

test('migration: published_at is the first time a plan was published, set by the database, backfilled from creation', () => {
  const code = read('supabase-migrations/2026-11-05-coach-plans-published-at.sql').replace(/--.*$/gm, '');
  assert.match(code, /^\s*begin;/m);
  assert.match(code, /commit;\s*$/);
  assert.match(code, /alter table public\.coach_plans add column if not exists published_at timestamptz;/);
  assert.match(code, /alter table public\.coach_program_templates add column if not exists published_at timestamptz;/);
  // The backfill: published rows only, from their creation day, with no trigger stamping them edited.
  const off = code.indexOf('alter table public.coach_plans disable trigger coach_plans_touch;');
  const fill = code.indexOf('update public.coach_plans set published_at = created_at\nwhere published and published_at is null;');
  const on = code.indexOf('alter table public.coach_plans enable trigger coach_plans_touch;');
  const stamp = code.indexOf('create trigger coach_plans_published_at');
  assert.ok(off > 0 && off < fill && fill < on && on < stamp, 'touch trigger off, backfill, touch trigger on, then the new trigger');
  assert.ok(code.indexOf('drop trigger if exists coach_plans_published_at on public.coach_plans;') < fill, 'a re-run backfills with the new trigger gone too');
  assert.match(code, /update public\.coach_program_templates set published_at = created_at\nwhere status = 'published' and published_at is null;/);
  // The trigger owns it: set on the first publish, kept after, never a writer's.
  assert.match(code, /if tg_op = 'INSERT' then\s+new\.published_at := case when new\.published then now\(\) else null end;\s+else\s+new\.published_at := old\.published_at;\s+if new\.published and old\.published_at is null then\s+new\.published_at := now\(\);/);
  assert.match(code, /new\.published_at := case when new\.status = 'published' then now\(\) else null end;/);
  assert.match(code, /before insert or update on public\.coach_plans\s+for each row execute function public\.coach_plans_stamp_published\(\);/);
  assert.match(code, /do \$guard\$[\s\S]*a published coach plan has no published_at after the backfill[\s\S]*a touch trigger was left disabled/);
});
