// THE STATION'S TEMPO IS MEASURED OR IT IS "—".
//
// WHY THIS FILE EXISTS: the Radio page showed `BS_LIVE_STATION.bpm` — a 132
// typed into a constant — in three places, and the "beat" ring and EQ bars
// animated on CSS sine loops keyed to it. Nobody had measured anything. The
// now-playing payload carries `{ title, artist, isNora }` and nothing else
// (src/lib/radio/provider.ts), so the ONLY honest source for a tempo is the
// audio itself.
//
// This is the launch cut's `beat.py` method moved into the browser — onset
// envelope, comb search, split-half agreement, a confidence floor — fed by the
// same analyser frames the spectrum reads. See
// marketing/shape-radio-launch-cut.md and
// docs/BUILD-2026-09-14-radio-signal-field.md §5.
//
// ⚠ IT RETURNS null FAR MORE OFTEN THAN IT RETURNS A NUMBER, AND THAT IS THE
// POINT. A stream with no CORS header hands the analyser all-zero bins; a
// breakdown has no kick; a talk segment has no beat at all. Every one of those
// is `null` here and "—" on the page. Nothing is seeded, nothing eases toward a
// target, and no caller may substitute a constant when this says it does not
// know.
//
// ⚠ NO WALL CLOCK AND NO Math.random IN THIS FILE. The caller passes `t` (seconds,
// any monotonic origin). That is what makes the detector replayable in a test:
// the same sample sequence must always produce the same answer.

// The ring: how much audio history the search sees, and the single lever on how
// long the page reads "—" before it can read a number.
//
// Measured across 4/5/6/8s on a synthetic 128-BPM train: the detector first
// settles at 0.9 × the ring and re-settles after a 128→140 change in the same
// span, because the estimate is only trusted once the ring is nearly full (a
// half-filled ring has no second half to disagree with, so it would settle on
// less evidence than the gate promises). 6s buys a 5.40s first SEARCH and a
// 5.42s re-search at ±0.25 BPM under ±15ms of jitter — ⚠ the first reading the
// PAGE sees is 2s later than each of those, because CONFIRM_S below makes a
// candidate persist before it is published: 7.40s and 7.42s, measured — ~13 beats in the ring and
// ~6 in each half, which is enough for the resultant below to be sharp. Longer
// is more accurate and leaves the member looking at "—" for longer; shorter
// starts guessing.
export const RING_S = 6;

// How full the ring must be before the search runs at all.
export const MIN_FILL = 0.9;

// The candidate range. 100–160 BPM is house/dance, and it is deliberately narrow
// enough that a track's half-time (64) and double-time (256) fall OUTSIDE it — so
// the octave ambiguity that plagues wide-range detectors cannot pick the wrong one.
export const BPM_MIN = 100;
export const BPM_MAX = 160;
export const BPM_STEP = 0.25;

// Confidence. Both floors must clear, and then the halves must agree.
//   ABS — the resultant vector length itself. 1.0 is a perfect click train, 0 is noise.
//   REL — the best candidate against the mean across the range, so a signal that
//         scores middling EVERYWHERE cannot settle on its own peak.
//
// ⚠ CONF_REL IS BELT-AND-BRACES AND IS LABELLED RATHER THAN LEFT TO READ AS LIVE.
// Measured against a riser, two sine rates, a sawtooth, noise and amplitude-ramped
// noise, removing it alone changes no answer — CONF_ABS or the split-half check
// rejects each of those first. It is kept because it is the only gate that
// measures the peak AGAINST ITS OWN RANGE, which is the thing that would catch a
// signal scoring uniformly high; nothing constructed so far reaches it.
export const CONF_ABS = 0.3;
export const CONF_REL = 1.5;

// The onsets must COVER the window they were taken from.
//
// ⚠ THIS IS THE GATE THAT STOPS THE WORST FABRICATION, AND IT WAS FOUND BY
// MUTATION RATHER THAN BY READING. Two transients 2.5s apart — a door slam and a
// cough, a badly-cut intro — are four onsets, and four onsets clustered in one
// corner of the ring fit ANY period: measured, they scored 0.997 at 120 BPM and
// cleared every other gate, including the relative floor, because with so few
// vectors the mean across the range is high too. The page would have read a
// confident "120" off two thumps.
//
// A real tempo puts beats THROUGHOUT the window, so that is what is required: the
// surviving onsets must span most of it, and there must be enough of them to be a
// grid rather than a coincidence.
export const COVER_FRAC = 0.6;
// At the slowest candidate a window holds `window × 100/60` beats; half of them is
// a generous floor, and never fewer than four points to fit a grid through.
export function minOnsetsFor(windowS) {
  return Math.max(4, Math.ceil((windowS * BPM_MIN) / 60 * 0.5));
}

