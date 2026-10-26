// The club as a venue seen from the stage (owner, 2026-10-26: "this needs to look more like a legit
// club/venue from a stage perspective", "the booth needs to be larger", "yes need both speakers on the
// sides etc", "booth speakers"): a four-deck booth 2.5 m wide, a booth speaker on a stand each side of
// it aimed at her head, a crowd barrier along the stage's nose, sub stacks on the floor either side,
// the front-of-house desk out in the room, and a Behind Nora shot that looks out from the stage.
// club.mjs and cdj3000.mjs import three's addons, which Node can't resolve from the repo root, so
// their numbers are read from the source; noraDirector.mjs imports nothing and is run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evalShot, SHOTS, _droneForTest } from '../public/newdesign/booth/noraDirector.mjs';
import { LENS } from '../public/newdesign/booth/cinematic.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const read = (p) => stripComments(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const CLUB = read('public/newdesign/booth/club.mjs');
const CDJ = read('public/newdesign/booth/cdj3000.mjs');
const SITE = read('public/newdesign/booth/noraBooth.mjs');
const PROTO = read('prototypes/nora-booth/src/main.mjs');

// one entry of CLUB_DIMS: a number, or an object of numbers
function dim(key) {
  const block = CLUB.match(/export const CLUB_DIMS = \{([\s\S]*?)\n\};/)[1];
  const obj = block.match(new RegExp(`\\b${key}: \\{([^}]*)\\}`));
  if (obj) return Object.fromEntries([...obj[1].matchAll(/(\w+):\s*(-?[\d.]+)/g)].map((m) => [m[1], +m[2]]));
  return +block.match(new RegExp(`\\b${key}: (-?[\\d.]+)`))[1];
}
const nums = (src, re) => src.match(re)[1].split(',').map(Number);
const BOOTH = dim('BOOTH'), STAGE = dim('STAGE'), CROWD = dim('CROWD'), BS = dim('BOOTH_SPEAKERS');
const SUBS = dim('SUBS'), FOH = dim('FOH'), BARRIER_X = dim('BARRIER_X'), FLOOR_Y = dim('FLOOR_Y');
const CDJ_W = +CDJ.match(/CDJ_DIMS = \{ w: ([\d.]+)/)[1];
const OUTER = nums(CDJ, /OUTER_DECK_X = Object\.freeze\(\[([^\]]+)\]\)/);
const INNER = nums(SITE, /const DECK_X = \[([^\]]+)\]/);
const stageFrontZ = (x) => {   // club.mjs's own curve
  const u = Math.min(1, Math.abs(x) / STAGE.x);
  return STAGE.sideZ - (STAGE.sideZ - STAGE.frontZ) * Math.sqrt(1 - u * u);
};
const HEAD = { x: 0, y: 1.6, z: 0.3 };
const ctx = { head: HEAD, jog: [HEAD, HEAD], screen: [HEAD, HEAD], mixer: HEAD, deck: 0, lookSide: 1 };
const shot = (id, u) => evalShot(id, u, 3.7, ctx, { pos: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 0 });

