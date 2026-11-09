// /api/coach/plans/usage — which of a coach's programs a client has on their calendar,
// for the workout library's "In use" filter. node --test.
//
// ⚠ THE ANSWER THAT MUST NEVER BE INVENTED IS "NOT IN USE". A failed read is an error, not
// an empty map; a read past the cap says `capped`, because it can only under-count; and
// the count is CLIENTS, not sessions — twelve weeks of one program is one client on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

async function api(results, { user = { id: 'coach-a' } } = {}) {
  const calls = [];
  const db = { from(table) {
    const query = {};
    calls.push(['from', table]);
    for (const method of ['select', 'eq', 'in', 'gte', 'gt', 'not', 'is', 'order', 'limit']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
    query.then = (resolve, reject) => Promise.resolve(results.shift() || { data: null, error: null }).then(resolve, reject);
    return query;
  } };
  const registry = new Map([
    ['next/server', { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), { status: init?.status || 200, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } }) } }],
    ['@/lib/request-auth', { clientForRequest: async () => db, currentUser: async () => user }],
  ]);
  const route = await loadRealModule(fileURLToPath(new URL('../src/app/api/coach/plans/usage/route.ts', import.meta.url)), { typescript: true, registry });
  return { route, calls };
}
const get = (q = '?today=2026-09-22') => new Request('https://shape.test/api/coach/plans/usage' + q);

test('a signed-out request reads nothing', async () => {
  const { route, calls } = await api([], { user: null });
  assert.equal((await route.GET(get())).status, 401);
  assert.equal(calls.length, 0);
});

test('a failed read is an error, never an empty map', async () => {
  let { route } = await api([{ data: null, error: { message: 'boom' } }]);
  assert.equal((await route.GET(get())).status, 500);
  ({ route } = await api([{ data: [{ id: 't1' }], error: null }, { data: null, error: { message: 'boom' }, count: null }]));
  const res = await route.GET(get());
  assert.equal(res.status, 500);
  assert.equal((await res.json()).usage, undefined);
});

test('an account with no trainer row has assigned nothing — a real, uncapped answer', async () => {
  const { route, calls } = await api([{ data: [], error: null }]);
  assert.deepEqual(await (await route.GET(get())).json(), { usage: {}, capped: false });
  assert.ok(!calls.some((c) => c[0] === 'from' && c[1] === 'client_workouts'));
});

test('counts distinct CLIENTS per program, from this coach\'s published sessions from today on', async () => {
  const rows = [
    { client_id: 'c1', template_id: 'p1' }, { client_id: 'c1', template_id: 'p1' }, { client_id: 'c2', template_id: 'p1' },
    { client_id: 'c3', template_id: 'p2' },
    { client_id: null, template_id: 'p3' }, { client_id: 'c4', template_id: null }, { client_id: 'c4', template_id: 7 },
  ];
  const { route, calls } = await api([{ data: [{ id: 't1' }, { id: 't2' }], error: null }, { data: rows, error: null, count: rows.length }]);
  const body = await (await route.GET(get())).json();
  // Who, as well as how many (step 6a: each library card's "who's on it"): each client once, sorted.
  assert.deepEqual(body, { usage: { p1: { clients: 2, clientIds: ['c1', 'c2'] }, p2: { clients: 1, clientIds: ['c3'] } }, capped: false });
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'owner_id' && c[2] === 'coach-a'), 'the trainer rows are the caller\'s own');
  assert.ok(calls.some((c) => c[0] === 'in' && c[1] === 'trainer_id' && c[2].join() === 't1,t2'));
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'status' && c[2] === 'published'), 'a draft is on nobody\'s calendar');
  assert.ok(calls.some((c) => c[0] === 'gte' && c[1] === 'scheduled_date' && c[2] === '2026-09-22'), 'today counts');
  assert.ok(calls.some((c) => c[0] === 'not' && c[1] === 'payload->template->>id' && c[2] === 'is' && c[3] === null));
});

// It names the coach's clients now (clientIds), so it is answered private and never cached, as the
// roster routes are (#2630): the full answer and the no-trainer answer alike.
test('the answer names clients, so it is private and never cached', async () => {
  const full = await api([{ data: [{ id: 't1' }], error: null }, { data: [{ client_id: 'c1', template_id: 'p1' }], error: null, count: 1 }]);
  assert.equal((await full.route.GET(get())).headers.get('Cache-Control'), 'private, no-store, max-age=0');
  const none = await api([{ data: [], error: null }]);
  assert.equal((await none.route.GET(get())).headers.get('Cache-Control'), 'private, no-store, max-age=0');
});

