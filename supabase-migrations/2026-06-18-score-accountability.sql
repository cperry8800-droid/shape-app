-- Shape Score · Accountability clawback + positive earns (Momentum/Accountability — Phase C)
--
-- Four RPCs on the existing score_ledger (no new table, no CHECK migration — every
-- source_kind reuses an allowed category). All SECURITY DEFINER + idempotent via the
-- score_ledger dedupe index. Penalties are the "stick" (a falling NUMBER, never a tier
-- demotion); the positive earns close the kept-session / completed-workout gaps.
--
--   apply_obligation_penalty(uid,kind,ref,day)  SERVICE-ROLE ONLY (the daily cron). Debits a
--       bounded −½ penalty for a MISSED committed obligation, verifying the obligation row
--       exists + is the user's + was actually missed + recent (no launch back-charge) +
--       not paused, respecting the −30/week cap and the 0 spendable-balance floor.
--   award_session_kept(uid,session_id)          SERVICE-ROLE ONLY (the cron). +12 for a KEPT
--       (status='completed') coach session.
--   award_workout_session(day)                   AUTHENTICATED (auth.uid()). +10 once per day a
--       real workout was logged (gated on daily_health_snapshot.workout_minutes>0 — un-farmable).
--   waive_penalty(uid,source_kind,source_id)     AUTHENTICATED, coach-gated (is_coach_on_client).
--       Appends an OFFSETTING positive 'penalty_waive' row (ledger stays append-only).
--
-- Penalty amounts (= ½ of the earn, rounded): session −6, check-in −7, assigned workout −5,
-- habit-streak −2. Categories: session/check-in = adherence, workout = workouts, habit = habits.
-- Fire-and-forget: callers no-op until applied. Idempotent to re-run.

