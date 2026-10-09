// noraMix.mjs — the choreography brain of Nora's booth.
//
// A real club blend from one player to the other on a 4-channel mixer, written as a pure
// function of the (float) bar number so a renderer can pose hands and controls every frame
// and the audio graph can read the SAME fader/EQ numbers: what you see her do is what you hear.
//
//   load   (−8..−4)  incoming track loaded on the idle deck: hand to its browse knob, scroll,
//                    push to load, tap hot cue A, dip the incoming MID a touch.
//   cue    (−4..0)   CUE (headphone pre-listen) on the incoming channel, one hand lifts to the ear
//                    cup, the other nudges the incoming jog, hovers PLAY and presses it on the
//                    downbeat of the blend's bar 0.
//   blend  (0..)     the ear hand drops onto the incoming fader and rides it 0→1 over bars 0–L/4,
//                    LOW killed (−1), MID −0.2; cue off; hands rest on the jog edges.
//   swap   (L/2)     both hands on the two LOW knobs; the bass is swapped in ONE beat
//                    (incoming −1→0, outgoing 0→−1); incoming MID restored; a hand goes up.
//   out    (3L/4..L) outgoing fader 1→0, then that deck is stopped (PLAY pressed) and the hand
//                    goes home.
//   done   (≥ L+1)   the state is the idle performance of the new deck.
// The crossfader stays centred (club technique) and is exposed as `xfader`.
//
// Units: bars (4/4), relative to plan.startBar = the downbeat PLAY is pressed on. A beat is
// 0.25 bar. Decks are 0-based (0 = the DJ's left player). Deck d sits on mixer channel index
// d+1 (CH2/CH3), so target ids read 'jog1'/'play2' for decks and 'fader2'/'low3' for channels.
//
// Hands. Every hand is on ONE control at a time and never teleports: a target change is a
// travel window of at least a quarter beat. Each hand reports
//   { target, from, to, k, travel, grip, act }
// where `to === target` (the control the hand is on or heading to), `from` the control it
// left, `k` the travel progress ALREADY EASED (smoothstep; 1 = arrived) and `travel` the
// window length in bars. A renderer may either lerp its own from→to anchor positions by `k`,
// or ignore `k` and spring toward `to` (what noraPerformer does). A hand only leaves a
// control after it has arrived there (k === 1), and every fader/EQ/CUE/PLAY change in the
// output happens while a hand is arrived on that control — pinned by the tests.
//
// Pure: no three, no DOM, no audio, no Math.random / Date.now. Idle flourishes are a seeded
// hash of the bar number, so the same set always performs the same way.

// ── Constants ────────────────────────────────────────────────────────────────
export const BEATS_PER_BAR = 4;
export const BEAT_BARS = 1 / BEATS_PER_BAR;          // one beat, in bars
export const MIN_TRAVEL_BARS = BEAT_BARS / 4;        // a hand never moves faster than ¼ beat
export const PREP_BARS = 8;                          // load + cue before the blend's bar 0
export const TAIL_BARS = 1;                          // stop the old deck + hand home after L
export const MIN_LENGTH_BARS = 8;
export const MAX_LENGTH_BARS = 64;
export const DEFAULT_SEED = 0x5ade;

export const PHASES = Object.freeze(['idle', 'load', 'cue', 'blend', 'swap', 'out', 'done']);
export const CAM_HINTS = Object.freeze(['screen', 'jog', 'mixer', 'wide']);
export const HAND_ACTS = Object.freeze(['rest', 'hold', 'turn', 'press', 'ride', 'nudge', 'listen', 'air', 'travel']);

/** Channel values of the playing channel and of the parked (silent) one. */
export const CHANNEL_LIVE = Object.freeze({ fader: 1, low: 0, mid: 0, hi: 0, color: 0 });
export const CHANNEL_REST = Object.freeze({ fader: 0, low: -1, mid: 0, hi: 0, color: 0 });

/** Every target id a hand can report, in a stable order. */
export const TARGET_IDS = Object.freeze([
  'rest', 'air', 'ear', 'xfader',
  'jog1', 'jog2', 'play1', 'play2', 'browse1', 'browse2', 'pad1', 'pad2',
  ...[1, 2, 3, 4].flatMap((n) => ['fader', 'low', 'mid', 'hi', 'color', 'cue'].map((k) => k + n)),
]);

