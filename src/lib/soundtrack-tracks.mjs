// A coach's playlist, track by track (owner, 2026-11-05: "Read the track list from Spotify for a
// coach-connected playlist", "Store per-track energy tags (Easy / Build / Peak)", "Reorder can write back
// to Spotify"). Pure: /api/coach/soundtracks/tracks does the reads and writes.
//
//   spotifyPlaylistId(url)        the id in an open.spotify.com link or a spotify:playlist: URI
//   mapSpotifyItems(items)        Spotify's playlist items → [{ id, uri, name, artists, durationMs }]
//                                 (local files and podcast episodes have no track id and are kept, so
//                                 positions stay the playlist's own)
//   withEnergy(tracks, tags)      each track with its tag, and how many are tagged
//   cleanTagPatch(input)          { [trackId]: 'easy' | 'build' | 'peak' | null }, anything else dropped
//   mergeTags(current, patch)     the stored tags with the patch applied (null removes one)
//   reorderBody(from, to, n, snapshot)   Spotify's reorder body for moving one track, or null
//
// Shape never streams a track: the list is titles, artists and lengths, and the music plays in the
// member's own Spotify or Apple Music.

export const ENERGY = Object.freeze(['easy', 'build', 'peak']);
export const MAX_TRACKS = 500;
const TRACK_ID = /^[A-Za-z0-9]{10,40}$/;

export function spotifyPlaylistId(url) {
  const m = /playlist[/:]([A-Za-z0-9]{10,40})/.exec(String(url || ''));
  return m ? m[1] : null;
}

export function mapSpotifyItems(items) {
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    const t = it && it.track && typeof it.track === 'object' ? it.track : null;
    if (!t) continue;
    out.push({
      id: typeof t.id === 'string' && TRACK_ID.test(t.id) ? t.id : null,
      uri: typeof t.uri === 'string' ? t.uri : null,
      name: String(t.name || '').slice(0, 200) || 'Untitled',
      artists: (Array.isArray(t.artists) ? t.artists : []).map((a) => String((a && a.name) || '')).filter(Boolean).join(', ').slice(0, 200),
      durationMs: Number.isFinite(t.duration_ms) ? t.duration_ms : null,
    });
    if (out.length >= MAX_TRACKS) break;
  }
  return out;
}

export function withEnergy(tracks, tags) {
  const map = tags && typeof tags === 'object' && !Array.isArray(tags) ? tags : {};
  let tagged = 0;
  const list = (Array.isArray(tracks) ? tracks : []).map((t) => {
    const e = t && t.id && ENERGY.includes(map[t.id]) ? map[t.id] : null;
    if (e) tagged += 1;
    return { ...t, energy: e };
  });
  return { tracks: list, tagged };
}

export function cleanTagPatch(input) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input).slice(0, MAX_TRACKS)) {
    if (!TRACK_ID.test(k)) continue;
    if (v === null) out[k] = null;
    else if (ENERGY.includes(v)) out[k] = v;
  }
  return out;
}

export function mergeTags(current, patch) {
  const next = { ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}) };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  // Keep only well-formed entries, at most MAX_TRACKS.
  return Object.fromEntries(Object.entries(next).filter(([k, v]) => TRACK_ID.test(k) && ENERGY.includes(v)).slice(0, MAX_TRACKS));
}

// Moving the track at `from` so it sits at position `to` in the final list (both 0-based, within n).
// Spotify's `insert_before` counts positions in the list BEFORE the move, so moving down is to + 1.
export function reorderBody(from, to, n, snapshot) {
  if (![from, to, n].every(Number.isInteger) || n < 2 || from < 0 || to < 0 || from >= n || to >= n || from === to) return null;
  return { range_start: from, range_length: 1, insert_before: to > from ? to + 1 : to, ...(typeof snapshot === 'string' && snapshot ? { snapshot_id: snapshot } : {}) };
}
