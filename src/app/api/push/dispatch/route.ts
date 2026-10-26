// Push dispatch — called by a Supabase Database Webhook on every INSERT into
// public.notifications. Because EVERY in-app notification (bookings, messages,
// coach content, payments) lands in that table, this one endpoint fans them all
// out to system push (app closed / phone locked) with no per-event wiring.
//
// Set up in Supabase → Database → Webhooks:
//   Table: notifications · Events: Insert · Type: HTTP POST
//   URL: https://theshapecommunity.com/api/push/dispatch
//   HTTP header: x-push-secret: <PUSH_WEBHOOK_SECRET>
//
// Auth is the shared secret (the webhook isn't a logged-in user). Sends via FCM
// using the service-role admin client to read the recipient's tokens.
//
// It also emails the rows a database trigger writes (a coach's message, a tier-up), for the few
// types email is offered for: see emailDecision.

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser, pushConfigured } from '@/lib/push';
import { sendEmail } from '@/lib/email';
import { inQuietHours, quietWindow, channelsForType } from '@/lib/ai/notifications.mjs';
import { personZone } from '@/lib/time';
import { canonicalRoute } from '../../../../../public/newdesign/notificationRoutes.mjs';
import { isEmailType, preferenceTypeFor as switchFor } from '../../../../../public/newdesign/notificationSurfaces.mjs';
import { noticeText } from '../../../../../mobile-app/src/services/noticeCopy.mjs';
import { readerCopy, type Translate } from '@/lib/reader-copy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type NotificationRecord = {
  id?: string;
  user_id?: string;
  title?: string;
  body?: string;
  route?: string | null;
  type?: string;
  data?: Record<string, unknown> & { channels?: { push?: boolean; email?: boolean } } | null;
};

// The route a push carries: the notification's own, with what the app needs to open it (a thread, a
// client, a listing, a person) written in, by the table every surface reads
// (public/newdesign/notificationRoutes.mjs; the notification audit, 2026-10-15).
export function pushRoute(record: NotificationRecord): string {
  return canonicalRoute(record.route ?? '', record.data ?? null);
}

// ⚠ THE SWITCH A ROW ANSWERS TO IS THE ONE ITS RECIPIENT SEES (Codex on #2372). The database writes a
// new message as type 'message' and a co-sign as 'cosign', and the preference center stores "Coach
// messages" as 'coach_message' and "Co-signs" as 'coach_cosign', so reading the row's own type found
// no switch and every such push went out to someone who had turned it off. The map is shared with
// the app's list, the website's bell and the app's toast (notificationSurfaces.mjs PREFERENCE_OF).
export function preferenceTypeFor(type: string, data?: Record<string, unknown> | null): string {
  return switchFor(type, data ?? null);
}

// A reminder the recipient scheduled for an hour of their own choosing (cron/reminders, types
// reminder_*) is not held by their quiet hours: the time is theirs. Mute still silences it.
export function heldByQuietHours(type: string): boolean {
  return !/^reminder_/.test(type);
}

