// THE LIGHT ENGINE: WHAT SHAPE RADIO'S LIGHT EFFECTS KNOW ABOUT THE MUSIC.
//
// WHY THIS FILE EXISTS: the owner's note on Immersive was that it is "supposed to
// adjust the lighting with shape radio", and for a year it did not: every effect
// ran on a fixed 132 BPM clock that ignored the music. The lights now read the
// radio's analyser (services/radioLight.mjs). These are the rules that make that
// reading honest, each driven with synthetic analyser frames:
//   - a kick is a kick: a 128 BPM train counts 21 in 10 s, hiss counts none;
//   - a drop is the kick coming back after a breakdown, not a loudness surge
//     (measured on the preview's example track: a breakdown's pad reads LOUDER
//     to a dB-scaled analyser than the drop after it);
//   - an all-zero frame is a stream we cannot read, never silence;
//   - light paper deepens every gel until it reads (owner: "light paper needs to
//     be a little more visible").

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app', 'src', 'services', 'radioLight.mjs');
const L = await import(SRC);

const frame = (bass, mid, high) => {
  const b = new Uint8Array(256);
  for (let i = 1; i <= 4; i++) b[i] = bass;
  for (let i = 5; i <= 23; i++) b[i] = mid;
  for (let i = 24; i <= 95; i++) b[i] = high;
  return b;
};
const kicks = (bpm, loud = 1) => (t) => frame((t % (60000 / bpm)) < 70 ? 230 * loud : 50 * loud, 90 * loud, 60 * loud);
const pad = () => frame(60, 150, 70);
function run(fn, secs) {
  let s = L.rlInitial();
  const dt = 1000 / 60, drops = [];
  let was = 0;
  for (let t = 0; t < secs * 1000; t += dt) {
    s = L.rlStep(s, L.rlBandsOf(fn(t)), dt);
    const d = L.rlRead(s, 'measured').drop;
    if (d > 0.5 && was <= 0.5) drops.push(t / 1000);
    was = d;
  }
  return { s, drops };
}

test('the engine is pure: no window, no DOM, no clock, no randomness', () => {
  const code = readFileSync(SRC, 'utf8').replace(/\/\/.*$/gm, '');
  for (const bad of [/\bwindow\b/, /\bdocument\b/, /Math\.random/, /\bDate\b/, /performance\./]) {
    assert.ok(!bad.test(code), `radioLight.mjs uses ${bad}`);
  }
});

test('kicks are counted at the music’s own tempo', () => {
  assert.equal(run(kicks(128), 10).s.kicks, 21, '128 BPM over 10 s');
  const fast = run(kicks(174), 10).s.kicks;
  assert.ok(fast >= 28 && fast <= 29, `174 BPM counted ${fast}`);
  // ...and the refractory window caps anything faster than 300 BPM
  assert.ok(run(kicks(400), 10).s.kicks <= 50, 'a 400 BPM train is not counted as 66 kicks');
});

test('hiss and steady tone never kick, and an unreadable stream is not silence', () => {
  assert.equal(run(() => frame(40, 40, 40), 10).s.kicks, 0, 'hiss kicked');
  assert.equal(run(() => frame(200, 200, 200), 10).s.kicks, 0, 'a steady loud tone kicked');
  // a quiet bass ripple (a 40% swing, but only ~4/255 in absolute terms) is not a kick
  assert.equal(run((t) => frame(Math.floor(t / 250) % 2 ? 14 : 10, 30, 20), 10).s.kicks, 0, 'a quiet ripple kicked');
  assert.equal(L.rlHasSignal(new Uint8Array(256)), false);
  assert.equal(L.rlHasSignal(null), false);
  assert.equal(L.rlHasSignal(frame(1, 0, 0)), true);
});

test('a drop is the kick returning after a breakdown, once', () => {
  const r = run((t) => (t < 8000 || t >= 12000 ? kicks(128)(t) : pad()), 18);
  assert.equal(r.drops.length, 1, `drops at ${r.drops}`);
  assert.ok(r.drops[0] >= 12 && r.drops[0] <= 12.6, `the drop landed at ${r.drops[0]} s, not when the kick came back`);
});

test('no drop without a breakdown: steady music, a short gap, or a stream that starts mid-breakdown', () => {
  assert.deepEqual(run(kicks(128), 16).drops, [], 'steady kicks dropped');
  assert.deepEqual(run((t) => (t < 6000 || t >= 7500 ? kicks(128)(t) : pad()), 12).drops, [], 'a 1.5 s gap dropped');
  assert.deepEqual(run((t) => (t < 3500 ? pad() : kicks(128)(t)), 8).drops, [], 'the first kicks of a stream dropped');
  // one stray hit as the stream opens, a gap, then the groove: still the stream's start
  assert.deepEqual(run((t) => (t < 70 ? frame(230, 90, 60) : t < 2800 ? pad() : kicks(128)(t)), 8).drops, [], 'a stray first hit made the groove a drop');
  // a louder section without a kick gap is not a drop either (the rule is not loudness)
  assert.deepEqual(run((t) => kicks(128, t < 10000 ? 0.45 : 1)(t), 16).drops, [], 'a loudness surge dropped');
});

