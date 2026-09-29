// trackAnalysis.mjs — measure an OWNED house track so a deck can beat-match it.
//
// Shape Radio plays the owner's Higgsfield-generated tracks, and Nora mixes them on the
// booth's decks. A deck can only beat-match what it has MEASURED: the records measured every
// one of those tracks at a different tempo than its prompt asked for (prompted 122/124/126,
// measured ~119.4–120.0; the v1 track prompted 124, measured 128), so a prompted BPM is a
// request, never a grid. This module is the launch cut's `beat.py` method and the app's
// `radioTempo.mjs` method (kick-band onset envelope → comb/resultant search → split-half
// agreement) run OFFLINE over the whole track, plus the structure a DJ needs: where bar 1 is,
// where the kick enters, where it drops out, where the ending starts and where to mix.
//
//   analyzeTrack(channels, sampleRate, opts) → meta     (see the shape below)
//   bufferWaveform(channels, sampleRate, meta) → [{low, mid, high}] one per 16th of the grid
//
// PURE: no DOM, no Web Audio, no Math.random, no Date.now. Deterministic: the same PCM always
// yields the same meta. The only module state is a WeakMap cache of the band analysis keyed by
// the first channel's Float32Array, so bufferWaveform after analyzeTrack on the same buffer
// does not re-filter it (a caller that mutates a buffer in place must pass a fresh array).
//
// ⚠ IT RETURNS bpm: null WHEN THERE IS NO RHYTHM, AND THAT IS THE POINT. A pad-only file, a
// talk segment, a broken decode: none of them may be handed a grid. When the gates below do
// not clear, every grid field is null, `reason` says why, and `confidence` is < 0.5. A caller
// must refuse to beat-match such a track rather than substitute a constant.
//
// ── How it measures ─────────────────────────────────────────────────────────────────────
// 1. One pass at the full rate: mono, a 4th-order low-pass at 200 Hz (the "low" band, and the
//    anti-alias for decimation), a band-pass for "mid" (≈200 Hz–3 kHz), a high-pass for
//    "high" (> 3 kHz); per 16-sample block the mean square of each band and of the whole
//    signal; the low band decimated to ≈2.76 kHz.
// 2. At the decimated rate the low band gets the mirror of its low-pass run BACKWARD, so the
//    kick timing carries no filter delay (forward at 44.1 kHz + backward at 2.76 kHz ≈ zero
//    phase below 200 Hz), a zero-phase 30 Hz high-pass, then complex demodulation: shift by
//    DEMOD_HZ, zero-phase low-pass → |z| is the kick-band AMPLITUDE envelope with no carrier
//    ripple (squaring a 50 Hz kick and smoothing it leaves a 100 Hz ripple whose slope rivals
//    the kick's own attack; demodulation removes the carrier instead of smoothing it).
// 3. Onsets = local maxima of the rising slope of that envelope, sub-sample interpolated.
// 4. Tempo: the resultant-vector comb of radioTempo.mjs (every onset placed on a circle by its
//    phase in a candidate period, summed; long resultant = the onsets sit on a grid of that
//    period, and its angle is the phase) swept over [bpmMin, bpmMax], refined to 0.001 BPM.
//    Octave guard: a gentle tempo prior centred on house tempo plus a metrical check (a grid
//    whose alternate beats are empty is a subdivision: halve it).
// 5. The grid is then FIT, not guessed: each predicted beat is matched to the strongest kick
//    onset near it and a robust least-squares line (beat index → onset time) gives the period
//    and phase — sub-millisecond on a steady kick. Split-half: the two halves are fit
//    independently and must agree.
// 6. Structure on the fitted grid: per-beat kick presence = the envelope's rise at the beat
//    over its valley before the beat (a sustained sub-bass is NOT a kick); bar phase from the
//    kick's entries (the first kick and every drop after a gap land on bar 1); breakdowns,
//    the outro (kick gone for good, or the final energy fall-off / fade), mix points.

// ── Constants ──────────────────────────────────────────────────────────────────────────────
const DECIM_HZ = 2756.25;          // target block rate: 16 samples at 44.1 kHz, 16 at 48 kHz
const LOW_SPLIT = 200;             // low band < 200 Hz (and the decimation anti-alias)
const HIGH_SPLIT = 3000;           // high band > 3 kHz
const MID_CENTRE = Math.sqrt(LOW_SPLIT * HIGH_SPLIT);
const KICK_HP = 30;                // below this: rumble, not kick
const DEMOD_HZ = 125;              // kick band ≈ 30–220 Hz: shift by 125 Hz …
const DEMOD_LP = 95;               // … and keep ±95 Hz (kicks start high and sweep down)
const SLOW_WIN = 0.02;             // the search envelope's boxcar (s): ≥ one period of a bass note
const BW4 = [0.5411961, 1.3065630]; // Butterworth 4th-order section Qs
const BW2 = Math.SQRT1_2;
const BEATS_PER_BAR = 4;
const PHRASE_BARS = 4;
const BLEND_BARS = 16;             // noraMix default L
const TAIL_BARS = 1;               // noraMix TAIL_BARS: stop + hand home after L
const STOP_AFTER = 0.25;           // noraMix stops the outgoing deck at L + 0.25
const KICK_ON = 0.4;               // a bar is "kicked" at mean beat presence ≥ this
const NEG_TOL = 0.02;              // bar 0 may sit up to 20 ms before sample 0 (see downbeatSec)

// ── Small helpers ──────────────────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round = (v, d) => { const k = 10 ** d; return Math.round(v * k) / k; };
function quantile(arr, q) {
  if (!arr.length) return 0;
  const s = Float64Array.from(arr).sort();
  const x = clamp(q, 0, 1) * (s.length - 1);
  const i = Math.floor(x), f = x - i;
  return i + 1 < s.length ? s[i] + (s[i + 1] - s[i]) * f : s[i];
}
const median = (arr) => quantile(arr, 0.5);

