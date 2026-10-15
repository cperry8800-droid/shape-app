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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type NotificationRecord = {
  user_id?: string;
  title?: string;
  body?: string;
  route?: string | null;
  type?: string;
  data?: { channels?: { push?: boolean }; conversationId?: unknown; clientId?: unknown; providerRole?: unknown } | null;
};

// A "New message" notification (the messages trigger: route "messages", data.conversationId) is
// pushed as "chat:<conversation>", the route the app opens a thread by (fix 3a, Codex on #2360).
export function pushRoute(record: NotificationRecord): string {
  const id = record.data && typeof record.data.conversationId === 'string' ? record.data.conversationId : '';
  if (record.route === 'messages' && id) return `chat:${id}`;
  // A coach's new-client alert with no thread ("client", data.clientId): a push carries only its
  // route, so the client rides in it (Codex on #2360: the tap opened nothing without the id), and so
  // does the listing's role, which a coach with both listings is opened in.
  const client = record.data && typeof record.data.clientId === 'string' ? record.data.clientId : '';
  const role = record.data && (record.data.providerRole === 'trainer' || record.data.providerRole === 'nutritionist') ? record.data.providerRole : '';
  if (record.route === 'client' && client) return role ? `client:${role}:${client}` : `client:${client}`;
  return record.route ?? '';
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
  await sendPushToUser(admin, record.user_id, {
    title: record.title,
    body: record.body ?? '',
    data: { route: pushRoute(record), type: record.type ?? 'general' },
  });
  return NextResponse.json({ ok: true });
}
