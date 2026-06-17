// Nutritionist meal-plan authoring — assign a client a weekly menu stored in
// client_meal_plans. RLS enforces nutritionist ownership; this route resolves
// the caller's nutritionist row and validates the payload shape.
//
// POST { clientId, title, weekStart?, days:[...] } -> { ok, id }
//   Replaces (archives) the client's current published plan from this
//   nutritionist, then inserts the new one.
//
// Auth: cookie session OR Bearer token (native coach app sends Bearer).

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { unauthorizedAssignTargets } from '@/lib/access-guards.mjs';
import { gateProviderAction, blockMessage } from '@/lib/compliance/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const clientId = String(body.clientId ?? '').trim();
  const title = String(body.title ?? '').trim();
  const weekStart = body.weekStart ? String(body.weekStart) : null;
  const days = Array.isArray(body.days) ? body.days : null;

  if (!clientId) return NextResponse.json({ error: 'clientId is required.' }, { status: 400 });
  if (!title) return NextResponse.json({ error: 'title is required.' }, { status: 400 });
  if (!days || days.length === 0) return NextResponse.json({ error: 'days[] is required.' }, { status: 400 });

  // Resolve the caller's nutritionist row (RLS will also enforce this on write).
  const { data: nutriRow } = await supabase
    .from('nutritionists')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!nutriRow) return NextResponse.json({ error: 'Not a nutritionist.' }, { status: 403 });

  // On-client + discipline gate: a nutritionist may write a plan only for a
  // client they actively coach AS A NUTRITIONIST. Read the caller's
  // active/trialing subs for THIS nutritionist row and reject if the target
  // client isn't among them. (The 2026-06-17 INSERT RLS policy enforces the same
  // at the DB.)
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('client_id')
    .eq('provider_id', nutriRow.id)
    .eq('provider_role', 'nutritionist')
    .in('status', ['active', 'trialing']);
  const activeClientIds = (subs ?? []).map((s) => String((s as { client_id: unknown }).client_id));
  if (unauthorizedAssignTargets([clientId], activeClientIds).length) {
    return NextResponse.json(
      { error: 'You can only assign a meal plan to your own active client.' },
      { status: 403 },
    );
  }

  // NC1 — nutrition compliance: a meal plan is INDIVIDUALIZED (Medical Nutrition
  // Therapy), so it requires the provider be LICENSED in the client's state (and
  // carry active insurance). Always computed + audited; HARD-blocks only when
  // NUTRITION_COMPLIANCE_ENFORCE is on (counsel sign-off). The disclaimer rides
  // on the response either way.
  const gate = await gateProviderAction({ client: supabase, ownerId: user.id, clientId, actionType: 'meal_plan' });
  if (gate.enforced && !gate.allowed) {
    return NextResponse.json(
      { error: blockMessage(gate.reason), code: 'compliance_blocked', reason: gate.reason, disclaimer: gate.disclaimer },
      { status: 403 },
    );
  }

  // Retire the client's current published plan from this nutritionist.
  await supabase
    .from('client_meal_plans')
    .update({ status: 'archived' })
    .eq('nutritionist_id', nutriRow.id)
    .eq('client_id', clientId)
    .eq('status', 'published');

  const { data: inserted, error } = await supabase
    .from('client_meal_plans')
    .insert({
      nutritionist_id: nutriRow.id,
      client_id: clientId,
      title,
      week_start: weekStart,
      status: 'published',
      payload: { days },
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // The "not medical advice" / individualized-care disclaimer rides on every
  // assignment, plus a warning if compliance is in observe-only (not enforced) mode.
  return NextResponse.json({
    ok: true,
    id: inserted?.id ?? null,
    disclaimer: gate.disclaimer,
    compliance: { scope: gate.scope, allowed: gate.allowed, enforced: gate.enforced, reason: gate.reason },
  });
}