-- ── apply_obligation_penalty ─────────────────────────────────────────────────
-- The cron passes one candidate obligation; this verifies + bounds + writes it.
create or replace function public.apply_obligation_penalty(
  p_uid uuid, p_kind text, p_ref_id uuid, p_day date
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount   integer;
  v_category text;
  v_skind    text;
  v_srcid    uuid;
  v_note     text;
  v_missed   boolean := false;
  v_balance  integer;
  v_weekpen  integer;
  v_final    integer;
  v_ins      integer;
begin
  if p_uid is null or p_kind is null or p_day is null then
    return jsonb_build_object('applied', false, 'reason', 'bad_args');
  end if;
  -- Never back-charge history (e.g. at feature launch): only RECENT obligations.
  if p_day < current_date - 14 then
    return jsonb_build_object('applied', false, 'reason', 'too_old');
  end if;
  -- Serialize the read-modify-write (balance/cap → insert) per user.
  perform pg_advisory_xact_lock(hashtext('shape_penalty'), hashtext(p_uid::text));
  -- Pause / vacation: a user_goals('client_settings').paused_until covering p_day exempts.
  if exists (
    select 1 from public.user_goals g
    where g.user_id = p_uid and g.kind = 'client_settings'
      and coalesce(g.data->>'paused_until','') ~ '^\d{4}-\d{2}-\d{2}'
      and (g.data->>'paused_until')::date >= p_day
  ) then
    return jsonb_build_object('applied', false, 'reason', 'paused');
  end if;

  -- Resolve amount/category/source + VERIFY the obligation was actually missed.
  if p_kind = 'session' then
    v_amount := -6; v_category := 'adherence'; v_skind := 'penalty_session'; v_srcid := p_ref_id; v_note := 'Missed session';
    -- Only CONFIRMED (a real commitment) sessions whose scheduled day is fully past.
    v_missed := exists (
      select 1 from public.sessions s
      where s.id = p_ref_id and s.client_id = p_uid
        and s.status = 'confirmed'
        and s.scheduled_at < date_trunc('day', now())
    );
  elsif p_kind = 'checkin' then
    v_amount := -7; v_category := 'adherence'; v_skind := 'penalty_checkin';
    v_srcid := md5('penalty_checkin:'||p_uid::text||':'||p_day::text)::uuid; v_note := 'Missed weekly check-in';
    -- p_day = the ISO-week Monday; penalize only once the whole week is over with no row.
    v_missed := (
      now() >= p_day + 7
      and not exists (select 1 from public.client_checkins c where c.user_id = p_uid and c.week_of = p_day)
    );
  elsif p_kind = 'workout' then
    v_amount := -5; v_category := 'workouts'; v_skind := 'penalty_workout'; v_srcid := p_ref_id; v_note := 'Skipped assigned workout';
    -- Published assigned workout, day past, AND no workout logged that day by ANY path.
    v_missed := (
      exists (select 1 from public.client_workouts w
              where w.id = p_ref_id and w.client_id = p_uid and w.status = 'published'
                and w.scheduled_date = p_day and w.scheduled_date < current_date)
      -- snapshot_date is local-aligned (same basis as scheduled_date): exact match.
      and not exists (select 1 from public.daily_health_snapshot d
                      where d.user_id = p_uid and d.snapshot_date = p_day and coalesce(d.workout_minutes,0) > 0)
      -- activities.started_at is UTC: allow ±1 day so tz never causes a false penalty.
      and not exists (select 1 from public.activities a
                      where a.user_id = p_uid and (a.started_at)::date in (p_day - 1, p_day, p_day + 1))
    );
  elsif p_kind = 'habit' then
    v_amount := -2; v_category := 'habits'; v_skind := 'penalty_habit';
    v_srcid := md5('penalty_habit:'||p_uid::text||':'||p_ref_id::text||':'||p_day::text)::uuid; v_note := 'Broke a habit streak';
    -- Active DAILY DO-habit with a clean >=3-day streak ending p_day-1, then missed on p_day.
    v_missed := (
      exists (select 1 from public.user_habits h
              where h.id = p_ref_id and h.user_id = p_uid and h.archived_at is null
                and h.type = 'do' and h.cadence = 'daily')
      and (select count(*) from public.user_habit_completions hc
           where hc.habit_id = p_ref_id and hc.done_on in (p_day - 1, p_day - 2, p_day - 3)) = 3
      and not exists (select 1 from public.user_habit_completions hc
                      where hc.habit_id = p_ref_id and hc.done_on = p_day)
    );
  else
    return jsonb_build_object('applied', false, 'reason', 'unknown_kind');
  end if;

  if not v_missed then
    return jsonb_build_object('applied', false, 'reason', 'not_missed');
  end if;

  -- Fairness guards (v_amount is negative): clamp to the least-negative of the requested
  -- amount, the 0-balance floor (−balance), and the weekly room (−30 − this-week's penalties).
  select coalesce(sum(delta),0) into v_balance from public.score_ledger where user_id = p_uid;
  select coalesce(sum(delta),0) into v_weekpen from public.score_ledger
    where user_id = p_uid
      and earned_at >= date_trunc('week', now()) and earned_at < date_trunc('week', now()) + interval '7 days'
      and source_kind like 'penalty_%' and source_kind <> 'penalty_waive';
  v_final := greatest(v_amount, -v_balance, (-30 - v_weekpen));
  if v_final >= 0 then
    return jsonb_build_object('applied', false, 'reason', 'guarded', 'balance', v_balance, 'week_penalty', v_weekpen);
  end if;

  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (p_uid, v_category, v_skind, v_srcid, v_final, v_note)
    on conflict (user_id, source_kind, source_id)
      where source_kind is not null and source_id is not null
      do nothing;
  get diagnostics v_ins = row_count;
  return jsonb_build_object('applied', v_ins > 0, 'amount', v_final, 'kind', p_kind, 'source_id', v_srcid);
end $$;

revoke all on function public.apply_obligation_penalty(uuid, text, uuid, date) from public;
grant execute on function public.apply_obligation_penalty(uuid, text, uuid, date) to service_role;

-- ── award_session_kept (cron, +12 for a kept coach session) ──────────────────
create or replace function public.award_session_kept(p_uid uuid, p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_ins integer;
begin
  if p_uid is null or p_session_id is null then return jsonb_build_object('awarded', false); end if;
  if not exists (
    select 1 from public.sessions s
    where s.id = p_session_id and s.client_id = p_uid and s.status = 'completed'
      and s.scheduled_at >= now() - interval '21 days'
  ) then return jsonb_build_object('awarded', false, 'reason', 'not_kept'); end if;
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (p_uid, 'adherence', 'session_kept', p_session_id, 12, 'Session kept')
    on conflict (user_id, source_kind, source_id)
      where source_kind is not null and source_id is not null
      do nothing;
  get diagnostics v_ins = row_count;
  return jsonb_build_object('awarded', v_ins > 0, 'points', case when v_ins > 0 then 12 else 0 end);
end $$;

revoke all on function public.award_session_kept(uuid, uuid) from public;
grant execute on function public.award_session_kept(uuid, uuid) to service_role;

-- ── award_workout_session (client, +10 once/day for a logged workout) ────────
create or replace function public.award_workout_session(p_day date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_day date := coalesce(p_day, current_date); v_ins integer;
begin
  if v_uid is null then return jsonb_build_object('awarded', false); end if;
  -- Gate on a REAL logged workout that day (un-farmable: deduped to one +10 per day).
  if not exists (
    select 1 from public.daily_health_snapshot d
    where d.user_id = v_uid and d.snapshot_date = v_day and coalesce(d.workout_minutes,0) > 0
  ) then return jsonb_build_object('awarded', false, 'reason', 'no_workout'); end if;
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (v_uid, 'workouts', 'workout_session',
            md5('workout_session:'||v_uid::text||':'||v_day::text)::uuid, 10, 'Workout session')
    on conflict (user_id, source_kind, source_id)
      where source_kind is not null and source_id is not null
      do nothing;
  get diagnostics v_ins = row_count;
  return jsonb_build_object('awarded', v_ins > 0, 'points', case when v_ins > 0 then 10 else 0 end);
end $$;

grant execute on function public.award_workout_session(date) to authenticated;

-- ── waive_penalty (coach offsets a client's penalty) ─────────────────────────
create or replace function public.waive_penalty(p_uid uuid, p_source_kind text, p_source_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_coach uuid := auth.uid(); v_delta integer; v_cat text; v_ins integer;
begin
  if v_coach is null or p_uid is null or p_source_kind is null or p_source_id is null then
    return jsonb_build_object('waived', false);
  end if;
  if not public.is_coach_on_client(p_uid) then
    return jsonb_build_object('waived', false, 'reason', 'not_coach');
  end if;
  -- The penalty must exist, be the client's, and be a real negative penalty row.
  select delta, category into v_delta, v_cat from public.score_ledger
    where user_id = p_uid and source_kind = p_source_kind and source_id = p_source_id and delta < 0
    limit 1;
  if v_delta is null then return jsonb_build_object('waived', false, 'reason', 'no_penalty'); end if;
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (p_uid, coalesce(v_cat, 'adherence'), 'penalty_waive', p_source_id, -v_delta, 'Penalty waived by coach')
    on conflict (user_id, source_kind, source_id)
      where source_kind is not null and source_id is not null
      do nothing;
  get diagnostics v_ins = row_count;
  return jsonb_build_object('waived', v_ins > 0, 'amount', -v_delta);
end $$;

grant execute on function public.waive_penalty(uuid, text, uuid) to authenticated;

-- ── get_client_penalties (coach reads a client's recent, un-waived penalties) ─
-- score_ledger RLS is owner-only; this DEFINER read is gated on is_coach_on_client so a
-- coach can surface + waive their client's penalties. Excludes already-waived rows.
create or replace function public.get_client_penalties(p_uid uuid)
returns table (source_kind text, source_id uuid, delta integer, note text, earned_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select sl.source_kind, sl.source_id, sl.delta, sl.note, sl.earned_at
  from public.score_ledger sl
  where sl.user_id = p_uid
    and public.is_coach_on_client(p_uid)
    and sl.source_kind like 'penalty_%' and sl.source_kind <> 'penalty_waive'
    and sl.delta < 0
    and sl.earned_at >= now() - interval '60 days'
    and not exists (
      select 1 from public.score_ledger w
      where w.user_id = p_uid and w.source_kind = 'penalty_waive' and w.source_id = sl.source_id
    )
  order by sl.earned_at desc
  limit 20;
$$;

grant execute on function public.get_client_penalties(uuid) to authenticated;
