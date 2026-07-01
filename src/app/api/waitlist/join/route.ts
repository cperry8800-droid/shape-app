import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isEffectivelyAtCapacity } from '@/lib/capacity';
import { createNotification } from '@/lib/notify';
import { readJson } from '@/lib/request-utils';
import { resolveRequestUser, computePositions, type ProviderRole } from '@/lib/waitlist';

export const runtime = 'nodejs';

type Body = { providerId?: number | string; providerRole?: string; note?: string };

export async function POST(request: Request) {
  const user = await resolveRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const parsed = await readJson<Body>(request, { allowEmpty: false });
  if (!parsed.ok) return parsed.response;
  const providerId = Number(parsed.data.providerId ?? 0);
  const providerRole = (String(parsed.data.providerRole ?? '').toLowerCase() === 'nutritionist'
    ? 'nutritionist' : 'trainer') as ProviderRole;
  const note = String(parsed.data.note ?? '').trim().slice(0, 500) || null;
  if (!Number.isInteger(providerId) || providerId <= 0) {
    return NextResponse.json({ error: 'Invalid coach.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const table = providerRole === 'trainer' ? 'trainers' : 'nutritionists';
  const { data: provider } = await admin
    .from(table)
    .select('id, name, owner_id, at_capacity, capacity_resume_at')
    .eq('id', providerId)
    .maybeSingle();
  if (!provider) return NextResponse.json({ error: 'Coach not found.' }, { status: 404 });
  if (!isEffectivelyAtCapacity(provider)) {
    return NextResponse.json({ error: 'This coach is accepting clients — no waitlist needed.' }, { status: 409 });
  }

  // Dedup: return the existing active entry if present.
  const { data: existing } = await admin
    .from('coach_waitlist')
    .select('id, status')
    .eq('provider_role', providerRole).eq('provider_id', providerId)
    .eq('client_id', user.id).in('status', ['waiting', 'invited'])
    .maybeSingle();
  if (!existing) {
    const { error: insErr } = await admin.from('coach_waitlist').insert({
      provider_role: providerRole, provider_id: providerId, client_id: user.id, note, status: 'waiting',
    });
    // 23505 = someone raced us to the unique index; treat as already-joined.
    if (insErr && insErr.code !== '23505') {
      return NextResponse.json({ error: 'Could not join the waitlist.' }, { status: 500 });
    }
    if (!insErr && provider.owner_id) {
      await createNotification(admin, {
        userId: provider.owner_id, type: 'waitlist_join',
        title: 'New waiting-list request',
        body: 'Someone joined your waiting list.', route: 'waitlist',
        data: { providerRole, providerId },
      });
    }
  }

  // Compute this client's position among active rows.
  const { data: rows } = await admin
    .from('coach_waitlist')
    .select('id, client_id, status, created_at')
    .eq('provider_role', providerRole).eq('provider_id', providerId)
    .in('status', ['waiting', 'invited']);
  const mineRow = (rows ?? []).find((r) => r.client_id === user.id);
  const position = mineRow ? (computePositions(rows ?? []).get(mineRow.id) ?? 0) : 0;
  return NextResponse.json({ entryId: mineRow?.id ?? null, position, status: mineRow?.status ?? 'waiting' });
}
