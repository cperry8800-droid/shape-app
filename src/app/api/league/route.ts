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
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIERS = ['ember', 'ignite', 'flame', 'blaze', 'inferno'];
const COHORT_SIZE = 24;

async function clientForRequest(request: Request): Promise<SupabaseClient> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearer) {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      { global: { headers: { Authorization: `Bearer ${bearer[1]}` } }, auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return createClient() as Promise<SupabaseClient>;
}
async function currentUser(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearer) {
    const c = await clientForRequest(request);
    const { data } = await c.auth.getUser(bearer[1]);
    return data.user ?? null;
  }
  const c = await createClient();
  const { data } = await c.auth.getUser();
  return data.user ?? null;
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
      cohort = await assignCohort(admin, week, tier);
      await admin.from('league_members')
        .update({ tier, cohort, season_week: week, settled_week: seededWeek })
        .eq('user_id', user.id);
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
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
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
    const admin = createAdminClient();
    const cohort = await assignCohort(admin, week, 'ember');
    const { error } = await supabase.from('league_members').upsert({
      user_id: user.id, tier: 'ember', cohort, season_week: week, settled_week: null,
    }, { onConflict: 'user_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, joined: true, tier: 'ember', cohort, week });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
