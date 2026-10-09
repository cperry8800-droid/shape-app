// Nora's speed, the setup half (owner, 2026-10-08: "do what makes the most sense to improve speed
// without damaging or limiting her capabilities"). Production's log for one question: about a
// second of setup, read after read, before the model was asked. Reads that do not depend on each
// other now run together; what each one decides is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const core = await loadRealModule(join(ROOT, 'src/lib/membership-core.ts'), { typescript: true });

// A Supabase stand-in whose reads resolve only when the test says so, and which counts how many
// times each read was run (a builder runs again every time its `then` is called).
// Every run of a read is answered when its table is released, a run after the release at once,
// so a read run twice finishes and is counted rather than hanging the test (a hung test is
// cancelled, which a mutation round does not count as a failure).
function heldClient(answers) {
  const started = []; const runs = {}; const waiting = {}; const released = new Set();
  const settle = (table, resolve, reject) => (answers[table] instanceof Error ? reject(answers[table]) : resolve(answers[table]));
  const release = new Proxy({}, { get: (_, table) => () => { released.add(table); for (const [res, rej] of waiting[table] || []) settle(table, res, rej); waiting[table] = []; } });
  const client = {
    from(table) {
      const builder = {
        select() { return builder; }, eq() { return builder; }, order() { return builder; }, limit() { return builder; },
        maybeSingle() { return builder; },
        then(res, rej) {
          runs[table] = (runs[table] || 0) + 1;
          started.push(table);
          return new Promise((resolve, reject) => {
            if (released.has(table)) settle(table, resolve, reject);
            else (waiting[table] = waiting[table] || []).push([resolve, reject]);
          }).then(res, rej);
        },
      };
      return builder;
    },
  };
  return { client, started, runs, release };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('⚠ membership reads the profile and the subscription together, each once', async () => {
  const h = heldClient({ profiles: { data: { role: 'client', roles: [], over_18: true, created_at: '2026-01-01T00:00:00Z' } }, platform_subscriptions: { data: { status: 'active' } } });
  const p = core.computeMembership(h.client, 'u1', 'member@x.com');
  await tick();
  assert.deepEqual(h.started.sort(), ['platform_subscriptions', 'profiles'], 'the subscription read started before the profile came back');
  h.release.profiles(); h.release.platform_subscriptions();
  const m = await p;
  assert.equal(m.isMember, true);
  assert.deepEqual(h.runs, { profiles: 1, platform_subscriptions: 1 }, 'neither query ran twice');
});

test('membership decides as before: a coach without a plan, an admin with no read, a failed plan read still throws', async () => {
  const coach = heldClient({ profiles: { data: { role: 'trainer', roles: ['trainer'], over_18: true, created_at: '2026-01-01T00:00:00Z' } }, platform_subscriptions: new Error('down') });
  const cp = core.computeMembership(coach.client, 'u2', 'coach@x.com');
  await tick(); coach.release.profiles(); coach.release.platform_subscriptions();
  assert.equal((await cp).isMember, true, 'a coach is a member whatever the plan read did');

  process.env.ADMIN_EMAILS = 'boss@shape.test';
  try {
    const admin = heldClient({ profiles: { data: { role: 'client', roles: [], over_18: true, created_at: '2026-01-01T00:00:00Z' } } });
    const ap = core.computeMembership(admin.client, 'u3', 'Boss@Shape.test', { emailConfirmed: true }); // an admin is a CONFIRMED allow-listed address (L14, #2289)
    await tick(); admin.release.profiles();
    const am = await ap;
    assert.equal(am.isAdmin, true);
    assert.equal(am.isMember, true);
    assert.deepEqual(admin.started, ['profiles'], 'an admin never needs the plan, so it is not read');
  } finally { delete process.env.ADMIN_EMAILS; }

  const broken = heldClient({ profiles: { data: { role: 'client', roles: [], over_18: true, created_at: '2026-01-01T00:00:00Z' } }, platform_subscriptions: new Error('plan read failed') });
  const bp = core.computeMembership(broken.client, 'u4', 'member@x.com');
  await tick(); broken.release.platform_subscriptions(); await tick(); broken.release.profiles();
  await assert.rejects(bp, /plan read failed/, 'for a member who needs the plan, a failed read still fails as before');

  const none = heldClient({ profiles: { data: { role: 'client', roles: [], over_18: true, created_at: '2026-01-01T00:00:00Z' } }, platform_subscriptions: { data: null } });
  const np = core.computeMembership(none.client, 'u5', 'member@x.com');
  await tick(); none.release.profiles(); none.release.platform_subscriptions();
  assert.equal((await np).isMember, false);
});
