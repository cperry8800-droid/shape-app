// Club Shape from outside as a 3D model (docs/BUILD-2026-10-10-club-shape-model.md): the checker
// that holds a file to the brief (scripts/club-shape-model/check-venue.mjs), the wrapper that makes a
// loaded model the booth's exterior set (clubShapeModel.mjs), the switch that keeps the live booth
// from flying in until a model is set (CLUB_SHAPE_MODEL), and the brief itself, which must keep
// telling the modeller the numbers the booth actually flies by.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from './helpers/booth-three.mjs';
import { checkVenue, walkScene, localMatrix, BUDGET, SCREEN } from '../scripts/club-shape-model/check-venue.mjs';
import { createVenueModel, findNamed, VENUE_NODES, RIBBON_GLOW } from '../public/newdesign/booth/clubShapeModel.mjs';
import { CLUB_SHAPE_MODEL, clubShapeModelUrl } from '../public/newdesign/booth/noraBoothState.mjs';
import { NoraDirector } from '../public/newdesign/booth/noraDirector.mjs';
import { VENUE } from '../public/newdesign/booth/clubExterior.mjs';
import { _arrivalForTest } from '../public/newdesign/booth/noraDirector.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

// ── a .glb built in memory ────────────────────────────────────────────────────────────────────
function glb(json, bin = Buffer.alloc(0)) {
  let j = Buffer.from(JSON.stringify(json), 'utf8');
  j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 0x20)]);
  const b = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4);
  jh.writeUInt32LE(j.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  bh.writeUInt32LE(b.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  const parts = [head, jh, j, ...(b.length ? [bh, b] : [])];
  const out = Buffer.concat(parts);
  out.writeUInt32LE(out.length, 8);
  return out;
}
const png = (w, h) => { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const box = (min, max, count = 3000) => ({ componentType: 5126, type: 'VEC3', count, min, max });

/** A venue that meets the brief: a ribbon round the footprint, the screen where the LED wall is, a shell and some water. */
function goodVenue() {
  const tex = png(2048, 2048);
  return {
    json: {
      asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
      extensionsUsed: ['KHR_materials_unlit', 'KHR_materials_emissive_strength', 'EXT_meshopt_compression'],
      nodes: [
        { name: 'ClubShape', children: [1, 2, 3, 4] },
        { name: 'Ribbon', mesh: 0 },
        { name: 'StageScreen', mesh: 1 },
        { name: 'Shell', mesh: 2 },
        { name: 'Water', mesh: 3 },
      ],
      meshes: [
        { primitives: [{ attributes: { POSITION: 0 }, material: 0 }] },
        { primitives: [{ attributes: { POSITION: 1 }, indices: 4, material: 1 }] },
        { primitives: [{ attributes: { POSITION: 2 }, indices: 5, material: 2 }] },
        { primitives: [{ attributes: { POSITION: 3 }, material: 2 }] },
      ],
      accessors: [
        box([-61.7, 6, -59.3], [69.8, 34, 47.6], 6000),
        box([-12, 2.3, 18.5], [12, 13, 18.5], 4),
        box([-58, 6, -28], [69, 34, 48], 120000),
        box([-2400, -2.4, -2400], [2400, -2.4, 2400], 4),
        { componentType: 5123, type: 'SCALAR', count: 6 },
        { componentType: 5125, type: 'SCALAR', count: 300000 },
      ],
      materials: [
        { name: 'ribbon', emissiveFactor: [0.36, 0.86, 0.95], extensions: { KHR_materials_emissive_strength: { emissiveStrength: 3 } } },
        { name: 'screen', extensions: { KHR_materials_unlit: {} } },
        { name: 'baked', extensions: { KHR_materials_unlit: {} }, pbrMetallicRoughness: { baseColorTexture: { index: 0 } } },
      ],
      textures: [{ source: 0 }],
      images: [{ bufferView: 0, mimeType: 'image/png' }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: tex.length }],
      buffers: [{ byteLength: tex.length }],
    },
    bin: tex,
  };
}
const check = (v, o) => checkVenue(glb(v.json, v.bin), o);
const has = (r, re) => r.errors.some((e) => re.test(e));

test('a venue built to the brief passes the checker', () => {
  const r = check(goodVenue());
  assert.deepEqual(r.errors, []);
  assert.equal(r.stats.triangles, 2000 + 2 + 100000 + 1);
  assert.equal(r.stats.maxTexturePx, 2048);
  assert.deepEqual(r.stats.screen.center, SCREEN.center);
});

test('the checker rejects a file the booth could not fly into', () => {
  const cases = [
    ['no ribbon', (v) => { v.json.nodes[1].name = 'Line'; }, /no node named "Ribbon"/],
    ['no screen', (v) => { v.json.nodes[2].name = 'Screen'; }, /no node named "StageScreen"/],
    ['centimetres', (v) => { v.json.nodes[0].scale = [100, 100, 100]; }, /StageScreen.*metres/],
    ['Z-up', (v) => { v.json.nodes[0].rotation = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]; }, /StageScreen.*\+Y is up/],
    ['moved off the origin', (v) => { v.json.nodes[0].translation = [0, 0, 10]; }, /StageScreen/],
    ['a ribbon that never climbs the shell', (v) => { v.json.accessors[0].max[1] = 6.5; }, /Ribbon" rises to 6\.5/],
    ['a ribbon somewhere else', (v) => { v.json.nodes[1].translation = [200, 0, 0]; }, /Ribbon" spans/],
    ['a lit material with no emission', (v) => { delete v.json.materials[2].extensions; }, /"baked" is lit/],
    ['Draco', (v) => { v.json.extensionsUsed.push('KHR_draco_mesh_compression'); }, /Draco/],
    ['KTX2', (v) => { v.json.images[0].mimeType = 'image/ktx2'; }, /KTX2/],
    ['an unknown required extension', (v) => { v.json.extensionsRequired = ['EXT_something_new']; }, /EXT_something_new.*requires it/],
    ['too many triangles', (v) => { v.json.accessors[5].count = 3 * 300000; }, /triangles, over the phone budget/],
    ['a 4096 texture on phones', (v) => { v.bin = png(4096, 2048); v.json.bufferViews[0].byteLength = v.bin.length; }, /4096 px texture/],
    ['too many materials', (v) => { for (let i = 0; i < 24; i++) v.json.materials.push({ name: `m${i}`, extensions: { KHR_materials_unlit: {} } }); }, /materials, over the budget/],
    ['not a glb', null, /not a GLB/],
  ];
  for (const [what, mutate, re] of cases) {
    const v = goodVenue();
    const r = mutate ? (mutate(v), check(v)) : checkVenue(Buffer.from('{"asset":{}}'));
    assert.ok(has(r, re), `${what}: ${JSON.stringify(r.errors)}`);
  }
  // the desktop budget lets the bigger texture through, and still holds the frame
  const big = goodVenue(); big.bin = png(4096, 4096); big.json.bufferViews[0].byteLength = big.bin.length;
  assert.deepEqual(check(big, { desktop: true }).errors, []);
  assert.ok(BUDGET.desktop.triangles > BUDGET.phone.triangles);
  // a file with no water is fine, with a warning
  const dry = goodVenue(); dry.json.nodes[4].name = 'Sea';
  const r = check(dry);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => /no node named "Water"/.test(w)));
});

