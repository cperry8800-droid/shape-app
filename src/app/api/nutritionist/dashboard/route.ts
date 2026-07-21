// Live data for the newdesign Nutritionist dashboard.
// Read-only aggregate over existing tables (profiles, nutritionists,
// sessions, subscriptions) — no new schema. RLS scopes every query to the
// signed-in nutritionist. Revenue / payout KPIs are not computed here.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DAY_MS, startOfWeek } from '@/lib/time';
import { coachGrowthAndFunnel } from '@/lib/coach-growth';
import { coachCutCents, bpsToRate } from '@/lib/platform-fee';

export const dynamic = 'force-dynamic';

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

  const { data: nutriRow } = await supabase
    .from('nutritionists')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  const providerId: number | null = nutriRow?.id ?? null;

  let activeClients = 0;
  let monthlyNetCents = 0;
  let consultsThisWeek = 0;
  let upcomingConsults = 0;
  let totalConsults = 0;
  let today: Array<Record<string, unknown>> = [];
  let calendar: Array<Record<string, unknown>> = [];
  let pulse: Array<Record<string, unknown>> = [];

  if (providerId != null) {
    // Active subscribers + monthly recurring revenue, net of each row's STORED
    // fee (BYO subs pay 0% — the coach keeps 100%; marketplace subs pay 15%).
    const { data: subRows } = await supabase
      .from('subscriptions')
      .select('*') // '*' is migration-safe: an explicit fee_bps errors the query on a pre-migration DB
      .eq('provider_role', 'nutritionist')
      .eq('provider_id', providerId)
      .in('status', ['active', 'trialing']);
    const subs = subRows ?? [];
    activeClients = subs.length;
    monthlyNetCents = subs.reduce(
      (sum: number, r: { price_cents: number | null; fee_bps?: number | null }) =>
        sum + coachCutCents(r.price_cents ?? 0, bpsToRate(r.fee_bps ?? 1500)),
      0
    );

    const { data: sessions } = await supabase
      .from('sessions')
      .select('scheduled_at, duration_min, type, status, topic, client_name, client_id')
      .eq('provider_role', 'nutritionist')
      .eq('provider_id', providerId)
      .order('scheduled_at', { ascending: true })
      .limit(500);

    const rows = (sessions ?? []) as SessionRow[];
    totalConsults = rows.length;

    const now = Date.now();
    const weekStart = startOfWeek(new Date());
    const weekEnd = weekStart + 7 * DAY_MS;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    const todayEndMs = todayStartMs + DAY_MS;

    for (const r of rows) {
      const t = new Date(r.scheduled_at).getTime();
      if (t >= weekStart && t < weekEnd) consultsThisWeek += 1;
      if (t >= now && (r.status === 'requested' || r.status === 'confirmed')) upcomingConsults += 1;
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
      kind: 'SESSION',
      title: r.client_name || 'Client consult',
      sub: [r.topic, `${r.duration_min} min`, r.type].filter(Boolean).join(' · '),
    }));

    // Counterpart sessions: trainers this nutritionist's clients also see.
    // RLS (shared_coach_reads_sessions) permits reads when caller is an
    // active coach on the client; we still narrow the scan to my clients.
    const myClientIds = [...new Set(rows.map((r) => r.client_id).filter((x): x is string => !!x))];
    if (myClientIds.length > 0) {
      const { data: otherSessions } = await supabase
        .from('sessions')
        .select('scheduled_at, duration_min, type, status, topic, client_name, client_id, provider_id, provider_role')
        .eq('provider_role', 'trainer')
        .in('status', ['confirmed', 'requested', 'completed'])
        .in('client_id', myClientIds)
        .order('scheduled_at', { ascending: true })
        .limit(500);
      const otherRows = (otherSessions ?? []) as Array<SessionRow & { provider_id: number; provider_role: string }>;
      if (otherRows.length > 0) {
        const otherProviderIds = [...new Set(otherRows.map((r) => r.provider_id))];
        const { data: trainerProfiles } = await supabase
          .from('trainers')
          .select('id, name')
          .in('id', otherProviderIds);
        const nameById = new Map<number, string>();
        for (const t of trainerProfiles ?? []) nameById.set(t.id, t.name ?? 'Trainer');
        for (const r of otherRows) {
          calendar.push({
            at: r.scheduled_at,
            kind: 'TRAINING',
            title: `${r.client_name || 'Client'} · with ${nameById.get(r.provider_id) || 'their trainer'}`,
            sub: [r.topic, `${r.duration_min} min`, r.type].filter(Boolean).join(' · '),
            sharedCoach: true,
          });
        }
        calendar.sort((a, b) => new Date(a.at as string).getTime() - new Date(b.at as string).getTime());
      }
    }

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
    try {
      const since90 = Date.now() - 90 * 86400000;
      const consults90 = calendar.filter((c) => {
        const t = new Date(c.at as string).getTime();
        return t >= since90 && t <= Date.now() && c.kind !== 'NUTRITION' && c.kind !== 'TRAINING';
      }).length;
      const g = await coachGrowthAndFunnel(supabase, 'nutritionist', providerId, consults90);
      growth = g.growth;
      funnel = g.funnel;
    } catch (e) { /* panels render their honest empty states */ }
  }

  return NextResponse.json({
    user: { firstName, fullName },
    isNutritionist: providerId != null,
    kpis: { activeClients, monthlyNetCents, consultsThisWeek, upcomingConsults, totalConsults },
    today,
    calendar,
    pulse,
    growth,
    funnel,
  });
}
