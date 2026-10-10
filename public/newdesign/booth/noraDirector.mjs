// Nora's camera director — a live music-video editor for the booth.
//
// Every shot is a function of where things ARE this frame (Nora's head, the playing jog,
// the incoming deck's screen, the mixer), so the camera frames the gear it is about
// rather than a hard-coded spot. Cuts land on BAR boundaries of the measured beat, which
// is what makes an edit feel "on the music"; during a mix the choreography's camHint
// drives the edit (screen when the next track loads → jog on the cue → mixer on the
// blend and bass swap → wide on the drop).
//
// No DOM, no Math.random / Date.now: shot choice is a seeded function of the bar number,
// so the same set always cuts the same way (replayable, testable).

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const ease = (u) => u * u * (3 - 2 * u);
const lerp = (a, b, u) => a + (b - a) * u;

// Shot library. `bars` = default length; `weight` = how often auto picks it; `handheld` =
// camera-shake amplitude in metres (close shots shake less, like a stabilised rig).
export const SHOTS = {
  club:      { label: 'Club Shape', bars: 8, weight: 2, handheld: 0.006, fov: 50 },
  atrium:    { label: 'Atrium',    bars: 16, weight: 2, handheld: 0.0, fov: 54 },
  wide:      { label: 'Wide',      bars: 8,  weight: 3, handheld: 0.010, fov: 38 },
  panorama:  { label: 'Panorama',  bars: 16, weight: 3, handheld: 0.004, fov: 40 },
  overhead:  { label: 'Overhead',  bars: 4,  weight: 2, handheld: 0.003, fov: 46 },
  jog:       { label: 'Jog',       bars: 4,  weight: 2, handheld: 0.004, fov: 30 },
  mixer:     { label: 'Mixer',     bars: 4,  weight: 2, handheld: 0.004, fov: 32 },
  screen:    { label: 'Screen',    bars: 2,  weight: 1, handheld: 0.002, fov: 28 },
  shoulder:  { label: 'Crowd view', bars: 8, weight: 2, handheld: 0.008, fov: 46 },
  profile:   { label: 'Profile',   bars: 4,  weight: 2, handheld: 0.006, fov: 30 },
  crane:     { label: 'Crane',     bars: 8,  weight: 1, handheld: 0.000, fov: 42 },
  face:      { label: 'Nora',      bars: 4,  weight: 1, handheld: 0.005, fov: 28 },
  behind:    { label: 'Behind Nora', bars: 8, weight: 2, handheld: 0.004, fov: 54 },
  drone:     { label: 'Drone',     bars: 40, weight: 1, handheld: 0.0015, fov: 58 },
  arrival:   { label: 'Arrival',   bars: 12, weight: 1, handheld: 0.0, fov: 46 },
};
export const SHOT_IDS = Object.keys(SHOTS);

const HINT_TO_SHOT = { screen: 'screen', jog: 'jog', mixer: 'mixer', wide: 'wide' };

