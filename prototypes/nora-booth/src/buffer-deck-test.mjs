// buffer-deck-test.mjs — proves deckAudio.mjs BUFFER DECKS on rendered audio (OfflineAudioContext).
//
// Fixtures are synthesized here with KNOWN answers (the owned Shape Radio files cannot be fetched
// in this container). Every click-fixture kick is a step-attack 55 Hz burst whose AMPLITUDE
// encodes where it is: downbeats 0.40 + 0.03·(bar mod 16), other beats 0.22 — so a detected
// onset tells us its time (grid error) AND its track bar (bar mapping / late-join phase).
//  S1  two buffer decks, 121.3 + 126.8 BPM, engine 124: deck 0 from bar 0 @0, deck 1 from bar 0
//      @8, deck 0 stopped @24 (called at bar 20.5), deck 1 runs to its own end. Each deck is
//      rendered SOLO (crossfader hard to one side, identical schedule) + once as a noraMix blend.
//  S2  realtime-like: a synth deck (kick only) scheduled by 25 ms pumps; a buffer deck asked,
//      at bar 5.37, to play track bar 3 at master bar 4 → joins late; kicks vs grid vs synth.
//  S3  trackInfo at suspends vs the positions / end measured in the audio.
//  S4  gain staging: a produced-house fixture normalised to −8 LUFS vs the six synth tracks.
//  S5  the synthesized path renders bit-identically to deckAudio.before-buffers.mjs.
//  S6  a live AudioContext smoke test (timer-driven engine, late join counted, auto state).
import * as NEW from '../../../public/newdesign/booth/deckAudio.mjs';
import * as OLD from './deckAudio.before-buffers.mjs';
import { planTransition, mixState } from '../../../public/newdesign/booth/noraMix.mjs';

const { createDeckAudio, DEMO_TRACKS, BUFFER_TRIM, BUFFER_TARGET_LUFS } = NEW;
const SR = 44100;
const BPM = 124;
const T0 = 0.05;
const BAR = 240 / BPM;
const BEAT = 60 / BPM;
const barTime = (b) => T0 + b * BAR;
const report = {};
const log = (h) => { const d = document.createElement('pre'); d.textContent = h; document.body.appendChild(d); };
const r3 = (v) => (v == null ? v : +(+v).toFixed(3));
const r2 = (v) => (v == null ? v : +(+v).toFixed(2));
const ms = (v) => +(v * 1000).toFixed(3);

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

// ---------------------------------------------------------------- fixtures
const BEAT_AMP = 0.22;
const downAmp = (bar) => 0.40 + 0.03 * (bar % 16);
const END_AMP = 0.05;
const CLICK_TAU = 0.03;
const CLICK_LEN = 0.12;
function clickFixture({ bpm, firstBeat, bars, tail = 0.8 }) {
  const beat = 60 / bpm;
  const nBeats = bars * 4;
  const dur = firstBeat + (nBeats - 1) * beat + tail;
  const n = Math.ceil(dur * SR);
  const x = new Float32Array(n);
  for (let k = 0; k < nBeats; k += 1) {
    const bar = Math.floor(k / 4);
    const A = k % 4 === 0 ? downAmp(bar) : BEAT_AMP;
    const tk = firstBeat + k * beat;
    const i0 = Math.ceil(tk * SR - 1e-9);
    const i1 = Math.min(n, i0 + Math.round(CLICK_LEN * SR));
    for (let i = i0; i < i1; i += 1) {   // analytic, sub-sample exact phase
      const t = i / SR - tk;
      x[i] += A * Math.exp(-t / CLICK_TAU) * Math.cos(2 * Math.PI * 55 * t);
    }
  }
  const e0 = Math.floor((dur - 0.25) * SR);   // end marker: the file's last 0.25 s is a 3 kHz tone
  for (let i = e0; i < n; i += 1) x[i] += END_AMP * Math.sin(2 * Math.PI * 3000 * i / SR);
  const buf = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: SR });
  buf.copyToChannel(x, 0);
  buf.copyToChannel(x, 1);
  return { buf, meta: { bpm, beatSec: 60 / bpm, downbeatSec: firstBeat, lengthBars: bars } };
}

