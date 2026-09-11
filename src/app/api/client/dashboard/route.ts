// Live data for the newdesign Client dashboard.
// Read-only aggregate over existing tables (profiles, workout_sessions,
// sessions, subscriptions, trainers, nutritionists) — no new schema. RLS
// scopes every query to the signed-in user. A brand-new account comes back
// with zeros / empty, which is the correct "real data" state.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DAY_MS, startOfWeek } from '@/lib/time';
import { requireMembership } from '@/lib/require-membership';

export const dynamic = 'force-dynamic';

// Both reads below are capped, and both are ordered NEWEST first so the cap keeps the
// window nearest now. Named so the sweep in `tests/capped-reads.test.mjs` can see them.
const BOOKED_CAP = 100;
const WEIGH_IN_CAP = 104;

function midnight(iso: string): number {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
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

  // ---- Completed workout sessions -----------------------------------------
  const { data: workoutRows } = await supabase
    .from('workout_sessions')
    .select('title, started_at, ended_at, created_at, duration_seconds')
    .eq('client_id', user.id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(500);

  const completed = workoutRows ?? [];
  const sessionDate = (s: {
    started_at: string | null;
    ended_at: string | null;
    created_at: string;
  }) => s.started_at || s.ended_at || s.created_at;

  const dayStamps = new Set<number>(completed.map((s) => midnight(sessionDate(s))));

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

  // ---- Booked sessions (upcoming + recent) --------------------------------
  const { data: bookedAll } = await supabase
    .from('sessions')
    .select('scheduled_at, duration_min, type, status, topic, provider_id, provider_role')
    .eq('client_id', user.id)
    // ⚠ NEWEST FIRST, RE-SORTED ASCENDING ONCE BELOW. Ordering ascending made this cap
    // keep a member's OLDEST 100 bookings — so past that, `upcoming` (which filters to the
    // future) came back EMPTY however many sessions they had booked, and the calendar
    // showed only sessions from years ago. Both consumers read ascending, so the order is
    // restored here rather than in each of them.
    .order('scheduled_at', { ascending: false })
    .limit(BOOKED_CAP);

  const bookedRows = (bookedAll ?? [])
    .slice()
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  // ---- Subscriptions -> coach team ---------------------------------------
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('provider_id, provider_role, status')
    .in('status', ['active', 'trialing']);
  const subRows = subs ?? [];

  // Resolve provider names for both booked sessions and the team list.
  const trainerIdSet = new Set<number>();
  const nutriIdSet = new Set<number>();
  for (const r of bookedRows) {
    if (r.provider_role === 'trainer') trainerIdSet.add(r.provider_id);
    else if (r.provider_role === 'nutritionist') nutriIdSet.add(r.provider_id);
  }
  for (const r of subRows) {
    if (r.provider_role === 'trainer') trainerIdSet.add(r.provider_id);
    else if (r.provider_role === 'nutritionist') nutriIdSet.add(r.provider_id);
  }

  const trainerNames: Record<number, string> = {};
  const nutriNames: Record<number, string> = {};
  if (trainerIdSet.size) {
    const { data } = await supabase
      .from('trainers')
      .select('id, name')
      .in('id', [...trainerIdSet]);
    (data ?? []).forEach((t: { id: number; name: string }) => {
      trainerNames[t.id] = t.name;
    });
  }
  if (nutriIdSet.size) {
    const { data } = await supabase
      .from('nutritionists')
      .select('id, name')
      .in('id', [...nutriIdSet]);
    (data ?? []).forEach((n: { id: number; name: string }) => {
      nutriNames[n.id] = n.name;
    });
  }

  const providerName = (role: string, id: number) =>
    (role === 'trainer' ? trainerNames : nutriNames)[id] ?? null;

  const nowMs = Date.now();
  const upcoming = bookedRows
    .filter(
      (r) =>
        new Date(r.scheduled_at).getTime() >= nowMs &&
        (r.status === 'requested' || r.status === 'confirmed')
    )
    .slice(0, 8)
    .map((r) => ({
      scheduledAt: r.scheduled_at,
      durationMin: r.duration_min,
      type: r.type,
      status: r.status,
      topic: r.topic,
      providerRole: r.provider_role,
      providerName: providerName(r.provider_role, r.provider_id),
    }));

  const team = subRows.map((r) => ({
    name: providerName(r.provider_role, r.provider_id) || 'Coach',
    role: r.provider_role === 'nutritionist' ? 'Nutritionist' : 'Trainer',
  }));

  // ---- Goals (pros set, clients view) --------------------------------------
  // Coach-set goals live at client_programs.detail.goals (the client owns the
  // row); the legacy self-set doc + live weigh-ins ride along so the Goals
  // surfaces can normalize everything through DashSignals.goalsFromDoc.
  const [{ data: programRow }, { data: goalsDoc }, { data: weighRows }] = await Promise.all([
    supabase.from('client_programs').select('detail').eq('user_id', user.id).maybeSingle(),
    supabase.from('user_goals').select('data').eq('user_id', user.id).eq('kind', 'client_goals').maybeSingle(),
    supabase
      .from('client_weigh_ins')
      .select('logged_on, weight, unit')
      .eq('user_id', user.id)
      // ⚠ NEWEST FIRST, RE-REVERSED BELOW — the same defect `/api/client/progress` was
      // fixed for. Ascending kept the OLDEST 104 rows, which a daily logger passes in
      // about three months, after which their goal trend never shows this year at all.
      .order('logged_on', { ascending: false })
      .limit(WEIGH_IN_CAP),
  ]);
  const programDetail = (programRow?.detail ?? {}) as Record<string, unknown>;
  const selfDoc = (goalsDoc?.data ?? {}) as Record<string, unknown>;
  const goals = {
    coach: Array.isArray(programDetail.goals) ? programDetail.goals : null,
    overall: selfDoc.overall ?? null,
    training: Array.isArray(selfDoc.training) ? selfDoc.training : null,
    nutrition: Array.isArray(selfDoc.nutrition) ? selfDoc.nutrition : null,
    weighIns: (weighRows ?? []).slice().reverse().map((w) => ({ on: w.logged_on, weight: w.weight, unit: w.unit })),
  };

  // ---- Calendar events (workouts + booked sessions) -----------------------
  const calendar = [
    ...completed.slice(0, 80).map((s) => ({
      at: sessionDate(s),
      kind: 'WORKOUT',
      title: s.title || 'Workout',
      sub: `${Math.round((s.duration_seconds ?? 0) / 60)} min`,
    })),
    ...bookedRows.map((r) => ({
      at: r.scheduled_at,
      kind: 'CHECKIN',
      title: r.topic || 'Coaching session',
      sub:
        [providerName(r.provider_role, r.provider_id), `${r.duration_min} min`]
          .filter(Boolean)
          .join(' · ') || `${r.duration_min} min`,
    })),
  ];

  return NextResponse.json({
    user: { firstName, fullName },
    kpis: { streak, workoutsThisWeek, totalWorkouts, lastDurationMin, lastSessionAt },
    upcoming,
    team,
    calendar,
    goals,
  });
}
