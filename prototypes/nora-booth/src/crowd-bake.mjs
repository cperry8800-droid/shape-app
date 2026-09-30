// Bake Nora's VRM into instanceable crowd figures — the crowd is made of the SAME avatar design
// as the DJ, not stick figures.
//
// A relaxed standing pose (arms hanging, slight knee give, looking up at the stage) and a seated
// one are skinned on the CPU, then simplified by quadric-error edge collapse
// (src/meshDecimate.mjs) into three levels of detail:
//   near  the front of the floor (≈2.4 k body triangles; the head and hands are weighted so the
//         face and fingers keep their shape)
//   far   the back of the floor
//   tiny  the balconies, the lounges and anything past ≈15 m (≈300 triangles)
// plus `seat`, the seated pose at the tiny budget for the booths and the lounge tables. The seated
// pose only moves the legs and the forearms, so the head is where the standing figure's head is
// and the seated body wears the standing hair (header.hairOf).
//
// Every vertex carries a part tag (top / bottoms / shoes / skin / hair / eye white) so each figure
// wears its own outfit, skin tone and hair colour, and the arms carry a per-vertex weight so the
// crowd shader can raise them on the drop (a rotation about the shoulder pivot). The layered eye
// meshes (iris, eyeline, brow, highlight) are NOT baked: decimated they melt into dark blotches.
// The bake measures where they are instead (header.face) and the crowd shader draws a small iris
// in an eye white, a lid line and a brow at that spot, crisp at any level of detail.
//
// Hair is baked in three lengths (long as modelled, a bob, a crop) so the room is not 700 copies
// of one person.
//
// Runs in a browser (Playwright): window.__bake resolves to a base64 string of the packed
// binary that src/crowdAvatars.mjs decodes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { weld, decimate, splitByPart } from './meshDecimate.mjs';

const q = new URLSearchParams(location.search);
const HEIGHT = 1.68;                       // metres, like the performer
const CUT = { long: -1, medium: 1.31, short: 1.43 };   // drop hair triangles with a vertex below y (pre-scale)
// Triangle budgets. `head`/`hands` weight those regions' surface error, so a collapse there costs more.
const LODS = [
  { name: 'near', body: 2350, hair: { long: 1550, medium: 1080, short: 720 }, head: 4, hands: 2 },
  { name: 'far', body: 700, hair: { long: 250, medium: 180, short: 115 }, head: 2, hands: 1.2 },
  { name: 'tiny', body: 300, hair: { long: 64, medium: 46, short: 32 }, head: 1.5, hands: 0.8 },
];
const SEAT = { name: 'seat', body: 360, head: 1.5, hands: 0.8, hairOf: 'tiny' };
export const PART = { TOP: 0, SKIN: 1, HAIR: 2, EYE: 3, WHITE: 4, BOTTOM: 5, SHOES: 6 };

const loader = new GLTFLoader();
loader.register((p) => new VRMLoaderPlugin(p));

window.__bake = new Promise((resolve, reject) => {
  loader.load(q.get('vrm') || 'nora.vrm', (gltf) => {
    try { resolve(q.get('diag') ? diag(gltf.userData.vrm) : bake(gltf.userData.vrm)); } catch (e) { reject(e); }
  }, undefined, reject);
});

function standPose(b) {
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
}
// Seated: thighs forward, shins hanging, hands resting on the thighs. The spine, neck and head keep
// the standing rotation so the standing hair fits the seated body.
function seatPose(b) {
  standPose(b);
  for (const side of ['left', 'right']) {
    const sgn = side === 'left' ? 1 : -1;
    b(side + 'UpperLeg').rotation.set(-1.5, 0, sgn * 0.06);
    b(side + 'LowerLeg').rotation.set(1.42, 0, 0);
    b(side + 'Foot').rotation.set(0.05, 0, 0);
  }
  // upper arms a little forward, forearms along the thighs
  b('leftUpperArm').rotation.set(-0.28, 0, -1.22);
  b('rightUpperArm').rotation.set(-0.28, 0, 1.22);
  b('leftLowerArm').rotation.set(0, -1.05, 0);
  b('rightLowerArm').rotation.set(0, 1.05, 0);
}