const TRAVEL_GRIP = 0.1;   // open hand in flight
const EPS = 1e-9;

// ── Small helpers ────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const otherSide = (side) => (side === 'left' ? 'right' : 'left');

// murmur3 fmix32 — an integer hash; hash01 is a deterministic "random" in [0,1).
function fmix(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16; return h >>> 0;
}
function hash01(seed, a, salt) {
  return fmix(fmix(fmix(seed | 0) ^ (a | 0)) ^ Math.imul(salt | 0, 0x27d4eb2d)) / 4294967296;
}

/** Mixer channel index (0..3) a deck plays through. */
export const deckChannel = (deck) => deck + 1;
/** The hand on a deck's side of the booth ('left' for deck 0). */
export const handSideForDeck = (deck) => (deck === 0 ? 'left' : 'right');

const jogId = (d) => 'jog' + (d + 1);
const playId = (d) => 'play' + (d + 1);
const browseId = (d) => 'browse' + (d + 1);
const padId = (d) => 'pad' + (d + 1);
const chId = (kind, d) => kind + (deckChannel(d) + 1);

/**
 * What a target id points at, for a renderer's anchor lookup.
 * → { id, kind, unit:'deck'|'mixer'|'body', deck (0|1|null), ch (0..3|null), anchor, pad? } or null.
 */
export function parseTarget(id) {
  if (typeof id !== 'string') return null;
  if (id === 'rest' || id === 'air' || id === 'ear') return { id, kind: id, unit: 'body', deck: null, ch: null, anchor: null };
  if (id === 'xfader') return { id, kind: 'xfader', unit: 'mixer', deck: null, ch: null, anchor: 'xfader' };
  let m = /^(jog|play|browse|pad)([12])$/.exec(id);
  if (m) {
    const deck = +m[2] - 1;
    const anchor = m[1] === 'jog' ? 'jogEdge' : m[1] === 'pad' ? 'pads' : m[1];
    const out = { id, kind: m[1], unit: 'deck', deck, ch: deckChannel(deck), anchor };
    if (m[1] === 'pad') out.pad = 0;   // hot cue A
    return out;
  }
  m = /^(fader|low|mid|hi|color|cue)([1-4])$/.exec(id);
  if (m) {
    const ch = +m[2] - 1;
    return { id, kind: m[1], unit: 'mixer', deck: ch === 1 || ch === 2 ? ch - 1 : null, ch, anchor: m[1] };
  }
  return null;
}

// ── Beat clock + phrase helpers ──────────────────────────────────────────────
/**
 * A tempo grid anchored at t0 (seconds, beat 0 = bar 0).
 * kick(t) is a decaying envelope: 1 on every beat, exp(−Δt/kickDecay) after it, 0 before t0.
 */
export function beatClock({ bpm, t0 = 0, beatsPerBar = BEATS_PER_BAR, kickDecay = 0.075 } = {}) {
  if (!(Number.isFinite(bpm) && bpm > 0)) throw new RangeError('beatClock: bpm must be a positive number');
  if (!Number.isFinite(t0)) throw new RangeError('beatClock: t0 must be a finite number of seconds');
  if (!(Number.isInteger(beatsPerBar) && beatsPerBar > 0)) throw new RangeError('beatClock: beatsPerBar must be a positive integer');
  if (!(Number.isFinite(kickDecay) && kickDecay > 0)) throw new RangeError('beatClock: kickDecay must be positive');
  const secPerBeat = 60 / bpm;
  const beatAt = (t) => (t - t0) / secPerBeat;
  // Floor with a tolerance, so a time computed as t0 + n·secPerBeat lands ON beat n, not a hair before.
  const beatIndex = (b) => Math.floor(b + EPS);
  const phase = (t) => { const b = beatAt(t); return clamp(b - beatIndex(b), 0, 1 - Number.EPSILON); };
  return {
    bpm, t0, beatsPerBar, secPerBeat, secPerBar: secPerBeat * beatsPerBar,
    beatAt,
    barAt: (t) => beatAt(t) / beatsPerBar,
    phase,
    beatInBar: (t) => { const n = beatIndex(beatAt(t)); return ((n % beatsPerBar) + beatsPerBar) % beatsPerBar; },
    timeAtBeat: (beat) => t0 + beat * secPerBeat,
    timeAtBar: (bar) => t0 + bar * beatsPerBar * secPerBeat,
    kick(t) {
      const b = beatAt(t);
      if (b < -EPS) return 0;
      return Math.exp(-(phase(t) * secPerBeat) / kickDecay);
    },
  };
}

