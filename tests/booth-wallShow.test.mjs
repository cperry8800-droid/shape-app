// The LED wall's show (owner, 2026-10-26: "create cool effects like real like shows on LED wall,
// include club shape appearing and re appearing, maybe pulsing"; "use higgsfield for cool looping
// images"): the look that fills the wall and the headline that builds, holds and clears on it
// (public/newdesign/booth/wallShow.mjs), and the wiring that draws them (club.mjs, arenaStage.mjs,
// clubVenue.mjs, noraBooth.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  wallHeadlineAt, wallLookFor, stepWallLook, initialWallLook, wallLookMix, wallStepBeats, loopFadeAt, WALL_LOOP_FADE,
  WALL_LOOKS, WALL_BUILDS, WALL_SETLIST, WALL_CLEAR_AT, WALL_CLEAR_BEATS, WALL_BUILD_BEATS, WALL_LOOK_IN_BAR, WALL_LOOK_OUT_BAR,
} from '../public/newdesign/booth/wallShow.mjs';
import { wallArtAt, WALL_PHRASE_BEATS } from '../public/newdesign/booth/wallArt.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const P = WALL_PHRASE_BEATS;
const on = (h) => (1 - h.clear) * h.build;   // how much of the headline is lit

test('the headline appears and re-appears every phrase, on its own: builds, holds, dissolves, then the look', () => {
  assert.equal(on(wallHeadlineAt(0)), 0, 'the set opens on a build');
  assert.equal(wallHeadlineAt(1).build, 0.5);
  assert.equal(on(wallHeadlineAt(WALL_BUILD_BEATS)), 1);
  assert.equal(on(wallHeadlineAt(8)), 1, 'held');
  assert.equal(wallHeadlineAt(WALL_CLEAR_AT + 1).clear, 0.5, 'dissolving');
  assert.equal(on(wallHeadlineAt(WALL_CLEAR_AT + WALL_CLEAR_BEATS)), 0, 'gone');
  assert.equal(on(wallHeadlineAt(P - 0.01)), 0, 'still gone at the end of the phrase');
  assert.equal(on(wallHeadlineAt(P)), 0, 'the next phrase builds again');
  assert.equal(on(wallHeadlineAt(P + WALL_BUILD_BEATS)), 1);
  // ⚠ "club shape should only appear on its own": the wall is dark while the headline is up, and the
  // look comes up only after it has gone, and goes down before the next one builds
  for (let bp = 0; bp < 4 * P; bp += 0.25) {
    const lit = on(wallHeadlineAt(bp)) > 0 || wallHeadlineAt(bp).clear < 1 && wallHeadlineAt(bp).build > 0;
    const lk = wallLookFor(Math.floor(bp / 4), { ready: [true] }).look;
    if (lit) assert.equal(lk, 'blank', `beat ${bp}: the headline shares the wall with ${lk}`);
  }
  assert.ok(WALL_CLEAR_AT + WALL_CLEAR_BEATS <= WALL_LOOK_IN_BAR * 4);
  assert.ok(WALL_LOOK_OUT_BAR * 4 + 2 <= P, 'the look is down before the next headline builds');
});

test('it keeps the headliner rotation, and with a guest on the decks never names Nora', () => {
  for (let p = 0; p < 8; p++) {
    const bp = p * P + 10;
    assert.equal(wallHeadlineAt(bp).art, wallArtAt(bp).to);
    assert.equal(wallHeadlineAt(bp, { headliner: null }).art, wallArtAt(bp, { headliner: null }).to);
  }
  const guest = Array.from({ length: 8 * P }, (_, i) => wallHeadlineAt(i + 0.5, { headliner: null }));
  assert.ok(guest.every((h) => h.art !== 'nora' && h.from !== 'nora'));
  // the build starts from nothing, so there is no wipe from the last artwork
  assert.equal(wallHeadlineAt(P + 0.5).from, wallHeadlineAt(P + 0.5).art);
  assert.equal(wallHeadlineAt(P + 0.5).mix, 1);
});

test('the builds take turns: a scan, a scatter, a split from the centre', () => {
  assert.deepEqual([0, 1, 2, 3].map((p) => wallHeadlineAt(p * P + 1).style),
    [WALL_BUILDS.scan, WALL_BUILDS.scatter, WALL_BUILDS.split, WALL_BUILDS.scan]);
});

