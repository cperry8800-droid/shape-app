// palmGeometry.mjs — Club Shape's palms, as geometry.
//
// The old palms were leaf cards: a strip per frond carrying a painted, alpha-tested leaflet texture.
// That is a picture of a palm (the owner: "no 2D imaging"), and under PBR Neutral its gold read as
// neon yellow. These are built from the plant's own parts instead:
//
//   trunk    a gently curved column with ring relief every 0.25 m (the bark texture adds the fine
//            rings and leaf scars between them), wider at the foot
//   fronds   a tapered rachis (a thin tube) carrying folded leaflets down both sides — each leaflet a
//            V-section blade swept forward and drooping, longest at the middle of the frond — so a
//            frond has thickness, parallax and a real silhouette from every angle
//   uplight  the planter's lamp: an open 3D cone, fading up, additive (no billboard)
//
// Colour is baked per vertex for an uplit palm in a dark room: the trunk bright gold at its foot,
// fading with height; the fronds dark green on top, and on their UNDERSIDES a gold that falls off
// with distance from the lamp (`under`, used by the material when a leaflet is seen from below:
// every leaflet is wound so its front face is its upper surface).
//
// Pure: plain arrays out, no three, no DOM, no Math.random (the caller passes a seeded rnd), so the
// counts and the winding are testable in Node.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** The crown's attachment point in the template (the trunk is curved, so the crown sits off-axis). */
export const PALM_CROWN = [0.22, 3.42, 0];
/** Where the planter's lamp sits (the uplight's source, for the frond undersides and the bake). */
export const PALM_LAMP = [0, 0.45, 0];

export const PALM_DETAIL = {
  high: { fronds: 12, leaflets: 18, leafSeg: 2, rachisSeg: 7, trunkRad: 10, trunkSeg: 24, beamSeg: 12 },
  low: { fronds: 9, leaflets: 11, leafSeg: 1, rachisSeg: 4, trunkRad: 7, trunkSeg: 12, beamSeg: 8 },
};