test('the drop holds a bar and eases out; the kick decays', () => {
  const s = { ...L.rlInitial(), t: 10000, dropAt: 10000 - 600, kicks: 3, lastKick: 10000 - 130 };
  assert.equal(L.rlDropAt(s), 1);
  assert.equal(L.rlDropAt({ ...s, dropAt: s.t - L.RL_DROP_HOLD_MS - L.RL_DROP_FADE_MS - 1 }), 0);
  const mid = L.rlDropAt({ ...s, dropAt: s.t - L.RL_DROP_HOLD_MS - L.RL_DROP_FADE_MS / 2 });
  assert.ok(mid > 0.4 && mid < 0.6, `half-way through the fade reads ${mid}`);
  const k = L.rlRead(s, 'measured').kick;
  assert.ok(Math.abs(k - Math.exp(-1)) < 1e-9, `kick one time-constant after the hit reads ${k}`);
  assert.equal(L.rlRead(L.rlInitial(), 'measured').kick, 0, 'a stream with no kick yet reads a kick');
});

test('the demo shows a drop inside the 6 s Settings preview; idle claims no beat', () => {
  const drops = [];
  for (let ms = 0; ms < 6000; ms += 50) if (L.rlDemo(ms).drop > 0.9) drops.push(ms);
  assert.ok(drops.length > 0, 'the 6 s preview never shows a drop');
  assert.ok(drops[0] >= 3600 && drops[0] < 4200, `the demo drop starts at ${drops[0]} ms`);
  for (let ms = 0; ms < 20000; ms += 100) {
    const r = L.rlIdle(ms);
    assert.equal(r.kick, 0); assert.equal(r.drop, 0); assert.equal(r.measured, false);
  }
});

test('dark paper keeps the gels as picked; light paper deepens them until they read', () => {
  const PICKER = ['#0ac5a8', '#e37a5a', '#d9b26a', '#8c6fa8', '#5b8df9', '#f2749f', '#f2ede4'];
  for (const tint of PICKER) {
    assert.equal(L.rlGels(tint, false)[0], tint, `dark paper changed ${tint}`);
    // a fixed floor, not the module's own constant: lowering the constant must fail here
    for (const g of L.rlGels(tint, true)) {
      assert.ok(L.rlContrast(g, '#f2ede4') >= 2.5, `${tint} → ${g} only ${L.rlContrast(g, '#f2ede4').toFixed(2)}:1 on light paper`);
    }
  }
  // cream IS the paper: it must not stay cream
  assert.notEqual(L.rlGels('#f2ede4', true)[0], '#f2ede4');
  // a bad tint never reaches the colour maths
  assert.deepEqual(L.rlGels('var(--x)', false), L.rlGels('#0ac5a8', false));
  assert.equal(L.rlRgbVar('#0ac5a8'), '10,197,168');
});

test('the beams sweep on their own, swing together on the drop, and the kick alternates heads', () => {
  const calm = { kick: 0, drop: 0, level: 0.5, bar: 0.3, barN: 1 };
  // two heads can cross at an instant; across a bar they must stay a fan, not a block
  let spread = 0, n = 0;
  for (let bar = 0; bar < 1; bar += 0.05) {
    const a = L.RL_HEADS.map((_, i) => L.rlBeamAngle(i, { ...calm, bar }));
    spread += Math.max(...a) - Math.min(...a); n += 1;
  }
  assert.ok(spread / n > 20, `without a drop the heads fan only ${(spread / n).toFixed(1)} degrees`);
  const drop = { ...calm, drop: 1 };
  const together = L.RL_HEADS.map((_, i) => L.rlBeamAngle(i, drop));
  assert.ok(together.every((a) => Math.abs(a - together[0]) < 1e-9), 'the heads do not swing together on the drop');
  for (let i = 0; i < 4; i++) for (let bar = 0; bar < 1; bar += 0.05) for (const barN of [0, 1, 2, 3]) {
    assert.ok(Math.abs(L.rlBeamAngle(i, { ...calm, bar, barN })) <= 40, `head ${i} points off the screen at bar ${barN}+${bar}`);
  }
  const hit = { ...calm, kick: 1, bar: 0, barN: 0 };
  assert.ok(L.rlBeamOn(0, hit) > L.rlBeamOn(1, hit), 'the kick does not land on alternate heads');
  assert.ok(L.rlBeamOn(0, hit) > L.rlBeamOn(0, calm), 'the kick does not brighten a beam');
  for (const r of [calm, hit, drop, { ...hit, level: 5, drop: 5 }]) {
    for (const v of [L.rlBeamOn(0, r), L.rlWashOn(r), L.rlPoolOn(r), L.rlEdgeOn(r)]) assert.ok(v >= 0 && v <= 1, `opacity ${v} out of range`);
  }
});
