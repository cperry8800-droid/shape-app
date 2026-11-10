// tests/nav-history.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bsNavPush, bsNavPop, bsNavPeek, bsNavCanPop, bsNavSize, bsNavClear,
  bsNavReplaceTop, bsNavAnnounce, bsNavAnnounced, bsNavCompose,
  bsGuardWanted, bsGuardSync, bsPhoneBack,
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

// Each surface announces under its own key (Codex P2 on #2683): an overlay closing over a page clears only
// its own, so the page's survives for the next push; a push merges every live one, the later winning a key.
test('announce is keyed: an overlay closing over a page leaves the page\'s, and the newer wins a shared key', () => {
  bsNavClear();
  bsNavAnnounce({ detail: { clientId: 'c1' } }, 'clients');
  bsNavAnnounce({ sub: 'integrations' }, 'settings');
  assert.deepEqual(bsNavCompose({ tab: 'clients', overlay: 'settings' }),
    { tab: 'clients', overlay: 'settings', detail: { clientId: 'c1' }, sub: 'integrations' }, 'both, while Settings is open');
  bsNavAnnounce(null, 'settings');
  assert.deepEqual(bsNavCompose({ tab: 'clients' }), { tab: 'clients', detail: { clientId: 'c1' } }, 'Settings closing leaves the client');
  assert.deepEqual(bsNavAnnounced('clients'), { detail: { clientId: 'c1' } });
  assert.equal(bsNavAnnounced('settings'), null);
  // A page and the overlay over it share `sub`: the overlay, announced later, wins while it is open.
  bsNavAnnounce({ sub: 'goals' }, 'home');
  bsNavAnnounce({ sub: 'edit-profile' }, 'settings');
  assert.equal(bsNavCompose({ tab: 'home', overlay: 'settings' }).sub, 'edit-profile');
  bsNavAnnounce(null, 'settings');
  assert.equal(bsNavCompose({ tab: 'home' }).sub, 'goals');
  // The same key replaces its own, and the bare call (no key) still works as one slot of its own.
  bsNavAnnounce({ sub: 'habits' }, 'home');
  assert.equal(bsNavCompose({ tab: 'home' }).sub, 'habits');
  bsNavAnnounce(null, 'home'); bsNavAnnounce(null, 'clients');
  assert.equal(bsNavAnnounced(), null);
  bsNavClear();
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

test('a guard is wanted while a Back has somewhere to go: the stack, or the page in front\'s own Back', () => {
  assert.equal(bsGuardWanted(0, false), false, 'a root tab, nothing pushed: the phone\'s back leaves the app');
  assert.equal(bsGuardWanted(1, false), true);
  // A page opened in place pushes nothing (Home → Goals, a station, a meal's preview): its own Back wants it,
  // or the phone's back walked off the app from it (owner, 2026-11-10).
  assert.equal(bsGuardWanted(0, true), true);
  assert.equal(bsGuardWanted(2, true), true);
});

test('the sync arms a wanted guard, walks off a stale one, and waits while its own walk-off is on its way', () => {
  assert.equal(bsGuardSync({ wanted: true, armed: false }), 'arm');
  assert.equal(bsGuardSync({ wanted: true, armed: true }), null, 'never a second guard');
  // Nothing to go back to and armed: the guard is stale, and would swallow the reader's next Back.
  assert.equal(bsGuardSync({ wanted: false, armed: true }), 'consume');
  assert.equal(bsGuardSync({ wanted: false, armed: false }), null);
  // Our history.back() lands as a popstate later: decide nothing until it has.
  assert.equal(bsGuardSync({ wanted: true, armed: false, consuming: true }), null);
  assert.equal(bsGuardSync({ wanted: false, armed: true, consuming: true }), null);
});

test('the phone\'s back takes the page in front\'s own Back first, then the stack', () => {
  assert.equal(bsPhoneBack({ pageHasBack: true, stackSize: 3 }), 'page', 'a station closes onto its cover, not a step of the stack');
  assert.equal(bsPhoneBack({ pageHasBack: true, stackSize: 0 }), 'page');
  assert.equal(bsPhoneBack({ pageHasBack: false, stackSize: 2 }), 'stack', 'a root tab steps the history');
  assert.equal(bsPhoneBack({ pageHasBack: false, stackSize: 0 }), 'none');
});

test('guard invariant holds across a mixed sequence (armed ⟺ the stack or a page Back)', () => {
  // Simulates the shell: armed tracks whether a guard entry exists in history; each step syncs after.
  let stack = 0, pageBack = false, armed = false, consuming = false;
  const sync = () => {
    const act = bsGuardSync({ wanted: bsGuardWanted(stack, pageBack), armed, consuming });
    if (act === 'arm') armed = true;
    if (act === 'consume') { armed = false; consuming = true; }
  };
  const landConsume = () => { consuming = false; sync(); };
  const phoneBack = () => { // the popstate: the browser spent the guard
    if (!armed) return 'left the app';
    armed = false;
    const step = bsPhoneBack({ pageHasBack: pageBack, stackSize: stack });
    if (step === 'page') pageBack = false; // its ← closed it
    else if (step === 'stack') stack -= 1;
    sync();
    return step;
  };
  // Home → Goals in place: nothing pushed, the page's Back wants a guard.
  pageBack = true; sync(); assert.equal(armed, true);
  assert.equal(phoneBack(), 'page');           // the phone's back closes Goals, not the app
  assert.equal(armed, false);                  // on Home with nothing behind it: no guard
  assert.equal(phoneBack(), 'left the app');
  // A jump (push), then a page opened in place over the destination.
  stack = 1; sync(); assert.equal(armed, true);
  pageBack = true; sync(); assert.equal(armed, true);
  assert.equal(phoneBack(), 'page');           // the page first…
  assert.equal(armed, true);                   // …the stack still has the jump
  assert.equal(phoneBack(), 'stack');          // …then the jump back
  assert.equal(armed, false);
  // An on-screen ← that empties everything leaves a stale guard: walked off, and waited for.
  stack = 1; sync(); stack = 0; sync();
  assert.equal(armed, false); assert.equal(consuming, true);
  pageBack = true; sync(); assert.equal(armed, false, 'nothing is decided while the walk-off is on its way');
  landConsume(); assert.equal(armed, true);
});
