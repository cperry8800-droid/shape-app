// djmMixer.mjs — an unbranded 4-channel club mixer for Nora's booth.
//
// The industrial design follows the familiar 4-channel club-mixer layout (the DJM-900NXS2 /
// DJM-A9 family: ~413 × 444 × 108 mm), rendered with NO brand marks. Only a small engraved
// "SHAPE" appears on the panel.
//
// Local frame (see CONTRACT.md): origin at the bottom centre, +Y up, the player-facing FRONT at
// +Z, the back (cables) at −Z, +X the player's right. Units are metres at real size.
//
// Layout (player's view, back → front): four channel strips across the left ~70% of the top
// plate, each column TRIM (with an input selector above it), HI / MID / LOW, a larger COLOR
// knob, a CUE button and a 60 mm channel fader. A 15-segment level meter sits to the right of
// each strip, the master stereo meters sit between CH4 and the right-hand column. The right
// column is MASTER / BALANCE / BOOTH, a MIC row, the BEAT FX section (screen, BEAT ◀ ▶, FX
// SELECT, CH SELECT, LEVEL/DEPTH, TAP, ON/OFF), six SOUND COLOR FX buttons, HEADPHONES (MIXING,
// MASTER CUE, LEVEL), FADER CURVE switches and MIDI. The crossfader (45 mm travel) sits
// bottom-centre of the channel area; the headphone jacks are on the front panel, the RCA / XLR
// outputs on the rear panel.
//
// Draw calls: 8 (static chassis · top plate · knobs · fader caps · buttons · meter LEDs ·
// BEAT FX screen · additive button light-bleed). Everything that moves is instanced; the static
// parts are merged.
//
// Pure module rules: no Math.random / Date.now (a seeded PRNG textures the plate), the caller
// passes `t` in seconds, dispose() frees every geometry, material, texture and canvas.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DJM_DIMS = { w: 0.413, d: 0.444, h: 0.108 };

// ─── Layout, in millimetres (x: −206.5 … +206.5, z: −222 back … +222 front) ─────────────────
const MM = 0.001;
const W = 413, D = 444, H = 108;
const PLATE = { w: 407, d: 438, t: 3.5 };        // the gunmetal top panel
const FEET = 5;                                   // rubber feet height
const CH_X = [-168, -106, -44, 18];               // channel knob-column centres
const ROW = { num: -206, input: -189, trim: -163, hi: -135, mid: -109, low: -83, color: -50, cue: -18 };
const FADER = { z0: 81, z1: 21, slotA: 12, slotB: 90 };   // cap centre at value 0 (front) / 1 (back)
const XF = { x: -75, z: 170, travel: 45 };
const ASSIGN_Z = 112;
const METER = { dx: 24, zBottom: -86, pitch: 5.3, segW: 3.2, segL: 3.5, n: 15 };
const MASTER_METER_X = [57, 64];
const RC = {                                      // right-hand column
  master: { x: 100, z: -186 }, balance: { x: 140, z: -186 }, booth: { x: 178, z: -186 },
  mic: { z: -156, x: [100, 140, 178] },
  fxBox: { x0: 82, x1: 198, z0: -140, z1: 2 },
  screen: { x: 140, z: -107, w: 60, d: 34 },
  beatL: { x: 120, z: -74 }, beatR: { x: 160, z: -74 },
  fxSelect: { x: 101, z: -46 }, chSelect: { x: 140, z: -46 }, fxLevel: { x: 179, z: -46 },
  tap: { x: 101, z: -15 }, fxOn: { x: 167, z: -14 },
  colorFx: { z: 33, x0: 91, pitch: 19.6 },
  hpBox: { z0: 50, z1: 112 },
  hpMix: { x: 101, z: 84 }, masterCue: { x: 140, z: 84 }, hpLevel: { x: 179, z: 84 },
  curveBox: { z0: 120, z1: 160 }, curveCh: { x: 110, z: 144 }, curveX: { x: 170, z: 144 },
  midi: { z: 184, x: [118, 162] },
};
const COLOR_FX = ['SPACE', 'ECHO', 'SWEEP', 'NOISE', 'CRUSH', 'FILTER'];
const FX_LIST = ['DELAY', 'ECHO', 'PING PONG', 'SPIRAL', 'REVERB', 'TRANS', 'FILTER', 'FLANGER',
  'PHASER', 'PITCH', 'SLIP ROLL', 'ROLL', 'VINYL BRAKE', 'HELIX'];
const BEATS = ['1/16', '1/8', '1/4', '1/2', '3/4', '1', '2', '4'];
const KNOB_SWEEP = 150 * Math.PI / 180;           // −1..1 → −150°..+150°
const FONT = '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", "DejaVu Sans", sans-serif';

// Knob table: every rotary on the panel. `kind` picks the printed scale, `get` reads its value
// (−1..1) from state; `fixed` knobs (input selectors) are parked at one position.
function knobTable() {
  const k = [];
  CH_X.forEach((x, i) => {
    k.push({ id: `in${i}`, x, z: ROW.input, r: 5.2, h: 9, kind: 'select5', fixed: [-0.55, -0.55, -0.55, 0.3][i] });
    k.push({ id: `trim${i}`, x, z: ROW.trim, r: 8.5, h: 13.5, kind: 'level', label: 'TRIM', get: (s) => s.ch[i].trim });
    k.push({ id: `hi${i}`, x, z: ROW.hi, r: 8.5, h: 13.5, kind: 'eq', label: 'HI', get: (s) => s.ch[i].hi });
    k.push({ id: `mid${i}`, x, z: ROW.mid, r: 8.5, h: 13.5, kind: 'eq', label: 'MID', get: (s) => s.ch[i].mid });
    k.push({ id: `low${i}`, x, z: ROW.low, r: 8.5, h: 13.5, kind: 'eq', label: 'LOW', get: (s) => s.ch[i].low });
    k.push({ id: `color${i}`, x, z: ROW.color, r: 11.5, h: 15, kind: 'color', label: 'COLOR', get: (s) => s.ch[i].color });
  });
  k.push({ id: 'master', ...RC.master, r: 9.5, h: 15, kind: 'level', get: (s) => s.masterKnob });
  k.push({ id: 'balance', ...RC.balance, r: 7, h: 12, kind: 'eq', get: (s) => s.balance });
  k.push({ id: 'booth', ...RC.booth, r: 8.5, h: 14, kind: 'level', get: (s) => s.booth });
  RC.mic.x.forEach((x, j) => k.push({ id: ['micLevel', 'micHi', 'micLow'][j], x, z: RC.mic.z, r: 6.5, h: 11,
    kind: j ? 'eq' : 'level', get: (s) => [s.mic.level, s.mic.hi, s.mic.low][j] }));
  k.push({ id: 'fxSelect', ...RC.fxSelect, r: 9.5, h: 14, kind: 'select', get: (s) => fxSelectValue(s.fx.name) });
  k.push({ id: 'chSelect', ...RC.chSelect, r: 7.5, h: 12, kind: 'select6', get: (s) => s.fx.chSelect });
  k.push({ id: 'fxLevel', ...RC.fxLevel, r: 9.5, h: 14, kind: 'level', get: (s) => clamp(s.fx.level, 0, 1) * 2 - 1 });
  k.push({ id: 'hpMix', ...RC.hpMix, r: 9, h: 14, kind: 'eq', get: (s) => s.hp.mix });
  k.push({ id: 'hpLevel', ...RC.hpLevel, r: 9, h: 14, kind: 'level', get: (s) => s.hp.level });
  return k;
}

function fxSelectValue(name) {
  const i = FX_LIST.indexOf(String(name || '').toUpperCase());
  return i < 0 ? 0 : -1 + (2 * i) / (FX_LIST.length - 1);
}

