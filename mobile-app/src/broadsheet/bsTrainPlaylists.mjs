// ─── TRAIN · WHICH WORKOUT EACH PLAYLIST PLAYS WITH ───────────────────────────────────────────
// Owner, 2026-11-10: "remove the music from jordan box and have the music assigned to workouts down
// in the playlist section, just make it more clear which workout its assigned to".
//
// A coach picks a playlist for a day of a program in the builder (the website's DbuDayChips). The plan
// carries it on that day as { name, meta } (bsBuildTrainProgram's `playlist`), and the session card
// chips it. Train's Playlists section lists the coach's playlists (get_my_coach_playlists, or the
// preview's sample); this matches each card to the days that play it, by name, and adds a card for a
// day's playlist the list does not carry (a playlist the coach set on a workout without sending it to
// the member's list), so every workout's music is in the section.
//
// Pure: no window, no React. The section (BSCoachPlaylists) words the result.

// Names match as the builder's picker matches a day saved before ids: trimmed, case and spacing aside.
export const bsPlaylistKey = (name) => String(name == null ? '' : name).trim().replace(/\s+/g, ' ').toLowerCase();

// The week's days that play each playlist, soonest first counting from today (the week repeats, as On
// deck reads it). A rest day plays nothing, though a coach-set rest keeps the day's playlist
// (bsApplyTrainAdjust) — the session card shows none there either.
export function bsPlaylistUses(program, todayIdx = 0) {
  const week = Array.isArray(program) ? program : [];
  const ahead = (i) => (i - todayIdx + 7) % 7;
  const uses = new Map();
  week.forEach((d, idx) => {
    if (!d || d.tag === 'REST' || !d.playlist) return;
    const key = bsPlaylistKey(d.playlist.name);
    if (!key) return;
    if (!uses.has(key)) uses.set(key, { playlist: d.playlist, coach: null, days: [] });
    const u = uses.get(key);
    // The coach who set it: the first of its days that names one (a day the member wrote names none).
    if (!u.coach && d.coach) u.coach = d.coach;
    u.days.push({ idx, title: String(d.headline || d.title || '').replace(/\s*\n\s*/g, ' ').trim() });
  });
  for (const u of uses.values()) u.days.sort((a, b) => ahead(a.idx) - ahead(b.idx));
  return uses;
}

// The section's cards in order: each `item` ({ title, … }) gains `uses` ([{ idx, title }], soonest
// first); a day's playlist with no card of its own gets one ({ title, meta, uses, onlyOnDay: true,
// coach }); then the cards that play this week come first, soonest first, and the rest keep their order.
export function bsTrainPlaylistCards(items, program, todayIdx = 0) {
  const uses = bsPlaylistUses(program, todayIdx);
  const ahead = (i) => (i - todayIdx + 7) % 7;
  const carried = new Set();
  const cards = (Array.isArray(items) ? items : []).map((it) => {
    const key = bsPlaylistKey(it && it.title);
    carried.add(key);
    return { ...it, uses: (uses.get(key) || { days: [] }).days };
  });
  for (const [key, u] of uses) {
    if (carried.has(key)) continue;
    cards.push({ title: String(u.playlist.name).trim(), meta: String(u.playlist.meta || '').trim(), uses: u.days, onlyOnDay: true, coach: u.coach });
  }
  const soonest = (c) => (c.uses.length ? ahead(c.uses[0].idx) : 7);
  return cards.map((c, i) => [c, i]).sort((a, b) => soonest(a[0]) - soonest(b[0]) || a[1] - b[1]).map(([c]) => c);
}
