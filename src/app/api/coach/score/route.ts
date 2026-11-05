// Coach score for the signed-in trainer or nutritionist.
//
// Derives the breakdown the Trainer / Nutritionist Score pages render:
//   - Active clients (distinct clients with an open plan on this provider: active, trialing or
//     retrying, as Business counts them)
//   - Session completion % (the past 90 days: completed over completed plus missed; see below)
//   - Programs published (the trainer's published programs in their library, coach_plans)
//
// Points are simple multipliers per metric. The page renders the breakdown it
// gets; tier is computed against the canonical 5-rung COACH ladder
// (Certified/Pro/Elite/Master/Icon at 0/750/2000/5000/15000) — the same ladder
// the mobile avatars, Me page, public profiles, and marketplace already display
// via bsCoachTier(). Keep these thresholds in sync with SHAPE_SCORE_TIERS_COACH.

import { NextResponse } from 'next/server';
import { clientForRequest, userLookupForRequest } from '@/lib/request-auth';
import { isMeasuredSignedOut } from '@/lib/auth-lookup';
import { readAllById, ROW_PAGE } from '@/lib/read-all-by-id';
import { OPEN_SUB_STATUSES } from '@/lib/coach-trajectory.mjs';

export const dynamic = 'force-dynamic';

// A confirmed session nobody marked complete counts as missed once this long after it was due.
const SCORE_MISSED_AFTER_MS = 24 * 3600 * 1000;