// RBJ cookbook biquads, normalised: [b0, b1, b2, a1, a2].
function lpCoef(f, fs, q) {
  const w = 2 * Math.PI * f / fs, c = Math.cos(w), a = Math.sin(w) / (2 * q), n = 1 + a;
  return [(1 - c) / 2 / n, (1 - c) / n, (1 - c) / 2 / n, -2 * c / n, (1 - a) / n];
}
function hpCoef(f, fs, q) {
  const w = 2 * Math.PI * f / fs, c = Math.cos(w), a = Math.sin(w) / (2 * q), n = 1 + a;
  return [(1 + c) / 2 / n, -(1 + c) / n, (1 + c) / 2 / n, -2 * c / n, (1 - a) / n];
}
function bpCoef(f, fs, q) { // constant 0 dB peak gain
  const w = 2 * Math.PI * f / fs, c = Math.cos(w), a = Math.sin(w) / (2 * q), n = 1 + a;
  return [a / n, 0, -a / n, -2 * c / n, (1 - a) / n];
}
// In place, forward or backward. Direct form I in doubles.
function runBiquad(x, k, backward) {
  const b0 = k[0], b1 = k[1], b2 = k[2], a1 = k[3], a2 = k[4];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const n = x.length;
  if (!backward) {
    for (let i = 0; i < n; i++) {
      const x0 = x[i];
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x0; y2 = y1; y1 = y0; x[i] = y0;
    }
  } else {
    for (let i = n - 1; i >= 0; i--) {
      const x0 = x[i];
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x0; y2 = y1; y1 = y0; x[i] = y0;
    }
  }
}
function zeroPhase(x, coefs) {
  for (const k of coefs) runBiquad(x, k, false);
  for (const k of coefs) runBiquad(x, k, true);
}

// ── Validation ─────────────────────────────────────────────────────────────────────────────
function checkInput(channels, sampleRate, fn) {
  if (!Array.isArray(channels) || !channels.length) throw new TypeError(`${fn}: channels must be a non-empty array of Float32Array`);
  const n = channels[0] && channels[0].length;
  for (const c of channels) {
    if (!(c instanceof Float32Array)) throw new TypeError(`${fn}: every channel must be a Float32Array`);
    if (c.length !== n) throw new RangeError(`${fn}: channels must have equal length`);
  }
  if (!(Number.isFinite(sampleRate) && sampleRate >= 8000)) throw new RangeError(`${fn}: sampleRate must be a number ≥ 8000`);
}

// ── Stage 1: the band pass over the PCM (cached per buffer) ──────────────────────────────
// ⚠ THE FULL-RATE PASS IS THE WHOLE COST, SO NOTHING RECURSIVE RUNS AT 44.1 kHz. Measured: four
// biquads at the full rate took ~145 ms of a 170 ms analysis (a recursive filter is a serial
// dependency chain, ~10 ns per sample per biquad in V8). So the full rate only does what is
// cheap and non-recursive: the mono mix, the total energy per block, and a 31-tap linear-phase
// Kaiser FIR that decimates ×4 (to ≈11 kHz). Every IIR runs after that, at a quarter the rate.
//
// The three display bands come from POWER-COMPLEMENTARY Butterworth pairs (|LP|² + |HP|² = 1
// for a same-order pair at one cutoff), so energies subtract exactly:
//   low  = E(LP4 200 Hz)          mid = E(LP2 3 kHz) − E(LP4 200 Hz)      high = E_all − E(LP2 3 kHz)
// (mid is a difference of two different orders: still ≥ 0 at every frequency, a 200 Hz–3 kHz band.)
const CACHE = new WeakMap();
const FIR_TAPS = 31;

function besselI0(x) {
  let sum = 1, term = 1;
  for (let k = 1; k < 50; k++) { term *= (x / (2 * k)) ** 2; sum += term; if (term < 1e-12 * sum) break; }
  return sum;
}
// Linear-phase low-pass for decimation by D1: −6 dB at 0.5·fs1 (the Nyquist of the new rate),
// Kaiser β = 5 (≈ −55 dB stopband). What would fold into the 0–3 kHz band sits at ≥ fs1 − 3 kHz.
function firTaps(D1, L) {
  const h = new Float64Array(L), mid = (L - 1) / 2, fc = 0.5 / D1, beta = 5, i0b = besselI0(beta);
  let sum = 0;
  for (let n = 0; n < L; n++) {
    const x = n - mid;
    const sinc = x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
    const r = x / mid;
    h[n] = sinc * besselI0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / i0b;
    sum += h[n];
  }
  for (let n = 0; n < L; n++) h[n] /= sum;
  return h;
}