test('a read past the cap says so, because it can only under-count', async () => {
  const { route } = await api([{ data: [{ id: 't1' }], error: null }, { data: [{ client_id: 'c1', template_id: 'p1' }], error: null, count: 9000 }]);
  assert.deepEqual(await (await route.GET(get())).json(), { usage: { p1: { clients: 1, clientIds: ['c1'] } }, capped: true });
  const unknown = await api([{ data: [{ id: 't1' }], error: null }, { data: [], error: null, count: null }]);
  assert.equal((await (await unknown.route.GET(get())).json()).capped, true, 'an unknown count is not a complete one');
});

test('"today" is the coach\'s own day when it is a date, and the server\'s when it is not', async () => {
  // `2026-02-30` and `2026-13-01` have the shape of a day and are not one: the first
  // would roll over to March in JS and make Postgres throw, the second is no date at all.
  for (const bad of ['2026-9-22', 'tomorrow', '2026-02-30', '2026-13-01', '']) {
    const { route, calls } = await api([{ data: [{ id: 't1' }], error: null }, { data: [], error: null, count: 0 }]);
    const res = await route.GET(get(bad ? '?today=' + bad : ''));
    assert.equal(res.status, 200, bad + ' is answered, not thrown on');
    const gte = calls.find((c) => c[0] === 'gte');
    assert.match(gte[2], /^\d{4}-\d{2}-\d{2}$/);
    assert.notEqual(gte[2], bad);
  }
  // And a real one — a leap day included — is used as sent.
  for (const good of ['2026-09-22', '2028-02-29']) {
    const { route, calls } = await api([{ data: [{ id: 't1' }], error: null }, { data: [], error: null, count: 0 }]);
    await route.GET(get('?today=' + good));
    assert.equal(calls.find((c) => c[0] === 'gte')[2], good);
  }
});

test('a template id is only ever an own key of the map', async () => {
  const rows = [{ client_id: 'c1', template_id: '__proto__' }, { client_id: 'c1', template_id: 'constructor' }];
  const { route } = await api([{ data: [{ id: 't1' }], error: null }, { data: rows, error: null, count: 2 }]);
  const body = await (await route.GET(get())).json();
  assert.deepEqual(Object.keys(body.usage).sort(), ['__proto__', 'constructor']);
  assert.deepEqual(body.usage.constructor, { clients: 1, clientIds: ['c1'] });
});

// ── The meal library (?role=nutritionist; owner, 2026-11-09: only the coaches see who is on what) ──
// Each client's current plan from this nutritionist (published), by the library plan it was sent
// from (`payload.template.id`, recorded by /api/nutritionist/meal-plan), and `untracked`: how many
// of those current plans name none, a real count, because a plan with none is not "nobody".
const meal = (q = '') => get('?role=nutritionist' + q);

test('the meal library: distinct clients per plan from this nutritionist\'s current plans, and a real count of the untracked', async () => {
  const rows = [
    { client_id: 'c1', template_id: 'm1' }, { client_id: 'c1', template_id: 'm1' }, { client_id: 'c2', template_id: 'm1' },
    { client_id: 'c3', template_id: 'm2' }, { client_id: null, template_id: 'm3' }, { client_id: 'c4', template_id: null },
  ];
  const { route, calls } = await api([{ data: [{ id: 4 }, { id: 5 }], error: null }, { data: rows, error: null, count: rows.length }, { data: null, error: null, count: 2 }]);
  const res = await route.GET(meal('&today=2026-09-22'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { usage: { m1: { clients: 2, clientIds: ['c1', 'c2'] }, m2: { clients: 1, clientIds: ['c3'] } }, capped: false, untracked: 2 });
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store, max-age=0', 'it names the coach\'s clients');
  assert.deepEqual(calls.filter((c) => c[0] === 'from').map((c) => c[1]), ['nutritionists', 'client_meal_plans', 'client_meal_plans'], 'never a trainer\'s calendar');
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'owner_id' && c[2] === 'coach-a'), 'the nutritionist rows are the caller\'s own');
  assert.equal(calls.filter((c) => c[0] === 'in' && c[1] === 'nutritionist_id' && c[2].join() === '4,5').length, 2, 'both reads keep to those rows');
  assert.equal(calls.filter((c) => c[0] === 'eq' && c[1] === 'status' && c[2] === 'published').length, 2, 'a client\'s current plan is the published one');
  assert.ok(calls.some((c) => c[0] === 'select' && c[1] === 'client_id, template_id:payload->template->>id' && c[2]?.count === 'exact'));
  assert.ok(calls.some((c) => c[0] === 'not' && c[1] === 'payload->template->>id' && c[2] === 'is' && c[3] === null), 'the tracked read takes plans that name one');
  assert.ok(calls.some((c) => c[0] === 'limit' && c[1] === 5000));
  assert.ok(calls.some((c) => c[0] === 'select' && c[1] === 'id' && c[2]?.count === 'exact' && c[2]?.head === true), 'the untracked are counted, not fetched');
  assert.ok(calls.some((c) => c[0] === 'is' && c[1] === 'payload->template->>id' && c[2] === null), 'the count takes plans that name none');
  assert.ok(!calls.some((c) => c[0] === 'gte'), 'a current plan is published, whatever its week: no day');
});