const TIERS: Array<[string, number]> = [
  ['Certified', 0],
  ['Pro', 750],
  ['Elite', 2000],
  ['Master', 5000],
  ['Icon', 15000],
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const role = (url.searchParams.get('role') || '').toLowerCase();
  if (role !== 'trainer' && role !== 'nutritionist') {
    return NextResponse.json({ error: 'role=trainer|nutritionist required.' }, { status: 400 });
  }
  // The website's cookie session, or the installed app's Bearer token: the app's coach Score page
  // reads this route too (2026-10-18). It was cookie-only, so the app's token got a 401 and the
  // page fell back to the member ledger.
  const supabase = await clientForRequest(req);
  const { user, error: authErr } = await userLookupForRequest(req);
  if (!user) {
    // ⚠ AN AUTH OUTAGE IS NOT A SIGNED-OUT VIEWER (src/lib/auth-lookup.ts). getUser() answers a dead
    // network or an auth-server 5xx with a null user too, and the website's Score page reads a 401
    // as "show the sample": a signed-in coach would be shown the sample's score as their own. A 503
    // is the unread state both Score pages have.
    if (!isMeasuredSignedOut(authErr)) {
      console.warn('[coach/score] the sign-in check failed — answering 503, not 401:', authErr?.message);
      return NextResponse.json({ error: 'Could not check your sign-in just now.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  // ⚠ A LIST READ, NEVER maybeSingle (Codex on #2400). owner_id is not unique, and a coach may own
  // two listings of one role (memberReads.mjs readCoachRoster). maybeSingle on two rows is an error
  // with no data, which answered 404, so that coach's Score page could never be read. A score is
  // one listing's: the one ?provider_id names when the caller owns it, otherwise their oldest. A
  // read that failed is 503, not "no listing".
  const providerTable = role === 'trainer' ? 'trainers' : 'nutritionists';
  const { data: listings, error: listErr } = await supabase
    .from(providerTable)
    .select('id')
    .eq('owner_id', user.id)
    .order('id', { ascending: true });
  if (listErr) {
    console.warn(`[coach/score] the ${providerTable} read failed — answering 503, not 404:`, listErr.message);
    return NextResponse.json({ error: 'Could not read your listing just now.' }, { status: 503 });
  }
  const owned = (listings ?? []) as Array<{ id: number }>;
  if (!owned.length) return NextResponse.json({ error: 'No provider profile found.' }, { status: 404 });
  const asked = Number(url.searchParams.get('provider_id'));
  const providerId = (owned.find((p) => p.id === asked) ?? owned[0]).id;

  const since90 = new Date(); since90.setUTCDate(since90.getUTCDate() - 90);
  const since90Iso = since90.toISOString();
  const nowIso = new Date().toISOString();
  const graceIso = new Date(Date.now() - SCORE_MISSED_AFTER_MS).toISOString();

  // COUNT in the database, never by fetching rows and measuring the array.
  // A plain `.select()` is capped by PostgREST's max-rows, so a coach past that
  // cap had activeClients / completion% computed from a TRUNCATED set — while
  // the marketplace's get_coach_scores counts every row. The two "canonical"
  // numbers could therefore disagree for exactly the busiest coaches, which
  // defeats the point of having one ladder on both surfaces.
  // ⚠ KEEP IN SYNC with supabase-migrations/2026-11-05-coach-score-past-sessions.sql (and, for the
  // clients term, 2026-10-18-coach-score-distinct-clients.sql before it).
  //
  // ⚠ CLIENTS, NOT PLANS, AND A CLIENT WHOSE PAYMENT IS RETRYING COUNTS (owner, 2026-10-18). The
  // first term is "50 a client", but this counted subscription rows, active and trialing only: a
  // client on two plans earned 100 (Codex on #2400), and a retrying client, who keeps their coach,
  // earned nothing. A head count cannot count distinct clients, so the open rows are walked a page
  // at a time (every row, as the count was) and counted by client; a row with no client stands alone.
  //
  // ⚠ COMPLETION IS OVER SESSIONS THAT HAVE HAPPENED (2026-11-05). The count was every session
  // scheduled from 90 days ago on, with no end and any status, so a coach's upcoming bookings, and
  // every cancelled or declined one, sat in the denominator and pulled completion down for nothing
  // the coach had failed to do. Now, over the 90 days up to now:
  //   completed: the sessions the coach marked complete;
  //   missed:    the confirmed sessions nobody marked complete a day after they were due (a day's
  //              grace, so a session that ended an hour ago is not missed before the coach can
  //              mark it). An unmarked past session counts as missed, as the client stats count it
  //              (get_client_stats: "a past booking nobody marked complete counts as missed").
  // Requested (never accepted), cancelled and declined sessions count neither way, and nor does
  // anything still ahead. Completion = completed / (completed + missed).
  //
  // ⚠ PROGRAMS PUBLISHED ARE PROGRAMS, PUBLISHED (2026-11-05). This counted client_workouts rows:
  // every assigned day for every client, archived ones too, so one 12-week program assigned to one
  // client was worth 36 programs. It counts the coach's library (coach_plans, the Programs page):
  // kind 'program', published, and not a single-day workout (detail.buildType 'workout'; a row from
  // before buildType was stored counts, as the library reads such a row as a program).
  const [activeRes, sessDoneRes, sessMissedRes, programsRes] = await Promise.all([
    readAllById<{ id: string; client_id: string | null }>((after) => {
      let q = supabase
        .from('subscriptions')
        .select('id, client_id')
        .eq('provider_id', providerId)
        .eq('provider_role', role)
        .in('status', OPEN_SUB_STATUSES);
      if (after) q = q.gt('id', after);
      // capped-read-ok: one page of a cursor walk over every row (readAllById), not a cap.
      return q.order('id', { ascending: true }).limit(ROW_PAGE);
    }),
    supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', providerId)
      .eq('provider_role', role)
      .eq('status', 'completed')
      .gte('scheduled_at', since90Iso)
      .lt('scheduled_at', nowIso),
    supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', providerId)
      .eq('provider_role', role)
      .eq('status', 'confirmed')
      .gte('scheduled_at', since90Iso)
      .lt('scheduled_at', graceIso),
    role === 'trainer'
      ? supabase
          .from('coach_plans')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', user.id)
          .eq('kind', 'program')
          .eq('published', true)
          .or('detail->>buildType.is.null,detail->>buildType.neq.workout')
      : Promise.resolve({ count: 0 } as { count: number }),
  ]);

  // A FAILED count is not a zero. Coercing one to 0 would publish a real-looking
  // score built on data we never read — the coach's own page would quietly show
  // a lower standing (or a wrong completion%) with nothing indicating why. Fail
  // the request instead; the caller already handles a non-200 as "unavailable".
  const failed = [activeRes, sessDoneRes, sessMissedRes, programsRes]
    .find((r) => (r as { error?: unknown }).error);
  if (failed) {
    console.error('[coach/score] count query failed', (failed as { error?: unknown }).error);
    return NextResponse.json({ error: 'Could not read your score right now.' }, { status: 500 });
  }

  const activeClients = new Set((activeRes.data ?? []).map((r) => (r.client_id != null ? 'c:' + r.client_id : 'sub:' + r.id))).size;

  const completed = (sessDoneRes as { count: number | null }).count || 0;
  const missed = (sessMissedRes as { count: number | null }).count || 0;
  const totalSessions = completed + missed;
  const completionPct = totalSessions ? Math.round((completed / totalSessions) * 100) : 0;

  const programsPublished = (programsRes as { count: number | null }).count || 0;

  // Point allocations. These are intentionally simple; tweak as the
  // scoring model matures.
  const ptsActive = activeClients * 50;
  const ptsCompletion = Math.round(completionPct * 10); // up to 1000
  const ptsPrograms = programsPublished * 80;

  const breakdown = [
    { label: 'Active clients',     points: ptsActive,     sub: `${activeClients} client${activeClients === 1 ? '' : 's'}` },
    { label: 'Session completion', points: ptsCompletion, sub: `${completionPct}% · last 90d` },
    ...(role === 'trainer'
      ? [{ label: 'Programs published', points: ptsPrograms, sub: `${programsPublished} live` }]
      : []),
  ];
  const total = breakdown.reduce((a, b) => a + b.points, 0);

  let currentIdx = 0;
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (total >= TIERS[i][1]) { currentIdx = i; break; }
  }
  const next = TIERS[currentIdx + 1] || null;

  return NextResponse.json({
    total,
    breakdown,
    current_tier: TIERS[currentIdx][0],
    next_tier: next ? next[0] : null,
    points_to_next: next ? next[1] - total : 0,
  });
}
