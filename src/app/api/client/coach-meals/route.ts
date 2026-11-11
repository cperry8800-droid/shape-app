// The meals the member's nutritionists pushed from the Live console ("+ Add to today's plan"), on the
// member's own days, and each nutritionist's grocery note. The app's Eat week shows each day's meals
// and Grocery shows the notes (BSCoachMeals.jsx).
//
// ⚠ BEFORE THIS NOTHING READ THEM (left by #2686). /api/client/nutrition sent every meal never removed
// as `todayMeals`, from any day and any nutritionist the member ever had, and neither the app nor the
// website read it; a grocery note could not even be saved. This is the read, as
// /api/client/coach-exercises is a trainer's.
//
// GET → { ok: true, today, days: { 'YYYY-MM-DD': Meal[] }, notes: Note[] }: every one of the member's
//       last MEAL_DAYS days is present, oldest first, and an empty list is a day with none. Each meal is
//       { id, providerId, coachName, name, time, kcal, protein, note, ingredients, alternatives, sentAt,
//       day }, oldest first; each note { id, providerId, coachName, text, sentAt }, the newest of each
//       nutritionist. A coach whose listing could not be read has coachName null.
//       500 { ok: false } when the subscriptions, the meals, the notes or the zone could not be read:
//       unread, never "your nutritionist sent nothing".
//
// Only nutritionists the member pays now (an open subscription), as the trainer's read. RLS scopes every
// row to the member (coach_pushed_items_client_read: client_id = auth.uid()::text).

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { requireAccount } from '@/lib/require-membership';
import { normalizeZone } from '@/lib/time';
import { exerciseReadSince, memberDays } from '@/lib/coach-exercises';
import { MEAL_DAYS, latestGroceryNotes, pushedMealOf, type PushedMeal } from '@/lib/coach-meals';
import { OPEN_SUB_STATUSES } from '../../../../lib/coach-trajectory.mjs';

export const dynamic = 'force-dynamic';

// A week of a nutritionist's pushes is a few dozen rows; the cap only bounds a runaway.
const ROW_CAP = 500;

// Free with the account, as /api/client/coach-exercises is.
export async function GET(request: Request) {
  const denied = await requireAccount(request);
  if (denied) return denied;
  const supabase = await clientForRequest(request);
  const user = await currentUser(request);

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const now = Date.now();
  const [tzRes, subRes, mealRes, noteRes] = await Promise.all([
    supabase.from('client_profiles').select('timezone').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('subscriptions')
      .select('provider_id')
      .eq('client_id', user.id)
      .eq('provider_role', 'nutritionist')
      .in('status', OPEN_SUB_STATUSES),
    supabase
      .from('coach_pushed_items')
      .select('id, kind, provider_id, payload, sent_at')
      .eq('client_id', user.id)
      .eq('provider_role', 'nutritionist')
      .eq('kind', 'meal')
      .is('removed_at', null)
      .gte('sent_at', exerciseReadSince(now, MEAL_DAYS))
      // Newest first, so a cap keeps the days the member is looking at.
      .order('sent_at', { ascending: false })
      .limit(ROW_CAP),
    // The notes stand until replaced: no day window. One live row a nutritionist (the console marks the
    // older ones removed), so the cap only bounds a runaway, and newest first keeps the newest.
    supabase
      .from('coach_pushed_items')
      .select('id, kind, provider_id, payload, sent_at')
      .eq('client_id', user.id)
      .eq('provider_role', 'nutritionist')
      .eq('kind', 'grocery_note')
      .is('removed_at', null)
      .order('sent_at', { ascending: false })
      .limit(ROW_CAP),
  ]);

  const failed = subRes.error || mealRes.error || noteRes.error || tzRes.error;
  if (failed) {
    console.warn('[shape-app] client coach-meals: a read failed — the meals and notes render as unread:', failed.message);
    return NextResponse.json({ ok: false, error: 'Could not load your nutritionist’s meals.' }, { status: 500 });
  }

  const zone = normalizeZone(tzRes.data?.timezone);
  const dates = memberDays(now, zone, MEAL_DAYS);
  const days: Record<string, Array<PushedMeal & { coachName: string | null }>> = Object.fromEntries(dates.map((d) => [d, []]));

  const paid = new Set((subRes.data ?? []).map((r) => String(r.provider_id)));
  const meals = (mealRes.data ?? [])
    .map((r) => pushedMealOf(r, zone))
    .filter((m): m is PushedMeal => !!m && paid.has(m.providerId) && m.day in days)
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  const notes = [...latestGroceryNotes(noteRes.data).values()]
    .filter((n) => paid.has(n.providerId))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));

  // The coaches' names, from their public listings. A failed read leaves the byline to the role.
  const ids = [...new Set([...meals.map((m) => m.providerId), ...notes.map((n) => n.providerId)])];
  const nameOf = new Map<string, string | null>();
  if (ids.length) {
    const { data: rows, error } = await supabase.from('nutritionists').select('id, name').in('id', ids);
    if (error) console.warn('[shape-app] client coach-meals: nutritionist names read failed — bylines read "Your nutritionist":', error.message);
    for (const r of rows ?? []) nameOf.set(String(r.id), typeof r.name === 'string' && r.name.trim() ? r.name.trim() : null);
  }
  for (const m of meals) days[m.day].push({ ...m, coachName: nameOf.get(m.providerId) ?? null });

  return NextResponse.json({
    ok: true,
    today: dates[dates.length - 1],
    days,
    notes: notes.map((n) => ({ ...n, coachName: nameOf.get(n.providerId) ?? null })),
  });
}
