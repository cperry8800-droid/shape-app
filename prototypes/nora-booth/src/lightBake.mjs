// lightBake.mjs — baked lighting for Club Shape's architecture, computed at load.
//
// The venue is unlit geometry (MeshBasicMaterial with vertex colours): that is what keeps a phone at
// 1 M triangles, but it also meant every warm pool of light was painted by hand (a gradient here, a
// flat additive disc there) and nothing was ever in shadow. This bakes the light instead, once, into
// the same vertex colours (and the floor's lightmap canvas), so the runtime cost is zero and the
// download is zero:
//
//   direct     every small source the reference is lit by — soffit downlights, the handrail LEDs,
//              table lamps and candles, the palms' uplights, the lounge glass — as a point (or spot)
//              with inverse-square falloff and a soft core, cosine-weighted by the surface normal
//   shadows    a shadow ray per (vertex, light) against the architecture's boxes (the slabs, kerbs and
//              columns), through a uniform grid, so a slab really does block the tier above's lamps
//   AO         a handful of short hemisphere rays per vertex against the same boxes: the corners where
//              walkway meets kerb, glass line and column go dark, as they do in a real room
//   bounce     one bounce, approximated: the direct light landing on the surfaces within 2 m (binned
//              into cells with their mean normal) re-emitted diffusely by their albedo — warm floors
//              lift the soffits above them
//
// Pure (no three, no DOM, no clock, no Math.random: the AO directions are a fixed Fibonacci set), so
// it runs and is tested in Node. Plain arrays in, colours out.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// A number, not a string, keys every grid cell: a string per cell step was most of a ray's cost.
const cellKey = (i, j, k) => ((i + 1024) * 2048 + (j + 1024)) * 2048 + (k + 1024);

/** A uniform grid over axis-aligned boxes: cell → box indices. */
export function boxGrid(boxes, cell = 2) {
  const map = new Map();
  boxes.forEach((b, n) => {
    const i0 = Math.floor(b[0] / cell), i1 = Math.floor(b[3] / cell);
    const j0 = Math.floor(b[1] / cell), j1 = Math.floor(b[4] / cell);
    const k0 = Math.floor(b[2] / cell), k1 = Math.floor(b[5] / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const s = cellKey(i, j, k); let a = map.get(s); if (!a) map.set(s, (a = [])); a.push(n);
    }
  });
  return { map, cell, boxes, stamp: new Int32Array(boxes.length), tick: 0 };
}

/** Ray (o, unit d, 0…tMax) against one box [x0,y0,z0,x1,y1,z1] (slab test). */
export function rayBox(ox, oy, oz, dx, dy, dz, tMax, b) {
  let t0 = 0, t1 = tMax;
  const ax = [ox, oy, oz], ad = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    const o = ax[a], d = ad[a], lo = b[a], hi = b[a + 3];
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; continue; }
    let ta = (lo - o) / d, tb = (hi - o) / d;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

/** Is the segment from o along unit d for length tMax blocked by any box in the grid? (3D DDA walk) */
export function occluded(G, ox, oy, oz, dx, dy, dz, tMax) {
  if (!G || !G.boxes.length) return false;
  const c = G.cell;
  G.tick++;
  let i = Math.floor(ox / c), j = Math.floor(oy / c), k = Math.floor(oz / c);
  const si = dx > 0 ? 1 : -1, sj = dy > 0 ? 1 : -1, sk = dz > 0 ? 1 : -1;
  const next = (p, d, n, s) => (Math.abs(d) < 1e-9 ? Infinity : (((n + (s > 0 ? 1 : 0)) * c) - p) / d);
  let tx = next(ox, dx, i, si), ty = next(oy, dy, j, sj), tz = next(oz, dz, k, sk);
  const ddx = Math.abs(d_(dx)) , ddy = Math.abs(d_(dy)), ddz = Math.abs(d_(dz));
  function d_(v) { return Math.abs(v) < 1e-9 ? Infinity : c / v; }
  let t = 0;
  for (let guard = 0; guard < 256 && t <= tMax; guard++) {
    const list = G.map.get(cellKey(i, j, k));
    if (list) for (const n of list) {
      if (G.stamp[n] === G.tick) continue;
      G.stamp[n] = G.tick;
      if (rayBox(ox, oy, oz, dx, dy, dz, tMax, G.boxes[n])) return true;
    }
    if (tx < ty && tx < tz) { t = tx; tx += ddx; i += si; }
    else if (ty < tz) { t = ty; ty += ddy; j += sj; }
    else { t = tz; tz += ddz; k += sk; }
  }
  return false;
}

