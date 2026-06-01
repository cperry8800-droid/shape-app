// Disconnect Apple Music: delete the stored Music-User-Token row.
// Apple Music is not in the OAuth provider registry, so it gets its own
// disconnect endpoint rather than going through /api/integrations/[provider].

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

  const admin = createAdminClient();
  await admin.from('user_integrations').delete().eq('user_id', user.id).eq('provider', 'apple_music');
  return NextResponse.json({ ok: true });
}
