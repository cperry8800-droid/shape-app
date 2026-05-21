// Live data for the newdesign Nutritionist dashboard.
// Read-only aggregate over existing tables (profiles, nutritionists,
// sessions, subscriptions) — no new schema. RLS scopes every query to the
// signed-in nutritionist. Revenue / payout KPIs are not computed here.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;

function startOfWeek(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const mondayOffset = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - mondayOffset);
  return x.getTime();
}

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
    // Active subscribers + monthly recurring revenue, net of Shape's 15% fee.
    const { data: subRows } = await supabase
      .from('subscriptions')
      .select('price_cents, status')
      .eq('provider_role', 'nutritionist')
      .eq('provider_id', providerId)
      .in('status', ['active', 'trialing']);
    const subs = subRows ?? [];
    activeClients = subs.length;
    const grossCents = subs.reduce(
      (sum: number, r: { price_cents: number | null }) => sum + (r.price_cents ?? 0),
      0
    );
    monthlyNetCents = Math.round(grossCents * 0.85);

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

  return NextResponse.json({
    user: { firstName, fullName },
    isNutritionist: providerId != null,
    kpis: { activeClients, monthlyNetCents, consultsThisWeek, upcomingConsults, totalConsults },
    today,
    calendar,
    pulse,
  });
}