test('the booth is a club booth: 2.5 m, four decks and the mixer, the outer pair clear of hers and inside the case', () => {
  assert.ok(BOOTH.x1 - BOOTH.x0 >= 2.4, `the booth is ${BOOTH.x1 - BOOTH.x0} m wide`);
  assert.deepEqual(INNER, [-0.391, 0.391], 'Nora\'s two decks stay where her hands reach them');
  assert.deepEqual(nums(PROTO, /const DECK_X = \[([^\]]+)\]/), INNER, 'the prototype places them the same');
  assert.equal(OUTER.length, 2);
  for (let i = 0; i < 2; i++) {
    const side = Math.sign(OUTER[i]);
    assert.equal(side, Math.sign(INNER[i]), 'deck 3 on her left, deck 4 on her right');
    const gap = Math.abs(OUTER[i]) - CDJ_W / 2 - (Math.abs(INNER[i]) + CDJ_W / 2);
    assert.ok(gap > 0.01 && gap < 0.08, `the outer deck stands beside hers (gap ${gap.toFixed(3)} m)`);
    assert.ok(Math.abs(OUTER[i]) + CDJ_W / 2 < BOOTH.x1 - 0.1, 'and on the table, clear of its edge');
  }
  // both hosts stand them up, cued: drawn once, never played
  for (const [name, src] of [['site', SITE], ['prototype', PROTO]]) {
    assert.match(src, /\[3, 4\]\.forEach\(\(n, i\) => \{[\s\S]{0,400}?OUTER_DECK_X\[i\][\s\S]{0,200}?d\.set\(idleDeckState\(n\)\); d\.update\(0, 0\);/, `${name}: decks 3 and 4`);
  }
  assert.match(SITE, /d\.set\(idleDeckState\(n\)\); d\.update\(0, 0\);\s*scene\.add\(d\.group\); owned\.parts\.push\(d\);/, 'the site disposes them with the rest');
  assert.match(CDJ, /return \{ playing: false, jogAngle: 0, onAir: false, padsLit: new Array\(8\)\.fill\(null\),\s*screen: \{ deckLabel: 'DECK ' \+ n, loaded: false/);
});

test('the booth\'s lit front keeps its proportions at the new width: its canvas takes the fascia\'s aspect', () => {
  // a 1024-wide canvas on the 2.5 m front stretched the slats and the Shape mark 1.8× across
  assert.match(CLUB, /const fasciaW = BOOTH\.x1 - BOOTH\.x0 - 0\.07, fasciaH = TABLE_Y - STAND_Y - 0\.03 - 0\.1;/);
  assert.match(CLUB, /const fasciaPx = Math\.round\(\(600 \* fasciaW\) \/ fasciaH \/ 8\) \* 8;/);
  assert.match(CLUB, /fasciaTextures\(THREE, rnd, fasciaPx, low \? 0\.55 : 1\)/);
  assert.match(CLUB, /const fw = fasciaW, fh = fasciaH;/, 'the plane is the size the canvas was drawn for');
  const TABLE_Y = dim('TABLE_Y'), STAND_Y = dim('STAND_Y');
  const fw = BOOTH.x1 - BOOTH.x0 - 0.07, fh = TABLE_Y - STAND_Y - 0.13, px = Math.round((600 * fw) / fh / 8) * 8;
  assert.ok(Math.abs(px / 600 / (fw / fh) - 1) < 0.01, 'canvas and plane share an aspect');
  // the running light reads the slats in the same frame (no 1024 left in the shader)
  const slat = CLUB.match(/const SLAT_FRAG = \/\* glsl \*\/`([\s\S]*?)`;/)[1];
  assert.match(slat, /float x = vUv\.x \* uW/);
  assert.match(slat, /step\(x, uW - 64\.0\)/);
  assert.doesNotMatch(slat, /1024|960|512|448/);
  assert.match(CLUB, /uW: \{ value: fasciaPx \}/);
});

test('a booth speaker each side: beside the booth, on the riser, its front turned to her head', () => {
  const riser = CLUB.match(/const riser = \{ x: ([\d.]+), z0: (-?[\d.]+), z1: ([\d.]+) \}/).slice(1).map(Number);
  const halfW = 0.52 / 2, halfD = 0.5 / 2, reach = Math.hypot(halfW, halfD);
  assert.ok(BS.x - reach > BOOTH.x1, 'clear of the booth\'s end');
  assert.ok(BS.x + reach < riser[0] && BS.z - reach > riser[1] && BS.z + reach < riser[2], 'standing on the riser');
  assert.ok(BS.z > BOOTH.z1, 'a little behind her line, as a DJ\'s monitors stand');
  // the yaw club.mjs gives the cabinet (local −Z is its front) points that front at her
  assert.match(CLUB, /const yaw = Math\.atan2\(-x, BS\.aimZ - z\);/);
  assert.match(CLUB, /new THREE\.Euler\(0, yaw \+ Math\.PI, 0\)/);
  for (const side of [-1, 1]) {
    const x = side * BS.x, yaw = Math.atan2(-x, BS.aimZ - BS.z) + Math.PI;
    const front = [-Math.sin(yaw), -Math.cos(yaw)];   // local (0, 0, −1) turned by yaw
    const toHer = [0 - x, BS.aimZ - BS.z], len = Math.hypot(...toHer);
    assert.ok((front[0] * toHer[0] + front[1] * toHer[1]) / len > 0.999, `the ${side < 0 ? 'left' : 'right'} speaker faces her`);
  }
  assert.ok(BS.aimY > 1.5 && BS.aimY < 1.75, 'aimed at her ears');
  for (const name of ['boothSpeakerCabinets', 'boothSpeakerGrilles', 'boothSpeakerTrim', 'boothSpeakerLeds']) assert.ok(CLUB.includes(`'${name}'`), name);
});

test('no camera on her looks through a booth speaker', () => {
  const reach = Math.hypot(0.26, 0.25) + 0.05;
  for (const id of ['wide', 'panorama', 'profile', 'crane', 'behind', 'shoulder', 'face', 'overhead']) {
    for (let u = 0; u <= 1.0001; u += 0.05) {
      const P = shot(id, u).pos;
      for (const side of [-1, 1]) {
        const cx = side * BS.x, cz = BS.z;
        // the sight line from the lens to her head, in plan: nearest approach to the cabinet's centre
        const dx = HEAD.x - P.x, dz = HEAD.z - P.z, k = Math.max(0, Math.min(1, ((cx - P.x) * dx + (cz - P.z) * dz) / (dx * dx + dz * dz)));
        const d = Math.hypot(P.x + k * dx - cx, P.z + k * dz - cz);
        assert.ok(d > reach, `${id} at u=${u.toFixed(2)} passes ${d.toFixed(2)} m from the ${side < 0 ? 'left' : 'right'} speaker`);
      }
    }
  }
});

test('the front of house: a barrier in the gap the crowd keeps, the subs beside it on the floor, the desk out in the room', () => {
  // the barrier follows the stage's nose 0.2 m out; the crowd keeps 0.35 m off it
  assert.match(CLUB, /const nose = \(x\) => stageFrontZ\(Math\.min\(Math\.abs\(x\), STAGE\.x\)\) - 0\.2;/);
  assert.match(CLUB, /pz > stageFrontZ\(Math\.min\(Math\.abs\(px\), STAGE\.x\)\) - 0\.35\) continue;/);
  assert.ok(BARRIER_X < STAGE.x, 'the barrier ends before the stage turns its corner');
  // the subs: two cabinets 1.2 m wide each side, clear of the barrier, the stage and the crowd
  const inner = SUBS.x - 1.22 / 2 - 0.6, outer = SUBS.x + 1.22 / 2 + 0.6, zFront = SUBS.z - 0.425, zBack = SUBS.z + 0.425;
  assert.ok(inner > BARRIER_X + 0.2, 'the subs stand past the barrier\'s end');
  assert.ok(zBack < stageFrontZ(inner) - 0.1, 'in front of the stage deck, on the floor');
  assert.ok(zFront > CROWD.z0 + 0.3 && outer < CROWD.x + 0.5, 'and in front of the crowd');
  // the desk: out in the crowd, which keeps clear of it
  assert.ok(FOH.z < CROWD.z0 - 10 && FOH.z > CROWD.z1 + 10, 'front of house sits mid-room');
  assert.match(CLUB, /if \(Math\.abs\(px - F\.x\) < F\.w \/ 2 \+ 0\.35 && Math\.abs\(pz - F\.z\) < F\.d \/ 2 \+ 0\.35\) continue;/);
  for (const name of ['barrierFrame', 'barrierMesh', 'subCabinets', 'subGrilles', 'fohRiser', 'fohFrame', 'fohScreens']) assert.ok(CLUB.includes(`'${name}'`), name);
  // phones get one sub high and wider barrier panels (fewer draws of the same thing)
  assert.match(CLUB, /step = low \? 1\.2 : 1\.0/);
  assert.match(CLUB, /j < \(low \? 1 : 2\)/);
});

test('the drone\'s skim over the heads clears the front-of-house canopy', () => {
  const top = FLOOR_Y + FOH.h + 2.42 + 0.025;
  const P = { x: 0, y: 0, z: 0 }, T = { x: 0, y: 0, z: 0 };
  let over = 0;
  for (let u = 0; u < 1; u += 0.0005) {
    _droneForTest.droneAt(u, P, T);
    if (Math.abs(P.x - FOH.x) < FOH.w / 2 + 0.4 && Math.abs(P.z - FOH.z) < FOH.d / 2 + 0.4) {
      over++;
      assert.ok(P.y > top + 0.25, `the drone at u=${u.toFixed(4)} is ${(P.y - top).toFixed(2)} m over the canopy`);
    }
  }
  assert.ok(over > 0, 'the skim does pass over the desk (the check is not vacuous)');
});

test('Behind Nora looks out from the stage: level over the room, her head and the decks in the lower part of the frame', () => {
  // what a 16:9 screen shows of the lens under the site's 2.39:1 bars (cinematic.mjs), less 2° to spare
  const half = Math.atan(Math.tan((SHOTS.behind.fov * Math.PI) / 360) * (16 / 9) / 2.39) * 180 / Math.PI - 2;
  assert.ok(Number.isFinite(LENS.behind.focusAt), 'it focuses on the crowd, as before');
  for (const u of [0, 0.5, 1]) {
    const { pos: P, target: T } = shot('behind', u);
    assert.ok(P.z < 2.0 && P.z > HEAD.z + 1, 'behind her, in front of the wall\'s light panel');
    const pitch = (a) => Math.atan2(a.y - P.y, Math.hypot(a.x - P.x, a.z - P.z)) * 180 / Math.PI;
    const aim = pitch(T);
    assert.ok(aim < 0 && aim > -10, `aimed out over the room, not down at the floor (${aim.toFixed(1)}°)`);
    const head = pitch(HEAD) - aim;
    assert.ok(head < -3 && head > -half, `her head is in the lower half (${head.toFixed(1)}° of ±${half.toFixed(1)}°)`);
    for (const x of OUTER) {   // the outer decks' tops, beside her (her own two are under her hands)
      const deck = pitch({ x, y: 1.0, z: -0.03 }) - aim;
      assert.ok(deck < head && deck > -half, `deck at x ${x} is in frame below her head (${deck.toFixed(1)}°)`);
    }
  }
});
