// keyDetect.mjs — the musical key of a decoded song, for Nora's harmonic mixing.
//
//   detectKey(channels, sampleRate) → { camelot: '8A' | null, pc, minor, confidence, reason }
//
// The method is the textbook one: a chromagram (how much energy each of the 12 pitch classes
// carries) summed over the song, then correlated with the Krumhansl–Kessler major and minor key
// profiles in all 12 transpositions; the best of the 24 is the key.
//
// ⚠ IT RETURNS camelot: null RATHER THAN GUESS. A song with too little pitched energy (spoken
// word, a drum track) or no clear winner is left keyless, and the planner then mixes it as it
// would mix a song in a clashing key: short, and on a phrase. `confidence` is the margin of the
// winner over the best key that is NOT its relative major/minor (the two share a Camelot number
// and mix the same way, so their closeness is not doubt).
//
// PURE: no DOM, no Web Audio, no clock, no randomness. Deterministic for the same PCM.

import { camelotOf } from './library.mjs';

const TARGET_RATE = 11025;        // decimated rate: pitch below ~2 kHz is all the chroma needs
const N = 4096;                   // frame (0.37 s at 11 kHz; 2.7 Hz bins)
const F_LO = 65;                  // C2: below it the bins are wider than a semitone
const F_HI = 2000;                // above it, harmonics and cymbals blur the chroma
const MIN_FRAMES = 16;            // ~6 s of music

// Krumhansl & Kessler (1982), tonic first.
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function mono(channels) {
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i];
  const k = 1 / channels.length;
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}

/** Decimate by an integer factor with a boxcar of that length (enough below 2 kHz). */
function decimate(x, factor) {
  if (factor <= 1) return x;
  const n = Math.floor(x.length / factor);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * factor;
    for (let j = 0; j < factor; j++) s += x[o + j];
    out[i] = s / factor;
  }
  return out;
}

/** In-place radix-2 FFT of (re, im), length a power of two. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

function pearson(a, b) {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

/** The song's chroma: 12 sums, C first, each frame normalised so a loud passage does not outvote the rest. */
export function chromagram(channels, sampleRate) {
  const factor = Math.max(1, Math.round(sampleRate / TARGET_RATE));
  const x = decimate(mono(channels), factor);
  const rate = sampleRate / factor;
  const hann = new Float32Array(N);
  for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  // Each bin's pitch class (or -1 outside the band).
  const pcOf = new Int8Array(N / 2);
  for (let k = 0; k < N / 2; k++) {
    const f = (k * rate) / N;
    pcOf[k] = f < F_LO || f > F_HI ? -1 : ((Math.round(12 * Math.log2(f / 440)) % 12) + 12 + 9) % 12;
  }
  const chroma = new Float64Array(12);
  const frame = new Float64Array(12);
  const re = new Float64Array(N), im = new Float64Array(N), mag = new Float64Array(N / 2);
  const frameEnergy = [];
  const frames = [];
  for (let o = 0; o + N <= x.length; o += N) {
    for (let i = 0; i < N; i++) { re[i] = x[o + i] * hann[i]; im[i] = 0; }
    fft(re, im);
    let e = 0;
    for (let k = 0; k < N / 2; k++) { mag[k] = Math.hypot(re[k], im[k]); if (pcOf[k] >= 0) e += mag[k] * mag[k]; }
    frame.fill(0);
    // Spectral peaks only: a bin counts when it tops both neighbours, which keeps the broadband
    // smear of drums out of the pitch classes.
    for (let k = 2; k < N / 2 - 1; k++) {
      const p = pcOf[k];
      if (p < 0) continue;
      if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1]) frame[p] += mag[k];
    }
    frames.push(Float64Array.from(frame));
    frameEnergy.push(e);
  }
  if (!frames.length) return { chroma: Array.from(chroma), frames: 0 };
  // Frames quieter than 1/50 of the median energy are silence and are skipped.
  const sorted = [...frameEnergy].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  let used = 0;
  for (let f = 0; f < frames.length; f++) {
    if (!(frameEnergy[f] > med / 50)) continue;
    let s = 0;
    for (let p = 0; p < 12; p++) s += frames[f][p];
    if (!(s > 0)) continue;
    for (let p = 0; p < 12; p++) chroma[p] += frames[f][p] / s;
    used++;
  }
  return { chroma: Array.from(chroma), frames: used };
}

/** The key of a decoded song, or camelot null with the reason. */
export function detectKey(channels, sampleRate) {
  if (!Array.isArray(channels) || !channels.length || !(channels[0] instanceof Float32Array) || !(sampleRate > 0)) {
    throw new TypeError('detectKey: need Float32Array channels and a sample rate');
  }
  const { chroma, frames } = chromagram(channels, sampleRate);
  if (frames < MIN_FRAMES) return { camelot: null, pc: null, minor: null, confidence: 0, reason: 'too-little-music' };
  const total = chroma.reduce((a, b) => a + b, 0);
  const flat = Math.max(...chroma) / (total / 12);
  if (!(flat > 1.15)) return { camelot: null, pc: null, minor: null, confidence: 0, reason: 'no-pitch-centre' };
  const scores = [];
  for (let pc = 0; pc < 12; pc++) {
    for (const minor of [false, true]) {
      const prof = minor ? MINOR : MAJOR;
      const rotated = chroma.map((_, i) => prof[(i - pc + 12) % 12]);
      scores.push({ pc, minor, r: pearson(chroma, rotated) });
    }
  }
  scores.sort((a, b) => b.r - a.r);
  const best = scores[0];
  const relativePc = best.minor ? (best.pc + 3) % 12 : (best.pc + 9) % 12;
  const rival = scores.find((s) => !(s.pc === best.pc && s.minor === best.minor) && !(s.pc === relativePc && s.minor !== best.minor));
  const margin = best.r - (rival ? rival.r : 0);
  const confidence = Math.max(0, Math.min(1, margin / 0.15)) * Math.max(0, Math.min(1, (best.r - 0.3) / 0.4));
  if (best.r < 0.4 || confidence < 0.1) return { camelot: null, pc: null, minor: null, confidence: Math.round(confidence * 1000) / 1000, reason: 'unclear' };
  return { camelot: camelotOf(best.pc, best.minor), pc: best.pc, minor: best.minor, confidence: Math.round(confidence * 1000) / 1000, reason: null };
}

export const _internal = { fft, pearson, decimate, MAJOR, MINOR };
