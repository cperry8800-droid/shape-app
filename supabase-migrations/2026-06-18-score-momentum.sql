-- Shape Score · Momentum meter (Momentum/Accountability — Phase B)
--
-- compute_momentum()     — the CALLER'S own 0..100 "don't break the streak" meter,
--                          folded over the trailing 30 calendar days (oldest→newest):
--                          +7 per ACTIVE day, −12 per missed day, clamped 0..100 — a
--                          notch, not a reset. A day is ACTIVE when the caller did
--                          ANY of these that day: logged a health snapshot with a real
--                          metric (calories / workout_minutes / sleep_hours > 0),
--                          completed a habit, or has a weekly check-in covering it.
--                          Mirrors mobile-app/src/services/momentum.mjs EXACTLY
--                          (STEP_UP=7, STEP_DOWN=12) — change both together.
--
-- award_momentum_bonus() — once per ISO week, if the caller's momentum is ≥ 80
--                          (BONUS_THRESHOLD), credit +25 (BONUS_POINTS) into
--                          score_ledger. Idempotent per ISO week via a deterministic
--                          md5-uuid source_id + the score_ledger_dedupe_idx partial index.
--
-- Both are SECURITY DEFINER and auth.uid()-SCOPED — a caller can only ever read/earn
-- for THEMSELVES; neither accepts a user_id parameter (matches the 2026-06-18 ledger
-- lockdown discipline). No CHECK migration: the bonus reuses category 'adherence' (an
-- already-allowed value). Fire-and-forget: callers no-op until this is applied.
-- Idempotent to re-run (create or replace + dedupe index already exists).

-- ── compute_momentum() ───────────────────────────────────────────────────────
-- A plpgsql loop folds the +7 / −12 clamp recurrence in date order, reading exactly
-- like the .mjs. auth.uid() is captured once into v_uid.
create or replace function public.compute_momentum()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_m   integer := 0;
  r     record;
begin
  if v_uid is null then return 0; end if;
  for r in
    select
      (
        exists (
          select 1 from public.daily_health_snapshot s
          where s.user_id = v_uid
            and s.snapshot_date = g.d::date
            and (s.calories > 0 or s.workout_minutes > 0 or s.sleep_hours > 0)
        )
        or exists (
          select 1 from public.user_habit_completions hc
          where hc.user_id = v_uid and hc.done_on = g.d::date
        )
        or exists (
          select 1 from public.client_checkins c
          where c.user_id = v_uid
            and c.week_of <= g.d::date and g.d::date < c.week_of + 7
        )
      ) as active
    from generate_series(current_date - 29, current_date, interval '1 day') as g(d)
    order by g.d   -- oldest → newest
  loop
    v_m := greatest(0, least(100, v_m + case when r.active then 7 else -12 end));
  end loop;
  return v_m;
end $$;

grant execute on function public.compute_momentum() to authenticated;

-- ── award_momentum_bonus() ───────────────────────────────────────────────────
-- Derives the genuine momentum from real, caller-owned data — never awards on a bare
-- call — and credits +25 at most once per ISO week.
create or replace function public.award_momentum_bonus()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_m   integer;
  v_ins integer;
begin
  if v_uid is null then
    return jsonb_build_object('awarded', false);
  end if;
  v_m := public.compute_momentum();
  if v_m < 80 then  -- BONUS_THRESHOLD (mirror of momentum.mjs)
    return jsonb_build_object('awarded', false, 'momentum', v_m);
  end if;
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (
      v_uid, 'adherence', 'momentum_bonus',
      md5('momentum_bonus:' || v_uid::text || ':' || to_char(now(), 'IYYY-"W"IW'))::uuid,
      25, 'Momentum bonus'  -- BONUS_POINTS
    )
    on conflict (user_id, source_kind, source_id) do nothing;
  get diagnostics v_ins = row_count;
  return jsonb_build_object(
    'awarded',  v_ins > 0,
    'momentum', v_m,
    'points',   case when v_ins > 0 then 25 else 0 end
  );
end $$;

grant execute on function public.award_momentum_bonus() to authenticated;