/** The first phrase boundary at or after `bar` (phrases of `size` bars, aligned to bar 0). */
export function phraseBoundary(bar, size = 8) {
  if (!Number.isFinite(bar)) throw new RangeError('phraseBoundary: bar must be finite');
  if (!(Number.isFinite(size) && size > 0)) throw new RangeError('phraseBoundary: size must be positive');
  return Math.ceil(bar / size - EPS) * size + 0;   // + 0: never −0
}

/** Which phrase `bar` is in: { index, start, end, progress 0..1 }. */
export function phraseOf(bar, size = 8) {
  if (!Number.isFinite(bar)) throw new RangeError('phraseOf: bar must be finite');
  if (!(Number.isFinite(size) && size > 0)) throw new RangeError('phraseOf: size must be positive');
  const index = Math.floor(bar / size + EPS);
  const start = index * size;
  return { index, start, end: start + size, progress: clamp((bar - start) / size, 0, 1) };
}

/** The earliest blend start that leaves PREP_BARS to load and cue: a phrase boundary. */
export function mixStartAfter(bar, phrase = 8) {
  return phraseBoundary(bar + PREP_BARS, phrase);
}

// ── Timelines: value lanes, on-windows and hand tracks ───────────────────────
// lane = { base, segs:[{ a, b, from, to }] } — piecewise constant with eased ramps.
function laneAt(lane, s) {
  let v = lane.base;
  for (const g of lane.segs) {
    if (s >= g.b) { v = g.to; continue; }
    if (s > g.a) return g.from + (g.to - g.from) * smooth((s - g.a) / (g.b - g.a));
    return v;
  }
  return v;
}
const inWindows = (wins, s) => wins.some(([a, b]) => s >= a && s < b);

// A hand track is a list of stops { to, arrive, travel, grip, act, marks }: the hand departs
// the previous stop at (arrive − travel) and is on `to` from `arrive` until the next departure.
// marks = [[a, b, act, grip]] — sub-windows of the hold (a press, a knob turn, a nudge).
function evalTrack(stops, s) {
  let i = 0;
  for (let j = 1; j < stops.length; j++) {
    if (stops[j].arrive - stops[j].travel <= s) i = j; else break;
  }
  const st = stops[i];
  const from = i > 0 ? stops[i - 1].to : st.to;
  if (st.travel > 0 && s < st.arrive) {
    const u = (s - (st.arrive - st.travel)) / st.travel;
    return { target: st.to, from, to: st.to, k: smooth(u), travel: st.travel, grip: TRAVEL_GRIP, act: 'travel' };
  }
  let grip = st.grip, act = st.act;
  if (st.marks) for (const [a, b, mAct, mGrip] of st.marks) if (s >= a && s < b) { act = mAct; grip = mGrip; }
  return { target: st.to, from, to: st.to, k: 1, travel: st.travel, grip, act };
}

function trackBuilder(first) {
  const stops = [{ to: first.to, arrive: first.arrive, travel: 0, grip: first.grip, act: first.act, marks: null }];
  return {
    stops,
    /** Move to `to`, arriving at `arrive` after a `travel`-bar window. */
    go(to, arrive, travel, grip, act, marks = null) {
      const last = stops[stops.length - 1];
      if (to === last.to) return;   // already there: nothing to do (keeps the hold continuous)
      if (!(travel >= MIN_TRAVEL_BARS - EPS)) throw new Error(`noraMix: travel to ${to} is shorter than a quarter beat`);
      // A hand settles on a control before it leaves it (the first stop is a hold that began in the past).
      const hold = stops.length > 1 ? MIN_TRAVEL_BARS : 0;
      if (arrive - travel < last.arrive + hold - EPS) throw new Error(`noraMix: the hand leaves ${last.to} before settling on it (→ ${to} @ ${arrive})`);
      stops.push({ to, arrive, travel, grip, act, marks });
    },
  };
}

