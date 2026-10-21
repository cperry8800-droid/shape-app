// A coach's reopening, and telling their waiting list (client-onboarding task #10).
//
// Two ways a coach goes from at capacity to accepting, and both tell everyone still waiting:
//   · they switch it off (POST /api/coach/capacity tells the list, then calls finishReopening);
//   · the resume date they set passes. ⚠ NOTHING WROTE AT THAT MOMENT (Codex on #2375), so members
//     on the list of a coach who picked a date never heard the coach reopened. The hourly
//     /api/cron/capacity-reopen runs reopenDueListings: it switches each listing whose date has
//     passed off, and tells its list.
//
// ⚠ THE LIST IS TOLD BEFORE THE LISTING STOPS BEING DUE (Codex on #2375, P1). The listing used to be
// switched off first and the list told after, in up to 50 batches; a run cut off by its time limit
// left the rest untold, and no later run could find the listing again. Now a listing stays due
// (at capacity, with a resume date that has passed, which members already meet as open) until
// every waiting member has been told, and only then is switched off. A run that stops early, at its
// own deadline or killed, leaves it due, and the next run carries on: members already holding the
// day's notice are skipped (and the notifications dedupe index refuses a second one anyway).
//
// The service-role client and the notice writer are passed in, so the route and the cron share one
// copy and the tests drive it with recorded fakes.

import type { SupabaseClient } from '@supabase/supabase-js';
import { np } from '../../mobile-app/src/services/noticeCopy.mjs';

export type CapacityRole = 'trainer' | 'nutritionist';

/** Waiting members read per page; a reopening tells every page (Codex on #2375: a cap left the rest untold for good). */
export const WAITLIST_PAGE = 500;
/** Listings the cron reopens per role per run (the next run takes the rest). */
export const REOPEN_BATCH = 200;
/** A date that passed longer ago than this is switched off without a notice: news that old is not. */
export const REOPEN_NOTICE_DAYS = 7;
/** How long one cron run spends telling lists, inside its 60-second limit. */
export const REOPEN_BUDGET_MS = 45_000;

type Notice = {
  userId: string;
  type: string;
  title: string;
  body: string;
  route: string;
  data: Record<string, unknown>;
};
// true / 'stored': sent. false / 'skipped': not sent by the member's own choice, or already sent.
// 'failed': a read or write that did not work, so the reopening stays due and a later run retries.
export type NotifyFn = (admin: SupabaseClient, notice: Notice) => Promise<boolean | 'stored' | 'skipped' | 'failed'>;

function tableOf(role: CapacityRole) {
  return role === 'trainer' ? 'trainers' : 'nutritionists';
}

/** The dedupe key of one reopening's notices: one per coach, role and day. */
export function reopenKey(role: CapacityRole, providerId: number, day: string) {
  return `reopen:${role}:${providerId}:${day}`;
}

/**
 * Tell every member still waiting that the coach is taking new clients, skipping anyone already told
 * this reopening. `complete` is false when the list could not be read, a notice failed (Codex on
 * #2375: a failed send counted as done was lost for good), or the deadline came before everyone was
 * reached: the caller keeps the listing due so a later run finishes.
 */
