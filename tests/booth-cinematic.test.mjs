// The cinematic tier's two pure rules: the lens each shot is filmed with, and how strongly the LED
// wall throws light shafts from where it sits in the frame. The passes themselves are GLSL and are
// checked by rendering; these are the numbers that decide what those passes do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LENS, lensFor, shaftVisibility } from '../public/newdesign/booth/cinematic.mjs';
import { SHOT_IDS } from '../public/newdesign/booth/noraDirector.mjs';

test('every shot the director can cut to has its own lens, and an unknown one falls back to free', () => {
  assert.ok(SHOT_IDS.length >= 10, 'the director exposes its shot list');
  for (const id of SHOT_IDS) assert.ok(Object.hasOwn(LENS, id), `no lens for the ${id} shot`);
  assert.equal(lensFor('free'), LENS.free);
  assert.equal(lensFor('no-such-shot'), LENS.free);
  assert.equal(lensFor(undefined), LENS.free);
});

test('a lens never blurs past its own cap, and the close shots are shallower than the room shots', () => {
  for (const [id, L] of Object.entries(LENS)) {
    assert.ok(L.aperture > 0 && L.maxCoc > 0, `${id}: a lens with no blur is not a lens`);
    assert.ok(L.aperture <= L.maxCoc, `${id}: aperture past its own cap`);
  }
  const close = ['jog', 'mixer', 'screen', 'face', 'profile'];
  const room = ['club', 'atrium', 'panorama', 'drone', 'crane'];
  const minClose = Math.min(...close.map((id) => LENS[id].maxCoc));
  const maxRoom = Math.max(...room.map((id) => LENS[id].maxCoc));
  assert.ok(minClose > maxRoom * 2, `close shots (${minClose}) must be far shallower than the room (${maxRoom})`);
});

test('the two shots that look out over the crowd focus on the crowd, not on the floor miles away', () => {
  for (const id of ['shoulder', 'behind']) {
    const L = LENS[id];
    assert.ok(Number.isFinite(L.focusAt) && L.focusAt > 2 && L.focusAt < 12, `${id} needs a crowd-distance focusAt`);
  }
});

test('shafts: full while the wall is in or near the frame, fading off-frame, none behind the camera', () => {
  assert.equal(shaftVisibility(0, 0, 5), 1);
  assert.equal(shaftVisibility(1.2, -1.2, 5), 1);
  assert.equal(shaftVisibility(2.6, 0, 5), 0);
  assert.equal(shaftVisibility(0, -9, 5), 0);
  assert.ok(Math.abs(shaftVisibility(1.9, 0, 5) - 0.5) < 1e-9, 'the fade is linear between 1.2 and 2.6');
  // behind the camera the projected point mirrors through the centre: it must not cast at all
  for (const w of [0, -0.001, -5, NaN]) assert.equal(shaftVisibility(0, 0, w), 0, `w=${w}`);
  // monotone: moving the source further out never makes the shafts stronger
  let prev = 1;
  for (let m = 0; m <= 3; m += 0.05) { const v = shaftVisibility(m, m * 0.3, 1); assert.ok(v <= prev + 1e-12); prev = v; }
});
