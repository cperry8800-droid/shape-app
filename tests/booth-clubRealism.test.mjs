// The club made more real (owner, 2026-10-26: "its needs to look more real on website and app",
// "need to make these look like they arent just floating orbs"): the room takes its light from the
// LED wall, the beams light the haze, a beam aimed at the camera stays a point instead of a ball of
// light, the air and the shadows are a neutral dark, the crowd is lit where the beams land, and the
// skyline is photographed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import * as THREE from './helpers/booth-three.mjs';
import { mergeGeometries } from './helpers/booth-three.mjs';
import { wallLookGlow } from '../public/newdesign/booth/wallShow.mjs';
import { addBeamHaze } from '../public/newdesign/booth/beamHaze.mjs';
import { createArenaStage } from '../public/newdesign/booth/arenaStage.mjs';
import { NORA_MODEL, skylinePath } from '../public/newdesign/booth/noraBoothState.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const CLUB = read('public/newdesign/booth/club.mjs');
const VENUE = read('public/newdesign/booth/clubVenue.mjs');
const ARENA = read('public/newdesign/booth/arenaStage.mjs');
const HAZE = read('public/newdesign/booth/beamHaze.mjs');
const CREW = read('public/newdesign/booth/crowdPeople.mjs');
const accent = new THREE.Color('#34d6c5').toArray(), ice = new THREE.Color('#d7ecff').toArray();
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

test('the wall\'s light: dark when it is, warm at dawn, the chase brighter than the tunnel, a loop its own colour', () => {
  assert.deepEqual(wallLookGlow('blank', { accent, ice }), [0, 0, 0]);
  assert.deepEqual(wallLookGlow('nonsense', { accent, ice }), [0, 0, 0]);
  const dawn = wallLookGlow('dawn', { accent, ice });
  assert.ok(dawn[0] > dawn[1] && dawn[1] > dawn[2], 'the dawn throws warm light');
  const tunnel = wallLookGlow('tunnel', { accent, ice }), chase = wallLookGlow('chase', { accent, ice });
  assert.ok(luma(chase) > luma(tunnel), 'the chase lights more of the wall than the tunnel\'s lines');
  assert.ok(tunnel[1] > tunnel[0], 'the tunnel is teal');
  assert.deepEqual(wallLookGlow('plate', { accent, ice, plateMean: [0.1, 0.2, 0.4] }).map((v) => +v.toFixed(4)), [0.125, 0.25, 0.5]);
  const unread = wallLookGlow('plate', { accent, ice, plateMean: null });
  assert.ok(luma(unread) > 0 && luma(unread) < 0.1, 'a loop whose picture can\'t be read still glows a little');
  assert.deepEqual(wallLookGlow('plate', { accent, ice, plateMean: [NaN, 0, 0] }), unread);
  // a mean emission, not a peak: the drawn looks stay well under the bloom threshold
  for (const look of ['dawn', 'tunnel', 'chase']) assert.ok(Math.max(...wallLookGlow(look, { accent, ice })) < 0.25, look);
});

