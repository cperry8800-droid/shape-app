import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlashGate } from '../public/newdesign/booth/flashGate.mjs';

// Drive the gate at 60 fps with a kick train and count the flashes it lets through.
function run({ bpm, kicksPerBeat, seconds = 10, fps = 60, gate = createFlashGate() }) {
  const dt = 1 / fps, beat = 60 / bpm, kickGap = beat / kicksPerBeat;
  let fires = 0, prev = 0;
  const fireTimes = [];
  for (let i = 0; i * dt < seconds; i++) {
    const t = i * dt;
    // a kick: a short 1.0 spike each `kickGap`, decaying over ~40 ms like the analyser's envelope
    const since = t % kickGap;
    const kick = since < 0.045 ? 1 : 0;
    const env = gate.step(dt, t, kick, beat);
    if (env === 1 && prev !== 1) { fires++; fireTimes.push(t); }
    prev = env;
  }
  return { fires, fireTimes };
}

function maxPerSecond(times) {
  let best = 0;
  for (let i = 0; i < times.length; i++) {
    let n = 0;
    for (let j = i; j < times.length && times[j] < times[i] + 1; j++) n++;
    best = Math.max(best, n);
  }
  return best;
}

test('kicks on every 16th at 128 BPM flash the blinders once a beat, never more', () => {
  const beatsIn10s = 10 * 128 / 60;
  const { fires, fireTimes } = run({ bpm: 128, kicksPerBeat: 4 });
  assert.ok(fires <= Math.ceil(beatsIn10s), `${fires} flashes in 10 s of ${beatsIn10s.toFixed(1)} beats`);
  assert.ok(fires >= Math.floor(beatsIn10s) - 1, `${fires} flashes: the gate is eating whole beats`);
  assert.ok(maxPerSecond(fireTimes) <= 3, `${maxPerSecond(fireTimes)} flashes in one second`);
  for (let i = 1; i < fireTimes.length; i++) {
    assert.ok(fireTimes[i] - fireTimes[i - 1] >= 60 / 128 * 0.98 - 1e-9, `two flashes ${(fireTimes[i] - fireTimes[i - 1]).toFixed(3)} s apart`);
  }
});

test('a kick once a beat passes every time', () => {
  const { fires } = run({ bpm: 124, kicksPerBeat: 1 });
  const beats = 10 * 124 / 60;
  assert.ok(fires >= Math.floor(beats) - 1 && fires <= Math.ceil(beats), `${fires} flashes for ${beats.toFixed(1)} beats`);
});

test('at 200 BPM the gate holds three a second', () => {
  const { fires, fireTimes } = run({ bpm: 200, kicksPerBeat: 2 });
  assert.ok(maxPerSecond(fireTimes) <= 3, `${maxPerSecond(fireTimes)} flashes in one second`);
  // the kicks land every 0.15 s and the gate waits a third of a second, so it takes every
  // third kick: about two a second, and never three
  assert.ok(fires >= 20, `${fires} flashes: the gate is eating more than the cap needs`);
});

test('a held kick is one flash, and the flash decays', () => {
  const g = createFlashGate({ decay: 0.1 });
  let env = g.step(1 / 60, 0, 1, 0.5);
  assert.equal(env, 1);
  env = g.step(1 / 60, 1 / 60, 1, 0.5);
  assert.ok(env < 1 && env > 0.7, `decayed to ${env}`);
  let peak = 0;
  for (let i = 2; i < 60; i++) { env = g.step(1 / 60, i / 60, 1, 0.5); peak = Math.max(peak, env); }   // kick held high for a second
  assert.ok(peak < 1, `a held kick re-fired: peaked at ${peak}`);
  assert.ok(env < 0.01, `a held kick re-fired: ${env}`);
  env = g.step(1 / 60, 1.0, 0, 0.5);          // released
  env = g.step(1 / 60, 1.02, 1, 0.5);         // and hit again, past the beat
  assert.equal(env, 1);
});

test('reset forgets the last flash', () => {
  const g = createFlashGate();
  g.step(1 / 60, 5, 1, 0.5);
  g.step(1 / 60, 5.02, 0, 0.5);
  assert.notEqual(g.step(1 / 60, 5.04, 1, 0.5), 1, 'fired inside the beat');
  g.reset();
  assert.equal(g.step(1 / 60, 5.06, 1, 0.5), 1, 'reset did not re-arm');
});

// ── the director under reduced motion ────────────────────────────────────────────────────
import { NoraDirector } from '../public/newdesign/booth/noraDirector.mjs';

function anchors() {
  const v = (x, y, z) => ({ x, y, z });
  return { head: v(0, 1.6, 0.2), jog: v(0.3, 1.0, 0.1), screen: v(0, 1.1, 0.1), mixer: v(0, 1.0, 0.1), deck: 0, lookSide: 1,
    incoming: null, hint: null, drop: false, kick: 0 };
}

test('under reduced motion the camera does not sway: the same shot at two times lands on one point', () => {
  const still = new NoraDirector({ seed: 3, reducedMotion: true });
  const live = new NoraDirector({ seed: 3 });
  still.setMode('wide', 0, 0); live.setMode('wide', 0, 0);
  const a = still.update(0.10, 0.02, anchors(), 1.9, 1 / 60);
  const pA = { ...a.pos }, tA = { ...a.target };
  const b = still.update(0.37, 0.02, anchors(), 1.9, 1 / 60);   // same bar position, later wall clock
  assert.deepEqual({ ...b.pos }, pA, 'the reduced-motion camera moved with the clock');
  assert.deepEqual({ ...b.target }, tA);
  const c = live.update(0.10, 0.02, anchors(), 1.9, 1 / 60);
  const pC = { ...c.pos };
  const d = live.update(0.37, 0.02, anchors(), 1.9, 1 / 60);
  assert.notDeepEqual({ ...d.pos }, pC, 'the control: the live camera should sway between the two times');
});

test('a director with no kick passed does not punch the zoom', () => {
  const d = new NoraDirector({ seed: 3 });
  d.setMode('wide', 0, 0);
  const quiet = d.update(0.1, 0.02, anchors(), 1.9, 1 / 60).fov;
  const punched = d.update(0.1, 0.02, { ...anchors(), kick: 1 }, 1.9, 1 / 60).fov;
  assert.ok(punched < quiet, 'the control: a kick narrows the wide shot');
  assert.equal(d.update(0.1, 0.02, { ...anchors(), kick: 0 }, 1.9, 1 / 60).fov, quiet);
});
