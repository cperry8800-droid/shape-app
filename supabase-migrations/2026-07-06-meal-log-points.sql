-- Shape Score: logging a meal earns +10 once per day — mirrors award_workout_session
-- (2026-06-18-score-accountability.sql). Previously nutrition granted ZERO Score
-- points; the earn list now advertises "Log a meal +10", so this makes it real.
-- Idempotent / re-runnable.
--
-- Abuse resistance (same guarantees as the other award functions):
--   • Amount (+10) + category are hard-coded — callers can never supply a delta.
--   • user_id is ALWAYS auth.uid() — a caller can only award themselves.
--   • Gated on a REAL nutrition log on the day's daily_health_snapshot (food macros
--     only — a hydration-only quick-add is not a meal), so points can't be minted
--     without actually logging.
--   • Deduped on the unique (user_id, source_kind, source_id) index → one +10 per
--     calendar day no matter how many meals are logged (un-farmable).

-- 1) Allow the 'nutrition' earn category on the ledger (adds to the existing CHECK).
alter table public.score_ledger drop constraint if exists score_ledger_category_check;
alter table public.score_ledger add constraint score_ledger_category_check
  check (category in (
    'workouts','adherence','habits','prs','community',
    'endorsements','radio','referrals','nutrition','other'
  ));

-- 2) award_meal_log — +10 once/day for a real logged meal.
create or replace function public.award_meal_log(p_day date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_day date := coalesce(p_day, current_date); v_ins integer;
begin
  if v_uid is null then return jsonb_build_object('awarded', false); end if;
  -- Only the current day (±1 for the caller's timezone) can earn — p_day is
  -- caller-supplied and daily_health_snapshot is owner-writable, so without this
  -- clamp a caller could backfill arbitrary historical/future dates and mint +10
  -- each (Codex P1). One legit +10/day stands; the farm window is closed.
  if v_day < current_date - 1 or v_day > current_date + 1 then
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
