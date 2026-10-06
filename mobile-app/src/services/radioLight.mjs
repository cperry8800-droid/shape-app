import { hotFor } from '../../../public/newdesign/radioSignalField.mjs';

// The light engine for Shape Radio's light effects (Settings → Light effects):
// what the lights know about the music, frame by frame, and the pure maths of
// the lights themselves (their colours per paper, where each beam points, how
// bright each layer is). Pure: no DOM, no clock, no randomness; the caller passes
// the analyser's bins and the elapsed time. The layers that draw it are in
// broadsheet/iosAppRadioLights.jsx; the shared per-frame reading is in
// broadsheet/iosAppReactive.jsx.
//
// Three sources, and the lights never confuse them:
//   measured — the radio is playing and its analyser carries data: the lights
//              follow the music's level, its kicks and its drops;
//   idle     — the radio is playing but the stream cannot be read (no
//              Access-Control-Allow-Origin, or no stream at all): the lights
//              breathe slowly and claim no beat, because a beat drawn out of
//              time with the music a member can hear is worse than none;
//   demo     — nothing is playing (the Settings tap-to-preview): a 132 BPM
//              clock with a drop every eighth bar, so the member can see what
//              the mode does before they turn the radio on.
//
// The analyser is the radio's own (ShapeRadioLive.analyser(): fftSize 512, so
// 256 bins of ~86-94 Hz). Bands, in bins: bass 1-4 (~90-375 Hz: the kick and
// the bassline, the same window the Radio page's tempo detector reads), mid
// 5-23, high 24-95.

export const RL_BPM = 132;
export const RL_BEAT_MS = 60000 / RL_BPM;
export const RL_BAR_MS = RL_BEAT_MS * 4;
export const RL_BANDS = { bass: [1, 4], mid: [5, 23], high: [24, 95] };

// a kick: bass rising past its own recent average by this ratio...
export const RL_KICK_RATIO = 1.22;
// ...and by at least this much in absolute terms (0..1), so hiss cannot kick
export const RL_KICK_MIN = 0.08;
// never two kicks closer than this: 200 ms is 300 BPM, past any real kick
export const RL_KICK_REFRACTORY_MS = 200;
// the kick envelope's decay
export const RL_KICK_TAU_MS = 130;
// A drop is the kick coming back after a breakdown: a kick after at least this
// long without one. (Measured on the example track: a loudness surge is the wrong
// signal, because a breakdown's sustained pad reads LOUDER to a dB-scaled analyser
// than the drop that follows it.)
export const RL_DROP_GAP_MS = 2500;
// the drop holds for about a bar at 132 BPM, then eases out over this long
export const RL_DROP_HOLD_MS = 1800;
export const RL_DROP_FADE_MS = 1200;
// a stream's first kicks are not a drop: nothing came before them
export const RL_DROP_WARMUP_MS = 3000;

function rlMean(bins, [a, b]) {
  let s = 0, n = 0;
  for (let i = a; i <= b && i < bins.length; i++) { s += bins[i]; n++; }
  return n ? s / n / 255 : 0;
}

// An all-zero frame is a stream the analyser cannot read, never silence.
export function rlHasSignal(bins) {
  if (!bins || !bins.length) return false;
  for (let i = 0; i < bins.length; i++) if (bins[i] > 0) return true;
  return false;
}

export function rlBandsOf(bins) {
  return { bass: rlMean(bins, RL_BANDS.bass), mid: rlMean(bins, RL_BANDS.mid), high: rlMean(bins, RL_BANDS.high) };
}

export function rlInitial() {
  return { t: 0, level: 0, bass: 0, mid: 0, high: 0, bassSlow: 0, lastKick: -1e9, kicks: 0, dropAt: -1e9, measuredMs: 0 };
}

// exponential smoothing toward x with time constant tau over dt
function rlEase(prev, x, dt, tau) { return prev + (x - prev) * (1 - Math.exp(-Math.max(0, dt) / tau)); }

