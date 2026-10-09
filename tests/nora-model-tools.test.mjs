// The MetaHuman → VRM tools (scripts/nora-model/): the rules in maps.json, the converter's pure
// rules (mh_rules.py, run with plain python3), the validator (check-vrm.mjs), and the two booth
// changes a realistic model needs (only cartoon materials are restyled; meshopt is decoded).
//
// No MetaHuman file is in this repository, so the converter itself (Blender) is not run here; it
// was measured on a pipeline sample (scripts/nora-model/README.md). What runs here is every rule it
// applies that can be wrong without Blender.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { checkVrm, readGlb, imageSize, PERFORMER_BONES, PERFORMER_EXPRESSIONS, VISEMES } from '../scripts/nora-model/check-vrm.mjs';
import { applyStageLook } from '../public/newdesign/booth/noraPerformer.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const MAPS = JSON.parse(readFileSync('scripts/nora-model/maps.json', 'utf8'));

// ── maps.json ───────────────────────────────────────────────────────────────
const VRM1_BONES = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftEye', 'rightEye', 'jaw',
  ...['left', 'right'].flatMap((s) => [`${s}UpperLeg`, `${s}LowerLeg`, `${s}Foot`, `${s}Toes`, `${s}Shoulder`, `${s}UpperArm`, `${s}LowerArm`, `${s}Hand`,
    `${s}ThumbMetacarpal`, `${s}ThumbProximal`, `${s}ThumbDistal`,
    ...['Index', 'Middle', 'Ring', 'Little'].flatMap((f) => ['Proximal', 'Intermediate', 'Distal'].map((g) => `${s}${f}${g}`))])];
const ARKIT = ['eyeBlinkLeft', 'eyeLookDownLeft', 'eyeLookInLeft', 'eyeLookOutLeft', 'eyeLookUpLeft', 'eyeSquintLeft', 'eyeWideLeft',
  'eyeBlinkRight', 'eyeLookDownRight', 'eyeLookInRight', 'eyeLookOutRight', 'eyeLookUpRight', 'eyeSquintRight', 'eyeWideRight',
  'jawForward', 'jawLeft', 'jawRight', 'jawOpen', 'mouthClose', 'mouthFunnel', 'mouthPucker', 'mouthLeft', 'mouthRight',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthDimpleLeft', 'mouthDimpleRight',
  'mouthStretchLeft', 'mouthStretchRight', 'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper',
  'mouthPressLeft', 'mouthPressRight', 'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthUpperUpLeft', 'mouthUpperUpRight',
  'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'cheekPuff', 'cheekSquintLeft',
  'cheekSquintRight', 'noseSneerLeft', 'noseSneerRight', 'tongueOut'];

test('the humanoid map names only VRM 1.0 bones, maps every bone the performer drives, and maps each UE bone once', () => {
  assert.equal(ARKIT.length, 52);
  for (const k of Object.keys(MAPS.humanoid)) assert.ok(VRM1_BONES.includes(k), `${k} is not a VRM 1.0 humanoid bone`);
  for (const b of PERFORMER_BONES) assert.ok(MAPS.humanoid[b], `${b} (the performer drives it) is not mapped`);
  for (const b of ['leftEye', 'rightEye']) assert.ok(MAPS.humanoid[b], `${b} is needed for the bone look-at`);
  const ue = Object.values(MAPS.humanoid);
  assert.equal(new Set(ue).size, ue.length, 'two VRM bones map to one UE bone');
  for (const k of MAPS.keepExtra) assert.ok(!ue.includes(k), `${k} is both humanoid and extra`);
});

test('every expression is a weighted sum of real ARKit shapes, and the performer\'s and the visemes are all there', () => {
  for (const e of [...PERFORMER_EXPRESSIONS, ...VISEMES, 'blinkLeft', 'blinkRight']) assert.ok(MAPS.expressions[e], `expression ${e} is not mapped`);
  for (const [e, shapes] of Object.entries(MAPS.expressions)) {
    assert.ok(Object.keys(shapes).length > 0, `${e} binds nothing`);
    for (const [s, w] of Object.entries(shapes)) {
      assert.ok(ARKIT.includes(s), `${e} binds ${s}, which is not an ARKit shape`);
      assert.ok(w > 0 && w <= 1, `${e}.${s} weight ${w}`);
    }
  }
  assert.deepEqual(MAPS.expressions.blink, { eyeBlinkLeft: 1, eyeBlinkRight: 1 });
});

