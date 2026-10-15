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

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser, pushConfigured } from '@/lib/push';
import { inQuietHours } from '@/lib/ai/notifications.mjs';
import { canonicalRoute } from '../../../../../public/newdesign/notificationRoutes.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type NotificationRecord = {
  user_id?: string;
  title?: string;
  body?: string;
  route?: string | null;
  type?: string;
  data?: Record<string, unknown> & { channels?: { push?: boolean } } | null;
};

// The route a push carries: the notification's own, with what the app needs to open it (a thread, a
// client, a listing, a person) written in, by the table every surface reads
// (public/newdesign/notificationRoutes.mjs; the notification audit, 2026-10-15).
export function pushRoute(record: NotificationRecord): string {
  return canonicalRoute(record.route ?? '', record.data ?? null);
}

// ⚠ A ROW WRITTEN WITHOUT `channels` STILL ANSWERS TO ITS RECIPIENT (the notification audit). Only
// createPreferredNotification and the AI layer read the preference center; every createNotification
// row and every row a database trigger writes (messages, workouts, plans, groceries, follows) was
// pushed even to a member who muted everything or turned that type's push off. Read here, once per
// push: master mute, the type's push switch, and quiet hours, which apply only to someone who saved
// their settings (the defaults are 22:00 to 07:00 UTC, which would silence an American evening for
// someone who never chose a zone). A read that fails sends nothing, as notify.ts does.
export async function pushAllowed(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  type: string,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; why: string }> {
  const [settingsRes, prefsRes] = await Promise.all([
    admin.from('notification_settings').select('muted, quiet_start, quiet_end, tz').eq('user_id', userId).maybeSingle(),
    admin.from('notification_preferences').select('channel, enabled').eq('user_id', userId).eq('type', type),
  ]);
  if (settingsRes.error || prefsRes.error) return { ok: false, why: 'preferences_unreadable' };
  const settings = settingsRes.data as { muted?: boolean; quiet_start?: number; quiet_end?: number; tz?: string } | null;
  if (settings?.muted === true) return { ok: false, why: 'muted' };
  const push = ((prefsRes.data ?? []) as { channel: string; enabled: boolean }[]).find((r) => r.channel === 'push');
  if (push && push.enabled === false) return { ok: false, why: 'push_channel_off' };
  if (settings && inQuietHours(now, { quietStart: settings.quiet_start, quietEnd: settings.quiet_end, tz: settings.tz })) {
    return { ok: false, why: 'quiet_hours' };
  }
  return { ok: true };
}

// L7 (2026-10-08 review): the same constant-time comparison the cron routes use, so the
// secret cannot be recovered a byte at a time from response timing.
function secretMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const x = Buffer.from(given);
  const y = Buffer.from(expected);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(request: Request) {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret || !secretMatches(request.headers.get('x-push-secret'), secret)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!pushConfigured()) {
    // No FCM creds yet — accept the webhook so Supabase doesn't retry-storm.
    return NextResponse.json({ ok: true, skipped: 'fcm_not_configured' });
  }

  const payload = await request.json().catch(() => ({}));
  const record = (payload?.record ?? payload?.new ?? {}) as NotificationRecord;
  if (!record.user_id || !record.title) {
    return NextResponse.json({ ok: true, skipped: 'no_record' });
  }
  // Honor the notification preference center: a notification can be in-app-only
  // (push channel turned off for its type). Default ON when unspecified.
  if (record.data && record.data.channels && record.data.channels.push === false) {
    return NextResponse.json({ ok: true, skipped: 'push_channel_off' });
  }

  const admin = createAdminClient();
  if (!(record.data && record.data.channels)) {
    const gate = await pushAllowed(admin, record.user_id, record.type ?? 'general');
    if (!gate.ok) {
      if (gate.why === 'preferences_unreadable') console.error('[push] could not read preferences; not pushing:', record.type);
      return NextResponse.json({ ok: true, skipped: gate.why });
    }
  }
  await sendPushToUser(admin, record.user_id, {
    title: record.title,
    body: record.body ?? '',
    data: { route: pushRoute(record), type: record.type ?? 'general' },
  });
  return NextResponse.json({ ok: true });
}
