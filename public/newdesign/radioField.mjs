// radioField.mjs — the website Radio page's field: the wall and the cloud, composed.
//
// The wall is the room; the cloud is the light in it. Both are always on screen and
// the music decides which one leads. This module is the RULES — which figure the
// cloud is standing in, who leads, whether a kick is present, which band a wall
// column shows. The page owns the canvas and nothing else; a rule that lives here
// can be driven in Node, and a rule that lives in a draw call cannot.
//
// ⚠ THE WEBSITE ADDS A RENDERER, NEVER A RULE. Everything about the SIGNAL —
// the bands, the rest alpha, the kick envelope, the measured tempo — comes from
// radioSignalField.mjs and radioTempo.mjs, which the app draws its own Signal
// Field from. Those two files are canonical here in public/newdesign and the app
// imports them across the tree (the noraSets.mjs precedent), so a rule changed for
// the phone changes on the web in the same commit. Nothing in this file
// re-implements one of them.
//
// ⚠ AND NOTHING HERE MOVES WITHOUT A MEASUREMENT. The figure advances on a phrase
// counted off the detector's own beat, so a station whose tempo cannot be measured
// gets no phrase and no change — it does not fall back to a timer. The lead is
// read off the analyser's own low bins, never off a section map, because a section
// map would be typed in.

import { ecg } from './radioSignalField.mjs';
import { tempoEnergyFromBins } from './radioTempo.mjs';

// ---------------------------------------------------------------------------
// The song's own programme
// ---------------------------------------------------------------------------
// A seed from the title and the artist, so a song looks the same every play, on
// every device, on both surfaces. Nothing here reads the clock or Math.random.

