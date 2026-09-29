// trackAnalysis — measured against synthetic house tracks whose answers are KNOWN.
//
// The owner's tracks (Higgsfield-generated, listed in marketing/shape-radio-launch-cut.md)
// cannot be downloaded in this container, and a prompted BPM is not a truth anyway — the
// records measured every one of them off its prompt. So every claim here is proven against a
// fixture synthesised in pure JS with a known tempo, a known sub-sample downbeat and a known
// arrangement: sine-sweep kicks with a click, noise hats on offbeats and swung 16ths, a clap on
// 2 and 4, a sub-bass line (offbeat, or ROLLING with its onset weight at phase 0.75 — the
// bassline that drags a naive phase estimate), pads, kick-less intros / breakdowns / outros, a
// filtered build (no kick, rising noise) and fades.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeTrack, bufferWaveform, _internal as I } from '../src/trackAnalysis.mjs';
import { planTransition, mixState } from '../src/noraMix.mjs';

// ── The fixture generator ─────────────────────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * makeFixture(spec) → { channels, sampleRate, truth }
 * spec: bpm, seconds, downbeat (s, time of bar 0 beat 1, may be sub-sample), sr=44100,
 *   stereo=true, seed=1, introBars=0 (kick-less), breakdowns=[[a,b)], build=[a,b) (inside a
 *   breakdown: rising filtered noise), outroBars=0 (kick-less, at the end), fadeBars=0 (a
 *   linear fade over the last bars, kick still in), fills=[] (1-bar kick drops), swing=0.5, clap=true, hats=true,
 *   bass='offbeat'|'rolling'|'none', pads=true, kick=true, kickHz=50, bars (arrangement
 *   length; default = the whole bars that fit), padsOnly=false (no-rhythm fixture).
 */
