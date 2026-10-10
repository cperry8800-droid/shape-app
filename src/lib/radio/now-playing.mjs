// src/lib/radio/now-playing.mjs
// Normalizes a provider's raw now-playing JSON into Shape's shape. Pure — imported
// by the /api/radio/now-playing route AND tests/radio-now-playing.test.mjs.
//
// ⚠ isNora IS NEVER READ OFF THE STATION'S METADATA. It used to be "the artist contains
// 'nora'", which on a station playing real artists' songs called Norah Jones Nora. A Nora
// set is known from Shape's own records (src/lib/radio/noraOnAir.mjs: her planned set and
// her engine's log), so a provider's payload is always isNora: false.
//
// radio.co (Shape Radio's station, owner 2026-10-10) nests the song under `current_track`
// and puts it in ONE field, "Artist - Title". When a payload names no artist, a title of
// that form is split at its first " - ".

const TITLE_KEYS = ['title', 'track', 'song', 'name'];
const ARTIST_KEYS = ['artist', 'artist_name', 'author'];
const ALBUM_KEYS = ['album', 'album_title', 'release'];

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && typeof v !== 'object' && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

export function normalizeNowPlaying(raw) {
  if (!raw || typeof raw !== 'object') return { title: null, artist: null, isNora: false };
  // Some providers nest under `now_playing` / `current_track`.
  const src = (raw.now_playing && typeof raw.now_playing === 'object' && raw.now_playing)
    || (raw.current_track && typeof raw.current_track === 'object' && raw.current_track)
    || raw;
  let title = pick(src, TITLE_KEYS);
  let artist = pick(src, ARTIST_KEYS);
  if (!artist && title) {
    const cut = title.indexOf(' - ');
    if (cut > 0 && cut < title.length - 3) {
      artist = title.slice(0, cut).trim() || null;
      title = title.slice(cut + 3).trim() || null;
    }
  }
  const album = pick(src, ALBUM_KEYS);
  return album ? { title, artist, album, isNora: false } : { title, artist, isNora: false };
}
