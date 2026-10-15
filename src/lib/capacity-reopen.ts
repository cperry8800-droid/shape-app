// A coach's reopening, and telling their waiting list (client-onboarding task #10).
//
// Two ways a coach goes from at capacity to accepting, and both tell everyone still waiting:
//   · they switch it off (POST /api/coach/capacity calls tellWaitingList);
//   · the resume date they set passes. ⚠ NOTHING WROTE AT THAT MOMENT (Codex on #2375), so members
//     on the list of a coach who picked a date never heard the coach reopened. The hourly
//     /api/cron/capacity-reopen runs reopenDueListings: it switches each listing whose date has
//     passed off, and tells its list.
//
// The service-role client and the notice writer are passed in, so the route and the cron share one
// copy and the tests drive it with recorded fakes.

import type { SupabaseClient } from '@supabase/supabase-js';

export type CapacityRole = 'trainer' | 'nutritionist';

/** The most waiting members one reopening notifies. */
export const NOTIFY_MAX = 500;
/** Listings the cron reopens per role per run (the next run takes the rest). */
export const REOPEN_BATCH = 200;
/** A date that passed longer ago than this is switched off without a notice: news that old is not. */
export const REOPEN_NOTICE_DAYS = 7;

type Notice = {
  userId: string;
  type: string;
  title: string;
  body: string;
  route: string;
  data: Record<string, unknown>;
};
export type NotifyFn = (admin: SupabaseClient, notice: Notice) => Promise<boolean>;

function tableOf(role: CapacityRole) {
  return role === 'trainer' ? 'trainers' : 'nutritionists';
}

/** Tell every member still waiting that the coach is taking new clients. Best effort: answers how many were told. */
export async function tellWaitingList(
  admin: SupabaseClient,
  notify: NotifyFn,
  role: CapacityRole,
  providerId: number,
  name: string | null,
  day: string = new Date().toISOString().slice(0, 10),
): Promise<number> {
  try {
    const { data, error } = await admin
      .from('coach_waitlist')
      .select('client_id')
      .eq('provider_role', role)
      .eq('provider_id', providerId)
      .eq('status', 'waiting')
      // capped-read-ok: first come, first told. Past the cap, the people who have waited longest are
      // the ones who hear the coach reopened.
      .order('created_at', { ascending: true })
      .limit(NOTIFY_MAX);
    if (error) {
      console.error('[coach capacity] waiting list read failed', error.message);
      return 0;
    }
    const coach = (name || '').trim() || 'A coach you waited for';
    let sent = 0;
    const rows = (data ?? []) as { client_id: string }[];
    for (let i = 0; i < rows.length; i += 10) {
      const batch = await Promise.all(rows.slice(i, i + 10).map((w) => notify(admin, {
        userId: w.client_id,
        type: 'waitlist_invite',
        title: `${coach} is taking new clients`,
        body: 'You were on their waiting list. Their spots are open now, first come first served.',
        route: `coach:${role}:${providerId}`,
        data: { providerRole: role, providerId, reopened: true, dedupe: `reopen:${role}:${providerId}:${day}` },
      })));
      sent += batch.filter(Boolean).length;
    }
    return sent;
  } catch (err) {
    console.error('[coach capacity] reopening notice failed', err instanceof Error ? err.message : err);
    return 0;
  }
}

/**
 * Switch off every listing whose resume date has passed, and tell its waiting list. Each listing is
 * switched off only if it still holds the date that was read, so a coach who changed it meanwhile is
 * left alone, and two overlapping runs tell a list once.
 */
export async function reopenDueListings(
  admin: SupabaseClient,
  notify: NotifyFn,
  nowMs: number = Date.now(),
): Promise<{ reopened: number; notified: number; failed: number }> {
  const nowIso = new Date(nowMs).toISOString();
  let reopened = 0;
  let notified = 0;
  let failed = 0;
  for (const role of ['trainer', 'nutritionist'] as CapacityRole[]) {
    const { data, error } = await admin
      .from(tableOf(role))
      .select('id, name, capacity_resume_at')
      .eq('at_capacity', true)
      .lte('capacity_resume_at', nowIso)
      // capped-read-ok: the dates that passed first are reopened first; the next run takes the rest.
      .order('capacity_resume_at', { ascending: true })
      .limit(REOPEN_BATCH);
    if (error) {
      console.error('[capacity reopen] read failed', role, error.message);
      failed++;
      continue;
    }
    for (const row of (data ?? []) as { id: number; name: string | null; capacity_resume_at: string | null }[]) {
      if (!row.capacity_resume_at) continue;
      const { data: done, error: updErr } = await admin
        .from(tableOf(role))
        .update({ at_capacity: false, capacity_resume_at: null })
        .eq('id', row.id)
        .eq('at_capacity', true)
        .eq('capacity_resume_at', row.capacity_resume_at)
        .select('id');
      if (updErr) {
        console.error('[capacity reopen] update failed', role, row.id, updErr.message);
        failed++;
        continue;
      }
      if (!Array.isArray(done) || done.length === 0) continue; // changed meanwhile, or another run took it
      reopened++;
      const resumeMs = Date.parse(row.capacity_resume_at);
      if (Number.isFinite(resumeMs) && nowMs - resumeMs <= REOPEN_NOTICE_DAYS * 86_400_000) {
        notified += await tellWaitingList(admin, notify, role, row.id, row.name, new Date(resumeMs).toISOString().slice(0, 10));
      }
    }
  }
  return { reopened, notified, failed };
}
