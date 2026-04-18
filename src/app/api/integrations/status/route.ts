// Lightweight status endpoint: returns which integrations the signed-in
// user has connected. Never returns access/refresh tokens — only the
// presence of a row, the scope granted, and connection timestamps.

import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { PROVIDERS } from '@/lib/integrations/providers';

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

export async function GET(request: Request) {
  const user = await resolveUser(request);
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const supabase = await createClient();
  const { data } = await supabase
    .from('user_integrations')
    .select('provider, scope, connected_at, updated_at, provider_user_id')
    .eq('user_id', user.id);

  const connected = new Map<string, { scope: string | null; connected_at: string; provider_user_id: string | null }>();
  for (const row of data ?? []) {
    connected.set(row.provider as string, {
      scope: (row.scope as string | null) ?? null,
      connected_at: (row.connected_at as string) ?? (row.updated_at as string),
      provider_user_id: (row.provider_user_id as string | null) ?? null,
    });
  }

  const providers = Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    connected: connected.has(p.id),
    connected_at: connected.get(p.id)?.connected_at ?? null,
  }));

  return NextResponse.json({ providers });
}
