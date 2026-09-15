// THE SIGNAL FIELD — the geometry behind the Radio page's one instrument.
//
// Pure and dependency-free so every rule below is DRIVEN rather than eyeballed:
// the canvas component calls these and draws what they return, and a test can
// ask the same questions without standing up a browser.
// Spec: docs/BUILD-2026-09-14-radio-signal-field.md §4.
//
// The page is two states of one instrument.
//   LISTENING — the station's live spectrum off the real analyser over a quiet
//   field of dots.
//   MATCHING  — the bands fold away and two pulse rows take their place, drawn
//   the way a heart-rate monitor draws: one pen sweeping left to right with an
//   erase gap ahead of it, the station's beat above, the member's heart below.
//
// ⚠ EVERY READING HERE IS MEASURED OR ABSENT. There is no seeded value, no
// easing toward a target, and no default BPM anywhere in this file. When the
// analyser hands back all-zero bins (a stream with no CORS header) the bands are
// flat and the page says so; when no tempo has settled the station row waits.
// The predecessor page fabricated a 114 bpm heart rate with no strap attached
// and then "locked" it — that is the class of thing this module exists to make
// unrepresentable.

// ---------------------------------------------------------------------------
// Bands — the analyser's bins folded into a mirrored spectrum.
// ---------------------------------------------------------------------------

// 32 bands, bass at the CENTRE and air at both edges, so the figure is symmetric
// and the kick reads as a pulse from the middle rather than a bar at one end.
export const BANDS = 32;

// Only the first 64 of the analyser's 256 bins (roughly 0–5.5 kHz at 44.1 kHz)
// carry anything a listener reads as "the music"; the top three quarters are air.
export const BAND_BINS = 64;

// Fast attack, slow release: the bars jump onto a transient and fall back
// smoothly, so they pump on the beat instead of jittering on every frame.
export const SM_RELEASE = 0.88;
export const SM_ATTACK = 0.12;

// The peak cap falls at a fixed rate rather than following the bar, which is what
// makes it read as a held maximum instead of a second bar.
export const PEAK_FALL = 0.011;

// Which analyser bin band `i` reads. |i − 15.5| is the distance from the centre
// of the 32, so bands 15 and 16 both take bin 0 and the ends take bin 63.
export function bandBin(i, bands, bins) {
  const n = bands == null ? BANDS : bands;
  const b = bins == null ? BAND_BINS : bins;
  const half = n / 2;
  const d = Math.abs(i - (half - 0.5)) / half;
  return Math.min(b - 1, Math.floor(d * (b - 1)));
}

// One smoothing step. `sm` and `raw` are 0..1. Rises instantly, falls slowly.
export function smoothBand(sm, raw) {
  const s = Number.isFinite(sm) ? sm : 0;
  const r = Number.isFinite(raw) ? raw : 0;
  return r > s ? r : s * SM_RELEASE + r * SM_ATTACK;
}

// One peak-cap step.
export function peakBand(pk, sm) {
  const p = Number.isFinite(pk) ? pk : 0;
  const s = Number.isFinite(sm) ? sm : 0;
  return Math.max(p - PEAK_FALL, s);
}

// Read a frame of `getByteFrequencyData` (0..255) into 0..1 band values.
// A frame of all zeros — which is exactly what a stream without
// `Access-Control-Allow-Origin` produces — comes back all zeros, and
// `hasSignal` below is what the page asks before it draws anything.
export function bandsFromBins(bins, bands) {
  const n = bands == null ? BANDS : bands;
  const out = new Array(n).fill(0);
  if (!bins || !bins.length) return out;
  for (let i = 0; i < n; i += 1) {
    const v = bins[bandBin(i, n, Math.min(BAND_BINS, bins.length))];
    out[i] = Number.isFinite(v) ? Math.max(0, Math.min(1, v / 255)) : 0;
  }
  return out;
}

// Is the analyser carrying anything at all? An all-zero frame is NOT silence to
// animate over — it is the absence of data, and the page must say so rather than
// draw a flat line that looks like a quiet passage.
export function hasSignal(bins) {
  if (!bins || !bins.length) return false;
  for (let i = 0; i < bins.length; i += 1) if (bins[i] > 0) return true;
  return false;
}

// Bar height in pixels. The 3px floor keeps the baseline legible as a row of
// bars rather than a broken line; it is a floor on the DRAWING, never on the
// reading, and `hasSignal` has already decided whether to draw at all.
export function barHeight(v, maxH) {
  const x = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  return Math.max(3, x * (Number.isFinite(maxH) ? maxH : 0));
}

