// clubExterior.mjs — Club Shape from outside: the venue on its peninsula in the bay, at night.
//
// As the Shape Sets background (mobile-app/public/club-shape-bg.jpg) draws it, from the air: an
// open-air amphitheater on the tip of a waterfront peninsula. A huge ribbed shell scoops up over the
// stage at the back, its face to the crowd, the stage lit in its mouth; one glowing ice-teal ribbon
// runs along its high back edge and on round the rim of the open bowl in front, where the crowd
// stands ringed by terraces, so the whole venue is drawn in one lopsided loop; warm-lit promenades
// curve round it with lamps and palms; black water on three sides; a city skyline across the bay.
//
// It is a set of its own, not a shell over the hall: the interior (clubVenue.mjs) is a different
// space, so the host shows one or the other (createSetSwitch). The arrival shot flies in from the
// bay, over the crowd toward the stage in the shell's mouth, and the director cuts from there
// to Nora at the decks.
//
// World frame: the booth's (metres, +Y up). The venue is centred at (0, −10), its footprint about
// 62 m to the sides and 50 m front to back; the shell's back edge reaches 34 m, its mouth 27 m,
// the bowl's rim 6 m.
//   peninsula  ground at y 0, its coast 100–230 m from (−25, −30), joined to the west shore
//   water      y −2.4; the city shore across the bay at z ≈ +420
//
// Rules as the venue's: no Math.random (seeded mulberry32), no clock (the caller passes t), no DOM
// at import (canvases are made inside createExterior), everything allocated is disposed, no lights
// (colour is baked; the glow is emissive colour above the bloom threshold). No imports: THREE is
// passed in, so the pure geometry below is testable in Node.

// ── the venue (pure) ─────────────────────────────────────────────────────────────────────────
// As in the picture: an open-air amphitheater. A ribbed shell scoops up over the stage at the back
// (+z, toward the city) and round the −x side; in front of it the crowd stands in an open bowl
// ringed by terraces; one teal ribbon runs along the shell's back edge and on round the bowl's rim.
// The camera comes in from −z, so +x is the left of its frame. Plan angles are polar round the
// centre: 0 = +x, π/2 = +z (the back).
export const VENUE = {
  x: 0, z: -10,                 // the centre
  A: 62, B: 50, n: 2.3,         // the footprint: semi-axes (x, z) and superellipse exponent
  RIM_H: 6,                     // the bowl's outer wall, where the terraces top out and the shell lands
  LIP_H: 27,                    // the shell's mouth over the stage, at its highest
  LIP_BOW: 12,                  // how far the mouth bows back from the chord between its ends
  BACK_H: 34,                   // the shell's back edge at its highest, the ribbon along it
  SAG: 3,                       // how far the shell's face dips below a straight run from mouth to back
  FLOOR_Y: 0.3,                 // the crowd floor
  CROWD_K: 0.7,                 // the floor runs out to this fraction of the footprint; terraces beyond
  TIERS: 6,
  TH_A: 0.32, TH_B: Math.PI + 0.3,    // where the shell comes down onto the rim: just past the pinch on
                                      // +x, and at the front on −x, as the picture's ribbon does
  STAGE: { x: 0, z: 12.5, w: 30, d: 10, h: 2 },   // the stage under the roof, facing the crowd (−z)
  WALL: { z: 18.5, w: 24, y0: 2.3, y1: 13 },      // its LED wall
  TRUSS: { y: 17, z: 8.5, w: 34 },                 // the lighting truss over the front of the stage
};

export const EXTERIOR_DIMS = {
  WATER_Y: -2.4,
  GROUND_Y: 0,
  LAND_C: [-25, -30],                 // the peninsula's centre
  CITY_Z: 420,                        // the city shore across the bay
  WEST_X: -250,                       // the west shore the peninsula joins
  NEAR: 0.5, FAR: 4000,               // the camera's range while it is outside
};
const { WATER_Y, LAND_C, CITY_Z, WEST_X } = EXTERIOR_DIMS;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const bump = (th, at, w) => Math.exp(-Math.pow(wrapPi(th - at) / w, 2));
/**
 * The footprint's radius at plan angle th: the picture's lopsided plectrum, not an oval. A
 * superellipse, drawn out at the back on +x where the roof reaches furthest, swelling at the front
 * on +x where the bowl bulges, and pinched between the two, where the ribbon bends in on its way
 * from the roof's end to the bowl.
 */
export function outline(th) {
  const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th)), { A, B, n } = VENUE;
  const r = 1 / Math.pow(Math.pow(c / A, n) + Math.pow(s / B, n), 1 / n);
  return r * (1 + 0.2 * bump(th, 1.05, 0.55) + 0.2 * bump(th, -0.45, 0.42) - 0.26 * bump(th, 0.22, 0.16) - 0.06 * bump(th, -2.2, 0.6));
}
/** The plan point at angle th, at fraction k of the footprint's radius plus d metres out. */
export function outlinePt(th, k = 1, d = 0) {
  const r = outline(th) * k + d;
  return [VENUE.x + Math.cos(th) * r, VENUE.z + Math.sin(th) * r];
}
/** Where (x, z) sits in the footprint, as a fraction of its radius there: under 1 is inside. */
export function footprintK(x, z) {
  const dx = x - VENUE.x, dz = z - VENUE.z;
  return Math.hypot(dx, dz) / outline(Math.atan2(dz, dx));
}
/** The shell's mouth at t (0 its +x end, 1 its −x end): a low arch over the stage, bowed back from its ends. */
export function lipPoint(t) {
  const [ax, az] = outlinePt(VENUE.TH_A), [bx, bz] = outlinePt(VENUE.TH_B);
  const s = Math.sin(Math.PI * clamp(t, 0, 1));
  const y = VENUE.RIM_H + (VENUE.LIP_H - VENUE.RIM_H) * Math.pow(s, 0.7);
  return [lerp(ax, bx, t), y, lerp(az, bz, t) + VENUE.LIP_BOW * s];
}
/** How high the back edge stands at t, 0 at its ends to 1 at its peak: steep up out of the pinch on +x, a long fall to −x. */
export function edgeRise(t) {
  return Math.pow(Math.sin(Math.PI * Math.pow(clamp(t, 0, 1), 0.58)), 0.45);
}
/** The shell's back edge at t, round the back of the footprint: the top of the picture, where the ribbon runs. */
export function backPoint(t) {
  const [x, z] = outlinePt(lerp(VENUE.TH_A, VENUE.TH_B, t));
  return [x, VENUE.RIM_H + (VENUE.BACK_H - VENUE.RIM_H) * edgeRise(t), z];
}
/**
 * The shell at t across and s from its mouth (0) to its back edge (1): a scoop, low over the stage
 * and sweeping up to the back edge, so its ribbed face turns to the bowl and to any camera in front,
 * as in the picture. Its ends close where mouth and back edge meet on the rim.
 */
export function roofPoint(t, s) {
  const L = lipPoint(t), K = backPoint(t), m = Math.sin(Math.PI * clamp(t, 0, 1));
  const y = lerp(L[1], K[1], s * s) - VENUE.SAG * m * Math.sin(Math.PI * s) * (1 - s);
  return [lerp(L[0], K[0], s), y, lerp(L[2], K[2], s)];
}
/** The terraces' height at footprint fraction k: the floor inside CROWD_K, then TIERS steps to the rim. */
export function tierHeight(k) {
  const { CROWD_K, TIERS, FLOOR_Y, RIM_H } = VENUE;
  if (k < CROWD_K) return FLOOR_Y;
  const i = Math.min(TIERS - 1, Math.floor(((k - CROWD_K) / (1 - CROWD_K)) * TIERS));
  return FLOOR_Y + ((i + 1) * (RIM_H - FLOOR_Y)) / TIERS;
}
/** The teal ribbon's path: along the shell's back edge from end to end, then round the front of the rim back to the start. */
export function ribbonPath(nEdge = 220, nRim = 200) {
  const at = (t) => {
    const [x, y, z] = backPoint(t), th = Math.atan2(z - VENUE.z, x - VENUE.x);
    return [x + Math.cos(th) * 0.3, y + 0.35, z + Math.sin(th) * 0.3];
  };
  // the edge climbs near-vertically out of the rim at each end, so it is split where it climbs
  // fastest until no step is longer than 1.5 m
  let ts = [];
  for (let i = 0; i <= nEdge; i++) ts.push(i / nEdge);
  for (let pass = 0; pass < 12; pass++) {
    const next = [ts[0]];
    let split = false;
    for (let i = 1; i < ts.length; i++) {
      const a = at(ts[i - 1]), b = at(ts[i]);
      if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) > 1.5) { next.push((ts[i - 1] + ts[i]) / 2); split = true; }
      next.push(ts[i]);
    }
    ts = next;
    if (!split) break;
  }
  const pts = ts.map(at);
  for (let i = 1; i < nRim; i++) {
    const th = lerp(VENUE.TH_B, VENUE.TH_A + 2 * Math.PI, i / nRim);
    const [x, z] = outlinePt(th, 1, 0.3);
    pts.push([x, VENUE.RIM_H + 0.35, z]);
  }
  return pts;
}