// A produced-sounding house loop: pitched kick, sidechained saw bass + chords, hats, clap,
// through a tanh "limiter" whose drive is searched until the integrated loudness hits target.
function houseFixture({ bpm, bars, firstBeat = 0.1, seed = 1, targetLufs = -8 }) {
  const R = mulberry32(seed);
  const beat = 60 / bpm;
  const step = beat / 4;
  const dur = firstBeat + bars * 4 * beat + 0.3;
  const n = Math.ceil(dur * SR);
  const L = new Float32Array(n);
  const Rt = new Float32Array(n);
  const kickT = [];
  for (let k = 0; k < bars * 4; k += 1) kickT.push(firstBeat + k * beat);
  // sidechain: 1 − depth·exp(−(t − lastKick)/0.09)
  const duck = new Float32Array(n);
  { let kj = -1; for (let i = 0; i < n; i += 1) { const t = i / SR; while (kj + 1 < kickT.length && kickT[kj + 1] <= t) kj += 1; duck[i] = kj < 0 ? 1 : 1 - 0.75 * Math.exp(-(t - kickT[kj]) / 0.09); } }
  // kick
  for (const tk of kickT) {
    let ph = 0;
    const i0 = Math.ceil(tk * SR);
    for (let i = i0; i < Math.min(n, i0 + 0.42 * SR); i += 1) {
      const t = i / SR - tk;
      ph += 2 * Math.PI * (47 + 120 * Math.exp(-t / 0.028)) / SR;
      const v = 0.95 * Math.min(1, t / 0.0015) * Math.exp(-t / 0.17) * Math.sin(ph);
      L[i] += v; Rt[i] += v;
    }
  }
  const root = 55 * Math.pow(2, Math.floor(R() * 5) / 12);
  // bass: offbeat 8ths + a 16th pickup, saw → one-pole LP, ducked
  const bassNotes = [];
  for (let bar = 0; bar < bars; bar += 1) for (const [s, iv] of [[2, 0], [6, 0], [10, 0], [14, 7], [15, 12]]) bassNotes.push([firstBeat + (bar * 16 + s) * step, root * Math.pow(2, iv / 12), s === 15 ? step : step * 1.8]);
  for (const [tb, f, len] of bassNotes) {
    const i0 = Math.ceil(tb * SR);
    let ph = 0, lp = 0;
    for (let i = i0; i < Math.min(n, i0 + (len + 0.02) * SR); i += 1) {
      const t = i / SR - tb;
      ph = (ph + f / SR) % 1;
      const saw = 2 * ph - 1;
      lp += 0.08 * (saw - lp);
      const env = Math.min(1, t / 0.004) * (t < len ? 1 : Math.max(0, 1 - (t - len) / 0.02));
      const v = 0.42 * env * lp * duck[i];
      L[i] += v; Rt[i] += v;
    }
  }
  // chords: m7 on the root two octaves up, 2 detuned saws per note, LP, pumped, wide
  { const chord = [0, 3, 7, 10].map((iv) => root * 4 * Math.pow(2, iv / 12));
    const phs = chord.map(() => [R(), R()]);
    let lpL = 0, lpR = 0;
    const i0 = Math.ceil(firstBeat * SR);
    for (let i = i0; i < n; i += 1) {
      let sl = 0, sr = 0;
      chord.forEach((f, c) => {
        phs[c][0] = (phs[c][0] + f * 1.004 / SR) % 1; phs[c][1] = (phs[c][1] + f * 0.996 / SR) % 1;
        sl += 2 * phs[c][0] - 1; sr += 2 * phs[c][1] - 1;
      });
      lpL += 0.12 * (sl - lpL); lpR += 0.12 * (sr - lpR);
      L[i] += 0.05 * lpL * duck[i]; Rt[i] += 0.05 * lpR * duck[i];
    }
  }
  // hats (16ths, offbeat accent) + clap (2 & 4): seeded noise, first-difference brightened
  const hatVel = [0.35, 0.18, 0.8, 0.22];
  for (let s = 0; s < bars * 16; s += 1) {
    const th = firstBeat + s * step + (s % 2 ? step * 0.08 : 0);
    const vel = hatVel[s % 4] * (0.85 + 0.3 * R());
    const clap = s % 16 === 4 || s % 16 === 12;
    const i0 = Math.ceil(th * SR);
    let prev = 0, lp = 0;
    for (let i = i0; i < Math.min(n, i0 + 0.25 * SR); i += 1) {
      const t = i / SR - th;
      const w = R() * 2 - 1;
      const hp = w - prev; prev = w;
      const hat = 0.16 * vel * hp * Math.exp(-t / (s % 4 === 2 ? 0.06 : 0.018));
      lp += 0.35 * (w - lp);
      const cl = clap ? 0.34 * (lp - 0.5 * hp) * Math.exp(-t / 0.07) : 0;
      L[i] += hat * 0.8 + cl; Rt[i] += hat * 1.2 + cl;
    }
  }
  // master: search the tanh drive for the target loudness (peak ≤ 0.97 by construction)
  const ceil = 0.97;
  const master = (g) => { const a = new Float32Array(n), b = new Float32Array(n); for (let i = 0; i < n; i += 1) { a[i] = ceil * Math.tanh(g * L[i] / ceil); b[i] = ceil * Math.tanh(g * Rt[i] / ceil); } return [a, b]; };
  let lo = 0.05, hi = 20, out = null, lu = null;
  for (let it = 0; it < 30; it += 1) {
    const g = Math.sqrt(lo * hi);
    out = master(g);
    lu = lufs(out);
    if (Math.abs(lu - targetLufs) < 0.02) break;
    if (lu < targetLufs) lo = g; else hi = g;
  }
  const buf = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: SR });
  buf.copyToChannel(out[0], 0);
  buf.copyToChannel(out[1], 1);
  return { buf, meta: { bpm, beatSec: 60 / bpm, downbeatSec: firstBeat, lengthBars: bars }, lufs: lu, rmsDb: rmsDb(out), peak: peak(out) };
}

