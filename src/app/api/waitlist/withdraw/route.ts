import { NextResponse } from 'next/server';
import { readJson } from '@/lib/request-utils';
import { resolveRequestClient } from '@/lib/waitlist';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const auth = await resolveRequestClient(request);
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { user, supabase } = auth;

  const parsed = await readJson<{ entryId?: string }>(request, { allowEmpty: false });
  if (!parsed.ok) return parsed.response;
  const entryId = String(parsed.data.entryId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(entryId)) {
    return NextResponse.json({ error: 'Missing entry.' }, { status: 400 });
  }

  // Load own active row to decide the terminal status (RLS: own rows only).
  const { data: row } = await supabase
    .from('coach_waitlist').select('id, status')
    .eq('id', entryId).eq('client_id', user.id).maybeSingle();
  if (!row || !['waiting', 'invited'].includes(row.status)) {
    return NextResponse.json({ ok: true, status: 'already_processed' });
  }
  const next = row.status === 'invited' ? 'declined' : 'left';

  // Atomic: transition ONLY the exact status we read, and confirm a row changed
  // — so a concurrent invite/booking can't be clobbered and a lost race reports
  // already_processed instead of a false success.
  const { data: updated, error } = await supabase
    .from('coach_waitlist')
    .update({ status: next, responded_at: new Date().toISOString() })
    .eq('id', entryId).eq('client_id', user.id).eq('status', row.status)
    .select('id').maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not update the waiting list.' }, { status: 500 });
  if (!updated) return NextResponse.json({ ok: true, status: 'already_processed' });
  return NextResponse.json({ ok: true, status: next });
}
