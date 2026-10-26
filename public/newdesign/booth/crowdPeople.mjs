// The crowd as real people.
//
// prototypes/nora-booth/crowd-mh/bake_people.py builds a few MakeHuman people (CC0 assets) dressed
// for a night out, poses them (standing, arms hanging, looking up at the stage; and seated), and
// simplifies each into the club's levels of detail. Their textures (skin, eyes, hair, every garment)
// share one atlas. This module decodes that pack (v3) and draws the room as instances: one mesh per
// (level of detail, person), all on one shader. On top of who they are, each instance can wear its own
// colour of a plain garment (the same dress in black, red or white) and hair, raises its arms on the
// drop (the shoulder rotation crowdAvatars.mjs uses) and, in a static crowd, bobs on the kick.
//
// The older crowd (crowdAvatars.mjs, Nora's own VRM in three hair lengths with drawn eyes) still
// reads a v2 pack: loadCrowd and createCrowd pick the module by the pack's version.
//
// Framework-agnostic: three is passed in; no DOM at import; no Math.random (the caller's seeded rnd
// decides who is who).
import { decodeCrowdPack, createAvatarCrowd } from './crowdAvatars.mjs';

// ⚠ Kept in step with bake_people.py PART.
export const PART = Object.freeze({ TOP: 0, SKIN: 1, HAIR: 2, EYE: 3, BOTTOM: 5, SHOES: 6, ACC: 7, HAIRSOLID: 8 });

function bytesOf(b64) {
  const bin = atob(b64.replace(/\s+/g, ''));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

function headerOf(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const hl = dv.getUint32(0, true);
  return { hl, header: JSON.parse(new TextDecoder().decode(u8.subarray(4, 4 + hl))) };
}

/** Decode a v3 pack: { header, geos: { 'b:lod': { nv, ni, pos, nrm, part, arm, uv, index } } }. */
export function decodePeoplePack(b64) {
  const u8 = bytesOf(b64);
  const buf = u8.buffer;
  const { hl, header } = headerOf(u8);
  if (!(header.v >= 3)) throw new Error('people pack: version ' + header.v);
  const align = (n) => (n + 3) & ~3;
  let o = align(4 + hl);
  const geos = {};
  for (const g of header.geos) {
    const pos = new Int16Array(buf, o, g.nv * 3); o = align(o + g.nv * 6);
    const nrm = new Int8Array(buf, o, g.nv * 3); o = align(o + g.nv * 3);
    const part = new Uint8Array(buf, o, g.nv); o = align(o + g.nv);
    const arm = new Uint8Array(buf, o, g.nv * 2); o = align(o + g.nv * 2);
    const uv = new Uint16Array(buf, o, g.nv * 2); o = align(o + g.nv * 4);
    const index = new Uint16Array(buf, o, g.ni); o = align(o + g.ni * 2);
    geos[g.name] = { nv: g.nv, ni: g.ni, pos, nrm, part, arm, uv, index };
  }
  if (o !== buf.byteLength) throw new Error(`people pack: ${buf.byteLength - o} bytes left over`);
  return { header, geos };
}

/** Either pack: v3 (people) or the older v2 (avatars). Only the header is read to tell them apart. */
export function decodeAnyCrowdPack(b64) {
  const s = b64.replace(/\s+/g, '');
  const hl = new DataView(bytesOf(s.slice(0, 8)).buffer).getUint32(0, true);
  const { header } = headerOf(bytesOf(s.slice(0, Math.ceil((4 + hl) / 3) * 4)));
  return header.v >= 3 ? decodePeoplePack(s) : decodeCrowdPack(s);
}

/** The pack's figure for a level of detail, in either version. */
export function crowdHasLod(pack, lod) {
  if (!pack || !pack.geos || !pack.header) return false;
  if (pack.header.v >= 3) return pack.header.bodies.every((_, b) => !!pack.geos[`${b}:${lod}`]);
  return !!pack.geos[`body:${lod}`];
}

async function loadImage(url, fetchImpl) {
  const r = await fetchImpl(url);
  if (!r.ok) throw new Error('crowd atlas: HTTP ' + r.status);
  const blob = await r.blob();
  // flipped here, since three never flips an ImageBitmap on upload
  if (typeof createImageBitmap === 'function') return { image: await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none' }), flipped: true };
  const src = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('crowd atlas: undecodable')); img.src = src; });
  return { image: img, flipped: false, revoke: () => URL.revokeObjectURL(src) };
}