// ---------------------------------------------------------------- measurement
// BS.1770-4 K-weighting, libebur128's sample-rate-independent coefficient derivation.
function kWeight(x) {
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan(Math.PI * f0 / SR);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const pb = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0];
  const pa = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan(Math.PI * f0 / SR);
  a0 = 1 + K / Q + K * K;
  const rb = [1, -2, 1], ra = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  const bq = (inp, b, a) => { const y = new Float64Array(inp.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < inp.length; i += 1) { const v = b[0] * inp[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = inp[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
  return bq(bq(x, pb, pa), rb, ra);
}
/** Integrated loudness (gated), channels = [Float32Array…], optional [a,b) seconds window. */
function lufs(chs, a = 0, b = Infinity) {
  const i0 = Math.max(0, Math.floor(a * SR)), i1 = Math.min(chs[0].length, Math.floor(b * SR));
  const kw = chs.map((c) => kWeight(c.subarray(i0, i1)));
  const blk = Math.round(0.4 * SR), hop = Math.round(0.1 * SR);
  const blocks = [];
  for (let s = 0; s + blk <= kw[0].length; s += hop) {
    let z = 0;
    for (const c of kw) { let m = 0; for (let i = s; i < s + blk; i += 1) m += c[i] * c[i]; z += m / blk; }
    blocks.push(z);
  }
  const Lb = (z) => -0.691 + 10 * Math.log10(z);
  const abs = blocks.filter((z) => Lb(z) > -70);
  if (!abs.length) return -Infinity;
  const rel = Lb(abs.reduce((s, z) => s + z, 0) / abs.length) - 10;
  const g = abs.filter((z) => Lb(z) > rel);
  return Lb(g.reduce((s, z) => s + z, 0) / g.length);
}
function rmsDb(chs, a = 0, b = Infinity) {
  let s = 0, n = 0;
  for (const c of chs) { const i1 = Math.min(c.length, Math.floor(b * SR)); for (let i = Math.max(0, Math.floor(a * SR)); i < i1; i += 1) { s += c[i] * c[i]; n += 1; } }
  return 10 * Math.log10(s / n);
}
function peak(chs, a = 0, b = Infinity) {
  let p = 0;
  for (const c of chs) { const i1 = Math.min(c.length, Math.floor(b * SR)); for (let i = Math.max(0, Math.floor(a * SR)); i < i1; i += 1) { const v = Math.abs(c[i]); if (v > p) p = v; } }
  return p;
}
const chans = (buf) => Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
function countOver(chs, th) { let n = 0; for (const c of chs) for (let i = 0; i < c.length; i += 1) if (Math.abs(c[i]) > th) n += 1; return n; }

// Onsets: first sample over `th` after ≥20 ms under th·0.1; the onset is walked back to the
// first sample of the rise (the fixture attack is a step), amplitude = max |x| over 0.5 ms.
function onsets(x, th, sr = SR) {
  const out = [];
  let armed = true, quiet = 0;
  const qN = Math.round(0.02 * sr);
  for (let i = 0; i < x.length; i += 1) {
    const a = Math.abs(x[i]);
    if (armed) {
      if (a > th) {
        let j = i;
        while (j > 0 && Math.abs(x[j - 1]) > th * 0.02) j -= 1;
        let pk = 0;
        for (let m = j; m < Math.min(x.length, j + 22); m += 1) pk = Math.max(pk, Math.abs(x[m]));
        out.push({ i: j, t: j / sr, amp: pk });
        armed = false; quiet = 0;
      }
    } else if (a < th * 0.1) { quiet += 1; if (quiet > qN) armed = true; } else quiet = 0;
  }
  return out;
}
// Annotate click onsets against the master grid + decode the track bar from the amplitude.
function onGrid(ons, gain) {
  return ons.map((o) => {
    const k = Math.round((o.t - T0) / BEAT);
    const raw = o.amp / gain;
    const isDown = raw > (BEAT_AMP + 0.40) / 2;
    return { t: o.t, k, masterBar: Math.floor(k / 4), beat: ((k % 4) + 4) % 4, err: o.t - (T0 + k * BEAT), isDown, decoded: isDown ? Math.round((raw - 0.40) / 0.03) : null, raw };
  });
}
function gridSummary(g, { atBar, fromBar, from, bars = 16 }) {
  const a = from != null ? from : barTime(atBar) - 0.005;
  const b = barTime((from != null ? Math.floor((from - T0) / BAR) + 1 : atBar) + bars) - 0.005;
  const w = g.filter((x) => x.t >= a && x.t < b);
  const expectedBeats = [];
  for (let k = Math.ceil((a - T0) / BEAT - 1e-9); T0 + k * BEAT < b; k += 1) expectedBeats.push(k);
  const errs = w.map((x) => x.err);
  const phaseOk = w.every((x) => x.isDown === (x.beat === 0));
  const bad = w.filter((x) => x.isDown && ((((x.decoded - (fromBar + x.masterBar - atBar)) % 16) + 16) % 16) !== 0);
  return {
    window: `${r3(a)}–${r3(b)} s`,
    kicks: w.length, expectedKicks: expectedBeats.length,
    missingBeats: expectedBeats.filter((k) => !w.some((x) => x.k === k)).length,
    maxAbsErrMs: ms(Math.max(...errs.map(Math.abs))), meanErrMs: ms(errs.reduce((s, e) => s + e, 0) / errs.length),
    downbeatsOnBeat1: phaseOk, downbeats: w.filter((x) => x.isDown).length,
    trackBarDecodeMismatches: bad.length,
    firstKick: w[0] && { t: r3(w[0].t), masterBar: w[0].masterBar, beat: w[0].beat, trackBar: w[0].decoded },
  };
}

// ---------------------------------------------------------------- rendering
async function render({ seconds, engineOpts = {}, mod = NEW, setup, suspends = [], sr = SR }) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const eng = mod.createDeckAudio({ ctx, bpm: BPM, t0: T0, autoSchedule: false, ...engineOpts });
  setup(eng, ctx);
  for (const [t, fn] of suspends) ctx.suspend(t).then(() => { fn(eng, ctx); ctx.resume(); });
  const buf = await ctx.startRendering();
  const stats = { ...eng.stats };
  eng.dispose();
  return { buf, stats };
}
const infoRow = (i) => i && ({ playing: i.playing, kind: i.kind, bpm: i.bpm, trackBpm: i.trackBpm, rate: r3(i.rate), positionBars: +(+i.positionBars).toFixed(4), elapsed: +(+i.elapsed).toFixed(4), remaining: +(+i.remaining).toFixed(4), beatInBar: i.beatInBar, playhead: +(+i.playhead).toFixed(4), startsAtBar: i.startsAtBar, lengthBars: i.lengthBars, name: i.name, key: i.key });

// ================================================================= S1 + S3
async function s1() {
  const A = clickFixture({ bpm: 121.3, firstBeat: 0.187, bars: 32 });
  const B = clickFixture({ bpm: 126.8, firstBeat: 0.052, bars: 32 });
  const TRIM = 0.5;
  const rateB = Math.fround(BPM / 126.8);
  const endB = barTime(8) + (B.buf.duration - 0.052) / rateB;
  const seconds = endB + 1.0;
  const plan = planTransition({ fromDeck: 0, toDeck: 1, startBar: 8, lengthBars: 16 });
  const snaps = {};
  const snapAt = (name, bar) => [barTime(bar), (eng) => { eng.pump(barTime(bar) + 0.12); snaps[name] = { t: barTime(bar), ctxT: eng.ctx.currentTime, deckPlaying: eng.deckPlaying.slice(), d0: eng.trackInfo(0), d1: eng.trackInfo(1) }; }];
  const suspends = [
    snapAt('bar2_5', 2.5), snapAt('bar10_25', 10.25),
    [barTime(20.5), (eng) => { eng.pump(barTime(20.5) + 0.12); eng.stop(0, { atBar: 24 }); snaps.stopCall = { ctxT: eng.ctx.currentTime, deckPlaying: eng.deckPlaying.slice() }; }],
    snapAt('bar26', 26),
    [endB - 0.5, (eng) => { snaps.beforeEnd = { ctxT: eng.ctx.currentTime, d1: eng.trackInfo(1) }; }],
    [endB + 0.3, (eng) => { eng.pump(eng.ctx.currentTime + 0.12); snaps.afterEnd = { ctxT: eng.ctx.currentTime, deckPlaying: eng.deckPlaying.slice(), d1: eng.trackInfo(1) }; }],
  ];
  const setup = (xf, withLanes) => (eng) => {
    eng.loadBuffer(0, A.buf, A.meta, { name: 'Fixture A', artist: 'click', key: '8A', trim: TRIM });
    eng.loadBuffer(1, B.buf, B.meta, { name: 'Fixture B', artist: 'click', key: '9A', trim: TRIM });
    eng.setXfader(xf, { at: 0, tau: 1e-4 });
    for (const d of [0, 1]) eng.setChannel(d, { fader: 1, low: 0, mid: 0, hi: 0 }, { at: 0, tau: 1e-4 });
    if (withLanes) {
      for (let b = 0; b <= 26; b += 1 / 16) {
        const st = mixState(plan, b);
        for (const d of [0, 1]) if (st.ch && st.ch[d]) eng.setChannel(d, st.ch[d], { at: barTime(b), tau: 0.01 });
      }
    }
    eng.play(0, { atBar: 0, fromBar: 0 });
    eng.play(1, { atBar: 8, fromBar: 0 });
  };
  const solo0 = await render({ seconds, engineOpts: { safetyClip: false }, setup: setup(-1, false), suspends });
  const snaps0 = JSON.parse(JSON.stringify(snaps));
  const solo0b = await render({ seconds, engineOpts: { safetyClip: false }, setup: setup(-1, false), suspends });
  const solo1 = await render({ seconds, engineOpts: { safetyClip: false }, setup: setup(1, false), suspends });
  const mixRaw = await render({ seconds, engineOpts: { safetyClip: false }, setup: setup(0, true), suspends });
  const mix = await render({ seconds, setup: setup(0, true), suspends });

  const x0 = solo0.buf.getChannelData(0), x1 = solo1.buf.getChannelData(0);
  const th = 0.5 * BEAT_AMP * TRIM;
  const g0 = onGrid(onsets(x0, th), TRIM), g1 = onGrid(onsets(x1, th), TRIM);
  const T24 = barTime(24);
  const after = (x, t) => { let m = 0; for (let i = Math.ceil(t * SR); i < x.length; i += 1) m = Math.max(m, Math.abs(x[i])); return m; };
  const lastSample = (x, thr) => { for (let i = x.length - 1; i >= 0; i -= 1) if (Math.abs(x[i]) > thr) return i / SR; return null; };
  // overlap coincidence: every deck-1 kick in [8, 24) vs the nearest deck-0 kick
  const ov = g1.filter((k) => k.t >= barTime(8) - 0.005 && k.t < T24 - 0.005);
  const pairs = ov.map((k) => { let best = null; for (const j of g0) if (!best || Math.abs(j.t - k.t) < Math.abs(best.t - k.t)) best = j; return k.t - best.t; });
  const endMeas = lastSample(x1, 1e-5);
  const d0After = g0.filter((k) => k.t >= T24 - 0.001);
  // trackInfo vs audio: interpolate deck-0's TRACK beat at a time from its decoded onsets
  const trackBeatAt = (g, fromBar, atBar, t) => {
    let j = 0; while (j + 1 < g.length && g[j + 1].t <= t) j += 1;
    const tb = (x) => (fromBar + x.masterBar - atBar) * 4 + x.beat;   // decode-verified mapping
    const a = g[j], b = g[j + 1];
    return b ? tb(a) + (t - a.t) / (b.t - a.t) * (tb(b) - tb(a)) : tb(a) + (t - a.t) / BEAT;
  };
  const cmp = (snap, deck, g, fromBar, atBar, freezeAt) => {
    const i = snap[`d${deck}`];
    const tEff = freezeAt != null ? Math.min(snap.ctxT, freezeAt) : snap.ctxT;
    const measPos = trackBeatAt(g, fromBar, atBar, tEff) / 4;
    return { infoPos: +i.positionBars.toFixed(5), audioPos: +measPos.toFixed(5), posErrBars: +(i.positionBars - measPos).toExponential(2) };
  };
  report.S1_twoBufferDecks = {
    fixtures: { A: '121.3 BPM, first beat 0.187 s, 32 bars', B: '126.8 BPM, first beat 0.052 s, 32 bars', engine: `${BPM} BPM, t0 ${T0}`, rateA: r3(Math.fround(BPM / 121.3)), rateB: r3(rateB), trim: TRIM },
    repeatability_solo0_twice: (() => { const a = solo0.buf.getChannelData(0), b = solo0b.buf.getChannelData(0); let m = 0, n = 0; for (let i = 0; i < a.length; i += 1) { const d = Math.abs(a[i] - b[i]); if (d > 0) n += 1; if (d > m) m = d; } return { maxAbsDiff: m, differingSamples: n }; })(),
    deck0_first16bars: gridSummary(g0, { atBar: 0, fromBar: 0 }),
    deck1_first16bars: gridSummary(g1, { atBar: 8, fromBar: 0 }),
    deck0_allKicks: { n: g0.length, maxAbsErrMs: ms(Math.max(...g0.map((k) => Math.abs(k.err)))) },
    deck1_allKicks: { n: g1.length, maxAbsErrMs: ms(Math.max(...g1.map((k) => Math.abs(k.err)))), decodeMismatches: g1.filter((k) => k.isDown && ((((k.decoded - (k.masterBar - 8)) % 16) + 16) % 16) !== 0).length },
    overlap_bars8to24: { pairs: pairs.length, maxAbsDeltaMs: ms(Math.max(...pairs.map(Math.abs))), meanDeltaMs: ms(pairs.reduce((s, v) => s + v, 0) / pairs.length) },
    stopAtBar24: {
      T: r3(T24), lastKickBeforeStop: g0.filter((k) => k.t < T24).slice(-1).map((k) => ({ t: r3(k.t), masterBar: k.masterBar, beat: k.beat }))[0],
      kicksAtOrAfterT: d0After.length, maxAbsAfterT: after(x0, T24), maxAbsAfterT_plus1ms: after(x0, T24 + 0.001),
      maxAbsInFadeWindow: (() => { let m = 0; for (let i = Math.floor((T24 - 0.005) * SR); i < Math.ceil(T24 * SR); i += 1) m = Math.max(m, Math.abs(x0[i])); return m; })(),
      deckPlaying_atBar26: snaps0.bar26 && snaps0.bar26.deckPlaying,
    },
    autoStopDeck1: {
      predictedEndT: +endB.toFixed(5), measuredLastAudioT: endMeas && +endMeas.toFixed(5), deltaMs: endMeas && ms(endMeas - endB),
      maxAbsAfterEnd: after(x1, endB + 0.0005), deckPlayingAfterEnd: snaps.afterEnd && snaps.afterEnd.deckPlaying,
      trackInfoAfterEnd: snaps.afterEnd && infoRow(snaps.afterEnd.d1),
    },
    mix: {
      noraMixPlan: `deck 0 → 1, startBar 8, 16 bars (lanes applied every 1/16 bar via setChannel)`,
      rawPeak: r3(peak(chans(mixRaw.buf))), rawSamplesOver0_8: countOver(chans(mixRaw.buf), 0.8),
      withClipperPeak: r3(peak(chans(mix.buf))),
      clipperIdenticalToRaw: (() => { const a = mixRaw.buf.getChannelData(0), b = mix.buf.getChannelData(0); let m = 0; for (let i = 0; i < a.length; i += 1) m = Math.max(m, Math.abs(a[i] - b[i])); return m; })(),
      stats: mix.stats,
    },
  };
  // S3 — trackInfo
  const exp = (bar, deckAt, fromBar) => fromBar + bar - deckAt;
  const rateA = Math.fround(BPM / 121.3);
  const elapsedExp = (meta, rate, pos) => Math.max(0, meta.downbeatSec + pos * 4 * meta.beatSec) / rate;
  const S = snaps0;
  report.S3_trackInfo = {
    at_bar2_5: {
      deck0: (() => { const c = cmp(S.bar2_5, 0, g0, 0, 0); const bp = A.meta.downbeatSec + c.audioPos * 4 * A.meta.beatSec; return { ...infoRow(S.bar2_5.d0), ...c, audioElapsed: +(bp / rateA).toFixed(4), audioRemaining: +((A.buf.duration - bp) / rateA).toFixed(4) }; })(),
      deck1_cued: infoRow(S.bar2_5.d1), deckPlaying: S.bar2_5.deckPlaying,
    },
    at_bar10_25: {
      deck0: { ...infoRow(S.bar10_25.d0), ...cmp(S.bar10_25, 0, g0, 0, 0) },
      deck1: { ...infoRow(snaps.bar10_25 ? snaps.bar10_25.d1 : S.bar10_25.d1), ...cmp(S.bar10_25, 1, g1, 0, 8), expectedPos: exp(10.25, 8, 0) },
      remainingVsMeasuredEnd_d1: { info: +S.bar10_25.d1.remaining.toFixed(4), measuredEndMinusNow: endMeas && +(endMeas - S.bar10_25.ctxT).toFixed(4) },
    },
    at_bar26_afterStop: { deck0: { ...infoRow(S.bar26.d0), frozenExpected: 24 }, deckPlaying: S.bar26.deckPlaying },
    beforeEnd_d1: { remaining: +S.beforeEnd.d1.remaining.toFixed(4), measuredEndMinusNow: endMeas && +(endMeas - S.beforeEnd.ctxT).toFixed(4), elapsedPlusRemaining: +(S.beforeEnd.d1.elapsed + S.beforeEnd.d1.remaining).toFixed(5), fileRealSeconds: +(B.buf.duration / rateB).toFixed(5) },
  };
}

// ================================================================= S2 (late join, realtime-like)
async function s2() {
  const B = clickFixture({ bpm: 126.8, firstBeat: 0.052, bars: 32 });
  const TRIM = 0.5;
  const JOIN = barTime(5.37);
  const seconds = barTime(24);
  const MUTE = ['hat', 'open', 'clap', 'bass', 'pad', 'stab', 'perc', 'crash', 'riser'];
  let joinInfo = null;
  const mk = (xf) => {
    const suspends = [];
    for (let t = 0.025; t < seconds - 0.2; t += 0.025) {   // a 25 ms scheduler tick
      if (Math.abs(t - JOIN) < 0.013) continue;
      suspends.push([t, (eng) => eng.pump(eng.ctx.currentTime + 0.12)]);
    }
    suspends.push([JOIN, (eng) => {
      eng.pump(eng.ctx.currentTime + 0.12);
      const ok = eng.play(1, { atBar: 4, fromBar: 3 });
      joinInfo = { ok, ctxT: eng.ctx.currentTime, barNow: eng.barAt(eng.ctx.currentTime), stats: { ...eng.stats }, info: infoRow(eng.trackInfo(1)) };
    }]);
    suspends.sort((a, b) => a[0] - b[0]);
    return render({
      seconds, engineOpts: { safetyClip: false, _mute: MUTE }, suspends,
      setup: (eng) => {
        eng.load(0, DEMO_TRACKS[0]);
        eng.loadBuffer(1, B.buf, B.meta, { name: 'Fixture B', trim: TRIM });
        eng.setXfader(xf, { at: 0, tau: 1e-4 });
        eng.play(0, { atBar: 0 });   // realtime-like: only the 25 ms pumps schedule it
      },
    });
  };
  const s0 = await mk(-1);
  const s1r = await mk(1);
  const synthKicks = onsets(s0.buf.getChannelData(0), 0.1).map((o) => ({ ...o, k: Math.round((o.t - T0) / BEAT), err: o.t - (T0 + Math.round((o.t - T0) / BEAT) * BEAT) }));
  const g1 = onGrid(onsets(s1r.buf.getChannelData(0), 0.5 * BEAT_AMP * TRIM), TRIM);
  const ts = joinInfo.ctxT + 0.03;
  const firstAfter = g1.filter((k) => k.t >= ts);
  const coinc = firstAfter.filter((k) => k.t < barTime(20)).map((k) => { let best = null; for (const j of synthKicks) if (!best || Math.abs(j.t - k.t) < Math.abs(best.t - k.t)) best = j; return k.t - best.t; });
  report.S2_lateJoin = {
    scenario: 'deck 0 = synth "Tidewire" (kick only) scheduled ONLY by 25 ms pumps; at bar 5.37 deck 1 (126.8 BPM buffer) is asked to put track bar 3 on master bar 4 (1.37 bars ago)',
    join: { ...joinInfo, expectedTrackBarAtJoin: +(3 + (joinInfo.ctxT + 0.03 - barTime(4)) / BAR).toFixed(4) },
    kicksBeforeJoin: g1.filter((k) => k.t < ts).length,
    deck1_16barsAfterJoin: gridSummary(g1, { atBar: 4, fromBar: 3, from: ts }),
    synthDeck_kicks: { n: synthKicks.length, maxAbsErrMs: ms(Math.max(...synthKicks.map((k) => Math.abs(k.err)))), statsLate: s0.stats.late, droppedSteps: s0.stats.droppedSteps },
    bufferVsSynthKick: { pairs: coinc.length, maxAbsDeltaMs: ms(Math.max(...coinc.map(Math.abs))), meanDeltaMs: ms(coinc.reduce((s, v) => s + v, 0) / coinc.length) },
    stats: s1r.stats,
  };
}

// ================================================================= S4 (gain staging)
async function s4() {
  const synth = [];
  for (const sp of DEMO_TRACKS) {
    const R = await render({ seconds: barTime(8) + 0.3, engineOpts: { safetyClip: false }, setup: (e) => { e.load(0, sp); e.setXfader(-1, { at: 0, tau: 1e-4 }); e.play(0, { atBar: 0, fromBar: 40 }); e.pump(barTime(8) + 0.3); } });
    const c = chans(R.buf);
    synth.push({ name: sp.name, lufs: r2(lufs(c, barTime(0.5), barTime(8))), rmsDb: r2(rmsDb(c, barTime(0.5), barTime(8))), peak: r3(peak(c)) });
  }
  const synthMean = synth.reduce((s, x) => s + x.lufs, 0) / synth.length;
  const H1 = houseFixture({ bpm: 120, bars: 16, seed: 7, targetLufs: -8 });
  const H2 = houseFixture({ bpm: 126, bars: 16, seed: 21, targetLufs: -8 });
  const playH = async (H, info, xf = -1) => {
    const R = await render({ seconds: barTime(16), engineOpts: { safetyClip: false }, setup: (e) => { e.loadBuffer(0, H.buf, H.meta, info); e.setXfader(xf, { at: 0, tau: 1e-4 }); e.play(0, { atBar: 0 }); } });
    const c = chans(R.buf);
    return { lufs: r2(lufs(c, barTime(1), barTime(15))), rmsDb: r2(rmsDb(c, barTime(1), barTime(15))), peak: r3(peak(c)) };
  };
  const hDefault = await playH(H1, { name: 'house' });
  const hLufsInfo = await playH(H1, { name: 'house', lufs: H1.lufs });
  const hTrim1 = await playH(H1, { name: 'house', trim: 1 });
  // blends at the default trim: two produced masters, and synth + buffer; centre xfader
  const blend = async (setup) => { const R = await render({ seconds: barTime(16), engineOpts: { safetyClip: false }, setup }); const c = chans(R.buf); return { rawPeak: r3(peak(c)), samplesOver0_8: countOver(c, 0.8), lufs: r2(lufs(c, barTime(1), barTime(15))) }; };
  const both = (eq) => (e) => { e.loadBuffer(0, H1.buf, H1.meta, {}); e.loadBuffer(1, H2.buf, H2.meta, {}); e.setXfader(0, { at: 0, tau: 1e-4 }); if (eq) for (const d of [0, 1]) e.setChannel(d, eq, { at: 0, tau: 1e-4 }); e.play(0, { atBar: 0 }); e.play(1, { atBar: 0 }); };
  const bb = await blend(both(null));
  const bbStress = await blend(both({ low: 1, hi: 1 }));
  const sb = await blend((e) => { e.load(0, DEMO_TRACKS[0]); e.loadBuffer(1, H1.buf, H1.meta, {}); e.setXfader(0, { at: 0, tau: 1e-4 }); e.play(0, { atBar: 0, fromBar: 40 }); e.play(1, { atBar: 0 }); e.pump(barTime(16)); });
  const ssStress = await blend((e) => { e.load(0, DEMO_TRACKS[0]); e.load(1, DEMO_TRACKS[1]); e.setXfader(0, { at: 0, tau: 1e-4 }); for (const d of [0, 1]) e.setChannel(d, { low: 1, hi: 1 }, { at: 0, tau: 1e-4 }); e.play(0, { atBar: 0, fromBar: 40 }); e.play(1, { atBar: 0, fromBar: 40 }); e.pump(barTime(16)); });
  // the station's real transition on two masters: a noraMix plan's lanes (bass swap, fades)
  const plan = planTransition({ fromDeck: 0, toDeck: 1, startBar: 0, lengthBars: 16 });
  const nm = await blend((e) => {
    e.loadBuffer(0, H1.buf, H1.meta, {}); e.loadBuffer(1, H2.buf, H2.meta, {});
    e.setXfader(0, { at: 0, tau: 1e-4 });
    for (let b = 0; b < 16; b += 1 / 16) { const st = mixState(plan, b); for (const d of [0, 1]) if (st.ch && st.ch[d]) e.setChannel(d, st.ch[d], { at: barTime(b), tau: 0.01 }); }
    e.play(0, { atBar: 0 }); e.play(1, { atBar: 0 });
  });
  report.S4_gainStaging = {
    owned_tracks_on_record: 'full-band mid-track RMS at unity gain: −7.5, −9.8, −10.0, −12.9, −10.3 dBFS (marketing/shape-radio-launch-cut.md, ffmpeg astats)',
    houseFixture: { H1: { lufs: r2(H1.lufs), rmsDb: r2(H1.rmsDb), peak: r3(H1.peak) }, H2: { lufs: r2(H2.lufs), rmsDb: r2(H2.rmsDb), peak: r3(H2.peak) } },
    synthDecks_bars40to48: synth,
    synthMeanLufs: r2(synthMean),
    moduleDefaults: { BUFFER_TARGET_LUFS, BUFFER_TRIM: r3(BUFFER_TRIM), BUFFER_TRIM_dB: r2(20 * Math.log10(BUFFER_TRIM)) },
    impliedTrimForThisFixture_dB: r2(synthMean - H1.lufs),
    bufferDeck_defaultTrim: { ...hDefault, vsSynthMeanLU: r2(hDefault.lufs - synthMean) },
    bufferDeck_info_lufs: { ...hLufsInfo, vsSynthMeanLU: r2(hLufsInfo.lufs - synthMean) },
    bufferDeck_trim1: hTrim1,
    blend_twoMasters_xfCentre: bb,
    blend_twoMasters_plus6dB_lowAndHi: bbStress,
    blend_synthPlusBuffer_xfCentre: sb,
    blend_twoSynth_plus6dB_lowAndHi_forComparison: ssStress,
    noraMixTransition_twoMasters: nm,
  };
}

// ================================================================= S5 (synth path unchanged)
async function s5() {
  const runA = (mod) => render({ mod, seconds: T0 + 16 * BAR + 0.6, setup: (e) => { e.load(0, DEMO_TRACKS[0]); e.load(1, DEMO_TRACKS[1]); e.setChannel(0, { fader: 1, low: 0, mid: 0, hi: 0 }, { at: 0 }); e.setXfader(-1, { at: 0 }); e.play(0, { atBar: 0 }); e.pump(T0 + 16 * BAR + 0.6); } });
  const infos = {};
  const runC = (mod, tag) => render({
    mod, seconds: T0 + 17 * BAR,
    suspends: [[barTime(3.5), (e) => { infos[tag] = e.trackInfo(0); }]],
    setup: (e) => {
      const at = (bar) => T0 + bar * BAR;
      e.load(0, DEMO_TRACKS[0]); e.load(1, DEMO_TRACKS[1]);
      e.setXfader(0, { at: 0 });
      e.setChannel(0, { fader: 1, low: 0, mid: 0, hi: 0 }, { at: 0 });
      e.setChannel(1, { fader: 0, low: -1, mid: 0, hi: 0 }, { at: 0 });
      e.play(0, { atBar: 0, fromBar: 40 });
      e.play(1, { atBar: 0 });
      for (let b = 1; b <= 4; b += 1) e.setChannel(1, { fader: b / 4 }, { at: at(b), tau: 0.4 });
      e.setChannel(1, { low: 1, hi: 1 }, { at: at(6), tau: 0.05 });
      e.setChannel(0, { low: -1 }, { at: at(8), tau: 0.02 });
      e.setChannel(1, { low: 0, hi: 0 }, { at: at(8), tau: 0.02 });
      e.setChannel(0, { hi: -0.6, mid: -0.3 }, { at: at(10), tau: 0.3 });
      e.setXfader(0.6, { at: at(12), tau: 0.5 });
      for (let b = 12; b <= 15; b += 1) e.setChannel(0, { fader: 1 - (b - 11) / 4 }, { at: at(b), tau: 0.3 });
      e.stop(0, { atBar: 16 });
      e.pump(T0 + 17 * BAR);
    },
  });
  const diff = (a, b) => { let m = 0, n = 0; for (let c = 0; c < a.numberOfChannels; c += 1) { const x = a.getChannelData(c), y = b.getChannelData(c); for (let i = 0; i < x.length; i += 1) { const d = Math.abs(x[i] - y[i]); if (d > 0) n += 1; if (d > m) m = d; } } return { maxAbsDiff: m, differingSamples: n, samples: a.length * a.numberOfChannels }; };
  const statsEq = (a, b) => ['scheduledSteps', 'droppedSteps', 'late', 'sources'].every((k) => a[k] === b[k]);
  const MUTE = ['hat', 'open', 'clap', 'bass', 'pad', 'stab', 'perc', 'crash', 'riser'];
  const runK = (mod) => render({ mod, seconds: T0 + 16 * BAR + 0.6, engineOpts: { _mute: MUTE }, setup: (e) => { e.load(0, DEMO_TRACKS[0]); e.load(1, DEMO_TRACKS[1]); e.setXfader(0, { at: 0 }); e.play(0, { atBar: 0 }); e.play(1, { atBar: 2, fromBar: 8 }); e.setChannel(1, { low: -1, fader: 0.5 }, { at: barTime(6), tau: 0.1 }); e.stop(0, { atBar: 12 }); e.pump(T0 + 16 * BAR + 0.6); } });
  const oK1 = await runK(OLD), oK2 = await runK(OLD), nK = await runK(NEW);
  const oA1 = await runA(OLD), oA2 = await runA(OLD), nA = await runA(NEW);
  const oC1 = await runC(OLD, 'old'), oC2 = await runC(OLD, 'old2'), nC = await runC(NEW, 'new');
  report.S5_synthUnchanged = {
    K_kickOnly_twoDecks_stop_EQ_fader: { control_old_vs_old: diff(oK1.buf, oK2.buf), new_vs_old: diff(nK.buf, oK1.buf), peak: r3(peak(chans(nK.buf))), statsIdentical: statsEq(nK.stats, oK1.stats) },
    A_Tidewire16bars: { control_old_vs_old: diff(oA1.buf, oA2.buf), new_vs_old: diff(nA.buf, oA1.buf), peak: r3(peak(chans(nA.buf))), statsIdentical: statsEq(nA.stats, oA1.stats), stats: { old: oA1.stats, new: nA.stats } },
    C_twoDeckBlendWithStop: { control_old_vs_old: diff(oC1.buf, oC2.buf), new_vs_old: diff(nC.buf, oC1.buf), statsIdentical: statsEq(nC.stats, oC1.stats) },
    trackInfo_fromBar40_atBar3_5: { old_positionBars: r3(infos.old.positionBars), new_positionBars: r3(infos.new.positionBars), note: 'old ignored fromBar (bars since start); new = the TRACK bar (40 + 3.5)' },
  };
}

// ================================================================= S6 (live context smoke)
async function s6() {
  const actx = new AudioContext({ sampleRate: SR });
  if (actx.state !== 'running') await actx.resume();
  const F = clickFixture({ bpm: 121.3, firstBeat: 0.187, bars: 8 });
  const eng = createDeckAudio({ ctx: actx, bpm: BPM });
  eng.loadBuffer(0, F.buf, F.meta, { name: 'Live A', trim: 0.5 });
  eng.loadBuffer(1, F.buf, F.meta, { name: 'Live B', trim: 0.5 });
  eng.setXfader(0);
  eng.play(0, { atBar: Math.ceil(eng.barAt(actx.currentTime + 0.05)) });
  for (let i = 0; i < 400 && !(eng.trackInfo(0).positionBars > 0.3); i += 1) await new Promise((r) => setTimeout(r, 10));
  // poll the deck analyser (a 512-sample read can fall between two clicks)
  const bins = new Float32Array(eng.deckAnalysers[0].fftSize);
  let pk = 0;
  for (let i = 0; i < 60; i += 1) {
    eng.deckAnalysers[0].getFloatTimeDomainData(bins);
    for (const v of bins) pk = Math.max(pk, Math.abs(v));
    await new Promise((r) => setTimeout(r, 10));
  }
  const i1 = eng.trackInfo(0);
  const t1 = actx.currentTime;
  eng.play(1, { atBar: Math.floor(eng.barAt(actx.currentTime)) });   // already in the past → late join
  await new Promise((r) => setTimeout(r, 300));
  const both = eng.deckPlaying.slice();
  const i2 = eng.trackInfo(0);
  const t2 = actx.currentTime;
  eng.stop(0);
  await new Promise((r) => setTimeout(r, 150));
  const afterStop = eng.deckPlaying.slice();
  report.S6_live = { state: actx.state, baseLatency: actx.baseLatency, bufferLead: eng.bufferLead, deck0AnalyserPeak: r3(pk), info_t1: infoRow(i1), positionAdvancedBars: r3(i2.positionBars - i1.positionBars), expectedAdvanceBars: r3((t2 - t1) / BAR), bothPlaying: both, afterStop, stats: { ...eng.stats }, lookahead: r3(eng.lookahead) };
  eng.dispose();
  await actx.close();
}

// ================================================================= S7 (44.1 kHz buffer in a 48 kHz context)
async function s7() {
  const A = clickFixture({ bpm: 121.3, firstBeat: 0.187, bars: 20 });   // AudioBuffer at 44.1 kHz
  const R48 = 48000;
  const R = await render({ sr: R48, seconds: barTime(18), engineOpts: { safetyClip: false }, setup: (e) => { e.loadBuffer(0, A.buf, A.meta, { trim: 0.5 }); e.setXfader(-1, { at: 0, tau: 1e-4 }); e.play(0, { atBar: 1, fromBar: 2 }); } });
  const g = onGrid(onsets(R.buf.getChannelData(0), 0.5 * BEAT_AMP * 0.5, R48), 0.5);
  report.S7_buffer44k1_in_ctx48k = { bufferSampleRate: A.buf.sampleRate, ctxSampleRate: R48, first16bars: gridSummary(g, { atBar: 1, fromBar: 2 }) };
}

// ================================================================= S8 (a deck switching kinds)
async function s8() {
  const A = clickFixture({ bpm: 121.3, firstBeat: 0.187, bars: 32 });
  const MUTE = ['hat', 'open', 'clap', 'bass', 'pad', 'stab', 'perc', 'crash', 'riser'];
  const kinds = [];
  const R = await render({
    seconds: barTime(16) + 0.2, engineOpts: { safetyClip: false, _mute: MUTE },
    setup: (e) => { e.load(0, DEMO_TRACKS[0]); e.setXfader(-1, { at: 0, tau: 1e-4 }); e.play(0, { atBar: 0 }); e.stop(0, { atBar: 4 }); e.pump(barTime(4)); },
    suspends: [
      [barTime(4.5), (e) => { kinds.push(['bar4.5 loadBuffer', e.loadBuffer(0, A.buf, A.meta, { trim: 0.5 }), e.deckKind(0)]); e.play(0, { atBar: 6 }); }],
      [barTime(9.9), (e) => { kinds.push(['bar9.9 load(synth) while buffer plays', e.load(0, DEMO_TRACKS[1]), e.deckKind(0), e.deckPlaying[0]]); }],
      [barTime(11), (e) => { kinds.push(['bar11 play synth @12', e.play(0, { atBar: 12 })]); e.pump(barTime(16) + 0.2); }],
    ],
  });
  const g = onsets(R.buf.getChannelData(0), 0.05).map((o) => ({ t: o.t, k: Math.round((o.t - T0) / BEAT), err: o.t - (T0 + Math.round((o.t - T0) / BEAT) * BEAT) }));
  const seg = (a, b) => { const w = g.filter((x) => x.t >= barTime(a) - 0.005 && x.t < barTime(b) - 0.005); return { kicks: w.length, maxAbsErrMs: w.length ? ms(Math.max(...w.map((x) => Math.abs(x.err)))) : null }; };
  report.S8_kindSwitch = { calls: kinds, synth_bars0to4: seg(0, 4), gap_bars4to6: seg(4, 6), buffer_bars6to9_9: seg(6, 9.9), gap_bars9_9to12: seg(9.9, 12), synth_bars12to16: seg(12, 16.1), stats: R.stats };
}

async function main() {
  log('buffer-deck-test running…');
  const steps = [['S5', s5], ['S1', s1], ['S2', s2], ['S4', s4], ['S7', s7], ['S8', s8], ['S6', s6]];
  for (const [name, fn] of steps) {
    const t = performance.now();
    try { await fn(); } catch (e) { report[`${name}_error`] = String(e && e.stack || e); }
    report[`${name}_ms`] = Math.round(performance.now() - t);
  }
  log(JSON.stringify(report, null, 1));
  window.__report = report;
  window.__done = true;
}
main().catch((e) => { window.__report = { error: String(e && e.stack || e) }; window.__done = true; });
