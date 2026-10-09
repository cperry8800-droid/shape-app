// cdj3000.mjs — an UNBRANDED flagship club media player for Nora's booth.
//
// The industrial design of a current-generation 9-inch-screen club player
// (329 × 453 × 118.5 mm): a black chassis under a dark-gunmetal top plate, a
// raised rear deck tilted toward the DJ that carries the touch screen, a
// browse column either side of it, a row of eight rubber hot-cue pads under
// the screen, a 206 mm jog platter with a round display in its hub, loop /
// call / search buttons down the left, the big CUE and PLAY buttons in the
// bottom-left corner, and the long tempo fader down the right.
//
// ⚠ BRAND RULE (CONTRACT.md): no maker name, no model name, no logo anywhere —
// on the plate, the caps or either screen. Every label here is a generic
// function word ("LOOP", "TEMPO", "HOT CUE"); the only mark is a small
// engraved "SHAPE" on the front strip.
//
// FRAME (CONTRACT.md "Gear LOCAL frame"): origin at the bottom-centre of the
// unit, +Y up, the player-facing FRONT at +Z, the back (cables) at −Z, +X the
// player's right. Metres, real dimensions. The booth places it with
//   deck.group.position.set(x, 0.92, 0.20 - CDJ_DIMS.d / 2)
// and no rotation.
//
// DRAW CALLS: everything static is merged by material, so a deck is ~13 draw
// calls whatever its button count:
//   body · plate · plate print · gloss black · caps/LEDs · static metal ·
//   screen · jog display · platter rim · platter top · tempo cap
// Every button, pad, knob, indicator line, ring light and tiny LED shares ONE
// mesh (`caps`). Its material reads a per-vertex `ledColor` attribute for its
// emissive term, and each light owns a vertex range — so lighting a pad is a
// write into a Float32Array, never a new material or a new draw call.
//
// PURE-ish: three is INJECTED (the caller owns the instance); the only static
// imports are two three addons that ship beside it. No DOM at import time, no
// Math.random, no Date.now — the caller passes `t` into update().

import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const CDJ_DIMS = { w: 0.329, d: 0.453, h: 0.1185 };

// ── Layout constants (metres, local frame) ──────────────────────────────────
const W = CDJ_DIMS.w, D = CDJ_DIMS.d, H = CDJ_DIMS.h;
const XL = -W / 2, ZB = -D / 2, ZF = D / 2;
const Y_BODY = 0.082;                 // top of the black chassis under the flat plate
const PLATE_T = 0.004;
const Y_TOP = Y_BODY + PLATE_T;       // 0.086 — the flat top-plate surface
const Z_STEP = -0.072;                // where the raised, tilted screen deck begins
const Y_HOOD_F = 0.092;               // screen-deck surface height at its front edge
const HOOD_RISE = H - Y_HOOD_F;       // 26.5 mm over the run → ~9.7° toward the DJ
const HOOD_RUN = Z_STEP - ZB;
const TILT = Math.atan2(HOOD_RISE, HOOD_RUN);
const S_LEN = Math.hypot(HOOD_RISE, HOOD_RUN);   // slant length of the screen deck

// Jog
const JX = 0, JZ = 0.1005;
const R_WELL = 0.1085, R_PLAT = 0.1025, R_HUB = 0.0405, R_DISP = 0.0345;
const PLAT_Y = Y_TOP + 0.0145;        // platter top surface

// Screen (on the screen deck; s = slant distance from its front edge)
const SCR_W = 0.198, SCR_D = 0.124, SCR_S = 0.075;
const BEZ_W = 0.208, BEZ_D = 0.134, BEZ_H = 0.0012;

// Tempo fader
const TEMPO_X = 0.1455, TEMPO_Z0 = 0.0775, TEMPO_Z1 = 0.2065;
const TEMPO_ZC = (TEMPO_Z0 + TEMPO_Z1) / 2, TEMPO_TRAVEL = 0.048;

// Print colour, plate inset of the decal
const INK = '#d9dbde';
const DEC_IN = 0.0035;
const FONT = "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif";
const MONO = "'DejaVu Sans Mono', 'Liberation Mono', Menlo, monospace";

// Hot-cue letters
const PAD_LETTERS = 'ABCDEFGH';

// ── Control tables ──────────────────────────────────────────────────────────
// Flat plate: [id, x, z, w, d, cap label]
// Cap labels starting with '@' are drawn symbols. '\n' splits two lines.
const SB_W = 0.0185, SB_D = 0.0100;   // standard small rubber button
const FLAT_BUTTONS = [
  // Row A — loop, beat loop, slip / quantize, beat jump, time mode
  ['loopIn', -0.1495, -0.0345, SB_W, SB_D, 'IN'],
  ['loopOut', -0.1275, -0.0345, SB_W, SB_D, 'OUT'],
  ['reloop', -0.1055, -0.0345, SB_W, SB_D, 'RELOOP\nEXIT'],
  ['beat4', -0.0745, -0.0345, SB_W, SB_D, '4 BEAT'],
  ['beat8', -0.0525, -0.0345, SB_W, SB_D, '8 BEAT'],
  ['slip', 0.0525, -0.0345, SB_W, SB_D, 'SLIP'],
  ['quantize', 0.0745, -0.0345, SB_W, SB_D, 'QUANTIZE'],
  ['jumpBack', 0.1055, -0.0345, SB_W, SB_D, '@left'],
  ['jumpFwd', 0.1275, -0.0345, SB_W, SB_D, '@right'],
  ['timeMode', 0.1495, -0.0345, SB_W, SB_D, 'TIME\nMODE'],
  // Row B — cue/loop call, loop halve/double, jog mode
  ['callBack', -0.1495, -0.0125, SB_W, SB_D, '@left'],
  ['callFwd', -0.1275, -0.0125, SB_W, SB_D, '@right'],
  ['loopHalf', -0.1055, -0.0125, SB_W, SB_D, '1/2X'],
  ['loopDouble', -0.0835, -0.0125, SB_W, SB_D, '2X'],
  ['jogMode', 0.0985, -0.0120, SB_W, SB_D, 'JOG\nMODE'],
  // Pad-row ends
  ['memory', 0.1215, -0.0600, SB_W, SB_D, 'MEMORY'],
  ['delete', 0.1455, -0.0600, SB_W, SB_D, 'DELETE'],
  // Left gutter — search, track search
  ['searchRev', -0.1495, 0.0215, SB_W, SB_D, '@rew'],
  ['searchFwd', -0.1275, 0.0215, SB_W, SB_D, '@ff'],
  ['trackPrev', -0.1495, 0.0515, SB_W, SB_D, '@prev'],
  ['trackNext', -0.1275, 0.0515, SB_W, SB_D, '@next'],
  // Right gutter — sync / master / key sync, tempo range / master tempo
  ['sync', 0.1030, 0.0205, SB_W, SB_D, 'BEAT\nSYNC'],
  ['master', 0.1265, 0.0205, SB_W, SB_D, 'MASTER'],
  ['keySync', 0.1500, 0.0205, SB_W, SB_D, 'KEY\nSYNC'],
  ['tempoRange', 0.1265, 0.0505, SB_W, SB_D, '±'],
  ['masterTempo', 0.1500, 0.0505, SB_W, SB_D, 'MASTER\nTEMPO'],
];

// Screen deck (hood): [id, x, s, w, d, cap label]
const HB_W = 0.0265, HB_D = 0.0088;
const HOOD_BUTTONS = [
  ['source', -0.1335, 0.0925, HB_W, HB_D, 'SOURCE'],
  ['browseBtn', -0.1335, 0.0780, HB_W, HB_D, 'BROWSE'],
  ['tagList', -0.1335, 0.0635, HB_W, HB_D, 'TAG LIST'],
  ['playlist', -0.1335, 0.0490, HB_W, HB_D, 'PLAYLIST'],
  ['search', -0.1335, 0.0345, HB_W, HB_D, 'SEARCH'],
  ['menu', -0.1335, 0.0200, HB_W, HB_D, 'MENU'],
  ['back', 0.1215, 0.0205, 0.0195, HB_D, 'BACK'],
  ['tagTrack', 0.1455, 0.0205, 0.0195, HB_D, 'TAG\nTRACK'],
  ['filter', 0.1215, 0.0905, 0.0195, HB_D, 'TRACK\nFILTER'],
  ['shortcut', 0.1455, 0.0905, 0.0195, HB_D, 'SHORT\nCUT'],
];

// ── Small helpers ───────────────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  return new OffscreenCanvas(w, h);
}

function hexToRgb(hex) {
  const h = String(hex || '#000').replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }

function fmtTime(sec) {
  if (sec == null || !Number.isFinite(sec)) return '--:--.-';
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`;
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function setSpacing(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`; }

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

// Drawn symbols (no font dependence): centre cx,cy, size = glyph height.
function drawSymbol(ctx, key, cx, cy, size, color) {
  const s = size;
  ctx.save();
  ctx.fillStyle = color; ctx.strokeStyle = color;
  const tri = (x, y, dir, hh) => {   // dir +1 points right
    ctx.beginPath();
    ctx.moveTo(x - dir * hh * 0.45, y - hh / 2);
    ctx.lineTo(x + dir * hh * 0.45, y);
    ctx.lineTo(x - dir * hh * 0.45, y + hh / 2);
    ctx.closePath(); ctx.fill();
  };
  const bar = (x, y, hh) => ctx.fillRect(x - hh * 0.08, y - hh / 2, hh * 0.16, hh);
  switch (key) {
    case 'left': tri(cx, cy, -1, s); break;
    case 'right': tri(cx, cy, 1, s); break;
    case 'ff': tri(cx - s * 0.22, cy, 1, s * 0.8); tri(cx + s * 0.22, cy, 1, s * 0.8); break;
    case 'rew': tri(cx - s * 0.22, cy, -1, s * 0.8); tri(cx + s * 0.22, cy, -1, s * 0.8); break;
    case 'next': tri(cx - s * 0.3, cy, 1, s * 0.75); tri(cx + s * 0.05, cy, 1, s * 0.75); bar(cx + s * 0.42, cy, s * 0.75); break;
    case 'prev': tri(cx + s * 0.3, cy, -1, s * 0.75); tri(cx - s * 0.05, cy, -1, s * 0.75); bar(cx - s * 0.42, cy, s * 0.75); break;
    case 'play': {   // ▶ / ❚❚
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.9, cy - s * 0.46); ctx.lineTo(cx - s * 0.3, cy); ctx.lineTo(cx - s * 0.9, cy + s * 0.46);
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx - s * 0.2, cy + s * 0.46); ctx.lineTo(cx + s * 0.02, cy - s * 0.46); ctx.stroke();
      ctx.fillRect(cx + s * 0.16, cy - s * 0.44, s * 0.15, s * 0.88);
      ctx.fillRect(cx + s * 0.44, cy - s * 0.44, s * 0.15, s * 0.88);
      break;
    }
    default: break;
  }
  ctx.restore();
}