/**
 * Hide everything in the scene but the exterior while the camera is outside, and give back exactly
 * what it hid. Applied every frame, so whatever the host adds or shows meanwhile (Nora loading, her
 * own per-frame visibility) is caught too; a Set, so a node shown again by its host is held once.
 */
export function createSetSwitch(scene, keep) {
  const hidden = new Set();
  return {
    apply(outside) {
      if (outside) {
        for (const o of scene.children) if (o !== keep && o.visible) { o.visible = false; hidden.add(o); }
      } else if (hidden.size) {
        for (const o of hidden) o.visible = true;
        hidden.clear();
      }
    },
    get hiddenCount() { return hidden.size; },
  };
}

// ── the peninsula (pure) ─────────────────────────────────────────────────────────────────────
/** The peninsula's coast: its distance from LAND_C at polar angle th (it runs out west to the shore). */
export function coastRadius(th) {
  return 118 + 16 * Math.sin(2 * th + 0.4) + 9 * Math.sin(3 * th + 1.3) + 5 * Math.sin(5 * th + 2.0)
    + 140 * Math.pow(Math.max(0, -Math.cos(th)), 6) - 34 * Math.pow(Math.max(0, -Math.sin(th)), 3);
}
export function cityShoreZ(x) { return CITY_Z + 12 * Math.sin(x / 90) + 8 * Math.sin(x / 37 + 1); }
export function westShoreX(z) { return WEST_X + 10 * Math.sin(z / 60) + 6 * Math.sin(z / 23 + 2); }
/** Signed distance (approximate, metres) into the peninsula: > 0 on land. */
export function landDepth(x, z) {
  const dx = x - LAND_C[0], dz = z - LAND_C[1];
  return coastRadius(Math.atan2(dz, dx)) - Math.hypot(dx, dz);
}

// ── the build ────────────────────────────────────────────────────────────────────────────────
export function makeCanvas(w, h) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}

// A view-distance haze for the exterior's own Basic materials: the far city sinks into the warm glow
// over it, as in the picture. Injected rather than scene fog, which every interior material would
// pick up as well.
function addHaze(mat, U) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHaze = U.uHaze; sh.uniforms.uHazeNear = U.uHazeNear; sh.uniforms.uHazeFar = U.uHazeFar; sh.uniforms.uHazeMax = U.uHazeMax;
    sh.vertexShader = 'varying float vHazeD;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vHazeD = length(mvPosition.xyz);');
    sh.fragmentShader = 'uniform vec3 uHaze; uniform float uHazeNear, uHazeFar, uHazeMax; varying float vHazeD;\n'
      + sh.fragmentShader.replace('#include <tonemapping_fragment>',
        'gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, smoothstep(uHazeNear, uHazeFar, vHazeD) * uHazeMax);\n  #include <tonemapping_fragment>');
  };
  mat.customProgramCacheKey = () => 'exteriorHaze';
  return mat;
}

/**
 * The night over the bay: a dome lit from under by the city, a slow bank of cloud, and stars. Added
 * to `group`; everything it allocates goes through `own`. Shared by the code-built venue and the
 * venue model (clubShapeModel.mjs), which leaves the sky to the booth.
 */
