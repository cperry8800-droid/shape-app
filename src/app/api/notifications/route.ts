// In-app notifications feed for the signed-in user.
//
// GET  -> { notifications: [...recent], unread }   (latest 50)
// POST -> mark read: { id } for one, or { all: true } for everything.
//
// Auth: cookie session OR Bearer token (mobile bridges either). Rows are
// RLS-scoped to the caller, so we never see anyone else's notifications.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = { id: string; type: string; title: string; body: string; route: string | null; data: Record<string, unknown>; read_at: string | null; created_at: string };

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, route, data, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ notifications: [], unread: 0 });

  const rows = (data ?? []) as Row[];
  // Honor the preference center's in-app channel: a row written for push/email
  // only (data.channels.inapp === false) never shows in the bell. Rows with no
  // channels metadata predate the preference stamping — default visible.
  const visible = rows.filter(r =>
    ((r.data as { channels?: { inapp?: boolean } } | null)?.channels?.inapp) !== false
  );
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
