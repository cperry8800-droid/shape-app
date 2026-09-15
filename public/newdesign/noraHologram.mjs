// Nora as a PROJECTION, not an avatar.
//
// WHY THIS FILE EXISTS: the Radio page's "Nora · DJ preview" rendered the
// placeholder VRM the way a model viewer renders a VRM — a key light, a fill,
// the model's own textures — and the owner's note on it was "the look of nora
// here needs to be updated, not so avatar looking". A lit anime figure in a
// white t-shirt standing in a black box IS a stock avatar, whatever the rig
// underneath is doing. What the page is built on is a signal: the Signal Field
// is a grid of dots lit by the station, and the Booth (RadioHologramDJ in
// iosAppReactive.jsx, the owner's pick for the hologram light effect) is a
// light-form behind scanlines. Nora belongs to that grammar — light thrown into
// the booth, made of the same dots the field is made of, resolved into a figure.
//
// So the RIG is untouched: the bones, the spring hair, the expressions and the
// audio-reactive driver (noraReactive.mjs) all still run. Only the MATERIAL
// changes. Three looks, one shader:
//   dots  — a screen-space dot matrix whose dot size follows a fresnel term
//           (edges bright, faces quiet), scanlines drifting down, a slow
//           flicker, additive over the dark panel. The default.
//   wire  — the same light on the mesh's own wireframe: a light-form.
//   solid — the same light as a monochrome scanned surface (the smallest
//           step away from the avatar; kept so the range can be seen).
//   avatar — the VRM's own materials, exactly as shipped before this file.
//
// ⚠ ADDITIVE LIGHT NEEDS A DEPTH PREPASS OR THE FIGURE IS A TANGLE. With
// depthWrite off (which additive blending needs, or draw order decides what
// shows), every surface behind a nearer one ADDS through it — arms through the
// torso, the far side of the hair through the face — and she reads as a glowing
// knot rather than one figure. A depth-only clone of each mesh (colorWrite off,
// drawn in the opaque pass) fills the depth buffer first, so only the nearest
// surface passes the depth test and lights up. The clone shares the original's
// skeleton AND its morph-target influences by reference. ⚠ A COPIED INFLUENCE
// ARRAY IS NOT A LAG, IT IS PERMANENT: `Mesh.copy` SLICES that array ONCE, at
// clone time, and three-vrm's morph bind writes IN PLACE into the ORIGINAL
// primitive's array (over a `primitives` list resolved at load that never
// contains our clone) — so a clone left as three.js makes it never sees another
// write, and the depth of a blinking eyelid stays frozen at its clone-time value
// for the life of the preview.
//
// Pure ESM with THREE INJECTED: the caller owns the three.js instance, and this
// module has no bare import to resolve, so the shader sources and the
// traversal are unit-testable in Node against a stub (tests/nora-hologram.test.mjs).

export const NORA_LOOKS = ['dots', 'wire', 'solid', 'avatar'];
export const NORA_DEFAULT_LOOK = 'dots';

