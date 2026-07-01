import { NextResponse } from 'next/server';
import { resolveRequestClient } from '@/lib/waitlist';

export const runtime = 'nodejs';

type MyEntry = {
  id: string;
  provider_role: string;
  provider_id: number;
  status: string;
  note: string | null;
  invited_at: string | null;
  invite_expires_at: string | null;
  created_at: string;
  position: number | null;
};

export async function GET(request: Request) {
  const auth = await resolveRequestClient(request);
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { supabase } = auth;

  // auth.uid()-scoped RPC: the caller's active entries with FIFO position
  // (a client can't read peer rows under RLS, so position is computed there).
  const { data, error } = await supabase.rpc('get_my_waitlists');
  if (error) return NextResponse.json({ error: 'Could not load your waitlists.' }, { status: 500 });

  const entries = ((data as MyEntry[] | null) ?? []).map((r) => ({
    id: r.id,
    providerRole: r.provider_role,
    providerId: r.provider_id,
    status: r.status,
    note: r.note,
    invited_at: r.invited_at,
    invite_expires_at: r.invite_expires_at,
    position: r.position,
  }));
  return NextResponse.json({ entries });
}