// Buttons: `kind` selects the LED behaviour applied in update().
function buttonTable() {
  const b = [];
  CH_X.forEach((x, i) => b.push({ id: `cue${i}`, x, z: ROW.cue, w: 14, d: 9, h: 4.6, kind: 'cue', ch: i }));
  b.push({ id: 'beatL', ...RC.beatL, w: 12, d: 7.5, h: 4, kind: 'beat' });
  b.push({ id: 'beatR', ...RC.beatR, w: 12, d: 7.5, h: 4, kind: 'beat' });
  b.push({ id: 'tap', ...RC.tap, w: 12, d: 8, h: 4, kind: 'tap' });
  b.push({ id: 'fxOn', ...RC.fxOn, w: 28, d: 14, h: 5, kind: 'fxOn' });
  COLOR_FX.forEach((name, j) => b.push({ id: `cfx${j}`, x: RC.colorFx.x0 + j * RC.colorFx.pitch, z: RC.colorFx.z,
    w: 13, d: 8.5, h: 4, kind: 'colorFx', name }));
  b.push({ id: 'masterCue', ...RC.masterCue, w: 14, d: 9, h: 4.6, kind: 'masterCue' });
  RC.midi.x.forEach((x, j) => b.push({ id: `midi${j}`, x, z: RC.midi.z, w: 11, d: 7, h: 3.6, kind: j ? 'midiStart' : 'midi' }));
  return b;
}

// ─── Small helpers ───────────────────────────────────────────────────────────────────────────
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** mulberry32 — tiny seeded PRNG so the panel texture is identical on every load. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rounded-rectangle path (ctx.roundRect is missing on older Safari). */
function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

/**
 * Tag a geometry with the per-vertex "material channel" attribute read by the control shader:
 * r = white paint amount, g = LED emission (× instance colour), b = bare metal.
 */
function tag(THREE, geo, r = 0, g = 0, b = 0) {
  const g2 = geo.index ? geo.toNonIndexed() : geo;
  if (g2 !== geo) geo.dispose();
  const n = g2.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = g; a[i * 3 + 2] = b; }
  g2.setAttribute('aMat', new THREE.BufferAttribute(a, 3));
  if (!g2.attributes.uv) g2.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g2;
}

/** Merge tagged, non-indexed geometries and free the parts. */
function merge(parts) {
  const out = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return out;
}

/**
 * The shared "control" material: MeshStandardMaterial with a shader patch so one draw call can
 * carry matte bodies, white indicator paint (with a faint luminous glow so it reads in a dark
 * club), bare-metal parts and per-instance LED emission (instance colour → emissive).
 */
function makeCtrlMaterial(THREE, { color, roughness, metalness, paint = '#f3f3ee', paintGlow = 0, flutes = 0, clearcoat = 0, clearcoatRoughness = 0.1 }) {
  // A clear coat needs MeshPhysical; without one the cheaper MeshStandard is used (the phone tier).
  const m = clearcoat > 0 ? new THREE.MeshPhysicalMaterial({ color, roughness, metalness, clearcoat, clearcoatRoughness }) : new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const uPaint = { value: new THREE.Color(paint) };
  const uPaintGlow = { value: paintGlow };
  const fl = flutes > 0;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPaint = uPaint;
    sh.uniforms.uPaintGlow = uPaintGlow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aMat;\nvarying vec3 vMat;' +
        (fl ? '\nvarying vec3 vKLocal;\nvarying vec3 vKAxis;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat;' +
        (fl ? '\nvKLocal = position;\nvKAxis = normalize( normalMatrix * vec3( 0.0, 1.0, 0.0 ) );' : ''));
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uPaint;\nuniform float uPaintGlow;\nvarying vec3 vMat;' +
        (fl ? '\nvarying vec3 vKLocal;\nvarying vec3 vKAxis;' : ''))
      .replace('#include <color_fragment>', [
        'vec3 instEm = vec3( 0.0 );',
        '#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )',
        '  instEm = vColor.rgb;',
        '#endif',
        'diffuseColor.rgb = mix( diffuseColor.rgb, uPaint, vMat.r );',
      ].join('\n'))
      .replace('#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.3, vMat.b );\nroughnessFactor = mix( roughnessFactor, 0.55, vMat.r * ( 1.0 - vMat.b ) );')
      .replace('#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nmetalnessFactor = mix( metalnessFactor, 1.0, vMat.b );\nmetalnessFactor *= 1.0 - vMat.r * ( 1.0 - vMat.b );')
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += instEm * vMat.g + uPaint * uPaintGlow * vMat.r * ( 1.0 - vMat.b );');
    if (fl) {
      // Grip ribs on a unit knob's side (radius ≈ 1, 0.12 < y < 0.8), turned with the knob.
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', [
        '#include <normal_fragment_maps>',
        '{',
        '  float kr = length( vKLocal.xz );',
        '  float side = smoothstep( 0.93, 0.975, kr ) * ( 1.0 - smoothstep( 0.72, 0.8, vKLocal.y ) ) * smoothstep( 0.1, 0.16, vKLocal.y ) * ( 1.0 - vMat.r );',
        '  float ang = atan( vKLocal.x, vKLocal.z );',
        '  vec3 kc = cross( vKAxis, normal );',
        '  float kl = length( kc );',               // 0 on faces parallel to the axis: skip, never normalize(0)
        `  if ( side > 0.0 && kl > 1e-4 ) normal = normalize( normal + ( kc / kl ) * sin( ang * ${flutes.toFixed(1)} ) * 0.55 * side );`,
        '}',
      ].join('\n'));
    }
  };
  // All control materials share one onBeforeCompile source, so without this key three.js would
  // hand every variant the first compiled program (e.g. the knob's rib shader on the fader caps).
  m.customProgramCacheKey = () => `djmMixer-ctrl-v1-${flutes}`;
  return m;
}

// ─── Geometry builders (unit or real-size, all tagged + non-indexed) ─────────────────────────

/** Knob: a unit lathe (radius 1, height 1) with a white indicator line running from near the
 *  centre over the rounded top edge and down the side, pointing −Z at rotation 0. */
function knobGeometry(THREE) {
  // Profile (r, y), listed BOTTOM → TOP: LatheGeometry derives both the winding and the normals
  // from the point order, and a top-down list builds the knob inside-out. A small flared foot, a
  // tapered rubber side, a rounded shoulder and a shallow concave top.
  const prof = [[1.05, 0.0], [1.0, 0.1], [0.962, 0.85], [0.945, 0.925], [0.9, 0.976], [0.8, 0.993], [0, 0.975]];
  const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  const body = tag(THREE, lathe, 0, 0, 0);
  // Indicator ribbon along the profile at phi = π (−Z), offset outward along the profile normal.
  const path = [[0.24, 0.9795], [0.8, 0.993], [0.9, 0.976], [0.945, 0.925], [0.962, 0.85], [0.978, 0.52]];
  const off = 0.012, hw = 0.075;
  const pos = [], nor = [];
  const nrm = (i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    const dr = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dr, dy) || 1;
    return [-dy / l, dr / l]; // outward normal (nr, ny) of the path, which runs top → side
  };
  const vert = (i, side) => {
    const [r, y] = path[i], [nr, ny] = nrm(i);
    return { p: [side * hw, y + ny * off, -(r + nr * off)], n: [0, ny, -nr] };
  };
  for (let i = 0; i < path.length - 1; i++) {
    const a = vert(i, -1), b = vert(i, 1), c = vert(i + 1, -1), d = vert(i + 1, 1);
    for (const tri of [[a, b, d], [a, d, c]]) pushTriOutward(pos, nor, tri);
  }
  const rib = new THREE.BufferGeometry();
  rib.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rib.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return merge([body, tag(THREE, rib, 1, 0, 0)]);
}

/** Push a triangle, flipping its winding if needed so its face points along its vertex normals. */
function pushTriOutward(pos, nor, tri) {
  const [a, b, c] = tri;
  const u = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]];
  const v = [c.p[0] - a.p[0], c.p[1] - a.p[1], c.p[2] - a.p[2]];
  const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const n = [a.n[0] + b.n[0] + c.n[0], a.n[1] + b.n[1] + c.n[1], a.n[2] + b.n[2] + c.n[2]];
  const order = f[0] * n[0] + f[1] * n[1] + f[2] * n[2] >= 0 ? [a, b, c] : [a, c, b];
  for (const q of order) { pos.push(...q.p); nor.push(...q.n); }
}