test('the echo: on each bar while the headline holds, every beat on the drop, growing and fading', () => {
  const echoAt = (bp, o) => wallHeadlineAt(bp, o).echo;
  assert.equal(echoAt(0.5), 0, 'not while it builds');
  assert.equal(echoAt(3), 0, 'nothing thrown before the first bar line after the build');
  assert.equal(echoAt(4), 1, 'thrown on the bar');
  assert.ok(echoAt(4.5) > 0 && echoAt(4.5) < 1, 'and fading');
  assert.equal(echoAt(5.6), 0, 'gone within a beat and a half');
  assert.equal(echoAt(8), 1);
  assert.ok(wallHeadlineAt(4.75).echoScale > wallHeadlineAt(4.25).echoScale, 'it grows');
  assert.equal(wallHeadlineAt(4).echoScale, 1);
  assert.equal(echoAt(WALL_CLEAR_AT + 0.2), 0, 'none while it dissolves');
  assert.equal(echoAt(12), 0, 'none once the look has the wall');
  // on the drop, a beat apart
  assert.equal(echoAt(5, { drop: true }), 1);
  assert.equal(echoAt(6, { drop: true }), 1);
  assert.equal(echoAt(6.95, { drop: true }), 0);
});

test('⚠ reduced motion: the headline holds steady and changes by a crossfade, with no echo', () => {
  for (const bp of [0, 1, 27, 29, P - 0.01, P + 0.5, 3 * P + 1]) {
    const h = wallHeadlineAt(bp, { reduced: true, drop: true });
    const a = wallArtAt(bp);
    assert.equal(h.build, 1); assert.equal(h.clear, 0); assert.equal(h.echo, 0);
    assert.equal(h.style, WALL_BUILDS.fade);
    assert.deepEqual([h.from, h.art, h.mix], [a.from, a.to, a.mix]);
  }
});

test('the set list without loops: the dawn, the tunnel, the chase in turn, up from bar 3 to bar 7', () => {
  const seq = [0, 1, 2, 3, 4, 5, 6].map((p) => wallLookFor(p * 8 + 4).look);
  assert.deepEqual(seq, ['dawn', 'tunnel', 'chase', 'dawn', 'tunnel', 'chase', 'dawn']);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((b) => wallLookFor(8 + b).look),
    ['blank', 'blank', 'blank', 'tunnel', 'tunnel', 'tunnel', 'tunnel', 'blank']);
  assert.ok(Object.isFrozen(WALL_SETLIST) && WALL_SETLIST.every(Object.isFrozen));
  assert.deepEqual(Object.keys(WALL_LOOKS), ['dawn', 'tunnel', 'chase', 'plate', 'blank']);
});

test('the loops take the plate slots in turn, and a loop that has not loaded is skipped', () => {
  const ready = [true, true, true];
  const plates = Array.from({ length: 12 }, (_, p) => wallLookFor(p * 8 + 4, { ready })).filter((l) => l.look === 'plate').map((l) => l.plate);
  assert.deepEqual(plates, [0, 1, 2, 0, 1, 2]);
  const some = Array.from({ length: 12 }, (_, p) => wallLookFor(p * 8 + 4, { ready: [false, true, false, true] })).filter((l) => l.look === 'plate');
  assert.ok(some.length && some.every((l) => l.plate === 1 || l.plate === 3));
  // a drawn look carries no loop
  assert.equal(wallLookFor(8 + 4, { ready }).plate, -1);
});

test('the drop takes the tunnel or the chase while the look has the wall; reduced motion keeps the dawn', () => {
  for (let b = 0; b < 64; b++) {
    const lk = wallLookFor(b, { drop: true, ready: [true] }).look;
    const inPhrase = b % 8;
    if (inPhrase < WALL_LOOK_IN_BAR || inPhrase >= WALL_LOOK_OUT_BAR) assert.equal(lk, 'blank');
    else assert.ok(['tunnel', 'chase'].includes(lk));
    assert.equal(wallLookFor(b, { drop: true, ready: [true], reduced: true }).look, 'dawn');
  }
});

