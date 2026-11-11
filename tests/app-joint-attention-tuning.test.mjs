// The app's joint attention reads the viewer's own side at the viewer's own flag tuning, as the
// website does (dashData's joint), so it meets the co-coach's side at the co-coach's (#2691; Codex on
// #2691: with the house line on the viewer's side, a trainer who moved MISSED_SESSIONS to 6 found a
// joint case at the house 3 that their nutritionist, reading the trainer's 6, did not).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

let doc = null, seen = null, docFails = false;
globalThis.window = {
  ShapeAuth: { getCachedState: () => ({ user: { id: 'coach-a' } }) },
  ShapeAssign: { clients: async () => [] },
  shapeDb: { getUserGoals: async (kind) => { if (docFails) throw Error('offline'); return kind === 'coach_settings' ? doc : null; } },
  DashSignals: {
    buildMockClients: () => [{ profile: { id: 'demo' } }],
    resolveThresholds: (t, role) => ({ thresholds: { ...t, resolvedFor: role } }),
    findJointAttention: (clients, now, thresholds, role) => { seen = { clients, now, thresholds, role }; return [{ client: clients[0] }]; },
  },
};
await loadRealModule(fileURLToPath(new URL('../mobile-app/src/services/shapeSignals.js', import.meta.url)), {
  registry: new Map([['../../../public/newdesign/dashSignals.js', {}]]),
});

test('a coach\'s own tuning, resolved for the roster\'s role, goes into the app\'s joint attention', async () => {
  doc = { thresholds: { MISSED_SESSIONS: 6 } };
  const out = await window.ShapeSignals.jointAttention('trainer');
  assert.equal(out.length, 1);
  assert.deepEqual(seen.thresholds, { MISSED_SESSIONS: 6, resolvedFor: 'trainer' });
  assert.equal(seen.role, 'trainer');
  await window.ShapeSignals.jointAttention('nutritionist');
  assert.equal(seen.thresholds.resolvedFor, 'nutritionist', 'resolved for the role the roster is read as');
});

test('untuned or unreadable, the viewer\'s side reads at the house line, as before', async () => {
  doc = null;
  await window.ShapeSignals.jointAttention('trainer');
  assert.equal(seen.thresholds, null);
  doc = { other: 1 };
  await window.ShapeSignals.jointAttention('trainer');
  assert.equal(seen.thresholds, null);
  docFails = true;
  try {
    const out = await window.ShapeSignals.jointAttention('trainer');
    assert.equal(out.length, 1, 'a failed settings read never takes joint attention down');
    assert.equal(seen.thresholds, null);
  } finally { docFails = false; }
});
