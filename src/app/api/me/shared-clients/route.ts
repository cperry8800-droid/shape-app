// Shared-client roster for the signed-in coach.
//
// A "shared client" is a client who has an active subscription with both me
// (trainer or nutritionist) and at least one counterpart coach of the opposite
// role. Returns one row per (client, counterpart) pair with an `acknowledged`
// flag so the dashboard can decide whether to show the banner or just list
// the client in the "Shared clients" filter.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SubRow = {
  client_id: string;
  provider_role: 'trainer' | 'nutritionist';
  provider_id: number;
  status: string;
};

const ACTIVE = ['active', 'trialing'];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const [trainerRow, nutritionistRow] = await Promise.all([
    supabase.from('trainers').select('id, name').eq('owner_id', user.id).maybeSingle(),
    supabase.from('nutritionists').select('id, name').eq('owner_id', user.id).maybeSingle(),
  ]);

  const myTrainerId = trainerRow.data?.id ?? null;
  const myNutritionistId = nutritionistRow.data?.id ?? null;
  if (myTrainerId == null && myNutritionistId == null) {
    return NextResponse.json({ shared: [], myRoles: [] });
  }

  // 1. Fetch every active subscription belonging to me.
  const myFilters: Array<{ role: 'trainer' | 'nutritionist'; id: number }> = [];
  if (myTrainerId != null) myFilters.push({ role: 'trainer', id: myTrainerId });
  if (myNutritionistId != null) myFilters.push({ role: 'nutritionist', id: myNutritionistId });

  const mineRes = await supabase
    .from('subscriptions')
    .select('client_id, provider_role, provider_id, status')
    .in('status', ACTIVE)
    .or(myFilters.map(f => `and(provider_role.eq.${f.role},provider_id.eq.${f.id})`).join(','));

  const mine = (mineRes.data ?? []) as SubRow[];
  const myClientIds = [...new Set(mine.map(r => r.client_id).filter(Boolean))];
  if (myClientIds.length === 0) {
    return NextResponse.json({ shared: [], myRoles: myFilters.map(f => f.role) });
  }

  // 2. Find subscriptions for the OPPOSITE role on those same clients.
  const oppositeRoles = new Set<'trainer' | 'nutritionist'>();
  if (myTrainerId != null) oppositeRoles.add('nutritionist');
  if (myNutritionistId != null) oppositeRoles.add('trainer');

  const counterpartRes = await supabase
    .from('subscriptions')
    .select('client_id, provider_role, provider_id, status')
    .in('status', ACTIVE)
    .in('client_id', myClientIds)
    .in('provider_role', [...oppositeRoles]);

  const counterparts = (counterpartRes.data ?? []) as SubRow[];
  if (counterparts.length === 0) {
    return NextResponse.json({ shared: [], myRoles: myFilters.map(f => f.role) });
  }

  // 3. Resolve counterpart provider details + the client's name.
  const trainerIds = counterparts.filter(r => r.provider_role === 'trainer').map(r => r.provider_id);
  const nutriIds = counterparts.filter(r => r.provider_role === 'nutritionist').map(r => r.provider_id);
  const clientIds = [...new Set(counterparts.map(r => r.client_id))];

  const [trainersRes, nutriRes, clientProfilesRes, acksRes] = await Promise.all([
    trainerIds.length
      ? supabase.from('trainers').select('id, name, owner_id, avatar_url').in('id', trainerIds)
      : Promise.resolve({ data: [] as Array<{ id: number; name: string; owner_id: string | null; avatar_url: string | null }> }),
    nutriIds.length
      ? supabase.from('nutritionists').select('id, name, owner_id, avatar_url').in('id', nutriIds)
      : Promise.resolve({ data: [] as Array<{ id: number; name: string; owner_id: string | null; avatar_url: string | null }> }),
    supabase.from('profiles').select('id, full_name').in('id', clientIds),
    supabase.from('shared_client_acks').select('client_id, counterpart_user_id').eq('coach_user_id', user.id),
  ]);

  const trainerById = new Map<number, { name: string; owner_id: string | null; avatar_url: string | null }>();
  for (const t of trainersRes.data ?? []) trainerById.set(t.id, { name: t.name, owner_id: t.owner_id, avatar_url: t.avatar_url });
  const nutriById = new Map<number, { name: string; owner_id: string | null; avatar_url: string | null }>();
  for (const n of nutriRes.data ?? []) nutriById.set(n.id, { name: n.name, owner_id: n.owner_id, avatar_url: n.avatar_url });
  const clientName = new Map<string, string>();
  for (const p of clientProfilesRes.data ?? []) clientName.set(p.id, (p.full_name ?? '').trim() || 'Client');
  const ackKey = (clientId: string, counterpartUserId: string) => `${clientId}|${counterpartUserId}`;
  const acks = new Set<string>();
  for (const a of acksRes.data ?? []) acks.add(ackKey(a.client_id, a.counterpart_user_id));

  // 4. Build response rows.
  const shared = counterparts
    .map(r => {
      const cp = r.provider_role === 'trainer' ? trainerById.get(r.provider_id) : nutriById.get(r.provider_id);
      if (!cp || !cp.owner_id) return null;
      return {
        clientId: r.client_id,
        clientName: clientName.get(r.client_id) ?? 'Client',
        counterpart: {
          userId: cp.owner_id,
          role: r.provider_role,
          providerId: r.provider_id,
          name: cp.name,
          avatarUrl: cp.avatar_url,
        },
        acknowledged: acks.has(ackKey(r.client_id, cp.owner_id)),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({
    shared,
    myRoles: myFilters.map(f => f.role),
  });
}