// ── the drone: one continuous flight through the whole club ─────────────────────────────
// Off Nora, back over the crowd looking down the room, across to the left balconies and along
// the second tier beside the rail (the guests and the private boxes), up past the third tier to
// the skylight ring for the view all the way back to the far end, over the far half, down the
// right side to the back of the dance floor, and a low skim over the heads home to the booth. A closed loop, so a held Drone shot flies it again without a
// jump. Heights clear the floor palms' crowns (≈7 m); the balcony pass stays 2 m inside the rails
// and 1.7 m above the tier's floor. Club frame: stage at +z, crowd from z −1.8 to −34, balconies
// at |x| ≥ 10.5 on tiers y = 3.6 / 7.6 / 11.6, ceiling 15.5, far wall z −46.
const DRONE = [
  { p: [0.0, 2.75, -3.8], t: [0.0, 1.45, 0.4] },      // on Nora (above the raised hands, ≈2.2 m)
  { p: [0.9, 3.4, -11.0], t: [0.0, 2.2, -30.0] },     // back over the crowd, down the room
  { p: [-3.4, 7.4, -21.0], t: [-10.0, 8.6, -30.0] },  // climbing toward the left balconies
  { p: [-8.4, 9.4, -27.0], t: [-10.2, 8.8, -10.0] },  // tier two, beside the rail, looking along it
  { p: [-8.4, 9.6, -12.0], t: [-10.0, 8.8, 4.0] },    // cruising the boxes toward the stage
  { p: [-5.8, 12.6, -5.0], t: [-1.5, 8.5, -30.0] },   // climbing past tier three, turning back
  { p: [0.0, 13.8, -8.5], t: [0.0, 4.5, -45.0] },     // under the skylight: the whole club, all the way back
  { p: [3.6, 13.2, -25.0], t: [0.0, 3.0, -45.0] },    // over the far half
  { p: [8.3, 9.6, -31.0], t: [10.0, 8.6, -12.0] },    // down to the right balconies, looking back to the stage
  { p: [3.0, 4.2, -33.5], t: [0.0, 2.2, 0.4] },       // down to the back of the dance floor, turning to the stage
  { p: [1.0, 2.6, -25.0], t: [0.0, 1.9, 0.4] },       // the skim: just over the heads (raised hands reach ≈2.2 m)…
  { p: [-0.7, 2.55, -15.0], t: [0.0, 1.8, 0.4] },     // …the whole length of the crowd…
  { p: [-0.3, 2.6, -8.0], t: [0.0, 1.6, 0.4] },       // …up to the booth
];
function catmull(a, b, c, d, u) {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (3 * b - a - 3 * c + d) * u3);
}
function droneRaw(k, u, key, out) {   // segment k (closed), local u
  const n = DRONE.length, A = DRONE[(k - 1 + n) % n][key], B = DRONE[k % n][key], C = DRONE[(k + 1) % n][key], D = DRONE[(k + 2) % n][key];
  for (let i = 0; i < 3; i++) out[i] = catmull(A[i], B[i], C[i], D[i], u);
  return out;
}
// Arc-length table, so the drone flies at an even speed (a raw spline crawls on short legs and
// races on long ones).
const DRONE_LUT = (() => {
  const n = DRONE.length, steps = 64, pts = [], tmp = [0, 0, 0];
  for (let k = 0; k < n; k++) for (let i = 0; i < steps; i++) pts.push([k, i / steps, ...droneRaw(k, i / steps, 'p', tmp)]);
  pts.push([n, 0, ...droneRaw(0, 0, 'p', tmp)]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][2] - pts[i - 1][2], pts[i][3] - pts[i - 1][3], pts[i][4] - pts[i - 1][4]));
  return { pts, cum, total: cum[cum.length - 1] };
})();
function droneAt(u, P, T) {
  const L = DRONE_LUT, want = (((u % 1) + 1) % 1) * L.total;
  let lo = 0, hi = L.cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L.cum[m] <= want) lo = m; else hi = m; }
  const f = (want - L.cum[lo]) / Math.max(1e-6, L.cum[hi] - L.cum[lo]);
  const a = L.pts[lo], b = L.pts[hi];
  const ga = a[0] + a[1], gb = (b[0] + b[1]) || DRONE.length;   // global spline parameter
  const g = ga + (gb - ga) * f, k = Math.floor(g) % DRONE.length, lu = g - Math.floor(g);
  const p = droneRaw(k, lu, 'p', [0, 0, 0]), t = droneRaw(k, lu, 't', [0, 0, 0]);
  P.x = p[0]; P.y = p[1]; P.z = p[2]; T.x = t[0]; T.y = t[1]; T.z = t[2];
}
export const _droneForTest = { DRONE, droneAt, total: DRONE_LUT.total };