test('the club lights the room from the wall: the haze, the crowd\'s faces, Nora\'s back light, the venue\'s crowd', () => {
  assert.match(CLUB, /wallLookGlow\(name, glowCols\)/);
  assert.match(CLUB, /wallGlow\.lerp\(glowA, 1 - Math\.exp\(-dt \/ 0\.45\)\)/, 'eased, never stepped');
  assert.match(CLUB, /fog\.color\.copy\(FOG_BASE\)\.add\(/);
  assert.match(CLUB, /wallLight\.color\.copy\(iceC\)\.lerp\(glowHue/);
  assert.match(CLUB, /tmpC2\.copy\(iceC\)\.multiplyScalar\(0\.006 \+ 0\.008 \* lvl\)\.add\(glowA\.copy\(wallGlow\)/);
  assert.match(CLUB, /glow: wallGlow,/, 'handed on with the show');
  assert.match(VENUE, /const g = state\.wallShow && state\.wallShow\.glow;/);
  assert.match(VENUE, /venueCrowd\.setLight\(CROWD_RIM, crowdFill\.copy\(CROWD_FILL\)\.add\(tmpC\.copy\(wallGlow\)/);
  // a loop's colour is read off its picture, and a picture the page may not read is no error
  assert.match(CLUB, /p\.mean = plateMean\(p\.ctx\.canvas\) \|\| p\.mean/);
  assert.match(CLUB, /catch \(e\) \{ return null; \}/);
});

test('the air and the room\'s black are a neutral dark, not navy', () => {
  const hex = (name) => { const m = CLUB.match(new RegExp(`const ${name} = 0x([0-9a-f]{6});`)); assert.ok(m, name); return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)); };
  for (const name of ['FOG_COLOR', 'BG_COLOR']) {
    const [r, , b] = hex(name);
    assert.ok(b - r <= 4, `${name} leans blue by ${b - r}`);
  }
  assert.match(CLUB, /const HEMI_SKY = new THREE\.Color\(0x171a20\);/);
  assert.match(read('public/newdesign/booth/cinematic.mjs'), /c \+= vec3\(-0\.004, 0\.002, 0\.006\) \* \(1\.0 - smoothstep\(0\.0, 0\.4, l\)\);/);
});

test('every beam lights the haze round it: a sheath on the beams\' own matrices and colours', () => {
  const geo = new THREE.CylinderGeometry(0.3, 1, 1, 8, 1, true);
  geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(9), 3));
  geo.setAttribute('aIntensity', new THREE.InstancedBufferAttribute(new Float32Array(3), 1));
  const beams = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), 3);
  beams.name = 'beams'; beams.renderOrder = 10;
  const haze = addBeamHaze({ THREE, beams, lensRadius: 0.3, widen: 8 });
  assert.equal(haze.mesh.instanceMatrix, beams.instanceMatrix, 'it moves with the beams, no copying');
  assert.equal(haze.mesh.geometry.attributes.aColor, geo.attributes.aColor);
  assert.equal(haze.mesh.geometry.attributes.aIntensity, geo.attributes.aIntensity);
  assert.ok('HAZE_INTENSITY' in haze.mesh.material.defines);
  assert.equal(haze.mesh.count, 3);
  assert.equal(haze.mesh.name, 'beamsHaze');
  assert.ok(haze.mesh.renderOrder < beams.renderOrder);
  haze.mesh.geometry.computeBoundingBox();
  assert.ok(haze.mesh.geometry.boundingBox.max.x > 7.9, 'wider than the beam');
  assert.equal(haze.mesh.material.blending, THREE.AdditiveBlending);
  assert.equal(haze.mesh.material.depthWrite, false);
  haze.dispose();
  assert.ok(geo.attributes.aColor && geo.attributes.aIntensity, 'the beams keep their own attributes');
  // without an intensity attribute (the arena's beams) it reads the colour alone
  const g2 = new THREE.CylinderGeometry(0.3, 1, 1, 8, 1, true);
  g2.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(6), 3));
  const h2 = addBeamHaze({ THREE, beams: new THREE.InstancedMesh(g2, new THREE.MeshBasicMaterial(), 2), lensRadius: 0.3 });
  assert.ok(!('HAZE_INTENSITY' in h2.mesh.material.defines));
  h2.dispose();
  // both stages put one on their beams, and take it down with them
  assert.match(CLUB, /addBeamHaze\(\{ THREE, beams: imBeam,/);
  assert.match(CLUB, /beamHaze\.dispose\(\);/);
  const a = createArenaStage({ THREE, quality: 'high', mergeGeometries });
  const ah = a.group.getObjectByName('arenaBeamsHaze');
  assert.ok(ah, 'the arena\'s beams have their haze');
  assert.equal(ah.instanceMatrix, a.group.getObjectByName('arenaBeams').instanceMatrix);
  a.dispose();
});

test('a beam aimed at the camera stays a point of light, not a ball hanging in the air', () => {
  const VEND = /vEnd = dot\(normalize\((?:m|mat3\(M\)) \* vec3\(0\.0, -1\.0, 0\.0\)\), normalize\(cameraPosition - \(M \* vec4\(0\.0, 0\.0, 0\.0, 1\.0\)\)\.xyz\)\);/;
  for (const [name, src] of [['club', CLUB], ['arena', ARENA], ['haze', HAZE]]) assert.match(src, VEND, name);
  assert.match(CLUB, /\* \(1\.0 - 0\.85 \* smoothstep\(0\.7, 0\.95, vEnd\)\)/);
  assert.match(ARENA, /core \*= 1\.0 - 0\.85 \* smoothstep\(0\.7, 0\.95, vEnd\);/);
  assert.match(HAZE, /float side = 1\.0 - smoothstep\(0\.55, 0\.85, vEnd\);/, 'the sheath goes before the beam does');
  // the lenses: a crisp point, not a glare ball once bloomed
  assert.match(CLUB, /tmpC\.copy\(bc\)\.multiplyScalar\(0\.5 \+ 1\.3 \* f\.intensity\);/);
  const a = createArenaStage({ THREE, quality: 'high', mergeGeometries });
  const lens = a.group.getObjectByName('arenaSpotLenses').geometry.attributes.color.array;
  assert.ok(Math.max(...lens) <= 1.5 + 1e-6, `spot lenses at ${Math.max(...lens)}`);
  a.dispose();
});

