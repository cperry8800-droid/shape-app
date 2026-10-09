// Nora's face and resting body (public/newdesign/booth/noraFace.mjs), the hair's spring steps
// (noraPerformer.mjs), the crowd's drawn eyes (crowdAvatars.mjs) and the camera that keeps the
// anime placeholder's face out of its rotation (noraDirector.mjs, noraBoothState.mjs).
//
// The owner's word was "still looks very animated", and every rule here replaces a clock: a blink
// every 3.7 s, eyes glued to the head, a breath at exactly 14 a minute, a 2-second metronome sway
// with nothing playing. So most of these tests are about irregularity that is still bounded, and
// about the same seed always giving the same face.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  mulberry32, BLINK, BLINK_LEN, blinkShape, blinkGap, createBlinker,
  GAZE, angleBetween, turnAbout, createGaze,
  BREATH, breathShape, createBreath, WEIGHT, createWeightShift, createFace,
} from '../public/newdesign/booth/noraFace.mjs';
import { springSteps, SPRING_STEP, SPRING_MAX_STEPS, HAIR_SETTLE_S, HAIR_GRAVITY, hairGravity } from '../public/newdesign/booth/noraPerformer.mjs';
import { humanEyeFrame, HUMAN_EYE, decodeCrowdPack } from '../public/newdesign/booth/crowdAvatars.mjs';
import { NoraDirector, SHOT_IDS } from '../public/newdesign/booth/noraDirector.mjs';
import { NORA_MODEL } from '../public/newdesign/booth/noraBoothState.mjs';
import { stripComments } from './helpers/strip-comments.mjs';
import { parse } from '@babel/parser';

const DEG = Math.PI / 180;
const FPS = 30;
const DT = 1 / FPS;

/** Blink onsets (the moment the lid passes half shut) over `seconds` at `fps`. */
function blinkOnsets(blinker, seconds, { fps = FPS, gazeAt = null } = {}) {
  const out = [];
  let prev = 0;
  for (let i = 0; i < seconds * fps; i++) {
    const t = i / fps;
    const lid = blinker.step(1 / fps, { gazeShift: !!(gazeAt && gazeAt(t)) });
    if (lid >= 0.5 && prev < 0.5) out.push(t);
    prev = lid;
  }
  return out;
}
const gapsOf = (xs) => xs.slice(1).map((x, i) => x - xs[i]);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };

// ── Blinks ──────────────────────────────────────────────────────────────────
test('a blink closes fast, holds, opens slowly, and is over', () => {
  assert.equal(blinkShape(-0.01), 0);
  assert.equal(blinkShape(NaN), 0);
  assert.equal(blinkShape(0), 0);
  assert.ok(blinkShape(BLINK.close * 0.5) > 0 && blinkShape(BLINK.close * 0.5) < 0.5, 'half way down is still mostly open (it accelerates)');
  assert.equal(blinkShape(BLINK.close + BLINK.hold * 0.5), 1);
  assert.equal(blinkShape(BLINK_LEN + 0.001), 0);
  // the lid passes half shut sooner on the way down than it reopens past half on the way up
  const down = (() => { for (let u = 0; u < 1; u += 0.001) if (blinkShape(u) >= 0.5) return u; return 1; })();
  const up = (() => { for (let u = BLINK.close + BLINK.hold; u < 1; u += 0.001) if (blinkShape(u) <= 0.5) return u - BLINK.close - BLINK.hold; return 1; })();
  assert.ok(down < up, `closing to half took ${down}s, reopening past half ${up}s`);
});

test('gaps between blinks are bounded and the tail is long', () => {
  assert.equal(blinkGap(0), BLINK.minGap);
  assert.equal(blinkGap(0.9999999), BLINK.maxGap);
  assert.ok(blinkGap(0.5) > BLINK.minGap && blinkGap(0.5) < BLINK.meanGap, 'the median sits below the mean (an exponential tail)');
  for (let r = 0; r < 1; r += 0.01) { const g = blinkGap(r); assert.ok(g >= BLINK.minGap && g <= BLINK.maxGap, `gap ${g}`); }
});

