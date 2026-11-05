// The coach's playlist on a workout day, with its link (owner, 2026-11-05: "Put the playlist link on the
// client's workout card: a button that opens the playlist in the client's own Spotify or Apple Music.
// Shape never streams it.")
//
// The website builder puts a day's playlist in the workout payload ({ name, meta, id?, url?, provider? };
// public/newdesign/playlistAttach.js dayPlaylist), and every send path copies it as it is (assign, copy a
// week, Update future assignments, Adjust). The plan route (/api/client/plan) and the app's Train mapping
// read it through bsWorkoutPlaylist, which keeps a link only when it is an https Spotify or Apple Music
// playlist link: a card never opens anything else. A day saved before links rode along has a name and
// no link, and the card keeps doing what it did (Shape Radio).

const LINK = /^https:\/\/(open\.spotify\.com|music\.apple\.com)\//i;

export function bsPlaylistLink(url) {
  const u = typeof url === 'string' ? url.trim() : '';
  return u && u.length <= 500 && LINK.test(u) ? u : null;
}

export function bsWorkoutPlaylist(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const name = String(raw.name == null ? '' : raw.name).trim().slice(0, 160);
  if (!name) return null;
  const out = { name, meta: String(raw.meta == null ? '' : raw.meta).trim().slice(0, 120) };
  const url = bsPlaylistLink(raw.url);
  if (url) {
    out.url = url;
    out.provider = /music\.apple\.com/i.test(url) ? 'apple' : 'spotify';
  }
  return out;
}

// What the card's button says: the member's own service, by name (a product name, not translated).
export function bsPlaylistService(p) {
  return p && p.provider === 'apple' ? 'Apple Music' : 'Spotify';
}
