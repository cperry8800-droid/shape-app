// src/lib/radio/now-playing.mjs
// Normalizes a provider's raw now-playing JSON into Shape's shape. Pure — imported
// by the /api/radio/now-playing route AND tests/radio-now-playing.test.mjs.
// isNora marks a segment WE authored (Phase 2+); in Phase 1 there is no Nora
// content so it is always false, but the detector is here so it lights up later.

const TITLE_KEYS = ['title', 'track', 'song', 'name'];
const ARTIST_KEYS = ['artist', 'artist_name', 'author'];

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

export function normalizeNowPlaying(raw) {
  if (!raw || typeof raw !== 'object') return { title: null, artist: null, isNora: false };
  // Some providers nest under `now_playing` / `current_track`.
  const src = raw.now_playing || raw.current_track || raw;
  const title = pick(src, TITLE_KEYS);
  const artist = pick(src, ARTIST_KEYS);
  const isNora = !!artist && artist.toLowerCase().includes('nora');
  return { title, artist, isNora };
}
