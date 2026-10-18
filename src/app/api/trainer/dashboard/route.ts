// Live data for the newdesign Trainer dashboard.
// Read-only aggregate over existing tables (profiles, trainers, sessions,
// subscriptions) — no new schema. RLS scopes every query to the signed-in
// trainer. Revenue / payout KPIs are not computed here (Stripe-dependent).

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DAY_MS, startOfWeek } from '@/lib/time';
import { coachGrowthAndFunnel } from '@/lib/coach-growth';
import { coachCutCents, bpsToRate } from '@/lib/platform-fee';
import { OPEN_SUB_STATUSES, practiceToday } from '@/lib/coach-trajectory.mjs';
import { readAllById, ROW_PAGE } from '@/lib/read-all-by-id';

export const dynamic = 'force-dynamic';

// How many session rows this route reads. Named so the cap can be REPORTED rather than
// implied: a count taken over a capped window is a floor, not a total.
const SESSION_CAP = 500;

type SessionRow = {
  scheduled_at: string;
  duration_min: number;
  type: string;
  status: string;
  topic: string | null;
  client_name: string | null;
  client_id: string | null;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  const fullName = (profile?.full_name ?? '').trim();
  const firstName = fullName
    ? fullName.split(/\s+/)[0]
    : (user.email ?? '').split('@')[0] || 'there';

  const { data: trainerRow } = await supabase
    .from('trainers')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  const providerId: number | null = trainerRow?.id ?? null;

  // Today's clients and net a month: null when the subscriptions could not be read (below), which
  // every reader says rather than printing 0 clients and $0.
  let activeClients: number | null = 0;
  let monthlyNetCents: number | null = 0;
  let sessionsThisWeek = 0;
  let upcomingSessions = 0;
  let totalSessions = 0;
  // ⚠ A CAPPED COUNT IS NOT A TOTAL. The count above is taken over a capped window, so
  // it is a FLOOR — a consumer that labels it "all time" has to know that, and a payload
  // that does not say so cannot be checked. One key name across both roles, because the
  // consumer reading it is one strip that serves both.
  let totalCapped = false;
  let today: Array<Record<string, unknown>> = [];
  let calendar: Array<Record<string, unknown>> = [];
  let pulse: Array<Record<string, unknown>> = [];

  if (providerId != null) {
    // Today's clients + monthly recurring revenue.
    // ⚠ BY THE BUSINESS PAGE'S RULE, SO TODAY AND BUSINESS SAY ONE NUMBER (the sweep after #2394
    // round 10). This read took active and trialing rows and counted rows: a client whose payment
    // is retrying (past_due, still a member, membership-core.ts ACTIVE_SUB) was left out, and a
    // client on two plans counted twice, so Today said "Monthly · net $1,700" beside the Business
    // page it links to, which says $1,827. Every open status is read, and practiceToday counts them
    // as the trajectory's latest week does: people, and the net from each row's STORED fee_bps (BYO
    // subs pay 0%), never a hardcoded 85%. Every reader of these kpis (Today's Business card and
    // sidebar, the KPI picker, the other pages' sidebars) prints them as clients and net a month.
    // ⚠ EVERY ROW, A PAGE AT A TIME, AND A FAILED READ IS NULL, NOT 0 (the dashboards after #2395).
    // This was one select, which stops at 1,000 rows with no error, and its error was dropped
    // (`subRows ?? []`), so a failed read sent 0 clients and $0 net, which every reader printed as a
    // measurement. It walks the rows as the analytics routes do (readAllById); a failed read, or one
    // past the walk's ceiling, sends both figures as null, and the readers say they couldn't be read.
    const { data: subRows, error: subErr } = await readAllById<{ id: string }>((after) => {
      let q = supabase
        .from('subscriptions')
        .select('*') // '*' is migration-safe: an explicit fee_bps errors the query on a pre-migration DB
        .eq('provider_role', 'trainer')
        .eq('provider_id', providerId)
        .in('status', OPEN_SUB_STATUSES);
      if (after) q = q.gt('id', after);
      // capped-read-ok: one page of a cursor walk over every row (readAllById), not a cap.
      return q.order('id', { ascending: true }).limit(ROW_PAGE);
    });
    if (subErr) {
      console.warn('[shape-app] trainer dashboard: subscriptions read failed — clients and monthly net render "couldn\'t be read":', subErr.message);
    }
    const practice = subErr ? null : practiceToday(subRows ?? [], {
      cutCents: (priceCents: number, feeBps: number | null) => coachCutCents(priceCents, bpsToRate(feeBps ?? 1500)),
    });
    activeClients = practice ? practice.clients : null;
    monthlyNetCents = practice ? practice.mrrNetCents : null;

    const { data: sessions } = await supabase
      .from('sessions')
      .select('scheduled_at, duration_min, type, status, topic, client_name, client_id')
      .eq('provider_role', 'trainer')
      .eq('provider_id', providerId)
      .order('scheduled_at', { ascending: false })
      .limit(SESSION_CAP);

    // ⚠ NEWEST FIRST, RE-SORTED ASCENDING ONCE BELOW. This read is capped, and ordering it
    // ascending made the cap keep a coach's OLDEST sessions — so past SESSION_CAP "this
    // week" and "upcoming" both read 0 forever, the calendar showed rows from years ago,
    // and the client pulse listed people who had long since left. Every consumer wants the
    // window nearest now; only the ORDER they read it in is ascending, so the re-sort is
    // here rather than in each of them (and `calendar` is returned unsorted unless the
    // shared-coach branch runs, so leaving it reversed would have shown it backwards).
    const rows = ((sessions ?? []) as SessionRow[])
      .slice()
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    totalSessions = rows.length;
    totalCapped = rows.length >= SESSION_CAP;

    const now = Date.now();
    const weekStart = startOfWeek(new Date());
    const weekEnd = weekStart + 7 * DAY_MS;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    const todayEndMs = todayStartMs + DAY_MS;

    for (const r of rows) {
      const t = new Date(r.scheduled_at).getTime();
      if (t >= weekStart && t < weekEnd) sessionsThisWeek += 1;
      if (t >= now && (r.status === 'requested' || r.status === 'confirmed')) upcomingSessions += 1;
    }

    today = rows
      .filter((r) => {
        const t = new Date(r.scheduled_at).getTime();
        return t >= todayStartMs && t < todayEndMs;
      })
      .map((r) => ({
        scheduledAt: r.scheduled_at,
        durationMin: r.duration_min,
        type: r.type,
        status: r.status,
        topic: r.topic,
        clientName: r.client_name,
      }));

    calendar = rows.map((r) => ({
      at: r.scheduled_at,
            durationMin: r.duration_min,
      kind: 'SESSION',
      title: r.client_name || 'Client session',
      sub: [r.topic, `${r.duration_min} min`, r.type].filter(Boolean).join(' · '),
    }));

    // Counterpart sessions: nutritionists this trainer's clients also see.
    // RLS (shared_coach_reads_sessions) permits reads when caller is an
    // active coach on the client; we still narrow the scan to my clients.
    const myClientIds = [...new Set(rows.map((r) => r.client_id).filter((x): x is string => !!x))];
    if (myClientIds.length > 0) {
      const { data: otherSessions } = await supabase
        .from('sessions')
        .select('scheduled_at, duration_min, type, status, topic, client_name, client_id, provider_id, provider_role')
        .eq('provider_role', 'nutritionist')
        .in('status', ['confirmed', 'requested', 'completed'])
        .in('client_id', myClientIds)
        // Newest first for the same reason as the read above: the counterpart sessions a
        // coach needs to see are this week's, not the first 500 their clients ever booked.
        // `calendar` is sorted below, so this one needs no re-sort of its own.
        .order('scheduled_at', { ascending: false })
        .limit(SESSION_CAP);
      const otherRows = (otherSessions ?? []) as Array<SessionRow & { provider_id: number; provider_role: string }>;
      if (otherRows.length > 0) {
        const otherProviderIds = [...new Set(otherRows.map((r) => r.provider_id))];
        const { data: nutriProfiles } = await supabase
          .from('nutritionists')
          .select('id, name')
          .in('id', otherProviderIds);
        const nameById = new Map<number, string>();
        for (const n of nutriProfiles ?? []) nameById.set(n.id, n.name ?? 'Nutritionist');
        for (const r of otherRows) {
          calendar.push({
            at: r.scheduled_at,
            durationMin: r.duration_min,
            kind: 'NUTRITION',
            title: `${r.client_name || 'Client'} · with ${nameById.get(r.provider_id) || 'their nutritionist'}`,
            sub: [r.topic, `${r.duration_min} min`, r.type].filter(Boolean).join(' · '),
            sharedCoach: true,
          });
        }
        calendar.sort((a, b) => new Date(a.at as string).getTime() - new Date(b.at as string).getTime());
      }
    }

    // Client pulse — distinct clients seen across this trainer's sessions,
    // most recently active first. Names come from sessions.client_name, so
    // this needs no extra profile access.
    const byClient = new Map<
      string,
      { name: string; sessions: number; lastAt: number }
    >();
    for (const r of rows) {
      const key = r.client_id || r.client_name || 'unknown';
      const t = new Date(r.scheduled_at).getTime();
      const existing = byClient.get(key);
      if (existing) {
        existing.sessions += 1;
        if (t > existing.lastAt) existing.lastAt = t;
      } else {
        byClient.set(key, { name: r.client_name || 'Client', sessions: 1, lastAt: t });
      }
    }
    pulse = [...byClient.values()]
      .sort((a, b) => b.lastAt - a.lastAt)
      .slice(0, 8)
      .map((c) => ({ name: c.name, sessions: c.sessions, lastAt: new Date(c.lastAt).toISOString() }));
  }

  // Real 90-day growth + funnel (dashboard-v2 step 8) — derived from
  // subscriptions/sessions we already scope by RLS; never fabricated.
  let growth = null;
  let funnel = null;
  if (providerId != null) {
    const since90 = Date.now() - 90 * 86400000;
    const consults90 = calendar.filter((c) => {
      const t = new Date(c.at as string).getTime();
      return t >= since90 && t <= Date.now() && c.kind !== 'NUTRITION' && c.kind !== 'TRAINING';
    }).length;
    try {
      const g = await coachGrowthAndFunnel(supabase, 'trainer', providerId, consults90);
      growth = g.growth;
      funnel = g.funnel;
    } catch (e) {
      // The subscriptions could not be read (coachGrowthAndFunnel throws rather than read a
      // failure as no history). Growth goes unread; the consults were counted above from the
      // calendar, so the funnel keeps them and only the signings go unread.
      funnel = { views: null, consults90, signed90: null };
    }
  }

  return NextResponse.json({
    user: { firstName, fullName },
    isTrainer: providerId != null,
    kpis: { activeClients, monthlyNetCents, sessionsThisWeek, upcomingSessions, totalSessions, totalCapped },
    today,
    calendar,
    pulse,
    growth,
    funnel,
  });
}