test('the budget covers what check-vrm reads, with at most 4 influences', () => {
  for (const k of ['triangles', 'materials', 'joints', 'maxTexturePx', 'influences', 'fileBytes']) assert.ok(MAPS.budget[k] > 0, `budget.${k}`);
  assert.equal(MAPS.budget.influences, 4, 'three.js skins with 4 influences a vertex');
  assert.ok(MAPS.dropMaterials.includes('M_Hide'));
});

// ── mh_rules.py (python3, no Blender) ───────────────────────────────────────
function py(expr) {
  const code = `import json, sys\nsys.path.insert(0, 'scripts/nora-model')\nimport mh_rules as R\nprint(json.dumps(${expr}))`;
  return JSON.parse(execFileSync('python3', ['-c', code], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } }));
}

test('a folded bone lands on its nearest kept ancestor, and a cycle cannot hang the walk', () => {
  const parents = { FACIAL_L_Eye: 'FACIAL_C_FacialRoot', FACIAL_C_FacialRoot: 'head', head: 'neck_02', neck_02: 'neck_01', twist: 'upperarm_l', a: 'b', b: 'a' };
  const r = py(`[R.nearest_kept('FACIAL_C_FacialRoot', ${JSON.stringify(parents)}, {'head','neck_01'}), R.nearest_kept('head', ${JSON.stringify(parents)}, {'head'}), R.nearest_kept('a', ${JSON.stringify(parents)}, {'head'}), R.nearest_kept('twist', ${JSON.stringify(parents)}, {'upperarm_l'})]`);
  assert.deepEqual(r, ['head', 'head', null, 'upperarm_l']);
});

test('the triangle budget is shared by importance, nothing grows, and a kept-whole part is not cut', () => {
  const [b] = py(`[R.part_budgets([60000, 30000, 20000, 40000, 3000], [1.0, 0.75, 0.55, 0.4, None], 80000)]`);
  const total = b.reduce((a, x) => a + x, 0);
  assert.ok(Math.abs(total - 80000) <= 5, `total ${total}`);
  assert.equal(b[4], 3000, 'the eyebrow cards were cut');
  for (let i = 0; i < 4; i++) assert.ok(b[i] <= [60000, 30000, 20000, 40000][i]);
  // the heavier the weight, the larger the share kept
  const kept = b.slice(0, 4).map((x, i) => x / [60000, 30000, 20000, 40000][i]);
  assert.ok(kept[0] > kept[1] && kept[1] > kept[2] && kept[2] > kept[3], JSON.stringify(kept));
  assert.deepEqual(py(`R.part_budgets([100, 200], [1.0, 0.5], 1000)`), [100, 200], 'a budget above the total cut something');
  assert.deepEqual(py(`R.part_budgets([100], [None], 10)`), [100]);
});

test('importance: brows and lashes are never cut, outfits and bodies give up the most', () => {
  const r = py(`[R.importance('Eyebrows_M_Wide_CardsMesh', False), R.importance('SKM_bo_FaceMesh.001', False), R.importance('bo_Outfits.001', True), R.importance('SKM_bo_BodyMesh.001', False), R.importance('Hair_S_Fringe_CardsMesh', False), R.importance('SKM_x_FaceMesh_LashMat', False)]`);
  assert.deepEqual(r, [null, 1.0, 0.55, 0.4, 0.75, null]);
});