test('she blinks at an irregular human rate, never on a fixed period', () => {
  const onsets = blinkOnsets(createBlinker({ rand: mulberry32(7) }), 600);
  const gaps = gapsOf(onsets);
  const m = mean(gaps);
  assert.ok(m > 2.3 && m < 4.5, `mean gap ${m.toFixed(2)} s`);
  // the old cycle had a spread of zero
  assert.ok(sd(gaps) > 0.6, `the gaps barely vary (sd ${sd(gaps).toFixed(2)} s)`);
  const singles = gaps.filter((g) => g > BLINK_LEN + BLINK.doubleGap + 0.1);
  const doubles = gaps.filter((g) => g <= BLINK_LEN + BLINK.doubleGap + 0.1);
  assert.ok(doubles.length > 0, 'never a double blink in ten minutes');
  for (const g of doubles) assert.ok(g >= BLINK_LEN, `a double blink overlapped its first (${g})`);
  // onsets are read at frame resolution, so each gap is good to two frames
  for (const g of singles) assert.ok(g >= BLINK.minGap - 2 * DT && g <= BLINK.maxGap + 2 * DT, `gap ${g} outside [minGap, maxGap]`);
});

test('the same seed blinks the same way; another seed does not', () => {
  const a = blinkOnsets(createBlinker({ rand: mulberry32(3) }), 120);
  const b = blinkOnsets(createBlinker({ rand: mulberry32(3) }), 120);
  const c = blinkOnsets(createBlinker({ rand: mulberry32(4) }), 120);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('a paused booth does not owe a backlog of blinks when it resumes', () => {
  const bl = createBlinker({ rand: mulberry32(9) });
  bl.step(DT);
  bl.step(60);   // a minute hidden, in one step
  let shutFrames = 0;
  for (let i = 0; i < 2 * FPS; i++) if (bl.step(DT) > 0.5) shutFrames++;
  // at most a blink (and its double) in the two seconds after, not a minute's worth
  assert.ok(shutFrames <= Math.ceil((2 * BLINK_LEN) * FPS) + 2, `shut for ${shutFrames} frames`);
});

test('a large gaze shift brings a blink about as often as gazeChance says', () => {
  let evoked = 0, trials = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const bl = createBlinker({ rand: mulberry32(seed) });
    let prev = 0, onset = null;
    while (onset == null) { const l = bl.step(DT); if (l >= 0.5 && prev < 0.5) onset = bl.clock; prev = l; }
    // past the refractory window and past any double blink, lids open
    while (bl.clock < onset + 1.0) bl.step(DT);
    if (bl.nextAt - bl.clock < 0.3) continue;   // a natural blink is due anyway: not a fair trial
    trials++;
    bl.step(DT, { gazeShift: true });
    // a blink began on that step if the lids are shut a closing-time later
    if (bl.step(BLINK.close + BLINK.hold / 2) === 1) evoked++;
  }
  assert.ok(trials >= 40, `only ${trials} fair trials`);
  const rate = evoked / trials;
  assert.ok(Math.abs(rate - BLINK.gazeChance) < 0.2, `${evoked} of ${trials} evoked (${rate.toFixed(2)})`);
});

test('no gaze-evoked blink lands inside the refractory window', () => {
  const bl = createBlinker({ rand: mulberry32(11) });
  let prev = 0, onsets = [];
  for (let i = 0; i < 300 * FPS; i++) {
    const l = bl.step(DT, { gazeShift: true });   // she shifts her gaze every frame: the worst case
    if (l >= 0.5 && prev < 0.5) onsets.push(bl.clock);
    prev = l;
  }
  const singles = gapsOf(onsets).filter((g) => g > BLINK_LEN + BLINK.doubleGap + 0.1);
  for (const g of singles) assert.ok(g >= BLINK.gazeRefractory - DT, `blinks ${g.toFixed(3)} s apart`);
});

// ── Gaze ────────────────────────────────────────────────────────────────────
const EYE = { x: 0, y: 1.6, z: 0.3 };
const ahead = (deg, d = 3) => turnAbout(EYE, { x: 0, y: 1.6, z: 0.3 - d }, deg * DEG, 0);

test('turnAbout keeps the distance and turns by the angle asked', () => {
  const p = { x: 0.4, y: 1.1, z: -2.5 };
  const q = turnAbout(EYE, p, 12 * DEG, -5 * DEG);
  const d0 = Math.hypot(p.x - EYE.x, p.y - EYE.y, p.z - EYE.z);
  const d1 = Math.hypot(q.x - EYE.x, q.y - EYE.y, q.z - EYE.z);
  assert.ok(Math.abs(d0 - d1) < 1e-9);
  assert.ok(Math.abs(angleBetween(EYE, ahead(0), ahead(30)) - 30 * DEG) < 1e-9);
  assert.equal(angleBetween(EYE, EYE, ahead(10)), 0);
});

test('the eyes jump to a new target at once and the head is handed the same point', () => {
  const g = createGaze({ rand: mulberry32(5) });
  let r = g.step(DT, { eye: EYE, want: ahead(0) });
  for (let i = 0; i < 10; i++) r = g.step(DT, { eye: EYE, want: ahead(0) });
  r = g.step(DT, { eye: EYE, want: ahead(25) });
  assert.equal(r.saccade, true);
  assert.equal(r.big, true, 'a 25° shift is a big one');
  assert.ok(angleBetween(EYE, r.head, ahead(25)) < 1e-9, 'the head is sent to the new target');
  assert.ok(angleBetween(EYE, r.gaze, ahead(25)) < 1e-6, 'the eyes are on it in the same step');
});

test('a small move of the target does not move the eyes, and a quick second one waits', () => {
  const g = createGaze({ rand: mulberry32(5) });
  for (let i = 0; i < 10; i++) g.step(DT, { eye: EYE, want: ahead(0) });
  let r = g.step(DT, { eye: EYE, want: ahead(GAZE.threshold / DEG - 1) });
  assert.equal(r.saccade, false);
  r = g.step(DT, { eye: EYE, want: ahead(10) });
  assert.equal(r.saccade, true);
  assert.equal(r.big, false);
  r = g.step(DT, { eye: EYE, want: ahead(-10) });   // 1/30 s later: inside the shortest fixation
  assert.equal(r.saccade, false);
  assert.ok(angleBetween(EYE, r.head, ahead(10)) < 1e-9, 'still holding the last fixation');
  let waited = DT;
  while (!r.saccade) { r = g.step(DT, { eye: EYE, want: ahead(-10) }); waited += DT; }
  assert.ok(waited >= GAZE.holdMin - 1e-9, `re-fixed after ${waited}s`);
});

test('while she holds a point her eyes drift by a degree or so, never more', () => {
  const g = createGaze({ rand: mulberry32(8) });
  const offs = new Set();
  for (let i = 0; i < 60 * FPS; i++) {
    const r = g.step(DT, { eye: EYE, want: ahead(0) });
    const a = angleBetween(EYE, r.gaze, r.head);
    assert.ok(a <= GAZE.microAmp * Math.SQRT2 + 1e-9, `drifted ${a / DEG}°`);
    offs.add(a.toFixed(6));
  }
  assert.ok(offs.size > 5, 'the eyes never moved while fixating');
});

test('with nothing to do she looks around the room, within bounds, not too often', () => {
  const g = createGaze({ rand: mulberry32(12) });
  const want = ahead(0, 5);
  const heads = [];
  let last = null, changes = [];
  for (let i = 0; i < 120 * FPS; i++) {
    const r = g.step(DT, { eye: EYE, want, idle: true });
    heads.push(r.head);
    if (r.saccade) { if (last != null) changes.push(i * DT - last); last = i * DT; }
  }
  assert.ok(angleBetween(EYE, heads[0], want) < 1e-9, 'the first idle glance is the point itself');
  assert.ok(changes.length >= 10, `only ${changes.length} glances in two minutes`);
  for (const c of changes) assert.ok(c >= GAZE.idleMin - DT, `glances ${c}s apart`);
  for (const h of heads) assert.ok(angleBetween(EYE, h, want) <= Math.hypot(GAZE.idleYaw, GAZE.idlePitch) + 1e-6);
  // given work, she looks at it straight away
  const r = g.step(DT, { eye: EYE, want: ahead(-30, 1) });
  assert.ok(r.saccade || angleBetween(EYE, r.head, ahead(-30, 1)) < 1e-9 || angleBetween(EYE, heads[heads.length - 1], ahead(-30, 1)) < GAZE.threshold);
});

// ── Breath ──────────────────────────────────────────────────────────────────
test('one breath is a quick inhale and a longer exhale', () => {
  assert.ok(Math.abs(breathShape(0) - -1) < 1e-9);
  assert.ok(Math.abs(breathShape(BREATH.inhale) - 1) < 1e-9);
  assert.ok(Math.abs(breathShape(1) - -1) < 1e-9);
  assert.ok(BREATH.inhale < 0.5);
  for (let p = 0; p < 1; p += 0.01) assert.ok(Math.abs(breathShape(p)) <= 1 + 1e-9);
});

function breathsPerMinute(energy, seconds = 300, seed = 3) {
  const b = createBreath({ rand: mulberry32(seed) });
  const p0 = b.phase;
  for (let i = 0; i < seconds * FPS; i++) b.step(DT, energy);
  return ((b.phase - p0) / seconds) * 60;
}

test('she breathes about 12 a minute at rest, faster with effort, and never at a fixed rate', () => {
  const rest = breathsPerMinute(0);
  const hard = breathsPerMinute(1);
  assert.ok(rest > 10.5 && rest < 14.5, `at rest ${rest.toFixed(2)}/min`);
  assert.ok(hard > 17 && hard < 23, `with effort ${hard.toFixed(2)}/min`);
  // the rate wanders: two minutes differ
  const b = createBreath({ rand: mulberry32(3) });
  const perMinute = [];
  for (let m = 0; m < 6; m++) { const p0 = b.phase; for (let i = 0; i < 60 * FPS; i++) b.step(DT, 0); perMinute.push(b.phase - p0); }
  assert.ok(Math.max(...perMinute) - Math.min(...perMinute) > 0.3, `every minute ran ${perMinute.map((x) => x.toFixed(2)).join(', ')} breaths`);
});

test('breaths vary in depth and stay bounded', () => {
  const b = createBreath({ rand: mulberry32(6) });
  const peaks = [];
  let prev = -2, rising = false;
  for (let i = 0; i < 120 * FPS; i++) {
    const v = b.step(DT, 0.3);
    assert.ok(Math.abs(v) <= 1.2 + 1e-9);
    if (v < prev && rising) peaks.push(prev);
    rising = v > prev; prev = v;
  }
  // the first "peak" is only where the run started, part way through a breath
  const full = peaks.slice(1);
  assert.ok(full.length > 10);
  assert.ok(Math.max(...full) - Math.min(...full) > 0.1, 'every breath was the same depth');
});

// ── Weight ──────────────────────────────────────────────────────────────────
test('at rest her weight holds a leg for seconds, shifts in about a second, and never metronomes', () => {
  const w = createWeightShift({ rand: mulberry32(4) });
  const xs = [];
  const targets = [];
  let lastT = w.target, lastChange = 0;
  const holds = [];
  for (let i = 0; i < 300 * FPS; i++) {
    xs.push(w.step(DT));
    if (w.target !== lastT) { holds.push(i * DT - lastChange); lastChange = i * DT; lastT = w.target; targets.push(w.target); }
  }
  for (const x of xs) assert.ok(Math.abs(x) <= 1.05, `weight ${x}`);
  for (const h of holds.slice(1)) assert.ok(h >= WEIGHT.holdMin - DT && h <= WEIGHT.holdMax + DT, `held ${h}s`);
  assert.ok(sd(holds.slice(1)) > 0.8, 'every hold was the same length');
  assert.ok(targets.includes(0), 'she never stood square');
  // a shift is mostly done within about a second and a half
  const w2 = createWeightShift({ rand: mulberry32(4) });
  let i = 0; const from = w2.target;
  while (w2.target === from) { w2.step(DT); i++; }
  const to = w2.target; const start = w2.step(0);
  let k = 0; while (Math.abs(w2.step(DT) - to) > 0.25 * Math.abs(to - start) && k < 10 * FPS) k++;
  assert.ok(k * DT < 1.5, `a shift took ${k * DT}s`);
});

test('one seed makes one face: the four parts are independent streams', () => {
  const a = createFace(5), b = createFace(5), c = createFace(6);
  const run = (f) => { const out = []; for (let i = 0; i < 20 * FPS; i++) out.push([f.blink.step(DT), f.breath.step(DT, 0.2), f.weight.step(DT)].map((x) => x.toFixed(6)).join()); return out.join('|'); };
  assert.equal(run(a), run(b));
  assert.notEqual(run(createFace(5)), run(c));
});

test('the face module keeps its own clock: no wall clock and no Math.random', () => {
  const src = stripComments(readFileSync('public/newdesign/booth/noraFace.mjs', 'utf8'));
  for (const bad of ['Math.random', 'Date.now', 'performance.now', 'requestAnimationFrame']) assert.ok(!src.includes(bad), `noraFace.mjs uses ${bad}`);
});

// ── The performer reads them ────────────────────────────────────────────────
const PERF = stripComments(readFileSync('public/newdesign/booth/noraPerformer.mjs', 'utf8'));
const HOST = stripComments(readFileSync('public/newdesign/booth/noraBooth.mjs', 'utf8'));

test('the performer blinks, breathes, rests and looks through the face module, not a clock', () => {
  assert.ok(!/%\s*3700/.test(PERF), 'the 3.7-second blink cycle is back');
  assert.ok(!/Math\.sin\(t \* 1\.5\)/.test(PERF), 'the fixed 14-a-minute breath is back');
  assert.match(PERF, /this\.face\.blink\.step\(dt, \{ gazeShift: g\.big \}\)/);
  assert.match(PERF, /this\.face\.breath\.step\(dt, energy\)/);
  assert.match(PERF, /this\.face\.weight\.step\(dt\)/);
  assert.match(PERF, /this\.face\.gaze\.step\(dt, \{ eye: ew, want: lookW, idle: !!f\.idle \}\)/);
  // the eyes take the fixation (with its drift); the head is aimed at the fixation itself
  assert.match(PERF, /this\.lookTarget\.position\.set\(g\.gaze\.x, g\.gaze\.y, g\.gaze\.z\)/);
  assert.match(PERF, /const toL = this\._v\[1\]\.set\(g\.head\.x, g\.head\.y, g\.head\.z\)\.sub\(hw\)/);
});

test('with no beat she stands: no dip, no beat sway, no nod', () => {
  assert.match(PERF, /const dipRaw = groove \? 0\.5 \+ 0\.5 \* Math\.cos\(\(ph - 0\.07\) \* Math\.PI \* 2\) : 0;/);
  assert.match(PERF, /spring1\(sm\.sway, groove \? Math\.sin\(beat \* Math\.PI\) : rest,/);
  assert.match(PERF, /spring1\(sm\.nod, groove \? dip \*/);
  assert.match(PERF, /const groove = f\.groove !== false;/);
});

test('the booth says there is a beat only for the example set or a measured station grid', () => {
  // Read from the syntax tree, so a `groove = true` moved out of its branch is caught however the
  // braces around it are laid out.
  const ast = parse(readFileSync('public/newdesign/booth/noraBooth.mjs', 'utf8'), { sourceType: 'module' });
  const sets = [];
  const walk = (n, ifs) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && n.left.name === 'groove' && n.right.type === 'BooleanLiteral' && n.right.value) sets.push(ifs);
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      const v = n[k];
      const inner = n.type === 'IfStatement' && k === 'consequent' ? [...ifs, n.test] : ifs;
      if (Array.isArray(v)) v.forEach((c) => walk(c, inner)); else if (v && typeof v.type === 'string') walk(v, inner);
    }
  };
  walk(ast.program, []);
  assert.equal(sets.length, 2, `groove is set true in ${sets.length} places`);
  const src = (node) => readFileSync('public/newdesign/booth/noraBooth.mjs', 'utf8').slice(node.start, node.end);
  const guards = sets.map((ifs) => src(ifs[ifs.length - 1]));
  assert.deepEqual(guards.sort(), ['audio', 'measuredBpm && Number.isFinite(ph)'].sort(), `the beat is claimed under ${JSON.stringify(guards)}`);
  assert.match(HOST, /let groove = false;/);
  assert.match(HOST, /nora\.update\(dt, \{[^}]*groove, idle: !\(hands\.left \|\| hands\.right\) \}\)/);
});