function bake(vrm) {
  VRMUtils.removeUnnecessaryVertices(vrm.scene);
  VRMUtils.combineSkeletons(vrm.scene);
  const b = (n) => vrm.humanoid.getNormalizedBoneNode(n);
  // vrm.update() runs the humanoid AND the node constraints: the sleeves hang off J_Aim_*
  // (aim) bones and the upper-arm skin off J_Roll_* (roll) bones, and humanoid.update() alone
  // leaves both where the T-pose put them — that is what gave the first bake wings and shards.
  const settle = () => { for (let i = 0; i < 2; i++) { vrm.update(0); vrm.scene.updateMatrixWorld(true); } };
  standPose(b);
  settle();

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
  const seatBoneRe = /^J_(Bip_C_Hips|Bip_[LR]_UpperLeg|Roll_[LR]_UpperLeg|Sec_.*(Bottoms|Skirt))/;
  const pivot = {};
  for (const s of ['L', 'R']) { const v = new THREE.Vector3(); b(s === 'L' ? 'leftUpperArm' : 'rightUpperArm').getWorldPosition(v); pivot[s] = v.multiplyScalar(scale).toArray(); }

  const partOf = (matName) => {
    if (/\(Outline\)/.test(matName)) return -1; // MToon's inverted-hull pass: the same triangles again
    if (/Tops.*CLOTH/.test(matName)) return PART.TOP;
    if (/Bottoms.*CLOTH/.test(matName)) return PART.BOTTOM;
    if (/Shoes.*CLOTH/.test(matName)) return PART.SHOES;
    if (/CLOTH/.test(matName)) return PART.TOP;
    if (/HAIR/.test(matName)) return PART.HAIR;
    if (/EyeWhite/.test(matName)) return PART.WHITE;  // fills the eye opening; the shader paints the eye on it
    if (/SKIN/.test(matName)) return PART.SKIN;
    return -1; // iris, eyeline, brow, highlight, mouth interior: measured, not baked
  };
  const featureOf = (matName) => (/\(Outline\)/.test(matName) ? null
    : /EyeIris/.test(matName) ? 'iris' : /EyeWhite/.test(matName) ? 'white' : /Eyeline/.test(matName) ? 'line' : /Brow/.test(matName) ? 'brow' : null);

  // ── gather skinned triangles from every mesh, tagged by part ──────────────────────────
  // Returns { body: [tri], hair: [tri], features: {iris|white|line|brow: [[x,y,z]…]}, seatY }
  function gather(withFeatures) {
    const out = { body: [], hair: [], features: { iris: [], white: [], line: [], brow: [] }, seatY: Infinity, sleeveX: 0 };
    const v = new THREE.Vector3();
    // the sleeve's bind-pose reach along the arm: skin inside it is never visible
    vrm.scene.traverse((mesh) => {
      if (!mesh.isSkinnedMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (!mats.some((m) => m && /Tops.*CLOTH/.test(m.name) && !/Outline/.test(m.name))) return;
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 1.2) out.sleeveX = Math.max(out.sleeveX, Math.abs(p.getX(i)));
    });
    vrm.scene.traverse((mesh) => {
      if (!mesh.isSkinnedMesh) return;
      const geo = mesh.geometry;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.index ? geo.index.count : geo.attributes.position.count, materialIndex: 0 }];
      const idx = geo.index;
      const bones = mesh.skeleton.bones;
      const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
      const bindP = geo.attributes.position;
      const nv = bindP.count;
      const P = new Float32Array(nv * 3);
      const W = new Float32Array(nv * 2);
      const S = new Float32Array(nv);          // weight on the hips/thighs (the seated contact)
      mesh.skeleton.update();
      for (let i = 0; i < nv; i++) {
        v.fromBufferAttribute(bindP, i);
        mesh.applyBoneTransform(i, v);
        v.applyMatrix4(mesh.matrixWorld).multiplyScalar(scale);
        P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
        let wl = 0, wr = 0, ws = 0;
        for (let k = 0; k < 4; k++) {
          const w = sw.getComponent(i, k); if (!w) continue;
          const name = bones[si.getComponent(i, k)].name;
          if (armRe.L.test(name)) wl += w; else if (armRe.R.test(name)) wr += w;
          else if (aimShoulderRe.L.test(name)) wl += w * 0.6; else if (aimShoulderRe.R.test(name)) wr += w * 0.6;
          else if (shoulderRe.L.test(name)) wl += w * 0.35; else if (shoulderRe.R.test(name)) wr += w * 0.35;
          if (seatBoneRe.test(name)) ws += w;
        }
        W[i * 2] = wl; W[i * 2 + 1] = wr; S[i] = ws;
      }
      for (const g of groups) {
        const mat = mats[g.materialIndex] || mats[0];
        const name = (mat && mat.name) || '';
        if (withFeatures) {
          const feat = featureOf(name);
          if (feat) for (let t = g.start; t < g.start + g.count; t++) { const id = idx ? idx.getX(t) : t; out.features[feat].push([P[id * 3], P[id * 3 + 1], P[id * 3 + 2]]); }
        }
        const part = partOf(name);
        if (part < 0) continue;
        const bucket = part === PART.HAIR ? out.hair : out.body;
        for (let t = g.start; t < g.start + g.count; t += 3) {
          const ids = [0, 1, 2].map((k) => (idx ? idx.getX(t + k) : t + k));
          const tri = { part, p: [], arm: [] };
          let covered = part === PART.SKIN;
          for (const id of ids) {
            let x = P[id * 3], y = P[id * 3 + 1], z = P[id * 3 + 2];
            const aw = Math.max(W[id * 2], W[id * 2 + 1]);
            const bx = Math.abs(bindP.getX(id)), by = bindP.getY(id);
            // Skin under the top (front neckline 1.305, hem 0.83) and the shorts (waist 1.00, hem
            // 0.70) is never visible: it is dropped rather than tucked, or a coarse surface shows
            // a warm patch of body through the shirt. So is the upper arm inside the sleeve (bind
            // pose: along x, inside the sleeve's reach) and the foot inside the shoe. What is left
            // at the shoulders under the collar is tucked inward.
            // (bind-pose coordinates, so the seated pose's horizontal thighs are judged as legs)
            const underTop = aw < 0.3 && by > 0.715 && by < 1.295 && bx < 0.20;
            const underSleeve = aw >= 0.3 && by > 1.2 && bx < out.sleeveX - 0.015;
            const inShoe = by < 0.092;
            if (!(part === PART.SKIN && (underTop || underSleeve || inShoe))) covered = false;
            if (part === PART.SKIN && aw < 0.3 && by >= 1.295 && by < 1.345 && bx < 0.21 && bx > 0.06) { x *= 0.9; z *= 0.9; }
            tri.p.push([x, y, z]);
            tri.arm.push([W[id * 2], W[id * 2 + 1]]);
            if (S[id] > 0.5 && part !== PART.HAIR) out.seatY = Math.min(out.seatY, y);
          }
          if (covered) continue;
          bucket.push(tri);
        }
      }
    });
    return out;
  }

  const stand = gather(true);
  // ── the face: where the eyes, lids and brows are (the crowd shader draws them) ─────────
  const face = measureFace(stand.features, b, scale);

  seatPose(b);
  settle();
  const seated = gather(false);
  const headNow = new THREE.Vector3(); b('head').getWorldPosition(headNow);
  const headShift = headNow.y * scale - hp.y * scale;

  // ── simplify ────────────────────────────────────────────────────────────────────────────
  // tri list → welded mesh; attributes = arm weights
  function meshOf(list) {
    const soup = new Float64Array(list.length * 9);
    const arm = new Float32Array(list.length * 6);
    const fpart = new Uint8Array(list.length);
    list.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        soup[i * 9 + k * 3] = t.p[k][0]; soup[i * 9 + k * 3 + 1] = t.p[k][1]; soup[i * 9 + k * 3 + 2] = t.p[k][2];
        arm[i * 6 + k * 2] = t.arm[k][0]; arm[i * 6 + k * 2 + 1] = t.arm[k][1];
      }
      fpart[i] = t.part;
    });
    const { pos, remap } = weld(soup, 2e-4);
    const nv = pos.length / 3;
    const attr = new Float32Array(nv * 2), cnt = new Float32Array(nv);
    for (let i = 0; i < remap.length; i++) { const v = remap[i]; attr[v * 2] += arm[i * 2]; attr[v * 2 + 1] += arm[i * 2 + 1]; cnt[v]++; }
    for (let v = 0; v < nv; v++) if (cnt[v]) { attr[v * 2] /= cnt[v]; attr[v * 2 + 1] /= cnt[v]; }
    return { pos, faces: Int32Array.from(remap), fpart, attr };
  }
  function weights(m, lod) {
    const nv = m.pos.length / 3, w = new Float32Array(nv).fill(1);
    for (let v = 0; v < nv; v++) {
      const y = m.pos[v * 3 + 1];
      if (y > 1.36 * scale) w[v] = lod.head;                                   // head and face
      else if (Math.max(m.attr[v * 2], m.attr[v * 2 + 1]) > 0.5 && y < 0.95 * scale) w[v] = lod.hands; // hands
    }
    return w;
  }
  function simplify(m, target, lod, isHair) {
    const w = isHair ? null : weights(m, lod);
    const d = decimate({ pos: m.pos, faces: m.faces, fpart: m.fpart, attr: m.attr, attrSize: 2, target, weight: w, boundaryWeight: isHair ? 20 : 60 });
    const s = splitByPart(d);
    if (s.nv > 65535) throw new Error('bake: too many vertices for Uint16 (' + s.nv + ')');
    return { nv: s.nv, ni: s.ni, pos: s.pos, nrm: s.nrm, part: s.part, arm: s.attr, index: Uint16Array.from(s.index), from: d.stats.from };
  }

  const bodyMesh = meshOf(stand.body);
  const seatMesh = meshOf(seated.body);
  const hairMeshes = {};
  for (const [cutName, cutY] of Object.entries(CUT)) {
    const kept = cutY < 0 ? stand.hair : stand.hair.filter((t) => t.p.every((p) => p[1] >= cutY * scale));
    hairMeshes[cutName] = meshOf(kept);
  }
  const geos = [];
  const src = {};
  for (const lod of LODS) {
    const g = simplify(bodyMesh, lod.body, lod, false);
    geos.push({ name: `body:${lod.name}`, ...g }); src[`body:${lod.name}`] = g.from;
    for (const cutName of Object.keys(CUT)) {
      const h = simplify(hairMeshes[cutName], lod.hair[cutName], lod, true);
      geos.push({ name: `hair:${cutName}:${lod.name}`, ...h }); src[`hair:${cutName}:${lod.name}`] = h.from;
    }
  }
  {
    const g = simplify(seatMesh, SEAT.body, SEAT, false);
    geos.push({ name: `body:${SEAT.name}`, ...g }); src[`body:${SEAT.name}`] = g.from;
  }

  // ── pack: JSON header (length-prefixed) + per-geometry blocks, 4-byte aligned ──────────
  const header = {
    v: 2, height: HEIGHT, pivot, parts: PART,
    lods: LODS.map((l) => l.name).concat(SEAT.name),
    hairOf: { [SEAT.name]: SEAT.hairOf },
    // the seated body sits with the underside of its thighs at seatY above the figure's origin:
    // place it at (seat top − seatY). headShift is how far the head moved between the poses (≈ 0).
    seat: { name: SEAT.name, seatY: +seated.seatY.toFixed(4), headShift: +headShift.toFixed(4) },
    face,
    geos: geos.map((g) => ({ name: g.name, nv: g.nv, ni: g.ni })),
  };
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
    const a8 = new Uint8Array(buf, o, g.nv * 2); for (let i = 0; i < g.nv * 2; i++) a8[i] = Math.round(Math.min(1, Math.max(0, g.arm[i])) * 255); o = align(o + g.nv * 2);
    const i16 = new Uint16Array(buf, o, g.ni); i16.set(g.index); o = align(o + g.ni * 2);
  }
  let s = ''; const bytes = u8; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  window.__bakeStats = header.geos.map((g) => `${g.name}: ${g.nv} verts / ${g.ni / 3} tris (from ${src[g.name]})`).join('\n')
    + `\npivot ${JSON.stringify(pivot)} · seat ${JSON.stringify(header.seat)} · sleeveX ${stand.sleeveX.toFixed(3)}\nface ${JSON.stringify(face)}\n${total} bytes`;
  return btoa(s);
}

