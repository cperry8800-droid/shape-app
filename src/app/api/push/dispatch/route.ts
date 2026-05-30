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

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser, pushConfigured } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type NotificationRecord = {
  user_id?: string;
  title?: string;
  body?: string;
  route?: string | null;
  type?: string;
};

export async function POST(request: Request) {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret || request.headers.get('x-push-secret') !== secret) {
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

  const admin = createAdminClient();
  await sendPushToUser(admin, record.user_id, {
    title: record.title,
    body: record.body ?? '',
    data: { route: record.route ?? '', type: record.type ?? 'general' },
  });
  return NextResponse.json({ ok: true });
}
