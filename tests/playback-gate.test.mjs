import test from 'node:test';
import assert from 'node:assert/strict';
import { makePlaybackGate } from '../mobile-app/src/services/playbackGate.mjs';

// Codex round 17 P1: a sign-out during ShapeRadioLive.play()'s awaits left the stream
// running for a signed-out listener. These vectors are the four windows that matters
// in, driven through the real gate rather than asserted about the source text.

test('an uninterrupted signed-in attempt stays live across both awaits', () => {
  const gate = makePlaybackGate(() => 'user-1');
  const live = gate.begin();
  assert.equal(live(), true, 'live before the station read');
  assert.equal(live(), true, 'still live after the station read');
  assert.equal(live(), true, 'still live after audio.play() resolves');
});

test('signing out mid-attempt kills it — even with no pause and no newer play', () => {
  let uid = 'user-1';
  const gate = makePlaybackGate(() => uid);
  const live = gate.begin();
  assert.equal(live(), true);
  uid = null; // sign-out lands while the station read is in flight
  assert.equal(live(), false, 'a signed-out resolution must never start playback');
});

test('a pause supersedes a pending play (the no-op-pause case)', () => {
  // The real bug: pause() is `if (el) el.pause()`, so before the first play there is
  // no element and the pause does nothing. The gate is what actually cancels.
  const gate = makePlaybackGate(() => 'user-1');
  const live = gate.begin();
  gate.supersede(); // pause()
  assert.equal(live(), false, 'the pending play must not resume after a pause');
});

test('overlapping plays resolve last-wins, not first-wins', () => {
  const gate = makePlaybackGate(() => 'user-1');
  const first = gate.begin();
  const second = gate.begin();
  assert.equal(first(), false, 'the superseded attempt must bail');
  assert.equal(second(), true, 'the newest attempt owns playback');
});

test('a play after a pause is allowed again (the guard is not sticky)', () => {
  const gate = makePlaybackGate(() => 'user-1');
  gate.begin();
  gate.supersede();
  const resumed = gate.begin();
  assert.equal(resumed(), true, 'pausing must not permanently disable playback');
});

test('fails CLOSED on an absent or throwing identity', () => {
  assert.equal(makePlaybackGate(() => null).begin()(), false, 'signed out never plays');
  assert.equal(makePlaybackGate(() => undefined).begin()(), false, 'unresolved auth never plays');
  assert.equal(
    makePlaybackGate(() => {
      throw new Error('auth cache exploded');
    }).begin()(),
    false,
    'an identity source that throws must not admit playback'
  );
});

// The gate is only worth anything if the audio path actually consults it after EVERY
// await. This drives a fake station read + fake element through the real control flow
// to prove a late resolution leaves NO audio running.
test('a late station resolution after sign-out leaves no audio playing', async () => {
  let uid = 'user-1';
  const audio = { src: '', playing: false, play() { this.playing = true; }, pause() { this.playing = false; } };
  const gate = makePlaybackGate(() => uid);

  async function play(stationRead) {
    const live = gate.begin();
    if (!live()) return false;
    const cfg = await stationRead();
    if (!live() || !cfg?.configured) return false;
    if (audio.src !== cfg.streamUrl) audio.src = cfg.streamUrl;
    audio.play();
    if (!live()) { audio.pause(); return false; }
    return true;
  }

  const started = await play(async () => {
    uid = null; // sign-out resolves before the station read comes back
    return { configured: true, streamUrl: 'https://stream.example/live' };
  });

  assert.equal(started, false, 'play() must report failure');
  assert.equal(audio.playing, false, 'and must leave nothing playing');
});

// Codex round 18 P1: reading live identity is NOT enough. signOut() bumps the
// sign-out generation as its FIRST statement but does not clear state.user until
// AFTER push teardown, habit cleanup, the Supabase sign-out, the cookie DELETE
// and MusicKit cleanup. Through that whole window the identity source still
// returns the signed-out user, so identity alone cannot see that sign-out began.
// The gate therefore also consults the sign-out epoch, which moves first.