test('a change dissolves over two beats from the bar\'s downbeat, whatever the frame rate', () => {
  let s = stepWallLook(initialWallLook(), { bp: 0 });
  assert.equal(s.to, 'blank'); assert.equal(wallLookMix(s, 0), 1);
  const same = stepWallLook(s, { bp: 0.5 });
  assert.equal(same, s, 'nothing moved: the same object');
  // smooth frames vs. one jump into bar 3
  let smooth = s;
  for (let bp = 0; bp <= 12.6; bp += 0.05) smooth = stepWallLook(smooth, { bp });
  const jump = stepWallLook(s, { bp: 12.6 });
  for (const st of [smooth, jump]) {
    assert.deepEqual([st.from, st.to, st.t0], ['blank', 'dawn', 12]);
    assert.ok(Math.abs(wallLookMix(st, 12.6) - 0.3) < 1e-9);
    assert.equal(wallLookMix(st, 14), 1);
  }
  // the drop: the next bar's downbeat, dissolving from the look that is up
  const d = stepWallLook(jump, { bp: 16.1, drop: true });
  assert.deepEqual([d.from, d.to, d.t0], ['dawn', 'tunnel', 16]);
  // down to black on bar 7
  const down = stepWallLook(d, { bp: 28.2 });
  assert.deepEqual([down.from, down.to, down.t0], ['tunnel', 'blank', 28]);
  // reduced motion cuts straight to the dawn
  const r = stepWallLook(d, { bp: 16.2, reduced: true });
  assert.equal(r.to, 'dawn'); assert.equal(wallLookMix(r, 16.2), 1);
});

test('a loop fades its last 0.6 s into its own start, so a clip that does not end where it began has no seam', () => {
  assert.equal(WALL_LOOP_FADE, 0.6);
  assert.equal(loopFadeAt(0, 5.042), 0);
  assert.equal(loopFadeAt(4.4, 5.042), 0);
  assert.ok(Math.abs(loopFadeAt(4.742, 5.042) - 0.5) < 1e-9);
  assert.equal(loopFadeAt(5.042, 5.042), 1);
  // not yet loaded (NaN duration), or too short to fade: no fade
  assert.equal(loopFadeAt(1, NaN), 0);
  assert.equal(loopFadeAt(1, 1), 0);
});

test('the chase never steps faster than three a second', () => {
  assert.equal(wallStepBeats(60 / 128), 1);
  assert.equal(wallStepBeats(60 / 175), 1);
  assert.equal(wallStepBeats(60 / 190), 2);
  assert.equal(wallStepBeats(NaN), 1);
});

test('club.mjs runs the show, the venue hands it to the arena wall, and both hosts pass it on', () => {
  const club = stripComments(readFileSync('public/newdesign/booth/club.mjs', 'utf8'));
  assert.match(club, /from '\.\/wallShow\.mjs';/);
  assert.match(club, /wallHeadlineAt\(bp, \{ headliner, drop: dropOn, reduced \}\)/);
  assert.match(club, /stepWallLook\(look, \{ bp, drop: dropOn, ready: plateReady\(\), reduced \}\)/);
  assert.match(club, /get wallShow\(\)/);
  const arena = stripComments(readFileSync('public/newdesign/booth/arenaStage.mjs', 'utf8'));
  assert.match(arena, /if \(s\.wallShow\) applyShow\(s\.wallShow\);/);
  const venue = stripComments(readFileSync('public/newdesign/booth/clubVenue.mjs', 'utf8'));
  assert.match(venue, /arena\.set\(state\);/);
  const booth = stripComments(readFileSync('public/newdesign/booth/noraBooth.mjs', 'utf8'));
  assert.match(booth, /venue\.set\(\{ \.\.\.roomState, wallShow: club\.wallShow \}\);/);
  const preview = stripComments(readFileSync('prototypes/nora-booth/src/main.mjs', 'utf8'));
  assert.match(preview, /wallShow: club\.wallShow/);
});

test('the loops load on desktops only, and never under reduced motion, where the wall cannot show them', async () => {
  const { wallLoopUrls, WALL_LOOPS } = await import('../public/newdesign/booth/noraBoothState.mjs');
  assert.equal(WALL_LOOPS.length, 4);
  assert.ok(WALL_LOOPS.every((u) => /^https:\/\/d8j0ntlcm91z4\.cloudfront\.net\/.+\.mp4$/.test(u)));
  assert.deepEqual(wallLoopUrls('high'), [...WALL_LOOPS]);
  assert.deepEqual(wallLoopUrls('low'), [], 'a phone keeps the drawn looks');
  assert.deepEqual(wallLoopUrls('high', { reducedMotion: true }), [], 'reduced motion holds the dawn, so no download');
  assert.deepEqual(wallLoopUrls('high', { loops: ['http://x/a.mp4', 'https://x/b.mp4'] }), ['https://x/b.mp4']);
  // both pages hand it their reduced-motion setting
  const site = stripComments(readFileSync('public/newdesign/radio.jsx', 'utf8'));
  assert.match(site, /wallLoops: S\.wallLoopUrls\(tier\.quality, \{ reducedMotion: RD_REDUCED \}\)/);
  const app = stripComments(readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx', 'utf8'));
  assert.match(app, /wallLoops: wallLoopUrls\(tier\.quality, \{ reducedMotion: reduced \}\)/);
});