// Every mark must sit inside its stop's hold, or a press would happen mid-air.
function assertMarks(stops) {
  for (let i = 0; i < stops.length; i++) {
    const st = stops[i], leave = i + 1 < stops.length ? stops[i + 1].arrive - stops[i + 1].travel : Infinity;
    for (const [a, b] of st.marks || []) {
      if (a < st.arrive - EPS || b > leave + EPS) throw new Error(`noraMix: ${st.to} mark [${a}, ${b}] outside its hold`);
    }
  }
}

// ── Idle performance ─────────────────────────────────────────────────────────
// Between transitions the DJ still plays: the hand on the playing deck's side rests on that
// jog's edge; the other hand makes an occasional HI or COLOR (filter) move on the live
// channel inside a 4-bar block (bars +1.25..+3.75 of the block, back home before the block
// ends), and throws a hand up on some 16-bar phrase downbeats (the drop). Hands are home at
// every block's +0..+1 window, which is where transitions hand over (bars ≡ 0 and ≡ 1 mod 4).

function idleGesture(block, live, seed) {
  const r = hash01(seed, block, 11 + live);
  if (r < 0.3) return null;
  const kind = r < 0.7 ? 'hi' : 'color';
  const g = block * 4 + 1.25 + 0.25 * Math.floor(hash01(seed, block, 23 + live) * 3); // +1.25 | +1.5 | +1.75
  const a = g + 0.25;
  const depth = kind === 'hi'
    ? -(0.25 + 0.2 * hash01(seed, block, 31))
    : (hash01(seed, block, 37) < 0.5 ? -1 : 1) * (0.3 + 0.2 * hash01(seed, block, 41));
  return { kind, target: chId(kind, live), arrive: a, down: [a + 0.125, a + 0.625], up: [a + 0.875, a + 1.375], home: a + 1.75, depth };
}
function idleGestureValue(gst, bar) {
  if (!gst || bar <= gst.down[0] || bar >= gst.up[1]) return 0;
  if (bar < gst.down[1]) return gst.depth * smooth((bar - gst.down[0]) / 0.5);
  if (bar < gst.up[0]) return gst.depth;
  return gst.depth * (1 - smooth((bar - gst.up[0]) / 0.5));
}
const idleAir = (phrase, seed) => hash01(seed, phrase, 53) < 0.55;

function idleFarStops(bar, live, seed) {
  const b = Math.floor(bar / 4);
  const home = { to: 'rest', grip: 0, act: 'rest' };
  const tb = trackBuilder({ ...home, arrive: 4 * (b - 1) - 0.5 });
  for (let blk = b - 1; blk <= b + 1; blk++) {
    if (((blk % 4) + 4) % 4 === 0 && idleAir(blk / 4, seed)) {
      tb.go('air', 4 * blk + 0.25, 0.25, 0, 'air');
      tb.go('rest', 4 * blk + 1.0, 0.375, 0, 'rest');
    }
    const gst = idleGesture(blk, live, seed);
    if (gst) {
      tb.go(gst.target, gst.arrive, 0.25, 0.7, 'hold', [[gst.down[0], gst.down[1], 'turn', 0.85], [gst.up[0], gst.up[1], 'turn', 0.85]]);
      tb.go('rest', gst.home, 0.25, 0, 'rest');
    }
  }
  return tb.stops;
}

function shapeState(bar, s, phase, camHint, ch, xfader, cueOn, playing, nudge, hands, progress) {
  const jogTouch = {};
  for (const d of [0, 1]) {
    jogTouch[d] = ['left', 'right'].some((side) => hands[side].to === jogId(d) && hands[side].k === 1);
  }
  return { bar, s, phase, camHint, progress, ch, xfader, cueOn, playing, nudge, jogTouch, hands };
}

/**
 * The between-transitions performance with `liveDeck` playing: full mix-state shape
 * (ch, xfader, cueOn, playing, nudge, jogTouch, hands, camHint null, phase 'idle').
 */
