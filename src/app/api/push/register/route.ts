// Register / unregister a device's push token for the signed-in user.
//
// POST   { token, platform }  -> upsert (token is unique; re-point to this user)
// DELETE { token }            -> remove (on logout / token refresh)
//
// Auth: cookie session OR Bearer token (mobile bridges either).

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
      { global: { headers: { Authorization: `Bearer ${bearer[1]}` } }, auth: { persistSession: false, autoRefreshToken: false } }
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

const PLATFORMS = ['ios', 'android', 'web', 'unknown'];

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = String((body as { token?: unknown }).token ?? '').trim();
  const platform = PLATFORMS.includes(String((body as { platform?: unknown }).platform))
    ? String((body as { platform?: unknown }).platform)
    : 'unknown';
  if (!token) return NextResponse.json({ error: 'Missing token.' }, { status: 400 });

  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const supabase = await clientForRequest(request);
  // Token is globally unique → upsert re-points an existing token to this user
  // (e.g. a shared device that switched accounts).
  const { error } = await supabase
    .from('push_tokens')
    .upsert({ user_id: user.id, token, platform, updated_at: new Date().toISOString() }, { onConflict: 'token' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = String((body as { token?: unknown }).token ?? '').trim();
  if (!token) return NextResponse.json({ error: 'Missing token.' }, { status: 400 });

  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const supabase = await clientForRequest(request);
  await supabase.from('push_tokens').delete().eq('token', token);
  return NextResponse.json({ ok: true });
}
