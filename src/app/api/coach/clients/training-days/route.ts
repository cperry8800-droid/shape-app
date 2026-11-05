// Each client's own training days, for the meal-plan Assign (P6, 2026-11-05): "Assign follows each
// client's own training days (from their program or sessions) instead of a Mon/Wed/Fri default, with
// a coach override." The days are read, never guessed: their scheduled workouts around today, else
// the week on their program (src/lib/training-days.mjs). A client with neither comes back null, and
// the Assign keeps the coach's own ticks and says so.
//
// GET /api/coach/clients/training-days?ids=<uuid>,<uuid>&today=YYYY-MM-DD
//   → { days: { [clientId]: { dows: [0, 2, 4], source: 'sessions' | 'program' } | null } }
//
// ⚠ EVERY READ IS THE COACH'S OWN SESSION, so each is gated as it always is: client_programs is
// coach-readable by RLS (is_coach_on_client), and get_shared_client_workouts is a definer that answers
// only a coach on the client (2026-10-29-shared-schedules-any-coach.sql). An id this coach does not
// coach reads nothing and comes back null. At most 50 ids a call.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { trainingDowsFor } from '@/lib/training-days.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 50;

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const url = new URL(request.url);
  const ids = [...new Set(String(url.searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter((s) => UUID.test(s)))].slice(0, MAX_IDS);
  if (!ids.length) return NextResponse.json({ days: {} });
  // The coach's own calendar day, so "around today" is theirs and not UTC's; a real day or none.
  const asked = url.searchParams.get('today') || '';
  const parsed = new Date(asked + 'T00:00:00Z');
  const today = /^\d{4}-\d{2}-\d{2}$/.test(asked) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === asked
    ? asked : new Date().toISOString().slice(0, 10);
  const db = await clientForRequest(request);

  const { data: programs } = await db.from('client_programs').select('user_id, detail').in('user_id', ids);
  const programOf = new Map<string, unknown>();
  for (const row of Array.isArray(programs) ? programs : []) {
    const r = row as { user_id?: unknown; detail?: unknown };
    if (typeof r.user_id === 'string') programOf.set(r.user_id, r.detail ?? null);
  }
  const entries = await Promise.all(ids.map(async (id) => {
    let dates: string[] = [];
    try {
      const { data, error } = await db.rpc('get_shared_client_workouts', { p_client_id: id });
      if (!error && Array.isArray(data)) dates = data.map((w: { scheduled_date?: unknown }) => String(w?.scheduled_date ?? '')).filter(Boolean);
    } catch { /* before the migration, or not their coach: no sessions to read */ }
    return [id, trainingDowsFor({ programDetail: programOf.get(id) ?? null, sessionDates: dates, today })] as const;
  }));
  return NextResponse.json({ days: Object.fromEntries(entries) });
}