// ── Hair ────────────────────────────────────────────────────────────────────
test('the hair is stepped in slices of at most 1/60 s, capped', () => {
  assert.equal(springSteps(0), 0);
  assert.equal(springSteps(-1), 0);
  assert.equal(springSteps(NaN), 0);
  assert.equal(springSteps(SPRING_STEP), 1);
  assert.equal(springSteps(1 / 60), 1);
  assert.equal(springSteps(1 / 30), 2);
  assert.equal(springSteps(0.1), 6);
  assert.equal(springSteps(5), SPRING_MAX_STEPS);
  for (let dt = 0.001; dt < 0.2; dt += 0.003) assert.ok(dt / springSteps(dt) <= SPRING_STEP + 1e-9 || springSteps(dt) === SPRING_MAX_STEPS);
});

test('the performer steps the hair separately and always restores the spring manager', () => {
  assert.match(PERF, /vrm\.springBoneManager = null;\s*try \{ vrm\.update\(dt\); \} finally \{ vrm\.springBoneManager = sbm; \}\s*for \(let i = 0; i < n; i\+\+\) sbm\.update\(dt \/ n\);/);
});

test('hair authored with no gravity is given some; anything authored is kept', () => {
  assert.equal(hairGravity('J_Sec_Hair1_01', 0), HAIR_GRAVITY);
  assert.equal(hairGravity('J_Sec_Hair3_04', undefined), HAIR_GRAVITY);
  assert.equal(hairGravity('hair_back', 0.25), 0.25, 'a model that authored its own keeps it');
  assert.equal(hairGravity('J_Sec_L_TopsUpperArmInside', 0), 0, 'a sleeve is not hair');
  assert.equal(hairGravity(null, 0), 0);
  assert.ok(HAIR_GRAVITY > 0 && HAIR_GRAVITY <= 1);
  assert.match(PERF, /j\.settings\.gravityPower = hairGravity\(j\.bone && j\.bone\.name, j\.settings\.gravityPower\)/);
});

