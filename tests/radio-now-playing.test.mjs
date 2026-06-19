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

test('flags a Nora segment by artist marker', () => {
  const np = normalizeNowPlaying({ title: 'Welcome to Shape Radio', artist: 'Nora' });
  assert.equal(np.isNora, true);
});

test('null-safe on empty/garbage input', () => {
  assert.deepEqual(normalizeNowPlaying(null), { title: null, artist: null, isNora: false });
  assert.deepEqual(normalizeNowPlaying({}), { title: null, artist: null, isNora: false });
});
