// The booth's headliner screen (owner, 2026-10-10: "it goes back and forth between club shape,
// shape radio, and NORA as the headliner basically. like how they do at live concert"): which
// artwork the LED wall shows at each beat (public/newdesign/booth/wallArt.mjs), and the wiring
// that draws it (club.mjs) and names the act on the decks (noraBooth.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wallArtAt, WALL_ART_SEQ, WALL_PHRASE_BEATS, WALL_WIPE_BEATS } from '../public/newdesign/booth/wallArt.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const P = WALL_PHRASE_BEATS;
const shown = (bp, o) => wallArtAt(bp, o).to;

test('a phrase each, changing on the downbeat: the venue, NORA, the station, NORA', () => {
  assert.equal(P, 32, 'eight bars of four');
  const seq = [0, 1, 2, 3, 4, 5].map((p) => shown(p * P + 8));
  assert.deepEqual(seq, ['clubShape', 'nora', 'shapeRadio', 'nora', 'clubShape', 'nora']);
  // the headliner is up half the time
  const beats = Array.from({ length: 8 * P }, (_, i) => shown(i + 0.5));
  assert.equal(beats.filter((a) => a === 'nora').length, beats.length / 2);
  // held through the phrase, changed on its first beat
  assert.equal(shown(P - 0.01), 'clubShape');
  assert.equal(shown(P), 'nora');
});

test('the changeover is a wipe over two beats, from the last artwork to the next', () => {
  assert.equal(WALL_WIPE_BEATS, 2);
  assert.deepEqual(wallArtAt(P), { from: 'clubShape', to: 'nora', mix: 0 });
  assert.deepEqual(wallArtAt(P + 1), { from: 'clubShape', to: 'nora', mix: 0.5 });
  assert.deepEqual(wallArtAt(P + 2), { from: 'nora', to: 'nora', mix: 1 });
  assert.deepEqual(wallArtAt(2 * P + 0.5), { from: 'nora', to: 'shapeRadio', mix: 0.25 });
  // from the last of the cycle back to the first
  assert.deepEqual(wallArtAt(4 * P + 1), { from: 'nora', to: 'clubShape', mix: 0.5 });
  // the opening phrase has nothing to wipe from: the venue, at once
  assert.deepEqual(wallArtAt(0), { from: 'clubShape', to: 'clubShape', mix: 1 });
  // a clock just below zero, or none, is the opening frame (the engine starts 0.1 s early)
  assert.deepEqual(wallArtAt(-0.4), wallArtAt(0));
  assert.deepEqual(wallArtAt(NaN), wallArtAt(0));
});

test('⚠ with a guest on the decks the wall never names Nora: the venue and the station', () => {
  const guest = Array.from({ length: 8 * P }, (_, i) => wallArtAt(i + 0.5, { headliner: null }));
  assert.ok(guest.every((a) => a.from !== 'nora' && a.to !== 'nora'));
  assert.deepEqual([0, 1, 2, 3].map((p) => shown(p * P + 8, { headliner: null })), ['clubShape', 'shapeRadio', 'clubShape', 'shapeRadio']);
  assert.ok(Object.isFrozen(WALL_ART_SEQ.nora) && Object.isFrozen(WALL_ART_SEQ.none));
});

test('club.mjs draws it on the wall and noraBooth.mjs names the act on the decks', () => {
  // the rotation reaches the wall through the show (wallShow.mjs), which builds and clears each artwork
  const show = stripComments(readFileSync('public/newdesign/booth/wallShow.mjs', 'utf8'));
  assert.match(show, /import \{ wallArtAt, WALL_PHRASE_BEATS \} from '\.\/wallArt\.mjs';/);
  assert.match(show, /const art = wallArtAt\(b, \{ headliner \}\);/);
  const club = stripComments(readFileSync('public/newdesign/booth/club.mjs', 'utf8'));
  assert.match(club, /const head = wallHeadlineAt\(bp, \{ headliner, drop: dropOn, reduced \}\);/, 'read off the wall\'s own beat position');
  for (const u of ['uMask.value = artTex\\[head.from\\]', 'uMaskB.value = artTex\\[head.art\\]', 'uMix.value = head.mix']) assert.match(club, new RegExp(u));
  // each artwork has its own texture, built from its own mask
  for (const [k, m] of [['clubShape', 'CLUB_SHAPE_MASK'], ['shapeRadio', 'SHAPE_RADIO_MASK'], ['nora', 'NORA_MASK']]) {
    assert.match(club, new RegExp(`${k}: [^\\n]*screenMaskTexture\\(THREE, WALL_COLS, WALL_ROWS, ${m}\\)`), k);
  }
  // reduced motion: a crossfade, not a wipe
  assert.match(club, /uWipe\.value = reduced \? 0 : 1;/);
  assert.match(club, /float sw = uWipe > 0\.5 \? step\(front, uMix\) : uMix;/);
  const booth = stripComments(readFileSync('public/newdesign/booth/noraBooth.mjs', 'utf8'));
  assert.match(booth, /headliner: guestOnDecks \? null : 'nora'/);
});
