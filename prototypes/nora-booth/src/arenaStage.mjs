// arenaStage.mjs — Club Shape's main stage at arena scale, built around Nora's booth.
//
// The owner's photo is an arena production: a wall of LED behind everything, a tiered stage whose
// step faces are LED too, a truss rig overhead full of moving heads and spots, and hanging speaker
// arrays. This is that, in Club Shape's own terms:
//
//   backdrop     one LED wall across the whole stage end, floor to ceiling (≈20.6 × 15.3 m), its
//                content drawn by a shader — a dawn over a dark sea: a sun rising just over the
//                booth's portal, slow rays, ridges either side, ribbons of teal and ice high up, the
//                sun's reflection breaking into dashes below — on a visible dot pitch, so it reads
//                as a screen, not a sky
//   wings        the deck widened to the balconies either side, a row of par cans along its lip
//   rig          a truss grid over the stage and the front of the crowd: moving heads throwing
//                narrow white beams that sweep on the bar, a row of spots, two line arrays
//
// The runway into the crowd, the two giant ▸ ◂ statues either side of the screen and the four
// LED-faced steps that rose to the wall on each wing are gone (the owner's word: "remove this walk
// way in front of stage", "remove the outside 2 large triangles", "remove the stairs on the sides
// of the stage"); the mark lives on the screen now, over CLUB SHAPE, the crowd runs up to the
// stage lip, and the wall stands on a flat deck from balcony to balcony.
//
// Nora's booth and her lights (club.mjs) are untouched. club.mjs draws its artwork (the mark over
// CLUB SHAPE, and the spectrum) additively onto this wall, on its dot grid, so the whole stage end is
// one screen. Everything is geometry and shaders — no textures, no pictures. The flashes rule holds:
// nothing here flashes; the wall and the beams swell with the level and lift gently on the kick.