/**
 * Fetch + decode a crowd pack of either version. A v3 pack's atlas (header.atlas.file, beside the
 * pack) is fetched too and resolves as pack.atlas = { image, flipped }.
 */
export async function loadCrowd(url, fetchImpl = fetch) {
  const r = await fetchImpl(url);
  if (!r.ok) throw new Error('crowd pack: HTTP ' + r.status);
  const pack = decodeAnyCrowdPack(await r.text());
  if (pack.header.v >= 3) {
    const base = typeof location !== 'undefined' ? location.href : 'http://localhost/';
    pack.atlas = await loadImage(new URL(pack.header.atlas.file, new URL(url, base)).href, fetchImpl);
  }
  return pack;
}

/** The crowd for a pack of either version (same options, same returned object). */
export function createCrowd(opts) {
  return opts.pack.header.v >= 3 ? createPeopleCrowd(opts) : createAvatarCrowd(opts);
}

// ── who wears what ───────────────────────────────────────────────────────────────────
// Garment colours a person may wear instead of the baked one (linear RGB). A night out: mostly black
// and deep colours, some white and red, a little metallic.
const DRESS = [[0.006, 0.006, 0.007], [0.006, 0.006, 0.007], [0.012, 0.011, 0.012], [0.35, 0.02, 0.025], [0.5, 0.48, 0.45],
  [0.015, 0.02, 0.07], [0.012, 0.09, 0.05], [0.3, 0.22, 0.12], [0.2, 0.2, 0.21], [0.12, 0.012, 0.06], [0.6, 0.05, 0.12]];
const LOWER = [[0.006, 0.006, 0.007], [0.01, 0.01, 0.011], [0.02, 0.03, 0.06], [0.04, 0.04, 0.042], [0.25, 0.24, 0.22]];
const SHOE = [[0.006, 0.005, 0.005], [0.01, 0.009, 0.009], [0.2, 0.01, 0.015], [0.4, 0.38, 0.35]];
const HAIRS = [[0.012, 0.009, 0.007], [0.025, 0.016, 0.01], [0.06, 0.035, 0.02], [0.12, 0.07, 0.035], [0.3, 0.22, 0.12], [0.16, 0.05, 0.025]];
const pick = (rnd, list) => list[Math.floor(rnd() * list.length) % list.length];
// how many beam pools the crowd's shader takes (setPools): the club has eight moving heads
const POOLS = 8;
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/**
 * A garment's recolour, as the shader applies it: colour = k · luma(texel), so the weave and the
 * folds stay and the colour is the target's. k = target / luma(baked mean). None: [-1, 0, 0].
 */
export function recolour(target, mean) {
  if (!target || !mean) return [-1, 0, 0];
  const l = Math.max(luma(mean), 1e-4);
  return target.map((c) => c / l);
}

/**
 * Who each person is and what they wear. Adds p.body (the baked person), p.top / p.lower / p.shoe /
 * p.hairK (recolours, see recolour) and p.skinK (a little lighter or darker than baked).
 */
