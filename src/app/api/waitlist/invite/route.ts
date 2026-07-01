import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notify';
import { readJson } from '@/lib/request-utils';
import { resolveRequestClient, UUID_RE } from '@/lib/waitlist';

export const runtime = 'nodejs';

type InviteResult = {
  client_id: string;
  provider_role: string;
  provider_id: number;
  provider_name: string | null;
  invite_expires_at: string;
};

export async function POST(request: Request) {
  const auth = await resolveRequestClient(request);
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { supabase } = auth;

  const parsed = await readJson<{ entryId?: string }>(request, { allowEmpty: false });
  if (!parsed.ok) return parsed.response;
  const entryId = String(parsed.data.entryId ?? '');
  if (!UUID_RE.test(entryId)) {
    return NextResponse.json({ error: 'Invalid entry.' }, { status: 400 });
  }

  // Ownership check, invitability check, and the atomic flip all run inside the
  // definer RPC (coach discretion: waiting / previously-declined / expired-invite
  // entries are all invitable). It returns the target client + provider name.
  const { data, error } = await supabase.rpc('invite_from_waitlist', { p_entry_id: entryId });
  if (error) {
    if (error.code === '42501') return NextResponse.json({ error: 'Not your waiting room.' }, { status: 403 });
    if (error.code === 'P0002') return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
    // P0001 = not invitable / client already active; 23505 = a concurrent
    // re-join won the race to the active-row unique index. Both are 409.
    if (error.code === 'P0001' || error.code === '23505') {
      return NextResponse.json({ error: 'This client cannot be invited in their current state.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Could not send the invite.' }, { status: 500 });
  }
  const result = ((data as InviteResult[] | null) ?? [])[0];
  if (!result) return NextResponse.json({ error: 'Could not send the invite.' }, { status: 500 });

  // Notify the invited client (write targets another user → system client). The
  // invite IS already committed by the RPC, so a notification failure is
  // best-effort (logged, non-fatal) — matching the rest of the notify pipeline —
  // rather than 500-ing after the state change.
  try {
    const admin = createAdminClient();
    await createNotification(admin, {
      userId: result.client_id, type: 'waitlist_invite',
      title: `${result.provider_name ?? 'Your coach'} has room for you`,
      body: 'Tap to book before this coach reopens to everyone.',
      route: `coach:${result.provider_role}:${result.provider_id}`,
      data: { providerRole: result.provider_role, providerId: result.provider_id, entryId },
    });
  } catch (e) {
    console.error('[waitlist invite] notification failed', { entryId, error: e instanceof Error ? e.message : String(e) });
  }
  return NextResponse.json({ ok: true, invite_expires_at: result.invite_expires_at });
}