test('a bumped sign-out epoch kills an in-flight attempt while identity is still stale', () => {
  let epoch = 0;
  // Identity deliberately NEVER changes — this is the real signOut() window,
  // where state.user is still populated for the whole teardown sequence.
  const gate = makePlaybackGate(() => 'user-1', () => epoch);
  const live = gate.begin();
  assert.equal(live(), true, 'live before sign-out starts');
  epoch = 1; // bumpSignOutGen() — the first statement of signOut()
  assert.equal(
    live(),
    false,
    'sign-out has started, so the attempt must die even though identity still reads user-1'
  );
});

test('an attempt begun after the epoch moved is judged against the new epoch', () => {
  let epoch = 1;
  const gate = makePlaybackGate(() => 'user-2', () => epoch);
  const live = gate.begin();
  assert.equal(live(), true, 'a fresh attempt on a settled epoch is live');
  epoch = 2;
  assert.equal(live(), false, 'and dies when a later sign-out starts');
});

test('an absent epoch source is allowed (identity remains the only gate)', () => {
  const gate = makePlaybackGate(() => 'user-1');
  assert.equal(gate.begin()(), true, 'no epoch source must not fail closed');
});

test('a throwing epoch source fails CLOSED', () => {
  const gate = makePlaybackGate(() => 'user-1', () => {
    throw new Error('epoch source exploded');
  });
  assert.equal(gate.begin()(), false, 'an unreadable epoch must not admit playback');
});

test('a sign-out DURING audio.play() is undone, not reported as success', async () => {
  let uid = 'user-1';
  const audio = { src: '', playing: false, play() { this.playing = true; uid = null; }, pause() { this.playing = false; } };
  const gate = makePlaybackGate(() => uid);
  const live = gate.begin();
  const cfg = { configured: true, streamUrl: 's' };
  let ok = false;
  if (live() && cfg.configured) {
    audio.src = cfg.streamUrl;
    audio.play(); // sign-out lands inside this window
    ok = live();
    if (!ok) audio.pause();
  }
  assert.equal(ok, false);
  assert.equal(audio.playing, false, 'audio started in the losing window must be stopped');
});

// ── Wiring guard ────────────────────────────────────────────────────────────────
// The gate above is only worth anything if signOut() actually stops playback BEFORE
// its awaited teardown steps. That ordering is the whole fix (Codex round 18 P1), and
// nothing else in the suite can see it, so it is asserted against the real source.
// Comments are stripped first: the rationale comments quote the very call being
// asserted, so an unstripped match would pass on its own explanation.

import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const BACKEND = 'mobile-app/src/services/shapeBackend.js';

function signOutBody(src) {
  const start = src.indexOf('async function signOut()');
  assert.notEqual(start, -1, `${BACKEND}: signOut() not found — re-anchor this guard.`);
  // Bounded slice: the next top-level `async function` after it.
  const next = src.indexOf('\nasync function ', start + 10);
  return src.slice(start, next === -1 ? src.length : next);
}

test('signOut stops radio playback BEFORE any awaited teardown step', () => {
  const body = signOutBody(stripComments(readFileSync(BACKEND, 'utf8')));

  const stop = body.search(/_stopRadioPlayback\s*\?\.\s*\(/);
  assert.notEqual(
    stop,
    -1,
    'signOut() must stop radio playback — licensing requires a signed-in listener, and ' +
      'the cached user is not cleared until the end of the teardown sequence.'
  );

  const bump = body.indexOf('bumpSignOutGen()');
  assert.ok(bump !== -1 && bump < stop, 'the sign-out generation bump still comes first');

  // Every await in signOut() is a window in which audio would otherwise keep playing.
  const firstAwait = body.search(/\bawait\b/);
  assert.ok(firstAwait !== -1, 'signOut() is expected to await its teardown steps');
  assert.ok(
    stop < firstAwait,
    'radio playback must stop BEFORE the first await — teardown can hang on a slow ' +
      'network, and until it completes the identity source still returns the signed-out user'
  );
});

test('the playback gate is constructed with the sign-out epoch, not identity alone', () => {
  const src = stripComments(readFileSync(BACKEND, 'utf8'));
  assert.match(
    src,
    /makePlaybackGate\(\s*\(\)\s*=>\s*state\.user\?\.id\s*,\s*signOutGen\s*\)/,
    'the gate must receive signOutGen as its epoch source: identity alone cannot see ' +
      'that a sign-out has STARTED, because state.user is cleared last'
  );
});
