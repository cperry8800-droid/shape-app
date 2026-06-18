-- Shape Score · Momentum bonus escalation (v2 — Phase D)
--
-- Replaces the Phase B award_momentum_bonus() (a flat +25/week) with an ESCALATING
-- bonus: +15 for each consecutive immediately-prior ISO week that also earned the
-- bonus, capped at +100 — a six-rung ramp 25 → 40 → 55 → 70 → 85 → 100. A missed
-- week resets the streak. Mirrors mobile-app/src/services/momentum.mjs momentumBonus().
--
-- Same signature, same auth.uid() scoping, same per-ISO-week idempotency source_id, so
-- a week is still credited at most once (the delta is just larger on a streak). No new
-- source_kind, no CHECK change. Idempotent to re-run. Run AFTER 2026-06-18-score-momentum.sql.

create or replace function public.award_momentum_bonus()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_m      integer;
  v_streak integer := 0;
  v_n      integer;
  v_delta  integer;
  v_ins    integer;
begin
  if v_uid is null then return jsonb_build_object('awarded', false); end if;
  v_m := public.compute_momentum();
  if v_m < 80 then  -- BONUS_THRESHOLD
    return jsonb_build_object('awarded', false, 'momentum', v_m, 'streak_weeks', 0);
  end if;
  -- Count consecutive immediately-prior ISO weeks that already have a momentum_bonus row.
  for v_n in 1..6 loop
    if exists (
      select 1 from public.score_ledger
      where user_id = v_uid and source_kind = 'momentum_bonus'
        and to_char(earned_at, 'IYYY-"W"IW') = to_char(now() - (v_n || ' weeks')::interval, 'IYYY-"W"IW')
    ) then
      v_streak := v_streak + 1;
    else
      exit;  -- a gap breaks the streak
    end if;
  end loop;
  v_delta := least(100, 25 + 15 * v_streak);  -- mirrors momentum.mjs momentumBonus()
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (
      v_uid, 'adherence', 'momentum_bonus',
      md5('momentum_bonus:' || v_uid::text || ':' || to_char(now(), 'IYYY-"W"IW'))::uuid,
      v_delta, 'Momentum bonus'
    )
    on conflict (user_id, source_kind, source_id)
      where source_kind is not null and source_id is not null
      do nothing;
  get diagnostics v_ins = row_count;
  return jsonb_build_object(
    'awarded',      v_ins > 0,
    'momentum',     v_m,
    'streak_weeks', v_streak + 1,                       -- incl. this week
    'points',       case when v_ins > 0 then v_delta else 0 end
  );
end $$;

grant execute on function public.award_momentum_bonus() to authenticated;
