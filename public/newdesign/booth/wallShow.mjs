// wallShow.mjs — the LED wall's show, read off the beat position. Pure (no three, no clock, no
// randomness), so club.mjs runs it and the tests check it in Node.
//
// The owner, 2026-10-26: "create cool effects like real like shows on LED wall, include club shape
// appearing and re appearing, maybe pulsing", "use higgsfield for cool looping images", "make sure
// the images are moving, not just still shots", and "club shape should only appear on its own".
//
// Each phrase (8 bars) takes turns, the way a concert screen does:
//
//   bars 1–3   the HEADLINE on its own, on a dark wall: the artwork wallArt.mjs rotates (CLUB SHAPE,
//              NORA, SHAPE RADIO, NORA; the venue and the station alone with a guest on the decks)
//              builds onto the dots (a scan, a scatter or a split from the centre, in turn), holds,
//              pulses on the kick (club.mjs), throws an echo outward on each bar line (every beat on
//              the drop), and dissolves.
//   bars 4–7   the LOOK on its own, filling the wall (arenaStage.mjs draws it): a video loop made in
//              Higgsfield when one has loaded, a tunnel of the Shape mark's two triangles, a chase
//              across the wall's 0.5 m cabinets, or the dawn the wall has always shown. It comes up
//              from black across the cabinets over two beats, and on the drop changes to the tunnel or
//              the chase at the next bar.
//   bar 8      the look goes back to black over two beats, and the wall stays dark for two: the
//              breath before the next headline.
//
// Photosensitivity: nothing here flashes. The builds, the dissolves and the echo travel; the chase
// is a wave across the cabinets whose step is a beat, or two beats when the tempo would push it past
// three a second (WALL_STEP_MAX_HZ). Under reduced motion the wall is what it was before this
// module: the dawn, the headline steady over it, a crossfade between artworks.
import { wallArtAt, WALL_PHRASE_BEATS } from './wallArt.mjs';

export const WALL_BAR_BEATS = 4;
export const WALL_BUILD_BEATS = 2;     // the headline builds over the phrase's first two beats,
export const WALL_CLEAR_AT = 10;       // holds, and dissolves over beats 10–12
export const WALL_CLEAR_BEATS = 2;
export const WALL_LOOK_IN_BAR = 3;     // the look comes up on bar 3's downbeat (beat 12)
export const WALL_LOOK_OUT_BAR = 7;    // and goes down on bar 7's (beat 28)
export const WALL_LOOK_BEATS = 2;      // either way across the cabinets over two beats
export const WALL_STEP_MAX_HZ = 3;     // no step of the chase faster than this

// The looks, by the index arenaStage.mjs's shader reads. `blank` is the dark wall the headline has
// to itself.
export const WALL_LOOKS = Object.freeze({ dawn: 0, tunnel: 1, chase: 2, plate: 3, blank: 4 });
// The headline's build styles, by the index club.mjs's shader reads; `fade` is reduced motion's.
export const WALL_BUILDS = Object.freeze({ scan: 0, scatter: 1, split: 2, fade: 3 });
const BUILD_ORDER = Object.freeze(['scan', 'scatter', 'split']);

// The set list: a look per phrase. A `plate` slot takes the next loaded video loop; with none
// loaded it takes its `or`, which keeps the three drawn looks in turn.
export const WALL_SETLIST = Object.freeze([
  Object.freeze({ look: 'plate', or: 'dawn' }),
  Object.freeze({ look: 'tunnel' }),
  Object.freeze({ look: 'plate', or: 'chase' }),
  Object.freeze({ look: 'dawn' }),
  Object.freeze({ look: 'plate', or: 'tunnel' }),
  Object.freeze({ look: 'chase' }),
]);
const PLATE_SLOTS = WALL_SETLIST.filter((s) => s.look === 'plate').length;
const DROP_LOOKS = Object.freeze(['tunnel', 'chase']);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const beatOf = (bp) => (Number.isFinite(bp) ? Math.max(0, bp) : 0);