// ── the arrival: in from the bay, over the crowd and under the roof toward the stage ──────────
// Club Shape from outside (clubExterior.mjs, the Shape Sets background): high over the water with
// the venue below and the city across the bay, then down over the peninsula and the bowl's rim, and
// low over the crowd toward the stage under the roof. The exterior is a set of its own, so the flight
// ends there and the director cuts to the drone, which opens on Nora at the decks.
// Open-ended (not a loop): the ends are held by doubling them.
const ARRIVAL = [
  { p: [-20, 215, -430], t: [0, 8, 10], fov: 44 },      // high and far over the bay: the venue, the water, the city beyond, as the Shape Sets picture has them
  { p: [-32, 108, -200], t: [6, 16, 28], fov: 46 },      // aimed at the venue, so a portrait phone keeps it in frame
  { p: [-18, 68, -135], t: [2, 6, 10], fov: 48 },        // over the waterfront promenade
  { p: [-5, 42, -92], t: [0, 6, 5], fov: 50 },           // over the plaza, the bowl ahead
  { p: [0, 27, -62], t: [0, 7, 10], fov: 52 },           // over the rim (6 m) and the terraces
  { p: [0, 17, -38], t: [0, 7, 15], fov: 52 },           // down over the crowd
  { p: [0, 13, -22], t: [0, 7, 15], fov: 48 },           // the roof's mouth and the stage ahead
  { p: [0, 12, -14], t: [0, 7, 15], fov: 46 },           // over the crowd, the stage 20 m on
];
function arrivalRaw(g, key, out) {   // global parameter g in [0, n−1]
  const n = ARRIVAL.length, k = Math.min(n - 2, Math.floor(g)), u = g - k;
  const at = (i) => ARRIVAL[clamp(i, 0, n - 1)][key];
  if (key === 'fov') return catmull(at(k - 1), at(k), at(k + 1), at(k + 2), u);
  const A = at(k - 1), B = at(k), C = at(k + 1), D = at(k + 2);
  for (let i = 0; i < 3; i++) out[i] = catmull(A[i], B[i], C[i], D[i], u);
  return out;
}
// The flight slows as it comes down: each step costs its length over its height (plus 6 m), so the
// high glide over the bay and the last metres to the booth take their time alike.
const ARRIVAL_LUT = (() => {
  const n = ARRIVAL.length, steps = 96, gs = [], cum = [0], p = [0, 0, 0], q = [0, 0, 0];
  for (let i = 0; i <= (n - 1) * steps; i++) gs.push(i / steps);
  arrivalRaw(0, 'p', p);
  for (let i = 1; i < gs.length; i++) {
    arrivalRaw(gs[i], 'p', q);
    const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    cum.push(cum[i - 1] + d / (6 + Math.max(0, (p[1] + q[1]) / 2)));
    p[0] = q[0]; p[1] = q[1]; p[2] = q[2];
  }
  return { gs, cum, total: cum[cum.length - 1] };
})();
function arrivalAt(u, P, T) {
  const L = ARRIVAL_LUT, want = ease(clamp(u, 0, 1)) * L.total;
  let lo = 0, hi = L.cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L.cum[m] <= want) lo = m; else hi = m; }
  const f = (want - L.cum[lo]) / Math.max(1e-9, L.cum[hi] - L.cum[lo]);
  const g = L.gs[lo] + (L.gs[hi] - L.gs[lo]) * f;
  const p = arrivalRaw(g, 'p', [0, 0, 0]), t = arrivalRaw(g, 't', [0, 0, 0]);
  P.x = p[0]; P.y = p[1]; P.z = p[2]; T.x = t[0]; T.y = t[1]; T.z = t[2];
  return arrivalRaw(g, 'fov');
}
export const _arrivalForTest = { ARRIVAL, arrivalAt };

/**
 * Evaluate one shot at progress u (0..1) and absolute time t.
 * ctx: { head, jog:[v3,v3], screen:[v3,v3], mixer, xfader, deck (active 0|1), incoming (0|1|null) }
 * out: { pos:{x,y,z}, target:{x,y,z}, fov }
 */
