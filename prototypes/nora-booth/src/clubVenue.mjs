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
//   skylight      centred (0, 15.5, −18), semi-axes 8 (x) × 13 (z)
//   stage portal  x ±5.5, deck → y ≈ 8.8, z +2.0 … +3.2 (kept clear)
//   floor lounges x ±7 … ±10.5, z −6 … −44 ; dance-floor crowd x ±7, z −1.8 … −34
//
// Rules: no Math.random (seeded mulberry32), no clock (the caller passes t), no DOM at
// import (canvases are made inside createVenue), everything allocated is disposed.
// Lighting is baked: architecture is MeshBasicMaterial with vertex colours, the glow comes
// from emissive colours above the booth's bloom threshold — zero dynamic lights of its own.

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAvatarCrowd } from './crowdAvatars.mjs';

export const VENUE_DIMS = {
  FLOOR_Y: -0.66,
  X_IN: 10.5,
  X_OUT: 14,
  Z_STAGE: 6,
  Z_FAR: -46,
  LEVELS: [3.6, 7.6, 11.6],
  CEIL_Y: 15.5,
  SKYLIGHT: { x: 0, y: 15.5, z: -18, a: 8, b: 13 },
  PORTAL: { x: 5.5, top: 8.8, z0: 2.0, z1: 3.2 },
};

const { FLOOR_Y, X_IN, X_OUT, Z_STAGE, Z_FAR, LEVELS, CEIL_Y, SKYLIGHT } = VENUE_DIMS;
const SLAB_T = 0.45;          // balcony slab thickness
const WIN_X = 12.2;           // lounge glass line on the sides
const FAR_RAIL_Z = -42.5;     // far-end balcony edge
const FAR_WIN_Z = -44.2;      // far-end lounge glass
const END_RAIL_Z = 3.0;       // stage-end balcony edge (behind the portal's back at 3.2… kept off it)
const END_WIN_Z = 5.95;       // stage-end lounge glass
const END_CORNER_X = 6.8;     // stage-end corner tiers start here (portal is ±5.5)
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

