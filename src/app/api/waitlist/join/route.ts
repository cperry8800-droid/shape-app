import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isEffectivelyAtCapacity } from '@/lib/capacity';
import { createPreferredNotification } from '@/lib/notify';
import { np } from '../../../../../mobile-app/src/services/noticeCopy.mjs';
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
  let entryId: string | null = null;
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
      if (reactivated) entryId = existing.id;
    }
    // else: already waiting or holding a live invite — dedup, no change.
  } else {
    const { data: inserted, error: insErr } = await supabase.from('coach_waitlist').insert({
      provider_role: providerRole, provider_id: providerId, client_id: user.id, note, status: 'waiting',
    }).select('id').maybeSingle();
    // 23505 = someone raced us to the unique index; treat as already-joined.
    if (insErr && insErr.code !== '23505') {
      return NextResponse.json({ error: 'Could not join the waitlist.' }, { status: 500 });
    }
    if (!insErr) {
      isNew = true;
      entryId = (inserted as { id?: string } | null)?.id ?? null;
    }
  }

  // ⚠ A JOIN THAT RACED A REOPENING (Codex on #2375). The capacity read above can see the coach full
  // while the reopening reads its list before this row is saved; the reopening then finishes and
  // this member waits for a notice that never comes. A reopening makes the coach open to members
  // before it reads its list (src/lib/capacity-reopen.ts), so a read made now, after the row is
  // saved, sees it: the entry is withdrawn and the member is told the coach is taking clients, as
  // the check above says. A read that fails keeps the entry.
  if (isNew && entryId) {
    const { data: now } = await supabase
      .from(table)
      .select('id, at_capacity, capacity_resume_at')
      .eq('id', providerId)
      .maybeSingle();
    if (now && !isEffectivelyAtCapacity(now)) {
      // Refused only once the row is confirmed withdrawn (Codex on #2375). A withdrawal that fails,
      // or finds the row already moved on (the coach invited them), leaves a live entry, so the
      // join answers as it would have: the member is on the list and the coach is told.
      const { data: withdrawn, error: wdErr } = await supabase
        .from('coach_waitlist')
        .update({ status: 'left', responded_at: new Date().toISOString() })
        .eq('id', entryId).eq('client_id', user.id).eq('status', 'waiting')
        .select('id')
        .maybeSingle();
      if (!wdErr && withdrawn) {
        return NextResponse.json({ error: 'This coach is accepting clients — no waitlist needed.' }, { status: 409 });
      }
    }
  }

  // Notify the coach on a genuinely new / renewed entry. The notification write
  // targets another user, so it goes through the service-role client (the
  // documented system-write exception); the owner_id is resolved there too.
  if (isNew) {
    const admin = createAdminClient();
    const { data: ownerRow } = await admin.from(table).select('owner_id').eq('id', providerId).maybeSingle();
    const ownerId = (ownerRow as { owner_id?: string } | null)?.owner_id;
    if (ownerId) {
      // Preference-aware: waitlist_join is registered in the notification-center
      // matrix, so the coach's per-channel toggles (and master mute) are honored.
      await createPreferredNotification(admin, {
        userId: ownerId, type: 'waitlist_join',
        title: 'New waiting-list request',
        body: 'Someone joined your waiting list.', route: 'waitlist',
        // One a day per member and listing (owner, 2026-10-26: "fix 1-7"): leaving and joining again
        // sent the coach a new request each time. The dedupe index refuses the repeat.
        data: { providerRole, providerId, dedupe: `waitlist-join:${providerRole}:${providerId}:${user.id}:${new Date().toISOString().slice(0, 10)}`, copy: { title: np('waitlist.join.title'), body: np('waitlist.join.body') } },
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