// One measured frame. Returns the next state; never mutates the one passed in.
export function rlStep(s0, bands, dtMs) {
  const dt = Math.max(0, Math.min(250, Number.isFinite(dtMs) ? dtMs : 0));
  // ⚠ THE SLOW AVERAGES START FROM WHAT THE FIRST FRAME READS, NOT FROM ZERO. From
  // zero, the first second of any stream reads as a surge (a "drop" four seconds in,
  // every time) and the first frames of plain hiss as kicks.
  const s = s0.measuredMs > 0 ? s0 : { ...s0, bassSlow: bands.bass };
  const t = s.t + dt;
  const e = 0.55 * bands.bass + 0.3 * bands.mid + 0.15 * bands.high;
  // fast attack, slower release: lights jump with a hit and fall back gently
  const level = e > s.level ? rlEase(s.level, e, dt, 30) : rlEase(s.level, e, dt, 320);
  const bass = bands.bass > s.bass ? rlEase(s.bass, bands.bass, dt, 15) : rlEase(s.bass, bands.bass, dt, 160);
  const mid = rlEase(s.mid, bands.mid, dt, 80);
  const high = rlEase(s.high, bands.high, dt, 60);
  const bassSlow = rlEase(s.bassSlow, bands.bass, dt, 900);
  let { lastKick, kicks, dropAt } = s;
  if (t - lastKick >= RL_KICK_REFRACTORY_MS && bands.bass >= bassSlow * RL_KICK_RATIO && bands.bass - bassSlow >= RL_KICK_MIN) {
    if (kicks > 0 && t - lastKick >= RL_DROP_GAP_MS && t >= RL_DROP_WARMUP_MS) dropAt = t;
    lastKick = t; kicks += 1;
  }
  return { t, level, bass, mid, high, bassSlow, lastKick, kicks, dropAt, measuredMs: s.measuredMs + dt };
}

// The drop envelope: in over ~120 ms, held a bar, eased out.
export function rlDropAt(s) {
  const since = s.t - s.dropAt;
  if (since < 0 || since > RL_DROP_HOLD_MS + RL_DROP_FADE_MS) return 0;
  if (since < 120) return since / 120;
  if (since <= RL_DROP_HOLD_MS) return 1;
  return 1 - (since - RL_DROP_HOLD_MS) / RL_DROP_FADE_MS;
}

// What every light reads. `kick` is 1 on a hit and decays; `bar` is a 0..1
// phase the sweeps ride (measured: free-running, it has no tempo to lock to).
export function rlRead(s, source) {
  const kick = Math.exp(-Math.max(0, s.t - s.lastKick) / RL_KICK_TAU_MS);
  return {
    source, measured: source === 'measured',
    level: s.level, bass: s.bass, mid: s.mid, high: s.high,
    kick: s.kicks === 0 ? 0 : kick, drop: rlDropAt(s),
    bar: (s.t % RL_BAR_MS) / RL_BAR_MS, barN: Math.floor(s.t / RL_BAR_MS), t: s.t,
  };
}

// The Settings preview: a 132 BPM clock, a drop on the third bar of every four,
// so the 6 s preview (3.3 bars) always shows one (3.6 s to 5.5 s in).
export const RL_DEMO_DROP_BAR = 2;
export function rlDemo(ms) {
  const t = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const beats = t / RL_BEAT_MS, phase = beats - Math.floor(beats);
  const barN = Math.floor(t / RL_BAR_MS), bar = (t % RL_BAR_MS) / RL_BAR_MS;
  const inDrop = barN % 4 === RL_DEMO_DROP_BAR;
  const kick = (1 - phase) ** 3;
  return {
    source: 'demo', measured: false,
    level: 0.5 + 0.25 * kick + (inDrop ? 0.15 : 0), bass: kick, mid: 0.4 + 0.2 * Math.sin(t / 900), high: 0.3 + 0.2 * Math.sin(t / 210),
    kick, drop: inDrop ? Math.min(1, 3 * Math.sin(Math.PI * bar)) : 0,
    bar, barN, t,
  };
}

// Playing, but nothing to read: a slow breath, no beat, no drop.
export function rlIdle(ms) {
  const t = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const breath = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 6000);
  return { source: 'idle', measured: false, level: 0.32 + 0.12 * breath, bass: 0, mid: 0, high: 0, kick: 0, drop: 0, bar: (t % 12000) / 12000, barN: Math.floor(t / 12000), t };
}

// ── the lights ──────────────────────────────────────────────────────────

const rlClamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export function rlHex(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : '#0ac5a8'; }
export function rlRgbOf(hex) { const n = parseInt(rlHex(hex).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
// "r,g,b" for an rgba(var(--x), a) that iOS 14 can read (no color-mix() before iOS 16.2)
export function rlRgbVar(hex) { return rlRgbOf(hex).join(','); }
function rlLum(rgb) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}
export function rlContrast(a, b) { const x = rlLum(rlRgbOf(a)), y = rlLum(rlRgbOf(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

export const RL_PAPER_DARK = '#0b0d10';
export const RL_PAPER_LIGHT = '#f2ede4';
const RL_INK = [20, 24, 28];
// ⚠ ON LIGHT PAPER A LIGHT IS A DEEPER SHADE, OR IT IS NOT SEEN. A pale tint on
// cream paper washes out, and cream itself IS the paper (owner, 2026-10-06:
// "light paper needs to be a little more visible"). So on light paper each gel is
// walked toward ink, keeping its hue, until it stands this far clear of the
// paper; a tint that already does is left as it is.
export const RL_LIGHT_CONTRAST = 2.6;
export function rlDeepen(hex) {
  const c = rlRgbOf(hex);
  const to = (k) => '#' + c.map((v, i) => Math.round(v + (RL_INK[i] - v) * k).toString(16).padStart(2, '0')).join('');
  for (let k = 0; k <= 0.75 + 1e-9; k += 0.025) { const m = to(k); if (rlContrast(m, RL_PAPER_LIGHT) >= RL_LIGHT_CONTRAST) return m; }
  return to(0.75);
}
// The two gels for a tint: the tint and its two-tone partner (the Radio page's
// hot tone), deepened on light paper.
export function rlGels(hex, isLight) {
  const a = rlHex(hex), b = rlHex(hotFor(a, isLight ? RL_PAPER_LIGHT : RL_PAPER_DARK));
  return isLight ? [rlDeepen(a), rlDeepen(b)] : [a, b];
}

// Four heads along the top edge (x as a share of the width); `base` and `amp` in
// degrees; `hot` heads carry the partner gel.
export const RL_HEADS = [
  { x: 0.13, base: 18, amp: 16, ph: 0.0, hot: false },
  { x: 0.38, base: 6, amp: 12, ph: 0.35, hot: true },
  { x: 0.62, base: -6, amp: 12, ph: 0.6, hot: false },
  { x: 0.87, base: -18, amp: 16, ph: 0.85, hot: true },
];
// a sweep that never points a beam off the screen's sides for long
export const RL_UNISON_DEG = 26;
// Where head i points: its own slow sweep, or, on the drop, every head together.
export function rlBeamAngle(i, read) {
  const h = RL_HEADS[i];
  const sweep = h.base + h.amp * Math.sin(2 * Math.PI * (read.bar / 2 + h.ph + Math.floor(read.barN / 2) * 0.5));
  const unison = RL_UNISON_DEG * Math.sin(2 * Math.PI * read.bar);
  const d = rlClamp01(read.drop);
  return sweep * (1 - d) + unison * d;
}
// How bright head i's beam is (0..1): the kick lands on alternate heads each
// beat, the drop opens them all, the music's level scales the whole rig.
export function rlBeamOn(i, read) {
  const beatN = read.barN * 4 + Math.floor(read.bar * 4);
  const alt = i % 2 === beatN % 2 ? 1 : 0.5;
  return rlClamp01((0.42 + 0.58 * read.kick * alt + 0.2 * read.drop) * rlLevelScale(read));
}
export function rlLevelScale(read) { return Math.min(1, 0.55 + 0.6 * read.level); }
export function rlWashOn(read) { return rlClamp01((0.55 + 0.25 * read.kick + 0.2 * read.drop) * rlLevelScale(read)); }
export function rlPoolOn(read) { return rlClamp01(0.45 + 0.55 * read.kick); }

// The edge light (Subtle and up): a strip of light down each side of the
// screen and along the floor. It sits at the edges, so it never crosses a word.
export function rlEdgeOn(read) { return rlClamp01(0.5 + 0.3 * read.level + 0.3 * read.kick); }
// a brighter patch travels down the sides once a bar (0 top .. 1 bottom)
export function rlEdgeChase(read) { return read.bar; }
