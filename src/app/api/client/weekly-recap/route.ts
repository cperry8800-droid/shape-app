// The weekly recap: a member's own week in figures, for a card they can share (owner, 2026-11-10:
// "Keep a shareable weekly recap free, and charge for the AI readout"). FREE: any signed-in adult
// account (requireAccount); the AI weekly readout (/api/ai/weekly-readout) stays the membership's.
//
// GET ?week=last|current   (default last: the Monday-to-Sunday week before this one, in the
//                           account's own zone)
//   → 200 { weekStart, weekEnd, workouts, activeMinutes, mealDays, daysActive, points, streak }
//   → 401 signed out · 403 a known minor · 503 a read failed (never a recap of nothing)
//
// The figures are src/lib/weekly-recap.mjs's: completed workouts, the minutes of those that carried
// a start and an end (null when none did), the days a meal was logged (a meal log scores once a
// day, so that is the honest count), the days with either, the Score points earned, and the
// workout streak. Private: never cached.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { requireAccount } from '@/lib/require-membership';
import { readAccountZone } from '@/lib/account-timezone';
import { buildRecap, recapWeek, RECAP_HISTORY_DAYS, DAY_MS } from '../../../../lib/weekly-recap.mjs';
import { readAllById, ROW_PAGE } from '@/lib/read-all-by-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE = { 'Cache-Control': 'private, no-store, max-age=0' };
const unavailable = () => NextResponse.json({ error: "Couldn't read your week just now." }, { status: 503, headers: PRIVATE });

export async function GET(request: Request) {
  const denied = await requireAccount(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: PRIVATE });
  const supabase = await clientForRequest(request);
  const now = Date.now();
  const which = new URL(request.url).searchParams.get('week') === 'current' ? 'current' : 'last';

  const zoneRead = await readAccountZone(supabase, user.id);
  // ⚠ A ZONE THAT COULD NOT BE READ IS NOT "NO ZONE" (Codex P2 on #2675): read as UTC, a member
  // east or west of it would be handed a shareable recap of the wrong Monday-to-Sunday.
  if (zoneRead.error) return unavailable();
  const zone = zoneRead.zone;
  const week = recapWeek({ now, zone, which });
  const [sessions, ledger] = await Promise.all([
    // Every page: one read stops at the API's 1,000 rows, which a long streak with two sessions a
    // day passes (readAllById: keyset on id, and a read past its ceiling is unknown, not short).
    // capped-read-ok: one page of a cursor walk over every row (readAllById), not a cap.
    readAllById<{ id: unknown; status: string; started_at: string | null; ended_at: string | null; created_at: string }>((after) => {
      const q = supabase.from('workout_sessions')
        .select('id, status, started_at, ended_at, created_at')
        .eq('client_id', user.id)
        .in('status', ['completed', 'reviewed'])
        .gte('created_at', new Date(Math.min(week.startMs, now - RECAP_HISTORY_DAYS * DAY_MS)).toISOString());
      return (after ? q.gt('id', after) : q).order('id', { ascending: true }).limit(ROW_PAGE);
    }),
    // ⚠ The week's points, every page too (Codex P2 on #2675): one capped read stopped at the
    // API's 1,000 rows without saying so, and the recap published the points and meal days of
    // the rows it happened to get.
    // capped-read-ok: one page of a cursor walk over every row (readAllById), not a cap.
    readAllById<{ id: unknown; delta: number; earned_at: string; source_kind: string | null }>((after) => {
      const q = supabase.from('score_ledger')
        .select('id, delta, earned_at, source_kind')
        .eq('user_id', user.id)
        .gte('earned_at', new Date(week.startMs).toISOString())
        .lt('earned_at', new Date(week.endMs).toISOString());
      return (after ? q.gt('id', after) : q).order('id', { ascending: true }).limit(ROW_PAGE);
    }),
  ]);
  if (sessions.error || ledger.error) return unavailable();
  const recap = buildRecap({ sessions: sessions.data ?? [], ledger: ledger.data ?? [], week, zone, now });
  return NextResponse.json({ weekStart: week.weekStart, weekEnd: week.weekEnd, ...recap }, { headers: PRIVATE });
}