export function evalShot(id, u, t, ctx, out) {
  const P = out.pos, T = out.target;
  const s = SHOTS[id] || SHOTS.wide;
  out.fov = s.fov;
  const e = ease(clamp(u, 0, 1));
  const hd = ctx.head;
  switch (id) {
    case 'club': {
      // The establishing shot: from the back of Club Shape, over the crowd, past the gold
      // balconies and under the skylight ring, to the stage and Nora at the far end.
      P.x = lerp(-1.4, 1.1, e); P.y = lerp(9.6, 8.6, e); P.z = lerp(-35, -31, e);
      // Aimed high enough that the skylight ring and the skyline sit across the top of the
      // frame the way they do in the owner's interior reference; the stage lands in the lower third.
      T.x = 0; T.y = 6.2; T.z = 0.5;
      break;
    }
    case 'atrium': {
      // The reference frame: the owner's photoreal Club Shape render, shot from high at the back of
      // the room and dead centre — the oval skylight across the top, the three balcony tiers down
      // both sides, the sofa booths in the lower corners, the crowd filling the middle and the
      // stage portal small and central at the far end. Just in front of the far tier-two rail
      // (z −42.5), level with the gap between tiers two and three, so nothing structural sits in
      // front of the lens. A barely-there push, no handheld: an establishing plate.
      P.x = 0; P.y = lerp(10.1, 9.8, e); P.z = lerp(-41.8, -40.8, e);
      T.x = 0; T.y = lerp(5.9, 5.7, e); T.z = 2.0;
      break;
    }
    case 'wide': {
      // From the crowd, a slow push toward the booth.
      P.x = lerp(-0.6, 0.35, e); P.y = lerp(1.85, 1.7, e); P.z = lerp(-6.2, -4.7, e);
      T.x = 0; T.y = 1.3; T.z = 0.4;
      break;
    }
    case 'panorama': {
      // The owner's ask: a slow orbit around the booth, crowd side to side.
      const a = lerp(-1.05, 1.05, u) + Math.PI;        // around −Z (the crowd side)
      const R = 3.1;
      P.x = Math.sin(a) * R; P.z = 0.15 + Math.cos(a) * R; P.y = 1.75 + Math.sin(u * Math.PI) * 0.25;
      T.x = 0; T.y = 1.15; T.z = 0.15;
      break;
    }
    case 'overhead': {
      const a = lerp(-0.18, 0.18, e);
      P.x = Math.sin(a) * 0.35; P.y = 2.75; P.z = -0.45 + Math.cos(a) * 0.1;
      T.x = 0; T.y = 1.0; T.z = 0.0;
      break;
    }
    case 'jog': {
      const d = ctx.deck === 1 ? 1 : 0;
      const j = ctx.jog[d];
      const side = d === 0 ? -1 : 1;                    // outboard of the deck
      P.x = j.x + side * lerp(0.42, 0.30, e); P.y = j.y + lerp(0.26, 0.2, e); P.z = j.z - lerp(0.34, 0.28, e);
      T.x = j.x - side * 0.02; T.y = j.y + 0.01; T.z = j.z;
      break;
    }
    case 'mixer': {
      // Low, from the crowd side across the mixer: the channel strips fill the frame and her
      // hands reach into them, her face behind (a camera behind her only sees hair).
      const m = ctx.mixer;
      P.x = m.x + lerp(0.26, -0.2, e); P.y = m.y + 0.3; P.z = m.z - 0.6;
      T.x = m.x + lerp(0.05, -0.04, e); T.y = m.y + 0.06; T.z = m.z + 0.12;
      break;
    }
    case 'screen': {
      const d = ctx.incoming != null ? ctx.incoming : (ctx.deck === 1 ? 1 : 0);
      const sc = ctx.screen[d];
      P.x = sc.x + (d === 0 ? -0.06 : 0.06); P.y = sc.y + lerp(0.3, 0.24, e); P.z = sc.z + lerp(0.3, 0.24, e);
      T.x = sc.x; T.y = sc.y; T.z = sc.z;
      break;
    }
    case 'shoulder': {
      // Behind Nora looking out at the room: her silhouette, the decks, the crowd, the beams.
      P.x = lerp(-0.42, -0.2, e); P.y = 1.78; P.z = 1.3;
      T.x = 0.15; T.y = 1.25; T.z = -3.5;
      break;
    }
    case 'profile': {
      // Low side angle, backlit by the LED wall.
      P.x = lerp(2.0, 1.75, e); P.y = 0.98; P.z = lerp(-0.1, 0.25, e);
      T.x = 0; T.y = 1.35; T.z = 0.3;
      break;
    }
    case 'crane': {
      P.x = lerp(-3.2, -1.6, e); P.y = lerp(2.0, 3.7, e); P.z = lerp(-3.8, -2.6, e);
      T.x = 0; T.y = 1.15; T.z = 0.35;
      break;
    }
    case 'behind': {
      // Behind her and a little above her head, looking out at the crowd: the back of her head and
      // shoulders at the bottom of the frame, the dance floor filling it, the balconies at the top.
      // In front of the LED wall (z 2.0), so the wall lights her from behind. The aim sits low
      // enough that her head (≈27° below the lens) stays in frame at this lens.
      P.x = lerp(-0.32, 0.32, e); P.y = 2.2 + 0.06 * Math.sin(u * Math.PI); P.z = 1.45;
      T.x = lerp(-1.4, 1.4, e); T.y = -0.6; T.z = -12;
      break;
    }
    case 'drone': {
      droneAt(u, P, T);
      break;
    }
    case 'arrival': {
      out.fov = arrivalAt(u, P, T);
      break;
    }
    case 'face': {
      // Low and in front, on the side she is looking toward, so the face (not the back of her
      // head) is what the shot is of.
      const side = ctx.lookSide || 1;
      P.x = hd.x + side * lerp(0.26, 0.16, e); P.y = hd.y - 0.14; P.z = hd.z - lerp(0.85, 0.72, e);
      T.x = hd.x + side * 0.03; T.y = hd.y - 0.04; T.z = hd.z;
      break;
    }
    default: return evalShot('wide', u, t, ctx, out);
  }
  // Handheld: a sum of incommensurate sines, not noise — deterministic and smooth. Off under
  // reduced motion: a locked-off camera is what that preference asks for.
  const h = ctx.reducedMotion ? 0 : s.handheld;
  if (h) {
    P.x += h * (Math.sin(t * 1.3) * 0.6 + Math.sin(t * 2.9 + 1.1) * 0.4);
    P.y += h * (Math.sin(t * 1.7 + 0.5) * 0.5 + Math.sin(t * 3.7) * 0.3);
    T.x += h * 0.8 * Math.sin(t * 0.9 + 2.0);
  }
  return out;
}

