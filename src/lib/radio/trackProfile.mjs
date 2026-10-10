// trackProfile.mjs — everything Nora needs to know about a song before she plans a set with it,
// measured once from its decoded audio as the owner uploads it (/dashboard/radio).
//
//   profileTrack(channels, sampleRate) → the analysis library.mjs's cleanAnalysis accepts
//
// What it measures:
//   - Where the music starts and ends, and where the final fade begins (time only, so a song
//     with no steady beat still gets a sensible crossfade).
//   - Its loudness over the body of the song, so the engine can level one song against the next.
//   - Its beat grid, with the booth's own analyser (public/newdesign/booth/trackAnalysis.mjs),
//     tried at house tempo first and then above it. The analyser needs a kick on every beat, so a
//     four-on-the-floor song gets a grid and a hip-hop or half-time one gets none (TEMPO_RANGES).
//     No grid is ever invented: a song without one has bpm null and is faded, not beat-matched.
//   - Its key (keyDetect.mjs), as a Camelot code.
//   - An intensity from 0 to 1 (loudness, kick, tempo and brightness), which shapes the set.
//   - A 200-point overview of its level, for the page.
//
// PURE: no DOM, no Web Audio, no clock. The page decodes the file and hands over the PCM.

import { analyzeTrack } from '../../../public/newdesign/booth/trackAnalysis.mjs';
import { detectKey } from './keyDetect.mjs';
import { ANALYSIS_VERSION, OVERVIEW_POINTS } from './library.mjs';

const WIN = 0.05;               // 50 ms level windows
const SILENCE_DB = -45;         // below the loudest window by this much is silence
const BODY_DB = -20;            // within this of the loudest window is the body of the song
const FADE_DB = -6;             // the final fade starts where the level stays this far under the body
// ⚠ NO RANGE BELOW 100 BPM. The analyser follows the KICK, and a song whose kick lands on beats 1
// and 3 only (most hip-hop, half-time pop) has a kick period of two beats: searched at 70–100 it
// reads a 150 BPM song as 75, with full confidence (measured on a synthetic boom-bap pattern). A
// tempo half the real one is worse than none, so such a song gets no grid and is faded, not
// beat-matched. 140–180 is safe: a kick every other beat there is 70–90, outside every range.
const TEMPO_RANGES = [[100, 140], [140, 180]];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round = (v, d) => { const k = 10 ** d; return Math.round(v * k) / k; };
const db = (rms) => (rms > 0 ? 20 * Math.log10(rms) : -120);

/** Per-window RMS of the mono mix, and of its first difference (a cheap brightness measure). */
export function levelWindows(channels, sampleRate) {
  const n = channels[0].length;
  const w = Math.max(1, Math.round(WIN * sampleRate));
  const count = Math.ceil(n / w);
  const rms = new Float64Array(count), diff = new Float64Array(count);
  const k = 1 / channels.length;
  let prev = 0;
  for (let j = 0; j < count; j++) {
    let s = 0, d = 0, m = 0;
    const end = Math.min(n, (j + 1) * w);
    for (let i = j * w; i < end; i++) {
      let x = 0;
      for (const ch of channels) x += ch[i];
      x *= k;
      s += x * x;
      d += (x - prev) * (x - prev);
      prev = x;
      m++;
    }
    rms[j] = m ? Math.sqrt(s / m) : 0;
    diff[j] = m ? Math.sqrt(d / m) : 0;
  }
  return { rms, diff, winSec: w / sampleRate };
}

/** Start, end and final-fade times, and the body's loudness, from the level windows. */
export function timeShape(lv, durationSec) {
  const { rms, winSec } = lv;
  let peak = 0;
  for (const v of rms) if (v > peak) peak = v;
  if (!(peak > 0)) return null;
  const peakDb = db(peak);
  const silent = (v) => db(v) < peakDb + SILENCE_DB;
  let first = 0;
  while (first < rms.length && silent(rms[first])) first++;
  let last = rms.length - 1;
  while (last > first && silent(rms[last])) last--;
  const soundStartSec = first * winSec;
  const soundEndSec = Math.min(durationSec, (last + 1) * winSec);
  // The body: windows within BODY_DB of the peak; its loudness is their mean power.
  let p = 0, c = 0;
  for (let j = first; j <= last; j++) if (db(rms[j]) >= peakDb + BODY_DB) { p += rms[j] * rms[j]; c++; }
  const bodyRms = c ? Math.sqrt(p / c) : peak;
  // The final fade: walk back from the end over 1 s medians while they stay FADE_DB under the body.
  const span = Math.max(1, Math.round(1 / winSec));
  const median1s = (j) => {
    const a = [];
    for (let i = Math.max(first, j - span + 1); i <= j; i++) a.push(rms[i]);
    a.sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)] || 0;
  };
  let fade = last;
  while (fade > first && db(median1s(fade)) < db(bodyRms) + FADE_DB) fade -= 1;
  const fadeOutSec = clamp((fade + 1) * winSec, soundStartSec, soundEndSec);
  return { soundStartSec, soundEndSec, fadeOutSec, loudnessDb: clamp(db(bodyRms), -70, 0), peakDb };
}

