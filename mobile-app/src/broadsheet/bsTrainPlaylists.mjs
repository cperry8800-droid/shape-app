// ─── TRAIN · WHICH WORKOUT EACH PLAYLIST PLAYS WITH ───────────────────────────────────────────
// Owner, 2026-11-10: "remove the music from jordan box and have the music assigned to workouts down
// in the playlist section, just make it more clear which workout its assigned to".
//
// A coach picks a playlist for a day of a program in the builder (the website's DbuDayChips), which saves
// it on the day as { id, name, meta }: the id of the coach's saved soundtrack, or only the name on a day
// saved before ids. The plan carries it (bsBuildTrainProgram's `playlist`), and the session card chips it.
// Eat's are the nutritionist's: a playlist on a meal-plan day or a meal (bsEatPlaylistEntries).
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

// What plays where, as entries ({ idx, title, playlist, coach }): Train's are its days, Eat's its days and
// their meals (bsEatPlaylistEntries).
// Train: a rest day plays nothing, though a coach-set rest keeps the day's playlist (bsApplyTrainAdjust) —
// the session card shows none there either.
export function bsTrainPlaylistEntries(program) {
  const out = [];
  (Array.isArray(program) ? program : []).forEach((d, idx) => {
    if (!d || d.tag === 'REST' || !d.playlist) return;
    out.push({ idx, title: String(d.headline || d.title || '').replace(/\s*\n\s*/g, ' ').trim(), playlist: d.playlist, coach: d.coach || null });
  });
  return out;
}

// A React node's words, for a sample day whose title is JSX (<>Easy plate.</>): a line break is a space.
export function bsNodeText(n) {
  if (n == null || n === false || n === true) return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(bsNodeText).join('');
  if (typeof n === 'object') {
    if (n.type === 'br') return ' ';
    return n.props ? bsNodeText(n.props.children) : '';
  }
  return '';
}
const words = (n) => bsNodeText(n).replace(/\s+/g, ' ').trim();

// Eat: a nutritionist links a playlist to a meal-plan day (a Sunday prep) or to a meal in the builder
// (dashMealBuilder.jsx); the plan carries it on the day (`playlist`) and on the meal. A rest day still has
// its meals, so it plays what it carries.
export function bsEatPlaylistEntries(program) {
  const out = [];
  (Array.isArray(program) ? program : []).forEach((d, idx) => {
    if (!d) return;
    if (d.playlist) out.push({ idx, title: words(d.headline) || words(d.title), playlist: d.playlist, coach: null });
    for (const m of Array.isArray(d.meals) ? d.meals : []) {
      if (m && m.playlist) out.push({ idx, title: words(m.title), playlist: m.playlist, coach: null });
    }
  });
  return out;
}

// The playlists the entries play, each with where it plays, soonest first counting from today (the week
// repeats, as On deck reads it): keyed `id:<id>` for an entry that names its soundtrack, else `name:<name>`.
export function bsPlaylistGroups(entries, todayIdx = 0) {
  const ahead = (i) => (i - todayIdx + 7) % 7;
  const uses = new Map();
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e || !e.playlist) continue;
    const name = bsPlaylistKey(e.playlist.name);
    if (!name) continue;
    const id = idOf(e.playlist.id);
    const key = id ? `id:${id}` : `name:${name}`;
    if (!uses.has(key)) uses.set(key, { id, name, playlist: e.playlist, coach: null, days: [] });
    const u = uses.get(key);
    // The coach who set it: the first of its entries that names one (a day the member wrote names none).
    if (!u.coach && e.coach) u.coach = e.coach;
    // A playlist on a day and on one of its meals of the same name says so once per place.
    if (!u.days.some((x) => x.idx === e.idx && x.title === e.title)) u.days.push({ idx: e.idx, title: e.title });
  }
  for (const u of uses.values()) u.days.sort((a, b) => ahead(a.idx) - ahead(b.idx));
  return uses;
}
// Train's, by its days (kept for the callers that read a week).
export const bsPlaylistUses = (program, todayIdx = 0) => bsPlaylistGroups(bsTrainPlaylistEntries(program), todayIdx);

// The section's cards in order: each `item` ({ id?, title, … }) gains `uses` ([{ idx, title }], soonest
// first); a playlist the entries play with no card of its own gets one ({ title, meta, uses, onlyOnDay:
// true, coach }); then the cards that play this week come first, soonest first, and the rest keep their
// order.
export function bsPlaylistCardsFor(items, entries, todayIdx = 0) {
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
  const add = (card, days) => { for (const d of days) if (!card.uses.some((x) => x.idx === d.idx && x.title === d.title)) card.uses.push(d); };
  const groups = [...bsPlaylistGroups(entries, todayIdx).values()];
  // Entries that name their soundtrack first, so one saved before ids can join the card one of them made.
  for (const u of groups.filter((g) => g.id)) {
    add(byId.has(u.id) ? cards[byId.get(u.id)] : ownCard(`id:${u.id}`, u), u.days);
  }
  for (const u of groups.filter((g) => !g.id)) {
    // Every card that playlist could be: the list's of that name, and the ones id-bearing entries of that name
    // made (Codex on #2669: a list's "Pull" and an unsent "Pull" a day names by id are two candidates).
    const candidates = [
      ...(byName.get(u.name) || []).map((i) => cards[i]),
      ...[...own.entries()].filter(([k, c]) => k.startsWith('id:') && bsPlaylistKey(c.title) === u.name).map(([, c]) => c),
    ];
    if (candidates.length > 1) continue; // which one is not ours to guess
    const card = candidates.length === 1 ? candidates[0] : ownCard(`name:${u.name}`, u);
    if (card.onlyOnDay && !card.coach && u.coach) card.coach = u.coach;
    add(card, u.days);
  }
  for (const c of cards) c.uses.sort((a, b) => ahead(a.idx) - ahead(b.idx));
  const soonest = (c) => (c.uses.length ? ahead(c.uses[0].idx) : 7);
  return cards.map((c, i) => [c, i]).sort((a, b) => soonest(a[0]) - soonest(b[0]) || a[1] - b[1]).map(([c]) => c);
}

export const bsTrainPlaylistCards = (items, program, todayIdx = 0) => bsPlaylistCardsFor(items, bsTrainPlaylistEntries(program), todayIdx);
export const bsEatPlaylistCards = (items, program, todayIdx = 0) => bsPlaylistCardsFor(items, bsEatPlaylistEntries(program), todayIdx);

// A playlist as a plan carries it ({ id?, name, meta }), or null: a playlist with no name is none.
export function bsPlaylistOf(p) {
  if (!p || typeof p !== 'object') return null;
  const name = String(p.name == null ? '' : p.name).trim();
  if (!name) return null;
  const id = idOf(p.id);
  return { ...(id ? { id } : {}), name, meta: String(p.meta == null ? '' : p.meta).trim() };
}
