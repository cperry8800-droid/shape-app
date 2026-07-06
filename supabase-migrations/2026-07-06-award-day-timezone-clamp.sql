-- Shape Score awards: lock the two day-based rewards to the member's OWN calendar
-- day, timezone-correct — closing the historical/future backfill farm.
--
-- THE HOLE (Codex flagged the twin on the meal award as P1): award_workout_session
-- and award_meal_log take a caller-supplied p_day. daily_health_snapshot is
-- owner-writable, so a caller could write a workout/meal snapshot for any past (or
-- future) date and then call the RPC once per date to mint +10 each. The per-day
-- dedup only guarantees ONE +10 per day — it says nothing about WHICH days, so the
-- "un-farmable" claim only held for today.
--
-- THE FIX: resolve the member's IANA timezone (client_profiles.timezone, captured
-- on app open) and require p_day to be TODAY in their own zone — no future, no
-- history, no cross-timezone slack. Until a member's zone is captured we fall back
-- to a tz-agnostic ±1 UTC window (the widest "today" can be in any zone) — still
-- far too tight to farm, since the dedup + the real-metric gate cap it to a single
-- +10 for a genuinely recent day. Idempotent / re-runnable.

-- ── shape_user_tz(uid) — the member's validated IANA timezone, or NULL ──────────
-- Joining pg_timezone_names guarantees we only ever return a name Postgres accepts,
-- so `now() at time zone <name>` can never raise on a malformed stored value.
-- SECURITY INVOKER (not definer) + PUBLIC execute revoked below: it's an internal
-- helper, not an RPC — the SECURITY DEFINER award functions call it as the owner,
-- and it only ever reads the CALLER's own row (v_uid = auth.uid()). This closes the
-- leak CodeRabbit/Codex flagged (a definer + PUBLIC helper would let any signed-in
-- caller pass another member's UUID and read their client_profiles.timezone).
create or replace function public.shape_user_tz(p_uid uuid)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select tz.name
    from public.client_profiles cp
    join pg_timezone_names tz on tz.name = cp.timezone
   where cp.user_id = p_uid
   limit 1;
$$;

-- Supabase's default privileges GRANT EXECUTE on new public functions to anon +
-- authenticated DIRECTLY (not via PUBLIC), so `from public` alone leaves those role
-- grants in place — revoke all three. The award RPCs (owned by the same role) can
-- still call it internally as the owner.
revoke execute on function public.shape_user_tz(uuid) from public, anon, authenticated;

-- ── award_workout_session — +10 once for a real workout on the caller's today ──
create or replace function public.award_workout_session(p_day date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := coalesce(p_day, current_date);
  v_tz  text := public.shape_user_tz(auth.uid());
  v_ins integer;
begin
  if v_uid is null then return jsonb_build_object('awarded', false); end if;
  -- Only the caller's OWN calendar day earns (Codex farm fix). Their zone when
  -- known (strict "today"); a tz-agnostic ±1 UTC window until it's captured.
  if v_tz is not null then
    if v_day <> (now() at time zone v_tz)::date then
      return jsonb_build_object('awarded', false, 'reason', 'not_today');
    end if;
  elsif v_day < current_date - 1 or v_day > current_date + 1 then
    return jsonb_build_object('awarded', false, 'reason', 'stale_day');
  end if;
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

-- ── award_meal_log — +10 once for a real meal on the caller's today ────────────
-- Upgrades the 2026-07-06 blunt UTC ±1 clamp to the same tz-aware "today" rule.
create or replace function public.award_meal_log(p_day date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := coalesce(p_day, current_date);
  v_tz  text := public.shape_user_tz(auth.uid());
  v_ins integer;
begin
  if v_uid is null then return jsonb_build_object('awarded', false); end if;
  -- Only the caller's OWN calendar day earns (Codex P1 farm fix) — same rule as
  -- award_workout_session. Their zone when known; ±1 UTC until it's captured.
  if v_tz is not null then
    if v_day <> (now() at time zone v_tz)::date then
      return jsonb_build_object('awarded', false, 'reason', 'not_today');
    end if;
  elsif v_day < current_date - 1 or v_day > current_date + 1 then
    return jsonb_build_object('awarded', false, 'reason', 'stale_day');
  end if;
  -- Gate on a REAL nutrition log that day (food macros; hydration alone doesn't count).
  if not exists (
    select 1 from public.daily_health_snapshot d
    where d.user_id = v_uid and d.snapshot_date = v_day
      and (coalesce(d.calories, 0) > 0 or coalesce(d.protein_g, 0) > 0
        or coalesce(d.carbs_g, 0) > 0 or coalesce(d.fat_g, 0) > 0)
  ) then return jsonb_build_object('awarded', false, 'reason', 'no_meal'); end if;
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (v_uid, 'nutrition', 'meal_log',
            md5('meal_log:' || v_uid::text || ':' || v_day::text)::uuid, 10, 'Meal logged')
    on conflict (user_id, source_kind, source_id)
      where source_kind is not null and source_id is not null
      do nothing;
  get diagnostics v_ins = row_count;
  return jsonb_build_object('awarded', v_ins > 0, 'points', case when v_ins > 0 then 10 else 0 end);
end $$;

grant execute on function public.award_meal_log(date) to authenticated;
