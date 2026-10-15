// The member and coach leaderboards: the rules the two routes share, kept pure so the website,
// the app and the tests read one copy.
//
// The ranking itself is in the database (shape_member_board / shape_coach_board,
// supabase-migrations/2026-10-15-leaderboards.sql). What lives here is reading a request,
// naming tiers, saying why a member is hidden, and trimming the coach board.

/** Member ladder (src/app/api/client/score/route.ts). */
export const MEMBER_TIERS = [['Raw', 0], ['Tempo', 750], ['Form', 2000], ['Peak', 5000], ['Legend', 15000]];
/** Coach ladder (src/app/api/coach/score/route.ts). */
export const COACH_TIERS = [['Certified', 0], ['Pro', 750], ['Elite', 2000], ['Master', 5000], ['Icon', 15000]];

export const SCOPES = ['everyone', 'following', 'team'];
export const PERIODS = ['week', 'month', 'all'];
export const COACH_VIEWS = ['standing', 'climb'];
export const COACH_ROLES = ['trainer', 'nutritionist'];

function tierOf(ladder, points) {
  const n = Number(points);
  if (!Number.isFinite(n)) return null;
  let name = ladder[0][0];
  for (const [label, floor] of ladder) if (n >= floor) name = label;
  return name;
}
export const memberTier = (points) => tierOf(MEMBER_TIERS, points);
export const coachTier = (points) => tierOf(COACH_TIERS, points);

function pick(raw, allowed, fallback) {
  const v = String(raw ?? '').trim().toLowerCase();
  return allowed.includes(v) ? v : fallback;
}
export const parseScope = (raw) => pick(raw, SCOPES, 'everyone');
export const parsePeriod = (raw) => pick(raw, PERIODS, 'month');
export const parseCoachView = (raw) => pick(raw, COACH_VIEWS, 'standing');
export const parseCoachRole = (raw) => pick(raw, COACH_ROLES, null);
export function parseLimit(raw, fallback = 50) {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? Math.min(200, n) : fallback;
}

/**
 * First name and last initial, as shape_member_board writes it. Used only on the fallback path
 * (a database the leaderboard migration has not reached), where the old board still returns the
 * full name. ⚠ The database's \s also matches tabs and newlines, so this splits on any space.
 */
export function shortName(full) {
  const name = String(full ?? '').trim();
  if (!name) return 'Shape member';
  if (!/\s/.test(name)) return name;
  const first = name.split(/\s+/)[0];
  const last = name.split(/\s+/).pop();
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}

/** shape_profile_visibility in JavaScript: 'public' | 'friends' | 'private'. Missing is public. */
export function normalizeVisibility(raw) {
  const v = String(raw ?? 'Public').toLowerCase();
  if (v.startsWith('pub')) return 'public';
  if (v.includes('friend') || v.includes('circle')) return 'friends';
  return 'private';
}

/**
 * The two switches as a member's settings document holds them.
 *   leaderboard  "Show me on leaderboards": on unless set to 'off' (the board's own default).
 *   teamBoard    "Show me to my coach's team": true / false once answered, null until then.
 *                The team board treats null as off.
 */
export function readPrivacy(prefsDoc) {
  const d = prefsDoc && typeof prefsDoc === 'object' ? prefsDoc : {};
  const team = d.team_board === 'on' ? true : d.team_board === 'off' ? false : null;
  return { leaderboard: d.leaderboard !== 'off', teamBoard: team };
}

/** The document after a change; keys this feature does not own are kept as they were. */
export function writePrivacy(prefsDoc, change) {
  const next = { ...(prefsDoc && typeof prefsDoc === 'object' ? prefsDoc : {}) };
  if (typeof change?.leaderboard === 'boolean') next.leaderboard = change.leaderboard ? 'on' : 'off';
  if (typeof change?.teamBoard === 'boolean') next.team_board = change.teamBoard ? 'on' : 'off';
  return next;
}

/**
 * Why other members do not see this one on the board they are looking at, or null when they do.
 *   'off'           the member turned "Show me on leaderboards" off
 *   'private'       their profile is not public (Everyone and Following only)
 *   'team_unasked'  the team board, and they have not answered the team switch yet
 *   'team_off'      the team board, and they turned the team switch off
 * Mirrors the `eligible` step of shape_member_board.
 */
export function hiddenReason(scope, privacy, visibility) {
  if (!privacy) return null;
  if (!privacy.leaderboard) return 'off';
  if (scope === 'team') {
    if (privacy.teamBoard === null) return 'team_unasked';
    return privacy.teamBoard ? null : 'team_off';
  }
  return normalizeVisibility(visibility) === 'public' ? null : 'private';
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/** Places moved since a week ago: positive is up. Null when there was no rank to compare. */
export function moved(rank, prevRank) {
  const r = num(rank), p = num(prevRank);
  return r === null || p === null ? null : p - r;
}

/** One shape_member_board row as the routes publish it. */
export function memberEntry(row) {
  const rank = num(row.rank), prevRank = num(row.prev_rank);
  return {
    userId: row.user_id,
    name: row.display_name || 'Shape member',
    avatarUrl: row.avatar_url || null,
    points: Number(row.points) || 0,
    rank,
    prevRank,
    moved: moved(rank, prevRank),
    tier: memberTier(row.rank_points),
    streak: Number(row.streak) || 0,
    trainingDays: Number(row.training_days) || 0,
    mealDays: Number(row.meal_days) || 0,
    isMe: row.is_me === true,
  };
}

/** One shape_coach_board row as the route publishes it. */
export function coachEntry(row) {
  const rank = num(row.rank), prevRank = num(row.prev_rank);
  return {
    providerId: Number(row.provider_id),
    name: row.name || 'Shape coach',
    specialty: row.specialty || null,
    avatarUrl: row.avatar_url || null,
    points: Number(row.points) || 0,
    tier: coachTier(row.points),
    activeClients: Number(row.active_clients) || 0,
    completionPct: Number(row.completion_pct) || 0,
    rank,
    prevRank,
    moved: moved(rank, prevRank),
    gained: num(row.gained),
    isMe: row.is_me === true,
    listed: row.listed !== false,
  };
}

/**
 * The coach board as sent: the top `limit`, and the caller with the coach either side of them,
 * so a coach at #140 sees who they are chasing without the page carrying all 140.
 * Unranked rows (a climber with no reading to compare) are left out, except the caller's own.
 */
export function trimCoachBoard(entries, limit = 50) {
  const ranked = entries.filter((e) => e.rank !== null).sort((a, b) => a.rank - b.rank || a.providerId - b.providerId);
  const at = ranked.findIndex((e) => e.isMe);
  const keep = new Set();
  ranked.forEach((e, i) => { if (i < limit || (at >= 0 && Math.abs(i - at) <= 1)) keep.add(e); });
  const out = ranked.filter((e) => keep.has(e));
  const me = entries.find((e) => e.isMe) || null;
  if (me && me.rank === null) out.push(me);
  return { entries: out, total: ranked.length, me };
}