// ── Geometry helpers ────────────────────────────────────────────────────────
function nonIndexed(g) { return g.index ? g.toNonIndexed() : g; }

/** Every vertex's UV set to one atlas point (a flat colour swatch). */
function uvSolid(g, uv) {
  const a = g.attributes.uv;
  for (let i = 0; i < a.count; i++) a.setXY(i, uv[0], uv[1]);
  a.needsUpdate = true;
  return g;
}

/**
 * Top-facing vertices get a planar projection of local (x, z) into an atlas
 * cell (text up = −Z = away from the DJ); the rest take a solid swatch.
 * Must run BEFORE the placement matrix, on a geometry centred on its cap.
 */
function uvProjectTop(g, cell, halfX, halfZ, sideUV) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    if (n.getY(i) > 0.35) {
      const fx = Math.min(1, Math.max(0, (p.getX(i) / halfX + 1) / 2));
      const fz = Math.min(1, Math.max(0, (p.getZ(i) / halfZ + 1) / 2));
      uv.setXY(i, cell.u0 + fx * (cell.u1 - cell.u0), cell.v1 - fz * (cell.v1 - cell.v0));
    } else uv.setXY(i, sideUV[0], sideUV[1]);
  }
  uv.needsUpdate = true;
  return g;
}

/** Planar UVs (0..1) remapped into an atlas cell — for Circle/Plane tops. */
function uvRemap(g, cell) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, cell.u0 + uv.getX(i) * (cell.u1 - cell.u0), cell.v0 + uv.getY(i) * (cell.v1 - cell.v0));
  }
  uv.needsUpdate = true;
  return g;
}

