-- Atomic daily_health_snapshot accumulators — fix the read-then-write RACE in
-- /api/client/hydration + /api/nutrition/meal-log.
--
-- Both routes did: SELECT current value -> compute current + delta in JS -> UPDATE.
-- Two concurrent writers (the same member on their phone AND the /m/ web app, or a
-- quick-add tap that races an auto-retry) could each read the same value and overwrite
-- the other -> a LOST increment. These RPCs do the add inside ONE upsert: the
-- `ON CONFLICT DO UPDATE` reads the existing value under the row lock the upsert holds,
-- so the increment is atomic and serialized per (user, day).
--
-- SECURITY DEFINER + auth.uid()-scoped (a caller can only ever touch their OWN day);
-- search_path pinned; granted to `authenticated` only. Idempotent (create or replace).
-- The routes keep a read-then-write FALLBACK until this is applied, so deploy order
-- doesn't matter.

-- ── Hydration quick-add (delta may be negative for undo; clamp >= 0, mL precision) ──
create or replace function public.add_hydration(p_delta numeric, p_date date)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_new numeric;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  -- reject NULL / NaN (numeric NaN is unequal to itself)
  if p_delta is null or p_delta <> p_delta then raise exception 'invalid delta'; end if;

  insert into public.daily_health_snapshot as d (user_id, snapshot_date, hydration_l)
    values (v_uid, p_date, greatest(0, round(p_delta, 3)))
  on conflict (user_id, snapshot_date) do update
    set hydration_l = greatest(0, round(coalesce(d.hydration_l, 0) + p_delta, 3)),
        updated_at = now()
  returning hydration_l into v_new;

  return v_new;
end;
$$;

revoke all on function public.add_hydration(numeric, date) from public;
grant execute on function public.add_hydration(numeric, date) to authenticated;

-- ── Meal-log macro accumulate (NULL field = leave unchanged, exactly like the route) ──
create or replace function public.add_meal_macros(
  p_kcal numeric, p_protein numeric, p_carbs numeric, p_fat numeric, p_hydration numeric, p_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  insert into public.daily_health_snapshot as d
      (user_id, snapshot_date, calories, protein_g, carbs_g, fat_g, hydration_l)
    values (
      v_uid, p_date,
      case when p_kcal      is null then null else greatest(0, p_kcal) end,
      case when p_protein   is null then null else greatest(0, p_protein) end,
      case when p_carbs     is null then null else greatest(0, p_carbs) end,
      case when p_fat       is null then null else greatest(0, p_fat) end,
      case when p_hydration is null then null else greatest(0, round(p_hydration, 3)) end
    )
  on conflict (user_id, snapshot_date) do update set
    calories    = case when p_kcal      is null then d.calories    else coalesce(d.calories, 0)    + p_kcal      end,
    protein_g   = case when p_protein   is null then d.protein_g   else coalesce(d.protein_g, 0)   + p_protein   end,
    carbs_g     = case when p_carbs     is null then d.carbs_g     else coalesce(d.carbs_g, 0)     + p_carbs     end,
    fat_g       = case when p_fat       is null then d.fat_g       else coalesce(d.fat_g, 0)       + p_fat       end,
    hydration_l = case when p_hydration is null then d.hydration_l else greatest(0, round(coalesce(d.hydration_l, 0) + p_hydration, 3)) end,
    updated_at  = now();
end;
$$;

revoke all on function public.add_meal_macros(numeric, numeric, numeric, numeric, numeric, date) from public;
grant execute on function public.add_meal_macros(numeric, numeric, numeric, numeric, numeric, date) to authenticated;
