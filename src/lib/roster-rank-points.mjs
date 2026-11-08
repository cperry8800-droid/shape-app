// Each roster client's Shape Score rank points, for their tier colour on the coach dashboard
// (the owner, 2026-11-06: "client colors should match their current tier in shape score").
//
// ⚠ AN EXISTING READ, NO NEW REACH. get_user_points (2026-10-12-shape-score-fixes.sql) is the
// signed-in definer the app's avatar tiers already call for any member (people search, feed,
// chat), and it answers on the rank basis every tier is drawn from: shape_rank_points, the
// high-water mark of points earned without Store purchases or tier bonuses (the Score page's
// `shapeScore`, the public profile card, the leaderboards). It carries no share switch because the
// tier is not private: the profile card shows it on a private profile too. The roster passes
// only its own clients' ids.
//
// ⚠ UNREAD IS NOT RAW. The answer is a Map of id -> points for every id whose request answered;
// an id in a request that failed is absent, and the roster sends it as null (tier unknown, no
// colour). Inside an answered request, an id with no row is a member with no ledger at all: the
// function's own contract ("one row per member with a ledger"), so 0, which is Raw, the tier
// their own Score page shows. A row whose points are not a number is absent too, never 0.

export const RANK_POINTS_CHUNK = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {{ rpc: (fn: string, args: object) => PromiseLike<{ data: unknown, error: unknown }> }} supabase the caller's client
 * @param {Array<string | null | undefined>} ids roster client ids
 * @returns {Promise<Map<string, number>>} lower-cased id -> rank points, for the ids that were read
 */
export async function rosterRankPoints(supabase, ids) {
  const out = new Map();
  const list = [...new Set((ids || []).filter((v) => typeof v === 'string' && UUID.test(v)).map((v) => v.toLowerCase()))];
  if (!list.length || !supabase || typeof supabase.rpc !== 'function') return out;
  const chunks = [];
  for (let i = 0; i < list.length; i += RANK_POINTS_CHUNK) chunks.push(list.slice(i, i + RANK_POINTS_CHUNK));
  await Promise.all(chunks.map(async (chunk) => {
    let res;
    try { res = await supabase.rpc('get_user_points', { p_ids: chunk }); }
    catch (e) { console.warn('[shape-app] roster rank points: read failed — those tiers render unknown:', e instanceof Error ? e.message : e); return; }
    if (!res || res.error || !Array.isArray(res.data)) {
      console.warn('[shape-app] roster rank points: read failed — those tiers render unknown:', res && res.error && typeof res.error === 'object' && 'message' in res.error ? res.error.message : 'no rows');
      return;
    }
    const got = new Map(chunk.map((id) => [id, 0]));
    for (const row of res.data) {
      const id = row && typeof row.user_id === 'string' ? row.user_id.toLowerCase() : null;
      if (!id || !got.has(id)) continue;
      const pts = row.points == null ? NaN : Number(row.points);
      if (Number.isFinite(pts) && pts >= 0) got.set(id, pts);
      else got.delete(id);
    }
    for (const [id, pts] of got) out.set(id, pts);
  }));
  return out;
}
