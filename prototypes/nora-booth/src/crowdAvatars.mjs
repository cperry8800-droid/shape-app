// The crowd, made of Nora's own avatar design.
//
// src/crowd-bake.mjs skins the DJ's VRM into a relaxed standing pose (and a seated one) and
// simplifies it by quadric-error edge collapse into near / far / tiny figures, plus hair in three
// lengths. This module decodes that pack and draws hundreds of them as instances: one body mesh
// per level of detail, one hair mesh per (length, level). Every figure gets its own top, bottoms,
// shoes, skin tone and hair colour through instanced attributes, and its arms raise on the drop in
// the vertex shader (a rotation about the baked shoulder pivot, weighted per vertex), so a raise
// is smooth instead of a swap of meshes.
//
// The eyes are not geometry. Decimated, the layered eye meshes melt into dark blotches, so the
// bake measures where they are (header.face) and the fragment shader draws an eye white, an iris
// with a catch-light, a lid line and a brow at that spot, antialiased with fwidth and faded out
// once an eye is only a few pixels wide (a far face reads as a face, not as two grey smears).
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
// Club clothes (linear RGB). Mostly dark, but not all black: a room of 700 black shirts reads as
// one mass. White tees and pale tops catch the stage light and break it up.
const TOPS_DARK = [[0.012, 0.012, 0.014], [0.018, 0.017, 0.016], [0.03, 0.03, 0.034], [0.02, 0.022, 0.03], [0.028, 0.014, 0.014]];
const TOPS_COLOUR = [[0.42, 0.41, 0.39], [0.3, 0.27, 0.22], [0.14, 0.02, 0.026], [0.022, 0.034, 0.1], [0.026, 0.062, 0.036],
  [0.02, 0.11, 0.11], [0.06, 0.09, 0.15], [0.16, 0.11, 0.06], [0.3, 0.035, 0.03], [0.12, 0.12, 0.12], [0.2, 0.09, 0.14]];
const BOTTOMS = [[0.01, 0.01, 0.011], [0.012, 0.012, 0.013], [0.02, 0.03, 0.06], [0.05, 0.075, 0.13], [0.14, 0.11, 0.07], [0.06, 0.06, 0.062], [0.018, 0.016, 0.014]];
const HAIRS = [[0.03, 0.02, 0.014], [0.05, 0.03, 0.018], [0.09, 0.05, 0.028], [0.13, 0.08, 0.04], [0.02, 0.018, 0.016], [0.22, 0.14, 0.06], [0.16, 0.06, 0.03], [0.4, 0.33, 0.22]];
const pick = (rnd, list) => list[Math.floor(rnd() * list.length) % list.length];

/**
 * @param {object} o
 * @param {typeof import('three')} o.THREE
 * @param {object} o.pack       from loadCrowdPack
 * @param {Array}  o.people     the club's people (x, z, yaw, lod, idx, s, w …); this module adds hair/outfit/skin
 * @param {number[]} o.lodCount people per level of detail
 * @param {() => number} o.rnd  seeded
 * @param {string[]} [o.lods]   the pack's level-of-detail names, index = person.lod (default near, far)
 * @param {number} [o.stageFalloff]  metres over which the stage light fades toward the house (e = 2.72×)
 * @param {string} [o.name]     the group's name
 * @param {number} [o.bob]      metres a static crowd dips on the kick (the venue's); 0 = the caller poses it
 */