export function addExteriorSky(THREE, group, { rnd, LOW, own, uTime }) {
  const T = { uTime };
  {
    const g = own(new THREE.SphereGeometry(2600, 40, 20));
    const m = own(new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color(0.0035, 0.0045, 0.0075) },
        uMid: { value: new THREE.Color(0.012, 0.011, 0.014) },
        uGlow: { value: new THREE.Color(0.075, 0.048, 0.028) },
        uTime: T.uTime,
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uZenith, uMid, uGlow; uniform float uTime; varying vec3 vDir;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
        void main(){
          float h = vDir.y;
          vec3 c = mix(uMid, uZenith, smoothstep(0.0, 0.6, h));
          // the city's light in the air: low, warmest over the city (+z), a little all round
          float toward = 0.45 + 0.55 * max(vDir.z, 0.0);
          c += uGlow * exp(-max(h, 0.0) * 9.0) * toward;
          // a slow bank of cloud, lit from under by the city
          vec2 q = vDir.xz / max(h + 0.12, 0.05) * 1.3 + vec2(uTime * 0.004, 0.0);
          float cl = smoothstep(0.52, 0.85, fbm(q)) * smoothstep(0.02, 0.18, h) * (1.0 - smoothstep(0.35, 0.7, h));
          c += uGlow * 0.55 * cl * toward;
          if (h < 0.0) c = uMid * 0.6;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    const dome = new THREE.Mesh(g, m);
    dome.name = 'exteriorSky'; dome.renderOrder = -200; dome.frustumCulled = false;
    group.add(dome);

    const NS = LOW ? 260 : 520;
    const sp = new Float32Array(NS * 3), sc = new Float32Array(NS * 3);
    for (let i = 0; i < NS; i++) {
      const y = 0.22 + 0.78 * Math.pow(rnd(), 0.6), ph = rnd() * Math.PI * 2, r = Math.sqrt(1 - y * y);
      sp[i * 3] = Math.cos(ph) * r * 2500; sp[i * 3 + 1] = y * 2500; sp[i * 3 + 2] = Math.sin(ph) * r * 2500;
      const b = 0.18 + 0.5 * Math.pow(rnd(), 2.5);
      sc[i * 3] = b; sc[i * 3 + 1] = b * 0.95; sc[i * 3 + 2] = b * 0.9;
    }
    const sg = own(new THREE.BufferGeometry());
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const stars = new THREE.Points(sg, own(new THREE.PointsMaterial({ size: 1.3, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false })));
    stars.name = 'exteriorStars'; stars.renderOrder = -199; stars.frustumCulled = false;
    group.add(stars);
  }
}

/**
 * The stage's LED wall: the club's name and the logo's two triangles, as on the hall's own screen,
 * over a dark teal field lit warm at its heart. Paints a 512 × 228 canvas and returns it (null in).
 */
export function paintClubScreen(c) {
  if (!c) return null;
  const g = c.getContext('2d'), CW = c.width, CH = c.height;
  const grad = g.createRadialGradient(CW / 2, CH * 0.55, 10, CW / 2, CH * 0.55, CW * 0.6);
  grad.addColorStop(0, 'rgb(120,92,70)'); grad.addColorStop(0.5, 'rgb(22,60,68)'); grad.addColorStop(1, 'rgb(6,24,30)');
  g.fillStyle = grad; g.fillRect(0, 0, CW, CH);
  g.fillStyle = 'rgb(52,214,197)';
  g.beginPath(); g.moveTo(CW / 2 - 34, 84); g.lineTo(CW / 2 - 4, 66); g.lineTo(CW / 2 - 4, 102); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(CW / 2 + 34, 84); g.lineTo(CW / 2 + 4, 66); g.lineTo(CW / 2 + 4, 102); g.closePath(); g.fill();
  g.fillStyle = 'rgb(255,240,220)';
  g.font = '700 46px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('CLUB SHAPE', CW / 2, 150);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let x = 0; x < CW; x += 6) g.fillRect(x, 0, 1, CH);
  for (let y = 0; y < CH; y += 6) g.fillRect(0, y, CW, 1);
  return c;
}

/**
 * @param {object} o
 * @param {typeof import('three')} o.THREE
 * @param {number} [o.seed]
 * @param {'low'|'high'} [o.quality]
 * @param {boolean} [o.reducedMotion]
 * @returns {{ group: import('three').Group, update: (dt: number, t: number, camera: import('three').Camera) => boolean, dispose: () => void, stats: object }}
 */
export function createExterior({ THREE, seed = 23, quality = 'high', reducedMotion = false } = {}) {
  const LOW = quality === 'low';
  const rnd = mulberry32(seed);
  const disposables = [];
  const own = (x) => { disposables.push(x); return x; };
  const group = new THREE.Group();
  group.name = 'clubExterior';
  group.visible = false;
  let RM = !!reducedMotion;
  const hdr = (r, g, b, k) => new THREE.Color(r, g, b).multiplyScalar(k);
  const stats = { triangles: 0, palms: 0, lamps: 0, towers: 0 };
  const HZ = {
    uHaze: { value: new THREE.Color(0.035, 0.025, 0.019) },
    uHazeNear: { value: 450 }, uHazeFar: { value: 1900 }, uHazeMax: { value: 0.45 },
  };
  const T = { uTime: { value: 0 } };

  function mesh(geo, mat, name, order = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.name = name; m.renderOrder = order; m.matrixAutoUpdate = false; m.updateMatrix();
    group.add(m);
    const idx = geo.index ? geo.index.count : geo.attributes.position.count;
    stats.triangles += Math.floor(idx / 3);
    return m;
  }
  function geoFrom(pos, col, idx, uv = null) {
    const g = own(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
  function tex(canvas, { repeat = false, srgb = true } = {}) {
    if (!canvas) return null;
    const t = own(new THREE.CanvasTexture(canvas));
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = LOW ? 2 : 8;
    if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
    t.needsUpdate = true;
    return t;
  }
  const basic = (o) => own(addHaze(new THREE.MeshBasicMaterial({ fog: false, ...o }), HZ));

  // ── 1. sky ────────────────────────────────────────────────────────────────────────────────
  addExteriorSky(THREE, group, { rnd, LOW, own, uTime: T.uTime });

  // ── 2. the shell: a ribbed scoop over the stage, its face to the bowl ─────────────────────────
  const NT = LOW ? 90 : 180, NS = LOW ? 20 : 40;
  const roofNormal = (t, s) => {
    t = clamp(t, 0.004, 0.996); s = clamp(s, 0, 0.998);
    const e = 1e-3, p = roofPoint(t, s), a = roofPoint(t + e, s), b = roofPoint(t, s + e);
    const u = [a[0] - p[0], a[1] - p[1], a[2] - p[2]], v = [b[0] - p[0], b[1] - p[1], b[2] - p[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    return n[1] < 0 ? [-n[0], -n[1], -n[2]] : n;
  };
  {
    const pos = [], top = [], under = [], idx = [];
    for (let i = 0; i <= NT; i++) {
      const t = i / NT, mid = Math.sin(Math.PI * t);
      for (let j = 0; j <= NS; j++) {
        const s = j / NS, p = roofPoint(t, s);
        pos.push(p[0], p[1], p[2]);
        // the face the bowl sees: dark bronze, warm where the stage throws its light up out of the
        // mouth, teal under the ribbon along the back edge
        const lipK = Math.pow(Math.max(0, 1 - s / 0.3), 2) * mid, backK = Math.pow(Math.max(0, (s - 0.8) / 0.2), 2);
        const seam = j % 2 ? 1 : 2.2;
        top.push((0.008 + 0.09 * lipK) * seam + 0.004 * backK, (0.007 + 0.05 * lipK) * seam + 0.026 * backK, (0.007 + 0.025 * lipK) * seam + 0.032 * backK);
        // the ceiling over the stage: lit by it, warm over it, cooler toward the mouth
        const g = Math.exp(-Math.pow((s - 0.25) / 0.2, 2)) * Math.pow(mid, 1.5);
        under.push(0.02 + 0.3 * g, 0.017 + 0.2 * g, 0.015 + 0.13 * g);
      }
    }
    // counter-clockwise seen from above, so the front face is the top
    for (let i = 0; i < NT; i++) for (let j = 0; j < NS; j++) {
      const a = i * (NS + 1) + j, b = a + NS + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    mesh(geoFrom(pos, top, idx), basic({ vertexColors: true, side: THREE.FrontSide }), 'exteriorRoof');
    mesh(geoFrom(pos, under, idx), basic({ vertexColors: true, side: THREE.BackSide }), 'exteriorRoofUnderside');
  }
  // The ribs: fins from the mouth up to the back edge, amber against the panels, as in the picture.
  {
    const pos = [], col = [], idx = [];
    const NRIB = LOW ? 56 : 110, NSR = LOW ? 14 : 24, H = 0.5, W = 0.16;
    for (let r = 0; r < NRIB; r++) {
      const t = (r + 0.5) / NRIB, base = pos.length / 3;
      for (let j = 0; j <= NSR; j++) {
        const s = lerp(0.01, 0.99, j / NSR), p = roofPoint(t, s), n = roofNormal(t, s), q = roofPoint(t + 0.002, s);
        const l = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) || 1;
        const dir = [(q[0] - p[0]) / l * W, (q[1] - p[1]) / l * W, (q[2] - p[2]) / l * W];
        const lipK = Math.pow(Math.max(0, 1 - s / 0.45), 2), backK = Math.pow(Math.max(0, (s - 0.8) / 0.2), 2);
        const side = clamp((0.72 - t) / 0.4, 0.12, 1);   // ribbed on +x, smooth dark on −x, as in the picture
        const c = [(0.05 + 0.2 * lipK) * side + 0.008 * backK, (0.031 + 0.11 * lipK) * side + 0.045 * backK, (0.018 + 0.045 * lipK) * side + 0.05 * backK];
        for (const [sx, h] of [[-1, 0], [-1, H], [1, H], [1, 0]]) {
          pos.push(p[0] + dir[0] * sx + n[0] * h, p[1] + dir[1] * sx + n[1] * h, p[2] + dir[2] * sx + n[2] * h);
          const k = h ? 1 : 0.6;
          col.push(c[0] * k, c[1] * k, c[2] * k);
        }
      }
      for (let j = 0; j < NSR; j++) {
        const a = base + j * 4, b = a + 4;
        for (let f = 0; f < 3; f++) idx.push(a + f, b + f, a + f + 1, a + f + 1, b + f, b + f + 1);
      }
    }
    mesh(geoFrom(pos, col, idx), basic({ vertexColors: true, side: THREE.DoubleSide }), 'exteriorRoofRibs');
  }

  // The shell's back: a dark curtain from its back edge down to the rim wall, so seen from the
  // side or from behind it is closed.
  {
    const pos = [], col = [], idx = [], N = LOW ? 90 : 180;
    for (let i = 0; i <= N; i++) {
      const p = backPoint(i / N);
      pos.push(p[0], VENUE.RIM_H, p[2], p[0], p[1], p[2]);
      col.push(0.012, 0.011, 0.012, 0.02, 0.05, 0.06);
    }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    mesh(geoFrom(pos, col, idx), basic({ vertexColors: true, side: THREE.DoubleSide }), 'exteriorShellBack');
  }
  // The mouth's glow: a curtain of light hung just inside the mouth, from its arch down to the
  // floor, white-blue under the ceiling's lights and streaked by the beams; seen through the arch it
  // is the picture's bright opening under the dark shell.
  {
    const NU = LOW ? 40 : 80, pos = [], uv = [], idx = [];
    for (let i = 0; i <= NU; i++) {
      const u = i / NU, t = lerp(0.2, 0.74, u), top = roofPoint(t, 0.1);
      pos.push(top[0], VENUE.FLOOR_Y, top[2], top[0], top[1] - 0.6, top[2]);
      uv.push(u, 0, u, 1);
    }
    for (let i = 0; i < NU; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const mat = own(new THREE.ShaderMaterial({
      uniforms: { uTime: T.uTime },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){
          float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          float streak = 0.35 + 0.65 * pow(abs(sin(vUv.x * 62.0 + 0.4 * sin(uTime * 0.5 + vUv.x * 9.0))), 10.0);
          float fall = pow(vUv.y, 1.6);
          vec3 col = mix(vec3(0.55, 0.42, 0.3), vec3(0.75, 0.88, 1.0), vUv.y);
          gl_FragColor = vec4(col * (0.06 + 0.9 * fall * streak) * edge, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    }));
    const m = mesh(geoFrom(pos, null, idx, uv), mat, 'exteriorMouthGlow', 3);
    m.frustumCulled = false;
  }
  // The mouth's lights: rows of spots in the ceiling just inside the mouth, over the stage.
  {
    const ROWS = [0.07, 0.15, 0.24], PER = LOW ? 12 : 22, g = own(new THREE.OctahedronGeometry(0.32, 0));
    const im = new THREE.InstancedMesh(g, basic({ color: hdr(1.0, 0.94, 0.85, 2.6) }), ROWS.length * PER);
    const M = new THREE.Matrix4();
    let k = 0;
    for (const s of ROWS) for (let i = 0; i < PER; i++) {
      const p = roofPoint(lerp(0.3, 0.62, (i + 0.5 + (s > 0.1 && s < 0.2 ? 0.5 : 0)) / PER), s);
      M.makeTranslation(p[0], p[1] - 0.7, p[2]);
      im.setMatrixAt(k++, M);
    }
    im.name = 'exteriorMouthLights'; im.renderOrder = 3; im.frustumCulled = false;
    group.add(im);
    stats.triangles += 8 * ROWS.length * PER;
  }

  // ── 3. the bowl: the crowd floor, the terraces round it, the outer wall ───────────────────────
  // One texture painted over the whole bowl in plan: the crowd (heads, a few phones), lit warm where
  // the stage throws its light.
  const BX0 = VENUE.x - 70, BX1 = VENUE.x + 70, BZ0 = VENUE.z - 58, BZ1 = VENUE.z + 58;
  const BPX = LOW ? 3 : 6;               // canvas pixels per metre
  const bowlUV = (x, z) => [(x - BX0) / (BX1 - BX0), 1 - (z - BZ0) / (BZ1 - BZ0)];
  const S = VENUE.STAGE, WL = VENUE.WALL, TR = VENUE.TRUSS;
  let crowdMap = null;
  {
    const W = Math.round((BX1 - BX0) * BPX), H = Math.round((BZ1 - BZ0) * BPX), c = makeCanvas(W, H);
    if (c) {
      const g = c.getContext('2d'), toB = (x, z) => [(x - BX0) * BPX, (z - BZ0) * BPX];
      g.fillStyle = 'rgb(26,20,17)'; g.fillRect(0, 0, W, H);
      const [px, py] = toB(S.x, S.z - S.d / 2);
      const pool = g.createRadialGradient(px, py, 0, px, py, 70 * BPX);
      pool.addColorStop(0, 'rgba(170,132,100,0.95)'); pool.addColorStop(0.4, 'rgba(90,70,58,0.75)'); pool.addColorStop(1, 'rgba(24,20,18,0)');
      g.fillStyle = pool; g.fillRect(0, 0, W, H);
      const N = LOW ? 12000 : 34000;
      for (let i = 0; i < N; i++) {
        const x = lerp(BX0, BX1, rnd()), z = lerp(BZ0, BZ1, rnd()), k = footprintK(x, z);
        if (k > 0.985) continue;
        if (Math.abs(x - S.x) < S.w / 2 + 1 && z > S.z - S.d / 2 - 1) continue;   // not on or behind the stage
        const [cx, cy] = toB(x, z);
        if (rnd() < 0.05) {   // a phone
          g.fillStyle = rnd() < 0.5 ? 'rgba(235,240,255,0.95)' : 'rgba(150,230,240,0.9)';
          g.fillRect(cx, cy, 1, 1);
          continue;
        }
        const lit = Math.exp(-Math.hypot(x - S.x, z - (S.z - S.d / 2)) / 38);
        const v = 0.18 + 0.82 * lit * (0.6 + 0.4 * rnd());
        g.fillStyle = `rgba(${Math.round(30 + 190 * v)},${Math.round(24 + 140 * v)},${Math.round(22 + 105 * v)},0.9)`;
        g.fillRect(cx - 0.6, cy - 0.6, 1.5, 1.5);
      }
      crowdMap = tex(c);
    }
  }
  const matCrowd = basic({ map: crowdMap, color: crowdMap ? 0xffffff : 0x141110, side: THREE.DoubleSide });
  {
    const NA = LOW ? 96 : 192;
    const pos = [VENUE.x, VENUE.FLOOR_Y, VENUE.z], uv = [...bowlUV(VENUE.x, VENUE.z)], idx = [];
    for (let i = 0; i <= NA; i++) {
      const [x, z] = outlinePt((i / NA) * Math.PI * 2, VENUE.CROWD_K);
      pos.push(x, VENUE.FLOOR_Y, z); uv.push(...bowlUV(x, z));
    }
    for (let i = 1; i <= NA; i++) idx.push(0, i + 1, i);   // facing up
    mesh(geoFrom(pos, null, idx, uv), matCrowd, 'exteriorBowlFloor');
  }
  {
    const NA = LOW ? 128 : 256, TI = VENUE.TIERS, dk = (1 - VENUE.CROWD_K) / TI, rise = (VENUE.RIM_H - VENUE.FLOOR_Y) / TI;
    const tr = { pos: [], uv: [], idx: [] }, ri = { pos: [], col: [], idx: [] }, ed = { pos: [], idx: [] };
    for (let tier = 0; tier < TI; tier++) {
      const k0 = VENUE.CROWD_K + tier * dk, k1 = k0 + dk, h0 = VENUE.FLOOR_Y + tier * rise, h1 = h0 + rise;
      const bt = tr.pos.length / 3, br = ri.pos.length / 3, be = ed.pos.length / 3;
      for (let i = 0; i <= NA; i++) {
        const th = (i / NA) * Math.PI * 2;
        const [ax, az] = outlinePt(th, k0), [bx, bz] = outlinePt(th, k1);
        tr.pos.push(ax, h1, az, bx, h1, bz); tr.uv.push(...bowlUV(ax, az), ...bowlUV(bx, bz));
        ri.pos.push(ax, h0, az, ax, h1, az); ri.col.push(0.012, 0.011, 0.011, 0.03, 0.024, 0.02);
        const [fx, fz] = outlinePt(th, k0, 0.12);
        ed.pos.push(ax, h1 + 0.03, az, fx, h1 + 0.03, fz);
      }
      for (let i = 0; i < NA; i++) {
        const a = bt + i * 2, b = br + i * 2, e = be + i * 2;
        tr.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        ri.idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
        ed.idx.push(e, e + 2, e + 1, e + 1, e + 2, e + 3);
      }
    }
    mesh(geoFrom(tr.pos, null, tr.idx, tr.uv), matCrowd, 'exteriorTerraces');
    mesh(geoFrom(ri.pos, ri.col, ri.idx), basic({ vertexColors: true, side: THREE.DoubleSide }), 'exteriorRisers');
    // each tier's edge: a thin, faint warm line, the rings round the bowl in the picture
    mesh(geoFrom(ed.pos, null, ed.idx), basic({ color: hdr(1.0, 0.6, 0.28, 0.55), side: THREE.DoubleSide }), 'exteriorStepLights', 1);
    // the outer wall: dark, warm at its foot where the promenade's lamps reach it
    const wp = [], wc = [], wi = [];
    for (let i = 0; i <= NA; i++) {
      const [x, z] = outlinePt((i / NA) * Math.PI * 2);
      wp.push(x, 0, z, x, VENUE.RIM_H, z); wc.push(0.1, 0.06, 0.03, 0.016, 0.016, 0.02);
    }
    for (let i = 0; i < NA; i++) { const a = i * 2; wi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    mesh(geoFrom(wp, wc, wi), basic({ vertexColors: true, side: THREE.DoubleSide }), 'exteriorOuterWall');
  }

  // ── 4. the stage under the roof: its LED wall, the truss, the beams; and the ribbon ──────────────
  {
    const pos = [], col = [], idx = [];
    const box = (x0, x1, y0, y1, z0, z1, c, cTop = c) => {
      const faces = [
        [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], cTop],
        [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], c],
        [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], c],
        [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], c],
        [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], c],
      ];
      for (const [a, b, cc, d, k] of faces) {
        const base = pos.length / 3;
        for (const v of [a, b, cc, d]) { pos.push(v[0], v[1], v[2]); col.push(k[0], k[1], k[2]); }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    };
    const fy = VENUE.FLOOR_Y;
    box(S.x - S.w / 2, S.x + S.w / 2, fy, fy + S.h, S.z - S.d / 2, S.z + S.d / 2, [0.03, 0.025, 0.024], [0.07, 0.055, 0.05]);
    box(-TR.w / 2, TR.w / 2, TR.y - 0.5, TR.y + 0.5, TR.z - 0.5, TR.z + 0.5, [0.03, 0.03, 0.035]);
    for (const sx of [-1, 1]) box(sx * TR.w / 2 - 0.5, sx * TR.w / 2 + 0.5, fy, TR.y, TR.z - 0.5, TR.z + 0.5, [0.03, 0.03, 0.035]);
    box(-WL.w / 2 - 1, WL.w / 2 + 1, fy, WL.y1 + 1, WL.z + 0.1, WL.z + 1.2, [0.02, 0.02, 0.024]);   // the wall's frame
    mesh(geoFrom(pos, col, idx), basic({ vertexColors: true, side: THREE.DoubleSide }), 'exteriorStage');
    // the LED wall: the club's name and the logo's two triangles, as on the hall's own screen
    const c = paintClubScreen(makeCanvas(512, 228));
    const wg = own(new THREE.PlaneGeometry(WL.w, WL.y1 - WL.y0));
    wg.rotateY(Math.PI);                                    // facing the crowd (−z)
    wg.translate(S.x, (WL.y0 + WL.y1) / 2, WL.z);
    mesh(wg, basic({ map: tex(c), color: c ? hdr(1, 1, 1, 1.25) : hdr(0.4, 0.5, 0.5, 1) }), 'exteriorLedWall', 1);
  }
  // The beams: a curtain of soft cones from the truss down over the stage and the front of the
  // crowd, swaying slowly, as the picture's light falls in the shell's mouth.
  const BEAMS = [];
  {
    const NBM = LOW ? 8 : 14, L = 24;
    const geo = own(new THREE.ConeGeometry(1.1, L, LOW ? 10 : 16, 1, true));
    geo.translate(0, -L / 2, 0);                           // apex at the origin, opening down −y
    const mat = own(new THREE.ShaderMaterial({
      uniforms: { uCol: { value: hdr(0.62, 0.92, 1.0, 0.38) }, uL: { value: L } },
      vertexShader: `uniform float uL; varying float vAlong; varying vec3 vN; varying vec3 vV;
        void main(){ vAlong = -position.y / uL; vec4 w = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uCol; varying float vAlong; varying vec3 vN; varying vec3 vV;
        void main(){ float core = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
          float k = core * pow(1.0 - clamp(vAlong, 0.0, 1.0), 1.4) * smoothstep(0.0, 0.04, vAlong);
          gl_FragColor = vec4(uCol * k, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    }));
    for (let i = 0; i < NBM; i++) {
      const u = NBM === 1 ? 0.5 : i / (NBM - 1), x = lerp(-TR.w / 2 + 3, TR.w / 2 - 3, u);
      const m = new THREE.Mesh(geo, mat);
      m.name = 'exteriorBeam'; m.renderOrder = 4; m.frustumCulled = false;
      m.position.set(x, TR.y - 0.6, TR.z - 0.6);
      group.add(m);
      BEAMS.push({ m, x, phase: rnd() * Math.PI * 2, aim: [x * 1.1, VENUE.FLOOR_Y, TR.z - 4 - 8 * rnd()] });
      stats.triangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    }
  }
  const DOWN = new THREE.Vector3(0, -1, 0), _dir = new THREE.Vector3();
  const aimBeams = (t) => {
    for (const b of BEAMS) {
      const sw = RM ? 0 : Math.sin(t * 0.55 + b.phase);
      const tx = b.aim[0] + 3 * sw, tz = b.aim[2] + 2 * Math.cos(t * 0.4 + b.phase);
      _dir.set(tx - b.m.position.x, b.aim[1] - b.m.position.y, tz - b.m.position.z).normalize();
      b.m.quaternion.setFromUnitVectors(DOWN, _dir);
    }
  };
  // The mouth's edge: a thin warm line where the shell's face turns under into its ceiling, so the
  // arch over the stage reads against the dark, as in the picture.
  {
    const pts = [];
    for (let i = 0; i <= 80; i++) { const p = lipPoint(lerp(0.04, 0.96, i / 80)); pts.push(new THREE.Vector3(p[0], p[1] - 0.15, p[2])); }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    mesh(own(new THREE.TubeGeometry(curve, LOW ? 120 : 240, 0.16, 5, false)), basic({ color: hdr(1.0, 0.6, 0.3, 1.1) }), 'exteriorMouthEdge', 2);
  }
  // The ribbon: one teal line along the shell's back edge and on round the front of the rim.
  {
    const pts = ribbonPath(LOW ? 120 : 220, LOW ? 110 : 200).map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    // thicker on low quality, where there is no bloom to widen it
    mesh(own(new THREE.TubeGeometry(curve, LOW ? 500 : 1000, LOW ? 0.55 : 0.34, 6, true)), basic({ color: hdr(0.36, 0.86, 0.95, 2.0) }), 'exteriorRibbon', 2);
  }

  // ── 5. the peninsula: paths, lamps, gardens (one painted ground) and its sea wall ────────────────
  // The ground region the canvas covers (metres): the whole peninsula and the plaza round the shell.
  const GX0 = -300, GX1 = 140, GZ0 = -190, GZ1 = 120;
  const PX = LOW ? 2.4 : 4.8;           // canvas pixels per metre (0.21 m a pixel on high)
  const CW = Math.round((GX1 - GX0) * PX), CH = Math.round((GZ1 - GZ0) * PX);
  const toC = (x, z) => [(x - GX0) * PX, (z - GZ0) * PX];
  const coastPt = (th, d) => { const r = coastRadius(th) - d; return [LAND_C[0] + Math.cos(th) * r, LAND_C[1] + Math.sin(th) * r]; };
  const shellOut = (th, d) => outlinePt(th, 1, d);     // d metres out from the bowl's outer wall
  // Paths, each a polyline [x, z][] with a width; lamps stand along their edges.
  const PATHS = [];
  const polyline = (f, a0, a1, n) => { const out = []; for (let i = 0; i <= n; i++) out.push(f(lerp(a0, a1, i / n))); return out; };
  // As in the picture: a waterfront promenade, and walks that flow round the venue in bands,
  // close to it and then further out, swelling and narrowing as they go.
  PATHS.push({ pts: polyline((th) => coastPt(th, 7), -2.55, 2.55, 260), w: 9, lampEvery: 9, both: true, coast: true });
  PATHS.push({ pts: polyline((th) => coastPt(th, 17 + 3 * Math.sin(th * 5)), -2.5, 2.5, 240), w: 5, lampEvery: 11, both: false, coast: true });
  PATHS.push({ pts: polyline((th) => shellOut(th, 6), 0, Math.PI * 2, 220), w: 7, lampEvery: 9, both: true, plaza: true });
  PATHS.push({ pts: polyline((th) => shellOut(th + 0.06 * Math.sin(th * 2), 19 + 5 * Math.sin(th * 3 + 0.6)), 0, Math.PI * 2, 220), w: 6, lampEvery: 11, both: false });
  PATHS.push({ pts: polyline((th) => shellOut(th, 32 + 6 * Math.sin(th * 4 + 1.4)), -2.9, -0.2, 120), w: 5, lampEvery: 12, both: false });
  // a few walks down from the bands to the water
  for (const th0 of [-2.35, -1.55, -0.75, 0.6]) {
    const a = shellOut(th0, 19 + 5 * Math.sin(th0 * 3 + 0.6));
    const b = coastPt(Math.atan2(a[1] - LAND_C[1], a[0] - LAND_C[0]), 7);
    const bend = (rnd() - 0.5) * 18;
    PATHS.push({ pts: polyline((u) => { const nx = -(b[1] - a[1]), nz = b[0] - a[0], l = Math.hypot(nx, nz) || 1; const k2 = Math.sin(u * Math.PI) * bend; return [lerp(a[0], b[0], u) + nx / l * k2, lerp(a[1], b[1], u) + nz / l * k2]; }, 0, 1, 30), w: 4, lampEvery: 12, both: false });
  }
  // keep only the points on land
  for (const P of PATHS) P.pts = P.pts.filter(([x, z]) => landDepth(x, z) > 2 && footprintK(x, z) > 1.04);

  // Lamps along the paths (on both edges of the waterfront and the plaza ring).
  const LAMPS = [];       // [x, z, warm 0..1]
  for (const P of PATHS) {
    let acc = P.lampEvery * rnd();
    for (let i = 1; i < P.pts.length; i++) {
      const [x0, z0] = P.pts[i - 1], [x1, z1] = P.pts[i];
      const L = Math.hypot(x1 - x0, z1 - z0);
      if (L > 30) continue;   // a gap where the filter cut the line
      const nx = -(z1 - z0) / (L || 1), nz = (x1 - x0) / (L || 1);
      acc += L;
      while (acc >= P.lampEvery) {
        acc -= P.lampEvery;
        const u = 1 - acc / (L || 1), x = lerp(x0, x1, u), z = lerp(z0, z1, u);
        const off = P.w / 2 + 0.6;
        LAMPS.push([x + nx * off, z + nz * off, P.coast ? 1 : 0.85]);
        if (P.both) LAMPS.push([x - nx * off, z - nz * off, P.coast ? 1 : 0.85]);
      }
    }
  }
  // Palms: groves in the gardens and a row along the waterfront.
  const PALMS = [];       // [x, z, scale]
  {
    // a coarse grid of path points, so the gardens keep clear of the walks
    const CELL = 10, grid = new Map();
    const key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    for (const P of PATHS) for (const [x, z] of P.pts) { const k = key(x, z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([x, z, P.w]); }
    const clearOfPaths = (x, z, gap) => {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const list = grid.get(`${Math.floor(x / CELL) + dx},${Math.floor(z / CELL) + dz}`);
        if (list) for (const [px, pz, w] of list) if (Math.hypot(px - x, pz - z) < w / 2 + gap) return false;
      }
      return true;
    };
    const want = LOW ? 200 : 420;
    for (let tries = 0; tries < want * 30 && PALMS.length < want; tries++) {
      const x = lerp(GX0 + 40, GX1, rnd()), z = lerp(GZ0, GZ1, rnd());
      if (landDepth(x, z) < 5) continue;
      if (footprintK(x, z) < 1.3) continue;   // not in or by the building
      if (!clearOfPaths(x, z, 2.2)) continue;
      // clumps: a palm prefers company
      if (PALMS.length > 12 && rnd() < 0.88) {
        let near = false;
        for (let k = PALMS.length - 1; k >= 0; k--) if (Math.hypot(PALMS[k][0] - x, PALMS[k][1] - z) < 5.5) { near = true; break; }
        if (!near) continue;
      }
      PALMS.push([x, z, 0.85 + rnd() * 0.45]);
    }
    // the waterfront row, every 14 m on the land side of the promenade
    const W = PATHS[0];
    for (let i = 2; i < W.pts.length; i += LOW ? 8 : 4) {
      const [x0, z0] = W.pts[i - 1], [x1, z1] = W.pts[i];
      const L = Math.hypot(x1 - x0, z1 - z0) || 1;
      const nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
      const x = x1 + nx * -6.5, z = z1 + nz * -6.5;
      if (landDepth(x, z) > 3) PALMS.push([x, z, 0.95 + rnd() * 0.2]);
    }
  }
  stats.palms = PALMS.length; stats.lamps = LAMPS.length;

  // The painted ground.
  {
    const c = makeCanvas(CW, CH);
    let map = null;
    if (c) {
      const g = c.getContext('2d');
      g.fillStyle = 'rgb(5,8,5)'; g.fillRect(0, 0, CW, CH);
      // garden texture: dark canopy blotches
      for (let i = 0; i < (LOW ? 2500 : 6000); i++) {
        const x = rnd() * CW, y = rnd() * CH, r = (1.5 + rnd() * 4) * PX;
        g.fillStyle = rnd() < 0.5 ? 'rgba(10,16,9,0.7)' : 'rgba(3,5,3,0.7)';
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      // the paths: a dark edge, a lit stone walk
      g.lineCap = 'round'; g.lineJoin = 'round';
      const stroke = (pts, w, style) => {
        g.strokeStyle = style; g.lineWidth = w * PX;
        g.beginPath();
        let started = false, prev = null;
        for (const [x, z] of pts) {
          const [cx, cy] = toC(x, z);
          if (prev && Math.hypot(x - prev[0], z - prev[1]) > 30) started = false;
          if (started) g.lineTo(cx, cy); else { g.moveTo(cx, cy); started = true; }
          prev = [x, z];
        }
        g.stroke();
      };
      // dark bronze, as in the picture: the walks read by their lamps, not by glowing paving
      for (const P of PATHS) stroke(P.pts, P.w + 1.6, 'rgb(9,7,5)');
      for (const P of PATHS) stroke(P.pts, P.w, 'rgb(84,56,31)');
      for (const P of PATHS) stroke(P.pts, P.w * 0.5, 'rgba(126,84,46,0.5)');
      for (const P of PATHS) stroke(P.pts, 0.3, 'rgba(14,10,6,0.6)');   // the joint down the middle
      // the lamps' pools
      g.globalCompositeOperation = 'lighter';
      for (const [x, z, w] of LAMPS) {
        const [cx, cy] = toC(x, z), r = 5 * PX;
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, `rgba(${Math.round(120 * w)},${Math.round(78 * w)},${Math.round(34 * w)},0.75)`);
        gr.addColorStop(0.3, `rgba(${Math.round(55 * w)},${Math.round(34 * w)},${Math.round(14 * w)},0.45)`);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      // small lights in the gardens: path bollards, uplights and strings in the trees
      for (let i = 0; i < (LOW ? 1400 : 3200) && PALMS.length; i++) {
        const [px, pz] = PALMS[Math.floor(rnd() * PALMS.length)], a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 4;
        const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
        if (landDepth(x, z) < 4 || footprintK(x, z) < 1.02) continue;
        const [cx, cy] = toC(x, z), r = (0.35 + rnd() * 0.6) * PX, k = 0.6 + rnd() * 0.4;
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, `rgba(${Math.round(255 * k)},${Math.round(170 * k)},${Math.round(80 * k)},0.9)`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      // the palms' uplights on their canopies (the 3D crowns sit over these)
      for (const [x, z, s] of PALMS) {
        const [cx, cy] = toC(x, z), r = 3.2 * s * PX;
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, 'rgba(90,58,22,0.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      g.globalCompositeOperation = 'source-over';
      // people: dark specks on the walks, thickest by the building
      g.fillStyle = 'rgba(6,5,4,0.9)';
      for (const P of PATHS) {
        const n = Math.round(P.pts.length * (P.plaza ? 2.2 : 0.55));
        for (let k = 0; k < n; k++) {
          const [x, z] = P.pts[Math.floor(rnd() * P.pts.length)];
          const [cx, cy] = toC(x + (rnd() - 0.5) * P.w * 0.8, z + (rnd() - 0.5) * P.w * 0.8);
          g.fillRect(cx - 0.3 * PX, cy - 0.3 * PX, 0.6 * PX, 0.6 * PX);
        }
      }
      map = tex(c);
    }
    // the land: rings from the centre out to the coast, cut at the canvas's west edge
    const NA = LOW ? 160 : 320, NR = 14;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= NA; i++) {
      const th = (i / NA) * Math.PI * 2 - Math.PI;
      for (let j = 0; j <= NR; j++) {
        const r = coastRadius(th) * (j / NR);
        let x = LAND_C[0] + Math.cos(th) * r;
        const z = LAND_C[1] + Math.sin(th) * r;
        x = Math.max(x, GX0);
        pos.push(x, 0, z);
        uv.push((x - GX0) / (GX1 - GX0), 1 - (z - GZ0) / (GZ1 - GZ0));
      }
    }
    for (let i = 0; i < NA; i++) for (let j = 0; j < NR; j++) {
      const a = i * (NR + 1) + j, b = a + NR + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);   // wound to face up
    }
    mesh(geoFrom(pos, null, idx, uv), basic({ map, color: map ? 0xffffff : 0x0a0806 }), 'exteriorPeninsula');
    // the sea wall: dark stone, its top edge catching the promenade's lamps
    const sp = [], sc = [], si = [];
    for (let i = 0; i <= NA; i++) {
      const th = (i / NA) * Math.PI * 2 - Math.PI;
      const [x, z] = coastPt(th, 0);
      if (x < GX0) { sp.push(GX0, 0, z, GX0, WATER_Y, z); } else sp.push(x, 0.05, z, x, WATER_Y - 0.2, z);
      sc.push(0.16, 0.105, 0.055, 0.012, 0.01, 0.009);
    }
    for (let i = 0; i < NA; i++) { const a = i * 2; si.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    mesh(geoFrom(sp, sc, si), basic({ vertexColors: true, side: THREE.DoubleSide }), 'exteriorSeaWall');
  }

  // ── 6. lamps and palms (instanced) ──────────────────────────────────────────────────────────
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const CITY_LAMPS = [];
  for (let x = -1100; x <= 1100; x += 14) CITY_LAMPS.push([x, cityShoreZ(x) + 5]);
  {
    const g = own(new THREE.IcosahedronGeometry(0.22, 0));
    const N = LAMPS.length + CITY_LAMPS.length;
    const im = new THREE.InstancedMesh(g, basic({ color: hdr(1.0, 0.64, 0.3, 2.6) }), N);
    im.name = 'exteriorLamps';
    let i = 0;
    for (const [x, z] of LAMPS) { m4.makeTranslation(x, 4.2, z); im.setMatrixAt(i++, m4); }
    for (const [x, z] of CITY_LAMPS) { m4.compose(v3.set(x, 5, z), q.identity(), s3.set(2.2, 2.2, 2.2)); im.setMatrixAt(i++, m4); }
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
    group.add(im);
    stats.triangles += 20 * N;
  }
  {
    // a palm small enough to plant four hundred of: a curved five-sided trunk and eight drooping
    // V-section fronds, uplit (warm at the crown, dark green at the tips)
    const pos = [], col = [], idx = [];
    const v = (p, c) => { pos.push(p[0], p[1], p[2]); col.push(c[0], c[1], c[2]); return pos.length / 3 - 1; };
    const HT = 7.5, TS = 3, SIDES = 5;
    const trunkAt = (u) => [0.5 * u * u, HT * u, 0];
    for (let k = 0; k <= TS; k++) {
      const u = k / TS, c = trunkAt(u), r = lerp(0.28, 0.16, u);
      const warm = Math.pow(1 - u, 1.5);
      for (let sd = 0; sd < SIDES; sd++) {
        const a = (sd / SIDES) * Math.PI * 2;
        v([c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r], [0.03 + 0.42 * warm, 0.022 + 0.26 * warm, 0.014 + 0.1 * warm]);
      }
    }
    for (let k = 0; k < TS; k++) for (let sd = 0; sd < SIDES; sd++) {
      const a = k * SIDES + sd, b = k * SIDES + ((sd + 1) % SIDES);
      idx.push(a, b, a + SIDES, b, b + SIDES, a + SIDES);
    }
    const crown = trunkAt(1);
    const NF = LOW ? 6 : 8, FS = LOW ? 3 : 4;
    for (let f = 0; f < NF; f++) {
      const a = (f / NF) * Math.PI * 2 + 0.3;
      const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
      const len = 3.4, base = pos.length / 3;
      for (let k = 0; k <= FS; k++) {
        const u = k / FS;
        const along = len * u, droop = 1.2 * u * u - 0.55 * u;
        const c = [crown[0] + dx * along, crown[1] - droop, crown[2] + dz * along];
        const w = 0.55 * Math.sin(Math.PI * clamp(u * 0.9 + 0.1, 0, 1));
        const warm = Math.pow(1 - u, 2);
        const cc = [0.01 + 0.15 * warm, 0.018 + 0.08 * warm, 0.008 + 0.025 * warm];
        const cs = [cc[0] * 0.6, cc[1] * 0.7, cc[2] * 0.6];
        v([c[0] + px * w, c[1] - 0.12 * w, c[2] + pz * w], cs);
        v(c, cc);
        v([c[0] - px * w, c[1] - 0.12 * w, c[2] - pz * w], cs);
      }
      for (let k = 0; k < FS; k++) {
        const a0 = base + k * 3, b0 = a0 + 3;
        idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1, a0 + 1, b0 + 1, a0 + 2, a0 + 2, b0 + 1, b0 + 2);
      }
    }
    const g = geoFrom(pos, col, idx);
    const im = new THREE.InstancedMesh(g, basic({ vertexColors: true, side: THREE.DoubleSide }), PALMS.length);
    im.name = 'exteriorPalms';
    PALMS.forEach(([x, z, s], i) => {
      e.set((rnd() - 0.5) * 0.1, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.1);
      q.setFromEuler(e);
      m4.compose(v3.set(x, 0, z), q, s3.set(s, s, s));
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
    group.add(im);
    stats.triangles += (idx.length / 3) * PALMS.length;
  }

  // ── 7. the shores across the water: the west shore and the city ─────────────────────────────────
  {
    const c = makeCanvas(LOW ? 512 : 1024, LOW ? 512 : 1024);
    let map = null;
    if (c) {
      const W = c.width, g = c.getContext('2d');
      g.fillStyle = 'rgb(4,4,5)'; g.fillRect(0, 0, W, W);
      const B = W / 16;
      // streets: a sodium grid with its lights
      for (let k = 0; k < 16; k++) {
        const o = k * B + (rnd() - 0.5) * B * 0.4;
        for (let y = 0; y < W; y += W / 160) {
          if (rnd() < 0.35) continue;   // broken: blocks, trees and bends hide stretches of street
          const a = 0.25 + rnd() * 0.5;
          g.fillStyle = `rgba(255,${165 + Math.floor(rnd() * 45)},90,${a})`;
          if (k % 2 === 0 || rnd() < 0.5) g.fillRect(o - 0.8, y, 1.6, 1.6);
          if (k % 2 === 1 || rnd() < 0.5) g.fillRect(y, o - 0.8, 1.6, 1.6);
        }
      }
      // buildings' lights
      for (let i = 0; i < W * 9; i++) {
        const x = rnd() * W, y = rnd() * W, cool = rnd() < 0.2, k = 0.4 + rnd() * 0.6;
        g.fillStyle = cool ? `rgba(${Math.round(170 * k)},${Math.round(200 * k)},${Math.round(255 * k)},0.9)` : `rgba(${Math.round(255 * k)},${Math.round(180 * k)},${Math.round(95 * k)},0.9)`;
        g.fillRect(x, y, 1.2, 1.2);
      }
      map = tex(c, { repeat: true });
    }
    const TILE = 420;
    const quadXZ = (x0, x1, zf0, zf1, n, name, dim) => {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const x = lerp(x0, x1, i / n), za = zf0(x), zb = zf1(x);
        pos.push(x, -0.05, za, x, -0.05, zb);
        uv.push(x / TILE, za / TILE, x / TILE, zb / TILE);
      }
      for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      return mesh(geoFrom(pos, null, idx, uv), basic({ map, color: new THREE.Color(dim, dim, dim), side: THREE.DoubleSide }), name);
    };
    quadXZ(-2400, 2400, (x) => cityShoreZ(x), () => 2400, LOW ? 120 : 240, 'exteriorCity', 1.0);
    // the west shore runs from far out in the bay up to the city
    const pos = [], uv = [], idx = [];
    const NZ = LOW ? 80 : 160;
    for (let i = 0; i <= NZ; i++) {
      const z = lerp(-2400, CITY_Z + 30, i / NZ), x = westShoreX(z);
      pos.push(-2400, -0.05, z, x, -0.05, z);
      uv.push(-2400 / TILE, z / TILE, x / TILE, z / TILE);
    }
    for (let i = 0; i < NZ; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    mesh(geoFrom(pos, null, idx, uv), basic({ map, color: new THREE.Color(0.55, 0.55, 0.55), side: THREE.DoubleSide }), 'exteriorWestShore');
    // the city's waterfront wall, lit along its top
    const wp = [], wc = [], wi = [];
    for (let i = 0; i <= 240; i++) {
      const x = lerp(-2400, 2400, i / 240), z = cityShoreZ(x);
      wp.push(x, 0, z, x, WATER_Y - 0.2, z);
      wc.push(0.2, 0.13, 0.065, 0.01, 0.009, 0.008);
    }
    for (let i = 0; i < 240; i++) { const a = i * 2; wi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    mesh(geoFrom(wp, wc, wi), basic({ vertexColors: true, side: THREE.DoubleSide }), 'exteriorCityWall');
  }

  // ── 8. the skyline across the bay ─────────────────────────────────────────────────────────────
  const REDS = [];
  let skylineGeo = null, matTowers = null;
  {
    const c = makeCanvas(LOW ? 256 : 512, LOW ? 512 : 1024);
    let map = null;
    if (c) {
      const g = c.getContext('2d'), CW2 = c.width, CS = CW2 / 64;   // 64 bays × 128 floors a tile
      g.fillStyle = 'rgb(4,5,8)'; g.fillRect(0, 0, CW2, c.height);
      for (let row = 0; row < 128; row++) {
        const occ = 0.06 + 0.32 * Math.pow(rnd(), 1.5), cool = rnd() < 0.15;
        for (let col = 0; col < 64; col++) {
          if (rnd() >= occ) continue;
          const k = 0.45 + rnd() * 0.5;
          g.fillStyle = cool ? `rgb(${Math.round(185 * k)},${Math.round(208 * k)},${Math.round(255 * k)})`
            : `rgb(${Math.round(255 * k)},${Math.round((170 + rnd() * 50) * k)},${Math.round((85 + rnd() * 60) * k)})`;
          g.fillRect(col * CS + CS * 0.2, row * CS + CS * 0.2, CS * 0.6, CS * 0.62);
        }
      }
      map = tex(c, { repeat: true });
    }
    const towers = [];
    const ok = (x, z, w, gap = 16) => !towers.some((t) => Math.abs(t.x - x) < (t.w + w) / 2 + gap && Math.abs(t.z - z) < (t.w + w) / 2 + gap);
    // Slender and spaced, as in the picture: tall towers rising over the venue from across the bay,
    // with sky above the tallest.
    const NT = LOW ? 50 : 100;
    for (let tries = 0; tries < 8000 && towers.length < NT; tries++) {
      // downtown, behind the venue across the bay, and thinning out east and west
      const x = (rnd() - 0.5) * 2200 * (rnd() < 0.65 ? 0.5 : 1), z = cityShoreZ(x) + 80 + Math.pow(rnd(), 1.3) * 820;
      const w = 12 + rnd() * 13;
      if (!ok(x, z, w)) continue;
      const core = Math.exp(-Math.pow((x - 60) / 380, 2)) * Math.exp(-Math.pow((z - 800) / 300, 2));
      const h = 40 + Math.pow(rnd(), 2) * 70 + core * (50 + rnd() * 140);   // slender: up to 12 times their width
      towers.push({ x, z, w, d: w * (0.8 + rnd() * 0.4), h });
    }
    // lower blocks along the waterfront and in front of the towers
    for (let i = 0; i < (LOW ? 45 : 90); i++) {
      const x = (rnd() - 0.5) * 2600, z = cityShoreZ(x) + 14 + rnd() * 120, w = 18 + rnd() * 22;
      if (!ok(x, z, w, 6)) continue;
      towers.push({ x, z, w, d: w, h: 12 + rnd() * 30, low: true });
    }
    stats.towers = towers.length;
    const pos = [], uvs = [], col = [], idx = [];
    const TW = 96, TH = 460;      // one texture tile: 64 window bays × 128 floors at 1.5 m × 3.6 m
    const box = (x, z, w, d, y0, y1, bright, tint, crownGlow) => {
      const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, off = rnd();
      const faces = [
        [[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]],
      ];
      for (const [[ax, az], [bx, bz]] of faces) {
        const base = pos.length / 3, L = Math.hypot(bx - ax, bz - az);
        const along0 = off * TW, along1 = along0 + L;
        pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
        uvs.push(along0 / TW, y0 / TH, along1 / TW, y0 / TH, along1 / TW, y1 / TH, along0 / TW, y1 / TH);
        for (let k = 0; k < 4; k++) col.push(bright * tint[0], bright * tint[1], bright * tint[2]);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      // the roof (dark, off the windows), or a lit crown band
      const base = pos.length / 3;
      pos.push(x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1);
      uvs.push(0.001, 0.999, 0.001, 0.999, 0.001, 0.999, 0.001, 0.999);
      for (let k = 0; k < 4; k++) col.push(0.02, 0.02, 0.025);
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      if (crownGlow) {
        const b2 = pos.length / 3, y2 = y1 - 3.5;
        for (const [[ax, az], [bx, bz]] of faces) {
          const b3 = pos.length / 3;
          pos.push(ax, y2, az, bx, y2, bz, bx, y1, bz, ax, y1, az);
          for (let k = 0; k < 4; k++) { uvs.push(0.001, 0.999); col.push(crownGlow[0], crownGlow[1], crownGlow[2]); }
          idx.push(b3, b3 + 1, b3 + 2, b3, b3 + 2, b3 + 3);
        }
        void b2;
      }
    };
    towers.sort((a, b) => b.h - a.h);
    towers.forEach((t, i) => {
      const bright = t.low ? 0.45 + rnd() * 0.3 : 0.5 + rnd() * 0.45;
      const tint = rnd() < 0.22 ? [0.8, 0.9, 1.08] : [1, 1, 1];
      const setback = !t.low && t.h > 100 && rnd() < 0.6;
      const h0 = setback ? t.h * (0.6 + rnd() * 0.15) : t.h;
      const crown = !t.low && rnd() < 0.35 ? (rnd() < 0.5 ? [2.2, 1.5, 0.75] : [1.3, 1.8, 2.4]) : null;
      box(t.x, t.z, t.w, t.d, -1, h0, bright, tint, setback ? null : crown);
      if (setback) box(t.x, t.z, t.w * 0.66, t.d * 0.66, h0, t.h, bright * 1.05, tint, crown);
      if (i < 24) REDS.push([t.x, t.h + 1.5, t.z]);
    });
    skylineGeo = geoFrom(pos, col, idx, uvs);
    matTowers = basic({ map, vertexColors: true });
    mesh(skylineGeo, matTowers, 'exteriorSkyline');
  }
  const matRed = basic({ color: hdr(1, 0.16, 0.1, 2.4) });
  {
    const g = own(new THREE.OctahedronGeometry(1.4, 0));
    const im = new THREE.InstancedMesh(g, matRed, REDS.length);
    im.name = 'exteriorAviationLights';
    REDS.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
    group.add(im);
  }

  // ── 9. the water: the skyline's reflection under a dark, moving surface, and the lamps' streaks ───
  {
    // the skyline mirrored in the water, broken into horizontal ripples
    const mirror = own(new THREE.ShaderMaterial({
      uniforms: { map: { value: matTowers.map }, uTime: T.uTime, uWater: { value: WATER_Y }, ...HZ },
      vertexShader: `attribute vec3 color; varying vec3 vCol; varying vec2 vUv; varying vec3 vW; varying float vHazeD;
        void main(){ vCol = color; vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
          vec4 mv = viewMatrix * w; vHazeD = length(mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform float uTime, uWater; uniform vec3 uHaze; uniform float uHazeNear, uHazeFar, uHazeMax;
        varying vec3 vCol; varying vec2 vUv; varying vec3 vW; varying float vHazeD;
        void main(){
          vec3 c = texture2D(map, vUv).rgb * vCol;
          float depth = uWater - vW.y;
          float rip = 0.5 + 0.5 * sin(vW.y * 0.55 + sin(vW.x * 0.045 + uTime * 0.5) * 2.4 + uTime * 1.1);
          c *= 0.75 * rip * rip * exp(-depth * 0.004);
          c = mix(c, uHaze * 0.5, smoothstep(uHazeNear, uHazeFar, vHazeD) * uHazeMax);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.DoubleSide, fog: false,
    }));
    const mm = new THREE.Mesh(skylineGeo, mirror);
    mm.name = 'exteriorSkylineReflection';
    mm.scale.y = -1; mm.position.y = 2 * WATER_Y; mm.updateMatrix(); mm.matrixAutoUpdate = false;
    group.add(mm);

    const wg = own(new THREE.PlaneGeometry(6000, 6000, 1, 1));
    wg.rotateX(-Math.PI / 2);
    const wm = own(new THREE.ShaderMaterial({
      uniforms: { uTime: T.uTime, uDeep: { value: new THREE.Color(0.004, 0.006, 0.01) }, uSky: { value: new THREE.Color(0.08, 0.055, 0.036) } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime; uniform vec3 uDeep, uSky; varying vec3 vW;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        void main(){
          vec3 v = normalize(vW - cameraPosition);
          float graze = pow(1.0 - abs(v.y), 4.0);
          float n = vn(vW.xz * vec2(0.08, 0.35) + vec2(uTime * 0.05, uTime * 0.12)) * vn(vW.xz * vec2(0.21, 0.6) - vec2(uTime * 0.07, 0.0));
          // the sky's glow on the water at a grazing angle, warmest looking toward the city (+z)
          vec3 c = uDeep + uSky * graze * (0.55 + 0.9 * n) * (0.4 + 0.6 * clamp(v.z * 0.5 + 0.5, 0.0, 1.0));
          float a = mix(0.82, 0.62, graze);
          gl_FragColor = vec4(c, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: true, fog: false,
    }));
    const water = new THREE.Mesh(wg, wm);
    water.name = 'exteriorWater'; water.position.y = WATER_Y; water.renderOrder = 1;
    water.updateMatrix(); water.matrixAutoUpdate = false;
    group.add(water);

    // the lamps' reflections: a streak on the water from each lamp toward the lens
    const shoreLamps = LAMPS.filter(([x, z]) => landDepth(x, z) < 14).concat(CITY_LAMPS.map(([x, z]) => [x, z, 1]));
    const base = own(new THREE.InstancedBufferGeometry());
    base.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
    base.setIndex([0, 1, 2, 0, 2, 3]);
    const centers = new Float32Array(shoreLamps.length * 3), lens = new Float32Array(shoreLamps.length);
    shoreLamps.forEach(([x, z], i) => {
      // just off the wall, in the water
      const inCity = z > CITY_Z - 40;
      let px = x, pz = z;
      if (inCity) pz = cityShoreZ(x) - 3;
      else { const th = Math.atan2(z - LAND_C[1], x - LAND_C[0]); const [cx, cz] = coastPt(th, -3); px = cx; pz = cz; }
      centers[i * 3] = px; centers[i * 3 + 1] = WATER_Y + 0.03; centers[i * 3 + 2] = pz;
      lens[i] = (inCity ? 26 : 13) * (0.8 + rnd() * 0.4);
    });
    base.setAttribute('aC', new THREE.InstancedBufferAttribute(centers, 3));
    base.setAttribute('aL', new THREE.InstancedBufferAttribute(lens, 1));
    base.instanceCount = shoreLamps.length;
    const sm = own(new THREE.ShaderMaterial({
      uniforms: { uTime: T.uTime, uCol: { value: hdr(1.0, 0.62, 0.28, 1.6) } },
      vertexShader: `attribute vec3 aC; attribute float aL; varying vec2 vUv; varying float vSeed;
        void main(){
          vUv = position.xy; vSeed = aC.x * 0.13 + aC.z * 0.07;
          vec2 d = normalize(cameraPosition.xz - aC.xz + vec2(1e-3));
          vec2 n = vec2(-d.y, d.x);
          float w = 0.9 + 0.05 * aL;
          vec2 p = aC.xz + d * (position.y * aL) + n * ((position.x - 0.5) * w);
          gl_Position = projectionMatrix * viewMatrix * vec4(p.x, aC.y, p.y, 1.0);
        }`,
      fragmentShader: `uniform float uTime; uniform vec3 uCol; varying vec2 vUv; varying float vSeed;
        void main(){
          float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
          float along = pow(1.0 - vUv.y, 1.6);
          float rip = 0.45 + 0.55 * sin(vUv.y * 38.0 - uTime * 2.2 + vSeed * 9.0);
          float k = across * across * along * (0.35 + 0.65 * rip * rip);
          gl_FragColor = vec4(uCol * k, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    const streaks = new THREE.Mesh(base, sm);
    streaks.name = 'exteriorLampReflections'; streaks.renderOrder = 3; streaks.frustumCulled = false;
    group.add(streaks);
  }

  // ── animation ───────────────────────────────────────────────────────────────────────────────
  let outside = false;
  aimBeams(0);
  /**
   * Show the exterior (the host says when: while the arrival plays) and keep its clocks.
   * @returns {boolean} whether it is showing
   */
  function update(dt = 1 / 60, t = 0, isOutside = false) {
    outside = !!isOutside;
    group.visible = outside;
    if (!outside) return false;
    T.uTime.value = RM ? 0 : t;
    const blink = RM ? 0.7 : 0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(t * Math.PI * 1.2)), 3);
    matRed.color.setRGB(1, 0.16, 0.1).multiplyScalar(2.4 * blink);
    aimBeams(t);
    return true;
  }
  function set(state = {}) { if (state.reducedMotion !== undefined) RM = !!state.reducedMotion; }

  function dispose() {
    if (group.parent) group.parent.remove(group);
    group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    group.clear();
    for (const d of disposables) if (d && typeof d.dispose === 'function') d.dispose();
    disposables.length = 0;
  }

  return { group, update, set, dispose, stats, get outside() { return outside; } };
}