/** Fader cap (real size, metres): the side profile (along the travel) extruded across X with a
 *  small bevel — tapered front/back faces, rounded top corners and a real concave finger dish —
 *  with a white line across the top and down the player-facing face, on a metal stem that drops
 *  into the slot. The crossfader uses the same cap rotated 90°. Local y = 0 is the panel. */
const CAP = { w: 12.4, d0: 10.2, d1: 7.4, h: 11, lift: 3.0, rc: 1.3, dish: 1.0, bevel: 0.45 };
function faderCapGeometry(THREE) {
  const { w, d0, d1, h, lift, rc, dish, bevel } = CAP;
  const sh = new THREE.Shape();                       // (u = along travel, v = up), mm
  sh.moveTo(-d0 / 2, 0);
  sh.lineTo(d0 / 2, 0);
  sh.lineTo(d1 / 2, h - rc);
  sh.quadraticCurveTo(d1 / 2, h, d1 / 2 - rc, h);
  sh.quadraticCurveTo(0, h - 2 * dish, -(d1 / 2 - rc), h);
  sh.quadraticCurveTo(-d1 / 2, h, -d1 / 2, h - rc);
  sh.lineTo(-d0 / 2, 0);
  const depth = w - 2 * 0.7;
  const cap = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.7, bevelSize: bevel,
    bevelSegments: 2, curveSegments: 6 });
  cap.translate(0, 0, -depth / 2);
  cap.rotateY(Math.PI / 2);                           // extrusion → X, profile u → Z
  cap.scale(MM, MM, MM);
  cap.translate(0, lift * MM, 0);
  const topY = (lift + h - dish + bevel) * MM;        // bottom of the dish, on the bevelled outline
  const line = new THREE.BoxGeometry((w - 3.2) * MM, 0.22 * MM, 1.1 * MM);
  line.translate(0, topY + 0.06 * MM, 0);
  const lean = Math.atan2((d0 - d1) / 2, h - rc);     // the tapered player-facing face
  const faceH = h - rc - 2.2;
  const lineF = new THREE.BoxGeometry(1.1 * MM, faceH * MM, 0.22 * MM);
  lineF.rotateX(-lean);
  const fy = 1.4 + faceH / 2;
  const fz = d0 / 2 - (fy / (h - rc)) * (d0 - d1) / 2 + bevel;
  lineF.translate(0, (lift + fy) * MM, (fz + 0.07) * MM);
  const stem = new THREE.BoxGeometry(1.3 * MM, (lift + 2) * MM, 5.5 * MM);
  stem.translate(0, ((lift + 2) / 2 - 1.5) * MM, 0);
  return merge([tag(THREE, cap), tag(THREE, line, 1), tag(THREE, lineF, 1), tag(THREE, stem, 0.55, 0, 1)]);
}

/** Unit button (1×1×1, bottom at y = 0): lit face on top, softer glow on the sides. */
function buttonGeometry(THREE) {
  const g = new RoundedBoxGeometry(1, 1, 1, 1, 0.22);
  g.translate(0, 0.5, 0);
  const t = tag(THREE, g);
  const n = t.attributes.normal, a = t.attributes.aMat;
  for (let i = 0; i < n.count; i++) a.setY(i, n.getY(i) > 0.6 ? 1.0 : 0.28);
  return t;
}

/** A small 3-position bat toggle (base + chrome lever) along X at (x, z) mm; pos −1 | 0 | 1. */
function toggleGeometry(THREE, x, z, pos) {
  const base = new RoundedBoxGeometry(10 * MM, 1.6 * MM, 6.5 * MM, 1, 0.6 * MM);
  base.translate(x * MM, H * MM + 0.4 * MM, z * MM);
  const boss = new THREE.CylinderGeometry(1.6 * MM, 1.9 * MM, 1.4 * MM, 10);
  boss.translate(x * MM, H * MM + 1.6 * MM, z * MM);
  const lever = new THREE.CylinderGeometry(0.75 * MM, 1.05 * MM, 7 * MM, 8);
  lever.translate(0, 3.5 * MM, 0);
  lever.rotateZ(-pos * 0.42);
  lever.translate(x * MM, H * MM + 2 * MM, z * MM);
  const tip = new THREE.SphereGeometry(1.05 * MM, 8, 5);
  tip.translate(0, 7 * MM, 0);
  tip.rotateZ(-pos * 0.42);
  tip.translate(x * MM, H * MM + 2 * MM, z * MM);
  return [tag(THREE, base, 0.04), tag(THREE, boss, 0.55, 0, 1), tag(THREE, lever, 0.8, 0, 1), tag(THREE, tip, 0.8, 0, 1)];
}

/** A cylinder whose axis points along +Z (front-panel jack), centred at (x, y, z) mm. */
function zCyl(THREE, r, len, x, y, z, seg = 16) {
  const c = new THREE.CylinderGeometry(r * MM, r * MM, len * MM, seg);
  c.rotateX(Math.PI / 2);
  c.translate(x * MM, y * MM, z * MM);
  return c;
}

// ─── The printed panel (CanvasTexture on the top plate) ──────────────────────────────────────

