// Proof of the AI preview/confirm scaffold (the foundation every later AI write
// rides on): a dummy proposed change renders a PREVIEW, REQUIRES a confirm,
// EXECUTES on confirm, writes exactly ONE audit row, and UNDOES cleanly.
//   node --test tests/ai-proposals.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRegistry,
  demoEchoAction,
  inMemoryStore,
  inMemoryAudit,
  inMemoryConsumer,
  proposeChange,
  confirmChange,
  undoChange,
  signToken,
  verifyToken,
} from '../src/lib/ai/proposals.mjs';

const SECRET = 'unit-test-secret';
const ACTOR = { id: 'user-1', role: 'client' };

function setup() {
  const registry = createRegistry();
  registry.define(demoEchoAction.name, demoEchoAction);
  const store = inMemoryStore();
  const audit = inMemoryAudit();
  const ctx = { actor: ACTOR, store };
  return { registry, store, audit, ctx };
}

test('propose renders a preview/diff and does NOT execute anything', async () => {
  const { registry, store, audit, ctx } = setup();
  const p = await proposeChange({ registry, action: '__demo.echo', input: { note: 'hydrate' }, actor: ACTOR, ctx, secret: SECRET });
  assert.equal(p.ok, true);
  assert.equal(p.requiresConfirm, true);
  assert.equal(p.preview.summary, 'Set the demo note to "hydrate"');
  assert.equal(p.preview.diff[0].before, null);
  assert.equal(p.preview.diff[0].after, 'hydrate');
  assert.ok(typeof p.token === 'string' && p.token.includes('.'));
  // No execution and no audit write happened on propose.
  assert.equal(await store.get('ai_demo'), null);
  assert.equal(audit._rows.length, 0);
});

test('confirm WITHOUT a valid token is rejected — nothing executes (requires confirm)', async () => {
  const { registry, store, audit, ctx } = setup();
  const bad = await confirmChange({ registry, token: 'not-a-real-token', actor: ACTOR, ctx, secret: SECRET, audit });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'invalid_or_expired_token');
  assert.equal(await store.get('ai_demo'), null);
  assert.equal(audit._rows.length, 0);
});

test('confirm executes the previewed change and writes EXACTLY ONE audit row', async () => {
  const { registry, store, audit, ctx } = setup();
  const p = await proposeChange({ registry, action: '__demo.echo', input: { note: 'hydrate' }, actor: ACTOR, ctx, secret: SECRET });
  const c = await confirmChange({ registry, token: p.token, actor: ACTOR, ctx, secret: SECRET, audit });
  assert.equal(c.ok, true);
  assert.deepEqual(await store.get('ai_demo'), { note: 'hydrate' });
  assert.equal(audit._rows.length, 1);
  const row = audit._rows[0];
  assert.equal(row.action, '__demo.echo');
  assert.equal(row.source, 'engine');
  assert.equal(row.actorUserId, 'user-1');
  assert.equal(row.actorRole, 'client');
  assert.deepEqual(row.suggestion, { note: 'hydrate' });
  assert.deepEqual(row.confirmedPayload, { note: 'hydrate' });
  assert.equal(row.beforeState, null);
  assert.deepEqual(row.afterState, { note: 'hydrate' });
  assert.equal(row.status, 'executed');
});

test('undo cleanly reverts the change and marks the audit row undone', async () => {
  const { registry, store, audit, ctx } = setup();
  const p = await proposeChange({ registry, action: '__demo.echo', input: { note: 'hydrate' }, actor: ACTOR, ctx, secret: SECRET });
  const c = await confirmChange({ registry, token: p.token, actor: ACTOR, ctx, secret: SECRET, audit });
  assert.deepEqual(await store.get('ai_demo'), { note: 'hydrate' });

  const u = await undoChange({ registry, auditId: c.auditId, actor: ACTOR, ctx, audit });
  assert.equal(u.ok, true);
  assert.equal(await store.get('ai_demo'), null); // restored to before-state
  assert.equal(audit._rows[0].status, 'undone');
});

test('undo is idempotent (a second undo is a no-op)', async () => {
  const { registry, store, audit, ctx } = setup();
  const p = await proposeChange({ registry, action: '__demo.echo', input: { note: 'x' }, actor: ACTOR, ctx, secret: SECRET });
  const c = await confirmChange({ registry, token: p.token, actor: ACTOR, ctx, secret: SECRET, audit });
  await undoChange({ registry, auditId: c.auditId, actor: ACTOR, ctx, audit });
  const again = await undoChange({ registry, auditId: c.auditId, actor: ACTOR, ctx, audit });
  assert.equal(again.ok, true);
  assert.equal(again.alreadyUndone, true);
});

