// Coach score for the signed-in trainer or nutritionist.
//
// Derives the breakdown the Trainer / Nutritionist Score pages render:
//   - Active clients (active+trialing subscriptions on this provider)
//   - Session completion % (last 90 days of sessions)
//   - Client PRs attributed (count of community_posts with activity_type='pr'
//     authored by this provider's subscribed clients in the last 90 days)
//   - Programs published (client_workouts owned by this provider)
//
// Points are simple multipliers per metric. The page renders the breakdown it
// gets; tier is computed against the canonical 5-rung COACH ladder
// (Certified/Pro/Elite/Master/Icon at 0/750/2000/5000/15000) — the same ladder
// the mobile avatars, Me page, public profiles, and marketplace already display
// via bsCoachTier(). Keep these thresholds in sync with SHAPE_SCORE_TIERS_COACH.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const providerTable = role === 'trainer' ? 'trainers' : 'nutritionists';
  const { data: provider } = await supabase
    .from(providerTable)
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!provider) return NextResponse.json({ error: 'No provider profile found.' }, { status: 404 });
  const providerId = provider.id;

  const since90 = new Date(); since90.setUTCDate(since90.getUTCDate() - 90);
  const since90Iso = since90.toISOString();

  // COUNT in the database, never by fetching rows and measuring the array.
  // A plain `.select()` is capped by PostgREST's max-rows, so a coach past that
  // cap had activeClients / completion% computed from a TRUNCATED set — while
  // the marketplace's get_coach_scores counts every row. The two "canonical"
  // numbers could therefore disagree for exactly the busiest coaches, which
  // defeats the point of having one ladder on both surfaces.
  // ⚠ KEEP IN SYNC with supabase-migrations/2026-07-25-coach-scores-batch.sql.
  const [activeRes, sessTotalRes, sessDoneRes, workoutsRes] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', providerId)
      .eq('provider_role', role)
      .in('status', ['active', 'trialing']),
    supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', providerId)
      .eq('provider_role', role)
      .gte('scheduled_at', since90Iso),
    supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', providerId)
      .eq('provider_role', role)
      .gte('scheduled_at', since90Iso)
      .eq('status', 'completed'),
    role === 'trainer'
      ? supabase
          .from('client_workouts')
          .select('id', { count: 'exact', head: true })
          .eq('trainer_id', providerId)
      : Promise.resolve({ count: 0 } as { count: number }),
  ]);

  const activeClients = (activeRes as { count: number | null }).count || 0;

  const totalSessions = (sessTotalRes as { count: number | null }).count || 0;
  const completed = (sessDoneRes as { count: number | null }).count || 0;
  const completionPct = totalSessions ? Math.round((completed / totalSessions) * 100) : 0;

  const programsPublished = (workoutsRes as { count: number | null }).count || 0;

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
