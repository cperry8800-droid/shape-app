// Member-added "today's plan" meals (e.g. from a recipe's "Add to today's plan").
// POST   { name, kcal, protein, carbs, fat, source?, mealRef?, date? } -> upsert
// DELETE { mealRef, date? }                                            -> remove
// GET    ?date=YYYY-MM-DD                                              -> list
// Synced to the account so it shows on web + mobile (both via the nutrition feed).

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readJson, dbError } from '@/lib/request-utils';
import { requireMembership } from '@/lib/require-membership';

export const dynamic = 'force-dynamic';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function int(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const date = new URL(request.url).searchParams.get('date') || todayStr();
  const { data } = await supabase
    .from('client_planned_meals')
    .select('id, name, kcal, protein, carbs, fat, source, meal_ref, planned_on')
    .eq('user_id', user.id)
    .eq('planned_on', date)
    .order('created_at', { ascending: true });
  return NextResponse.json({ ok: true, meals: data ?? [] });
}

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Missing name.' }, { status: 400 });
  const row = {
    user_id: user.id,
    planned_on: typeof body.date === 'string' && body.date ? body.date : todayStr(),
    name,
    kcal: int(body.kcal), protein: int(body.protein), carbs: int(body.carbs), fat: int(body.fat),
    source: typeof body.source === 'string' ? body.source : 'Shape Kitchen',
    meal_ref: typeof body.mealRef === 'string' ? body.mealRef : null,
  };
  // Upsert on (user, day, meal_ref) so re-adding the same recipe doesn't dupe.
  const { error } = row.meal_ref
    ? await supabase.from('client_planned_meals').upsert(row, { onConflict: 'user_id,planned_on,meal_ref' })
    : await supabase.from('client_planned_meals').insert(row);
  if (error) return dbError(error, 'planned meals write', 500);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const mealRef = String(body.mealRef ?? '').trim();
  if (!mealRef) return NextResponse.json({ error: 'Missing mealRef.' }, { status: 400 });
  const date = typeof body.date === 'string' && body.date ? body.date : todayStr();
  await supabase.from('client_planned_meals').delete()
    .eq('user_id', user.id).eq('planned_on', date).eq('meal_ref', mealRef);
  return NextResponse.json({ ok: true });
}
