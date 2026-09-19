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
