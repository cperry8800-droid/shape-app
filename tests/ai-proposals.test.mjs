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
