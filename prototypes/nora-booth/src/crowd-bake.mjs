// Bake Nora's VRM into instanceable crowd figures — the crowd is made of the SAME avatar design
// as the DJ, not stick figures.
//
// One relaxed standing pose (arms hanging, slight knee give, looking up at the stage) is skinned
// on the CPU, then decimated by vertex clustering into a near and a far level of detail. The
// arms carry a per-vertex weight so the crowd shader can raise them on the drop (a rotation
// about the shoulder pivot), and every vertex carries a part tag (cloth / skin / hair / eye) so
// each figure can wear its own outfit, skin tone and hair colour. Hair is baked separately in
// three lengths (long as modelled, a bob, a crop) so the room is not 700 copies of one person.
//
// Runs in a browser (Playwright): window.__bake resolves to a base64 string of the packed
// binary that src/crowdAvatars.mjs decodes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const q = new URLSearchParams(location.search);
const HEIGHT = 1.68;                       // metres, like the performer
const CUT = { long: -1, medium: 1.31, short: 1.43 };   // drop hair triangles with a vertex below y (pre-scale)
// cell sizes (m): torso/legs · arms and hands (thin: a coarse cell turns them into ribbons) · head
const LODS = [{ name: 'near', g: 0.05, gArm: 0.03, gHead: 0.026, hair: 1.55 }, { name: 'far', g: 0.10, gArm: 0.06, gHead: 0.05, hair: 1.7 }];
const PART = { CLOTH: 0, SKIN: 1, HAIR: 2, EYE: 3, WHITE: 4 };

const loader = new GLTFLoader();
loader.register((p) => new VRMLoaderPlugin(p));

window.__bake = new Promise((resolve, reject) => {
  loader.load(q.get('vrm') || 'nora.vrm', (gltf) => {
    try { resolve(q.get('diag') ? diag(gltf.userData.vrm) : bake(gltf.userData.vrm)); } catch (e) { reject(e); }
  }, undefined, reject);
});

