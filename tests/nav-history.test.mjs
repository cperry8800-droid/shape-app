// tests/nav-history.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bsNavPush, bsNavPop, bsNavPeek, bsNavCanPop, bsNavSize, bsNavClear,
  bsNavReplaceTop, bsNavAnnounce, bsNavAnnounced, bsNavCompose,
  bsGuardAfterPush, bsGuardAfterPop,
} from '../mobile-app/src/services/navHistory.mjs';

test('push/pop round-trips descriptors in LIFO order', () => {
  bsNavClear();
  assert.equal(bsNavPush({ tab: 'home' }), true);
  assert.equal(bsNavPush({ tab: 'eat', sub: 'grocery' }), true);
  assert.equal(bsNavSize(), 2);
  assert.deepEqual(bsNavPop(), { tab: 'eat', sub: 'grocery' });
  assert.deepEqual(bsNavPop(), { tab: 'home' });
  assert.equal(bsNavPop(), null);
});

test('deep-equal push is a no-op (returns false, size unchanged)', () => {
  bsNavClear();
  bsNavPush({ tab: 'chat', detail: { conversationId: 'c1' } });
  assert.equal(bsNavPush({ tab: 'chat', detail: { conversationId: 'c1' } }), false);
  assert.equal(bsNavSize(), 1);
  // a DIFFERENT detail is not a dupe
  assert.equal(bsNavPush({ tab: 'chat', detail: { conversationId: 'c2' } }), true);
});

test('cap 30 evicts the oldest entry, never the newest', () => {
  bsNavClear();
  for (let i = 0; i < 31; i++) bsNavPush({ tab: 'home', detail: { i } });
  assert.equal(bsNavSize(), 30);
  assert.deepEqual(bsNavPeek(), { tab: 'home', detail: { i: 30 } });
  let bottom = null;
  while (bsNavCanPop()) bottom = bsNavPop();
  assert.deepEqual(bottom, { tab: 'home', detail: { i: 1 } }); // 0 was evicted
});

test('replaceTop swaps the head; on empty it behaves like push', () => {
  bsNavClear();
  assert.equal(bsNavReplaceTop({ tab: 'me' }), true);
  bsNavPush({ tab: 'train' });
  assert.equal(bsNavReplaceTop({ tab: 'eat' }), true);
  assert.equal(bsNavSize(), 2);
  assert.deepEqual(bsNavPop(), { tab: 'eat' });
});

test('announce composes over the shell location; null clears', () => {
  bsNavAnnounce({ sub: 'integrations' });
  assert.deepEqual(bsNavCompose({ tab: 'me', overlay: 'settings' }),
    { tab: 'me', overlay: 'settings', sub: 'integrations' });
  bsNavAnnounce(null);
  assert.equal(bsNavAnnounced(), null);
  assert.deepEqual(bsNavCompose({ tab: 'me' }), { tab: 'me' });
});

test('guard decisions: arm on empty→non-empty, rearm while entries remain, disarm at empty', () => {
  assert.equal(bsGuardAfterPush(0, 1), 'arm');
  assert.equal(bsGuardAfterPush(1, 2), null);
  assert.equal(bsGuardAfterPush(1, 1), null); // dedupe no-op never arms
  assert.equal(bsGuardAfterPop(1), 'rearm');
  assert.equal(bsGuardAfterPop(0), 'disarm');
});
