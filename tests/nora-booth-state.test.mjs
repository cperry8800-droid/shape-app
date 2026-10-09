// What Nora's booth may say about itself, who hears the example set, and which tier a device
// gets (public/newdesign/booth/noraBoothState.mjs). Both the app and the website read these, so
// the rules are pinned here once, as behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOTH_LABEL_KEYS, BOOTH_LABEL_EN, boothLabel, boothLabelText, exampleAllowed, boothTier,
  PHONE_FPS, DESKTOP_FPS, webgl2Available,
} from '../public/newdesign/booth/noraBoothState.mjs';

test('the six labels the review names, each with English', () => {
  assert.deepEqual([...BOOTH_LABEL_KEYS].sort(), ['example', 'guest', 'noBeat', 'norasMix', 'offAir', 'visualised']);
  for (const k of BOOTH_LABEL_KEYS) assert.equal(typeof BOOTH_LABEL_EN[k], 'string', k);
  assert.equal(BOOTH_LABEL_EN.offAir, 'Off air');
  assert.equal(BOOTH_LABEL_EN.example, 'Preview · example set');
});

test('nothing playing is Off air, never LIVE', () => {
  assert.deepEqual(boothLabel(), { key: 'offAir' });
  assert.deepEqual(boothLabel({ station: null }), { key: 'offAir' });
  // A configured station that is not playing on THIS device is still off air here.
  assert.deepEqual(boothLabel({ station: { playing: false, bpm: 124 } }), { key: 'offAir' });
  // A measured tempo with nothing playing cannot promote it either.
  assert.deepEqual(boothLabel({ station: { playing: false, cueSheet: true, bpm: 124 } }), { key: 'offAir' });
});

test('the example set says so first, whatever the station claims', () => {
  assert.deepEqual(boothLabel({ example: true }), { key: 'example' });
  assert.deepEqual(boothLabel({ example: true, station: { playing: true, bpm: 128, cueSheet: true } }), { key: 'example' });
});

test('on the station: a guest set names its DJ, no tempo is said in words, a cue sheet alone makes it hers', () => {
  assert.deepEqual(boothLabel({ station: { playing: true, guest: '  DJ Kemi ', bpm: 124 } }), { key: 'guest', dj: 'DJ Kemi' });
  // The guest outranks the tempo: Nora is off the decks, so nothing about her mix can be said.
  assert.deepEqual(boothLabel({ station: { playing: true, guest: 'DJ Kemi', bpm: null } }), { key: 'guest', dj: 'DJ Kemi' });
  // A blank name is no name.
  assert.deepEqual(boothLabel({ station: { playing: true, guest: '   ', bpm: 124 } }), { key: 'visualised' });
  for (const bpm of [null, undefined, 0, -3, NaN, Infinity]) {
    assert.deepEqual(boothLabel({ station: { playing: true, bpm } }), { key: 'noBeat' }, String(bpm));
  }
  assert.deepEqual(boothLabel({ station: { playing: true, bpm: 123.4 } }), { key: 'visualised' });
  // Only `true` is a verified cue sheet; a truthy string is not.
  assert.deepEqual(boothLabel({ station: { playing: true, bpm: 124, cueSheet: 'yes' } }), { key: 'visualised' });
  assert.deepEqual(boothLabel({ station: { playing: true, bpm: 124, cueSheet: true } }), { key: 'norasMix' });
  // ...and a cue sheet without a measured beat still has nothing to follow.
  assert.deepEqual(boothLabel({ station: { playing: true, bpm: null, cueSheet: true } }), { key: 'noBeat' });
});

test('the English text fills the DJ and falls back to Off air for anything unknown', () => {
  assert.equal(boothLabelText({ key: 'guest', dj: 'DJ Kemi' }), 'Guest set · DJ Kemi');
  assert.equal(boothLabelText({ key: 'norasMix' }), 'Nora’s mix');
  assert.equal(boothLabelText({ key: 'live' }), 'Off air');
  assert.equal(boothLabelText(null), 'Off air');
});

test('who hears the example set (ruling 4)', () => {
  const cases = [
    // prospect, configured, playing → allowed
    [true, false, false, true],
    [true, true, false, true],      // a prospect always…
    [true, true, true, false],      // …except while the station plays
    [false, false, false, true],    // a member while the station is not configured
    [false, true, false, false],    // not once it is
    [false, true, true, false],
    [false, false, true, false],    // nobody while station audio plays
  ];
  for (const [prospect, stationConfigured, stationPlaying, want] of cases) {
    assert.equal(exampleAllowed({ prospect, stationConfigured, stationPlaying }), want, JSON.stringify({ prospect, stationConfigured, stationPlaying }));
  }
  // An unresolved configuration is "not configured": the example is the booth's only content.
  assert.equal(exampleAllowed({ prospect: false, stationConfigured: null }), true);
  assert.equal(exampleAllowed({ prospect: false, stationConfigured: 'true' }), true);
  assert.equal(exampleAllowed(), true);
});

test('phones get the low tier at 30 fps, judged by the screen', () => {
  assert.deepEqual(boothTier({ screenW: 390, screenH: 844 }), { quality: 'low', fps: PHONE_FPS, cinematic: false });
  assert.deepEqual(boothTier({ screenW: 844, screenH: 390 }), { quality: 'low', fps: PHONE_FPS, cinematic: false }, 'a phone held sideways is still a phone');
  assert.deepEqual(boothTier({ screenW: 1440, screenH: 900 }), { quality: 'high', fps: DESKTOP_FPS, cinematic: true });
  assert.equal(boothTier({ screenW: 600, screenH: 960 }).quality, 'high', 'the boundary: a 600 px short side is not a phone');
  assert.equal(boothTier({ screenW: 599, screenH: 960 }).quality, 'low');
  // An unknown screen gets the tier that cannot hurt.
  assert.equal(boothTier().quality, 'low');
  assert.equal(boothTier({ screenW: 1440, screenH: 900, override: 'low' }).quality, 'low');
  assert.equal(boothTier({ screenW: 390, screenH: 844, override: 'high' }).quality, 'high');
  assert.equal(boothTier({ screenW: 390, screenH: 844, override: 'ultra' }).quality, 'low', 'an unknown override is ignored');
  assert.equal(PHONE_FPS, 30);
});

test('the WebGL 2 probe asks for webgl2 and gives its context back', () => {
  let lost = 0, asked = null;
  const doc = (gl) => ({ createElement: () => ({ getContext: (k) => { asked = k; return gl; } }) });
  const gl = { getExtension: (n) => (n === 'WEBGL_lose_context' ? { loseContext: () => { lost += 1; } } : null) };
  assert.equal(webgl2Available(doc(gl)), true);
  assert.equal(asked, 'webgl2');
  assert.equal(lost, 1, 'the probe context was left alive — browsers cap live contexts');
  assert.equal(webgl2Available(doc(null)), false);
  assert.equal(webgl2Available({ createElement: () => { throw new Error('no'); } }), false);
  assert.equal(webgl2Available(null), false);
});
