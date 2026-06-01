// Live data for the newdesign Client "Nutri" page.
// Read-only over daily_health_snapshot (logged macros). RLS scopes every
// row to the signed-in user. The prescribed meal plan, grocery lists and
// recipes are intentionally absent — there is no data model for them.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: snapRows } = await supabase
    .from('daily_health_snapshot')
    .select('snapshot_date, calories, protein_g, carbs_g, fat_g, hydration_l')
    .eq('user_id', user.id)
    .order('snapshot_date', { ascending: false })
    .limit(30);

  const snaps = snapRows ?? [];
  const latest = snaps[0] ?? null;

  const today = latest
    ? {
        date: latest.snapshot_date,
        calories: num(latest.calories),
        protein: num(latest.protein_g),
        carbs: num(latest.carbs_g),
        fat: num(latest.fat_g),
        hydration: num(latest.hydration_l),
      }
    : null;

  const week = snaps
    .slice(0, 7)
    .reverse()
    .map((s) => ({
      date: s.snapshot_date,
      calories: num(s.calories),
      logged: s.calories != null,
    }));

  const loggedDays7 = week.filter((d) => d.logged).length;

  // Prescribed meals the nutritionist pushed (coach_pushed_items, kind 'meal'),
  // including any coach-approved swap alternatives saved with each meal.
  const { data: mealRows } = await supabase
    .from('coach_pushed_items')
    .select('id, payload, sent_at')
    .eq('client_id', user.id)
    .eq('kind', 'meal')
    .is('removed_at', null)
    .order('sent_at', { ascending: true });

  const todayMeals = (mealRows ?? []).map((r) => {
    const p = (r.payload ?? {}) as {
      name?: unknown; time?: unknown; kcal?: unknown; protein?: unknown;
      carbs?: unknown; fat?: unknown; alternatives?: unknown;
    };
    return {
      time: typeof p.time === 'string' ? p.time : '—',
      name: typeof p.name === 'string' ? p.name : 'Meal',
      kcal: num(p.kcal) ?? 0,
      protein: num(p.protein) ?? 0,
      carbs: num(p.carbs) ?? 0,
      fat: num(p.fat) ?? 0,
      alternatives: Array.isArray(p.alternatives) ? p.alternatives.map(String).filter(Boolean) : [],
      planned: true,
    };
  });

  return NextResponse.json({ ok: true, today, week, loggedDays7, todayMeals });
}