export function createVenue({ THREE, renderer = null, seed = 11, quality = 'high', reducedMotion = false, crowdPack = null } = {}) {
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
    gr.addColorStop(0.0, 'rgb(34,20,9)');
    gr.addColorStop(0.07, 'rgb(96,58,22)');
    gr.addColorStop(0.13, 'rgb(214,150,70)');
    gr.addColorStop(0.3, 'rgb(150,88,32)');
    gr.addColorStop(0.7, 'rgb(92,52,18)');
    gr.addColorStop(1.0, 'rgb(40,22,8)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // back-wall slats / shelving glow bands
    for (let x = 0; x < W; x += 6 + Math.floor(rnd() * 10)) {
      g.fillStyle = `rgba(255,${170 + Math.floor(rnd() * 50)},${80 + Math.floor(rnd() * 40)},${0.05 + rnd() * 0.08})`;
      g.fillRect(x, 40, 2 + rnd() * 3, 110);
    }
    for (let k = 0; k < 5; k++) {           // bars / back-lit shelves
      const x = rnd() * W, w = 90 + rnd() * 160, y = 95 + rnd() * 30;
      const bg = g.createLinearGradient(0, y - 12, 0, y + 14);
      bg.addColorStop(0, 'rgba(255,196,110,0)');
      bg.addColorStop(0.5, 'rgba(255,214,140,0.55)');
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

  // Palm frond: rachis along u, leaflets fanning to both sides (white; tinted by vertex colour).
  function leafTexture() {
    const W = 256, H = 64;
    const c = makeCanvas(W, H), g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    g.lineCap = 'round';
    for (let x = 6; x < W - 4; x += 4.8) {
      const t = x / W;
      const len = 30 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02 + 0.06)), 0.55);
      for (const sy of [-1, 1]) {
        const tone = 225 + Math.floor(rnd() * 30);
        g.strokeStyle = `rgb(255,${tone},${Math.floor(tone * 0.72)})`;
        g.lineWidth = 2.6;
        g.beginPath();
        g.moveTo(x, 32);
        g.quadraticCurveTo(x + len * 0.35, 32 + sy * len * 0.6, x + len * 0.72, 32 + sy * len);
        g.stroke();
      }
    }
    g.strokeStyle = 'rgb(255,236,190)'; g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(0, 32); g.lineTo(W, 32); g.stroke();
    return tex(c);
  }

  function barkTexture() {
    const W = 64, H = 128;
    const c = makeCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = 'rgb(186,136,74)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgb(64,40,18)'; g.lineWidth = 2.2;
    for (let y = 0, r = 0; y < H + 10; y += 9, r++) {
      for (let x = (r % 2) * 8 - 8; x < W + 16; x += 16) {
        g.beginPath(); g.moveTo(x - 8, y); g.quadraticCurveTo(x, y + 7, x + 8, y); g.stroke();
      }
    }
    return tex(c, { repeat: true });
  }

  function radialTexture() {
    const S = 64;
    const c = makeCanvas(S, S), g = c.getContext('2d');
    const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    rg.addColorStop(0.6, 'rgba(255,255,255,0.14)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, S, S);
    return tex(c, { srgb: false });
  }

  // Uplight: bright at the foot, fading up, soft across.
  function beamTexture() {
    const W = 32, H = 128;
    const c = makeCanvas(W, H), g = c.getContext('2d');
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = 1 - y / (H - 1);            // canvas top = far end of the beam
      const u = (x + 0.5) / W - 0.5;
      const k = Math.pow(1 - v, 1.8) * Math.exp(-(u * u) / (2 * 0.18 * 0.18 * (0.4 + v)));
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * k); img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return tex(c, { srgb: false });
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

  // Floor: dark polished stone, warm spill from the lounge glass and the booth candles.
  function floorTexture() {
    const W = 256, H = 512;
    const c = makeCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = 'rgb(3,3,5)'; g.fillRect(0, 0, W, H);
    const X = (x) => ((x + 14) / 28) * W;
    const Z = (z) => ((z + 46) / 52) * H;      // canvas top = far wall (z −46)
    for (const s of [-1, 1]) {
      const x0 = X(s * WIN_X), x1 = X(s * 6.5);
      const lg = g.createLinearGradient(x0, 0, x1, 0);
      lg.addColorStop(0, 'rgba(120,72,30,0.55)');
      lg.addColorStop(0.35, 'rgba(70,40,16,0.25)');
      lg.addColorStop(1, 'rgba(40,22,8,0)');
      g.fillStyle = lg;
      g.fillRect(Math.min(x0, x1), Z(-44.2), Math.abs(x1 - x0), Z(5.95) - Z(-44.2));
    }
    // far-wall spill
    const fg = g.createLinearGradient(0, Z(-44.2), 0, Z(-36));
    fg.addColorStop(0, 'rgba(120,72,30,0.5)'); fg.addColorStop(1, 'rgba(60,34,12,0)');
    g.fillStyle = fg; g.fillRect(X(-12.2), Z(-44.2), X(12.2) - X(-12.2), Z(-36) - Z(-44.2));
    // candle pools under the booths
    for (const s of [-1, 1]) for (let z = -9; z > -43; z -= 3) {
      const cx = X(s * 8.8), cz = Z(z), r = 14;
      const rg = g.createRadialGradient(cx, cz, 0, cx, cz, r);
      rg.addColorStop(0, 'rgba(140,86,34,0.5)'); rg.addColorStop(1, 'rgba(140,86,34,0)');
      g.fillStyle = rg; g.fillRect(cx - r, cz - r, 2 * r, 2 * r);
    }
    // stone joints
    g.strokeStyle = 'rgba(40,36,34,0.35)'; g.lineWidth = 1;
    for (let x = -14; x <= 14; x += 1.5) { g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), H); g.stroke(); }
    for (let z = -46; z <= 6; z += 1.5) { g.beginPath(); g.moveTo(0, Z(z)); g.lineTo(W, Z(z)); g.stroke(); }
    return tex(c);
  }

  const loungeTex = loungeTexture({ frames: false, neutral: true });   // the private boxes' back walls (tinted per box)
  const loungeEndTex = loungeTexture({ frames: true });     // the stage-end glass (no room behind it)
  const leafTex = leafTexture();
  const barkTex = barkTexture();
  barkTex.repeat.set(2, 5);
  const radialTex = radialTexture();
  const beamTex = beamTexture();
  const cityTex = cityTexture();
  const floorTex = floorTexture();

  // ── materials ───────────────────────────────────────────────────────
  const matStructure = own(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const matLounge = own(new THREE.MeshBasicMaterial({ map: loungeTex, vertexColors: true }));   // the boxes' back walls: each box's vertex colour is its tint
  const matLoungeEnd = own(new THREE.MeshBasicMaterial({ map: loungeEndTex, vertexColors: true, color: new THREE.Color(1.02, 0.9, 0.78) }));
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
  const matGlass = own(new THREE.MeshBasicMaterial({ color: 0x5d7a8a, transparent: true, opacity: 0.045, depthWrite: false, side: THREE.DoubleSide }));
  const RAIL_BASE = hdr(0xffb46a, 1.5);
  const matRailLed = own(new THREE.MeshBasicMaterial({ color: RAIL_BASE.clone() }));
  const matCeilLed = own(new THREE.MeshBasicMaterial({ color: hdr(0xffd3a0, 1.25) }));
  const RING_BASE = hdr(0xd8ecff, 1.6);
  const matRing = own(new THREE.MeshBasicMaterial({ color: RING_BASE.clone(), vertexColors: true, side: THREE.DoubleSide }));
  const HALO_BASE = new THREE.Color(1, 1, 1);
  const matHalo = own(new THREE.MeshBasicMaterial({ vertexColors: true, color: HALO_BASE.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  const matMark = own(new THREE.MeshBasicMaterial({ color: hdr(0xf4f7ff, 1.35) }));
  const matTower = own(new THREE.MeshBasicMaterial({ map: cityTex, vertexColors: true, fog: false }));
  const matRed = own(new THREE.MeshBasicMaterial({ color: hdr(0xff2a1c, 2.2), fog: false }));
  const matCrown = own(new THREE.MeshBasicMaterial({ color: hdr(0xbfe4ff, 2.0), fog: false }));
  const matTrunk = own(new THREE.MeshBasicMaterial({ map: barkTex, vertexColors: true, color: new THREE.Color(0.72, 0.6, 0.46) }));
  const matFrond = own(new THREE.MeshBasicMaterial({ map: leafTex, vertexColors: true, alphaTest: 0.32, side: THREE.DoubleSide, color: new THREE.Color(0.34, 0.31, 0.15) }));   // deeper and greener than under ACES: Neutral keeps saturation, so the old gold read as neon yellow
  const matBeam = own(new THREE.MeshBasicMaterial({ map: beamTex, color: new THREE.Color(0.5, 0.3, 0.11), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const matGlow = own(new THREE.MeshBasicMaterial({ map: radialTex, color: new THREE.Color(0.9, 0.52, 0.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
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
    sh.uniforms.uTime = U.uTime; sh.uniforms.uSway = U.uSway;
    sh.vertexShader = 'uniform float uTime;\nuniform float uSway;\nattribute float aFlex;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
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
  matFrond.customProgramCacheKey = () => 'clubVenue-frond';

  // ── colour palette (baked light) ────────────────────────────────────
  const C_DARK = [0.01, 0.012, 0.017];
  const C_WALL = [0.008, 0.01, 0.015];
  const C_EDGE = [0.02, 0.018, 0.018];
  const C_WALKWAY = [0.07, 0.046, 0.026];
  const C_SOFFIT_RAIL = [0.03, 0.022, 0.016];
  const C_SOFFIT_WALL = [0.13, 0.075, 0.034];
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
      S.push(paint(box(s * X_IN, s * X_OUT, L - SLAB_T, L, Z_FAR, Z_STAGE), slabPaint((x) => Math.abs(x) - X_IN, X_OUT - X_IN)));
    }
    // far-end wrap
    S.push(paint(box(-X_IN, X_IN, L - SLAB_T, L, Z_FAR, FAR_RAIL_Z), slabPaint((x, y, z) => FAR_RAIL_Z - z, FAR_RAIL_Z - Z_FAR)));
  }
  // stage end: the corner tiers beside the portal (L1, L2) and a full bridge at L3
  for (const L of [LEVELS[0], LEVELS[1]]) for (const s of [-1, 1]) {
    S.push(paint(box(s * END_CORNER_X, s * X_IN, L - SLAB_T, L, END_RAIL_Z, Z_STAGE), slabPaint((x, y, z) => z - END_RAIL_Z, Z_STAGE - END_RAIL_Z)));
  }
  S.push(paint(box(-X_IN, X_IN, LEVELS[2] - SLAB_T, LEVELS[2], END_RAIL_Z, Z_STAGE), slabPaint((x, y, z) => z - END_RAIL_Z, Z_STAGE - END_RAIL_Z)));
  // lintel over the portal zone between the openings band and the L2 corner slabs
  S.push(solid(box(-END_CORNER_X, END_CORNER_X, VENUE_DIMS.PORTAL.top, 9.0, END_WIN_Z - 0.05, Z_STAGE), C_EDGE));

  // end walls (dark, behind the glass), ceiling
  S.push(solid(box(-X_OUT, X_OUT, FLOOR_Y, CEIL_Y, Z_STAGE, Z_STAGE + 0.3), C_WALL));
  S.push(solid(box(-X_OUT, X_OUT, FLOOR_Y, CEIL_Y, Z_FAR - 0.3, Z_FAR), C_WALL));
  for (const s of [-1, 1]) S.push(solid(box(s * X_OUT, s * (X_OUT + 0.3), FLOOR_Y, CEIL_Y + 2.2, Z_FAR, Z_STAGE), C_WALL));

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
    const shape = new THREE.Shape();
    shape.moveTo(-X_OUT, Z_FAR); shape.lineTo(X_OUT, Z_FAR); shape.lineTo(X_OUT, Z_STAGE); shape.lineTo(-X_OUT, Z_STAGE); shape.closePath();
    const hole = new THREE.Path();
    const hp = loop(A0 + 0.02, B0 + 0.02, 0).map((p) => new THREE.Vector2(p[0], p[2]));
    hole.setFromPoints(hp.reverse());
    shape.holes.push(hole);
    const ceil = new THREE.ShapeGeometry(shape, 1);
    ceil.rotateX(Math.PI / 2);
    ceil.translate(0, CEIL_Y, 0);
    S.push(solid(ceil, C_CEIL));
  }
  // the dropped oval frame: underside annulus, inner rim (up into the sky), outer lip
  const cFrameIn = [0.06, 0.078, 0.1], cFrameOut = [0.022, 0.027, 0.036];
  S.push(loopStrip(loop(A0, B0, FRAME_Y), loop(A1, B1, FRAME_Y), cFrameIn, cFrameOut));
  S.push(loopStrip(loop(A0, B0, FRAME_Y), loop(A0, B0, RIM_TOP), [0.1, 0.125, 0.16], [0.03, 0.04, 0.055]));
  S.push(loopStrip(loop(A1, B1, FRAME_Y), loop(A1, B1, CEIL_Y + 0.01), cFrameOut, C_CEIL));

  // structural columns in the lounge glass line
  const colPaint = (inward) => (x, y, z, nx, ny, nz) => ((nx * inward[0] + nz * inward[1]) > 0.5 ? [0.034, 0.025, 0.018] : C_COLUMN);
  TIERS.forEach((T) => {
    for (const s of [-1, 1]) {
      for (let k = 0; k <= 8; k++) {
        const z = lerp(FAR_WIN_Z, END_WIN_Z, k / 8);
        S.push(paint(box(s * (WIN_X - 0.25), s * (WIN_X + 0.25), T.y0, T.y1, z - 0.25, z + 0.25), colPaint([-s, 0])));
      }
    }
    for (let k = 1; k < 4; k++) {
      const x = lerp(-WIN_X, WIN_X, k / 4);
      S.push(paint(box(x - 0.25, x + 0.25, T.y0, T.y1, FAR_WIN_Z - 0.25, FAR_WIN_Z + 0.25), colPaint([0, 1])));
    }
  });
  for (const s of [-1, 1]) for (const T of TIERS.slice(0, 3)) {
    S.push(paint(box(s * END_CORNER_X - 0.25, s * END_CORNER_X + 0.25, T.y0, Math.min(T.y1, T === TIERS[2] ? 9.0 : T.y1), END_WIN_Z - 0.25, Z_STAGE), colPaint([0, -1])));
  }
  for (const x of [-6.1, 0, 6.1]) S.push(paint(box(x - 0.25, x + 0.25, TIERS[3].y0, TIERS[3].y1, END_WIN_Z - 0.25, Z_STAGE), colPaint([0, -1])));
  // far-wall entrance frame (ground level, centre)
  S.push(solid(box(-2.9, 2.9, 2.35, 2.75, FAR_WIN_Z, FAR_WIN_Z + 0.35), C_EDGE));
  for (const s of [-1, 1]) S.push(solid(box(s * 2.9 - 0.2, s * 2.9 + 0.2, FLOOR_Y, 2.75, FAR_WIN_Z, FAR_WIN_Z + 0.35), C_EDGE));
  // plaque behind the Shape mark (far wall, top tier)
  S.push(solid(box(-1.9, 1.9, 12.25, 14.95, FAR_WIN_Z + 0.02, FAR_WIN_Z + 0.12), [0.014, 0.016, 0.022]));

  // Balcony railings (a run from a to b at level y, facing = unit vector toward the atrium).
  const RAILS = [];
  for (const L of LEVELS) {
    for (const s of [-1, 1]) RAILS.push({ a: [s * X_IN, FAR_RAIL_Z], b: [s * X_IN, END_RAIL_Z], y: L, face: [-s, 0] });
    RAILS.push({ a: [-X_IN, FAR_RAIL_Z], b: [X_IN, FAR_RAIL_Z], y: L, face: [0, 1] });
  }
  for (const L of [LEVELS[0], LEVELS[1]]) for (const s of [-1, 1]) {
    RAILS.push({ a: [s * X_IN, END_RAIL_Z], b: [s * END_CORNER_X, END_RAIL_Z], y: L, face: [0, -1] });
    RAILS.push({ a: [s * END_CORNER_X, END_RAIL_Z], b: [s * END_CORNER_X, Z_STAGE], y: L, face: [-s, 0], nocrowd: true });
  }
  RAILS.push({ a: [-X_IN, END_RAIL_Z], b: [X_IN, END_RAIL_Z], y: LEVELS[2], face: [0, -1] });

  const G = [];      // rail glass
  const RL = [];     // rail LEDs (handrails, slab-edge underlines, lounge-edge floor strip)
  for (const r of RAILS) {
    const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1];
    const len = Math.hypot(dx, dz);
    const u = [dx / len, 0, dz / len];
    G.push(quad([r.a[0], r.y, r.a[1]], u, [0, 1, 0], len, RAIL_H));
    // handrail LED + slab-edge underline (thin boxes along the run)
    const hw = 0.035;
    const x0 = Math.min(r.a[0], r.b[0]) - (dx === 0 ? hw : 0), x1 = Math.max(r.a[0], r.b[0]) + (dx === 0 ? hw : 0);
    const z0 = Math.min(r.a[1], r.b[1]) - (dz === 0 ? hw : 0), z1 = Math.max(r.a[1], r.b[1]) + (dz === 0 ? hw : 0);
    RL.push(solid(box(x0, x1, r.y + RAIL_H - 0.02, r.y + RAIL_H + 0.035, z0, z1), [1, 1, 1]));
    RL.push(solid(box(x0, x1, r.y - SLAB_T - 0.01, r.y - SLAB_T + 0.035, z0, z1), [0.55, 0.55, 0.55]));
    // posts every ~2 m
    const n = Math.max(1, Math.round(len / 2));
    for (let i = 0; i <= n; i++) {
      const px = r.a[0] + (dx * i) / n, pz = r.a[1] + (dz * i) / n;
      S.push(solid(box(px - 0.025, px + 0.025, r.y, r.y + RAIL_H - 0.02, pz - 0.025, pz + 0.025), C_POST));
    }
  }
  // floor-level lounge edge strip (the line of warm light at the foot of the booth backs)
  for (const s of [-1, 1]) RL.push(solid(box(s * 6.9 - 0.03, s * 6.9 + 0.03, FLOOR_Y + 0.005, FLOOR_Y + 0.04, -43.6, -6.4), [0.7, 0.7, 0.7]));

  mesh(merge(S, 'structure'), matStructure, 'venueStructure');
  mesh(merge(G, 'glass'), matGlass, 'venueRailGlass', 2);
  const railLedMesh = mesh(merge(RL, 'railLeds'), matRailLed, 'venueRailLeds');
  void railLedMesh;

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
    if (ti < 3) {
      endRun(-WIN_X, -END_CORNER_X, T.y0, T.y1, 0);
      endRun(END_CORNER_X, WIN_X, T.y0, T.y1, 0);
      if (ti === 2) endRun(-END_CORNER_X, END_CORNER_X, 9.0, T.y1, (9.0 - T.y0) / h);
    } else {
      endRun(-WIN_X, WIN_X, T.y0, T.y1, 0);
    }
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
  const BOX_TINTS = [
    [1.0, 0.62, 0.3], [1.0, 0.8, 0.52], [1.0, 0.52, 0.32], [0.95, 0.5, 0.52], [0.9, 0.3, 0.26],   // amber · champagne · copper · rose · crimson
    [0.42, 0.85, 0.55], [0.32, 0.8, 0.85], [0.45, 0.55, 1.0], [0.72, 0.5, 1.0], [0.92, 0.9, 0.86], // emerald · teal · midnight · violet · marble
  ];
  const UPHOLSTERY = [
    [0.22, 0.03, 0.035], [0.03, 0.14, 0.07], [0.42, 0.36, 0.27], [0.03, 0.05, 0.14], [0.03, 0.026, 0.024],
    [0.3, 0.17, 0.08], [0.36, 0.24, 0.04], [0.4, 0.2, 0.2], [0.03, 0.16, 0.16], [0.2, 0.19, 0.18],
  ];
  const WOODS = [[0.06, 0.035, 0.02], [0.4, 0.39, 0.37], [0.34, 0.23, 0.08], [0.015, 0.014, 0.014]];   // walnut · marble · brass · black
  const ACCENTS = [[2.4, 1.6, 0.8], [2.2, 1.9, 1.5], [2.3, 0.9, 1.3], [0.7, 2.0, 2.1], [1.4, 1.0, 2.4], [2.4, 1.3, 0.5]];
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
    B.bright = (B.empty ? 0.6 : 1.08) + brnd() * 0.36;   // an empty box is dimmed, not dark: it is still a room
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
    // the room: back wall (painted interior, tinted), carpet, partitions, the accent line
    {
      const off = brnd();
      const q = quad([-hw, 0, 0.01], [1, 0, 0], [0, 1, 0], w, h, [off, 0, off + w / TEX_M, 1], L);
      W.push(q.applyMatrix4(bm));
    }
    piece(-hw, hw, 0, 0.012, 0, d, [B.uph[0] * 0.5 + 0.02, B.uph[1] * 0.5 + 0.018, B.uph[2] * 0.5 + 0.016], -0.2);
    const wall = [0.05, 0.036, 0.026];
    piece(-hw, -hw + 0.08, 0, h, 0, d, wall);
    if (B.closeRight) piece(hw - 0.08, hw, 0, h, 0, d, wall);   // each run's last box closes its own end (the others share a neighbour's wall)
    GLOW.push(solid(box(-hw + 0.1, hw - 0.1, h - 0.2, h - 0.16, 0.02, 0.06), B.accent.map((c) => c * (B.empty ? 0.25 : 1))).applyMatrix4(bm));
    const lamp = B.empty ? [0.5, 0.3, 0.12] : [2.6, 1.6, 0.7];
    switch (B.layout) {
      case 'banquette': {
        piece(-hw + 0.15, hw - 0.15, 0, 0.44, 0.04, 0.56, B.uph); piece(-hw + 0.15, hw - 0.15, 0.44, 0.95, 0.02, 0.18, B.uph, 0.1);
        const n = Math.max(1, Math.round((w - 0.4) / 1.5));
        for (let i = 0; i < n; i++) {
          const u = -hw + 0.2 + (w - 0.4) * (i + 0.5) / n;
          piece(u - 0.28, u + 0.28, 0.68, 0.72, 0.72, 1.18, B.wood); cyl(u, 0.95, 0.04, 0, 0.68, B.wood, 6);
          glowAt(u, 0.8, 0.95, 0.045, lamp);
          guest(u - 0.34, 0.24, 0, 0.44); if (brnd() < 0.7) guest(u + 0.34, 0.24, 0, 0.44);
        }
        break;
      }
      case 'sofas': {
        piece(-hw + 0.15, -hw + 0.7, 0, 0.42, 0.2, 1.45, B.uph); piece(-hw + 0.12, -hw + 0.3, 0.42, 0.9, 0.2, 1.45, B.uph, 0.1);
        piece(hw - 0.7, hw - 0.15, 0, 0.42, 0.2, 1.45, B.uph); piece(hw - 0.3, hw - 0.12, 0.42, 0.9, 0.2, 1.45, B.uph, 0.1);
        piece(-0.45, 0.45, 0.34, 0.38, 0.45, 1.15, B.wood); cyl(0, 0.8, 0.12, 0, 0.34, B.wood, 8);
        glowAt(0, 0.44, 0.8, 0.04, lamp);
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
          glowAt(u, 0.82, 0.9, 0.03, lamp);
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
          if (i < n - 1) { const t = u + w / n / 2; cyl(t, 1.1, 0.15, 0.5, 0.53, B.wood, 10); cyl(t, 1.1, 0.03, 0, 0.5, B.wood, 6); glowAt(t, 0.6, 1.1, 0.035, lamp); }
        }
        break;
      }
      default: {   // daybed + poufs
        piece(-hw + 0.25, hw - 0.25, 0, 0.36, 0.04, 0.95, B.uph); piece(-hw + 0.25, hw - 0.25, 0.36, 0.72, 0.02, 0.2, B.uph, 0.1);
        for (let i = 0; i < 4; i++) piece(-hw + 0.4 + i * (w - 0.8) / 4, -hw + 0.4 + (i + 0.8) * (w - 0.8) / 4, 0.36, 0.52, 0.18, 0.3, B.wood, 0.3);
        cyl(-0.5, 1.35, 0.22, 0, 0.38, B.uph, 12); cyl(0.5, 1.35, 0.22, 0, 0.38, B.uph, 12);
        glowAt(0, 0.6, 0.12, 0.05, lamp);
        guest(-0.55, 0.36, 0, 0.36); guest(0.45, 0.36, 0, 0.36); if (brnd() < 0.5) guest(0.5, 1.35, Math.PI, 0.38);
      }
    }
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
  const ceilLine = (x, z0, z1) => { if (z1 - z0 > 0.2) CL.push(solid(box(x - 0.045, x + 0.045, CEIL_Y - 0.035, CEIL_Y - 0.005, z0, z1), [1, 1, 1])); };
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
        CL.push(solid(box(x - 0.04, x + 0.04, y - 0.03, y, FAR_RAIL_Z - d - 0.04, END_RAIL_Z + d + 0.04), [0.8, 0.8, 0.8]));
      }
      const zf = FAR_RAIL_Z - d;
      CL.push(solid(box(-X_IN - d, X_IN + d, y - 0.03, y, zf - 0.04, zf + 0.04), [0.8, 0.8, 0.8]));
      const ze = END_RAIL_Z + d;
      if (L === LEVELS[2]) CL.push(solid(box(-X_IN - d, X_IN + d, y - 0.03, y, ze - 0.04, ze + 0.04), [0.8, 0.8, 0.8]));
      else for (const s of [-1, 1]) CL.push(solid(box(Math.min(s * END_CORNER_X, s * (X_IN + d)), Math.max(s * END_CORNER_X, s * (X_IN + d)), y - 0.03, y, ze - 0.04, ze + 0.04), [0.8, 0.8, 0.8]));
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
    superTube(A0 + 0.06, B0 + 0.06, FRAME_Y - 0.06, 0.1, [1.0, 1.0, 1.0], RAD),
    superTube(A0 + 0.5, B0 + 0.5, FRAME_Y - 0.04, 0.055, [0.72, 0.86, 1.0], RAD),
    superTube(A1 - 0.08, B1 - 0.08, FRAME_Y - 0.03, 0.045, [0.5, 0.64, 0.8], RAD),
  ], 'ring'), matRing, 'venueSkylightRing');
  void ringMesh;
  {
    // additive halo: bright at the ring, fading onto the frame and the ceiling
    const inA = loop(A0 - 0.35, B0 - 0.35, FRAME_Y - 0.08);
    const midA = loop(A0 + 0.3, B0 + 0.3, FRAME_Y - 0.08);
    const outA = loop(A1 + 2.6, B1 + 2.6, FRAME_Y - 0.08);
    const cMid = [0.045, 0.06, 0.085];
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
    const NT = LOW ? 26 : 46;
    const towers = [];
    const place = (x, z, w, d, h) => {
      for (const t of towers) if (Math.abs(t.x - x) < (t.w + w) / 2 + 2 && Math.abs(t.z - z) < (t.d + d) / 2 + 2) return false;
      towers.push({ x, z, w, d, h });
      return true;
    };
    // landmark: the tall spire tower behind the stage end, where the skylight looks
    place(-6, 30, 12, 12, 64);
    place(14, 26, 11, 9, 52);
    place(-24, 22, 10, 12, 47);
    for (let tries = 0; tries < 900 && towers.length < NT; tries++) {
      // half the city in the sector the establishing shot looks through (+Z), half all round
      const ang = tries % 2 === 0 ? (rnd() - 0.5) * 2.2 : rnd() * Math.PI * 2;
      const r = 34 + rnd() * 14;
      const x = Math.sin(ang) * r, z = sk.z + Math.cos(ang) * r;
      if (Math.abs(x) < 20 && z > Z_FAR - 6 && z < Z_STAGE + 8) continue;
      const w = 6 + rnd() * 8, d = 6 + rnd() * 8;
      const h = 30 + Math.pow(rnd(), 1.3) * 42;
      place(x, z, w, d, h);
    }
    const TW = 25.6, TH = 83.2;   // one texture tile: 32 columns × 64 floors
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
      const bright = 0.5 + rnd() * 0.45;
      const tint = rnd() < 0.25 ? [0.78, 0.88, 1.05] : [1, 1, 1];
      const setback = rnd() < 0.45 && t.h > 36;
      const h0 = setback ? t.h * (0.62 + rnd() * 0.15) : t.h;
      addBox(t.x, t.z, t.w, t.d, -1, h0, bright, tint);
      let top = h0, tw = t.w, td = t.d;
      if (setback) { tw = t.w * 0.68; td = t.d * 0.68; addBox(t.x, t.z, tw, td, h0, t.h, bright * 1.05, tint); top = t.h; }
      if (i === 0 || (t.x === -6 && t.z === 30)) {
        // the spire
        const cone = new THREE.ConeGeometry(Math.min(tw, td) * 0.32, 22, 6);
        cone.translate(t.x, top + 11, t.z);
        const cc = new Float32Array(cone.attributes.position.count * 3).fill(0.03);
        cone.setAttribute('color', new THREE.BufferAttribute(cc, 3));
        T.push(cone);
        CROWNS.push(box(t.x - 0.12, t.x + 0.12, top, top + 20.5, t.z - Math.min(tw, td) * 0.33 - 0.05, t.z - Math.min(tw, td) * 0.33 + 0.1));
        REDS.push(box(t.x - 0.45, t.x + 0.45, top + 21.6, top + 22.5, t.z - 0.45, t.z + 0.45));
      }
      if (i < 7) {
        // red aviation lights on the tallest roofs
        REDS.push(box(t.x - tw / 2 + 0.2, t.x - tw / 2 + 1.0, top, top + 0.8, t.z - td / 2 + 0.2, t.z - td / 2 + 1.0));
        REDS.push(box(t.x + tw / 2 - 1.0, t.x + tw / 2 - 0.2, top, top + 0.8, t.z + td / 2 - 1.0, t.z + td / 2 - 0.2));
      }
      if (i % 5 === 1) {
        // ice-blue crown ribbon (the venue's light-ribbon language on the skyline)
        const y = top - 0.9, e = 0.12;
        CROWNS.push(box(t.x - tw / 2 - e, t.x + tw / 2 + e, y, y + 0.35, t.z - td / 2 - e, t.z - td / 2 + e));
        CROWNS.push(box(t.x - tw / 2 - e, t.x + tw / 2 + e, y, y + 0.35, t.z + td / 2 - e, t.z + td / 2 + e));
        CROWNS.push(box(t.x - tw / 2 - e, t.x - tw / 2 + e, y, y + 0.35, t.z - td / 2 - e, t.z + td / 2 + e));
        CROWNS.push(box(t.x + tw / 2 - e, t.x + tw / 2 + e, y, y + 0.35, t.z - td / 2 - e, t.z + td / 2 + e));
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

  // ── 7. palms (instanced: trunk+planter, fronds, uplight beams) ─────────────
  // Template: planter at y 0…0.45, trunk to ≈3.4, crown at CROWN; scaled per instance.
  const CROWN = [0.22, 3.42, 0];
  const trunkGeo = (() => {
    const planter = new THREE.CylinderGeometry(0.42, 0.34, 0.45, 10, 1);
    planter.translate(0, 0.225, 0);
    paint(planter, (x, y) => (y > 0.44 ? [0.32, 0.2, 0.09] : [0.05, 0.044, 0.04]));
    const trunk = new THREE.CylinderGeometry(0.11, 0.19, 3.0, 7, 8, true);
    trunk.translate(0, 1.9, 0);
    const p = trunk.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = (p.getY(i) - 0.4) / 3; p.setX(i, p.getX(i) + 0.22 * t * t); }
    trunk.computeVertexNormals();
    paint(trunk, (x, y) => mix3([1.0, 0.74, 0.38], [0.6, 0.4, 0.19], clamp((y - 0.4) / 3, 0, 1)));
    const bulb = new THREE.SphereGeometry(0.2, 7, 5);
    bulb.scale(1, 1.3, 1); bulb.translate(CROWN[0], CROWN[1], CROWN[2]);
    solid(bulb, [0.46, 0.32, 0.14]);
    return merge([planter, trunk, bulb], 'trunk');
  })();
  const frondGeo = (() => {
    const P = [], UVs = [], Cs = [], F = [], I = [];
    const NF = LOW ? 11 : 14, SS = LOW ? 4 : 6;
    for (let f = 0; f < NF; f++) {
      const az = (f / NF) * Math.PI * 2 + (rnd() - 0.5) * 0.45;
      const young = f % 5 === 0;
      const a0 = young ? 0.95 + rnd() * 0.35 : 0.12 + rnd() * 0.62;
      const Lf = (young ? 1.15 : 1.6) + rnd() * 0.45;
      const droop = young ? 0.45 : 1.3 + rnd() * 0.9;
      const Wd = (young ? 0.5 : 0.8) * (0.85 + rnd() * 0.3);
      const dir = [Math.sin(az), Math.cos(az)], side = [Math.cos(az), -Math.sin(az)];
      let hx = 0, hy = 0;
      const base = P.length / 3;
      for (let i = 0; i <= SS; i++) {
        const s = i / SS;
        if (i > 0) { const ang = a0 - droop * Math.pow((i - 0.5) / SS, 1.4); hx += (Math.cos(ang) * Lf) / SS; hy += (Math.sin(ang) * Lf) / SS; }
        const hw = 0.5 * Wd * Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + s * 0.95)), 0.6);
        const cx = CROWN[0] + dir[0] * hx, cz = CROWN[2] + dir[1] * hx;
        for (let j = -1; j <= 1; j++) {
          const lat = j * hw;
          P.push(cx + side[0] * lat, CROWN[1] + hy - Math.abs(j) * 0.35 * hw, cz + side[1] * lat);
          UVs.push(s, (j + 1) / 2);
          const b = (1.0 - 0.82 * Math.pow(s, 0.7)) * (j === 0 ? 1 : 0.75);
          Cs.push(b, b * 0.94, b * 0.82);
          F.push(s);
        }
        if (i > 0) {
          const r0 = base + (i - 1) * 3, r1 = base + i * 3;
          for (let j = 0; j < 2; j++) I.push(r0 + j, r1 + j, r1 + j + 1, r0 + j, r1 + j + 1, r0 + j + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UVs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(Cs, 3));
    g.setAttribute('aFlex', new THREE.Float32BufferAttribute(F, 1));
    g.setIndex(I);
    g.computeVertexNormals();
    return own(g);
  })();
  const beamGeo = (() => {
    const a = quad([-0.7, 0.4, 0], [1, 0, 0], [0, 1, 0], 1.4, 3.4, [0, 0, 1, 1]);
    const b = quad([0, 0.4, -0.7], [0, 0, 1], [0, 1, 0], 1.4, 3.4, [0, 0, 1, 1]);
    return merge([a, b], 'beam');
  })();

  const PALMS = [];   // { x, y, z, s }
  // floor: between the booth bays
  const floorPalmZ = LOW ? [-13.5, -25.5, -37.5] : [-10.5, -16.5, -22.5, -28.5, -34.5, -40.5];
  for (const s of [-1, 1]) for (const z of floorPalmZ) PALMS.push({ x: s * 8.8, y: FLOOR_Y, z, s: 1.62 + rnd() * 0.22 });
  // balconies
  const balZ = LOW ? [-36, -22, -8] : [-38, -30.5, -23, -15.5, -8, -0.5];
  for (const L of LEVELS) for (const s of [-1, 1]) for (const z of balZ) {
    const top = L === LEVELS[2] ? CEIL_Y : L + 4 - SLAB_T;
    const room = top - L;
    PALMS.push({ x: s * 11.45, y: L, z: z + (rnd() - 0.5) * 1.2, s: Math.min(0.84, (room - 0.55) / 4.2) * (0.92 + rnd() * 0.08) });
  }
  for (const L of LEVELS) for (const s of LOW ? [1] : [-1, 1]) PALMS.push({ x: s * 7.6, y: L, z: -43.45, s: 0.8 });
  for (const s of [-1, 1]) PALMS.push({ x: s * 8.4, y: LEVELS[2], z: 4.5, s: 0.8 });
  if (!LOW) for (const L of [LEVELS[0], LEVELS[1]]) for (const s of [-1, 1]) PALMS.push({ x: s * 9.4, y: L, z: 4.55, s: 0.78 });

  const NP = PALMS.length;
  const imTrunk = new THREE.InstancedMesh(trunkGeo, matTrunk, NP);
  const imFrond = new THREE.InstancedMesh(frondGeo, matFrond, NP);
  const imBeam = new THREE.InstancedMesh(beamGeo, matBeam, NP);
  imTrunk.name = 'venuePalmTrunks'; imFrond.name = 'venuePalmFronds'; imBeam.name = 'venuePalmUplights';
  imBeam.renderOrder = 4;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), sc3 = new THREE.Vector3();
  const GLOWS = [];   // flat glow pools: { x, y, z, r }
  PALMS.forEach((p, i) => {
    e.set((rnd() - 0.5) * 0.08, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.08);
    q.setFromEuler(e);
    m4.compose(v3.set(p.x, p.y, p.z), q, sc3.set(p.s, p.s, p.s));
    imTrunk.setMatrixAt(i, m4); imFrond.setMatrixAt(i, m4);
    e.set(0, e.y, 0); q.setFromEuler(e);
    m4.compose(v3.set(p.x, p.y, p.z), q, sc3.set(p.s, p.s, p.s));
    imBeam.setMatrixAt(i, m4);
    GLOWS.push({ x: p.x, y: p.y + 0.02, z: p.z, r: 1.15 * p.s, k: 0.8 });
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
    const cream = [0.43, 0.355, 0.265];
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
    solid(base, [0.03, 0.025, 0.02]); solid(ped, [0.06, 0.045, 0.03]);
    paint(top, (x, y, z, nx, ny) => (ny > 0.5 ? [0.16, 0.11, 0.07] : [0.4, 0.28, 0.12]));
    return merge([base, ped, top], 'table');
  })();
  const candleGeo = own(new THREE.CylinderGeometry(0.035, 0.04, 0.12, 8, 1));
  const haloGeo = (() => {
    const a = quad([-0.24, -0.24, 0], [1, 0, 0], [0, 1, 0], 0.48, 0.48);
    const b = quad([0, -0.24, -0.24], [0, 0, 1], [0, 1, 0], 0.48, 0.48);
    return merge([a, b], 'candleHalo');
  })();

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
    const BOOTH = [[1, 1, 1], [0.62, 0.1, 0.12], [0.12, 0.46, 0.26], [0.13, 0.2, 0.52], [0.95, 0.58, 0.24], [1.0, 0.8, 0.16], [1.0, 0.62, 0.6], [0.1, 0.52, 0.56], [0.13, 0.12, 0.13], [0.6, 0.6, 0.64]];
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
  const imHalo = new THREE.InstancedMesh(haloGeo, matGlow, TABLES.length);
  imHalo.name = 'venueCandleHalos'; imHalo.renderOrder = 5;
  const CANDLE_C = new THREE.Color(2.8, 1.7, 0.72);
  TABLES.forEach((tb, i) => {
    q.set(0, 0, 0, 1);
    m4.compose(v3.set(tb.x, FLOOR_Y, tb.z), q, sc3.set(1, 1, 1)); imTable.setMatrixAt(i, m4);
    m4.compose(v3.set(tb.x, FLOOR_Y + 0.635, tb.z), q, sc3.set(1, 1, 1)); imCandle.setMatrixAt(i, m4);
    m4.compose(v3.set(tb.x, FLOOR_Y + 0.66, tb.z), q, sc3.set(1, 1, 1)); imHalo.setMatrixAt(i, m4);
    imCandle.setColorAt(i, CANDLE_C);
    GLOWS.push({ x: tb.x, y: FLOOR_Y + 0.576, z: tb.z, r: 0.62, k: 1 });
  });
  for (const im of [imSofa, imTable, imCandle, imHalo]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); group.add(im); }
  if (imCandle.instanceColor) imCandle.instanceColor.setUsage(THREE.DynamicDrawUsage);

  // flat glow pools (candles on tables, uplights at palm planters)
  const discGeo = (() => { const g = new THREE.PlaneGeometry(2, 2); g.rotateX(-Math.PI / 2); return own(g); })();
  const imDisc = new THREE.InstancedMesh(discGeo, matGlow, GLOWS.length);
  imDisc.name = 'venueGlowPools'; imDisc.renderOrder = 5;
  const discC = new THREE.Color();
  GLOWS.forEach((gl, i) => {
    q.set(0, 0, 0, 1); m4.compose(v3.set(gl.x, gl.y, gl.z), q, sc3.set(gl.r, 1, gl.r)); imDisc.setMatrixAt(i, m4);
    imDisc.setColorAt(i, discC.setScalar(gl.k));
  });
  imDisc.instanceMatrix.needsUpdate = true; imDisc.computeBoundingSphere(); group.add(imDisc);

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
    venueCrowd.setLight(new THREE.Color(0.55, 0.32, 0.14), new THREE.Color(0.05, 0.045, 0.042), new THREE.Color(0.05, 0.03, 0.014));
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
    for (const im of [imTrunk, imFrond, imBeam, imSofa, imTable, imCandle, imHalo, imDisc, imFig]) im.dispose();
    for (const d of disposables) if (d && typeof d.dispose === 'function') d.dispose();
    disposables.length = 0;
  }

  update(0, 0);
  return { group, set, update, dispose, dims: VENUE_DIMS };
}
