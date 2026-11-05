// tests/weigh-in-award.test.mjs
//
// Goal-milestone points are awarded by the server, where the weigh-in is written (P7). The app wrote
// client_weigh_ins itself and then called award_my_goal_milestones; the website wrote the same row,
// swallowed any error and never awarded. Both write through /api/client/weigh-in now. Pinned here:
//   - weighInKg: kilograms to the hundredth, pounds converted, a weight no person has refused;
//   - the route, DRIVEN: the row in kilograms on the member's own day, then the award; no award while
//     the stored goal is in pounds or unreadable; a failed write is an error and awards nothing; the
//     body-fat column missing still lands the weight; `check` is the award alone;
//   - both surfaces call the route, and neither writes the row or calls the RPC itself; the website
//     reads the newest 104 weigh-ins (the client audit's B2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const code = (p) => stripComments(read(p));
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const UID = 'u1';
const DAY = '2026-11-05';

const cas = await loadRealModule(join(ROOT, 'src/lib/user-goals-cas.ts'), { typescript: true });
const lib = await loadRealModule(join(ROOT, 'src/lib/goal-milestones.ts'), { typescript: true, registry: new Map([['@/lib/user-goals-cas', cas]]) });

test('a weigh-in in kilograms: pounds converted, to the hundredth; a weight no person has is refused', () => {
  assert.equal(lib.weighInKg(82.456, 'kg'), 82.46);
  assert.equal(lib.weighInKg(185, 'lb'), 83.91);
  assert.equal(lib.weighInKg(185, 'lbs'), 83.91);
  assert.equal(lib.weighInKg(80, undefined), 80, 'kilograms by default');
  assert.equal(lib.weighInKg(19.99, 'kg'), null);
  assert.equal(lib.weighInKg(400.01, 'kg'), null);
  assert.equal(lib.weighInKg(20, 'kg'), 20);
  assert.equal(lib.weighInKg(400, 'kg'), 400);
  for (const bad of ['80', null, NaN, -1, 0, Infinity]) assert.equal(lib.weighInKg(bad, 'kg'), null, String(bad));
  assert.equal(lib.goalUnitIsPounds('lb'), true);
  assert.equal(lib.goalUnitIsPounds(' Pounds'), true);
  assert.equal(lib.goalUnitIsPounds('kg'), false);
  assert.equal(lib.goalUnitIsPounds(undefined), false);
});

// A client with the two tables the route touches and the RPC.
function client({ goals = { overall: { unit: 'kg', start: 90, target: 80 } }, failGoals = false, writeErrors = [], milestones = [{ milestone: '25% to goal', points: 50 }], rpcError = null } = {}) {
  const calls = [];
  const rows = [];
  let writes = 0;
  return {
    calls, rows,
    auth: { getUser: async () => ({ data: { user: { id: UID } } }) },
    async rpc(name, args) { calls.push({ rpc: name, args }); return rpcError ? { data: null, error: rpcError } : { data: milestones, error: null }; },
    from(table) {
      if (table === 'user_goals') {
        const f = {};
        const chain = {
          select() { return chain; },
          eq(c, v) { f[c] = v; return chain; },
          maybeSingle() { return chain; },
          then(res, rej) {
            calls.push({ op: 'goals-read', kind: f.kind });
            const out = failGoals ? { data: null, error: { message: 'down' } } : { data: goals ? { data: goals } : null, error: null };
            return Promise.resolve(out).then(res, rej);
          },
        };
        return chain;
      }
      if (table === 'client_weigh_ins') {
        let row = null;
        let opts = null;
        const chain = {
          upsert(r, o) { row = { ...r }; opts = o; return chain; },
          select() { return chain; },
          maybeSingle() { return chain; },
          then(res, rej) {
            calls.push({ op: 'weigh-in', row, opts });
            const err = writeErrors[writes++] || null;
            if (!err) rows.push(row);
            return Promise.resolve(err ? { data: null, error: err } : { data: { logged_on: row.logged_on, weight: row.weight }, error: null }).then(res, rej);
          },
        };
        return chain;
      }
      throw new Error('unexpected table ' + table);
    },
  };
}

