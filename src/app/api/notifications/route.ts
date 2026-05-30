// In-app notifications feed for the signed-in user.
//
// GET  -> { notifications: [...recent], unread }   (latest 50)
// POST -> mark read: { id } for one, or { all: true } for everything.
//
// Auth: cookie session OR Bearer token (mobile bridges either). Rows are
// RLS-scoped to the caller, so we never see anyone else's notifications.

import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function clientForRequest(request: Request): Promise<SupabaseClient> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearer) {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      {
        global: { headers: { Authorization: `Bearer ${bearer[1]}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );
  }
  return createClient() as Promise<SupabaseClient>;
}

async function currentUser(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearer) {
    const client = await clientForRequest(request);
    const { data } = await client.auth.getUser(bearer[1]);
    return data.user ?? null;
  }
  const client = await createClient();
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

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
  const notifications = rows.map(r => ({
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
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const nowIso = new Date().toISOString();
  if (body.all === true) {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: nowIso })
      .is('read_at', null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: nowIso })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
