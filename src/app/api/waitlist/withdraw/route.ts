import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readJson } from '@/lib/request-utils';
import { resolveRequestUser } from '@/lib/waitlist';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await resolveRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const parsed = await readJson<{ entryId?: string }>(request, { allowEmpty: false });
  if (!parsed.ok) return parsed.response;
  const entryId = String(parsed.data.entryId ?? '');
  if (!entryId) return NextResponse.json({ error: 'Missing entry.' }, { status: 400 });

  const admin = createAdminClient();
  // Load own active row to decide the terminal status.
  const { data: row } = await admin
    .from('coach_waitlist').select('id, status')
    .eq('id', entryId).eq('client_id', user.id).maybeSingle();
  if (!row || !['waiting', 'invited'].includes(row.status)) {
    return NextResponse.json({ ok: true, status: 'already_processed' });
  }
  const next = row.status === 'invited' ? 'declined' : 'left';
  await admin.from('coach_waitlist')
    .update({ status: next, responded_at: new Date().toISOString() })
    .eq('id', entryId).eq('client_id', user.id).in('status', ['waiting', 'invited']);
  return NextResponse.json({ ok: true, status: next });
}
