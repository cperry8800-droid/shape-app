// The train and progress APIs add up loads in POUNDS, whatever unit each set was
// logged in.
//
// ⚠ THEY ADDED THE TYPED NUMBERS. `/api/client/train` summed actual_load × reps
// into `volume7dLb`/`totalVolumeLb` without reading `load_unit`, and the progress
// route took each week's top raw load for the strength series and compared raw loads
// for its windowed PRs. So a member logging in kilograms had kilogram figures
// labelled pounds (and then converted AGAIN by a page following their setting), and
// a member logging both had 100 kg lose to 200 lb. The pages convert from pounds
// (#2213), so the routes have to hand them pounds.
//
// These drive the SHIPPED GET handlers (loadRealModule compiles the real route
// files) against a stubbed Supabase client that answers each table with fixture
// rows; nothing about the routes is restated here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const LB = 1 / 0.45359237;
const now = Date.now();
const ago = (days) => new Date(now - days * 86400000).toISOString();

// A query builder that answers every chain with the table's rows, holding only the
// columns the query SELECTED, as the database does: a route that stops asking for
// `load_unit` must not still be handed it.
function stubClient(tables) {
  const user = { id: 'u-1' };
  const chain = (table) => {
    let rows = tables[table] || [];
    const q = {
      select: (cols) => {
        const keep = String(cols || '*').split(',').map((c) => c.trim()).filter(Boolean);
        if (!keep.includes('*')) rows = rows.map((r) => Object.fromEntries(keep.filter((k) => k in r).map((k) => [k, r[k]])));
        return q;
      },
      eq: () => q, neq: () => q, in: () => q, gte: () => q, lte: () => q, lt: () => q, gt: () => q,
      order: () => q, limit: () => q, not: () => q, is: () => q, ilike: () => q, or: () => q, filter: () => q,
      maybeSingle: async () => ({ data: rows[0] || null, error: null }),
      single: async () => ({ data: rows[0] || null, error: null }),
      then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej),
    };
    return q;
  };
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: chain,
    rpc: async () => ({ data: null, error: { message: 'not applied' } }),
  };
}

let mods = null;
async function routes() {
  if (mods) return mods;
  const { loadRealModule } = await import('./helpers/load-real-module.mjs');
  const nextServer = require('next/server');
  const lib = (f) => loadRealModule(join(ROOT, 'src/lib', f), { typescript: true });
  const [time, setLoad, e1rm, readiness] = await Promise.all([lib('time.ts'), lib('set-load.ts'), lib('e1rm.ts'), lib('recovery-readiness.ts')]);
  let client = null;
  const registry = () => new Map([
    ['next/server', nextServer],
    ['@/lib/time', time],
    ['@/lib/set-load', setLoad],
    ['@/lib/e1rm', e1rm],
    ['@/lib/recovery-readiness', readiness],
    ['@/lib/require-membership', { requireMembership: async () => null }],
    ['@/lib/supabase/server', { createClient: async () => client }],
    ['@/lib/request-auth', { clientForRequest: async () => client, currentUser: async () => ({ id: 'u-1' }) }],
  ]);
  const train = await loadRealModule(join(ROOT, 'src/app/api/client/train/route.ts'), { typescript: true, registry: registry() });
  const progress = await loadRealModule(join(ROOT, 'src/app/api/client/progress/route.ts'), { typescript: true, registry: registry() });
  mods = { train, progress, setLoad, use: (c) => { client = c; } };
  return mods;
}
const call = async (route, tables) => {
  const m = await routes();
  m.use(stubClient(tables));
  const res = await m[route].GET(new Request('https://shape.test/api/client/' + route));
  return res.json();
};

test('the unit rule is the app logger\'s, and the factor the PR RPC\'s', async () => {
  const { setLoad } = await routes();
  assert.equal(setLoad.setLoadUnit('kg'), 'kg');
  assert.equal(setLoad.setLoadUnit('KG'), 'kg');
  assert.equal(setLoad.setLoadUnit('lbs'), 'lb');
  assert.equal(setLoad.setLoadUnit(null), 'lb', 'the column default');
  assert.ok(Math.abs(setLoad.setLoadLb(100, 'kg') - 220.462) < 1e-3);
  assert.equal(setLoad.setLoadLb(225, 'lb'), 225);
});