export function dressPeople(header, people, rnd) {
  const B = header.bodies;
  const weight = B.map((b) => (b.weight > 0 ? b.weight : 1));
  // Neighbours are never the same person when there is any choice: two of the same face and outfit
  // side by side is what gives a crowd of copies away. People without a position (the venue's) just
  // take a weighted pick.
  const CELL = 1.1, cells = new Map();
  const cellKey = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
  const near = (p) => {
    const out = new Set();
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const q of cells.get((cx + i) + ',' + (cz + j)) || []) if (Math.hypot(q.x - p.x, q.z - p.z) < CELL) out.add(q.body);
    }
    return out;
  };
  const choose = (avoid) => {
    let total = 0;
    for (let b = 0; b < B.length; b++) if (!avoid.has(b)) total += weight[b];
    if (total <= 0) return choose(new Set());
    let r = rnd() * total;
    for (let b = 0; b < B.length; b++) if (!avoid.has(b) && (r -= weight[b]) < 0) return b;
    return B.length - 1;
  };
  for (const p of people) {
    const placed = Number.isFinite(p.x) && Number.isFinite(p.z);
    if (!Number.isInteger(p.body)) p.body = choose(placed ? near(p) : new Set());
    if (placed) {
      const k = cellKey(p.x, p.z);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(p);
    }
    const b = B[p.body];
    const m = b.mean || {}, t = b.tint || {};
    const keep = rnd() < 0.3;   // some wear it as baked
    p.top = !keep && t[PART.TOP] ? recolour(pick(rnd, DRESS), m[PART.TOP]) : [-1, 0, 0];
    p.lower = !keep && t[PART.BOTTOM] ? recolour(pick(rnd, LOWER), m[PART.BOTTOM]) : [-1, 0, 0];
    p.shoe = t[PART.SHOES] && rnd() < 0.5 ? recolour(pick(rnd, SHOE), m[PART.SHOES]) : [-1, 0, 0];
    const hr = rnd();
    const hairT = hr < 0.45 ? null : pick(rnd, HAIRS);
    p.hairK = hairT ? recolour(hairT, m[PART.HAIR]) : [-1, 0, 0];
    p.skinK = 0.92 + rnd() * 0.16;
  }
}

/**
 * @param {object} o
 * @param {typeof import('three')} o.THREE
 * @param {object} o.pack       from loadCrowd (v3, with .atlas)
 * @param {Array}  o.people     the club's people (x, z, yaw, lod, idx, s, w …); this module adds who each is
 * @param {number[]} o.lodCount people per level of detail
 * @param {() => number} o.rnd  seeded
 * @param {string[]} [o.lods]   the levels of detail, index = person.lod (default near, far)
 * @param {number} [o.stageFalloff]  metres over which the stage light fades toward the house
 * @param {string} [o.name]     the group's name
 * @param {number} [o.bob]      metres a static crowd dips on the kick (the venue's); 0 = the caller poses it
 * @param {object} [o.house]    how much of the room's lights reach these people (default: all of it).
 *   `near`/`far`: the share of the direct light (the stage's lamps and the wall's panel) on the front
 *   row and deep in the house, fading over `fall` metres from the stage; `ambient`: the share of the
 *   sky and environment light. A club floor is dark past its first rows (owner, 2026-10-26: "make the
 *   crowd darker like a real club"); the venue's lounges are lit by their own lamps and keep all of it.
 */
