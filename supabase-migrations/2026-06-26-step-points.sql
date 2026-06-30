-- Shape Steps → Shape Score points.
--
-- 5,000 steps = 1 "Shape Step" = +1 point; hitting your daily step goal = +3 bonus.
-- Credited per COMPLETED day (a day's step count is only final after the day ends)
-- from the device-synced daily_health_snapshot.steps, idempotently — one ledger row
-- per day via the (user_id, source_kind, source_id) dedupe index.
--
-- ANTI-FARM: counts steps up to 20,000/day (max 4 Shape Steps), so a single day can
-- credit at most +7 (4 base + 3 goal bonus). Re-syncs / inflated counts can't be milked.
--
-- SECURITY DEFINER + auth.uid()-scoped (no user_id param — only ever credits the
-- caller) with HARD-CODED rates, so it can't be used to insert arbitrary points.

create or replace function public.award_step_points()
returns table(day date, points integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_goal integer;
  r record;
  v_shape_steps integer;
  v_bonus integer;
  v_total integer;
begin
  if v_uid is null then return; end if;

  -- The member's editable daily step goal (user_goals('client_step_goal').data.goal); default 8,000.
  select coalesce(nullif(data->>'goal', '')::integer, 8000) into v_goal
  from public.user_goals
  where user_id = v_uid and kind = 'client_step_goal'
  limit 1;
  if v_goal is null or v_goal < 1000 then v_goal := 8000; end if;

  for r in
    select snapshot_date as d, steps::integer as steps
    from public.daily_health_snapshot
    where user_id = v_uid
      and steps is not null and steps > 0
      and snapshot_date <  (now() at time zone 'utc')::date        -- completed days only
      and snapshot_date >= (now() at time zone 'utc')::date - 14   -- recent catch-up window
  loop
    v_shape_steps := least(4, floor(r.steps / 5000.0)::integer);   -- count steps up to 20k
    v_bonus := case when r.steps >= v_goal then 3 else 0 end;
    v_total := v_shape_steps + v_bonus;
    if v_total <= 0 then continue; end if;

    -- Bare ON CONFLICT DO NOTHING (no inference target) so it dedupes on the
    -- score_ledger_dedupe_idx whether that index is partial or plain — see
    -- 2026-06-26-score-ledger-dedupe-fix.sql.
    insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (
      v_uid, 'habits', 'step_points',
      md5('step_points:' || v_uid::text || ':' || r.d::text)::uuid,
      v_total,
      v_shape_steps || ' Shape Steps' || case when v_bonus > 0 then ' + goal' else '' end
    )
    on conflict do nothing;

    if found then
      day := r.d; points := v_total; return next;
    end if;
  end loop;
  return;
end;
$$;

revoke all on function public.award_step_points() from public;
grant execute on function public.award_step_points() to authenticated;