async function loadRoute(c) {
  const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
  const localDay = await loadRealModule(join(ROOT, 'src/lib/local-day.ts'), { typescript: true });
  return loadRealModule(join(ROOT, 'src/app/api/client/weigh-in/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { clientForRequest: async () => c, currentUser: async () => (await c.auth.getUser()).data.user }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/local-day', localDay],
      ['@/lib/require-membership', { requireMembership: async () => null }],
      ['@/lib/goal-milestones', lib],
    ]),
  });
}
const post = (body) => new Request('https://shape.test/api/client/weigh-in', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('the row is written in kilograms on the member\'s day, then the milestones it reached are awarded', async () => {
  const c = client();
  const route = await loadRoute(c);
  const res = await route.POST(post({ weight: 185, unit: 'lb', date: DAY, bodyFat: 22 }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { ok: true, weighIn: { logged_on: DAY, weight: 83.91 }, milestones: [{ milestone: '25% to goal', points: 50 }] });
  assert.deepEqual(c.rows, [{ user_id: UID, logged_on: DAY, weight: 83.91, unit: 'kg', body_fat_pct: 22 }]);
  assert.deepEqual(c.calls.find((x) => x.op === 'weigh-in').opts, { onConflict: 'user_id,logged_on' });
  const order = c.calls.map((x) => x.rpc || x.op);
  assert.ok(order.indexOf('weigh-in') < order.indexOf('award_my_goal_milestones'), order.join(','));
  assert.equal(c.calls.find((x) => x.op === 'goals-read').kind, 'client_goals');
});

test('no award while the stored goal is in pounds, or cannot be read; the weigh-in still lands', async () => {
  for (const opts of [{ goals: { overall: { unit: 'lb', start: 200, target: 180 } } }, { failGoals: true }]) {
    const c = client(opts);
    const route = await loadRoute(c);
    const body = await (await route.POST(post({ weight: 83.9, unit: 'kg', date: DAY }))).json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.milestones, []);
    assert.equal(c.rows.length, 1);
    assert.ok(!c.calls.some((x) => x.rpc), JSON.stringify(opts));
  }
  // No goal document, or no unit: kilograms, the stores' default.
  for (const goals of [null, { overall: { start: 90, target: 80 } }]) {
    const c = client({ goals });
    const route = await loadRoute(c);
    await route.POST(post({ weight: 83.9, date: DAY }));
    assert.ok(c.calls.some((x) => x.rpc === 'award_my_goal_milestones'));
  }
});

test('a failed write is an error and awards nothing; a missing body-fat column still lands the weight', async () => {
  const c = client({ writeErrors: [{ message: 'permission denied', code: '42501' }] });
  const route = await loadRoute(c);
  const res = await route.POST(post({ weight: 80, unit: 'kg', date: DAY }));
  assert.equal(res.status, 500);
  assert.ok(!c.calls.some((x) => x.rpc));
  const c2 = client({ writeErrors: [{ message: 'column "body_fat_pct" does not exist' }] });
  const route2 = await loadRoute(c2);
  const ok = await (await route2.POST(post({ weight: 80, unit: 'kg', date: DAY, bodyFat: 20 }))).json();
  assert.equal(ok.ok, true);
  assert.deepEqual(c2.rows, [{ user_id: UID, logged_on: DAY, weight: 80, unit: 'kg' }]);
  // Only the body-fat error retries.
  const c3 = client({ writeErrors: [{ message: 'timeout' }] });
  const route3 = await loadRoute(c3);
  assert.equal((await route3.POST(post({ weight: 80, unit: 'kg', date: DAY, bodyFat: 20 }))).status, 500);
  assert.equal(c3.calls.filter((x) => x.op === 'weigh-in').length, 1);
});

test('a weight no person has is refused before anything is written', async () => {
  const c = client();
  const route = await loadRoute(c);
  for (const w of [5, 900, '80', null]) {
    assert.equal((await route.POST(post({ weight: w, unit: 'kg', date: DAY }))).status, 400, String(w));
  }
  assert.equal(c.calls.length, 0);
});

test('the catch-up is the award alone, and reports only what was credited', async () => {
  const c = client({ milestones: [{ milestone: 'Halfway to goal', points: 75 }, { milestone: '', points: 5 }, { milestone: 'x', points: 0 }, null] });
  const route = await loadRoute(c);
  const body = await (await route.POST(post({ check: true }))).json();
  assert.deepEqual(body, { ok: true, milestones: [{ milestone: 'Halfway to goal', points: 75 }] });
  assert.ok(!c.calls.some((x) => x.op === 'weigh-in'));
  const failing = client({ rpcError: { message: 'gone' } });
  const r2 = await loadRoute(failing);
  assert.deepEqual(await (await r2.POST(post({ check: true }))).json(), { ok: true, milestones: [] });
});

test('both surfaces weigh in through the route; neither writes the row or calls the award itself', () => {
  const be = code('mobile-app/src/services/shapeBackend.js');
  const log = be.slice(be.indexOf('async function logWeighIn'), be.indexOf('// Meal-log macros'));
  assert.match(log, /\/api\/client\/weigh-in/);
  assert.doesNotMatch(log, /from\('client_weigh_ins'\)/);
  assert.match(log, /if \(!res\.ok \|\| !d \|\| !d\.ok\) throw new Error/);
  const award = be.slice(be.indexOf('async function awardGoalMilestones'), be.indexOf('window.ShapeWeighIns ='));
  assert.match(award, /body: JSON\.stringify\(\{ check: true \}\)/);
  assert.doesNotMatch(be, /rpc\('award_my_goal_milestones'\)/);
  const goals = code('mobile-app/src/broadsheet/BSGoals.jsx');
  assert.match(goals, /\.then\(\(\) => window\.ShapeWeighIns\.log\(\{ weight: kg, unit: 'kg', bodyFat \}\)\)\s*\.then\(\(row\) => \(row && Array\.isArray\(row\.milestones\) \? row\.milestones : null\)\)/);
  const web = code('public/newdesign/dashGoals.jsx');
  assert.doesNotMatch(web, /from\("client_weigh_ins"\)\.upsert/);
  assert.match(web, /const r = await dgoWeighInPost\(\{ weight: kg, unit: "kg", date: today \}\);\s*if \(!r\.ok\) \{ showToast/);
  assert.match(web, /dgoWeighInPost\(\{ check: true \}\)/);
  assert.match(web, /fetch\("\/api\/client\/weigh-in"/);
  // The newest 104, turned round (B2).
  assert.match(web, /\.order\("logged_on", \{ ascending: false \}\)\.limit\(104\);\s*const data = Array\.isArray\(newest\) \? newest\.slice\(\)\.reverse\(\) : newest;/);
});
