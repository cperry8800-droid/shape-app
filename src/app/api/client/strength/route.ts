// Live data for the mobile Strength / e1RM progression page. Read-only over
// workout_set_logs. The in-app live-session writer (normalizeWorkoutSetLog) stores
// the athlete's actual load/reps/rpe inside the `payload` jsonb (actualLoad /
// actualReps / rpe) and does NOT populate the actual_load/actual_reps/rpe columns,
// so read both — prefer the columns, fall back to payload. RLS scopes every row to
// the signed-in user. Bearer (native) or cookie (/m/ web) via request-auth.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { buildLiftSeries, summarizeLift } from '@/lib/e1rm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Parse a load/reps value that may be a number or free text ("230", "230 lb", "8").
function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v == null) return NaN;
  return parseFloat(String(v));
}

export async function GET(request: Request) {
  // Auth runs OUTSIDE the fail-soft block below so an auth-helper failure can never
  // be masked as a 200 empty success (the endpoint's authentication contract).
  const supabase = await clientForRequest(request);
  const user = await currentUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const since = new Date(Date.now() - 180 * 86400000).toISOString();
    // Fetch the NEWEST rows in the window, then sort ascending for the series — a
    // plain `ascending` + limit would keep the OLDEST 5000 and drop the latest sets,
    // staling currentE1rm/status for high-volume clients.
    const { data: newestRows } = await supabase
      .from('workout_set_logs')
      .select('move_name, actual_load, actual_reps, rpe, load_unit, payload, completed, created_at')
      .eq('client_id', user.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000);

    const setRows = [...(newestRows ?? [])].sort((a, b) =>
      String((a as Record<string, unknown>).created_at ?? '').localeCompare(
        String((b as Record<string, unknown>).created_at ?? '')));

    const rows = setRows.map((r) => {
      const o = r as Record<string, unknown>;
      const p = (o.payload ?? {}) as Record<string, unknown>;
      // Prefer the column when it's a real positive value; a null OR zero column
      // means "not set" → fall back to the payload the app actually writes.
      const colLoad = Number(o.actual_load);
      const colReps = Number(o.actual_reps);
      return {
        key: String(o.move_name ?? '').trim().toLowerCase(),
        name: String(o.move_name ?? '').trim(),
        date: String(o.created_at ?? '').slice(0, 10),
        load: colLoad > 0 ? colLoad : num(p.actualLoad ?? p.load ?? p.actual_load),
        reps: colReps > 0 ? colReps : num(p.actualReps ?? p.reps ?? p.actual_reps),
        rpe: ((v) => (v == null ? null : Number(v)))(o.rpe ?? p.rpe ?? null),
        completed: o.completed as boolean | undefined,
      };
    });

    // load_unit per lift — most recent wins (rows are now ascending by date).
    const unitByLift = new Map<string, string>();
    for (const r of setRows) {
      const o = r as Record<string, unknown>;
      const k = String(o.move_name ?? '').trim().toLowerCase();
      if (k) {
        const p = (o.payload ?? {}) as Record<string, unknown>;
        unitByLift.set(k, String((o.load_unit as string) || (p.unit as string) || 'lb'));
      }
    }

    const now = Date.now();
    const lifts = buildLiftSeries(rows)
      .map((l) => ({ ...summarizeLift(l, { now }), unit: unitByLift.get(l.key) || 'lb' }))
      .filter((l) => l.series.length > 0)
      .sort((a, b) =>
        (b.series.length - a.series.length) ||
        b.series[b.series.length - 1].date.localeCompare(a.series[a.series.length - 1].date))
      .slice(0, 12);

    return NextResponse.json({ ok: true, lifts, generatedAt: new Date(now).toISOString() });
  } catch {
    // Fail soft on the DATA path only — never 500 the page; auth is already enforced above.
    return NextResponse.json({ ok: true, lifts: [], generatedAt: new Date().toISOString() });
  }
}