export function idleState(bar, liveDeck, { seed = DEFAULT_SEED } = {}) {
  if (!Number.isFinite(bar)) throw new RangeError('idleState: bar must be finite');
  if (liveDeck !== 0 && liveDeck !== 1) throw new RangeError('idleState: liveDeck must be 0 or 1');
  const other = 1 - liveDeck;
  const ch = { [liveDeck]: { ...CHANNEL_LIVE }, [other]: { ...CHANNEL_REST } };
  const gst = idleGesture(Math.floor(bar / 4), liveDeck, seed);
  if (gst) ch[liveDeck][gst.kind] = idleGestureValue(gst, bar);
  const near = handSideForDeck(liveDeck);
  const hands = {
    [near]: { target: jogId(liveDeck), from: jogId(liveDeck), to: jogId(liveDeck), k: 1, travel: 0, grip: 0.15, act: 'rest' },
    [otherSide(near)]: evalTrack(idleFarStops(bar, liveDeck, seed), bar),
  };
  return shapeState(bar, null, 'idle', null, ch, 0,
    { [liveDeck]: false, [other]: false }, { [liveDeck]: true, [other]: false }, { 0: 0, 1: 0 }, hands, null);
}

/** Just the hands of idleState (what main.mjs asks for between transitions). */
export function idleHands(bar, liveDeck, opts) {
  return idleState(bar, liveDeck, opts).hands;
}

// ── The transition plan ──────────────────────────────────────────────────────
/**
 * Plan a blend from `fromDeck` to `toDeck` whose bar 0 (incoming PLAY) is `startBar`.
 * The returned object is deliberately NOT frozen at the top level (callers hang their own
 * bookkeeping flags on it); its timelines are frozen and mixState never mutates it.
 */