test('a shape is carried by barycentric weights that sum to one and stay in the triangle', () => {
  const [w, deg, outside] = py(`[R.barycentric((0.25,0.25,0),(0,0,0),(1,0,0),(0,1,0)), R.barycentric((1,1,1),(0,0,0),(0,0,0),(0,0,0)), R.barycentric((2,2,0),(0,0,0),(1,0,0),(0,1,0))]`);
  assert.ok(Math.abs(w[0] - 0.5) < 1e-9 && Math.abs(w[1] - 0.25) < 1e-9 && Math.abs(w[2] - 0.25) < 1e-9, JSON.stringify(w));
  assert.deepEqual(deg, [1, 0, 0]);
  assert.ok(outside.every((x) => x >= 0) && Math.abs(outside.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('card coverage is cut low, and a texel at the cut-off lands exactly on the exporter\'s 0.5', () => {
  const [cut, at, below, above, kinds] = py(`[R.CARD_CUTOFF, R.card_alpha(0.18, 0.18), R.card_alpha(0.1, 0.18), R.card_alpha(0.9, 0.18), [R.card_cutoff('hair','Hair_S_Fringe_CardMat'), R.card_cutoff('hair','Eyebrows_M_Wide_CardMat'), R.card_cutoff('face_accessory','LashMat')]]`);
  assert.ok(cut.hair < 0.5 && cut.brow < cut.hair && cut.lash <= cut.hair, JSON.stringify(cut));
  assert.ok(Math.abs(at - 0.5) < 1e-9);
  assert.ok(below < 0.5 && above === 1);
  assert.deepEqual(kinds, [cut.hair, cut.brow, cut.lash]);
});

test('colours and names', () => {
  const [rgb, lin, attr] = py(`[R.hex_rgb('#1c1d21'), [round(R.srgb_to_linear(x), 6) for x in (0.0, 0.5, 1.0)], [R.vrm_attr('leftUpperArm'), R.vrm_attr('hips'), R.vrm_attr('rightLittleIntermediate')]]`);
  assert.deepEqual(rgb.map((x) => Math.round(x * 255)), [0x1c, 0x1d, 0x21]);
  assert.deepEqual(lin, [0, 0.214041, 1]);
  assert.deepEqual(attr, ['left_upper_arm', 'hips', 'right_little_intermediate']);
  assert.throws(() => py(`R.hex_rgb('#12')`));
});

test('the converter imports the shared rules instead of carrying its own copies', () => {
  const src = readFileSync('scripts/nora-model/mh_to_vrm.py', 'utf8');
  assert.match(src, /from mh_rules import \(/);
  for (const fn of ['part_budgets', 'nearest_kept', 'barycentric', 'card_cutoff', 'importance', 'hex_rgb']) {
    assert.ok(!new RegExp(`^def ${fn}\\(`, 'm').test(src), `mh_to_vrm.py defines its own ${fn}`);
  }
});

// ── check-vrm.mjs ───────────────────────────────────────────────────────────
function glb(json, bin = Buffer.alloc(0)) {
  let j = Buffer.from(JSON.stringify(json), 'utf8');
  if (j.length % 4) j = Buffer.concat([j, Buffer.alloc(4 - (j.length % 4), 0x20)]);
  let b = bin;
  if (b.length % 4) b = Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]);
  const parts = [Buffer.alloc(12), Buffer.alloc(8), j];
  if (b.length) parts.push(Buffer.alloc(8), b);
  const out = Buffer.concat(parts);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(j.length, 12); out.writeUInt32LE(0x4e4f534a, 16);
  if (b.length) { out.writeUInt32LE(b.length, 20 + j.length); out.writeUInt32LE(0x004e4942, 24 + j.length); }
  return out;
}

/** A small valid VRM 1.0 the booth would accept, as JSON, to break one rule at a time. */
function goodVrm() {
  const names = [...PERFORMER_BONES, 'leftEye', 'rightEye'];
  const nodes = names.map((n) => ({ name: n }));
  nodes.push({ name: 'Face', mesh: 0, skin: 0 });
  const face = nodes.length - 1;
  return {
    asset: { version: '2.0' },
    extensionsUsed: ['VRMC_vrm'],
    nodes,
    accessors: [{ count: 300 }, { count: 100 }],
    meshes: [{ name: 'Face', primitives: [{ indices: 0, attributes: { POSITION: 1, JOINTS_0: 1, WEIGHTS_0: 1 }, targets: [{ POSITION: 1 }, { POSITION: 1 }, { POSITION: 1 }] }] }],
    materials: [{ name: 'skin' }],
    skins: [{ joints: [0, 1, 2] }],
    extensions: { VRMC_vrm: {
      specVersion: '1.0',
      humanoid: { humanBones: Object.fromEntries(names.map((n, i) => [n, { node: i }])) },
      expressions: { preset: {
        blink: { morphTargetBinds: [{ node: face, index: 0, weight: 1 }] },
        happy: { morphTargetBinds: [{ node: face, index: 1, weight: 0.8 }] },
        relaxed: { morphTargetBinds: [{ node: face, index: 2, weight: 0.3 }] },
        ...Object.fromEntries(VISEMES.map((v) => [v, { morphTargetBinds: [{ node: face, index: 1, weight: 0.5 }] }])),
      } },
      lookAt: { type: 'bone', offsetFromHeadBone: [0, 0.06, 0.08] },
    } },
  };
}
const check = (json, budget = MAPS.budget) => checkVrm(glb(json), budget);

test('a well-formed VRM passes with no warnings', () => {
  const r = check(goodVrm());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.stats.triangles, 100);
  assert.equal(r.stats.humanoidBones, PERFORMER_BONES.length + 2);
});

test('each rule fails on its own', () => {
  const cases = [
    ['not a VRM', (j) => { delete j.extensions.VRMC_vrm; }, /not a VRM 1\.0/],
    ['VRM 0.x', (j) => { j.extensions.VRMC_vrm.specVersion = '0.0'; }, /specVersion/],
    ['not declared', (j) => { j.extensionsUsed = []; }, /extensionsUsed/],
    ['a performer bone missing', (j) => { delete j.extensions.VRMC_vrm.humanoid.humanBones.leftIndexIntermediate; }, /leftIndexIntermediate is missing/],
    ['a bone on a missing node', (j) => { j.extensions.VRMC_vrm.humanoid.humanBones.chest.node = 999; }, /chest is missing/],
    ['two bones on one node', (j) => { j.extensions.VRMC_vrm.humanoid.humanBones.spine.node = 0; }, /share node 0/],
    ['blink bound to nothing', (j) => { j.extensions.VRMC_vrm.expressions.preset.blink.morphTargetBinds = []; }, /expression blink/],
    ['happy bound past the shapes', (j) => { j.extensions.VRMC_vrm.expressions.preset.happy.morphTargetBinds[0].index = 3; }, /expression happy/],
    ['relaxed bound to a node with no mesh', (j) => { j.extensions.VRMC_vrm.expressions.preset.relaxed.morphTargetBinds[0].node = 0; }, /expression relaxed/],
    ['a zero weight', (j) => { j.extensions.VRMC_vrm.expressions.preset.blink.morphTargetBinds[0].weight = 0; }, /expression blink/],
    ['bone look-at with no eye', (j) => { delete j.extensions.VRMC_vrm.humanoid.humanBones.leftEye; }, /eye bone is missing/],
    ['too many triangles', (j) => { j.accessors[0].count = (MAPS.budget.triangles + 1) * 3; }, /triangles, over/],
    ['too many materials', (j) => { j.materials = Array.from({ length: MAPS.budget.materials + 1 }, () => ({})); }, /materials, over/],
    ['too many joints', (j) => { j.skins[0].joints = Array.from({ length: MAPS.budget.joints + 1 }, (_, i) => i); }, /joints, over/],
    ['more than 4 influences', (j) => { j.meshes[0].primitives[0].attributes.JOINTS_1 = 1; }, /more than 4 bone influences/],
  ];
  for (const [label, breakIt, re] of cases) {
    const j = goodVrm();
    breakIt(j);
    const r = check(j);
    assert.ok(r.errors.some((e) => re.test(e)), `${label}: expected an error matching ${re}, got ${JSON.stringify(r.errors)}`);
  }
});

test('a missing viseme or look-at is a warning, not a failure', () => {
  const j = goodVrm();
  delete j.extensions.VRMC_vrm.expressions.preset.ou;
  delete j.extensions.VRMC_vrm.lookAt;
  const r = check(j);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => /viseme ou/.test(w)));
  assert.ok(r.warnings.some((w) => /no lookAt/.test(w)));
});