// Split-half: the first and second halves of the ring must independently land
// within this many BPM of each other. This is the check that turns a lucky peak
// into a measurement — a real tempo is present in both halves, an artefact is not.
export const SPLIT_TOL = 1;

// How long a settled tempo survives with nothing settling behind it. A breakdown
// or a quiet bar should not blank the reading; a track change should.
export const HOLD_S = 4;

// How long a candidate must keep coming back before it is published.
//
// ⚠ WHY THIS EXISTS, MEASURED: split-half agreement compares two argmaxes chosen
// INDEPENDENTLY over 241 candidates, so two nearby peaks are common by
// coincidence in dense aperiodic audio. Driving the suite's own speech generator
// over 500 seeds, 237 of them published a confident BPM — a talk segment putting
// a fabricated tempo on the page, which is the one thing this module exists to
// prevent. (Found by Codex on this file's first review; reproduced before it was
// acted on.)
//
// The fix is persistence rather than a higher score floor, because a floor has to
// be tuned against real music nobody here can measure — the synthetic kick train
// scores 0.998 where speech tops out at 0.804, but a real track with a soft kick
// under vocals sits somewhere unknown between them, and a floor set from
// synthetic data fails toward "—" forever on music. Persistence assumes only that
// a true tempo is STABLE and a coincidence is not, which holds however clean the
// signal is: measured over windows 1.5s apart, speech agrees within 1 BPM 15.9%
// of the time and a real kick train 100.0%.
export const CONFIRM_S = 2;

// The kick envelope's decay, shared by the field's breath, the beat counter and
// the station row. Matches the board.
export const KICK_TAU = 0.13;

// How often the comb search actually runs. read() is called every frame; the
// search is not.
export const SEARCH_S = 1;

// Onsets below this fraction of the envelope's own peak contribute nothing and are
// dropped before the search, which is what keeps 241 candidates × a ring of frames
// affordable at 60fps.
const ONSET_FLOOR = 0.08;

// ---------------------------------------------------------------------------
// Pure stages — each one drivable on its own.
// ---------------------------------------------------------------------------

// Half-wave-rectified first difference of the LOG energy.
//
// Log, not linear: loudness is multiplicative, so a kick under a loud mix and the
// same kick under a quiet one produce the same onset. Half-wave: only the ATTACK
// is an onset — the decay after a kick is not a second beat.
export function tempoOnsets(samples) {
  const out = [];
  if (!Array.isArray(samples) || samples.length < 2) return out;
  let prev = null;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (!s || !Number.isFinite(s.t) || !Number.isFinite(s.e)) continue;
    const l = Math.log(1 + Math.max(0, s.e));
    if (prev !== null) {
      const d = l - prev;
      if (d > 0) out.push({ t: s.t, d });
    }
    prev = l;
  }
  return out;
}

// The onsets a search actually considers: everything above a fraction of the
// envelope's own peak. This is what keeps 241 candidates × a ring of frames
// affordable at 60fps, and it is also the set the coverage rule must judge —
// a window can be full of tiny wobbles and still carry only two real transients.
export function tempoKeep(onsets) {
  if (!Array.isArray(onsets) || !onsets.length) return [];
  let peak = 0;
  for (let i = 0; i < onsets.length; i += 1) if (onsets[i].d > peak) peak = onsets[i].d;
  if (!(peak > 0)) return [];
  return onsets.filter((x) => x.d >= peak * ONSET_FLOOR);
}

// Do these onsets cover the window they came from? See COVER_FRAC.
export function tempoCovers(kept, t0, t1, opts) {
  const o = opts || {};
  const frac = o.coverFrac == null ? COVER_FRAC : o.coverFrac;
  const win = t1 - t0;
  if (!(win > 0)) return false;
  const need = o.minOnsets == null ? minOnsetsFor(win) : o.minOnsets;
  if (!Array.isArray(kept) || kept.length < need) return false;
  const span = kept[kept.length - 1].t - kept[0].t;
  return span >= win * frac;
}