export function makeFixture(spec) {
  const o = { sr: 44100, stereo: true, seed: 1, introBars: 0, breakdowns: [], build: null, outroBars: 0, fadeBars: 0,
    swing: 0.5, clap: true, hats: true, bass: 'offbeat', pads: true, kick: true, kickHz: 50, padsOnly: false, ...spec };
  const sr = o.sr, beat = 60 / o.bpm, bar = 4 * beat, s16 = beat / 4;
  const N = Math.round(o.seconds * sr);
  const mono = new Float32Array(N), side = new Float32Array(N), bassBus = new Float32Array(N);
  const R = mulberry32(o.seed * 7919 + 17);
  const T0 = o.downbeat;
  const bars = o.bars != null ? o.bars : Math.floor((o.seconds - T0) / bar + 1e-9);
  const inRange = (b, r) => r && b >= r[0] && b < r[1];
  const fills = o.fills || [];                 // 1-bar kick drops: not breakdowns (< 2 bars)
  const kickless = (b) => b < o.introBars || fills.includes(b) || o.breakdowns.some((r) => inRange(b, r)) || b >= bars - o.outroBars || !o.kick;
  const bassOn = (b) => !kickless(b);

  // additive voice writers (exact event times; t ≥ 0 only, so onsets are sub-sample exact)
  function write(buf, tEv, len, fn) {
    const a = Math.max(0, Math.ceil(tEv * sr)), b = Math.min(N, Math.ceil((tEv + len) * sr));
    for (let i = a; i < b; i++) buf[i] += fn(i / sr - tEv, i);
  }
  const noiseArr = new Float32Array(sr * 2);
  for (let i = 0; i < noiseArr.length; i++) noiseArr[i] = R() * 2 - 1;
  const noiseAt = (i, salt) => noiseArr[(i * 7 + salt * 104729) % noiseArr.length];

  function kick(t, vel) {
    const f0 = o.kickHz, f1 = 3.8 * o.kickHz, tf = 0.022, ta = 0.14;
    write(mono, t, 0.5, (u) => {
      const ph = 2 * Math.PI * (f0 * u + (f1 - f0) * tf * (1 - Math.exp(-u / tf)));
      const env = Math.min(1, u / 0.0006) * Math.exp(-u / ta);
      return 0.85 * vel * env * Math.sin(ph);
    });
    const salt = Math.floor(t * 1000);
    write(mono, t, 0.0015, (u, i) => 0.18 * vel * (noiseAt(i, salt) - noiseAt(i + 1, salt)) * (1 - u / 0.0015));
  }
  function hat(t, vel, open) {
    const tau = open ? 0.05 : 0.011, len = open ? 0.25 : 0.06, salt = Math.floor(t * 997);
    write(mono, t, len, (u, i) => 0.07 * vel * (noiseAt(i, salt) - noiseAt(i - 1, salt)) * Math.exp(-u / tau));
    write(side, t, len, (u, i) => 0.03 * vel * (noiseAt(i, salt + 3) - noiseAt(i - 1, salt + 3)) * Math.exp(-u / tau));
  }
  function clap(t) {
    // band-passed noise ≈ 1.3 kHz, three bursts and a tail
    const w = 2 * Math.PI * 1300 / sr, al = Math.sin(w) / 2, n0 = 1 + al;
    const b0 = al / n0, b2 = -al / n0, a1 = -2 * Math.cos(w) / n0, a2 = (1 - al) / n0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const salt = Math.floor(t * 331);
    write(mono, t, 0.25, (u, i) => {
      const x = noiseAt(i, salt);
      const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      const burst = u < 0.022 ? (u % 0.0105 < 0.004 ? 1 : 0.35) : Math.exp(-(u - 0.022) / 0.045);
      return 0.5 * y * burst;
    });
  }
  const BASS_NOTES = [55, 65.41, 49, 58.27];
  function bassNote(t, f, len, amp, atk, bus) {
    write(bus || bassBus, t, len + 0.02, (u) => {
      const env = Math.min(1, u / atk) * (u > len ? Math.max(0, 1 - (u - len) / 0.01) : 1);
      return amp * env * (Math.sin(2 * Math.PI * f * u) + 0.25 * Math.sin(4 * Math.PI * f * u));
    });
  }
  const saw = (x) => 2 * (x - Math.floor(x + 0.5));
  function pad(t, freqs, len, amp, atk) {
    let lp = 0;
    const c = 1 - Math.exp(-2 * Math.PI * 1400 / sr);
    write(mono, t, len + 0.4, (u) => {
      let v = 0;
      for (const f of freqs) v += saw(f * u) + saw(f * 1.004 * u + 0.3);
      lp += c * (v - lp);
      const env = Math.min(1, u / atk) * (u > len ? Math.max(0, 1 - (u - len) / 0.4) : 1);
      return amp * env * lp;
    });
  }

  const duck = []; // kick times, for the legato sub's sidechain
  if (o.padsOnly) {
    // no rhythm: slow chords at irregular times with a low voice, a slow LFO, soft swells
    let t = 0.2 + R() * 0.8;
    const chords = [[130.8, 155.6, 196], [116.5, 146.8, 174.6], [103.8, 130.8, 155.6], [98, 123.5, 146.8]];
    while (t < o.seconds) {
      const len = 2.3 + R() * 2.6;
      const ch = chords[Math.floor(R() * chords.length)];
      pad(t, ch, len, 0.05, 0.6 + R() * 0.6);
      bassNote(t, ch[0] / 2, len, 0.12, 0.7, mono);
      t += len;
    }
    for (let i = 0; i < N; i++) mono[i] *= 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.071 * (i / sr) + 1.3);
  } else {
    for (let b = 0; b < bars; b++) {
      const tb = T0 + b * bar;
      const kl = kickless(b);
      const inBuild = inRange(b, o.build);
      if (o.pads && b % 2 === 0) {
        const ch = [[261.6, 311.1, 392], [233.1, 293.7, 349.2]][(b / 2) % 2];
        pad(tb, ch, 2 * bar, 0.035, 0.25);
      }
      for (let q = 0; q < 4; q++) {
        const tq = tb + q * beat;
        if (!kl) { kick(tq, o.kickVel || 1); duck.push(tq); }
        if (o.clap && !kl && (q === 1 || q === 3)) clap(tq);
        if (o.hats && !inBuild) {
          const sw = (o.swing - 0.5) * 2 * s16;
          hat(tq + 2 * s16, 1, true);                 // offbeat open hat
          hat(tq, 0.5, false);
          hat(tq + s16 + sw, 0.7, false);             // swung 16ths
          hat(tq + 3 * s16 + sw, 0.7, false);
        }
        if (bassOn(b)) {
          const f = BASS_NOTES[(b + (q >> 1)) % BASS_NOTES.length];
          if (o.bass === 'offbeat') bassNote(tq + 2 * s16, f, 0.4 * beat, 0.3, 0.003);
          else if (o.bass === 'legato') {
            // a continuous sub that changes note on the offbeat and is sidechain-ducked under
            // every kick (to 30 % for 60 ms) — the envelope barely rises at the kick
            bassNote(tq + 2 * s16, f, 2 * s16, o.bassAmp || 0.45, 0.004);
            bassNote(tq, BASS_NOTES[(b + ((q + 3) >> 1)) % BASS_NOTES.length], 2 * s16, o.bassAmp || 0.45, 0.004);
          } else if (o.bass === 'rolling') {
            bassNote(tq + s16, f, 0.18 * beat, 0.15, 0.002);
            bassNote(tq + 3 * s16, f * 1.5 > 90 ? f : f * 1.5, 0.2 * beat, 0.42, 0.0015);
          }
        }
      }
      if (inBuild) {
        // a filtered build: noise rising in level and brightness across the build bars
        const bs = o.build[0], be = o.build[1];
        let lp = 0;
        write(mono, tb, bar, (u, i) => {
          const p = (b - bs + u / bar) / (be - bs);
          const cut = 300 * Math.pow(8000 / 300, p);
          const c = 1 - Math.exp(-2 * Math.PI * cut / sr);
          lp += c * (noiseAt(i, 77) - lp);
          return 0.25 * Math.pow(10, (-36 + 30 * p) / 20) * lp * 4;
        });
      }
    }
    // The bass bus joins the mix; a LEGATO sub is sidechain-ducked to 30 % under every kick
    // (fast duck just before the kick, 60 ms recovery) — so at a kick the low band's envelope
    // barely rises: the hard case for a kick detector.
    let di = 0;
    for (let i = 0; i < N; i++) {
      let g = 1;
      if (o.bass === 'legato') {
        const t = i / sr;
        while (di + 1 < duck.length && duck[di + 1] <= t + 0.002) di++;
        const u = duck.length ? t - duck[di] : -1;
        if (u >= -0.002) g = 1 - 0.7 * (u < 0 ? 1 : Math.exp(-u / 0.06));
      }
      mono[i] += g * bassBus[i];
    }
    if (o.fadeBars > 0) {
      const tf = T0 + (bars - o.fadeBars) * bar, te = T0 + bars * bar;
      for (let i = Math.floor(tf * sr); i < N; i++) {
        const g = Math.max(0, 1 - (i / sr - tf) / (te - tf));
        mono[i] *= g; side[i] *= g;
      }
    }
  }
  const channels = o.stereo ? [new Float32Array(N), new Float32Array(N)] : [mono];
  if (o.stereo) for (let i = 0; i < N; i++) { channels[0][i] = mono[i] + side[i]; channels[1][i] = mono[i] - side[i]; }
  const breakdowns = o.breakdowns.map(([a, b]) => ({ startBar: a, endBar: b }));
  const firstKickBar = o.introBars;
  const kickEnd = bars - o.outroBars;
  const outroBar = o.fadeBars > 0 ? Math.min(kickEnd, bars - o.fadeBars) : kickEnd;
  return {
    channels, sampleRate: sr,
    truth: { bpm: o.bpm, downbeatSec: T0, lengthBars: Math.floor((o.seconds - T0) / bar + 1e-9), firstKickBar, breakdowns, outroBar, bars },
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────────────────
const SR = 44100;
const frac = (s) => s / SR;                  // a sub-sample offset, in seconds
const timed = (fn) => { const a = process.hrtime.bigint(); const r = fn(); return [r, Number(process.hrtime.bigint() - a) / 1e6]; };
const log = (...a) => console.log('   ·', ...a);
const fresh = (fx) => fx.channels.map((c) => Float32Array.from(c));   // new arrays: defeats the band cache

// The 8 tempo fixtures: each one a different mix of the hard parts.
const TEMPO_FIXTURES = [
  { name: '100.0 mono, offbeat bass', bpm: 100.0, seconds: 60, downbeat: 0.0412 + frac(0.37), stereo: false, seed: 1 },
  { name: '118.5 swing + rolling bass', bpm: 118.5, seconds: 60, downbeat: 0.2317 + frac(0.81), swing: 0.58, bass: 'rolling', seed: 2 },
  { name: '120.0 kick-less intro + breakdown', bpm: 120.0, seconds: 60, downbeat: 0.0063 + frac(0.5), introBars: 4, breakdowns: [[12, 16]], seed: 3 },
  { name: '121.7 48 kHz, filtered build', bpm: 121.7, seconds: 60, downbeat: 0.5555 + 0.29 / 48000, sr: 48000, breakdowns: [[16, 22]], build: [18, 22], seed: 4 },
  { name: '124.0 fade-out', bpm: 124.0, seconds: 60, downbeat: 0.1234 + frac(0.12), fadeBars: 8, seed: 5 },
  { name: '126.3 kick-less outro, rolling bass', bpm: 126.3, seconds: 60, downbeat: 0.8791 + frac(0.66), outroBars: 8, bass: 'rolling', seed: 6 },
  { name: '128.0 rolling bass, swing, no clap, 1-bar fills', bpm: 128.0, seconds: 60, downbeat: 0.0009 + frac(0.93), swing: 0.56, bass: 'rolling', clap: false, fills: [11, 23], seed: 7 },
  { name: '137.9 32 s, no pads', bpm: 137.9, seconds: 32, downbeat: 0.3001 + frac(0.21), pads: false, seed: 8 },
];
const cache = new Map();
function measured(spec, opts) {
  const key = spec.name + JSON.stringify(opts || {});
  if (!cache.has(key)) {
    const fx = cache.get(spec.name + '#fx') || makeFixture(spec);
    cache.set(spec.name + '#fx', fx);
    const [meta, ms] = timed(() => analyzeTrack(fx.channels, fx.sampleRate, opts));
    cache.set(key, { fx, meta, ms });
  }
  return cache.get(key);
}
const dbErrMs = (m, fx) => (m.downbeatSec - fx.truth.downbeatSec) * 1000;

// ── tempo + grid ──────────────────────────────────────────────────────────────────────────
test('bpm within ±0.05 of truth on all 8 fixtures (100.0 … 137.9)', () => {
  const bpms = TEMPO_FIXTURES.map((f) => f.bpm);
  assert.deepEqual(bpms, [100.0, 118.5, 120.0, 121.7, 124.0, 126.3, 128.0, 137.9]);
  for (const spec of TEMPO_FIXTURES) {
    const { meta } = measured(spec);
    log(`${spec.name}: bpm ${meta.bpm} (fit ${meta.bpmPrecise}, err ${(meta.bpmPrecise - spec.bpm).toFixed(4)}; halves ${meta.halvesBpm}; residual ${meta.residualMs} ms over ${meta.beatsFit} beats)`);
    assert.ok(meta.bpm != null, `${spec.name}: no tempo (${meta.reason})`);
    assert.ok(Math.abs(meta.bpm - spec.bpm) <= 0.05, `${spec.name}: bpm ${meta.bpm} vs ${spec.bpm}`);
    assert.equal(meta.beatSec, 60 / meta.bpm);
  }
});

test('downbeatSec within ±8 ms of the true sub-sample downbeat on all 8 fixtures', () => {
  for (const spec of TEMPO_FIXTURES) {
    const { fx, meta } = measured(spec);
    const e = dbErrMs(meta, fx);
    log(`${spec.name}: downbeat ${meta.downbeatSec} s, truth ${fx.truth.downbeatSec.toFixed(6)} s, err ${e.toFixed(3)} ms`);
    assert.ok(Math.abs(e) <= 8, `${spec.name}: downbeat off by ${e.toFixed(2)} ms`);
  }
});

test('the rolling bassline really is adversarial (onset weight at phase 0.75), and the grid still holds', () => {
  // guard the guard: if the fixture stopped putting weight at 0.75 the downbeat test above would
  // prove nothing about it. Measured on the fast kick-band envelope.
  const spec = TEMPO_FIXTURES[1];
  const { fx, meta } = measured(spec);
  const K = I.kickEnvelope(I.bandFrames(fx.channels, fx.sampleRate));
  const pk = I.onsetPeaks(K, 'fast');
  const beat = 60 / spec.bpm, h = new Array(8).fill(0);
  for (const p of pk) h[Math.round(((((p.t - spec.downbeat) / beat) % 1) + 1) % 1 * 8) % 8] += p.d;
  const w075 = h[6] / h[0];
  const naive = I.resultant(pk, beat).phase;
  let naiveErr = naive - (spec.downbeat % beat);
  if (naiveErr > beat / 2) naiveErr -= beat;
  log(`onset weight at phase 0.75 = ${w075.toFixed(2)} × the on-beat weight; a naive resultant phase would be off ${(naiveErr * 1000).toFixed(1)} ms; the fitted downbeat is off ${dbErrMs(meta, fx).toFixed(2)} ms`);
  assert.ok(w075 >= 0.5, 'the fixture must put real onset weight at phase 0.75');
  assert.ok(Math.abs(naiveErr) > 0.02, 'a naive phase estimate must be visibly dragged');
  assert.ok(Math.abs(dbErrMs(meta, fx)) <= 8);
});

test('confidence ≥ 0.8 on every clean fixture', () => {
  for (const spec of TEMPO_FIXTURES) {
    const { meta } = measured(spec);
    assert.ok(meta.confidence >= 0.8, `${spec.name}: confidence ${meta.confidence}`);
  }
  log('confidence:', TEMPO_FIXTURES.map((s) => measured(s).meta.confidence).join(' '));
});

test('octave guard: every fixture over a 60–240 BPM range returns the same tempo', () => {
  for (const spec of TEMPO_FIXTURES) {
    const { fx, meta } = measured(spec, { bpmMin: 60, bpmMax: 240 });
    assert.ok(meta.bpm != null && Math.abs(meta.bpm - spec.bpm) <= 0.05, `${spec.name}: ${meta.bpm} over 60–240`);
    assert.ok(Math.abs(dbErrMs(meta, fx)) <= 8);
  }
  // and a range that holds only the double (half-time reading) must not invent it from a subdivision
  const spec = TEMPO_FIXTURES[2];
  const { meta } = measured(spec, { bpmMin: 200, bpmMax: 260 });
  log(`120 BPM fixture over 200–260: ${meta.bpm === null ? 'refused (' + meta.reason + ')' : meta.bpm}`);
  assert.ok(meta.bpm === null || Math.abs(meta.bpm - 240) <= 0.1, 'only the true double may be reported');
});

// ── structure ─────────────────────────────────────────────────────────────────────────────
test('firstKickBar, breakdowns and outroBar exact to the bar; lengthBars and per-bar arrays', () => {
  for (const spec of TEMPO_FIXTURES) {
    const { fx, meta } = measured(spec);
    const t = fx.truth;
    log(`${spec.name}: firstKickBar ${meta.firstKickBar}/${t.firstKickBar} breakdowns ${JSON.stringify(meta.breakdowns)} outroBar ${meta.outroBar}/${t.outroBar} lengthBars ${meta.lengthBars}/${t.lengthBars}`);
    assert.equal(meta.lengthBars, t.lengthBars, spec.name);
    assert.equal(meta.firstKickBar, t.firstKickBar, spec.name);
    assert.deepEqual(meta.breakdowns, t.breakdowns, spec.name);
    assert.equal(meta.outroBar, t.outroBar, spec.name);
    assert.equal(meta.kickByBar.length, meta.lengthBars);
    assert.equal(meta.energyByBar.length, meta.lengthBars);
    for (const v of [...meta.kickByBar, ...meta.energyByBar]) assert.ok(v >= 0 && v <= 1);
    // the kick is on where the fixture plays it and off where it does not
    const kickless = (b) => b < t.firstKickBar || (spec.fills || []).includes(b) || b >= (spec.outroBars ? t.bars - spec.outroBars : Infinity) || t.breakdowns.some((r) => b >= r.startBar && b < r.endBar);
    for (let b = 0; b < meta.lengthBars; b++) {
      if (kickless(b)) assert.ok(meta.kickByBar[b] < 0.15, `${spec.name}: bar ${b} kick ${meta.kickByBar[b]} in a kick-less bar`);
      else if (!(spec.fadeBars && b >= t.bars - spec.fadeBars)) assert.ok(meta.kickByBar[b] >= 0.7, `${spec.name}: bar ${b} kick ${meta.kickByBar[b]}`);
    }
  }
});

test('a filtered build (no kick, rising noise) invents no kick', () => {
  const spec = TEMPO_FIXTURES[3];
  const { meta } = measured(spec);
  const build = meta.kickByBar.slice(18, 22);
  log(`kickByBar across the build (bars 18–21): ${build.join(' ')}; energyByBar: ${meta.energyByBar.slice(16, 23).join(' ')}`);
  for (const v of build) assert.ok(v < 0.1);
  // the build does rise (so it is a real test): its last bar is louder than its first
  assert.ok(meta.energyByBar[21] > meta.energyByBar[18] * 1.5);
});

test('a pad-only fixture (no rhythm) is refused: bpm null, confidence < 0.5 — over 6 seeds', () => {
  for (const seed of [11, 12, 13, 17, 20, 23]) {
    const fx = makeFixture({ bpm: 120, seconds: 60, downbeat: 0.1, padsOnly: true, seed, stereo: seed % 2 === 0 });
    const meta = analyzeTrack(fx.channels, fx.sampleRate);
    log(`pads seed ${seed}: bpm ${meta.bpm}, confidence ${meta.confidence}, reason ${meta.reason}`);
    assert.equal(meta.bpm, null);
    assert.ok(meta.confidence < 0.5);
    assert.equal(meta.downbeatSec, null);
    assert.equal(typeof meta.reason, 'string');
    assert.deepEqual(meta.kickByBar, []);
  }
});

test('a sub-bass louder than the kick is refused, never mis-gridded', () => {
  // A sidechained legato sub at 1.5–1.8× the kick: at the kick the low band's envelope FALLS
  // (the duck outweighs the kick) and there is no kick-band transient to measure.
  for (const [amp, vel, seed] of [[0.7, 0.6, 32], [0.9, 0.5, 33]]) {
    const fx = makeFixture({ bpm: 123, seconds: 60, downbeat: 0.21, bass: 'legato', bassAmp: amp, kickVel: vel, seed });
    const meta = analyzeTrack(fx.channels, fx.sampleRate);
    log(`legato sub ${amp} vs kick ${vel}: bpm ${meta.bpm}, confidence ${meta.confidence}, reason ${meta.reason}`);
    if (meta.bpm != null) {
      assert.ok(Math.abs(meta.bpm - 123) <= 0.05 && Math.abs(dbErrMs(meta, fx)) <= 8, 'a reported grid must be right');
    } else assert.ok(meta.confidence < 0.5);
  }
  // and a sidechained legato sub at half the kick is measured
  const fx = makeFixture({ bpm: 123, seconds: 60, downbeat: 0.21, bass: 'legato', seed: 31 });
  const meta = analyzeTrack(fx.channels, fx.sampleRate);
  log(`legato sub 0.45 vs kick 0.85: bpm ${meta.bpm}, downbeat err ${dbErrMs(meta, fx).toFixed(2)} ms, confidence ${meta.confidence}`);
  assert.ok(Math.abs(meta.bpm - 123) <= 0.05 && Math.abs(dbErrMs(meta, fx)) <= 8);
});

// ── mix points ────────────────────────────────────────────────────────────────────────────
test('mixOutBar: 60 s at 122 BPM with an 8-bar outro — the noraMix out-fade (L = 16) is over before outroBar + 1', () => {
  const fx = makeFixture({ bpm: 122, seconds: 60, downbeat: 0.0731 + frac(0.4), outroBars: 8, seed: 21 });
  const meta = analyzeTrack(fx.channels, fx.sampleRate);
  assert.equal(meta.outroBar, fx.truth.outroBar);
  const L = 16, m = meta.mixOutBar, from = 0, to = 1;
  const plan = planTransition({ fromDeck: from, toDeck: to, startBar: m, lengthBars: L });
  // walk the plan: the outgoing fader is full at the blend's bar 0 and reaches 0 by m + L …
  assert.equal(mixState(plan, m).ch[from].fader, 1);
  let zeroAt = null;
  for (let bar = m; bar <= meta.outroBar + 1; bar += 1 / 64) {
    const f = mixState(plan, bar).ch[from].fader;
    if (f === 0 && zeroAt == null) zeroAt = bar;
    if (zeroAt != null) assert.equal(f, 0, `the outgoing fader came back up at bar ${bar}`);
  }
  const stopBar = plan.stopBar != null ? plan.stopBar : m + L + 0.25;
  log(`outroBar ${meta.outroBar}, mixOutBar ${m} (phraseOffset ${meta.phraseOffset}, fits ${meta.mixOutFits}); outgoing fader 0 at bar ${zeroAt}, deck stopped at ${stopBar} ≤ ${meta.outroBar + 1}; outgoing kick at the blend start ${meta.kickByBar[m]}`);
  assert.ok(zeroAt != null && zeroAt <= m + L + 1e-9);
  assert.ok(stopBar <= meta.outroBar + 1 + 1e-9, 'the whole out-fade and the stop land before outroBar + 1');
  // phrase-aligned, and the LATEST phrase that fits (the outgoing plays as long as it can)
  assert.equal((m - meta.phraseOffset) % 4, 0);
  assert.equal(meta.phraseOffset, 0);
  assert.ok(m + 4 + L + 0.25 > meta.outroBar + 1, 'a later phrase would have fitted');
  assert.equal(meta.mixOutFits, true);
  // the outgoing track is full when the blend starts
  assert.ok(meta.kickByBar[m] >= 0.7);
});

test('mixInFromBar: a 32 s track with an 8 s kick-less intro starts at its first kick phrase', () => {
  // the shape of the v3 pick (t3): 119.45 BPM, phase 0.030 s, pads for 8 s, kick at beat 16
  const fx = makeFixture({ bpm: 119.45, seconds: 32.023, downbeat: 0.030, introBars: 4, seed: 22 });
  const meta = analyzeTrack(fx.channels, fx.sampleRate);
  const kickAt = meta.downbeatSec + meta.firstKickBar * 4 * meta.beatSec;
  log(`bpm ${meta.bpm}, downbeat ${meta.downbeatSec} (err ${dbErrMs(meta, fx).toFixed(2)} ms), firstKickBar ${meta.firstKickBar} (kick at ${kickAt.toFixed(4)} s), mixInFromBar ${meta.mixInFromBar}, lengthBars ${meta.lengthBars}, mixOutBar ${meta.mixOutBar} fits ${meta.mixOutFits}`);
  assert.ok(Math.abs(meta.bpm - 119.45) <= 0.05);
  assert.ok(Math.abs(dbErrMs(meta, fx)) <= 8, 'bar 0 is the extrapolated grid beat just after 0 s');
  assert.equal(meta.firstKickBar, 4);
  assert.equal(meta.mixInFromBar, 4);
  assert.ok(Math.abs(kickAt - (0.030 + 16 * 60 / 119.45)) < 0.008, 'the first kick bar is the 8 s kick');
  // 15 bars cannot host a 16-bar blend, and the meta says so rather than pretending
  assert.equal(meta.mixOutFits, false);
});

// ── waveform ─────────────────────────────────────────────────────────────────────────────
test('bufferWaveform: lengthBars × 16 entries, 0..1, and the low band peaks on the beats', () => {
  for (const spec of [TEMPO_FIXTURES[0], TEMPO_FIXTURES[1], TEMPO_FIXTURES[4]]) {
    const { fx, meta } = measured(spec);
    const [wf, ms] = timed(() => bufferWaveform(fx.channels, fx.sampleRate, meta));
    assert.equal(wf.length, meta.lengthBars * 16);
    let onBeat = 0, beats = 0, lowMax = 0;
    for (const c of wf) {
      for (const k of ['low', 'mid', 'high']) assert.ok(c[k] >= 0 && c[k] <= 1);
      lowMax = Math.max(lowMax, c.low);
    }
    let offClipped = 0, offCols = 0;
    for (let b = 0; b < meta.lengthBars; b++) {
      if (meta.kickByBar[b] < 0.7) continue;
      for (let q = 0; q < 4; q++) {
        const i = (b * 4 + q) * 4, sl = wf.slice(i, i + 4).map((x) => x.low);
        beats++; if (sl.indexOf(Math.max(...sl)) === 0) onBeat++;
        for (let j = 1; j < 4; j++) { offCols++; if (sl[j] >= 0.999) offClipped++; }
      }
    }
    // normalised to the LOUDEST kick: the kicks reach 1 and NOTHING between them is clipped.
    // (Identical synthetic kicks tie at the 99.5th percentile, so several percent of all columns
    // legitimately read 1 — every one of them a beat. Scaling by the mean instead clips 24–116
    // off-beat 16ths on these three fixtures and 31–50 % of all columns; measured.)
    const sat = wf.filter((c) => c.low >= 0.999).length / wf.length;
    log(`${spec.name}: ${wf.length} columns in ${ms.toFixed(1)} ms (bands cached), low peaks on the beat in ${onBeat}/${beats} kicked beats, loudest low ${lowMax}, ${(sat * 100).toFixed(2)} % of columns at 1, off-beat 16ths clipped ${offClipped}/${offCols}`);
    assert.ok(onBeat / beats >= 0.95);
    assert.equal(lowMax, 1);
    assert.equal(offClipped, 0, 'the low band is scaled to the loudest kick: no off-beat 16th saturates');
    assert.ok(sat <= 0.25, 'only beat columns may read 1');
  }
  // no grid → a time-based fallback, 8 columns a second
  const fx = makeFixture({ bpm: 120, seconds: 20, downbeat: 0.1, padsOnly: true, seed: 5 });
  const wf = bufferWaveform(fx.channels, fx.sampleRate, analyzeTrack(fx.channels, fx.sampleRate));
  assert.equal(wf.length, 160);
});

// ── contract hygiene ──────────────────────────────────────────────────────────────────────
test('deterministic, pure, and validated', () => {
  const spec = TEMPO_FIXTURES[5];
  const { fx, meta } = measured(spec);
  const again = analyzeTrack(fresh(fx), fx.sampleRate);          // cold, no cache
  assert.deepEqual(again, meta);
  const src = readFileSync(new URL('../src/trackAnalysis.mjs', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  for (const bad of ['Math.random', 'Date.now', 'performance.now', 'window.', 'document.', 'AudioContext', 'import ']) {
    assert.ok(!src.includes(bad), `trackAnalysis.mjs must not use ${bad}`);
  }
  assert.throws(() => analyzeTrack([], 44100), TypeError);
  assert.throws(() => analyzeTrack([new Float32Array(10), new Float32Array(9)], 44100), RangeError);
  assert.throws(() => analyzeTrack([new Float64Array(10)], 44100), TypeError);
  assert.throws(() => analyzeTrack([new Float32Array(10)], 0), RangeError);
  assert.throws(() => analyzeTrack(fx.channels, fx.sampleRate, { bpmMin: 140, bpmMax: 100 }), RangeError);
  const short = analyzeTrack([new Float32Array(44100 * 3)], 44100);
  assert.equal(short.bpm, null);
  assert.equal(short.reason, 'too-short');
});

test('performance: a 60 s stereo 44.1 kHz track is analysed well under 1 s', () => {
  const fx = measured(TEMPO_FIXTURES[4]).fx;
  const runs = [];
  for (let r = 0; r < 5; r++) runs.push(timed(() => analyzeTrack(fresh(fx), fx.sampleRate))[1]);
  runs.sort((a, b) => a - b);
  const [, wms] = timed(() => bufferWaveform(fresh(fx), fx.sampleRate, measured(TEMPO_FIXTURES[4]).meta));
  log(`analyzeTrack, cold, 60 s stereo: median ${runs[2].toFixed(1)} ms (min ${runs[0].toFixed(1)}, max ${runs[4].toFixed(1)}); bufferWaveform cold ${wms.toFixed(1)} ms`);
  assert.ok(runs[2] < 400, `median ${runs[2]} ms`);
});