// Where the eyes are, measured from the (unbaked) iris / eye white / eyeline / brow meshes: per
// side the iris centre and the eye opening's half-width and half-height in the head's frame, the
// brow's height, and the head's forward and up axes. Units: metres in the baked frame.
function measureFace(F, b, scale) {
  const head = b('head');
  const m = new THREE.Matrix4().copy(head.matrixWorld);
  const fwd = new THREE.Vector3(0, 0, 1).transformDirection(m).normalize();
  const up = new THREE.Vector3(0, 1, 0).transformDirection(m).normalize();
  // the face is where the iris is: if the iris sits behind the head centre, the model faces −z
  const hc = new THREE.Vector3().setFromMatrixPosition(m).multiplyScalar(scale);
  const cen = (list) => list.reduce((a, p) => [a[0] + p[0] / list.length, a[1] + p[1] / list.length, a[2] + p[2] / list.length], [0, 0, 0]);
  const irisC = F.iris.length ? cen(F.iris) : [0, hc.y + 0.05, hc.z + 0.1];
  if ((irisC[2] - hc.z) * fwd.z < 0) fwd.negate();
  const right = new THREE.Vector3().crossVectors(up, fwd).normalize();   // toward −x when facing +z (the figure's right)
  const side = (list, s) => list.filter((p) => Math.sign(p[0]) === s);
  const out = { fwd: fwd.toArray().map((x) => +x.toFixed(4)), up: up.toArray().map((x) => +x.toFixed(4)) };
  for (const [k, s] of [['L', 1], ['R', -1]]) {
    const iris = side(F.iris, s), white = side(F.white, s), line = side(F.line, s), brow = side(F.brow, s);
    const c = iris.length ? cen(iris) : [s * 0.03, irisC[1], irisC[2]];
    const proj = (list) => {
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const p of list) {
        const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
        const u = d[0] * right.x + d[1] * right.y + d[2] * right.z, v = d[0] * up.x + d[1] * up.y + d[2] * up.z;
        u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
      }
      return list.length ? [u0, u1, v0, v1].map((x) => +x.toFixed(4)) : null;
    };
    out[k] = { c: c.map((x) => +x.toFixed(4)), iris: proj(iris), white: proj(white), line: proj(line), brow: proj(brow) };
  }
  return out;
}

