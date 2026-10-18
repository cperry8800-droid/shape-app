-- Water from Apple Health, added to the glasses logged in Shape (owner, 2026-10-18: the daily
-- check-in's Phase 2, "Add them together").
--
-- daily_health_snapshot.hydration_l stays the day's total, so every reader keeps working: the
-- check-in card, the full check-in page, the website, the engine's hydration_low, the coach's
-- case file, roster vitals, the correlations and Nora. Shape never writes water to Apple Health,
-- so Apple Health's total never already holds a glass logged in Shape.
--
--   set_apple_health_water(p_date, p_l) records Apple Health's total for the member's day as an
--   observation (health_metric_observations, metric 'hydration_l', source 'apple_health') and
--   moves hydration_l by the change from the last reading: total − last reading + this reading.
--
-- ⚠ A SYNC REPLACES ONLY APPLE HEALTH'S OWN SHARE. Glasses added in Shape before or after a sync
-- stay in the total, and a sync that sends the same 14 days again changes nothing. Written through
-- upsertSnapshot instead, a sync would have overwritten the day's glasses (the collision
-- 2026-10-11-dietary-kcal.sql split calories for).
-- ⚠ THE DAY'S ROW IS LOCKED FIRST, so a glass added in Shape (add_hydration, which updates the
-- same row) and a sync never interleave.
-- ⚠ A ZERO READING WITH NO EARLIER ONE WRITES NOTHING: the app sends every day in its window,
-- with or without water, so a member with no water in Apple Health is not given empty rows.
--
-- SECURITY DEFINER, scoped to auth.uid(), 0-20 L, the last 16 days through tomorrow (UTC, so
-- every zone's today fits). Revoked from public and anon by name. One transaction, re-runnable,
-- a guard at the end. Not run by this PR.

begin;
set local lock_timeout = '10s';

create or replace function public.set_apple_health_water(p_date date, p_l numeric)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_new numeric;
  v_prev numeric;
  v_total numeric;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  -- NULL, NaN and the infinities are refused (a numeric NaN equals itself in Postgres).
  if p_l is null or p_l in ('NaN', 'Infinity', '-Infinity') or p_l < 0 or p_l > 20 then raise exception 'invalid water'; end if;
  if p_date is null or p_date > (now() at time zone 'utc')::date + 1 or p_date < (now() at time zone 'utc')::date - 16 then
    raise exception 'date out of range';
  end if;
  v_new := round(p_l, 2);

  select o.value into v_prev
    from public.health_metric_observations o
   where o.user_id = v_uid and o.snapshot_date = p_date and o.metric = 'hydration_l' and o.source = 'apple_health';
  if v_prev is null and v_new = 0 then return null; end if;

  insert into public.daily_health_snapshot (user_id, snapshot_date) values (v_uid, p_date)
    on conflict (user_id, snapshot_date) do nothing;
  select d.hydration_l into v_total
    from public.daily_health_snapshot d
   where d.user_id = v_uid and d.snapshot_date = p_date
     for update;
  -- Read again under the lock: a second sync of the same day waited here for the first.
  select o.value into v_prev
    from public.health_metric_observations o
   where o.user_id = v_uid and o.snapshot_date = p_date and o.metric = 'hydration_l' and o.source = 'apple_health';
  if v_prev = v_new then return v_total; end if;

  insert into public.health_metric_observations (user_id, snapshot_date, metric, source, value, observed_at)
    values (v_uid, p_date, 'hydration_l', 'apple_health', v_new, now())
  on conflict (user_id, snapshot_date, metric, source) do update
    set value = excluded.value, observed_at = excluded.observed_at;

  update public.daily_health_snapshot d
     set hydration_l = least(99.99, greatest(0, round(coalesce(d.hydration_l, 0) - coalesce(v_prev, 0) + v_new, 2))),
         updated_at = now()
   where d.user_id = v_uid and d.snapshot_date = p_date
  returning d.hydration_l into v_total;
  return v_total;
end;
$$;

revoke all on function public.set_apple_health_water(date, numeric) from public, anon;
grant execute on function public.set_apple_health_water(date, numeric) to authenticated, service_role;

-- ── Guard ──────────────────────────────────────────────────────────────────────
do $guard$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_apple_health_water' and p.prosecdef
  ) then
    raise exception 'set_apple_health_water is missing or not security definer';
  end if;
  if has_function_privilege('anon', 'public.set_apple_health_water(date, numeric)', 'EXECUTE') then
    raise exception 'set_apple_health_water is executable by anon';
  end if;
  if not has_function_privilege('authenticated', 'public.set_apple_health_water(date, numeric)', 'EXECUTE') then
    raise exception 'members cannot record Apple Health water';
  end if;
end;
$guard$;

commit;
