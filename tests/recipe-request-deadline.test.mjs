// Both recipe readers' round trip, DRIVEN — the deadline, and where it is released.
//
// ⚠ WHY THIS MATTERS MORE THAN A TIMEOUT USUALLY DOES. The sheet disables its own
// Cancel AND its backdrop dismissal while a read runs, so an unbounded request
// does not merely spin — it leaves the member with no control on screen that does
// anything, and the only way out is to quit the app, which destroys everything
// they had typed. A stalled mobile connection never rejects on its own.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');

function lift(name) {
  // ⚠ THE `async` KEYWORD IS PART OF THE FUNCTION. Anchoring on `function NAME(`
  // lifts the body without it, and the result is a non-async function whose
  // `await`s are a SyntaxError — which reads as "the code is broken" rather than
  // "the instrument truncated it". The sibling suite got away with this only
  // because nothing it lifts is async.
  let at = SRC.indexOf(`function ${name}(`);
  assert.notEqual(at, -1, `no function ${name}`);
  if (SRC.slice(Math.max(0, at - 6), at) === 'async ') at -= 6;
  const open = SRC.indexOf('{', SRC.indexOf(')', at));
  let depth = 0;
  for (let i = open; i < SRC.length; i += 1) {
    if (SRC[i] === '{') depth += 1;
    else if (SRC[i] === '}') { depth -= 1; if (depth === 0) {
      const body = SRC.slice(at, i + 1);
      assert.ok(body.length > 200, `lifted ${name} is ${body.length} chars — a signature, not a body`);
      return body;
    } }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

const DEADLINE = Number(
  new Function(`return (${SRC.match(/^const BS_RECIPE_REQUEST_MS = ([^;]+);/m)[1]});`)(),
);

// Drives the real bsRecipePost with a stubbed fetch. `ms` is how long the timer
// is given, so a test can make the deadline land without waiting 75 seconds.
function drivePost({ fetchImpl, ms = 5, signal }) {
  const fn = new Function(
    'BS_RECIPE_REQUEST_MS', 'AbortController', 'setTimeout', 'clearTimeout',
    'fetch', 'apiBaseUrl', 'sessionsAuthHeaders',
    `${lift('bsRecipePost')}; return bsRecipePost;`,
  )(ms, AbortController, setTimeout, clearTimeout, fetchImpl, '', (h) => h);
  return fn('/api/nutrition/recipe-photo', { image: 'x' }, signal);
}

test('⚠ A STALLED REQUEST IS ABORTED RATHER THAN LEFT TO HANG FOREVER', async () => {
  let aborted = false;
  const res = await drivePost({
    fetchImpl: (_u, init) => new Promise((_r, reject) => {
      init.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
    }),
  });
  assert.equal(aborted, true, 'the deadline must actually abort the request');
  assert.deepEqual(res, { ok: false, draft: null, reason: 'unavailable' });
});

test('⚠ AND THE DEADLINE COVERS THE BODY, NOT JUST THE HEADERS', async () => {
  // fetch resolves on HEADERS, so releasing the timer there bounds the connection
  // and nothing else — a 200 followed by a stalled body is unwatched. This file's
  // own module already paid for that lesson on the AI draft path.
  let aborted = false;
  const res = await drivePost({
    fetchImpl: async (_u, init) => ({
      ok: true,
      json: () => new Promise((_r, reject) => {
        init.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
      }),
    }),
  });
  assert.equal(aborted, true, 'a 200 with a body that never arrives must still be cut off');
  assert.deepEqual(res, { ok: false, draft: null, reason: 'unavailable' });
});

test('a healthy round trip is not cut off, and its timer is released', async () => {
  // The control: without it every assertion above passes on a client that aborts
  // everything immediately.
  const res = await drivePost({
    ms: 5000,
    fetchImpl: async () => ({ ok: true, json: async () => ({ draft: { title: 'T' } }) }),
  });
  assert.deepEqual(res, { ok: true, draft: { title: 'T' }, reason: null });
});

test('a caller-supplied signal still ends the request', async () => {
  // ⚠ MUTATION-FOUND: THE FIRST VERSION WAS RESCUED BY THE INTERNAL TIMER. It ran
  // with a 5s deadline, so dropping the caller's signal entirely still ended the
  // request — five seconds later, via the wrong mechanism, with the assertion
  // none the wiser. The internal deadline is pushed out of reach and the test
  // races the result against a short clock, so only the CALLER can be what ends
  // it.
  const ctrl = new AbortController();
  let aborted = false;
  const p = drivePost({
    ms: 60_000,
    signal: ctrl.signal,
    fetchImpl: (_u, init) => new Promise((_r, reject) => {
      init.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
    }),
  });
  ctrl.abort();
  const outcome = await Promise.race([p, new Promise((r) => setTimeout(() => r('HUNG'), 400))]);
  assert.notEqual(outcome, 'HUNG', 'the caller must be able to end it, and promptly');
  assert.deepEqual(outcome, { ok: false, draft: null, reason: 'unavailable' });
  assert.equal(aborted, true, 'and the abort must reach the request');
});

test('an already-aborted signal is honoured rather than ignored', async () => {
  // ⚠ MUTATION-FOUND, AND THE FAILURE MODE IS THIS FILE'S OWN LESSON. The first
  // version asserted INSIDE the fetch stub — but bsRecipePost wraps the whole
  // round trip in a catch that turns any throw into `unavailable`, so the
  // assertion's failure was swallowed by the very code under test and the outer
  // expectation passed. A swallowing catch hides which of the two you are looking
  // at, so the observation is recorded in the stub and asserted OUTSIDE it.
  const ctrl = new AbortController();
  ctrl.abort();
  let sawAborted = null;
  const res = await drivePost({
    ms: 60_000,
    signal: ctrl.signal,
    fetchImpl: async (_u, init) => {
      sawAborted = init.signal.aborted;
      throw new Error('aborted');
    },
  });
  assert.equal(sawAborted, true, 'a signal that is already aborted must be forwarded as aborted');
  assert.deepEqual(res, { ok: false, draft: null, reason: 'unavailable' });
});

test('⚠ THE DEADLINE OUTLASTS THE SERVER SO A NAMED REASON CAN GET BACK', () => {
  // The photo route declares maxDuration 60 and gives the provider 55_000, so a
  // shorter client deadline would abort a request that was about to return
  // "we couldn't read that photo" or "no recipe in it" and replace it with a
  // generic failure. This deadline is for a dead network, not a slow server —
  // derived from the route rather than asserted, so changing one and not the
  // other fails here.
  const route = readFileSync(join(ROOT, 'src/app/api/nutrition/recipe-photo/route.ts'), 'utf8');
  const maxDuration = Number(route.match(/export const maxDuration = (\d+)/)[1]);
  const providerMs = Number(route.match(/timeoutMs: ([\d_]+)/)[1].replace(/_/g, ''));
  assert.ok(providerMs < maxDuration * 1000, 'the route must give up before the platform does');
  assert.ok(DEADLINE > maxDuration * 1000,
    `a ${DEADLINE}ms client deadline must outlast the route's own ${maxDuration}s ceiling`);
});

test('both readers go through the bounded round trip — neither keeps its own fetch', () => {
  // ⚠ The defect was one unbounded fetch per reader, so the invariant is that
  // there is now exactly ONE fetch in this half of the module and both callers
  // reach it. A guard naming only the photo path would have left the paste path
  // hanging in precisely the same way.
  const half = SRC.slice(SRC.indexOf('async function bsRecipePost('), SRC.indexOf('window.ShapeRecipeImport'));
  assert.equal((half.match(/\bfetch\(/g) || []).length, 1, 'one round trip, shared');
  assert.match(half, /return bsRecipePost\('\/api\/nutrition\/recipe-parse'/);
  assert.match(half, /return bsRecipePost\('\/api\/nutrition\/recipe-photo'/);
});
