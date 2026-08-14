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
import { readinessFromSeries } from '@/lib/recovery-readiness';

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

  // Client identity — name + avatar only.
  //
  // ⚠ Deliberately NOT a `profiles` table read. This page is opened by the
  // client themselves AND by their coach, and a coach may legitimately be
  // reviewing a client whose subscription has just LAPSED — outside the
  // active/trialing coach policy. get_display_names covers all three cases with
  // one round trip and cannot return email/phone/DOB/stripe_customer_id.
  const { data: identityRows, error: identityError } = await supabase.rpc('get_display_names', { p_ids: [clientId] });
  if (identityError) {
    // A silent fall-through here renders plausible copy — the exact failure this
    // PR exists to stop. The likeliest cause is a deploy-order mismatch:
    // 2026-08-04 applied before this code shipped, or 2026-08-03 not applied.
    console.warn('[shape-app] shared-overview: get_display_names failed — client identity is null:', identityError.message);
  }
  const identity = ((identityRows ?? []) as { user_id: string; full_name: string | null; avatar_url: string | null }[])[0] ?? null;
  const clientProfile = identity
    ? { id: identity.user_id, full_name: identity.full_name, avatar_url: identity.avatar_url }
    : null;

  // Active subscriptions on this client that the CALLER can read -- which is only the caller's
  // OWN. ⚠ The comment here used to read "RLS lets shared coaches read their counterpart's row by
  // design (both providers want to see the team)". That is FALSE, and it is why the Care Team was
  // always just "me": RLS on `subscriptions` is client-reads-own + provider-reads-own with NO
  // cross-provider clause. Verified against production by impersonation (real owner 1 row, a
  // different coach 0, control 21 both). The counterpart half now comes from a projecting definer
  // -- see 2026-08-10-shared-clients-roster.sql for why a definer and not a new RLS policy.
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('provider_role, provider_id, status, current_period_end')
    .eq('client_id', clientId)
    .in('status', ['active', 'trialing']);

  const trainerIds = (subs ?? []).filter(s => s.provider_role === 'trainer').map(s => s.provider_id);
  const nutriIds = (subs ?? []).filter(s => s.provider_role === 'nutritionist').map(s => s.provider_id);

  // ⚠ `avatar_url` is NOT selected here any more, and that was a SECOND bug that emptied this
  // list on its own: the column exists on NEITHER trainers nor nutritionists (it lives on
  // `profiles`). PostgREST 400s an unknown column, the error was dropped with `?? []`, and even
  // the caller's OWN care-team entry vanished. Providers have no avatar column; the UI falls back
  // to initials.
  const [trainersRes, nutriRes, cpRes] = await Promise.all([
    trainerIds.length
      ? supabase.from('trainers').select('id, name, owner_id').in('id', trainerIds)
      : Promise.resolve({ data: [] as Array<{ id: number; name: string; owner_id: string | null }> }),
    nutriIds.length
      ? supabase.from('nutritionists').select('id, name, owner_id').in('id', nutriIds)
      : Promise.resolve({ data: [] as Array<{ id: number; name: string; owner_id: string | null }> }),
    supabase.rpc('get_my_shared_clients', { p_client_id: clientId }),
  ]);

  // A failed counterpart read drops every co-coach from Care Team while the rest of the page
  // renders normally — an incomplete team presented as a complete one, which is the exact
  // silent-failure shape /api/me/shared-clients was changed to stop doing. This route cannot
  // answer 500 for it (one leg of a whole-page payload), so it degrades LOUDLY instead: the
  // partial flag rides out with the data so the surface can say the team may be incomplete
  // rather than quietly showing a short list.
  const careTeamPartial = Boolean(cpRes.error);
  if (cpRes.error) console.error('[shared-overview] get_my_shared_clients failed:', cpRes.error.message);

  const trainers = (trainersRes.data ?? []).map(t => ({
    role: 'trainer' as const,
    providerId: t.id,
    name: t.name,
    avatarUrl: null as string | null,
    userId: t.owner_id,
    isMe: myTrainerId === t.id,
  }));
  const nutritionists = (nutriRes.data ?? []).map(n => ({
    role: 'nutritionist' as const,
    providerId: n.id,
    name: n.name,
    avatarUrl: null as string | null,
    userId: n.owner_id,
    isMe: myNutritionistId === n.id,
  }));

  // The definer already excludes the caller's own provider rows (and a dual-role coach's second
  // row), so these can never duplicate the entries above.
  const counterparts = ((cpRes.data ?? []) as Array<{
    counterpart_user_id: string;
    counterpart_role: 'trainer' | 'nutritionist';
    counterpart_provider_id: number;
    counterpart_name: string | null;
  }>).map(c => ({
    role: c.counterpart_role,
    providerId: c.counterpart_provider_id,
    name: c.counterpart_name ?? 'Coach',
    avatarUrl: null as string | null,
    userId: c.counterpart_user_id,
    isMe: false,
  }));

  const careTeam = [...trainers, ...nutritionists, ...counterparts];

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
    { data: cycle },
    { data: prep },
    { data: programRow },
  ] = await Promise.all([
    supabase.rpc('get_client_goals', { p_user_id: clientId }),
    supabase.rpc('get_client_stats', { p_user_id: clientId }),
    supabase.rpc('get_client_lifts', { p_user_id: clientId }),
    supabase.rpc('get_client_checkins', { p_user_id: clientId, p_limit: 4 }),
    supabase.rpc('get_client_measurements', { p_user_id: clientId }),
    supabase.rpc('get_client_progress_photos', { p_user_id: clientId, p_limit: 12 }),
    supabase.rpc('get_client_health_profile', { p_user_id: clientId }),
    // The cycle — share-gated: get_client_cycle gates on is_coach_on_client AND
    // the member's optIn AND share, all inside the definer (the get_client_goals
    // precedent above). Returns null / { share:false } / { share:true, starts }
    // raw; the mobile Case File + PR D's web page derive the phase client-side.
    supabase.rpc('get_client_cycle', { p_user_id: clientId }),
    // Meal prep (PR C) — coach-link-gated definer returning ONLY the compact
    // { count, lastAt, days } over the 4-day-fresh entries, or null (absence —
    // never a padlock). Pre-migration the RPC 404s and the leg reads null.
    supabase.rpc('get_client_meal_prep', { p_user_id: clientId }),
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
  // select('*') (not an explicit column list) so the route keeps working before the
  // sleep-detail migration is applied — PostgREST 400s the WHOLE query on an unknown
  // explicit column, which would null out the coach's sleep view entirely.
  const { data: snapRowsDesc } = await supabase
    .from('daily_health_snapshot')
    .select('*')
    .eq('user_id', clientId)
    .order('snapshot_date', { ascending: false })
    .limit(30);
  const snapRows = (snapRowsDesc ?? []).slice().reverse();
  const num = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  const colSeries = (key: string) => snapRows
    .filter((r) => (r as Record<string, unknown>)[key] != null)
    .map((r) => ({ date: (r as Record<string, string>).snapshot_date, value: Number((r as Record<string, unknown>)[key]) }));
  // Filter to rows that actually carry a sleep_hours value, then source BOTH the
  // hours and the recovery trio (efficiency/RHR/HRV) + the stage detail from the
  // SAME latest sleep row — RHR/HRV/stages are measured during that night's sleep,
  // so they belong to the night `latest` reports, not a newer snapshot that may lack sleep.
  const sleepRows = (snapRows ?? []).filter((r) => (r as Record<string, unknown>).sleep_hours != null);
  const sl = sleepRows.map((r) => ({ date: (r as Record<string, string>).snapshot_date, value: Number((r as Record<string, unknown>).sleep_hours) }));
  const lastSleep = sleepRows[sleepRows.length - 1] as Record<string, unknown> | undefined;
  const last7 = sl.slice(-7).map((p) => p.value);
  // Recovery readiness (0-100) from tonight's signals vs a trailing baseline.
  const readiness = readinessFromSeries({
    sleep: sl,
    sleepEfficiency: colSeries('sleep_efficiency_pct'),
    restingHr: colSeries('resting_hr'),
    hrv: colSeries('hrv_ms'),
    recovery: colSeries('recovery_score'),
  });
  const stageMin = lastSleep ? { deep: num(lastSleep.sleep_deep_min), rem: num(lastSleep.sleep_rem_min), light: num(lastSleep.sleep_light_min), awake: num(lastSleep.sleep_awake_min) } : null;
  const hasStages = !!(stageMin && (stageMin.deep != null || stageMin.rem != null || stageMin.light != null));
  const sleep = sl.length ? {
    latest: sl[sl.length - 1].value,
    avg7: last7.length ? Math.round((last7.reduce((a, b) => a + b, 0) / last7.length) * 10) / 10 : null,
    series7: sl.slice(-7),
    efficiency: lastSleep && lastSleep.sleep_efficiency_pct != null ? Math.round(Number(lastSleep.sleep_efficiency_pct)) : null,
    rhr: lastSleep && lastSleep.resting_hr != null ? Math.round(Number(lastSleep.resting_hr)) : null,
    hrv: lastSleep && lastSleep.hrv_ms != null ? Math.round(Number(lastSleep.hrv_ms)) : null,
    rested: lastSleep && lastSleep.sleep_quality != null ? Math.round(Number(lastSleep.sleep_quality)) : null,
    latency: lastSleep ? num(lastSleep.sleep_latency_min) : null,
    respiratory: lastSleep ? num(lastSleep.respiratory_rate) : null,
    stages: hasStages ? stageMin : null,
    readiness: readiness ? readiness.score : null,
    readinessLabel: readiness ? readiness.band.label : null,
  } : null;

  return NextResponse.json({
    client: clientProfile
      ? { id: clientProfile.id, name: (clientProfile.full_name ?? '').trim() || 'Client', avatarUrl: clientProfile.avatar_url }
      : { id: clientId, name: 'Client', avatarUrl: null },
    me: { trainerId: myTrainerId, nutritionistId: myNutritionistId },
    careTeam,
    // true = the counterpart read failed, so careTeam may be missing co-coaches. Never omit
    // this on the assumption the list is complete; an absent flag means "known complete".
    careTeamPartial,
    sessions,
    plans,
    goals: goals ?? null,
    stats: stats ?? null,
    lifts: lifts ?? null,
    checkins: checkins ?? [],
    measurements: measurements ?? [],
    progressPhotos: progressPhotos ?? [],
    healthProfile: healthProfile ?? null,
    cycle: cycle ?? null,
    prep: prep ?? null,
    coachGoals: Array.isArray(programDetail.goals) ? programDetail.goals : null,
    programPhases: programRow
      ? { training: programRow.training_phase ?? null, nutrition: programRow.nutrition_phase ?? null }
      : null,
    sleep,
  });
}
