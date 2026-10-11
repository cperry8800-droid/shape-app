-- add_hydration's NaN guard never worked.
--
-- The water quick-add (2026-06-29-atomic-daily-snapshot-accumulators.sql)
-- rejects a bad delta with `p_delta <> p_delta`, on the belief that a NaN is
-- unequal to itself. In Postgres a numeric NaN EQUALS itself (measured on 16:
-- `'NaN'::numeric <> 'NaN'::numeric` is false), so the test never fires:
-- greatest(0, round('NaN', 3)) is NaN, and a signed-in member calling the RPC
-- directly could write NaN into their own hydration_l. 'Infinity' passed too.
-- add_meal_macros had the same test; 2026-10-11-dietary-kcal.sql fixes it.
--
-- This file compares against the values instead, keeps the signature (so the
-- grants carry over), the pin and everything else in the body, and clears any
-- NaN or Infinity either function could have stored (production held none
-- when this was written).
--
-- Re-runnable: create or replace, an update that only touches bad values, and
-- a guard at the end. Independent of 2026-10-11-dietary-kcal.sql; either may
-- run first.

begin;

-- ── Hydration quick-add (delta may be negative for undo; clamp >= 0, mL precision) ──
create or replace function public.add_hydration(p_delta numeric, p_date date)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_new numeric;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  -- Reject NULL, NaN and the infinities. ⚠ A numeric NaN EQUALS itself in
  -- Postgres, so test the value; `p_delta <> p_delta` never caught one.
  if p_delta is null or p_delta in ('NaN', 'Infinity', '-Infinity') then raise exception 'invalid delta'; end if;

  insert into public.daily_health_snapshot as d (user_id, snapshot_date, hydration_l)
    values (v_uid, p_date, greatest(0, round(p_delta, 3)))
  on conflict (user_id, snapshot_date) do update
    set hydration_l = greatest(0, round(coalesce(d.hydration_l, 0) + p_delta, 3)),
        updated_at = now()
  returning hydration_l into v_new;

  return v_new;
end;
$$;

-- The values the broken guards let through. A cleared field reads as not
-- logged, which is what a NaN meant.
update public.daily_health_snapshot
   set hydration_l = case when hydration_l in ('NaN', 'Infinity') then null else hydration_l end,
       protein_g   = case when protein_g   in ('NaN', 'Infinity') then null else protein_g   end,
       carbs_g     = case when carbs_g     in ('NaN', 'Infinity') then null else carbs_g     end,
       fat_g       = case when fat_g       in ('NaN', 'Infinity') then null else fat_g       end
 where hydration_l in ('NaN', 'Infinity')
    or protein_g   in ('NaN', 'Infinity')
    or carbs_g     in ('NaN', 'Infinity')
    or fat_g       in ('NaN', 'Infinity');

-- Guard: the function tests the value, is still a pinned definer a signed-in
-- member can call, and no bad value is left.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'add_hydration'
       and p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path=public, pg_temp%'
       and p.prosrc like '%p_delta in (''NaN'', ''Infinity'', ''-Infinity'')%'
  ) then
    raise exception 'add_hydration is not the pinned definer with the value-based NaN guard';
  end if;
  if not has_function_privilege('authenticated', 'public.add_hydration(numeric, date)', 'execute') then
    raise exception 'add_hydration is not executable by authenticated';
  end if;
  if exists (
    select 1 from public.daily_health_snapshot
     where hydration_l in ('NaN', 'Infinity') or protein_g in ('NaN', 'Infinity')
        or carbs_g in ('NaN', 'Infinity') or fat_g in ('NaN', 'Infinity')
  ) then
    raise exception 'a NaN or Infinity is still stored in daily_health_snapshot';
  end if;
end $$;

commit;
