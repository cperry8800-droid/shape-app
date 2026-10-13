// src/lib/admin-activity.mjs
//
// The admin console's record of what staff change (public.admin_activity_log, service role only;
// supabase-migrations/2026-10-13-staff-access-and-admin-stats.sql).
//
// THE ORDER IS THE POINT: a change is logged 'pending' BEFORE it runs, then marked 'done' or
// 'failed'. A change whose row cannot be written does not run (the caller refuses), so there is
// no unlogged change, and a change that fails part way still has its row, marked failed.
//
// `db` is the service-role client; the caller has already checked the staff level.

const MISSING_TABLE = new Set(['42P01', 'PGRST205']);

/**
 * Writes the 'pending' row. Returns { id } or { error } where error is 'missing_migration'
 * (the table is not there yet) or 'not_logged'.
 */
export async function startActivity(db, actor, { action, targetUserId = null, targetEmail = null, details = {} }) {
  try {
    const { data, error } = await db
      .from('admin_activity_log')
      .insert({
        actor_user_id: actor.id,
        actor_email: actor.email,
        action,
        target_user_id: targetUserId,
        target_email: targetEmail,
        details,
        outcome: 'pending',
      })
      .select('id')
      .single();
    if (error) return { error: MISSING_TABLE.has(error.code) ? 'missing_migration' : 'not_logged' };
    if (!data?.id) return { error: 'not_logged' };
    return { id: data.id };
  } catch {
    return { error: 'not_logged' };
  }
}

/** Marks the row 'done' or 'failed'. Best effort: the change already happened, or did not. */
export async function finishActivity(db, id, outcome) {
  try {
    await db.from('admin_activity_log').update({ outcome: outcome === 'done' ? 'done' : 'failed' }).eq('id', id);
  } catch {
    /* the row stays 'pending', which the activity page shows as unconfirmed */
  }
}
