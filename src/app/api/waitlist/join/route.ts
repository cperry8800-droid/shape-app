import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isEffectivelyAtCapacity } from '@/lib/capacity';
import { createNotification } from '@/lib/notify';
import { readJson } from '@/lib/request-utils';
import { resolveRequestClient, type ProviderRole } from '@/lib/waitlist';

export const runtime = 'nodejs';

type Body = { providerId?: number | string; providerRole?: string; note?: string };
type MyEntry = {
  id: string;
  provider_role: string;
  provider_id: number;
  status: string;
  queue_position: number | null;
};

export async function POST(request: Request) {
  const auth = await resolveRequestClient(request);
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { user, supabase } = auth;

  const parsed = await readJson<Body>(request, { allowEmpty: false });
  if (!parsed.ok) return parsed.response;
  const providerId = Number(parsed.data.providerId ?? 0);
  const roleRaw = String(parsed.data.providerRole ?? '').toLowerCase();
  const providerRole: ProviderRole | null =
    roleRaw === 'trainer' || roleRaw === 'nutritionist' ? roleRaw : null;
  const note = String(parsed.data.note ?? '').trim().slice(0, 500) || null;
  if (!providerRole) {
    return NextResponse.json({ error: 'Invalid coach role.' }, { status: 400 });
  }
  if (!Number.isInteger(providerId) || providerId <= 0) {
    return NextResponse.json({ error: 'Invalid coach.' }, { status: 400 });
  }

  const table = providerRole === 'trainer' ? 'trainers' : 'nutritionists';
  // Provider visibility via the caller-scoped client (trainers/nutritionists are
  // public-read). Capacity gate: you only join a coach who's actually paused.
  const { data: provider } = await supabase
    .from(table)
    .select('id, at_capacity, capacity_resume_at')
    .eq('id', providerId)
    .maybeSingle();
  if (!provider) return NextResponse.json({ error: 'Coach not found.' }, { status: 404 });
  if (!isEffectivelyAtCapacity(provider)) {
    return NextResponse.json({ error: 'This coach is accepting clients — no waitlist needed.' }, { status: 409 });
  }

  // Own-row dedup read (RLS: clients read own waitlist).
  const { data: existing } = await supabase
    .from('coach_waitlist')
    .select('id, status, invite_expires_at')
    .eq('provider_role', providerRole).eq('provider_id', providerId)
    .eq('client_id', user.id).in('status', ['waiting', 'invited'])
    .maybeSingle();

  let isNew = false;
  if (existing) {
    const expiredInvite =
      existing.status === 'invited' &&
      existing.invite_expires_at != null &&
      new Date(existing.invite_expires_at).getTime() <= Date.now();
    if (expiredInvite) {
      // Their invite lapsed — re-activate the SAME row to 'waiting' (created_at
      // is frozen by the DB trigger, so they keep their place in line). Re-check
      // expiry in the UPDATE so a coach who just re-invited (fresh future expiry)
      // in a concurrent request isn't clobbered back to 'waiting'; only count it
      // as new/notify when a row actually changed.
      const { data: reactivated, error: reErr } = await supabase
        .from('coach_waitlist')
        .update({ status: 'waiting', note })
        .eq('id', existing.id).eq('client_id', user.id)
        .eq('status', 'invited').lt('invite_expires_at', new Date().toISOString())
        .select('id').maybeSingle();
      if (reErr) return NextResponse.json({ error: 'Could not join the waitlist.' }, { status: 500 });
      isNew = Boolean(reactivated);
    }
    // else: already waiting or holding a live invite — dedup, no change.
  } else {
    const { error: insErr } = await supabase.from('coach_waitlist').insert({
      provider_role: providerRole, provider_id: providerId, client_id: user.id, note, status: 'waiting',
    });
    // 23505 = someone raced us to the unique index; treat as already-joined.
    if (insErr && insErr.code !== '23505') {
      return NextResponse.json({ error: 'Could not join the waitlist.' }, { status: 500 });
    }
    if (!insErr) isNew = true;
  }

  // Notify the coach on a genuinely new / renewed entry. The notification write
  // targets another user, so it goes through the service-role client (the
  // documented system-write exception); the owner_id is resolved there too.
  if (isNew) {
    const admin = createAdminClient();
    const { data: ownerRow } = await admin.from(table).select('owner_id').eq('id', providerId).maybeSingle();
    const ownerId = (ownerRow as { owner_id?: string } | null)?.owner_id;
    if (ownerId) {
      await createNotification(admin, {
        userId: ownerId, type: 'waitlist_join',
        title: 'New waiting-list request',
        body: 'Someone joined your waiting list.', route: 'waitlist',
        data: { providerRole, providerId },
      });
    }
  }

  // Position + entry id from the auth.uid()-scoped RPC (a client can't read peer
  // rows under RLS, so FIFO position is computed there).
  const { data: mineRows, error: mineErr } = await supabase.rpc('get_my_waitlists');
  if (mineErr) return NextResponse.json({ error: 'Could not confirm your waitlist spot.' }, { status: 500 });
  const mine = ((mineRows as MyEntry[] | null) ?? []).find(
    (r) => r.provider_role === providerRole && Number(r.provider_id) === providerId
  );
  return NextResponse.json({
    entryId: mine?.id ?? null,
    position: mine?.queue_position ?? 0,
    status: mine?.status ?? 'waiting',
  });
}
