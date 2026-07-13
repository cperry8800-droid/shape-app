// Live data for the newdesign Client "Nutri" page.
// Read-only over daily_health_snapshot (logged macros). RLS scopes every
// row to the signed-in user. The prescribed meal plan, grocery lists and
// recipes are intentionally absent — there is no data model for them.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireMembership } from '@/lib/require-membership';

export const dynamic = 'force-dynamic';

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
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

  // Logging streak (Nutrition tab is streak-framed, never a bare %). Counts
  // consecutive logged days from the most recent backward; longest over the
  // 30-day window. snaps is newest-first; `calories != null` = logged.
  const loggedDates = new Set(
    snaps.filter((s) => s.calories != null).map((s) => String(s.snapshot_date))
  );
  const DAY = 86400000;
  const dayKey = (t: number) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const todayMs0 = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  let currentStreak = 0;
  // A streak is alive if today OR yesterday is logged (today may not be in yet).
  let cursor = loggedDates.has(dayKey(todayMs0)) ? todayMs0 : todayMs0 - DAY;
  while (loggedDates.has(dayKey(cursor))) { currentStreak += 1; cursor -= DAY; }
  let longestStreak = 0;
  let run = 0;
  // Walk the 30-day window oldest→newest counting the longest logged run.
  for (let i = 29; i >= 0; i--) {
    if (loggedDates.has(dayKey(todayMs0 - i * DAY))) { run += 1; longestStreak = Math.max(longestStreak, run); }
    else run = 0;
  }
  longestStreak = Math.max(longestStreak, currentStreak);

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

  // Member-added meals (e.g. recipe "Add to today's plan") for today — synced to
  // the account so they show wherever the nutrition feed is read (web + mobile).
  const todayDate = new Date();
  const todayKey = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
  const { data: plannedRows } = await supabase
    .from('client_planned_meals')
    .select('name, kcal, protein, carbs, fat, source')
    .eq('user_id', user.id)
    .eq('planned_on', todayKey)
    .order('created_at', { ascending: true });
  for (const r of plannedRows ?? []) {
    todayMeals.push({
      time: '—',
      name: typeof r.name === 'string' ? r.name : 'Meal',
      kcal: num(r.kcal) ?? 0,
      protein: num(r.protein) ?? 0,
      carbs: num(r.carbs) ?? 0,
      fat: num(r.fat) ?? 0,
      alternatives: [],
      planned: true,
    });
  }

  return NextResponse.json({ ok: true, today, week, loggedDays7, currentStreak, longestStreak, todayMeals });
}