// ── The factory ─────────────────────────────────────────────────────────────
export function createCDJ({ THREE, deckNumber = 1, accent = '#34d6c5', textureScale = 1, screenFps = 20, finish = 'physical' } = {}) {
  // finish 'physical' (desktop): clear-coated gloss plastic, a brushed jog rim, glass screens.
  // finish 'standard' (phones): the plain MeshStandard materials, so the phone tier pays nothing.
  const PHYS = finish === 'physical';
  if (!THREE) throw new Error('createCDJ: pass { THREE }');
  const ts = Math.max(0.25, Math.min(2, Number(textureScale) || 1));
  const rand = mulberry32(0x5eed + (deckNumber | 0) * 7919);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };

  const group = new THREE.Group();
  group.name = `cdj-deck-${deckNumber}`;

  const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  // The screen deck's frame: origin at its front edge (surface), local −Z runs
  // up the slope toward the back, local +Y is the tilted surface normal.
  const HOOD = M(0, Y_HOOD_F, Z_STEP, TILT, 0, 0);
  const hoodM = (x, s, h = 0, rx = 0, ry = 0, rz = 0) => HOOD.clone().multiply(M(x, h, -s, rx, ry, rz));
  const hoodPoint = (x, s, h = 0) => new THREE.Vector3(x, h, -s).applyMatrix4(HOOD);

  // ── Atlas: plate print (flat + screen deck) and every cap face ────────────
  const PXM = 4000 * ts;                          // plate print: 4 px / mm
  const CPXM = 8000 * ts;                         // caps: 8 px / mm
  const DX0 = XL + DEC_IN, DX1 = -DX0;
  const DZ0 = Z_STEP + 0.002, DZ1 = ZF - DEC_IN;
  const DS0 = 0.0025, DS1 = S_LEN - 0.0045;
  const AW = Math.ceil((DX1 - DX0) * PXM);
  const hF = Math.ceil((DZ1 - DZ0) * PXM);
  const hH = Math.ceil((DS1 - DS0) * PXM);
  const yH0 = hF;

  // Cells for caps, shelf-packed below the two print regions.
  const cellReqs = [];
  const reqCell = (key, wM, dM, draw) => { const c = { key, w: Math.ceil(wM * CPXM) + 4, h: Math.ceil(dM * CPXM) + 4, draw }; cellReqs.push(c); return c; };
  const SWATCH = 10;
  const swatches = {
    rubber: '#141518', pad: '#1c1e21', knob: '#0e0e10', white: '#eeeeee', guide: '#3a3c40',
    led: '#232427', stem: '#080809', grip: '#131416', lever: '#18191c',
  };
  const swatchReqs = Object.keys(swatches).map((k) => ({ key: k, w: SWATCH, h: SWATCH }));

  // Shelf pack
  let cx = 0, cy = yH0 + hH + 2, shelfH = 0;
  const place = (c) => {
    if (cx + c.w > AW) { cx = 0; cy += shelfH + 1; shelfH = 0; }
    c.x = cx; c.y = cy; cx += c.w + 1; shelfH = Math.max(shelfH, c.h);
  };
  // Packing runs once every control below has requested its cell.

  // ── Bucketed geometry ─────────────────────────────────────────────────────
  const buckets = { body: [], plate: [], decal: [], gloss: [], caps: [], metal: [] };
  const capLed = [];          // parallel to buckets.caps: led id or null
  const put = (bucket, geom, m, led = null) => {
    const g = nonIndexed(geom);
    if (g !== geom) geom.dispose();
    if (m) g.applyMatrix4(m);
    buckets[bucket].push(g);
    if (bucket === 'caps') capLed.push(led);
    return g;
  };

  // Deferred cap builders — they need atlas cells, which need packing first.
  const capJobs = [];

  // ── Chassis (black body) ─────────────────────────────────────────────────
  {
    const pD = new THREE.Vector3(0, -PLATE_T, 0).applyMatrix4(HOOD);
    const pE = new THREE.Vector3(0, -PLATE_T, -S_LEN).applyMatrix4(HOOD);
    const eY = pD.y + (pE.y - pD.y) * ((ZB - pD.z) / (pE.z - pD.z));
    // Side profile in (−z, y); extruded across X.
    const prof = [
      [ZF - 0.009, 0.004], [ZF, 0.013], [ZF, Y_BODY], [Z_STEP + 0.0004, Y_BODY], [pD.z, pD.y],
      [ZB, eY], [ZB, 0.013], [ZB + 0.009, 0.004],
    ];
    const shape = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(-z, y)));
    const bev = 0.0022;
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: W - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev,
      bevelOffset: -bev, bevelSegments: 3, curveSegments: 1, steps: 1,
    });
    const m = new THREE.Matrix4().set(0, 0, 1, XL + bev, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1);
    put('body', g, m);
    // Rubber feet
    for (const [x, z] of [[-0.135, -0.19], [0.135, -0.19], [-0.135, 0.19], [0.135, 0.19]]) {
      put('body', new THREE.CylinderGeometry(0.011, 0.012, 0.004, 20), M(x, 0.002, z));
    }
    // Rear panel: an inset connector strip — LAN, USB-B, audio outs, power
    // inlet and switch (this is the face the crowd sees).
    const rearY = 0.045;
    put('gloss', new RoundedBoxGeometry(0.296, 0.046, 0.0016, 1, 0.0008), M(0, rearY, ZB - 0.0003));
    put('gloss', new RoundedBoxGeometry(0.012, 0.006, 0.004, 1, 0.001), M(0.145 - 0.012, rearY + 0.012, ZB - 0.0012));
    put('gloss', new RoundedBoxGeometry(0.016, 0.014, 0.004, 1, 0.001), M(-0.10, rearY, ZB - 0.0012));
    put('gloss', new RoundedBoxGeometry(0.030, 0.020, 0.004, 1, 0.002), M(0.11, rearY - 0.005, ZB - 0.0012));
    for (let i = 0; i < 4; i++) {
      put('metal', new THREE.CylinderGeometry(0.0048, 0.0048, 0.008, 18), M(-0.045 + (i % 2) * 0.016, rearY + (i < 2 ? 0.010 : -0.010), ZB - 0.003, Math.PI / 2));
    }
    put('metal', new RoundedBoxGeometry(0.014, 0.008, 0.004, 1, 0.001), M(0.03, rearY, ZB - 0.0012));
  }

  // ── Top plate (gunmetal) and its printed decal ───────────────────────────
  {
    const fz0 = Z_STEP + 0.0005, fz1 = ZF - 0.0015;
    put('plate', new RoundedBoxGeometry(W - 0.003, PLATE_T, fz1 - fz0, 2, 0.0018),
      M(0, Y_BODY + PLATE_T / 2, (fz0 + fz1) / 2));
    const sLen = S_LEN - 0.0015;
    put('plate', new RoundedBoxGeometry(W - 0.003, PLATE_T, sLen, 2, 0.0018), hoodM(0, sLen / 2, -PLATE_T / 2));
  }
  const decalFlat = new THREE.PlaneGeometry(DX1 - DX0, DZ1 - DZ0);
  decalFlat.rotateX(-Math.PI / 2);
  decalFlat.translate(0, Y_TOP + 0.00012, (DZ0 + DZ1) / 2);
  const decalHood = new THREE.PlaneGeometry(DX1 - DX0, DS1 - DS0);
  decalHood.rotateX(-Math.PI / 2);
  decalHood.translate(0, 0.00012, -(DS0 + DS1) / 2);
  decalHood.applyMatrix4(HOOD);

  // ── Gloss black: jog well, screen bezel, tempo slot, card slots ──────────
  {
    put('gloss', new THREE.CircleGeometry(R_WELL, 96).rotateX(-Math.PI / 2), M(JX, Y_TOP + 0.0003, JZ));
    put('gloss', new RoundedBoxGeometry(BEZ_W, BEZ_H * 2, BEZ_D, 2, 0.0022), hoodM(0, SCR_S, 0));
    // tempo slot: a narrow black channel just proud of the print
    put('gloss', new RoundedBoxGeometry(0.0034, 0.0006, TEMPO_Z1 - TEMPO_Z0, 1, 0.0003), M(TEMPO_X, Y_TOP + 0.0002, TEMPO_ZC));
    // direction lever slot
    put('gloss', new RoundedBoxGeometry(0.0022, 0.0006, 0.014, 1, 0.0003), M(-0.1385, Y_TOP + 0.0002, 0.0845));
    // USB-A opening (dark tongue inside the metal shell) and the SD slot
    put('gloss', new RoundedBoxGeometry(0.0118, 0.0020, 0.0036, 1, 0.0004), hoodM(-0.1375, 0.1235, 0.0003));
    put('gloss', new RoundedBoxGeometry(0.026, 0.0016, 0.0028, 1, 0.0006), hoodM(0.1335, 0.1235, 0.0002));
  }

  // ── Static metal: jog surround ring, USB shell, hub lip ───────────────────
  {
    const ring = new THREE.LatheGeometry([
      new THREE.Vector2(R_WELL - 0.0002, Y_TOP + 0.0002), new THREE.Vector2(R_WELL + 0.0004, Y_TOP + 0.0011),
      new THREE.Vector2(R_WELL + 0.0014, Y_TOP + 0.0013), new THREE.Vector2(R_WELL + 0.0024, Y_TOP + 0.0002),
    ], 120);
    put('metal', ring, M(JX, 0, JZ));
    // USB-A shell (4 thin walls)
    const sx = 0.0132, sz = 0.0050, t = 0.0005, sh = 0.0016;
    put('metal', new THREE.BoxGeometry(sx, sh, t), hoodM(-0.1375, 0.1235 + sz / 2, sh / 2));
    put('metal', new THREE.BoxGeometry(sx, sh, t), hoodM(-0.1375, 0.1235 - sz / 2, sh / 2));
    put('metal', new THREE.BoxGeometry(t, sh, sz), hoodM(-0.1375 - sx / 2, 0.1235, sh / 2));
    put('metal', new THREE.BoxGeometry(t, sh, sz), hoodM(-0.1375 + sx / 2, 0.1235, sh / 2));
    // Hub lip around the on-jog display
    const lip = new THREE.LatheGeometry([
      new THREE.Vector2(R_HUB + 0.0002, PLAT_Y - 0.0010), new THREE.Vector2(R_HUB, PLAT_Y + 0.0009),
      new THREE.Vector2(R_HUB - 0.0012, PLAT_Y + 0.0011), new THREE.Vector2(R_HUB - 0.0020, PLAT_Y + 0.0006),
    ], 72);
    put('metal', lip, M(JX, 0, JZ));
  }

  // ── Caps / LEDs (the one lit mesh) ────────────────────────────────────────
  const anchors = {};
  const anchor = (name, v) => {
    const o = new THREE.Object3D(); o.name = `cdj${deckNumber}-${name}`;
    o.position.copy(v); group.add(o); return o;
  };

  const capLabelDraw = (label, opts = {}) => (ctx, c) => {
    const x = c.x + 2, y = c.y + 2, w = c.w - 4, h = c.h - 4;
    ctx.fillStyle = opts.bg || swatches.rubber; ctx.fillRect(c.x, c.y, c.w, c.h);
    // soft top highlight so caps read as moulded, not flat
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    if (!label) return;
    const col = opts.ink || '#e3e3e3';
    if (label[0] === '@') {
      drawSymbol(ctx, label.slice(1), x + w / 2, y + h / 2, (opts.sym || 0.46) * h, col);
      return;
    }
    const lines = label.split('\n');
    const lh = Math.min(h * (lines.length > 1 ? 0.30 : 0.36), opts.maxPx || 1e9);
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${lh}px ${FONT}`; setSpacing(ctx, lh * 0.06);
    // shrink to fit width
    let size = lh;
    for (const ln of lines) { const mw = ctx.measureText(ln).width; if (mw > w * 0.84) size = Math.min(size, lh * (w * 0.84) / mw); }
    ctx.font = `700 ${size}px ${FONT}`; setSpacing(ctx, size * 0.06);
    lines.forEach((ln, i) => ctx.fillText(ln, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * size * 1.12));
    setSpacing(ctx, 0);
  };

  // Rect rubber button (flat plate or screen deck). Every one owns an LED
  // range named after its id, so any button can be lit later with setLed.
  // One rounding segment: at a 1.4 mm radius it reads as a moulded chamfer and
  // keeps ~40 buttons near 4k triangles.
  const rectButton = (id, w, d, hgt, label, matrixFor) => {
    const cell = reqCell(id, w, d, capLabelDraw(label));
    capJobs.push((uv) => {
      const g = new RoundedBoxGeometry(w, hgt, d, 1, 0.0014);
      uvProjectTop(g, uv.cell(cell), w / 2, d / 2, uv.solid('rubber'));
      put('caps', g, matrixFor(hgt / 2), id);
    });
  };
  for (const [id, x, z, w, d, label] of FLAT_BUTTONS) rectButton(id, w, d, 0.0031, label, (hh) => M(x, Y_TOP + hh, z));
  for (const [id, x, s, w, d, label] of HOOD_BUTTONS) rectButton(id, w, d, 0.0029, label, (hh) => hoodM(x, s, hh));

  // Hot-cue pads — thicker, softer rubber, lit through the whole pad.
  const PAD_W = 0.0215, PAD_D = 0.0145, PAD_H = 0.0050, PAD_Z = -0.0600;
  anchors.pads = [];
  for (let i = 0; i < 8; i++) {
    const x = -0.091 + i * 0.026;
    const letter = PAD_LETTERS[i];
    const cell = reqCell(`pad${i}`, PAD_W, PAD_D, (ctx, c) => {
      ctx.fillStyle = swatches.pad; ctx.fillRect(c.x, c.y, c.w, c.h);
      const gr = ctx.createRadialGradient(c.x + c.w / 2, c.y + c.h / 2, 1, c.x + c.w / 2, c.y + c.h / 2, c.w * 0.6);
      gr.addColorStop(0, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0.10)');
      ctx.fillStyle = gr; ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.fillStyle = 'rgba(235,235,235,0.85)'; ctx.font = `700 ${c.h * 0.22}px ${FONT}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(letter, c.x + c.w * 0.12, c.y + c.h * 0.14);
    });
    capJobs.push((uv) => {
      const g = new RoundedBoxGeometry(PAD_W, PAD_H, PAD_D, 2, 0.0022);
      uvProjectTop(g, uv.cell(cell), PAD_W / 2, PAD_D / 2, uv.solid('pad'));
      put('caps', g, M(x, Y_TOP + PAD_H / 2, PAD_Z), `pad${i}`);
    });
    anchors.pads.push(anchor(`pad${i}`, new THREE.Vector3(x, Y_TOP + PAD_H, PAD_Z)));
  }

  // CUE and PLAY — big round caps with a light-guide ring.
  const bigRound = (id, x, z, label, ringLed) => {
    const R = 0.0165, hgt = 0.0055;
    const cell = reqCell(id, 2 * R, 2 * R, (ctx, c) => {
      ctx.fillStyle = swatches.rubber; ctx.fillRect(c.x, c.y, c.w, c.h);
      const cxp = c.x + c.w / 2, cyp = c.y + c.h / 2, rr = c.w / 2 - 2;
      const gr = ctx.createRadialGradient(cxp - rr * 0.3, cyp - rr * 0.4, 1, cxp, cyp, rr);
      gr.addColorStop(0, '#1d1e21'); gr.addColorStop(1, '#0e0f11');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cxp, cyp, rr, 0, Math.PI * 2); ctx.fill();
      if (label[0] === '@') drawSymbol(ctx, label.slice(1), cxp, cyp, rr * 0.55, '#ececec');
      else {
        ctx.fillStyle = '#ececec'; ctx.font = `700 ${rr * 0.44}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        setSpacing(ctx, rr * 0.05); ctx.fillText(label, cxp, cyp); setSpacing(ctx, 0);
      }
    });
    capJobs.push((uv) => {
      const side = new THREE.CylinderGeometry(R, R, hgt - 0.0012, 48, 1, true);
      uvSolid(side, uv.solid('rubber'));
      put('caps', side, M(x, Y_TOP + (hgt - 0.0012) / 2, z), id);
      const bev = new THREE.LatheGeometry([
        new THREE.Vector2(R, hgt - 0.0012), new THREE.Vector2(R - 0.0003, hgt - 0.0004), new THREE.Vector2(R - 0.0012, hgt),
      ], 48);
      uvSolid(bev, uv.solid('rubber'));
      put('caps', bev, M(x, Y_TOP, z), id);
      const top = new THREE.CircleGeometry(R - 0.0012, 48);
      uvRemap(top, uv.cellInner(cell, (R - 0.0012) / R));
      top.rotateX(-Math.PI / 2);
      put('caps', top, M(x, Y_TOP + hgt, z), id);
      // light-guide ring hugging the cap
      const ring = new THREE.LatheGeometry([
        new THREE.Vector2(R + 0.0038, 0), new THREE.Vector2(R + 0.0038, 0.0012),
        new THREE.Vector2(R + 0.0030, 0.0017), new THREE.Vector2(R + 0.0006, 0.0017), new THREE.Vector2(R + 0.0004, 0),
      ], 48);
      uvSolid(ring, uv.solid('guide'));
      put('caps', ring, M(x, Y_TOP, z), ringLed);
    });
    return anchor(id, new THREE.Vector3(x, Y_TOP + hgt, z));
  };
  anchors.cue = bigRound('cue', -0.1375, 0.1325, 'CUE', 'cueRing');
  anchors.play = bigRound('play', -0.1375, 0.1865, '@play', 'playRing');

  // Knobs: a matte pot with a white pointer line.
  const potKnob = (id, x, z, r, hgt, angDeg) => {
    const a = angDeg * Math.PI / 180;   // pointer angle, clockwise from 12 o'clock (−Z)
    capJobs.push((uv) => {
      const skirt = new THREE.CylinderGeometry(r + 0.0012, r + 0.0014, 0.0015, 36);
      uvSolid(skirt, uv.solid('knob'));
      put('caps', skirt, M(x, Y_TOP + 0.00075, z));
      const body = new THREE.CylinderGeometry(r * 0.94, r, hgt - 0.0015, 36, 1, true);
      // grip flutes: alternate vertex radius around the body
      const p = body.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const ang = Math.atan2(p.getZ(i), p.getX(i));
        const k = 1 - 0.035 * (0.5 + 0.5 * Math.cos(ang * 18));
        p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
      }
      body.computeVertexNormals();
      uvSolid(body, uv.solid('knob'));
      put('caps', body, M(x, Y_TOP + 0.0015 + (hgt - 0.0015) / 2, z));
      const top = new THREE.CircleGeometry(r * 0.94, 36).rotateX(-Math.PI / 2);
      uvSolid(top, uv.solid('grip'));
      put('caps', top, M(x, Y_TOP + hgt, z));
      const line = new THREE.BoxGeometry(0.0008, 0.0003, r * 0.9);
      uvSolid(line, uv.solid('white'));
      put('caps', line, M(x + Math.sin(a) * r * 0.45, Y_TOP + hgt + 0.00012, z - Math.cos(a) * r * 0.45, 0, -a, 0));
    });
  };
  potKnob('vinylAdj', 0.1255, -0.0095, 0.0068, 0.0120, 20);
  potKnob('jogAdj', 0.1505, -0.0095, 0.0068, 0.0120, -45);

  // Browse / rotary selector — big endless encoder on the screen deck.
  {
    const x = 0.1335, s = 0.0555, r = 0.0125, hgt = 0.0150;
    capJobs.push((uv) => {
      const skirt = new THREE.CylinderGeometry(r + 0.0016, r + 0.0018, 0.0018, 48);
      uvSolid(skirt, uv.solid('knob'));
      put('caps', skirt, hoodM(x, s, 0.0009));
      const body = new THREE.CylinderGeometry(r * 0.95, r, hgt - 0.0018 - 0.0012, 64, 2, true);
      const p = body.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const ang = Math.atan2(p.getZ(i), p.getX(i));
        const k = 1 - 0.028 * Math.pow(0.5 + 0.5 * Math.cos(ang * 32), 3);
        p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
      }
      body.computeVertexNormals();
      uvSolid(body, uv.solid('knob'));
      put('caps', body, hoodM(x, s, 0.0018 + (hgt - 0.0030) / 2));
      const bev = new THREE.LatheGeometry([
        new THREE.Vector2(r * 0.95, 0), new THREE.Vector2(r * 0.93, 0.0007), new THREE.Vector2(r * 0.86, 0.0012),
      ], 64);
      uvSolid(bev, uv.solid('knob'));
      put('caps', bev, hoodM(x, s, hgt - 0.0012));
      const top = new THREE.CircleGeometry(r * 0.86, 48).rotateX(-Math.PI / 2);
      uvSolid(top, uv.solid('grip'));
      put('caps', top, hoodM(x, s, hgt));
    });
    anchors.browse = anchor('browse', hoodPoint(x, s, hgt));
  }

  // Small round buttons: tempo reset, USB stop.
  const smallRound = (id, matrix, r = 0.0032, hgt = 0.0028) => {
    capJobs.push((uv) => {
      const g = new THREE.CylinderGeometry(r, r, hgt, 24);
      uvSolid(g, uv.solid('rubber'));
      put('caps', g, matrix(hgt / 2), id);
    });
  };
  smallRound('tempoReset', (hh) => M(0.1225, Y_TOP + hh, 0.0835));
  smallRound('usbStop', (hh) => hoodM(-0.1180, 0.1150, hh));

  // Direction lever
  capJobs.push((uv) => {
    const g = new RoundedBoxGeometry(0.0052, 0.0050, 0.0040, 1, 0.0012);
    uvSolid(g, uv.solid('lever'));
    put('caps', g, M(-0.1385, Y_TOP + 0.0025, 0.0800));
  });

  // Tiny indicator LEDs: [id, matrix]
  const tinyLeds = [
    ['usbLed', hoodM(-0.1180, 0.1285, 0.0004)],
    ['sdLed', hoodM(0.1535, 0.1325, 0.0004)],
    ['linkLed', hoodM(0.1135, 0.1325, 0.0004)],
    ['tempoZero', M(0.1300, Y_TOP + 0.0004, TEMPO_ZC)],
    ['vinylLed', M(0.0985, Y_TOP + 0.0004, -0.0200)],
  ];
  capJobs.push((uv) => {
    for (const [id, m] of tinyLeds) {
      const g = new RoundedBoxGeometry(0.0024, 0.0008, 0.0016, 1, 0.0003);
      uvSolid(g, uv.solid('led'));
      put('caps', g, m, id);
    }
  });

  // Ring lights: ON AIR (at the platter's foot) and the jog ring around the hub display.
  capJobs.push((uv) => {
    const onAir = new THREE.RingGeometry(R_PLAT + 0.0019, R_WELL - 0.0009, 120, 1).rotateX(-Math.PI / 2);
    uvSolid(onAir, uv.solid('guide'));
    put('caps', onAir, M(JX, Y_TOP + 0.0006, JZ), 'onAirRing');
    const hub = new THREE.RingGeometry(R_DISP + 0.0002, R_HUB - 0.0019, 96, 1).rotateX(-Math.PI / 2);
    uvSolid(hub, uv.solid('guide'));
    put('caps', hub, M(JX, PLAT_Y + 0.0006, JZ), 'jogRing');
  });

  // ── Pack the atlas now that every cell is requested ──────────────────────
  for (const c of cellReqs.slice().sort((a, b) => b.h - a.h)) place(c);
  for (const s of swatchReqs) place(s);
  const AH = cy + shelfH + 2;
  const atlas = makeCanvas(AW, AH);
  const actx = atlas.getContext('2d');
  const uvApi = {
    cell: (c) => ({ u0: (c.x + 2.5) / AW, u1: (c.x + c.w - 2.5) / AW, v0: 1 - (c.y + c.h - 2.5) / AH, v1: 1 - (c.y + 2.5) / AH }),
    cellInner: (c, f) => {
      const cxp = c.x + c.w / 2, cyp = c.y + c.h / 2, hw = (c.w / 2 - 2.5) * f, hh = (c.h / 2 - 2.5) * f;
      return { u0: (cxp - hw) / AW, u1: (cxp + hw) / AW, v0: 1 - (cyp + hh) / AH, v1: 1 - (cyp - hh) / AH };
    },
    solid: (k) => { const s = swatchReqs.find((q) => q.key === k); return [(s.x + s.w / 2) / AW, 1 - (s.y + s.h / 2) / AH]; },
  };
  for (const job of capJobs) job(uvApi);

  // Decal UVs into the two print regions.
  {
    const uvF = decalFlat.attributes.uv, uvH = decalHood.attributes.uv;
    for (let i = 0; i < uvF.count; i++) uvF.setXY(i, uvF.getX(i) * (DX1 - DX0) * PXM / AW, 1 - (1 - uvF.getY(i)) * hF / AH);
    for (let i = 0; i < uvH.count; i++) uvH.setXY(i, uvH.getX(i) * (DX1 - DX0) * PXM / AW, 1 - (yH0 + (1 - uvH.getY(i)) * hH) / AH);
    put('decal', decalFlat);
    put('decal', decalHood);
  }

  // ── Paint the atlas ───────────────────────────────────────────────────────
  paintPlatePrint(actx, { AW, hF, hH, yH0, PXM, DX0, DZ0, DS1, rand, deckNumber });
  for (const c of cellReqs) c.draw(actx, c);
  for (const s of swatchReqs) { actx.fillStyle = swatches[s.key]; actx.fillRect(s.x, s.y, s.w, s.h); }

  const atlasTex = keep(new THREE.CanvasTexture(atlas));
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = 8;

  // ── Materials ─────────────────────────────────────────────────────────────
  // Near-black painted chassis; dark anodised (gunmetal) top plate; satin
  // rubber caps. Albedos are real-world dark — the club's lights make the
  // highlights, the gear itself never glows except where an LED does.
  // On the desktop tier the chassis is satin paint under a thin clear coat, the gloss parts (jog well,
  // screen bezel, rear panel) are black plastic with a sharp clear coat that picks up the LED wall,
  // and the anodised top plate is a touch smoother so the room's light slides across it.
  const mBody = keep(PHYS
    ? new THREE.MeshPhysicalMaterial({ color: 0x0a0a0b, roughness: 0.6, metalness: 0.05, clearcoat: 0.3, clearcoatRoughness: 0.35 })
    : new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.68, metalness: 0.1 }));
  const mPlate = keep(new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: PHYS ? 0.46 : 0.56, metalness: PHYS ? 0.62 : 0.55 }));
  const mDecal = keep(new THREE.MeshStandardMaterial({ map: atlasTex, roughness: PHYS ? 0.5 : 0.58, metalness: PHYS ? 0.5 : 0.45 }));
  const mGloss = keep(PHYS
    ? new THREE.MeshPhysicalMaterial({ color: 0x040405, roughness: 0.34, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.06 })
    : new THREE.MeshStandardMaterial({ color: 0x040405, roughness: 0.2, metalness: 0.2 }));
  const mMetal = keep(new THREE.MeshStandardMaterial({ color: 0x80848a, roughness: 0.34, metalness: 1.0 }));
  const mCaps = keep(new THREE.MeshStandardMaterial({ map: atlasTex, roughness: 0.8, metalness: 0.0, emissive: 0xffffff }));
  mCaps.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 ledColor;\nvarying vec3 vLed;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLed = ledColor;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLed;')
      // Backlit rubber: the legend glows harder than the rubber around it.
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n' +
        'float capLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));\n' +
        'totalEmissiveRadiance *= vLed * (0.62 + 1.9 * capLuma);');
  };
  mCaps.customProgramCacheKey = () => 'shape-cdj-caps-led-v1';

  // ── Merge buckets into meshes ─────────────────────────────────────────────
  const meshes = {};
  const mergeBucket = (name, mat, { cast = true, receive = true } = {}) => {
    const list = buckets[name];
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = `cdj${deckNumber}-${name}`;
    mesh.castShadow = cast; mesh.receiveShadow = receive;
    keep(merged);
    group.add(mesh);
    meshes[name] = mesh;
    return { mesh, merged, list };
  };

  // caps: build per-LED vertex ranges before merging (list order = merge order)
  const ledRanges = {};
  {
    let v = 0;
    buckets.caps.forEach((g, i) => {
      const id = capLed[i];
      if (id) (ledRanges[id] ||= []).push([v, g.attributes.position.count]);
      v += g.attributes.position.count;
    });
  }
  mergeBucket('body', mBody);
  mergeBucket('plate', mPlate);
  mergeBucket('decal', mDecal, { cast: false });
  mergeBucket('gloss', mGloss);
  mergeBucket('metal', mMetal);
  const capsMerged = mergeBucket('caps', mCaps).merged;
  const ledAttr = new THREE.BufferAttribute(new Float32Array(capsMerged.attributes.position.count * 3), 3);
  ledAttr.setUsage(THREE.DynamicDrawUsage);
  capsMerged.setAttribute('ledColor', ledAttr);

  // ── Screen ────────────────────────────────────────────────────────────────
  const SW = Math.round(1024 * ts), SH = Math.round(640 * ts);
  const screenCanvas = makeCanvas(SW, SH);
  const sctx = screenCanvas.getContext('2d');
  const screenTex = keep(new THREE.CanvasTexture(screenCanvas));
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.anisotropy = 4;
  // AR-coated glass: a dim, tight reflection of the room over a bright emissive panel.
  const mScreen = keep(new THREE.MeshPhysicalMaterial({
    color: 0x000000, roughness: 0.07, metalness: 0.0, specularIntensity: 0.5,
    emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 1.25,
    // the cover glass: a second, sharper reflection of the room over the panel
    clearcoat: PHYS ? 1.0 : 0.0, clearcoatRoughness: 0.03,
  }));
  const screenGeom = keep(new THREE.PlaneGeometry(SCR_W, SCR_D).rotateX(-Math.PI / 2));
  const screen = new THREE.Mesh(screenGeom, mScreen);
  screen.name = `cdj${deckNumber}-screen`;
  screen.applyMatrix4(hoodM(0, SCR_S, BEZ_H + 0.00015));   // bezel box is centred on the surface
  group.add(screen);
  anchors.screen = anchor('screen', hoodPoint(0, SCR_S, BEZ_H + 0.00015));

  // ── Jog: rotating platter group + static hub display ──────────────────────
  const platter = new THREE.Group();
  platter.name = `cdj${deckNumber}-platter`;
  platter.position.set(JX, 0, JZ);
  group.add(platter);
  // Platter rim: knurled dark aluminium with a rounded top edge.
  const rimParts = [];
  {
    const rimH = PLAT_Y - 0.0017 - (Y_TOP + 0.0012);
    const knurl = new THREE.CylinderGeometry(R_PLAT, R_PLAT, rimH, 240, 3, true);
    const p = knurl.attributes.position;
    const perRow = 241;
    for (let i = 0; i < p.count; i++) {
      const k = (i % perRow) % 2 === 0 ? 1 : 1 - 0.0065;
      p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
    }
    knurl.computeVertexNormals();
    knurl.translate(0, Y_TOP + 0.0012 + rimH / 2, 0);
    rimParts.push(nonIndexed(knurl));
    const edge = new THREE.LatheGeometry([
      new THREE.Vector2(R_PLAT, PLAT_Y - 0.0017), new THREE.Vector2(R_PLAT - 0.0003, PLAT_Y - 0.0006),
      new THREE.Vector2(R_PLAT - 0.0011, PLAT_Y - 0.00005), new THREE.Vector2(R_PLAT - 0.0020, PLAT_Y),
    ], 120);
    rimParts.push(nonIndexed(edge));
    knurl.dispose(); edge.dispose();
  }
  const rimGeom = keep(mergeGeometries(rimParts, false));
  rimParts.forEach((g) => g.dispose());
  // Brushed aluminium, brushed around the rim: anisotropy runs along the cylinder's u (the
  // circumference), so a highlight stretches around the platter instead of sitting as a dot.
  const mRim = keep(PHYS
    ? new THREE.MeshPhysicalMaterial({ color: 0x80858d, roughness: 0.3, metalness: 1.0, anisotropy: 0.8, anisotropyRotation: 0 })
    : new THREE.MeshStandardMaterial({ color: 0x5d6168, roughness: 0.3, metalness: 1.0 }));
  const rim = new THREE.Mesh(rimGeom, mRim);
  rim.castShadow = true; rim.receiveShadow = true;
  platter.add(rim);

  // Platter top: satin black with fine concentric machining.
  const PT = Math.round(512 * ts);
  const platterCanvas = makeCanvas(PT, PT);
  paintPlatterTop(platterCanvas.getContext('2d'), PT, rand);
  const platterTex = keep(new THREE.CanvasTexture(platterCanvas));
  platterTex.colorSpace = THREE.SRGBColorSpace;
  platterTex.anisotropy = 8;
  const topGeom = keep(new THREE.RingGeometry(R_HUB - 0.0004, R_PLAT - 0.0019, 120, 2).rotateX(-Math.PI / 2));
  // RingGeometry UVs are planar over the OUTER radius — exactly what the canvas assumes.
  const mTop = keep(PHYS
    ? new THREE.MeshPhysicalMaterial({ map: platterTex, roughness: 0.5, metalness: 0.45, clearcoat: 0.18, clearcoatRoughness: 0.4 })
    : new THREE.MeshStandardMaterial({ map: platterTex, roughness: 0.5, metalness: 0.45 }));
  const top = new THREE.Mesh(topGeom, mTop);
  top.position.y = PLAT_Y;
  top.receiveShadow = true;
  platter.add(top);

  // Hub display (static — the drawn marker is what turns).
  const JD = Math.round(256 * ts);
  const jogCanvas = makeCanvas(JD, JD);
  const jctx = jogCanvas.getContext('2d');
  const jogTex = keep(new THREE.CanvasTexture(jogCanvas));
  jogTex.colorSpace = THREE.SRGBColorSpace;
  const mJog = keep(new THREE.MeshPhysicalMaterial({
    color: 0x000000, roughness: 0.08, metalness: 0.0, specularIntensity: 0.5,
    emissive: 0xffffff, emissiveMap: jogTex, emissiveIntensity: 1.2,
    clearcoat: PHYS ? 1.0 : 0.0, clearcoatRoughness: 0.03,
  }));
  const jogGeom = keep(new THREE.CircleGeometry(R_DISP, 64).rotateX(-Math.PI / 2));
  const jogDisp = new THREE.Mesh(jogGeom, mJog);
  jogDisp.name = `cdj${deckNumber}-jog-display`;
  jogDisp.position.set(JX, PLAT_Y + 0.0007, JZ);
  group.add(jogDisp);
  anchors.jog = anchor('jog', new THREE.Vector3(JX, PLAT_Y, JZ));
  anchors.jogEdge = anchor('jogEdge', new THREE.Vector3(JX, PLAT_Y, JZ + 0.088));

  // ── Tempo fader cap (moves) ───────────────────────────────────────────────
  const tempoCap = new THREE.Group();
  tempoCap.name = `cdj${deckNumber}-tempo-cap`;
  group.add(tempoCap);
  const TC_W = 0.0205, TC_D = 0.0125, TC_H = 0.0105;
  let tempoCapGeom;
  {
    const parts = [];
    const stem = new RoundedBoxGeometry(0.0026, 0.0040, 0.0060, 1, 0.0005);
    uvSolid(stem, uvApi.solid('stem')); stem.translate(0, 0.0015, 0); parts.push(stem);
    const body = new RoundedBoxGeometry(TC_W, TC_H - 0.0030, TC_D, 2, 0.0022);
    uvSolid(body, uvApi.solid('knob')); body.translate(0, 0.0030 + (TC_H - 0.0030) / 2, 0); parts.push(body);
    // grip ridges across the top (DJ's thumb side is +Z)
    for (const dz of [-0.0038, 0.0038]) {
      const r = new RoundedBoxGeometry(TC_W - 0.002, 0.0012, 0.0016, 1, 0.0005);
      uvSolid(r, uvApi.solid('grip')); r.translate(0, TC_H + 0.0002, dz); parts.push(r);
    }
    const line = new THREE.BoxGeometry(TC_W - 0.0036, 0.0003, 0.0011);
    uvSolid(line, uvApi.solid('white')); line.translate(0, TC_H + 0.00005, 0); parts.push(line);
    tempoCapGeom = keep(mergeGeometries(parts.map(nonIndexed), false));
    parts.forEach((g) => g.dispose());
    tempoCapGeom.setAttribute('ledColor', new THREE.BufferAttribute(new Float32Array(tempoCapGeom.attributes.position.count * 3), 3));
  }
  const tempoMesh = new THREE.Mesh(tempoCapGeom, mCaps);
  tempoMesh.castShadow = true;
  tempoCap.add(tempoMesh);
  tempoCap.position.set(TEMPO_X, Y_TOP, TEMPO_ZC);
  anchors.tempo = anchor('tempo', new THREE.Vector3(TEMPO_X, Y_TOP + TC_H + 0.0008, TEMPO_ZC));

  // ── LED writer ────────────────────────────────────────────────────────────
  const ledCache = {};
  const tmpC = new THREE.Color();
  let ledLo = Infinity, ledHi = -1;
  const setLed = (id, hex, intensity = 1) => {
    const key = hex ? `${hex}|${intensity.toFixed(3)}` : '0';
    if (ledCache[id] === key) return;
    ledCache[id] = key;
    const rs = ledRanges[id];
    if (!rs) return;
    let r = 0, g = 0, b = 0;
    if (hex) { tmpC.set(hex); r = tmpC.r * intensity; g = tmpC.g * intensity; b = tmpC.b * intensity; }
    const arr = ledAttr.array;
    for (const [start, count] of rs) {
      for (let v = start; v < start + count; v++) { arr[v * 3] = r; arr[v * 3 + 1] = g; arr[v * 3 + 2] = b; }
      ledLo = Math.min(ledLo, start); ledHi = Math.max(ledHi, start + count);
    }
  };
  const flushLeds = () => {
    if (ledHi < 0) return;
    ledAttr.clearUpdateRanges();
    ledAttr.addUpdateRange(ledLo * 3, (ledHi - ledLo) * 3);
    ledAttr.needsUpdate = true;
    ledLo = Infinity; ledHi = -1;
  };

  // ── State ────────────────────────────────────────────────────────────────
  const state = {
    playing: false, jogAngle: 0, jogTouch: false, tempo: 0, padsLit: [null, null, null, null, null, null, null, null],
    onAir: false,
    screen: {
      deckLabel: `DECK ${deckNumber}`, title: '', artist: '', bpm: null, key: '', elapsed: 0, remaining: 0,
      beatInBar: 0, waveColumns: [], overview: null, playhead: 0, loaded: false, color: accent,
    },
  };
  let screenDirty = true, jogDirty = true;
  const screenPeriod = 1 / Math.max(1, Math.min(20, Number(screenFps) || 20));   // contract: ≤ 20 fps
  let lastScreenT = -1e9, lastJogT = -1e9, lastJogAngle = NaN;

  let disposed = false;
  function set(next = {}) {
    if (!next || disposed) return deck;
    for (const k of ['playing', 'jogTouch', 'onAir']) if (k in next) state[k] = !!next[k];
    if ('jogAngle' in next && Number.isFinite(next.jogAngle)) state.jogAngle = next.jogAngle;
    if ('tempo' in next && Number.isFinite(next.tempo)) { state.tempo = Math.max(-1, Math.min(1, next.tempo)); screenDirty = true; }
    if (Array.isArray(next.padsLit)) { for (let i = 0; i < 8; i++) state.padsLit[i] = next.padsLit[i] || null; screenDirty = true; }
    if (next.screen) { Object.assign(state.screen, next.screen); screenDirty = true; jogDirty = true; }
    if ('playing' in next) { screenDirty = true; jogDirty = true; }
    return deck;
  }

  function update(dt = 0, t = 0) {
    if (disposed) return;
    const sc = state.screen;
    const loaded = !!sc.loaded;
    const deckCol = sc.color || accent;

    // Platter + tempo cap
    platter.rotation.y = -state.jogAngle;               // clockwise from above
    const tz = TEMPO_ZC + state.tempo * TEMPO_TRAVEL;   // + tempo = toward the DJ, like the real fader
    tempoCap.position.z = tz;
    anchors.tempo.position.z = tz;

    // LEDs
    const blink = (t % 0.5) < 0.25;
    // Dark caps, lit rings; the printed legend picks up a little of the ring's light.
    // Ring intensities stay near 1: past that, filmic tone mapping bleaches the hue.
    setLed('playRing', loaded ? '#18e04a' : null, state.playing ? 1.45 : (blink ? 1.45 : 0.1));
    setLed('play', loaded ? '#27e05c' : null, state.playing ? 0.07 : (blink ? 0.07 : 0));
    setLed('cueRing', loaded ? '#ff8a0a' : null, state.playing ? 0.5 : 1.45);
    setLed('cue', loaded ? '#ff9a1a' : null, state.playing ? 0.03 : 0.12);
    for (let i = 0; i < 8; i++) {
      const c = state.padsLit[i];
      setLed(`pad${i}`, c || '#ffffff', c ? 1.55 : 0.018);
    }
    setLed('onAirRing', state.onAir ? '#ff140a' : (loaded ? deckCol : '#ffffff'),
      state.onAir ? (state.jogTouch ? 2.0 : 1.35) : (loaded ? (state.jogTouch ? 1.2 : 0.35) : 0.02));
    setLed('jogRing', loaded ? deckCol : '#ffffff', loaded ? (state.jogTouch ? 2.8 : 1.3) : 0.03);
    setLed('tempoZero', Math.abs(state.tempo) < 0.01 ? '#34e06a' : null, 1.6);
    setLed('masterTempo', '#ff3b30', 0.9);
    setLed('sync', loaded ? '#f2f2f2' : null, 0.35);
    setLed('master', loaded && deckNumber === 1 ? '#ff9a1a' : null, 0.9);
    setLed('quantize', '#ff3b30', 0.7);
    setLed('jogMode', '#4aa3ff', 0.55);
    setLed('vinylLed', '#4aa3ff', 1.6);
    setLed('usbLed', loaded ? '#4aa3ff' : '#ffffff', loaded ? 1.6 : 0.04);
    setLed('linkLed', '#2fe07a', 1.3);
    setLed('sdLed', '#ffffff', 0.03);
    setLed('loopIn', loaded ? '#ff9a1a' : null, 0.12);
    setLed('loopOut', loaded ? '#ff9a1a' : null, 0.12);
    setLed('reloop', loaded ? '#ff9a1a' : null, 0.12);
    flushLeds();

    // Screens (throttled: main ≤ 20 fps, hub ≤ 30 fps)
    const moving = state.playing && loaded;
    if ((moving || screenDirty) && t - lastScreenT >= screenPeriod) {
      drawMainScreen(sctx, SW, SH, state, deckNumber, accent, t);
      screenTex.needsUpdate = true;
      lastScreenT = t; screenDirty = false;
    }
    const angMoved = state.jogAngle !== lastJogAngle;
    if ((angMoved || jogDirty) && t - lastJogT >= 1 / 30) {
      drawJogDisplay(jctx, JD, state, deckNumber, accent, t);
      jogTex.needsUpdate = true;
      lastJogT = t; jogDirty = false; lastJogAngle = state.jogAngle;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (group.parent) group.parent.remove(group);
    for (const d of disposables) { try { d.dispose(); } catch (_) { /* already gone */ } }
    disposables.length = 0;
  }

  const deck = { group, anchors, set, update, dispose, meshes, dims: CDJ_DIMS };
  update(0, 0);
  return deck;
}

// ── Plate print ───────────────────────────────────────────────────────────
function paintPlatePrint(ctx, o) {
  const { AW, hF, hH, yH0, PXM, DX0, DZ0, DS1, rand } = o;
  const X = (x) => (x - DX0) * PXM;
  const Zf = (z) => (z - DZ0) * PXM;          // flat plate
  const Sh = (s) => yH0 + (DS1 - s) * PXM;    // screen deck
  const mm = (v) => v * PXM / 1000;          // mm → px

  // Base: dark gunmetal, brushed along X; the screen deck a shade darker.
  const base = (y0, h, top, bot) => {
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    ctx.fillStyle = g; ctx.fillRect(0, y0, AW, h);
    // very fine anodised grain, a hint of brushing along X
    for (let i = 0; i < h * 0.7; i++) {
      const y = y0 + rand() * h;
      const a = 0.006 + rand() * 0.018;
      ctx.fillStyle = rand() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.4})`;
      const x0 = rand() * AW * 0.5;
      ctx.fillRect(x0, y, AW * (0.15 + rand() * 0.5), 1);
    }
    for (let i = 0; i < AW * h * 0.02; i++) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(rand() * AW, y0 + rand() * h, 1, 1);
    }
  };
  base(0, hF, '#2a2d31', '#25272b');
  base(yH0, hH, '#1d1f22', '#212327');

  ctx.fillStyle = INK; ctx.strokeStyle = INK;
  const text = (s, x, y, sizeMm, { align = 'center', weight = 700, alpha = 1, spacing = 0.08, font = FONT } = {}) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = INK;
    ctx.font = `${weight} ${mm(sizeMm)}px ${font}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    setSpacing(ctx, mm(sizeMm) * spacing);
    ctx.fillText(s, x, y);
    ctx.restore();
  };
  const line = (x0, y0, x1, y1, wMm = 0.28, alpha = 0.85) => {
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = INK; ctx.lineWidth = mm(wMm); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.restore();
  };
  // Bracket with a caption:  ┌── LOOP ──┐ spanning [xa, xb] at z
  const bracket = (label, xa, xb, y, sizeMm = 1.9) => {
    const cxp = (X(xa) + X(xb)) / 2;
    ctx.font = `700 ${mm(sizeMm)}px ${FONT}`; setSpacing(ctx, mm(sizeMm) * 0.1);
    const tw = ctx.measureText(label).width + mm(2.2);
    setSpacing(ctx, 0);
    line(X(xa), y, cxp - tw / 2, y); line(cxp + tw / 2, y, X(xb), y);
    line(X(xa), y, X(xa), y + mm(1.4)); line(X(xb), y, X(xb), y + mm(1.4));
    text(label, cxp, y, sizeMm, { spacing: 0.1 });
  };
  // Recessed well outline around a button (printed hairline frame)
  const frame = (x, z, w, d) => {
    ctx.save(); ctx.globalAlpha = 0.22; ctx.lineWidth = mm(0.25);
    roundRect(ctx, X(x - w / 2 - 0.0012), Zf(z - d / 2 - 0.0012), (w + 0.0024) * PXM, (d + 0.0024) * PXM, mm(1.6));
    ctx.stroke(); ctx.restore();
  };

  // ── Flat plate ──
  for (const [, x, z, w, d] of FLAT_BUTTONS) frame(x, z, w, d);
  bracket('LOOP', -0.1585, -0.0965, Zf(-0.0435));
  bracket('BEAT LOOP', -0.0835, -0.0435, Zf(-0.0435));
  text('MODE', (X(0.0525) + X(0.0745)) / 2, Zf(-0.0435), 1.7, { alpha: 0.9 });
  bracket('BEAT JUMP', 0.0965, 0.1365, Zf(-0.0435));
  bracket('CUE/LOOP CALL', -0.1585, -0.1185, Zf(-0.0225), 1.6);
  bracket('LOOP SIZE', -0.1145, -0.0745, Zf(-0.0225), 1.6);
  text('HOT CUE', X(-0.1330), Zf(-0.0635), 2.0);
  text('A — H', X(-0.1330), Zf(-0.0565), 1.5, { alpha: 0.6, weight: 600 });
  // pad wells
  for (let i = 0; i < 8; i++) frame(-0.091 + i * 0.026, -0.0600, 0.0215, 0.0145);
  bracket('SEARCH', -0.1585, -0.1185, Zf(0.0130), 1.6);
  bracket('TRACK SEARCH', -0.1585, -0.1185, Zf(0.0430), 1.6);
  // direction lever
  text('DIRECTION', X(-0.1385), Zf(0.0715), 1.5, { alpha: 0.9 });
  text('FWD', X(-0.1270), Zf(0.0790), 1.35, { align: 'left', alpha: 0.8 });
  text('REV', X(-0.1270), Zf(0.0900), 1.35, { align: 'left', alpha: 0.8 });
  // CUE / PLAY captions (printed above each big button)
  text('CUE', X(-0.1375), Zf(0.1110), 1.8);
  text('PLAY / PAUSE', X(-0.1375), Zf(0.1650), 1.6);
  // Right: jog mode, knobs
  text('VINYL', X(0.0985), Zf(-0.0200) + mm(2.2), 1.35, { alpha: 0.85 });
  text('VINYL SPEED ADJ.', X(0.1255), Zf(0.0020), 1.25, { alpha: 0.9 });
  text('TOUCH/BRAKE', X(0.1255), Zf(0.0045), 1.1, { alpha: 0.65 });
  text('JOG ADJUST', X(0.1505), Zf(0.0020), 1.25, { alpha: 0.9 });
  text('LIGHT  HEAVY', X(0.1505), Zf(0.0045), 1.1, { alpha: 0.65 });
  // pot scales
  for (const kx of [0.1255, 0.1505]) {
    ctx.save(); ctx.globalAlpha = 0.6; ctx.lineWidth = mm(0.25);
    for (let k = 0; k <= 10; k++) {
      const a = (-150 + k * 30) * Math.PI / 180;
      const r0 = mm(8.6), r1 = mm(k % 5 === 0 ? 10.2 : 9.5);
      const cxp = X(kx), cyp = Zf(-0.0095);
      ctx.beginPath(); ctx.moveTo(cxp + Math.sin(a) * r0, cyp - Math.cos(a) * r0); ctx.lineTo(cxp + Math.sin(a) * r1, cyp - Math.cos(a) * r1); ctx.stroke();
    }
    ctx.restore();
  }
  bracket('SYNC', 0.0935, 0.1595, Zf(0.0110), 1.6);
  text('TEMPO RANGE', X(0.1265), Zf(0.0415), 1.25, { alpha: 0.9 });
  text('±6 · 10 · 16 · WIDE', X(0.1265), Zf(0.0600), 1.05, { alpha: 0.65 });
  // Tempo scale
  text('TEMPO', X(TEMPO_X), Zf(0.0715), 1.9);
  text('RESET', X(0.1225), Zf(0.0775), 1.2, { alpha: 0.8 });
  {
    ctx.save(); ctx.lineWidth = mm(0.25);
    const x0 = X(TEMPO_X - 0.0120), n = 16;
    for (let k = 0; k <= n; k++) {
      const z = TEMPO_ZC - TEMPO_TRAVEL + (2 * TEMPO_TRAVEL * k) / n;
      const major = k % 4 === 0;
      ctx.globalAlpha = major ? 0.9 : 0.55;
      line(x0 - mm(major ? 2.6 : 1.5), Zf(z), x0, Zf(z), 0.25, major ? 0.9 : 0.55);
      line(X(TEMPO_X + 0.0120), Zf(z), X(TEMPO_X + 0.0120) + mm(major ? 2.6 : 1.5), Zf(z), 0.25, major ? 0.9 : 0.55);
    }
    ctx.restore();
    text('–', X(TEMPO_X - 0.0175), Zf(TEMPO_ZC - TEMPO_TRAVEL), 2.2);
    text('0', X(TEMPO_X - 0.0175), Zf(TEMPO_ZC), 1.8);
    text('+', X(TEMPO_X - 0.0175), Zf(TEMPO_ZC + TEMPO_TRAVEL), 2.2);
    // slot lip highlight
    ctx.save(); ctx.globalAlpha = 0.35; ctx.lineWidth = mm(0.35);
    roundRect(ctx, X(TEMPO_X - 0.0030), Zf(TEMPO_Z0 - 0.0015), mm(6), (TEMPO_Z1 - TEMPO_Z0 + 0.003) * PXM, mm(2));
    ctx.stroke(); ctx.restore();
  }
  // Jog area: darken under the well so no print shows at a grazing angle
  ctx.fillStyle = '#0b0b0c';
  ctx.beginPath(); ctx.arc(X(JX), Zf(JZ), (R_WELL - 0.0005) * PXM, 0, Math.PI * 2); ctx.fill();
  // Front strip: the only mark
  text('SHAPE', X(0), Zf(0.2175), 2.6, { weight: 800, spacing: 0.42, alpha: 0.78 });

  // ── Screen deck ──
  for (const [, x, s, w, d] of HOOD_BUTTONS) {
    ctx.save(); ctx.globalAlpha = 0.22; ctx.lineWidth = mm(0.25); ctx.strokeStyle = INK;
    roundRect(ctx, X(x - w / 2 - 0.0012), Sh(s + d / 2 + 0.0012), (w + 0.0024) * PXM, (d + 0.0024) * PXM, mm(1.5));
    ctx.stroke(); ctx.restore();
  }
  text('USB', X(-0.1375), Sh(0.1340), 1.7);
  text('STOP', X(-0.1180), Sh(0.1085), 1.15, { alpha: 0.85 });
  text('SD', X(0.1335), Sh(0.1340), 1.7);
  text('LINK', X(0.1135), Sh(0.1395), 1.15, { alpha: 0.85 });
  // ring of dots around the rotary selector
  {
    const cxp = X(0.1335), cyp = Sh(0.0555);
    ctx.save(); ctx.globalAlpha = 0.5;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(cxp + Math.cos(a) * mm(16.2), cyp + Math.sin(a) * mm(16.2), mm(0.28), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    text('PUSH', cxp, cyp + mm(19.6), 1.1, { alpha: 0.65 });
  }
  // hairline between the browse column and the screen
  line(X(-0.1080), Sh(0.140), X(-0.1080), Sh(0.012), 0.2, 0.25);
  line(X(0.1080), Sh(0.140), X(0.1080), Sh(0.012), 0.2, 0.25);
  ctx.globalAlpha = 1;
}

// ── Platter top texture: satin black, concentric machining, soft sheen ──
function paintPlatterTop(ctx, S, rand) {
  const c = S / 2;
  ctx.fillStyle = '#141517'; ctx.fillRect(0, 0, S, S);
  for (let r = c; r > 0; r -= 0.9) {
    const a = 0.008 + rand() * 0.03;
    ctx.strokeStyle = rand() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.5})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.stroke();
  }
  // a few machined step rings
  // one machined step just inside the rim, one around the hub
  for (const [f, a] of [[0.975, 0.10], [0.43, 0.06]]) {
    ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = S * 0.003;
    ctx.beginPath(); ctx.arc(c, c, c * f, 0, Math.PI * 2); ctx.stroke();
  }
}

// ── Main screen UI (1024 × 640 design units) ──────────────────────────────
function drawMainScreen(ctx, SW, SH, state, deckNumber, accent, t) {
  const k = SW / 1024;
  const sc = state.screen;
  const col = sc.color || accent;
  const loaded = !!sc.loaded;
  ctx.save();
  ctx.setTransform(k, 0, 0, k, 0, 0);
  // background
  ctx.fillStyle = '#040506'; ctx.fillRect(0, 0, 1024, 640);

  // ── Header ──
  const hdrH = 96;
  const hg = ctx.createLinearGradient(0, 0, 0, hdrH);
  hg.addColorStop(0, '#15171b'); hg.addColorStop(1, '#0c0d10');
  ctx.fillStyle = hg; ctx.fillRect(0, 0, 1024, hdrH);
  ctx.fillStyle = '#1f2227'; ctx.fillRect(0, hdrH, 1024, 2);
  // deck badge
  const num = String(sc.deckLabel || `DECK ${deckNumber}`).match(/\d+/);
  roundRect(ctx, 14, 12, 72, 72, 10);
  ctx.fillStyle = loaded ? col : '#2a2d33'; ctx.fill();
  ctx.fillStyle = loaded ? '#050505' : '#8a8f98';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 13px ${FONT}`; setSpacing(ctx, 2); ctx.fillText('DECK', 50, 30); setSpacing(ctx, 0);
  ctx.font = `800 44px ${FONT}`; ctx.fillText(num ? num[0] : String(deckNumber), 50, 60);
  // source chip
  ctx.textAlign = 'left';
  roundRect(ctx, 100, 14, 56, 22, 5); ctx.fillStyle = '#23262c'; ctx.fill();
  ctx.fillStyle = '#b8bec8'; ctx.font = `700 13px ${FONT}`; setSpacing(ctx, 1); ctx.fillText('USB', 112, 26); setSpacing(ctx, 0);
  // title / artist
  ctx.fillStyle = loaded ? '#f4f5f7' : '#5f656f';
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText(fitText(ctx, loaded ? (sc.title || 'Untitled') : 'NO TRACK', 560), 168, 30);
  ctx.fillStyle = loaded ? '#9aa3af' : '#454b54';
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText(fitText(ctx, loaded ? (sc.artist || '') : 'Load a track to begin', 560), 168, 68);

  // BPM + key + tempo (right)
  const bpm = loaded && Number.isFinite(sc.bpm) ? sc.bpm : null;
  ctx.textAlign = 'right';
  ctx.fillStyle = bpm ? '#ffffff' : '#4d535c';
  ctx.font = `700 52px ${MONO}`;
  ctx.fillText(bpm ? bpm.toFixed(1) : '---.-', 1010, 44);
  ctx.fillStyle = '#7d8591'; ctx.font = `700 13px ${FONT}`; setSpacing(ctx, 2);
  ctx.fillText('BPM', 1010, 80); setSpacing(ctx, 0);
  // key pill
  const key = loaded && sc.key ? String(sc.key) : '—';
  roundRect(ctx, 750, 62, 62, 26, 6); ctx.fillStyle = loaded && sc.key ? '#1d6b3a' : '#23262c'; ctx.fill();
  ctx.fillStyle = loaded && sc.key ? '#bff5cf' : '#6a707a'; ctx.textAlign = 'center'; ctx.font = `700 17px ${MONO}`;
  ctx.fillText(key, 781, 76);
  // tempo %
  const pct = state.tempo * 6;
  ctx.textAlign = 'right'; ctx.fillStyle = '#c8ced8'; ctx.font = `700 19px ${MONO}`;
  ctx.fillText(`${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(2)}%`, 912, 76);
  ctx.fillStyle = '#6d7480'; ctx.font = `700 12px ${FONT}`; ctx.fillText('±6', 936, 77);
  // MT chip
  roundRect(ctx, 738, 20, 36, 22, 5); ctx.fillStyle = '#3a1512'; ctx.fill();
  ctx.fillStyle = '#ff6a5c'; ctx.textAlign = 'center'; ctx.font = `800 13px ${FONT}`; ctx.fillText('MT', 756, 32);

  // ── Zoomed waveform ──
  const wy0 = 106, wh = 250, wmid = wy0 + wh / 2;
  ctx.fillStyle = '#07080a'; ctx.fillRect(0, wy0, 1024, wh);
  // centre reference line
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, wmid, 1024, 1);
  if (loaded) {
    const cols = Array.isArray(sc.waveColumns) ? sc.waveColumns : [];
    const n = cols.length;
    if (n > 0) {
      const cw = 1024 / n;
      const half = wh / 2 - 6;
      const bar = (c, hgt, i) => { if (hgt > 0.2) ctx.fillRect(i * cw, wmid - hgt, Math.max(1, cw + 0.3), hgt * 2); };
      ctx.fillStyle = '#1f47d6';
      for (let i = 0; i < n; i++) bar(cols[i], Math.min(1, cols[i].low || 0) * half, i);
      ctx.fillStyle = '#f0a02e';
      for (let i = 0; i < n; i++) bar(cols[i], Math.min(1, cols[i].mid || 0) * half * 0.78, i);
      ctx.fillStyle = '#f4f4f4';
      for (let i = 0; i < n; i++) bar(cols[i], Math.min(1, cols[i].high || 0) * half * 0.5, i);
    }
    // beat grid (window defaults to 6 s)
    if (bpm) {
      const win = sc.windowSec || 6;
      const beatF = Number.isFinite(sc.beat) ? sc.beat : (sc.elapsed || 0) * bpm / 60;
      const frac = beatF - Math.floor(beatF);
      const ppb = 1024 / (win * bpm / 60);
      const bib = (sc.beatInBar | 0) & 3;
      for (let j = -12; j <= 12; j++) {
        const x = 512 + (j - frac) * ppb;
        if (x < 0 || x > 1024) continue;
        const down = (((bib + j) % 4) + 4) % 4 === 0;
        ctx.fillStyle = down ? 'rgba(255,70,60,0.95)' : 'rgba(255,255,255,0.55)';
        ctx.fillRect(x - 1, wy0, 2, down ? 14 : 9);
        ctx.fillRect(x - 1, wy0 + wh - (down ? 14 : 9), 2, down ? 14 : 9);
        if (down) { ctx.fillStyle = 'rgba(255,70,60,0.10)'; ctx.fillRect(x - 0.5, wy0 + 14, 1, wh - 28); }
      }
    }
    // playhead
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(509, wy0, 7, wh);
    ctx.fillStyle = '#ff3b30'; ctx.fillRect(511, wy0, 3, wh);
    ctx.beginPath(); ctx.moveTo(504, wy0); ctx.lineTo(521, wy0); ctx.lineTo(512.5, wy0 + 10); ctx.closePath(); ctx.fill();
  } else {
    // empty state
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 1;
    for (let x = 64; x < 1024; x += 128) { ctx.beginPath(); ctx.moveTo(x, wy0 + 8); ctx.lineTo(x, wy0 + wh - 8); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(511, wy0, 2, wh);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8ebef'; ctx.font = `800 46px ${FONT}`; setSpacing(ctx, 6);
    ctx.fillText('LOAD TRACK', 512, wmid - 14); setSpacing(ctx, 0);
    ctx.fillStyle = '#6f7682'; ctx.font = `600 20px ${FONT}`;
    ctx.fillText('BROWSE  ›  USB  ›  select a track, then press the selector', 512, wmid + 34);
  }

  // ── Hot-cue strip ──
  const hy = 366, hh = 44, hw = 1024 / 8;
  for (let i = 0; i < 8; i++) {
    const c = state.padsLit[i];
    const x = i * hw + 4;
    roundRect(ctx, x, hy, hw - 8, hh, 6);
    ctx.fillStyle = c && loaded ? rgba(c, 0.22) : '#101216'; ctx.fill();
    if (c && loaded) { ctx.fillStyle = c; ctx.fillRect(x, hy + hh - 5, hw - 8, 5); }
    ctx.fillStyle = c && loaded ? '#ffffff' : '#4c525c';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = `800 18px ${FONT}`;
    ctx.fillText(PAD_LETTERS[i], x + 10, hy + hh / 2 - 1);
    ctx.fillStyle = c && loaded ? '#c9ced6' : '#3a3f47'; ctx.font = `600 13px ${FONT}`;
    ctx.fillText(c && loaded ? 'HOT CUE' : '—', x + 32, hy + hh / 2);
  }

  // ── Time row ──
  const ty = 454;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left'; ctx.fillStyle = '#7d8591'; ctx.font = `700 13px ${FONT}`; setSpacing(ctx, 2);
  ctx.fillText('ELAPSED', 16, ty - 6); ctx.fillText('REMAIN', 300, ty - 6); setSpacing(ctx, 0);
  ctx.fillStyle = loaded ? '#ffffff' : '#4d535c'; ctx.font = `700 40px ${MONO}`;
  ctx.fillText(loaded ? fmtTime(sc.elapsed) : '--:--.-', 14, ty + 38);
  ctx.fillStyle = loaded ? '#ffd166' : '#4d535c';
  ctx.fillText(loaded ? `-${fmtTime(sc.remaining)}` : '--:--.-', 296, ty + 38);
  // beat counter
  const bib = (sc.beatInBar | 0) & 3;
  for (let i = 0; i < 4; i++) {
    roundRect(ctx, 610 + i * 34, ty + 8, 28, 28, 4);
    ctx.fillStyle = loaded && state.playing && i === bib ? col : (loaded && i <= bib ? rgba(col, 0.28) : '#16181c'); ctx.fill();
  }
  ctx.fillStyle = '#7d8591'; ctx.font = `700 13px ${FONT}`; setSpacing(ctx, 2); ctx.textAlign = 'left';
  ctx.fillText('BEAT', 610, ty - 6); setSpacing(ctx, 0);
  // chips: SYNC / MASTER / QUANTIZE
  const chip = (label, x, on, c) => {
    roundRect(ctx, x, ty + 10, 88, 24, 5); ctx.fillStyle = on ? rgba(c, 0.22) : '#14161a'; ctx.fill();
    ctx.fillStyle = on ? c : '#4c525c'; ctx.textAlign = 'center'; ctx.font = `800 13px ${FONT}`; setSpacing(ctx, 1);
    ctx.textBaseline = 'middle'; ctx.fillText(label, x + 44, ty + 22); setSpacing(ctx, 0); ctx.textBaseline = 'alphabetic';
  };
  chip('SYNC', 760, loaded, '#e8e8e8');
  chip(deckNumber === 1 ? 'MASTER' : 'QUANTIZE', 856, loaded, deckNumber === 1 ? '#ffa23a' : '#ff5a4d');
  // progress bar
  const ph = loaded ? Math.max(0, Math.min(1, sc.playhead || 0)) : 0;
  ctx.fillStyle = '#16181c'; ctx.fillRect(16, ty + 52, 992, 6);
  if (loaded) { ctx.fillStyle = col; ctx.fillRect(16, ty + 52, 992 * ph, 6); }

  // ── Overview ──
  const oy = 532, oh = 92, omid = oy + oh / 2;
  ctx.fillStyle = '#0a0b0e'; ctx.fillRect(12, oy, 1000, oh);
  if (loaded) {
    const ov = Array.isArray(sc.overview) && sc.overview.length ? sc.overview : null;
    if (ov) {
      const n = ov.length, cw = 1000 / n, half = oh / 2 - 4;
      const px = 12 + 1000 * ph;
      for (let pass = 0; pass < 3; pass++) {
        const key2 = pass === 0 ? 'low' : pass === 1 ? 'mid' : 'high';
        const sclH = pass === 0 ? 1 : pass === 1 ? 0.78 : 0.5;
        const liveCol = pass === 0 ? '#1f47d6' : pass === 1 ? '#f0a02e' : '#f4f4f4';
        const doneCol = pass === 0 ? '#39404d' : pass === 1 ? '#565e6b' : '#8a919c';
        for (let i = 0; i < n; i++) {
          const x = 12 + i * cw;
          const hgt = Math.min(1, ov[i][key2] || 0) * half * sclH;
          ctx.fillStyle = x < px ? doneCol : liveCol;
          ctx.fillRect(x, omid - hgt, Math.max(1, cw + 0.3), hgt * 2);
        }
      }
    } else {
      ctx.fillStyle = '#1b1e24'; ctx.fillRect(12, omid - 1, 1000, 2);
    }
    const px = 12 + 1000 * ph;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(px - 1, oy - 2, 3, oh + 4);
  } else {
    ctx.fillStyle = '#1b1e24'; ctx.fillRect(12, omid - 1, 1000, 2);
  }
  ctx.restore();
}

