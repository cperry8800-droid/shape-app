// clubVenue.mjs — Club Shape itself: the atrium around the stage.
//
// Shape Radio's flagship venue, from the interior concept render (a grand open-roof atrium
// at night): three tiers of balconies down both sides with glass railings and thin warm LED
// handrails, amber-lit lounge/restaurant glass behind them, crowds on the rails, uplit palms
// on every tier and along the floor lounges, cream booths with candle-lit tables at floor
// level, a dark ceiling with thin warm linear LEDs converging on the stage, and the big oval
// SKYLIGHT with its double ice-blue ring, open to the night sky and a city skyline.
//
// NOT here (the stage module owns them): the stage portal, the LED screen, the beams, the
// crowd on the dance floor.
//
// World frame (CONTRACT.md): metres, +Y up, the DJ at z ≈ +0.30 facing −Z; the room is −Z.
//   hall          z +6 (stage-end wall) … −46 (far wall), balcony inner faces x = ±10.5,
//                 outer walls x = ±14, balcony floors y = 3.6 / 7.6 / 11.6,
//                 ceiling soffit underside y = 15.5
//   skylight      centred (0, 15.5, −13), semi-axes 8.4 (x) × 12.5 (z): toward the stage half of the room,
//                 as in the owner's reference, so from the back of the hall the whole oval is in frame
//   stage portal  x ±5.5, deck → y ≈ 8.8, z +2.0 … +3.2 (kept clear)
//   floor lounges x ±7 … ±10.5, z −6 … −44 ; dance-floor crowd x ±7, z −1.8 … −34
//
// Rules: no Math.random (seeded mulberry32), no clock (the caller passes t), no DOM at
// import (canvases are made inside createVenue), everything allocated is disposed.
// Lighting is baked: architecture is MeshBasicMaterial with vertex colours, the glow comes
// from emissive colours above the booth's bloom threshold — zero dynamic lights of its own.

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAvatarCrowd } from './crowdAvatars.mjs';
import { palmTrunk, palmFronds, palmBeam } from './palmGeometry.mjs';
import { boxGrid, lightGrid, directAt, directAll, bakeMesh, bounceField, gridQuad } from './lightBake.mjs';
import { createArenaStage, ARENA_DIMS } from './arenaStage.mjs';

export const VENUE_DIMS = {
  FLOOR_Y: -0.66,
  X_IN: 10.5,
  X_OUT: 14,
  Z_STAGE: 6,
  Z_FAR: -46,
  LEVELS: [3.6, 7.6, 11.6],
  CEIL_Y: 15.5,
  SKYLIGHT: { x: 0, y: 15.5, z: -13, a: 8.4, b: 12.5 },
  PORTAL: { x: 5.5, top: 8.8, z0: 2.0, z1: 3.2 },
};

const { FLOOR_Y, X_IN, X_OUT, Z_STAGE, Z_FAR, LEVELS, CEIL_Y, SKYLIGHT } = VENUE_DIMS;
const SLAB_T = 0.45;          // balcony slab thickness
const WIN_X = 12.2;           // lounge glass line on the sides
const FAR_RAIL_Z = -42.5;     // far-end balcony edge
const FAR_WIN_Z = -44.2;      // far-end lounge glass
const END_RAIL_Z = 3.0;       // where the atrium ceiling meets the strip over the stage (the stage end has no balcony now)
const END_WIN_Z = 5.95;       // stage-end lounge glass
const RAIL_H = 1.05;
const SUPER_N = 2.5;          // skylight superellipse exponent: an oval that reads as a rounded rectangle
// Tiers: floor → slab above, and the top tier to the ceiling.
const TIERS = [
  { y0: FLOOR_Y, y1: LEVELS[0] - SLAB_T },
  { y0: LEVELS[0], y1: LEVELS[1] - SLAB_T },
  { y0: LEVELS[1], y1: LEVELS[2] - SLAB_T },
  { y0: LEVELS[2], y1: CEIL_Y },
];

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
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

function makeCanvas(w, h) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  throw new Error('clubVenue: no canvas implementation available');
}

// Superellipse point (param θ) with semi-axes a (x) × b (z) around the skylight centre.
function superPt(a, b, th, n = SUPER_N) {
  const c = Math.cos(th), s = Math.sin(th);
  return [
    SKYLIGHT.x + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n),
    SKYLIGHT.z + b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n),
  ];
}
// Half-extent in z of the superellipse (a, b) at a given x (for splitting ceiling lines).
function superHalfZ(a, b, x, n = SUPER_N) {
  const u = Math.abs(x - SKYLIGHT.x) / a;
  if (u >= 1) return 0;
  return b * Math.pow(1 - Math.pow(u, n), 1 / n);
}

