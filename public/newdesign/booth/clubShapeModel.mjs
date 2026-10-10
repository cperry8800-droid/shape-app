// clubShapeModel.mjs — Club Shape from outside, from a 3D model of the Shape Sets picture.
//
// The owner chose a modelled venue over one drawn in code (2026-10-10); the brief the model is built
// to is docs/BUILD-2026-10-10-club-shape-model.md, and scripts/club-shape-model/check-venue.mjs holds
// a file to it. This wraps a loaded model in the same interface as clubExterior.createExterior
// ({ group, update, set, dispose, stats, outside }), so the booth plays the arrival in either.
//
// What it adds to the model: the booth's sky (the brief leaves the sky out), a plain dark sea when the
// model has no `Water`, the club's screen painted on `StageScreen`, and the `Ribbon` turned up past the
// bloom threshold and pulsed with the music. Everything else is the model as built: its lighting is
// baked, because the exterior has no lights.
//
// Rules as the venue's: no Math.random, no clock (the caller passes t), no DOM at import, and
// everything it was given or made is disposed with it.
import { addExteriorSky, paintClubScreen, makeCanvas, mulberry32, EXTERIOR_DIMS } from './clubExterior.mjs';

/** The node names the booth looks up in a venue model (the brief's §3). */
export const VENUE_NODES = Object.freeze({ ribbon: 'Ribbon', screen: 'StageScreen', water: 'Water' });
/** The ribbon's glow: its colour scaled over the bloom threshold (0.85), as the code-built ribbon's 2.4 is. */
export const RIBBON_GLOW = 2.4;

/** The first object in `root` named `name`, or null. */
export function findNamed(root, name) {
  let hit = null;
  root.traverse((o) => { if (!hit && o.name === name) hit = o; });
  return hit;
}
/** A node's meshes: its own and its descendants' (an exporter may hang the mesh under the named node). */
function meshesOf(o) {
  const out = [];
  if (o) o.traverse((m) => { if (m.isMesh) out.push(m); });
  return out;
}
const matsOf = (m) => (Array.isArray(m.material) ? m.material : [m.material]).filter(Boolean);

/**
 * @param {object} o
 * @param {typeof import('three')} o.THREE
 * @param {import('three').Object3D} o.scene  the loaded model (a GLTF's `scene`), in the booth's frame
 * @param {'low'|'high'} [o.quality]
 * @param {boolean} [o.reducedMotion]
 * @param {number} [o.seed]   the stars
 */
export function createVenueModel({ THREE, scene: model, quality = 'high', reducedMotion = false, seed = 23 } = {}) {
  if (!THREE || !model) throw new Error('createVenueModel: THREE and the model scene are required');
  const LOW = quality === 'low';
  const disposables = [];
  const own = (x) => { disposables.push(x); return x; };
  const group = new THREE.Group();
  group.name = 'clubShapeModel';
  group.visible = false;
  let RM = !!reducedMotion;
  const uTime = { value: 0 };
  const stats = { triangles: 0, missing: [] };

  // Everything the model brought, gathered before anything is swapped, so dispose() frees it all.
  const theirs = { geometries: new Set(), materials: new Set(), textures: new Set() };
  model.traverse((o) => {
    if (o.geometry) theirs.geometries.add(o.geometry);
    if (o.material) for (const m of matsOf(o)) theirs.materials.add(m);
    if (o.isMesh && o.geometry) {
      const g = o.geometry, n = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
      stats.triangles += Math.floor(n / 3) * (o.isInstancedMesh ? o.count : 1);
    }
  });
  for (const m of theirs.materials) for (const k of Object.keys(m)) if (m[k] && m[k].isTexture) theirs.textures.add(m[k]);

  addExteriorSky(THREE, group, { rnd: mulberry32(seed), LOW, own, uTime });
  group.add(model);

  // The club's screen on the stage.
  const screen = findNamed(model, VENUE_NODES.screen);
  if (!screen) stats.missing.push(VENUE_NODES.screen);
  else {
    const c = paintClubScreen(makeCanvas(512, 228));
    let map = null;
    if (c) {
      map = own(new THREE.CanvasTexture(c));
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = LOW ? 2 : 8;
    }
    const mat = own(new THREE.MeshBasicMaterial({ map, color: map ? new THREE.Color(1.25, 1.25, 1.25) : new THREE.Color(0.4, 0.5, 0.5) }));
    for (const m of meshesOf(screen)) m.material = mat;
  }

  // The ribbon: each of its materials copied, so the pulse never touches a material another part shares.
  const glow = [];
  const ribbon = findNamed(model, VENUE_NODES.ribbon);
  if (!ribbon) stats.missing.push(VENUE_NODES.ribbon);
  else {
    for (const m of meshesOf(ribbon)) {
      const copies = matsOf(m).map((src) => {
        const k = own(src.clone());
        const basic = !k.emissive;   // unlit (MeshBasicMaterial): its colour is its light
        glow.push({ mat: k, basic, base: (basic ? k.color : k.emissive).clone(), intensity: basic ? 1 : Math.max(1, k.emissiveIntensity || 1) });
        return k;
      });
      m.material = Array.isArray(m.material) ? copies : copies[0];
    }
  }
  const pulse = (level) => {
    const k = RIBBON_GLOW * (RM ? 1 : 1 + 0.25 * Math.max(0, Math.min(1, level || 0)));
    for (const g of glow) {
      if (g.basic) g.mat.color.copy(g.base).multiplyScalar(k);
      else { g.mat.emissive.copy(g.base); g.mat.emissiveIntensity = g.intensity * k; }
    }
  };
  pulse(0);

  // The sea, when the model brings none.
  if (!findNamed(model, VENUE_NODES.water)) {
    const g = own(new THREE.CircleGeometry(3000, LOW ? 48 : 96));
    g.rotateX(-Math.PI / 2);
    g.translate(0, EXTERIOR_DIMS.WATER_Y, 0);
    const sea = new THREE.Mesh(g, own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.006, 0.008, 0.012) })));
    sea.name = 'clubShapeSea'; sea.renderOrder = -1;
    group.add(sea);
  }

  let outside = false;
  function update(dt = 1 / 60, t = 0, isOutside = false, level = 0) {
    outside = !!isOutside;
    group.visible = outside;
    if (!outside) return false;
    uTime.value = RM ? 0 : t;
    pulse(level);
    return true;
  }
  function set(state = {}) { if (state.reducedMotion !== undefined) RM = !!state.reducedMotion; }
  function dispose() {
    if (group.parent) group.parent.remove(group);
    group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    group.clear();
    for (const d of disposables) if (d && typeof d.dispose === 'function') d.dispose();
    disposables.length = 0;
    for (const bag of [theirs.geometries, theirs.materials, theirs.textures]) {
      for (const d of bag) if (d && typeof d.dispose === 'function') d.dispose();
      bag.clear();
    }
  }
  return { group, update, set, dispose, stats, get outside() { return outside; } };
}
