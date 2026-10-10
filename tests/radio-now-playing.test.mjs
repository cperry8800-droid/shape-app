// tests/radio-now-playing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNowPlaying } from '../src/lib/radio/now-playing.mjs';

test('maps common title/artist keys', () => {
  assert.deepEqual(
    normalizeNowPlaying({ title: 'Tempo Lift', artist: 'Some Artist' }),
    { title: 'Tempo Lift', artist: 'Some Artist', isNora: false }
  );
});

test('falls back across alternate key names', () => {
  assert.deepEqual(
    normalizeNowPlaying({ track: 'Push', artist_name: 'DJ X' }),
    { title: 'Push', artist: 'DJ X', isNora: false }
  );
});

test('⚠ the station’s metadata never makes a song Nora’s (Norah Jones is not Nora)', () => {
  // A Nora set is known from Shape's own records (src/lib/radio/noraOnAir.mjs), never from an
  // artist name on a station that plays real artists' songs.
  assert.equal(normalizeNowPlaying({ title: "Don't Know Why", artist: 'Norah Jones' }).isNora, false);
  assert.equal(normalizeNowPlaying({ title: 'Welcome to Shape Radio', artist: 'Nora' }).isNora, false);
});

test('radio.co: the song under current_track, as one "Artist - Title" field', () => {
  // The shape radio.co's public status endpoint returns (public.radio.co/stations/<id>/status).
  const status = { status: 'online', source: { type: 'automated' }, current_track: { title: 'Daft Punk - One More Time', start_time: '2026-10-10T18:00:00+00:00', artwork_url: 'x' }, history: [{ title: 'A - B' }] };
  assert.deepEqual(normalizeNowPlaying(status), { title: 'One More Time', artist: 'Daft Punk', isNora: false });
  // Only the first " - " splits: the rest belongs to the title.
  assert.deepEqual(normalizeNowPlaying({ current_track: { title: 'Fred again.. - Delilah (pull me out of this) - Edit' } }),
    { title: 'Delilah (pull me out of this) - Edit', artist: 'Fred again..', isNora: false });
  // A hyphen inside a word is not the separator, and a payload that names its artist is not split.
  assert.deepEqual(normalizeNowPlaying({ current_track: { title: 'Jay-Z' } }), { title: 'Jay-Z', artist: null, isNora: false });
  assert.deepEqual(normalizeNowPlaying({ title: 'A - B', artist: 'C' }), { title: 'A - B', artist: 'C', isNora: false });
  // An album, when the payload has one, rides along (the licence requires it shown).
  assert.deepEqual(normalizeNowPlaying({ title: 'T', artist: 'A', album: 'LP' }), { title: 'T', artist: 'A', album: 'LP', isNora: false });
  // A nested object is not a title.
  assert.deepEqual(normalizeNowPlaying({ current_track: { title: { x: 1 } } }), { title: null, artist: null, isNora: false });
});

test('null-safe on empty/garbage input', () => {
  assert.deepEqual(normalizeNowPlaying(null), { title: null, artist: null, isNora: false });
  assert.deepEqual(normalizeNowPlaying({}), { title: null, artist: null, isNora: false });
});
