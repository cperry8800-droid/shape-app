// One booth that outlives the screen showing it (public/newdesign/booth/noraBoothKeeper.mjs).
// The app re-downloaded Nora's 10.8 MB model on every return to the Radio tab; the keeper holds
// the booth between visits and gives it back after a few idle minutes. Driven with a fake clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoothKeeper, IDLE_DISPOSE_MS } from '../public/newdesign/booth/noraBoothKeeper.mjs';

function clock() {
  let now = 0, id = 0;
  const due = new Map();
  return {
    timers: { set: (fn, ms) => { id += 1; due.set(id, { at: now + ms, fn }); return id; }, clear: (i) => { due.delete(i); } },
    advance(ms) {
      now += ms;
      for (const [i, d] of [...due]) if (d.at <= now) { due.delete(i); d.fn(); }
    },
    get pending() { return due.size; },
  };
}
function fakeBooth() {
  return { stops: 0, disposes: 0, stop() { this.stops += 1; }, dispose() { this.disposes += 1; } };
}
const tick = () => new Promise((r) => setImmediate(r));

test('a return within the idle window gets the same booth, built once', async () => {
  const c = clock();
  let builds = 0;
  const k = createBoothKeeper({ create: async () => { builds += 1; return fakeBooth(); }, timers: c.timers });
  const a = await k.acquire();
  k.release();
  assert.equal(a.stops, 1, 'a released booth keeps drawing');
  assert.equal(a.disposes, 0);
  c.advance(IDLE_DISPOSE_MS - 1);
  const b = await k.acquire();
  assert.equal(b, a, 'the return built a second booth');
  assert.equal(builds, 1);
  assert.equal(c.pending, 0, 'the idle timer survived the return');
});

test('nobody holding it for the idle window disposes it, and the next visit builds afresh', async () => {
  const c = clock();
  let builds = 0;
  const k = createBoothKeeper({ create: async () => { builds += 1; return fakeBooth(); }, timers: c.timers });
  const a = await k.acquire();
  k.release();
  c.advance(IDLE_DISPOSE_MS);
  assert.equal(a.disposes, 1, 'an idle booth kept its context and memory forever');
  assert.equal(k.booth, null);
  const b = await k.acquire();
  assert.notEqual(b, a);
  assert.equal(builds, 2);
});

test('two holders: the booth stops only when the last lets go', async () => {
  const c = clock();
  const k = createBoothKeeper({ create: async () => fakeBooth(), timers: c.timers });
  const a = await k.acquire();
  await k.acquire();
  assert.equal(k.held, 2);
  k.release();
  assert.equal(a.stops, 0);
  assert.equal(c.pending, 0);
  k.release();
  assert.equal(a.stops, 1);
  assert.equal(c.pending, 1);
  // A stray extra release is ignored rather than going negative.
  k.release();
  assert.equal(k.held, 0);
  assert.equal(c.pending, 1);
});

test('released while it loads: it waits stopped, and a load nobody returns for is disposed on arrival', async () => {
  const c = clock();
  let resolve;
  const booth = fakeBooth();
  const k = createBoothKeeper({ create: () => new Promise((r) => { resolve = r; }), timers: c.timers });
  const p = k.acquire();
  await tick();
  k.release();                       // the member left mid-download
  resolve(booth);
  const got = await p;
  assert.equal(got, booth);
  assert.equal(booth.stops, 1, 'a booth that arrived with nobody holding it started drawing');
  c.advance(IDLE_DISPOSE_MS);
  assert.equal(booth.disposes, 1);

  // The other order: the idle window ends BEFORE the model arrives.
  let resolve2;
  const booth2 = fakeBooth();
  const k2 = createBoothKeeper({ create: () => new Promise((r) => { resolve2 = r; }), timers: c.timers });
  const p2 = k2.acquire();
  await tick();
  k2.release();
  c.advance(IDLE_DISPOSE_MS);
  resolve2(booth2);
  await assert.rejects(p2, (e) => e.name === 'AbortError');
  assert.equal(booth2.disposes, 1, 'a booth nobody will ever attach kept its WebGL context');
});

test('a failed build leaves nothing held, and the next acquire retries', async () => {
  const c = clock();
  let n = 0;
  const k = createBoothKeeper({ create: async () => { n += 1; if (n === 1) throw new Error('model 404'); return fakeBooth(); }, timers: c.timers });
  await assert.rejects(k.acquire(), /model 404/);
  assert.equal(k.held, 0);
  k.release();                       // the screen's cleanup after a failure is harmless
  assert.equal(c.pending, 0);
  const b = await k.acquire();
  assert.ok(b);
  assert.equal(n, 2);
});

test('the download progress reaches every screen watching, and a late one gets the latest value', async () => {
  const c = clock();
  let report, resolve;
  const k = createBoothKeeper({ create: (r) => { report = r; return new Promise((res) => { resolve = res; }); }, timers: c.timers });
  const seen = [];
  const off = k.onProgress((f) => seen.push(f));
  const p = k.acquire();
  await tick();
  report(0.25); report(0.5);
  const late = [];
  k.onProgress((f) => late.push(f));
  assert.deepEqual(seen, [0.25, 0.5]);
  assert.deepEqual(late, [0.5], 'a screen that mounted mid-download started at nothing');
  off();
  report(0.75);
  assert.deepEqual(seen, [0.25, 0.5]);
  resolve(fakeBooth());
  await p;
});

test('disposeNow ends it whether held or not', async () => {
  const c = clock();
  const k = createBoothKeeper({ create: async () => fakeBooth(), timers: c.timers });
  const a = await k.acquire();
  k.disposeNow();
  assert.equal(a.disposes, 1);
  assert.equal(k.booth, null);
  assert.throws(() => createBoothKeeper({}), /create is required/);
});