test('the checker places nodes as glTF does: translation × rotation × scale, parent before child', () => {
  // a quarter turn about +Y takes +x to −z
  const m = localMatrix({ rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2], translation: [1, 2, 3], scale: [2, 2, 2] });
  const p = [0, 1, 2].map((r) => m[r] * 1 + m[12 + r]);
  assert.ok(Math.abs(p[0] - 1) < 1e-9 && Math.abs(p[1] - 2) < 1e-9 && Math.abs(p[2] - 1) < 1e-9, JSON.stringify(p));
  const json = { scenes: [{ nodes: [0] }], nodes: [{ translation: [10, 0, 0], children: [1] }, { scale: [2, 2, 2], mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [box([-1, 0, 0], [1, 1, 1])] };
  const b = walkScene(json).boxes.get(1);
  assert.deepEqual(b.min, [8, 0, 0]); assert.deepEqual(b.max, [12, 2, 2]);
  // a normalised accessor's bounds are integers in the file
  const q = { scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, scale: [100, 100, 100] }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ componentType: 5122, normalized: true, type: 'VEC3', count: 3, min: [-32767, 0, 0], max: [32767, 32767, 0] }] };
  const qb = walkScene(q).boxes.get(0);
  assert.ok(Math.abs(qb.min[0] + 100) < 1e-6 && Math.abs(qb.max[1] - 100) < 1e-6);
});

