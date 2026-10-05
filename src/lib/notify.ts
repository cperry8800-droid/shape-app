// Server-side helper for creating in-app notifications.
//
// Notifications are usually created for someone OTHER than the actor (a client
// books → the coach is notified), so callers pass the service-role admin client
// to bypass RLS. Best-effort: a failed insert is logged, never thrown, so it
// can't break the action that triggered it.
//
// `route` is an in-app destination the bell can deep-link to (e.g. 'sessions').

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
// The pure per-type × per-channel resolver the AI notify layer already uses —
// one source of truth for "override wins, default in-app + push on, email off".
import * as NotifyLayer from '@/lib/ai/notifications.mjs';

const channelsForType = (NotifyLayer as unknown as {
  channelsForType: (
    prefs: { matrix: Record<string, Record<string, boolean>> },
    type: string,
  ) => { inapp: boolean; push: boolean; email: boolean };
}).channelsForType;

export type NewNotification = {
  userId: string;
  type?: string;
  title: string;
  body?: string;
  route?: string;
  data?: Record<string, unknown>;
};

// Resolves true when the row was stored. A caller with a follow-up effect (an email) waits on it.
export async function createNotification(client: SupabaseClient, n: NewNotification): Promise<boolean> {
  if (!n.userId || !n.title) return false;
  try {
    const { error } = await client.from('notifications').insert({
      user_id: n.userId,
      type: n.type ?? 'general',
      title: n.title,
      body: n.body ?? '',
      route: n.route ?? null,
      data: n.data ?? {},
    });
    if (!error) return true;
    // 23505: a row with the same data.dedupe key exists (notifications_dedupe_uidx), so this
    // send has already happened. Expected when two runs of a scheduled job overlap.
    if ((error as { code?: string }).code === '23505') console.info('[notify] duplicate skipped:', n.type);
    else console.error('[notify] insert failed:', error.message);
    return false;
  } catch (err) {
    console.error('[notify] insert threw:', err);
    return false;
  }
}

function escapeHtml(s: string): string {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// Preference-aware createNotification for event-driven sends whose TYPE is
// registered in the notification-center matrix (e.g. waitlist_join /
// waitlist_invite). Resolves the RECIPIENT's notification_settings +
// notification_preferences before writing: master mute or an all-channels-off
// type skips the write entirely; otherwise the row carries data.channels so the
// bell (inapp) and the push webhook (push) honor the toggles, and email goes out
// when that channel is opted in. Requires the service-role client (cross-user
// prefs read + email lookup). Same best-effort contract as createNotification.
// `quiet` is the caller's word that the recipient is inside their quiet hours (a scheduled send
// that knows their zone): the row still lands in the app, but nothing is pushed or emailed, and
// if the app channel is off too nothing is written.
// Resolves true when the notification row was stored, false when nothing was (muted, the type
// off, preferences unreadable, the insert failed or was a duplicate).
export async function createPreferredNotification(
  admin: SupabaseClient,
  n: NewNotification & { type: string; quiet?: boolean },
): Promise<boolean> {
  if (!n.userId || !n.title) return false;
  let stored = false;
  try {
    const [settingsRes, prefsRes] = await Promise.all([
      admin.from('notification_settings').select('muted').eq('user_id', n.userId).maybeSingle(),
      admin.from('notification_preferences').select('channel, enabled').eq('user_id', n.userId).eq('type', n.type),
    ]);
    // ⚠ A READ THAT FAILS IS NOT "NO PREFERENCES". The defaults push, so sending on them would
    // reach a member who turned this type off or muted everything (CodeRabbit, #2202). Nothing
    // is sent, and the skip is logged.
    if (settingsRes.error || prefsRes.error) {
      console.error('[notify] could not read preferences; not sending:', n.type, (settingsRes.error || prefsRes.error)?.message);
      return false;
    }
    if ((settingsRes.data as { muted?: boolean } | null)?.muted === true) return false;
    const overrides: Record<string, boolean> = {};
    for (const row of (prefsRes.data ?? []) as { channel: string; enabled: boolean }[]) {
      overrides[row.channel] = !!row.enabled;
    }
    const channels = channelsForType({ matrix: { [n.type]: overrides } }, n.type);
    if (n.quiet) { channels.push = false; channels.email = false; }
    if (!channels.inapp && !channels.push && !channels.email) return false;
    // Email cooldown: one email per (recipient, type) per hour, checked BEFORE
    // the insert below (which would otherwise count itself). Event loops (e.g.
    // scripted waitlist join→withdraw→join) can fire the bell/push row per
    // event, but must not amplify into outbound email spam. On a failed lookup
    // err toward skipping the email — the in-app/push row still lands.
    let allowEmail = channels.email;
    if (allowEmail) {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', n.userId).eq('type', n.type).gte('created_at', since);
      if (error || (count ?? 1) > 0) allowEmail = false;
    }
    stored = await createNotification(admin, {
      userId: n.userId, type: n.type, title: n.title, body: n.body, route: n.route,
      data: { ...(n.data ?? {}), channels },
    });
    // No row, no email: the cooldown above counts these rows, and a send that left none (a
    // failed insert, or a duplicate the dedupe index rejected) would otherwise email again.
    if (allowEmail && stored) {
      const { data } = await admin.auth.admin.getUserById(n.userId);
      const email = data?.user?.email || '';
      if (email) {
        await sendEmail({
          to: email,
          subject: n.title,
          html: `<p>${escapeHtml(n.body || n.title)}</p>`,
          text: n.body || n.title,
        });
      }
    }
    return stored;
  } catch (err) {
    console.error('[notify] preferred notification failed:', err);
    return stored;
  }
}