// The cap is drawn only when it stands clear of its own bar — otherwise it sits
// on the bar top and reads as a thicker bar, which says nothing.
export const CAP_CLEAR_PX = 4;
export function capVisible(peak, value, maxH) {
  return barHeight(peak, maxH) - barHeight(value, maxH) > CAP_CLEAR_PX;
}

// ---------------------------------------------------------------------------
// The rail's signal meter — five bars off the analyser, registered in PR 1 and
// landing here beside its consumer.
// ---------------------------------------------------------------------------

export const RAIL_BARS = 5;

// The level the meter reads: the RMS of the frame, 0..1, or **null** when the
// frame carries no data at all.
//
// ⚠ NULL AND 0 ARE DIFFERENT CLAIMS, AND THE RAIL HAS TO DRAW THEM
// DIFFERENTLY. An all-zero frame is a stream we cannot read — the stream sent no
// `Access-Control-Allow-Origin`, so every bin is 0 forever — and five empty bars
// under the word "Signal" reads as *the station is quiet*, which is a claim
// about the music rather than about our own access. That case gets words
// (`screen.noSignalData`), not a meter. A genuinely quiet bar in a stream we CAN
// read returns a real 0, and the meter shows it.
//
// ⚠ IT READS THE SAME WINDOW THE SPECTRUM DRAWS (`BAND_BINS`), NOT THE WHOLE
// FRAME. `fftSize` 512 gives 256 bins at ~86 Hz each, so a frame is mostly empty
// high bins; averaging over all of them divides the reading by roughly the
// fraction that carries anything, and the meter would sit at one bar through
// music the spectrum is plainly showing. Same window, same story.
export function railRms(bins) {
  if (!hasSignal(bins)) return null;
  const n = Math.min(BAND_BINS, bins.length);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    const v = bins[i];
    if (!Number.isFinite(v)) continue;
    const x = Math.max(0, Math.min(1, v / 255));
    sum += x * x;
    count += 1;
  }
  if (!count) return null;
  return Math.sqrt(sum / count);
}

// How many bars are lit. The meter is a coarse five-step reading, so it rounds
// UP and any level above zero lights at least one bar — "the stream is carrying
// something" is the thing a glance needs to answer, and a level that rounded to
// no bars would be indistinguishable from the unreadable case above.
export function railBarsLit(rms, bars) {
  const n = bars == null ? RAIL_BARS : bars;
  if (rms == null || !Number.isFinite(rms)) return 0;
  const x = Math.max(0, Math.min(1, rms));
  if (!(x > 0)) return 0;
  return Math.max(1, Math.min(n, Math.ceil(x * n)));
}

// ---------------------------------------------------------------------------
// The field — the ground both states share.
// ---------------------------------------------------------------------------

// How far from the centre a dot has to be to read the top bin. Beyond it every
// dot reads air.
export const FIELD_REACH = 430;

// Which bin a dot reads, by its distance from the centre: bass at the middle,
// air at the edges — the same mapping as the bands, in two dimensions.
export function fieldBin(dist, bins) {
  const b = bins == null ? BAND_BINS : bins;
  const d = Number.isFinite(dist) ? Math.max(0, dist) : 0;
  return Math.min(b - 1, Math.floor(Math.min(1, d / FIELD_REACH) * (b - 1)));
}

// The field's overall strength.
//   kx   — the state, 0 listening → 1 matching. Quiet under the spectrum (which
//          is the figure there), full behind the rows (where it is the ground).
//   kick — the measured beat envelope, so the WHOLE field breathes on the beat
//          as well as lighting per bin. Zero when no tempo has settled, which
//          leaves the per-bin lighting and no breath — honest rather than still.
export function fieldK(kx, kick) {
  const x = Number.isFinite(kx) ? Math.max(0, Math.min(1, kx)) : 0;
  const k = Number.isFinite(kick) ? Math.max(0, Math.min(1, kick)) : 0;
  return (0.45 + 0.55 * x) * (0.72 + 0.28 * k);
}

