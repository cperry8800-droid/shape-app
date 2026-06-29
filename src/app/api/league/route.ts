// Shape League — weekly behavioral leagues with cohorts + promotion/relegation.
//
// GET  -> { joined, tier, cohort, week, standings:[{userId,name,avatarUrl,score,rank,isMe}],
//          promotedFrom?, relegatedFrom? }  (settles the prior week lazily on read)
// POST { action: 'join' | 'leave' }
//
// The "season" is the ISO week. On read, if the member's seeded week is stale,
// we settle their PRIOR cohort (top 5 promote, bottom 5 relegate), then reseed
// them into a fresh cohort for the current week. No cron — it happens whenever
// a member opens the league in a new week.
//
// Auth: cookie session OR Bearer token (mobile bridges either). Cross-user
// seeding/settling uses the service role (members opt in; only ranks move).

import { NextResponse } from 'next/server';
import { type SupabaseClient } from '@supabase/supabase-js';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { readJson, dbError } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIERS = ['ember', 'ignite', 'flame', 'blaze', 'inferno'];
const COHORT_SIZE = 24;

// 'PGRST202'/'42883' => the atomic league_assign_cohort migration isn't applied yet;
// fall back to the (racy) read-then-write assignCohort path.
function isMissingFunction(err: { code?: string } | null | undefined): boolean {
  return err?.code === 'PGRST202' || err?.code === '42883';
}

// Atomic claim: assign the member to the first open cohort for (week,tier) under a
// per-(week,tier) advisory lock + write in one transaction. Returns the cohort, or null
// if the RPC is absent (caller falls back to the legacy assignCohort path).
async function claimCohort(
  client: SupabaseClient, userId: string, week: string, tier: string, settledWeek: string | null,
): Promise<number | null> {
  const { data, error } = await client.rpc('league_assign_cohort', {
    p_user_id: userId, p_week: week, p_tier: tier, p_settled_week: settledWeek,
  });
  if (error) {
    if (isMissingFunction(error)) return null;
    throw error;
  }
  return Number(data) || 0;
}

// ISO-week key 'IYYY-IW' for a date (matches Postgres to_char(...,'IYYY-IW')).
function isoWeekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}
function tierUp(t: string) { return TIERS[Math.min(TIERS.length - 1, TIERS.indexOf(t) + 1)]; }
function tierDown(t: string) { return TIERS[Math.max(0, TIERS.indexOf(t) - 1)]; }

// Pick the cohort with room for a (week,tier); else open the next one.
async function assignCohort(admin: SupabaseClient, week: string, tier: string): Promise<number> {
  const { data } = await admin
    .from('league_members')
    .select('cohort')
    .eq('season_week', week)
    .eq('tier', tier);
  const counts = new Map<number, number>();
  for (const r of (data ?? []) as { cohort: number }[]) counts.set(r.cohort, (counts.get(r.cohort) || 0) + 1);
  let c = 0;
  while ((counts.get(c) || 0) >= COHORT_SIZE) c += 1;
  return c;
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);
  const week = isoWeekKey();

  // Membership (RLS: own row).
  const { data: meRow } = await supabase
    .from('league_members')
    .select('user_id, tier, cohort, season_week, settled_week')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!meRow) return NextResponse.json({ joined: false, week });

  let { tier, cohort, season_week: seededWeek } = meRow as { tier: string; cohort: number; season_week: string; settled_week: string | null };
  let promotedFrom: string | null = null;
  let relegatedFrom: string | null = null;

  // Lazy settle: the member is seeded for an older week → resolve their prior
  // cohort, move tier by placement, reseed for this week. Service role so we
  // can read the prior cohort's standings and reseed.
  if (seededWeek !== week) {
    const admin = createAdminClient();
    try {
      const { data: standings } = await admin.rpc('league_standings', { p_week: seededWeek, p_tier: tier, p_cohort: cohort });
      const rows = (standings ?? []) as { user_id: string; rank: number }[];
      const n = rows.length;
      const mine = rows.find(r => r.user_id === user.id);
      const prevTier = tier;
      if (mine && n >= 10) {
        if (mine.rank <= 5) { tier = tierUp(prevTier); if (tier !== prevTier) promotedFrom = prevTier; }
        else if (mine.rank > n - 5) { tier = tierDown(prevTier); if (tier !== prevTier) relegatedFrom = prevTier; }
      }
      // Atomic reseed (assign cohort + write the new tier/week in one tx). Falls back
      // to the legacy assign-then-update if the migration isn't applied yet.
      const claimed = await claimCohort(admin, user.id, week, tier, seededWeek);
      if (claimed != null) {
        cohort = claimed;
      } else {
        cohort = await assignCohort(admin, week, tier);
        await admin.from('league_members')
          .update({ tier, cohort, season_week: week, settled_week: seededWeek })
          .eq('user_id', user.id);
      }
      seededWeek = week;
    } catch {
      /* if settle fails, fall through with stale seed; next read retries */
    }
  }

  const { data: standings } = await supabase.rpc('league_standings', { p_week: week, p_tier: tier, p_cohort: cohort });
  const entries = ((standings ?? []) as { user_id: string; full_name: string; avatar_url: string | null; score: number; rank: number }[])
    .map(r => ({ userId: r.user_id, name: r.full_name, avatarUrl: r.avatar_url, score: Number(r.score), rank: Number(r.rank), isMe: r.user_id === user.id }));

  return NextResponse.json({ joined: true, tier, cohort, week, standings: entries, promotedFrom, relegatedFrom });
}

export async function POST(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const action = String(body.action ?? '');
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  if (action === 'leave') {
    await supabase.from('league_members').delete().eq('user_id', user.id);
    return NextResponse.json({ ok: true, joined: false });
  }
  if (action === 'join') {
    const week = isoWeekKey();
    // Atomic claim under the per-(week,tier) advisory lock, so concurrent joins at a
    // week boundary can't all pile into cohort 0. Falls back to the legacy path until
    // the migration is applied. The RPC is service-role-only (the tier is server-set,
    // never client-chosen), so it runs through the admin client; this route already
    // auth-gated the member via currentUser above.
    const admin = createAdminClient();
    const claimed = await claimCohort(admin, user.id, week, 'ember', null);
    if (claimed != null) {
      return NextResponse.json({ ok: true, joined: true, tier: 'ember', cohort: claimed, week });
    }
    const cohort = await assignCohort(admin, week, 'ember');
    const { error } = await supabase.from('league_members').upsert({
      user_id: user.id, tier: 'ember', cohort, season_week: week, settled_week: null,
    }, { onConflict: 'user_id' });
    if (error) return dbError(error, 'league join', 500);
    return NextResponse.json({ ok: true, joined: true, tier: 'ember', cohort, week });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