// The zone a person's quiet hours are read in (personZone): their profile's, which the app refreshes
// on every open, else their notification settings'. A profile that cannot be read leaves the
// settings' zone; it never stops a send.
async function profileZone(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string | null> {
  try {
    const { data, error } = await admin.from('client_profiles').select('timezone').eq('user_id', userId).maybeSingle();
    return error ? null : ((data as { timezone?: string } | null)?.timezone ?? null);
  } catch { return null; }
}
type Settings = { muted?: boolean; quiet_start?: number; quiet_end?: number; tz?: string } | null;
function quietNow(now: Date, settings: Settings, profileTz: string | null): boolean {
  return inQuietHours(now, quietWindow(settings, personZone(profileTz, settings?.tz)));
}

// ⚠ EVERY ROW ANSWERS TO ITS RECIPIENT, WHOEVER WROTE IT (the notification audit; Codex on #2372). Only
// createPreferredNotification and the AI layer read the preference center; every createNotification
// row and every row a database trigger writes (messages, workouts, plans, groceries, follows) was
// pushed even to a member who muted everything or turned that type's push off. Read here, once per
// push: master mute, the type's push switch, and quiet hours.
// ⚠ QUIET HOURS ARE THE PERSON'S OWN NIGHT, SAVED OR NOT (quietWindow; owner, 2026-10-26: "fix 1-7").
// They applied only to someone who had saved settings, so everyone else was pushed all night; they
// are 22:00 to 07:00 (or the saved hours) in the person's own zone, and none when no zone is known.
// A row they hold is sent when the night is over (holdForMorning, /api/cron/push-held).
// A read that fails sends nothing, as notify.ts does.
// ⚠ A `data.channels` STAMP IS NOT PROOF THE SETTINGS WERE READ: the credential notices and the
// reminders cron stamp { push: true } themselves. So the gate runs on every row; for a row the
// preference-aware writers produced it agrees with what they already decided.
export async function pushAllowed(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  type: string,
  now: Date = new Date(),
  { quietHours = true }: { quietHours?: boolean } = {},
): Promise<{ ok: true } | { ok: false; why: string }> {
  const [settingsRes, prefsRes, profileTz] = await Promise.all([
    admin.from('notification_settings').select('muted, quiet_start, quiet_end, tz').eq('user_id', userId).maybeSingle(),
    admin.from('notification_preferences').select('channel, enabled').eq('user_id', userId).eq('type', type),
    profileZone(admin, userId),
  ]);
  if (settingsRes.error || prefsRes.error) return { ok: false, why: 'preferences_unreadable' };
  const settings = settingsRes.data as Settings;
  if (settings?.muted === true) return { ok: false, why: 'muted' };
  const push = ((prefsRes.data ?? []) as { channel: string; enabled: boolean }[]).find((r) => r.channel === 'push');
  if (push && push.enabled === false) return { ok: false, why: 'push_channel_off' };
  if (quietHours && quietNow(now, settings, profileTz)) return { ok: false, why: 'quiet_hours' };
  return { ok: true };
}

// ⚠ EMAIL FOR A ROW A DATABASE TRIGGER WROTE (owner, 2026-10-16: email for coach messages,
// waitlist invites and tier-ups only). The writers that read the preference center (notify.ts and
// the AI layer) email for themselves and stamp data.channels.email; a trigger row (a coach's chat
// message, a tier-up from award_tier_bonuses) carries no stamp, so it is emailed here. Only for a
// type email is offered for, with that switch on (a tier-up's starts on), not muted, outside quiet
// hours, and once per type per hour: a coach's burst of messages is one email. Anything unreadable
// sends nothing.
// ⚠ THE COOLDOWN COUNTS EMAILS SENT, NOT ROWS (Codex on #2387). A row counted whether or not it was
// emailed, so a message that arrived in quiet hours held back the next hour's email, and two
// messages inserted together each saw the other and neither was emailed. A sent email stamps its row
// (data.emailed_at, emailRow); the cooldown counts stamped rows. Two webhooks for one member at the
// same instant can still both send, before either stamps: two emails, never none.
export async function emailDecision(
  admin: ReturnType<typeof createAdminClient>,
  record: NotificationRecord,
  prefType: string,
  now: Date = new Date(),
): Promise<{ send: true } | { send: false; why: string }> {
  if (!isEmailType(prefType)) return { send: false, why: 'not_offered' };
  if (record.data?.channels && typeof record.data.channels.email === 'boolean') return { send: false, why: 'writer_decided' };
  if (!record.user_id || !record.id || !record.type) return { send: false, why: 'no_record' };
  const [settingsRes, prefsRes, profileTz] = await Promise.all([
    admin.from('notification_settings').select('muted, quiet_start, quiet_end, tz').eq('user_id', record.user_id).maybeSingle(),
    admin.from('notification_preferences').select('channel, enabled').eq('user_id', record.user_id).eq('type', prefType),
    profileZone(admin, record.user_id),
  ]);
  if (settingsRes.error || prefsRes.error) return { send: false, why: 'preferences_unreadable' };
  const settings = settingsRes.data as Settings;
  if (settings?.muted === true) return { send: false, why: 'muted' };
  const overrides: Record<string, boolean> = {};
  for (const r of (prefsRes.data ?? []) as { channel: string; enabled: boolean }[]) overrides[r.channel] = r.enabled;
  if (!channelsForType({ matrix: { [prefType]: overrides } }, prefType).email) return { send: false, why: 'email_off' };
  // The push's quiet hours (quietNow): a held row is emailed with its push, once the night is over.
  if (quietNow(now, settings, profileTz)) return { send: false, why: 'quiet_hours' };
  let earlier = admin.from('notifications').select('id', { count: 'exact', head: true })
    .eq('user_id', record.user_id).eq('type', record.type)
    .gte('data->>emailed_at', new Date(now.getTime() - 60 * 60 * 1000).toISOString())
    .neq('id', record.id);
  if (record.type === 'message') earlier = earlier.eq('data->>side', 'client');
  const { count, error } = await earlier;
  if (error || (count ?? 1) > 0) return { send: false, why: error ? 'cooldown_unreadable' : 'cooldown' };
  return { send: true };
}

// ⚠ A NOTICE IS PUSHED AND EMAILED IN ITS RECIPIENT'S LANGUAGE (owner, 2026-10-21: "fix the other
// server notices wording too"). The row keeps the English it was written in; a recipient whose app is
// set to another language is sent it again from the notice catalog (noticeCopy.mjs: a writer's
// data.copy, or a trigger row's known shape), with the email's own frame. An English reader, a row
// the catalog cannot say, and a language that cannot be read all get the row as written. Read once per
// webhook, only when something is sent.
export type Said = { title: string; body: string; say: (key: string, en: string, vars?: Record<string, unknown>) => string };
export async function readerText(admin: ReturnType<typeof createAdminClient>, record: NotificationRecord): Promise<Said> {
  const title = String(record.title ?? '');
  const body = String(record.body ?? '');
  const plain: Said = { title, body, say: (_key, en) => en };
  if (!record.user_id) return plain;
  const copy = await readerCopy(admin, record.user_id);
  if (copy.code === 'en') return plain;
  const t = noticeText(record, copy.tr, { english: false, locale: copy.locale });
  const tr: Translate = copy.tr;
  const say = (key: string, en: string, vars?: Record<string, unknown>) => {
    try {
      const v = tr(key, { defaultValue: en, ...(vars || {}) });
      return typeof v === 'string' && v.trim() && v !== key ? v : en;
    } catch { return en; }
  };
  return { title: t.title, body: t.body, say };
}

const htmlEscape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// Sends the email and, only when it went, stamps the row so the cooldown counts it. A failed send
// (sendEmail logs why) is not stamped, so the next eligible notice can still email. Email here is
// best-effort, as in notify.ts and the AI layer: answering the webhook with an error to have it
// retried would push the notification a second time. Answers the stamp it wrote, or null.
async function emailRow(admin: ReturnType<typeof createAdminClient>, record: NotificationRecord, said: Said): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(record.user_id as string);
  const to = data?.user?.email;
  if (!to) return null;
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://theshapecommunity.com').replace(/\/+$/, '');
  const { title, body } = said;
  const open = said.say('notice:email.open', `Open Shape: ${site}`, { site });
  const link = said.say('notice:email.link', 'Open Shape');
  const manage = said.say('notice:email.manage', 'Change which emails you get in Settings → Notifications.');
  const sent = await sendEmail({
    to,
    subject: title,
    text: `${body ? body + '\n\n' : ''}${open}\n\n${manage}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px"><h2 style="margin:0 0 8px">${htmlEscape(title)}</h2>`
      + (body ? `<p style="font-size:14px;line-height:1.5;white-space:pre-line">${htmlEscape(body)}</p>` : '')
      + `<p><a href="${site}">${htmlEscape(link)}</a></p><p style="font-size:12px;color:#888">${htmlEscape(manage)}</p></div>`,
  });
  if (!sent.ok) return null;
  const at = new Date().toISOString();
  const { error } = await admin.from('notifications')
    .update({ data: { ...(record.data ?? {}), emailed_at: at } })
    .eq('id', record.id as string);
  if (error) console.error('[push] email sent but not recorded; the next one inside the hour may also send:', error.message);
  return at;
}

