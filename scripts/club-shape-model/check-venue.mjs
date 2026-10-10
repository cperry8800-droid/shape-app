// check-venue.mjs — is a .glb ready to be Club Shape's outside in Nora's booth? It holds a file to the
// brief, docs/BUILD-2026-10-10-club-shape-model.md (§2 the frame and sizes, §3 what the booth needs).
// No dependencies: it reads the GLB's JSON and its images' headers and never decodes geometry, so it
// runs on a meshopt-compressed file as well as a raw one (positions' bounds are in the JSON).
//
//   node scripts/club-shape-model/check-venue.mjs <venue.glb> [--desktop]     (exit 1 on any error)
//
// What it holds a file to:
//   - glTF 2.0 binary, with no extension the booth cannot decode (Draco and KTX2 among them).
//   - The booth's frame: the StageScreen where the brief puts the LED wall, at its size, so a file
//     in centimetres, Z-up or moved off the origin is caught; the Ribbon round the venue's footprint.
//   - Materials the booth can show with no lights: each unlit, or carrying an emission.
//   - The budget (phone, or --desktop): triangles, file size, texture size, materials.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readGlb, imageSize } from '../nora-model/check-vrm.mjs';

export const BUDGET = Object.freeze({
  phone: Object.freeze({ triangles: 250_000, fileBytes: 12 * 1024 * 1024, maxTexturePx: 2048, materials: 24 }),
  desktop: Object.freeze({ triangles: 800_000, fileBytes: 40 * 1024 * 1024, maxTexturePx: 4096, materials: 24 }),
});
/** Extensions the booth's GLTFLoader can read with the decoders it ships (meshopt only). */
export const DECODABLE = Object.freeze([
  'KHR_materials_unlit', 'KHR_materials_emissive_strength', 'EXT_meshopt_compression', 'KHR_mesh_quantization',
  'KHR_texture_transform', 'EXT_texture_webp', 'EXT_mesh_gpu_instancing',
]);
/** Extensions it cannot, and why. */
export const UNDECODABLE = Object.freeze({
  KHR_draco_mesh_compression: 'Draco: the booth ships no Draco decoder; compress with meshopt instead',
  KHR_texture_basisu: 'KTX2 textures: the booth ships no Basis transcoder; use WebP instead',
});
/** Where the brief puts the LED wall (x −12…+12, y 2.3…13, z 18.5), and the venue's footprint. */
export const SCREEN = Object.freeze({ center: [0, 7.65, 18.5], size: [24, 10.7], tol: 1.5, sizeTol: 2 });
export const FOOTPRINT = Object.freeze({ x: [-62, 70], z: [-59, 48], tol: 15, rise: [20, 60] });
export const NODES = Object.freeze({ ribbon: 'Ribbon', screen: 'StageScreen', water: 'Water' });