// ⚠ THE UNLIT GRID IS DRAWN, AND ITS REST IS NOT A FRACTION OF THE LIGHT.
// The first build scaled the WHOLE dot by `fieldK` — alpha `(0.07 + 0.6·v)·k`,
// radius `0.8 + 1.9·v·k` — so with nothing on the air (v = 0, k at its 0.324
// floor) every dot rendered at 2.3% alpha and 0.8 px: measured on the shipped
// page at 390px, the brightest pixel in the figure was alpha 6 of 255. That is
// the RESTING state — signed out, paused, or a station that is not
// broadcasting, which in production today is every member — and it is the
// state the owner opened and read as "not the design" a day after #2072
// shipped. A ground nobody can see is not a ground; it is a void with a
// formula behind it.
//
// So the grid keeps a rest whatever the field's strength, and only the LIGHT
// on it reads the bins and breathes on the kick. `fieldK` still scales the
// light — quiet under the spectrum, full behind the rows, breathing on the
// beat — and no longer scales the ground, so the rest reads the same in both
// states. The two constants are measured on the render rather than chosen (see
// tests/radio-rest-state.test.mjs for the floor the guard holds them to).
export const FIELD_REST_ALPHA = 0.16;
export const FIELD_REST_RADIUS = 1.1;

export function fieldAlpha(v, k) {
  const x = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  const kk = Number.isFinite(k) ? Math.max(0, k) : 0;
  return FIELD_REST_ALPHA + 0.62 * x * kk;
}

export function fieldRadius(v, k) {
  const x = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  const kk = Number.isFinite(k) ? Math.max(0, k) : 0;
  return FIELD_REST_RADIUS + 1.7 * x * kk;
}

// ---------------------------------------------------------------------------
// The rows — one pen, two traces, three seconds of history.
// ---------------------------------------------------------------------------

// Seconds of history across the row's full width.
export const ROW_WINDOW_S = 3;

// The erase gap ahead of the pen, in pixels. This is what makes it read as a
// monitor: the pen is writing into a strip it has just cleared.
export const GAP_PX = 24;

// The trace fades out over these pixels before it reaches the gap, so the oldest
// sample dissolves instead of being cut off mid-stroke.
export const RAMP_PX = 10;

// Pixels per second, from the row's width.
export function penSpeed(W) {
  return (Number.isFinite(W) && W > 0 ? W : 0) / ROW_WINDOW_S;
}

// Where the pen is at `t`.
export function penX(t, x0, W) {
  if (!(W > 0) || !Number.isFinite(t)) return x0;
  const pps = penSpeed(W);
  return x0 + (((t * pps) % W) + W) % W;
}

// How many pixels BEHIND the pen a column is: 0 = just drawn, W = about to be
// erased. This is the whole trick — the sample drawn at x is the value at
// `t − behindOf(x) / pps`, so the row is a function of one clock and needs no
// stored history.
export function behindOf(x, px, W) {
  if (!(W > 0)) return 0;
  return (((px - x) % W) + W) % W;
}

// The sample instant a column shows.
export function instantAt(x, px, W, t) {
  const pps = penSpeed(W);
  if (!(pps > 0)) return t;
  return t - behindOf(x, px, W) / pps;
}

// A column's opacity. Zero inside the gap, ramped over the pixels before it, and
// otherwise fading gently with age. `kx` scales the whole row so the trace can
// cross-fade in as the page moves from listening to matching.
export function alphaAt(x, px, W, kx) {
  if (!(W > 0)) return 0;
  const behind = behindOf(x, px, W);
  const gap = W - GAP_PX;
  const k = Number.isFinite(kx) ? Math.max(0, Math.min(1, kx)) : 0;
  let a = (1 - 0.4 * (behind / W)) * k;
  // The ramp reaches exactly zero at the gap edge and goes negative past it, and
  // the clamp below turns that into 0 — so the gap IS where the ramp lands.
  //
  // ⚠ There was an `if (behind > gap) return 0` above this line. It read as THE
  // statement of the gap rule and it was dead: measured over every column at
  // W=240, bypassing it changed 0 of 960 sampled alphas. Deleted rather than
  // tested around, because dead code that reads as a guard is worse than no
  // guard — the next reader trusts it, and a mutation to the ramp would then
  // look covered when only the corpse was.
  if (behind > gap - RAMP_PX) a *= Math.max(0, (gap - behind) / RAMP_PX);
  return Math.max(0, Math.min(1, a));
}

// Sample the row at half-pixel steps. A heart's spike is ~20ms wide, which at
// W/3 px per second is about a pixel — whole-pixel sampling drops beats.
export const SAMPLE_STEP_PX = 0.5;

// ---------------------------------------------------------------------------
// The two traces.
// ---------------------------------------------------------------------------

