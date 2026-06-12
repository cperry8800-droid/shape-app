-- Shape points for completed goal milestones.
--
-- award_my_goal_milestones(): self-scoped, SECURITY INVOKER (RLS does the
-- scoping — the caller owns every row touched). Reads the Overall body-comp
-- goal (user_goals 'client_goals' → data.overall) plus the latest weigh-in
-- (client_weigh_ins wins over the JSONB doc), computes the 25% / 50% / 75% /
-- goal thresholds along the start→target trajectory (cut or build — the sign
-- of the range handles both), and inserts ONE score_ledger row per newly
-- reached milestone. Idempotent: source_id is a deterministic md5 uuid per
-- (user, milestone), deduped by the existing partial unique index
-- (user_id, source_kind, source_id) + ON CONFLICT DO NOTHING.
--
-- Awards: 25% → +50 · halfway → +75 · 75% → +100 · goal → +200.
-- Returns the milestones credited by THIS call (empty when nothing new).
--
-- Called from the app after every weigh-in log and on Goals-page load
-- (window.ShapeGoalAwards.check). Safe to re-run; safe to call repeatedly.

create or replace function public.award_my_goal_milestones()
returns table (milestone text, points integer)
language plpgsql
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

  -- The dedicated weigh-in table is the source of truth for "now".
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
