// The care team around a shared client, from a coach's own session: who the other coaches are, and
// the automatic hand-off line a plan change posts to their private thread (owner, 2026-11-05: "when a
// coach changes a shared client's plan … post an automatic line to the care-team thread and notify the
// other coach").
//
// Everything runs on the ACTING COACH'S session, never the service role:
//   • get_client_coaches (2026-10-18-coach-access-past-due.sql) answers a coach on the client with
//     every coach the member pays now (an open subscription: active, trialing, past_due), names and
//     owners included;
//   • get_or_create_coach_coach_conversation opens (or finds) the private thread with each of them;
//   • the line is inserted as the coach, so the messages RLS decides it is theirs to post.
// The message carries metadata { kind: 'handoff', noticeTitle, copy, clientId, dedupe? }; the messages
// trigger (2026-11-05-coach-notices.sql) turns it into the other coach's `care_team_handoff` notice,
// with the copy their bell and push say in their language. Before that migration runs the trigger
// sends its ordinary "New message" notice for the line instead: one notice either way, never two.
//
// tellCareTeam(userClient, { clientId, actorId, role, compose, dedupe })
//   Reads the team; with no other coach it does nothing (the client isn't shared). Otherwise it asks
//   `compose({ coach, client })` for the line (src/lib/handoff.mjs) and posts it. `dedupe` keys the line
//   within the thread (metadata.dedupe): a save path that runs once per week of a program posts it on
//   the first week only.
// Best-effort: a plan change is saved before any of this runs, so nothing here throws; a failure is
// logged. Answers how many threads got the line.
//
// A plain module (no TypeScript, no path aliases) so the routes' tests load it as it ships.

const ROLES = new Set(['trainer', 'nutritionist']);

/** @param {any} userClient @param {string} clientId @returns {Promise<Array<{ role: string, providerId: number, name: string, userId: string }>|null>} */
export async function careTeamOf(userClient, clientId) {
  try {
    const { data, error } = await userClient.rpc('get_client_coaches', { p_client_id: clientId });
    if (error) {
      console.warn('[care-team] care team unreadable:', error.message);
      return null;
    }
    return (Array.isArray(data) ? data : [])
      .filter((r) => r && ROLES.has(r.provider_role) && typeof r.owner_id === 'string' && r.owner_id)
      .map((r) => ({ role: r.provider_role, providerId: Number(r.provider_id), name: String(r.name || '').trim(), userId: r.owner_id }));
  } catch (err) {
    console.warn('[care-team] care team read threw:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Every other person on the team, once each, never the actor. */
export function coCoachesFrom(team, actorId) {
  const out = [];
  for (const m of Array.isArray(team) ? team : []) {
    if (!m || !m.userId || m.userId === actorId || out.some((o) => o.userId === m.userId)) continue;
    out.push(m);
  }
  return out;
}

/** The actor's name on the team in the role they acted in, else in any role, else null. */
export function actorNameFrom(team, actorId, role) {
  const mine = (Array.isArray(team) ? team : []).filter((m) => m && m.userId === actorId && m.name);
  const inRole = mine.find((m) => m.role === role);
  return (inRole || mine[0] || {}).name || null;
}

export async function clientNameOf(userClient, clientId) {
  try {
    const { data } = await userClient.from('profiles').select('full_name').eq('id', clientId).maybeSingle();
    return String((data && data.full_name) || '').trim() || null;
  } catch {
    return null;
  }
}

/**
 * @param {any} userClient
 * @param {{ clientId: string, actorId: string, line: { title: string, body: string, copy?: any } | null, dedupe?: string | null, coCoaches: Array<{ userId: string }> }} a
 * @returns {Promise<number>}
 */
export async function postHandoff(userClient, a) {
  let posted = 0;
  if (!a || !a.line || !a.line.body) return 0;
  try {
    for (const other of a.coCoaches || []) {
      const { data: cid, error } = await userClient.rpc('get_or_create_coach_coach_conversation', {
        p_other_user_id: other.userId,
        p_client_id: a.clientId,
      });
      if (error || typeof cid !== 'string') {
        console.warn('[care-team] could not open the care-team thread:', error ? error.message : 'no id');
        continue;
      }
      if (a.dedupe) {
        const { data: seen, error: seenErr } = await userClient
          .from('messages').select('id').eq('conversation_id', cid).eq('metadata->>dedupe', a.dedupe).limit(1);
        // A read that fails posts anyway: a repeated line is better than a missing one.
        if (!seenErr && Array.isArray(seen) && seen.length) continue;
      }
      const { error: insErr } = await userClient.from('messages').insert({
        conversation_id: cid,
        sender_id: a.actorId,
        body: String(a.line.body).slice(0, 1000),
        metadata: {
          kind: 'handoff',
          clientId: a.clientId,
          noticeTitle: String(a.line.title || '').slice(0, 120),
          ...(a.line.copy && a.line.copy.title ? { copy: a.line.copy } : {}),
          ...(a.dedupe ? { dedupe: a.dedupe } : {}),
        },
      });
      if (insErr) {
        console.warn('[care-team] hand-off line not posted:', insErr.message);
        continue;
      }
      posted += 1;
    }
  } catch (err) {
    console.error('[care-team] postHandoff failed:', err instanceof Error ? err.message : err);
  }
  return posted;
}

/**
 * @param {any} userClient
 * @param {{ clientId: string, actorId: string, role: 'trainer' | 'nutritionist', compose: (who: { coach: string | null, client: string | null }) => any, dedupe?: string | null }} a
 * @returns {Promise<number>}
 */
export async function tellCareTeam(userClient, a) {
  try {
    const team = await careTeamOf(userClient, a.clientId);
    const others = coCoachesFrom(team, a.actorId);
    if (!others.length) return 0;
    const client = await clientNameOf(userClient, a.clientId);
    const line = a.compose({ coach: actorNameFrom(team, a.actorId, a.role), client });
    return await postHandoff(userClient, { clientId: a.clientId, actorId: a.actorId, line, dedupe: a.dedupe || null, coCoaches: others });
  } catch (err) {
    console.error('[care-team] tellCareTeam failed:', err instanceof Error ? err.message : err);
    return 0;
  }
}