function drawPanel(ctx, cw, chh, knobs, buttons, rng, accent) {
  const s = cw / PLATE.w;                      // px per mm
  const X = (x) => (x + PLATE.w / 2) * s;
  const Z = (z) => (z + PLATE.d / 2) * s;
  const INK = '#e8e8e2', INK2 = '#a9acb2', RULE = '#5d6168';

  // Brushed dark gunmetal: base, broad sheen, fine horizontal grain.
  ctx.fillStyle = '#26282c';
  ctx.fillRect(0, 0, cw, chh);
  const sheen = ctx.createLinearGradient(0, 0, cw, chh);
  sheen.addColorStop(0, 'rgba(255,255,255,0.025)');
  sheen.addColorStop(0.5, 'rgba(0,0,0,0.0)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, cw, chh);
  for (let i = 0; i < chh * 2; i++) {               // hairline brushing along X
    const y = rng() * chh, a = 0.006 + rng() * 0.018;
    ctx.fillStyle = rng() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.6})`;
    const x0 = rng() * cw * 0.7;
    ctx.fillRect(x0, y, cw * (0.2 + rng() * 0.8), 1);
  }
  // Bevelled panel edge.
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = s * 0.6;
  ctx.strokeRect(s * 0.3, s * 0.3, cw - s * 0.6, chh - s * 0.6);

  const text = (x, z, str, size, { align = 'center', color = INK, weight = 700, squeeze = 0.86, track = 0.08, base = 'middle' } = {}) => {
    ctx.save();
    ctx.translate(X(x), Z(z));
    ctx.scale(squeeze, 1);
    ctx.font = `${weight} ${size * s}px ${FONT}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${track * size * s}px`;
    ctx.textAlign = align;
    ctx.textBaseline = base;
    ctx.fillStyle = color;
    ctx.fillText(str, 0, 0);
    ctx.restore();
  };
  const rrect = (x0, z0, x1, z1, r, fill, stroke, lw = 0.35) => {
    roundRectPath(ctx, X(x0), Z(z0), (x1 - x0) * s, (z1 - z0) * s, r * s);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw * s; ctx.stroke(); }
  };
  const line = (x0, z0, x1, z1, color = RULE, lw = 0.35) => {
    ctx.beginPath(); ctx.moveTo(X(x0), Z(z0)); ctx.lineTo(X(x1), Z(z1));
    ctx.strokeStyle = color; ctx.lineWidth = lw * s; ctx.stroke();
  };
  const dot = (x, z, r, color = INK) => {
    ctx.beginPath(); ctx.arc(X(x), Z(z), r * s, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  };
  const contact = (x, z, r0, r1, a = 0.6) => {         // soft contact shadow under a control
    const g = ctx.createRadialGradient(X(x), Z(z), r0 * s, X(x), Z(z), r1 * s);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(X(x), Z(z), r1 * s, 0, Math.PI * 2); ctx.fill();
  };
  const section = (x0, x1, z, title) => {             // "── TITLE ──" rule
    ctx.save();
    ctx.font = `700 ${2.6 * s}px ${FONT}`;
    const tw = ctx.measureText(title).width * 0.86 / s + 3.5;
    ctx.restore();
    const cx = (x0 + x1) / 2;
    line(x0, z, cx - tw / 2, z, RULE, 0.35);
    line(cx + tw / 2, z, x1, z, RULE, 0.35);
    text(cx, z, title, 2.6, { color: INK });
  };

  // Section framing.
  line(78, -212, 78, 196, 'rgba(0,0,0,0.55)', 0.8);      // right-column seam (dark + light)
  line(78.8, -212, 78.8, 196, 'rgba(255,255,255,0.06)', 0.5);
  rrect(RC.fxBox.x0, RC.fxBox.z0, RC.fxBox.x1, RC.fxBox.z1, 2.5, 'rgba(0,0,0,0.16)', RULE, 0.4);
  rrect(RC.fxBox.x0, RC.hpBox.z0, RC.fxBox.x1, RC.hpBox.z1, 2.5, 'rgba(0,0,0,0.10)', RULE, 0.4);
  section(RC.fxBox.x0 + 4, RC.fxBox.x1 - 4, RC.fxBox.z0 + 5, 'BEAT FX');
  section(RC.fxBox.x0 + 4, RC.fxBox.x1 - 4, RC.colorFx.z - 16, 'SOUND COLOR FX');
  section(RC.fxBox.x0 + 4, RC.fxBox.x1 - 4, RC.hpBox.z0 + 5, 'HEADPHONES');
  rrect(RC.fxBox.x0, RC.curveBox.z0, RC.fxBox.x1, RC.curveBox.z1, 2.5, 'rgba(0,0,0,0.08)', RULE, 0.4);
  section(RC.fxBox.x0 + 4, RC.fxBox.x1 - 4, RC.curveBox.z0 + 5, 'FADER CURVE');
  section(RC.fxBox.x0 + 4, RC.fxBox.x1 - 4, RC.midi.z - 11, 'MIDI');
  text(RC.midi.x[0], RC.midi.z + 7.5, 'ON/OFF', 1.7, { color: INK2 });
  text(RC.midi.x[1], RC.midi.z + 7.5, 'START/STOP', 1.7, { color: INK2 });
  section(84, 196, -207, 'MASTER');
  section(84, 196, RC.mic.z - 13, 'MIC');
  line(-201, ROW.cue - 12, 74, ROW.cue - 12, 'rgba(255,255,255,0.05)', 0.4);

  // Channel strips.
  CH_X.forEach((x, i) => {
    rrect(x - 6.5, ROW.num - 4, x + 6.5, ROW.num + 4, 1.2, 'rgba(0,0,0,0.35)', INK2, 0.3);
    text(x, ROW.num + 0.2, String(i + 1), 5.2, { weight: 800, squeeze: 0.9, track: 0 });
    text(x - 15, ROW.input, 'INPUT', 1.9, { align: 'right', color: INK2 });
    // Fader slot, scale and number ticks.
    const fz = (v) => FADER.z0 + (FADER.z1 - FADER.z0) * v;
    for (let k = 0; k <= 10; k++) {
      const z = fz(k / 10), long = k % 5 === 0;
      line(x - (long ? 11.5 : 10), z, x - 8, z, INK2, long ? 0.45 : 0.3);
      line(x + 8, z, x + (long ? 11.5 : 10), z, INK2, long ? 0.45 : 0.3);
    }
    text(x - 13, fz(1), '10', 2.1, { align: 'right', color: INK2 });
    text(x - 13, fz(0.5), '5', 2.1, { align: 'right', color: INK2 });
    text(x - 13, fz(0), '0', 2.1, { align: 'right', color: INK2 });
    rrect(x - 2.4, FADER.slotA - 1.2, x + 2.4, FADER.slotB + 1.2, 2.2, 'rgba(0,0,0,0.45)');
    rrect(x - 1.1, FADER.slotA, x + 1.1, FADER.slotB, 1.1, '#030303', 'rgba(255,255,255,0.14)', 0.25);
    text(x, FADER.slotB + 6, `CH ${i + 1}`, 2.0, { color: INK2 });
    // Crossfader assign toggle labels.
    text(x - 8.5, ASSIGN_Z, 'A', 2.0, { color: INK2 });
    text(x + 8.5, ASSIGN_Z, 'B', 2.0, { color: INK2 });
    text(x, ASSIGN_Z + 6.2, 'THRU', 1.6, { color: INK2 });
    // Level meter window.
    const mx = x + METER.dx;
    const zt = METER.zBottom - (METER.n - 1) * METER.pitch;
    rrect(mx - 2.9, zt - 3.2, mx + 2.9, METER.zBottom + 3.2, 1.0, '#050506', 'rgba(255,255,255,0.12)', 0.25);
  });
  text((CH_X[0] + CH_X[3]) / 2, ASSIGN_Z - 7.5, 'CROSS FADER ASSIGN', 1.9, { color: INK2 });

  // Master meters + dB scale.
  {
    const zt = METER.zBottom - (METER.n - 1) * METER.pitch;
    rrect(MASTER_METER_X[0] - 2.9, zt - 3.2, MASTER_METER_X[1] + 2.9, METER.zBottom + 3.2, 1.0, '#050506', 'rgba(255,255,255,0.12)', 0.25);
    text(MASTER_METER_X[0], METER.zBottom + 7, 'L', 2.0, { color: INK2 });
    text(MASTER_METER_X[1], METER.zBottom + 7, 'R', 2.0, { color: INK2 });
    text((MASTER_METER_X[0] + MASTER_METER_X[1]) / 2, zt - 7.5, 'MASTER', 2.0, { color: INK });
    const db = { 0: '-24', 3: '-12', 5: '-6', 7: '0', 10: '+4', 14: '+10' };
    for (const [idx, lab] of Object.entries(db)) {
      text(MASTER_METER_X[1] + 4.4, METER.zBottom - idx * METER.pitch, lab, 1.7, { align: 'left', color: INK2, track: 0.02 });
    }
  }

  // Crossfader slot + scale.
  {
    const x0 = XF.x - XF.travel / 2 - 6, x1 = XF.x + XF.travel / 2 + 6;
    rrect(x0 - 1.2, XF.z - 2.4, x1 + 1.2, XF.z + 2.4, 2.2, 'rgba(0,0,0,0.45)');
    rrect(x0, XF.z - 1.1, x1, XF.z + 1.1, 1.1, '#030303', 'rgba(255,255,255,0.14)', 0.25);
    for (let k = 0; k <= 8; k++) {
      const x = XF.x - XF.travel / 2 + (XF.travel * k) / 8, long = k % 4 === 0;
      line(x, XF.z - (long ? 11 : 9.5), x, XF.z - 7.5, INK2, long ? 0.45 : 0.3);
    }
    text(XF.x - XF.travel / 2 - 11, XF.z, 'A', 3.2, { weight: 800 });
    text(XF.x + XF.travel / 2 + 11, XF.z, 'B', 3.2, { weight: 800 });
    text(XF.x, XF.z + 11, 'CROSS FADER', 2.3);
  }

  // Knob scales, labels and contact shadows.
  for (const k of knobs) {
    contact(k.x, k.z, k.r * 0.9, k.r * 1.55, 0.7);
    const R = k.r + 2.7;
    const dotAt = (a, rad, col) => dot(k.x + R * Math.sin(a), k.z - R * Math.cos(a), rad, col);
    if (k.kind === 'eq' || k.kind === 'color' || k.kind === 'level') {
      for (let j = 0; j <= 10; j++) {
        const a = -KNOB_SWEEP + (2 * KNOB_SWEEP * j) / 10;
        const big = (k.kind !== 'level' && j === 5) || j === 0 || j === 10;
        dotAt(a, big ? 0.55 : 0.32, big ? INK : INK2);
      }
      if (k.kind === 'color') {
        text(k.x - R - 1.2, k.z + R * 0.62, 'LOW', 1.5, { align: 'right', color: INK2 });
        text(k.x + R + 1.2, k.z + R * 0.62, 'HI', 1.5, { align: 'left', color: INK2 });
      }
    } else if (k.kind === 'select' || k.kind === 'select5' || k.kind === 'select6') {
      const n = k.kind === 'select' ? FX_LIST.length : k.kind === 'select5' ? 5 : 6;
      const sweep = k.kind === 'select' ? KNOB_SWEEP : KNOB_SWEEP * 0.8;
      for (let j = 0; j < n; j++) {
        const a = -sweep + (2 * sweep * j) / (n - 1);
        ctx.save();
        ctx.translate(X(k.x + R * Math.sin(a)), Z(k.z - R * Math.cos(a)));
        ctx.rotate(a);
        ctx.fillStyle = INK2;
        ctx.fillRect(-0.18 * s, -0.8 * s, 0.36 * s, 1.6 * s);
        ctx.restore();
      }
    }
    if (k.label) text(k.x - R - 1.8, k.z, k.label, 2.3, { align: 'right' });
  }
  // Right-column knob labels (above the knob).
  const lab = (x, z, str, size = 2.0, col = INK) => text(x, z, str, size, { color: col });
  lab(RC.master.x, RC.master.z + 15.5, 'MASTER LEVEL');
  lab(RC.balance.x, RC.balance.z + 13, 'BALANCE', 1.8, INK2);
  lab(RC.booth.x, RC.booth.z + 15.5, 'BOOTH MONITOR');
  ['LEVEL', 'HI', 'LOW'].forEach((t, j) => lab(RC.mic.x[j], RC.mic.z + 12, t, 1.8, INK2));
  lab(RC.fxSelect.x, RC.fxSelect.z + 16, 'FX SELECT', 1.9);
  lab(RC.chSelect.x, RC.chSelect.z + 14, 'CH SELECT', 1.8, INK2);
  lab(RC.fxLevel.x, RC.fxLevel.z + 16, 'LEVEL/DEPTH', 1.9);
  lab((RC.beatL.x + RC.beatR.x) / 2, RC.beatL.z, 'BEAT', 2.1);
  text(RC.beatL.x, RC.beatL.z + 7.2, '◀', 2.0, { color: INK2, track: 0 });
  text(RC.beatR.x, RC.beatR.z + 7.2, '▶', 2.0, { color: INK2, track: 0 });
  lab(RC.tap.x, RC.tap.z + 7.8, 'TAP', 1.9);
  lab(RC.fxOn.x, RC.fxOn.z + 11, 'ON/OFF', 2.2);
  lab(RC.hpMix.x, RC.hpMix.z + 15.5, 'MIXING', 1.9);
  text(RC.hpMix.x - 12.5, RC.hpMix.z + 11, 'CUE', 1.5, { color: INK2 });
  text(RC.hpMix.x + 12.5, RC.hpMix.z + 11, 'MST', 1.5, { color: INK2 });
  lab(RC.hpLevel.x, RC.hpLevel.z + 15.5, 'LEVEL', 1.9);
  lab(RC.masterCue.x, RC.masterCue.z + 8.8, 'MASTER CUE', 1.8);
  lab(RC.curveCh.x, RC.curveCh.z - 8, 'CH FADER', 1.8);
  lab(RC.curveX.x, RC.curveX.z - 8, 'CROSS FADER', 1.8);
  for (const c of [RC.curveCh, RC.curveX]) {
    text(c.x - 9, c.z, '/', 2.2, { color: INK2 });
    text(c.x + 9, c.z, '⌐', 2.2, { color: INK2 });
  }
  COLOR_FX.forEach((n, j) => text(RC.colorFx.x0 + j * RC.colorFx.pitch, RC.colorFx.z - 8.4, n, 1.7, { color: INK2, track: 0.04 }));

  // Button cut-outs (dark gap ring under each rubber button).
  for (const b of buttons) {
    rrect(b.x - b.w / 2 - 1.1, b.z - b.d / 2 - 1.1, b.x + b.w / 2 + 1.1, b.z + b.d / 2 + 1.1, 1.8, '#050505', 'rgba(255,255,255,0.10)', 0.25);
    if (b.kind === 'cue') text(b.x, b.z - b.d / 2 - 3.3, 'CUE', 2.0);
  }

  // Screen window + toggle contact shadows.
  rrect(RC.screen.x - RC.screen.w / 2 - 4, RC.screen.z - RC.screen.d / 2 - 4, RC.screen.x + RC.screen.w / 2 + 4,
    RC.screen.z + RC.screen.d / 2 + 4, 2.5, 'rgba(0,0,0,0.55)');
  CH_X.forEach((x) => contact(x, ASSIGN_Z, 3, 7, 0.5));
  contact(RC.curveCh.x, RC.curveCh.z, 3, 7, 0.5);
  contact(RC.curveX.x, RC.curveX.z, 3, 7, 0.5);

  // The one mark on the unit: a small engraved SHAPE, bottom-left.
  text(-190, 200, 'SHAPE', 3.6, { align: 'left', weight: 800, squeeze: 1, track: 0.32, color: '#d6d8dc' });
  dot(-193.5, 200, 0.9, accent);
  text(-160, 200.2, '4-CHANNEL CLUB MIXER', 1.7, { align: 'left', color: INK2, track: 0.14 });
}

// ─── The BEAT FX screen ─────────────────────────────────────────────────────────────────────

function drawScreen(ctx, w, h, st, accent, beatIdx) {
  const u = w / 384;
  const fx = st.fx;
  ctx.fillStyle = '#040608';
  ctx.fillRect(0, 0, w, h);
  const T = (str, x, y, size, color, align = 'left', weight = 700) => {
    ctx.font = `${weight} ${size * u}px ${FONT}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
    ctx.fillText(str, x * u, y * u);
  };
  // Header bar.
  ctx.fillStyle = '#121922';
  ctx.fillRect(0, 0, w, 30 * u);
  T('BEAT FX', 10, 15, 15, '#9fb0c2');
  T(`CH ${st.fx.chLabel}`, 118, 15, 15, '#9fb0c2');
  for (let i = 0; i < 4; i++) {                              // beat-in-bar pips
    ctx.fillStyle = i === beatIdx && st.bpm ? accent : '#2a3440';
    ctx.fillRect((226 + i * 17) * u, 9 * u, 12 * u, 12 * u);
  }
  ctx.fillStyle = fx.on ? '#e0262e' : '#2a3440';
  roundRectPath(ctx, 318 * u, 5 * u, 58 * u, 20 * u, 4 * u); ctx.fill();
  T(fx.on ? 'ON' : 'OFF', 347, 15, 14, fx.on ? '#fff' : '#8b97a4', 'center');
  // FX name + level bar.
  const name = String(fx.name || '').toUpperCase().slice(0, 12);
  T(name, 12, 64, name.length > 8 ? 34 : 44, '#f4f6f8', 'left', 800);
  T('LEVEL', 12, 102, 12, '#8b97a4');
  ctx.fillStyle = '#1b232c'; ctx.fillRect(62 * u, 96 * u, 150 * u, 12 * u);
  ctx.fillStyle = accent; ctx.fillRect(62 * u, 96 * u, 150 * u * clamp(fx.level, 0, 1), 12 * u);
  // Beat value box.
  ctx.strokeStyle = accent; ctx.lineWidth = 3 * u;
  roundRectPath(ctx, 252 * u, 40 * u, 122 * u, 70 * u, 6 * u); ctx.stroke();
  T(String(fx.beat || '1'), 313, 68, 38, '#ffffff', 'center', 800);
  const frac = beatFraction(fx.beat);
  const ms = st.bpm ? Math.round((60000 / st.bpm) * frac) : null;
  T(ms ? `${ms} ms` : '— ms', 313, 98, 13, '#9fb0c2', 'center');
  // BPM line.
  T(st.bpm ? st.bpm.toFixed(1) : '---.-', 12, 138, 30, '#f4f6f8', 'left', 800);
  T('BPM', 112, 142, 14, '#8b97a4');
  T('AUTO', 150, 142, 14, accent);
  // Beat ribbon.
  const cw = (w / u - 20) / BEATS.length;
  BEATS.forEach((b, i) => {
    const x = 10 + i * cw, on = b === String(fx.beat);
    ctx.fillStyle = on ? accent : '#141b23';
    ctx.fillRect((x + 1) * u, 166 * u, (cw - 2) * u, 24 * u);
    T(b, x + cw / 2, 178, 13, on ? '#031012' : '#8b97a4', 'center');
  });
}