export function planTransition({ fromDeck, toDeck, startBar, lengthBars = 16, seed = DEFAULT_SEED } = {}) {
  if ((fromDeck !== 0 && fromDeck !== 1) || (toDeck !== 0 && toDeck !== 1)) throw new RangeError('planTransition: decks must be 0 or 1');
  if (fromDeck === toDeck) throw new RangeError('planTransition: fromDeck and toDeck must differ');
  if (!Number.isFinite(startBar)) throw new RangeError('planTransition: startBar must be finite');
  if (!Number.isFinite(lengthBars)) throw new RangeError('planTransition: lengthBars must be finite');
  const L = Math.round(clamp(lengthBars, MIN_LENGTH_BARS, MAX_LENGTH_BARS));
  const P = PREP_BARS, B = BEAT_BARS;

  // Anchors (relative bars).
  const fadeInEnd = L / 4, swap = Math.round(L / 2), swapEnd = swap + B, outStart = L - L / 4;
  const cueAt = -P / 2, loadPress = -P + 1.25;
  const cueOff = fadeInEnd + 0.25, stopAt = L + 0.25, end = L + TAIL_BARS;
  const airEnd = Math.min(swap + 2, outStart - 1.25), air = airEnd - (swap + 0.875) >= 0.5;

  const from = fromDeck, to = toDeck;
  const inSide = handSideForDeck(to), outSide = otherSide(inSide);

  // Hand-over points with the idle performance (just before the plan / at its end).
  const idleIn = idleState(startBar - P - EPS, from, { seed }).hands;
  const idleOut = idleState(startBar + end, to, { seed }).hands;

  // Incoming hand: load → cue → play → rest on its jog → LOW swap → MID restore → home.
  const hin = trackBuilder({ to: idleIn[inSide].to, arrive: -P, grip: idleIn[inSide].grip, act: idleIn[inSide].act });
  hin.go(browseId(to), -P + 0.25, 0.25, 0.6, 'turn', [[loadPress, loadPress + 0.0625, 'press', 1]]);
  hin.go(padId(to), -P + 1.75, 0.25, 0.35, 'hold', [[-P + 1.75, -P + 1.8125, 'press', 1]]);
  hin.go(chId('mid', to), -P + 2.5, 0.25, 0.7, 'hold', [[-P + 2.625, -P + 3.0, 'turn', 0.85]]);
  hin.go(chId('cue', to), cueAt - 0.125, 0.375, 0.35, 'hold', [[cueAt, cueAt + 0.0625, 'press', 1]]);
  hin.go(jogId(to), cueAt + 0.5, 0.25, 0.3, 'rest', [[cueAt + 1, cueAt + 2, 'nudge', 0.6]]);
  hin.go(playId(to), -0.5, 0.25, 0.35, 'hold', [[0, 0.0625, 'press', 1]]);
  hin.go(jogId(to), 0.375, 0.25, 0.2, 'rest', [[1, 1.5, 'nudge', 0.5]]);
  hin.go(chId('low', to), swap - 0.375, 0.375, 0.7, 'hold', [[swap, swapEnd, 'turn', 0.9]]);
  hin.go(chId('mid', to), swap + 0.625, 0.25, 0.7, 'hold', [[swap + 0.75, swap + 1.25, 'turn', 0.85]]);
  hin.go(jogId(to), swap + 1.875, 0.375, 0.15, 'rest');
  hin.go(idleOut[inSide].to, L + 0.75, 0.375, idleOut[inSide].grip, idleOut[inSide].act);

  // Outgoing hand: rests on the playing jog → ear → rides the incoming fader → cue off →
  // back to its jog → LOW swap → hand up → rides its own fader out → stops the deck → home.
  const hout = trackBuilder({ to: idleIn[outSide].to, arrive: -P, grip: idleIn[outSide].grip, act: idleIn[outSide].act });
  hout.go('ear', cueAt + 0.5, 0.5, 0.6, 'listen');   // lifts off the playing jog as CUE goes on
  hout.go(chId('fader', to), 0, 0.25, 0.8, 'ride');
  hout.go(chId('cue', to), fadeInEnd + 0.1875, 0.125, 0.35, 'hold', [[cueOff, cueOff + 0.0625, 'press', 1]]);
  hout.go(jogId(from), fadeInEnd + 0.75, 0.375, 0.15, 'rest');
  hout.go(chId('low', from), swap - 0.375, 0.375, 0.7, 'hold', [[swap, swapEnd, 'turn', 0.9]]);
  if (air) {
    hout.go('air', swap + 0.875, 0.375, 0, 'air');
    hout.go('rest', airEnd + 0.5, 0.5, 0, 'rest');
  }
  hout.go(chId('fader', from), outStart - 0.125, 0.375, 0.8, 'ride');
  hout.go(playId(from), L + 0.1875, 0.125, 0.35, 'hold', [[stopAt, stopAt + 0.0625, 'press', 1]]);
  hout.go(idleOut[outSide].to, L + 0.75, 0.375, idleOut[outSide].grip, idleOut[outSide].act);

  assertMarks(hin.stops);
  assertMarks(hout.stops);

  const lanes = {
    [from]: {
      fader: { base: 1, segs: [{ a: outStart, b: L, from: 1, to: 0 }] },
      low: { base: 0, segs: [{ a: swap, b: swapEnd, from: 0, to: -1 }] },
      mid: { base: 0, segs: [] }, hi: { base: 0, segs: [] }, color: { base: 0, segs: [] },
    },
    [to]: {
      fader: { base: 0, segs: [{ a: 0, b: fadeInEnd, from: 0, to: 1 }] },
      low: { base: -1, segs: [{ a: swap, b: swapEnd, from: -1, to: 0 }] },
      mid: { base: 0, segs: [{ a: -P + 2.625, b: -P + 3.0, from: 0, to: -0.2 }, { a: swap + 0.75, b: swap + 1.25, from: -0.2, to: 0 }] },
      hi: { base: 0, segs: [] }, color: { base: 0, segs: [] },
    },
  };

  const phases = [
    [-P, cueAt, 'load'], [cueAt, 0, 'cue'], [0, swap - 0.75, 'blend'],
    [swap - 0.75, outStart, 'swap'], [outStart, end, 'out'],
  ];
  const cam = [
    [-P, cueAt, 'screen'], [cueAt, 0, 'jog'], [0, swap + 0.5, 'mixer'],
    [swap + 0.5, outStart, 'wide'], [outStart, L, 'mixer'],
  ];

  const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o); };
  return {
    fromDeck: from, toDeck: to, startBar, lengthBars: L, prepBars: P, seed, xfader: 0,
    inHand: inSide, outHand: outSide,
    // Absolute bars of the moments an integrator may want to act on exactly.
    loadBar: startBar - P, loadPressBar: startBar + loadPress, cueBar: startBar + cueAt, playBar: startBar,
    fadeInEndBar: startBar + fadeInEnd, swapBar: startBar + swap, outStartBar: startBar + outStart,
    outEndBar: startBar + L, stopBar: startBar + stopAt, endBar: startBar + end,
    // Timelines in bars relative to startBar.
    lanes: deepFreeze(lanes),
    cueOn: deepFreeze({ [to]: [[cueAt, cueOff]], [from]: [] }),
    playing: deepFreeze({ [from]: [[-Infinity, stopAt]], [to]: [[0, Infinity]] }),
    nudges: deepFreeze([
      { deck: to, a: cueAt + 1, b: cueAt + 2, amp: 0.6, cycles: 2 },   // pre-listen scrub to the cue
      { deck: to, a: 1, b: 1.5, amp: 0.35, cycles: 0 },                // ride the jog to hold alignment
    ]),
    hands: deepFreeze({ [inSide]: hin.stops, [outSide]: hout.stops }),
    phases: deepFreeze(phases),
    cam: deepFreeze(cam),
  };
}