test('a token signed with a different secret fails verification (tamper-proof)', () => {
  const plan = { action: '__demo.echo', actor: { id: 'user-1' }, exp: Date.now() + 1000 };
  const token = signToken(plan, 'attacker-secret');
  assert.equal(verifyToken(token, SECRET), null);
  // round-trips with the right secret
  assert.deepEqual(verifyToken(signToken(plan, SECRET), SECRET).action, '__demo.echo');
});

test('an expired proposal token cannot be confirmed', async () => {
  const { registry, store, audit, ctx } = setup();
  const p = await proposeChange({ registry, action: '__demo.echo', input: { note: 'x' }, actor: ACTOR, ctx, secret: SECRET, now: 1000, ttlMs: 1 });
  const c = await confirmChange({ registry, token: p.token, actor: ACTOR, ctx, secret: SECRET, audit, now: 5000 });
  assert.equal(c.ok, false);
  assert.equal(c.error, 'invalid_or_expired_token');
  assert.equal(await store.get('ai_demo'), null);
});

test('a different actor cannot confirm someone else’s proposal', async () => {
  const { registry, audit, ctx } = setup();
  const p = await proposeChange({ registry, action: '__demo.echo', input: { note: 'x' }, actor: ACTOR, ctx, secret: SECRET });
  const c = await confirmChange({ registry, token: p.token, actor: { id: 'user-2', role: 'client' }, ctx, secret: SECRET, audit });
  assert.equal(c.ok, false);
  assert.equal(c.error, 'actor_mismatch');
});

test('a role that is not allowed is rejected at propose time', async () => {
  const { registry, ctx } = setup();
  registry.define('__demo.coachOnly', { ...demoEchoAction, name: '__demo.coachOnly', roles: ['trainer', 'nutritionist'] });
  const p = await proposeChange({ registry, action: '__demo.coachOnly', input: { note: 'x' }, actor: ACTOR /* client */, ctx, secret: SECRET });
  assert.equal(p.ok, false);
  assert.equal(p.error, 'role_not_allowed');
});

test('an unknown action is rejected', async () => {
  const { registry, ctx } = setup();
  const p = await proposeChange({ registry, action: 'does_not_exist', input: {}, actor: ACTOR, ctx, secret: SECRET });
  assert.equal(p.ok, false);
  assert.equal(p.error, 'unknown_action');
});

// ── single-use confirm tokens (no double-apply) ─────────────────────────────
// An action that counts how many times it actually executed.
function counterAction() {
  let calls = 0;
  return {
    calls: () => calls,
    action: {
      name: 'count.inc', roles: ['client'], source: 'engine',
      async buildPreview() { return { summary: 'inc', diff: [], confirmedPayload: {} }; },
      async execute() { calls += 1; return { calls }; },
      async undo() { calls -= 1; },
    },
  };
}

test('a confirmed token is single-use — a replay is rejected and never re-executes', async () => {
  const { registry, audit, ctx } = setup();
  const consume = inMemoryConsumer();
  const ctr = counterAction();
  registry.define(ctr.action.name, ctr.action);
  const p = await proposeChange({ registry, action: 'count.inc', input: {}, actor: ACTOR, ctx, secret: SECRET });

  const c1 = await confirmChange({ registry, token: p.token, actor: ACTOR, ctx, secret: SECRET, audit, consume: consume.consume, release: consume.release });
  assert.equal(c1.ok, true);
  // Same token again (re-render / two devices / double-tap): rejected, no re-run.
  const c2 = await confirmChange({ registry, token: p.token, actor: ACTOR, ctx, secret: SECRET, audit, consume: consume.consume, release: consume.release });
  assert.equal(c2.ok, false);
  assert.equal(c2.error, 'already_confirmed');
  assert.equal(ctr.calls(), 1);        // executed exactly once
  assert.equal(audit._rows.length, 1); // audited exactly once
});

test('a failed execute RELEASES the nonce so the same draft can be retried', async () => {
  const { registry, audit, ctx } = setup();
  const consume = inMemoryConsumer();
  let fail = true;
  registry.define('flaky', {
    name: 'flaky', roles: ['client'], source: 'engine',
    async buildPreview() { return { summary: 's', diff: [], confirmedPayload: {} }; },
    async execute() { if (fail) { fail = false; throw new Error('boom'); } return { ok: true }; },
    async undo() {},
  });
  const p = await proposeChange({ registry, action: 'flaky', input: {}, actor: ACTOR, ctx, secret: SECRET });

  const c1 = await confirmChange({ registry, token: p.token, actor: ACTOR, ctx, secret: SECRET, audit, consume: consume.consume, release: consume.release });
  assert.equal(c1.ok, false);
  assert.equal(c1.error, 'execute_failed');
  assert.equal(consume._used.size, 0); // reservation released
  // Retrying the SAME token now succeeds (the draft wasn't burned by the failure).
  const c2 = await confirmChange({ registry, token: p.token, actor: ACTOR, ctx, secret: SECRET, audit, consume: consume.consume, release: consume.release });
  assert.equal(c2.ok, true);
  assert.equal(audit._rows.length, 1);
});

