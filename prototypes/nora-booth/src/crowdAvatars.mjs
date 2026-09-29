// The crowd, made of Nora's own avatar design.
//
// src/crowd-bake.mjs skins the DJ's VRM into a relaxed standing pose and decimates it into a
// near and a far figure, plus hair in three lengths. This module decodes that pack and draws
// hundreds of them as instances: one body mesh per level of detail, one hair mesh per
// (length, level). Every figure gets its own outfit colour, skin tone and hair colour through
// instanced attributes, and its arms raise on the drop in the vertex shader (a rotation about
// the baked shoulder pivot, weighted per vertex), so a raise is smooth instead of a swap of
// meshes.
//
// Framework-agnostic: three is passed in; no DOM at import; no Math.random (the caller's seeded
// rnd decides who wears what).

/** Fetch + decode the packed bake. Resolves to { header, geos: { [name]: {pos,nrm,part,arm,index} } }. */
export async function loadCrowdPack(url, fetchImpl = fetch) {
  const r = await fetchImpl(url);
  if (!r.ok) throw new Error('crowd pack: HTTP ' + r.status);
  return decodeCrowdPack(await r.text());
}

export function decodeCrowdPack(b64) {
  const bin = atob(b64.replace(/\s+/g, ''));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const buf = u8.buffer;
  const dv = new DataView(buf);
  const align = (n) => (n + 3) & ~3;
  const hl = dv.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  let o = align(4 + hl);
  const geos = {};
  for (const g of header.geos) {
    const pos = new Int16Array(buf, o, g.nv * 3); o = align(o + g.nv * 6);
    const nrm = new Int8Array(buf, o, g.nv * 3); o = align(o + g.nv * 3);
    const part = new Uint8Array(buf, o, g.nv); o = align(o + g.nv);
    const arm = new Uint8Array(buf, o, g.nv * 2); o = align(o + g.nv * 2);
    const index = new Uint16Array(buf, o, g.ni); o = align(o + g.ni * 2);
    geos[g.name] = { nv: g.nv, ni: g.ni, pos, nrm, part, arm, index };
  }
  return { header, geos };
}

const HAIR = ['long', 'medium', 'short'];
// Dark club outfits (linear-ish RGB, kept low so the rim light still defines the silhouette).
const OUTFITS = [[0.012, 0.012, 0.014], [0.015, 0.014, 0.013], [0.02, 0.02, 0.028], [0.03, 0.012, 0.012], [0.02, 0.028, 0.02], [0.05, 0.05, 0.055], [0.03, 0.025, 0.02], [0.018, 0.018, 0.02]];
const HAIRS = [[0.03, 0.02, 0.014], [0.05, 0.03, 0.018], [0.09, 0.05, 0.028], [0.13, 0.08, 0.04], [0.02, 0.018, 0.016], [0.22, 0.14, 0.06], [0.16, 0.06, 0.03]];

/**
 * @param {object} o
 * @param {typeof import('three')} o.THREE
 * @param {object} o.pack       from loadCrowdPack
 * @param {Array}  o.people     the club's people (x, z, yaw, lod, idx, s, w …); this module adds hair/outfit/skin
 * @param {number[]} o.lodCount people per level of detail
 * @param {() => number} o.rnd  seeded
 */
