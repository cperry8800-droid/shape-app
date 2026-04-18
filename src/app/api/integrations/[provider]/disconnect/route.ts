// Disconnect an integration: delete the user's stored tokens.
// Does NOT currently call the provider's revoke endpoint — the row just
// disappears from our side. Callers can revoke at the provider's own
// dashboard if they want the access token invalidated upstream too.

import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getProvider, type ProviderId } from '@/lib/integrations/providers';
import { deleteTokens } from '@/lib/integrations/tokens';

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

export async function POST(
  request: Request,
  ctx: { params: Promise<{ provider: string }> }
) {
  const { provider } = await ctx.params;
  const cfg = getProvider(provider);
  if (!cfg) return NextResponse.json({ error: 'Unknown provider.' }, { status: 404 });

  const user = await resolveUser(request);
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  await deleteTokens(user.id, cfg.id as ProviderId);
  return NextResponse.json({ ok: true });
}
