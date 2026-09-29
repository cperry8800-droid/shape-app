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
};
export const SHOT_IDS = Object.keys(SHOTS);

const HINT_TO_SHOT = { screen: 'screen', jog: 'jog', mixer: 'mixer', wide: 'wide' };

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
  // Handheld: a sum of incommensurate sines, not noise — deterministic and smooth.
  const h = s.handheld;
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
   */
  constructor({ seed = 11, style = 'cut' } = {}) {
    this.seed = seed;
    this.style = style;
    this.mode = 'auto';          // 'auto' | a shot id (locked) | 'free' (the user is orbiting)
    this.shot = 'club';          // open on the room, like walking in
    this.shotStartBar = 0;
    this.shotStartT = 0;
    this.shotBars = SHOTS.club.bars;
    this._pendingHint = null;
    this.history = [];
    this._out = { pos: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 38 };
    this._prev = { pos: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 38 };
    this._blend = 1;             // 0→1 glide progress
    this._lastHint = null;
  }

  /** Lock a shot, go back to auto, or hand control to the user ('free'). */
  setMode(mode, bar = 0, t = 0) {
    this.mode = mode;
    if (mode !== 'auto' && mode !== 'free' && SHOTS[mode]) this._cut(mode, Math.floor(bar), t, false);
  }

  _pick(bar) {
    const rnd = mulberry32((this.seed * 7919) ^ (bar * 2654435761));
    const recent = this.history.slice(-2);
    const pool = SHOT_IDS.filter((id) => !recent.includes(id) && id !== this.shot && id !== 'screen');
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
        const next = ctx.drop ? (this.shot === 'crane' ? 'club' : 'crane') : this._pick(whole);
        const glide = this.style === 'glide' || (this.shot === 'wide' && next === 'panorama');
        this._cut(next, whole, t, glide);
      }
      this._lastHint = hint || null;
    } else if (this.mode !== 'free' && whole >= this.shotStartBar + this.shotBars) {
      // A locked shot loops its move.
      this._cut(this.mode, whole, t, false);
    }
    const u = clamp((bar - this.shotStartBar) / this.shotBars, 0, 1);
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
