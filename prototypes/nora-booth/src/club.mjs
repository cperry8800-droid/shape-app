// club.mjs — the stage of CLUB SHAPE, Shape Radio's flagship venue, around Nora's booth.
//
// World frame (the "DJ frame", see CONTRACT.md): metres, +Y up, the DJ stands at
// z ≈ +0.30 facing −Z (the crowd), the LED screen is behind her.
//
//   dance floor  y = FLOOR_Y (−0.66)  — the crowd stands here, x ±7, z −1.8 … −34
//   stage deck   y = STAGE_Y (−0.18)  — a raised deck with a rounded, LED-lined front
//   DJ riser     y = STAND_Y ( 0.00)  — the DJ's feet (exported as club.standY)
//   booth table  y = 0.92             — flight case, x ±0.75, z −0.40 … +0.22
//   the PORTAL   — a black monolith, x ±5.5, from the deck to y 8.8, face z 1.9 … 3.2,
//                  holding a 7.2 × 4.2 m dot-matrix LED screen (face z 2.0) and a top truss
//
// This module owns the STAGE end only: the portal, the screen, the stage deck, the booth,
// the beams, the crowd and a floor under the crowd. The hall itself (walls, balconies,
// palms, lounges, ceiling, skylight, skyline) is clubVenue.mjs.
//
// The module builds everything from primitives and small canvas textures — no assets,
// no Math.random (a seeded PRNG), no clock (the caller passes t).
//
// It also owns the room's atmosphere: on the first update() it finds the Scene it was
// added to and, if the scene has none of its own, installs a FogExp2 haze, a matching
// background and a small pre-filtered Club Shape environment (a bright ice-white screen
// at one end, warm gold balconies down both sides, an ice ring overhead) so the gear's
// metal reflects the venue instead of nothing. dispose() restores whatever it replaced.
// Call club.attach(scene) to do this eagerly instead.
//
// Photosensitivity: nothing here flashes faster than the beat, and the beat-locked sweep
// on the screen is capped at 3 sweeps/s. `reducedMotion: true` (create or set) removes the
// sweep, the kick pulses and fast beam movement.

import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadCrowdPack, createAvatarCrowd } from './crowdAvatars.mjs';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

export const CLUB_DIMS = {
  FLOOR_Y: -0.66,
  STAGE_Y: -0.18,
  STAND_Y: 0.0,
  TABLE_Y: 0.92,
  BOOTH: { x0: -0.75, x1: 0.75, z0: -0.40, z1: 0.22 },
  // the LED screen: its face plane, size and bottom edge (just above the DJ's head)
  WALL: { z: 2.0, w: 7.2, h: 4.2, y0: 1.9 },
  // the black proscenium around the screen
  PORTAL: { x: 5.5, top: 8.8, z0: 1.9, z1: 3.2 },
  // the stage deck: back edge, where the sides turn into the rounded front, and its apex
  STAGE: { x: 5.5, back: 3.2, sideZ: 0.6, frontZ: -1.45 },
  CROWD: { x: 7.0, z0: -1.8, z1: -34.0 },
};

const { FLOOR_Y, STAGE_Y, STAND_Y, TABLE_Y, BOOTH, WALL, PORTAL, STAGE, CROWD } = CLUB_DIMS;
const FOG_COLOR = 0x070a12;
const FOG_DENSITY = 0.012;
const BG_COLOR = 0x05070c;

// LED screen matrix: round dots on a 37.5 mm pitch, 192 × 112 (fine enough to carry the
// wordmark; the shader resolves a dot to its area coverage once it drops under ~2 px).
const WALL_COLS = 192;
const WALL_ROWS = 112;
const SPEC_TEX = 32;           // spectrum texture width (bars used: SPEC_BARS)
const BAR_DOTS = 4;            // a spectrum bar is 3 lit dots + 1 dark
const SPEC_BARS = WALL_COLS / 2 / BAR_DOTS; // 24 per half, mirrored

// Club Shape stage palette: cool white / ice blue (venue gold is the venue module's).
const ICE = '#d7ecff';
const ICE_DEEP = '#a9d4ff';

// ── small helpers ───────────────────────────────────────────────────────────

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
const gauss = (x, m, s) => Math.exp(-((x - m) * (x - m)) / (2 * s * s));
const fract = (x) => x - Math.floor(x);

/**
 * The "hot" partner of an accent: the website Signal Field's rule — rotate the hue by
 * the offset that turns Shape teal (#34d6c5) into its amber (#e0a24a), take amber's
 * saturation and the same lightness step. hotFor('#34d6c5') ≈ '#e0a24a'.
 */
export function hotFor(THREE, accent) {
  const c = new THREE.Color(accent);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl, THREE.SRGBColorSpace);
  if (hsl.s < 0.12) return new THREE.Color(accent); // a mono accent has no hot partner
  const h = fract(hsl.h - 138.5 / 360 + 1);
  return new THREE.Color().setHSL(h, 0.708, clamp(hsl.l + 0.063, 0, 0.9), THREE.SRGBColorSpace);
}

/** The Shape mark, exactly as public/logo-triangles-only.svg (viewBox 60 14 80 72). */
const SHAPE_MARK = [
  [[72, 38], [72, 82], [105, 60]],   // pointing right
  [[128, 18], [128, 62], [95, 40]],  // pointing left, offset
];
const MARK_BOX = { x0: 72, x1: 128, y0: 18, y1: 82 }; // tight bounds of the two polygons

/** Draw the Shape mark filled, centred at (cx, cy), `h` pixels tall. */
function drawMark(g, cx, cy, h) {
  const k = h / (MARK_BOX.y1 - MARK_BOX.y0);
  const mx = (MARK_BOX.x0 + MARK_BOX.x1) / 2, my = (MARK_BOX.y0 + MARK_BOX.y1) / 2;
  for (const tri of SHAPE_MARK) {
    g.beginPath();
    tri.forEach(([x, y], i) => {
      const px = cx + (x - mx) * k, py = cy + (y - my) * k;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    });
    g.closePath();
    g.fill();
  }
}

const FONT_STACK = '"Helvetica Neue", "Inter", Roboto, "Liberation Sans", Arial, sans-serif';

/** Letter-spaced text drawn glyph by glyph (canvas letterSpacing is not everywhere). */
function spacedText(g, text, cx, baseline, spacing) {
  const widths = [...text].map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let x = cx - total / 2;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  [...text].forEach((ch, i) => { g.fillText(ch, x, baseline); x += widths[i] + spacing; });
  return total;
}

// ── canvas textures ─────────────────────────────────────────────────────────

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/**
 * The screen's idle artwork, one texel per LED dot: a thin square outline, the Shape mark
 * inside it and the letter-spaced wordmark CLUB SHAPE under it. Drawn at 4× and box-filtered
 * down so a stroke thinner than a dot still lands as a partial (dimmer) dot, not a gap.
 */