// The vertex shader carries the SKINNING and MORPH-TARGET chunks, in three.js's
// own order. A hologram that does not skin is a frozen T-pose; one that does
// not morph never blinks.
export const HOLO_VERT = `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
varying vec3 vN;
varying vec3 vV;
void main() {
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
  vN = normalize( normalMatrix * objectNormal );
  vV = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

// uMode: 0 dots · 1 wire · 2 solid. The light is a fresnel term — a surface
// facing the camera is quiet, an edge is bright — which is how a projection
// reads as a volume without any lighting rig at all.
export const HOLO_FRAG = `
precision highp float;
uniform vec3 uColor;
uniform float uTime;
uniform float uLevel;
uniform float uCell;
uniform float uOpacity;
uniform int uMode;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 n = normalize( vN );
  vec3 v = normalize( vV );
  float ndv = abs( dot( n, v ) );
  float rim = pow( 1.0 - ndv, 2.0 );
  float lit = 0.3 + 0.7 * rim;
  float mask = 1.0;
  float fill = 0.0;
  if ( uMode == 0 ) {
    vec2 cell = mod( gl_FragCoord.xy, uCell ) - uCell * 0.5;
    float d = length( cell ) / ( uCell * 0.5 );
    float r = 0.34 + 0.56 * lit;
    mask = 1.0 - smoothstep( r - 0.2, r + 0.05, d );
    // a faint scanned body under the dots, so the figure reads as a volume
    // and not as the outline of a dress
    fill = 0.14 * lit;
  }
  float scan = 0.84 + 0.16 * sin( gl_FragCoord.y * 0.85 - uTime * 3.5 );
  float flick = 0.95 + 0.05 * sin( uTime * 21.0 ) * sin( uTime * 7.3 );
  float breathe = 0.8 + 0.4 * uLevel;
  float a = ( mask * lit + fill ) * scan * flick * uOpacity * breathe;
  if ( uMode == 2 ) a = uOpacity * ( 0.35 + 0.65 * lit ) * scan * flick;
  vec3 col = uColor * ( 0.6 + 0.8 * rim );
  gl_FragColor = vec4( col, a );
}
`;

// What each look asks of the material. Pure, so the table is drivable.
export function holoParams(look) {
  switch (look) {
    case 'dots': return { mode: 0, wireframe: false, additive: true, depthWrite: false, depthPrepass: true, opacity: 1.0, cell: 5.5 };
    case 'wire': return { mode: 1, wireframe: true, additive: true, depthWrite: false, depthPrepass: true, opacity: 0.5, cell: 5.5 };
    case 'solid': return { mode: 2, wireframe: false, additive: false, depthWrite: true, depthPrepass: false, opacity: 0.92, cell: 5.5 };
    default: return null; // 'avatar' (and anything unknown) — the VRM's own materials
  }
}

export function createHologram(THREE, look, { color = '#34d6c5', pixelRatio = 1 } = {}) {
  const p = holoParams(look);
  if (!p) return null;
  const uniforms = {
    uColor: { value: new THREE.Color(color) },
    uTime: { value: 0 },
    uLevel: { value: 0 },
    // The dot pitch is in DEVICE pixels, so the grid reads the same on a 1× and
    // a 2× screen instead of doubling its density on the sharper one.
    uCell: { value: p.cell * (Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1) },
    uOpacity: { value: p.opacity },
    uMode: { value: p.mode },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: HOLO_VERT,
    fragmentShader: HOLO_FRAG,
    transparent: true,
    wireframe: p.wireframe,
    depthWrite: p.depthWrite,
    depthTest: true,
    blending: p.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    // ⚠ DOUBLE-SIDED, BECAUSE A VRM'S CLOTHES OFTEN ARE. MToon frequently marks
    // hair cards and a skirt double-sided; forcing FrontSide would put holes in
    // exactly those surfaces on a model we have not seen yet (the real Nora is
    // still to come — Phase C). The depth prepass is double-sided too, so the
    // nearest face of either winding fills the depth buffer and three's default
    // LessEqualDepth then lets that same face light up.
    side: THREE.DoubleSide,
  });
  const depthMaterial = p.depthPrepass ? new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }) : null;
  return { look, params: p, uniforms, material, depthMaterial };
}

function hasOutline(material) {
  if (Array.isArray(material)) return material.some((m) => !!(m && m.isOutline));
  return !!(material && material.isOutline);
}

// Swap every mesh under `root` onto the hologram. Returns a handle whose
// `restore()` puts the VRM back exactly as it was — the originals are kept by
// reference, never cloned. MToon's outline meshes (a second, inflated shell
// three-vrm generates per material) are HIDDEN rather than swapped: an inflated
// copy of the figure in light would be a second, larger Nora around the first.
export function applyHologram(THREE, root, look, opts) {
  const holo = createHologram(THREE, look, opts);
  // 'avatar' is the VRM exactly as shipped — outlines included — so it touches
  // nothing at all rather than hiding the outline shells of a look it is not.
  if (!holo) return { look, holo: null, meshes: 0, hidden: 0, restore() {} };
  const meshes = [];
  root.traverse((o) => { if (o && o.isMesh) meshes.push(o); });
  const swaps = [];
  const clones = [];
  const hidden = [];
  for (const o of meshes) {
    const m = o.material;
    // three-vrm's MToon outline is a SECOND ENTRY in a material array on the
    // same mesh (a back-face shell over geometry groups), so swapping the array
    // for one material drops it with the swap; a mesh whose only material is an
    // outline is hidden outright.
    if (hasOutline(m) && !Array.isArray(m)) {
      if (o.visible !== false) { o.visible = false; hidden.push(o); }
      continue;
    }
    swaps.push([o, m]);
    o.material = holo.material;
    if (holo.depthMaterial && o.parent) {
      const d = o.clone(false);
      d.material = holo.depthMaterial;
      d.morphTargetInfluences = o.morphTargetInfluences;
      d.morphTargetDictionary = o.morphTargetDictionary;
      d.renderOrder = -1;
      o.parent.add(d);
      clones.push(d);
    }
  }
  return {
    look,
    holo,
    meshes: swaps.length,
    hidden: hidden.length,
    restore() {
      for (const [o, m] of swaps) o.material = m;
      for (const d of clones) if (d.parent) d.parent.remove(d);
      for (const o of hidden) o.visible = true;
      if (holo) { holo.material.dispose(); if (holo.depthMaterial) holo.depthMaterial.dispose(); }
      swaps.length = 0; clones.length = 0; hidden.length = 0;
    },
  };
}

// The accent is a LIVE setting — Appearance → Accent recolours the page under a
// still-mounted tab tree, and a late cloud-preference hydrate does the same — and
// the booth around the canvas reads `t.ACCENT` at render, so it follows on that
// frame. The projection has to follow on the same frame or the preview is two
// colours. It is a UNIFORM WRITE rather than a reason to rebuild: re-applying the
// hologram would re-clone every depth mesh, and rebuilding the stage would
// re-download the VRM and flash the booth empty for a colour change.
export function setHologramColor(handle, color) {
  const u = handle && handle.holo && handle.holo.uniforms;
  if (!u || !color) return false;
  u.uColor.value.set(color);
  return true;
}

// Per frame: the clock and the room's level. Nothing here is a target eased
// toward — the shader reads the instant.
export function updateHologram(handle, { t = 0, level = 0 } = {}) {
  const u = handle && handle.holo && handle.holo.uniforms;
  if (!u) return;
  u.uTime.value = Number.isFinite(t) ? t : 0;
  u.uLevel.value = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
}
