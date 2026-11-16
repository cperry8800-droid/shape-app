// Club Shape's side rooms (owner, 2026-10-26: "i also want to create spearate side rooms/lounges and
// views of those"): the VIP lounge on the left and the cocktail bar on the right, opening off the dance
// floor through the ground tier's bay 3 (clubRooms.mjs), built in clubVenue.mjs (2c), filmed by the
// director's Lounge and Bar shots and chosen from a chip on the website and in the app.
// clubVenue.mjs imports three's addons, which Node can't resolve from the repo root, so its numbers
// are read from the source; clubRooms.mjs and noraDirector.mjs import nothing of three and are run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIDE_ROOMS, roomX, inSideRoom } from '../public/newdesign/booth/clubRooms.mjs';
import { evalShot, SHOTS, NoraDirector } from '../public/newdesign/booth/noraDirector.mjs';
import { LENS } from '../public/newdesign/booth/cinematic.mjs';
import { createPeopleCrowd, decodePeoplePack } from '../public/newdesign/booth/crowdPeople.mjs';
import * as THREE from './helpers/booth-three.mjs';
import { patchRoomSurface } from '../public/newdesign/booth/roomSurface.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const read = (p) => stripComments(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const VENUE = read('public/newdesign/booth/clubVenue.mjs');
const num = (re) => +VENUE.match(re)[1];
const FAR_WIN_Z = num(/const FAR_WIN_Z = (-?[\d.]+);/), END_WIN_Z = num(/const END_WIN_Z = (-?[\d.]+);/);
const SLAB_T = num(/const SLAB_T = ([\d.]+);/), LEVEL0 = num(/LEVELS: \[([\d.]+),/), FLOOR_Y = num(/FLOOR_Y: (-?[\d.]+),/);
const X_OUT = num(/X_OUT: ([\d.]+),/), WIN_X = num(/const WIN_X = ([\d.]+);/);
const lerp = (a, b, k) => a + (b - a) * k;
const R = SIDE_ROOMS, D = R.door;

test('the doorway is the ground tier\'s bay 3, and each room opens off it, as tall as the tier', () => {
  assert.ok(Math.abs(lerp(FAR_WIN_Z, END_WIN_Z, D.bay / 8) - D.z0) < 0.01, 'its far side is a bay line');
  assert.ok(Math.abs(lerp(FAR_WIN_Z, END_WIN_Z, (D.bay + 1) / 8) - D.z1) < 0.01, 'its near side is the next');
  assert.equal(R.floorY, FLOOR_Y);
  assert.ok(Math.abs(R.ceilY - (LEVEL0 - SLAB_T)) < 1e-9, 'the room\'s ceiling is the slab underside, so the doorway is the room\'s height');
  assert.ok(Math.abs(R.x0 - (X_OUT + 0.3)) < 1e-9, 'it starts at the outer wall\'s outside face');
  assert.ok(R.z0 < D.z0 - 3 && R.z1 > D.z1 + 3, 'the room runs well past the doorway either way');
  assert.ok(Math.abs((R.z0 + R.z1) / 2 - (D.z0 + D.z1) / 2) < 0.05, 'centred on it');
  assert.equal(R.lounge, -R.bar, 'one each side');
  assert.equal(roomX(-1, 2), -(R.x0 + 2));
  assert.ok(inSideRoom(roomX(1, 4), 1, -22) && !inSideRoom(10, 1, -22) && !inSideRoom(roomX(1, 4), 1, -40));
});

test('the hall makes way: the two boxes, the glass and sill in the doorway, the wall, and the booths before it', () => {
  assert.match(VENUE, /import \{ SIDE_ROOMS, roomX \} from '\.\/clubRooms\.mjs';/);
  assert.match(VENUE, /if \(ti === 0 && inDoor\(za, zb\)\) continue;/);
  // which ground-tier boxes give way: exactly the two in the bay, both sides
  const gone = [];
  for (let k = 0; k < 16; k++) {
    const za = lerp(FAR_WIN_Z, END_WIN_Z, k / 16), zb = lerp(FAR_WIN_Z, END_WIN_Z, (k + 1) / 16);
    if (za >= D.z0 - 0.05 && zb <= D.z1 + 0.05) gone.push(k);
  }
  assert.deepEqual(gone, [6, 7]);
  // the outer wall: either side of the doorway full height, and over it from the slab up
  assert.match(VENUE, /box\(s \* X_OUT, s \* \(X_OUT \+ 0\.3\), FLOOR_Y, CEIL_Y \+ 2\.2, Z_FAR, DOOR\.z0\)/);
  assert.match(VENUE, /box\(s \* X_OUT, s \* \(X_OUT \+ 0\.3\), FLOOR_Y, CEIL_Y \+ 2\.2, DOOR\.z1, Z_STAGE\)/);
  assert.match(VENUE, /box\(s \* X_OUT, s \* \(X_OUT \+ 0\.3\), TIERS\[0\]\.y1, CEIL_Y \+ 2\.2, DOOR\.z0, DOOR\.z1\)/);
  assert.doesNotMatch(VENUE, /box\(s \* X_OUT, s \* \(X_OUT \+ 0\.3\), FLOOR_Y, CEIL_Y \+ 2\.2, Z_FAR, Z_STAGE\)/, 'no wall across the doorway');
  // no glass or sill across it on the ground tier; its transom stays as the doorway's head
  assert.match(VENUE, /ti === 0 \? \[\[FAR_WIN_Z, DOOR\.z0\], \[DOOR\.z1, END_WIN_Z\]\] : \[\[FAR_WIN_Z, END_WIN_Z\]\]/);
  assert.equal((VENUE.match(/ti === 0 \? \[\[FAR_WIN_Z, DOOR\.z0\], \[DOOR\.z1, END_WIN_Z\]\]/g) || []).length, 2, 'the sill and the glass');
  // the floor booths: none stands in the aisle to the doorway (the rule as the venue applies it)
  assert.match(VENUE, /if \(\(!LOW \|\| k % 2 === 0\) && !inDoor\(-9 - k \* 3 - 1\.2, -9 - k \* 3 \+ 1\.2\)\) bayZ\.push\(-9 - k \* 3\);/);
  const inDoor = (za, zb) => za >= D.z0 - 0.05 && zb <= D.z1 + 0.05;
  const clear = [D.z0 + 0.25, D.z1 - 0.25];   // between the columns
  for (const low of [false, true]) {
    const kept = [];
    for (let k = 0; k < 12; k++) if ((!low || k % 2 === 0) && !inDoor(-9 - k * 3 - 1.2, -9 - k * 3 + 1.2)) kept.push(-9 - k * 3);
    for (const z of kept) assert.ok(z + 1 < clear[0] || z - 1 > clear[1], `a booth at z ${z} (±1 m) stands in the doorway`);
    assert.ok(kept.length >= (low ? 5 : 10), 'and the rest of the booths stay');
  }
});

// Owner, 2026-11-16, of the live room beside its pictures: "is the club itsself improved. The nightclub
// im talking about", then asked for this room upgraded. The lounge and the bar were its flattest part:
// every floor and wall one baked colour, furniture sitting on nothing.
test('the rooms’ floors and walls carry a surface, drawn on three’s own basic shader', () => {
  const lib = THREE.ShaderLib.basic;
  const sh = patchRoomSurface({ uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader });
  // every anchor the patch hangs on is still in three's shader: a renamed chunk would drop the
  // surface without an error, and the rooms would go back to flat colour unnoticed
  for (const chunk of ['#include <common>', '#include <begin_vertex>']) assert.ok(lib.vertexShader.includes(chunk), `three's basic vertex shader has ${chunk}`);
  for (const chunk of ['#include <common>', '#include <color_fragment>']) assert.ok(lib.fragmentShader.includes(chunk), `three's basic fragment shader has ${chunk}`);
  assert.match(sh.vertexShader, /varying vec3 vRoomPos;\nvarying vec3 vRoomNrm;/);
  assert.match(sh.vertexShader, /#include <begin_vertex>\n  vRoomPos = \(modelMatrix \* vec4\(transformed, 1\.0\)\)\.xyz;\n  vRoomNrm = mat3\(modelMatrix\) \* normal;/);
  assert.match(sh.fragmentShader, /varying vec3 vRoomPos;\nvarying vec3 vRoomNrm;\nfloat roomHash\(vec2 q\)/);
  const body = sh.fragmentShader.slice(sh.fragmentShader.indexOf('#include <color_fragment>'));
  assert.match(body, /if \(rn\.y > 0\.6\) \{/, 'floors');
  assert.match(body, /\} else if \(rn\.y > -0\.6\) \{/, 'walls; the ceiling is left as the bake has it');
  assert.match(body, /cameraPosition - rp/, 'the floor’s polish lifts at a grazing angle');
  // nothing in the room may shimmer: each pattern fades to its mean where it runs fast across the screen
  assert.equal((body.match(/float fade = clamp\(1\.0 - fwidth\(u\) \* 3\.0, 0\.0, 1\.0\);/g) || []).length, 2, 'the boards and the panels both fade');
  assert.equal((body.match(/mix\(1\.0, [^;]+, fade\);/g) || []).length, 2);
  // it only ever scales the baked colour: no light of its own, nothing that can flash
  assert.ok(!/uTime|sin\(.*uT/.test(body), 'nothing here moves');
  assert.equal((body.match(/diffuseColor\.rgb \*=/g) || []).length, 3);
  assert.ok(!/diffuseColor\.rgb \+=/.test(body));
  // patched once: a second pass over an already patched shader finds no anchor to hang on twice
  const src = readFileSync(new URL('../public/newdesign/booth/roomSurface.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...src.matchAll(/^import\b.*$/gm)].map((m) => m[0]), [], 'pure: no three, no DOM');
});

test('the rooms’ solids shade what they sit on, and the lamps still cast no shadows', () => {
  const src = readFileSync(new URL('../public/newdesign/booth/clubVenue.mjs', import.meta.url), 'utf8').match(/── 2c\.[\s\S]*?── 3\./)[0];
  // the shell wears the surface; the furniture keeps the boxes' plain material
  assert.match(VENUE, /const matRooms = own\(new THREE\.MeshBasicMaterial\(\{ vertexColors: true \}\)\);\s*matRooms\.onBeforeCompile = patchRoomSurface;/);
  assert.match(src, /mesh\(merge\(ROOM, 'sideRooms'\), matRooms, 'venueSideRooms'\);/);
  assert.match(src, /mesh\(merge\(ROOM_FURN, 'sideRoomFurniture'\), matBoxes, 'venueSideRoomFurniture'\);/);
  assert.match(src, /ROOM\.push\(\.\.\.shell\);\s*ROOM_FURN\.push\(\.\.\.P\);/);
  // every box of furniture is a solid in the room's grid, with the slabs behind its six sides
  assert.match(src, /OCC\.push\(\[Math\.min\(xa, xb\), Math\.min\(y0, y1\), Math\.min\(u0, u1\), Math\.max\(xa, xb\), Math\.max\(y0, y1\), Math\.max\(u0, u1\)\]\);/);
  assert.equal((src.match(/const OCC = \[/g) || []).length, 1);
  // the bake reads that grid for contact shade, fewer rays on a phone
  assert.match(src, /const OGr = boxGrid\(OCC, 1\.0\), AO = LOW \? 3 : 5;/);
  assert.match(src, /for \(const g of shell\) bakeMesh\(\{[^}]*OG: OGr, aoRays: AO, aoLen: 1\.0, aoStrength: 0\.7,/);
  assert.match(src, /for \(const g of P\) bakeMesh\(\{[^}]*OG: OGr, aoRays: AO, aoLen: 0\.7, aoStrength: 0\.6,/);
  // and still no cast shadows: one room, its own light (a shadowed lamp through a grid of boxes
  // would stripe the floor at the bake's 0.4 m cells)
  assert.match(src, /const light = \(d, y, u, c, r0, range, dir = null, cos0, cos1\) => L\.push\(\{ p: \[X\(d\), y, u\], c, r0, range, dir, cos0, cos1, shadow: false \}\);/);
});

test('the lounge and the bar are rooms: furnished, lit by their own lamps, with people, a sign at each door', () => {
  // the section itself, comments and all (they name what each piece is)
  const src = readFileSync(new URL('../public/newdesign/booth/clubVenue.mjs', import.meta.url), 'utf8').match(/── 2c\.[\s\S]*?── 3\./)[0];
  assert.match(src, /buildRoom\(SIDE_ROOMS\.lounge, 'lounge'\);\s*buildRoom\(SIDE_ROOMS\.bar, 'bar'\);/);
  for (const name of ['venueSideRooms', 'venueSideRoomFurniture', 'venueSideRoomLights', 'venueLoungeOnyx', 'venueSideRoomSigns']) assert.ok(src.includes(`'${name}'`), name);
  // each room's lamps are baked into its own geometry only
  assert.match(src, /const LGr = lightGrid\(L, 2\);/);
  assert.match(src, /for \(const g of shell\) bakeMesh\(/);
  assert.match(src, /for \(const g of P\) bakeMesh\(/);
  // the pieces each room is made of
  for (const [what, re] of [
    ['the onyx wall', /ONYX\.push\(quad\(/], ['the banquette', /the banquette, all along the back wall/], ['chandeliers', /the chandelier: a ring of crystal drops/],
    ['the champagne bar', /the champagne bar across the end by the doorway/], ['the rope', /the rope and the doorman at the door/],
    ['the counter', /the counter: fluted front, marble top/], ['the back bar', /the back bar: a cabinet, a lit panel, three glass shelves of bottles/],
    ['pendants', /pendants over the counter/], ['the neon mark', /the Shape mark in neon on the end wall/], ['high tables', /high tables with people round them/],
  ]) assert.match(src, re, what);
  // bottles stay under the bloom threshold: silhouettes against the panel, not a lit bookshelf
  const bottles = JSON.parse(src.match(/const BOTTLES = (\[\[[\s\S]*?\]\]);/)[1]);
  for (const c of bottles) assert.ok(Math.max(...c) < 0.6, `bottle ${c} would bloom`);
  // their guests: a crowd of their own, none of the stage's direct light, lit from the camera's side
  assert.match(VENUE, /roomCrowd = createCrowd\(\{ THREE, pack, people, lodCount, rnd: rnd2, lods: \[stand, sit\], stageFalloff: 1e4, name: 'venueRoomCrowd', house: ROOM_HOUSE, fill: 'view' \}\);/);
  // the updated people, at their best: the near figure standing, the detailed seated one sitting, on
  // phones too (owner: "make sure the people have the updated graphics")
  assert.match(VENUE, /const stand = 'near', sit = crowdHasLod\(pack, 'seatNear'\) \? 'seatNear' : 'seat';/);
  assert.match(VENUE, /const ROOM_HOUSE = \{ near: 0, far: 0, fall: 1, ambient: 0\.9 \};/);
  assert.match(VENUE, /if \(roomCrowd\) \{ roomCrowd\.dispose\(\); roomCrowd = null; \}/);
  assert.match(VENUE, /PALMS\.push\(\.\.\.ROOM_PALMS\);/);
  assert.match(VENUE, /LIGHTS\.push\(\.\.\.ROOM_SPILL\);/, 'their glow spills out through the doorway onto the hall');
});

test('a crowd can take its fill from the camera\'s side (the rooms\' guests) instead of the stage\'s', () => {
  const pack = decodePeoplePack(readFileSync('public/nora/crowd-people-lo.bin.txt', 'utf8'));
  let a = 7;
  const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const shaderOf = (fill) => {
    const crowd = createPeopleCrowd({ THREE, pack, people: [{ lod: 0 }], lodCount: [1], rnd, lods: ['near'], fill });
    const mat = crowd.group.children.find((m) => m.count > 0).material;
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    mat.onBeforeCompile(sh);
    crowd.dispose();
    return sh;
  };
  const view = shaderOf('view'), stage = shaderOf(undefined);
  assert.match(view.fragmentShader, /vec3 toStage = uFillView > 0\.5 \? normalize\(vViewPosition\) : normalize\(\(viewMatrix \* vec4\(0\.0, 0\.35, 1\.0, 0\.0\)\)\.xyz\);/);
  assert.equal(view.uniforms.uFillView.value, 1);
  assert.equal(stage.uniforms.uFillView.value, 0, 'by default the fill comes from the stage');
});

test('the Lounge and Bar shots stand inside their rooms, aim into them, and have lenses', () => {
  for (const id of ['lounge', 'bar']) {
    assert.ok(SHOTS[id] && SHOTS[id].weight >= 1, `${id} is a shot the rotation plays`);
    assert.ok(LENS[id] && Number.isFinite(LENS[id].focusAt), `${id} has a lens focused into the room`);
    const s = id === 'lounge' ? R.lounge : R.bar;
    for (let u = 0; u <= 1.0001; u += 0.05) {
      const o = evalShot(id, u, 3.3, { head: { x: 0, y: 1.6, z: 0.3 }, jog: [], screen: [] }, { pos: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 0 });
      assert.ok(inSideRoom(o.pos.x, o.pos.y, o.pos.z, 0.5), `${id} at u=${u.toFixed(2)}: the camera is in the room`);
      assert.ok(inSideRoom(o.target.x, o.target.y, o.target.z, 0.2), `${id}: it looks into the room`);
      assert.equal(Math.sign(o.pos.x), s, `${id} is on its own side`);
    }
  }
  // the rotation cuts to them now and then, and a locked camera holds them
  const d = new NoraDirector({ seed: 11 });
  const seen = new Set();
  for (let bar = 0; bar < 4000; bar++) { const id = d._pick(bar); seen.add(id); d._cut(id, bar, bar, false); }
  assert.ok(seen.has('lounge') && seen.has('bar'));
});

test('the website and the app each offer the two rooms as cameras, in every language', () => {
  const web = read('public/newdesign/radio.jsx');
  const app = read('mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx');
  for (const [name, src, q] of [['website', web, '"'], ['app', app, "'"]]) {
    for (const id of ['lounge', 'bar']) {
      assert.ok(src.includes(`setCamera(${q}${id}${q})`), `${name}: a ${id} chip`);
      assert.ok(src.includes(`aria-pressed={room === ${q}${id}${q}}`), `${name}: it shows when it is on`);
    }
    assert.ok(src.includes('aria-pressed={!free && !room}'), `${name}: Auto camera is off while a room is shown`);
  }
  assert.match(app, /tr\('radio:booth\.lounge', \{ defaultValue: 'Lounge' \}\)/);
  assert.match(app, /tr\('radio:booth\.bar', \{ defaultValue: 'Bar' \}\)/);
  for (const loc of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(readFileSync(`mobile-app/src/i18n/catalogs/${loc}/radio.json`, 'utf8'));
    assert.ok(cat['booth.lounge'] && cat['booth.bar'], `${loc}: both strings`);
  }
  // the booth accepts any shot the director has, so the chips need nothing more from it
  assert.match(read('public/newdesign/booth/noraBooth.mjs'), /Object\.prototype\.hasOwnProperty\.call\(SHOTS, mode\)/);
});
