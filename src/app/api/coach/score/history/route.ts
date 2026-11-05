// The signed-in coach's own Shape Score, one reading a day, for the Score page's 30-day sparkline and
// its Score history (GET /api/coach/score/history?role=trainer|nutritionist[&provider_id=][&days=]).
//
// The readings are the nightly snapshots (coach_score_snapshots, written at 07:15 UTC by
// /api/cron/coach-score-snapshots; supabase-migrations/2026-10-15-leaderboards.sql). That table has
// RLS on and no policy, by design: no one reads it through the API. So this route checks who is
// asking and which listing is theirs with the caller's own session (the website's cookie or the
// app's Bearer token, as /api/coach/score does), and only then reads that one listing's days with the
// service role. It never takes a listing from the query that the caller does not own.
//
// `days` is how far back, 1 to 90 (30 by default), today included. A day with no reading (the cron
// had not run yet, or the listing is new) is absent, never a 0.
import { NextResponse } from 'next/server';
import { clientForRequest, userLookupForRequest } from '@/lib/request-auth';
import { isMeasuredSignedOut } from '@/lib/auth-lookup';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const SCORE_HISTORY_DAYS = 30;
const SCORE_HISTORY_MAX_DAYS = 90;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const role = (url.searchParams.get('role') || '').toLowerCase();
  if (role !== 'trainer' && role !== 'nutritionist') {
    return NextResponse.json({ error: 'role=trainer|nutritionist required.' }, { status: 400 });
  }
  const asked = Number(url.searchParams.get('days'));
  const days = Number.isInteger(asked) && asked > 0 ? Math.min(asked, SCORE_HISTORY_MAX_DAYS) : SCORE_HISTORY_DAYS;

  const supabase = await clientForRequest(req);
  const { user, error: authErr } = await userLookupForRequest(req);
  if (!user) {
    // An auth outage is not a signed-out viewer (src/lib/auth-lookup.ts): 503, the unread state.
    if (!isMeasuredSignedOut(authErr)) {
      console.warn('[coach/score/history] the sign-in check failed — answering 503, not 401:', authErr?.message);
      return NextResponse.json({ error: 'Could not check your sign-in just now.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  // The caller's listings of this role, as /api/coach/score reads them: a list (owner_id is not
  // unique), the one ?provider_id names when the caller owns it, otherwise their oldest.
  const providerTable = role === 'trainer' ? 'trainers' : 'nutritionists';
  const { data: listings, error: listErr } = await supabase
    .from(providerTable)
    .select('id')
    .eq('owner_id', user.id)
    .order('id', { ascending: true });
  if (listErr) {
    console.warn(`[coach/score/history] the ${providerTable} read failed — answering 503, not 404:`, listErr.message);
    return NextResponse.json({ error: 'Could not read your listing just now.' }, { status: 503 });
  }
  const owned = (listings ?? []) as Array<{ id: number }>;
  if (!owned.length) return NextResponse.json({ error: 'No provider profile found.' }, { status: 404 });
  const wanted = Number(url.searchParams.get('provider_id'));
  const providerId = (owned.find((p) => p.id === wanted) ?? owned[0]).id;

  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  let rows: Array<{ day: string; points: number }> = [];
  try {
    const { data, error } = await createAdminClient()
      .from('coach_score_snapshots')
      .select('day, points')
      .eq('provider_role', role)
      .eq('provider_id', providerId)
      .gte('day', since)
      .order('day', { ascending: true });
    if (error) throw new Error(error.message);
    rows = (data ?? []) as Array<{ day: string; points: number }>;
  } catch (e) {
    console.warn('[coach/score/history] the snapshots read failed — answering 503:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not read your score history just now.' }, { status: 503 });
  }

  const history = rows
    .filter((r) => r && typeof r.day === 'string' && Number.isFinite(Number(r.points)))
    .map((r) => ({ day: r.day, points: Number(r.points) }));
  return NextResponse.json({ role, providerId, days, since, history });
}
