-- Shape Score ledger LOCKDOWN — close the direct self-insert hole.
-- Idempotent / re-runnable.
--
-- The score_ledger RLS previously let a user INSERT (and DELETE) arbitrary rows
-- for themselves — any category, any delta — directly via the Supabase client.
-- That is a score-inflation (and refund-forgery, via deleting a store_redeem
-- debit) vector. This migration routes EVERY legitimate write through a SECURITY
-- DEFINER function that hard-codes the amount (or derives it from a real,
-- caller-owned source row), then DROPS the owner INSERT/DELETE policies so direct
-- client writes are no longer possible. Owner SELECT (read your own ledger) stays.
--
-- Writers converted here:  habits route → award_habit / revoke_habit;
-- activities route → award_activity; goal milestones → DEFINER.
-- (PR-wall, check-in, community, tier-bonus, and store-redeem were already
-- DEFINER, so they are unaffected.)

-- 1) Habit completion → +3 'habits' (verifies the completion row is caller-owned).
create or replace function public.award_habit(p_completion_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or p_completion_id is null then return; end if;
  if not exists (
    select 1 from public.user_habit_completions where id = p_completion_id and user_id = v_uid
  ) then return; end if;
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (v_uid, 'habits', 'habit_completion', p_completion_id, 3, 'Habit')
    on conflict (user_id, source_kind, source_id) do nothing;
end $$;
grant execute on function public.award_habit(uuid) to authenticated;

-- 2) Undo a habit → remove ONLY that habit-completion's own award row.
create or replace function public.revoke_habit(p_completion_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or p_completion_id is null then return; end if;
  delete from public.score_ledger
    where user_id = v_uid and source_kind = 'habit_completion' and source_id = p_completion_id;
end $$;
grant execute on function public.revoke_habit(uuid) to authenticated;

-- 3) Activity logged → 'workouts', 1 pt / 5 min clamped 2–20, DERIVED from the
--    caller-owned activity row (the delta can't be supplied by the client).
create or replace function public.award_activity(p_activity_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_min  numeric;
  v_type text;
  v_pts  int;
begin
  if v_uid is null or p_activity_id is null then return; end if;
  select duration_min, activity_type into v_min, v_type
    from public.activities where id = p_activity_id and user_id = v_uid;
  if not found then return; end if;
  v_pts := greatest(2, least(20, round(coalesce(v_min, 10) / 5.0)))::int;
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (v_uid, 'workouts', 'activity', p_activity_id, v_pts, coalesce(v_type, 'Activity'))
    on conflict (user_id, source_kind, source_id) do nothing;
end $$;
grant execute on function public.award_activity(uuid) to authenticated;

-- 4) Goal milestones: INVOKER → DEFINER. Amounts are computed internally from the
--    real goal trajectory + latest weigh-in (no caller-supplied delta), so this no
--    longer relies on the owner-insert policy dropped in step 5. Body is otherwise
--    identical to 2026-06-12-goal-milestone-points.sql.
create or replace function public.award_my_goal_milestones()
returns table (milestone text, points integer)
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  o jsonb;
  v_start numeric;
  v_target numeric;
  v_now numeric;
  v_range numeric;
  v_latest numeric;
  def record;
begin
  if uid is null then
    return;
  end if;

  select data->'overall' into o
    from public.user_goals
   where user_id = uid and kind = 'client_goals'
   limit 1;
  if o is null then
    return;
  end if;

  v_start  := nullif(o->>'start', '')::numeric;
  v_target := nullif(o->>'target', '')::numeric;
  v_now    := nullif(o->>'now', '')::numeric;

  select w.weight into v_latest
    from public.client_weigh_ins w
   where w.user_id = uid
   order by w.logged_on desc
   limit 1;
  if v_latest is not null then
    v_now := v_latest;
  end if;

  if v_start is null or v_target is null or v_now is null then
    return;
  end if;
  v_range := v_start - v_target;
  if v_range = 0 then
    return;
  end if;

  for def in
    select * from (values
      ('25',  0.25::numeric,  50, '25% to goal'),
      ('50',  0.50::numeric,  75, 'Halfway to goal'),
      ('75',  0.75::numeric, 100, '75% to goal'),
      ('100', 1.00::numeric, 200, 'Goal reached')
    ) as v(key, frac, pts, label)
  loop
    if (v_range > 0 and v_now <= (v_start - v_range * def.frac) + 0.05)
       or (v_range < 0 and v_now >= (v_start - v_range * def.frac) - 0.05) then
      insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
      values (
        uid,
        'other',
        'goal_milestone',
        md5('goal_milestone:overall:' || def.key || ':' || uid::text)::uuid,
        def.pts,
        'Goal milestone · ' || def.label
      )
      on conflict (user_id, source_kind, source_id)
        where source_kind is not null and source_id is not null
        do nothing;
      if found then
        milestone := def.label;
        points := def.pts;
        return next;
      end if;
    end if;
  end loop;

  return;
end
$$;
grant execute on function public.award_my_goal_milestones() to authenticated;

-- 5) Remove the broad owner INSERT/DELETE policies. After this, a client can no
--    longer write score_ledger directly — every award/debit flows through the
--    DEFINER functions above (which hard-code/derive amounts + verify ownership)
--    or the existing DEFINER award/redeem RPCs. Owner SELECT is retained.
drop policy if exists "score_ledger insertable by owner" on public.score_ledger;
drop policy if exists "score_ledger deletable by owner" on public.score_ledger;
