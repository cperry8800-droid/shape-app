// The example set's AudioContext (public/newdesign/booth/exampleStart.mjs), driven with a fake
// one. Codex, #2287: a stop that landed while the context was resuming was lost and the set
// started over the station; a refused resume was swallowed and the booth claimed a set nobody
// heard. A start now hands back a RUNNING context or nothing, and a cancel reaches a pending start.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createExampleStarter } from '../public/newdesign/booth/exampleStart.mjs';

// A fake AudioContext whose resume() the test settles by hand.
function fakeAC({ initial = 'suspended', resumeTo = 'running' } = {}) {
  const made = [];
  class AC {
    constructor() {
      this.state = initial; this.closed = 0; this.resumes = 0;
      this._settle = null;
      made.push(this);
    }
    resume() {
      this.resumes += 1;
      return new Promise((res, rej) => { this._settle = { res: () => { if (this.state !== 'closed') this.state = resumeTo; res(); }, rej }; });
    }
    close() { this.closed += 1; this.state = 'closed'; return Promise.resolve(); }
  }
  return { AC, made };
}

test('a start hands back the context once it is running', async () => {
  const { AC, made } = fakeAC();
  const s = createExampleStarter(() => AC);
  const p = s.start();
  assert.equal(made.length, 1, 'the context is not made synchronously, inside the tap');
  assert.equal(s.pending, true);
  made[0]._settle.res();
  assert.equal(await p, made[0]);
  assert.equal(s.pending, false);
  assert.equal(made[0].closed, 0);
});

test('an already-running context is handed back without a resume', async () => {
  const { AC, made } = fakeAC({ initial: 'running' });
  const s = createExampleStarter(() => AC);
  assert.equal(await s.start(), made[0]);
  assert.equal(made[0].resumes, 0);
});

test('a stop that lands while it resumes cancels it: nothing starts, and the context is closed', async () => {
  const { AC, made } = fakeAC();
  const s = createExampleStarter(() => AC);
  const p = s.start();
  s.cancel();                     // the station began playing mid-resume
  assert.equal(s.pending, false);
  made[0]._settle.res();          // ...and the resume then succeeds
  assert.equal(await p, null, 'the cancelled start still handed over a context — the set would play over the station');
  assert.ok(made[0].closed >= 1, 'the cancelled context was left open');
});

test('a stop in the same tick as the start wins, even when the context is running at once', async () => {
  // Measured in Chromium on the website: the context came back running, the start resolved before
  // the stop, and the set played. The start now settles a microtask later.
  const { AC, made } = fakeAC({ initial: 'running' });
  const s = createExampleStarter(() => AC);
  const p = s.start();
  s.cancel();
  assert.equal(await p, null, 'a same-tick stop was lost');
  assert.equal(made[0].closed, 1);
});

test('a cancel after the start resolved still reaches the caller before it takes the context', async () => {
  const { AC, made } = fakeAC({ initial: 'running' });
  const s = createExampleStarter(() => AC);
  const ctx = await s.start();
  assert.equal(ctx, made[0]);
  assert.equal(s.isCurrent(ctx), true);
  s.cancel();                    // lands between the start resolving and the caller's continuation
  assert.equal(s.isCurrent(ctx), false, 'the caller would take a context a stop has already refused');
  assert.equal(s.isCurrent(null), false);
  // A new start makes its own context current, never the old one.
  const next = s.start();
  const ctx2 = await next;
  assert.equal(s.isCurrent(ctx2), true);
  assert.equal(s.isCurrent(ctx), false);
});

test('a refused resume is a failed start, not a silent one', async () => {
  const { AC, made } = fakeAC();
  const s = createExampleStarter(() => AC);
  const p = s.start();
  made[0]._settle.rej(new Error('NotAllowedError'));
  assert.equal(await p, null, 'a refused resume was treated as a started set');
  assert.equal(made[0].closed, 1);
  assert.equal(s.pending, false);
});

test('a resume that resolves but leaves the context suspended is a failed start too', async () => {
  const { AC, made } = fakeAC({ resumeTo: 'suspended' });
  const s = createExampleStarter(() => AC);
  const p = s.start();
  made[0]._settle.res();
  assert.equal(await p, null);
  assert.equal(made[0].closed, 1);
});

test('a second start supersedes a pending first one', async () => {
  const { AC, made } = fakeAC();
  const s = createExampleStarter(() => AC);
  const first = s.start();
  const second = s.start();
  assert.equal(made[0].closed, 1, 'the superseded context was left open');
  made[0]._settle.res(); made[1]._settle.res();
  assert.equal(await first, null);
  assert.equal(await second, made[1]);
});

test('no Web Audio, or a constructor that throws, is no start', async () => {
  assert.equal(await createExampleStarter(() => null).start(), null);
  assert.equal(await createExampleStarter(() => false).start(), null);
  assert.equal(await createExampleStarter(() => class { constructor() { throw new Error('no'); } }).start(), null);
});

test('the booth routes every start, stop and resume through these rules', () => {
  const host = readFileSync('public/newdesign/booth/noraBooth.mjs', 'utf8');
  assert.match(host, /const started = starter\.start\(\);/, 'playExample makes its own context again');
  assert.ok(!/new AC\(\)/.test(host), 'the booth constructs an AudioContext outside the starter');
  assert.match(host, /if \(!ctx\) \{ emit\(true\); return false; \}/, 'a failed start is not reported as one');
  assert.match(host, /if \(disposed \|\| audio \|\| !starter\.isCurrent\(ctx\)\)/, 'the booth takes a context without asking whether a stop refused it');
  const stop = host.slice(host.indexOf('function stopExample() {'), host.indexOf('function nextTrack()'));
  assert.match(stop, /starter\.cancel\(\);/, 'stopExample cannot reach a start that is still resuming');
  // A resume refused when the page comes back clears the set rather than claiming it.
  assert.match(host, /c\.resume\(\)\.catch\(\(\) => \{ if \(actx === c\) \{ clearExample\(\); emit\(true\); \} \}\);/);
  const dispose = host.slice(host.indexOf('function dispose() {'));
  assert.match(dispose, /starter\.cancel\(\);/, 'dispose leaves a pending start to finish into a disposed booth');
});