/** Lights indexed by a coarse grid, so each vertex only visits the sources within their range. */
export function lightGrid(lights, cell = 3) {
  const map = new Map();
  lights.forEach((L, n) => {
    const r = L.range || 6;
    const i0 = Math.floor((L.p[0] - r) / cell), i1 = Math.floor((L.p[0] + r) / cell);
    const j0 = Math.floor((L.p[1] - r) / cell), j1 = Math.floor((L.p[1] + r) / cell);
    const k0 = Math.floor((L.p[2] - r) / cell), k1 = Math.floor((L.p[2] + r) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const s = cellKey(i, j, k); let a = map.get(s); if (!a) map.set(s, (a = [])); a.push(n);
    }
  });
  return { map, cell, lights };
}

// Fixed, well-spread hemisphere directions (Fibonacci), rotated onto each normal.
function fibDirs(n) {
  const out = [], g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) { const z = 1 - (i + 0.5) / n, r = Math.sqrt(1 - z * z), a = i * g; out.push([Math.cos(a) * r, Math.sin(a) * r, z]); }
  return out;
}

/**
 * Direct light (+ shadows) at one point with normal n. Light: { p, c:[r,g,b] (at 1 m), r0 (soft core,
 * m), range (m), dir? (unit, the spot's axis), cos0?/cos1? (full/zero cone cosines), shadow? (default true),
 * self? (skip shadow tests within this distance of the source, for a lamp inside its own shade) }
 */
export function directAt(px, py, pz, nx, ny, nz, LG, OG, out) {
  out[0] = out[1] = out[2] = 0;
  const cell = LG.cell;
  const list = LG.map.get(cellKey(Math.floor(px / cell), Math.floor(py / cell), Math.floor(pz / cell)));
  if (!list) return out;
  for (const n of list) {
    const L = LG.lights[n];
    let lx = L.p[0] - px, ly = L.p[1] - py, lz = L.p[2] - pz;
    const d2 = lx * lx + ly * ly + lz * lz, range = L.range || 6;
    if (d2 > range * range) continue;
    const d = Math.sqrt(d2) || 1e-6; lx /= d; ly /= d; lz /= d;
    const cosN = nx * lx + ny * ly + nz * lz;
    if (cosN <= 0) continue;
    let k = 1;
    if (L.dir) {   // a spot: smooth falloff between the full and the zero cone
      const c = -(lx * L.dir[0] + ly * L.dir[1] + lz * L.dir[2]);
      const c0 = L.cos0 != null ? L.cos0 : 0.8, c1 = L.cos1 != null ? L.cos1 : 0.2;
      k = clamp((c - c1) / Math.max(1e-4, c0 - c1), 0, 1); k *= k;
      if (k <= 0) continue;
    }
    const r0 = L.r0 != null ? L.r0 : 0.25;
    const fade = 1 - clamp((d - range * 0.7) / (range * 0.3), 0, 1);     // soft cut at the range
    let e = cosN * k * fade / (d2 + r0 * r0);
    if (e < 1e-5) continue;
    if (L.shadow !== false && OG) {
      // start just off the surface, stop short of the source (and outside a lamp's own shade)
      const skip = L.self || 0.05;
      if (d - skip - 0.03 > 0.02 && occluded(OG, px + nx * 0.03 + lx * 0.02, py + ny * 0.03 + ly * 0.02, pz + nz * 0.03 + lz * 0.02, lx, ly, lz, d - skip - 0.03)) continue;
    }
    out[0] += L.c[0] * e; out[1] += L.c[1] * e; out[2] += L.c[2] * e;
  }
  return out;
}