// ── the model in the booth ────────────────────────────────────────────────────────────────────
function modelScene({ water = true, basicRibbon = false } = {}) {
  const root = new THREE.Group();
  const ribbonMat = basicRibbon ? new THREE.MeshBasicMaterial({ color: 0x5cd9f2 }) : new THREE.MeshStandardMaterial({ color: 0, emissive: 0x5cd9f2, emissiveIntensity: 3 });
  const ribbon = new THREE.Group(); ribbon.name = 'Ribbon';
  ribbon.add(new THREE.Mesh(new THREE.TorusGeometry(60, 0.4, 4, 64), ribbonMat));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(24, 10.7), new THREE.MeshBasicMaterial({ color: 0x222222 }));
  screen.name = 'StageScreen';
  const shared = new THREE.MeshBasicMaterial({ color: 0x0a0806, map: new THREE.Texture() });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(100, 30, 50), shared); shell.name = 'Shell';
  root.add(ribbon, screen, shell);
  if (water) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), shared); w.name = 'Water'; root.add(w); }
  return root;
}

test('a venue model becomes the exterior set: the screen painted, the ribbon over the bloom threshold and pulsing, a sea when it has none', () => {
  for (const basicRibbon of [false, true]) {
    const src = modelScene({ water: false, basicRibbon });
    const ribbonSrc = findNamed(src, 'Ribbon').children[0].material, screenSrc = findNamed(src, 'StageScreen').material;
    const ext = createVenueModel({ THREE, scene: src, quality: 'low' });
    assert.deepEqual(ext.stats.missing, []);
    assert.ok(ext.stats.triangles > 500, `${ext.stats.triangles} triangles counted`);
    const screen = findNamed(ext.group, VENUE_NODES.screen);
    // Node has no canvas, so the screen falls back to its flat colour; a browser paints CLUB SHAPE
    assert.ok(screen.material.isMeshBasicMaterial && screen.material !== screenSrc && screen.material.color.getHex() !== screenSrc.color.getHex(), 'the club\'s screen replaces the model\'s');
    const rib = findNamed(ext.group, VENUE_NODES.ribbon).children[0].material;
    assert.notEqual(rib, ribbonSrc, 'the ribbon\'s material is its own copy');
    const glowOf = (m) => (m.emissive ? m.emissive.r * m.emissiveIntensity : m.color.r) / (m.emissive ? ribbonSrc.emissive.r : ribbonSrc.color.r);
    assert.ok(glowOf(rib) >= RIBBON_GLOW - 1e-6, `${basicRibbon ? 'unlit' : 'emissive'}: the ribbon glows at ${glowOf(rib)}`);
    ext.update(1 / 60, 1, true, 1);
    const loud = glowOf(rib);
    ext.update(1 / 60, 1, true, 0);
    assert.ok(loud > glowOf(rib) * 1.2, 'it pulses with the music');
    assert.ok(findNamed(ext.group, 'clubShapeSea'), 'a sea where the model has none');
    assert.ok(findNamed(ext.group, 'exteriorSky') && findNamed(ext.group, 'exteriorStars'), 'the booth\'s own sky');
    ext.dispose();
  }
  const wet = createVenueModel({ THREE, scene: modelScene({ water: true }), quality: 'low' });
  assert.equal(findNamed(wet.group, 'clubShapeSea'), null, 'the model\'s own water is kept');
  wet.dispose();
  const bare = createVenueModel({ THREE, scene: new THREE.Group(), quality: 'low' });
  assert.deepEqual(bare.stats.missing, ['StageScreen', 'Ribbon']);
  bare.dispose();
});

test('the venue model shows only while outside, holds still under reduced motion, and disposes what it was given and made', () => {
  const src = modelScene();
  const given = { geometries: new Set(), materials: new Set(), textures: new Set() };
  src.traverse((o) => { if (o.geometry) given.geometries.add(o.geometry); if (o.material) { given.materials.add(o.material); if (o.material.map) given.textures.add(o.material.map); } });
  const ext = createVenueModel({ THREE, scene: src, quality: 'high', reducedMotion: true });
  assert.equal(ext.group.visible, false);
  assert.equal(ext.update(1 / 60, 3, false), false);
  assert.equal(ext.group.visible, false);
  const rib = findNamed(ext.group, 'Ribbon').children[0].material, before = rib.emissiveIntensity;
  assert.equal(ext.update(1 / 60, 3, true, 1), true);
  assert.equal(ext.group.visible, true);
  assert.equal(ext.outside, true);
  assert.equal(rib.emissiveIntensity, before, 'no pulse under reduced motion');
  const made = new Set();
  ext.group.traverse((o) => { if (o.geometry) made.add(o.geometry); if (o.material) made.add(o.material); });
  let freed = 0;
  const all = [...given.geometries, ...given.materials, ...given.textures, ...made];
  for (const d of new Set(all)) d.addEventListener('dispose', () => freed++);
  ext.dispose();
  assert.equal(freed, new Set(all).size, `${new Set(all).size - freed} left undisposed`);
  assert.equal(ext.group.children.length, 0);
});

