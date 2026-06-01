// Store the Music-User-Token produced by the client-side MusicKit
// `authorize()` flow. Apple Music is NOT an OAuth provider in our registry
// (there is no server-side authorization-code exchange) — the developer
// token is minted by /developer-token, the user grants access in MusicKit
// on the device, and the resulting Music-User-Token is posted here for
// safekeeping in user_integrations under the synthetic 'apple_music' provider.

import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resolveUser(request: Request): Promise<{ id: string } | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!url || !anonKey) return null;
    const client = createSupabaseClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearerMatch[1]}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await client.auth.getUser(bearerMatch[1]);
    return data.user ? { id: data.user.id } : null;
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id } : null;
}

export async function POST(request: Request) {
  const user = await resolveUser(request);
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    musicUserToken?: string;
    storefront?: string;
  };
  const musicUserToken = (body.musicUserToken ?? '').trim();
  if (!musicUserToken) {
    return NextResponse.json({ error: 'Missing musicUserToken.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('user_integrations').upsert(
    {
      user_id: user.id,
      provider: 'apple_music',
      access_token: musicUserToken,
      token_type: 'music-user-token',
      scope: 'musickit',
      provider_user_id: body.storefront ?? null,
      metadata: { storefront: body.storefront ?? null },
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' }
  );
  if (error) {
    return NextResponse.json({ error: `Unable to store Apple Music token: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