test('the file size counts against the budget', () => {
  const r = check(goodVrm(), { ...MAPS.budget, fileBytes: 100 });
  assert.ok(r.errors.some((e) => /bytes, over/.test(e)));
});

test('texture sizes are read from PNG, JPEG and WebP headers', () => {
  const png = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(png); png.writeUInt32BE(2048, 16); png.writeUInt32BE(1024, 20);
  assert.deepEqual(imageSize(png), { w: 2048, h: 1024 });
  const jpg = Buffer.alloc(40); jpg[0] = 0xff; jpg[1] = 0xd8; jpg[2] = 0xff; jpg[3] = 0xc0; jpg.writeUInt16BE(17, 4); jpg.writeUInt16BE(512, 7); jpg.writeUInt16BE(768, 9);
  assert.deepEqual(imageSize(jpg), { w: 768, h: 512 });
  const vp8x = Buffer.alloc(40); vp8x.write('RIFF', 0, 'ascii'); vp8x.write('WEBP', 8, 'ascii'); vp8x.write('VP8X', 12, 'ascii'); vp8x.writeUIntLE(1023, 24, 3); vp8x.writeUIntLE(511, 27, 3);
  assert.deepEqual(imageSize(vp8x), { w: 1024, h: 512 });
  // VP8L packs 14 bits per side: a width past 8192 exercises the top bit
  const vp8l = Buffer.alloc(40); vp8l.write('RIFF', 0, 'ascii'); vp8l.write('WEBP', 8, 'ascii'); vp8l.write('VP8L', 12, 'ascii'); vp8l.writeUInt32LE((11999) | (255 << 14), 21);
  assert.deepEqual(imageSize(vp8l), { w: 12000, h: 256 });
  assert.equal(imageSize(Buffer.alloc(40)), null);
  // an oversized embedded texture fails the budget
  const j = goodVrm();
  j.images = [{ bufferView: 0, mimeType: 'image/png' }];
  j.bufferViews = [{ buffer: 0, byteOffset: 0, byteLength: png.length }];
  const big = Buffer.from(png); big.writeUInt32BE(MAPS.budget.maxTexturePx * 2, 16);
  const r = checkVrm(glb(j, big), MAPS.budget);
  assert.ok(r.errors.some((e) => /texture, over/.test(e)), JSON.stringify(r.errors));
});

