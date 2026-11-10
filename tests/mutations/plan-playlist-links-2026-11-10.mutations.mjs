// Mutation spec for the playlist chip opening the playlist (owner, 2026-11-10: "make the playlist chip open
// the playlist"): the plan read's link lookup (src/lib/plan-playlist-links.mjs and its service-role read in
// /api/client/plan) and the website chip that opens it (dashClient.jsx). Every mutation must be killed.
//   node scripts/mutate.mjs --spec tests/mutations/plan-playlist-links-2026-11-10.mutations.mjs --fail-on-skipped
const LIB = 'src/lib/plan-playlist-links.mjs';
const ROUTE = 'src/app/api/client/plan/route.ts';
const CARD = 'public/newdesign/dashClient.jsx';

export default {
  test: 'node --test tests/plan-playlist-links.test.mjs tests/meal-plan-playlists.test.mjs',
  timeoutMs: 180_000,
  mutations: [
    // ── which links count ──
    { name: 'a plain http link opens', file: LIB, find: "return u.protocol === 'https:' && LINK_HOSTS.test(u.hostname) ? u.href : null;", replace: 'return LINK_HOSTS.test(u.hostname) ? u.href : null;' },
    { name: 'any host opens', file: LIB, find: "return u.protocol === 'https:' && LINK_HOSTS.test(u.hostname) ? u.href : null;", replace: "return u.protocol === 'https:' ? u.href : null;" },
    { name: 'a lookalike host opens', file: LIB, find: "const LINK_HOSTS = /(^|\\.)(spotify\\.com|spotify\\.link|music\\.apple\\.com)$/i;", replace: "const LINK_HOSTS = /(^|\\.)(spotify\\.com|spotify\\.link|music\\.apple\\.com)/i;" },

    // ── matching ──
    { name: 'a shared name opens the last one', file: LIB, find: 'ix.byName.set(key, ix.byName.has(key) ? null : href);', replace: 'ix.byName.set(key, href);' },
    { name: 'a deleted id opens a namesake', file: LIB, find: 'const href = id ? ix.byId.get(id) ?? null : ix.byName.get(nameKey(name)) ?? null;', replace: 'const href = (id ? ix.byId.get(id) : null) ?? ix.byName.get(nameKey(name)) ?? null;' },
    { name: "the plan's own link survives", file: LIB, find: "  const out = { ...(id ? { id } : {}), name, meta: String(p.meta ?? '') };", replace: "  const out = { ...p, ...(id ? { id } : {}), name, meta: String(p.meta ?? '') };" },
    { name: "another coach's playlist opens", file: LIB, find: '  const ix = owner != null ? index.get(String(owner)) : null;', replace: '  const ix = owner != null ? index.get(String(owner)) : [...index.values()][0];' },
    { name: 'a meal is not linked', file: LIB, find: '          const p = linkedPlaylist(m.playlist, owner, index);', replace: '          const p = m.playlist;' },
    { name: 'a stored day link is kept', file: LIB, find: "    if ('playlist' in d) {", replace: '    if (false) {' },

    // ── the route's read ──
    { name: "the read isn't held to the plan's coaches", file: ROUTE, find: "        .in('owner_id', playlistOwners)\n", replace: '' },
    { name: 'the read runs with no playlist on the plan', file: ROUTE, find: '  if (playlistOwners.length) {', replace: '  if (true) {' },
    { name: "a workout reads the menu's coach", file: ROUTE, find: "    const linked = w.playlist ? linkedPlaylist(w.playlist, workoutOwner.get(String(w.id)) ?? null, playlistLinks) : null;", replace: "    const linked = w.playlist ? linkedPlaylist(w.playlist, menuOwner, playlistLinks) : null;" },
    { name: 'the menu is sent unlinked', file: ROUTE, find: '      days: menuDays,', replace: '      days: mealDays,' },
    { name: 'a failed read breaks the plan', file: ROUTE, find: "      if (error) console.error('[client/plan] playlist links read failed:', error.message);\n      else playlistLinks = playlistLinkIndex(data ?? []);", replace: "      if (error) throw new Error(error.message);\n      playlistLinks = playlistLinkIndex(data ?? []);" },

    // ── the chip ──
    { name: 'the chip opens any link', file: CARD, find: '    return u.protocol === "https:" && DCL_PLAYLIST_HOSTS.test(u.hostname) ? u.href : null;', replace: '    return u.href;' },
    { name: 'the chip opens in the same tab', file: CARD, find: 'target: "_blank", rel: "noopener noreferrer", ', replace: '' },
    { name: "the preview opens the plan's own link", file: CARD, find: '  return href ? { ...rest, url: href } : rest;', replace: '  return href ? { ...rest, url: href } : p;' },
    { name: 'the preview matches a shared name', file: CARD, find: '(named.length === 1 ? named[0] : null)', replace: '(named[0] || null)' },
    { name: 'the meals card never opens', file: CARD, find: '    const href = dclPlaylistHref(p);\n    const words', replace: '    const href = null;\n    const words' },
  ],
};
