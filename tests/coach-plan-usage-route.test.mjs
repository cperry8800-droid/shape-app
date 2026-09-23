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
    ['next/server', { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), { status: init?.status || 200, headers: { 'Content-Type': 'application/json' } }) } }],
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
  assert.deepEqual(body, { usage: { p1: { clients: 2 }, p2: { clients: 1 } }, capped: false });
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'owner_id' && c[2] === 'coach-a'), 'the trainer rows are the caller\'s own');
  assert.ok(calls.some((c) => c[0] === 'in' && c[1] === 'trainer_id' && c[2].join() === 't1,t2'));
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'status' && c[2] === 'published'), 'a draft is on nobody\'s calendar');
  assert.ok(calls.some((c) => c[0] === 'gte' && c[1] === 'scheduled_date' && c[2] === '2026-09-22'), 'today counts');
  assert.ok(calls.some((c) => c[0] === 'not' && c[1] === 'payload->template->>id' && c[2] === 'is' && c[3] === null));
});

test('a read past the cap says so, because it can only under-count', async () => {
  const { route } = await api([{ data: [{ id: 't1' }], error: null }, { data: [{ client_id: 'c1', template_id: 'p1' }], error: null, count: 9000 }]);
  assert.deepEqual(await (await route.GET(get())).json(), { usage: { p1: { clients: 1 } }, capped: true });
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
  assert.deepEqual(body.usage.constructor, { clients: 1 });
});

test('the route is registered on the War Room board', async () => {
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('../src/lib/warroom.ts', import.meta.url), 'utf8'), /\['\/api\/coach\/plans\/usage', 'GET'\]/);
});
