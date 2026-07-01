import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveRequestUser, computePositions } from '@/lib/waitlist';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await resolveRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const admin = createAdminClient();

  const { data: mine } = await admin
    .from('coach_waitlist')
    .select('id, provider_role, provider_id, status, note, invited_at, created_at')
    .eq('client_id', user.id).in('status', ['waiting', 'invited']);

  // Positions need every active row for each coach the client is queued on.
  const entries = [];
  for (const row of mine ?? []) {
    const { data: peers } = await admin
      .from('coach_waitlist')
      .select('id, status, created_at')
      .eq('provider_role', row.provider_role).eq('provider_id', row.provider_id)
      .in('status', ['waiting', 'invited']);
    const position = computePositions(peers ?? []).get(row.id) ?? 0;
    entries.push({
      id: row.id, providerRole: row.provider_role, providerId: row.provider_id,
      status: row.status, note: row.note, invited_at: row.invited_at, position,
    });
  }
  return NextResponse.json({ entries });
}