function screenMaskTexture(THREE, cols, rows) {
  const S = 4, W = cols * S, H = rows * S; // 768 × 448
  const c = makeCanvas(W, H);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff';
  const px = (n) => n * S;
  // square outline, one dot wide, snapped to the dot grid
  const side = 60, sx = Math.round((cols - side) / 2), sy = 9;
  g.fillRect(px(sx), px(sy), px(side), px(1));
  g.fillRect(px(sx), px(sy + side - 1), px(side), px(1));
  g.fillRect(px(sx), px(sy), px(1), px(side));
  g.fillRect(px(sx + side - 1), px(sy), px(1), px(side));
  // the Shape mark, centred in the square
  drawMark(g, px(sx + side / 2), px(sy + side / 2), px(36));
  // the wordmark: light weight, wide tracking, ~14 dots cap height
  const capDots = 14;
  let fs = Math.round(px(capDots) / 0.72);
  g.font = `300 ${fs}px ${FONT_STACK}`;
  let spacing = fs * 0.42;
  const word = 'CLUB SHAPE';
  const maxW = px(cols) * 0.86;
  let w = [...word].reduce((a, ch) => a + g.measureText(ch).width, 0) + spacing * (word.length - 1);
  if (w > maxW) { const k = maxW / w; fs = Math.floor(fs * k); spacing *= k; g.font = `300 ${fs}px ${FONT_STACK}`; }
  const top = sy + side + 9; // rows
  spacedText(g, word, W / 2, px(top) + fs * 0.72, spacing);

  // box-filter down to one value per dot; DataTexture row 0 is the BOTTOM row
  const img = g.getImageData(0, 0, W, H).data;
  const out = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      let s = 0;
      for (let yy = 0; yy < S; yy++) {
        const row = (r * S + yy) * W;
        for (let xx = 0; xx < S; xx++) s += img[(row + q * S + xx) * 4];
      }
      out[(rows - 1 - r) * cols + q] = Math.round(s / (S * S));
    }
  }
  const t = new THREE.DataTexture(out, cols, rows, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** Scuffed polished-concrete roughness map (green channel read as roughness). */
function floorRoughnessTexture(THREE, rnd) {
  const S = 512;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(70,70,70)';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 140; i++) {
    const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 90;
    const v = Math.floor(40 + rnd() * 90);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${v},${v},${v},0.35)`);
    grd.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = grd;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.save(); g.translate(ox, oy); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.restore();
    }
  }
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2, l = 6 + rnd() * 40;
    const v = Math.floor(110 + rnd() * 110);
    g.strokeStyle = `rgba(${v},${v},${v},${0.15 + rnd() * 0.3})`;
    g.lineWidth = 0.6 + rnd() * 2.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  g.strokeStyle = 'rgba(200,200,200,0.55)';
  g.lineWidth = 2;
  for (let k = 0; k <= 4; k++) {
    g.beginPath(); g.moveTo(0, k * S / 4); g.lineTo(S, k * S / 4); g.stroke();
    g.beginPath(); g.moveTo(k * S / 4, 0); g.lineTo(k * S / 4, S); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Flight-case laminate: a fine pebbled texture for the black panels. */
function laminateTexture(THREE, rnd) {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(150,150,150)';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const v = Math.floor(100 + rnd() * 120);
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/**
 * The booth's crowd-facing fascia, as at Club Shape: black laminate, three horizontal
 * white light slats across it and a small white Shape mark under them.
 */
function fasciaTextures(THREE, rnd) {
  const W = 1024, H = 600;
  const slatY = [0.2, 0.34, 0.48].map((f) => Math.round(H * f));
  const slatH = 12, sx0 = 64, sx1 = W - 64;
  const markCy = Math.round(H * 0.74), markH = 104;

  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#0b0b0d';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 16000; i++) {
    const v = Math.floor(9 + rnd() * 13);
    g.fillStyle = `rgb(${v},${v},${v + 1})`;
    g.fillRect(rnd() * W, rnd() * H, 1.5, 1.5);
  }
  // routed channels the slats sit in (a darker recess with a lit diffuser inside)
  for (const y of slatY) {
    g.fillStyle = '#030304'; g.fillRect(sx0 - 6, y - 6, sx1 - sx0 + 12, slatH + 12);
    g.fillStyle = '#c9d2da'; g.fillRect(sx0, y, sx1 - sx0, slatH);
  }
  g.fillStyle = '#c9d2da';
  drawMark(g, W / 2, markCy, markH);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;

  const e = makeCanvas(W, H);
  const ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  ge.fillStyle = '#ffffff';
  for (const y of slatY) ge.fillRect(sx0, y, sx1 - sx0, slatH);
  drawMark(ge, W / 2, markCy, markH);
  const emissiveMap = new THREE.CanvasTexture(e);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.anisotropy = 4;
  return { map, emissiveMap };
}

/** Speaker grille: perforated steel, tiled. */
function grilleTexture(THREE) {
  const S = 128;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#1a1a1c'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#050506';
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    g.beginPath(); g.arc(x * 8 + (y % 2) * 4 + 2, y * 8 + 4, 2.4, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ── geometry helpers ────────────────────────────────────────────────────────

/** A cylinder between two points (truss chords/lacing). */
function rod(THREE, a, b, r, seg = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

/** Square box truss from a to b. */
function trussGeometry(THREE, a, b, size = 0.29, chordR = 0.024, laceR = 0.009) {
  const parts = [];
  const axis = new THREE.Vector3().subVectors(b, a);
  const len = axis.length();
  axis.normalize();
  const up = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(axis, up).normalize();
  const v = new THREE.Vector3().crossVectors(u, axis).normalize();
  const h = size / 2;
  const corners = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([p, q]) =>
    new THREE.Vector3().addScaledVector(u, p).addScaledVector(v, q));
  for (const c of corners) parts.push(rod(THREE, a.clone().add(c), b.clone().add(c), chordR, 6));
  const bays = Math.max(1, Math.round(len / size));
  const step = len / bays;
  for (let i = 0; i < bays; i++) {
    const p0 = a.clone().addScaledVector(axis, i * step);
    const p1 = a.clone().addScaledVector(axis, (i + 1) * step);
    for (let f = 0; f < 4; f++) {
      const c0 = corners[f], c1 = corners[(f + 1) % 4];
      const s = (i % 2 === 0);
      parts.push(rod(THREE, p0.clone().add(s ? c0 : c1), p1.clone().add(s ? c1 : c0), laceR, 4));
    }
  }
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}

function placed(g, x, y, z, rx = 0, ry = 0, rz = 0, THREE) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

/** An axis-aligned box given by its min/max corners. */
function boxAt(THREE, x0, x1, y0, y1, z0, z1, round = 0) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  const g = round > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(round, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

/** Strip every attribute except position/normal/uv so disparate primitives merge. */
function clean(g) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  return g.index ? g.toNonIndexed() : g;
}
function merge(list) {
  const gs = list.map(clean);
  const m = mergeGeometries(gs);
  gs.forEach((g) => g.dispose());
  list.forEach((g) => g.dispose());
  return m;
}

/**
 * A thin vertical ribbon following a polyline in XZ (points carry their outward normal),
 * centred at height y — the stage-front LED lines. Faces outward.
 */
function ribbonGeometry(THREE, pts, y, h) {
  const pos = [], nor = [], uv = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const quad = [[a, y - h / 2, 0], [b, y - h / 2, 1], [b, y + h / 2, 1], [a, y - h / 2, 0], [b, y + h / 2, 1], [a, y + h / 2, 0]];
    // winding so the face normal points along the outward normal
    const ex = b.x - a.x, ez = b.z - a.z;
    const nx = (a.nx + b.nx) / 2, nz = (a.nz + b.nz) / 2;
    const flip = (ez * 1 * nx - ex * 1 * nz) > 0; // sign of (edge × up) · n
    const order = flip ? [0, 2, 1, 3, 5, 4] : [0, 1, 2, 3, 4, 5];
    for (const k of order) {
      const [p, yy, u] = quad[k];
      pos.push(p.x, yy, p.z); nor.push(p.nx, 0, p.nz); uv.push(u, yy > y ? 1 : 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** The front edge of the stage deck: z at a given x (the elliptical nose). */
function stageFrontZ(x) {
  const u = clamp(Math.abs(x) / STAGE.x, 0, 1);
  return STAGE.sideZ - (STAGE.sideZ - STAGE.frontZ) * Math.sqrt(1 - u * u);
}

// ── shaders ─────────────────────────────────────────────────────────────────

const WALL_VERT = /* glsl */`
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

// The Signal Field: round dots on a fixed pitch. The idle artwork (square, mark, wordmark)
// is sampled into the dots from a one-texel-per-dot mask; a dim mirrored spectrum sits
// behind it; the kick lifts the whole panel; on the drop a beat-locked sweep crosses it.
const WALL_FRAG = /* glsl */`
uniform sampler2D uSpec;   // x = bar index from the centre; r = level, g = peak
uniform sampler2D uMask;   // the artwork, one texel per dot
uniform vec2 uGrid;        // cols, rows
uniform vec3 uIce;         // cool white / ice blue
uniform vec3 uIceDeep;
uniform vec3 uTint;        // the accent, a light tint on the spectrum only
uniform float uKick;
uniform float uLevel;
uniform float uBeat;       // continuous beat position
uniform float uSweep;      // 0..1: the drop sweep (0 under reduced motion)
uniform float uSweepDiv;   // beats per sweep (keeps it ≤ 3/s)
uniform float uMotion;     // 1 normal, small under reduced motion
uniform float uTime;
uniform vec3 uFogColor;
uniform float uFogDensity;
varying vec2 vUv;
varying float vDepth;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 cell = vUv * uGrid;
  vec2 id = floor(cell);
  vec2 f = fract(cell) - 0.5;
  // ── the dot: round, crisp at any distance ─────────────────────────────
  float d = length(f);
  float aa = max(fwidth(d), 1e-4);
  const float R = 0.38;
  float dotMask = 1.0 - smoothstep(R - aa, R + aa, d);
  // under ~2 px a dot resolves to its area coverage (pi * R^2), no moire
  float cellPx = 1.0 / max(fwidth(cell.x), 1e-4);
  dotMask = mix(0.4536, dotMask, smoothstep(1.4, 3.0, cellPx));

  // ── the idle field: every dot faintly on, shimmering ──────────────────
  float shimmer = 0.6 + 0.4 * sin(uTime * 1.3 + hash(id) * 6.2831);
  vec3 col = uIceDeep * (0.022 + 0.04 * uLevel) * shimmer;

  // ── dim mirrored spectrum, bass at the centre, rising from the base ───
  float halfC = uGrid.x * 0.5;
  float cc = id.x < halfC ? (halfC - 1.0 - id.x) : (id.x - halfC);
  float bar = floor(cc / ${BAR_DOTS.toFixed(1)});
  float inBar = cc - bar * ${BAR_DOTS.toFixed(1)};
  vec4 sp = texture2D(uSpec, vec2((bar + 0.5) / ${SPEC_TEX.toFixed(1)}, 0.5));
  float fy = (id.y + 0.5) / uGrid.y;
  const float BASE = 0.03;
  const float SPAN = 0.94;
  float rowH = 1.0 / (uGrid.y * SPAN);
  float up = (fy - BASE) / SPAN;
  vec3 specC = mix(uIceDeep, uTint, 0.3);
  if (inBar < 2.5 && up >= 0.0) {
    if (up <= sp.r && sp.r > 0.004) {
      float rel = up / max(sp.r, 1e-3);
      col = specC * (0.05 + 0.07 * rel) * (1.0 + 0.8 * uKick * uMotion);
    } else if (abs(up - sp.g) < rowH * 0.55 && sp.g > 0.02) {
      col = uIce * 0.14;
    }
  }

  // ── the artwork on top: square, mark, CLUB SHAPE ──────────────────────
  float m = texture2D(uMask, (id + 0.5) / uGrid).r;
  m = smoothstep(0.1, 0.62, m);
  float breath = 0.94 + 0.06 * sin(uTime * 0.7);
  vec3 art = uIce * (1.2 * breath + 0.45 * uKick * uMotion + 0.15 * uLevel);
  col = mix(col, art, m);

  // ── the drop: a beat-locked sweep across the dots (≤ 3 per second) ────
  if (uSweep > 0.0) {
    float s = fract(uBeat / uSweepDiv);
    float xpos = s * 1.5 - 0.25;
    float band = exp(-pow((vUv.x - xpos) / 0.05, 2.0));
    col += uIce * band * (0.5 + 1.1 * m) * uSweep;
  }

  col *= dotMask;
  // the PCB between the dots is not pure black
  col += vec3(0.004, 0.0045, 0.006) * (1.0 - dotMask);

  float fogF = exp(-uFogDensity * uFogDensity * vDepth * vDepth);
  gl_FragColor = vec4(mix(uFogColor, col, fogF), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const BEAM_VERT = /* glsl */`
attribute vec3 aColor;
attribute float aIntensity;
varying vec3 vColor;
varying float vAlong;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying float vSeed;
void main() {
  vColor = aColor * aIntensity;
  vAlong = clamp(-position.y, 0.0, 1.0);
  vSeed = float(gl_InstanceID) * 1.37;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  mat3 nm = mat3(modelViewMatrix * instanceMatrix);
  vNormalV = normalize(nm * normal);
  gl_Position = projectionMatrix * mv;
}`;

const BEAM_FRAG = /* glsl */`
uniform float uGain;
uniform float uTime;
uniform float uFogDensity;
varying vec3 vColor;
varying float vAlong;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying float vSeed;
void main() {
  // bright at the lens, falling off with distance through the haze
  float fall = pow(1.0 - vAlong, 1.2) * (0.35 + 0.65 * exp(-vAlong * 3.0));
  // soft cylindrical edge: brightest where the cone faces the camera
  vec3 V = normalize(-vViewPos);
  float facing = abs(dot(normalize(vNormalV), V));
  float soft = pow(facing, 2.6);
  // drifting haze grain along the beam
  float haze = 0.8 + 0.2 * sin(vAlong * 41.0 - uTime * 1.1 + vSeed) * sin(vAlong * 13.0 + uTime * 0.6 + vSeed * 2.0);
  float depth = -vViewPos.z;
  float nearFade = smoothstep(0.35, 2.2, depth);
  float fog = exp(-uFogDensity * uFogDensity * depth * depth * 0.6);
  vec3 c = vColor * fall * soft * haze * nearFade * fog * uGain;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ── the club ────────────────────────────────────────────────────────────────

/**
 * @param {object} o
 * @param {typeof import('three')} o.THREE
 * @param {import('three').WebGLRenderer} [o.renderer]  used for the environment map
 * @param {number} [o.seed]
 * @param {string} [o.accent]
 * @param {'high'|'low'} [o.quality]  'low' halves beams and crowd (phones)
 * @param {boolean} [o.reducedMotion]  no sweeps, no kick pulses, slow beams
 */
export function createClub({ THREE, renderer = null, seed = 7, accent = '#34d6c5', quality = 'high', reducedMotion = false, crowdUrl = 'crowd.bin.txt', fetchImpl = null } = {}) {
  const rnd = mulberry32(seed * 7919 + 17);
  const low = quality === 'low';
  let reduced = !!reducedMotion;
  const group = new THREE.Group();
  group.name = 'club';

  const disposables = []; // geometries, materials, textures, render targets
  const own = (x) => { disposables.push(x); return x; };

  RectAreaLightUniformsLib.init();

  const accentC = new THREE.Color(accent);
  const iceC = new THREE.Color(ICE);
  const iceDeepC = new THREE.Color(ICE_DEEP);

  // ── materials ────────────────────────────────────────────────────────
  const lamTex = own(laminateTexture(THREE, rnd));
  lamTex.repeat.set(4, 4);
  const matLaminate = own(new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.62, metalness: 0.05, roughnessMap: lamTex }));
  const matTop = own(new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.78, metalness: 0.0 }));
  const matAlu = own(new THREE.MeshStandardMaterial({ color: 0x8f959c, roughness: 0.45, metalness: 1.0 }));
  const matChrome = own(new THREE.MeshStandardMaterial({ color: 0xd4d7dc, roughness: 0.16, metalness: 1.0 }));
  const matCarpet = own(new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.97, metalness: 0.0 }));
  const matStageDeck = own(new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.28, metalness: 0.25 }));
  const matMonolith = own(new THREE.MeshStandardMaterial({ color: 0x060709, roughness: 0.36, metalness: 0.35 }));
  const matTruss = own(new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.38, metalness: 0.85 }));
  const floorRough = own(floorRoughnessTexture(THREE, rnd));
  floorRough.repeat.set(4, 10);
  const matFloor = own(new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.3, metalness: 0.0, roughnessMap: floorRough }));
  const grille = own(grilleTexture(THREE));
  grille.repeat.set(3, 3);
  const matSpeaker = own(new THREE.MeshStandardMaterial({ color: 0x5a5a60, roughness: 0.75, metalness: 0.3, map: grille }));
  const matCabinet = own(new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.7, metalness: 0.1 }));
  const matFixture = own(new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.45, metalness: 0.5 }));
  // emissive "lines": white LED (stage edge, portal bars, booth underglow) + a small teal accent
  const matLedWhite = own(new THREE.MeshBasicMaterial({ color: iceC.clone().multiplyScalar(2.4) }));
  const matReveal = own(new THREE.MeshBasicMaterial({ color: iceC.clone().multiplyScalar(0.9) }));
  const matAccentStrip = own(new THREE.MeshBasicMaterial({ color: accentC.clone().multiplyScalar(1.6) }));
  const fascia = fasciaTextures(THREE, rnd);
  own(fascia.map); own(fascia.emissiveMap);
  const matFascia = own(new THREE.MeshStandardMaterial({
    map: fascia.map, emissiveMap: fascia.emissiveMap, emissive: iceC.clone(), emissiveIntensity: 1.0,
    roughness: 0.6, metalness: 0.05,
  }));

  function mesh(geo, mat, name) {
    const m = new THREE.Mesh(own(geo), mat);
    if (name) m.name = name;
    group.add(m);
    return m;
  }

  // ── the floor under the crowd ────────────────────────────────────────
  // Sits 12 mm under FLOOR_Y so a venue floor laid at FLOOR_Y simply covers it (no
  // z-fighting); without one the crowd still stands on something.
  {
    const zBack = STAGE.back, zFar = CROWD.z1 - 2.0;
    const floorGeo = new THREE.PlaneGeometry(CROWD.x * 2 + 1.2, zBack - zFar);
    floorGeo.rotateX(-Math.PI / 2);
    mesh(floorGeo, matFloor, 'danceFloor').position.set(0, FLOOR_Y - 0.012, (zBack + zFar) / 2);
  }

  // ── the stage deck: a raised black deck with a softly rounded front ──
  const ribbonPts = [];
  {
    const bev = 0.05, bevT = 0.035, N = 72;
    const ex = STAGE.x - bev;
    const bz = (STAGE.sideZ - STAGE.frontZ) - bev;
    // shape (x, s) maps to world (x, ·, −s) after rotateX(−π/2)
    const shape = new THREE.Shape();
    shape.moveTo(-ex, -(STAGE.back - bev));
    shape.lineTo(-ex, -STAGE.sideZ);
    for (let i = 1; i < N; i++) {
      const th = Math.PI - (i / N) * Math.PI;
      shape.lineTo(ex * Math.cos(th), -(STAGE.sideZ - bz * Math.sin(th)));
    }
    shape.lineTo(ex, -STAGE.sideZ);
    shape.lineTo(ex, -(STAGE.back - bev));
    shape.closePath();
    const stageH = STAGE_Y - FLOOR_Y;
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: stageH - 2 * bevT, bevelEnabled: true, bevelThickness: bevT, bevelSize: bev, bevelSegments: 3, curveSegments: 4,
    });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, FLOOR_Y + bevT, 0);
    mesh(geo, matStageDeck, 'stageDeck');

    // the LED lines' path: up the left side, round the nose, back down the right side
    const off = 0.008;
    const a = STAGE.x, b = STAGE.sideZ - STAGE.frontZ;
    ribbonPts.push({ x: -a - off, z: PORTAL.z0, nx: -1, nz: 0 });
    for (let i = 0; i <= N; i++) {
      const th = Math.PI - (i / N) * Math.PI;
      const x = a * Math.cos(th), z = STAGE.sideZ - b * Math.sin(th);
      // outward normal of the ellipse (x/a², (z−c)/b²)
      let nx = x / (a * a), nz = (z - STAGE.sideZ) / (b * b);
      const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      ribbonPts.push({ x: x + nx * off, z: z + nz * off, nx, nz });
    }
    ribbonPts.push({ x: a + off, z: PORTAL.z0, nx: 1, nz: 0 });
    mesh(merge([
      ribbonGeometry(THREE, ribbonPts, STAGE_Y - 0.075, 0.016),
      ribbonGeometry(THREE, ribbonPts, STAGE_Y - 0.155, 0.016),
    ]), matLedWhite, 'stageEdgeLeds');
  }

  // ── DJ riser ─────────────────────────────────────────────────────────
  const riser = { x: 1.3, z0: -0.72, z1: 1.2 };
  const riserH = STAND_Y - STAGE_Y;
  mesh(new RoundedBoxGeometry(riser.x * 2, riserH, riser.z1 - riser.z0, 2, 0.01), matCarpet, 'riser')
    .position.set(0, STAGE_Y + riserH / 2, (riser.z0 + riser.z1) / 2);

  // ── the booth: a flight-case table, its fascia lit like Club Shape's ─
  {
    const bw = BOOTH.x1 - BOOTH.x0, bd = BOOTH.z1 - BOOTH.z0, bz = (BOOTH.z0 + BOOTH.z1) / 2;
    const bodyH = TABLE_Y - STAND_Y - 0.03;
    mesh(new RoundedBoxGeometry(bw - 0.01, bodyH, bd - 0.01, 2, 0.008), matLaminate, 'boothBody')
      .position.set(0, STAND_Y + bodyH / 2, bz);
    // table top board — its top surface is exactly TABLE_Y
    mesh(new RoundedBoxGeometry(bw + 0.02, 0.03, bd + 0.02, 2, 0.006), matTop, 'boothTop')
      .position.set(0, TABLE_Y - 0.015, bz);
    // front fascia (faces −Z), inset between the corner extrusions
    const fw = bw - 0.07, fh = bodyH - 0.1;
    const fasciaGeo = new THREE.PlaneGeometry(fw, fh);
    fasciaGeo.rotateY(Math.PI);
    mesh(fasciaGeo, matFascia, 'boothFascia').position.set(0, STAND_Y + 0.045 + fh / 2, BOOTH.z0 - 0.0065);

    // aluminium extrusions: every edge of the case, plus the lid line
    const alu = [];
    const T = 0.024;
    const x0 = BOOTH.x0 - 0.004, x1 = BOOTH.x1 + 0.004, z0 = BOOTH.z0 - 0.004, z1 = BOOTH.z1 + 0.004;
    const yTop = TABLE_Y - 0.012, yBot = STAND_Y + 0.012, yLid = TABLE_Y - 0.13;
    for (const y of [yTop, yBot, yLid]) {
      alu.push(placed(new THREE.BoxGeometry(x1 - x0, T, T * (y === yLid ? 0.55 : 1)), 0, y, z0, 0, 0, 0, THREE));
      alu.push(placed(new THREE.BoxGeometry(x1 - x0, T, T * (y === yLid ? 0.55 : 1)), 0, y, z1, 0, 0, 0, THREE));
      alu.push(placed(new THREE.BoxGeometry(T, T, z1 - z0), x0, y, (z0 + z1) / 2, 0, 0, 0, THREE));
      alu.push(placed(new THREE.BoxGeometry(T, T, z1 - z0), x1, y, (z0 + z1) / 2, 0, 0, 0, THREE));
    }
    for (const x of [x0, x1]) for (const z of [z0, z1]) {
      alu.push(placed(new THREE.BoxGeometry(T, TABLE_Y - STAND_Y, T), x, STAND_Y + (TABLE_Y - STAND_Y) / 2, z, 0, 0, 0, THREE));
    }
    // riser + stage-deck-edge nosing
    alu.push(placed(new THREE.BoxGeometry(riser.x * 2 + 0.02, 0.02, 0.03), 0, STAND_Y - 0.008, riser.z0 - 0.005, 0, 0, 0, THREE));
    mesh(merge(alu), matAlu, 'boothTrim');

    // chrome ball corners, butterfly latches, recessed handles
    const chrome = [];
    for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of [yTop, yBot]) {
      chrome.push(placed(new THREE.SphereGeometry(0.03, 10, 8), x, y, z, 0, 0, 0, THREE));
    }
    for (const x of [-0.46, 0.46]) {
      chrome.push(placed(new THREE.BoxGeometry(0.075, 0.05, 0.012), x, yLid, z0 - 0.008, 0, 0, 0, THREE));
      chrome.push(placed(new THREE.CylinderGeometry(0.014, 0.014, 0.014, 10), x, yLid - 0.012, z0 - 0.016, Math.PI / 2, 0, 0, THREE));
    }
    for (const x of [x0 - 0.004, x1 + 0.004]) {
      chrome.push(placed(new THREE.BoxGeometry(0.012, 0.07, 0.16), x, TABLE_Y - 0.36, bz, 0, 0, 0, THREE));
    }
    mesh(merge(chrome), matChrome, 'boothChrome');

    // white underglow line under the fascia, teal accent on the riser nosing
    mesh(placed(new THREE.BoxGeometry(bw - 0.06, 0.008, 0.006), 0, STAND_Y + 0.03, BOOTH.z0 - 0.012, 0, 0, 0, THREE), matLedWhite, 'boothUnderglow');
    mesh(placed(new THREE.BoxGeometry(riser.x * 2, 0.01, 0.01), 0, STAND_Y - 0.03, riser.z0 - 0.006, 0, 0, 0, THREE), matAccentStrip, 'riserAccent');
  }

  // ── booth monitors: low floor wedges beside the DJ's feet, tilted up at her head ──
  // (kept low and behind the booth sides so no camera line to Nora passes through them —
  // the Profile shot looks across x ≈ 1 m at eye height)
  {
    const grilleParts = [], cabParts = [];
    for (const side of [-1, 1]) {
      const mx = side * 1.0, mz = 0.62, toe = side * 0.5;
      const mon = new THREE.BoxGeometry(0.5, 0.3, 0.36);
      const mg = new THREE.PlaneGeometry(0.44, 0.24);
      mg.rotateY(Math.PI);
      mg.translate(0, 0, -0.181);
      // faces −Z (toward the DJ), tilted back so it aims up at her head
      const mm = new THREE.Matrix4().compose(new THREE.Vector3(mx, STAND_Y + 0.17, mz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0.55, toe, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
      mon.applyMatrix4(mm); mg.applyMatrix4(mm);
      cabParts.push(mon); grilleParts.push(mg);
    }
    mesh(merge(cabParts), matCabinet, 'monitorCabinets');
    mesh(merge(grilleParts), matSpeaker, 'monitorGrilles');
  }

  // ── the LED screen (Signal Field dot matrix) ─────────────────────────
  const specData = new Uint8Array(SPEC_TEX * 4);
  const specTex = own(new THREE.DataTexture(specData, SPEC_TEX, 1, THREE.RGBAFormat, THREE.UnsignedByteType));
  specTex.magFilter = specTex.minFilter = THREE.NearestFilter;
  specTex.needsUpdate = true;
  const maskTex = own(screenMaskTexture(THREE, WALL_COLS, WALL_ROWS));
  const wallU = {
    uSpec: { value: specTex },
    uMask: { value: maskTex },
    uGrid: { value: new THREE.Vector2(WALL_COLS, WALL_ROWS) },
    uIce: { value: iceC.clone() },
    uIceDeep: { value: iceDeepC.clone() },
    uTint: { value: accentC.clone() },
    uKick: { value: 0 }, uLevel: { value: 0 }, uBeat: { value: 0 },
    uSweep: { value: 0 }, uSweepDiv: { value: 1 }, uMotion: { value: 1 }, uTime: { value: 0 },
    uFogColor: { value: new THREE.Color(FOG_COLOR) }, uFogDensity: { value: FOG_DENSITY },
  };
  const matWall = own(new THREE.ShaderMaterial({ uniforms: wallU, vertexShader: WALL_VERT, fragmentShader: WALL_FRAG }));
  {
    const g = new THREE.PlaneGeometry(WALL.w, WALL.h);
    g.rotateY(Math.PI); // face −Z, toward the DJ and the crowd
    mesh(g, matWall, 'ledWall').position.set(0, WALL.y0 + WALL.h / 2, WALL.z);
  }

  // ── the PORTAL: a black monolith proscenium around the screen ────────
  const openX = WALL.w / 2 + 0.02, openY0 = WALL.y0 - 0.02, openY1 = WALL.y0 + WALL.h + 0.02;
  {
    const P = PORTAL, r = 0.04;
    mesh(merge([
      boxAt(THREE, -P.x, -openX, STAGE_Y, P.top, P.z0, P.z1, r),          // left pillar
      boxAt(THREE, openX, P.x, STAGE_Y, P.top, P.z0, P.z1, r),            // right pillar
      boxAt(THREE, -openX - 0.05, openX + 0.05, openY1, P.top, P.z0, P.z1, r), // header
      boxAt(THREE, -openX - 0.05, openX + 0.05, STAGE_Y, openY0, P.z0, P.z1, r), // plinth behind the booth
      boxAt(THREE, -openX, openX, openY0, openY1, WALL.z + 0.01, P.z1),  // back of the screen recess
    ]), matMonolith, 'portal');
    // a thin white reveal around the screen opening, just proud of the portal face
    const zf = P.z0 - 0.006, t = 0.022;
    mesh(merge([
      boxAt(THREE, -openX - t, openX + t, openY1, openY1 + t, zf - 0.006, zf),
      boxAt(THREE, -openX - t, openX + t, openY0 - t, openY0, zf - 0.006, zf),
      boxAt(THREE, -openX - t, -openX, openY0, openY1, zf - 0.006, zf),
      boxAt(THREE, openX, openX + t, openY0, openY1, zf - 0.006, zf),
    ]), matReveal, 'portalReveal');
  }

  // vertical white light bars on the pillars, two either side of the stage
  const BAR_X = [-5.0, -4.1, 4.1, 5.0];
  const barGeo = own(new THREE.BoxGeometry(0.032, 8.1, 0.03));
  const imBars = new THREE.InstancedMesh(barGeo, own(new THREE.MeshBasicMaterial({ color: 0xffffff })), BAR_X.length);
  imBars.name = 'portalBars';
  {
    const m = new THREE.Matrix4();
    BAR_X.forEach((x, i) => {
      m.makeTranslation(x, STAGE_Y + 0.35 + 8.1 / 2, PORTAL.z0 - 0.018);
      imBars.setMatrixAt(i, m);
      imBars.setColorAt(i, iceC);
    });
    group.add(imBars);
  }

  // the top truss box across the front of the portal (the beams hang from it)
  const TRUSS = { y: 8.42, z: 1.62, x: 6.0, size: 0.4 };
  {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const parts = [trussGeometry(THREE, V(-TRUSS.x, TRUSS.y, TRUSS.z), V(TRUSS.x, TRUSS.y, TRUSS.z), TRUSS.size, 0.028, 0.011)];
    // two hanger plates tying it to the portal header
    for (const x of [-3.0, 3.0]) parts.push(boxAt(THREE, x - 0.1, x + 0.1, TRUSS.y - 0.05, TRUSS.y + 0.05, TRUSS.z, PORTAL.z0));
    mesh(merge(parts), matTruss, 'topTruss');
  }

  // ── moving heads under the top truss ─────────────────────────────────
  const FX_X = low ? [-4.4, -1.6, 1.6, 4.4] : [-5.1, -3.7, -2.3, -0.9, 0.9, 2.3, 3.7, 5.1];
  const NF = FX_X.length;
  const PIVOT_DROP = 0.3;
  const FX_Y = TRUSS.y - TRUSS.size / 2 - 0.01;
  const fixtures = FX_X.map((x, i) => ({ x, i, side: x < 0 ? -1 : 1, r: Math.abs(x) / 5.1 }));
  const bodyFxGeo = own(merge([
    placed(new RoundedBoxGeometry(0.34, 0.13, 0.26, 2, 0.02), 0, -0.065, 0, 0, 0, 0, THREE),
    placed(new THREE.BoxGeometry(0.34, 0.035, 0.12), 0, -0.15, 0, 0, 0, 0, THREE),
    placed(new THREE.BoxGeometry(0.04, 0.2, 0.12), -0.155, -0.25, 0, 0, 0, 0, THREE),
    placed(new THREE.BoxGeometry(0.04, 0.2, 0.12), 0.155, -0.25, 0, 0, 0, 0, THREE),
  ]));
  const headGeo = own(merge([
    new THREE.CylinderGeometry(0.105, 0.115, 0.3, 14),
    placed(new THREE.CylinderGeometry(0.118, 0.118, 0.04, 14), 0, -0.13, 0, 0, 0, 0, THREE),
  ]));
  const lensGeo = own(new THREE.CircleGeometry(0.075, 18));
  lensGeo.rotateX(Math.PI / 2); // face −Y (the head's aim)
  lensGeo.translate(0, -0.152, 0);
  const matLens = own(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const imFxBody = new THREE.InstancedMesh(bodyFxGeo, matFixture, NF);
  const imHead = new THREE.InstancedMesh(headGeo, matFixture, NF);
  const imLens = new THREE.InstancedMesh(lensGeo, matLens, NF);
  imFxBody.name = 'mhBody'; imHead.name = 'mhHead'; imLens.name = 'mhLens';
  for (let i = 0; i < NF; i++) imLens.setColorAt(i, new THREE.Color(1, 1, 1));
  group.add(imFxBody, imHead, imLens);

  // beams: one additive instanced cone per fixture, cool white
  const BEAM_LEN = 26;
  const BEAM_HALF = 0.02;
  const beamGeo = own(new THREE.CylinderGeometry(0.1, 1, 1, 18, 1, true));
  beamGeo.translate(0, -0.5, 0); // apex at the origin, opening along −Y
  const beamColor = new Float32Array(NF * 3);
  const beamInt = new Float32Array(NF);
  beamGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(beamColor, 3));
  beamGeo.setAttribute('aIntensity', new THREE.InstancedBufferAttribute(beamInt, 1));
  const beamU = { uGain: { value: 0.42 }, uTime: { value: 0 }, uFogDensity: { value: FOG_DENSITY } };
  const matBeam = own(new THREE.ShaderMaterial({
    uniforms: beamU, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const imBeam = new THREE.InstancedMesh(beamGeo, matBeam, NF);
  imBeam.name = 'beams';
  imBeam.frustumCulled = false;
  imBeam.renderOrder = 10;
  group.add(imBeam);

  const beamWhite = new THREE.Color(0.86, 0.93, 1.0);
  const mh = fixtures.map((f) => ({
    pos: new THREE.Vector3(f.x, FX_Y, TRUSS.z),
    pivot: new THREE.Vector3(f.x, FX_Y - PIVOT_DROP, TRUSS.z),
    dir: new THREE.Vector3(-f.side * 0.4, -0.6, -1).normalize(),
    intensity: 0.5,
  }));

  // ── crowd ────────────────────────────────────────────────────────────
  // Two levels of detail sharing one rim-lit material: full figures near the stage,
  // simple silhouettes further back (the establishing shot sees hundreds of them).
  const bodyNearGeo = own(merge([
    placed(new THREE.CylinderGeometry(0.068, 0.056, 0.84, 5, 1, true), -0.09, 0.42, 0, 0, 0, 0, THREE),
    placed(new THREE.CylinderGeometry(0.068, 0.056, 0.84, 5, 1, true), 0.09, 0.42, 0, 0, 0, 0, THREE),
    placed(new THREE.CylinderGeometry(0.165, 0.15, 0.16, 6, 1, true).scale(1, 1, 0.66), 0, 0.9, 0, 0, 0, 0, THREE),
    placed(new THREE.CylinderGeometry(0.205, 0.16, 0.52, 7, 1, true).scale(1, 1, 0.58), 0, 1.2, 0, 0, 0, 0, THREE),
    placed(new THREE.SphereGeometry(0.21, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.42, 0.6), 0, 1.44, 0, 0, 0, 0, THREE),
    placed(new THREE.CylinderGeometry(0.05, 0.055, 0.12, 5, 1, true), 0, 1.51, 0, 0, 0, 0, THREE),
    placed(new THREE.SphereGeometry(0.104, 7, 5).scale(0.92, 1.1, 1.0), 0, 1.64, 0.01, 0, 0, 0, THREE),
  ]));
  const armNearGeo = own(merge([
    placed(new THREE.CylinderGeometry(0.052, 0.042, 0.31, 5, 1, true), 0, -0.155, 0, 0, 0, 0, THREE),
    placed(new THREE.CylinderGeometry(0.041, 0.032, 0.29, 5, 1, true), 0, -0.455, 0, 0, 0, 0, THREE),
    placed(new THREE.SphereGeometry(0.046, 5, 3), 0, -0.63, 0, 0, 0, 0, THREE),
  ]));
  const bodyFarGeo = own(merge([
    placed(new THREE.CylinderGeometry(0.15, 0.11, 0.86, 5, 1, true).scale(1, 1, 0.62), 0, 0.43, 0, 0, 0, 0, THREE),
    placed(new THREE.CylinderGeometry(0.2, 0.15, 0.62, 5, 1, false).scale(1, 1, 0.6), 0, 1.16, 0, 0, 0, 0, THREE),
    placed(new THREE.IcosahedronGeometry(0.105, 0), 0, 1.62, 0, 0, 0, 0, THREE),
  ]));
  const armFarGeo = own(placed(new THREE.CylinderGeometry(0.045, 0.035, 0.62, 4, 1, true), 0, -0.31, 0, 0, 0, 0, THREE));

  const crowdU = { uRim: { value: new THREE.Color(0, 0, 0) }, uFill: { value: new THREE.Color(0, 0, 0) } };
  // envMapIntensity kept low: the environment is a bright screen and gold balconies, and
  // image lighting from every side turns a dark crowd into grey mannequins
  const matCrowd = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.0, envMapIntensity: 0.06 }));
  matCrowd.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = crowdU.uRim;
    sh.uniforms.uFill = crowdU.uFill;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vStageZ;')
      .replace('#include <project_vertex>',
        '#include <project_vertex>\n#ifdef USE_INSTANCING\n  vStageZ = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).z;\n#else\n  vStageZ = (modelMatrix * vec4(transformed, 1.0)).z;\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;\nuniform vec3 uFill;\nvarying float vStageZ;')
      .replace('#include <emissivemap_fragment>',
        [
          '#include <emissivemap_fragment>',
          '  // backlit by the stage: a cool rim on every silhouette edge, strongest near the stage,',
          '  // plus a faint fill on whatever faces the stage',
          '  float stageK = exp((vStageZ - 1.5) / 13.0);',
          '  // a high power keeps the rim on true silhouette edges (low-poly facets are broad)',
          '  float rimF = 1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);',
          '  vec3 toStage = normalize((viewMatrix * vec4(0.0, 0.35, 1.0, 0.0)).xyz);',
          '  float face = dot(normal, toStage);',
          '  float lit = 0.3 + 0.7 * smoothstep(-0.25, 0.6, face);',
          '  totalEmissiveRadiance += (uRim * pow(rimF, 5.0) * lit + uFill * max(face, 0.0) * max(face, 0.0)) * stageK;',
        ].join('\n'));
  };
  matCrowd.customProgramCacheKey = () => 'club-shape-crowd-rim-v3';

  const people = [];
  const lodCount = [0, 0];
  {
    // jittered rows from the stage lip back, spacing growing with depth (denser at the
    // front); a lane is left where the director's WIDE camera travels.
    const NEAR_Z = -8.0;
    const nearC = [], farC = [];
    let z = CROWD.z0 - 0.05;
    while (z > CROWD.z1) {
      const s = 0.48 + 0.024 * (-z + CROWD.z0);
      for (let x = -CROWD.x + rnd() * s * 0.5; x <= CROWD.x; x += s) {
        const px = x + (rnd() - 0.5) * s * 0.7, pz = z + (rnd() - 0.5) * s * 0.55;
        if (Math.abs(px) > CROWD.x || pz > CROWD.z0) continue;
        // keep off the stage front
        if (Math.abs(px) < STAGE.x + 0.4 && pz > stageFrontZ(Math.min(Math.abs(px), STAGE.x)) - 0.35) continue;
        // the WIDE camera path (−0.6,−6.2) → (0.35,−4.7): keep 0.45 m clear
        const ax = -0.6, az = -6.2, bx = 0.35, bz = -4.7;
        const k = clamp(((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2), 0, 1);
        if (Math.hypot(px - (ax + k * (bx - ax)), pz - (az + k * (bz - az))) < 0.45) continue;
        (pz > NEAR_Z ? nearC : farC).push([px, pz]);
      }
      z -= s;
    }
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    shuffle(nearC); shuffle(farC);
    const caps = low ? [150, 200] : [300, 400];
    [nearC, farC].forEach((cand, lod) => {
      const N = Math.min(cand.length, caps[lod]);
      for (let i = 0; i < N; i++) {
        const [x, zz] = cand[i];
        const yaw = Math.atan2(-x * 0.8, 0.3 - zz) + (rnd() - 0.5) * 0.55;
        people.push({
          x, z: zz, yaw, lod, idx: lodCount[lod]++,
          s: 0.9 + rnd() * 0.2, w: 0.92 + rnd() * 0.18,
          phase: (rnd() - 0.5) * 0.3,           // beat offset (fraction of a beat)
          style: rnd(),                          // <0.2 half-time nodders, >0.55 jump on the drop
          hype: rnd(),                           // threshold for hands up
          oneHand: rnd() < 0.35,
          lean: (rnd() - 0.5) * 0.12,
          tone: 0.016 + rnd() * 0.04,
          raise: 0, raiseR: 0,
        });
      }
    });
  }
  const NP = people.length;
  const imBody = [
    new THREE.InstancedMesh(bodyNearGeo, matCrowd, Math.max(1, lodCount[0])),
    new THREE.InstancedMesh(bodyFarGeo, matCrowd, Math.max(1, lodCount[1])),
  ];
  const imArm = [
    new THREE.InstancedMesh(armNearGeo, matCrowd, Math.max(1, lodCount[0] * 2)),
    new THREE.InstancedMesh(armFarGeo, matCrowd, Math.max(1, lodCount[1] * 2)),
  ];
  imBody[0].name = 'crowdBodies'; imBody[1].name = 'crowdBodiesFar';
  imArm[0].name = 'crowdArms'; imArm[1].name = 'crowdArmsFar';
  for (let l = 0; l < 2; l++) {
    imBody[l].count = lodCount[l];
    imArm[l].count = lodCount[l] * 2;
    imBody[l].instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    imArm[l].instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    imBody[l].frustumCulled = false; // instances span the whole floor
    imArm[l].frustumCulled = false;
  }
  {
    const c = new THREE.Color();
    people.forEach((p) => {
      c.setRGB(p.tone, p.tone * 1.0, p.tone * 1.12);
      imBody[p.lod].setColorAt(p.idx, c);
      imArm[p.lod].setColorAt(p.idx * 2, c);
      imArm[p.lod].setColorAt(p.idx * 2 + 1, c);
    });
  }
  group.add(imBody[0], imArm[0], imBody[1], imArm[1]);

  // ── the crowd made of Nora's own avatar design (crowdAvatars.mjs) ────────
  // The cylinder silhouettes above are the fallback: they show until the baked figures
  // arrive, and stay if the pack cannot be fetched. Once the avatars are in, the fallback
  // meshes are removed so nothing is drawn twice.
  let avatars = null;
  let disposed = false;
  let lastT = 0; // the last update() clock, so the freshly-arrived crowd is posed to the same beat
  const fetchFn = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (crowdUrl && fetchFn) {
    loadCrowdPack(crowdUrl, fetchFn).then((pack) => {
      if (disposed) return;
      avatars = createAvatarCrowd({ THREE, pack, people, lodCount, rnd });
      group.add(avatars.group);
      for (const m of [...imBody, ...imArm]) { group.remove(m); m.dispose(); }
      updateCrowd(0, lastT);
    }).catch((e) => { console.warn('[club] crowd avatars unavailable, keeping silhouettes', e); });
  }

  // ── lights (four of our own + a hemisphere fill) ─────────────────────
  const hemi = new THREE.HemisphereLight(0x1b2438, 0x0b0806, 0.5);
  // key: warm-neutral, from the house side high up, onto the booth and the DJ
  const key = new THREE.SpotLight(0xffead6, 60, 0, 0.3, 0.75, 2); // 150 lit her skin past the 0.82 bloom threshold
  key.position.set(0.5, 5.4, -3.8);
  key.target.position.set(0, 1.15, 0.1);
  // top/back light: cool white from the portal truss onto the DJ's head and shoulders
  const top = new THREE.SpotLight(iceC.clone(), 80, 0, 0.32, 0.8, 2);
  top.position.set(0, FX_Y - 0.3, TRUSS.z);
  top.target.position.set(0, 1.3, 0.25);
  // the screen itself lights the stage and the front of the crowd
  const wallLight = new THREE.RectAreaLight(iceC.clone(), 1.0, WALL.w, WALL.h); // 2.5 lit the backs of her hands past the bloom threshold
  wallLight.position.set(0, WALL.y0 + WALL.h / 2, WALL.z - 0.05);
  wallLight.lookAt(0, WALL.y0 + WALL.h / 2, -5);
  // one wash riding a centre beam onto the crowd
  const wash = new THREE.SpotLight(0xffffff, 0, 0, 0.18, 0.6, 2);
  hemi.name = 'clubHemi'; key.name = 'clubKey'; top.name = 'clubTop'; wallLight.name = 'clubScreenLight'; wash.name = 'clubWash';
  group.add(hemi, key, key.target, top, top.target, wallLight, wash, wash.target);

  // ── atmosphere (fog, background, environment) ────────────────────────
  const fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
  const background = new THREE.Color(BG_COLOR);
  let envRT = null;
  function buildEnvironment() {
    if (!renderer || envRT) return envRT;
    const es = new THREE.Scene();
    const tmp = [];
    const box = new THREE.BoxGeometry(28, 18, 52); tmp.push(box);
    const roomM = new THREE.MeshBasicMaterial({ color: 0x06080d, side: THREE.BackSide }); tmp.push(roomM);
    const room = new THREE.Mesh(box, roomM); room.position.set(0, 7.5, -20); es.add(room);
    // the bright screen at the stage end
    const wg = new THREE.PlaneGeometry(7.2, 4.2); tmp.push(wg);
    const wm = new THREE.MeshBasicMaterial({ color: iceC.clone().multiplyScalar(1.4), side: THREE.DoubleSide }); tmp.push(wm);
    const w = new THREE.Mesh(wg, wm); w.position.set(0, 4.0, 2.1); w.rotation.y = Math.PI; es.add(w);
    // warm gold balcony bands down both sides
    const bg = new THREE.PlaneGeometry(40, 0.8); tmp.push(bg);
    const gold = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb866).multiplyScalar(1.6), side: THREE.DoubleSide }); tmp.push(gold);
    for (const side of [-1, 1]) for (const y of [2.2, 5.6, 9.6]) {
      const s = new THREE.Mesh(bg, gold); s.position.set(side * 10.8, y, -20); s.rotation.y = Math.PI / 2; es.add(s);
    }
    // the ice ring of the skylight overhead
    const rg = new THREE.TorusGeometry(1, 0.03, 6, 48); tmp.push(rg);
    const ring = new THREE.Mesh(rg, wm); ring.scale.set(8, 13, 1); ring.rotation.x = Math.PI / 2; ring.position.set(0, 15.2, -18); es.add(ring);
    const pmrem = new THREE.PMREMGenerator(renderer);
    envRT = pmrem.fromScene(es, 0.04);
    pmrem.dispose();
    tmp.forEach((x) => x.dispose());
    return envRT;
  }

  let attachedScene = null;
  const replaced = {};
  function attach(scene) {
    if (!scene || !scene.isScene || attachedScene) return;
    attachedScene = scene;
    if (!scene.fog) { replaced.fog = true; scene.fog = fog; }
    if (!scene.background) { replaced.background = true; scene.background = background; }
    if (!scene.environment && renderer) {
      const rt = buildEnvironment();
      if (rt) { replaced.environment = true; scene.environment = rt.texture; scene.environmentIntensity = 0.55; }
    }
  }

  // ── state + animation ────────────────────────────────────────────────
  const state = {
    bands: { low: 0, mid: 0, high: 0, level: 0 }, kick: 0, beat: 0, bar: 0, drop: 0, accent,
  };
  const col = new Float32Array(SPEC_BARS);
  const peak = new Float32Array(SPEC_BARS);
  const peakHold = new Float32Array(SPEC_BARS);
  const colRate = Float32Array.from({ length: SPEC_BARS }, () => 0.6 + rnd() * 2.4);
  const colPh = Float32Array.from({ length: SPEC_BARS }, () => rnd() * 6.283);
  let bandMax = 0.3;
  // beat clock reconstructed from the integer beat the caller passes
  let lastBeatIdx = null, lastBeatT = 0, beatPeriod = 60 / 124, beatCount = 0;
  let dropS = 0;
  let kickS = 0; // the kick as the room shows it (softened under reduced motion)

  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpQ2 = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  const tmpE = new THREE.Euler();
  const tmpBodyM = new THREE.Matrix4();
  const tmpArmM = new THREE.Matrix4();
  const tmpShoulder = new THREE.Vector3();
  const tmpC = new THREE.Color();
  const tmpC2 = new THREE.Color();
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const DOWN = new THREE.Vector3(0, -1, 0);

  function set(s = {}) {
    if (s.bands) Object.assign(state.bands, s.bands);
    if (s.kick != null) state.kick = s.kick;
    if (s.beat != null) state.beat = s.beat;
    if (s.bar != null) state.bar = s.bar;
    if (s.drop != null) state.drop = s.drop;
    if (s.reducedMotion != null) reduced = !!s.reducedMotion;
    if (s.accent && s.accent !== state.accent) {
      state.accent = s.accent;
      accentC.set(s.accent);
      wallU.uTint.value.copy(accentC);
      matAccentStrip.color.copy(accentC).multiplyScalar(1.6);
    }
  }

  function beatPosAt(t) {
    return beatCount + clamp((t - lastBeatT) / beatPeriod, 0, 1);
  }

  function updateBeat(t) {
    const b = state.beat | 0;
    if (lastBeatIdx === null) { lastBeatIdx = b; lastBeatT = t; return; }
    if (b !== lastBeatIdx) {
      const dtb = t - lastBeatT;
      if (dtb > 0.25 && dtb < 1.2) beatPeriod = lerp(beatPeriod, dtb, 0.35);
      beatCount += 1;
      lastBeatIdx = b; lastBeatT = t;
    } else if (t - lastBeatT > beatPeriod * 1.02) {
      // no beat arriving: free-run so the room keeps breathing
      beatCount += 1; lastBeatT += beatPeriod;
    }
  }

  function levelNorm() {
    return clamp(state.bands.level / Math.max(bandMax, 0.18), 0, 1);
  }

  function updateWall(dt, t) {
    const { low: bl, mid: bm, high: bh, level } = state.bands;
    const top3 = Math.max(bl, bm, bh);
    bandMax = Math.max(top3, bandMax * Math.exp(-dt * 0.25), 0.18);
    const norm = 0.9 / bandMax;
    const drop = dropS;
    for (let c = 0; c < SPEC_BARS; c++) {
      const x = c / (SPEC_BARS - 1);
      let v = bl * gauss(x, 0.0, 0.2) * 1.2 + bm * gauss(x, 0.42, 0.2) + bh * gauss(x, 0.8, 0.22) * 1.1;
      v *= norm;
      const wob = 0.5 + 0.5 * Math.sin(t * colRate[c] + colPh[c]) * Math.sin(t * colRate[c] * 0.37 + colPh[c] * 1.7);
      v *= 0.62 + 0.55 * wob;
      v += kickS * gauss(x, 0, 0.16) * 0.3 + drop * 0.1;
      // standby: a slow travelling swell so the screen is never dead
      const idle = 0.05 + 0.035 * (0.5 + 0.5 * Math.sin(t * 1.3 - x * 7.0));
      v = clamp(Math.max(v, idle), 0, 0.92);
      const k = v > col[c] ? Math.min(1, dt * (reduced ? 8 : 28)) : Math.min(1, dt * 5.5);
      col[c] += (v - col[c]) * k;
      if (col[c] >= peak[c]) { peak[c] = col[c]; peakHold[c] = 0.3; }
      else if (peakHold[c] > 0) peakHold[c] -= dt;
      else peak[c] = Math.max(col[c], peak[c] - dt * 0.55);
      specData[c * 4] = Math.round(col[c] * 255);
      specData[c * 4 + 1] = Math.round(peak[c] * 255);
    }
    specTex.needsUpdate = true;
    wallU.uKick.value = kickS;
    wallU.uLevel.value = clamp(level * norm, 0, 1);
    wallU.uTime.value = t;
    wallU.uMotion.value = reduced ? 0.15 : 1;
    const bp = beatPosAt(t);
    wallU.uBeat.value = bp;
    // the drop sweep: once a beat, or every other beat when the tempo would push it past
    // 3 per second; none at all under reduced motion
    wallU.uSweepDiv.value = beatPeriod < 1 / 3 ? 2 : 1;
    wallU.uSweep.value = reduced ? 0 : clamp((drop - 0.5) * 4, 0, 1);
    wallU.uFogDensity.value = attachedScene && attachedScene.fog && attachedScene.fog.isFogExp2 ? attachedScene.fog.density : FOG_DENSITY;
  }

  // Beam looks, by 8-bar section. Left and right fixtures mirror each other so the beams
  // always cross in X shapes over the centre line; the sweep phase is locked to the beat.
  function aimFixture(f, fx, bp, mode, dt) {
    const side = fx.side, r = fx.r, i = fx.i;
    const slow = reduced ? 0.25 : 1;
    const ph = bp * Math.PI * slow;
    const T = tmpV;
    if (dropS > 0.5) {
      // the drop: a wide X that scissors open and shut every two beats
      const sc = 0.5 + 0.5 * Math.sin(ph * 0.5);
      T.set(-side * (1.5 + 8.5 * r) * (0.45 + 0.55 * sc), FLOOR_Y + 0.5 + 4.5 * (1 - sc), -13 - 3 * r);
    } else if (mode === 0) {
      // X fan down onto the floor, breathing across the bar
      T.set(-side * (2.0 + 6.0 * r) + Math.sin(ph / 4 + i) * 1.2, FLOOR_Y, -9.5 - 7 * r + Math.sin(ph / 8 + r * 3) * 2.0);
    } else if (mode === 1) {
      // a high X thrown over the crowd toward the far balconies
      T.set(-side * (3.0 + 7.0 * r) * (0.8 + 0.2 * Math.sin(ph / 2 + r * 2)), 11 + 3 * Math.sin(ph / 4 + i * 0.7), -32);
    } else {
      // tilt chase: each pair dips in turn on the beat
      const dip = 0.5 + 0.5 * Math.sin(ph / 2 - r * Math.PI);
      T.set(-side * (2.5 + 5.0 * r), FLOOR_Y + dip * 9.0, -15);
    }
    const want = T.sub(f.pivot).normalize();
    const rate = (dropS > 0.5 ? 5 : 2.6) * (reduced ? 0.35 : 1);
    f.dir.lerp(want, Math.min(1, rate * dt)).normalize();
  }

  function updateHeads(dt, t) {
    const bp = beatPosAt(t);
    const mode = Math.floor(state.bar / 8) % 3;
    const lvl = levelNorm();
    const drop = dropS;
    for (let k = 0; k < NF; k++) {
      const fx = fixtures[k], f = mh[k];
      aimFixture(f, fx, bp, mode, dt);
      f.intensity = 0.42 + 0.35 * lvl + 0.35 * kickS + 0.35 * drop;

      // orientation: pan about Y, tilt about the yoke axis
      const d = f.dir;
      const tilt = Math.acos(clamp(-d.y, -1, 1));
      const pan = Math.atan2(-d.x, -d.z);
      tmpQ.setFromAxisAngle(Y_AXIS, pan);
      tmpM.compose(f.pos, tmpQ, tmpS.set(1, 1, 1));
      imFxBody.setMatrixAt(k, tmpM);
      tmpE.set(tilt, pan, 0, 'YXZ');
      tmpQ2.setFromEuler(tmpE);
      tmpM.compose(f.pivot, tmpQ2, tmpS.set(1, 1, 1));
      imHead.setMatrixAt(k, tmpM);
      imLens.setMatrixAt(k, tmpM);
      tmpC.copy(beamWhite).multiplyScalar(0.8 + 2.4 * f.intensity);
      imLens.setColorAt(k, tmpC);
      // beam from the lens face along the aim
      const R = BEAM_LEN * Math.tan(BEAM_HALF);
      tmpQ.setFromUnitVectors(DOWN, d);
      tmpM.compose(tmpV.copy(f.pivot).addScaledVector(d, 0.15), tmpQ, tmpS.set(R, BEAM_LEN, R));
      imBeam.setMatrixAt(k, tmpM);
      beamColor[k * 3] = beamWhite.r; beamColor[k * 3 + 1] = beamWhite.g; beamColor[k * 3 + 2] = beamWhite.b;
      beamInt[k] = f.intensity;
    }
    imFxBody.instanceMatrix.needsUpdate = true;
    imHead.instanceMatrix.needsUpdate = true;
    imLens.instanceMatrix.needsUpdate = true;
    imLens.instanceColor.needsUpdate = true;
    imBeam.instanceMatrix.needsUpdate = true;
    beamGeo.attributes.aColor.needsUpdate = true;
    beamGeo.attributes.aIntensity.needsUpdate = true;
    beamU.uTime.value = t;
    beamU.uFogDensity.value = wallU.uFogDensity.value;

    // the wash rides an inner beam onto the crowd
    const f = mh[Math.floor(NF / 2) - 1];
    wash.position.copy(f.pivot);
    wash.target.position.copy(f.pivot).addScaledVector(f.dir, 10);
    wash.intensity = 420 * f.intensity;
  }

  function updateCrowd(dt, t) {
    const bp = beatPosAt(t);
    const lvl = levelNorm();
    const energy = Math.max(0.25, lvl);
    const drop = dropS;
    const shoulder = tmpShoulder;
    for (let i = 0; i < NP; i++) {
      const p = people[i];
      const halfTime = p.style < 0.2;
      const ph = (halfTime ? bp * 0.5 : bp) + p.phase;
      const f = fract(ph);
      // dip on the beat, recover through it
      const bounce = Math.pow(0.5 + 0.5 * Math.cos(f * Math.PI * 2), 2);
      let y = FLOOR_Y - bounce * 0.045 * energy * p.s;
      if (drop > 0.5 && p.style > 0.55) y += Math.max(0, Math.sin(f * Math.PI)) * 0.13 * drop; // jumpers
      const sway = Math.sin(bp * Math.PI * 0.5 + p.phase * 6) * 0.05 * energy;
      tmpE.set(p.lean + bounce * 0.06 * energy, p.yaw + sway * 0.6, sway * 0.5, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      tmpS.set(p.s * p.w, p.s, p.s * p.w);
      tmpM.compose(tmpV.set(p.x, y, p.z), tmpQ, tmpS);
      if (!avatars) imBody[p.lod].setMatrixAt(p.idx, tmpM);
      // hands: a few always up for the hype, most of the room on the drop
      const wantUp = (p.hype > 0.93 ? 1 : 0) || (drop > 0.5 && p.hype > 0.3) ? 1 : 0;
      const wantUpR = wantUp && (p.oneHand ? 0 : 1);
      p.raise += (wantUp - p.raise) * Math.min(1, dt * (2.5 + p.hype * 2));
      p.raiseR += (wantUpR - p.raiseR) * Math.min(1, dt * (2.2 + p.hype * 2));
      const pump = Math.pow(1 - f, 3) * 0.35;
      if (avatars) {
        // the raise is a shoulder rotation in the vertex shader: 0 hanging, ~2.6 straight up,
        // pumping back a little on every beat while up
        avatars.setPerson(p, tmpM, p.raise * (2.6 - pump * 0.9), p.raiseR * (2.55 - pump * 0.9));
        continue;
      }
      const bodyM = tmpBodyM.copy(tmpM);
      for (let a = 0; a < 2; a++) {
        const side = a === 0 ? -1 : 1;
        const r = a === 0 ? p.raise : p.raiseR;
        const angle = lerp(0.1, Math.PI - 0.35 - pump * r, r) * side;
        const fwd = lerp(-0.12 + bounce * 0.1, 0.35, r);
        shoulder.set(side * 0.2, 1.41, 0);
        tmpE.set(fwd, 0, angle, 'XYZ');
        tmpQ2.setFromEuler(tmpE);
        tmpArmM.compose(shoulder, tmpQ2, tmpS.set(1, 1, 1)).premultiply(bodyM);
        imArm[p.lod].setMatrixAt(p.idx * 2 + a, tmpArmM);
      }
    }
    if (avatars) {
      avatars.commit();
      avatars.setLight(tmpC.copy(iceC).multiplyScalar(0.18 + 0.22 * lvl + 0.18 * kickS + 0.12 * drop), tmpC2.copy(iceC).multiplyScalar(0.006 + 0.01 * lvl));
    } else {
      for (let l = 0; l < 2; l++) {
        imBody[l].instanceMatrix.needsUpdate = true;
        imArm[l].instanceMatrix.needsUpdate = true;
      }
      // rim + fill from the stage, lifting with the room
      crowdU.uRim.value.copy(iceC).multiplyScalar(0.22 + 0.25 * lvl + 0.2 * kickS + 0.15 * drop);
      crowdU.uFill.value.copy(iceC).multiplyScalar(0.006 + 0.01 * lvl);
    }
  }

  function updateLights(dt, t) {
    const lvl = levelNorm();
    const k = kickS;
    wallLight.intensity = 1.6 + 2.0 * lvl + 1.6 * k;
    top.intensity = 160 + 70 * k;
    matLedWhite.color.copy(iceC).multiplyScalar(1.5 + 0.7 * k);
    matFascia.emissiveIntensity = 1.0 + 0.45 * k;
    // portal bars: steady white, lifting on the kick; on the drop the two sides trade
    // brightness once a beat (never faster than the beat; not under reduced motion)
    const bp = beatPosAt(t);
    const odd = Math.floor(bp) % 2;
    for (let j = 0; j < BAR_X.length; j++) {
      let v = 0.9 + 0.3 * k + 0.12 * lvl; // just over the bloom threshold: they glow without veiling the frame
      if (!reduced && dropS > 0.5) v *= (j < 2) === (odd === 0) ? 1.25 : 0.7;
      tmpC.copy(iceC).multiplyScalar(v);
      imBars.setColorAt(j, tmpC);
    }
    imBars.instanceColor.needsUpdate = true;
  }

  function update(dt = 1 / 60, t = 0) {
    if (!attachedScene) {
      let root = group;
      while (root.parent) root = root.parent;
      if (root.isScene) attach(root);
    }
    dt = clamp(dt, 0, 0.1);
    lastT = t;
    dropS += (clamp(state.drop, 0, 1) - dropS) * Math.min(1, dt * 6);
    kickS = clamp(state.kick, 0, 1) * (reduced ? 0.2 : 1);
    updateBeat(t);
    updateWall(dt, t);
    updateHeads(dt, t);
    updateCrowd(dt, t);
    updateLights(dt, t);
  }

  function dispose() {
    disposed = true;
    if (avatars) { avatars.dispose(); avatars = null; }
    if (attachedScene) {
      if (replaced.fog && attachedScene.fog === fog) attachedScene.fog = null;
      if (replaced.background && attachedScene.background === background) attachedScene.background = null;
      if (replaced.environment && envRT && attachedScene.environment === envRT.texture) attachedScene.environment = null;
      attachedScene = null;
    }
    if (envRT) { envRT.dispose(); envRT = null; }
    [imFxBody, imHead, imLens, imBeam, imBars, ...imBody, ...imArm].forEach((m) => m.dispose());
    [hemi, key, top, wallLight, wash].forEach((l) => l.dispose && l.dispose());
    for (const d of disposables) if (d && d.dispose) d.dispose();
    disposables.length = 0;
    group.clear();
    if (group.parent) group.parent.remove(group);
  }

  // prime the instances so the first frame is posed
  update(0, 0);

  return {
    group,
    standY: STAND_Y,
    floorY: FLOOR_Y,
    fog,
    background,
    get environment() { return envRT ? envRT.texture : null; },
    get crowdCount() { return NP; },
    attach,
    set,
    update,
    dispose,
  };
}