/** Phase windows of a plan in absolute bars: [{ phase, startBar, endBar }]. */
export function planTimeline(plan) {
  return plan.phases.map(([a, b, phase]) => ({ phase, startBar: plan.startBar + a, endBar: plan.startBar + b }));
}

function nudgeAt(n, s) {
  if (s < n.a || s >= n.b) return 0;
  const u = (s - n.a) / (n.b - n.a);
  return n.amp * Math.sin(Math.PI * u) * (n.cycles > 0 ? Math.sin(2 * Math.PI * n.cycles * u) : 1);
}

/**
 * The whole booth at `bar` (float, absolute) during `plan`:
 * { bar, s, phase, camHint, progress, ch:{[deck]:{fader,low,mid,hi,color}}, xfader,
 *   cueOn:{[deck]:bool}, playing:{[deck]:bool}, nudge:{[deck]:−1..1}, jogTouch:{[deck]:bool},
 *   hands:{ left, right } }. Before the plan it is the idle of fromDeck; from endBar on it is
 * the idle of toDeck with phase 'done'.
 */
export function mixState(plan, bar) {
  if (!plan || !plan.lanes) throw new TypeError('mixState: plan must come from planTransition');
  if (!Number.isFinite(bar)) throw new RangeError('mixState: bar must be finite');
  const s = bar - plan.startBar;
  const total = plan.prepBars + plan.lengthBars + TAIL_BARS;
  const progress = clamp((s + plan.prepBars) / total, 0, 1);
  if (s < -plan.prepBars || s >= plan.lengthBars + TAIL_BARS) {
    const done = s >= 0;
    const st = idleState(bar, done ? plan.toDeck : plan.fromDeck, { seed: plan.seed });
    st.s = s; st.progress = progress; st.phase = done ? 'done' : 'idle';
    return st;
  }
  const ch = {}, cueOn = {}, playing = {}, nudge = {};
  for (const d of [0, 1]) {
    const ln = plan.lanes[d];
    ch[d] = { fader: laneAt(ln.fader, s), low: laneAt(ln.low, s), mid: laneAt(ln.mid, s), hi: laneAt(ln.hi, s), color: laneAt(ln.color, s) };
    cueOn[d] = inWindows(plan.cueOn[d], s);
    playing[d] = inWindows(plan.playing[d], s);
    nudge[d] = 0;
  }
  for (const n of plan.nudges) nudge[n.deck] += nudgeAt(n, s);
  const phase = (plan.phases.find(([a, b]) => s >= a && s < b) || [0, 0, 'out'])[2];
  const camHint = (plan.cam.find(([a, b]) => s >= a && s < b) || [0, 0, null])[2];
  const hands = { left: evalTrack(plan.hands.left, s), right: evalTrack(plan.hands.right, s) };
  return shapeState(bar, s, phase, camHint, ch, plan.xfader, cueOn, playing, nudge, hands, progress);
}