// ?diag=1 — what the model is made of: material names, the bones the sleeves are skinned to,
// and the clothing's vertical extents, so the bake's thresholds come from the mesh, not a guess.
function diag(vrm) {
  VRMUtils.removeUnnecessaryVertices(vrm.scene);
  VRMUtils.combineSkeletons(vrm.scene);
  const bones = []; vrm.scene.traverse((o) => { if (o.isBone) bones.push(o.name + ' < ' + (o.parent && o.parent.name)); });
  const mats = new Map();
  const sides = {};
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
      sides[name] = m && m.side;
      const ext = extents[name] || (extents[name] = { minY: 1e9, maxY: -1e9, maxX: 0, minZ: 1e9, maxZ: -1e9, frontNeck: -1e9, legMin: 1e9 });
      for (let t = g.start; t < g.start + g.count; t++) {
        const id = idx ? idx.getX(t) : t;
        v.fromBufferAttribute(geo.attributes.position, id); mesh.applyBoneTransform(id, v); v.applyMatrix4(mesh.matrixWorld);
        ext.minY = Math.min(ext.minY, v.y); ext.maxY = Math.max(ext.maxY, v.y); ext.maxX = Math.max(ext.maxX, Math.abs(v.x));
        ext.minZ = Math.min(ext.minZ, v.z); ext.maxZ = Math.max(ext.maxZ, v.z);
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
  return JSON.stringify({ meta: vrm.meta && vrm.meta.metaVersion, bones: bones.filter((b) => /Sec|Tops|Sleeve|Shoulder|Arm|Hand|Elbow|Hips|UpperLeg/.test(b)), mats: [...mats.entries()], sides, wing, forearm, extents }, null, 1);
}
