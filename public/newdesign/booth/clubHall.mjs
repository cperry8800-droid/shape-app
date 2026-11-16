// clubHall.mjs — Club Shape's main hall, as numbers: the two openings in its roof (the Shape mark),
// the canopy of triangular panels round them, the chandeliers that hang under them, and the table
// terrace on the crowd's right. Pure (no three, no DOM, no clock, no Math.random), so the venue that
// builds them (clubVenue.mjs), the stage that places the crowd and lights the gear (club.mjs), the
// director whose cameras fly past them (noraDirector.mjs) and the tests all read the same figures.
//
// Owner, of the club's pictures: "make the ceiling holes triangles", "same as shape logo", "get
// creative with the ceiling", "feel free to have things that come down", "tables I meant to the
// right of the DJ booth". The pictures were redone to that; this is the live room following them.
//
// Venue frame (clubVenue.mjs): metres, +y up, the stage at +z and the room toward −z. The crowd
// faces the stage, so THE CROWD'S RIGHT IS WORLD −X (the same side as the VIP lounge's doorway).

import { SIDE_ROOMS } from './clubRooms.mjs';

export const HALL = Object.freeze({
  FLOOR_Y: -0.66,
  CEIL_Y: 15.5,
  // the atrium's roof: between the balcony edges (x ±10.5), from the far balcony's edge to the stage-end wall
  ROOF: Object.freeze({ x: 10.5, z0: -42.5, z1: 6.0 }),
  // the mark in the roof: centred where the oval skylight was, 15 m across the room (so 19.5 m along it)
  MARK: Object.freeze({ x: 0, z: -13, w: 15 }),
});

// The Shape mark's two triangles (public/club-shape-logo-white.svg; SVG units, y DOWN), each as
// [base, base, tip]: the first points right, the second left, and their tips pass each other.
export const SHAPE_MARK = Object.freeze([
  Object.freeze([Object.freeze([796.59, 106.42]), Object.freeze([796.89, 251.7]), Object.freeze([900.75, 177.69])]),
  Object.freeze([Object.freeze([980.54, 12]), Object.freeze([980.85, 159.41]), Object.freeze([876.99, 86.01])]),
]);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The two openings in the roof: each triangle's three corners as world [x, z], in the mark's own
 * order ([base, base, tip]). The mark lies flat in the ceiling so that someone on the dance floor,
 * facing the stage and looking up, reads it the right way round: the mark's right is world −X (the
 * crowd's right) and its top is world −Z (behind them, toward the back of the room).
 */
export function skylightTriangles() {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const t of SHAPE_MARK) for (const [x, y] of t) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const k = HALL.MARK.w / (x1 - x0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return SHAPE_MARK.map((t) => t.map(([x, y]) => [HALL.MARK.x - (x - cx) * k, HALL.MARK.z + (y - cy) * k]));
}

// ── plane geometry (points are [x, z]) ─────────────────────────────────────────────────────
const area2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export const triArea = (t) => Math.abs(area2(t[0], t[1], t[2])) / 2;
/** Is p inside triangle t, more than `pad` metres from each of its edges (pad < 0 reaches outside it)? */
export function inTriangle(p, t, pad = 0) {
  const s = Math.sign(area2(t[0], t[1], t[2])) || 1;
  for (let i = 0; i < 3; i++) {
    const a = t[i], b = t[(i + 1) % 3];
    if ((s * area2(a, b, p)) / Math.hypot(b[0] - a[0], b[1] - a[1]) <= pad) return false;
  }
  return true;
}
function distToSegment(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const k = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p[0] - a[0] - k * dx, p[1] - a[1] - k * dz);
}
const centroid = (t) => [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3];