// The resultant vector for one candidate period.
//
// Every onset is placed on a circle by its phase within the period and summed as a
// vector weighted by its strength. If the onsets really do land on a grid of this
// period they all point the same way and the sum is long (score → 1); if they are
// scattered the vectors cancel (score → 0).
//
// ⚠ The angle gives the PHASE for free, which is why this is used instead of a
// plain autocorrelation: the page needs to know WHEN the next beat lands, not only
// how fast they come.
export function tempoResultant(onsets, period) {
  let re = 0;
  let im = 0;
  let tot = 0;
  if (!(period > 0)) return { score: 0, phase: 0 };
  for (let i = 0; i < onsets.length; i += 1) {
    const o = onsets[i];
    const a = 2 * Math.PI * (o.t / period);
    re += o.d * Math.cos(a);
    im += o.d * Math.sin(a);
    tot += o.d;
  }
  if (!(tot > 0)) return { score: 0, phase: 0 };
  let ang = Math.atan2(im, re);
  if (ang < 0) ang += 2 * Math.PI;
  return { score: Math.hypot(re, im) / tot, phase: (ang / (2 * Math.PI)) * period };
}

// Sweep the candidate range. Returns the best candidate plus the MEAN score across
// the whole range, which is what the relative floor is measured against.
export function tempoSearch(onsets, opts) {
  const o = opts || {};
  const lo = o.bpmMin == null ? BPM_MIN : o.bpmMin;
  const hi = o.bpmMax == null ? BPM_MAX : o.bpmMax;
  const step = o.bpmStep == null ? BPM_STEP : o.bpmStep;
  if (!Array.isArray(onsets) || !onsets.length) return { bpm: null, phase: 0, score: 0, mean: 0 };

  const keep = tempoKeep(onsets);
  if (!keep.length) return { bpm: null, phase: 0, score: 0, mean: 0 };

  let best = null;
  let sum = 0;
  let n = 0;
  for (let bpm = lo; bpm <= hi + 1e-9; bpm += step) {
    const r = tempoResultant(keep, 60 / bpm);
    sum += r.score;
    n += 1;
    if (!best || r.score > best.score) best = { bpm, phase: r.phase, score: r.score };
  }
  if (!best || !n) return { bpm: null, phase: 0, score: 0, mean: 0 };
  return { bpm: best.bpm, phase: best.phase, score: best.score, mean: sum / n };
}

// The full gate: search, then the two floors, then split-half agreement.
// Returns null unless every one of them clears. A `null` here is the page's "—".
export function tempoSettle(samples, opts) {
  const o = opts || {};
  const onsets = tempoOnsets(samples);
  if (onsets.length < 4) return null;

  // COVERAGE FIRST, AND ON THE HALVES, which is both the cheap gate and the whole
  // gate. ⚠ A whole-ring coverage check used to sit here as well and was proven
  // redundant by mutation: if each half spans at least COVER_FRAC of its own
  // window, the full span is at least h + 0.2h = COVER_FRAC x 2h — exactly the
  // threshold — and 4 + 4 clears minOnsetsFor(2h). Deleted rather than tested
  // around. It runs before the searches so a ring of two thumps costs no comb.
  const t0 = samples[0].t;
  const t1 = samples[samples.length - 1].t;
  const mid = (t0 + t1) / 2;
  const sa = samples.filter((s) => s.t <= mid);
  const sb = samples.filter((s) => s.t >= mid);
  const oa = tempoOnsets(sa);
  const ob = tempoOnsets(sb);
  if (!tempoCovers(tempoKeep(oa), t0, mid, o) || !tempoCovers(tempoKeep(ob), mid, t1, o)) return null;

  const full = tempoSearch(onsets, o);
  if (full.bpm == null) return null;

  const absFloor = o.confAbs == null ? CONF_ABS : o.confAbs;
  const relFloor = o.confRel == null ? CONF_REL : o.confRel;
  if (!(full.score >= absFloor)) return null;
  if (!(full.mean > 0) || !(full.score >= relFloor * full.mean)) return null;

  // The halves were split BY TIME above, not by sample count — a dropped frame
  // must not move the boundary and silently compare unequal windows.
  const a = tempoSearch(oa, o);
  const b = tempoSearch(ob, o);
  if (a.bpm == null || b.bpm == null) return null;
  const tol = o.splitTol == null ? SPLIT_TOL : o.splitTol;
  if (Math.abs(a.bpm - b.bpm) > tol) return null;

  return { bpm: full.bpm, phase: full.phase, score: full.score, halves: [a.bpm, b.bpm] };
}

// ---------------------------------------------------------------------------
// Beat arithmetic on a settled grid.
// ---------------------------------------------------------------------------

