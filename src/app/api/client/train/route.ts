// Live data for the newdesign Client "Train" page.
// Read-only over client_workouts (assigned workouts), workout_sessions
// (completed history) and workout_set_logs (training volume / RPE). RLS
// scopes every row to the signed-in user. The per-exercise plan and the
// Mon-Sun schedule are intentionally absent — assigned workouts store
// exercises as freeform JSONB and carry no scheduled dates.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DAY_MS, startOfWeek } from '@/lib/time';
import { requireMembership } from '@/lib/require-membership';

export const dynamic = 'force-dynamic';

type SessionRow = {
  title: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  duration_seconds: number | null;
};

const sessionAt = (s: SessionRow) => s.started_at || s.ended_at || s.created_at;

// Parse a set-log value that may live in a column (number) or the payload jsonb
// (free text like "230 lb"). The live-session writer now fills the columns, but
// historical rows only have the payload, so fall back to it for older volume.
function pnum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  return parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
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
    .select('actual_load, actual_reps, rpe, completed, created_at, payload')
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
    // Prefer the column when it's a real positive value; null/0 → fall back to the
    // payload the app historically wrote (so older sets still count toward volume).
    const p = ((r as Record<string, unknown>).payload ?? {}) as Record<string, unknown>;
    const colLoad = Number(r.actual_load);
    const colReps = Number(r.actual_reps);
    const load = colLoad > 0 ? colLoad : pnum(p.actualLoad ?? p.load);
    const reps = colReps > 0 ? colReps : pnum(p.actualReps ?? p.reps);
    if (Number.isFinite(load) && load > 0 && Number.isFinite(reps) && reps > 0) {
      const vol = load * reps;
      totalVolume += vol;
      if (now - new Date(r.created_at).getTime() <= 7 * DAY_MS) volume7d += vol;
    }
    const rpeVal = r.rpe != null ? Number(r.rpe) : pnum(p.rpe);
    if (Number.isFinite(rpeVal)) {
      rpeSum += rpeVal;
      rpeCount += 1;
    }
  }

  // Recent sessions, with logged-vs-prescribed set detail (Workouts tab).
  // workout_set_logs stores the prescription (target_reps/target_load) next
  // to what was actually lifted, so the comparison is real per move.
  const recentIds = completed.slice(0, 8).map((s) => (s as SessionRow & { id?: string }).id).filter(Boolean) as string[];
  const { data: recentSetRows } = recentIds.length
    ? await supabase
        .from('workout_set_logs')
        .select('session_id, move_index, move_name, set_number, target_reps, target_load, actual_reps, actual_load, completed')
        .in('session_id', recentIds)
        .order('move_index', { ascending: true })
        .order('set_number', { ascending: true })
    : { data: [] as Array<Record<string, unknown>> };
  type MoveAgg = { name: string; idx: number; setsLogged: number; setsPrescribed: number; target: string | null; best: string | null; bestLoad: number };
  const movesBySession = new Map<string, Map<string, MoveAgg>>();
  for (const r of recentSetRows ?? []) {
    const sid = String(r.session_id);
    if (!movesBySession.has(sid)) movesBySession.set(sid, new Map());
    const byMove = movesBySession.get(sid)!;
    const key = String(r.move_name);
    if (!byMove.has(key)) {
      byMove.set(key, {
        name: key,
        idx: Number(r.move_index) || 0,
        setsLogged: 0,
        setsPrescribed: 0,
        target: [r.target_reps, r.target_load].filter(Boolean).join(' @ ') || null,
        best: null,
        bestLoad: 0,
      });
    }
    const agg = byMove.get(key)!;
    agg.setsPrescribed += 1;
    if (r.completed !== false && (r.actual_reps != null || r.actual_load != null)) {
      agg.setsLogged += 1;
      const load = Number(r.actual_load);
      if (Number.isFinite(load) && load >= agg.bestLoad) {
        agg.bestLoad = load;
        agg.best = [r.actual_load, r.actual_reps != null ? '× ' + r.actual_reps : null].filter(Boolean).join(' ');
      }
    }
  }

  const recentSessions = completed.slice(0, 8).map((s) => {
    const sid = String((s as SessionRow & { id?: string }).id ?? '');
    const byMove = movesBySession.get(sid);
    return {
      title: s.title || 'Workout',
      at: sessionAt(s),
      durationMin: Math.round((s.duration_seconds ?? 0) / 60),
      moves: byMove
        ? [...byMove.values()].sort((a, b) => a.idx - b.idx).map(({ name, setsLogged, setsPrescribed, target, best }) => ({ name, setsLogged, setsPrescribed, target, best }))
        : [],
    };
  });

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