// ── On-jog display (square canvas, circular content) ──────────────────────
function drawJogDisplay(ctx, S, state, deckNumber, accent, t) {
  const sc = state.screen;
  const col = sc.color || accent;
  const loaded = !!sc.loaded;
  const c = S / 2, R = S / 2;
  ctx.save();
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
  const g = ctx.createRadialGradient(c, c, R * 0.1, c, c, R);
  g.addColorStop(0, '#0c0e12'); g.addColorStop(1, '#030304');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();

  // outer tick ring
  ctx.strokeStyle = loaded ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)';
  ctx.lineWidth = S * 0.008;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r0 = R * (i % 5 === 0 ? 0.80 : 0.84), r1 = R * 0.9;
    ctx.beginPath(); ctx.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0); ctx.lineTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1); ctx.stroke();
  }
  if (loaded) {
    // rotating position marker (clockwise from 12 o'clock)
    const a = state.jogAngle;
    ctx.strokeStyle = col; ctx.lineWidth = S * 0.075; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(c, c, R * 0.87, a - Math.PI / 2 - 0.22, a - Math.PI / 2 + 0.22); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = S * 0.04;
    ctx.beginPath(); ctx.arc(c, c, R * 0.87, a - Math.PI / 2 - 0.035, a - Math.PI / 2 + 0.035); ctx.stroke();
    // track position arc
    const ph = Math.max(0, Math.min(1, sc.playhead || 0));
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = S * 0.03;
    ctx.beginPath(); ctx.arc(c, c, R * 0.68, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.85);
    ctx.beginPath(); ctx.arc(c, c, R * 0.68, -Math.PI / 2, -Math.PI / 2 + ph * Math.PI * 2); ctx.stroke();
    // centre readout
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${S * 0.26}px ${FONT}`;
    ctx.fillText(String(deckNumber), c, c - S * 0.03);
    ctx.fillStyle = state.playing ? col : '#8a919c'; ctx.font = `800 ${S * 0.075}px ${FONT}`; setSpacing(ctx, S * 0.01);
    ctx.fillText(state.playing ? 'VINYL' : 'PAUSE', c, c + S * 0.16); setSpacing(ctx, 0);
    ctx.fillStyle = '#9aa3af'; ctx.font = `700 ${S * 0.07}px ${MONO}`;
    ctx.fillText(`-${fmtTime(sc.remaining).slice(0, 5)}`, c, c - S * 0.22);
  } else {
    ctx.fillStyle = '#5a606a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${S * 0.22}px ${FONT}`; ctx.fillText(String(deckNumber), c, c - S * 0.02);
    ctx.font = `700 ${S * 0.07}px ${FONT}`; setSpacing(ctx, S * 0.01); ctx.fillText('NO TRACK', c, c + S * 0.17); setSpacing(ctx, 0);
  }
  ctx.restore();
}