// A grid is the PAIR, and it has to be FINITE as well as positive.
//
// ⚠ `bpm > 0` alone is TRUE FOR Infinity, and that is not a pedantic case — it
// is the honest-data failure mode wearing a number. At Infinity the period is
// 0, so `floor((t - phase) / 0) * 0` is `Infinity * 0` = NaN: tempoBeatAt hands
// back NaN rather than null, every `== null` check downstream passes it, and
// the kick envelope and the bar counter go NaN behind it — a grid that reports
// itself as settled and draws nothing. Nothing in tempoSettle can emit Infinity
// today (the comb searches a finite candidate list), but these are exported
// pure helpers and the screen calls them with whatever the context holds. A
// refusal is the one answer every consumer already renders.
function gridOk(bpm, phase) {
  return Number.isFinite(bpm) && bpm > 0 && Number.isFinite(phase);
}

// The instant of the last beat at or before `t`.
export function tempoBeatAt(bpm, phase, t) {
  if (!gridOk(bpm, phase) || !Number.isFinite(t)) return null;
  const p = 60 / bpm;
  return phase + Math.floor((t - phase) / p) * p;
}

// The kick envelope at `t` — 1 on the beat, decaying with KICK_TAU.
// Zero when there is no settled grid, so the field only lights per bin.
export function tempoKick(bpm, phase, t, tau) {
  const last = tempoBeatAt(bpm, phase, t);
  if (last == null) return 0;
  return Math.exp(-Math.max(0, t - last) / (tau == null ? KICK_TAU : tau));
}

// Every beat instant in [t0, t1). Used by the station row and the tie test.
export function tempoBeatsBetween(bpm, phase, t0, t1) {
  const out = [];
  if (!gridOk(bpm, phase) || !(t1 > t0)) return out;
  const p = 60 / bpm;
  let k = Math.ceil((t0 - phase) / p);
  for (let b = phase + k * p; b < t1; k += 1, b = phase + k * p) {
    out.push(b);
    if (out.length > 4096) break;
  }
  return out;
}

// Which beat of a four-beat bar `t` falls on (0..3), or null with no grid.
// The counter is the one thing on the listening state that makes the MEASURED
// tempo visible as a rhythm rather than as a number.
export function tempoBarStep(bpm, phase, t, beats) {
  if (!gridOk(bpm, phase) || !Number.isFinite(t)) return null;
  const n = beats == null ? 4 : beats;
  const p = 60 / bpm;
  const k = Math.floor((t - phase) / p);
  return ((k % n) + n) % n;
}

// ---------------------------------------------------------------------------
// The detector — a ring plus a hold. The only stateful thing here.
// ---------------------------------------------------------------------------

// The number the browser feeds `push` — the kick band's energy, 0..255.
//
// ⚠ THE BAND IS A TEMPO DECISION, NOT A DRAWING ONE, WHICH IS WHY IT LIVES HERE
// AND NOT WITH THE SPECTRUM. A beat is a low-frequency event: at 44.1 kHz with
// `fftSize` 512 a bin is ~86 Hz, so bins 0..3 cover 0–344 Hz — the kick's
// fundamental and its first harmonic, and almost nothing else. Feeding the whole
// frame instead buries the kick under vocals and hats, which is exactly the
// dense-aperiodic case the confirm window had to be added for; feeding a single
// bin makes the reading hostage to where one station's kick happens to sit.
//
// ⚠ IT RETURNS null FOR A FRAME THAT CARRIES NO DATA, and `push` refuses a
// non-finite sample, so an all-zero (CORS-blocked) frame cannot enter the ring
// at all. That matters more than it looks: a ring full of zeros would flush a
// real reading out of the window, so the hold could never do its job.
//
// ⚠ THE EMPTINESS TEST IS ON THE WHOLE FRAME, NOT ON THE KICK BAND, AND THE
// DIFFERENCE IS THE WHOLE HELPER. A first cut asked whether the BAND carried
// anything — which is true of a CORS-blocked frame and also true of the quiet
// moment BETWEEN two kicks. Skipping those frames drops exactly the low samples
// the onset envelope is built from: every remaining sample is a peak, there are
// no rises left to find, and the detector goes quiet on a track with a perfectly
// good beat. A quiet kick band is a real reading of ~0 and must enter the ring;
// only a frame with nothing anywhere in it is the absence of data. Caught by
// driving the helper rather than by reading it.
export const TEMPO_BINS = 4;
export function tempoEnergyFromBins(bins) {
  if (!bins || !bins.length) return null;
  let readable = false;
  for (let i = 0; i < bins.length; i += 1) {
    if (Number.isFinite(bins[i]) && bins[i] > 0) { readable = true; break; }
  }
  if (!readable) return null;
  const n = Math.min(TEMPO_BINS, bins.length);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    const v = bins[i];
    if (!Number.isFinite(v)) continue;
    sum += Math.max(0, Math.min(255, v));
    count += 1;
  }
  if (!count) return null;
  return sum / count;
}

