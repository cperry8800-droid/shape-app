// The link a playlist on a member's plan opens (owner, 2026-11-10: "make the playlist chip open the
// playlist"). A coach puts one of their saved playlists (coach_soundtracks) on a program day or a meal
// plan's day or meal, and the plan stores `{ id?, name, meta }`, never the link. /api/client/plan looks
// the link up here, from the saved playlists of the coach who wrote that session or menu, so the member's
// chip opens what the coach picked, and a link the coach changes since is the one it opens.
//
// ⚠ ONLY A LINK FROM THE COACH'S OWN SAVED PLAYLIST, NEVER ONE FROM THE PLAN. The payload is
// client-written JSONB, so a `url` stored on a plan's playlist is dropped, and a link is set only when a
// saved playlist of the coach behind that plan matches: by its id, or, for one saved before ids, by a
// name only one of that coach's playlists has. A playlist on no saved one of theirs stays a name.
// ⚠ ONLY AN HTTPS SPOTIFY OR APPLE MUSIC LINK, the rule the coach's Playlists page holds a link to
// (trainerPlaylistsPage.jsx plSafeUrl) and the website's chip checks again (dashClient.jsx dclPlaylistHref).
//
// Pure: no database, no Next. The route reads the rows; this matches them.

const LINK_HOSTS = /(^|\.)(spotify\.com|spotify\.link|music\.apple\.com)$/i;

/** An https Spotify or Apple Music link, normalised, or null. */
export function safePlaylistUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' && LINK_HOSTS.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

const nameKey = (name) => String(name ?? '').trim().toLowerCase();

/**
 * One coach's saved playlists, indexed for matching: by id, and by name where only one has it.
 * @param {Array<{ id?: unknown, owner_id?: unknown, name?: unknown, url?: unknown }>} rows
 * @returns {Map<string, { byId: Map<string, string|null>, byName: Map<string, string|null> }>} by owner
 */
export function playlistLinkIndex(rows) {
  const owners = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || r.owner_id == null) continue;
    const owner = String(r.owner_id);
    if (!owners.has(owner)) owners.set(owner, { byId: new Map(), byName: new Map() });
    const ix = owners.get(owner);
    const href = safePlaylistUrl(r.url);
    const rowId = r.id != null && String(r.id).trim() ? String(r.id).trim() : '';
    // A row both reads returned (by id, and in its coach's whole list) is one playlist, not two of a name.
    if (rowId && ix.byId.has(rowId)) continue;
    if (rowId) ix.byId.set(rowId, href);
    const key = nameKey(r.name);
    if (!key) continue;
    // A second playlist of this name makes the name say nothing: a plan saved before ids could mean either.
    ix.byName.set(key, ix.byName.has(key) ? null : href);
  }
  return owners;
}

/**
 * A plan's playlist as the member reads it: `{ id?, name, meta }`, with `url` when the coach's own saved
 * playlist gives one. Null for anything that is not a named playlist.
 */
export function linkedPlaylist(p, owner, index) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const name = String(p.name ?? '').trim();
  if (!name) return null;
  const id = p.id == null ? '' : String(p.id).trim();
  const out = { ...(id ? { id } : {}), name, meta: String(p.meta ?? '') };
  const ix = owner != null ? index.get(String(owner)) : null;
  if (!ix) return out;
  // By id when the plan has one: a playlist since deleted opens nothing, not a namesake.
  const href = id ? ix.byId.get(id) ?? null : ix.byName.get(nameKey(name)) ?? null;
  return href ? { ...out, url: href } : out;
}

// A saved playlist's id is a uuid (coach_soundtracks.id); the payload is client-written, so anything else is
// no id that could match, and one such value in the read's `in('id', …)` would fail the whole read.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What a plan's playlists need read from their coaches' saved ones (Codex P2 on #2679: one capped read of
 * every owner's rows could cut off the very playlist a plan names). A playlist with an id needs only that
 * row: `ids`, from `idOwners`. One saved before ids is matched by a name only one of that coach's playlists
 * has, which takes the coach's whole list: `nameOwners`.
 * @param {Array<{ playlist: unknown, owner: string|null|undefined }>} refs
 */
export function playlistLookups(refs) {
  const ids = new Set(), idOwners = new Set(), nameOwners = new Set();
  for (const ref of Array.isArray(refs) ? refs : []) {
    const p = ref && ref.playlist;
    const owner = ref && ref.owner != null ? String(ref.owner) : '';
    if (!owner || !p || typeof p !== 'object' || !String(p.name ?? '').trim()) continue;
    const id = p.id == null ? '' : String(p.id).trim();
    if (!id) nameOwners.add(owner);
    else if (UUID.test(id)) { ids.add(id); idOwners.add(owner); }
  }
  return { ids: [...ids], idOwners: [...idOwners], nameOwners: [...nameOwners] };
}

/** Every playlist on a menu's days, on a day or a meal. */
export function mealDayPlaylists(days) {
  const out = [];
  for (const d of Array.isArray(days) ? days : []) {
    if (!d || typeof d !== 'object') continue;
    if (d.playlist && typeof d.playlist === 'object') out.push(d.playlist);
    for (const m of Array.isArray(d.meals) ? d.meals : []) if (m && m.playlist && typeof m.playlist === 'object') out.push(m.playlist);
  }
  return out;
}

/** Whether a plan's meal days carry any playlist, on a day or a meal. */
export function mealDaysHavePlaylist(days) {
  return (Array.isArray(days) ? days : []).some((d) => d && typeof d === 'object'
    && ((d.playlist && typeof d.playlist === 'object') || (Array.isArray(d.meals) && d.meals.some((m) => m && m.playlist && typeof m.playlist === 'object'))));
}

/**
 * The menu's days with each day's and each meal's playlist read through `linkedPlaylist` (a stored `url`
 * dropped, the coach's own link set). A day or meal with no playlist is returned as it was, so a plan
 * without one reads as before.
 */
export function linkMealDays(days, owner, index) {
  if (!Array.isArray(days)) return days;
  return days.map((d) => {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return d;
    let next = d;
    if ('playlist' in d) {
      next = { ...next };
      const p = linkedPlaylist(d.playlist, owner, index);
      if (p) next.playlist = p;
      else delete next.playlist;
    }
    if (Array.isArray(d.meals) && d.meals.some((m) => m && typeof m === 'object' && 'playlist' in m)) {
      next = {
        ...next,
        meals: d.meals.map((m) => {
          if (!m || typeof m !== 'object' || !('playlist' in m)) return m;
          const mm = { ...m };
          const p = linkedPlaylist(m.playlist, owner, index);
          if (p) mm.playlist = p;
          else delete mm.playlist;
          return mm;
        }),
      };
    }
    return next;
  });
}