function beatFraction(b) {
  const m = String(b || '1').match(/^(\d+)(?:\/(\d+))?$/);
  if (!m) return 1;
  return Number(m[1]) / (m[2] ? Number(m[2]) : 1);
}

// ─── Public API ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the mixer.
 * @param {{ THREE: any, accent?: string, textureScale?: number }} opts  textureScale scales the
 *   2048-px panel and 384-px screen canvases (0.5 for phones).
 * @returns {{ group, anchors, set, update, dispose, dims }}
 *
 * set(state) takes any subset and persists it:
 *   ch: [4 × { fader 0..1, trim, hi, mid, low, color −1..1, cue bool, level 0..1 }],
 *   xfader −1..1, master: { l, r } 0..1, fx: { on, name, beat, level 0..1, channel? }, bpm,
 *   and (optional extras) colorFx: 'SPACE'|'ECHO'|'SWEEP'|'NOISE'|'CRUSH'|'FILTER',
 *   masterKnob / balance / booth −1..1, mic: { level, hi, low }, hp: { mix, level }, masterCue, midi.
 * update(dt, t): meter ballistics + peak hold, LED blink on the beat, BEAT FX screen redraw
 *   (only on change, ≤ 20 fps). Knob / fader transforms and anchors move inside set().
 */
export function createMixer({ THREE, accent = '#34d6c5', textureScale = 1, finish = 'physical' }) {
  const PHYS = finish === 'physical'; // desktop: clear-coated body and fader caps; phones: MeshStandard
  const group = new THREE.Group();
  group.name = 'djmMixer';
  const owned = { geos: [], mats: [], texs: [], canvases: [] };
  const own = (kind, x) => { owned[kind].push(x); return x; };
  const accentColor = new THREE.Color(accent);
  const accentCss = `#${accentColor.getHexString()}`;     // canvases need a CSS string
  const knobs = knobTable();
  const buttons = buttonTable();
  const Hm = H * MM;

  // State (persists between set() calls).
  const state = {
    ch: [0, 1, 2, 3].map(() => ({ fader: 0, trim: 0, hi: 0, mid: 0, low: 0, color: 0, cue: false, level: 0 })),
    xfader: 0, master: { l: 0, r: 0 },
    fx: { on: false, name: 'ECHO', beat: '1/2', level: 0.5, chSelect: 0.6, chLabel: 'MST' },
    bpm: null, colorFx: 'FILTER', masterKnob: 0.35, balance: 0, booth: -0.2,
    mic: { level: -1, hi: 0, low: 0 }, hp: { mix: -0.3, level: 0.2 }, masterCue: false, midi: false,
  };

  // ── Materials ──
  const matBody = own('mats', makeCtrlMaterial(THREE, { color: '#0c0d0f', roughness: 0.58, metalness: 0.3, paint: '#cfd2d6', clearcoat: PHYS ? 0.25 : 0, clearcoatRoughness: 0.3 }));
  const matKnob = own('mats', makeCtrlMaterial(THREE, { color: '#0e0f11', roughness: 0.66, metalness: 0.0, paintGlow: 0.3, flutes: 30 }));
  const matCap = own('mats', makeCtrlMaterial(THREE, { color: '#101113', roughness: 0.4, metalness: 0.0, paintGlow: 0.3, paint: '#d8dadd', clearcoat: PHYS ? 0.9 : 0, clearcoatRoughness: 0.08 }));
  const matButton = own('mats', makeCtrlMaterial(THREE, { color: '#0e0f11', roughness: 0.72, metalness: 0.0 }));
  const matMeter = own('mats', new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));

  // ── Top plate with the printed panel ──
  const cw = Math.round(2048 * textureScale);
  const chh = Math.round(cw * PLATE.d / PLATE.w);
  const panelCanvas = own('canvases', makeCanvas(cw, chh));
  const pctx = panelCanvas.getContext('2d');
  drawPanel(pctx, cw, chh, knobs, buttons, prng(9107), accentCss);
  const panelTex = own('texs', new THREE.CanvasTexture(panelCanvas));
  panelTex.colorSpace = THREE.SRGBColorSpace;
  panelTex.anisotropy = 8;
  const matPlate = own('mats', new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.6, metalness: 0.28 }));
  matPlate.onBeforeCompile = (sh) => {                     // printed paint is dielectric + rougher
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nfloat inkAmt = smoothstep( 0.18, 0.5, max( diffuseColor.r, max( diffuseColor.g, diffuseColor.b ) ) );\nmetalnessFactor *= 1.0 - inkAmt;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.62, smoothstep( 0.18, 0.5, max( diffuseColor.r, max( diffuseColor.g, diffuseColor.b ) ) ) );');
  };
  matPlate.customProgramCacheKey = () => 'djmMixer-plate-v1';
  const plateGeo = own('geos', new RoundedBoxGeometry(PLATE.w * MM, PLATE.t * MM, PLATE.d * MM, 2, 1.2 * MM));
  plateGeo.translate(0, Hm - PLATE.t * MM / 2, 0);
  {
    const p = plateGeo.attributes.position, uv = plateGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) {                    // planar top-down projection
      uv.setXY(i, clamp((p.getX(i) / MM + PLATE.w / 2) / PLATE.w, 0, 1), clamp(1 - (p.getZ(i) / MM + PLATE.d / 2) / PLATE.d, 0, 1));
    }
  }
  const plate = new THREE.Mesh(plateGeo, matPlate);
  plate.name = 'topPlate';
  plate.receiveShadow = true;

  // ── Static chassis + fixed hardware (one merged mesh) ──
  const parts = [];
  const bodyH = H - PLATE.t + 1 - FEET;                    // overlaps 1 mm into the plate
  const body = new RoundedBoxGeometry(W * MM, bodyH * MM, D * MM, 3, 6 * MM);
  body.translate(0, (FEET + bodyH / 2) * MM, 0);
  parts.push(tag(THREE, body));
  for (const [fx, fz] of [[-170, -190], [170, -190], [-170, 190], [170, 190]]) {
    const foot = new THREE.CylinderGeometry(11 * MM, 12 * MM, FEET * MM, 12);
    foot.translate(fx * MM, FEET / 2 * MM, fz * MM);
    parts.push(tag(THREE, foot, 0.03));
  }
  // Front-panel strip (slightly proud, satin) with the headphone jacks under the phones section.
  const strip = new RoundedBoxGeometry(392 * MM, 26 * MM, 0.8 * MM, 1, 0.3 * MM);
  strip.translate(0, 62 * MM, (D / 2 + 0.15) * MM);
  parts.push(tag(THREE, strip, 0.025));
  for (const [jx, r] of [[140, 7.2], [172, 5.2]]) {
    parts.push(tag(THREE, zCyl(THREE, r, 2.2, jx, 62, D / 2 + 1.1), 0.62, 0, 1));
    parts.push(tag(THREE, zCyl(THREE, r * 0.5, 0.4, jx, 62, D / 2 + 2.25), 0.0));
  }
  // Two small front toggles (fader-start style) under the channel area.
  for (const jx of [-150, -40]) {
    const sw = new RoundedBoxGeometry(12 * MM, 5 * MM, 1.8 * MM, 1, 0.6 * MM);
    sw.translate(jx * MM, 62 * MM, (D / 2 + 1) * MM);
    parts.push(tag(THREE, sw, 0.15));
  }
  // Rear panel: RCA pairs, XLR outs, power inlet (faces the crowd at −Z).
  for (let i = 0; i < 8; i++) {
    const x = -185 + i * 36;
    for (const y of [48, 70]) {
      const rca = zCyl(THREE, 4.2, 5, x, y, -D / 2 - 2.5, 8);
      parts.push(tag(THREE, rca, 0.75, 0, 1));
      parts.push(tag(THREE, zCyl(THREE, 1.4, 0.6, x, y, -D / 2 - 5.2, 6), 0.0));
    }
  }
  for (const x of [115, 150]) {
    parts.push(tag(THREE, zCyl(THREE, 10, 3, x, 58, -D / 2 - 1.5, 16), 0.6, 0, 1));      // metal shell
    parts.push(tag(THREE, zCyl(THREE, 8.2, 0.6, x, 58, -D / 2 - 3.1, 16), 0.0));         // black insert
    for (const [dx, dy] of [[-3.2, 1.8], [3.2, 1.8], [0, -3.4]]) parts.push(tag(THREE, zCyl(THREE, 1.1, 0.3, x + dx, 58 + dy, -D / 2 - 3.45, 6), 0.7, 0, 1));
  }
  {
    const pw = new RoundedBoxGeometry(24 * MM, 16 * MM, 4 * MM, 1, 1 * MM);
    pw.translate(185 * MM, 55 * MM, (-D / 2 - 2) * MM);
    parts.push(tag(THREE, pw, 0.04));
  }
  // Panel screws.
  for (const [sx, sz] of [[-199, -214.5], [199, -214.5], [-199, 214.5], [199, 214.5], [80, -214.5], [80, 214.5]]) {
    const sc = new THREE.CylinderGeometry(2.3 * MM, 2.5 * MM, 0.7 * MM, 14);
    sc.translate(sx * MM, (H + 0.3) * MM, sz * MM);
    parts.push(tag(THREE, sc, 0.3, 0, 1));
  }
  // Toggles: crossfader assign (CH2 → A for deck 1, CH3 → B for deck 2), curve selectors.
  CH_X.forEach((x, i) => parts.push(...toggleGeometry(THREE, x, ASSIGN_Z, [0, -1, 1, 0][i])));
  parts.push(...toggleGeometry(THREE, RC.curveCh.x, RC.curveCh.z, 0));
  parts.push(...toggleGeometry(THREE, RC.curveX.x, RC.curveX.z, 1));
  // BEAT FX screen bezel.
  {
    const bz = new RoundedBoxGeometry((RC.screen.w + 6) * MM, 2.4 * MM, (RC.screen.d + 6) * MM, 2, 1.4 * MM);
    bz.translate(RC.screen.x * MM, (H + 0.6) * MM, RC.screen.z * MM);
    parts.push(tag(THREE, bz, 0.02));
  }
  const staticGeo = own('geos', merge(parts));
  const staticMesh = new THREE.Mesh(staticGeo, matBody);
  staticMesh.name = 'chassis';
  staticMesh.castShadow = true;
  staticMesh.receiveShadow = true;

  // ── Knobs (instanced) ──
  const knobGeo = own('geos', knobGeometry(THREE));
  const knobMesh = new THREE.InstancedMesh(knobGeo, matKnob, knobs.length);
  knobMesh.name = 'knobs';
  knobMesh.castShadow = true;
  knobMesh.frustumCulled = false;

  // ── Fader caps (4 channels + crossfader, instanced) ──
  const capGeo = own('geos', faderCapGeometry(THREE));
  const capMesh = new THREE.InstancedMesh(capGeo, matCap, 5);
  capMesh.name = 'faderCaps';
  capMesh.castShadow = true;
  capMesh.frustumCulled = false;
  const capTop = (CAP.lift + CAP.h - CAP.dish + CAP.bevel) * MM;

  // ── Buttons (instanced; LED colour via instance colour) ──
  const btnGeo = own('geos', buttonGeometry(THREE));
  const btnMesh = new THREE.InstancedMesh(btnGeo, matButton, buttons.length);
  btnMesh.name = 'buttons';
  btnMesh.castShadow = true;
  btnMesh.frustumCulled = false;
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    buttons.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x * MM, Hm - 1.5 * MM, b.z * MM), q, new THREE.Vector3(b.w * MM, (b.h + 1.5) * MM, b.d * MM));
      btnMesh.setMatrixAt(i, m);
      btnMesh.setColorAt(i, new THREE.Color(0, 0, 0));
    });
  }

  // ── Light bleed: a soft additive halo on the panel around each lit button ──
  const glowCanvas = own('canvases', makeCanvas(64, 64));
  {
    const g = glowCanvas.getContext('2d'), rg = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
  }
  const glowTex = own('texs', new THREE.CanvasTexture(glowCanvas));
  const matGlow = own('mats', new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false }));
  const glowGeo = own('geos', new THREE.PlaneGeometry(1, 1));
  glowGeo.rotateX(-Math.PI / 2);
  const glowMesh = new THREE.InstancedMesh(glowGeo, matGlow, buttons.length);
  glowMesh.name = 'buttonGlow';
  glowMesh.frustumCulled = false;
  glowMesh.renderOrder = 2;
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    buttons.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x * MM, Hm + 0.12 * MM, b.z * MM), q, new THREE.Vector3((b.w + 14) * MM, 1, (b.d + 14) * MM));
      glowMesh.setMatrixAt(i, m);
      glowMesh.setColorAt(i, new THREE.Color(0, 0, 0));
    });
  }

  // ── Level meters (instanced LED segments) ──
  const meterCols = [...CH_X.map((x) => x + METER.dx), ...MASTER_METER_X];
  const segGeo = own('geos', new THREE.BoxGeometry(METER.segW * MM, 0.35 * MM, METER.segL * MM));
  segGeo.translate(0, 0.175 * MM, 0);
  const meterMesh = new THREE.InstancedMesh(segGeo, matMeter, meterCols.length * METER.n);
  meterMesh.name = 'meters';
  meterMesh.frustumCulled = false;
  const segColors = [];
  {
    const m = new THREE.Matrix4();
    const green = new THREE.Color('#2cf06a'), amber = new THREE.Color('#ffa51c'), red = new THREE.Color('#ff2d2d');
    meterCols.forEach((mx, c) => {
      for (let j = 0; j < METER.n; j++) {
        m.makeTranslation(mx * MM, Hm + 0.02 * MM, (METER.zBottom - j * METER.pitch) * MM);
        meterMesh.setMatrixAt(c * METER.n + j, m);
        segColors.push(j < 8 ? green : j < 12 ? amber : red);
      }
    });
  }
  const meterDisp = meterCols.map(() => ({ v: 0, peak: 0, hold: 0 }));

  // ── BEAT FX screen ──
  const sw = Math.round(384 * textureScale), sh = Math.round(sw * RC.screen.d / RC.screen.w);
  const screenCanvas = own('canvases', makeCanvas(sw, sh));
  const sctx = screenCanvas.getContext('2d');
  const screenTex = own('texs', new THREE.CanvasTexture(screenCanvas));
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.anisotropy = 4;
  const matScreen = own('mats', new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  const screenGeo = own('geos', new THREE.PlaneGeometry(RC.screen.w * MM, RC.screen.d * MM));
  screenGeo.rotateX(-Math.PI / 2);
  const screen = new THREE.Mesh(screenGeo, matScreen);
  screen.name = 'fxScreen';
  screen.position.set(RC.screen.x * MM, (H + 1.85) * MM, RC.screen.z * MM);

  group.add(staticMesh, plate, knobMesh, capMesh, btnMesh, meterMesh, screen, glowMesh);

  // ── Anchors ──
  const anchor = (name, x, y, z) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    group.add(o);
    return o;
  };
  const kById = Object.fromEntries(knobs.map((k) => [k.id, k]));
  const bById = Object.fromEntries(buttons.map((b) => [b.id, b]));
  const kTop = (id) => { const k = kById[id]; return anchor(id, k.x * MM, Hm + k.h * MM, k.z * MM); };
  const bTop = (id) => { const b = bById[id]; return anchor(id, b.x * MM, Hm + b.h * MM, b.z * MM); };
  const anchors = {
    ch: CH_X.map((x, i) => ({
      fader: anchor(`fader${i}`, x * MM, Hm + capTop, FADER.z0 * MM),
      trim: kTop(`trim${i}`), hi: kTop(`hi${i}`), mid: kTop(`mid${i}`), low: kTop(`low${i}`),
      color: kTop(`color${i}`), cue: bTop(`cue${i}`),
    })),
    xfader: anchor('xfader', XF.x * MM, Hm + capTop, XF.z * MM),
    masterLevel: kTop('master'),
    fxOn: bTop('fxOn'),
    fxKnob: kTop('fxLevel'),
    fxSelect: kTop('fxSelect'),
    fxScreen: anchor('fxScreenAnchor', RC.screen.x * MM, (H + 1.9) * MM, RC.screen.z * MM),
    booth: kTop('booth'),
    hpMix: kTop('hpMix'), hpLevel: kTop('hpLevel'), masterCue: bTop('masterCue'),
    beatLeft: bTop('beatL'), beatRight: bTop('beatR'), tap: bTop('tap'),
    colorFx: COLOR_FX.map((_, j) => bTop(`cfx${j}`)),
  };

  // ── Applying state ──
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  function applyKnobs() {
    knobs.forEach((k, i) => {
      const v = k.fixed != null ? k.fixed : clamp(num(k.get(state), 0), -1, 1);
      _q.setFromAxisAngle(_up, -v * KNOB_SWEEP);
      _p.set(k.x * MM, Hm, k.z * MM);
      _s.set(k.r * MM, k.h * MM, k.r * MM);
      knobMesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    });
    knobMesh.instanceMatrix.needsUpdate = true;
  }
  function applyFaders() {
    _s.set(1, 1, 1);
    CH_X.forEach((x, i) => {
      const v = clamp(num(state.ch[i].fader, 0), 0, 1);
      const z = (FADER.z0 + (FADER.z1 - FADER.z0) * v) * MM;
      _q.identity();
      capMesh.setMatrixAt(i, _m.compose(_p.set(x * MM, Hm, z), _q, _s));
      anchors.ch[i].fader.position.set(x * MM, Hm + capTop, z);
    });
    const xv = clamp(num(state.xfader, 0), -1, 1);
    const xx = (XF.x + xv * XF.travel / 2) * MM;
    _q.setFromAxisAngle(_up, Math.PI / 2);
    capMesh.setMatrixAt(4, _m.compose(_p.set(xx, Hm, XF.z * MM), _q, _s));
    anchors.xfader.position.set(xx, Hm + capTop, XF.z * MM);
    capMesh.instanceMatrix.needsUpdate = true;
  }

  // LED colours (linear; values > 1 bloom through tone mapping).
  const LED = {
    cue: new THREE.Color('#ffc21a').multiplyScalar(2.2),
    cueOff: new THREE.Color('#ffc21a').multiplyScalar(0.035),
    red: new THREE.Color('#ff1e1e').multiplyScalar(2.6),
    redOff: new THREE.Color('#ff1e1e').multiplyScalar(0.03),
    white: new THREE.Color('#dfe8ff').multiplyScalar(0.9),
    whiteDim: new THREE.Color('#dfe8ff').multiplyScalar(0.07),
    whiteOff: new THREE.Color('#dfe8ff').multiplyScalar(0.015),
    accent: accentColor.clone().multiplyScalar(1.9),
    accentDim: accentColor.clone().multiplyScalar(0.04),
  };
  const _c = new THREE.Color(), _g = new THREE.Color();

  let screenKey = '';
  let screenClock = 1;

  function set(next = {}) {
    if (!next || typeof next !== 'object') return;
    if (Array.isArray(next.ch)) {
      next.ch.forEach((c, i) => { if (c && state.ch[i]) Object.assign(state.ch[i], c); });
    }
    if (next.xfader != null) state.xfader = next.xfader;
    if (next.master) Object.assign(state.master, next.master);
    if (next.fx) {
      Object.assign(state.fx, next.fx);
      if (next.fx.channel != null) state.fx.chLabel = String(next.fx.channel);
    }
    if ('bpm' in next) state.bpm = typeof next.bpm === 'number' && next.bpm > 0 ? next.bpm : null;
    for (const key of ['colorFx', 'masterKnob', 'balance', 'booth', 'masterCue', 'midi']) if (next[key] != null) state[key] = next[key];
    if (next.mic) Object.assign(state.mic, next.mic);
    if (next.hp) Object.assign(state.hp, next.hp);
    applyKnobs();
    applyFaders();
  }

  function update(dt = 1 / 60, t = 0) {
    dt = clamp(num(dt, 1 / 60), 0, 0.25);
    const beats = state.bpm ? (t * state.bpm) / 60 : t * 2;
    const phase = beats - Math.floor(beats);
    const beatIdx = ((Math.floor(beats) % 4) + 4) % 4;

    // Meters: instant attack, eased release, 0.9 s peak hold.
    for (let c = 0; c < meterDisp.length; c++) {
      const lv = c < 4 ? state.ch[c].level : c === 4 ? state.master.l : state.master.r;
      const d = meterDisp[c];
      const target = clamp(num(lv, 0), 0, 1);
      d.v = target >= d.v ? target : Math.max(target, d.v - dt * 1.8);
      if (d.v >= d.peak) { d.peak = d.v; d.hold = 0.9; } else if ((d.hold -= dt) < 0) d.peak = Math.max(d.v, d.peak - dt * 0.9);
      const lit = Math.round(d.v * METER.n);
      const pk = d.peak > 0.04 ? Math.min(METER.n - 1, Math.ceil(d.peak * METER.n) - 1) : -1;
      for (let j = 0; j < METER.n; j++) {
        const on = j < lit || j === pk;
        _c.copy(segColors[c * METER.n + j]).multiplyScalar(on ? 1.0 : 0.075);
        meterMesh.setColorAt(c * METER.n + j, _c);
      }
    }
    meterMesh.instanceColor.needsUpdate = true;

    // Buttons.
    const anyColor = state.ch.some((c) => Math.abs(num(c.color, 0)) > 0.06);
    const fxBlink = phase < 0.5;
    buttons.forEach((b, i) => {
      let col;
      switch (b.kind) {
        case 'cue': col = state.ch[b.ch].cue ? LED.cue : LED.cueOff; break;
        case 'masterCue': col = state.masterCue ? LED.cue : LED.cueOff; break;
        case 'fxOn': col = state.fx.on ? (fxBlink ? LED.red : LED.redOff) : LED.redOff; break;
        case 'tap': col = state.bpm && phase < 0.12 ? LED.white : LED.whiteOff; break;
        case 'beat': col = LED.whiteDim; break;
        case 'midi': col = state.midi ? LED.accent : LED.accentDim; break;
        case 'midiStart': col = LED.whiteOff; break;
        case 'colorFx': {
          const sel = String(state.colorFx).toUpperCase() === b.name;
          col = sel ? (anyColor ? LED.accent : _c.copy(LED.accent).multiplyScalar(0.55)) : LED.accentDim;
          break;
        }
        default: col = LED.whiteOff;
      }
      btnMesh.setColorAt(i, col);
      glowMesh.setColorAt(i, _g.copy(col).multiplyScalar(0.12));
    });
    btnMesh.instanceColor.needsUpdate = true;
    glowMesh.instanceColor.needsUpdate = true;

    // Screen: redraw on change, at most 20 fps.
    screenClock += dt;
    const key = [state.fx.name, state.fx.beat, state.fx.on, Math.round(clamp(num(state.fx.level, 0), 0, 1) * 40),
      state.bpm ? state.bpm.toFixed(1) : '-', state.bpm ? beatIdx : -1, state.fx.chLabel].join('|');
    if (key !== screenKey && screenClock >= 0.05) {
      drawScreen(sctx, sw, sh, state, accentCss, beatIdx);
      screenTex.needsUpdate = true;
      screenKey = key;
      screenClock = 0;
    }
  }

  function dispose() {
    group.removeFromParent();
    [knobMesh, capMesh, btnMesh, meterMesh, glowMesh].forEach((m) => m.dispose());
    owned.geos.forEach((g) => g.dispose());
    owned.mats.forEach((m) => m.dispose());
    owned.texs.forEach((t) => t.dispose());
    owned.canvases.forEach((c) => { c.width = 0; c.height = 0; });
    group.clear();
  }

  set({});
  update(0, 0);
  return { group, anchors, set, update, dispose, dims: DJM_DIMS };
}
