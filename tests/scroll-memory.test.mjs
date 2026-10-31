// Back lands where you were (owner, 2026-10-31: "make sure it goes back to [the] page of where that
// person was on the page"). A page that leaves going forward is remembered with how far down it was;
// a page a Back brings back takes that place. The pure rules here (services/scrollMemory.mjs); the
// page chrome that calls them is driven in tests/back-placement.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsScrollMemory, bsScrollSameSig, BS_SCROLL_BACK_MS } from '../mobile-app/src/services/scrollMemory.mjs';

// A memory on a hand-cranked clock and tick, so "the same tick" and "the next tap" are exact.
function memory() {
  let t = 1000;
  const queue = [];
  const m = bsScrollMemory({ now: () => t, defer: (f) => queue.push(f) });
  return { m, tick: () => { while (queue.length) queue.shift()(); }, wait: (ms) => { t += ms; } };
}
const LIST = { types: ['ListPage'], title: 'Progress' };
const DETAIL = { types: ['Detail'], title: 'Bench press' };
const PROFILE = { types: ['Profile'], title: 'Maya' };

test('a page left going forward comes back, on a Back, where it was', () => {
  const { m, tick } = memory();
  m.leave(LIST, 640); tick();             // the list opens a detail
  assert.equal(m.arrive(DETAIL), null, 'the detail opens at the top: no Back was asked for');
  m.markBack();
  m.leave(DETAIL, 300);                   // Back: the detail is done with, not remembered
  assert.equal(m.arrive(LIST), 640, 'the list is back where the reader left it');
  tick();
  assert.equal(m.size(), 0);
});

test('steps stack: two Backs walk back through both pages, each to its own place', () => {
  const { m, tick } = memory();
  m.leave(LIST, 640); tick();
  m.leave(DETAIL, 220); tick();           // the detail opens a profile
  m.markBack(); m.leave(PROFILE, 90);
  assert.equal(m.arrive(DETAIL), 220); tick();
  m.markBack(); m.leave(DETAIL, 220);
  assert.equal(m.arrive(LIST), 640); tick();
});

test('without a Back, a page that arrives starts at the top and the memory is kept', () => {
  const { m, tick } = memory();
  m.leave(LIST, 640); tick();
  assert.equal(m.arrive(LIST), null, 'a tab tapped again is not a Back');
  assert.equal(m.size(), 1);
});

test('a remembered place is only ever given to the same page', () => {
  const { m, tick } = memory();
  m.leave(LIST, 640); tick();
  m.markBack();
  assert.equal(m.arrive(PROFILE), null, 'a Back that lands somewhere else does not scroll it to the list\'s place');
  tick();
  assert.equal(m.size(), 0, 'and the stale place is dropped');
});

test('pages that leave in one tick are one step; the pages a Back mounts each take their own', () => {
  const { m, tick } = memory();
  const TAB = { types: ['Tab'], title: '' };
  m.leave(TAB, 500); m.leave(LIST, 640); tick(); // a takeover replaced a tab and the page inside it
  assert.equal(m.size(), 1);
  m.markBack();
  assert.equal(m.arrive(LIST), 640);
  assert.equal(m.arrive(TAB), 500);
  tick();
});

test('a Back that opened nothing (a takeover closing over a page that stayed) leaves no trap', () => {
  const { m, tick, wait } = memory();
  m.leave(LIST, 640); tick();
  m.markBack();                            // closes an overlay: nothing mounts
  m.clearBack();                           // the reader's next tap, elsewhere
  m.leave(DETAIL, 50); tick();             // a forward step is still remembered...
  assert.equal(m.size(), 2);
  assert.equal(m.arrive(PROFILE), null, '...and the page it opens is not treated as a Back');
  // An unanswered mark also runs out on its own.
  m.markBack(); wait(BS_SCROLL_BACK_MS + 1);
  assert.equal(m.backPending(), false);
});

test('a second mark from the same Back (the ← and the shell it calls) keeps its step', () => {
  const { m, tick } = memory();
  const TAB = { types: ['Tab'], title: '' };
  m.leave(TAB, 500); m.leave(LIST, 640); tick();
  m.markBack();
  assert.equal(m.arrive(LIST), 640);
  m.markBack();                            // navBack marks again inside the same Back
  assert.equal(m.arrive(TAB), 500, 'the step being restored is not dropped');
  tick();
});

test('identities: same first element(s) and title', () => {
  assert.equal(bsScrollSameSig({ types: ['a', 'b'], title: 'x' }, { types: ['a', 'b'], title: 'x' }), true);
  assert.equal(bsScrollSameSig({ types: ['a'], title: 'x' }, { types: ['a'], title: 'y' }), false);
  assert.equal(bsScrollSameSig({ types: ['a'], title: '' }, { types: ['a', 'b'], title: '' }), false);
  assert.equal(bsScrollSameSig(null, null), true, 'two pages with nothing to tell them apart trust the stack');
  assert.equal(bsScrollSameSig(null, { types: ['a'], title: '' }), false);
});

test('the memory holds a bounded number of steps', () => {
  const { m, tick } = memory();
  for (let i = 0; i < 100; i += 1) { m.leave({ types: ['P'], title: String(i) }, i + 1); tick(); }
  assert.ok(m.size() <= 40);
  m.markBack();
  assert.equal(m.arrive({ types: ['P'], title: '99' }), 100, 'the newest steps are the ones kept');
});
