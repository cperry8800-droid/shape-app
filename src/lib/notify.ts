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
import { readerCopy } from '@/lib/reader-copy';
import { noticeText } from '../../mobile-app/src/services/noticeCopy.mjs';

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

// How the bell and the push say a notice in its reader's language (noticeCopy.mjs): the catalog key
// and raw values of its title and its body. It rides in the row as data.copy; the English the writer
// passes is what the row keeps, and what an English reader and the website read.
export type NoticeCopy = { title?: unknown; body?: unknown };
function withCopy(n: NewNotification, copy?: NoticeCopy | null): NewNotification {
  return copy ? { ...n, data: { ...(n.data ?? {}), copy } } : n;
}

// Resolves true when the row was stored. A caller with a follow-up effect (an email) waits on it.
export async function createNotification(client: SupabaseClient, n: NewNotification, copy?: NoticeCopy | null): Promise<boolean> {
  return (await insertNotification(client, withCopy(n, copy))) === 'stored';
}

// The insert, with why a row was not stored: a duplicate the dedupe index refused is a send that
// already happened; anything else failed and may be worth a retry.
async function insertNotification(client: SupabaseClient, n: NewNotification): Promise<'stored' | 'duplicate' | 'failed'> {
  if (!n.userId || !n.title) return 'failed';
  try {
    const { error } = await client.from('notifications').insert({
      user_id: n.userId,
      type: n.type ?? 'general',
      title: n.title,
      body: n.body ?? '',
      route: n.route ?? null,
      data: n.data ?? {},
    });
    if (!error) return 'stored';
    // 23505: a row with the same data.dedupe key exists (notifications_dedupe_uidx), so this
    // send has already happened. Expected when two runs of a scheduled job overlap.
    if ((error as { code?: string }).code === '23505') {
      console.info('[notify] duplicate skipped:', n.type);
      return 'duplicate';
    }
    console.error('[notify] insert failed:', error.message);
    return 'failed';
  } catch (err) {
    console.error('[notify] insert threw:', err);
    return 'failed';
  }
}

function escapeHtml(s: string): string {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// A notice's title and body in its recipient's language, or as written for an English reader and on
// any failure (a notice is never held back for its wording).
async function saidFor(admin: SupabaseClient, n: NewNotification): Promise<{ title: string; body: string }> {
  const plain = { title: n.title, body: n.body || '' };
  try {
    const copy = await readerCopy(admin, n.userId);
    if (copy.code === 'en') return plain;
    return noticeText({ type: n.type, title: n.title, body: n.body || '', data: n.data || {} }, copy.tr, { english: false, locale: copy.locale });
  } catch {
    return plain;
  }
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
// `claimPush` is a sender's place under the person's daily push cap (push-cap.ts), asked for only
// once the notice is known to push; false lands it as `quiet` does.
export type PreferredNotification = NewNotification & { type: string; quiet?: boolean; claimPush?: () => Promise<boolean> };

export async function createPreferredNotification(
  admin: SupabaseClient,
  n: PreferredNotification,
  copy?: NoticeCopy | null,
): Promise<boolean> {
  return (await preferredNotificationOutcome(admin, n, copy)) === 'stored';
}

// createPreferredNotification, saying why nothing was stored: 'skipped' is the member's own choice
// (muted, the type off) or a send that already happened (a duplicate); 'failed' is a read or write
// that did not work, which a caller that promised the notice can try again (capacity-reopen.ts).
export async function preferredNotificationOutcome(
  admin: SupabaseClient,
  given: PreferredNotification,
  copy?: NoticeCopy | null,
): Promise<'stored' | 'skipped' | 'failed'> {
  const n = { ...withCopy(given, copy), type: given.type, quiet: given.quiet };
  if (!n.userId || !n.title) return 'failed';
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
      return 'failed';
    }
    if ((settingsRes.data as { muted?: boolean } | null)?.muted === true) return 'skipped';
    const overrides: Record<string, boolean> = {};
    for (const row of (prefsRes.data ?? []) as { channel: string; enabled: boolean }[]) {
      overrides[row.channel] = !!row.enabled;
    }
    const channels = channelsForType({ matrix: { [n.type]: overrides } }, n.type);
    if (n.quiet) { channels.push = false; channels.email = false; }
    // ⚠ THE CAP'S PLACE IS CLAIMED ONLY FOR A NOTICE THAT PUSHES (Codex on #2420). Claimed before
    // the switches were read, a member with this type's push off held a place for nothing, and
    // another sender asking at that moment was refused it. Refused, it lands as `quiet` does.
    if (channels.push && given.claimPush && !(await given.claimPush())) { channels.push = false; channels.email = false; }
    if (!channels.inapp && !channels.push && !channels.email) return 'skipped';
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
    const inserted = await insertNotification(admin, {
      userId: n.userId, type: n.type, title: n.title, body: n.body, route: n.route,
      data: { ...(n.data ?? {}), channels },
    });
    if (inserted === 'duplicate') return 'skipped';
    if (inserted === 'failed') return 'failed';
    stored = true;
    // No row, no email: the cooldown above counts these rows, and a send that left none (a
    // failed insert, or a duplicate the dedupe index rejected) would otherwise email again.
    if (allowEmail && stored) {
      const { data } = await admin.auth.admin.getUserById(n.userId);
      const email = data?.user?.email || '';
      if (email) {
        // In the recipient's language (noticeCopy.mjs, as push dispatch says it): the row keeps its
        // English.
        const said = await saidFor(admin, n);
        await sendEmail({
          to: email,
          subject: said.title,
          html: `<p>${escapeHtml(said.body || said.title)}</p>`,
          text: said.body || said.title,
        });
      }
    }
    return 'stored';
  } catch (err) {
    console.error('[notify] preferred notification failed:', err);
    return stored ? 'stored' : 'failed';
  }
}
