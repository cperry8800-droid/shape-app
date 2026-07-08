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

type ExerciseRow = { name?: string; sets?: unknown; reps?: unknown; rest?: unknown; notes?: unknown; load?: unknown; tempo?: unknown; cue?: unknown; group?: unknown; seg?: unknown };

function mapExercises(payload: Record<string, unknown> | null): Array<{ name: string; sets: string; reps: string; rest: string; load: string; tempo: string; cue: string; group: string; seg: string }> {
  const list = Array.isArray(payload?.exercises) ? (payload!.exercises as ExerciseRow[]) : [];
  return list
    .filter((e) => e && (e.name != null))
    .map((e) => ({
      name: String(e.name ?? '').trim(),
      sets: e.sets != null ? String(e.sets) : '',
      reps: e.reps != null ? String(e.reps) : '',
      rest: e.rest != null ? String(e.rest) : '',
      load: e.load != null ? String(e.load) : (e.notes != null ? String(e.notes) : ''),
      // Builder fields — the trainer's tempo / verbatim cue / superset label
      // ride through untouched so the client card shows exactly what was typed.
      tempo: e.tempo != null ? String(e.tempo) : '',
      cue: e.cue != null ? String(e.cue) : '',
      group: e.group != null ? String(e.group) : '',
      // Self-authored segment row (a run/ride/swim leg or a Hyrox station) — the
      // free descriptor the deck renders in place of a load ("10 mi · Z2").
      seg: e.seg != null ? String(e.seg) : '',
    }));
}

// Self-program stamp ({ id, name, week, day, weeks, runId }) — the deck groups /
// labels a materialized block with it.
function mapProgram(payload: Record<string, unknown> | null): { id: string; name: string; week: number | null; day: number | null; weeks: number | null; runId: string } | null {
  const p = payload?.program;
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  return {
    id: String(o.id ?? ''),
    name: String(o.name ?? ''),
    week: Number(o.week) || null,
    day: o.day != null && Number.isFinite(Number(o.day)) ? Number(o.day) : null,
    weeks: Number(o.weeks) || null,
    runId: String(o.runId ?? ''),
  };
}

// Weekly-repeat weekdays (0=Mon..6=Sun) for a self session that recurs each week.
function mapRepeatDow(payload: Record<string, unknown> | null): number[] | null {
  const r = payload?.repeatDow;
  if (!Array.isArray(r)) return null;
  const dows = r.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return dows.length ? dows : null;
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);
  const weekStart = weekStartISO();

  // ── Training: assigned + self-authored workouts. ──
  // WINDOW the dated rows to this-week-forward OR undated (weekly-repeat + not-
  // yet-scheduled), and sort NULLS FIRST so the undated repeat rows always
  // survive the 60-row cap. A 26-week program has up to 182 future dated rows;
  // with nulls first + ascending dates, the order is [repeats, this-week,
  // early-future…], so the current week + repeats are never crowded out by a
  // long block's later weeks. (this-week-forward, not this-week-only, so a coach
  // plan that starts next week still reads as hasPlan — no false Build door.)
  const { data: cwRows } = await supabase
    .from('client_workouts')
    .select('id, title, description, kind, payload, scheduled_date, created_at, trainer_id')
    .eq('client_id', user.id)
    .eq('status', 'published')
    .or(`scheduled_date.gte.${weekStart},scheduled_date.is.null`)
    .order('scheduled_date', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
    .limit(60);

  const workouts = (cwRows ?? []).map((w) => {
    const payload = (w.payload && typeof w.payload === 'object') ? (w.payload as Record<string, unknown>) : null;
    const durationRaw = payload?.duration;
    const durMatch = durationRaw != null ? String(durationRaw).match(/\d+/) : null;
    const timeRaw = payload?.time != null ? String(payload.time) : '';
    return {
      id: w.id,
      title: w.title,
      description: w.description ?? '',
      kind: w.kind,
      // Self-authored (member-built) when there's no coach behind the row.
      selfAuthored: w.trainer_id === null,
      program: mapProgram(payload),
      repeatDow: mapRepeatDow(payload),
      scheduledDate: w.scheduled_date ?? null,
      time: /^\d{1,2}:\d{2}$/.test(timeRaw) ? timeRaw : null,
      durationMin: durMatch ? Number(durMatch[0]) : null,
      playlist: payload?.playlist && typeof payload.playlist === 'object'
        ? { name: String((payload.playlist as Record<string, unknown>).name ?? ''), meta: String((payload.playlist as Record<string, unknown>).meta ?? '') }
        : null,
      // Builder snapshot stamp ({id, name, version, week, day}) — the client
      // Workouts tab groups the program into weeks with it.
      template: payload?.template && typeof payload.template === 'object'
        ? {
            id: String((payload.template as Record<string, unknown>).id ?? ''),
            name: String((payload.template as Record<string, unknown>).name ?? ''),
            version: Number((payload.template as Record<string, unknown>).version) || null,
            week: Number((payload.template as Record<string, unknown>).week) || null,
            day: Number((payload.template as Record<string, unknown>).day) || null,
          }
        : null,
      exercises: mapExercises(payload),
    };
  });

  // ── Meals: the most recent published weekly menu. ──
  const { data: mpRows } = await supabase
    .from('client_meal_plans')
    .select('id, title, week_start, payload, created_at, nutritionist_id')
    .eq('client_id', user.id)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1);

  const mp = (mpRows ?? [])[0] ?? null;
  const mealDays = mp && mp.payload && Array.isArray((mp.payload as Record<string, unknown>).days)
    ? (mp.payload as Record<string, unknown>).days
    : [];

  // ── Coach attribution: resolve the assigning provider names (public-read
  // marketplace rows) so the client UI credits the real coach, not the demo. ──
  const trainerId = (cwRows ?? []).find((w) => w.trainer_id != null)?.trainer_id ?? null;
  const [trName, nuName] = await Promise.all([
    trainerId != null
      ? supabase.from('trainers').select('name').eq('id', trainerId).maybeSingle().then((r) => r.data?.name ?? null)
      : Promise.resolve(null),
    mp?.nutritionist_id != null
      ? supabase.from('nutritionists').select('name').eq('id', mp.nutritionist_id).maybeSingle().then((r) => r.data?.name ?? null)
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    ok: true,
    weekStart,
    training: {
      hasPlan: workouts.length > 0,
      coach: trName,
      workouts,
    },
    meals: {
      hasPlan: Array.isArray(mealDays) && mealDays.length > 0,
      title: mp?.title ?? null,
      coach: nuName,
      weekStart: mp?.week_start ?? null,
      days: mealDays,
    },
  });
}