function bake(vrm) {
  VRMUtils.removeUnnecessaryVertices(vrm.scene);
  VRMUtils.combineSkeletons(vrm.scene);
  const b = (n) => vrm.humanoid.getNormalizedBoneNode(n);

  // ── pose: relaxed, arms hanging with a soft elbow, looking a touch up at the stage ─────
  b('leftUpperArm').rotation.set(0.08, 0, -1.28);
  b('rightUpperArm').rotation.set(0.08, 0, 1.28);
  b('leftLowerArm').rotation.set(0, -0.42, 0);
  b('rightLowerArm').rotation.set(0, 0.42, 0);
  b('leftHand').rotation.set(0, 0, -0.12);
  b('rightHand').rotation.set(0, 0, 0.12);
  for (const side of ['left', 'right']) {
    const sgn = side === 'left' ? 1 : -1;
    for (const f of ['Index', 'Middle', 'Ring', 'Little']) {
      for (const seg of ['Proximal', 'Intermediate', 'Distal']) { const n = b(side + f + seg); if (n) n.rotation.set(0, 0, -sgn * 0.32); }
    }
    const th = b(side + 'ThumbProximal'); if (th) th.rotation.set(0, -sgn * 0.3, 0);
    b(side + 'UpperLeg').rotation.set(-0.05, 0, sgn * 0.03);
    b(side + 'LowerLeg').rotation.set(0.1, 0, 0);
    b(side + 'Foot').rotation.set(-0.05, 0, 0);
  }
  b('spine').rotation.set(-0.02, 0, 0);
  b('neck').rotation.set(-0.06, 0, 0);
  b('head').rotation.set(-0.10, 0, 0);
  // vrm.update() runs the humanoid AND the node constraints: the sleeves hang off J_Aim_*
  // (aim) bones and the upper-arm skin off J_Roll_* (roll) bones, and humanoid.update() alone
  // leaves both where the T-pose put them — that is what gave the first bake wings and shards.
  for (let i = 0; i < 2; i++) { vrm.update(0); vrm.scene.updateMatrixWorld(true); }

  // Native height → scale factor so the figures stand HEIGHT tall (applied in the bake).
  const hp = new THREE.Vector3(); b('head').getWorldPosition(hp);
  const scale = HEIGHT / (hp.y + 0.16);

  // Which raw bones move with each arm (the sleeves' spring bones included, or the sleeve stays).
  // Every bone that moves with the arm, roll bones included: the forearm skin is weighted mostly
  // to J_Roll_*_LowerArm / J_Roll_*_Hand, and leaving those out gave the raise a half-weighted
  // forearm that fanned into a sail. (J_Roll_*_UpperLeg exists too, hence the explicit list.)
  const armRe = { L: /^J_(Bip_L_(UpperArm|LowerArm|Hand|Thumb|Index|Middle|Ring|Little)|Roll_L_(UpperArm|Elbow|LowerArm|Hand)|Aim_L_TopsUpperArm|Sec_L_TopsUpperArm)/, R: /^J_(Bip_R_(UpperArm|LowerArm|Hand|Thumb|Index|Middle|Ring|Little)|Roll_R_(UpperArm|Elbow|LowerArm|Hand)|Aim_R_TopsUpperArm|Sec_R_TopsUpperArm)/ };
  const aimShoulderRe = { L: /^J_Aim_L_Shoulder/, R: /^J_Aim_R_Shoulder/ };
  const shoulderRe = { L: /^J_Bip_L_Shoulder/, R: /^J_Bip_R_Shoulder/ };
  const pivot = {};
  for (const s of ['L', 'R']) { const v = new THREE.Vector3(); b(s === 'L' ? 'leftUpperArm' : 'rightUpperArm').getWorldPosition(v); pivot[s] = v.multiplyScalar(scale).toArray(); }

  // ── gather skinned triangles from every mesh, tagged by part ──────────────────────────
  const tris = { body: [], hair: [] };  // each: { p:[x,y,z]×3, part, arm:[wL,wR]×3 }
  const v = new THREE.Vector3();
  const partOf = (matName) => {
    if (/\(Outline\)/.test(matName)) return -1; // MToon's inverted-hull pass: the same triangles again
    if (/CLOTH/.test(matName)) return PART.CLOTH;
    if (/HAIR/.test(matName)) return PART.HAIR;
    if (/EyeIris|Brow|Eyeline/.test(matName)) return PART.EYE;
    if (/EyeWhite/.test(matName)) return PART.WHITE;
    if (/SKIN/.test(matName)) return PART.SKIN;
    return -1; // mouth interior, eye highlights: dropped
  };
  vrm.scene.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const geo = mesh.geometry;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.index ? geo.index.count : geo.attributes.position.count, materialIndex: 0 }];
    const idx = geo.index;
    const bones = mesh.skeleton.bones;
    const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    const nv = geo.attributes.position.count;
    // skinned positions (mesh space → world → scaled), once per vertex
    const P = new Float32Array(nv * 3);
    const W = new Float32Array(nv * 2);
    mesh.skeleton.update();
    for (let i = 0; i < nv; i++) {
      v.fromBufferAttribute(geo.attributes.position, i);
      mesh.applyBoneTransform(i, v);
      v.applyMatrix4(mesh.matrixWorld).multiplyScalar(scale);
      P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
      let wl = 0, wr = 0;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k); if (!w) continue;
        const name = bones[si.getComponent(i, k)].name;
        if (armRe.L.test(name)) wl += w; else if (armRe.R.test(name)) wr += w;
        else if (aimShoulderRe.L.test(name)) wl += w * 0.6; else if (aimShoulderRe.R.test(name)) wr += w * 0.6;
        else if (shoulderRe.L.test(name)) wl += w * 0.35; else if (shoulderRe.R.test(name)) wr += w * 0.35;
      }
      W[i * 2] = wl; W[i * 2 + 1] = wr;
    }
    for (const g of groups) {
      const mat = mats[g.materialIndex] || mats[0];
      const part = partOf((mat && mat.name) || '');
      if (part < 0) continue;
      const bucket = part === PART.HAIR ? tris.hair : tris.body;
      for (let t = g.start; t < g.start + g.count; t += 3) {
        const ids = [0, 1, 2].map((k) => (idx ? idx.getX(t + k) : t + k));
        const tri = { part, p: [], arm: [] };
        let covered = part === PART.SKIN;
        for (const id of ids) {
          let x = P[id * 3], y = P[id * 3 + 1], z = P[id * 3 + 2];
          const aw = Math.max(W[id * 2], W[id * 2 + 1]);
          // Skin under the top (front neckline 1.305, hem 0.83) and the shorts (waist 1.00, hem
          // 0.70) is never visible: it is dropped rather than tucked, or a cell shared with the
          // cloth shell shows a warm patch of body through the shirt. The arms (weighted) and
          // the neck (above the neckline) stay. What is left at the shoulders under the collar
          // is tucked inward.
          if (!(part === PART.SKIN && aw < 0.3 && y > 0.715 * scale && y < 1.295 * scale && Math.abs(x) < 0.20 * scale)) covered = false;
          if (part === PART.SKIN && aw < 0.3 && y >= 1.295 * scale && y < 1.345 * scale && Math.abs(x) < 0.21 * scale && Math.abs(x) > 0.06 * scale) { x *= 0.9; z *= 0.9; }
          tri.p.push([x, y, z]);
          tri.arm.push([W[id * 2], W[id * 2 + 1]]);
        }
        if (covered) continue;
        bucket.push(tri);
      }
    }
  });

  // ── vertex clustering ──────────────────────────────────────────────────────────────────
  const PRIO = { [PART.EYE]: 3.0, [PART.WHITE]: 2.5, [PART.CLOTH]: 2.0, [PART.HAIR]: 1.5, [PART.SKIN]: 1.0 };
  function cluster(list, g, gArm, gHead) {
    const cells = new Map();
    const keyOf = (p, arm) => {
      const gg = Math.max(arm[0], arm[1]) > 0.5 ? gArm : (p[1] > 1.30 * scale ? gHead : g);
      return `${Math.floor(p[0] / gg)},${Math.floor(p[1] / gg)},${Math.floor(p[2] / gg)},${gg}`;
    };
    const cellFor = (p, part, arm) => {
      const k = keyOf(p, arm);
      let c = cells.get(k);
      if (!c) { c = { id: cells.size, sum: [0, 0, 0], n: 0, parts: {}, arm: [0, 0], nrm: [0, 0, 0] }; cells.set(k, c); }
      c.sum[0] += p[0]; c.sum[1] += p[1]; c.sum[2] += p[2]; c.n++;
      c.parts[part] = (c.parts[part] || 0) + PRIO[part];
      c.arm[0] += arm[0]; c.arm[1] += arm[1];
      return c;
    };
    const faces = [];
    const seen = new Set();
    for (const t of list) {
      const cs = t.p.map((p, i) => cellFor(p, t.part, t.arm[i]));
      const a = cs[0].id, b2 = cs[1].id, c2 = cs[2].id;
      if (a === b2 || b2 === c2 || a === c2) continue;
      const key = [a, b2, c2].sort((x, y) => x - y).join(',');
      if (seen.has(key)) continue; seen.add(key);
      faces.push([a, b2, c2]);
      // face normal, accumulated (area-weighted) onto the three cells
      const [p0, p1, p2] = t.p;
      const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
      for (const c of cs) { c.nrm[0] += nx; c.nrm[1] += ny; c.nrm[2] += nz; }
    }
    const verts = Array.from(cells.values());
    const nv = verts.length;
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), part = new Uint8Array(nv), arm = new Float32Array(nv * 2);
    verts.forEach((c) => {
      const i = c.id;
      pos[i * 3] = c.sum[0] / c.n; pos[i * 3 + 1] = c.sum[1] / c.n; pos[i * 3 + 2] = c.sum[2] / c.n;
      const len = Math.hypot(c.nrm[0], c.nrm[1], c.nrm[2]) || 1;
      nrm[i * 3] = c.nrm[0] / len; nrm[i * 3 + 1] = c.nrm[1] / len; nrm[i * 3 + 2] = c.nrm[2] / len;
      let best = PART.SKIN, bs = -1;
      for (const k of Object.keys(c.parts)) if (c.parts[k] > bs) { bs = c.parts[k]; best = +k; }
      part[i] = best;
      arm[i * 2] = Math.min(1, c.arm[0] / c.n); arm[i * 2 + 1] = Math.min(1, c.arm[1] / c.n);
    });
    const index = new Uint16Array(faces.length * 3);
    faces.forEach((f, i) => { index[i * 3] = f[0]; index[i * 3 + 1] = f[1]; index[i * 3 + 2] = f[2]; });
    if (nv > 65535) throw new Error('cluster: too many vertices for Uint16 (' + nv + ')');
    return { nv, ni: index.length, pos, nrm, part, arm, index };
  }

  const geos = [];
  for (const lod of LODS) {
    geos.push({ name: `body:${lod.name}`, ...cluster(tris.body, lod.g, lod.gArm, lod.gHead) });
    for (const [cutName, cutY] of Object.entries(CUT)) {
      const kept = cutY < 0 ? tris.hair : tris.hair.filter((t) => t.p.every((p) => p[1] >= cutY * scale));
      geos.push({ name: `hair:${cutName}:${lod.name}`, ...cluster(kept, lod.g, lod.gArm, lod.gHead * lod.hair) });
    }
  }

  // ── pack: JSON header (length-prefixed) + per-geometry blocks, 4-byte aligned ──────────
  const header = { v: 1, height: HEIGHT, pivot, parts: PART, geos: geos.map((g) => ({ name: g.name, nv: g.nv, ni: g.ni })) };
  const head = new TextEncoder().encode(JSON.stringify(header));
  const align = (n) => (n + 3) & ~3;
  let total = 4 + align(head.length);
  for (const g of geos) total += align(g.nv * 6) + align(g.nv * 3) + align(g.nv) + align(g.nv * 2) + align(g.ni * 2);
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf); const u8 = new Uint8Array(buf);
  let o = 0;
  dv.setUint32(0, head.length, true); o = 4; u8.set(head, o); o = align(o + head.length);
  for (const g of geos) {
    const p16 = new Int16Array(buf, o, g.nv * 3); for (let i = 0; i < g.nv * 3; i++) p16[i] = Math.round(g.pos[i] * 1000); o = align(o + g.nv * 6);
    const n8 = new Int8Array(buf, o, g.nv * 3); for (let i = 0; i < g.nv * 3; i++) n8[i] = Math.round(g.nrm[i] * 127); o = align(o + g.nv * 3);
    u8.set(g.part, o); o = align(o + g.nv);
    const a8 = new Uint8Array(buf, o, g.nv * 2); for (let i = 0; i < g.nv * 2; i++) a8[i] = Math.round(g.arm[i] * 255); o = align(o + g.nv * 2);
    const i16 = new Uint16Array(buf, o, g.ni); i16.set(g.index); o = align(o + g.ni * 2);
  }
  let s = ''; const bytes = u8; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  window.__bakeStats = header.geos.map((g) => `${g.name}: ${g.nv} verts / ${g.ni / 3} tris`).join('\n') + `\npivot ${JSON.stringify(pivot)} · ${total} bytes`;
  return btoa(s);
}

