// ─── TRAIN · WHICH WORKOUT EACH PLAYLIST PLAYS WITH ───────────────────────────────────────────
// Owner, 2026-11-10: "remove the music from jordan box and have the music assigned to workouts down
// in the playlist section, just make it more clear which workout its assigned to".
//
// A coach picks a playlist for a day of a program in the builder (the website's DbuDayChips), which saves
// it on the day as { id, name, meta }: the id of the coach's saved soundtrack, or only the name on a day
// saved before ids. The plan carries it (bsBuildTrainProgram's `playlist`), and the session card chips it.
// Train's Playlists section lists the coach's playlists (get_my_coach_playlists, each with its id, or the
// preview's sample); this matches each card to the days that play it, and adds a card for a day's
// playlist the list does not carry (a playlist the coach set on a workout without sending it to the
// member's list), so every workout's music is in the section.
//
// ⚠ BY ID FIRST (Codex on #2669): a coach may keep two playlists of one name, and the website's playlist
// page tells them apart by id. A day with an id matches only the card with that id; a day without one
// matches by name only when one card has that name, and claims none when two do.
//
// Pure: no window, no React. The section (BSCoachPlaylists) words the result.

// Names match as the builder's picker matches a day saved before ids: trimmed, case and spacing aside.
export const bsPlaylistKey = (name) => String(name == null ? '' : name).trim().replace(/\s+/g, ' ').toLowerCase();
const idOf = (v) => (v == null ? '' : String(v).trim());

// The week's playlists, each with the days that play it, soonest first counting from today (the week
// repeats, as On deck reads it): keyed `id:<id>` for a day that names its soundtrack, else `name:<name>`.
// A rest day plays nothing, though a coach-set rest keeps the day's playlist (bsApplyTrainAdjust) — the
// session card shows none there either.
export function bsPlaylistUses(program, todayIdx = 0) {
  const week = Array.isArray(program) ? program : [];
  const ahead = (i) => (i - todayIdx + 7) % 7;
  const uses = new Map();
  week.forEach((d, idx) => {
    if (!d || d.tag === 'REST' || !d.playlist) return;
    const name = bsPlaylistKey(d.playlist.name);
    if (!name) return;
    const id = idOf(d.playlist.id);
    const key = id ? `id:${id}` : `name:${name}`;
    if (!uses.has(key)) uses.set(key, { id, name, playlist: d.playlist, coach: null, days: [] });
    const u = uses.get(key);
    // The coach who set it: the first of its days that names one (a day the member wrote names none).
    if (!u.coach && d.coach) u.coach = d.coach;
    u.days.push({ idx, title: String(d.headline || d.title || '').replace(/\s*\n\s*/g, ' ').trim() });
  });
  for (const u of uses.values()) u.days.sort((a, b) => ahead(a.idx) - ahead(b.idx));
  return uses;
}

// The section's cards in order: each `item` ({ id?, title, … }) gains `uses` ([{ idx, title }], soonest
// first); a day's playlist with no card of its own gets one ({ title, meta, uses, onlyOnDay: true,
// coach }); then the cards that play this week come first, soonest first, and the rest keep their order.
export function bsTrainPlaylistCards(items, program, todayIdx = 0) {
  const ahead = (i) => (i - todayIdx + 7) % 7;
  const cards = (Array.isArray(items) ? items : []).map((it) => ({ ...it, uses: [] }));
  const byId = new Map();
  const byName = new Map();
  cards.forEach((c, i) => {
    const id = idOf(c.id);
    if (id) byId.set(id, i);
    const name = bsPlaylistKey(c.title);
    if (name) byName.set(name, [...(byName.get(name) || []), i]);
  });
  const own = new Map(); // a day's own card, by its group key
  const ownCard = (key, u) => {
    if (!own.has(key)) {
      const card = { title: String(u.playlist.name).trim(), meta: String(u.playlist.meta || '').trim(), uses: [], onlyOnDay: true, coach: u.coach };
      own.set(key, card);
      cards.push(card);
    }
    return own.get(key);
  };
  const groups = [...bsPlaylistUses(program, todayIdx).values()];
  // Days that name their soundtrack first, so a day saved before ids can join the card one of them made.
  for (const u of groups.filter((g) => g.id)) {
    const card = byId.has(u.id) ? cards[byId.get(u.id)] : ownCard(`id:${u.id}`, u);
    card.uses.push(...u.days);
  }
  for (const u of groups.filter((g) => !g.id)) {
    const named = byName.get(u.name) || [];
    if (named.length > 1) continue; // two cards of that name: which one is not ours to guess
    if (named.length === 1) { cards[named[0]].uses.push(...u.days); continue; }
    // Not in the list: the card an id-bearing day of that name made, when there is exactly one.
    const same = [...own.entries()].filter(([k, c]) => k.startsWith('id:') && bsPlaylistKey(c.title) === u.name);
    const card = same.length === 1 ? same[0][1] : ownCard(`name:${u.name}`, u);
    if (!card.coach && u.coach) card.coach = u.coach;
    card.uses.push(...u.days);
  }
  for (const c of cards) c.uses.sort((a, b) => ahead(a.idx) - ahead(b.idx));
  const soonest = (c) => (c.uses.length ? ahead(c.uses[0].idx) : 7);
  return cards.map((c, i) => [c, i]).sort((a, b) => soonest(a[0]) - soonest(b[0]) || a[1] - b[1]).map(([c]) => c);
}
