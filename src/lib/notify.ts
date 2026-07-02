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

export async function createNotification(client: SupabaseClient, n: NewNotification): Promise<void> {
  if (!n.userId || !n.title) return;
  try {
    const { error } = await client.from('notifications').insert({
      user_id: n.userId,
      type: n.type ?? 'general',
      title: n.title,
      body: n.body ?? '',
      route: n.route ?? null,
      data: n.data ?? {},
    });
    if (error) console.error('[notify] insert failed:', error.message);
  } catch (err) {
    console.error('[notify] insert threw:', err);
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
export async function createPreferredNotification(
  admin: SupabaseClient,
  n: NewNotification & { type: string },
): Promise<void> {
  if (!n.userId || !n.title) return;
  try {
    const [settingsRes, prefsRes] = await Promise.all([
      admin.from('notification_settings').select('muted').eq('user_id', n.userId).maybeSingle(),
      admin.from('notification_preferences').select('channel, enabled').eq('user_id', n.userId).eq('type', n.type),
    ]);
    if ((settingsRes.data as { muted?: boolean } | null)?.muted === true) return;
    const overrides: Record<string, boolean> = {};
    for (const row of (prefsRes.data ?? []) as { channel: string; enabled: boolean }[]) {
      overrides[row.channel] = !!row.enabled;
    }
    const channels = channelsForType({ matrix: { [n.type]: overrides } }, n.type);
    if (!channels.inapp && !channels.push && !channels.email) return;
    await createNotification(admin, { ...n, data: { ...(n.data ?? {}), channels } });
    if (channels.email) {
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
  } catch (err) {
    console.error('[notify] preferred notification failed:', err);
  }
}