function bandFrames(channels, sampleRate) {
  const key = channels[0];
  const hit = CACHE.get(key);
  if (hit && hit.sampleRate === sampleRate && hit.N === key.length && hit.nCh === channels.length) return hit;

  const nCh = channels.length, N = key.length;
  const D1 = Math.max(1, Math.round(sampleRate / 11025));
  const fs1 = sampleRate / D1;
  const D2 = Math.max(1, Math.round(fs1 / DECIM_HZ));
  const D = D1 * D2, fsD = sampleRate / D;
  const nFr = Math.floor(N / D), N1 = nFr * D2;

  // Full rate: mono + total energy per block, one pass.
  const mono = new Float32Array(N);
  const eAll = new Float32Array(nFr);
  const a = channels[0], b = nCh > 1 ? channels[1] : null;
  for (let f = 0, i = 0; f < N; f++) {
    const end = Math.min(N, i + D);
    let s = 0;
    if (nCh === 1) for (; i < end; i++) { const x = a[i]; mono[i] = x; s += x * x; }
    else if (nCh === 2) for (; i < end; i++) { const x = (a[i] + b[i]) * 0.5; mono[i] = x; s += x * x; }
    else for (; i < end; i++) { let x = 0; for (let c = 0; c < nCh; c++) x += channels[c][i]; x /= nCh; mono[i] = x; s += x * x; }
    if (f < nFr) eAll[f] = s / D;
    if (i >= N) break;
  }
  // ×D1 decimation, linear phase, centred on input sample m·D1 (zero delay). The taps are
  // symmetric, so each pair of samples shares one multiply.
  let x1;
  if (D1 === 1) x1 = mono.subarray(0, N1);
  else {
    x1 = new Float32Array(N1);
    const L = FIR_TAPS, h = firTaps(D1, L), half = (L - 1) / 2, hc = h[half];
    for (let m = 0; m < N1; m++) {
      const c = m * D1;
      let acc = 0;
      if (c - half >= 0 && c + half < N) {
        acc = hc * mono[c];
        for (let k = 0; k < half; k++) acc += h[k] * (mono[c - half + k] + mono[c + half - k]);
      } else {
        for (let k = 0; k < L; k++) { const i = c - half + k; if (i >= 0 && i < N) acc += h[k] * mono[i]; }
      }
      x1[m] = acc;
    }
  }
  // fs1: LP2 @ 3 kHz (energy) and LP4 @ 200 Hz (energy + the decimated kick path).
  const low = new Float32Array(nFr), eLow = new Float32Array(nFr), eMid = new Float32Array(nFr), eHigh = new Float32Array(nFr);
  const [h0, h1, h2, h3, h4] = lpCoef(HIGH_SPLIT, fs1, BW2);
  const [a0, a1, a2, a3, a4] = lpCoef(LOW_SPLIT, fs1, BW4[0]);
  const [b0, b1, b2, b3, b4] = lpCoef(LOW_SPLIT, fs1, BW4[1]);
  let hx1 = 0, hx2 = 0, hy1 = 0, hy2 = 0, ax1 = 0, ax2 = 0, ay1 = 0, ay2 = 0, bx1 = 0, bx2 = 0, by1 = 0, by2 = 0;
  for (let f = 0, i = 0; f < nFr; f++) {
    let s3 = 0, s2 = 0, y = 0;
    for (let j = 0; j < D2; j++, i++) {
      const x = x1[i];
      const y3 = h0 * x + h1 * hx1 + h2 * hx2 - h3 * hy1 - h4 * hy2;
      hx2 = hx1; hx1 = x; hy2 = hy1; hy1 = y3;
      s3 += y3 * y3;
      const ya = a0 * x + a1 * ax1 + a2 * ax2 - a3 * ay1 - a4 * ay2;
      ax2 = ax1; ax1 = x; ay2 = ay1; ay1 = ya;
      y = b0 * ya + b1 * bx1 + b2 * bx2 - b3 * by1 - b4 * by2;
      bx2 = bx1; bx1 = ya; by2 = by1; by1 = y;
      s2 += y * y;
    }
    low[f] = y;
    const e3 = s3 / D2, e2 = s2 / D2;
    eLow[f] = e2;
    eMid[f] = e3 > e2 ? e3 - e2 : 0;
    eHigh[f] = eAll[f] > e3 ? eAll[f] - e3 : 0;
  }
  // low[f] is fs1 sample f·D2 + D2 − 1, i.e. input sample (f·D2 + D2 − 1)·D1.
  const out = { sampleRate, N, nCh, D, D1, D2, fs1, fsD, nFr, low, lowT0: ((D2 - 1) * D1) / sampleRate,
    eLow, eMid, eHigh, eAll, duration: N / sampleRate, kick: null };
  CACHE.set(key, out);
  return out;
}

// Mean of a per-block array over [ta, tb) seconds (block f covers samples [fD, fD+D)).
function blockMean(bf, arr, ta, tb) {
  const a = clamp(Math.round(ta * bf.sampleRate / bf.D), 0, bf.nFr);
  const b = clamp(Math.round(tb * bf.sampleRate / bf.D), 0, bf.nFr);
  if (b <= a) return 0;
  let s = 0;
  for (let i = a; i < b; i++) s += arr[i];
  return s / (b - a);
}