/** The beat grid, trying house tempo first; the first range that yields a grid wins. */
export function beatGrid(channels, sampleRate) {
  let last = null;
  for (const [bpmMin, bpmMax] of TEMPO_RANGES) {
    const meta = analyzeTrack(channels, sampleRate, { bpmMin, bpmMax });
    if (meta && meta.bpm != null) return meta;
    last = meta;
    if (meta && meta.reason === 'too-short') break;
  }
  return last;
}

/** 0–1: how hard a song drives, for the set's energy arc. */
export function intensityOf({ loudnessDb, kick, bpm, brightness }) {
  const loud = clamp((loudnessDb + 22) / 16, 0, 1);          // −22 dBFS quiet … −6 dBFS slammed
  const tempo = bpm == null ? 0.5 : clamp((bpm - 85) / 50, 0, 1);
  const bright = clamp((brightness - 0.04) / 0.16, 0, 1);
  return round(clamp(0.35 * loud + 0.25 * clamp(kick, 0, 1) + 0.2 * tempo + 0.2 * bright, 0, 1), 3);
}

/** The full profile of a decoded song. */
export function profileTrack(channels, sampleRate) {
  if (!Array.isArray(channels) || !channels.length || !(channels[0] instanceof Float32Array) || !(sampleRate > 0)) {
    throw new TypeError('profileTrack: need Float32Array channels and a sample rate');
  }
  const durationSec = channels[0].length / sampleRate;
  const lv = levelWindows(channels, sampleRate);
  const shape = timeShape(lv, durationSec);
  if (!shape) throw new Error('profileTrack: the file is silent');

  const grid = beatGrid(channels, sampleRate) || {};
  const hasGrid = grid.bpm != null;
  // The mix points stay inside the kicked body (a short song can place them past it).
  const mixOutBar = hasGrid ? clamp(grid.mixOutBar, grid.firstKickBar, Math.max(grid.firstKickBar, grid.outroBar)) : null;
  const mixInFromBar = hasGrid ? clamp(grid.mixInFromBar, 0, grid.lengthBars) : null;
  const key = detectKey(channels, sampleRate);

  // Brightness: the body's first-difference RMS over its RMS (rises with treble and attack).
  let br = 0, bc = 0;
  for (let j = 0; j < lv.rms.length; j++) if (db(lv.rms[j]) >= shape.peakDb + BODY_DB && lv.rms[j] > 0) { br += lv.diff[j] / lv.rms[j]; bc++; }
  const brightness = bc ? br / bc : 0;
  const kicks = hasGrid ? grid.kickByBar.slice(grid.firstKickBar, grid.outroBar) : [];
  const kick = kicks.length ? kicks.reduce((a, b) => a + b, 0) / kicks.length : 0;

  // The overview: the loudest window in each of 200 slices, relative to the song's peak.
  const overview = [];
  let peak = 0;
  for (const v of lv.rms) if (v > peak) peak = v;
  for (let i = 0; i < OVERVIEW_POINTS; i++) {
    const a = Math.floor((i * lv.rms.length) / OVERVIEW_POINTS), b = Math.max(a + 1, Math.floor(((i + 1) * lv.rms.length) / OVERVIEW_POINTS));
    let m = 0;
    for (let j = a; j < b && j < lv.rms.length; j++) if (lv.rms[j] > m) m = lv.rms[j];
    overview.push(round(peak > 0 ? m / peak : 0, 3));
  }

  return {
    version: ANALYSIS_VERSION,
    durationSec: round(durationSec, 3),
    soundStartSec: round(shape.soundStartSec, 3),
    soundEndSec: round(shape.soundEndSec, 3),
    fadeOutSec: round(shape.fadeOutSec, 3),
    loudnessDb: round(shape.loudnessDb, 2),
    intensity: intensityOf({ loudnessDb: shape.loudnessDb, kick, bpm: hasGrid ? grid.bpm : null, brightness }),
    bpm: hasGrid ? grid.bpm : null,
    downbeatSec: hasGrid ? grid.downbeatSec : null,
    lengthBars: hasGrid ? grid.lengthBars : null,
    firstKickBar: hasGrid ? grid.firstKickBar : null,
    outroBar: hasGrid ? grid.outroBar : null,
    mixOutBar,
    mixInFromBar,
    breakdowns: hasGrid ? grid.breakdowns : [],
    energyByBar: hasGrid ? grid.energyByBar : [],
    confidence: Number.isFinite(grid.confidence) ? grid.confidence : 0,
    reason: hasGrid ? null : grid.reason || 'no-grid',
    camelot: key.camelot,
    keyConfidence: key.confidence,
    overview,
  };
}