export const ARENA_DIMS = {
  DECK_Y: -0.18,           // the club's stage height (CLUB_DIMS.STAGE_Y)
  FLOOR_Y: -0.66,
  BACK_Z: 5.5,             // the LED wall's face
  HALF_W: 10.3,            // the wall and the wings reach this far each side (balconies start at 10.5)
  TOP_Y: 15.1,             // just under the ceiling (15.5): the stage end has no top-tier bridge now
  WING_FRONT_Z: 0.6,       // the club deck's sides turn into its rounded nose here
  TRUSS: { y: 13.0, z0: -3.0, z1: 4.6, zMid: 0.8, size: 0.46 },
};
const D = ARENA_DIMS;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ── shaders ───────────────────────────────────────────────────────────────────────────────
const LED_VERT = /* glsl */`
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
// The content is a function of the wall's own coordinates (metres), so anything drawn over it on
// the same grid (club.mjs's artwork) lands on the same dots.
const LED_FRAG = /* glsl */`
  uniform float uTime, uLevel, uKick, uMotion, uGain;
  uniform vec3 uIce, uAccent;
  varying vec3 vW;
  float ridge(float x, float seed, float freq) {
    return sin(x * freq + seed) * 0.5 + sin(x * freq * 2.3 + seed * 1.7) * 0.25 + sin(x * freq * 5.1 + seed * 2.9) * 0.12;
  }
  void main() {
    vec2 p = vW.xy;
    float t = uTime * uMotion;
    const float HY = 9.2;                 // the horizon: just over the booth portal's top (8.8)
    float a = p.y - HY;
    float aa = max(fwidth(p.y), 0.02);
    vec3 hor = vec3(1.0, 0.52, 0.2);
    vec3 col;
    if (a >= 0.0) {
      // the sky: a gold horizon through rose and indigo to night at the top
      col = mix(hor * 0.85, vec3(0.62, 0.2, 0.32) * 0.55, smoothstep(0.0, 1.6, a));
      col = mix(col, vec3(0.1, 0.08, 0.28) * 0.55, smoothstep(1.2, 3.6, a));
      col = mix(col, vec3(0.02, 0.03, 0.09), smoothstep(3.5, 6.0, a));
      // the sun, half risen, slit across its lower half
      vec2 sc = p - vec2(0.0, HY + 0.4);
      float sr = length(sc);
      float disc = 1.0 - smoothstep(3.0 - aa, 3.0 + aa, sr);
      float yy = a / 3.4;
      float k = 0.45 * smoothstep(0.62, 0.0, yy);
      float cut = smoothstep(k - 0.04, k + 0.04, fract(p.y * 1.7 - t * 0.12));
      vec3 sunC = mix(vec3(1.7, 0.55, 0.26), vec3(1.8, 1.25, 0.55), clamp(yy * 1.4, 0.0, 1.0));
      col = mix(col, sunC, disc * cut);
      col += vec3(1.0, 0.55, 0.25) * exp(-max(sr - 3.0, 0.0) * 0.55) * 0.32 * (1.0 - disc);
      // rays fanning from the sun
      float ang = atan(sc.x, sc.y);
      float rays = pow(0.5 + 0.5 * cos(ang * 11.0 - t * 0.2), 6.0) * smoothstep(3.0, 4.5, sr) * exp(-(sr - 3.0) * 0.12);
      col += mix(vec3(1.0, 0.7, 0.4), uIce, smoothstep(2.0, 6.0, a)) * rays * (0.12 + 0.18 * uLevel);
      // slow ribbons, teal to ice, high on the wall
      float rib = 0.0;
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float y0 = HY + 3.6 + fi * 0.9 + sin(p.x * 0.17 + t * (0.06 + 0.03 * fi) + fi * 2.1) * 0.7;
        rib += exp(-pow((p.y - y0) / (0.28 + 0.12 * fi), 2.0)) * (0.55 + 0.45 * sin(p.x * 0.37 - t * 0.18 + fi));
      }
      col += mix(uAccent, uIce, 0.4) * rib * (0.2 + 0.2 * uLevel);
      // ridges either side: a far one lit by the dawn, a near one dark
      float side = smoothstep(3.0, 9.5, abs(p.x));
      float r1 = HY - 0.3 + side * (1.7 + 0.9 * ridge(p.x, 1.3, 0.45));
      float r2 = HY - 0.35 + side * (1.0 + 0.7 * ridge(p.x, 4.1, 0.8));
      col = mix(col, vec3(0.3, 0.13, 0.13), 1.0 - smoothstep(r1 - aa, r1 + aa, p.y));
      col = mix(col, vec3(0.012, 0.035, 0.05), 1.0 - smoothstep(r2 - aa, r2 + aa, p.y));
    } else {
      // below the horizon: a dark sea, the sun's reflection breaking into dashes
      float d = -a;
      col = mix(hor * 0.28, vec3(0.008, 0.03, 0.045), smoothstep(0.0, 2.5, d));
      // (short: the Club Shape artwork (club.mjs) is drawn over this part of the wall)
      float streak = exp(-pow(p.x / (1.6 + d * 0.25), 2.0));
      float dash = smoothstep(0.55, 0.9, 0.5 + 0.5 * sin(p.y * 9.0 + sin(p.x * 3.0 + t * 0.8) * 1.2 + t * 0.6));
      col += vec3(1.3, 0.7, 0.3) * streak * dash * exp(-d * 0.9);
    }
    col *= uGain * (1.0 + 0.12 * uKick);
    // the LED: round dots on a 75 mm pitch, dark seams between 0.5 m modules. Once a dot is under
    // a couple of pixels it resolves to its area coverage (no moiré from the back of the room).
    vec2 g = p / 0.075;
    float px = max(fwidth(g.x), fwidth(g.y));
    float dotm = 1.0 - smoothstep(0.34, 0.34 + max(px, 0.06), length(fract(g) - 0.5));
    float far = smoothstep(0.35, 0.9, px);
    float fill = mix(dotm * 1.55, 0.55, far);
    vec2 m = abs(fract(p / 0.5) - 0.5);
    float seam = step(0.485, max(m.x, m.y)) * (1.0 - far);
    col *= (0.18 + fill) * (1.0 - 0.6 * seam);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const BEAM_VERT = /* glsl */`
  attribute vec3 aColor;
  varying vec3 vC; varying float vL; varying float vEdge; varying float vDepth;
  void main() {
    mat4 M = modelMatrix * instanceMatrix;
    vec4 w = M * vec4(position, 1.0);
    mat3 m = mat3(M);
    // inverse-transpose for a rotation × scale matrix: M·S⁻² (the columns' squared lengths are S²)
    vec3 n = normalize(m * (normal / vec3(dot(m[0], m[0]), dot(m[1], m[1]), dot(m[2], m[2]))));
    vEdge = abs(dot(n, normalize(cameraPosition - w.xyz)));
    vL = -position.y;
    vC = aColor;
    vec4 mv = viewMatrix * w;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
// A narrow "sharpy" beam: a hard bright core and a little glow round it, smooth along its length (no
// ripple: any periodic brightness along a beam near the bloom threshold blooms into a row of blobs,
// and the beam reads as a string of beads). It fades out within a few metres of the camera, so a
// beam crossing close to a lens is a faint streak, not a wall of light across the frame.
const BEAM_FRAG = /* glsl */`
  uniform float uFog;
  varying vec3 vC; varying float vL; varying float vEdge; varying float vDepth;
  void main() {
    float core = pow(vEdge, 7.0) * 1.6 + pow(vEdge, 2.0) * 0.12;
    float along = pow(1.0 - vL, 1.6) * (0.35 + 0.65 * exp(-vL * 3.0));
    float fog = exp(-uFog * uFog * vDepth * vDepth * 0.4);
    float near = smoothstep(2.0, 7.0, vDepth);
    gl_FragColor = vec4(vC * core * along * fog * near, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/**
 * @param {object} o
 * @param {typeof import('three')} o.THREE
 * @param {'high'|'low'} [o.quality]
 * @param {boolean} [o.reducedMotion]
 * @param {string} [o.accent]   Club Shape's accent (the teal)
 * @param {Function} [o.mergeGeometries]  three's BufferGeometryUtils.mergeGeometries
 */
export function createArenaStage({ THREE, quality = 'high', reducedMotion = false, accent = '#34d6c5', mergeGeometries }) {
  const LOW = quality === 'low';
  const group = new THREE.Group();
  group.name = 'arenaStage';
  const disposables = [];
  const own = (x) => { disposables.push(x); return x; };
  let RM = !!reducedMotion;
  const accentC = new THREE.Color(accent);
  const iceC = new THREE.Color(0.8, 0.9, 1.0);

  // ── helpers ─────────────────────────────────────────────────────────────────────────────
  const tint = (g, rgb) => {
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set(rgb, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    return g;
  };
  const box = (x0, x1, y0, y1, z0, z1, rgb = [1, 1, 1]) => {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return tint(g, rgb);
  };
  // a rod between two points (a truss chord or lacing)
  const up = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  const rod = (a, b, r, seg, rgb) => {
    tmpV.subVectors(b, a);
    const len = tmpV.length();
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
    tmpQ.setFromUnitVectors(up, tmpV.normalize());
    g.applyQuaternion(tmpQ);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return tint(g, rgb);
  };
  const merge = (list, name) => {
    const clean = list.map((g) => (g.index ? g.toNonIndexed() : g));
    const g = mergeGeometries(clean, false);
    for (const x of list) x.dispose();
    for (const x of clean) if (!list.includes(x)) x.dispose();
    if (!g) throw new Error('arenaStage: merge failed for ' + name);
    return own(g);
  };
  const mesh = (geo, mat, name, order = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name; m.renderOrder = order; m.matrixAutoUpdate = false; m.updateMatrix();
    group.add(m);
    return m;
  };

  // ── materials ───────────────────────────────────────────────────────────────────────────
  const ledU = {
    uTime: { value: 0 }, uLevel: { value: 0 }, uKick: { value: 0 }, uMotion: { value: RM ? 0.25 : 1 }, uGain: { value: 1 },
    uIce: { value: iceC.clone() }, uAccent: { value: accentC.clone() },
  };
  const matLed = own(new THREE.ShaderMaterial({ uniforms: ledU, vertexShader: LED_VERT, fragmentShader: LED_FRAG }));
  const matDark = own(new THREE.MeshBasicMaterial({ vertexColors: true }));          // deck, cabinets (their tone is baked in the colour)
  const matGlow = own(new THREE.MeshBasicMaterial({ vertexColors: true }));          // LED lines, lenses (HDR colours, the bloom takes them)
  const matTruss = own(new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.4, metalness: 0.85 }));

  const C_DECK = [0.012, 0.013, 0.016], C_DECK_TOP = [0.02, 0.021, 0.025];
  const C_LINE = [2.2, 2.35, 2.6], C_LINE_DIM = [0.55, 0.6, 0.7], C_PAR = [2.6, 2.4, 2.1];

  // ── 1. the LED wall ─────────────────────────────────────────────────────────────────────
  {
    const g = new THREE.PlaneGeometry(2 * D.HALF_W, D.TOP_Y - D.DECK_Y, LOW ? 1 : 8, LOW ? 1 : 4);
    g.rotateY(Math.PI);   // face −z, toward the room
    const m = new THREE.Mesh(own(g), matLed);
    m.name = 'arenaLedWall';
    m.position.set(0, (D.TOP_Y + D.DECK_Y) / 2, D.BACK_Z);
    m.matrixAutoUpdate = false; m.updateMatrix();
    group.add(m);
    // its black frame
    mesh(merge([
      box(-D.HALF_W - 0.12, D.HALF_W + 0.12, D.TOP_Y, D.TOP_Y + 0.05, D.BACK_Z, D.BACK_Z + 0.3, [0.01, 0.01, 0.012]),
      box(-D.HALF_W - 0.12, -D.HALF_W, D.DECK_Y, D.TOP_Y, D.BACK_Z, D.BACK_Z + 0.3, [0.01, 0.01, 0.012]),
      box(D.HALF_W, D.HALF_W + 0.12, D.DECK_Y, D.TOP_Y, D.BACK_Z, D.BACK_Z + 0.3, [0.01, 0.01, 0.012]),
    ], 'wallFrame'), matDark, 'arenaWallFrame');
  }

  // ── 2. the wings: a flat deck from the booth's sides to the balconies ───────────────────
  // Nothing stands on it. The tiered steps that rose to the wall here, LED risers and all, are gone
  // on the owner's word ("remove the stairs on the sides of the stage"): the wall meets the deck.
  const WING_X0 = 5.55;
  {
    const S = [], L = [];   // structure, LED lines
    for (const s of [-1, 1]) {
      const xa = s * WING_X0, xb = s * D.HALF_W, x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
      S.push(box(x0, x1, D.FLOOR_Y, D.DECK_Y, D.WING_FRONT_Z, D.BACK_Z, C_DECK));
      S.push(box(x0, x1, D.DECK_Y - 0.004, D.DECK_Y, D.WING_FRONT_Z, D.BACK_Z, C_DECK_TOP));
      // the deck's lip: a white line along its top edge and a dim one at the floor
      L.push(box(x0, x1, D.DECK_Y - 0.05, D.DECK_Y - 0.03, D.WING_FRONT_Z - 0.012, D.WING_FRONT_Z - 0.004, C_LINE));
      L.push(box(x0, x1, D.FLOOR_Y + 0.03, D.FLOOR_Y + 0.045, D.WING_FRONT_Z - 0.012, D.WING_FRONT_Z - 0.004, C_LINE_DIM));
    }
    // the deck behind the portal (hidden from the floor, seen from the balconies and the drone)
    S.push(box(-WING_X0, WING_X0, D.FLOOR_Y, D.DECK_Y, 3.2, D.BACK_Z, C_DECK));
    mesh(merge(S, 'wings'), matDark, 'arenaWings');
    mesh(merge(L, 'wingLines'), matGlow, 'arenaWingLines');
  }

  // par cans along the wings' lip, aimed up at the wall
  const PARS = [];
  for (const s of [-1, 1]) for (let x = WING_X0 + 0.45; x < D.HALF_W - 0.2; x += LOW ? 1.2 : 0.8) PARS.push(s * x);
  {
    const body = new THREE.CylinderGeometry(0.1, 0.12, 0.22, 10, 1);
    body.rotateX(-0.5);
    const lens = new THREE.CircleGeometry(0.085, 12);
    lens.rotateX(-Math.PI / 2 - 0.5);
    lens.translate(0, 0.1, -0.05);
    const parts = [];
    for (const x of PARS) {
      parts.push(tint(body.clone().translate(x, D.FLOOR_Y + 0.16, D.WING_FRONT_Z - 0.25), [0.018, 0.018, 0.02]));
    }
    mesh(merge(parts, 'parBodies'), matDark, 'arenaParCans');
    const lenses = PARS.map((x) => tint(lens.clone().translate(x, D.FLOOR_Y + 0.16, D.WING_FRONT_Z - 0.25), C_PAR));
    mesh(merge(lenses, 'parLenses'), matGlow, 'arenaParLenses');
    body.dispose(); lens.dispose();
  }

  // ── 3. the rig: a truss grid, spots, moving heads and their beams, two line arrays ──────
  const T = D.TRUSS;
  {
    const parts = [];
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const chordR = 0.03, laceR = 0.012, h = T.size / 2;
    const truss = (a, b) => {
      const axis = new THREE.Vector3().subVectors(b, a); const len = axis.length(); axis.normalize();
      const u = Math.abs(axis.y) > 0.9 ? V(1, 0, 0) : new THREE.Vector3().crossVectors(axis, V(0, 1, 0)).normalize();
      const w = new THREE.Vector3().crossVectors(u, axis).normalize();
      const corners = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([p, q]) => new THREE.Vector3().addScaledVector(u, p).addScaledVector(w, q));
      for (const c of corners) parts.push(rod(a.clone().add(c), b.clone().add(c), chordR, 6, [1, 1, 1]));
      if (LOW) return;   // phones: the chords read as a truss from the floor; the lacing is detail
      const bays = Math.max(1, Math.round(len / T.size));
      for (let i = 0; i < bays; i++) {
        const p0 = a.clone().addScaledVector(axis, (i * len) / bays), p1 = a.clone().addScaledVector(axis, ((i + 1) * len) / bays);
        for (let f = 0; f < 4; f++) {
          const c0 = corners[f], c1 = corners[(f + 1) % 4], even = i % 2 === 0;
          parts.push(rod(p0.clone().add(even ? c0 : c1), p1.clone().add(even ? c1 : c0), laceR, 4, [1, 1, 1]));
        }
      }
    };
    const X = D.HALF_W - 0.1;
    truss(V(-X, T.y, T.z0), V(X, T.y, T.z0));
    truss(V(-X, T.y, T.zMid), V(X, T.y, T.zMid));
    truss(V(-X, T.y, T.z1), V(X, T.y, T.z1));
    for (const s of [-1, 1]) truss(V(s * X, T.y, T.z0), V(s * X, T.y, T.z1));
    const g = mergeGeometries(parts.map((p) => { p.deleteAttribute('color'); p.deleteAttribute('uv'); return p; }), false);
    parts.forEach((p) => p.dispose());
    mesh(own(g), matTruss, 'arenaTruss');
  }
  // spots: a row of bright white lenses along the front and middle trusses (the photo's top row)
  {
    const lens = new THREE.CircleGeometry(0.09, 12);
    lens.rotateX(Math.PI / 2);   // face down
    const can = new THREE.CylinderGeometry(0.11, 0.11, 0.22, 10, 1);
    const L = [], B = [];
    const n = LOW ? 8 : 16;
    for (const z of [T.z0, T.zMid]) for (let i = 0; i < n; i++) {
      const x = -9.4 + (18.8 * (i + 0.5)) / n;
      B.push(tint(can.clone().translate(x, T.y - T.size / 2 - 0.13, z), [0.02, 0.02, 0.022]));
      L.push(tint(lens.clone().translate(x, T.y - T.size / 2 - 0.245, z), [3.0, 3.0, 2.9]));
    }
    mesh(merge(B, 'spotCans'), matDark, 'arenaSpotCans');
    mesh(merge(L, 'spotLenses'), matGlow, 'arenaSpotLenses');
    lens.dispose(); can.dispose();
  }
  // two line arrays hanging from the front truss, a J curve of eight cabinets each
  {
    const parts = [];
    for (const s of [-1, 1]) {
      let y = T.y - T.size / 2 - 0.05, tilt = 0;
      for (let k = 0; k < (LOW ? 6 : 8); k++) {
        const g = new THREE.BoxGeometry(1.0, 0.34, 0.62);
        g.translate(0, -0.17, 0);
        g.rotateX(tilt);
        g.translate(s * 8.85, y, T.z0 + 0.1);
        parts.push(tint(g, [0.016, 0.016, 0.018]));
        y -= 0.34 * Math.cos(tilt); tilt += 0.03 + k * 0.012;
      }
      parts.push(box(s * 8.85 - 0.55, s * 8.85 + 0.55, T.y - T.size / 2 - 0.08, T.y - T.size / 2 - 0.02, T.z0 - 0.25, T.z0 + 0.45, [0.02, 0.02, 0.022]));
    }
    mesh(merge(parts, 'lineArrays'), matDark, 'arenaLineArrays');
  }
  // moving heads on the front and middle trusses, and their beams
  const MH = [];
  {
    const xs = LOW ? [-8, -4.8, -1.6, 1.6, 4.8, 8] : [-9, -7.2, -5.4, -3.6, -1.8, 0, 1.8, 3.6, 5.4, 7.2, 9];
    for (const x of xs) MH.push({ x, z: T.z0, row: 0 });
    if (!LOW) for (const x of [-8.1, -4.5, -0.9, 0.9, 4.5, 8.1]) MH.push({ x, z: T.zMid, row: 1 });
    MH.forEach((m, i) => { m.i = i; m.f = (m.x + 9) / 18; m.y = T.y - T.size / 2 - 0.34; });
    const heads = MH.map((m) => {
      const g = new THREE.CylinderGeometry(0.13, 0.15, 0.36, 10, 1);
      g.translate(m.x, m.y, m.z);
      return tint(g, [0.02, 0.02, 0.022]);
    });
    mesh(merge(heads, 'movingHeads'), matDark, 'arenaMovingHeads');
  }
  const NB = MH.length;
  const BEAM_LEN = 24, BEAM_HALF = 0.009;   // ≈1° across: narrow sharpy beams (were 4°, a 1.7 m wash at the floor)
  const BEAM_R = Math.tan(BEAM_HALF) * BEAM_LEN, LENS_R = 0.07;
  // the cone's apex is the lens (radius LENS_R once scaled by BEAM_R), so a beam leaves a real lens
  const beamGeo = own(new THREE.CylinderGeometry(LENS_R / BEAM_R, 1, 1, LOW ? 10 : 16, 1, true));
  beamGeo.translate(0, -0.5, 0);   // apex at the origin, the beam along −y
  const beamCol = new Float32Array(NB * 3);
  const beamColAttr = new THREE.InstancedBufferAttribute(beamCol, 3);
  beamColAttr.setUsage(THREE.DynamicDrawUsage);
  beamGeo.setAttribute('aColor', beamColAttr);
  const beamU = { uFog: { value: 0.012 } };
  const matBeams = own(new THREE.ShaderMaterial({ uniforms: beamU, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const imBeams = new THREE.InstancedMesh(beamGeo, matBeams, NB);
  imBeams.name = 'arenaBeams'; imBeams.frustumCulled = false; imBeams.renderOrder = 10;
  imBeams.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(imBeams);

  // ── state + animation ───────────────────────────────────────────────────────────────────
  const st = { level: 0, kick: 0, drop: 0, bar: 0 };
  let envL = 0, envK = 0, envD = 0;
  const dir = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0), white = new THREE.Color(0.86, 0.93, 1.0), cTmp = new THREE.Color();

  function set(s = {}) {
    if (s.reducedMotion !== undefined) { RM = !!s.reducedMotion; ledU.uMotion.value = RM ? 0.25 : 1; }
    const b = s.bands || {};
    if (Number.isFinite(b.level)) st.level = clamp(b.level, 0, 1);
    if (Number.isFinite(s.kick)) st.kick = clamp(s.kick, 0, 1);
    if (Number.isFinite(s.drop)) st.drop = clamp(s.drop, 0, 1);
    if (Number.isFinite(s.bar)) st.bar = s.bar;
  }

  function update(dt = 1 / 60, t = 0) {
    dt = clamp(Number.isFinite(dt) ? dt : 1 / 60, 0, 0.25);
    envL += (st.level - envL) * (1 - Math.exp(-dt / 0.5));
    const kT = RM ? 0 : st.kick;
    envK += (kT - envK) * (1 - Math.exp(-dt / (kT > envK ? 0.06 : 0.25)));
    envD += (st.drop - envD) * (1 - Math.exp(-dt / 1.2));
    ledU.uTime.value = t; ledU.uLevel.value = envL; ledU.uKick.value = envK;

    // the beams: three looks, changing every eight bars; wider and quicker on the drop
    const slow = RM ? 0.2 : 1, ts = t * slow;
    const look = Math.floor(st.bar / 8) % 3;
    const drop = envD > 0.5;
    const gain = (0.1 + 0.3 * envL) * (1 + 0.8 * envD) * (1 + 0.12 * envK);
    for (let k = 0; k < NB; k++) {
      const m = MH[k], f = m.f;
      let pan, tilt;
      if (look === 0) { pan = (f - 0.5) * (drop ? 1.3 : 0.9) + 0.22 * Math.sin(ts * 0.4); tilt = 0.7 + 0.18 * Math.sin(ts * 0.5 + f * 3); }
      else if (look === 1) { pan = (k % 2 ? 0.45 : -0.45) + 0.15 * Math.sin(ts * 0.6 + k); tilt = 0.55 + 0.28 * Math.sin(ts * 0.7 + k * 0.9); }
      else { pan = 0.6 * Math.sin(ts * 0.8 + f * 6); tilt = 0.85 + 0.12 * Math.sin(ts * 0.9 + f * 4); }
      if (m.row === 1) tilt *= 0.8;
      dir.set(Math.sin(pan) * Math.sin(tilt), -Math.cos(tilt), -Math.cos(pan) * Math.sin(tilt)).normalize();
      q.setFromUnitVectors(down, dir);
      m4.compose(pos.set(m.x, m.y - 0.18, m.z), q, scl.set(BEAM_R, BEAM_LEN, BEAM_R));
      imBeams.setMatrixAt(k, m4);
      cTmp.copy(drop && k % 3 === 0 ? accentC : white).multiplyScalar(gain);
      beamCol[k * 3] = cTmp.r; beamCol[k * 3 + 1] = cTmp.g; beamCol[k * 3 + 2] = cTmp.b;
    }
    imBeams.instanceMatrix.needsUpdate = true;
    beamColAttr.needsUpdate = true;
  }

  function dispose() {
    if (group.parent) group.parent.remove(group);
    imBeams.dispose();
    group.clear();
    for (const d of disposables) if (d && typeof d.dispose === 'function') d.dispose();
    disposables.length = 0;
  }

  update(0, 0);
  return { group, set, update, dispose, dims: ARENA_DIMS, counts: { beams: NB, pars: PARS.length } };
}