// Delaunay triangulation (Bowyer–Watson) of a few hundred points: index triples.
function delaunay(pts) {
  const n = pts.length;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  const R = 1e4 * Math.max(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  const P = pts.concat([[mx - 2 * R, mz - R], [mx, mz + 2 * R], [mx + 2 * R, mz - R]]);
  const circle = (i, j, k) => {
    const a = P[i], b = P[j], c = P[k];
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    const a2 = a[0] * a[0] + a[1] * a[1], b2 = b[0] * b[0] + b[1] * b[1], c2 = c[0] * c[0] + c[1] * c[1];
    const ux = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
    const uz = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
    return { v: [i, j, k], x: ux, z: uz, r2: (a[0] - ux) ** 2 + (a[1] - uz) ** 2, flat: Math.abs(d) < 1e-9 };
  };
  let tris = [circle(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const p = P[i], keep = [], edges = new Map();
    for (const t of tris) {
      const inside = !t.flat && (p[0] - t.x) ** 2 + (p[1] - t.z) ** 2 < t.r2 * (1 - 1e-12);
      if (!inside) { keep.push(t); continue; }
      for (let e = 0; e < 3; e++) {
        const a = t.v[e], b = t.v[(e + 1) % 3], key = a < b ? a + ':' + b : b + ':' + a;
        edges.set(key, edges.has(key) ? null : [a, b]);   // an edge two removed triangles share is inside the hole
      }
    }
    tris = keep;
    for (const e of edges.values()) if (e) tris.push(circle(e[0], e[1], i));
  }
  return tris.filter((t) => !t.flat && t.v[0] < n && t.v[1] < n && t.v[2] < n).map((t) => t.v);
}

/**
 * The roof round the two openings: a canopy of triangular panels with lit edges.
 * A regular lattice of triangles (rows along the room, each panel pointing across it like the mark's
 * own two) meets the openings' outlines point for point, so no panel is cut by an opening: every
 * panel is a whole triangle, and the openings are exactly the part of the roof no panel covers.
 * Fewer, larger panels on `low`.
 * @returns {{ panels: { pts: number[][], shade: number, lit: boolean }[], lines: number[][] }}
 *   panels: three [x, z] corners, a tone 0..1 and whether it is one of the few dimly lit ones;
 *   lines: [x0, z0, x1, z1] for every panel edge, once (none along an opening: its own outline is there)
 */
export function roofCanopy(quality = 'high') {
  const LOW = quality === 'low';
  const { x: X, z0: Z0, z1: Z1 } = HALL.ROOF;
  const holes = skylightTriangles();
  const cols = LOW ? 4 : 6, h = (2 * X) / cols, b = h / Math.sin(Math.PI / 3);   // equilateral: base b along z, height h across
  const cuts = 3;        // each opening edge in three lengths (≈3.5–4 m), a panel corner at each joint
  // Lattice points stay this far from an opening's outline, more than half such a length: so every
  // length of outline is an edge of the triangulation (nothing lies inside the circle it spans), and
  // the panels beside an opening are no slivers.
  const keep = 2.4;
  const rnd = mulberry32(LOW ? 4703 : 4721);
  const pts = [], onHole = [];   // onHole[i]: point i is on an opening's outline
  const add = (x, z, outline = false) => { pts.push([x, z]); onHole.push(outline); };
  // the openings' outlines
  holes.forEach((t) => {
    for (let e = 0; e < 3; e++) {
      const a = t[e], c = t[(e + 1) % 3];
      for (let k = 0; k < cuts; k++) add(a[0] + ((c[0] - a[0]) * k) / cuts, a[1] + ((c[1] - a[1]) * k) / cuts, true);
    }
  });
  const nearHole = (p) => holes.some((t) => inTriangle(p, t) || t.some((a, e) => distToSegment(p, a, t[(e + 1) % 3]) < keep));
  // the lattice: lines along the room at each column, alternate columns half a base on
  const rows = Math.ceil((Z1 - Z0) / b);
  const bz = (Z1 - Z0) / rows;                 // the base, fitted so the rows end on the roof's ends
  for (let i = 0; i <= cols; i++) {
    const x = -X + i * h;
    if (i % 2 === 0) {
      for (let j = 0; j <= rows; j++) { const p = [x, Z0 + j * bz]; if (!nearHole(p)) add(p[0], p[1]); }
    } else {
      add(x, Z0); add(x, Z1);
      for (let j = 0; j < rows; j++) { const p = [x, Z0 + (j + 0.5) * bz]; if (!nearHole(p)) add(p[0], p[1]); }
    }
  }
  // a hair of jitter on the points inside the roof (never its border or an outline): no four of them
  // sit on one circle, so the triangulation is the same on every machine
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (onHole[i] || Math.abs(Math.abs(p[0]) - X) < 1e-9 || Math.abs(p[1] - Z0) < 1e-9 || Math.abs(p[1] - Z1) < 1e-9) continue;
    p[0] += (rnd() - 0.5) * 0.06 * h; p[1] += (rnd() - 0.5) * 0.06 * h;
  }
  const panels = [], seen = new Map();
  for (const v of delaunay(pts)) {
    const t = v.map((i) => pts[i]);
    if (triArea(t) < 1e-6) continue;
    const c = centroid(t);
    if (holes.some((hole) => inTriangle(c, hole))) continue;   // the opening itself
    panels.push({ pts: t, shade: rnd(), lit: rnd() < 0.16 });
    for (let e = 0; e < 3; e++) {
      const i = v[e], j = v[(e + 1) % 3], key = i < j ? i + ':' + j : j + ':' + i;
      if (!seen.has(key)) seen.set(key, [i, j]);
    }
  }
  const lines = [];
  for (const [i, j] of seen.values()) {
    const a = pts[i], c = pts[j], mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
    // along an opening's outline: the white tube runs there
    if (onHole[i] && onHole[j] && holes.some((t) => t.some((p, e) => distToSegment(mid, p, t[(e + 1) % 3]) < 1e-6))) continue;
    lines.push([a[0], a[1], c[0], c[1]]);
  }
  return { panels, lines };
}

// ── the chandeliers ────────────────────────────────────────────────────────────────────────
// From each opening hang nested triangular rings of truss, each the opening's own shape scaled down
// about its centre and each lower than the one above, a white line of light along every side. Each
// ring hangs by its three corners from the corners above it (the top one from the opening's frame),
// turned and tipped a few degrees its own way.
export const CHANDELIER = Object.freeze({
  high: Object.freeze({ scales: Object.freeze([0.85, 0.66, 0.47, 0.3]), y: Object.freeze([13.7, 12.3, 10.8, 9.3]) }),
  low: Object.freeze({ scales: Object.freeze([0.85, 0.58, 0.32]), y: Object.freeze([13.6, 11.5, 9.4]) }),
  section: Object.freeze({ w: 0.42, h: 0.44 }),  // the truss: this wide and tall round each side's centre line
  frame: 0.985,                                  // where on the opening's frame the top cables are fixed
});

/**
 * Both chandeliers as geometry: for each opening, its rings (world corners, [x, y, z]) and the
 * cables they hang by. `phase` (radians) is each ring's own place in the slow sway; a cable takes
 * the phase of the ring at each of its ends (`pa` above, `pb` below; null at the roof, which is still).
 */
export function chandeliers(quality = 'high') {
  const spec = quality === 'low' ? CHANDELIER.low : CHANDELIER.high;
  const rnd = mulberry32(977);
  return skylightTriangles().map((t, tri) => {
    const c = centroid(t);
    const rings = spec.scales.map((scale, k) => {
      const yaw = (rnd() - 0.5) * 0.09;                       // ±2.6° about the vertical: each still sits inside the one above
      const tilt = (0.035 + rnd() * 0.045) * (rnd() < 0.5 ? -1 : 1);   // 2°–4.6° about a level axis…
      const dir = rnd() * Math.PI;                            // …lying this way
      const phase = rnd() * Math.PI * 2;
      const cy = Math.cos(yaw), sy = Math.sin(yaw), nx = Math.cos(dir), nz = Math.sin(dir);
      const corners = t.map(([x, z]) => {
        const dx = (x - c[0]) * scale, dz = (z - c[1]) * scale;
        const rx = dx * cy - dz * sy, rz = dx * sy + dz * cy;   // turned
        const along = rx * nx + rz * nz;                        // tipped: the part along `dir` swings down or up
        const lift = along * (Math.cos(tilt) - 1);
        return [c[0] + rx + nx * lift, spec.y[k] + along * Math.sin(tilt), c[1] + rz + nz * lift];
      });
      return { scale, y: spec.y[k], corners, phase };
    });
    const cables = [];
    for (let i = 0; i < 3; i++) {
      let a = [c[0] + (t[i][0] - c[0]) * CHANDELIER.frame, HALL.CEIL_Y, c[1] + (t[i][1] - c[1]) * CHANDELIER.frame], pa = null;
      for (const r of rings) { cables.push({ a, b: r.corners[i], pa, pb: r.phase }); a = r.corners[i]; pa = r.phase; }
    }
    return { tri, centre: c, rings, cables };
  });
}

// ── the table terrace ──────────────────────────────────────────────────────────────────────
// The tables are on the crowd's right only: a raised, roped-off terrace beside the stage, from just
// behind the stage's wing to just short of the aisle to the VIP lounge's doorway, booths along it
// (sofa, a table with a candle, sofa) and steps down at its far end. Nowhere else on the floor.
export const TERRACE = Object.freeze({
  side: -1,                 // world −X: the crowd's right
  x0: -10.8, x1: -6.6,      // from under the balcony's edge out to the dance floor
  z0: -18.5, z1: -3.0,      // its far end (the foot of the steps) and its stage end
  h: 0.45,
  steps: 2, tread: 0.3,     // two steps down at the far end, inside z0
  pitch: 3.0,               // a booth every 3 m
  sofaIn: -7.2, table: -8.8, sofaOut: -10.4,   // a booth across the terrace: sofa (its back to the floor), table, sofa
  rope: 0.13,               // the rope's line, this far in from the terrace's edge
});
const SOFA_HALF = 1.0;      // half a sofa's length along the terrace (clubVenue's sofa template)

/** The terrace's booths: where each sofa and table stands (`y` is the terrace's top). */
export function terraceBooths() {
  const T = TERRACE, deck0 = T.z0 + T.steps * T.tread, len = T.z1 - deck0;
  const n = Math.floor((len - 2 * SOFA_HALF - 0.6) / T.pitch) + 1;
  const first = T.z1 - (len - (n - 1) * T.pitch) / 2;
  const bays = Array.from({ length: n }, (_, k) => first - k * T.pitch);
  const sofas = [], tables = [];
  for (const z of bays) {
    // the inner sofa's back is to the dance floor and its seat faces the table (−X); the outer one faces back
    sofas.push({ x: T.sofaIn, z, ry: -Math.PI / 2 }, { x: T.sofaOut, z, ry: Math.PI / 2 });
    tables.push({ x: T.table, z });
  }
  return { y: HALL.FLOOR_Y + T.h, bays, sofas, tables };
}

/**
 * The rope round the terrace: brass posts along its dance-floor edge and across its stage end, and
 * the spans of rope between them (pairs of post indices). The far end is open: the steps.
 */
export function terraceRope() {
  const T = TERRACE, x = T.x1 - T.rope, zA = T.z1 - T.rope, zB = T.z0 + T.steps * T.tread + T.rope, xB = T.x0 + T.rope;
  const posts = [], spans = [];
  const nEnd = Math.max(1, Math.round((x - xB) / 2.0)), nSide = Math.max(1, Math.round((zA - zB) / 2.1));
  for (let k = nEnd; k >= 1; k--) posts.push([x - ((x - xB) * k) / nEnd, zA]);   // across the stage end, from the wall side
  for (let k = 0; k <= nSide; k++) posts.push([x, zA - ((zA - zB) * k) / nSide]);   // down the dance-floor edge
  for (let i = 0; i + 1 < posts.length; i++) spans.push([i, i + 1]);
  return { posts, spans, y: HALL.FLOOR_Y + T.h, height: 0.95 };
}

// ── the dance floor's width ────────────────────────────────────────────────────────────────
// Where the floor's booths stood (all down the crowd's left, and on the right beyond the terrace)
// the floor is open, and the crowd takes it: out to FLOOR_SIDE on each side, but never onto the
// terrace, and never into the aisle to either side room's doorway.
export const FLOOR_SIDE = 10.2;
const AISLE_PAD = 0.35;

/**
 * The crowd's reach across the floor at depth z: [xMin, xMax]. `half` is the dance floor's own
 * half-width (CLUB_DIMS.CROWD.x), which is all it has in the aisle between the two doorways and,
 * on the crowd's right, from the stage back to them (the terrace bites into that).
 */
export function crowdSpan(z, half) {
  const T = TERRACE, D = SIDE_ROOMS.door;
  const aisle = z > D.z0 - AISLE_PAD && z < D.z1 + AISLE_PAD;
  let lo = -half, hi = half;
  if (!aisle) { hi = FLOOR_SIDE; if (z < D.z0) lo = -FLOOR_SIDE; }
  if (z > T.z0 - AISLE_PAD && z < T.z1 + AISLE_PAD) lo = Math.max(lo, T.x1 + AISLE_PAD);
  return [lo, hi];
}
