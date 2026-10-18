// Lightweight status endpoint: returns which integrations the signed-in
// user has connected. Never returns access/refresh tokens — only the
// presence of a row, the scope granted, and connection timestamps.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { PROVIDERS } from '@/lib/integrations/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ⚠ THE READ RUNS AS THE CALLER, BEARER OR COOKIE (review on the device-first check-in). The
// installed app sends a Bearer token and no cookie, and the cookie-only client read the table as
// anon: user_integrations is readable `to authenticated` only, so every provider came back
// unconnected, the Integrations page showed nothing connected, and the check-in card never asked
// a watch for last night.
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const supabase = await clientForRequest(request);
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

  const providers: Array<{
    id: string;
    label: string;
    description: string;
    connected: boolean;
    connected_at: string | null;
  }> = Object.values(PROVIDERS).map((p) => ({
    id: p.id as string,
    label: p.label,
    description: p.description,
    connected: connected.has(p.id),
    connected_at: connected.get(p.id)?.connected_at ?? null,
  }));

  // Apple Music isn't an OAuth provider in the registry (it uses MusicKit's
  // own device-side authorization), but we still report its connection state
  // here so the integrations UI can render it alongside the others.
  providers.push({
    id: 'apple_music',
    label: 'Apple Music',
    description: 'Connect your Apple Music library for workout playlists.',
    connected: connected.has('apple_music'),
    connected_at: connected.get('apple_music')?.connected_at ?? null,
  });

  // Apple Health (HealthKit) is device-side only too; its connection marker is
  // written by the apple-health sync route once the user grants permission.
  providers.push({
    id: 'apple_health',
    label: 'Apple Health',
    description: 'Sync Apple Watch & Health data (steps, HR, sleep, workouts).',
    connected: connected.has('apple_health'),
    connected_at: connected.get('apple_health')?.connected_at ?? null,
  });

  return NextResponse.json({ providers });
}
