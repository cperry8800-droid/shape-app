// Live data for the newdesign Client dashboard.
// Read-only aggregate over existing tables (workout_sessions, profiles) — no
// new schema. RLS scopes every query to the signed-in user. A brand-new
// account simply comes back with zeros / empty, which is the correct
// "real data" state.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;

// Monday-anchored start of the week containing `d`, at local midnight.
function startOfWeek(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const mondayOffset = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - mondayOffset);
  return x.getTime();
}

function midnight(iso: string): number {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
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

  // Completed workout sessions — RLS restricts this to the user's own rows.
  const { data: sessions } = await supabase
    .from('workout_sessions')
    .select('started_at, ended_at, created_at, duration_seconds')
    .eq('client_id', user.id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(500);

  const completed = sessions ?? [];
  const sessionDate = (s: { started_at: string | null; ended_at: string | null; created_at: string }) =>
    s.started_at || s.ended_at || s.created_at;

  const dayStamps = new Set<number>(completed.map((s) => midnight(sessionDate(s))));

  // Current streak: consecutive days with a completed session, ending today
  // (or yesterday, so a not-yet-trained-today streak still counts).
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let cursor = today.getTime();
  if (!dayStamps.has(cursor)) cursor -= DAY_MS;
  while (dayStamps.has(cursor)) {
    streak += 1;
    cursor -= DAY_MS;
  }

  const weekStart = startOfWeek(new Date());
  const workoutsThisWeek = completed.filter((s) => midnight(sessionDate(s)) >= weekStart).length;
  const totalWorkouts = completed.length;
  const last = completed[0] ?? null;
  const lastDurationMin = last ? Math.round((last.duration_seconds ?? 0) / 60) : 0;
  const lastSessionAt = last ? sessionDate(last) : null;

  // Upcoming booked sessions (consultations / check-ins with a coach).
  const { data: booked } = await supabase
    .from('sessions')
    .select('scheduled_at, duration_min, type, status, topic, provider_id, provider_role')
    .eq('client_id', user.id)
    .in('status', ['requested', 'confirmed'])
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(8);

  const bookedRows = booked ?? [];
  const trainerIds = [
    ...new Set(bookedRows.filter((r) => r.provider_role === 'trainer').map((r) => r.provider_id)),
  ];
  const nutriIds = [
    ...new Set(bookedRows.filter((r) => r.provider_role === 'nutritionist').map((r) => r.provider_id)),
  ];
  const trainerNames: Record<number, string> = {};
  const nutriNames: Record<number, string> = {};
  if (trainerIds.length) {
    const { data } = await supabase.from('trainers').select('id, name').in('id', trainerIds);
    (data ?? []).forEach((t: { id: number; name: string }) => {
      trainerNames[t.id] = t.name;
    });
  }
  if (nutriIds.length) {
    const { data } = await supabase.from('nutritionists').select('id, name').in('id', nutriIds);
    (data ?? []).forEach((n: { id: number; name: string }) => {
      nutriNames[n.id] = n.name;
    });
  }

  const upcoming = bookedRows.map((r) => ({
    scheduledAt: r.scheduled_at,
    durationMin: r.duration_min,
    type: r.type,
    status: r.status,
    topic: r.topic,
    providerRole: r.provider_role,
    providerName:
      (r.provider_role === 'trainer' ? trainerNames : nutriNames)[r.provider_id] ?? null,
  }));

  return NextResponse.json({
    user: { firstName, fullName },
    kpis: {
      streak,
      workoutsThisWeek,
      totalWorkouts,
      lastDurationMin,
      lastSessionAt,
    },
    upcoming,
  });
}