// THE STATION — the kick's own envelope: a fast attack then a decay, which is
// what a kick drum does and what the field breathes on.
// `u` is seconds since the beat. Nothing before the beat.
export function kickShape(u) {
  if (!Number.isFinite(u) || u < 0) return 0;
  if (u < 0.03) return u / 0.03;
  return Math.exp(-(u - 0.03) / 0.13);
}

function gauss(u, c, w) {
  return Math.exp(-((u - c) * (u - c)) / (2 * w * w));
}

// THE HEART — one monitor glyph per beat: the spike, the dip, the T wave.
//
// ⚠ NO P WAVE, AND THE OMISSION IS THE HONEST PART. A Bluetooth strap
// (characteristic 0x180D) sends heart-rate values and RR intervals — never a
// waveform. A real ECG's P wave precedes the R by ~170ms, so drawing one would
// be a claim about a beat the app has not received yet. The TIMING here is
// measured; the SHAPE is a glyph, and the page's own copy says so.
//
// Which is why this returns 0 for every u < 0: the glyph is drawn FROM the
// instant a beat arrives and never before it.
export function ecg(u) {
  if (!Number.isFinite(u) || u < 0 || u > 0.42) return 0;
  const r = Math.max(0, 1 - Math.abs(u - 0.014) / 0.02);
  return r - 0.26 * gauss(u, 0.045, 0.011) + 0.24 * gauss(u, 0.21, 0.045);
}

// The pen dot's radius, on whichever envelope its own row is riding.
export function penRadius(env) {
  const e = Number.isFinite(env) ? Math.max(0, Math.min(1, env)) : 0;
  return 2.5 + 3.5 * e;
}

// ---------------------------------------------------------------------------
// The lock.
// ---------------------------------------------------------------------------

// The tolerance the shipped page already uses for "in sync" (recorded 2026-09-03).
export const SYNC_TOL_BPM = 4;

// A tie is drawn only between beats that GENUINELY land together. Two rates can
// agree while their beats sit half a period apart — a lock is about phase, not
// only rate, so a tie asserts an alignment that has to be there.
export const TIE_TOL_S = 0.12;

// The gap in BPM, or null when either side is unknown. `null` is what the page
// renders as "—"; it is never 0.
export function bpmGap(heartBpm, stationBpm) {
  if (!Number.isFinite(heartBpm) || !Number.isFinite(stationBpm)) return null;
  if (!(heartBpm > 0) || !(stationBpm > 0)) return null;
  return Math.round(heartBpm - stationBpm);
}

export function inSync(gap) {
  return gap != null && Math.abs(gap) <= SYNC_TOL_BPM;
}

// The gap as it is printed: a typographic minus (U+2212) for negative, a plus for
// positive, and a bare 0 — because "0" is a stronger reading than the word "in
// sync", carrying the tolerance the test actually allows.
export function gapText(gap) {
  if (gap == null) return '—';
  if (gap > 0) return `+${gap}`;
  if (gap < 0) return `−${Math.abs(gap)}`;
  return '0';
}

// Ease the lock cues in over 1.1s and out over 0.5s, so a momentary brush past
// the tolerance does not flash the ties on and off.
export const LOCK_IN_S = 1.1;
export const LOCK_OUT_S = 0.5;
export function lockStep(lockK, synced, dt) {
  const k = Number.isFinite(lockK) ? Math.max(0, Math.min(1, lockK)) : 0;
  const d = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const rate = synced ? d / LOCK_IN_S : -d / LOCK_OUT_S;
  return Math.max(0, Math.min(1, k + rate));
}