// ── the live booth flies in only with a model ─────────────────────────────────────────────────
test('until a venue model is set, the booth does not fly in: no url, no arrival', () => {
  assert.equal(CLUB_SHAPE_MODEL.path, null, 'the rejected stand-in must not ship as the live booth\'s opening');
  assert.equal(clubShapeModelUrl(CLUB_SHAPE_MODEL, '/', 'high'), null);
  assert.equal(clubShapeModelUrl({ path: 'club-shape/venue.glb', desktop: 'club-shape/venue-hd.glb' }, '/m/', 'low'), '/m/club-shape/venue.glb');
  assert.equal(clubShapeModelUrl({ path: 'club-shape/venue.glb', desktop: 'club-shape/venue-hd.glb' }, '/', 'high'), '/club-shape/venue-hd.glb');
  assert.equal(clubShapeModelUrl({ path: 'https://cdn.example/v.glb', desktop: null }, '/', 'high'), 'https://cdn.example/v.glb');
  const d = new NoraDirector({ seed: 3, arrival: false });
  assert.equal(d.shot, 'club');
  const seen = new Set();
  for (let bar = 0; bar < 4000; bar++) { const id = d._pick(bar); seen.add(id); d._cut(id, bar, bar, false); }
  assert.ok(!seen.has('arrival'), 'picked the arrival with nowhere to fly');

  const HOST = stripComments(readFileSync('public/newdesign/booth/noraBooth.mjs', 'utf8'));
  assert.doesNotMatch(HOST, /createExterior\(/, 'the booth builds the stand-in');
  assert.match(HOST, /exterior = createVenueModel\(\{ THREE, scene: g\.scene, quality, reducedMotion \}\)/);
  assert.match(HOST, /new NoraDirector\(\{[^}]*arrival: !!exterior \}\)/);
  assert.match(HOST, /mode !== 'arrival' \|\| exterior/, 'a viewer can lock the arrival with no outside');
  assert.match(HOST, /const out = !!exterior && director\.mode !== 'free' && director\.shot === 'arrival';/);
  assert.match(HOST, /if \(venueUrl\) \{[^}]*loadAsync\(venueUrl\)/);
  for (const [name, file] of [['website', 'public/newdesign/radio.jsx'], ['app', 'mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx']]) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /venueUrl: S?\.?clubShapeModelUrl\(S?\.?CLUB_SHAPE_MODEL, [^,]+, tier\.quality\)/, `${name} does not pass the venue model`);
  }
});

// ── the brief tells the modeller the numbers the booth flies by ───────────────────────────────
test('the brief\'s flight path and stage are the booth\'s', () => {
  const doc = readFileSync('docs/BUILD-2026-10-10-club-shape-model.md', 'utf8').replace(/\u2212/g, '-');   // the brief writes a minus as −
  const rows = [...doc.matchAll(/^\| (\d) \| \(([-\d., ]+)\) \| \(([-\d., ]+)\) \| (\d+)° \|$/gm)];
  const keys = _arrivalForTest.ARRIVAL;
  assert.equal(rows.length, keys.length, 'one row a keyframe');
  rows.forEach((r, i) => {
    const p = r[2].split(',').map(Number), t = r[3].split(',').map(Number);
    assert.deepEqual(p, keys[i].p, `keyframe ${i + 1}: camera`);
    assert.deepEqual(t, keys[i].t, `keyframe ${i + 1}: look-at`);
    assert.equal(+r[4], keys[i].fov, `keyframe ${i + 1}: fov`);
  });
  const S = VENUE.STAGE, W = VENUE.WALL;
  assert.ok(doc.includes(`x ${S.x - S.w / 2} … +${S.x + S.w / 2}, z +${S.z - S.d / 2} … +${S.z + S.d / 2}, **${S.h} m** high`), 'the stage');
  assert.ok(doc.includes(`at **z = +${W.z}**`) && doc.includes(`bottom at y ${W.y0}`), 'the screen');
  assert.ok(doc.includes(`**${VENUE.RIM_H} m** high all round`) && doc.includes(`**about ${VENUE.LIP_H} m**`) && doc.includes(`**about ${VENUE.BACK_H} m**`));
  // the Blender snippet draws the same path
  const cams = doc.match(/^cams = \[(.*)\]$/m)[1], looks = doc.match(/^looks = \[(.*)\]$/m)[1];
  assert.equal(cams, keys.map((k) => `(${k.p.join(',')})`).join(','));
  assert.equal(looks, keys.map((k) => `(${k.t.join(',')})`).join(','));
});