export class NoraDirector {
  /**
   * @param {object} o
   * @param {number} [o.seed]
   * @param {'cut'|'glide'} [o.style]  'cut' = hard cuts on the bar (music-video),
   *        'glide' = the camera travels between shots over one beat (smoother, calmer)
   * @param {boolean} [o.reducedMotion]  prefers-reduced-motion: no handheld sway, and the
   *        caller passes no kick, so no zoom punch either
   * @param {string[]} [o.exclude]  shots the automatic rotation never picks (a locked shot still
   *        can be): the booth leaves out the full-face close-up while its model is a placeholder
   * @param {boolean} [o.arrival]  there is an outside to fly in to. The booth has one only with the
   *        venue model (CLUB_SHAPE_MODEL); without it the arrival is never picked, as under reduced motion
   *
   * It opens on the arrival, the flight in from the bay. Under reduced motion it opens on the room
   * instead and never picks the arrival itself: a 300 m descent is the camera move that preference
   * is about (a locked Arrival still plays it, because the viewer asked for it).
   */
  constructor({ seed = 11, style = 'cut', reducedMotion = false, exclude = [], arrival = true } = {}) {
    this.seed = seed;
    this.exclude = new Set(exclude);
    if (reducedMotion || !arrival) this.exclude.add('arrival');
    this.style = style;
    this.reducedMotion = !!reducedMotion;
    this.mode = 'auto';          // 'auto' | a shot id (locked) | 'free' (the user is orbiting)
    this.shot = reducedMotion || !arrival ? 'club' : 'arrival';   // fly in from the bay; or open on the room, like walking in
    this.shotStartBar = 0;
    this.shotStartT = 0;
    this.shotBars = SHOTS[this.shot].bars;
    this._bar = 0;               // the last bar update() saw (restartClock keeps a shot's progress by it)
    this._pendingHint = null;
    this.history = [];
    this._out = { pos: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 38 };
    this._prev = { pos: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 38 };
    this._blend = 1;             // 0→1 glide progress
    this._lastHint = null;
  }

  /**
   * The host's bar clock restarted (the example set began or ended): carry the current shot on from
   * where it was on the new clock, instead of restarting it (an arrival half-flown would jump back out
   * over the bay) or leaving it to wait for a bar the new clock will not reach for minutes.
   */
  restartClock(bar, t) {
    const done = clamp(this._bar - this.shotStartBar, 0, this.shotBars);
    this.shotStartBar = bar - done;
    this.shotStartT = t;
    this._bar = bar;
  }

