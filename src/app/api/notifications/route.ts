// In-app notifications feed for the signed-in user.
//
// GET  -> { notifications: [...recent], unread }   (latest 50, cleared ones left out)
// POST -> mark read: { id } for one, or { all: true } for everything.
//         clear: { clear: true, before } hides every notification up to `before`.
//
// Auth: cookie session OR Bearer token (mobile bridges either). Rows are
// RLS-scoped to the caller, so we never see anyone else's notifications.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = { id: string; type: string; title: string; body: string; route: string | null; data: Record<string, unknown>; read_at: string | null; created_at: string };

// Before 2026-10-16-notifications-clear.sql runs there is no cleared_at column: a filter on it
// answers 42703 and a write PGRST204. Nothing can have been cleared then.
const noClearColumn = (error: { code?: string } | null) => error?.code === '42703' || error?.code === 'PGRST204';

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  // A cleared notification is hidden, never deleted: the prep-reminder cron, the waiting-list
  // notice and the email cooldown read a member's earlier rows as their record of what was sent.
  const read = (hideCleared: boolean) => {
    const q = supabase.from('notifications').select('id, type, title, body, route, data, read_at, created_at');
    return (hideCleared ? q.is('cleared_at', null) : q).order('created_at', { ascending: false }).limit(200);
  };
  let { data, error } = await read(true);
  if (noClearColumn(error)) ({ data, error } = await read(false));
  // ⚠ A FAILED READ IS NOT AN EMPTY INBOX. This returned HTTP 200 with
  // `{ notifications: [], unread: 0 }`, which is the positive claim "nothing new" made
  // out of a query that never answered — and it made the web bell's "couldn't read your
  // notifications" state UNREACHABLE for the most likely failure there is, while the
  // panel and the records both claimed to handle it.
  //
  // The mobile client is unaffected: `getJsonOrDefault` already returns its own
  // `{ notifications: [], unread: 0 }` fallback on any non-OK response, so a 502 lands
  // exactly where a 200-with-nothing landed before.
  if (error) return NextResponse.json({ error: 'Could not read notifications.' }, { status: 502 });

  const rows = (data ?? []) as Row[];
  // Honor the preference center's in-app channel: a row written for push/email
  // only (data.channels.inapp === false) never shows in the bell. Rows with no
  // channels metadata predate the preference stamping — default visible. The
  // query over-fetches (200 newest) BEFORE the 50-item cap so a run of hidden
  // push/email-only rows can't starve the feed of older visible ones.
  const visible = rows.filter(r =>
    ((r.data as { channels?: { inapp?: boolean } } | null)?.channels?.inapp) !== false
  ).slice(0, 50);
  const notifications = visible.map(r => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    route: r.route,
    data: r.data,
    read: !!r.read_at,
    createdAt: r.created_at,
  }));
  const unread = notifications.filter(n => !n.read).length;
  return NextResponse.json({ notifications, unread });
}

export async function POST(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const nowIso = new Date().toISOString();
  if (body.clear === true) {
    // `before` is the newest notification the member was shown, passed back as the server sent
    // it: one that arrived after they looked stays. It is not re-serialised, because the stored
    // time has microseconds and a JS Date would round the newest row out of its own clear.
    const before = typeof body.before === 'string' && body.before.length <= 64 && Number.isFinite(Date.parse(body.before))
      ? body.before : null;
    if (!before) return NextResponse.json({ error: 'Missing before.' }, { status: 400 });
    const { error } = await supabase
      .from('notifications')
      .update({ cleared_at: nowIso })
      .is('cleared_at', null)
      .lte('created_at', before);
    if (noClearColumn(error)) return NextResponse.json({ error: 'Clearing notifications is not available yet.' }, { status: 503 });
    if (error) return dbError(error, 'notifications clear', 500);
    return NextResponse.json({ ok: true });
  }
  if (body.all === true) {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: nowIso })
      .is('read_at', null);
    if (error) return dbError(error, 'notifications write', 500);
    return NextResponse.json({ ok: true });
  }
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: nowIso })
    .eq('id', id);
  if (error) return dbError(error, 'notifications read', 500);
  return NextResponse.json({ ok: true });
}