export async function tellWaitingList(
  admin: SupabaseClient,
  notify: NotifyFn,
  role: CapacityRole,
  providerId: number,
  name: string | null,
  day: string = new Date().toISOString().slice(0, 10),
  deadlineMs: number = Infinity,
): Promise<{ sent: number; complete: boolean }> {
  try {
    // ⚠ A CURSOR, NOT AN OFFSET (Codex on #2375). The list can shrink while it is read (a member
    // leaves or is invited), and an offset page then starts past a row nobody read: that member was
    // skipped and the reopening still marked complete. Each page starts after the last id read,
    // which no change to earlier rows can move. The rows are then put in join order, so members are
    // still told first come, first served.
    type Waiting = { id: string; client_id: string; created_at: string };
    const rows: Waiting[] = [];
    let after: string | null = null;
    for (;;) {
      let q = admin
        .from('coach_waitlist')
        .select('id, client_id, created_at')
        .eq('provider_role', role)
        .eq('provider_id', providerId)
        .eq('status', 'waiting');
      if (after) q = q.gt('id', after);
      // capped-read-ok: one page of a cursor walk over every row, not a cap.
      const { data, error } = await q.order('id', { ascending: true }).limit(WAITLIST_PAGE);
      if (error) {
        console.error('[coach capacity] waiting list read failed', error.message);
        return { sent: 0, complete: false };
      }
      const page = (data ?? []) as Waiting[];
      rows.push(...page);
      if (page.length < WAITLIST_PAGE) break;
      after = page[page.length - 1].id;
    }
    rows.sort((a, b) => (Date.parse(a.created_at) - Date.parse(b.created_at)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const dedupe = reopenKey(role, providerId, day);
    // Who an earlier, cut-off run already told. A failed read skips nobody: the dedupe index still
    // refuses a second notice, so the cost is only time.
    const told = new Set<string>();
    for (let i = 0; i < rows.length; i += 100) {
      const ids = rows.slice(i, i + 100).map((r) => r.client_id);
      const { data: seen, error: seenErr } = await admin
        .from('notifications')
        .select('user_id')
        .eq('type', 'waitlist_invite')
        .eq('data->>dedupe', dedupe)
        .in('user_id', ids);
      if (seenErr) break;
      for (const r of (seen ?? []) as { user_id: string }[]) told.add(r.user_id);
    }
    const todo = rows.filter((r) => !told.has(r.client_id));
    const named = (name || '').trim();
    const coach = named || 'A coach you waited for';
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < todo.length; i += 10) {
      if (Date.now() >= deadlineMs) return { sent, complete: false };
      const batch = await Promise.all(todo.slice(i, i + 10).map((w) => notify(admin, {
        userId: w.client_id,
        type: 'waitlist_invite',
        title: `${coach} is taking new clients`,
        body: 'You were on their waiting list. Their spots are open now, first come first served.',
        route: `coach:${role}:${providerId}`,
        data: {
          providerRole: role, providerId, reopened: true, dedupe,
          // How the bell and the push say it in the member's language (noticeCopy.mjs).
          copy: { title: named ? np('waitlist.reopen.title', { coach: named }) : np('waitlist.reopen.titleAnon'), body: np('waitlist.reopen.body') },
        },
      })));
      sent += batch.filter((o) => o === true || o === 'stored').length;
      failed += batch.filter((o) => o === 'failed').length;
    }
    if (failed) console.error('[coach capacity] reopening notices failed; left due for a retry', role, providerId, failed);
    return { sent, complete: failed === 0 };
  } catch (err) {
    console.error('[coach capacity] reopening notice failed', err instanceof Error ? err.message : err);
    return { sent: 0, complete: false };
  }
}

/**
 * Switch a due listing off once its list has been told: only while it still holds the date it was
 * due on, so a coach who changed it meanwhile is left alone and two overlapping runs switch it once.
 * Answers true when this call switched it, null when the write failed.
 */
export async function finishReopening(
  admin: SupabaseClient,
  role: CapacityRole,
  providerId: number,
  dueAt: string,
): Promise<boolean | null> {
  const { data, error } = await admin
    .from(tableOf(role))
    .update({ at_capacity: false, capacity_resume_at: null })
    .eq('id', providerId)
    .eq('at_capacity', true)
    .eq('capacity_resume_at', dueAt)
    .select('id');
  if (error) {
    console.error('[capacity reopen] update failed', role, providerId, error.message);
    return null;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * Tell the list of every listing whose resume date has passed, then switch it off. A listing whose
 * list was not all told by `deadlineMs` stays due for the next run (`pending`), and once the
 * deadline passes no further listing is started.
 */
export async function reopenDueListings(
  admin: SupabaseClient,
  notify: NotifyFn,
  nowMs: number = Date.now(),
  deadlineMs: number = Date.now() + REOPEN_BUDGET_MS,
): Promise<{ reopened: number; notified: number; pending: number; failed: number }> {
  const nowIso = new Date(nowMs).toISOString();
  let reopened = 0;
  let notified = 0;
  let pending = 0;
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
      if (Date.now() >= deadlineMs) { pending++; continue; }
      const resumeMs = Date.parse(row.capacity_resume_at);
      if (Number.isFinite(resumeMs) && nowMs - resumeMs <= REOPEN_NOTICE_DAYS * 86_400_000) {
        const told = await tellWaitingList(admin, notify, role, row.id, row.name, new Date(resumeMs).toISOString().slice(0, 10), deadlineMs);
        notified += told.sent;
        if (!told.complete) { pending++; continue; }   // still due: the next run carries on
      }
      const done = await finishReopening(admin, role, row.id, row.capacity_resume_at);
      if (done === null) failed++;
      else if (done) reopened++;
    }
  }
  return { reopened, notified, pending, failed };
}