export function createPeopleCrowd({ THREE, pack, people, lodCount, rnd, lods = ['near', 'far'], stageFalloff = 13, name = 'crowdPeople', bob = 0, house = null }) {
  const group = new THREE.Group();
  group.name = name;
  const disposables = [];
  const own = (x) => { disposables.push(x); return x; };
  const { header, geos } = pack;
  const B = header.bodies;
  for (const l of lods) if (!crowdHasLod(pack, l)) throw new Error(`crowd pack has no "${l}" figure`);

  dressPeople(header, people, rnd);
  const count = lods.map(() => B.map(() => 0));
  for (const p of people) p.bidx = count[p.lod][p.body]++;

  // ── the atlas ────────────────────────────────────────────────────────────────────────
  let atlas = null;
  if (pack.atlas && pack.atlas.image) {
    atlas = own(new THREE.Texture(pack.atlas.image));
    atlas.flipY = !pack.atlas.flipped;
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.anisotropy = 4;
    atlas.needsUpdate = true;
  }

  // ── the shader: atlas, per-person recolour, alpha-tested hair, arm raise, stage light ──
  // One material per person (their own shoulder pivots); the light uniforms are shared objects, so
  // setLight reaches them all, and one program serves them all (same cache key).
  const shared = {
    uRim: { value: new THREE.Color(0, 0, 0) }, uFill: { value: new THREE.Color(0, 0, 0) },
    uBack: { value: new THREE.Color(0, 0, 0) }, uStageFall: { value: stageFalloff },
    uHouse: { value: house ? new THREE.Vector4(house.near, house.far, house.fall, house.ambient) : new THREE.Vector4(1, 1, 1e4, 1) },
    uDebug: { value: 0 }, uKick: { value: 0 }, uBob: { value: bob }, uTime: { value: 0 },
    uAtlasSize: { value: new THREE.Vector2(header.atlas.w, header.atlas.h) },
    // where the moving heads' beams land on the crowd (setPools): xz centre, radius, strength; colour
    uPool: { value: Array.from({ length: POOLS }, () => new THREE.Vector4(0, 0, 1, 0)) },
    uPoolC: { value: Array.from({ length: POOLS }, () => new THREE.Color(0, 0, 0)) },
  };
  const onBeforeCompile = (uni) => (sh) => {
    Object.assign(sh.uniforms, shared, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', [
        '#include <common>',
        'attribute float part; attribute vec2 armW;',
        'attribute vec2 iRaise; attribute vec4 iTop; attribute vec3 iLower; attribute vec3 iShoe; attribute vec3 iHair;',
        'uniform vec3 uPivotL; uniform vec3 uPivotR; uniform float uKick; uniform float uBob; uniform float uTime;',
        'varying float vPart; varying vec4 vTop; varying vec3 vLower; varying vec3 vShoe; varying vec3 vHair; varying float vStageZ; varying vec2 vArmW; varying float vObjY; varying vec2 vWorldXZ;',
        'mat3 rotAA(vec3 a, float t) { float c = cos(t), s = sin(t), oc = 1.0 - c;',
        '  return mat3(oc*a.x*a.x + c, oc*a.x*a.y + a.z*s, oc*a.z*a.x - a.y*s,',
        '              oc*a.x*a.y - a.z*s, oc*a.y*a.y + c, oc*a.y*a.z + a.x*s,',
        '              oc*a.z*a.x + a.y*s, oc*a.y*a.z - a.x*s, oc*a.z*a.z + c); }',
        // the raise axes: forward-and-out for each arm (as crowdAvatars.mjs)
        'const vec3 AXL = vec3(-0.7071, 0.0, 0.7071); const vec3 AXR = vec3(0.7071, 0.0, 0.7071);',
      ].join('\n'))
      .replace('#include <beginnormal_vertex>', [
        '#include <beginnormal_vertex>',
        // the weight scales the ANGLE, never the position (a blend of positions folds the shoulder)
        'if (armW.x > 0.002) objectNormal = rotAA(AXL, iRaise.x * armW.x) * objectNormal;',
        'if (armW.y > 0.002) objectNormal = rotAA(AXR, iRaise.y * armW.y) * objectNormal;',
      ].join('\n'))
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'if (armW.x > 0.002) transformed = uPivotL + rotAA(AXL, iRaise.x * armW.x) * (transformed - uPivotL);',
        'if (armW.y > 0.002) transformed = uPivotR + rotAA(AXR, iRaise.y * armW.y) * (transformed - uPivotR);',
        'vObjY = transformed.y;',
        '#ifdef USE_INSTANCING',
        'if (uBob > 0.0) { float ph = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);',
        '  float k = uKick * (0.55 + 0.45 * ph) + 0.25 * max(0.0, sin(uTime * 2.1 + ph * 6.2831)) * (1.0 - uKick);',
        '  transformed.y -= uBob * k * smoothstep(0.1, 0.9, transformed.y); }',
        '#endif',
        'vPart = part; vTop = iTop; vLower = iLower; vShoe = iShoe; vHair = iHair; vArmW = armW;',
      ].join('\n'))
      .replace('#include <project_vertex>', '#include <project_vertex>\n{ vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0); vStageZ = wp.z; vWorldXZ = wp.xz; }');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform vec3 uRim; uniform vec3 uFill; uniform vec3 uBack; uniform float uStageFall; uniform float uDebug; uniform vec2 uAtlasSize; uniform vec3 uHairMean; uniform vec4 uMeanL; uniform vec4 uHouse;',
        `uniform vec4 uPool[${POOLS}]; uniform vec3 uPoolC[${POOLS}];`,
        'varying float vPart; varying vec4 vTop; varying vec3 vLower; varying vec3 vShoe; varying vec3 vHair; varying float vStageZ; varying vec2 vArmW; varying float vObjY; varying vec2 vWorldXZ;',
        // colour = k · luma(texel): the garment's own shading, the person's colour (none when k.r < 0);
        // a texel more than 3× the garment's mean luma (a stitch, a highlight) is held there
        'vec3 recol(vec3 c, vec3 k, float lm) { return k.r < 0.0 ? c : k * min(dot(c, vec3(0.2126, 0.7152, 0.0722)), 3.0 * lm); }',
      ].join('\n'))
      .replace('#include <map_fragment>', [
        '#include <map_fragment>',
        '{ int P = int(vPart + 0.5);',
        // Hair and brows are cards: alpha-tested. A mip far down averages a strand with the air around
        // it, so the coverage is lifted with the mip level or the hair thins out with distance.
        '  #ifdef USE_MAP',
        '  vec2 tx = vMapUv * uAtlasSize; float lod = max(0.0, 0.5 * log2(max(dot(dFdx(tx), dFdx(tx)), dot(dFdy(tx), dFdy(tx)))));',
        '  if (P == 2 && diffuseColor.a * (1.0 + 0.3 * lod) < 0.5) discard;',
        // the eyeball's clear outer shell (the cornea); opaque, it paints the eyes black
        '  if (P == 3 && diffuseColor.a < 0.5) discard;',
        '  #endif',
        '  diffuseColor.a = 1.0;',
        '  if (P == 0) diffuseColor.rgb = recol(diffuseColor.rgb, vTop.rgb, uMeanL.x);',
        '  else if (P == 5) diffuseColor.rgb = recol(diffuseColor.rgb, vLower, uMeanL.y);',
        '  else if (P == 6) diffuseColor.rgb = recol(diffuseColor.rgb, vShoe, uMeanL.z);',
        '  else if (P == 2) diffuseColor.rgb = recol(diffuseColor.rgb, vHair, uMeanL.w);',
        // solid hair (past the near level): the person's hair colour, flat (k · luma(mean) = the target)
        '  else if (P == 8) diffuseColor.rgb = vHair.r < 0.0 ? uHairMean : vHair * dot(uHairMean, vec3(0.2126, 0.7152, 0.0722));',
        '  else if (P == 1) diffuseColor.rgb *= vTop.a;',
        '  if (uDebug > 0.5) diffuseColor.rgb = vec3(vArmW.x, vArmW.y, 0.15); }',
      ].join('\n'))
      .replace('#include <emissivemap_fragment>', [
        '#include <emissivemap_fragment>',
        '{ float stageK = exp((vStageZ - 1.5) / uStageFall);',
        '  float rimF = 1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);',
        '  vec3 toStage = normalize((viewMatrix * vec4(0.0, 0.35, 1.0, 0.0)).xyz);',
        '  float face = dot(normal, toStage);',
        '  float lit = 0.3 + 0.7 * smoothstep(-0.25, 0.6, face);',
        // the fill and the back light take the surface's colour; the rim is the light's own, grazing
        '  vec3 tint = mix(vec3(1.0), clamp(diffuseColor.rgb * 2.4, 0.0, 1.6), 0.6);',
        // the rim belongs to the heads and shoulders (unfaded, bare legs read as glowing sticks)
        '  float hK = 0.18 + 0.82 * smoothstep(0.75, 1.35, vObjY);',
        '  bool hairy = abs(vPart - 2.0) < 0.5 || abs(vPart - 8.0) < 0.5;',
        // hair is thin cards: an untinted rim outlines every strand; on hair it takes the hair's colour
        '  vec3 rimTint = mix(vec3(1.0), tint, hairy ? 0.8 : 0.35) * (hairy ? 0.6 : 1.0);',
        '  totalEmissiveRadiance += (uRim * pow(rimF, 4.0) * lit * hK * rimTint + uFill * max(face, 0.0) * max(face, 0.0) * tint) * stageK;',
        // the back light: from the house side, so a crowd seen from the house is not a black mass
        '  float back = max(-face, 0.0); float up = max(dot(normal, (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), 0.0);',
        '  totalEmissiveRadiance += uBack * tint * (0.35 * back + 0.65 * back * pow(rimF, 2.0) + 0.25 * up * back);',
        // where a beam lands: a pool of its light on the heads and shoulders under it, strongest on
        // what faces up into it (a crowd under moving heads is lit in moving patches, not evenly)
        '  vec3 pool = vec3(0.0);',
        `  for (int i = 0; i < ${POOLS}; i++) { vec2 dp = vWorldXZ - uPool[i].xy; pool += uPoolC[i] * uPool[i].w * exp(-dot(dp, dp) / (uPool[i].z * uPool[i].z)); }`,
        '  totalEmissiveRadiance += pool * tint * (0.3 + 0.7 * up) * (0.35 + 0.65 * hK); }',
      ].join('\n'))
      // the house lights (o.house): the direct light fades from the front row into the house, and the
      // sky and environment are turned down
      .replace('#include <lights_fragment_end>', [
        '#include <lights_fragment_end>',
        '{ float houseK = mix(uHouse.y, uHouse.x, exp(min(vStageZ - 1.5, 0.0) / uHouse.z));',
        '  reflectedLight.directDiffuse *= houseK; reflectedLight.directSpecular *= houseK;',
        '  reflectedLight.indirectDiffuse *= uHouse.w; reflectedLight.indirectSpecular *= uHouse.w; }',
      ].join('\n'));
  };
  const materials = B.map((b) => {
    const mean = b.mean || {};
    const hm = mean[PART.HAIR] || [0.03, 0.02, 0.014];
    const lm = (p) => (mean[p] ? luma(mean[p]) : 1);
    const uni = { uPivotL: { value: new THREE.Vector3().fromArray(b.pivot.L) }, uPivotR: { value: new THREE.Vector3().fromArray(b.pivot.R) },
      uHairMean: { value: new THREE.Vector3().fromArray(hm) },
      uMeanL: { value: new THREE.Vector4(lm(PART.TOP), lm(PART.BOTTOM), lm(PART.SHOES), lm(PART.HAIR)) } };
    const m = own(new THREE.MeshStandardMaterial({ color: 0xffffff, map: atlas, roughness: 0.72, metalness: 0.0, envMapIntensity: 0.06 }));
    m.onBeforeCompile = onBeforeCompile(uni);
    m.customProgramCacheKey = () => 'club-shape-people-crowd-v1';
    return m;
  });

  // ── geometries + instanced meshes ──────────────────────────────────────────────────────
  function geometryFor(gname, cap) {
    const g = geos[gname];
    const geo = own(new THREE.BufferGeometry());
    const pos = new Float32Array(g.nv * 3);
    for (let i = 0; i < pos.length; i++) pos[i] = g.pos[i] / 1000;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // a vertex whose faces cancelled in the decimation packs a zero normal (NaN once normalised):
    // it faces out from the body's axis instead
    const nrm = new Int8Array(g.nrm);
    for (let i = 0; i < g.nv; i++) {
      const nx = nrm[i * 3], ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2];
      if (nx * nx + ny * ny + nz * nz >= 64 * 64) continue;
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const cy = Math.min(1.5, Math.max(0.9, y));
      const dx = x, dy = (y - cy) * 0.6 + 0.15, dz = z;
      const l = Math.hypot(dx, dy, dz) || 1;
      nrm[i * 3] = Math.round((dx / l) * 127); nrm[i * 3 + 1] = Math.round((dy / l) * 127); nrm[i * 3 + 2] = Math.round((dz / l) * 127);
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Uint16Array(g.uv), 2, true));
    geo.setAttribute('part', new THREE.BufferAttribute(new Uint8Array(g.part), 1, false));
    geo.setAttribute('armW', new THREE.BufferAttribute(new Uint8Array(g.arm), 2, true));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(g.index), 1));
    const n = Math.max(1, cap);
    const mk = (size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); return a; };
    geo.setAttribute('iRaise', mk(2));
    geo.setAttribute('iTop', mk(4));
    geo.setAttribute('iLower', mk(3));
    geo.setAttribute('iShoe', mk(3));
    geo.setAttribute('iHair', mk(3));
    return geo;
  }
  const mesh = lods.map((l, li) => B.map((b, bi) => {
    const n = count[li][bi];
    const m = new THREE.InstancedMesh(geometryFor(`${bi}:${l}`, n), materials[bi], Math.max(1, n));
    m.name = `crowdPeople:${l}:${bi}`; m.count = n; m.visible = n > 0; m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return m;
  }));
  for (const p of people) {
    const a = mesh[p.lod][p.body].geometry.attributes, i = p.bidx;
    a.iTop.setXYZW(i, ...p.top, p.skinK);
    a.iLower.setXYZ(i, ...p.lower);
    a.iShoe.setXYZ(i, ...p.shoe);
    a.iHair.setXYZ(i, ...p.hairK);
  }
  group.add(...mesh.flat());

  /** Place one figure: matrix (world), raise angles per arm (radians, 0 = hanging). */
  function setPerson(p, matrix, raiseL, raiseR) {
    const m = mesh[p.lod][p.body];
    m.setMatrixAt(p.bidx, matrix);
    m.geometry.attributes.iRaise.setXY(p.bidx, raiseL, raiseR);
  }
  function commit() {
    for (const row of mesh) for (const m of row) { m.instanceMatrix.needsUpdate = true; m.geometry.attributes.iRaise.needsUpdate = true; }
  }
  /**
   * Where beams land on the crowd: up to POOLS of { x, z, r, k, color } (world metres; k the
   * strength, color linear). The rest go dark.
   */
  function setPools(list = []) {
    for (let i = 0; i < POOLS; i++) {
      const p = list[i];
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z) && p.r > 0 && p.k > 0) {
        shared.uPool.value[i].set(p.x, p.z, p.r, p.k);
        shared.uPoolC.value[i].copy(p.color);
      } else shared.uPool.value[i].set(0, 0, 1, 0);
    }
  }
  function setLight(rim, fill, back = null) { shared.uRim.value.copy(rim); shared.uFill.value.copy(fill); if (back) shared.uBack.value.copy(back); }
  function setDebug(on) { shared.uDebug.value = on ? 1 : 0; }
  /** The static crowd's bob (only when created with bob > 0): kick envelope 0..1 and the clock. */
  function setBeat(kick, t) { shared.uKick.value = kick; shared.uTime.value = t; }
  function dispose() {
    for (const row of mesh) for (const m of row) m.dispose();
    for (const d of disposables) d.dispose && d.dispose();
    disposables.length = 0;
    if (pack.atlas && pack.atlas.revoke) pack.atlas.revoke();
    group.clear();
    if (group.parent) group.parent.remove(group);
  }
  const triangles = people.reduce((n, p) => n + geos[`${p.body}:${lods[p.lod]}`].ni / 3, 0);
  const drawCalls = mesh.flat().filter((m) => m.count > 0).length;
  return { group, setPerson, commit, setLight, setPools, setDebug, setBeat, dispose, height: header.height, seat: header.seat || null, triangles, drawCalls };
}