test('the train page\'s volume is pounds, whatever the sets were logged in', async () => {
  const sets = [
    { actual_load: 100, actual_reps: 5, completed: true, created_at: ago(1), payload: {}, load_unit: 'kg' },
    { actual_load: 225, actual_reps: 5, completed: true, created_at: ago(2), payload: {}, load_unit: 'lb' },
    { actual_load: 60, actual_reps: 10, completed: true, created_at: ago(20), payload: {}, load_unit: 'kg' },
  ];
  const body = await call('train', { workout_set_logs: sets, workout_sessions: [], client_workouts: [] });
  const week = 100 * LB * 5 + 225 * 5;
  assert.equal(body.stats.volume7dLb, Math.round(week), 'the 7-day volume: 100 kg × 5 + 225 lb × 5, in pounds');
  assert.equal(body.stats.totalVolumeLb, Math.round(week + 60 * LB * 10));
});

test('a session\'s best set is the heaviest in pounds, and names its own unit', async () => {
  const sessions = [{ id: 's-1', title: 'Upper', status: 'completed', started_at: ago(1), ended_at: ago(1), created_at: ago(1), duration_seconds: 3000 }];
  const sets = [
    { session_id: 's-1', move_index: 0, move_name: 'Bench', set_number: 1, target_reps: '5', target_load: null, actual_reps: 5, actual_load: 200, load_unit: 'lb', completed: true },
    { session_id: 's-1', move_index: 0, move_name: 'Bench', set_number: 2, target_reps: '5', target_load: null, actual_reps: 3, actual_load: 100, load_unit: 'kg', completed: true },
  ];
  const body = await call('train', { workout_set_logs: sets, workout_sessions: sessions, client_workouts: [] });
  const bench = body.recentSessions[0].moves.find((m) => m.name === 'Bench');
  assert.equal(bench.best, '100 kg × 3', '100 kg (220.5 lb) is the heavier set, and it says kilograms');
});

test('the progress route ranks PRs in pounds and keeps the winning set\'s own load and unit', async () => {
  const sets = [
    { move_name: 'Squat', actual_load: 200, actual_reps: 5, load_unit: 'lb', payload: {}, created_at: ago(3), completed: true },
    { move_name: 'Squat', actual_load: 102.5, actual_reps: 5, load_unit: 'kg', payload: {}, created_at: ago(2), completed: true },
    { move_name: 'Bench', actual_load: 80, actual_reps: 3, load_unit: 'kg', payload: {}, created_at: ago(3), completed: true },
    { move_name: 'Bench', actual_load: 185, actual_reps: 3, load_unit: 'lb', payload: {}, created_at: ago(1), completed: true },
  ];
  const body = await call('progress', { workout_set_logs: sets });
  const squat = body.prs.find((p) => p.move === 'Squat');
  assert.deepEqual([squat.best, squat.unit], [102.5, 'kg'], '102.5 kg (226 lb) beats 200 lb, and stays 102.5 kg: a round trip through pounds would read "103 kg"');
  assert.equal(squat.e1rm, Math.round(102.5 * (1 + 5 / 30) * 10) / 10, 'the e1RM is in the PR\'s own unit');
  const bench = body.prs.find((p) => p.move === 'Bench');
  assert.deepEqual([bench.best, bench.unit], [185, 'lb'], 'a heavier set in the other unit takes the load AND the unit');
  assert.deepEqual(body.prs.map((p) => p.move), ['Squat', 'Bench'], 'ordered by weight in pounds (226 lb ahead of 185 lb)');
});

test('the strength series is pounds', async () => {
  const sets = [
    { move_name: 'Squat', actual_load: 100, actual_reps: 5, load_unit: 'kg', payload: {}, created_at: ago(1), completed: true },
    { move_name: 'Squat', actual_load: 200, actual_reps: 5, load_unit: 'lb', payload: {}, created_at: ago(2), completed: true },
  ];
  const body = await call('progress', { workout_set_logs: sets });
  const top = Math.max(...body.series.strength.map((p) => p.value));
  assert.ok(Math.abs(top - 100 * LB) < 1e-6, 'the week\'s top is 100 kg in pounds, not "100"');
});

test('the all-time PR RPC\'s rows keep their own load and unit, like the fallback', async () => {
  const m = await routes();
  const client = stubClient({ workout_set_logs: [] });
  client.rpc = async (name) => (name === 'get_my_lift_prs'
    ? { data: [{ move: 'Squat', best: 102.5, best_reps: 5, unit: 'kg', best_at: ago(2) }, { move: 'Bench', best: 185, best_reps: 3, unit: 'lb', best_at: ago(1) }], error: null }
    : { data: null, error: { message: 'not applied' } });
  m.use(client);
  const body = await (await m.progress.GET(new Request('https://shape.test/api/client/progress'))).json();
  assert.deepEqual(body.prs.map((p) => [p.move, p.best, p.unit]), [['Squat', 102.5, 'kg'], ['Bench', 185, 'lb']]);
});