/**
 * The look a bar should show: dark while the headline has the wall, else from the set list or the drop.
 * @param {number} bar    the bar's index (beat position / 4, floored)
 * @param {object} [o]
 * @param {boolean} [o.drop]      the drop is on at this bar
 * @param {boolean[]} [o.ready]   which video loops have loaded
 * @param {boolean} [o.reduced]   reduced motion: the dawn, always
 * @returns {{look: string, plate: number}}  plate is the loop's index, −1 for a drawn look
 */
export function wallLookFor(bar, { drop = false, ready = [], reduced = false } = {}) {
  if (reduced) return { look: 'dawn', plate: -1 };
  const b = Number.isFinite(bar) ? Math.max(0, Math.floor(bar)) : 0;
  const phraseBars = WALL_PHRASE_BEATS / WALL_BAR_BEATS;
  const inPhrase = b % phraseBars;
  if (inPhrase < WALL_LOOK_IN_BAR || inPhrase >= WALL_LOOK_OUT_BAR) return { look: 'blank', plate: -1 };
  const phrase = Math.floor(b / phraseBars);
  if (drop) return { look: DROP_LOOKS[phrase % DROP_LOOKS.length], plate: -1 };
  const slot = WALL_SETLIST[phrase % WALL_SETLIST.length];
  if (slot.look !== 'plate') return { look: slot.look, plate: -1 };
  const loaded = [];
  (Array.isArray(ready) ? ready : []).forEach((r, i) => { if (r === true) loaded.push(i); });
  if (!loaded.length) return { look: slot.or, plate: -1 };
  // the loops in turn: count the plate slots played before this one
  const k = Math.floor(phrase / WALL_SETLIST.length) * PLATE_SLOTS
    + WALL_SETLIST.slice(0, phrase % WALL_SETLIST.length).filter((s) => s.look === 'plate').length;
  return { look: 'plate', plate: loaded[k % loaded.length] };
}

/** The look before any bar has been decided: the dark wall the opening headline builds on. */
export function initialWallLook() {
  return Object.freeze({ from: 'blank', fromPlate: -1, to: 'blank', toPlate: -1, t0: -Infinity, bar: -1 });
}

/**
 * One step of the look's state. The look is decided on each bar's downbeat and a change dissolves
 * over WALL_LOOK_BEATS from that downbeat, so a booth that steps a whole bar at once lands where a
 * smooth one would. Returns the state unchanged (the same object) when nothing moved.
 * @param {object} prev  the last state (initialWallLook() to start)
 * @param {object} o
 * @param {number} o.bp        the beat position
 * @param {boolean} [o.drop]   the drop is on
 * @param {boolean[]} [o.ready]
 * @param {boolean} [o.reduced]
 */
export function stepWallLook(prev, { bp, drop = false, ready = [], reduced = false } = {}) {
  const b = beatOf(bp);
  const bar = Math.floor(b / WALL_BAR_BEATS);
  if (prev && bar === prev.bar && !(reduced && prev.to !== 'dawn')) return prev;
  const p = prev || initialWallLook();
  const want = wallLookFor(bar, { drop, ready, reduced });
  if (want.look === p.to && want.plate === p.toPlate) return { ...p, bar };
  // reduced motion cuts straight to the dawn; anything else dissolves from what is showing now
  const showing = wallLookMix(p, b) >= 0.5 ? { look: p.to, plate: p.toPlate } : { look: p.from, plate: p.fromPlate };
  return {
    from: showing.look, fromPlate: showing.plate, to: want.look, toPlate: want.plate,
    t0: reduced ? -Infinity : bar * WALL_BAR_BEATS, bar,
  };
}

/** 0..1 through a look's dissolve (1: `to` alone). */
export function wallLookMix(state, bp) {
  if (!state || !Number.isFinite(state.t0)) return 1;
  return clamp01((beatOf(bp) - state.t0) / WALL_LOOK_BEATS);
}

/**
 * The headline at a beat position.
 * @returns {{art: string, from: string, mix: number, build: number, clear: number, style: number,
 *   echo: number, echoScale: number}}
 *   art/from/mix: the artwork (and, under reduced motion, the crossfade from the last one);
 *   build: 0..1 through the build; clear: 0..1 through the dissolve; style: WALL_BUILDS;
 *   echo: the echo's strength (0 none); echoScale: its size against the artwork's (1 = the same)
 */
