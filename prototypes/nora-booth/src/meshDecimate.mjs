// meshDecimate.mjs — quadric-error edge-collapse simplification (Garland & Heckbert 1997) for the
// crowd bake. Pure: no three, no DOM, no randomness. Deterministic for a given input.
//
// Why not vertex clustering: a grid snaps every vertex in a cell to one point, so a thin arm turns
// into a ribbon, strands of hair fuse into a helmet and the layered eye meshes melt into dark
// blotches. Edge collapse keeps the silhouette and the part seams, and spends triangles where the
// surface bends.
//
//   weld(positions, eps)            → { pos: Float64Array, remap: Int32Array }  (shared vertices)
//   decimate({ pos, faces, fpart, attr, attrSize, target, weight, ... })
//                                    → { pos, faces, fpart, attr, stats }   (compacted, welded)
//   splitByPart({ pos, faces, fpart, attr, attrSize }) → per-vertex part, smooth normals, Uint16-safe
//
// Seams between different parts (a sleeve hem, the hairline, the eye whites) and open boundaries
// carry penalty planes, so a hem stays where it is instead of being pulled into the skin.

/** Merge vertices closer than eps (a hash grid). Returns the welded positions and a remap table. */
export function weld(positions, eps = 1e-4) {
  const n = positions.length / 3;
  const map = new Map();
  const remap = new Int32Array(n);
  const out = [];
  const inv = 1 / eps;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    const k = `${Math.round(x * inv)},${Math.round(y * inv)},${Math.round(z * inv)}`;
    let id = map.get(k);
    if (id === undefined) { id = out.length / 3; map.set(k, id); out.push(x, y, z); }
    remap[i] = id;
  }
  return { pos: Float64Array.from(out), remap };
}

// ── small binary min-heap of edge records ───────────────────────────────────────────────────
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(e) {
    const a = this.a; a.push(e);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].c <= e.c) break; a[i] = a[p]; i = p; }
    a[i] = e;
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    const n = a.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = -1, mc = last.c;
        if (l < n && a[l].c < mc) { m = l; mc = a[l].c; }
        if (r < n && a[r].c < mc) { m = r; }
        if (m < 0) break;
        a[i] = a[m]; i = m;
      }
      a[i] = last;
    }
    return top;
  }
}

function addPlane(Q, o, a, b, c, d, w) {
  Q[o] += w * a * a; Q[o + 1] += w * a * b; Q[o + 2] += w * a * c; Q[o + 3] += w * a * d;
  Q[o + 4] += w * b * b; Q[o + 5] += w * b * c; Q[o + 6] += w * b * d;
  Q[o + 7] += w * c * c; Q[o + 8] += w * c * d; Q[o + 9] += w * d * d;
}
function evalQ(q, x, y, z) {
  return q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x
    + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y
    + q[7] * z * z + 2 * q[8] * z + q[9];
}

/**
 * Simplify a welded, indexed triangle mesh to `target` faces.
 * @param {object} o
 * @param {Float64Array} o.pos        welded positions (nv × 3)
 * @param {Int32Array|number[]} o.faces   triangle indices (nf × 3)
 * @param {Uint8Array|number[]} o.fpart   a part tag per face; edges between different parts are seams
 * @param {Float32Array} [o.attr]     per-vertex attributes interpolated along a collapse (nv × attrSize)
 * @param {number} [o.attrSize]
 * @param {number} o.target           faces to stop at
 * @param {Float32Array} [o.weight]   per-vertex importance (multiplies that vertex's surface quadric)
 * @param {number} [o.boundaryWeight] penalty-plane weight for open boundaries and seams (× edge length²)
 * @param {number} [o.minDot]         reject a collapse that tilts any face normal past this cosine
 */