// ?diag=1 — what the model is made of: material names, the bones the sleeves are skinned to,
// and the clothing's vertical extents, so the bake's thresholds come from the mesh, not a guess.
function diag(vrm) {
  VRMUtils.removeUnnecessaryVertices(vrm.scene);
  VRMUtils.combineSkeletons(vrm.scene);
  const bones = []; vrm.scene.traverse((o) => { if (o.isBone) bones.push(o.name + ' < ' + (o.parent && o.parent.name)); });
  const mats = new Map();
  const v = new THREE.Vector3();
  const wing = {};
  const forearm = {}; // skin vertices on the hanging forearm/hand: which bones own them?
  const extents = {};
  vrm.scene.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const geo = mesh.geometry;
    const ms = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.index ? geo.index.count : geo.attributes.position.count, materialIndex: 0 }];
    const idx = geo.index, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    for (const g of groups) {
      const m = ms[g.materialIndex] || ms[0]; const name = (m && m.name) || '?';
      mats.set(name, (mats.get(name) || 0) + g.count / 3);
      const ext = extents[name] || (extents[name] = { minY: 1e9, maxY: -1e9, maxX: 0, frontNeck: -1e9, legMin: 1e9 });
      for (let t = g.start; t < g.start + g.count; t++) {
        const id = idx ? idx.getX(t) : t;
        v.fromBufferAttribute(geo.attributes.position, id); mesh.applyBoneTransform(id, v); v.applyMatrix4(mesh.matrixWorld);
        ext.minY = Math.min(ext.minY, v.y); ext.maxY = Math.max(ext.maxY, v.y); ext.maxX = Math.max(ext.maxX, Math.abs(v.x));
        if (Math.abs(v.x) < 0.03 && v.z > 0.02) ext.frontNeck = Math.max(ext.frontNeck, v.y);
        if (Math.abs(v.x) < 0.15 && v.y < 1.0) ext.legMin = Math.min(ext.legMin, v.y);
        if (/Body_00_SKIN$/.test(name) && Math.abs(v.x) > 0.12 && v.y > 0.72 && v.y < 1.12) {
          for (let k = 0; k < 4; k++) { const w = sw.getComponent(id, k); if (w > 0.02) { const bn = mesh.skeleton.bones[si.getComponent(id, k)].name; forearm[bn] = (forearm[bn] || 0) + w; } }
        }
        // shoulder-height cloth far out on X: which bones own it?
        if (/CLOTH/.test(name) && Math.abs(v.x) > 0.22 && v.y > 1.2) {
          for (let k = 0; k < 4; k++) { const w = sw.getComponent(id, k); if (w > 0.05) { const bn = mesh.skeleton.bones[si.getComponent(id, k)].name; wing[bn] = (wing[bn] || 0) + w; } }
        }
      }
    }
  });
  return JSON.stringify({ bones: bones.filter((b) => /Sec|Tops|Sleeve|Shoulder|Arm|Hand|Elbow/.test(b)), mats: [...mats.entries()], wing, forearm, extents }, null, 1);
}
