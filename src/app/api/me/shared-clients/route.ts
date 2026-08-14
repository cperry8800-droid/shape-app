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

type CounterpartRow = {
  client_id: string;
  counterpart_user_id: string;
  counterpart_role: 'trainer' | 'nutritionist';
  counterpart_provider_id: number;
  counterpart_name: string | null;
};

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

  const myRoles: Array<'trainer' | 'nutritionist'> = [];
  if (myTrainerId != null) myRoles.push('trainer');
  if (myNutritionistId != null) myRoles.push('nutritionist');

  // 1. My shared clients AND their counterpart coaches, in ONE definer call.
  //
  // ⚠ This was two caller-scoped reads of `subscriptions`, and the second could NEVER return a
  // row. RLS there is client-reads-own + provider-reads-own with no cross-provider clause, so
  // asking for the COUNTERPART's subscription always yielded [] and this route answered HTTP 200
  // with an empty roster -- silent, and indistinguishable from "no shared clients yet". Verified
  // by impersonation against production: the real owner sees 1 row, a different coach sees 0,
  // with a control read returning 21 in both. See 2026-08-10-shared-clients-roster.sql.
  //
  // ⚠ There was a SECOND, independent bug that also emptied this list on its own, so fixing only
  // the permission half would have changed nothing: the provider lookups below used to select
  // `avatar_url` from trainers/nutritionists, a column that exists on NEITHER table (it lives on
  // `profiles`). PostgREST 400s an unknown column, the error was discarded with `?? []`, and every
  // row then failed the `if (!cp)` filter. The definer returns no avatar because there is none to
  // return; the UI already renders initials when it is absent.
  const { data: rpcRows, error: rpcError } = await supabase.rpc('get_my_shared_clients');

  if (rpcError) {
    // Surface it rather than degrading to []. Answering 200-with-empty is precisely what kept the
    // original defect invisible for as long as it lasted.
    console.error('[shared-clients] get_my_shared_clients failed:', rpcError.message);
    return NextResponse.json({ error: 'Could not load shared clients.' }, { status: 500 });
  }

  const counterparts = (rpcRows ?? []) as CounterpartRow[];
  if (counterparts.length === 0) return NextResponse.json({ shared: [], myRoles });

  // 2. Resolve the client's display name + which pairs I have already acknowledged.
  const clientIds = [...new Set(counterparts.map(r => r.client_id))];
  const [clientProfilesRes, acksRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name').in('id', clientIds),
    supabase.from('shared_client_acks').select('client_id, counterpart_user_id').eq('coach_user_id', user.id),
  ]);

  const clientName = new Map<string, string>();
  for (const p of clientProfilesRes.data ?? []) clientName.set(p.id, (p.full_name ?? '').trim() || 'Client');
  const ackKey = (clientId: string, counterpartUserId: string) => `${clientId}|${counterpartUserId}`;
  const acks = new Set<string>();
  for (const a of acksRes.data ?? []) acks.add(ackKey(a.client_id, a.counterpart_user_id));

  // 3. Build response rows. Shape is unchanged, so no client-side change is needed.
  const shared = counterparts.map(r => ({
    clientId: r.client_id,
    clientName: clientName.get(r.client_id) ?? 'Client',
    counterpart: {
      userId: r.counterpart_user_id,
      role: r.counterpart_role,
      providerId: r.counterpart_provider_id,
      name: r.counterpart_name ?? 'Coach',
      avatarUrl: null as string | null,
    },
    acknowledged: acks.has(ackKey(r.client_id, r.counterpart_user_id)),
  }));

  return NextResponse.json({ shared, myRoles });
}