test('concurrent undos apply the reversal EXACTLY ONCE (one-shot claim)', async () => {
  const { registry, audit, ctx } = setup();
  let reversals = 0;
  registry.define('counted', {
    name: 'counted', roles: ['client'], source: 'engine',
    async buildPreview() { return { summary: 's', diff: [], confirmedPayload: {} }; },
    async execute() { return { ok: true }; },
    async undo() { reversals += 1; },
  });
  const p = await proposeChange({ registry, action: 'counted', input: {}, actor: ACTOR, ctx, secret: SECRET });
  const c = await confirmChange({ registry, token: p.token, actor: ACTOR, ctx, secret: SECRET, audit });

  // Both racers pass the status read (fired before either claim lands); only
  // the claim winner may run the reversal — a double-run would subtract
  // log_water's inverse delta twice.
  const [a, b] = await Promise.all([
    undoChange({ registry, auditId: c.auditId, actor: ACTOR, ctx, audit }),
    undoChange({ registry, auditId: c.auditId, actor: ACTOR, ctx, audit }),
  ]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(reversals, 1);
  assert.equal([a, b].filter((r) => r.alreadyUndone).length, 1);
  assert.equal(audit._rows[0].status, 'undone');
});

test('a failed reversal releases the claim — the row stays executed and a retry works', async () => {
  const { registry, audit, ctx } = setup();
  let fail = true;
  let reversals = 0;
  registry.define('flaky-undo', {
    name: 'flaky-undo', roles: ['client'], source: 'engine',
    async buildPreview() { return { summary: 's', diff: [], confirmedPayload: {} }; },
    async execute() { return { ok: true }; },
    async undo() { reversals += 1; if (fail) { fail = false; throw new Error('reversal boom'); } },
  });
  const p = await proposeChange({ registry, action: 'flaky-undo', input: {}, actor: ACTOR, ctx, secret: SECRET });
  const c = await confirmChange({ registry, token: p.token, actor: ACTOR, ctx, secret: SECRET, audit });

  await assert.rejects(() => undoChange({ registry, auditId: c.auditId, actor: ACTOR, ctx, audit }), /reversal boom/);
  // The claim was handed back: the ledger never says undone for a reversal
  // that didn't happen, and the member can retry.
  assert.equal(audit._rows[0].status, 'executed');
  const again = await undoChange({ registry, auditId: c.auditId, actor: ACTOR, ctx, audit });
  assert.equal(again.ok, true);
  assert.equal(again.alreadyUndone, undefined);
  assert.equal(reversals, 2);
  assert.equal(audit._rows[0].status, 'undone');
});

test('a COMPLETED undo can never be re-opened — release after finalize is a no-op', async () => {
  const { registry, audit, ctx } = setup();
  let reversals = 0;
  registry.define('counted-final', {
    name: 'counted-final', roles: ['client'], source: 'engine',
    async buildPreview() { return { summary: 's', diff: [], confirmedPayload: {} }; },
    async execute() { return { ok: true }; },
    async undo() { reversals += 1; },
  });
  const p = await proposeChange({ registry, action: 'counted-final', input: {}, actor: ACTOR, ctx, secret: SECRET });
  const c = await confirmChange({ registry, token: p.token, actor: ACTOR, ctx, secret: SECRET, audit });
  const u = await undoChange({ registry, auditId: c.auditId, actor: ACTOR, ctx, audit });
  assert.equal(u.ok, true);
  assert.equal(reversals, 1);

  // The Codex P2 scenario: the claimer calls the release RPC directly AFTER
  // their undo completed. Finalize already closed the claim — the release is
  // a reported no-op and the row stays undone.
  const released = await audit.releaseUndo(c.auditId);
  assert.equal(released, false);
  assert.equal(audit._rows[0].status, 'undone');
  // So a repeat undo can never re-run the reversal.
  const again = await undoChange({ registry, auditId: c.auditId, actor: ACTOR, ctx, audit });
  assert.equal(again.alreadyUndone, true);
  assert.equal(reversals, 1);
});