test('the hair settles once, at the first posed frame, before anyone sees it', () => {
  assert.ok(HAIR_SETTLE_S >= 1, 'measured: the placeholder\u2019s hair takes about a second to fall');
  assert.match(PERF, /this\._hairSettled = false;/);
  // after the frame's own spring step, so it settles against the pose she is actually in
  assert.match(PERF, /if \(sbm && !this\._hairSettled\) \{\s*this\._hairSettled = true;\s*for \(let i = 0; i < Math\.round\(HAIR_SETTLE_S \/ SPRING_STEP\); i\+\+\) sbm\.update\(SPRING_STEP\);\s*\}/);
  const frame = PERF.indexOf('for (let i = 0; i < n; i++) sbm.update(dt / n);');
  const settle = PERF.indexOf('if (sbm && !this._hairSettled)');
  assert.ok(frame > 0 && settle > frame, 'the settle runs before the frame has posed her');
});

// ── Crowd eyes ──────────────────────────────────────────────────────────────
const PACK = decodeCrowdPack(readFileSync('public/nora/crowd.bin.txt', 'utf8'));

test('the crowd draws human eyes, sized from the distance between them', () => {
  const raw = PACK.header.face;
  const F = humanEyeFrame(raw);
  const ipd = Math.hypot(raw.L.c[0] - raw.R.c[0], raw.L.c[1] - raw.R.c[1], raw.L.c[2] - raw.R.c[2]);
  for (const k of ['L', 'R']) {
    const w = F[k].white, i = F[k].iris, b = F[k].brow;
    const width = w[1] - w[0], height = w[3] - w[2];
    assert.ok(Math.abs(width - 2 * HUMAN_EYE.halfWidth * ipd) < 1e-9);
    // an eye opening is about a third as tall as it is wide; the anime one measured 0.84
    assert.ok(height / width > 0.3 && height / width < 0.4, `opening ${height / width}`);
    assert.ok((raw[k].white[3] - raw[k].white[2]) / (raw[k].white[1] - raw[k].white[0]) > 0.6, 'the bake is no longer the anime sample: revisit this test');
    // the iris is a little taller than the opening, so the lids cover its top and bottom
    assert.ok(i[3] - i[2] > height && i[3] - i[2] < 1.4 * height);
    assert.ok(Math.abs((i[1] - i[0]) - (i[3] - i[2])) < 1e-12, 'a round iris');
    // the brow sits above the opening, closer than the anime one did
    assert.ok(b[2] > w[3], 'the brow overlaps the eye');
    assert.ok((b[2] + b[3]) / 2 < (raw[k].brow[2] + raw[k].brow[3]) / 2);
    assert.deepEqual(F[k].c, raw[k].c);
  }
  // mirror images
  assert.ok(Math.abs(F.L.white[0] + F.R.white[1]) < 1e-9 && Math.abs(F.L.white[1] + F.R.white[0]) < 1e-9);
});

