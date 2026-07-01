import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notify';
import { readJson } from '@/lib/request-utils';
import { resolveRequestUser, WAITLIST_INVITE_TTL_DAYS } from '@/lib/waitlist';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await resolveRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const parsed = await readJson<{ entryId?: string }>(request, { allowEmpty: false });
  if (!parsed.ok) return parsed.response;
  const entryId = String(parsed.data.entryId ?? '');
  if (!entryId) return NextResponse.json({ error: 'Missing entry.' }, { status: 400 });

  const admin = createAdminClient();
  const { data: entry } = await admin
    .from('coach_waitlist')
    .select('id, client_id, provider_role, provider_id, status')
    .eq('id', entryId).maybeSingle();
  if (!entry) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });

  // Ownership: caller must own the provider on this entry.
  const table = entry.provider_role === 'trainer' ? 'trainers' : 'nutritionists';
  const { data: provider } = await admin
    .from(table).select('id, name, owner_id').eq('id', entry.provider_id).maybeSingle();
  if (!provider || provider.owner_id !== user.id) {
    return NextResponse.json({ error: 'Not your waiting room.' }, { status: 403 });
  }
  if (!['waiting', 'declined'].includes(entry.status)) {
    return NextResponse.json({ error: 'This client cannot be invited in their current state.' }, { status: 409 });
  }

  const now = new Date();
  const expires = new Date(now.getTime() + WAITLIST_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const { data: updated, error } = await admin.from('coach_waitlist')
    .update({ status: 'invited', invited_at: now.toISOString(), invite_expires_at: expires.toISOString(), responded_at: null })
    .eq('id', entryId)
    .in('status', ['waiting', 'declined'])
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not send the invite.' }, { status: 500 });
  if (!updated) return NextResponse.json({ error: 'This client cannot be invited in their current state.' }, { status: 409 });

  await createNotification(admin, {
    userId: entry.client_id, type: 'waitlist_invite',
    title: `${provider.name} has room for you`,
    body: 'Tap to book before this coach reopens to everyone.',
    route: `coach:${entry.provider_role}:${entry.provider_id}`,
    data: { providerRole: entry.provider_role, providerId: entry.provider_id, entryId },
  });
  return NextResponse.json({ ok: true, invite_expires_at: expires.toISOString() });
}
