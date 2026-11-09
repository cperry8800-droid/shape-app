// A coach's public stats (owner, 2026-11-09: "Yes I want that data but coaches should be able to
// decide what they want public"): the read both surfaces call, over get_coach_public_stats
// (supabase-migrations/2026-11-09-coach-public-stats.sql). CANONICAL here; the app imports it through
// mobile-app/src/services/coachPublicStats.mjs and exposes it as window.ShapeCoachPublicStats.forOwner
// (services/shapeBackend.js), and the website reaches it through window.ShapeCoachKit
// (coachProfileKit.mjs) with its own Supabase client.
//
// What comes back: { state, sessions, clients, since, programClients }.
//   state           'ready' when the database answered, 'error' when it did not (or was never asked).
//   sessions        sessions coached on Shape, a whole number, or null.
//   clients         clients paying the coach now, or null.
//   since           the year of the coach's first client on Shape, or null. 0 means made public with
//                   no client yet (measured), as for the counts.
//   programClients  { "<coach_plans id>": clients on it now } for each published plan, or null.
// ⚠ NULL IS UNREAD OR PRIVATE, 0 IS MEASURED. A figure the coach keeps private, a private profile this
// viewer may not see, and any read that failed are all null; a figure the coach made public with
// nothing to count is 0 (or {}). The page shows a 0 or not by its own rule; it never shows a null.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// How many plans one answer may carry: a coach's library, never this long. A bounded walk on a
// viewer's device whatever the database sends (the profile doc's scan-cap precedent).
export const BS_PUBLIC_PLANS_MAX = 200;

const EMPTY = Object.freeze({ sessions: null, clients: null, since: null, programClients: null });

// A count the page can show: a whole number from 0, else null.
const countOf = (v) => {
  if (v == null || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
};
// A year, or 0 for "public, no client yet".
const yearOf = (v) => {
  const n = countOf(v);
  if (n == null) return null;
  return n === 0 || (n >= 1970 && n <= 9999) ? n : null;
};
const plansOf = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = [];
  for (const [id, n] of Object.entries(v)) {
    if (out.length >= BS_PUBLIC_PLANS_MAX) break;
    const c = countOf(n);
    if (UUID_RE.test(id) && c != null) out.push([id.toLowerCase(), c]);
  }
  // fromEntries defines OWN properties, so an id can never reach a prototype.
  return Object.fromEntries(out);
};

/** The figures from one row of get_coach_public_stats (or its array), state 'ready'; a missing row is an error. */
export function bsCoachPublicStatsFromRow(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return { state: 'error', ...EMPTY };
  return {
    state: 'ready',
    sessions: countOf(row.sessions_coached),
    clients: countOf(row.active_clients),
    since: yearOf(row.coaching_since),
    programClients: plansOf(row.program_clients),
  };
}

/** Read one coach's public stats, by their account id, with a Supabase client. Never throws. */
export async function bsCoachPublicStatsRead(client, ownerId) {
  if (!client || typeof client.rpc !== 'function' || typeof ownerId !== 'string' || !UUID_RE.test(ownerId)) return { state: 'error', ...EMPTY };
  try {
    const { data, error } = await client.rpc('get_coach_public_stats', { p_owner: ownerId });
    if (error) return { state: 'error', ...EMPTY };
    return bsCoachPublicStatsFromRow(data);
  } catch (e) {
    return { state: 'error', ...EMPTY };
  }
}
