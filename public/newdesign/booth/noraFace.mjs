// noraFace.mjs — the small things a body does that nobody choreographs: when she blinks, where her
// eyes land, how her breath runs, and which leg her weight is on when there is no beat to move to.
//
// ⚠ WHY THIS FILE EXISTS: she read as an animation, not a person (owner, 2026-10-09: "still looks
// very animated"). Measured in the performer it replaces: a blink every 3.7 s to the millisecond, eyes
// glued to the head's target (so they slid with it, never jumped ahead of it), a breath at exactly
// 14 a minute, and off air a dip and a side-to-side sway on a 2-second metronome. Each is a clock,
// and a clock is the thing a viewer reads as "animated". Everything here is irregular on purpose,
// and seeded, so the same seed always gives the same face (the tests replay it).
//
// Pure: no three, no wall clock, no Math.random. Time comes only from the `dt` the caller passes, so
// a clock that jumps (the example set restarting its AudioContext at 0) cannot stall or skip a blink.
// Points are plain {x, y, z} in world metres.

/** A small seeded PRNG (mulberry32): the same seed, the same sequence. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const DEG = Math.PI / 180;

// ── Blinks ──────────────────────────────────────────────────────────────────
// A blink closes fast and opens slowly (about 70 ms down, 160 ms up), and the gaps between blinks are
// irregular: at rest a person blinks roughly every 2–6 s with no fixed period, sometimes twice in a
// row, and often on a large shift of gaze. Those are the four things the old fixed cycle lacked.
export const BLINK = Object.freeze({
  close: 0.07,      // s, lid coming down
  hold: 0.03,       // s, fully shut
  open: 0.16,       // s, lid going back up
  minGap: 1.4,      // s, never two blink onsets closer than this (a double blink excepted)
  meanGap: 3.6,     // s, the mean gap at rest
  maxGap: 8,        // s, never longer than this
  double: 0.15,     // chance a blink is followed straight away by a second one
  doubleGap: 0.12,  // s, from the end of the first blink to the start of the second
  gazeChance: 0.6,  // chance a big shift of gaze brings a blink with it
  gazeRefractory: 0.8, // s, no gaze-evoked blink this soon after the last onset
});
export const BLINK_LEN = BLINK.close + BLINK.hold + BLINK.open;

/** How shut the lids are `u` seconds after a blink's onset: 0 open, 1 shut. */
export function blinkShape(u) {
  if (!(u >= 0)) return 0;
  if (u < BLINK.close) { const x = u / BLINK.close; return x * x; }   // accelerating down
  u -= BLINK.close;
  if (u < BLINK.hold) return 1;
  u -= BLINK.hold;
  if (u < BLINK.open) { const x = 1 - u / BLINK.open; return x * x * (3 - 2 * x); }   // easing up
  return 0;
}

/** The gap to the next blink: an exponential tail above the minimum, capped. */
export function blinkGap(r) {
  const tail = -Math.log(1 - clamp(r, 0, 0.999999)) * (BLINK.meanGap - BLINK.minGap);
  return clamp(BLINK.minGap + tail, BLINK.minGap, BLINK.maxGap);
}

export function createBlinker({ rand = mulberry32(1) } = {}) {
  let clock = 0;
  let onset = -Infinity;          // when the blink now showing began
  let nextAt = blinkGap(rand());  // the next scheduled onset
  let doubleAt = null;            // a second blink owed straight after this one
  function begin(at) {
    onset = at;
    doubleAt = rand() < BLINK.double ? at + BLINK_LEN + BLINK.doubleGap : null;
    nextAt = at + blinkGap(rand());
  }
  return {
    /**
     * @param {number} dt seconds since the last call
     * @param {object} [o]
     * @param {boolean} [o.gazeShift] a large saccade happened this step
     * @returns {number} the lid, 0 open .. 1 shut
     */
    step(dt, { gazeShift = false } = {}) {
      clock += Math.max(0, dt) || 0;
      if (doubleAt != null && clock >= doubleAt) {
        onset = doubleAt; doubleAt = null;
        // the next blink keeps its distance from the SECOND of the pair
        nextAt = Math.max(nextAt, onset + BLINK.minGap);
      }
      else if (clock >= nextAt) begin(nextAt > clock - 0.5 ? nextAt : clock);
      else if (gazeShift && clock - onset >= BLINK.gazeRefractory && rand() < BLINK.gazeChance) begin(clock);
      return blinkShape(clock - onset);
    },
    get clock() { return clock; },
    get nextAt() { return nextAt; },
  };
}