test('no measured face, no drawn eyes', () => {
  assert.equal(humanEyeFrame(null), null);
  assert.equal(humanEyeFrame({}), null);
  assert.equal(humanEyeFrame({ L: { c: [0, 0, 0], white: [0, 1, 0, 1] }, R: { c: [0, 0, 0], white: [0, 1, 0, 1] } }), null, 'zero IPD');
});

test('the crowd shader reads the human frame, not the bake\'s', () => {
  const src = stripComments(readFileSync('public/newdesign/booth/crowdAvatars.mjs', 'utf8'));
  assert.match(src, /const F = humanEyeFrame\(header\.face\);/);
});

// ── The camera and the placeholder ──────────────────────────────────────────
test('an excluded shot never comes up in the automatic rotation, and can still be locked', () => {
  const d = new NoraDirector({ seed: 11, exclude: ['face'] });
  const seen = new Set();
  for (let bar = 0; bar < 4000; bar++) { const id = d._pick(bar); seen.add(id); d._cut(id, bar, bar, false); }
  assert.ok(!seen.has('face'));
  assert.ok(SHOT_IDS.filter((id) => id !== 'face' && id !== 'screen').every((id) => seen.has(id)), 'the rest of the rotation still plays');
  const all = new NoraDirector({ seed: 11 });
  const seenAll = new Set();
  for (let bar = 0; bar < 4000; bar++) { const id = all._pick(bar); seenAll.add(id); all._cut(id, bar, bar, false); }
  assert.ok(seenAll.has('face'), 'with nothing excluded the close-up plays');
  d.setMode('face', 0, 0);
  assert.equal(d.shot, 'face');
});