test('the meal library: no nutritionist row has sent nothing — a real answer, and still private', async () => {
  const { route, calls } = await api([{ data: [], error: null }]);
  const res = await route.GET(meal());
  assert.deepEqual(await res.json(), { usage: {}, capped: false, untracked: 0 });
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store, max-age=0');
  assert.ok(!calls.some((c) => c[0] === 'from' && c[1] === 'client_meal_plans'));
});

test('the meal library: a failed read, or an untracked count it could not take, is an error and never a guess', async () => {
  const cases = [
    [{ data: null, error: { message: 'boom' } }],
    [{ data: [{ id: 4 }], error: null }, { data: null, error: { message: 'boom' }, count: null }],
    [{ data: [{ id: 4 }], error: null }, { data: [], error: null, count: 0 }, { data: null, error: { message: 'boom' }, count: null }],
    [{ data: [{ id: 4 }], error: null }, { data: [], error: null, count: 0 }, { data: null, error: null, count: null }],
  ];
  for (const results of cases) {
    const { route } = await api(results);
    const res = await route.GET(meal());
    assert.equal(res.status, 500, JSON.stringify(results));
    const body = await res.json();
    assert.equal(body.usage, undefined);
    assert.equal(body.untracked, undefined);
  }
});

test('the meal library: a read past the cap says so', async () => {
  const { route } = await api([{ data: [{ id: 4 }], error: null }, { data: [{ client_id: 'c1', template_id: 'm1' }], error: null, count: 9000 }, { data: null, error: null, count: 0 }]);
  assert.deepEqual(await (await route.GET(meal())).json(), { usage: { m1: { clients: 1, clientIds: ['c1'] } }, capped: true, untracked: 0 });
  const unknown = await api([{ data: [{ id: 4 }], error: null }, { data: [], error: null, count: null }, { data: null, error: null, count: 0 }]);
  assert.equal((await (await unknown.route.GET(meal())).json()).capped, true, 'an unknown count is not a complete one');
});

test('no role, or role=trainer, is the workout library\'s answer exactly as before', async () => {
  for (const q of ['?today=2026-09-22', '?role=trainer&today=2026-09-22', '?role=&today=2026-09-22']) {
    const { route, calls } = await api([{ data: [{ id: 't1' }], error: null }, { data: [{ client_id: 'c1', template_id: 'p1' }], error: null, count: 1 }]);
    const res = await route.GET(get(q));
    assert.deepEqual(await res.json(), { usage: { p1: { clients: 1, clientIds: ['c1'] } }, capped: false }, q + ': no untracked key');
    assert.equal(res.headers.get('Cache-Control'), 'private, no-store, max-age=0');
    assert.deepEqual(calls.filter((c) => c[0] === 'from').map((c) => c[1]), ['trainers', 'client_workouts'], q);
    assert.ok(calls.some((c) => c[0] === 'gte' && c[1] === 'scheduled_date' && c[2] === '2026-09-22'), q);
  }
  // Signed out is refused before any read, whichever library asks.
  const { route, calls } = await api([], { user: null });
  assert.equal((await route.GET(meal())).status, 401);
  assert.equal(calls.length, 0);
});

test('the route is registered on the War Room board', async () => {
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('../src/lib/warroom.ts', import.meta.url), 'utf8'), /\['\/api\/coach\/plans\/usage', 'GET'\]/);
});