export function wallHeadlineAt(bp, { headliner = 'nora', drop = false, reduced = false } = {}) {
  const b = beatOf(bp);
  const art = wallArtAt(b, { headliner });
  if (reduced) {
    return { art: art.to, from: art.from, mix: art.mix, build: 1, clear: 0, style: WALL_BUILDS.fade, echo: 0, echoScale: 1 };
  }
  const phrase = Math.floor(b / WALL_PHRASE_BEATS);
  const x = b - phrase * WALL_PHRASE_BEATS;
  const build = clamp01(x / WALL_BUILD_BEATS);
  const clear = clamp01((x - WALL_CLEAR_AT) / WALL_CLEAR_BEATS);
  // the echo: thrown on each bar line while the headline holds (each beat on the drop), it grows a
  // quarter larger and fades over a beat and a half (most of a beat on the drop)
  let echo = 0, echoScale = 1;
  const every = drop ? 1 : WALL_BAR_BEATS;
  const life = drop ? 0.9 : 1.5;
  if (x >= WALL_BUILD_BEATS && x < WALL_CLEAR_AT) {
    const thrown = Math.floor(x / every) * every;
    const age = x - thrown;
    if (age < life && thrown >= WALL_BUILD_BEATS) {
      const u = age / life;
      echo = (1 - u) * (1 - u);
      echoScale = 1 + 0.28 * (1 - (1 - u) * (1 - u));
    }
  }
  return {
    art: art.to, from: art.to, mix: 1, build, clear,
    style: WALL_BUILDS[BUILD_ORDER[phrase % BUILD_ORDER.length]], echo, echoScale,
  };
}

// A generated loop does not end exactly on its first frame (measured on the 2026-10-26 Higgsfield
// clips: the jump from the last frame to the first is 3 to 18 times a frame's own change), so the
// booth plays two copies in turn and fades the end of one into the start of the other.
export const WALL_LOOP_FADE = 0.6;   // seconds

/** 0..1 through the fade from a loop's end into its start, at `time` into a clip `duration` long. */
export function loopFadeAt(time, duration, fade = WALL_LOOP_FADE) {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || !(duration > fade * 2)) return 0;
  return clamp01(1 - (duration - time) / fade);
}

/** Beats per chase step: one, or two when a beat is quicker than WALL_STEP_MAX_HZ allows. */
export function wallStepBeats(beatPeriod) {
  return Number.isFinite(beatPeriod) && beatPeriod > 0 && beatPeriod < 1 / WALL_STEP_MAX_HZ ? 2 : 1;
}

// What the wall throws into the room (linear RGB, its mean emission), for club.mjs's wallGlow: a
// real room takes its light from the screen, so a teal picture lights the crowd, the floor and the
// haze teal, and the room goes dark with the wall. Each look's is read off the arena shader's own
// colours times its dots' fill (about 0.74); a loop's off its picture's mean, less the LEDs' black,
// times the shader's 1.7.
const GLOW_DAWN = [0.18, 0.075, 0.05];
const GLOW_AMBER = [1.45, 0.78, 0.33];   // the chase's third colour
const GLOW_PLATE_UNREAD = [0.04, 0.07, 0.09];
/**
 * @param {string} look  dawn | tunnel | chase | plate | blank
 * @param {{accent: number[], ice: number[], plateMean?: number[]|null}} c  linear RGB
 * @returns {number[]} linear RGB
 */
export function wallLookGlow(look, { accent, ice, plateMean = null }) {
  const mixOf = (...terms) => [0, 1, 2].map((i) => terms.reduce((s, [c, k]) => s + c[i] * k, 0));
  if (look === 'dawn') return GLOW_DAWN.slice();
  if (look === 'tunnel') return mixOf([accent, 0.03], [ice, 0.011]);
  if (look === 'chase') return mixOf([accent, 0.063], [ice, 0.053], [GLOW_AMBER, 0.039]);
  if (look === 'plate') {
    return Array.isArray(plateMean) && plateMean.length === 3 && plateMean.every(Number.isFinite)
      ? plateMean.map((v) => Math.max(0, v) * 1.25) : GLOW_PLATE_UNREAD.slice();
  }
  return [0, 0, 0];
}