// ── Gaze ────────────────────────────────────────────────────────────────────
// Eyes do not slide: they hold a point, then jump (a saccade) and the head follows a few hundred
// milliseconds later. While they hold, they drift by a degree or so now and then. And a person with
// nothing to do does not stare at one spot: she looks around the room. The performer aims the EYES
// at `gaze` and springs the HEAD toward `head`, so the eyes always arrive first.
export const GAZE = Object.freeze({
  threshold: 4 * DEG,  // the target must move this far from where she is looking before she re-fixes
  holdMin: 0.18,       // s, the shortest fixation (no saccade sooner than this after the last)
  big: 20 * DEG,       // a saccade at least this large may bring a blink
  microMin: 0.6,       // s, between small fixational shifts
  microMax: 2.2,
  microAmp: 1.2 * DEG, // the largest fixational shift
  idleMin: 2.2,        // s, between idle glances around the room
  idleMax: 6.5,
  idleYaw: 26 * DEG,   // how far an idle glance strays from the idle point, side to side
  idlePitch: 6 * DEG,  // and up and down
});

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v) => Math.hypot(v.x, v.y, v.z);

/** The angle between two points as seen from `eye`, in radians. */
export function angleBetween(eye, a, b) {
  const u = sub(a, eye), v = sub(b, eye);
  const lu = len(u), lv = len(v);
  if (!(lu > 1e-9) || !(lv > 1e-9)) return 0;
  return Math.acos(clamp((u.x * v.x + u.y * v.y + u.z * v.z) / (lu * lv), -1, 1));
}

/** `p` turned about `eye` by `yaw` (about world up) and `pitch` (up positive), keeping its distance. */
export function turnAbout(eye, p, yaw, pitch) {
  const d = sub(p, eye);
  const r = len(d);
  if (!(r > 1e-9)) return { x: p.x, y: p.y, z: p.z };
  const h = Math.hypot(d.x, d.z);
  const az = Math.atan2(d.x, d.z) + yaw;
  const el = clamp(Math.atan2(d.y, h) + pitch, -80 * DEG, 80 * DEG);
  const ch = Math.cos(el) * r;
  return { x: eye.x + Math.sin(az) * ch, y: eye.y + Math.sin(el) * r, z: eye.z + Math.cos(az) * ch };
}

export function createGaze({ rand = mulberry32(2) } = {}) {
  let clock = 0;
  let fix = null;                 // where the eyes are holding
  let lastSaccade = -Infinity;
  let micro = { yaw: 0, pitch: 0 };
  let microAt = 0;
  let idle = null;                // the current idle glance, as an offset from the idle point
  let idleAt = 0;
  const between = (lo, hi) => lo + (hi - lo) * rand();
  return {
    /**
     * @param {number} dt
     * @param {object} o
     * @param {{x,y,z}} o.eye   where she looks from (between her eyes)
     * @param {{x,y,z}} o.want  what she means to look at
     * @param {boolean} [o.idle] nothing to do: look around the room, centred on `want`
     * @returns {{gaze:{x,y,z}, head:{x,y,z}, saccade:boolean, big:boolean}}
     */
    step(dt, { eye, want, idle: isIdle = false }) {
      clock += Math.max(0, dt) || 0;
      let target = want;
      if (isIdle) {
        if (!idle || clock >= idleAt) {
          // Mostly near the idle point, sometimes well off it; the first glance is the point itself.
          idle = idle ? { yaw: (rand() * 2 - 1) * GAZE.idleYaw, pitch: (rand() * 2 - 1) * GAZE.idlePitch } : { yaw: 0, pitch: 0 };
          idleAt = clock + between(GAZE.idleMin, GAZE.idleMax);
        }
        target = turnAbout(eye, want, idle.yaw, idle.pitch);
      } else {
        idle = null;
      }
      let saccade = false, big = false;
      if (!fix) { fix = { ...target }; lastSaccade = clock; }
      else if (clock - lastSaccade >= GAZE.holdMin) {
        const a = angleBetween(eye, fix, target);
        if (a > GAZE.threshold) {
          fix = { ...target }; lastSaccade = clock; saccade = true; big = a >= GAZE.big;
          micro = { yaw: 0, pitch: 0 }; microAt = clock + between(GAZE.microMin, GAZE.microMax);
        }
      }
      if (!saccade && clock >= microAt) {
        micro = { yaw: (rand() * 2 - 1) * GAZE.microAmp, pitch: (rand() * 2 - 1) * GAZE.microAmp };
        microAt = clock + between(GAZE.microMin, GAZE.microMax);
      }
      return { gaze: turnAbout(eye, fix, micro.yaw, micro.pitch), head: { ...fix }, saccade, big };
    },
  };
}