export function createTempoDetector(opts) {
  const o = opts || {};
  const ringS = o.ringS == null ? RING_S : o.ringS;
  const searchS = o.searchS == null ? SEARCH_S : o.searchS;
  const holdS = o.holdS == null ? HOLD_S : o.holdS;
  const minFill = o.minFill == null ? MIN_FILL : o.minFill;
  const confirmS = o.confirmS == null ? CONFIRM_S : o.confirmS;
  const tol = o.splitTol == null ? SPLIT_TOL : o.splitTol;

  let samples = [];
  let settled = null; // { bpm, phase, score }
  let settledAt = null;
  let lastSearch = null;
  let pend = null; // { bpm, since } — a candidate that has not yet persisted

  function push(t, e) {
    if (!Number.isFinite(t) || !Number.isFinite(e)) return;
    samples.push({ t, e });
    const cut = t - ringS;
    if (samples.length && samples[0].t < cut) samples = samples.filter((s) => s.t >= cut);
  }

  // `read` is called every frame; the search inside it is not.
  function read(t) {
    if (!Number.isFinite(t)) return null;
    const due = lastSearch == null || t - lastSearch >= searchS;
    // Only search once the ring is genuinely full — a half-filled ring has no
    // second half to disagree with, so it would settle on less evidence than
    // the gate promises.
    const full = samples.length > 1 && t - samples[0].t >= ringS * minFill;
    if (due && full) {
      lastSearch = t;
      const s = tempoSettle(samples, o);
      if (s) {
        // The candidate has to keep coming back. A search that disagrees with the
        // one before it restarts the clock rather than narrowing it, so a run of
        // coincidences has to be coincidental in the SAME place to get through.
        //
        // ⚠ THE RESTART-ON-DISAGREEMENT HALF IS MEASURED AT 1 SEED IN 500, AND IT
        // IS LABELLED RATHER THAN LEFT TO READ AS LOAD-BEARING. Dropping it (latch
        // the first candidate, never restart) fabricates on 1 of 500 speech seeds
        // where dropping the `pend = null` below fabricates on 16 — the two are
        // layered and the other one carries nearly all the weight. It is close to
        // unreachable by construction rather than by luck: reaching it needs two
        // consecutive SUCCESSFUL settles more than `tol` apart with no null
        // between them, and any change abrupt enough to jump a BPM also breaks
        // split-half for a whole ring, which trips the null rule first. A smooth
        // accelerando cannot do it either — drift slow enough to pass split-half
        // within one window is, by the same arithmetic, slower than `tol` between
        // windows. So there is no corpus that isolates this line short of tens of
        // thousands of seeds, and it is kept because it states the actual rule:
        // the clock times ONE candidate, not "time since something settled".
        if (!pend || Math.abs(s.bpm - pend.bpm) > tol) pend = { bpm: s.bpm, since: t };
        // Always publish the newest phase and score: the confirm window is about
        // WHETHER to speak, never about speaking a stale grid. A phase held from
        // two seconds ago would draw every beat late.
        if (t - pend.since >= confirmS) {
          settled = { bpm: s.bpm, phase: s.phase, score: s.score };
          settledAt = t;
        }
      } else {
        // No candidate at all this window: the run is broken, so the next one
        // starts a fresh clock rather than resuming a half-finished confirmation.
        pend = null;
      }
    }
    // The hold: a settled tempo survives a dropout, then goes. Nothing is
    // invented to fill the gap — when it goes, the page reads "—".
    if (settled && settledAt != null && t - settledAt > holdS) {
      settled = null;
      settledAt = null;
    }
    if (!settled) return null;
    return {
      bpm: settled.bpm,
      phase: settled.phase,
      score: settled.score,
      kick: tempoKick(settled.bpm, settled.phase, t),
      beat: tempoBeatAt(settled.bpm, settled.phase, t),
      step: tempoBarStep(settled.bpm, settled.phase, t),
      heldFor: t - settledAt,
    };
  }

  function reset() {
    samples = [];
    settled = null;
    settledAt = null;
    lastSearch = null;
    pend = null;
  }

  return { push, read, reset, samples: () => samples.slice() };
}