// ── 4×4 matrices, column-major as glTF stores them ───────────────────────────────────────────
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
/** A node's local matrix: its `matrix`, or translation × rotation × scale. */
export function localMatrix(n) {
  if (Array.isArray(n.matrix) && n.matrix.length === 16) return n.matrix.slice();
  const [tx, ty, tz] = n.translation || [0, 0, 0], [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const apply = (m, p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);

const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
/** An accessor's min/max as floats (a normalised integer accessor stores them as integers). */
function boundsOf(acc) {
  if (!acc || !Array.isArray(acc.min) || !Array.isArray(acc.max)) return null;
  const k = acc.normalized && NORM[acc.componentType] ? NORM[acc.componentType] : 1;
  return { min: acc.min.map((v) => Math.max(v / k, k === 1 ? -Infinity : -1)), max: acc.max.map((v) => v / k) };
}
const emptyBox = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
function grow(box, p) { for (let i = 0; i < 3; i++) { box.min[i] = Math.min(box.min[i], p[i]); box.max[i] = Math.max(box.max[i], p[i]); } }
const isEmpty = (b) => !(b.max[0] >= b.min[0]);

/**
 * Walk the default scene: every node's world matrix, its parent, and the world box of each mesh it
 * carries (from the POSITION bounds, all eight corners transformed).
 */
export function walkScene(json) {
  const nodes = json.nodes || [], world = new Map(), parent = new Map(), boxes = new Map();
  const sceneIx = json.scene ?? 0, roots = (json.scenes && json.scenes[sceneIx] && json.scenes[sceneIx].nodes) || [];
  const visit = (i, M, p) => {
    if (world.has(i)) return;   // a node in two places: the glTF is invalid; count it once
    const W = mul(M, localMatrix(nodes[i] || {}));
    world.set(i, W); parent.set(i, p);
    const n = nodes[i] || {};
    if (n.mesh != null && json.meshes && json.meshes[n.mesh]) {
      const box = emptyBox();
      for (const pr of json.meshes[n.mesh].primitives || []) {
        const b = boundsOf((json.accessors || [])[pr.attributes && pr.attributes.POSITION]);
        if (!b) continue;
        for (let c = 0; c < 8; c++) grow(box, apply(W, [c & 1 ? b.max[0] : b.min[0], c & 2 ? b.max[1] : b.min[1], c & 4 ? b.max[2] : b.min[2]]));
      }
      if (!isEmpty(box)) boxes.set(i, box);
    }
    for (const c of n.children || []) visit(c, W, i);
  };
  for (const r of roots) visit(r, IDENT, -1);
  return { world, parent, boxes };
}
/** The world box of node i and everything under it, or null when it carries no geometry. */
function subtreeBox(json, walk, i) {
  const box = emptyBox();
  const go = (k) => { const b = walk.boxes.get(k); if (b) { grow(box, b.min); grow(box, b.max); } for (const c of (json.nodes[k] || {}).children || []) go(c); };
  go(i);
  return isEmpty(box) ? null : box;
}
/** The triangles a primitive draws. */
function primTriangles(json, pr) {
  const acc = json.accessors || [];
  const n = pr.indices != null ? (acc[pr.indices] || {}).count : (acc[pr.attributes && pr.attributes.POSITION] || {}).count;
  const mode = pr.mode ?? 4;
  if (!n) return 0;
  if (mode === 4) return Math.floor(n / 3);
  if (mode === 5 || mode === 6) return Math.max(0, n - 2);
  return 0;   // points and lines draw no triangles
}

/**
 * @param {Buffer} buf  the .glb
 * @param {{ desktop?: boolean }} [o]
 * @returns {{ errors: string[], warnings: string[], stats: object }}
 */
export function checkVenue(buf, { desktop = false } = {}) {
  const errors = [], warnings = [], stats = {};
  const budget = desktop ? BUDGET.desktop : BUDGET.phone;
  let glb;
  try { glb = readGlb(buf); } catch (e) { return { errors: [String(e.message || e)], warnings, stats }; }
  const { json, bin, length } = glb;
  stats.bytes = length;

  // Extensions.
  const used = new Set(json.extensionsUsed || []), required = new Set(json.extensionsRequired || []);
  for (const x of new Set([...used, ...required])) {
    if (UNDECODABLE[x]) errors.push(`${x}: ${UNDECODABLE[x]}`);
    else if (!DECODABLE.includes(x)) (required.has(x) ? errors : warnings).push(`${x}: the booth does not read this extension${required.has(x) ? ', and the file requires it' : '; it will be ignored'}`);
  }
  if ((json.cameras || []).length) warnings.push(`${json.cameras.length} camera(s): the booth ignores them and flies its own`);
  if ((json.animations || []).length) warnings.push(`${json.animations.length} animation(s): the booth does not play them`);
  if (used.has('KHR_lights_punctual')) warnings.push('lights: the booth ignores them; bake the lighting into the textures');

  // The frame: the screen where the brief puts the LED wall, the ribbon round the footprint.
  const walk = walkScene(json);
  const byName = (name) => (json.nodes || []).findIndex((n, i) => n && n.name === name && walk.world.has(i));
  const whole = emptyBox();
  for (const b of walk.boxes.values()) { grow(whole, b.min); grow(whole, b.max); }
  stats.bounds = isEmpty(whole) ? null : { min: whole.min.map((v) => +v.toFixed(2)), max: whole.max.map((v) => +v.toFixed(2)) };
  if (!stats.bounds) errors.push('no geometry with position bounds in the default scene');

  const si = byName(NODES.screen);
  if (si < 0) errors.push(`no node named "${NODES.screen}": the booth paints the club's screen on it`);
  else {
    const b = subtreeBox(json, walk, si);
    if (!b) errors.push(`"${NODES.screen}" carries no mesh`);
    else {
      const c = [0, 1, 2].map((k) => (b.min[k] + b.max[k]) / 2), w = b.max[0] - b.min[0], h = b.max[1] - b.min[1], d = b.max[2] - b.min[2];
      stats.screen = { center: c.map((v) => +v.toFixed(2)), size: [+w.toFixed(2), +h.toFixed(2), +d.toFixed(2)] };
      const off = Math.hypot(c[0] - SCREEN.center[0], c[1] - SCREEN.center[1], c[2] - SCREEN.center[2]);
      if (off > SCREEN.tol || Math.abs(w - SCREEN.size[0]) > SCREEN.sizeTol || Math.abs(h - SCREEN.size[1]) > SCREEN.sizeTol || d > 1) {
        errors.push(`"${NODES.screen}" is ${w.toFixed(1)} × ${h.toFixed(1)} × ${d.toFixed(1)} m at (${c.map((v) => v.toFixed(1)).join(', ')}); the brief has a ${SCREEN.size[0]} × ${SCREEN.size[1]} m upright quad at (${SCREEN.center.join(', ')}): check the units are metres, +Y is up and the model was not moved off the origin`);
      }
    }
  }
  const ri = byName(NODES.ribbon);
  if (ri < 0) errors.push(`no node named "${NODES.ribbon}": the teal line round the venue`);
  else {
    const b = subtreeBox(json, walk, ri);
    if (!b) errors.push(`"${NODES.ribbon}" carries no mesh`);
    else {
      stats.ribbon = { min: b.min.map((v) => +v.toFixed(1)), max: b.max.map((v) => +v.toFixed(1)) };
      const F = FOOTPRINT;
      const near = (v, t) => Math.abs(v - t) <= F.tol;
      if (!(near(b.min[0], F.x[0]) && near(b.max[0], F.x[1]) && near(b.min[2], F.z[0]) && near(b.max[2], F.z[1]))) {
        errors.push(`"${NODES.ribbon}" spans x ${b.min[0].toFixed(0)}…${b.max[0].toFixed(0)}, z ${b.min[2].toFixed(0)}…${b.max[2].toFixed(0)}; the brief's footprint is x ${F.x[0]}…${F.x[1]}, z ${F.z[0]}…${F.z[1]} (±${F.tol} m)`);
      }
      if (b.max[1] < F.rise[0] || b.max[1] > F.rise[1]) errors.push(`"${NODES.ribbon}" rises to ${b.max[1].toFixed(1)} m; along the shell's edge it should reach ${F.rise[0]}–${F.rise[1]} m (the brief has about 34)`);
    }
  }
  if (byName(NODES.water) < 0) warnings.push(`no node named "${NODES.water}": the booth will lay a plain dark sea at y −2.4`);

  // Materials the booth can show with no lights.
  const mats = json.materials || [];
  stats.materials = mats.length;
  if (mats.length > budget.materials) errors.push(`${mats.length} materials, over the budget of ${budget.materials}`);
  mats.forEach((m, i) => {
    const unlit = !!(m.extensions && m.extensions.KHR_materials_unlit);
    const ef = m.emissiveFactor || [0, 0, 0];
    const emissive = !!m.emissiveTexture || ef.some((v) => v > 0);
    if (!unlit && !emissive) errors.push(`material "${m.name || i}" is lit and has no emission: the booth has no lights, so it renders black (make it unlit, or bake its look into an emissive texture)`);
  });

  // The budget.
  let tris = 0;
  for (const [i] of walk.world) {
    const n = json.nodes[i];
    if (n.mesh == null || !json.meshes || !json.meshes[n.mesh]) continue;
    const inst = n.extensions && n.extensions.EXT_mesh_gpu_instancing;
    const copies = inst && inst.attributes ? Math.max(1, ...Object.values(inst.attributes).map((a) => ((json.accessors || [])[a] || {}).count || 1)) : 1;
    for (const pr of json.meshes[n.mesh].primitives || []) tris += primTriangles(json, pr) * copies;
  }
  stats.triangles = tris;
  if (tris > budget.triangles) errors.push(`${tris} triangles, over the ${desktop ? 'desktop' : 'phone'} budget of ${budget.triangles}`);
  if (length > budget.fileBytes) errors.push(`${(length / 1048576).toFixed(1)} MB, over the ${desktop ? 'desktop' : 'phone'} budget of ${budget.fileBytes / 1048576} MB`);
  let maxPx = 0;
  for (const [i, im] of (json.images || []).entries()) {
    if (im.mimeType === 'image/ktx2') { errors.push(`image ${i} is KTX2: ${UNDECODABLE.KHR_texture_basisu}`); continue; }
    if (im.bufferView == null || !bin) { warnings.push(`image ${i} is not embedded in the .glb`); continue; }
    const bv = (json.bufferViews || [])[im.bufferView] || {};
    const size = imageSize(bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + (bv.byteLength || 0)));
    if (!size) { warnings.push(`image ${i} has a header this check cannot read`); continue; }
    maxPx = Math.max(maxPx, size.w, size.h);
  }
  stats.maxTexturePx = maxPx;
  if (maxPx > budget.maxTexturePx) errors.push(`a ${maxPx} px texture, over the ${desktop ? 'desktop' : 'phone'} budget of ${budget.maxTexturePx}`);
  return { errors, warnings, stats };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2), file = args.find((a) => !a.startsWith('--'));
  if (!file) { console.error('usage: node scripts/club-shape-model/check-venue.mjs <venue.glb> [--desktop]'); process.exit(2); }
  const r = checkVenue(readFileSync(file), { desktop: args.includes('--desktop') });
  console.log(JSON.stringify(r.stats));
  for (const w of r.warnings) console.log('warning:', w);
  for (const e of r.errors) console.log('ERROR:', e);
  console.log(r.errors.length ? `check-venue: ${r.errors.length} error(s)` : 'check-venue: ok');
  process.exit(r.errors.length ? 1 : 0);
}
