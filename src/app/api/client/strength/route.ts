// Live data for the mobile Strength / e1RM progression page. Read-only over
// workout_set_logs (actual_load/actual_reps/rpe/load_unit are real numeric
// columns added by 2026-05-08-coach-program-tools.sql). RLS scopes every row to
// the signed-in user; a new account comes back empty. Bearer (native) or cookie
// (/m/ web) via request-auth, mirroring /api/client/progress.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { buildLiftSeries, summarizeLift } from '@/lib/e1rm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabase = await clientForRequest(request);
    const user = await currentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const since = new Date(Date.now() - 180 * 86400000).toISOString();
    const { data: setRows } = await supabase
      .from('workout_set_logs')
      .select('move_name, actual_load, actual_reps, rpe, load_unit, completed, created_at')
      .eq('client_id', user.id)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(5000);

    const rows = (setRows ?? []).map((r) => ({
      key: String((r as Record<string, unknown>).move_name ?? '').trim().toLowerCase(),
      name: String((r as Record<string, unknown>).move_name ?? '').trim(),
      date: String((r as Record<string, unknown>).created_at ?? '').slice(0, 10),
      load: Number((r as Record<string, unknown>).actual_load),
      reps: Number((r as Record<string, unknown>).actual_reps),
      rpe: (r as Record<string, unknown>).rpe == null ? null : Number((r as Record<string, unknown>).rpe),
      completed: (r as Record<string, unknown>).completed as boolean | undefined,
    }));

    // load_unit per lift — most recent wins (rows are ascending by date).
    const unitByLift = new Map<string, string>();
    for (const r of setRows ?? []) {
      const k = String((r as Record<string, unknown>).move_name ?? '').trim().toLowerCase();
      if (k) unitByLift.set(k, String((r as Record<string, unknown>).load_unit || 'lb'));
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
    // Fail soft — never 500 the page; the client shows the honest empty state.
    return NextResponse.json({ ok: true, lifts: [], generatedAt: new Date().toISOString() });
  }
}
