// tests/nav-history.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bsNavPush, bsNavPop, bsNavPeek, bsNavCanPop, bsNavSize, bsNavClear,
  bsNavReplaceTop, bsNavAnnounce, bsNavAnnounced, bsNavCompose,
  bsGuardAfterPush, bsGuardAfterPop, bsGuardAfterInAppPop,
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

test('bsNavClear resets the announce register as well as the stack', () => {
  bsNavPush({ tab: 'eat' });
  bsNavAnnounce({ sub: 'grocery' });
  bsNavClear();
  assert.equal(bsNavSize(), 0);
  // a stale announce would otherwise bleed into the next surface's first push
  assert.equal(bsNavAnnounced(), null);
  assert.deepEqual(bsNavCompose({ tab: 'home' }), { tab: 'home' });
});

test('guard decisions: arm on empty→non-empty, rearm while entries remain, disarm at empty', () => {
  assert.equal(bsGuardAfterPush(0, 1), 'arm');
  assert.equal(bsGuardAfterPush(1, 2), null);
  assert.equal(bsGuardAfterPush(1, 1), null); // dedupe no-op never arms
  assert.equal(bsGuardAfterPop(1), 'rearm');
  assert.equal(bsGuardAfterPop(0), 'disarm');
});

test('in-app back consumes the guard only when it empties the stack', () => {
  // entries remain → the guard still stands for them, leave it alone
  assert.equal(bsGuardAfterInAppPop(2, true), null);
  assert.equal(bsGuardAfterInAppPop(1, true), null);
  // emptied while armed → the guard is stale; consume it, or the next hardware
  // Back spends itself on it and the user's real back is swallowed
  assert.equal(bsGuardAfterInAppPop(0, true), 'consume');
  // never armed (nothing to consume)
  assert.equal(bsGuardAfterInAppPop(0, false), null);
});

test('guard invariant holds across a full mixed sequence (armed ⟺ stack non-empty)', () => {
  // Simulates the shell: armed tracks whether a guard entry exists in history.
  let armed = false;
  const size = () => stack;
  let stack = 0;
  const push = () => { const prev = stack; stack += 1; if (bsGuardAfterPush(prev, stack) === 'arm' && !armed) armed = true; };
  const popInApp = () => { stack -= 1; if (bsGuardAfterInAppPop(size(), armed) === 'consume') armed = false; };
  const popFromPopstate = () => { stack -= 1; if (bsGuardAfterPop(size()) === 'rearm') armed = true; else armed = false; };

  push(); assert.equal(armed, true);          // 0→1 arms
  push(); assert.equal(armed, true);          // 1→2 no second guard
  popInApp(); assert.equal(armed, true);      // 2→1 guard still stands
  popInApp(); assert.equal(armed, false);     // 1→0 stale guard consumed  ← the Codex P2
  push(); assert.equal(armed, true);          // re-arms cleanly afterwards
  popFromPopstate(); assert.equal(armed, false); // browser consumed it at empty
  push(); push(); assert.equal(armed, true);
  popFromPopstate(); assert.equal(armed, true);  // entries remain → re-armed
  popFromPopstate(); assert.equal(armed, false); // empty → disarmed
  assert.equal(stack, 0);
});