test('the crowd is lit where the beams land: pools at head height, in the beam\'s colour', () => {
  assert.match(CREW, /const POOLS = 8;/);
  assert.match(CREW, /uniform vec4 uPool\[\$\{POOLS\}\]; uniform vec3 uPoolC\[\$\{POOLS\}\];/);
  assert.match(CREW, /function setPools\(list = \[\]\)/);
  assert.match(CREW, /return \{ group, setPerson, commit, setLight, setPools,/);
  assert.match(CLUB, /const POOL_Y = FLOOR_Y \+ 1\.6;/);
  assert.match(CLUB, /if \(avatars && avatars\.setPools\) avatars\.setPools\(pools\);/, 'the older avatar crowd has none');
});

test('the skyline is photographed: an atlas per tier, the same on the website and in the app, wired through both hosts', () => {
  assert.equal(skylinePath(NORA_MODEL, 'high'), 'nora/skyline.webp');
  assert.equal(skylinePath(NORA_MODEL, 'low'), 'nora/skyline-lo.webp');
  assert.equal(skylinePath(null, 'high'), null);
  for (const [file, cap] of [['skyline.webp', 300_000], ['skyline-lo.webp', 100_000]]) {
    const web = readFileSync(new URL('../public/nora/' + file, import.meta.url));
    const app = readFileSync(new URL('../mobile-app/public/nora/' + file, import.meta.url));
    assert.ok(web.equals(app), `${file}: the app serves the same file`);
    assert.equal(web.subarray(8, 12).toString('latin1'), 'WEBP');
    assert.ok(statSync(new URL('../public/nora/' + file, import.meta.url)).size < cap, `${file} over ${cap} bytes`);
  }
  assert.match(read('public/newdesign/radio.jsx'), /skylineUrl: S\.noraAssetUrl\(S\.skylinePath\(S\.NORA_MODEL, tier\.quality\), "\/"\),/);
  assert.match(read('mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx'), /skylineUrl: noraAssetUrl\(skylinePath\(NORA_MODEL, tier\.quality\), import\.meta\.env\.BASE_URL\),/);
  assert.match(read('public/newdesign/booth/noraBooth.mjs'), /accent: CLUB_ACCENT, skylineUrl \}\);/);
  // the venue swaps the photographs in once loaded, and keeps the drawn windows if they never come
  assert.match(VENUE, /if \(skylineUrl && typeof Image !== 'undefined'\)/);
  assert.match(VENUE, /if \(venueDisposed\) return;/);
  assert.match(VENUE, /matTower\.map = t;/);
});

test('the room\'s stone, ceilings and soffits are a neutral charcoal, not navy', () => {
  for (const name of ['C_DARK', 'C_WALL', 'C_WALKWAY', 'C_SOFFIT_RAIL', 'C_POST', 'C_CEIL']) {
    const m = VENUE.match(new RegExp(`const ${name} = \\[([^\\]]+)\\];`));
    assert.ok(m, name);
    const [r, , b] = m[1].split(',').map(Number);
    assert.ok(b - r <= 0.001, `${name} leans blue by ${(b - r).toFixed(4)}`);
  }
  assert.match(VENUE, /gr\.addColorStop\(0, 'rgb\(44,42,41\)'\); gr\.addColorStop\(1, 'rgb\(30,29,29\)'\);/, 'the fascia stone is charcoal');
  assert.match(CLUB, /color: 0x070708, side: THREE\.BackSide \}\); tmp\.push\(roomM\);   \/\/ was navy 0x06080d/);
});

test('the palms are not one plant: three crowns of fronds (two on phones), neighbours different, each its own height', () => {
  assert.match(VENUE, /const FROND_KINDS = LOW \? 2 : 3;/);
  assert.match(VENUE, /palmFronds\(mulberry32\(seed \* 29 \+ 3 \+ k \* 101\), PQ\)/, 'the first crown keeps the old seed');
  assert.match(VENUE, /const kindOf = \(i\) => i % FROND_KINDS;/);
  assert.match(VENUE, /const palmRnd = mulberry32\(seed \* 31 \+ 7\);/, 'its own stream: the rest of the room stays where it was');
  assert.match(VENUE, /for \(const im of \[imTrunk, \.\.\.imFronds, imBeam, imSofa, imTable, imCandle, imFig\]\) im\.dispose\(\);/);
});

test('the stage deck shows the wall in its polish: the wall\'s own light, only where a reflection would reach it', () => {
  assert.match(CLUB, /const sheenGeo = own\(new THREE\.ShapeGeometry\(shape, 24\)\);/, 'the deck\'s own outline');
  assert.match(CLUB, /mesh\(sheenGeo, sheenM, 'stageSheen'\)\.renderOrder = 2;/);
  assert.match(CLUB, /float toWall = smoothstep\(0\.0, 0\.35, -V\.z\);/, 'a reflected line of sight running toward the wall');
  assert.match(CLUB, /float fres = pow\(1\.0 - clamp\(V\.y, 0\.0, 1\.0\), 3\.0\);/, 'strongest at a grazing angle');
  assert.match(CLUB, /sheenU\.uGlow\.value\.copy\(wallGlow\);/, 'in the wall\'s current colour');
  assert.doesNotMatch(CLUB, /buildFloorEnvironment/, 'not an environment map: that holds one colour and the wall changes');
  // the gear and Nora keep the small screen's environment
  assert.match(CLUB, /const wg = new THREE\.PlaneGeometry\(7\.2, 4\.2\);/);
});
