// Per-client overview for a coach.
//
// Returns the data needed for TrainerClient.html / NutritionistClient.html:
// - basic client identity
// - the *other* provider(s) on the client (so we can render "Care team")
// - combined sessions (confirmed / requested / completed) for the next 30
//   days back + 60 days forward, tagged by provider role
//
// Authz is enforced by RLS: the caller must already be the client OR an
// active coach on this client. If neither, the queries simply return empty.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  // Identify the caller's role(s) so the UI can label things correctly.
  const [trainerRow, nutriRow] = await Promise.all([
    supabase.from('trainers').select('id').eq('owner_id', user.id).maybeSingle(),
    supabase.from('nutritionists').select('id').eq('owner_id', user.id).maybeSingle(),
  ]);
  const myTrainerId = trainerRow.data?.id ?? null;
  const myNutritionistId = nutriRow.data?.id ?? null;

  // Client identity.
  const { data: clientProfile } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .eq('id', clientId)
    .maybeSingle();

  // Every active subscription on this client. RLS lets shared coaches read
  // their counterpart's row by design (both providers want to see the team).
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('provider_role, provider_id, status, current_period_end')
    .eq('client_id', clientId)
    .in('status', ['active', 'trialing']);

  const trainerIds = (subs ?? []).filter(s => s.provider_role === 'trainer').map(s => s.provider_id);
  const nutriIds = (subs ?? []).filter(s => s.provider_role === 'nutritionist').map(s => s.provider_id);

  const [trainersRes, nutriRes] = await Promise.all([
    trainerIds.length
      ? supabase.from('trainers').select('id, name, avatar_url, owner_id').in('id', trainerIds)
      : Promise.resolve({ data: [] as Array<{ id: number; name: string; avatar_url: string | null; owner_id: string | null }> }),
    nutriIds.length
      ? supabase.from('nutritionists').select('id, name, avatar_url, owner_id').in('id', nutriIds)
      : Promise.resolve({ data: [] as Array<{ id: number; name: string; avatar_url: string | null; owner_id: string | null }> }),
  ]);

  const trainers = (trainersRes.data ?? []).map(t => ({
    role: 'trainer' as const,
    providerId: t.id,
    name: t.name,
    avatarUrl: t.avatar_url,
    userId: t.owner_id,
    isMe: myTrainerId === t.id,
  }));
  const nutritionists = (nutriRes.data ?? []).map(n => ({
    role: 'nutritionist' as const,
    providerId: n.id,
    name: n.name,
    avatarUrl: n.avatar_url,
    userId: n.owner_id,
    isMe: myNutritionistId === n.id,
  }));
  const careTeam = [...trainers, ...nutritionists];

  // Sessions window: 30d back, 60d ahead.
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const to = new Date(now.getTime() + 60 * 86_400_000).toISOString();

  const { data: sessionRows } = await supabase
    .from('sessions')
    .select('id, scheduled_at, duration_min, type, status, topic, provider_id, provider_role')
    .eq('client_id', clientId)
    .in('status', ['confirmed', 'requested', 'completed'])
    .gte('scheduled_at', from)
    .lte('scheduled_at', to)
    .order('scheduled_at', { ascending: true });

  const trainerNameById = new Map<number, string>();
  for (const t of trainers) trainerNameById.set(t.providerId, t.name);
  const nutriNameById = new Map<number, string>();
  for (const n of nutritionists) nutriNameById.set(n.providerId, n.name);

  const sessions = (sessionRows ?? []).map(r => {
    const coachName = r.provider_role === 'trainer'
      ? trainerNameById.get(r.provider_id) || 'Trainer'
      : nutriNameById.get(r.provider_id) || 'Nutritionist';
    return {
      id: r.id,
      at: r.scheduled_at,
      durationMin: r.duration_min,
      type: r.type,
      status: r.status,
      topic: r.topic,
      providerRole: r.provider_role,
      coachName,
    };
  });

  // Active program assignments per provider. RLS (shared_coach_reads_*) lets
  // the counterpart read assigned/active/paused rows + their template header.
  const { data: assignments } = await supabase
    .from('coach_program_assignments')
    .select('id, status, provider_role, provider_id, program_template_id, updated_at, notes')
    .eq('client_id', clientId)
    .in('status', ['assigned', 'active', 'paused'])
    .order('updated_at', { ascending: false })
    .limit(20);

  const templateIds = [...new Set((assignments ?? []).map(a => a.program_template_id))];
  const { data: templates } = templateIds.length
    ? await supabase
        .from('coach_program_templates')
        .select('id, title, goal, level, duration_weeks, days_per_week')
        .in('id', templateIds)
    : { data: [] as Array<{ id: string; title: string; goal: string | null; level: string | null; duration_weeks: number | null; days_per_week: number | null }> };
  const templateById = new Map<string, { title: string; goal: string | null; level: string | null; durationWeeks: number | null; daysPerWeek: number | null }>();
  for (const t of templates ?? []) {
    templateById.set(t.id, {
      title: t.title,
      goal: t.goal,
      level: t.level,
      durationWeeks: t.duration_weeks,
      daysPerWeek: t.days_per_week,
    });
  }
  // Pick the most-recent assignment per (role, providerId) so the UI shows
  // one current plan per coach rather than a long history.
  const seen = new Set<string>();
  const plans = (assignments ?? [])
    .map(a => {
      const key = `${a.provider_role}|${a.provider_id}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const tpl = templateById.get(a.program_template_id);
      const coachName = a.provider_role === 'trainer'
        ? trainerNameById.get(a.provider_id) || 'Trainer'
        : nutriNameById.get(a.provider_id) || 'Nutritionist';
      return {
        assignmentId: a.id,
        status: a.status,
        providerRole: a.provider_role as 'trainer' | 'nutritionist',
        providerId: a.provider_id,
        coachName,
        updatedAt: a.updated_at,
        notes: a.notes,
        template: tpl ? {
          id: a.program_template_id,
          title: tpl.title,
          goal: tpl.goal,
          level: tpl.level,
          durationWeeks: tpl.durationWeeks,
          daysPerWeek: tpl.daysPerWeek,
        } : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // The client's goals — only when they've left sharing on (the RPC gates on
  // is_coach_on_client + the `share` flag, using this coach's session).
  // Live KPI + strength rollups ride alongside (each gated on is_coach_on_client),
  // plus the check-in kit: latest weekly check-ins, girth measurements, progress
  // photos, and the health profile (PAR-Q screening — never share-gated).
  const [
    { data: goals }, { data: stats }, { data: lifts },
    { data: checkins }, { data: measurements }, { data: progressPhotos }, { data: healthProfile },
    { data: programRow },
  ] = await Promise.all([
    supabase.rpc('get_client_goals', { p_user_id: clientId }),
    supabase.rpc('get_client_stats', { p_user_id: clientId }),
    supabase.rpc('get_client_lifts', { p_user_id: clientId }),
    supabase.rpc('get_client_checkins', { p_user_id: clientId, p_limit: 4 }),
    supabase.rpc('get_client_measurements', { p_user_id: clientId }),
    supabase.rpc('get_client_progress_photos', { p_user_id: clientId, p_limit: 12 }),
    supabase.rpc('get_client_health_profile', { p_user_id: clientId }),
    // client_programs: coach-readable by RLS — carries the pro-set goals
    // (detail.goals, the Goals-page store) and the program phases.
    supabase.from('client_programs').select('training_phase, nutrition_phase, detail').eq('user_id', clientId).maybeSingle(),
  ]);
  const programDetail = (programRow?.detail ?? {}) as Record<string, unknown>;

  // Objective sleep for the coach (share-gated like the other reads — the
  // providers_read_subscriber_snapshots RLS policy lets an active coach read
  // this client's snapshot rows directly under their own session).
  // Newest-first then reverse to chronological: a client with >30 snapshot rows
  // must keep their RECENT sleep (an ascending limit(30) would return the OLDEST
  // 30 and report stale latest/avg7/trend).
  const { data: snapRowsDesc } = await supabase
    .from('daily_health_snapshot')
    .select('snapshot_date, sleep_hours, sleep_efficiency_pct, resting_hr, hrv_ms')
    .eq('user_id', clientId)
    .order('snapshot_date', { ascending: false })
    .limit(30);
  const snapRows = (snapRowsDesc ?? []).slice().reverse();
  // Filter to rows that actually carry a sleep_hours value, then source BOTH the
  // hours and the recovery trio (efficiency/RHR/HRV) from the SAME latest sleep
  // row — RHR/HRV are measured during that night's sleep, so they belong to the
  // night `latest` reports, not a newer snapshot that may lack sleep.
  const sleepRows = (snapRows ?? []).filter((r) => (r as Record<string, unknown>).sleep_hours != null);
  const sl = sleepRows.map((r) => ({ date: (r as Record<string, string>).snapshot_date, value: Number((r as Record<string, unknown>).sleep_hours) }));
  const lastSleep = sleepRows[sleepRows.length - 1] as Record<string, unknown> | undefined;
  const last7 = sl.slice(-7).map((p) => p.value);
  const sleep = sl.length ? {
    latest: sl[sl.length - 1].value,
    avg7: last7.length ? Math.round((last7.reduce((a, b) => a + b, 0) / last7.length) * 10) / 10 : null,
    series7: sl.slice(-7),
    efficiency: lastSleep && lastSleep.sleep_efficiency_pct != null ? Math.round(Number(lastSleep.sleep_efficiency_pct)) : null,
    rhr: lastSleep && lastSleep.resting_hr != null ? Math.round(Number(lastSleep.resting_hr)) : null,
    hrv: lastSleep && lastSleep.hrv_ms != null ? Math.round(Number(lastSleep.hrv_ms)) : null,
  } : null;

  return NextResponse.json({
    client: clientProfile
      ? { id: clientProfile.id, name: (clientProfile.full_name ?? '').trim() || 'Client', avatarUrl: clientProfile.avatar_url }
      : { id: clientId, name: 'Client', avatarUrl: null },
    me: { trainerId: myTrainerId, nutritionistId: myNutritionistId },
    careTeam,
    sessions,
    plans,
    goals: goals ?? null,
    stats: stats ?? null,
    lifts: lifts ?? null,
    checkins: checkins ?? [],
    measurements: measurements ?? [],
    progressPhotos: progressPhotos ?? [],
    healthProfile: healthProfile ?? null,
    coachGoals: Array.isArray(programDetail.goals) ? programDetail.goals : null,
    programPhases: programRow
      ? { training: programRow.training_phase ?? null, nutrition: programRow.nutrition_phase ?? null }
      : null,
    sleep,
  });
}
