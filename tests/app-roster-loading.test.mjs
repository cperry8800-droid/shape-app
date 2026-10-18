import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
let uid = 'coach-a', fail = false, calls = 0;
globalThis.window = {
  ShapeAuth: { getCachedState: () => ({ user: uid ? { id: uid } : null }) },
  ShapeAssign: { clients: async (_role, options) => {
    assert.equal(options.strict, true); calls++;
    if (fail) throw Error('Offline');
    return [{ userId: `client-for-${uid}`, name: uid }];
  } },
  DashSignals: { getTriageFeed: (_role, records) => records },
};
await loadRealModule(fileURLToPath(new URL('../mobile-app/src/services/shapeSignals.js', import.meta.url)), {
  registry: new Map([['../../../public/newdesign/dashSignals.js', {}]]),
});
test('Today and Clients share a cache only within the same coach account', async () => {
  const a = await window.ShapeSignals.triageLive('trainer');
  assert.strictEqual(await window.ShapeSignals.triageLive('trainer'), a);
  assert.equal(calls, 1);
  uid = 'coach-b';
  const b = await window.ShapeSignals.triageLive('trainer');
  assert.notDeepEqual(b, a); assert.equal(calls, 2);
  uid = null; assert.deepEqual(await window.ShapeSignals.triageLive('trainer'), []);
});
test('roster failures reject instead of reporting no clients, and retry replaces the failed request', async () => {
  uid = 'coach-c'; fail = true;
  await assert.rejects(window.ShapeSignals.triageLive('nutritionist'), /Offline/);
  fail = false;
  const rows = await window.ShapeSignals.triageLive('nutritionist', { force: true });
  assert.equal(rows.length, 1);
});
// Owner, 2026-10-18: a client whose renewal Stripe is retrying (past_due) stays on the roster with
// full access, and the row says so. The flag rides from the roster route (coach-roster.ts
// `paymentRetrying`) through ShapeAssign.clients and the record the rows are built from.
test('a retrying payment rides from the roster read to the record each row is built from, and nowhere else', async () => {
  const keep = window.ShapeAssign.clients;
  window.ShapeAssign.clients = async () => [
    { userId: 'u7', name: 'Priya', paymentRetrying: true },
    { userId: 'u1', name: 'Ana', paymentRetrying: false },
    { userId: 'u2', name: 'Ben' },
  ];
  try {
    uid = 'coach-retry';
    const recs = await window.ShapeSignals.triageLive('trainer', { force: true });
    const profile = Object.fromEntries(recs.map((r) => [r.profile.id, r.profile]));
    assert.equal(profile.u7.paymentRetrying, true);
    assert.equal('paymentRetrying' in profile.u1, false, 'a client paying normally keeps the profile they had');
    assert.equal('paymentRetrying' in profile.u2, false);
  } finally {
    window.ShapeAssign.clients = keep;
  }
});
test('the app\'s roster read keeps the route\'s flag, true only when the route said so', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');
  const at = src.indexOf('async function listAssignableClients(');
  const end = src.indexOf('\n}\n', at) + 2;
  assert.ok(at > 0 && end > at);
  const answer = { clients: [{ id: 'u7', name: 'Priya', paymentRetrying: true }, { id: 'u1', name: 'Ana', paymentRetrying: 'yes' }, { id: 'u2' }, { name: 'no id' }] };
  const list = await new Function('getJsonOrDefault', 'apiBaseUrl', 'providerDiscipline', `${src.slice(at, end)}\nreturn listAssignableClients;`)(async () => answer, '', () => 'trainer')('trainer');
  assert.deepEqual(list.map((c) => [c.userId, c.paymentRetrying]), [['u7', true], ['u1', false], ['u2', false]]);
});