export function decimate({ pos, faces, fpart, attr = null, attrSize = 0, target, weight = null, boundaryWeight = 60, minDot = 0.25 }) {
  const nv = pos.length / 3;
  const P = Float64Array.from(pos);
  const F = Int32Array.from(faces);
  const nf0 = F.length / 3;
  const fp = Uint8Array.from(fpart);
  const A = attr ? Float32Array.from(attr) : null;
  const falive = new Uint8Array(nf0);
  const valive = new Uint8Array(nv);
  const vf = Array.from({ length: nv }, () => []);
  let live = 0;
  const seenFace = new Set();
  for (let f = 0; f < nf0; f++) {
    const a = F[f * 3], b = F[f * 3 + 1], c = F[f * 3 + 2];
    if (a === b || b === c || a === c) continue;
    const key = [a, b, c].sort((x, y) => x - y).join(',');
    if (seenFace.has(key)) continue; // the same triangle twice (e.g. an outline pass) — keep one
    seenFace.add(key);
    falive[f] = 1; live++;
    vf[a].push(f); vf[b].push(f); vf[c].push(f);
    valive[a] = valive[b] = valive[c] = 1;
  }

  // ── quadrics ────────────────────────────────────────────────────────────────────────────
  const Q = new Float64Array(nv * 10);
  const fn = (f, out) => {
    const a = F[f * 3] * 3, b = F[f * 3 + 1] * 3, c = F[f * 3 + 2] * 3;
    const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
    const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
    out[0] = e1y * e2z - e1z * e2y; out[1] = e1z * e2x - e1x * e2z; out[2] = e1x * e2y - e1y * e2x;
    return out;
  };
  const n3 = [0, 0, 0];
  for (let f = 0; f < nf0; f++) {
    if (!falive[f]) continue;
    fn(f, n3);
    const len = Math.hypot(n3[0], n3[1], n3[2]);
    if (len < 1e-18) continue;
    const a = n3[0] / len, b = n3[1] / len, c = n3[2] / len;
    const v0 = F[f * 3];
    const d = -(a * P[v0 * 3] + b * P[v0 * 3 + 1] + c * P[v0 * 3 + 2]);
    const area = len / 2;
    for (let k = 0; k < 3; k++) {
      const v = F[f * 3 + k];
      addPlane(Q, v * 10, a, b, c, d, area * (weight ? weight[v] : 1));
    }
  }
  // edges → faces, to find open boundaries and part seams
  const edgeFaces = new Map();
  const ekey = (a, b) => (a < b ? a * nv + b : b * nv + a);
  for (let f = 0; f < nf0; f++) {
    if (!falive[f]) continue;
    for (let k = 0; k < 3; k++) {
      const a = F[f * 3 + k], b = F[f * 3 + ((k + 1) % 3)];
      const key = ekey(a, b);
      let l = edgeFaces.get(key);
      if (!l) edgeFaces.set(key, (l = []));
      l.push(f);
    }
  }
  const vborder = new Uint8Array(nv);
  for (const [key, fl] of edgeFaces) {
    const a = Math.floor(key / nv), b = key - a * nv;
    let feature = fl.length !== 2;
    if (!feature) feature = fp[fl[0]] !== fp[fl[1]];
    if (!feature) continue;
    vborder[a] = 1; vborder[b] = 1;
    const ex = P[b * 3] - P[a * 3], ey = P[b * 3 + 1] - P[a * 3 + 1], ez = P[b * 3 + 2] - P[a * 3 + 2];
    const el2 = ex * ex + ey * ey + ez * ez;
    for (const f of fl) {
      fn(f, n3);
      const nl = Math.hypot(n3[0], n3[1], n3[2]) || 1;
      const nx = n3[0] / nl, ny = n3[1] / nl, nz = n3[2] / nl;
      // the plane containing the edge, perpendicular to the face
      let mx = ey * nz - ez * ny, my = ez * nx - ex * nz, mz = ex * ny - ey * nx;
      const ml = Math.hypot(mx, my, mz);
      if (ml < 1e-18) continue;
      mx /= ml; my /= ml; mz /= ml;
      const d = -(mx * P[a * 3] + my * P[a * 3 + 1] + mz * P[a * 3 + 2]);
      const w = boundaryWeight * el2 * ((weight ? (weight[a] + weight[b]) / 2 : 1));
      addPlane(Q, a * 10, mx, my, mz, d, w);
      addPlane(Q, b * 10, mx, my, mz, d, w);
    }
  }

  // ── edge costs ──────────────────────────────────────────────────────────────────────────
  const stamp = new Uint32Array(nv);
  const q = new Float64Array(10);
  function candidate(u, v) {
    for (let i = 0; i < 10; i++) q[i] = Q[u * 10 + i] + Q[v * 10 + i];
    const ux = P[u * 3], uy = P[u * 3 + 1], uz = P[u * 3 + 2];
    const vx = P[v * 3], vy = P[v * 3 + 1], vz = P[v * 3 + 2];
    const dx = vx - ux, dy = vy - uy, dz = vz - uz;
    const L2 = dx * dx + dy * dy + dz * dz;
    let best = evalQ(q, ux, uy, uz), bx = ux, by = uy, bz = uz, bt = 0;
    const tryP = (x, y, z, t) => { const c = evalQ(q, x, y, z); if (c < best) { best = c; bx = x; by = y; bz = z; bt = t; } };
    tryP(vx, vy, vz, 1);
    tryP(ux + dx * 0.5, uy + dy * 0.5, uz + dz * 0.5, 0.5);
    // the optimum of the quadric, if well-conditioned and not far off the edge
    const a11 = q[0], a12 = q[1], a13 = q[2], a22 = q[4], a23 = q[5], a33 = q[7];
    const b1 = -q[3], b2 = -q[6], b3 = -q[8];
    const det = a11 * (a22 * a33 - a23 * a23) - a12 * (a12 * a33 - a23 * a13) + a13 * (a12 * a23 - a22 * a13);
    const scale = Math.abs(a11) + Math.abs(a22) + Math.abs(a33);
    if (Math.abs(det) > 1e-9 * scale * scale * scale && scale > 0) {
      const x = (b1 * (a22 * a33 - a23 * a23) - a12 * (b2 * a33 - a23 * b3) + a13 * (b2 * a23 - a22 * b3)) / det;
      const y = (a11 * (b2 * a33 - a23 * b3) - b1 * (a12 * a33 - a23 * a13) + a13 * (a12 * b3 - b2 * a13)) / det;
      const z = (a11 * (a22 * b3 - b2 * a23) - a12 * (a12 * b3 - b2 * a13) + b1 * (a12 * a23 - a22 * a13)) / det;
      // distance from the optimum to the segment
      let t = L2 > 0 ? ((x - ux) * dx + (y - uy) * dy + (z - uz) * dz) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ux + dx * t - x, py = uy + dy * t - y, pz = uz + dz * t - z;
      if (px * px + py * py + pz * pz <= L2 * 0.25) tryP(x, y, z, t);
    }
    return { c: Math.max(0, best), u, v, su: stamp[u], sv: stamp[v], x: bx, y: by, z: bz, t: bt };
  }
  const heap = new Heap();
  for (const key of edgeFaces.keys()) {
    const a = Math.floor(key / nv), b = key - a * nv;
    heap.push(candidate(a, b));
  }

  // ── collapse loop ───────────────────────────────────────────────────────────────────────
  const nbr = (v, out) => {
    out.clear();
    for (const f of vf[v]) {
      if (!falive[f]) continue;
      for (let k = 0; k < 3; k++) { const w = F[f * 3 + k]; if (w !== v) out.add(w); }
    }
    return out;
  };
  const NU = new Set(), NV = new Set();
  const tmpA = [0, 0, 0], tmpB = [0, 0, 0];
  function faceNormalWith(f, mv, x, y, z, out) {
    const ids = [F[f * 3], F[f * 3 + 1], F[f * 3 + 2]];
    const p = ids.map((id) => (id === mv ? [x, y, z] : [P[id * 3], P[id * 3 + 1], P[id * 3 + 2]]));
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    out[0] = e1[1] * e2[2] - e1[2] * e2[1]; out[1] = e1[2] * e2[0] - e1[0] * e2[2]; out[2] = e1[0] * e2[1] - e1[1] * e2[0];
    return out;
  }
  let rejected = 0;
  while (live > target && heap.size) {
    const e = heap.pop();
    const { u, v } = e;
    if (!valive[u] || !valive[v] || stamp[u] !== e.su || stamp[v] !== e.sv) continue;
    // faces on the edge
    const shared = [];
    for (const f of vf[u]) {
      if (!falive[f]) continue;
      const a = F[f * 3], b = F[f * 3 + 1], c = F[f * 3 + 2];
      if (a === v || b === v || c === v) shared.push(f);
    }
    if (!shared.length) continue;
    // link condition: the only common neighbours are the ones across the shared faces
    nbr(u, NU); nbr(v, NV);
    let common = 0;
    for (const w of NU) if (NV.has(w)) common++;
    if (common !== shared.length) { rejected++; continue; }
    // pinching two separate boundaries together through an interior edge makes a bow-tie
    // (an edge between two faces of the same part is interior; a seam edge is a feature itself)
    if (shared.length === 2 && vborder[u] && vborder[v] && fp[shared[0]] === fp[shared[1]]) { rejected++; continue; }
    // no face may flip or collapse to a sliver
    let ok = true;
    for (const w of [u, v]) {
      for (const f of vf[w]) {
        if (!falive[f] || shared.includes(f)) continue;
        fn(f, tmpA);
        faceNormalWith(f, w, e.x, e.y, e.z, tmpB);
        const la = Math.hypot(tmpA[0], tmpA[1], tmpA[2]), lb = Math.hypot(tmpB[0], tmpB[1], tmpB[2]);
        if (lb < la * 1e-3 || lb < 1e-14) { ok = false; break; }
        if ((tmpA[0] * tmpB[0] + tmpA[1] * tmpB[1] + tmpA[2] * tmpB[2]) / (la * lb) < minDot) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (!ok) { rejected++; continue; }
    // apply: u moves to the target and takes v's faces
    P[u * 3] = e.x; P[u * 3 + 1] = e.y; P[u * 3 + 2] = e.z;
    if (A) for (let i = 0; i < attrSize; i++) A[u * attrSize + i] += (A[v * attrSize + i] - A[u * attrSize + i]) * e.t;
    for (let i = 0; i < 10; i++) Q[u * 10 + i] += Q[v * 10 + i];
    for (const f of shared) { falive[f] = 0; live--; }
    for (const f of vf[v]) {
      if (!falive[f]) continue;
      for (let k = 0; k < 3; k++) if (F[f * 3 + k] === v) F[f * 3 + k] = u;
      vf[u].push(f);
    }
    vf[v] = []; valive[v] = 0;
    vf[u] = Array.from(new Set(vf[u].filter((f) => falive[f])));
    if (vborder[v]) vborder[u] = 1;
    stamp[u]++;
    nbr(u, NU);
    for (const w of NU) heap.push(candidate(u, w));
  }

  // ── compact ─────────────────────────────────────────────────────────────────────────────
  const vmap = new Int32Array(nv).fill(-1);
  const outPos = [], outAttr = [], outFaces = [], outPart = [];
  for (let f = 0; f < nf0; f++) {
    if (!falive[f]) continue;
    for (let k = 0; k < 3; k++) {
      const v = F[f * 3 + k];
      if (vmap[v] < 0) {
        vmap[v] = outPos.length / 3;
        outPos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
        if (A) for (let i = 0; i < attrSize; i++) outAttr.push(A[v * attrSize + i]);
      }
      outFaces.push(vmap[v]);
    }
    outPart.push(fp[f]);
  }
  return {
    pos: Float64Array.from(outPos), faces: Int32Array.from(outFaces), fpart: Uint8Array.from(outPart),
    attr: A ? Float32Array.from(outAttr) : null, attrSize,
    stats: { from: seenFace.size, to: outFaces.length / 3, rejected },
  };
}

/**
 * Give every (vertex, part) pair its own vertex so parts get crisp edges, with smooth normals
 * shared across the split (area-weighted over every face at that point).
 */
export function splitByPart({ pos, faces, fpart, attr = null, attrSize = 0 }) {
  const nv = pos.length / 3, nf = faces.length / 3;
  const acc = new Float64Array(nv * 3);
  for (let f = 0; f < nf; f++) {
    const a = faces[f * 3], b = faces[f * 3 + 1], c = faces[f * 3 + 2];
    const e1x = pos[b * 3] - pos[a * 3], e1y = pos[b * 3 + 1] - pos[a * 3 + 1], e1z = pos[b * 3 + 2] - pos[a * 3 + 2];
    const e2x = pos[c * 3] - pos[a * 3], e2y = pos[c * 3 + 1] - pos[a * 3 + 1], e2z = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) { acc[v * 3] += nx; acc[v * 3 + 1] += ny; acc[v * 3 + 2] += nz; }
  }
  const key = new Map();
  const P = [], N = [], R = [], T = [], I = [];
  for (let f = 0; f < nf; f++) {
    for (let k = 0; k < 3; k++) {
      const v = faces[f * 3 + k], part = fpart[f];
      const kk = v * 16 + part;
      let id = key.get(kk);
      if (id === undefined) {
        id = P.length / 3; key.set(kk, id);
        P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        const l = Math.hypot(acc[v * 3], acc[v * 3 + 1], acc[v * 3 + 2]) || 1;
        N.push(acc[v * 3] / l, acc[v * 3 + 1] / l, acc[v * 3 + 2] / l);
        R.push(part);
        if (attr) for (let i = 0; i < attrSize; i++) T.push(attr[v * attrSize + i]);
      }
      I.push(id);
    }
  }
  return { nv: P.length / 3, ni: I.length, pos: Float32Array.from(P), nrm: Float32Array.from(N), part: Uint8Array.from(R), attr: attr ? Float32Array.from(T) : null, index: I };
}
