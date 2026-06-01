// Live data for the newdesign Client "Train" page.
// Read-only over client_workouts (assigned workouts), workout_sessions
// (completed history) and workout_set_logs (training volume / RPE). RLS
// scopes every row to the signed-in user. The per-exercise plan and the
// Mon-Sun schedule are intentionally absent — assigned workouts store
// exercises as freeform JSONB and carry no scheduled dates.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;

function startOfWeek(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const mondayOffset = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - mondayOffset);
  return x.getTime();
}

type SessionRow = {
  title: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  duration_seconds: number | null;
};

const sessionAt = (s: SessionRow) => s.started_at || s.ended_at || s.created_at;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: cwRows } = await supabase
    .from('client_workouts')
    .select('id, title, description, kind, created_at, payload')
    .eq('client_id', user.id)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: sessRows } = await supabase
    .from('workout_sessions')
    .select('id, title, status, started_at, ended_at, created_at, duration_seconds')
    .eq('client_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  const { data: setRows } = await supabase
    .from('workout_set_logs')
    .select('actual_load, actual_reps, rpe, completed, created_at')
    .eq('client_id', user.id)
    .limit(5000);

  const sessions: SessionRow[] = sessRows ?? [];
  const completed = sessions.filter((s) => s.status === 'completed');

  const weekStart = startOfWeek(new Date());
  const thisWeekCount = completed.filter(
    (s) => new Date(sessionAt(s)).getTime() >= weekStart
  ).length;

  const now = Date.now();
  let totalVolume = 0;
  let volume7d = 0;
  let rpeSum = 0;
  let rpeCount = 0;
  for (const r of setRows ?? []) {
    if (r.completed === false) continue;
    const load = Number(r.actual_load);
    const reps = Number(r.actual_reps);
    if (Number.isFinite(load) && load > 0 && Number.isFinite(reps) && reps > 0) {
      const vol = load * reps;
      totalVolume += vol;
      if (now - new Date(r.created_at).getTime() <= 7 * DAY_MS) volume7d += vol;
    }
    if (r.rpe != null) {
      const rpe = Number(r.rpe);
      if (Number.isFinite(rpe)) {
        rpeSum += rpe;
        rpeCount += 1;
      }
    }
  }

  const recentSessions = completed.slice(0, 8).map((s) => ({
    title: s.title || 'Workout',
    at: sessionAt(s),
    durationMin: Math.round((s.duration_seconds ?? 0) / 60),
  }));

  return NextResponse.json({
    ok: true,
    assignedWorkouts: (cwRows ?? []).map((w) => {
      const payload = (w as { payload?: { exercises?: unknown[] } }).payload ?? {};
      const exercises = Array.isArray(payload.exercises) ? payload.exercises : [];
      const moves = exercises
        .map((ex) => ex as { name?: unknown; reps?: unknown; sets?: unknown; load?: unknown; alternatives?: unknown })
        .filter((ex) => typeof ex.name === 'string' && ex.name)
        .map((ex) => ({
          name: String(ex.name),
          detail: String(ex.reps || ex.sets || '').trim() || (ex.load ? String(ex.load) : ''),
          alternatives: Array.isArray(ex.alternatives) ? ex.alternatives.map(String).filter(Boolean) : [],
        }));
      return {
        id: w.id,
        title: w.title,
        description: w.description ?? '',
        kind: w.kind,
        moves,
      };
    }),
    stats: {
      completedCount: completed.length,
      thisWeekCount,
      totalVolumeLb: Math.round(totalVolume),
      volume7dLb: Math.round(volume7d),
      avgRpe: rpeCount ? Math.round((rpeSum / rpeCount) * 10) / 10 : null,
      lastSessionAt: completed.length ? sessionAt(completed[0]) : null,
    },
    recentSessions,
  });
}
