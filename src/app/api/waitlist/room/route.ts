import { NextResponse } from 'next/server';
import { resolveRequestClient, type ProviderRole } from '@/lib/waitlist';

export const runtime = 'nodejs';

type RoomRow = {
  id: string;
  client_id: string;
  client_name: string | null;
  note: string | null;
  status: string;
  created_at: string;
  invited_at: string | null;
  invite_expires_at: string | null;
  position: number | null;
};

export async function GET(request: Request) {
  const auth = await resolveRequestClient(request);
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { supabase } = auth;

  const url = new URL(request.url);
  const providerId = Number(url.searchParams.get('providerId') ?? 0);
  const roleRaw = String(url.searchParams.get('providerRole') ?? '').toLowerCase();
  const providerRole: ProviderRole | null =
    roleRaw === 'trainer' || roleRaw === 'nutritionist' ? roleRaw : null;
  if (!providerRole) return NextResponse.json({ error: 'Invalid coach role.' }, { status: 400 });
  if (!Number.isInteger(providerId) || providerId <= 0) {
    return NextResponse.json({ error: 'Invalid coach.' }, { status: 400 });
  }

  // Ownership + roster + client names + FIFO position all resolved inside the
  // definer RPC (a coach can't read other users' waitlist rows under RLS).
  const { data, error } = await supabase.rpc('get_coach_waitroom', {
    p_role: providerRole,
    p_provider_id: providerId,
  });
  if (error) {
    if (error.code === '42501') {
      return NextResponse.json({ error: 'Not your waiting room.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Could not load the waiting room.' }, { status: 500 });
  }

  const entries = ((data as RoomRow[] | null) ?? []).map((r) => ({
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    note: r.note,
    status: r.status,
    position: r.position,
    created_at: r.created_at,
    invited_at: r.invited_at,
    invite_expires_at: r.invite_expires_at,
  }));
  return NextResponse.json({ entries });
}
