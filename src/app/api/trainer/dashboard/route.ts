// Live data for the newdesign Trainer dashboard.
// Read-only aggregate over existing tables (profiles, trainers, sessions,
// subscriptions) — no new schema. RLS scopes every query to the signed-in
// trainer. Revenue / payout KPIs are intentionally NOT computed here: those
// need Stripe balance data and are a separate slice.

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

  // The trainer row owned by this user (added by 2026-04-14-provider-owner-id).
  const { data: trainerRow } = await supabase
    .from('trainers')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  const providerId: number | null = trainerRow?.id ?? null;

  let activeClients = 0;
  let sessionsThisWeek = 0;
  let upcomingSessions = 0;
  let totalSessions = 0;
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
      .eq('provider_role', 'trainer')
      .eq('provider_id', providerId)
      .in('status', ['active', 'trialing']);
    activeClients = clientCount ?? 0;

    const { data: sessions } = await supabase
      .from('sessions')
      .select('scheduled_at, duration_min, type, status, topic, client_name')
      .eq('provider_role', 'trainer')
      .eq('provider_id', providerId)
      .order('scheduled_at', { ascending: true })
      .limit(400);

    const rows = sessions ?? [];
    totalSessions = rows.length;

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
  }

  return NextResponse.json({
    user: { firstName, fullName },
    isTrainer: providerId != null,
    kpis: { activeClients, sessionsThisWeek, upcomingSessions, totalSessions },
    today,
  });
}
