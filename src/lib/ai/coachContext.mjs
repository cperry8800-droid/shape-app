// The coach's own context the signal engine reads (P2, 2026-11-05), read on the server for the hourly
// push (/api/ai/notify, /api/ai/notify/cron) and Nora's "What needs me today?" (coachToday.mjs):
//   dismissals — their rows in coach_signal_dismissals ({ client_id, reason_key, reason_sig, until,
//                provider_role }), which DashSignals.attachCoachContext puts on each record of the role
//                being read so the engine skips them;
//   reviews    — their coach_week_reviews doc, which decides whether a check-in still waits.
// Each is null when it could not be read: no dismissals then hides nothing, and an unknown review
// state keeps "check-in waiting" quiet. ⚠ The table arrives with a migration the owner runs by hand
// (supabase-migrations/2026-11-05-coach-signal-dismissals.sql), and its role column with another
// (2026-11-05-coach-signal-dismissals-by-role.sql); until both have run the read errors, answers null,
// and every flag shows exactly as before.

/**
 * @param {any} client  a Supabase client: the coach's own (RLS: coach_id = auth.uid()) or the admin one
 * @param {string} userId the coach's account
 * @returns {Promise<{ dismissals: unknown[] | null, reviews: Record<string, unknown> | null }>}
 */
export async function loadCoachContext(client, userId) {
  const settle = async (q) => { try { return await q; } catch { return { data: null, error: true }; } };
  if (!client || typeof userId !== 'string' || !userId) return { dismissals: null, reviews: null };
  const [dis, rev] = await Promise.all([
    settle(client.from('coach_signal_dismissals').select('client_id, reason_key, reason_sig, until, provider_role').eq('coach_id', userId)),
    settle(client.from('user_goals').select('data').eq('user_id', userId).eq('kind', 'coach_week_reviews').maybeSingle()),
  ]);
  const dismissals = !dis || dis.error || !Array.isArray(dis.data) ? null : dis.data;
  // No row is "nothing reviewed yet" ({}); a failed read is unknown (null).
  const doc = rev && !rev.error ? (rev.data && rev.data.data && typeof rev.data.data === 'object' ? rev.data.data : {}) : null;
  return { dismissals, reviews: doc };
}