export function createAvatarCrowd({ THREE, pack, people, lodCount, rnd, lods = ['near', 'far'], stageFalloff = 13, name = 'crowdAvatars', bob = 0 }) {
  const group = new THREE.Group();
  group.name = name;
  const disposables = [];
  const own = (x) => { disposables.push(x); return x; };
  const { header, geos } = pack;

  // ── who wears what ─────────────────────────────────────────────────────────────────────
  const hairCount = lods.map(() => [0, 0, 0]);
  for (const p of people) {
    const r = rnd();
    if (!Number.isInteger(p.hair)) p.hair = r < 0.42 ? 0 : r < 0.72 ? 1 : 2; // a caller may pre-assign (the line-up page does)
    p.hidx = hairCount[p.lod][p.hair]++;
    p.outfit = rnd() < 0.55 ? pick(rnd, TOPS_DARK) : pick(rnd, TOPS_COLOUR);
    p.lower = pick(rnd, BOTTOMS);
    p.shoe = rnd() < 0.3 ? 1 : 0;             // white trainers or dark shoes
    p.skin = Math.pow(rnd(), 0.8);            // 0 light → 1 deep
    p.hairC = rnd() < 0.08 ? HAIRS[7] : HAIRS[Math.floor(rnd() * 7)];   // platinum is rare
  }

  // ── material: parts tint + arm raise + the stage rim + drawn eyes ─────────────────────
  // The face frame (header.face, v2 packs): per eye the iris centre and the extents of the iris,
  // the eye white and the brow as [u0, u1, v0, v1] around it, in the head's right/up axes.
  const F = header.face && header.face.L && header.face.R && header.face.L.white ? header.face : null;
  const V3 = (a) => new THREE.Vector3().fromArray(a || [0, 0, 0]);
  const V4 = (a) => new THREE.Vector4().fromArray(a || [0, 0, 0, 0]);
  const fwdV = V3(F && F.fwd), upV = V3(F && F.up);
  const rightV = new THREE.Vector3().crossVectors(upV, fwdV).normalize();
  const eye = (k) => (F ? F[k] : null);
  const uni = {
    uRim: { value: new THREE.Color(0, 0, 0) }, uFill: { value: new THREE.Color(0, 0, 0) },
    uBack: { value: new THREE.Color(0, 0, 0) }, uStageFall: { value: stageFalloff },
    uPivotL: { value: new THREE.Vector3().fromArray(header.pivot.L) }, uPivotR: { value: new THREE.Vector3().fromArray(header.pivot.R) },
    uDebug: { value: 0 }, // 1: paint the arm weights (red = left, green = right) — the line-up page's ?w=1
    uFace: { value: F ? 1 : 0 }, uFwd: { value: fwdV }, uUp: { value: upV }, uRight: { value: rightV },
    uEyeCL: { value: V3(eye('L') && eye('L').c) }, uEyeCR: { value: V3(eye('R') && eye('R').c) },
    uWhiteL: { value: V4(eye('L') && eye('L').white) }, uWhiteR: { value: V4(eye('R') && eye('R').white) },
    uIrisL: { value: V4(eye('L') && eye('L').iris) }, uIrisR: { value: V4(eye('R') && eye('R').iris) },
    uBrowL: { value: V4(eye('L') && eye('L').brow) }, uBrowR: { value: V4(eye('R') && eye('R').brow) },
    uKick: { value: 0 }, uBob: { value: 0 }, uTime: { value: 0 },   // a static crowd (the venue) bobs on the kick in the shader
  };
  const mat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.0, envMapIntensity: 0.06 }));
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', [
        '#include <common>',
        'attribute float part; attribute vec2 armW;',
        'attribute vec2 iRaise; attribute vec3 iOutfit; attribute vec3 iHair; attribute float iSkin; attribute vec4 iLower;',
        'uniform vec3 uPivotL; uniform vec3 uPivotR; uniform float uKick; uniform float uBob; uniform float uTime;',
        'varying float vPart; varying float vSkin; varying vec3 vOutfit; varying vec3 vHair; varying vec4 vLower; varying float vStageZ; varying vec2 vArmW;',
        'varying vec3 vObj; varying vec3 vObjN;',
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
        'vObj = transformed; vObjN = objectNormal;',
        // the static-crowd bob: knees give on the kick, each person a little out of phase (their
        // instance index), feet planted (the lift fades to nothing at the floor)
        '#ifdef USE_INSTANCING',
        'if (uBob > 0.0) { float ph = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);',
        '  float k = uKick * (0.55 + 0.45 * ph) + 0.25 * max(0.0, sin(uTime * 2.1 + ph * 6.2831)) * (1.0 - uKick);',
        '  transformed.y -= uBob * k * smoothstep(0.1, 0.9, transformed.y); }',
        '#endif',
        'vPart = part; vSkin = iSkin; vOutfit = iOutfit; vHair = iHair; vLower = iLower; vArmW = armW;',
      ].join('\n'))
      .replace('#include <project_vertex>', '#include <project_vertex>\nvStageZ = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).z;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform vec3 uRim; uniform vec3 uFill; uniform vec3 uBack; uniform float uStageFall; uniform float uDebug;',
        'uniform float uFace; uniform vec3 uFwd; uniform vec3 uUp; uniform vec3 uRight;',
        'uniform vec3 uEyeCL; uniform vec3 uEyeCR; uniform vec4 uWhiteL; uniform vec4 uWhiteR; uniform vec4 uIrisL; uniform vec4 uIrisR; uniform vec4 uBrowL; uniform vec4 uBrowR;',
        'varying float vPart; varying float vSkin; varying vec3 vOutfit; varying vec3 vHair; varying vec4 vLower; varying float vStageZ; varying vec2 vArmW;',
        'varying vec3 vObj; varying vec3 vObjN;',
        'float gCatch = 0.0;',
        // one eye, drawn over the face: returns (colour, coverage). Everything is computed in uniform
        // control flow (fwidth needs its neighbours), and masked at the end.
        'vec4 crowdEye(vec3 c, vec4 W, vec4 I, vec4 B, vec3 irisC, vec3 browC) {',
        '  vec3 d = vObj - c; float u = dot(d, uRight), v = dot(d, uUp);',
        '  float front = step(0.15, dot(vObjN, uFwd) / max(length(vObjN), 1e-4)) * step(-0.025, dot(d, uFwd));',
        '  vec2 wc = vec2(W.x + W.y, W.z + W.w) * 0.5; vec2 wr = max(vec2(W.y - W.x, W.w - W.z) * 0.5, vec2(1e-4));',
        // the lower lid sits higher than the measured opening (white under the iris reads as a startled stare)
        '  vec2 q = (vec2(u, v) - wc) / wr; q.y *= q.y < 0.0 ? 1.55 : 1.0; float e = length(q) - 1.0; float ew = fwidth(e) + 1e-5;',
        '  float inW = 1.0 - smoothstep(-ew, ew, e);',
        '  float ir = max((I.y - I.x) * 0.5, 1e-4); vec2 ic = vec2(I.x + I.y, I.z + I.w) * 0.5;',
        '  float di = length(vec2(u, v) - ic) / ir - 1.0; float iw = fwidth(di) + 1e-5;',
        '  float inI = (1.0 - smoothstep(-iw, iw, di)) * inW;',
        '  float pup = (1.0 - smoothstep(-iw, iw, di + 0.55)) * inW;',
        '  float dc = length(vec2(u, v) - ic - vec2(0.32, 0.36) * ir) / (0.26 * ir) - 1.0; float cw = fwidth(dc) + 1e-5;',
        '  float cat = (1.0 - smoothstep(-cw, cw, dc)) * inI;',
        '  float lid = (1.0 - smoothstep(0.0, 2.2 * ew + 0.06, abs(e + 0.02))) * smoothstep(-0.2, 0.25, q.y);',   // the upper lid line
        '  float bw = max((B.y - B.x) * 0.5, 1e-4); vec2 bc = vec2(B.x + B.y, B.z + B.w) * 0.5; float bh = max((B.w - B.z) * 0.5, 0.0035);',
        '  vec2 bq = (vec2(u, v) - bc) / vec2(bw, bh); float be = max(abs(bq.x), abs(bq.y)) - 1.0; float bew = fwidth(be) + 1e-5;',
        '  float inB = (1.0 - smoothstep(-bew, bew, be)) * (1.0 - 0.5 * smoothstep(0.4, 1.0, abs(bq.x)));',
        // fade the whole eye out once it is only a few pixels across (ew = change of e per pixel)
        '  float fade = 1.0 - smoothstep(0.22, 0.55, ew);',
        '  vec3 col = mix(vec3(0.56, 0.53, 0.5), vec3(0.3, 0.27, 0.26), smoothstep(0.1, 0.95, q.y));',   // the upper lid's shadow on the white
        '  col = mix(col, irisC, inI / max(inW, 1e-4)); col = mix(col, vec3(0.012, 0.009, 0.008), pup / max(inW, 1e-4));',
        '  float a = inW * 0.92;',
        '  col = mix(col, vec3(0.018, 0.012, 0.01), lid); a = max(a, lid * 0.9);',
        '  col = mix(col, browC, inB * (1.0 - inW)); a = max(a, inB * 0.85 * (1.0 - inW));',
        '  gCatch = max(gCatch, cat * fade * front);',
        '  return vec4(col, a * fade * front * uFace);',
        '}',
      ].join('\n'))
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        '{ float sk = vSkin;',
        '  vec3 skin = sk < 0.5 ? mix(vec3(0.68, 0.5, 0.4), vec3(0.42, 0.27, 0.18), sk * 2.0) : mix(vec3(0.42, 0.27, 0.18), vec3(0.13, 0.075, 0.05), sk * 2.0 - 1.0);',
        '  int P = int(vPart + 0.5);',
        '  vec3 shoe = mix(vec3(0.018, 0.016, 0.015), vec3(0.5, 0.49, 0.47), vLower.a);',
        '  vec3 col = P == 0 ? vOutfit : P == 1 ? skin : P == 2 ? vHair : P == 3 ? vec3(0.05, 0.035, 0.03) : P == 4 ? vec3(0.6, 0.57, 0.54) : P == 5 ? vLower.rgb : shoe;',
        '  vec3 irisC = mix(vec3(0.09, 0.06, 0.035), vec3(0.03, 0.018, 0.012), vSkin);',
        '  vec3 browC = mix(vHair, vec3(0.012, 0.009, 0.007), 0.45);',
        '  vec4 eL = crowdEye(uEyeCL, uWhiteL, uIrisL, uBrowL, irisC, browC);',
        '  vec4 eR = crowdEye(uEyeCR, uWhiteR, uIrisR, uBrowR, irisC, browC);',
        '  float onFace = (P == 1 || P == 4) ? 1.0 : 0.0;',
        '  col = mix(col, eL.rgb, eL.a * onFace); col = mix(col, eR.rgb, eR.a * onFace); gCatch *= onFace;',
        '  if (uDebug > 0.5) col = vec3(vArmW.x, vArmW.y, 0.15);',
        '  diffuseColor.rgb *= col; }',
      ].join('\n'))
      .replace('#include <emissivemap_fragment>', [
        '#include <emissivemap_fragment>',
        '{ float stageK = exp((vStageZ - 1.5) / uStageFall);',
        '  float rimF = 1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);',
        '  vec3 toStage = normalize((viewMatrix * vec4(0.0, 0.35, 1.0, 0.0)).xyz);',
        '  float face = dot(normal, toStage);',
        '  float lit = 0.3 + 0.7 * smoothstep(-0.25, 0.6, face);',
        // the fill and the back light take the surface's colour (a white tee reads white, a black
        // one stays black); the rim is the light's own colour, grazing, as a rim is
        '  vec3 tint = mix(vec3(1.0), clamp(diffuseColor.rgb * 2.4, 0.0, 1.6), 0.6);',
        // the rim belongs to the heads and shoulders: on a thin bare limb it covers the whole width, so
        // unfaded it turned every pair of legs into two glowing white sticks
        '  float hK = 0.18 + 0.82 * smoothstep(0.75, 1.35, vObj.y);',
        // hair is thin cards: an untinted rim outlined every strand in ice; on hair it takes the hair's colour
        '  vec3 rimTint = mix(vec3(1.0), tint, abs(vPart - 2.0) < 0.5 ? 0.8 : 0.35) * (abs(vPart - 2.0) < 0.5 ? 0.6 : 1.0);',
        '  totalEmissiveRadiance += (uRim * pow(rimF, 4.0) * lit * hK * rimTint + uFill * max(face, 0.0) * max(face, 0.0) * tint) * stageK;',
        // the back light: from behind each person (the house side, away from the stage) — the
        // shoulders, crown and the back of the head catch it, so a crowd seen from the house is not a
        // black mass. Not attenuated by the stage falloff: it belongs to the room, not the stage.
        '  float back = max(-face, 0.0); float up = max(dot(normal, (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), 0.0);',
        '  totalEmissiveRadiance += uBack * tint * (0.35 * back + 0.65 * back * pow(rimF, 2.0) + 0.25 * up * back);',
        '  totalEmissiveRadiance += vec3(0.5, 0.52, 0.55) * gCatch * (0.15 + 0.85 * stageK); }',
      ].join('\n'));
  };
  mat.customProgramCacheKey = () => 'club-shape-avatar-crowd-v6';

  // ── geometries + instanced meshes ──────────────────────────────────────────────────────
  function geometryFor(name, cap) {
    const g = geos[name];
    const geo = own(new THREE.BufferGeometry());
    const pos = new Float32Array(g.nv * 3);
    for (let i = 0; i < pos.length; i++) pos[i] = g.pos[i] / 1000;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // Decimation can leave a vertex whose faces cancel (the two sides of a hair card welded into one
    // strand): its normal packs to zero, normalize() gives NaN, and the strand renders as a white streak.
    // Such a vertex faces outward from the body's axis instead.
    const nrm = new Int8Array(g.nrm);
    for (let i = 0; i < g.nv; i++) {
      const nx = nrm[i * 3], ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2];
      if (nx * nx + ny * ny + nz * nz >= 64 * 64) continue;
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const cy = Math.min(1.5, Math.max(0.9, y));
      let dx = x, dy = (y - cy) * 0.6 + 0.15, dz = z;
      const l = Math.hypot(dx, dy, dz) || 1;
      nrm[i * 3] = Math.round((dx / l) * 127); nrm[i * 3 + 1] = Math.round((dy / l) * 127); nrm[i * 3 + 2] = Math.round((dz / l) * 127);
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
    geo.setAttribute('part', new THREE.BufferAttribute(new Uint8Array(g.part), 1, false));
    geo.setAttribute('armW', new THREE.BufferAttribute(new Uint8Array(g.arm), 2, true));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(g.index), 1));
    const n = Math.max(1, cap);
    const mk = (size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); return a; };
    geo.setAttribute('iRaise', mk(2));
    geo.setAttribute('iOutfit', mk(3));
    geo.setAttribute('iHair', mk(3));
    geo.setAttribute('iSkin', mk(1));
    geo.setAttribute('iLower', mk(4));
    return geo;
  }
  const LOD = lods;
  // A pose with no hair of its own (the seated body) wears another level's hair: same head, same place.
  const hairLod = (l) => (header.hairOf && header.hairOf[l]) || l;
  for (const l of LOD) if (!geos[`body:${l}`] || !geos[`hair:long:${hairLod(l)}`]) throw new Error(`crowd pack has no "${l}" figure`);
  uni.uBob.value = bob;
  const body = LOD.map((l, i) => {
    const m = new THREE.InstancedMesh(geometryFor(`body:${l}`, lodCount[i]), mat, Math.max(1, lodCount[i]));
    m.name = `crowdBody:${l}`; m.count = lodCount[i]; m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return m;
  });
  const hair = LOD.map((l, i) => HAIR.map((h, k) => {
    const m = new THREE.InstancedMesh(geometryFor(`hair:${h}:${hairLod(l)}`, hairCount[i][k]), mat, Math.max(1, hairCount[i][k]));
    m.name = `crowdHair:${h}:${l}`; m.count = hairCount[i][k]; m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return m;
  }));
  // static per-instance colours
  for (const p of people) {
    const bg = body[p.lod].geometry, hg = hair[p.lod][p.hair].geometry;
    for (const [g, i] of [[bg, p.idx], [hg, p.hidx]]) {
      g.attributes.iOutfit.setXYZ(i, ...p.outfit); g.attributes.iHair.setXYZ(i, ...p.hairC); g.attributes.iSkin.setX(i, p.skin);
      g.attributes.iLower.setXYZW(i, ...p.lower, p.shoe);
    }
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
  function setLight(rim, fill, back = null) { uni.uRim.value.copy(rim); uni.uFill.value.copy(fill); if (back) uni.uBack.value.copy(back); }
  function setDebug(on) { uni.uDebug.value = on ? 1 : 0; }
  /** The static crowd's bob (only when created with bob > 0): kick envelope 0..1 and the clock. */
  function setBeat(kick, t) { uni.uKick.value = kick; uni.uTime.value = t; }
  function dispose() {
    for (const m of [...body, ...hair.flat()]) m.dispose();
    for (const d of disposables) d.dispose && d.dispose();
    disposables.length = 0;
    group.clear();
    if (group.parent) group.parent.remove(group);
  }
  const tris = people.reduce((n, p) => n + geos[`body:${LOD[p.lod]}`].ni / 3 + geos[`hair:${HAIR[p.hair]}:${hairLod(LOD[p.lod])}`].ni / 3, 0);
  return { group, setPerson, commit, setLight, setDebug, setBeat, dispose, height: header.height, seat: header.seat || null, triangles: tris, drawCalls: LOD.length * 4 };
}