export function createVenue({ THREE, renderer = null, seed = 11, quality = 'high', reducedMotion = false, crowdPack = null, now = null, accent = '#34d6c5' } = {}) {
  const clock = typeof now === 'function' ? now : () => 0;   // injected by the caller, for the bake's timings
  const bakeMs = { boxes: 0, structure: 0, floor: 0 };
  void renderer;
  const LOW = quality === 'low';
  const rnd = mulberry32(seed);
  const disposables = [];
  const own = (x) => { disposables.push(x); return x; };
  const group = new THREE.Group();
  group.name = 'clubVenue';
  let RM = !!reducedMotion;

  // ── geometry helpers ────────────────────────────────────────────────
  function paint(geo, fn) {
    const p = geo.attributes.position, n = geo.attributes.normal;
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const r = fn(p.getX(i), p.getY(i), p.getZ(i), n ? n.getX(i) : 0, n ? n.getY(i) : 0, n ? n.getZ(i) : 0);
      c[i * 3] = r[0]; c[i * 3 + 1] = r[1]; c[i * 3 + 2] = r[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return geo;
  }
  const solid = (geo, rgb) => paint(geo, () => rgb);
  function box(x0, x1, y0, y1, z0, z1) {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return g;
  }
  // A box whose faces are cut into cells of about `cell` metres, so the light bake has vertices to
  // put its pools on (a 50 m slab as 24 vertices would take one colour end to end).
  function boxSeg(x0, x1, y0, y1, z0, z1, cell) {
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
    const g = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.ceil(w / cell)), 1, Math.max(1, Math.ceil(d / cell)));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return g;
  }
  // A flat quad cut into cells (lightBake.gridQuad), with UVs remapped to [u0,v0,u1,v1] and a colour.
  function gridGeo(o, u, v, w, h, cell, rgb, uv = [0, 0, 1, 1]) {
    const Q = gridQuad(o, u, v, w, h, cell);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(Q.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(Q.nrm, 3));
    const [u0, v0, u1, v1] = uv;
    const uvs = new Float32Array(Q.uv.length);
    for (let i = 0; i < Q.uv.length; i += 2) { uvs[i] = u0 + (u1 - u0) * Q.uv[i]; uvs[i + 1] = v0 + (v1 - v0) * Q.uv[i + 1]; }
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    const c = new Float32Array(Q.pos.length);
    for (let i = 0; i < c.length; i += 3) { c[i] = rgb[0]; c[i + 1] = rgb[1]; c[i + 2] = rgb[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setIndex(Q.idx);
    return g;
  }
  // The architecture's solid boxes (slabs, kerbs, columns, walls), for the bake's shadows and AO.
  const ARCH = [];
  const occ = (g) => { g.computeBoundingBox(); const b = g.boundingBox; ARCH.push([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]); return g; };
  const BAKE_CELL = LOW ? 1.0 : 0.5;   // metres between the structure's baked vertices

  // A quad from origin o along u (width w) and v (height h); normal = u × v. UVs given.
  function quad(o, u, v, w, h, uv = [0, 0, 1, 1], rgb = [1, 1, 1]) {
    const p = [
      o[0], o[1], o[2],
      o[0] + u[0] * w, o[1] + u[1] * w, o[2] + u[2] * w,
      o[0] + u[0] * w + v[0] * h, o[1] + u[1] * w + v[1] * h, o[2] + u[2] * w + v[2] * h,
      o[0] + v[0] * h, o[1] + v[1] * h, o[2] + v[2] * h,
    ];
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz], 3));
    const [u0, v0, u1, v1] = uv;
    g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v1], 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute([...rgb, ...rgb, ...rgb, ...rgb], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return g;
  }
  // Strip between two closed loops of equal length (arrays of [x,y,z]); colours per loop.
  function loopStrip(A, B, cA, cB) {
    const N = A.length;
    const pos = [], col = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const a = A[i % N], b = B[i % N];
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      const ca = typeof cA === 'function' ? cA(i % N) : cA, cb = typeof cB === 'function' ? cB(i % N) : cB;
      col.push(...ca, ...cb);
      uv.push(i / N, 0, i / N, 1);
      if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function merge(list, name) {
    const g = mergeGeometries(list, false);
    if (!g) throw new Error('clubVenue: merge failed for ' + name);
    for (const x of list) x.dispose();
    return own(g);
  }
  function mesh(geo, mat, name, renderOrder = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.renderOrder = renderOrder;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    group.add(m);
    return m;
  }
  function tex(canvas, { repeat = false, srgb = true, mips = true } = {}) {
    const t = own(new THREE.CanvasTexture(canvas));
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
    if (!mips) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
    t.anisotropy = 4;
    return t;
  }
  const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

  // ── canvas textures ─────────────────────────────────────────────────
  // Lounge / restaurant glass: warm interior seen through black-framed glass. 1024 px = 12.8 m.
  // Two uses: the BACK WALL of the side and far-end lounges (walls=true: no people, no frames — the
  // guests, tables and window frames there are 3D), and the stage-end glass, which has no depth
  // behind it (frames painted on; the guests are still not painted: nobody here is a picture).
  function loungeTexture({ frames = true, neutral = false } = {}) {
    const W = 1024, H = 256;
    const c = makeCanvas(W, H), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, H);
    // A dim room: the warmth is in the small sources (the downlight row, the sconces, the lamps in
    // front of it), not a lit wall. The old gradient peaked at 214/150/70 and every box read as a
    // bright shop window; the reference's lounges are dark rooms with pools of lamplight.
    gr.addColorStop(0.0, 'rgb(12,8,5)');
    gr.addColorStop(0.07, 'rgb(34,21,10)');
    gr.addColorStop(0.13, 'rgb(96,62,30)');
    gr.addColorStop(0.3, 'rgb(40,24,11)');
    gr.addColorStop(0.7, 'rgb(24,14,7)');
    gr.addColorStop(1.0, 'rgb(11,7,4)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // back-wall slats / shelving glow bands
    for (let x = 0; x < W; x += 6 + Math.floor(rnd() * 10)) {
      g.fillStyle = `rgba(255,${170 + Math.floor(rnd() * 50)},${80 + Math.floor(rnd() * 40)},${0.015 + rnd() * 0.03})`;
      g.fillRect(x, 40, 2 + rnd() * 3, 110);
    }
    for (let k = 0; k < 5; k++) {           // bars / back-lit shelves
      const x = rnd() * W, w = 90 + rnd() * 160, y = 95 + rnd() * 30;
      const bg = g.createLinearGradient(0, y - 12, 0, y + 14);
      bg.addColorStop(0, 'rgba(255,196,110,0)');
      bg.addColorStop(0.5, 'rgba(255,214,140,0.22)');
      bg.addColorStop(1, 'rgba(255,196,110,0)');
      g.fillStyle = bg; g.fillRect(x, y - 12, w, 26);
    }
    // ceiling downlights
    for (let x = 10; x < W; x += 28) {
      const rg = g.createRadialGradient(x, 19, 0, x, 19, 16);
      rg.addColorStop(0, 'rgba(255,244,214,1)');
      rg.addColorStop(0.2, 'rgba(255,214,150,0.8)');
      rg.addColorStop(1, 'rgba(255,190,110,0)');
      g.fillStyle = rg; g.fillRect(x - 16, 3, 32, 32);
    }
    // wall sconces: warm pools on the back wall at seated head height (the tables are 3D)
    for (let x = 40 + rnd() * 40; x < W - 20; x += 70 + rnd() * 90) {
      const ty = 168 + rnd() * 10;
      const lg = g.createRadialGradient(x, ty, 0, x, ty, 30);
      lg.addColorStop(0, 'rgba(255,236,190,0.9)'); lg.addColorStop(0.35, 'rgba(255,200,130,0.35)'); lg.addColorStop(1, 'rgba(255,190,110,0)');
      g.fillStyle = lg; g.fillRect(x - 30, ty - 30, 60, 60);
    }
    if (frames) {
    // black mullions + transom (1.6 m module) and a slight glass sheen
    g.fillStyle = 'rgba(6,5,4,0.95)';
    for (let x = 0; x <= W; x += 128) g.fillRect(x - 3, 0, 6, H);
    g.fillRect(0, 34, W, 4);
    g.fillRect(0, H - 6, W, 6);
    for (let k = 0; k < 9; k++) {
      const x = rnd() * W;
      g.fillStyle = 'rgba(255,240,220,0.035)';
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 40, 0); g.lineTo(x - 60, H); g.lineTo(x - 100, H); g.fill();
    }
    }
    if (neutral) {   // a warm-grey version: every private box tints it its own colour
      const id = g.getImageData(0, 0, W, H), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.3 * d[i] + 0.55 * d[i + 1] + 0.15 * d[i + 2];
        d[i] = l * 1.08 + (d[i] - l) * 0.15; d[i + 1] = l + (d[i + 1] - l) * 0.15; d[i + 2] = l * 0.9 + (d[i + 2] - l) * 0.15;
      }
      g.putImageData(id, 0, 0);
    }
    return tex(c, { repeat: true });
  }

  // Palm bark: the ring scars of a date palm — a band every ring, the old leaf bases between them in
  // an offset diamond pattern, fibre streaks. Grey-brown and bright enough to take the vertex
  // colour's gold (the trunk's light is baked into its vertices, strongest at the lamp).
  function barkTexture() {
    const W = 64, H = 128;
    const c = makeCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = 'rgb(170,146,112)'; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 90; k++) {                       // fibre streaks
      const x = rnd() * W, y = rnd() * H, l = 4 + rnd() * 10;
      g.strokeStyle = `rgba(${rnd() < 0.5 ? '90,70,48' : '210,186,150'},${0.2 + rnd() * 0.25})`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 2, y + l); g.stroke();
    }
    for (let y = 0, r = 0; y < H + 16; y += 16, r++) {
      // the ring: a dark groove with a lit lip above it
      g.fillStyle = 'rgba(64,48,30,0.7)'; g.fillRect(0, y, W, 2);
      g.fillStyle = 'rgba(214,194,160,0.25)'; g.fillRect(0, y - 2, W, 2);
      // the old leaf bases: offset scallops between the rings
      g.strokeStyle = 'rgba(70,52,32,0.75)'; g.lineWidth = 1.6;
      for (let x = (r % 2) * 8 - 8; x < W + 16; x += 16) { g.beginPath(); g.moveTo(x - 8, y + 3); g.quadraticCurveTo(x, y + 13, x + 8, y + 3); g.stroke(); }
    }
    return tex(c, { repeat: true });
  }

  // City tower windows: 16 columns × 32 floors per tile.
  function cityTexture() {
    const W = 256, H = 512;
    const c = makeCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = 'rgb(6,8,14)'; g.fillRect(0, 0, W, H);
    for (let row = 0; row < 64; row++) {
      const occ = 0.1 + 0.72 * Math.pow(rnd(), 1.3);
      const cool = rnd() < 0.16;
      for (let col = 0; col < 32; col++) {
        const x = col * 8 + 2, y = row * 8 + 2;
        if (rnd() < occ) {
          const k = 0.5 + rnd() * 0.5;
          g.fillStyle = cool
            ? `rgb(${Math.round(190 * k)},${Math.round(212 * k)},${Math.round(255 * k)})`
            : `rgb(${Math.round(255 * k)},${Math.round((176 + rnd() * 44) * k)},${Math.round((92 + rnd() * 54) * k)})`;
        } else {
          g.fillStyle = 'rgb(14,18,28)';
        }
        g.fillRect(x, y, 5, 5);
      }
    }
    return tex(c, { repeat: true });
  }

  // Floor: dark polished stone. Its warm pools (the booth candles, the lounge glass, the downlights
  // under the balconies) are baked into this canvas once the light list exists — see the bake below.
  const floorCanvas = makeCanvas(LOW ? 128 : 256, LOW ? 256 : 512);

  const loungeTex = loungeTexture({ frames: false, neutral: true });   // the private boxes' back walls (tinted per box)
  const loungeEndTex = loungeTexture({ frames: true });     // the stage-end glass (no room behind it)
  const barkTex = barkTexture();
  barkTex.repeat.set(2, 1);   // the trunk's v runs 0…12 over its 3 m (a ring every 0.25 m)
  const cityTex = cityTexture();
  const floorTex = tex(floorCanvas);

  // ── materials ───────────────────────────────────────────────────────
  const matStructure = own(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const matLounge = own(new THREE.MeshBasicMaterial({ map: loungeTex, vertexColors: true }));   // the boxes' back walls: each box's vertex colour is its tint
  const matLoungeEnd = own(new THREE.MeshBasicMaterial({ map: loungeEndTex, vertexColors: true, color: new THREE.Color(0.62, 0.52, 0.44) }));
  const matBoxes = own(new THREE.MeshBasicMaterial({ vertexColors: true }));          // the private boxes' furniture, partitions, frames
  const matBoxGlow = own(new THREE.MeshBasicMaterial({ vertexColors: true }));        // their lamps and accent lines (HDR colours)
  const sheenTex = (() => {
    const c = makeCanvas(256, 64), g = c.getContext('2d');
    g.clearRect(0, 0, 256, 64);
    for (let k = 0; k < 5; k++) {
      const x = rnd() * 256;
      g.fillStyle = `rgba(255,245,230,${0.25 + rnd() * 0.35})`;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 14, 0); g.lineTo(x - 26, 64); g.lineTo(x - 40, 64); g.fill();
    }
    return tex(c, { repeat: true });
  })();
  const matSheen = own(new THREE.MeshBasicMaterial({ map: sheenTex, color: new THREE.Color(0.07, 0.066, 0.06), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  // balcony glass: a faint blue-grey body and an additive sheen, so it reads as glass from every tier
  const matGlass = own(new THREE.MeshBasicMaterial({ color: 0x566a7c, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide }));
  const matRailSheen = own(new THREE.MeshBasicMaterial({ map: sheenTex, color: new THREE.Color(0.05, 0.056, 0.064), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  // dark stone for the balcony fascias: grey-navy with faint veins (its light is baked into the vertices)
  const stoneTex = (() => {
    const W = 512, H = 64, c = makeCanvas(W, H), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgb(40,42,50)'); gr.addColorStop(1, 'rgb(28,30,37)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 40; k++) {
      const x = rnd() * W, y = rnd() * H;
      g.strokeStyle = `rgba(${rnd() < 0.7 ? '120,124,136' : '14,15,18'},${0.08 + rnd() * 0.14})`; g.lineWidth = 0.6 + rnd() * 1.2;
      g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 30 + rnd() * 60, y + (rnd() - 0.5) * 30, x + 60 + rnd() * 90, y + (rnd() - 0.5) * 40, x + 120 + rnd() * 120, y + (rnd() - 0.5) * 50); g.stroke();
    }
    for (let x = 0; x <= W; x += 128) { g.fillStyle = 'rgba(8,9,11,0.8)'; g.fillRect(x, 0, 1.5, H); }   // panel joints every 0.8 m
    return tex(c, { repeat: true });
  })();
  const matStone = own(new THREE.MeshBasicMaterial({ map: stoneTex, vertexColors: true }));
  // ⚠ Both materials take vertex colour now. The slab underline and the soffit lines were painted
  // 0.55 and 0.8 grey, but the materials had no vertexColors, so every line burned at the full
  // HDR orange (1.5×) and the balconies read as stacks of neon stripes. The colours are per line now:
  // a warm handrail strip just over the bloom threshold, a cool dim reveal under each slab.
  const RAIL_BASE = new THREE.Color(1, 1, 1);
  const matRailLed = own(new THREE.MeshBasicMaterial({ color: RAIL_BASE.clone(), vertexColors: true }));
  const matCeilLed = own(new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true }));
  const RING_BASE = hdr(0xe4f1ff, 1.75);   // thin and crisp: brightness on a hairline, not a band
  const matRing = own(new THREE.MeshBasicMaterial({ color: RING_BASE.clone(), vertexColors: true, side: THREE.DoubleSide }));
  const HALO_BASE = new THREE.Color(1, 1, 1);
  const matHalo = own(new THREE.MeshBasicMaterial({ vertexColors: true, color: HALO_BASE.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  const matMark = own(new THREE.MeshBasicMaterial({ color: hdr(0xf4f7ff, 1.35) }));
  const matTower = own(new THREE.MeshBasicMaterial({ map: cityTex, vertexColors: true, fog: false }));
  const matRed = own(new THREE.MeshBasicMaterial({ color: hdr(0xff2a1c, 2.2), fog: false }));
  const matCrown = own(new THREE.MeshBasicMaterial({ color: hdr(0xbfe4ff, 2.0), fog: false }));
  const matTrunk = own(new THREE.MeshBasicMaterial({ map: barkTex, vertexColors: true }));
  // The fronds are geometry (palmGeometry.mjs): no texture, no alpha test. A leaflet's front face is
  // its upper surface — dark green in the room's light; seen from below it shows its underside,
  // gold where the planter's lamp reaches it (aUnder), which is what makes an uplit palm read gold.
  const matFrond = own(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const PALM_GOLD = new THREE.Color(0.62, 0.4, 0.14);
  // the planter lamp's beam: an open 3D cone, additive, its vertex colour the fade
  const matBeam = own(new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(0.045, 0.03, 0.012), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const matCandle = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1) }));
  const matPeople = own(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const matSofa = own(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const matTable = own(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const matFloor = own(new THREE.MeshStandardMaterial({ color: 0x0b0c10, roughness: 0.3, metalness: 0.15, emissive: 0xffffff, emissiveMap: floorTex, emissiveIntensity: 1.0 }));

  // Shader hooks: crowd bob on the kick, palm sway, all per-instance-phased in the vertex shader.
  const U = {
    uTime: { value: 0 },
    uKick: { value: 0 },
    uSway: { value: RM ? 0 : 1 },
  };
  matPeople.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uKick = U.uKick; sh.uniforms.uSway = U.uSway;
    sh.vertexShader = 'uniform float uTime;\nuniform float uKick;\nuniform float uSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float vPh = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
      #else
        float vPh = 0.5;
      #endif
      float vUp = smoothstep(0.7, 1.7, transformed.y);
      transformed.y -= uKick * (0.018 + 0.03 * vPh) * vUp;
      transformed.x += sin(uTime * (0.8 + 0.7 * vPh) + vPh * 6.2832) * 0.03 * vUp * uSway;`);
  };
  matPeople.customProgramCacheKey = () => 'clubVenue-people';
  matFrond.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uSway = U.uSway; sh.uniforms.uGold = { value: PALM_GOLD };
    sh.fragmentShader = 'uniform vec3 uGold;\nvarying float vUnder;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if (!gl_FrontFacing) diffuseColor.rgb = diffuseColor.rgb * 0.6 + uGold * vUnder;`);
    sh.vertexShader = 'uniform float uTime;\nuniform float uSway;\nattribute float aFlex;\nattribute float aUnder;\nvarying float vUnder;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vUnder = aUnder;
      #ifdef USE_INSTANCING
        float fPh = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
      #else
        float fPh = 0.0;
      #endif
      float fk = aFlex * aFlex * uSway;
      transformed.x += sin(uTime * 0.7 + fPh) * 0.05 * fk;
      transformed.z += cos(uTime * 0.53 + fPh * 1.3) * 0.05 * fk;
      transformed.y += sin(uTime * 0.9 + fPh * 0.7) * 0.03 * fk;`);
  };
  matFrond.customProgramCacheKey = () => 'clubVenue-frond-3d';

  // ── colour palette (baked light) ────────────────────────────────────
  const C_DARK = [0.01, 0.012, 0.017];
  const C_WALL = [0.008, 0.01, 0.015];
  const C_EDGE = [0.02, 0.018, 0.018];
  // Dark stone and glass in deep navy-black; the warm pools on it come from the light bake
  // (bakeVenueLight), never from a painted gradient.
  const C_WALKWAY = [0.026, 0.026, 0.031];
  const C_SOFFIT_RAIL = [0.016, 0.017, 0.022];
  const C_SOFFIT_WALL = [0.03, 0.025, 0.024];
  const C_COLUMN = [0.012, 0.011, 0.01];
  const C_POST = [0.03, 0.03, 0.034];
  const C_CEIL = [0.006, 0.008, 0.013];

  // ── 1. structure: slabs, columns, walls, ceiling, skylight frame, rail posts ─────────
  const S = [];
  // distance-from-rail painter for slabs (d: vertex → metres from the atrium edge)
  const slabPaint = (dist, depth) => (x, y, z, nx, ny) => {
    if (ny > 0.5) return C_WALKWAY;
    if (ny < -0.5) return mix3(C_SOFFIT_RAIL, C_SOFFIT_WALL, clamp(dist(x, y, z) / depth, 0, 1));
    return C_EDGE;
  };
  for (const L of LEVELS) {
    for (const s of [-1, 1]) {
      S.push(paint(occ(boxSeg(s * X_IN, s * X_OUT, L - SLAB_T, L, Z_FAR, Z_STAGE, BAKE_CELL)), slabPaint((x) => Math.abs(x) - X_IN, X_OUT - X_IN)));
    }
    // far-end wrap
    S.push(paint(occ(boxSeg(-X_IN, X_IN, L - SLAB_T, L, Z_FAR, FAR_RAIL_Z, BAKE_CELL)), slabPaint((x, y, z) => FAR_RAIL_Z - z, FAR_RAIL_Z - Z_FAR)));
  }
  // stage end: open from the floor to the ceiling. The corner tiers that stood beside the portal and
  // the top-tier bridge over it are gone; the arena stage's LED wall fills that whole end now.

  // end walls (dark, behind the glass), ceiling
  S.push(solid(occ(box(-X_OUT, X_OUT, FLOOR_Y, CEIL_Y, Z_STAGE, Z_STAGE + 0.3)), C_WALL));
  S.push(solid(occ(box(-X_OUT, X_OUT, FLOOR_Y, CEIL_Y, Z_FAR - 0.3, Z_FAR)), C_WALL));
  for (const s of [-1, 1]) S.push(solid(occ(box(s * X_OUT, s * (X_OUT + 0.3), FLOOR_Y, CEIL_Y + 2.2, Z_FAR, Z_STAGE)), C_WALL));

  const SEG = LOW ? 72 : 128;
  const sk = SKYLIGHT;
  const A0 = sk.a, B0 = sk.b;                // the opening
  const A1 = sk.a + 1.8, B1 = sk.b + 1.8;    // outer edge of the dropped frame
  const FRAME_Y = CEIL_Y - 0.4;
  // A shallow rim: from the back of the hall the establishing shot looks just over its far
  // edge, and a deep rim would hide the skyline there entirely.
  const RIM_TOP = CEIL_Y + 0.35;
  const loop = (a, b, y) => {
    const out = [];
    for (let i = 0; i < SEG; i++) { const [x, z] = superPt(a, b, (i / SEG) * Math.PI * 2); out.push([x, y, z]); }
    return out;
  };
  {
    // The ceiling over the atrium carries the skylight's hole; the strips over the balconies are cut
    // into cells so the top tier's palms can throw their gold pools up onto them (the bake).
    const shape = new THREE.Shape();
    shape.moveTo(-X_IN, FAR_RAIL_Z); shape.lineTo(X_IN, FAR_RAIL_Z); shape.lineTo(X_IN, END_RAIL_Z); shape.lineTo(-X_IN, END_RAIL_Z); shape.closePath();
    const hole = new THREE.Path();
    const hp = loop(A0 + 0.02, B0 + 0.02, 0).map((p) => new THREE.Vector2(p[0], p[2]));
    hole.setFromPoints(hp.reverse());
    shape.holes.push(hole);
    const ceil = new THREE.ShapeGeometry(shape, 1);
    ceil.rotateX(Math.PI / 2);
    ceil.translate(0, CEIL_Y, 0);
    S.push(solid(ceil, C_CEIL));
    const strip = (x0, x1, z0, z1) => S.push(gridGeo([x0, CEIL_Y, z0], [1, 0, 0], [0, 0, 1], x1 - x0, z1 - z0, BAKE_CELL, C_CEIL));
    for (const s of [-1, 1]) strip(s > 0 ? X_IN : -X_OUT, s > 0 ? X_OUT : -X_IN, Z_FAR, Z_STAGE);
    strip(-X_IN, X_IN, Z_FAR, FAR_RAIL_Z);
    strip(-X_IN, X_IN, END_RAIL_Z, Z_STAGE);
  }
  // the dropped oval frame: underside annulus, inner rim (up into the sky), outer lip
  const cFrameIn = [0.03, 0.038, 0.05], cFrameOut = [0.014, 0.017, 0.024];
  S.push(loopStrip(loop(A0, B0, FRAME_Y), loop(A1, B1, FRAME_Y), cFrameIn, cFrameOut));
  S.push(loopStrip(loop(A0, B0, FRAME_Y + 0.24), loop(A0, B0, RIM_TOP), [0.03, 0.038, 0.05], [0.012, 0.016, 0.024]));
  S.push(loopStrip(loop(A1, B1, FRAME_Y), loop(A1, B1, CEIL_Y + 0.01), cFrameOut, C_CEIL));

  // structural columns in the lounge glass line
  const colPaint = (inward) => (x, y, z, nx, ny, nz) => ((nx * inward[0] + nz * inward[1]) > 0.5 ? [0.034, 0.025, 0.018] : C_COLUMN);
  TIERS.forEach((T) => {
    for (const s of [-1, 1]) {
      for (let k = 0; k <= 8; k++) {
        const z = lerp(FAR_WIN_Z, END_WIN_Z, k / 8);
        S.push(paint(occ(box(s * (WIN_X - 0.25), s * (WIN_X + 0.25), T.y0, T.y1, z - 0.25, z + 0.25)), colPaint([-s, 0])));
      }
    }
    for (let k = 1; k < 4; k++) {
      const x = lerp(-WIN_X, WIN_X, k / 4);
      S.push(paint(occ(box(x - 0.25, x + 0.25, T.y0, T.y1, FAR_WIN_Z - 0.25, FAR_WIN_Z + 0.25)), colPaint([0, 1])));
    }
  });
  // far-wall entrance frame (ground level, centre)
  S.push(solid(box(-2.9, 2.9, 2.35, 2.75, FAR_WIN_Z, FAR_WIN_Z + 0.35), C_EDGE));
  for (const s of [-1, 1]) S.push(solid(box(s * 2.9 - 0.2, s * 2.9 + 0.2, FLOOR_Y, 2.75, FAR_WIN_Z, FAR_WIN_Z + 0.35), C_EDGE));
  // plaque behind the Shape mark (far wall, top tier)
  S.push(solid(box(-1.9, 1.9, 12.25, 14.95, FAR_WIN_Z + 0.02, FAR_WIN_Z + 0.12), [0.014, 0.016, 0.022]));

  // Balcony railings (a run from a to b at level y, facing = unit vector toward the atrium).
  const RAILS = [];
  for (const L of LEVELS) {
    // every tier runs on past the stage's LED wall to the end wall
    const zEnd = END_WIN_Z - 0.05;
    for (const s of [-1, 1]) RAILS.push({ a: [s * X_IN, FAR_RAIL_Z], b: [s * X_IN, zEnd], y: L, face: [-s, 0] });
    RAILS.push({ a: [-X_IN, FAR_RAIL_Z], b: [X_IN, FAR_RAIL_Z], y: L, face: [0, 1] });
  }

  // ── the balcony fronts: frameless glass on a stone kerb, a lit handrail ───────────
  // As in the reference: a dark stone fascia over the slab edge rising into a low kerb, a continuous
  // frameless glass balustrade set into it (no posts; faint joints every 1.5 m and a sheen, so the
  // glass reads as glass), a slim dark handrail with a warm LED line under its atrium edge, and
  // downlights in the soffit above every walkway (their pools on the floor come from the light bake).
  const G = [];      // rail glass
  const GR = [];     // the glass sheen (additive)
  const FS = [];     // stone fascia faces (textured)
  const RL = [];     // LED lines (handrails, slab-edge underlines, lounge-edge floor strip)
  const DOWN = [];   // soffit downlight lenses
  const DOWNLIGHTS = [];   // { p:[x,y,z] } — light sources for the bake
  const KERB_H = 0.14;
  // a box along a run between two offsets measured INTO the balcony from the edge line (face is outward)
  const alongBox = (r, o0, o1, y0, y1) => {
    const ix = -r.face[0], iz = -r.face[1];
    const xs = [r.a[0] + ix * o0, r.a[0] + ix * o1, r.b[0] + ix * o0, r.b[0] + ix * o1];
    const zs = [r.a[1] + iz * o0, r.a[1] + iz * o1, r.b[1] + iz * o0, r.b[1] + iz * o1];
    return box(Math.min(...xs), Math.max(...xs), y0, y1, Math.min(...zs), Math.max(...zs));
  };
  // a vertical quad along a run, offset (into the balcony) and facing the atrium
  const alongQuad = (r, off, y0, y1, uvScale, rgb) => {
    let a = r.a, b = r.b;
    let ux = b[0] - a[0], uz = b[1] - a[1];
    const L = Math.hypot(ux, uz); ux /= L; uz /= L;
    if (-uz * r.face[0] + ux * r.face[1] < 0) { [a, b] = [b, a]; ux = -ux; uz = -uz; }   // normal = u × up must face the atrium
    const o = [a[0] - r.face[0] * off, y0, a[1] - r.face[1] * off];
    return quad(o, [ux, 0, uz], [0, 1, 0], L, y1 - y0, [0, 0, L / uvScale, 1], rgb);
  };
  for (const r of RAILS) {
    const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1];
    const len = Math.hypot(dx, dz);
    // the kerb the glass stands in, and its stone face over the slab edge
    S.push(solid(occ(alongBox(r, 0, 0.12, r.y, r.y + KERB_H)), [0.02, 0.021, 0.026]));
    FS.push(alongQuad(r, -0.004, r.y - SLAB_T - 0.02, r.y + KERB_H, 3.2, [0.4, 0.4, 0.43]));
    // the glass, set 4 cm in from the face, from the kerb to the handrail
    G.push(alongQuad(r, 0.04, r.y + KERB_H, r.y + RAIL_H - 0.03, 1, [1, 1, 1]));
    GR.push(alongQuad(r, 0.036, r.y + KERB_H, r.y + RAIL_H - 0.03, 6, [1, 1, 1]));
    // the handrail: a slim dark cap on the glass
    S.push(solid(alongBox(r, 0.005, 0.075, r.y + RAIL_H - 0.035, r.y + RAIL_H + 0.01), [0.028, 0.027, 0.03]));
    // the LED line under its atrium-side lip, and a cool hairline under the slab edge
    RL.push(solid(alongBox(r, 0.0, 0.012, r.y + RAIL_H - 0.05, r.y + RAIL_H - 0.035), [1.05, 0.76, 0.46]));
    RL.push(solid(alongBox(r, 0.02, 0.05, r.y - SLAB_T - 0.035, r.y - SLAB_T - 0.02), [0.07, 0.1, 0.15]));
    // glass joints every 1.5 m (frameless: a faint seam, no post)
    const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 1; i < n; i++) {
      const px = r.a[0] + (dx * i) / n, pz = r.a[1] + (dz * i) / n;
      const jr = { a: [px - (dx / len) * 0.006, pz - (dz / len) * 0.006], b: [px + (dx / len) * 0.006, pz + (dz / len) * 0.006], face: r.face };
      S.push(solid(alongBox(jr, 0.035, 0.045, r.y + KERB_H, r.y + RAIL_H - 0.035), [0.035, 0.04, 0.05]));
    }
    // downlights in the soffit of the slab ABOVE this walkway (the tier's own ceiling)
    if (r.nocrowd) continue;
    const ceilY = r.y === LEVELS[2] ? CEIL_Y : r.y + (LEVELS[1] - LEVELS[0]) - SLAB_T;
    const nd = Math.max(1, Math.round(len / 2.4));
    for (let i = 0; i < nd; i++) {
      const t = (i + 0.5) / nd;
      const px = r.a[0] + dx * t - r.face[0] * 0.85, pz = r.a[1] + dz * t - r.face[1] * 0.85;
      const lens = new THREE.CylinderGeometry(0.055, 0.055, 0.012, 10, 1);
      lens.translate(px, ceilY - 0.008, pz);
      DOWN.push(solid(lens, [2.1, 1.62, 1.1]));
      DOWNLIGHTS.push({ p: [px, ceilY - 0.03, pz] });
    }
  }
  // ground-floor downlights in the L1 soffit, over the walk between the booths and the lounge glass
  for (const s of [-1, 1]) for (let z = -41.6; z < 4.6; z += 2.4) {
    const px = s * (X_IN + 0.85), ceilY = LEVELS[0] - SLAB_T;
    const lens = new THREE.CylinderGeometry(0.055, 0.055, 0.012, 10, 1);
    lens.translate(px, ceilY - 0.008, z);
    DOWN.push(solid(lens, [2.1, 1.62, 1.1]));
    DOWNLIGHTS.push({ p: [px, ceilY - 0.03, z] });
  }
  // floor-level lounge edge strip (the line of warm light at the foot of the booth backs)
  for (const s of [-1, 1]) RL.push(solid(box(s * 6.9 - 0.03, s * 6.9 + 0.03, FLOOR_Y + 0.005, FLOOR_Y + 0.04, -43.6, -6.4), [0.5, 0.36, 0.22]));

  const structGeo = merge(S, 'structure');
  mesh(structGeo, matStructure, 'venueStructure');
  mesh(merge(G, 'glass'), matGlass, 'venueRailGlass', 2);
  mesh(merge(GR, 'glassSheen'), matRailSheen, 'venueRailSheen', 3);
  const fasciaMesh = mesh(merge(FS, 'fascia'), matStone, 'venueBalconyFascia');
  const railLedMesh = mesh(merge(RL, 'railLeds'), matRailLed, 'venueRailLeds');
  void railLedMesh;
  mesh(merge(DOWN, 'downlights'), matCeilLed, 'venueDownlights');

  // ── 2. the lounges: real rooms behind the glass ─────────────────────────
  // Each side and the far end has a 1.8 m deep lounge between the glass line (WIN_X / FAR_WIN_Z)
  // and the outer wall. The warm interior is painted on the BACK wall, and the room in front of it
  // is 3D: a banquette along the wall, tables with lamps, seated guests (the crowd bake's seated
  // pose), window frames at the glass line and a faint glass sheen — so the rooms have parallax
  // and nobody in them is a picture. The stage end has no depth behind its glass: there the frames
  // are painted on, and nobody sits there.
  const W = [], WE = [];
  const TEX_M = 12.8;  // metres per texture repeat
  const tierTone = [1.0, 0.93, 0.97, 0.9];
  const BACK_X = X_OUT - 0.04, BACK_Z = Z_FAR + 0.04;
  TIERS.forEach((T, ti) => {
    const h = T.y1 - T.y0;
    // stage end (glass faces −z): corners beside the portal, the band over it, full width at the top
    const endRun = (xa, xb, y0, y1, v0) => {
      const len = xb - xa, off = rnd(), tone = tierTone[ti] * (0.85 + rnd() * 0.25);
      WE.push(quad([xb, y0, END_WIN_Z], [-1, 0, 0], [0, 1, 0], len, y1 - y0, [off, v0, off + len / TEX_M, 1], [tone, tone, tone]));
    };
    // only the ends of the side balconies, beside the stage's LED wall (which runs up to the ceiling)
    endRun(-WIN_X, -ARENA_DIMS.HALF_W - 0.12, T.y0, T.y1, 0);
    endRun(ARENA_DIMS.HALF_W + 0.12, WIN_X, T.y0, T.y1, 0);
  });
  mesh(merge(WE, 'loungeEnd'), matLoungeEnd, 'venueLoungeEnd');

  // ── 2b. the private boxes ──────────────────────────────────────────────
  // Every lounge bay is split into private boxes a party can take for the night: two per column bay
  // down the sides (≈3.1 m wide), two per bay at the far end. Each box is its own room — a back wall
  // in its own colour, a carpet, an accent light, partitions either side, and one of six furniture
  // layouts in one of ten upholsteries — and no two boxes share the same colour + layout +
  // upholstery. Most are taken (seated guests from the crowd bake, or standing at a bar); a few are
  // dark and empty, waiting for a booking. All of it is geometry; nothing here is a picture.
  const brnd = mulberry32(seed * 13 + 5);   // its own stream: adding a box never moves a palm
  // Warm and muted: every box is a lamplit room, and the differences between them are the kind a
  // room's wall and lamp make (amber, champagne, rose, smoke), never a colour chart. The old set ran
  // to emerald, teal, violet and crimson at full strength, and the balconies read as a row of
  // coloured shop windows — the reference is a dark atrium with warm pools behind the glass.
  const BOX_TINTS = [
    [1.0, 0.64, 0.34], [1.0, 0.82, 0.58], [1.0, 0.56, 0.36], [0.96, 0.62, 0.56], [0.86, 0.5, 0.34],   // amber · champagne · copper · rose · bronze
    [0.72, 0.78, 0.62], [0.62, 0.72, 0.78], [0.66, 0.66, 0.8], [0.8, 0.64, 0.72], [0.92, 0.88, 0.8],  // sage · smoke · slate · mauve · marble
  ];
  // upholstery the way a lamplit room shows it: oxblood, bottle green, cream, ink, black, cognac,
  // ochre, dusty rose, deep teal, dove — each dark and low in chroma (the old set was saturated
  // enough to read as green and blue blocks from the far end of the atrium)
  const UPHOLSTERY = [
    [0.12, 0.035, 0.035], [0.035, 0.07, 0.045], [0.36, 0.32, 0.26], [0.035, 0.04, 0.07], [0.03, 0.026, 0.024],
    [0.2, 0.12, 0.065], [0.22, 0.16, 0.06], [0.24, 0.14, 0.13], [0.035, 0.075, 0.075], [0.18, 0.17, 0.16],
  ];
  const WOODS = [[0.06, 0.035, 0.02], [0.4, 0.39, 0.37], [0.34, 0.23, 0.08], [0.015, 0.014, 0.014]];   // walnut · marble · brass · black
  const ACCENTS = [[1.5, 1.0, 0.52], [1.4, 1.22, 0.96], [1.4, 0.82, 0.7], [0.9, 1.1, 1.3], [1.3, 1.1, 0.8], [1.55, 0.86, 0.36]];   // warm white · champagne · blush · ice · linen · amber
  const LAYOUTS = ['banquette', 'sofas', 'dining', 'bar', 'armchairs', 'daybed'];
  // every (tint, layout, upholstery) once, shuffled; each box takes the next one whose tint differs from its neighbour's
  const COMBOS = [];
  for (let a = 0; a < BOX_TINTS.length; a++) for (let b = 0; b < LAYOUTS.length; b++) for (let c = 0; c < UPHOLSTERY.length; c++) COMBOS.push([a, b, c]);
  for (let i = COMBOS.length - 1; i > 0; i--) { const j = Math.floor(brnd() * (i + 1)); [COMBOS[i], COMBOS[j]] = [COMBOS[j], COMBOS[i]]; }
  let lastTint = -1;
  const takeCombo = () => {
    let i = COMBOS.findIndex((c) => c[0] !== lastTint);
    if (i < 0) i = 0;
    const c = COMBOS.splice(i, 1)[0];
    lastTint = c[0];
    return c;
  };

  const BOXES = [];   // { o:[x,y,z], th, w, d, h, tint, layout, uph, wood, accent, empty }
  const DEPTH = BACK_X - WIN_X;   // ≈ 1.76 m
  TIERS.forEach((T) => {
    const h = T.y1 - T.y0;
    for (const s of [-1, 1]) {
      lastTint = -1;
      for (let k = 0; k < 16; k++) {
        const za = lerp(FAR_WIN_Z, END_WIN_Z, k / 16), zb = lerp(FAR_WIN_Z, END_WIN_Z, (k + 1) / 16);
        BOXES.push({ o: [s * BACK_X, T.y0, (za + zb) / 2], th: -s * Math.PI / 2, w: zb - za, d: DEPTH, h, s, closeRight: (s > 0 && k === 15) || (s < 0 && k === 0) });
      }
    }
    lastTint = -1;
    for (let k = 0; k < 8; k++) {
      // the outer boxes run into the corners, to the side walls
      const xa = k === 0 ? -BACK_X : lerp(-WIN_X, WIN_X, k / 8), xb = k === 7 ? BACK_X : lerp(-WIN_X, WIN_X, (k + 1) / 8);
      BOXES.push({ o: [(xa + xb) / 2, T.y0, BACK_Z], th: 0, w: xb - xa, d: FAR_WIN_Z - BACK_Z, h, s: 0 });
    }
  });
  for (const B of BOXES) {
    const [t, l, u] = takeCombo();
    B.tint = BOX_TINTS[t]; B.layout = LAYOUTS[l]; B.uph = UPHOLSTERY[u];
    B.wood = WOODS[Math.floor(brnd() * WOODS.length)];
    B.accent = ACCENTS[Math.floor(brnd() * ACCENTS.length)];
    B.empty = brnd() < 0.14;
    B.bright = (B.empty ? 0.2 : 0.42) + brnd() * 0.16;   // a dim room lit by its lamps (the bake adds their pools); an empty box is darker, not black
  }

  const FURN = [], GLOW = [];
  const LOUNGE_GUESTS = [];   // { x, y, z, ry, seat: { x, z, top } | undefined }
  const bm = new THREE.Matrix4(), bR = new THREE.Matrix4(), bv = new THREE.Vector3();
  BOXES.forEach((B) => {
    const { w, d, h } = B;
    bm.makeTranslation(B.o[0], B.o[1], B.o[2]).multiply(bR.makeRotationY(B.th));
    const lightK = B.bright;
    const L = [B.tint[0] * lightK, B.tint[1] * lightK, B.tint[2] * lightK];
    // shade a piece in the box's own light: tops catch the room, fronts (toward the glass) a little
    const shade = (base, lift = 0) => (x, y, z, nx, ny, nz) => {
      let k = 0.32 + 0.6 * Math.max(0, ny) + 0.2 * Math.max(0, nz) + 0.08 * Math.abs(nx) + lift;
      if (ny < -0.5) k = 0.12;
      return [base[0] * L[0] * k * 1.6, base[1] * L[1] * k * 1.6, base[2] * L[2] * k * 1.6];
    };
    const P = []; // this box's pieces, local: x along the wall (u), y up, z out of the wall toward the glass (d)
    const piece = (x0, x1, y0, y1, z0, z1, base, lift) => P.push(paint(box(x0, x1, y0, y1, z0, z1), shade(base, lift)));
    const cyl = (x, z, r, y0, y1, base, seg = 10) => { const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg, 1); g.translate(x, (y0 + y1) / 2, z); P.push(paint(g, shade(base))); };
    const glowAt = (x, y, z, r, c) => { const g = new THREE.SphereGeometry(r, 8, 6); g.translate(x, y, z); GLOW.push(solid(g, c).applyMatrix4(bm)); };
    // guests: local position, facing (local yaw: 0 = toward the glass), seated on a seat of height `top`
    const guest = (u, dd, yawL, top) => {
      if (B.empty) return;
      bv.set(u, 0, dd).applyMatrix4(bm);
      const g = { x: bv.x, y: B.o[1], z: bv.z, ry: B.th + yawL + (brnd() - 0.5) * 0.3 };
      if (top != null) g.seat = { x: bv.x, z: bv.z, top: B.o[1] + top };
      if (!LOW || brnd() < 0.55) LOUNGE_GUESTS.push(g);
    };
    const hw = w / 2;
    // This box's own lights, in its local frame: each lamp, and the accent strip under the ceiling.
    // They are baked into this box's wall and furniture only (below), so no box lights its neighbour.
    const BL = [];
    const lamp = B.empty ? [0.4, 0.24, 0.1] : [3.2, 1.9, 0.8];
    const lampAt = (x, y, z, r) => { glowAt(x, y, z, r, lamp); if (!B.empty) BL.push({ p: [x, y, z], c: [0.26, 0.15, 0.064], r0: 0.14, range: 2.4, shadow: false }); };
    // the room: back wall (painted interior, tinted, cut into cells for the lamps' pools), carpet,
    // partitions, the accent line
    const off = brnd();
    const wallG = gridGeo([-hw, 0, 0.01], [1, 0, 0], [0, 1, 0], w, h, LOW ? 0.8 : 0.4, L.map((c) => c * 0.72), [off, 0, off + w / TEX_M, 1]);
    piece(-hw, hw, 0, 0.012, 0, d, [B.uph[0] * 0.5 + 0.02, B.uph[1] * 0.5 + 0.018, B.uph[2] * 0.5 + 0.016], -0.2);
    const wall = [0.05, 0.036, 0.026];
    piece(-hw, -hw + 0.08, 0, h, 0, d, wall);
    if (B.closeRight) piece(hw - 0.08, hw, 0, h, 0, d, wall);   // each run's last box closes its own end (the others share a neighbour's wall)
    GLOW.push(solid(box(-hw + 0.1, hw - 0.1, h - 0.2, h - 0.16, 0.02, 0.06), B.accent.map((c) => c * (B.empty ? 0.25 : 1))).applyMatrix4(bm));
    for (const u of [-0.6, 0, 0.6]) BL.push({ p: [u * hw, h - 0.24, 0.14], c: B.accent.map((c) => c * (B.empty ? 0.012 : 0.05)), r0: 0.3, range: 2.4, shadow: false });
    switch (B.layout) {
      case 'banquette': {
        piece(-hw + 0.15, hw - 0.15, 0, 0.44, 0.04, 0.56, B.uph); piece(-hw + 0.15, hw - 0.15, 0.44, 0.95, 0.02, 0.18, B.uph, 0.1);
        const n = Math.max(1, Math.round((w - 0.4) / 1.5));
        for (let i = 0; i < n; i++) {
          const u = -hw + 0.2 + (w - 0.4) * (i + 0.5) / n;
          piece(u - 0.28, u + 0.28, 0.68, 0.72, 0.72, 1.18, B.wood); cyl(u, 0.95, 0.04, 0, 0.68, B.wood, 6);
          lampAt(u, 0.8, 0.95, 0.045);
          guest(u - 0.34, 0.24, 0, 0.44); if (brnd() < 0.7) guest(u + 0.34, 0.24, 0, 0.44);
        }
        break;
      }
      case 'sofas': {
        piece(-hw + 0.15, -hw + 0.7, 0, 0.42, 0.2, 1.45, B.uph); piece(-hw + 0.12, -hw + 0.3, 0.42, 0.9, 0.2, 1.45, B.uph, 0.1);
        piece(hw - 0.7, hw - 0.15, 0, 0.42, 0.2, 1.45, B.uph); piece(hw - 0.3, hw - 0.12, 0.42, 0.9, 0.2, 1.45, B.uph, 0.1);
        piece(-0.45, 0.45, 0.34, 0.38, 0.45, 1.15, B.wood); cyl(0, 0.8, 0.12, 0, 0.34, B.wood, 8);
        lampAt(0, 0.44, 0.8, 0.04);
        guest(-hw + 0.38, 0.5, Math.PI / 2, 0.42); guest(-hw + 0.38, 1.12, Math.PI / 2, 0.42);
        guest(hw - 0.38, 0.62, -Math.PI / 2, 0.42); if (brnd() < 0.6) guest(hw - 0.38, 1.18, -Math.PI / 2, 0.42);
        break;
      }
      case 'dining': {
        const tl = Math.min(w - 0.9, 2.3);
        piece(-tl / 2, tl / 2, 0.72, 0.76, 0.62, 1.2, B.wood); cyl(-tl / 2 + 0.2, 0.91, 0.05, 0, 0.72, B.wood, 6); cyl(tl / 2 - 0.2, 0.91, 0.05, 0, 0.72, B.wood, 6);
        const n = Math.max(2, Math.round(tl / 0.7));
        for (let i = 0; i < n; i++) {
          const u = -tl / 2 + tl * (i + 0.5) / n;
          piece(u - 0.2, u + 0.2, 0.44, 0.48, 0.18, 0.56, B.uph); piece(u - 0.2, u + 0.2, 0.48, 0.95, 0.14, 0.2, B.uph, 0.1);
          if (brnd() < 0.8) guest(u, 0.3, 0, 0.47);
          lampAt(u, 0.82, 0.9, 0.03);
        }
        piece(-tl / 2 - 0.42, -tl / 2 - 0.04, 0.44, 0.48, 0.7, 1.1, B.uph); guest(-tl / 2 - 0.2, 0.9, Math.PI / 2, 0.47);
        break;
      }
      case 'bar': {
        piece(-hw + 0.2, hw - 0.2, 0, 1.05, 0.05, 0.5, B.wood); piece(-hw + 0.2, hw - 0.2, 1.05, 1.09, 0.02, 0.58, B.uph, 0.2);
        for (let i = 0; i < 9; i++) glowAt(-hw + 0.35 + (w - 0.7) * brnd(), 1.45 + 0.35 * Math.floor(brnd() * 2), 0.06, 0.035, B.accent.map((c) => c * (B.empty ? 0.2 : 0.7)));
        piece(-hw + 0.2, hw - 0.2, 1.3, 1.33, 0.0, 0.14, B.wood); piece(-hw + 0.2, hw - 0.2, 1.65, 1.68, 0.0, 0.14, B.wood);
        cyl(hw * 0.4, 1.35, 0.26, 1.02, 1.06, B.wood, 12); cyl(hw * 0.4, 1.35, 0.04, 0, 1.02, B.wood, 6);
        guest(-hw * 0.45, 0.85, Math.PI, null); guest(hw * 0.05, 0.86, Math.PI, null);
        guest(hw * 0.4 - 0.4, 1.35, Math.PI / 2, null); if (brnd() < 0.6) guest(hw * 0.4 + 0.4, 1.35, -Math.PI / 2, null);
        break;
      }
      case 'armchairs': {
        const n = w > 2.8 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const u = -hw + w * (i + 0.5) / n;
          piece(u - 0.34, u + 0.34, 0, 0.42, 0.72, 1.3, B.uph); piece(u - 0.34, u + 0.34, 0.42, 0.88, 0.66, 0.8, B.uph, 0.1);
          piece(u - 0.38, u - 0.3, 0.42, 0.6, 0.72, 1.3, B.uph); piece(u + 0.3, u + 0.38, 0.42, 0.6, 0.72, 1.3, B.uph);
          guest(u, 0.92, 0, 0.42);
          if (i < n - 1) { const t = u + w / n / 2; cyl(t, 1.1, 0.15, 0.5, 0.53, B.wood, 10); cyl(t, 1.1, 0.03, 0, 0.5, B.wood, 6); lampAt(t, 0.6, 1.1, 0.035); }
        }
        break;
      }
      default: {   // daybed + poufs
        piece(-hw + 0.25, hw - 0.25, 0, 0.36, 0.04, 0.95, B.uph); piece(-hw + 0.25, hw - 0.25, 0.36, 0.72, 0.02, 0.2, B.uph, 0.1);
        for (let i = 0; i < 4; i++) piece(-hw + 0.4 + i * (w - 0.8) / 4, -hw + 0.4 + (i + 0.8) * (w - 0.8) / 4, 0.36, 0.52, 0.18, 0.3, B.wood, 0.3);
        cyl(-0.5, 1.35, 0.22, 0, 0.38, B.uph, 12); cyl(0.5, 1.35, 0.22, 0, 0.38, B.uph, 12);
        lampAt(0, 0.6, 0.12, 0.05);
        guest(-0.55, 0.36, 0, 0.36); guest(0.45, 0.36, 0, 0.36); if (brnd() < 0.5) guest(0.5, 1.35, Math.PI, 0.38);
      }
    }
    const tb0 = clock();
    const LGb = lightGrid(BL, 2);
    for (const g of [wallG, ...P]) {
      bakeMesh({ pos: g.attributes.position.array, nrm: g.attributes.normal.array, col: g.attributes.color.array, LG: LGb, OG: null, aoRays: 0, albedo: 0.45, neutral: 0.3 });
    }
    bakeMs.boxes += clock() - tb0;
    W.push(wallG.applyMatrix4(bm));
    for (const g of P) FURN.push(g.applyMatrix4(bm));
  });
  mesh(merge(FURN, 'boxFurniture'), matBoxes, 'venuePrivateBoxes');
  mesh(merge(GLOW, 'boxGlow'), matBoxGlow, 'venuePrivateBoxLights');

  // window frames at the glass line: mullions every quarter bay, a transom and a sill (the columns
  // stand on the bay lines)
  {
    const MF = [], cF = [0.02, 0.018, 0.015];
    TIERS.forEach((T) => {
      const h = T.y1 - T.y0, tY = T.y1 - 0.133 * h;
      for (const s of [-1, 1]) {
        for (let k = 1; k < 32; k++) if (k % 4) {
          const z = lerp(FAR_WIN_Z, END_WIN_Z, k / 32);
          MF.push(solid(box(s * (WIN_X - 0.04), s * (WIN_X + 0.04), T.y0, T.y1, z - 0.03, z + 0.03), cF));
        }
        MF.push(solid(box(s * (WIN_X - 0.03), s * (WIN_X + 0.03), tY, tY + 0.05, FAR_WIN_Z, END_WIN_Z), cF));
        MF.push(solid(box(s * (WIN_X - 0.03), s * (WIN_X + 0.03), T.y0, T.y0 + 0.08, FAR_WIN_Z, END_WIN_Z), cF));
      }
      for (let k = 1; k < 16; k++) if (k % 4) {
        const x = lerp(-WIN_X, WIN_X, k / 16);
        MF.push(solid(box(x - 0.03, x + 0.03, T.y0, T.y1, FAR_WIN_Z - 0.04, FAR_WIN_Z + 0.04), cF));
      }
      MF.push(solid(box(-WIN_X, WIN_X, tY, tY + 0.05, FAR_WIN_Z - 0.03, FAR_WIN_Z + 0.03), cF));
      MF.push(solid(box(-WIN_X, WIN_X, T.y0, T.y0 + 0.08, FAR_WIN_Z - 0.03, FAR_WIN_Z + 0.03), cF));
    });
    mesh(merge(MF, 'boxFrames'), matBoxes, 'venueBoxFrames');
    // a faint sheen on the glass, so the rooms read as behind glass
    const GS = [];
    TIERS.forEach((T) => {
      const h = T.y1 - T.y0, len = END_WIN_Z - FAR_WIN_Z;
      GS.push(quad([WIN_X - 0.01, T.y0, END_WIN_Z], [0, 0, -1], [0, 1, 0], len, h, [0, 0, len / 6, 1]));
      GS.push(quad([-WIN_X + 0.01, T.y0, FAR_WIN_Z], [0, 0, 1], [0, 1, 0], len, h, [0, 0, len / 6, 1]));
      GS.push(quad([-WIN_X, T.y0, FAR_WIN_Z + 0.01], [1, 0, 0], [0, 1, 0], 2 * WIN_X, h, [0, 0, (2 * WIN_X) / 6, 1]));
    });
    mesh(merge(GS, 'boxSheen'), matSheen, 'venueBoxGlass', 3);
  }
  mesh(merge(W, 'lounges'), matLounge, 'venueLounges');

  // ── 3. warm linear LEDs: ceiling + balcony soffits ─────────────────
  const CL = [];
  // dim warm lines: they draw the ceiling's perspective toward the stage without lighting it
  const ceilLine = (x, z0, z1) => { if (z1 - z0 > 0.2) CL.push(solid(box(x - 0.03, x + 0.03, CEIL_Y - 0.03, CEIL_Y - 0.005, z0, z1), [0.1, 0.082, 0.064])); };
  for (const s of [-1, 1]) {
    for (const x of [8.9, 9.8, 11.2, 11.9]) {
      const zin = superHalfZ(A1, B1, x);
      if (zin > 0) { ceilLine(s * x, Z_FAR, sk.z - zin - 0.3); ceilLine(s * x, sk.z + zin + 0.3, Z_STAGE); }
      else ceilLine(s * x, x > X_IN ? FAR_RAIL_Z : Z_FAR, x > X_IN ? END_RAIL_Z : Z_STAGE);
    }
  }
  for (const x of [-6.2, -3.2, 0, 3.2, 6.2]) {
    const zin = superHalfZ(A1, B1, x);
    ceilLine(x, Z_FAR, sk.z - zin - 0.3);
    ceilLine(x, sk.z + zin + 0.3, Z_STAGE);
  }
  // balcony soffits: two lines under each slab, just in from the rail
  // (corners close: side lines run to the far/end lines, which run out to the side lines)
  for (const L of LEVELS) {
    const y = L - SLAB_T - 0.02;
    for (const d of [0.4, 1.15]) {
      for (const s of [-1, 1]) {
        const x = s * (X_IN + d);
        CL.push(solid(box(x - 0.04, x + 0.04, y - 0.03, y, FAR_RAIL_Z - d - 0.04, END_RAIL_Z + d + 0.04), [0.14, 0.115, 0.09]));
      }
      const zf = FAR_RAIL_Z - d;
      CL.push(solid(box(-X_IN - d, X_IN + d, y - 0.03, y, zf - 0.04, zf + 0.04), [0.14, 0.115, 0.09]));

    }
  }
  mesh(merge(CL, 'ceilLeds'), matCeilLed, 'venueCeilingLeds');

  // ── 4. skylight ring (double ice-blue line + outer line) and its halo ─────
  function superTube(a, b, y, r, rgb, radial) {
    const N = SEG;
    const pos = [], col = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * Math.PI * 2;
      const [x, z] = superPt(a, b, th);
      const [x2, z2] = superPt(a, b, th + 0.001);
      let tx = x2 - x, tz = z2 - z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const ox = tz, oz = -tx;          // horizontal normal (outward for CCW)
      for (let j = 0; j <= radial; j++) {
        const ph = (j / radial) * Math.PI * 2;
        const cx = Math.cos(ph) * r, cy = Math.sin(ph) * r;
        pos.push(x + ox * cx, y + cy, z + oz * cx);
        col.push(...rgb);
        uv.push(i / N, j / radial);
      }
      if (i < N) for (let j = 0; j < radial; j++) {
        const k = i * (radial + 1) + j, k2 = k + radial + 1;
        idx.push(k, k2, k + 1, k + 1, k2, k2 + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  const RAD = LOW ? 4 : 6;
  const ringMesh = mesh(merge([
    // One crisp white-blue line on the opening's edge and a hairline outside it. The old three
    // tubes (10, 5.5 and 4.5 cm) plus a 4 m additive halo read as a wide glowing band; the
    // reference's ring is a thin LED line.
    // the frame's inner face, lit: a crisp band 26 cm tall facing into the opening
    loopStrip(loop(A0 + 0.004, B0 + 0.004, FRAME_Y - 0.02), loop(A0 + 0.004, B0 + 0.004, FRAME_Y + 0.24), [0.5, 0.58, 0.7], [0.5, 0.58, 0.7]),
    superTube(A0 + 0.05, B0 + 0.05, FRAME_Y - 0.05, 0.034, [1.0, 1.0, 1.0], RAD),
    superTube(A0 + 0.42, B0 + 0.42, FRAME_Y - 0.03, 0.016, [0.62, 0.78, 1.0], RAD),
  ], 'ring'), matRing, 'venueSkylightRing');
  void ringMesh;
  {
    // additive halo: bright at the ring, fading onto the frame and the ceiling
    // a narrow halo: the ring's light on the frame just around it, gone within a metre
    const inA = loop(A0 - 0.12, B0 - 0.12, FRAME_Y - 0.08);
    const midA = loop(A0 + 0.12, B0 + 0.12, FRAME_Y - 0.08);
    const outA = loop(A0 + 1.1, B0 + 1.1, FRAME_Y - 0.08);
    const cMid = [0.03, 0.042, 0.062];
    mesh(merge([loopStrip(inA, midA, [0, 0, 0], cMid), loopStrip(midA, outA, cMid, [0, 0, 0])], 'halo'), matHalo, 'venueSkylightHalo', 3);
  }

  // ── 5. the Shape mark (exact, public/logo-triangles-only.svg) on the far wall ──
  {
    const H_M = 2.1;                    // mark height (viewBox height 72 → H_M metres)
    const k = H_M / 72;
    const P = (x, y) => new THREE.Vector2((x - 100) * k, -(y - 50) * k);
    const t1 = new THREE.Shape([P(72, 38), P(72, 82), P(105, 60)]);
    const t2 = new THREE.Shape([P(128, 18), P(128, 62), P(95, 40)]);
    const mg = new THREE.ShapeGeometry([t1, t2]);
    mg.translate(0, 13.6, FAR_WIN_Z + 0.14);
    mesh(own(mg), matMark, 'venueShapeMark');
  }

  // ── 6. sky dome, stars, city skyline (seen through the skylight) ─────────
  const DOME_C = new THREE.Vector3(0, 2, sk.z);
  {
    const dg = own(new THREE.SphereGeometry(46, 28, 14));
    const dm = own(new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color(0x03060f) },
        uHorizon: { value: new THREE.Color(0x13203a) },
        uGlow: { value: new THREE.Color(0x3a2616) },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGlow; varying vec3 vDir;
        void main(){ float h = vDir.y; vec3 c = mix(uHorizon, uZenith, smoothstep(0.02, 0.75, h));
          c += uGlow * exp(-max(h, 0.0) * 7.0) * step(-0.05, h);
          if (h < -0.05) c = uHorizon * 0.35;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false,
    }));
    const dome = new THREE.Mesh(dg, dm);
    dome.name = 'venueSkyDome'; dome.position.copy(DOME_C); dome.renderOrder = -100;
    dome.frustumCulled = false;
    group.add(dome);

    const NS = LOW ? 180 : 360;
    const sp = new Float32Array(NS * 3), sc = new Float32Array(NS * 3);
    for (let i = 0; i < NS; i++) {
      const y = 0.18 + 0.82 * Math.pow(rnd(), 0.7), ph = rnd() * Math.PI * 2, r = Math.sqrt(1 - y * y);
      sp[i * 3] = DOME_C.x + Math.cos(ph) * r * 44; sp[i * 3 + 1] = DOME_C.y + y * 44; sp[i * 3 + 2] = DOME_C.z + Math.sin(ph) * r * 44;
      const b = 0.35 + 0.65 * Math.pow(rnd(), 2);
      sc[i * 3] = b * (0.85 + rnd() * 0.15); sc[i * 3 + 1] = b * 0.92; sc[i * 3 + 2] = b;
    }
    const sgeo = own(new THREE.BufferGeometry());
    sgeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sgeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const smat = own(new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
    const stars = new THREE.Points(sgeo, smat);
    stars.name = 'venueStars'; stars.renderOrder = -99; stars.frustumCulled = false;
    group.add(stars);
  }
  const REDS = [], CROWNS = [];
  {
    const T = [];
    const NT = LOW ? 34 : 64;
    const towers = [];
    const place = (x, z, w, d, h) => {
      for (const t of towers) if (Math.abs(t.x - x) < (t.w + w) / 2 + 2 && Math.abs(t.z - z) < (t.d + d) / 2 + 2) return false;
      towers.push({ x, z, w, d, h });
      return true;
    };
    // A distant city: the towers stand further out and lower than they did (r 34–48 m, up to 72 m
    // tall), so through the skylight they are a skyline along the bottom of the opening under a
    // starry sky, as in the reference, instead of three facades filling it.
    // landmark: the tall spire tower behind the stage end, where the skylight looks
    place(-5, 52, 9, 9, 31);
    place(14, 50, 8, 8, 36);
    place(-22, 44, 7, 9, 30);
    for (let tries = 0; tries < 900 && towers.length < NT; tries++) {
      // half the city in the sector the establishing shot looks through (+Z), half all round
      const ang = tries % 3 !== 2 ? (rnd() - 0.5) * 0.95 : rnd() * Math.PI * 2;
      const r = 56 + rnd() * 30;
      const x = Math.sin(ang) * r, z = sk.z + Math.cos(ang) * r;
      if (Math.abs(x) < 20 && z > Z_FAR - 6 && z < Z_STAGE + 8) continue;
      const w = 3.5 + rnd() * 6, d = 3.5 + rnd() * 6;
      const h = 22 + Math.pow(rnd(), 1.2) * 21;   // tall enough to clear the skylight's far rim from the establishing shot
      place(x, z, w, d, h);
    }
    const TW = 12, TH = 40;   // one texture tile: 32 columns × 64 floors (smaller windows: a city further off)
    const addBox = (x, z, w, d, y0, y1, bright, tint) => {
      const g = box(x - w / 2, x + w / 2, y0, y1, z - d / 2, z + d / 2);
      const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
      const off = rnd();
      const cols = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const nx = n.getX(i), ny = n.getY(i);
        const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
        if (Math.abs(ny) > 0.5) { uv.setXY(i, 0.001, 0.001); cols.set([0.012, 0.014, 0.02], i * 3); continue; }
        const s = Math.abs(nx) > 0.5 ? pz : px;
        uv.setXY(i, off + s / TW, py / TH);
        cols.set([bright * tint[0], bright * tint[1], bright * tint[2]], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      T.push(g);
    };
    towers.sort((a, b) => b.h - a.h);
    towers.forEach((t, i) => {
      const bright = 0.26 + rnd() * 0.3;   // a city at night far off: dim, sparse windows
      const tint = rnd() < 0.25 ? [0.78, 0.88, 1.05] : [1, 1, 1];
      const setback = rnd() < 0.45 && t.h > 36;
      const h0 = setback ? t.h * (0.62 + rnd() * 0.15) : t.h;
      addBox(t.x, t.z, t.w, t.d, -1, h0, bright, tint);
      let top = h0, tw = t.w, td = t.d;
      if (setback) { tw = t.w * 0.68; td = t.d * 0.68; addBox(t.x, t.z, tw, td, h0, t.h, bright * 1.05, tint); top = t.h; }
      if (t.x === -5 && t.z === 52) {
        // the spire
        const cone = new THREE.ConeGeometry(Math.min(tw, td) * 0.32, 9, 6);
        cone.translate(t.x, top + 4.5, t.z);
        const cc = new Float32Array(cone.attributes.position.count * 3).fill(0.03);
        cone.setAttribute('color', new THREE.BufferAttribute(cc, 3));
        T.push(cone);
        CROWNS.push(box(t.x - 0.08, t.x + 0.08, top, top + 5, t.z - Math.min(tw, td) * 0.33 - 0.05, t.z - Math.min(tw, td) * 0.33 + 0.1));
        REDS.push(box(t.x - 0.35, t.x + 0.35, top + 8.9, top + 9.6, t.z - 0.35, t.z + 0.35));
      }
      if (i < 7) {
        // red aviation lights on the tallest roofs
        REDS.push(box(t.x - tw / 2 + 0.2, t.x - tw / 2 + 1.0, top, top + 0.8, t.z - td / 2 + 0.2, t.z - td / 2 + 1.0));
        REDS.push(box(t.x + tw / 2 - 1.0, t.x + tw / 2 - 0.2, top, top + 0.8, t.z + td / 2 - 1.0, t.z + td / 2 - 0.2));
      }
    });
    // the ConeGeometry has uv + normal; give every part the same attribute set
    for (const g of T) if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const tm = mesh(merge(T, 'towers'), matTower, 'venueSkyline');
    tm.frustumCulled = false;
  }
  const redMesh = mesh(merge(REDS, 'aviation'), matRed, 'venueAviationLights');
  redMesh.frustumCulled = false;
  const crownMesh = mesh(merge(CROWNS, 'crowns'), matCrown, 'venueTowerCrowns');
  crownMesh.frustumCulled = false;

  // ── 7. palms (instanced: trunk + planter, 3D fronds, the uplight cone) ─────────────
  // Built by palmGeometry.mjs from the plant's own parts: a ringed trunk, a rachis per frond and
  // folded leaflets down both sides. Nothing here is a leaf card or an alpha-tested picture.
  const PQ = LOW ? 'low' : 'high';
  const palmGeo = (B, extra = false) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
    if (extra) { g.setAttribute('aFlex', new THREE.Float32BufferAttribute(B.flex, 1)); g.setAttribute('aUnder', new THREE.Float32BufferAttribute(B.under, 1)); }
    g.setIndex(B.idx);
    return own(g);
  };
  const trunkGeo = palmGeo(palmTrunk(PQ));
  const frondGeo = palmGeo(palmFronds(mulberry32(seed * 29 + 3), PQ), true);
  const beamGeo = palmGeo(palmBeam(PQ));

  const PALMS = [];   // { x, y, z, s }
  // No palms on the floor: the reference's floor is the crowd and the sunken booths either side, and
  // the old row of floor palms (twelve, 7 m tall) stood in front of the booths from every angle. The
  // palms live on the balconies, along the rails, uplit gold.
  // balconies
  const balZ = LOW ? [-36, -22, -8] : [-38, -30.5, -23, -15.5, -8, -0.5];
  for (const L of LEVELS) for (const s of [-1, 1]) for (const z of balZ) {
    const top = L === LEVELS[2] ? CEIL_Y : L + 4 - SLAB_T;
    const room = top - L;
    PALMS.push({ x: s * 11.45, y: L, z: z + (rnd() - 0.5) * 1.2, s: Math.min(0.84, (room - 0.55) / 4.2) * (0.92 + rnd() * 0.08) });
  }
  for (const L of LEVELS) for (const s of LOW ? [1] : [-1, 1]) PALMS.push({ x: s * 7.6, y: L, z: -43.45, s: 0.8 });


  const NP = PALMS.length;
  const imTrunk = new THREE.InstancedMesh(trunkGeo, matTrunk, NP);
  const imFrond = new THREE.InstancedMesh(frondGeo, matFrond, NP);
  const imBeam = new THREE.InstancedMesh(beamGeo, matBeam, NP);
  imTrunk.name = 'venuePalmTrunks'; imFrond.name = 'venuePalmFronds'; imBeam.name = 'venuePalmUplights';
  imBeam.renderOrder = 4;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), sc3 = new THREE.Vector3();
  PALMS.forEach((p, i) => {
    e.set((rnd() - 0.5) * 0.08, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.08);
    q.setFromEuler(e);
    m4.compose(v3.set(p.x, p.y, p.z), q, sc3.set(p.s, p.s, p.s));
    imTrunk.setMatrixAt(i, m4); imFrond.setMatrixAt(i, m4);
    e.set(0, e.y, 0); q.setFromEuler(e);
    m4.compose(v3.set(p.x, p.y, p.z), q, sc3.set(p.s, p.s, p.s));
    imBeam.setMatrixAt(i, m4);
  });
  for (const im of [imTrunk, imFrond, imBeam]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); group.add(im); }

  // ── 8. floor lounges: cream booths, tables, candles ──────────────────
  const sofaGeo = (() => {
    const L2 = 1.0;   // half length
    const parts = [
      box(-L2, L2, 0, 0.42, 0, 0.75),          // seat
      box(-L2, L2, 0, 0.95, -0.22, 0),         // back
      box(-L2, -L2 + 0.16, 0, 0.62, 0, 0.75),  // arms
      box(L2 - 0.16, L2, 0, 0.62, 0, 0.75),
    ];
    const cream = [0.2, 0.17, 0.13];   // cream in a dark room: the candle between the sofas lights them (the bake)
    for (const g of parts) paint(g, (x, y, z, nx, ny, nz) => {
      let k = 0.34 + 0.52 * Math.max(0, ny) + 0.22 * Math.max(0, nz) + 0.05 * Math.abs(nx);
      if (ny < -0.5) k = 0.12;
      if (nz < -0.5) k = 0.42;             // the back faces the crowd: lit by the room
      return [cream[0] * k, cream[1] * k, cream[2] * k];
    });
    return merge(parts, 'sofa');
  })();
  const tableGeo = (() => {
    const base = new THREE.CylinderGeometry(0.22, 0.26, 0.03, 12, 1); base.translate(0, 0.015, 0);
    const ped = new THREE.CylinderGeometry(0.05, 0.06, 0.5, 8, 1); ped.translate(0, 0.28, 0);
    const top = new THREE.CylinderGeometry(0.42, 0.42, 0.045, 18, 1); top.translate(0, 0.55, 0);
    // dark walnut: the candle's pool (baked below) is what makes the top read, not a pale paint
    solid(base, [0.02, 0.016, 0.012]); solid(ped, [0.035, 0.026, 0.018]);
    paint(top, (x, y, z, nx, ny) => (ny > 0.5 ? [0.045, 0.03, 0.019] : [0.1, 0.07, 0.034]));
    return merge([base, ped, top], 'table');
  })();
  const candleGeo = own(new THREE.CylinderGeometry(0.035, 0.04, 0.12, 8, 1));
  // The candle's light is baked: into the table top and the two sofas of its booth (here, in the
  // templates' own frames — every booth is the same arrangement) and into the floor around it (the
  // floor bake below). The old additive halo and the flat glow disc under each table are gone: they
  // read as bright blobs on the tables, and the reference's candles are small points of light.
  const CANDLE_LIGHT = { c: [0.55, 0.33, 0.13], r0: 0.12, range: 3.2 };
  {
    const bake1 = (g, p, albedo, k = 1, r0 = CANDLE_LIGHT.r0) => bakeMesh({ pos: g.attributes.position.array, nrm: g.attributes.normal.array, col: g.attributes.color.array,
      LG: lightGrid([{ p, c: CANDLE_LIGHT.c.map((c) => c * k), r0, range: CANDLE_LIGHT.range, shadow: false }], 2), OG: null, aoRays: 0, albedo, neutral: 0.2 });
    bake1(sofaGeo, [0, 0.72, 1.6], 0.38);             // the sofa faces its table 1.6 m away (+z local)
    bake1(tableGeo, [0, 0.72, 0], 0.45, 0.07, 0.24);   // the flame sits on the table: a warm top, not a white disc
  }

  const bayZ = [];
  for (let k = 0; k < 12; k++) if (!LOW || k % 2 === 0) bayZ.push(-9 - k * 3);
  const SOFAS = [], TABLES = [];
  for (const s of [-1, 1]) for (const z of bayZ) {
    // inner sofa: back toward the crowd, seat facing the table; outer: back to the lounge glass
    SOFAS.push({ x: s * 7.2, z, ry: s > 0 ? Math.PI / 2 : -Math.PI / 2 });
    SOFAS.push({ x: s * 10.4, z, ry: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
    TABLES.push({ x: s * 8.8, z });
  }
  const imSofa = new THREE.InstancedMesh(sofaGeo, matSofa, SOFAS.length);
  imSofa.name = 'venueBooths';
  SOFAS.forEach((b, i) => { q.setFromEuler(e.set(0, b.ry, 0)); m4.compose(v3.set(b.x, FLOOR_Y, b.z), q, sc3.set(1, 1, 1)); imSofa.setMatrixAt(i, m4); });
  // Each booth (its two sofas and its table) is its own private booth: its own upholstery, never the
  // same as the booth beside it (a multiplier on the painted cream: cream · oxblood · emerald · navy ·
  // tan · mustard · blush · teal · black · dove grey)
  {
    // muted, as the reference's sunken booths are: cream · ivory · taupe · charcoal · oxblood · navy ·
    // forest · camel · slate · dove (the old set ran to mustard, teal and blush at full strength)
    const BOOTH = [[1, 1, 1], [0.92, 0.9, 0.86], [0.62, 0.55, 0.48], [0.16, 0.16, 0.17], [0.42, 0.14, 0.13], [0.16, 0.2, 0.34], [0.18, 0.27, 0.2], [0.74, 0.54, 0.34], [0.36, 0.4, 0.44], [0.66, 0.66, 0.66]];
    const order = BOOTH.map((_, i) => i);
    const srnd = mulberry32(seed * 17 + 9);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(srnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const bc = new THREE.Color();
    SOFAS.forEach((b, i) => { const c = BOOTH[order[Math.floor(i / 2) % order.length]]; imSofa.setColorAt(i, bc.setRGB(c[0], c[1], c[2])); });
  }
  const imTable = new THREE.InstancedMesh(tableGeo, matTable, TABLES.length);
  imTable.name = 'venueTables';
  const imCandle = new THREE.InstancedMesh(candleGeo, matCandle, TABLES.length);
  imCandle.name = 'venueCandles';
  const CANDLE_C = new THREE.Color(2.8, 1.7, 0.72);
  TABLES.forEach((tb, i) => {
    q.set(0, 0, 0, 1);
    m4.compose(v3.set(tb.x, FLOOR_Y, tb.z), q, sc3.set(1, 1, 1)); imTable.setMatrixAt(i, m4);
    m4.compose(v3.set(tb.x, FLOOR_Y + 0.635, tb.z), q, sc3.set(1, 1, 1)); imCandle.setMatrixAt(i, m4);
    imCandle.setColorAt(i, CANDLE_C);
  });
  for (const im of [imSofa, imTable, imCandle]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); group.add(im); }
  if (imCandle.instanceColor) imCandle.instanceColor.setUsage(THREE.DynamicDrawUsage);

  // ── 8a. the main stage at arena scale (arenaStage.mjs): LED wall, wings, the mark, runway, rig ─
  const arena = createArenaStage({ THREE, quality, reducedMotion: RM, accent, mergeGeometries });
  group.add(arena.group);

  // ── 8b. the light bake: every small source in the room, baked into the vertices once ─────
  // The reference is lit by small warm sources — soffit downlights, the lamps behind the lounge glass,
  // the palms' uplights, the booth candles — and the dark stone around them is lit only where they
  // reach. lightBake.mjs computes that once, here, into the structure's vertex colours and the floor's
  // canvas: direct light with inverse-square falloff, shadow rays against the architecture's boxes,
  // a little ambient occlusion in the corners, and one bounce off the lit walkways. The runtime cost
  // is nothing (the colours are ordinary vertex attributes) and the download is nothing (it runs on
  // load, from the same code).
  const LIGHTS = [];
  // soffit downlights: a warm spot straight down, a tight cone, so each leaves its own pool
  for (const d of DOWNLIGHTS) LIGHTS.push({ p: d.p, c: [1.7, 1.25, 0.8], r0: 0.3, range: 5.2, dir: [0, -1, 0], cos0: 0.95, cos1: 0.8, self: 0.08 });
  // the palms' planter lamps, straight up: the gold pool on the soffit (or the ceiling) above each
  for (const pm of PALMS) {
    const k = pm.s * pm.s;
    LIGHTS.push({ p: [pm.x, pm.y + 0.45 * pm.s, pm.z], c: [3.4 * k, 2.15 * k, 0.86 * k], r0: 0.4, range: 6.5, dir: [0, 1, 0], cos0: 0.74, cos1: 0.18, self: 0.2 });
  }
  // each private box's glow through its glass: a broad warm source at the glass line, facing out
  for (const Bx of BOXES) {
    const Lc = Bx.tint.map((c) => c * Bx.bright * 1.4);
    const y = Bx.o[1] + 1.35;
    if (Bx.s) LIGHTS.push({ p: [Bx.s * (WIN_X - 0.35), y, Bx.o[2]], c: Lc, r0: 1.1, range: 5.6, dir: [-Bx.s, 0, 0], cos0: 0.05, cos1: -0.4 });
    else LIGHTS.push({ p: [Bx.o[0], y, FAR_WIN_Z + 0.35], c: Lc, r0: 1.1, range: 5.6, dir: [0, 0, 1], cos0: 0.05, cos1: -0.4 });
  }
  // the stage's LED wall: a broad wash toward the room on the balcony ends beside the stage, warm
  // low (its horizon) and cool high (its sky), as the wall's content is
  for (const x of [-8, -4, 0, 4, 8]) for (const [y, c] of [[2.5, [0.3, 0.2, 0.11]], [7.5, [0.26, 0.2, 0.16]], [12.5, [0.12, 0.2, 0.3]]]) {
    LIGHTS.push({ p: [x, y, ARENA_DIMS.BACK_Z - 0.2], c, r0: 2.2, range: 10, dir: [0, 0, -1], cos0: 0.15, cos1: -0.3, shadow: false });
  }
  // the booth candles (their pool on the floor; the sofas and table tops are baked above)
  for (const tb of TABLES) LIGHTS.push({ p: [tb.x, FLOOR_Y + 0.72, tb.z], c: CANDLE_LIGHT.c, r0: CANDLE_LIGHT.r0, range: CANDLE_LIGHT.range });
  // what blocks them: the architecture, and on the floor the booths' sofas and table tops
  const FLOOR_OCC = [];
  for (const b of SOFAS) {
    const s = Math.sign(b.x), inner = Math.abs(b.x) < 8.8;
    const xBack = inner ? b.x - s * 0.22 : b.x + s * 0.22, xSeat = inner ? b.x + s * 0.75 : b.x - s * 0.75;
    FLOOR_OCC.push([Math.min(xBack, b.x), FLOOR_Y, b.z - 1, Math.max(xBack, b.x), FLOOR_Y + 0.95, b.z + 1]);
    FLOOR_OCC.push([Math.min(b.x, xSeat), FLOOR_Y, b.z - 1, Math.max(b.x, xSeat), FLOOR_Y + 0.42, b.z + 1]);
  }
  for (const tb of TABLES) FLOOR_OCC.push([tb.x - 0.4, FLOOR_Y + 0.555, tb.z - 0.4, tb.x + 0.4, FLOOR_Y + 0.6, tb.z + 0.4]);
  const ts0 = clock();
  const OG = boxGrid([...ARCH, ...FLOOR_OCC], 1.5);
  const LG = lightGrid(LIGHTS, 3);
  {
    // the structure: direct light first (reused), one bounce off the lit up-facing surfaces, then AO
    const pa = structGeo.attributes.position.array, na = structGeo.attributes.normal.array, ca = structGeo.attributes.color;
    const D = directAll(pa, na, LG, OG);
    const samples = [];
    for (let i = 0; i < pa.length / 3; i++) {
      const e = D[i * 3] + D[i * 3 + 1] + D[i * 3 + 2];
      if (na[i * 3 + 1] > 0.5 && e > 0.003) samples.push({ p: [pa[i * 3], pa[i * 3 + 1], pa[i * 3 + 2]], n: [0, 1, 0], rad: [D[i * 3] * 0.3, D[i * 3 + 1] * 0.28, D[i * 3 + 2] * 0.26] });
    }
    const BF = bounceField(samples, { cell: 1.0, radius: 3.8, gain: 0.55 });
    bakeMesh({ pos: pa, nrm: na, col: ca.array, LG, OG, direct: D, bounce: BF, aoRays: LOW ? 3 : 5, aoLen: 1.0, aoStrength: 0.8, albedo: 0.4, neutral: 0.4 });
    ca.needsUpdate = true;
  }
  const tf0 = clock();
  bakeMs.structure = tf0 - ts0;
  {
    // the floor: dark polished stone, its pools baked texel by texel, then the stone's joints
    const g = floorCanvas.getContext('2d'), FW = floorCanvas.width, FH = floorCanvas.height;
    const img = g.createImageData(FW, FH), E = [0, 0, 0];
    const base = [0.0011, 0.0011, 0.0016], alb = [0.2, 0.17, 0.15];
    const enc = (v) => { v = clamp(v, 0, 1); return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); };
    for (let py = 0; py < FH; py++) for (let px = 0; px < FW; px++) {
      const x = -X_OUT + ((px + 0.5) / FW) * 2 * X_OUT, z = Z_FAR + ((py + 0.5) / FH) * (Z_STAGE - Z_FAR);
      directAt(x, FLOOR_Y + 0.01, z, 0, 1, 0, LG, OG, E);
      const o = (py * FW + px) * 4;
      img.data[o] = enc(base[0] + alb[0] * E[0]); img.data[o + 1] = enc(base[1] + alb[1] * E[1]); img.data[o + 2] = enc(base[2] + alb[2] * E[2]); img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const X = (x) => ((x + X_OUT) / (2 * X_OUT)) * FW, Z = (z) => ((z - Z_FAR) / (Z_STAGE - Z_FAR)) * FH;
    g.strokeStyle = 'rgba(40,36,34,0.3)'; g.lineWidth = LOW ? 0.5 : 1;
    for (let x = -X_OUT; x <= X_OUT; x += 1.5) { g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), FH); g.stroke(); }
    for (let z = Z_FAR; z <= Z_STAGE; z += 1.5) { g.beginPath(); g.moveTo(0, Z(z)); g.lineTo(FW, Z(z)); g.stroke(); }
    floorTex.needsUpdate = true;
  }
  bakeMs.floor = clock() - tf0;
  const bakeStats = { ms: bakeMs, lights: LIGHTS.length, occluders: OG.boxes.length, structureVerts: structGeo.attributes.position.count, floorTexels: floorCanvas.width * floorCanvas.height };

  // ── 9. people: silhouettes on the balcony rails + guests in the booths ─────
  const figGeo = (() => {
    const legs = box(-0.15, 0.15, 0, 0.86, -0.08, 0.08);
    const torso = new THREE.CylinderGeometry(0.2, 0.15, 0.66, 6, 1); torso.scale(1, 1, 0.62); torso.translate(0, 1.17, 0);
    const head = new THREE.SphereGeometry(0.105, 6, 4); head.scale(0.92, 1.1, 1); head.translate(0, 1.62, 0);
    const armL = box(-0.29, -0.2, 0.84, 1.44, -0.06, 0.06), armR = box(0.2, 0.29, 0.84, 1.44, -0.06, 0.06);
    const parts = [legs, torso, head, armL, armR];
    const base = [0.0045, 0.004, 0.005];   // linear: near-black silhouettes against the warm glass
    for (const g of parts) paint(g, (x, y, z, nx, ny, nz) => {
      if (nz < -0.35) return [0.07, 0.04, 0.018];              // back: rim from the warm glass behind
      if (ny > 0.55 && y > 1.3) return [0.05, 0.032, 0.018];   // shoulders / crown
      return base;
    });
    return merge(parts, 'figure');
  })();
  const FIG = [];     // { x, y, z, ry, sy }
  const stepK = LOW ? 2.1 : 1.0;     // low quality: about half the people
  for (const r of RAILS) {
    if (r.nocrowd) continue;
    const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1];
    const len = Math.hypot(dx, dz);
    const ry = Math.atan2(r.face[0], r.face[1]);
    let d = 0.4 + rnd() * 0.8;
    while (d < len - 0.3) {
      const px = r.a[0] + (dx * d) / len - r.face[0] * 0.36, pz = r.a[1] + (dz * d) / len - r.face[1] * 0.36;
      const nearMark = r.y === LEVELS[2] && r.face[1] === 1 && Math.abs(px) < 2.2;
      if (!nearMark) FIG.push({ x: px, y: r.y, z: pz, ry: ry + (rnd() - 0.5) * 0.6, sy: 0.93 + rnd() * 0.14 });
      d += (rnd() < 0.3 ? 1.6 + rnd() * 2.6 : 0.5 + rnd() * 0.35) * stepK;   // groups of friends, gaps between
    }
  }
  // seated guests in the floor booths (lowered so they sit on the seat): one or two a sofa
  for (const b of SOFAS) {
    if (rnd() < (LOW ? 0.35 : 0.6)) {
      const fx = Math.sin(b.ry), fz = Math.cos(b.ry);
      const two = !LOW && rnd() < 0.45;
      for (const off of two ? [-0.42 + (rnd() - 0.5) * 0.12, 0.42 + (rnd() - 0.5) * 0.12] : [(rnd() - 0.5) * 1.2]) {
        FIG.push({ x: b.x + fx * 0.3 + fz * off, y: FLOOR_Y - 0.36, z: b.z + fz * 0.3 - fx * off, ry: b.ry + (rnd() - 0.5) * 0.35, sy: 0.92,
          seat: { x: b.x + fx * 0.2 + fz * off, z: b.z + fz * 0.2 - fx * off } });
      }
    }
  }
  const imFig = new THREE.InstancedMesh(figGeo, matPeople, FIG.length);
  imFig.name = 'venueBalconyCrowd';
  const figC = new THREE.Color();
  FIG.forEach((f, i) => {
    q.setFromEuler(e.set(0, f.ry, 0));
    m4.compose(v3.set(f.x, f.y, f.z), q, sc3.set(0.95 + rnd() * 0.1, f.sy, 1));
    imFig.setMatrixAt(i, m4);
    imFig.setColorAt(i, figC.setScalar(0.75 + rnd() * 0.5));
  });
  imFig.instanceMatrix.needsUpdate = true; imFig.computeBoundingSphere(); group.add(imFig);

  // ── 9b. the same people as avatars: the crowd bake, shared with the dance floor ─────
  // The boxes above are the fallback (they show until the baked figures arrive, and stay if the
  // pack cannot be fetched). Standing on the rails: the `far` figure (`tiny` on phones); in the
  // booths: the seated pose, sat on the seat (its thighs at the seat's top, 0.42 m).
  let venueCrowd = null, venueDisposed = false;
  const crowdRnd = mulberry32(seed * 7 + 3);   // its own stream: the venue's layout never depends on when the pack arrives
  if (crowdPack) Promise.resolve(crowdPack).then((pack) => {
    if (venueDisposed || !pack || !pack.geos) return;
    const stand = LOW ? 'tiny' : 'far';
    if (!pack.geos[`body:${stand}`] || !pack.geos['body:seat']) return;   // an older pack: keep the boxes
    const seatY = (pack.header.seat && pack.header.seat.seatY) || 0.5;
    const ALL = FIG.concat(LOUNGE_GUESTS);   // the rails, the booths and the private boxes
    const people = ALL.map((f) => ({ lod: f.seat ? 1 : 0 }));
    const lodCount = [0, 0];
    for (const p of people) p.idx = lodCount[p.lod]++;
    venueCrowd = createAvatarCrowd({ THREE, pack, people, lodCount, rnd: crowdRnd, lods: [stand, 'seat'],
      stageFalloff: 1e4, name: 'venueCrowd', bob: RM ? 0 : 0.03 });
    const vs = venueCrowd.height / 1.68;
    ALL.forEach((f, i) => {
      const p = people[i];
      q.setFromEuler(e.set(0, f.ry, 0));
      const k = (f.seat ? 0.97 : f.sy || 1) * (0.94 + crowdRnd() * 0.1) / vs;
      if (f.seat) m4.compose(v3.set(f.seat.x, (f.seat.top != null ? f.seat.top : FLOOR_Y + 0.42) - seatY * k, f.seat.z), q, sc3.set(k, k, k));
      else m4.compose(v3.set(f.x, f.y, f.z), q, sc3.set(k, k, k));
      venueCrowd.setPerson(p, m4, 0, 0);
    });
    venueCrowd.commit();
    // backlit by the warm lounge glass, a little of the atrium's light on the front
    venueCrowd.setLight(new THREE.Color(0.3, 0.19, 0.1), new THREE.Color(0.035, 0.034, 0.036), new THREE.Color(0.04, 0.026, 0.014));
    group.add(venueCrowd.group);
    group.remove(imFig);
  }).catch(() => { /* the club already reports a missing pack; the boxes stay */ });

  // ── 10. the hall floor (under the stage module's dance floor) ──────────
  {
    const fg = new THREE.PlaneGeometry(2 * X_OUT, Z_STAGE - Z_FAR);
    fg.rotateX(-Math.PI / 2);
    const fm = new THREE.Mesh(own(fg), matFloor);
    fm.name = 'venueFloor';
    fm.position.set(0, FLOOR_Y - 0.012, (Z_STAGE + Z_FAR) / 2);
    fm.matrixAutoUpdate = false; fm.updateMatrix();
    group.add(fm);
  }

  // ── audio + animation ──────────────────────────────────────────────
  const st = { level: 0, kick: 0, drop: 0, high: 0 };
  let envLevel = 0, envKick = 0, envDrop = 0, flickerAcc = 0;
  const tmpC = new THREE.Color();

  function set(state = {}) {
    if (state.reducedMotion !== undefined) {
      RM = !!state.reducedMotion;
      U.uSway.value = RM ? 0 : 1;
    }
    const b = state.bands || {};
    if (Number.isFinite(b.level)) st.level = clamp(b.level, 0, 1);
    if (Number.isFinite(b.high)) st.high = clamp(b.high, 0, 1);
    if (Number.isFinite(state.kick)) st.kick = clamp(state.kick, 0, 1);
    if (Number.isFinite(state.drop)) st.drop = clamp(state.drop, 0, 1);
    arena.set(state);
  }

  // smooth, bounded pseudo-noise for candle flicker (no randomness at runtime)
  const noise = (t, a) => 0.5 * Math.sin(t * 2.3 + a) + 0.3 * Math.sin(t * 3.7 + a * 1.7) + 0.2 * Math.sin(t * 1.3 + a * 2.9);

  function update(dt = 1 / 60, t = 0) {
    dt = clamp(Number.isFinite(dt) ? dt : 1 / 60, 0, 0.25);
    // the venue is the calm gold backdrop: slow level breathing, a gentle kick lift
    envLevel += (st.level - envLevel) * (1 - Math.exp(-dt / 0.6));
    const kTarget = RM ? 0 : st.kick;
    const kTau = kTarget > envKick ? 0.05 : 0.22;
    envKick += (kTarget - envKick) * (1 - Math.exp(-dt / kTau));
    envDrop += (st.drop - envDrop) * (1 - Math.exp(-dt / 1.5));

    matRing.color.copy(RING_BASE).multiplyScalar(0.9 + 0.22 * envLevel + 0.14 * envKick + 0.12 * envDrop);
    matHalo.color.copy(HALO_BASE).multiplyScalar(0.85 + 0.3 * envLevel + 0.18 * envKick + 0.15 * envDrop);
    matRailLed.color.copy(RAIL_BASE).multiplyScalar(0.92 + 0.14 * envLevel + 0.1 * envKick);

    U.uTime.value = t;
    U.uKick.value = envKick * (RM ? 0 : 1);
    if (venueCrowd) venueCrowd.setBeat(envKick * (RM ? 0 : 1), RM ? 0 : t);
    arena.update(dt, t);

    // aviation lights: a slow soft blink (≈ 0.6 Hz), steady in reduced motion
    const blink = RM ? 0.7 : 0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(t * Math.PI * 1.2)), 3);
    matRed.color.setRGB(1, 0.16, 0.11).multiplyScalar(2.2 * blink);

    // candle flicker at ~20 Hz update, amplitude ±9 % (never a flash)
    flickerAcc += dt;
    if (imCandle.instanceColor && flickerAcc >= 0.05) {
      flickerAcc = 0;
      for (let i = 0; i < TABLES.length; i++) {
        const k = RM ? 1 : 1 + 0.09 * noise(t, i * 2.17);
        imCandle.setColorAt(i, tmpC.copy(CANDLE_C).multiplyScalar(k));
      }
      imCandle.instanceColor.needsUpdate = true;
    }
  }

  function dispose() {
    venueDisposed = true;
    if (venueCrowd) { venueCrowd.dispose(); venueCrowd = null; }
    if (group.parent) group.parent.remove(group);
    group.clear();
    for (const im of [imTrunk, imFrond, imBeam, imSofa, imTable, imCandle, imFig]) im.dispose();
    arena.dispose();
    for (const d of disposables) if (d && typeof d.dispose === 'function') d.dispose();
    disposables.length = 0;
  }

  update(0, 0);
  return { group, set, update, dispose, dims: VENUE_DIMS, bakeStats };
}