function builder() {
  const pos = [], nrm = [], col = [], uv = [], flex = [], under = [], idx = [];
  return {
    pos, nrm, col, uv, flex, under, idx,
    v(p, n, c, t = [0, 0], f = 0, u = 0) { pos.push(p[0], p[1], p[2]); nrm.push(n[0], n[1], n[2]); col.push(c[0], c[1], c[2]); uv.push(t[0], t[1]); flex.push(f); under.push(u); return pos.length / 3 - 1; },
    tri(a, b, c) { idx.push(a, b, c); },
  };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dist = (a, b) => len(sub(a, b));

// The planter lamp's light on a point: inverse-square with a soft core, a cone upward (cos^2 of the
// angle from vertical), normalised so 1 = a leaf 1.2 m straight above the lamp.
function uplight(p) {
  const d = sub(p, PALM_LAMP);
  const r2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const up = clamp(d[1] / Math.sqrt(r2 + 1e-6), 0, 1);
  return clamp((1.44 + 0.3) / (r2 + 0.3) * (0.25 + 0.75 * up * up), 0, 2.5);
}

/**
 * Trunk + planter + the crown's boot, one mesh.
 * @returns {{pos,nrm,col,uv,idx}}
 */
export function palmTrunk(q = 'high') {
  const D = PALM_DETAIL[q] || PALM_DETAIL.high;
  const B = builder();
  // planter: a dark stone bowl, its rim catching the lamp
  const PR = D.trunkRad + 2;
  const ring = (y, r, c) => { const s = []; for (let i = 0; i <= PR; i++) { const a = (i / PR) * Math.PI * 2; s.push(B.v([Math.cos(a) * r, y, Math.sin(a) * r], [Math.cos(a), 0, Math.sin(a)], c, [i / PR, 0])); } return s; };
  const strip = (A, C) => { for (let i = 0; i < A.length - 1; i++) { B.tri(A[i], C[i], A[i + 1]); B.tri(A[i + 1], C[i], C[i + 1]); } };
  const pBot = ring(0, 0.34, [0.018, 0.017, 0.018]), pTop = ring(0.45, 0.42, [0.05, 0.042, 0.034]);
  strip(pBot, pTop);
  // the lamp's lens in the soil, a warm disc (small: the bloom does the rest)
  const lc = B.v([0, 0.452, 0], [0, 1, 0], [2.2, 1.45, 0.7]);
  const lr = []; for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI * 2; lr.push(B.v([Math.cos(a) * 0.07, 0.452, Math.sin(a) * 0.07], [0, 1, 0], [1.4, 0.9, 0.42])); }
  for (let i = 0; i < 8; i++) B.tri(lc, lr[i + 1], lr[i]);
  // soil disc
  const sc = B.v([0, 0.44, 0], [0, 1, 0], [0.02, 0.016, 0.012]);
  const sr = []; for (let i = 0; i <= PR; i++) { const a = (i / PR) * Math.PI * 2; sr.push(B.v([Math.cos(a) * 0.4, 0.44, Math.sin(a) * 0.4], [0, 1, 0], [0.03, 0.024, 0.018])); }
  for (let i = 0; i < PR; i++) B.tri(sc, sr[i + 1], sr[i]);

  // trunk: y 0.4 … 3.4, curving toward +x (0.22 · t²), radius 0.19 → 0.11, ring relief every 0.25 m
  const R = D.trunkRad, H = D.trunkSeg, y0 = 0.4, y1 = 3.4;
  const rows = [];
  for (let j = 0; j <= H; j++) {
    const t = j / H, y = y0 + (y1 - y0) * t;
    const cx = 0.22 * t * t;
    const ringPh = ((y - y0) / 0.25) % 1;
    const relief = 1 + 0.07 * Math.pow(Math.sin(Math.PI * ringPh), 6) - 0.02;   // a bulge at each ring
    const r = (0.19 - 0.08 * t + 0.05 * Math.pow(1 - t, 6)) * relief;             // a flared foot
    const row = [];
    for (let i = 0; i <= R; i++) {
      const a = (i / R) * Math.PI * 2;
      const p = [cx + Math.cos(a) * r, y, Math.sin(a) * r];
      const n = norm([Math.cos(a), 0.12, Math.sin(a)]);
      // gold at the foot, lit by the lamp below; it falls off up the trunk
      const L = uplight(p) * 0.9;
      const c = [0.05 + 0.62 * L, 0.035 + 0.43 * L, 0.02 + 0.21 * L];
      row.push(B.v(p, n, c, [i / R, t * 12]));
    }
    rows.push(row);
  }
  for (let j = 0; j < H; j++) strip(rows[j], rows[j + 1]);
  // the boot: the crown's swollen base, where the fronds spring from
  const [bx, by, bz] = PALM_CROWN;
  const BR = R, BH = 4, boot = [];
  for (let j = 0; j <= BH; j++) {
    const t = j / BH, y = by - 0.3 + 0.55 * t, r = 0.13 + 0.12 * Math.sin(Math.PI * t) * (1 - 0.3 * t);
    const row = [];
    for (let i = 0; i <= BR; i++) { const a = (i / BR) * Math.PI * 2; const p = [bx + Math.cos(a) * r, y, bz + Math.sin(a) * r]; const L = uplight(p) * 0.9; row.push(B.v(p, norm([Math.cos(a), 0.3, Math.sin(a)]), [0.04 + 0.32 * L, 0.03 + 0.22 * L, 0.018 + 0.1 * L], [i / BR, 10 + t])); }
    boot.push(row);
  }
  for (let j = 0; j < BH; j++) strip(boot[j], boot[j + 1]);
  return B;
}