  /** Lock a shot, go back to auto, or hand control to the user ('free'). */
  setMode(mode, bar = 0, t = 0) {
    this.mode = mode;
    if (mode !== 'auto' && mode !== 'free' && SHOTS[mode]) this._cut(mode, Math.floor(bar), t, false);
  }

  _pick(bar) {
    const rnd = mulberry32((this.seed * 7919) ^ (bar * 2654435761));
    const recent = this.history.slice(-2);
    const pool = SHOT_IDS.filter((id) => !recent.includes(id) && id !== this.shot && id !== 'screen' && !this.exclude.has(id));
    let total = 0; for (const id of pool) total += SHOTS[id].weight;
    let r = rnd() * total;
    for (const id of pool) { r -= SHOTS[id].weight; if (r <= 0) return id; }
    return pool[pool.length - 1];
  }

  _cut(id, bar, t, glide) {
    if (glide) { this._prev = JSON.parse(JSON.stringify(this._out)); this._blend = 0; } else this._blend = 1;
    this.history.push(this.shot);
    if (this.history.length > 8) this.history.shift();
    this.shot = id;
    this.shotStartBar = bar;
    this.shotStartT = t;
    this.shotBars = SHOTS[id].bars;
  }

  /**
   * Advance and return the camera for this frame.
   * @param {number} t      seconds
   * @param {number} bar    float bars from the beat clock
   * @param {object} ctx    anchors (see evalShot) + { hint, drop }
   * @param {number} secPerBar
   * @param {number} dt       seconds since the last frame
   */
  update(t, bar, ctx, secPerBar, dt = 1 / 60) {
    const whole = Math.floor(bar);
    this._bar = bar;
    if (this.mode === 'auto') {
      const hint = ctx.hint ? HINT_TO_SHOT[ctx.hint] : null;
      if (hint && hint !== this._lastHint) this._pendingHint = { id: hint, bar: whole };
      if (!hint) this._pendingHint = null;
      const due = whole >= this.shotStartBar + this.shotBars;
      const ph = this._pendingHint;
      // The choreography says something is happening: cut to it on the next bar line (or
      // this one, if we are still at its start). Latched, so a slow frame that lands late in
      // the bar cannot miss the cut.
      if (ph && ph.id !== this.shot && (bar - whole < 0.35 || whole > ph.bar)) {
        this._cut(ph.id, whole, t, false);
        this._pendingHint = null;
      } else if (ph && ph.id === this.shot) {
        this._pendingHint = null;
      } else if (due) {
        // The arrival ends in front of the venue's stage outside; it cuts to the drone, on Nora.
        const next = this.shot === 'arrival' && !this.exclude.has('drone') ? 'drone'
          : ctx.drop ? (this.shot === 'crane' ? 'club' : 'crane') : this._pick(whole);
        // Never a glide into or out of the arrival: it is another set, so the change is a cut.
        const glide = (this.style === 'glide' || (this.shot === 'wide' && next === 'panorama')) && next !== 'arrival' && this.shot !== 'arrival';
        this._cut(next, whole, t, glide);
      }
      this._lastHint = hint || null;
    } else if (this.mode !== 'free' && whole >= this.shotStartBar + this.shotBars) {
      // A locked shot loops its move.
      this._cut(this.mode, whole, t, false);
    }
    const u = clamp((bar - this.shotStartBar) / this.shotBars, 0, 1);
    if (this.reducedMotion && !ctx.reducedMotion) ctx = { ...ctx, reducedMotion: true };
    const out = evalShot(this.shot, u, t, ctx, this._out);
    if (this._blend < 1) {
      // A glide takes half a bar (one beat pair) of real time, whatever the frame rate.
      this._blend = clamp(this._blend + dt / Math.max(0.3, secPerBar * 0.5), 0, 1);
      const k = ease(this._blend);
      for (const key of ['pos', 'target']) for (const c of ['x', 'y', 'z']) out[key][c] = lerp(this._prev[key][c], out[key][c], k);
      out.fov = lerp(this._prev.fov, out.fov, k);
    }
    // A breath on the kick for the wide shots only — a zoom punch reads as energy there
    // and as seasickness in a close-up.
    if ((this.shot === 'wide' || this.shot === 'crane' || this.shot === 'shoulder') && ctx.kick) out.fov -= ctx.kick * 0.7;
    return out;
  }
}