// ── Stage 2: the kick-band amplitude envelope (zero phase) ───────────────────────────────
function kickEnvelope(bf) {
  if (bf.kick) return bf.kick;
  const { fsD, nFr } = bf;
  const x = Float32Array.from(bf.low);
  // Undo the forward low-pass's phase: the same 4th-order low-pass, backward, at fsD.
  runBiquad(x, lpCoef(LOW_SPLIT, fsD, BW4[0]), true);
  runBiquad(x, lpCoef(LOW_SPLIT, fsD, BW4[1]), true);
  zeroPhase(x, [hpCoef(KICK_HP, fsD, BW2)]);
  // Complex demodulation to baseband; the phasor is rotated, renormalised every 1024 steps.
  const re = new Float32Array(nFr), im = new Float32Array(nFr);
  const w = 2 * Math.PI * DEMOD_HZ / fsD, cw = Math.cos(w), sw = Math.sin(w);
  let pc = 1, ps = 0;
  for (let i = 0; i < nFr; i++) {
    re[i] = x[i] * pc; im[i] = -x[i] * ps;
    const nc = pc * cw - ps * sw; ps = pc * sw + ps * cw; pc = nc;
    if ((i & 1023) === 1023) { const r = 1 / Math.hypot(pc, ps); pc *= r; ps *= r; }
  }
  const lps = [lpCoef(DEMOD_LP, fsD, BW4[0]), lpCoef(DEMOD_LP, fsD, BW4[1])];
  zeroPhase(re, lps);
  zeroPhase(im, lps);
  const env = new Float32Array(nFr);
  for (let i = 0; i < nFr; i++) env[i] = 2 * Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  // ⚠ A HARMONIC BASS BEATS AT ITS FUNDAMENTAL. The envelope of a 55 Hz note with a 110 Hz
  // partial, both inside the band, rises and falls every 18 ms — measured on the offbeat-bass
  // fixture, twenty ripple "onsets" per note each a quarter of a kick's, whose summed weight
  // outvoted the kicks and put the grid on the bass. So the SEARCH reads a slow envelope: two
  // passes of a centred 20 ms boxcar (zero phase; −40 dB and more on 40–70 Hz ripple). The fast
  // envelope stays for per-beat timing, where the kick is the largest thing in its window.
  const slow = boxcar(boxcar(env, Math.round(SLOW_WIN * fsD)), Math.round(SLOW_WIN * fsD));
  bf.kick = { env, slow, fsD, t0: bf.lowT0, dt: 1 / fsD };
  return bf.kick;
}
// Centred moving average of odd length ≈ len (zero phase), edges averaged over what exists.
function boxcar(x, len) {
  const h = Math.max(1, Math.floor(len / 2)), n = x.length, out = new Float32Array(n);
  let s = 0, a = 0, b = -1;                 // current window [a, b]
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - h), hi = Math.min(n - 1, i + h);
    while (b < hi) s += x[++b];
    while (a < lo) s -= x[a++];
    out[i] = s / (b - a + 1);
  }
  return out;
}
const envIndex = (k, t) => (t - k.t0) * k.fsD;
function envMax(k, ta, tb, slow) {
  const e = slow ? k.slow : k.env;
  const a = Math.max(0, Math.ceil(envIndex(k, ta))), b = Math.min(e.length - 1, Math.floor(envIndex(k, tb)));
  let m = 0;
  for (let i = a; i <= b; i++) if (e[i] > m) m = e[i];
  return m;
}
function envMin(k, ta, tb, slow) {
  const e = slow ? k.slow : k.env;
  const a = Math.max(0, Math.ceil(envIndex(k, ta))), b = Math.min(e.length - 1, Math.floor(envIndex(k, tb)));
  if (b < a) return 0;
  let m = Infinity;
  for (let i = a; i <= b; i++) if (e[i] < m) m = e[i];
  return m;
}

// ── Stage 3: onsets ────────────────────────────────────────────────────────────────────────
// Local maxima of the envelope's rising slope (central difference), parabola-interpolated.
function onsetPeaks(k, which) {
  const e = which === 'slow' ? k.slow : k.env, n = e.length;
  const d = new Float32Array(n);
  for (let i = 1; i < n - 1; i++) { const s = (e[i + 1] - e[i - 1]) * 0.5; d[i] = s > 0 ? s : 0; }
  let dMax = 0;
  for (let i = 0; i < n; i++) if (d[i] > dMax) dMax = d[i];
  const peaks = [];
  if (!(dMax > 0)) return peaks;
  const floor = dMax * 0.01;
  for (let i = 2; i < n - 2; i++) {
    const v = d[i];
    if (v <= floor || v < d[i - 1] || v <= d[i + 1]) continue;
    const a = d[i - 1], c = d[i + 1], den = a - 2 * v + c;
    const off = den < 0 ? clamp(0.5 * (a - c) / den, -0.5, 0.5) : 0;
    peaks.push({ t: k.t0 + (i + off) / k.fsD, d: v - 0.25 * (a - c) * off });
  }
  return peaks;
}
// Sorted peak times → index of the first peak with t ≥ x.
function lowerBound(peaks, x) {
  let lo = 0, hi = peaks.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (peaks[m].t < x) lo = m + 1; else hi = m; }
  return lo;
}
function strongest(peaks, ta, tb) {
  let best = null;
  for (let i = lowerBound(peaks, ta); i < peaks.length && peaks[i].t <= tb; i++) if (!best || peaks[i].d > best.d) best = peaks[i];
  return best;
}

// ── Stage 4: tempo ─────────────────────────────────────────────────────────────────────────
function resultant(peaks, period) {
  let re = 0, im = 0, tot = 0;
  const w = 2 * Math.PI / period;
  for (let i = 0; i < peaks.length; i++) {
    const p = peaks[i], a = w * p.t;
    re += p.d * Math.cos(a); im += p.d * Math.sin(a); tot += p.d;
  }
  if (!(tot > 0)) return { score: 0, phase: 0 };
  let ang = Math.atan2(im, re);
  if (ang < 0) ang += 2 * Math.PI;
  return { score: Math.hypot(re, im) / tot, phase: (ang / (2 * Math.PI)) * period };
}
// A gentle prior: house lives around 120; a candidate an octave away needs a much longer
// resultant to win. Inside the default 100–140 window it moves a score by ≤ 5 %.
// ⚠ BELT-AND-BRACES, MEASURED: over a 60–240 range the metrical check below carries the octave
// guard alone (without it the 100 BPM fixture locks to 200 and is refused); dropping this prior
// changes no answer unless the metrical check is gone too (then 120 fails as well). Kept because
// the two fail on different signals — the prior on a kick-only grid, the check on offbeats.
const tempoPrior = (bpm) => Math.exp(-0.5 * (Math.log2(bpm / 122) / 0.8) ** 2);

function combSearch(strong, bpmMin, bpmMax, duration) {
  const step = clamp(7.5 / Math.max(duration, 1), 0.01, 0.1);
  let best = null, sum = 0, n = 0;
  const scores = [];
  for (let bpm = bpmMin; bpm <= bpmMax + 1e-9; bpm += step) {
    const r = resultant(strong, 60 / bpm);
    const s = r.score * tempoPrior(bpm);
    scores.push({ bpm, s, raw: r.score });
    sum += r.score; n++;
    if (!best || s > best.s) best = { bpm, s, raw: r.score, phase: r.phase };
  }
  if (!best) return null;
  // golden-section refinement of the weighted score around the best step
  let a = Math.max(bpmMin, best.bpm - step), b = Math.min(bpmMax, best.bpm + step);
  const f = (bpm) => resultant(strong, 60 / bpm).score * tempoPrior(bpm);
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = b - g * (b - a), x2 = a + g * (b - a), f1 = f(x1), f2 = f(x2);
  while (b - a > 0.0005) {
    if (f1 > f2) { b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = f(x1); }
    else { a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = f(x2); }
  }
  const bpm = (a + b) / 2;
  const r = resultant(strong, 60 / bpm);
  return { bpm, phase: r.phase, score: r.score, mean: sum / n, scores };
}

