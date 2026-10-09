// check-vrm.mjs — does a VRM meet what Nora's booth needs? No dependencies: it reads the GLB's JSON
// and image headers, never decodes geometry, so it runs on a compressed model as well as a raw one.
//
//   node scripts/nora-model/check-vrm.mjs <model.vrm>          (exit 1 on any error)
//
// What it holds a model to:
//   - VRM 1.0 (the booth loads it with @pixiv/three-vrm 3.x as a VRM 1.0 humanoid).
//   - Every humanoid bone the performer drives (PERFORMER_BONES, read off noraPerformer.mjs: the
//     arm IK, the groove and the finger curl all fetch bones by these names and dereference them).
//   - The expressions the performer sets (blink, happy, relaxed), bound to real morph targets;
//     visemes are reported when missing, for the day she talks.
//   - A look-at that can work (bone look-at needs both eye bones).
//   - The budget in maps.json: triangles, materials, joints per skin, texture size, file size, and
//     at most 4 bone influences a vertex (one JOINTS/WEIGHTS set).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PERFORMER_BONES = Object.freeze([
  'hips', 'spine', 'chest', 'neck', 'head',
  ...['left', 'right'].flatMap((s) => [
    `${s}UpperArm`, `${s}LowerArm`, `${s}Hand`, `${s}UpperLeg`, `${s}LowerLeg`, `${s}Foot`, `${s}ThumbProximal`,
    ...['Index', 'Middle', 'Ring', 'Little'].flatMap((f) => ['Proximal', 'Intermediate', 'Distal'].map((g) => `${s}${f}${g}`)),
  ]),
]);
export const PERFORMER_EXPRESSIONS = Object.freeze(['blink', 'happy', 'relaxed']);
export const VISEMES = Object.freeze(['aa', 'ih', 'ou', 'ee', 'oh']);

/** The GLB's JSON chunk, its binary chunk, and its total length. Throws on anything that is not a GLB. */
export function readGlb(buf) {
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB (bad magic)');
  if (buf.readUInt32LE(4) !== 2) throw new Error('not a glTF 2.0 GLB');
  const jsonLen = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error('the first GLB chunk is not JSON');
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  let bin = null;
  const at = 20 + jsonLen;
  if (buf.length >= at + 8 && buf.readUInt32LE(at + 4) === 0x004e4942) bin = buf.subarray(at + 8, at + 8 + buf.readUInt32LE(at));
  return { json, bin, length: buf.length };
}

