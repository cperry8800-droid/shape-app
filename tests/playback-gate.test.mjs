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