test('the placeholder model never takes the full-face close-up, on either page', () => {
  if (/placeholder/i.test(NORA_MODEL.path)) assert.equal(NORA_MODEL.portrait, false);
  assert.match(HOST, /exclude: portrait \? \[\] : \['face'\]/);
  const app = stripComments(readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx', 'utf8'));
  const web = stripComments(readFileSync('public/newdesign/radio.jsx', 'utf8'));
  assert.match(app, /portrait: NORA_MODEL\.portrait/);
  assert.match(app, /modelUrl: `\$\{import\.meta\.env\.BASE_URL\}\$\{NORA_MODEL\.path\}`/);
  assert.match(web, /portrait: S\.NORA_MODEL\.portrait/);
  assert.match(web, /modelUrl: "\/" \+ S\.NORA_MODEL\.path/);
  for (const src of [app, web]) assert.ok(!/placeholder\.vrm/.test(src), 'a page names the model file itself');
});

test('a crowd eye is not self-lit across the room', () => {
  const src = readFileSync('public/newdesign/booth/crowdAvatars.mjs', 'utf8');
  const m = /totalEmissiveRadiance \+= vec3\(([\d.]+), ([\d.]+), ([\d.]+)\) \* gCatch/.exec(src);
  assert.ok(m, 'the catch-light term is gone or renamed: re-read the crowd shader');
  for (const c of m.slice(1)) assert.ok(+c <= 0.03, `the catch-light glows at ${c}`);
});

test('the model\'s anime eye-white geometry is painted as skin, not white', () => {
  const src = readFileSync('public/newdesign/booth/crowdAvatars.mjs', 'utf8');
  assert.equal(PACK.header.parts.WHITE, 4, 'the bake renumbered its parts: re-read the crowd shader');
  assert.match(src, /P == 4 \? skin \* 0\.72 :/);
});
