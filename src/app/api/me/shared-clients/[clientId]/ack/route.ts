// Dismiss / un-dismiss the "shared client" banner for a (client, counterpart)
// pair. Body: { counterpartUserId: string }. The row is keyed by caller +
// client + counterpart, so a *new* counterpart subscribing later re-triggers
// the banner.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readJson, dbError } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const bodyResult = await readJson<Record<string, unknown>>(req, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const counterpartUserId = typeof body?.counterpartUserId === 'string' ? body.counterpartUserId : null;
  if (!counterpartUserId) {
    return NextResponse.json({ error: 'counterpartUserId required.' }, { status: 400 });
  }

  // ⚠ ENTITLEMENT, NOT JUST AUTHENTICATION.
  //
  // The RLS policy on shared_client_acks pins only `coach_user_id = auth.uid()`;
  // it says nothing about client_id or counterpart_user_id. So ANY signed-in
  // account — not even a coach — could write rows naming arbitrary uuids. Both
  // columns are FKs to auth.users, which also made this an account-EXISTENCE
  // oracle: a real uuid returned 200, a fake one 500 on the FK violation.
  //
  // Fails CLOSED on an RPC error: `!== true` catches null and undefined, so a
  // failed check denies rather than waves through.
  const { data: onClient } = await supabase.rpc('is_coach_on_client', { p_client_id: clientId });
  if (onClient !== true) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  // ⚠ AND THE COUNTERPART MUST BE A COACH — someone who OWNS a provider row.
  //
  // Coaching this client does not make every uuid a legitimate counterpart, and
  // counterpart_user_id is a second FK to auth.users, so an arbitrary uuid still
  // answered "does this account exist?" through the status code: 200 on a real
  // one, 500 on the FK violation for a fake one.
  //
  // This is deliberately the WEAKER of the two available checks, because it is
  // the strongest one a request-scoped client can make. Proving the counterpart
  // is on THIS client needs a definer: the SELECT policies on `subscriptions`
  // are client-reads-own and provider-reads-own ONLY, so reading the
  // counterpart's subscription from here returns nothing at all. Registered, not
  // built — it wants its own migration, not a fourth file bolted onto a
  // security deploy whose ordering is already load-bearing.
  //
  // It is still enough to close the leak. `trainers` and `nutritionists` are
  // USING (true) readable BY ANON, so every owner_id this accepts is public
  // already: a caller learns nothing here they could not read off the
  // marketplace signed out. What remains is self-inflicted only — the row is
  // keyed by the caller's OWN coach_user_id, so pre-creating an ack suppresses
  // the caller's own banner, which dismissing it does anyway.
  if (counterpartUserId === user.id) {
    return NextResponse.json({ error: 'Counterpart cannot be yourself.' }, { status: 400 });
  }
  const [asTrainer, asNutritionist] = await Promise.all([
    supabase.from('trainers').select('id').eq('owner_id', counterpartUserId).limit(1),
    supabase.from('nutritionists').select('id').eq('owner_id', counterpartUserId).limit(1),
  ]);
  // Fails CLOSED: a malformed uuid errors the query, leaving data null, which
  // lands here rather than reaching the FK.
  if (!asTrainer.data?.length && !asNutritionist.data?.length) {
    return NextResponse.json({ error: 'Unknown counterpart.' }, { status: 403 });
  }

  const { error } = await supabase.from('shared_client_acks').upsert({
    coach_user_id: user.id,
    client_id: clientId,
    counterpart_user_id: counterpartUserId,
    acknowledged_at: new Date().toISOString(),
  });
  if (error) return dbError(error, 'shared-client ack write', 500);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const url = new URL(req.url);
  const counterpartUserId = url.searchParams.get('counterpartUserId');
  if (!counterpartUserId) {
    return NextResponse.json({ error: 'counterpartUserId required.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('shared_client_acks')
    .delete()
    .eq('coach_user_id', user.id)
    .eq('client_id', clientId)
    .eq('counterpart_user_id', counterpartUserId);
  if (error) return dbError(error, 'shared-client ack write', 500);
  return NextResponse.json({ ok: true });
}