/** Ambient occlusion at a point: the fraction of short hemisphere rays that escape the boxes. */
export function aoAt(px, py, pz, nx, ny, nz, OG, dirs, len) {
  if (!OG || !dirs.length) return 1;
  // an orthonormal frame around n
  const ax = Math.abs(nx) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let tx = ny * ax[2] - nz * ax[1], ty = nz * ax[0] - nx * ax[2], tz = nx * ax[1] - ny * ax[0];
  const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
  const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
  let open = 0, wsum = 0;
  for (const [a, b, c] of dirs) {
    const dx = tx * a + bx * b + nx * c, dy = ty * a + by * b + ny * c, dz = tz * a + bz * b + nz * c;
    const w = c;   // cosine-weighted
    wsum += w;
    if (!occluded(OG, px + nx * 0.02, py + ny * 0.02, pz + nz * 0.02, dx, dy, dz, len)) open += w;
  }
  return wsum > 0 ? open / wsum : 1;
}

/**
 * Bake one mesh's vertex colours.
 * @param {object} o
 * @param {Float32Array|number[]} o.pos    xyz per vertex (world space)
 * @param {Float32Array|number[]} o.nrm    unit normals
 * @param {Float32Array|number[]} o.col    in: the surface's unlit look (its colour under the room's
 *                                          ambient); out: that × AO + albedo × (direct + bounce)
 * @param {number} [o.albedo]              reflectance for the direct light (the surface's colour is
 *                                          taken from `col`, normalised to this luminance)
 * @param {object} o.LG, o.OG              lightGrid / boxGrid
 * @param {number} [o.aoRays] [o.aoLen] [o.aoStrength]
 * @param {object} [o.bounce]              a bounceField (below), or null
 * @param {number} [o.exposure]            scale on the direct light (per surface class)
 * @param {number} [o.neutral]             0 = reflect in the surface's own hue, 1 = as a neutral grey:
 *                                          a navy-black stone is dark because it is dark, not because
 *                                          it is blue, and a warm lamp on it should read warm
 */
export function bakeMesh({ pos, nrm, col, albedo = 0.35, LG, OG, aoRays = 6, aoLen = 1.2, aoStrength = 0.85, bounce = null, exposure = 1, clampMax = 1.6, direct = null, neutral = 0 }) {
  const n = pos.length / 3, E = [0, 0, 0], dirs = fibDirs(aoRays);
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  for (let i = 0; i < n; i++) {
    const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
    let nx = nrm[i * 3], ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2];
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const r0 = col[i * 3], g0 = col[i * 3 + 1], b0 = col[i * 3 + 2];
    const l0 = Math.max(1e-4, lum(r0, g0, b0));
    // the surface's hue at the given reflectance (pulled toward grey by `neutral`)
    const ar = (r0 / l0 + (1 - r0 / l0) * neutral) * albedo, ag = (g0 / l0 + (1 - g0 / l0) * neutral) * albedo, ab = (b0 / l0 + (1 - b0 / l0) * neutral) * albedo;
    const ao = aoRays ? 1 - aoStrength * (1 - aoAt(px, py, pz, nx, ny, nz, OG, dirs, aoLen)) : 1;
    if (direct) { E[0] = direct[i * 3]; E[1] = direct[i * 3 + 1]; E[2] = direct[i * 3 + 2]; }
    else directAt(px, py, pz, nx, ny, nz, LG, OG, E);
    let br = 0, bg = 0, bb = 0;
    if (bounce) { const B = bounce.at(px, py, pz, nx, ny, nz); br = B[0]; bg = B[1]; bb = B[2]; }
    col[i * 3] = clamp(r0 * ao + ar * (E[0] * exposure + br) * (0.35 + 0.65 * ao), 0, clampMax);
    col[i * 3 + 1] = clamp(g0 * ao + ag * (E[1] * exposure + bg) * (0.35 + 0.65 * ao), 0, clampMax);
    col[i * 3 + 2] = clamp(b0 * ao + ab * (E[2] * exposure + bb) * (0.35 + 0.65 * ao), 0, clampMax);
  }
  return col;
}