export function radioSeed(title, artist) {
  const s = `${title == null ? '' : title}·${artist == null ? '' : artist}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// A small deterministic generator, so a programme's own random-ish choices (the
// jitter in a formation, say) are the same for the same song.
export function radioRng(seed) {
  let x = (seed >>> 0) || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

// ⚠ `wallLeads` IS THE SEED'S BIT PARITY, WHICH MAKES IT A PROPERTY OF THE SONG
// rather than of the running page: the same track leads the same way on every
// device, and a listener who joins late sees what everyone else is seeing. It is
// only consulted when there is no kick to read (the per-track mode, and the
// no-signal case) — with signal, the drop decides.
export function wallLeadsFor(seed) {
  let c = 0;
  let x = seed >>> 0;
  while (x) { c += x & 1; x >>>= 1; }
  return (c & 1) === 1;
}

export function radioProgram(title, artist) {
  const seed = radioSeed(title, artist);
  const r = radioRng(seed);
  return {
    seed,
    // the opening figure, and the song's own stride through the rest. The stride
    // is odd and CLOUD_FORMS.length is a power of two, so the two are coprime and
    // a long song visits every figure before repeating one.
    form: seed % CLOUD_FORMS.length,
    formStep: [1, 3, 5, 7][(seed >>> 3) & 3],
    flood: 1 + Math.floor(r() * 3),
    wallLeads: wallLeadsFor(seed),
  };
}

// ---------------------------------------------------------------------------
// The cloud's figures
// ---------------------------------------------------------------------------
// Eight formations: the five the homepage's own point cloud already draws, plus a
// heart (the strap's glyph), a record and the Signal Field's own mirrored spectrum
// drawn in points. Each returns a point in a unit-ish box; the page projects.
//
// ⚠ MODEL +y IS SCREEN-DOWN. The mark negates y for that reason and so does the
// heart — its first capture shipped upside down, which is the whole reason the
// sign is called out here rather than left to the next reader to rediscover.

export const CLOUD_N = 900;

export const CLOUD_FORM_NAMES = [
  'sphere', 'rings', 'ecg', 'dial', 'mark', 'heart', 'record', 'spectrum',
];

export const CLOUD_FORMS = [
  // sphere — the Fibonacci lattice, so the points are even rather than clumped at the poles
  (i, r, N) => {
    const y = 1 - (i / (N - 1)) * 2;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    const th = i * 2.399963;
    return [Math.cos(th) * rr, y, Math.sin(th) * rr];
  },
  // two rings, as tori
  (i, r, N) => {
    const k = i % 2;
    const a = (i / N) * Math.PI * 2 * 7;
    const b = r() * Math.PI * 2;
    const tube = 0.09;
    const R = (k ? 0.62 : 1) + Math.cos(b) * tube;
    const tilt = k ? 0.9 : -0.5;
    return [
      Math.cos(a) * R,
      Math.sin(a) * R * Math.sin(tilt) * 0.55 + (k ? 0.28 : -0.28) + Math.sin(b) * tube,
      Math.sin(a) * R * Math.cos(tilt),
    ];
  },
  // the ECG — the app's own glyph, so the trace on the phone and the figure on the
  // web are the same curve rather than two drawings of one idea
  (i, r, N) => {
    const x = (i / N) * 2 - 1;
    const u = (((i / N) * 4) % 1) * 0.42;
    return [x * 1.3, ecg(u) * 0.6 - 0.05, ((i % 9) - 4) * 0.02];
  },
  // the dial
  (i, r, N) => {
    const k = i % 3;
    const a = Math.PI * (0.15 + 0.7 * (i / N));
    if (k < 2) {
      const R = k ? 0.85 : 1;
      return [Math.cos(a) * R, -(Math.sin(a) * R) + 0.35, 0];
    }
    const R = 0.2 + (((i * 7) % 13) / 13) * 0.6;
    return [Math.cos(a) * R, -(Math.sin(a) * R) + 0.35, 0.1];
  },
  // the mark — the two Shape triangles, filled
  (i, r) => {
    const k = i % 2;
    const u = r();
    const v = r();
    const [ax, ay, bx, by, cx, cy] = k
      ? [-0.95, -0.55, -0.95, 0.55, 0.05, 0]
      : [0.95, 0.55, 0.95, -0.55, -0.05, 0];
    const s = Math.sqrt(u);
    const x = (1 - s) * ax + s * (1 - v) * bx + s * v * cx;
    const y = (1 - s) * ay + s * (1 - v) * by + s * v * cy;
    return [x, -y, k ? 0.06 : -0.06];
  },
  // the heart, filled — the strap's own glyph, the one the matching state draws
  (i, r, N) => {
    const t = (i / N) * Math.PI * 2 * 3;
    const sc = Math.sqrt(r());
    const x = ((16 * Math.pow(Math.sin(t), 3)) / 17) * sc;
    const y = ((13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17) * sc;
    return [x * 1.05, -y - 0.33, (r() - 0.5) * 0.14];
  },
  // the record — twelve grooves, flat; the view's tilt is what makes it a record
  (i) => {
    const ring = i % 12;
    const R = 0.28 + (ring / 11) * 0.72;
    const a = i * 2.399963;
    return [Math.cos(a) * R, 0, Math.sin(a) * R];
  },
  // the spectrum in points — the Signal Field's own mirrored layout, bass at the
  // centre, so the cloud can stand as the thing the wall behind it is drawing
  (i, r) => {
    const b = i % 32;
    const k = Math.floor(i / 32);
    const c = (k & 1) ? Math.ceil(15.5 + b / 2) : Math.floor(15.5 - b / 2);
    const h = 0.22 + 0.78 * Math.exp(-b / 7) + 0.28 * Math.exp(-Math.pow((b - 23) / 5, 2));
    const x = (c / 31) * 2 - 1;
    const y = 0.6 - (k / 28) * 1.2 * h;
    return [x * 1.25, y, (r() - 0.5) * 0.06];
  },
];

// The rings, the record and the spectrum carry their own structure — concentric
// grooves, mirrored columns — and jitter reads as a smear on all three rather than
// as texture. The other five get a little.
export const CLOUD_JITTER = 0.045;
export function formJitter(form) {
  return (form === 1 || form === 6 || form === 7) ? 0 : CLOUD_JITTER;
}

// Fill a Float32Array of N*3 with one formation. The generator is seeded on the
// FORM, not on the song, so a figure looks the same whichever song reaches it.
export function placeForm(form, buf, n) {
  const N = n == null ? CLOUD_N : n;
  const fn = CLOUD_FORMS[((form % CLOUD_FORMS.length) + CLOUD_FORMS.length) % CLOUD_FORMS.length];
  const r = radioRng(1234 + form);
  const j = formJitter(form);
  for (let i = 0; i < N; i += 1) {
    const p = fn(i, r, N);
    buf[i * 3] = p[0] + (r() - 0.5) * j;
    buf[i * 3 + 1] = p[1] + (r() - 0.5) * j;
    buf[i * 3 + 2] = p[2] + (r() - 0.5) * j;
  }
  return buf;
}

// ---------------------------------------------------------------------------
// The phrase — eight bars, counted off the detector's own beat
// ---------------------------------------------------------------------------
// ⚠ NO MEASURED TEMPO, NO PHRASE, NO CHANGE. `tempoBarStep` returns null until the
// detector settles, so `countBeat` stops counting through a breakdown and the
// figure holds. The alternative — advancing on wall-clock seconds — would be a
// picture moving to a number nobody measured, which is the defect the whole page
// exists to stop.

export const PHRASE_BEATS = 32; // eight bars of four

// The step is 0..3 and repeats, so a beat is a CHANGE of step rather than a value.
// `state` is { beats, lastStep }; it is returned rather than mutated so a caller
// cannot half-apply it.
export function countBeat(state, step) {
  const beats = state && Number.isFinite(state.beats) ? state.beats : 0;
  const lastStep = state ? state.lastStep : null;
  if (step == null || !Number.isFinite(step)) return { beats, lastStep: null };
  if (step === lastStep) return { beats, lastStep };
  return { beats: beats + 1, lastStep: step };
}

export function phraseOf(beats) {
  if (!Number.isFinite(beats) || beats < 0) return 0;
  return Math.floor(beats / PHRASE_BEATS);
}

// Which figure the cloud is standing in: the song's opening figure, advanced one
// stride per phrase — and, on the composed field, per hand-over to the cloud, so
// the cloud comes forward as something new rather than as what it was.
export function cloudForm(program, phrase, turns) {
  if (!program) return 0;
  const p = Number.isFinite(phrase) ? phrase : 0;
  const t = Number.isFinite(turns) ? turns : 0;
  const step = Number.isFinite(program.formStep) ? program.formStep : 1;
  const base = Number.isFinite(program.form) ? program.form : 0;
  const n = CLOUD_FORMS.length;
  return (((base + (p + t) * step) % n) + n) % n;
}

export const MORPH_S = 1.5;
export function morphEase(u) {
  const m = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return m < 0.5 ? 2 * m * m : -1 + (4 - 2 * m) * m;
}

// ---------------------------------------------------------------------------
// The hand-over — who leads, and how the crossfade moves
// ---------------------------------------------------------------------------
// ⚠ THE LEAD IS READ OFF THE SAME BINS THE DETECTOR READS. `TEMPO_BINS` is
// imported rather than retyped: if the detector ever widens its kick band, the
// hand-over widens with it, and the picture cannot come to disagree with the
// reading printed above it.

export const KICK_ON = 0.32;
export const KICK_OFF = 0.12;
export const KICK_RELEASE_S = 1.1;

// ⚠ IT DELEGATES RATHER THAN AGREEING. A second loop over the same bins would be
// two implementations that happen to match today; calling the detector's own
// helper makes them ONE, so a widened kick band reaches the lighting with nothing
// to keep in step. The only thing added here is the 0..1 scale the mixers want —
// the detector works in raw 0..255 because its ring is about relative rises.
export function kickLow(bins) {
  const e = tempoEnergyFromBins(bins);
  return Number.isFinite(e) ? e / 255 : 0;  // null = a frame with nothing in it
}

// Instant attack, slow release: a kick is a spike, so the envelope must follow it
// up immediately and let go over about a second. A symmetric smoother would blur
// the four-to-the-floor into a plateau and the hand-over would never see a gap.
// ⚠ THE FRAME LENGTH IS NOT CAPPED, AND THAT IS DELIBERATE. Capping dt is a guard
// for a step-wise integrator, which goes unstable on a long frame; an exponential
// is unconditionally stable and a cap only distorts it — a tab backgrounded for a
// minute SHOULD come back with the envelope at nothing, and a cap of one second
// would have it still lit. The guard that is needed is against a dt that is not a
// duration at all.
export function kickEnvNext(env, low, dt) {
  const e = Number.isFinite(env) ? env : 0;
  const v = Number.isFinite(low) ? low : 0;
  const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
  if (v > e) return v;
  return v + (e - v) * Math.exp(-d / KICK_RELEASE_S);
}

// Hysteresis, so one quiet bar cannot flip the room's lighting.
export function kickPresentNext(was, env) {
  const e = Number.isFinite(env) ? env : 0;
  if (e > KICK_ON) return true;
  if (e < KICK_OFF) return false;
  return !!was;
}

export const LEAD_MODES = ['drop', 'track', 'both'];

// 1 = the wall leads, 0 = the cloud leads, 0.5 = neither.
// ⚠ WITH NO SIGNAL DATA THE SEED DECIDES rather than the room going dark: a stream
// that sends no CORS header still has a song, and that song still has an identity.
export function leadTarget(mode, hasSignal, kickPresent, wallLeads) {
  if (mode === 'both') return 0.5;
  if (mode === 'track' || !hasSignal) return wallLeads ? 1 : 0;
  return kickPresent ? 1 : 0;
}

export const LEAD_TAU = 0.4;
export const LEAD_SNAP = 0.002;

// ⚠ EASED ON THE CLOCK, NOT PER FRAME. Reduced motion redraws at 4 fps, and a
// per-frame lerp would take fifteen times as long to hand over there as it does at
// 60 — the same crossfade would be a different length depending on the viewer's
// motion setting.
export function easeLead(wl, target, dt) {
  const a = Number.isFinite(wl) ? wl : 1;
  const b = Number.isFinite(target) ? target : a;
  const d = Number.isFinite(dt) && dt > 0 ? dt : 0;  // uncapped, as above
  const next = a + (b - a) * (1 - Math.exp(-d / LEAD_TAU));
  return Math.abs(b - next) < LEAD_SNAP ? b : next;
}

// What the lead does to each half. The wall's tiles never leave — at 0 they are the
// venue before doors — and the cloud never leaves either, sitting back as embers
// while the wall carries the programme.
export const WALL_GROUND_ALPHA = 0.06;
export function wallMix(wl) {
  const w = Number.isFinite(wl) ? Math.max(0, Math.min(1, wl)) : 1;
  return { meter: 0.12 + 0.88 * w, flood: w, mask: w };
}
export function cloudMix(wl) {
  const w = Number.isFinite(wl) ? Math.max(0, Math.min(1, wl)) : 1;
  return { light: 0.14 + 0.86 * (1 - w), size: 0.78 + 0.22 * (1 - w) };
}

// ---------------------------------------------------------------------------
// The wall
// ---------------------------------------------------------------------------

export const TILE_PX = 16;
export const TILE_GAP_PX = 4;

export function wallCols(W) {
  return Math.max(0, Math.floor((Number.isFinite(W) ? W : 0) / TILE_PX));
}
export function wallRows(H) {
  return Math.max(0, Math.floor((Number.isFinite(H) ? H : 0) / TILE_PX));
}

// Mirrored, bass at the centre — the Signal Field's own layout, so the wall and the
// app's spectrum put the same frequency in the same place.
export function wallBand(col, cols, bands) {
  const n = Number.isFinite(cols) && cols > 0 ? cols : 1;
  const b = (Number.isFinite(bands) ? bands : 64) - 1;
  const mirror = Math.abs((Number.isFinite(col) ? col : 0) - (n / 2 - 0.5)) / (n / 2);
  return Math.max(0, Math.min(b, Math.floor(mirror * b)));
}

// A meter rises instantly and falls slowly, like the bars it is made of.
export const METER_FALL = 0.9;
export function meterNext(prev, v) {
  const p = Number.isFinite(prev) ? prev : 0;
  const x = Number.isFinite(v) ? v : 0;
  return x > p ? x : p * METER_FALL + x * (1 - METER_FALL);
}