// ── Breath ──────────────────────────────────────────────────────────────────
// About 12–14 breaths a minute at rest, faster with effort, never exactly the same twice: the rate
// wanders slowly, the in-breath is shorter than the out-breath, and each breath's depth varies.
export const BREATH = Object.freeze({ restBpm: 12.5, effortBpm: 8, wander: 0.12, inhale: 0.4 });

/** One breath's shape at phase `p` (0..1): -1 empty .. 1 full, a quick inhale and a long exhale. */
export function breathShape(p) {
  const q = p - Math.floor(p);
  if (q < BREATH.inhale) return -Math.cos((q / BREATH.inhale) * Math.PI);
  return Math.cos(((q - BREATH.inhale) / (1 - BREATH.inhale)) * Math.PI);
}

export function createBreath({ rand = mulberry32(3) } = {}) {
  let clock = 0;
  let phase = rand();
  let depth = 0.8 + 0.4 * rand();
  const w1 = rand() * 6.283, w2 = rand() * 6.283;
  return {
    /** @returns {number} -1..1 (times this breath's depth, so somewhere in about ±1.2) */
    step(dt, energy = 0) {
      const d = Math.max(0, dt) || 0;
      clock += d;
      const wander = 1 + BREATH.wander * (0.6 * Math.sin(clock * 0.13 + w1) + 0.4 * Math.sin(clock * 0.31 + w2));
      const bpm = (BREATH.restBpm + BREATH.effortBpm * clamp(energy, 0, 1)) * wander;
      const before = phase;
      phase += (bpm / 60) * d;
      if (Math.floor(phase) !== Math.floor(before)) depth = 0.8 + 0.4 * rand();   // a new breath
      return breathShape(phase) * depth;
    },
    get phase() { return phase; },
  };
}

// ── Weight ──────────────────────────────────────────────────────────────────
// With no beat to move to, a person standing at a desk does not rock side to side on a clock: she
// rests on one leg for several seconds, shifts, sometimes stands square. -1 is her right leg, +1 her
// left, eased by a critically damped spring so a shift takes about a second.
export const WEIGHT = Object.freeze({ holdMin: 3.5, holdMax: 9, square: 0.2, omega: 3.2 });

export function createWeightShift({ rand = mulberry32(4) } = {}) {
  let clock = 0;
  let target = rand() < 0.5 ? -1 : 1;
  let x = target, v = 0;
  let nextAt = WEIGHT.holdMin + (WEIGHT.holdMax - WEIGHT.holdMin) * rand();
  return {
    step(dt) {
      const d = Math.min(0.1, Math.max(0, dt) || 0);
      clock += d;
      if (clock >= nextAt) {
        // From square she always picks a leg (a second "square" would hold her still for two holds).
        target = target === 0 ? (rand() < 0.5 ? -1 : 1) : rand() < WEIGHT.square ? 0 : -target;
        nextAt = clock + WEIGHT.holdMin + (WEIGHT.holdMax - WEIGHT.holdMin) * rand();
      }
      const w = WEIGHT.omega;
      v += (w * w * (target - x) - 2 * w * v) * d;
      x += v * d;
      return x;
    },
    get target() { return target; },
  };
}

/** All four, from one seed, so a performer carries one object. */
export function createFace(seed = 5) {
  const s = seed >>> 0;
  return {
    blink: createBlinker({ rand: mulberry32(s * 4 + 1) }),
    gaze: createGaze({ rand: mulberry32(s * 4 + 2) }),
    breath: createBreath({ rand: mulberry32(s * 4 + 3) }),
    weight: createWeightShift({ rand: mulberry32(s * 4 + 4) }),
  };
}