/** Width and height from a PNG, JPEG or WebP header, or null. */
export function imageSize(b) {
  if (!b || b.length < 30) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
    return null;
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8L') { const n = b.readUInt32LE(21); return { w: 1 + (n & 0x3fff), h: 1 + ((n >> 14) & 0x3fff) }; }
    if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

function triangles(json) {
  let n = 0;
  for (const m of json.meshes || []) {
    for (const p of m.primitives || []) {
      const mode = p.mode == null ? 4 : p.mode;
      if (mode !== 4) continue;
      const count = p.indices != null ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count;
      n += Math.floor(count / 3);
    }
  }
  return n;
}

/**
 * @param {Buffer} buf  the .vrm file
 * @param {object} budget  maps.json's budget
 * @returns {{errors: string[], warnings: string[], stats: object}}
 */
export function checkVrm(buf, budget) {
  const errors = [], warnings = [];
  const { json, bin, length } = readGlb(buf);
  const vrm = json.extensions && json.extensions.VRMC_vrm;
  const stats = { bytes: length, triangles: triangles(json), materials: (json.materials || []).length, skins: (json.skins || []).length };
  if (!vrm) { errors.push('no VRMC_vrm extension: not a VRM 1.0'); return { errors, warnings, stats }; }
  if (vrm.specVersion !== '1.0') errors.push(`VRM specVersion is ${vrm.specVersion}, the booth loads 1.0`);
  if (!(json.extensionsUsed || []).includes('VRMC_vrm')) errors.push('VRMC_vrm is not listed in extensionsUsed');

  const nodes = json.nodes || [];
  const bones = (vrm.humanoid && vrm.humanoid.humanBones) || {};
  for (const b of PERFORMER_BONES) {
    const hb = bones[b];
    if (!hb || !Number.isInteger(hb.node) || !nodes[hb.node]) errors.push(`humanoid bone ${b} is missing (the performer drives it)`);
  }
  const used = new Map();
  for (const [name, hb] of Object.entries(bones)) {
    if (used.has(hb.node)) errors.push(`humanoid bones ${used.get(hb.node)} and ${name} share node ${hb.node}`);
    used.set(hb.node, name);
  }
  stats.humanoidBones = Object.keys(bones).length;

  const preset = (vrm.expressions && vrm.expressions.preset) || {};
  const bindOk = (e) => {
    const binds = (e && e.morphTargetBinds) || [];
    return binds.length > 0 && binds.every((bd) => {
      const n = nodes[bd.node];
      const mesh = n && n.mesh != null ? json.meshes[n.mesh] : null;
      const targets = mesh && mesh.primitives && mesh.primitives[0] && mesh.primitives[0].targets;
      return !!targets && Number.isInteger(bd.index) && bd.index >= 0 && bd.index < targets.length && bd.weight > 0 && bd.weight <= 1;
    });
  };
  for (const e of PERFORMER_EXPRESSIONS) if (!bindOk(preset[e])) errors.push(`expression ${e} is missing or bound to nothing real (the performer sets it)`);
  for (const e of VISEMES) if (!bindOk(preset[e])) warnings.push(`viseme ${e} is missing (she cannot lip-sync it)`);

  const la = vrm.lookAt;
  if (!la) warnings.push('no lookAt: her eyes will not follow anything');
  else if (la.type === 'bone' && (!bones.leftEye || !bones.rightEye)) errors.push('lookAt is bone-driven but an eye bone is missing');

  // budget
  if (budget) {
    if (stats.triangles > budget.triangles) errors.push(`${stats.triangles} triangles, over the budget of ${budget.triangles}`);
    if (stats.materials > budget.materials) errors.push(`${stats.materials} materials, over the budget of ${budget.materials}`);
    for (const [i, s] of (json.skins || []).entries()) if (s.joints.length > budget.joints) errors.push(`skin ${i} has ${s.joints.length} joints, over the budget of ${budget.joints}`);
    if (length > budget.fileBytes) errors.push(`${length} bytes, over the budget of ${budget.fileBytes}`);
    let maxPx = 0;
    for (const [i, im] of (json.images || []).entries()) {
      if (im.bufferView == null || !bin) { warnings.push(`image ${i} is not embedded`); continue; }
      const bv = json.bufferViews[im.bufferView];
      const size = imageSize(bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
      if (!size) { warnings.push(`image ${i} has a header this check cannot read`); continue; }
      maxPx = Math.max(maxPx, size.w, size.h);
    }
    stats.maxTexturePx = maxPx;
    if (maxPx > budget.maxTexturePx) errors.push(`a ${maxPx}px texture, over the budget of ${budget.maxTexturePx}`);
    for (const m of json.meshes || []) for (const p of m.primitives || []) {
      if (p.attributes.JOINTS_1 || p.attributes.WEIGHTS_1) errors.push(`mesh ${m.name || '?'} has more than 4 bone influences a vertex`);
    }
  }
  stats.joints = Math.max(0, ...(json.skins || []).map((s) => s.joints.length));
  return { errors, warnings, stats };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node check-vrm.mjs <model.vrm>'); process.exit(2); }
  const maps = JSON.parse(readFileSync(new URL('./maps.json', import.meta.url), 'utf8'));
  const r = checkVrm(readFileSync(file), maps.budget);
  console.log(JSON.stringify(r.stats));
  for (const w of r.warnings) console.log('warning:', w);
  for (const e of r.errors) console.log('ERROR:', e);
  console.log(r.errors.length ? `check-vrm: ${r.errors.length} error(s)` : 'check-vrm: ok');
  process.exit(r.errors.length ? 1 : 0);
}