// Onset strength at every beat of a grid (for the metrical octave check).
function gridStrength(peaks, bpm, phase, duration) {
  const p = 60 / bpm, w = Math.min(0.12 * p, 0.05);
  const out = [];
  for (let k = Math.ceil((0 - phase) / p); phase + k * p < duration; k++) {
    const t = phase + k * p;
    const pk = strongest(peaks, t - w, t + w);
    out.push({ k, s: pk ? pk.d : 0 });
  }
  return out;
}

// ── Stage 5: fit the grid ──────────────────────────────────────────────────────────────────
// Weighted-equal robust line through (beat index, matched kick onset time).
function lineFit(pts) {
  let sw = 0, sk = 0, st = 0;
  for (const q of pts) { sw += 1; sk += q.k; st += q.t; }
  const mk = sk / sw, mt = st / sw;
  let skk = 0, skt = 0;
  for (const q of pts) { const dk = q.k - mk; skk += dk * dk; skt += dk * (q.t - mt); }
  if (!(skk > 0)) return null;
  const period = skt / skk;
  return { period, phase: mt - period * mk };   // phase = time of beat index 0
}
function robustFit(pts) {
  let use = pts.slice(), fit = null;
  for (let it = 0; it < 4; it++) {
    if (use.length < 4) return null;
    fit = lineFit(use);
    if (!fit) return null;
    const res = use.map((q) => Math.abs(q.t - (fit.phase + fit.period * q.k)));
    const mad = median(res);
    const cut = Math.max(0.004, 3 * 1.4826 * mad);
    const next = use.filter((q, i) => res[i] <= cut);
    if (next.length === use.length) break;
    use = next;
  }
  if (!fit || use.length < 4) return null;
  let ss = 0;
  for (const q of use) { const r = q.t - (fit.phase + fit.period * q.k); ss += r * r; }
  return { ...fit, used: use, rms: Math.sqrt(ss / use.length) };
}

function fitGrid(K, peaks, bpm0, phase0, duration) {
  let period = 60 / bpm0;
  // Anchor beat index 0 at the first grid beat at or after −NEG_TOL, so indices are ≥ 0.
  let phase = phase0 - Math.floor((phase0 + NEG_TOL) / period) * period;
  let fit = null, matched = [];
  for (let it = 0; it < 3; it++) {
    const w = it === 0 ? Math.min(0.13 * period, 0.07) : Math.min(0.07 * period, 0.035);
    matched = [];
    for (let k = 0; phase + k * period < duration; k++) {
      const t = phase + k * period;
      const pk = strongest(peaks, t - w, t + w);
      if (pk) matched.push({ k, t: pk.t, d: pk.d });
    }
    if (matched.length < 8) return null;
    // Keep the beats that carry a real kick onset: a transient, and at least a third of the
    // typical kick's slope. (Layered with the grid-level transient count in analyzeTrack, which
    // alone already refuses the pad-only fixtures; this one keeps non-kick peaks out of the
    // least-squares line on real music.)
    const trans = matched.filter((q) => transientAt(K, q.t, 0.07).q >= TRANSIENT_Q);
    if (trans.length < 8) return null;
    const dTyp = median(trans.map((q) => q.d).filter((d, _, a) => d >= 0.25 * quantile(a, 0.9)));
    const kicks = trans.filter((q) => q.d >= 0.3 * dTyp);
    const f = robustFit(kicks);
    if (!f) return null;
    fit = f;
    // Re-anchor index 0 to the first beat ≥ −NEG_TOL on the refined grid
    // (t = fit.phase + k·P = phase + (k + shift)·P).
    const shift = Math.floor((fit.phase + NEG_TOL) / fit.period);
    period = fit.period;
    phase = fit.phase - shift * period;
    if (shift !== 0) for (const q of fit.used) q.k += shift;
  }
  // Split-half: the two halves of the kicked beats, fit independently.
  const used = fit.used;
  const mid = used[Math.floor(used.length / 2)].k;
  const fa = used.length >= 16 ? robustFit(used.filter((q) => q.k < mid)) : null;
  const fb = used.length >= 16 ? robustFit(used.filter((q) => q.k >= mid)) : null;
  return {
    period, phase, rms: fit.rms, used,
    halves: fa && fb ? [60 / fa.period, 60 / fb.period] : null,
  };
}

// ── Stage 6: structure ─────────────────────────────────────────────────────────────────────
// A kick is a TRANSIENT. At an onset time t: a = the envelope's rise (peak just after t over
// the valley before it — a held sub-bass is a high valley, not a rise) and q = a / peak, the
// fraction of the envelope that is NEW. q is scale-free: ≈ 0.7–1 for a kick even over a
// sustained sub, ≈ 0.1–0.2 for a pad swell. ⚠ It is the gate that stops a fabricated grid:
// measured before it existed, 3 of 10 pad-only fixtures fitted a "tempo" (105.8 / 114.9 /
// 128.3 BPM, halves agreeing to 0.1 BPM) through dense sub-percent wobble peaks, because a
// relative strength floor makes ANY peak typical when nothing is loud.
// ⚠ It reads the SLOW envelope: on the fast one a sustained harmonic bass ripples ±25 % at its
// fundamental and a ripple crest over the trough before it reads q ≈ 0.4 — a "transient" every
// 18 ms (measured on the pad-only fixture's low voice). The slow envelope's rise is spread over
// ±20 ms, so the valley window ends 25 ms before the onset.
function transientAt(k, t, preSec) {
  const pk = envMax(k, t - 0.005, t + 0.05, true);
  const va = envMin(k, t - Math.max(preSec, 0.045), t - 0.025, true);
  const a = Math.max(0, pk - va);
  return { a, q: pk > 0 ? a / pk : 0 };
}
const TRANSIENT_Q = 0.3;           // a matched onset must be at least this much new envelope

