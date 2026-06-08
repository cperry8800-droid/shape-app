// Live values for the coach "sigil" rings on the public profile:
//   habits         → the coach's own habit completion (last 7 days)
//   clientWorkouts → completed-session ratio across the coach's clients (30 days)
//   ownActivity    → the coach's own logged training (last 7 days, ~5/wk target)
// Each is 0..1, or null when there's no data to read (the UI keeps a fallback).
// RLS scopes every query to the signed-in coach, so this is self-only by design.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const [trainerRow, nutritionistRow] = await Promise.all([
    supabase.from('trainers').select('id').eq('owner_id', user.id).maybeSingle(),
    supabase.from('nutritionists').select('id').eq('owner_id', user.id).maybeSingle(),
  ]);
  const myTrainerId = trainerRow.data?.id ?? null;
  const myNutritionistId = nutritionistRow.data?.id ?? null;
  if (myTrainerId == null && myNutritionistId == null) {
    return NextResponse.json({ isCoach: false, habits: null, clientWorkouts: null, ownActivity: null });
  }

  const d7 = new Date(); d7.setUTCHours(0, 0, 0, 0); d7.setUTCDate(d7.getUTCDate() - 7);
  const d7Date = d7.toISOString().slice(0, 10);
  const d7Ts = d7.toISOString();
  const d30 = new Date(); d30.setUTCDate(d30.getUTCDate() - 30);
  const d30Ts = d30.toISOString();
  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  // ── Habits — the coach's own to-do habit completion over the last 7 days ──
  let habits: number | null = null;
  try {
    const { data: hRows } = await supabase
      .from('user_habits').select('id, type').eq('user_id', user.id).is('archived_at', null);
    const todo = (hRows || []).filter((h) => String((h as { type?: string }).type || 'do').toLowerCase() !== 'avoid');
    if (todo.length) {
      const ids = new Set(todo.map((h) => (h as { id: string }).id));
      const { data: comp } = await supabase
        .from('user_habit_completions').select('habit_id, done_on').eq('user_id', user.id).gte('done_on', d7Date);
      const done = (comp || []).filter((c) => ids.has((c as { habit_id: string }).habit_id)).length;
      habits = clamp(done / (todo.length * 7));
    }
  } catch { /* no-op */ }

  // ── Own activity — the coach's logged sessions in the last 7 days (~5/wk) ──
  let ownActivity: number | null = null;
  try {
    const { data: acts } = await supabase
      .from('activities').select('id').eq('user_id', user.id).gte('started_at', d7Ts);
    if (acts) ownActivity = clamp((acts.length || 0) / 5);
  } catch { /* no-op */ }

  // ── Client workouts — completed-session ratio across my clients (last 30d) ──
  let clientWorkouts: number | null = null;
  try {
    const filters: string[] = [];
    if (myTrainerId != null) filters.push(`and(provider_role.eq.trainer,provider_id.eq.${myTrainerId})`);
    if (myNutritionistId != null) filters.push(`and(provider_role.eq.nutritionist,provider_id.eq.${myNutritionistId})`);
    const { data: sess } = await supabase
      .from('sessions').select('status, scheduled_at').or(filters.join(',')).gte('scheduled_at', d30Ts).limit(2000);
    const past = (sess || []).filter((s) => {
      const at = (s as { scheduled_at?: string }).scheduled_at;
      return at && new Date(at).getTime() <= Date.now();
    });
    if (past.length) {
      const completed = past.filter((s) => (s as { status?: string }).status === 'completed').length;
      clientWorkouts = clamp(completed / past.length);
    }
  } catch { /* no-op */ }

  return NextResponse.json({ isCoach: true, habits, clientWorkouts, ownActivity });
}
