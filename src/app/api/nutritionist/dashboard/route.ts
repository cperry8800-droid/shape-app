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
  let consultsThisWeek = 0;
  let upcomingConsults = 0;
  let totalConsults = 0;
  let today: Array<{
    scheduledAt: string;
    durationMin: number;
    type: string;
    status: string;
    topic: string | null;
    clientName: string | null;
  }> = [];

  if (providerId != null) {
    const { count: clientCount } = await supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('provider_role', 'nutritionist')
      .eq('provider_id', providerId)
      .in('status', ['active', 'trialing']);
    activeClients = clientCount ?? 0;

    const { data: sessions } = await supabase
      .from('sessions')
      .select('scheduled_at, duration_min, type, status, topic, client_name')
      .eq('provider_role', 'nutritionist')
      .eq('provider_id', providerId)
      .order('scheduled_at', { ascending: true })
      .limit(400);

    const rows = sessions ?? [];
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
  }

  return NextResponse.json({
    user: { firstName, fullName },
    isNutritionist: providerId != null,
    kpis: { activeClients, consultsThisWeek, upcomingConsults, totalConsults },
    today,
  });
}