// Pair each station beat with a heart beat that lands within TIE_TOL_S of it.
// Beats with no partner get no tie — the drawing may not assert an alignment the
// measurement does not have.
export function ties(stationBeats, heartBeats, tol) {
  const out = [];
  const s = Array.isArray(stationBeats) ? stationBeats : [];
  const h = Array.isArray(heartBeats) ? heartBeats : [];
  const lim = tol == null ? TIE_TOL_S : tol;
  for (let i = 0; i < s.length; i += 1) {
    let best = null;
    let bestD = Infinity;
    for (let j = 0; j < h.length; j += 1) {
      const d = Math.abs(h[j] - s[i]);
      if (d <= lim && d < bestD) {
        best = h[j];
        bestD = d;
      }
    }
    if (best != null) out.push({ station: s[i], heart: best, delta: best - s[i] });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The heart's beat instants.
// ---------------------------------------------------------------------------

// A strap that sends RR intervals has told us exactly when each beat closed, so
// the glyphs land on measured instants. Each interval is in 1/1024s and closes a
// beat at `receivedAt − (the intervals that came after it)`.
export function beatsFromRR(receivedAt, rr) {
  const out = [];
  if (!Number.isFinite(receivedAt) || !Array.isArray(rr) || !rr.length) return out;
  let acc = 0;
  for (let i = rr.length - 1; i >= 0; i -= 1) {
    const s = Number(rr[i]) / 1024;
    if (!Number.isFinite(s) || s <= 0) continue;
    out.unshift(receivedAt - acc);
    acc += s;
  }
  return out;
}


// Advance the heart's phase by one frame AND return the beat instants that the
// step actually crossed.
//
// ⚠ A ROW OF PAST BEATS IS HISTORY, NOT AN EXTRAPOLATION OF THE LATEST READING.
// This replaced a `heartBeatsBetween(bpm, now, phase, t0, t1)` that rebuilt
// EVERY beat in the visible window from the CURRENT rate — so a 120 → 100
// reading redrew beats that genuinely landed 500 ms apart as though they had
// landed 600 ms apart: the whole trace jumped backwards and ties appeared or
// vanished for beats that had already happened and already been drawn. A strap
// re-reports every few seconds, so that is the ordinary case rather than an
// edge, and the row is three seconds long — wide enough to hold a rate change
// every time one lands. Recording each crossing as it occurs is the only
// version that stays true: a beat's instant is a fact about when it arrived,
// and no later reading may move it. (Codex, P2 on #2072.)
//
// `t` is the END of the step and `dt` its length. Each integer the phase
// crosses is a beat, and its instant is when the phase reached that integer.
//
// A negative or non-finite rate returns no beats and leaves the phase where it
// was — the same refusal the previous function carried, and it is load-bearing
// rather than belt-and-braces here: the phase is persistent state, so one NaN
// reading would poison it for the life of the page.
export function advanceHeart(phase, bpm, t, dt) {
  const p0 = Number.isFinite(phase) ? phase : 0;
  const beats = [];
  if (!Number.isFinite(bpm) || !(bpm > 0)) return { phase: p0, beats };
  if (!Number.isFinite(dt) || !(dt > 0) || !Number.isFinite(t)) return { phase: p0, beats };
  const rate = bpm / 60; // cycles per second
  const start = t - dt;
  const raw = p0 + dt * rate;
  // ⚠ THE BEAT COUNT AND THE PHASE WRAP ARE ONE COMPUTATION, DELIBERATELY — AND
  // THE REASON IS CONSTRUCTION, NOT A DEFECT. The first cut collected crossings
  // with `u <= dt` and wrapped the phase with a separate `% 1`, and this comment
  // claimed that pair LOST a beat at the frame boundary. Measured rather than
  // argued, because a because-clause is a claim: driving both forms over 4,000
  // random (rate, frame-rate) runs and 300,000 random single steps, they agree
  // on the count and the instants EVERY time. So the rewrite is a no-op today
  // and its mutation is labelled as one rather than tested around.
  //
  // It is kept because the agreement is an arithmetic coincidence rather than a
  // guarantee: two expressions that must always produce the same number, written
  // twice. Taking both from `floor(raw)` makes them the same number by
  // construction, and a beat the phase has already consumed can then never be
  // one the loop declined to emit.
  //
  // (What the failing test that started this actually caught was its own
  // expectation: 1/60 does not sum to 1, so the crossing due at t = 1.000 lands
  // one frame late under BOTH forms. The fixture samples past the boundary now.)
  const whole = Math.floor(raw);
  // ⚠ THE CAP IS A LOOP BACKSTOP, NOT A DISPLAY BUDGET. `dt` is clamped to 0.1s
  // by the caller, so 64 crossings in one step is 38,400 BPM — unreachable for
  // any strap. It exists so a garbage rate cannot spin this loop, which is the
  // same reason the function it replaced carried one.
  for (let m = 1; m <= whole && m <= 64; m += 1) beats.push(start + (m - p0) / rate);
  return { phase: raw - whole, beats };
}

// Keep a recorded beat list inside the window the rows draw, in place.
//
// The list is only ever appended to at the newest end and trimmed at the oldest,
// so it stays sorted by construction — which is what `ties` below relies on.
export function trimBeats(beats, cutoff) {
  if (!Array.isArray(beats)) return beats;
  let i = 0;
  while (i < beats.length && !(beats[i] >= cutoff)) i += 1;
  if (i > 0) beats.splice(0, i);
  return beats;
}
