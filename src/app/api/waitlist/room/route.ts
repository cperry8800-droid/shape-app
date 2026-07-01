import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveRequestUser, computePositions, type ProviderRole } from '@/lib/waitlist';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await resolveRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const url = new URL(request.url);
  const providerId = Number(url.searchParams.get('providerId') ?? 0);
  const providerRole = (String(url.searchParams.get('providerRole') ?? '').toLowerCase() === 'nutritionist'
    ? 'nutritionist' : 'trainer') as ProviderRole;
  if (!providerId) return NextResponse.json({ error: 'Invalid coach.' }, { status: 400 });

  const admin = createAdminClient();
  const table = providerRole === 'trainer' ? 'trainers' : 'nutritionists';
  const { data: provider } = await admin
    .from(table).select('id, owner_id').eq('id', providerId).maybeSingle();
  if (!provider || provider.owner_id !== user.id) {
    return NextResponse.json({ error: 'Not your waiting room.' }, { status: 403 });
  }

  const { data: rows } = await admin
    .from('coach_waitlist')
    .select('id, client_id, note, status, created_at, invited_at, invite_expires_at')
    .eq('provider_role', providerRole).eq('provider_id', providerId)
    .order('created_at', { ascending: true });
  const positions = computePositions(rows ?? []);

  // Resolve client display names (best-effort).
  const entries = [];
  for (const r of rows ?? []) {
    let clientName: string | null = null;
    const { data: prof } = await admin.from('profiles').select('full_name').eq('id', r.client_id).maybeSingle();
    clientName = (prof as { full_name?: string } | null)?.full_name ?? null;
    entries.push({
      id: r.id, clientId: r.client_id, clientName, note: r.note, status: r.status,
      position: positions.get(r.id) ?? null, created_at: r.created_at,
      invited_at: r.invited_at, invite_expires_at: r.invite_expires_at,
    });
  }
  return NextResponse.json({ entries });
}