export function createAvatarCrowd({ THREE, pack, people, lodCount, rnd }) {
  const group = new THREE.Group();
  group.name = 'crowdAvatars';
  const disposables = [];
  const own = (x) => { disposables.push(x); return x; };
  const { header, geos } = pack;

  // ── who wears what ─────────────────────────────────────────────────────────────────────
  const hairCount = [[0, 0, 0], [0, 0, 0]];
  for (const p of people) {
    const r = rnd();
    if (!Number.isInteger(p.hair)) p.hair = r < 0.42 ? 0 : r < 0.72 ? 1 : 2; // a caller may pre-assign (the line-up page does)
    p.hidx = hairCount[p.lod][p.hair]++;
    p.outfit = OUTFITS[Math.floor(rnd() * OUTFITS.length)];
    p.skin = Math.pow(rnd(), 0.8);            // 0 light → 1 deep
    p.hairC = HAIRS[Math.floor(rnd() * HAIRS.length)];
  }

  // ── material: parts tint + arm raise + the stage rim ───────────────────────────────────
  const uni = {
    uRim: { value: new THREE.Color(0, 0, 0) }, uFill: { value: new THREE.Color(0, 0, 0) },
    uPivotL: { value: new THREE.Vector3().fromArray(header.pivot.L) }, uPivotR: { value: new THREE.Vector3().fromArray(header.pivot.R) },
    uDebug: { value: 0 }, // 1: paint the arm weights (red = left, green = right) — the line-up page's ?w=1
  };
  const mat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.06 }));
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', [
        '#include <common>',
        'attribute float part; attribute vec2 armW;',
        'attribute vec2 iRaise; attribute vec3 iOutfit; attribute vec3 iHair; attribute float iSkin;',
        'uniform vec3 uPivotL; uniform vec3 uPivotR;',
        'varying float vPart; varying float vSkin; varying vec3 vOutfit; varying vec3 vHair; varying float vStageZ; varying vec2 vArmW;',
        'mat3 rotAA(vec3 a, float t) { float c = cos(t), s = sin(t), oc = 1.0 - c;',
        '  return mat3(oc*a.x*a.x + c, oc*a.x*a.y + a.z*s, oc*a.z*a.x - a.y*s,',
        '              oc*a.x*a.y - a.z*s, oc*a.y*a.y + c, oc*a.y*a.z + a.x*s,',
        '              oc*a.z*a.x + a.y*s, oc*a.y*a.z - a.x*s, oc*a.z*a.z + c); }',
        // the raise axes: forward-and-out for each arm, so a raised arm ends up-and-a-little-forward
        'const vec3 AXL = vec3(-0.7071, 0.0, 0.7071); const vec3 AXR = vec3(0.7071, 0.0, 0.7071);',
      ].join('\n'))
      .replace('#include <beginnormal_vertex>', [
        '#include <beginnormal_vertex>',
        // the weight scales the ANGLE, never the position: mixing rest and rotated positions
        // under a 150° raise drags every half-weighted shoulder vertex through the pivot and
        // the arm comes out as a blade
        'if (armW.x > 0.002) objectNormal = rotAA(AXL, iRaise.x * armW.x) * objectNormal;',
        'if (armW.y > 0.002) objectNormal = rotAA(AXR, iRaise.y * armW.y) * objectNormal;',
      ].join('\n'))
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'if (armW.x > 0.002) transformed = uPivotL + rotAA(AXL, iRaise.x * armW.x) * (transformed - uPivotL);',
        'if (armW.y > 0.002) transformed = uPivotR + rotAA(AXR, iRaise.y * armW.y) * (transformed - uPivotR);',
        'vPart = part; vSkin = iSkin; vOutfit = iOutfit; vHair = iHair; vArmW = armW;',
      ].join('\n'))
      .replace('#include <project_vertex>', '#include <project_vertex>\nvStageZ = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).z;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim; uniform vec3 uFill; uniform float uDebug;\nvarying float vPart; varying float vSkin; varying vec3 vOutfit; varying vec3 vHair; varying float vStageZ; varying vec2 vArmW;')
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        '{ vec3 skin = mix(vec3(0.62, 0.44, 0.34), vec3(0.16, 0.09, 0.06), vSkin);',
        '  vec3 col = vPart < 0.5 ? vOutfit : (vPart < 1.5 ? skin : (vPart < 2.5 ? vHair : (vPart < 3.5 ? vec3(0.05, 0.035, 0.03) : vec3(0.8, 0.77, 0.74))));',
        '  if (uDebug > 0.5) col = vec3(vArmW.x, vArmW.y, 0.15);',
        '  diffuseColor.rgb *= col; }',
      ].join('\n'))
      .replace('#include <emissivemap_fragment>', [
        '#include <emissivemap_fragment>',
        '{ float stageK = exp((vStageZ - 1.5) / 13.0);',
        '  float rimF = 1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);',
        '  vec3 toStage = normalize((viewMatrix * vec4(0.0, 0.35, 1.0, 0.0)).xyz);',
        '  float face = dot(normal, toStage);',
        '  float lit = 0.3 + 0.7 * smoothstep(-0.25, 0.6, face);',
        '  totalEmissiveRadiance += (uRim * pow(rimF, 4.0) * lit + uFill * max(face, 0.0) * max(face, 0.0)) * stageK; }',
      ].join('\n'));
  };
  mat.customProgramCacheKey = () => 'club-shape-avatar-crowd-v3';

  // ── geometries + instanced meshes ──────────────────────────────────────────────────────
  function geometryFor(name, cap) {
    const g = geos[name];
    const geo = own(new THREE.BufferGeometry());
    const pos = new Float32Array(g.nv * 3);
    for (let i = 0; i < pos.length; i++) pos[i] = g.pos[i] / 1000;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(g.nrm), 3, true));
    geo.setAttribute('part', new THREE.BufferAttribute(new Uint8Array(g.part), 1, false));
    geo.setAttribute('armW', new THREE.BufferAttribute(new Uint8Array(g.arm), 2, true));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(g.index), 1));
    const n = Math.max(1, cap);
    const mk = (size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); return a; };
    geo.setAttribute('iRaise', mk(2));
    geo.setAttribute('iOutfit', mk(3));
    geo.setAttribute('iHair', mk(3));
    geo.setAttribute('iSkin', mk(1));
    return geo;
  }
  const LOD = ['near', 'far'];
  const body = LOD.map((l, i) => {
    const m = new THREE.InstancedMesh(geometryFor(`body:${l}`, lodCount[i]), mat, Math.max(1, lodCount[i]));
    m.name = `crowdBody:${l}`; m.count = lodCount[i]; m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return m;
  });
  const hair = LOD.map((l, i) => HAIR.map((h, k) => {
    const m = new THREE.InstancedMesh(geometryFor(`hair:${h}:${l}`, hairCount[i][k]), mat, Math.max(1, hairCount[i][k]));
    m.name = `crowdHair:${h}:${l}`; m.count = hairCount[i][k]; m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return m;
  }));
  // static per-instance colours
  for (const p of people) {
    const bg = body[p.lod].geometry, hg = hair[p.lod][p.hair].geometry;
    bg.attributes.iOutfit.setXYZ(p.idx, ...p.outfit); bg.attributes.iHair.setXYZ(p.idx, ...p.hairC); bg.attributes.iSkin.setX(p.idx, p.skin);
    hg.attributes.iOutfit.setXYZ(p.hidx, ...p.outfit); hg.attributes.iHair.setXYZ(p.hidx, ...p.hairC); hg.attributes.iSkin.setX(p.hidx, p.skin);
  }
  group.add(...body, ...hair.flat());

  /** Place one figure: matrix (world), raise angles per arm (radians, 0 = hanging). */
  function setPerson(p, matrix, raiseL, raiseR) {
    body[p.lod].setMatrixAt(p.idx, matrix);
    hair[p.lod][p.hair].setMatrixAt(p.hidx, matrix);
    body[p.lod].geometry.attributes.iRaise.setXY(p.idx, raiseL, raiseR);
  }
  function commit() {
    for (const m of body) { m.instanceMatrix.needsUpdate = true; m.geometry.attributes.iRaise.needsUpdate = true; }
    for (const row of hair) for (const m of row) m.instanceMatrix.needsUpdate = true;
  }
  function setLight(rim, fill) { uni.uRim.value.copy(rim); uni.uFill.value.copy(fill); }
  function setDebug(on) { uni.uDebug.value = on ? 1 : 0; }
  function dispose() {
    for (const m of [...body, ...hair.flat()]) m.dispose();
    for (const d of disposables) d.dispose && d.dispose();
    disposables.length = 0;
    group.clear();
    if (group.parent) group.parent.remove(group);
  }
  const tris = people.reduce((n, p) => n + geos[`body:${LOD[p.lod]}`].ni / 3 + geos[`hair:${HAIR[p.hair]}:${LOD[p.lod]}`].ni / 3, 0);
  return { group, setPerson, commit, setLight, setDebug, dispose, height: header.height, triangles: tris, drawCalls: 2 + 6 };
}