// ⚠ A NOTICE IN QUIET HOURS IS HELD, NOT DROPPED (owner, 2026-10-26: "fix 1-7"). Its push and its
// email were skipped and never sent, so a coach's 11 pm message reached the phone neither then nor in
// the morning. The row is stamped data.held_at, and /api/cron/push-held hands it back to deliverNotice
// once the person's night is over, unless they have read or cleared it in the app by then.
async function holdForMorning(admin: ReturnType<typeof createAdminClient>, record: NotificationRecord, data: Record<string, unknown>, now: Date): Promise<boolean> {
  if (!record.id) return false;
  const { error } = await admin.from('notifications').update({ data: { ...data, held_at: now.toISOString() } }).eq('id', record.id);
  if (error) console.error('[push] could not hold a quiet-hours notice; it stays in the app only:', error.message);
  return !error;
}

// L7 (2026-10-08 review): the same constant-time comparison the cron routes use, so the
// secret cannot be recovered a byte at a time from response timing.
function secretMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const x = Buffer.from(given);
  const y = Buffer.from(expected);
  return x.length === y.length && timingSafeEqual(x, y);
}

// One notice, delivered: its email (for the types email is offered for) and its push, each by the
// recipient's settings, or held for the morning when it falls in their quiet hours. The webhook
// below runs it for every new row, and /api/cron/push-held for a held one once the night is over.
export type Delivered = { skipped?: string; held?: boolean };
export async function deliverNotice(record: NotificationRecord, now: Date = new Date()): Promise<Delivered> {
  if (!record.user_id || !record.title) return { skipped: 'no_record' };
  // The recipient's words for it, read once and only when something goes out (readerText).
  let said: Said | null = null;
  const sayIt = async (admin: ReturnType<typeof createAdminClient>): Promise<Said> => {
    if (!said) {
      try { said = await readerText(admin, record); } catch { said = { title: String(record.title ?? ''), body: String(record.body ?? ''), say: (_k, en) => en }; }
    }
    return said;
  };
  let data: Record<string, unknown> = { ...(record.data ?? {}) };
  let quiet = false;
  // Email first, and whether or not push is set up: it does not wait on Apple or Firebase. A row
  // emailed already (before it was held) is not emailed again.
  const emailType = preferenceTypeFor(record.type ?? 'general', data);
  if (isEmailType(emailType) && !data.emailed_at) {
    try {
      const admin = createAdminClient();
      const mail = await emailDecision(admin, { ...record, data }, emailType, now);
      if (mail.send) {
        const at = await emailRow(admin, { ...record, data }, await sayIt(admin));
        if (at) data = { ...data, emailed_at: at };
      } else if (mail.why === 'quiet_hours') quiet = true;
      else if (mail.why === 'preferences_unreadable' || mail.why === 'cooldown_unreadable') console.error('[push] could not read what an email needs; not emailing:', record.type);
    } catch (err) {
      console.error('[push] email failed:', err instanceof Error ? err.message : err);
    }
  }
  const held = async (skipped?: string): Promise<Delivered> => {
    const stamped = quiet && (await holdForMorning(createAdminClient(), record, data, now));
    return { ...(skipped ? { skipped } : {}), ...(stamped ? { held: true } : {}) };
  };
  if (!pushConfigured()) {
    // No FCM creds yet — accept the webhook so Supabase doesn't retry-storm.
    return held('fcm_not_configured');
  }
  // Honor the notification preference center: a notification can be in-app-only
  // (push channel turned off for its type). Default ON when unspecified.
  const channels = data.channels as { push?: boolean } | undefined;
  if (channels && channels.push === false) return held('push_channel_off');

  const admin = createAdminClient();
  const type = record.type ?? 'general';
  const gate = await pushAllowed(admin, record.user_id, preferenceTypeFor(type, data), now, { quietHours: heldByQuietHours(type) });
  if (!gate.ok) {
    if (gate.why === 'preferences_unreadable') console.error('[push] could not read preferences; not pushing:', record.type);
    if (gate.why === 'quiet_hours') quiet = true;
    return held(gate.why);
  }
  const text = await sayIt(admin);
  await sendPushToUser(admin, record.user_id, {
    title: text.title,
    body: text.body,
    data: { route: pushRoute(record), type: record.type ?? 'general' },
  });
  return held();
}

export async function POST(request: Request) {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret || !secretMatches(request.headers.get('x-push-secret'), secret)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const payload = await request.json().catch(() => ({}));
  const record = (payload?.record ?? payload?.new ?? {}) as NotificationRecord;
  return NextResponse.json({ ok: true, ...(await deliverNotice(record)) });
}
