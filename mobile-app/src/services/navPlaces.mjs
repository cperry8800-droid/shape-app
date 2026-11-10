// mobile-app/src/services/navPlaces.mjs
// ── The places a page announces to the nav history, and reads back on a Back ──
// Owner, 2026-11-10: "Make sure back buttons are going back to previous page and location user was on",
// then, of the gaps #2683 left: "fix all of these". A page that a jump can leave (a coach's card, Search,
// the avatar corner) announces where it is (services/navHistory.mjs's keyed register), the shell's push
// records it, and a Back replays it onto the page's start props. These say what is recorded and how a
// start value opens the page again. Pure, so node --test covers them.

// ── A coach's library (Programs, a nutritionist's Plans): its kinds as tabs, then Music ──
// The page is on a kind (`libTab`) or on Music (`tab: 'soundtracks'`). One word records either; the
// Playlists shortcut asks for Music by its old name. Anything else opens on the first kind.
export function bsLibraryPlace(start, kinds) {
  const first = kinds && kinds.length ? kinds[0] : 'plans';
  if (start === 'soundtracks' || start === 'playlists') return { tab: 'soundtracks', libTab: first };
  return { tab: 'library', libTab: kinds && kinds.includes(start) ? start : first };
}
export function bsLibraryPlaceSub(tab, libTab) {
  return tab === 'soundtracks' ? 'soundtracks' : libTab;
}

// ── Chat's place: the feed it is on (the Wall, Community, the role's), Team (Coaches or Friends), or
// Channels ──
const CHAT_TABS = ['feed', 'teams', 'channels'];
export function bsChatPlaceLoc(tab, filter, teamsSel) {
  if (tab === 'feed') return { tab: 'feed', filter: filter || 'COMMUNITY' };
  if (tab === 'teams') return { tab: 'teams', teams: teamsSel === 'friends' ? 'friends' : 'coaches' };
  if (tab === 'channels') return { tab: 'channels' };
  return null;
}
// A recorded place, checked, or null (nothing to restore).
export function bsChatPlaceOf(place) {
  if (!place || typeof place !== 'object' || !CHAT_TABS.includes(place.tab)) return null;
  return bsChatPlaceLoc(place.tab, typeof place.filter === 'string' ? place.filter : '', place.teams);
}

// ── A profile opened inside Chat ──
// The person a profile page was opened with, as plain fields: a post's row carries its comments and
// reactions alongside, which a profile never reads (it reads the account by userId, and the name, tier and
// photo it shows first). Only a person with a name or an account is recorded.
export function bsProfileLoc(person) {
  if (!person || typeof person !== 'object') return null;
  const out = {};
  for (const k of Object.keys(person)) {
    const v = person[k];
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) out[k] = v;
  }
  return out.userId || out.who ? out : null;
}

// ── Home's Goals and its stations ──
// Home records Goals as 'goals', or 'goals:<station>' with a station open; Settings records its own pane
// the same way. The Goals page opens on that station.
const GOAL_VIEWS = ['training', 'nutrition', 'work', 'week', 'terms'];
export function bsGoalsSub(view) {
  return view && view !== 'cover' && GOAL_VIEWS.includes(view) ? 'goals:' + view : 'goals';
}
export function bsGoalsView(sub) {
  const s = String(sub || '');
  if (s !== 'goals' && !s.startsWith('goals:')) return null;
  const v = s.slice(6);
  return GOAL_VIEWS.includes(v) ? v : 'cover';
}