function barPhaseFromKicks(s) {
  // s[k] = presence 0..1 at beat index k. Votes: the first steady entry (weight 2) and every
  // entry after a gap of ≥ 4 kick-less beats (weight 1) — a drop lands on bar 1.
  const votes = [0, 0, 0, 0];
  let firstEntry = -1, gap = Infinity;
  for (let k = 0; k < s.length; k++) {
    if (s[k] < 0.25) { gap++; continue; }
    if (s[k] >= 0.5 && gap >= 4) {
      let steady = 0;
      for (let j = k; j < Math.min(s.length, k + 8); j++) if (s[j] >= 0.4) steady++;
      if (steady >= Math.min(6, s.length - k)) {
        votes[k % 4] += firstEntry < 0 ? 2 : 1;
        if (firstEntry < 0) firstEntry = k;
      }
    }
    gap = 0;
  }
  if (firstEntry < 0) return null;
  let r = firstEntry % 4;
  for (let q = 0; q < 4; q++) if (votes[q] > votes[r]) r = q;
  return { r, firstEntry };
}

function findFade(E, body, lengthBars) {
  // The final fall-off: every bar after `last` is below 0.9 × body.
  let last = -1;
  for (let b = 0; b < lengthBars; b++) if (E[b] >= 0.9 * body) last = b;
  if (last < 0) return null;
  let fall = last + 1;
  // A fade (a steady decline, not a step): fit a line through the declining bars and take
  // where it crosses the body level — the fade's start — exact for a linear fade.
  const R = [];
  for (let b = last; b < lengthBars && E[b] > 0.12 * body; b++) R.push(b);
  if (R.length >= 3) {
    let mono = true;
    for (let i = 1; i < R.length; i++) if (E[R[i]] > E[R[i - 1]] + 0.03 * body) mono = false;
    const drop = E[R[0]] - E[R[R.length - 1]];
    if (mono && drop >= 0.35 * body) {
      let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const b of R) { const x = b + 0.5, y = E[b]; n++; sx += x; sy += y; sxx += x * x; sxy += x * y; }
      const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), icpt = (sy - slope * sx) / n;
      let ssr = 0, sst = 0;
      const my = sy / n;
      for (const b of R) { const y = E[b], f = icpt + slope * (b + 0.5); ssr += (y - f) ** 2; sst += (y - my) ** 2; }
      const r2 = sst > 0 ? 1 - ssr / sst : 0;
      if (slope < 0 && r2 >= 0.9) {
        const cross = (body - icpt) / slope;         // bar position where the line = body
        const start = Math.round(cross);
        if (start >= last - 2 && start <= fall) fall = Math.max(0, start);
      }
    }
  }
  return fall;
}

// ── The public API ─────────────────────────────────────────────────────────────────────────
/**
 * Measure a decoded track.
 * @param {Float32Array[]} channels  1 or 2 (or more) channels of PCM, equal length
 * @param {number} sampleRate
 * @param {{bpmMin?:number, bpmMax?:number, blendBars?:number}} [opts]
 * @returns meta — see the header. Extra fields: phraseOffset, blendBars, mixOutFits,
 *   halvesBpm, residualMs, beatsFit, reason (why bpm is null), analysisVersion.
 */