/** The direct light at every vertex (xyz per vertex), for a bounce pass to reuse. */
export function directAll(pos, nrm, LG, OG) {
  const n = pos.length / 3, out = new Float32Array(n * 3), E = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    let nx = nrm[i * 3], ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2];
    const nl = Math.hypot(nx, ny, nz) || 1;
    directAt(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], nx / nl, ny / nl, nz / nl, LG, OG, E);
    out[i * 3] = E[0]; out[i * 3 + 1] = E[1]; out[i * 3 + 2] = E[2];
  }
  return out;
}

/**
 * One bounce: bin the direct light that lands on a set of receiver points (radiance = albedo × E)
 * into cells, and let every other point gather it back diffusely. `samples` = [{p, n, rad:[r,g,b]}].
 */
export function bounceField(samples, { cell = 1.0, radius = 2.2, gain = 0.6 } = {}) {
  const map = new Map();
  for (const s of samples) {
    const k = cellKey(Math.floor(s.p[0] / cell), Math.floor(s.p[1] / cell), Math.floor(s.p[2] / cell));
    let c = map.get(k);
    if (!c) map.set(k, (c = { p: [0, 0, 0], n: [0, 0, 0], r: [0, 0, 0], w: 0 }));
    for (let a = 0; a < 3; a++) { c.p[a] += s.p[a]; c.n[a] += s.n[a]; c.r[a] += s.rad[a]; }
    c.w++;
  }
  const cells = [];
  for (const c of map.values()) {
    const w = c.w; const nl = Math.hypot(c.n[0], c.n[1], c.n[2]) || 1;
    cells.push({ p: c.p.map((v) => v / w), n: c.n.map((v) => v / nl), r: c.r.map((v) => v / w), area: w * cell * cell * 0.25 });
  }
  const G = new Map(), gc = radius;
  cells.forEach((c, n) => { const k = cellKey(Math.floor(c.p[0] / gc), Math.floor(c.p[1] / gc), Math.floor(c.p[2] / gc)); let a = G.get(k); if (!a) G.set(k, (a = [])); a.push(n); });
  const out = [0, 0, 0];
  return {
    cells: cells.length,
    at(px, py, pz, nx, ny, nz) {
      out[0] = out[1] = out[2] = 0;
      const i0 = Math.floor(px / gc), j0 = Math.floor(py / gc), k0 = Math.floor(pz / gc);
      for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (let k = k0 - 1; k <= k0 + 1; k++) {
        const list = G.get(cellKey(i, j, k)); if (!list) continue;
        for (const n of list) {
          const c = cells[n];
          let dx = c.p[0] - px, dy = c.p[1] - py, dz = c.p[2] - pz;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > radius * radius || d2 < 1e-4) continue;
          const d = Math.sqrt(d2); dx /= d; dy /= d; dz /= d;
          const cr = nx * dx + ny * dy + nz * dz;               // the receiver faces the cell
          const ce = -(c.n[0] * dx + c.n[1] * dy + c.n[2] * dz); // the cell faces the receiver
          if (cr <= 0 || ce <= 0) continue;
          const f = gain * cr * ce * c.area / (Math.PI * (d2 + 0.35));
          out[0] += c.r[0] * f; out[1] += c.r[1] * f; out[2] += c.r[2] * f;
        }
      }
      return out;
    },
  };
}

/** Subdivide a flat quad (o + u·s + v·t) into a grid: positions/normals/indices for bakeable geometry. */
export function gridQuad(o, u, v, w, h, cell) {
  const nu = Math.max(1, Math.ceil(w / cell)), nv = Math.max(1, Math.ceil(h / cell));
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const nl = Math.hypot(n[0], n[1], n[2]) || 1;
  const pos = [], nrm = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const s = (i / nu) * w, t = (j / nv) * h;
    pos.push(o[0] + u[0] * s + v[0] * t, o[1] + u[1] * s + v[1] * t, o[2] + u[2] * s + v[2] * t);
    nrm.push(n[0] / nl, n[1] / nl, n[2] / nl);
    uv.push(i / nu, j / nv);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  return { pos, nrm, uv, idx, nu, nv };
}