/**
 * The fronds: rachis tubes + folded leaflets. `rnd` is a seeded [0,1) source.
 * @returns {{pos,nrm,col,uv,flex,under,idx}}
 */
export function palmFronds(rnd, q = 'high') {
  const D = PALM_DETAIL[q] || PALM_DETAIL.high;
  const B = builder();
  const C = PALM_CROWN;
  const GREEN_TOP = [0.018, 0.04, 0.016];
  for (let f = 0; f < D.fronds; f++) {
    const az = (f / D.fronds) * Math.PI * 2 + (rnd() - 0.5) * 0.45;
    const young = f % 5 === 0;
    const a0 = young ? 0.95 + rnd() * 0.35 : 0.12 + rnd() * 0.62;   // launch angle above horizontal
    const Lf = (young ? 1.15 : 1.6) + rnd() * 0.45;
    const droop = young ? 0.45 : 1.3 + rnd() * 0.9;
    const Wl = (young ? 0.34 : 0.52) * (0.85 + rnd() * 0.3);           // longest leaflet
    const dir = [Math.sin(az), 0, Math.cos(az)], side = [Math.cos(az), 0, -Math.sin(az)];
    // the rachis centreline: a curve launched at a0 that droops toward the tip
    const S = D.rachisSeg * 3;
    const line = [[C[0], C[1], C[2]]];
    let hx = 0, hy = 0;
    for (let i = 1; i <= S; i++) {
      const ang = a0 - droop * Math.pow((i - 0.5) / S, 1.4);
      hx += (Math.cos(ang) * Lf) / S; hy += (Math.sin(ang) * Lf) / S;
      line.push([C[0] + dir[0] * hx, C[1] + hy, C[2] + dir[2] * hx]);
    }
    const at = (s) => { const k = clamp(s, 0, 1) * S, i = Math.min(S - 1, Math.floor(k)), u = k - i; const a = line[i], b = line[i + 1]; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]; };
    const tan = (s) => norm(sub(at(Math.min(1, s + 0.02)), at(Math.max(0, s - 0.02))));
    // rachis: a 3-sided tapered tube (a stem has a top ridge and a flat underside)
    const RS = D.rachisSeg, rows = [];
    for (let i = 0; i <= RS; i++) {
      const s = i / RS, p = at(s), T = tan(s);
      const up = norm(cross(side, T)), r = 0.022 * (1 - 0.8 * s);
      const row = [];
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
        const o = add(mul(side, Math.cos(a) * r), mul(up, Math.sin(a) * r));
        const L = uplight(p);
        row.push(B.v(add(p, o), norm(o), [0.03 + 0.1 * L, 0.04 + 0.07 * L, 0.018 + 0.03 * L], [s, 0], s, L));
      }
      rows.push(row);
    }
    for (let i = 0; i < RS; i++) for (let k = 0; k < 3; k++) { const a = rows[i][k], b = rows[i][(k + 1) % 3], c = rows[i + 1][k], d = rows[i + 1][(k + 1) % 3]; B.tri(a, c, b); B.tri(b, c, d); }
    // leaflets: from s 0.1 to 0.98, both sides; each a V-section blade (edge, raised midrib, edge)
    const NL = D.leaflets, LS = D.leafSeg;
    for (let i = 0; i < NL; i++) {
      const s = 0.1 + 0.88 * (i + 0.5) / NL;
      const base = at(s), T = tan(s);
      const up = norm(cross(side, T));            // the frond's own "up" (perpendicular to rachis, across)
      const lenL = Wl * Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + s * 0.95)), 0.55) * (0.9 + rnd() * 0.2);
      const w = 0.028 + 0.014 * Math.sin(Math.PI * s);  // half-width of the blade
      for (const sd of [-1, 1]) {
        // swept forward along the rachis and drooping (the tips hang), a little random
        const out = norm(add(add(mul(side, sd * 0.78), mul(T, 0.55)), mul(up, -0.28 - 0.3 * s + (rnd() - 0.5) * 0.12)));
        const across = norm(cross(out, up));         // the blade's width direction
        const fold = mul(norm(cross(across, out)), 1); // the blade's face normal side
        const ids = [];
        for (let k = 0; k <= LS + 1; k++) {
          const u = k / (LS + 1);                     // 0 at the rachis, 1 at the tip
          const droopU = -0.18 * lenL * u * u;        // the leaflet itself bends down along its length
          const c = add(add(base, mul(out, lenL * u)), [0, droopU, 0]);
          const hw = u >= 1 ? 0 : w * Math.sin(Math.PI * Math.min(1, 0.25 + u * 0.9));
          const rib = mul(fold, 0.012 * (1 - u));      // the midrib stands a little proud: the V-fold
          const L = uplight(c);
          // the upper face: dark green, warmed toward gold by the lamp and the room's amber light
          // (seen from the balconies above, an uplit palm in the reference reads gold, not green)
          const warm = 0.14 + 0.55 * L;
          const topC = [GREEN_TOP[0] * (0.8 + 0.4 * (1 - u)) + 0.3 * warm, GREEN_TOP[1] * (0.9 + 0.3 * (1 - u)) + 0.19 * warm, GREEN_TOP[2] + 0.06 * warm];
          const flexK = s * 0.8 + u * 0.35;
          const row = u >= 1
            ? [B.v(c, fold, topC, [s, u], flexK, L)]
            : [B.v(add(c, mul(across, -hw)), fold, topC, [s, u], flexK, L), B.v(add(c, rib), fold, topC, [s, u], flexK, L), B.v(add(c, mul(across, hw)), fold, topC, [s, u], flexK, L)];
          ids.push(row);
        }
        // wind every triangle so its geometric front faces the blade's `fold` side (its upper surface)
        const push = (a, b, c) => {
          const pa = B.pos.slice(a * 3, a * 3 + 3), pb = B.pos.slice(b * 3, b * 3 + 3), pc = B.pos.slice(c * 3, c * 3 + 3);
          const n = cross(sub(pb, pa), sub(pc, pa));
          if (n[0] * fold[0] + n[1] * fold[1] + n[2] * fold[2] >= 0) B.tri(a, b, c); else B.tri(a, c, b);
        };
        for (let k = 0; k < ids.length - 1; k++) {
          const A = ids[k], Cn = ids[k + 1];
          if (Cn.length === 1) { push(A[0], A[1], Cn[0]); push(A[1], A[2], Cn[0]); }
          else { push(A[0], A[1], Cn[0]); push(A[1], Cn[1], Cn[0]); push(A[1], A[2], Cn[1]); push(A[2], Cn[2], Cn[1]); }
        }
      }
    }
  }
  return B;
}

/** The planter lamp's beam: an open cone, bright at the lamp, fading up. Additive; colour = intensity. */
export function palmBeam(q = 'high') {
  const D = PALM_DETAIL[q] || PALM_DETAIL.high;
  const B = builder();
  const N = D.beamSeg, H = 3.3, rows = [];
  for (let j = 0; j <= 4; j++) {
    const t = j / 4, y = PALM_LAMP[1] + 0.02 + H * t, r = 0.1 + 0.9 * t;
    const k = Math.pow(1 - t, 1.8) * 0.9;
    const row = [];
    for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; row.push(B.v([Math.cos(a) * r, y, Math.sin(a) * r], [Math.cos(a), 0, Math.sin(a)], [k, k, k], [i / N, t])); }
    rows.push(row);
  }
  for (let j = 0; j < 4; j++) for (let i = 0; i < N; i++) { const a = rows[j][i], b = rows[j][i + 1], c = rows[j + 1][i], d = rows[j + 1][i + 1]; B.tri(a, c, b); B.tri(b, c, d); }
  return B;
}

export const _palmForTest = { uplight, dist };