test('readGlb refuses what is not a glTF 2.0 binary', () => {
  assert.throws(() => readGlb(Buffer.from('{"asset":{}}')), /not a GLB/);
  const g = glb(goodVrm()); g.writeUInt32LE(1, 4);
  assert.throws(() => readGlb(g), /glTF 2\.0/);
});

test('the shipped placeholder is a VRM 1.0 with every bone and expression the performer uses', () => {
  const r = checkVrm(readFileSync('public/nora/placeholder.vrm'), null);
  assert.deepEqual(r.errors, [], 'the booth\'s own model fails the structural checks');
});

// ── the booth ───────────────────────────────────────────────────────────────
test('only cartoon (MToon) meshes are restyled: a realistic model keeps its own materials and groups', () => {
  class Mat { constructor(o = {}) { Object.assign(this, o); this.color = { setRGB() {}, setHex() {} }; } dispose() {} }
  const THREE = { MeshStandardMaterial: Mat, MeshPhysicalMaterial: Mat, Color: class { constructor() {} }, ShaderChunk: { lights_physical_pars_fragment: '' } };
  const groups = [{ start: 0, count: 3, materialIndex: 0 }, { start: 3, count: 3, materialIndex: 1 }];
  const geo = () => { const g = { groups: groups.map((x) => ({ ...x })), clearGroups() { this.groups = []; }, addGroup(s, c, m) { this.groups.push({ start: s, count: c, materialIndex: m }); } }; return g; };
  const real = { isMesh: true, material: [{ name: 'MI_Face_Skin' }, { name: 'MI_Teeth' }], geometry: geo() };
  const toon = { isMesh: true, material: [{ name: 'Body_00_SKIN', isMToonMaterial: true }, { name: 'Body_00_SKIN (Outline)', isMToonMaterial: true }], geometry: geo() };
  const root = { traverse(fn) { fn(real); fn(toon); } };
  const realBefore = real.material;
  applyStageLook(THREE, root, { quality: 'low' });
  assert.equal(real.material, realBefore, 'a realistic mesh lost its materials');
  assert.equal(real.geometry.groups.length, 2, 'a realistic mesh lost its material groups');
  assert.ok(!Array.isArray(toon.material) && toon.material.name === 'Body_00_SKIN_stage', 'the cartoon mesh was not restyled');
});

test('the booth decodes meshopt, which the converted model needs', () => {
  const host = stripComments(readFileSync('public/newdesign/booth/noraBooth.mjs', 'utf8'));
  assert.match(host, /import \{ MeshoptDecoder \} from 'three\/addons\/libs\/meshopt_decoder\.module\.js';/);
  assert.match(host, /loader\.setMeshoptDecoder\(MeshoptDecoder\);\s*loader\.register\(/);
  const tools = readFileSync('scripts/nora-model/compress.mjs', 'utf8');
  assert.match(tools, /EXTMeshoptCompression/);
});

test('a model may be a full https URL (hosted outside the repo) or a site path on either surface', async () => {
  const { noraAssetUrl, NORA_MODEL } = await import('../public/newdesign/booth/noraBoothState.mjs');
  assert.equal(noraAssetUrl('https://cdn.example.com/nora/nora.vrm', '/m/'), 'https://cdn.example.com/nora/nora.vrm');
  assert.equal(noraAssetUrl('nora/placeholder.vrm', '/'), '/nora/placeholder.vrm');
  assert.equal(noraAssetUrl('nora/placeholder.vrm', '/m/'), '/m/nora/placeholder.vrm');
  assert.equal(noraAssetUrl('/nora/placeholder.vrm', '/m'), '/m/nora/placeholder.vrm');
  assert.equal(noraAssetUrl('nora/x.vrm', ''), '/nora/x.vrm');
  assert.equal(noraAssetUrl('http://insecure.example.com/x.vrm', '/'), '/http://insecure.example.com/x.vrm', 'only https is taken as a full URL');
  assert.equal(noraAssetUrl('', '/'), null);
  assert.equal(noraAssetUrl(null, '/'), null);
  assert.ok(noraAssetUrl(NORA_MODEL.path, '/'));
});
