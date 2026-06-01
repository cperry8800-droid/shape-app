// Client prescribed plan — assigned training (scheduled client_workouts) and
// the active meal plan (client_meal_plans). Read-only; RLS scopes every row to
// the signed-in user.
//
// Returns raw plan data; the mobile UI derives presentation (titles, accents,
// day labels). When the client has no assigned plan the caller falls back to
// its demo program, so this endpoint never fabricates content.
//
// Auth: cookie session OR Bearer token (the native app sends Bearer).

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Monday 00:00 of the current week, as 'YYYY-MM-DD'.
function weekStartISO(d = new Date()): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const mondayOffset = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - mondayOffset);
  return x.toISOString().slice(0, 10);
}

type ExerciseRow = { name?: string; sets?: unknown; reps?: unknown; rest?: unknown; notes?: unknown; load?: unknown };

function mapExercises(payload: Record<string, unknown> | null): Array<{ name: string; sets: string; reps: string; rest: string; load: string }> {
  const list = Array.isArray(payload?.exercises) ? (payload!.exercises as ExerciseRow[]) : [];
  return list
    .filter((e) => e && (e.name != null))
    .map((e) => ({
      name: String(e.name ?? '').trim(),
      sets: e.sets != null ? String(e.sets) : '',
      reps: e.reps != null ? String(e.reps) : '',
      rest: e.rest != null ? String(e.rest) : '',
      load: e.load != null ? String(e.load) : (e.notes != null ? String(e.notes) : ''),
    }));
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);
  const weekStart = weekStartISO();

  // ── Training: assigned workouts (scheduled onto the calendar or not). ──
  const { data: cwRows } = await supabase
    .from('client_workouts')
    .select('id, title, description, kind, payload, scheduled_date, created_at')
    .eq('client_id', user.id)
    .eq('status', 'published')
    .order('scheduled_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(60);

  const workouts = (cwRows ?? []).map((w) => {
    const payload = (w.payload && typeof w.payload === 'object') ? (w.payload as Record<string, unknown>) : null;
    const durationRaw = payload?.duration;
    const durMatch = durationRaw != null ? String(durationRaw).match(/\d+/) : null;
    return {
      id: w.id,
      title: w.title,
      description: w.description ?? '',
      kind: w.kind,
      scheduledDate: w.scheduled_date ?? null,
      durationMin: durMatch ? Number(durMatch[0]) : null,
      exercises: mapExercises(payload),
    };
  });

  // ── Meals: the most recent published weekly menu. ──
  const { data: mpRows } = await supabase
    .from('client_meal_plans')
    .select('id, title, week_start, payload, created_at')
    .eq('client_id', user.id)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1);

  const mp = (mpRows ?? [])[0] ?? null;
  const mealDays = mp && mp.payload && Array.isArray((mp.payload as Record<string, unknown>).days)
    ? (mp.payload as Record<string, unknown>).days
    : [];

  return NextResponse.json({
    ok: true,
    weekStart,
    training: {
      hasPlan: workouts.length > 0,
      workouts,
    },
    meals: {
      hasPlan: Array.isArray(mealDays) && mealDays.length > 0,
      title: mp?.title ?? null,
      weekStart: mp?.week_start ?? null,
      days: mealDays,
    },
  });
}
