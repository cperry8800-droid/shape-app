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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
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
  return NextResponse.json({ ok: true, id: inserted?.id ?? null });
}