export function analyzeTrack(channels, sampleRate, opts = {}) {
  checkInput(channels, sampleRate, 'analyzeTrack');
  const o = opts || {};
  const bpmMin = o.bpmMin == null ? 100 : Number(o.bpmMin);
  const bpmMax = o.bpmMax == null ? 140 : Number(o.bpmMax);
  if (!(Number.isFinite(bpmMin) && Number.isFinite(bpmMax) && bpmMin > 0 && bpmMax > bpmMin)) {
    throw new RangeError('analyzeTrack: need 0 < bpmMin < bpmMax');
  }
  const blendBars = o.blendBars == null ? BLEND_BARS : Math.round(clamp(Number(o.blendBars) || BLEND_BARS, 8, 64));

  const bf = bandFrames(channels, sampleRate);
  const duration = bf.duration;
  const refuse = (reason, confidence) => ({
    bpm: null, beatSec: null, downbeatSec: null, firstKickBar: null, lengthBars: 0,
    kickByBar: [], energyByBar: [], breakdowns: [], outroBar: null, mixOutBar: null, mixInFromBar: null,
    confidence: round(clamp(confidence, 0, 0.49), 3), reason, blendBars, analysisVersion: 1,
  });
  if (duration < 6) return refuse('too-short', 0);

  const K = kickEnvelope(bf);
  const peaks = onsetPeaks(K, 'fast');                // per-beat timing
  const slowPeaks = onsetPeaks(K, 'slow');            // the tempo/phase search
  if (slowPeaks.length < 8) return refuse('no-onsets', 0);

  // The tempo search sees the onsets that matter: ≥ 15 % of the loud ones.
  const dRef = quantile(slowPeaks.map((p) => p.d), 0.98);
  const strong = slowPeaks.filter((p) => p.d >= 0.15 * dRef);
  const comb = combSearch(strong, bpmMin, bpmMax, duration);
  if (!comb || !(comb.score > 0)) return refuse('no-periodicity', 0);

  // Octave guard. Halve while the grid's alternate beats are empty (a subdivision of the
  // real beat), double while its half-beats carry as much kick as its beats.
  let bpm0 = comb.bpm, phase0 = comb.phase;
  for (let guard = 0; guard < 3; guard++) {
    const gs = gridStrength(strong, bpm0, phase0, duration);
    let even = 0, odd = 0;
    for (const g of gs) { if (((g.k % 2) + 2) % 2 === 0) even += g.s; else odd += g.s; }
    if (bpm0 / 2 >= bpmMin && Math.min(even, odd) < 0.45 * Math.max(even, odd)) {
      if (odd > even) phase0 += 60 / bpm0;
      bpm0 /= 2;
      const r = resultant(strong, 60 / bpm0);
      phase0 = r.phase;
      continue;
    }
    if (bpm0 * 2 <= bpmMax) {
      const half = gridStrength(strong, bpm0, phase0 + 30 / bpm0, duration);
      const hs = half.reduce((a, g) => a + g.s, 0), bs = even + odd;
      if (hs >= 0.8 * bs) { bpm0 *= 2; phase0 = resultant(strong, 60 / bpm0).phase; continue; }
    }
    break;
  }

  const grid = fitGrid(K, peaks, bpm0, phase0, duration);
  if (!grid) return refuse('no-grid', 0.2 * comb.score);
  const bpmFit = 60 / grid.period;
  if (!(bpmFit >= bpmMin - 0.5 && bpmFit <= bpmMax + 0.5)) return refuse('grid-out-of-range', 0.2 * comb.score);

  // Per-beat kick presence on the fitted grid: loudness relative to the track's kicks, gated
  // by being a transient (q). Amplitude units, so a kick 6 dB down reads 0.5, not 0.25.
  const P = grid.period;
  const nBeats = Math.floor((duration - grid.phase) / P) + 1;
  const A = [], Q = [];
  for (let k = 0; k < nBeats; k++) {
    const t = grid.phase + k * P;
    const tr = t < duration - 0.05 ? transientAt(K, t, 0.35 * P) : { a: 0, q: 0 };
    A.push(tr.a); Q.push(tr.q);
  }
  const realA = A.filter((_, k) => Q[k] >= 0.5);
  const aRef = realA.length ? quantile(realA, 0.75) : 0;
  const gateQ = (q) => clamp((q - 0.2) / 0.25, 0, 1);   // 0 below q 0.2, 1 from q 0.45
  const s = A.map((a, k) => (aRef > 0 ? clamp(a / aRef, 0, 1) * gateQ(Q[k]) : 0));

  // Evidence for the confidence (and the gates).
  const used = grid.used;
  const usedQ = used.map((u) => Q[u.k] == null ? 0 : Q[u.k]);
  const nTrans = usedQ.filter((q) => q >= 0.45).length;
  const kSpan = used[used.length - 1].k - used[0].k + 1;
  const coverage = used.length / kSpan;               // kicks found inside the kicked span
  const cCount = clamp((nTrans - 8) / 24, 0, 1);
  const cCov = clamp((coverage - 0.3) / 0.5, 0, 1);
  const cRes = Math.exp(-(((grid.rms * 1000) / 10) ** 2));
  const split = grid.halves ? Math.abs(grid.halves[0] - grid.halves[1]) : null;
  const cSplit = split == null ? 0.7 : Math.exp(-((split / 0.35) ** 2));
  const cTrans = clamp((median(usedQ) - 0.3) / 0.3, 0, 1);
  const cComb = clamp(comb.score / 0.5, 0, 1);
  const confidence = clamp(cCount * cCov * cRes * cSplit * cTrans * (0.6 + 0.4 * cComb), 0, 1);
  if (nTrans < 12 || coverage < 0.35 || (split != null && split > 1.5) || grid.rms > 0.02) {
    return refuse('weak-grid', confidence);
  }

  const bp = barPhaseFromKicks(s);
  if (!bp) return refuse('no-kick', Math.min(confidence, 0.3));

  // Bar 0 = the earliest downbeat (beat ≡ r mod 4) at or after −NEG_TOL.
  const bar0Beat = bp.r;                               // beat 0 is the first beat ≥ −NEG_TOL
  const bpm = round(bpmFit, 2);
  const beatSec = 60 / bpm;
  const barSec = beatSec * BEATS_PER_BAR;
  const downbeatSec = grid.phase + bar0Beat * P;
  const lengthBars = Math.max(0, Math.floor((duration - downbeatSec) / barSec + 1e-6));
  const beatT = (bar, beat) => downbeatSec + (bar * BEATS_PER_BAR + beat) * beatSec;

  // Per bar: kick presence (mean of its beats) and broadband RMS.
  const kickByBar = [], energyRaw = [];
  for (let b = 0; b < lengthBars; b++) {
    let ks = 0;
    for (let q = 0; q < BEATS_PER_BAR; q++) {
      const k = bar0Beat + b * BEATS_PER_BAR + q;
      ks += k < s.length ? s[k] : 0;
    }
    kickByBar.push(round(ks / BEATS_PER_BAR, 3));
    energyRaw.push(Math.sqrt(blockMean(bf, bf.eAll, beatT(b, 0), beatT(b + 1, 0))));
  }
  const eMax = energyRaw.reduce((m, v) => Math.max(m, v), 0) || 1;
  const energyByBar = energyRaw.map((v) => round(v / eMax, 3));
  const kicked = kickByBar.map((v) => v >= KICK_ON);

  // First steady kick bar.
  let firstKickBar = -1;
  for (let b = 0; b < lengthBars; b++) {
    if (kicked[b] && (b + 1 >= lengthBars || kicked[b + 1])) { firstKickBar = b; break; }
  }
  if (firstKickBar < 0) return refuse('no-kick', Math.min(confidence, 0.3));
  let lastKickBar = firstKickBar;
  for (let b = lengthBars - 1; b >= firstKickBar; b--) if (kicked[b]) { lastKickBar = b; break; }
  const kickGoneBar = lastKickBar + 1;

  // Breakdowns: kick-less runs of ≥ 2 bars strictly inside the kicked span. endBar is
  // EXCLUSIVE — the bar the kick returns on (the drop).
  const breakdowns = [];
  for (let b = firstKickBar; b <= lastKickBar; b++) {
    if (kicked[b]) continue;
    let e = b;
    while (e <= lastKickBar && !kicked[e]) e++;
    if (e - b >= 2) breakdowns.push({ startBar: b, endBar: e });
    b = e;
  }

  // The outro: kick gone for good, or the final energy fall-off / fade — whichever is first.
  const bodyE = median(energyByBar.filter((_, b) => kicked[b]));
  const fall = findFade(energyByBar, bodyE, lengthBars);
  let outroBar = kickGoneBar;
  if (fall != null && fall > firstKickBar && fall < outroBar) outroBar = fall;

  // Phrases follow the kick's entry (bar 0 of the grid may be a pickup of a partial intro).
  const phraseOffset = ((firstKickBar % PHRASE_BARS) + PHRASE_BARS) % PHRASE_BARS;
  const phraseFloor = (bar) => Math.floor((bar - phraseOffset) / PHRASE_BARS) * PHRASE_BARS + phraseOffset;

  // mixInFromBar: start where the beat is (a kick-less intro cannot be beat-matched by ear,
  // and the incoming fader rides up from the blend's bar 0).
  const mixInFromBar = firstKickBar;

  // mixOutBar: the LATEST phrase bar m where the incoming blend's bar 0 can land so the
  // planned out-fade (outgoing fader 0 at m + L, deck stopped at m + L + 0.25) is finished by
  // outroBar + TAIL, preferring a start where the outgoing track is full (kick through the
  // first half of the blend, where it still carries the low end).
  const limit = outroBar + TAIL_BARS - blendBars - STOP_AFTER;
  let mixOutBar = phraseFloor(limit);
  let mixOutFits = mixOutBar >= Math.max(0, firstKickBar) - 1e-9;
  if (!mixOutFits) {
    mixOutBar = phraseFloor(Math.max(0, firstKickBar)) < 0 ? phraseOffset : phraseFloor(Math.max(0, firstKickBar));
    if (mixOutBar < Math.max(0, firstKickBar)) mixOutBar += PHRASE_BARS;
    mixOutFits = mixOutBar <= limit + 1e-9;
  } else {
    const penalty = (m) => {
      let n = 0;
      for (let b = m; b < Math.min(m + blendBars / 2, lengthBars); b++) if (!kicked[b]) n++;
      return n;
    };
    let best = mixOutBar, bestPen = penalty(mixOutBar);
    for (let m = mixOutBar - PHRASE_BARS; m >= Math.max(firstKickBar, mixOutBar - 2 * PHRASE_BARS) && bestPen > 0; m -= PHRASE_BARS) {
      const pen = penalty(m);
      if (pen < bestPen) { best = m; bestPen = pen; }
    }
    mixOutBar = best;
  }

  return {
    bpm,
    beatSec,
    downbeatSec: round(downbeatSec, 6),
    firstKickBar,
    lengthBars,
    kickByBar,
    energyByBar,
    breakdowns,
    outroBar,
    mixOutBar,
    mixInFromBar,
    confidence: round(confidence, 3),
    // extras
    bpmPrecise: round(bpmFit, 4),
    phraseOffset,
    blendBars,
    mixOutFits,
    halvesBpm: grid.halves ? grid.halves.map((v) => round(v, 3)) : null,
    residualMs: round(grid.rms * 1000, 2),
    beatsFit: used.length,
    reason: null,
    analysisVersion: 1,
  };
}

/**
 * The CDJ screens' 3-band waveform: one {low, mid, high} per 16th note of the track's grid,
 * from meta.downbeatSec for meta.lengthBars bars (lengthBars × 16 entries). Each band is its
 * windowed RMS normalised to that band's loudest (the 99.5th-percentile 16th; so the loudest
 * kick ≈ 1 on low) and clipped to 0..1 — the renderer sets the bands' relative display scale.
 * With no grid (meta.bpm null) it falls back to a TIME grid of 8 columns a second from 0 s.
 */
export function bufferWaveform(channels, sampleRate, meta) {
  checkInput(channels, sampleRate, 'bufferWaveform');
  const bf = bandFrames(channels, sampleRate);
  let t0, step, n;
  if (meta && Number.isFinite(meta.bpm) && meta.bpm > 0 && Number.isFinite(meta.downbeatSec)) {
    step = 60 / meta.bpm / 4;
    t0 = meta.downbeatSec;
    n = Math.max(0, Math.floor(meta.lengthBars)) * 16;
  } else {
    step = 0.125;
    t0 = 0;
    n = Math.floor(bf.duration / step);
  }
  const lo = new Float32Array(n), mi = new Float32Array(n), hi = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    const a = t0 + j * step, b = a + step;
    lo[j] = Math.sqrt(blockMean(bf, bf.eLow, a, b));
    mi[j] = Math.sqrt(blockMean(bf, bf.eMid, a, b));
    hi[j] = Math.sqrt(blockMean(bf, bf.eHigh, a, b));
  }
  const ref = (arr) => quantile(arr, 0.995) || 1;
  const rl = ref(lo), rm = ref(mi), rh = ref(hi);
  const out = new Array(n);
  for (let j = 0; j < n; j++) {
    out[j] = { low: round(clamp(lo[j] / rl, 0, 1), 4), mid: round(clamp(mi[j] / rm, 0, 1), 4), high: round(clamp(hi[j] / rh, 0, 1), 4) };
  }
  return out;
}

// Exposed for tests and diagnostics (not part of the contract).
export const _internal = { transientAt, bandFrames, kickEnvelope, onsetPeaks, combSearch, fitGrid, resultant, tempoPrior };
