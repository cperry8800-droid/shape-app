-- Momentum counts a morning check-in (owner, 2026-10-19: "count energy or Rested toward momentum";
-- docs/REVIEW-2026-10-19-morning-checkin.md ruling 7).
--
--   A day is active when its snapshot has an energy or a Rested (sleep_quality) answer, as it
--   already is for calories eaten or burned, workout minutes, or sleep hours (typed or synced).
--   Hunger and water alone still do not make a day active.
--
-- ⚠ THE SAME BODY AS 2026-10-11-dietary-kcal.sql, ONE CLAUSE WIDER. It keeps dietary_kcal (that
-- file's guard reads it), the auth.uid() gate (the definer allowlist's self-gated-auth-uid class)
-- and the pinned search_path. Create or replace keeps the existing grants, so none are restated
-- here. Re-running 2026-10-11-dietary-kcal.sql after this file puts the narrower body back; run
-- this one again after it.
--
-- One transaction, re-runnable, a guard at the end. Not run by this PR.

begin;
set local lock_timeout = '10s';

create or replace function public.compute_momentum()
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_m   integer := 0;
  r     record;
begin
  if v_uid is null then return 0; end if;
  -- The window is UTC-calendar-day-based (current_date / generate_series resolve in
  -- the DB session tz = UTC on Supabase), matching the route's composite block. The
  -- day-scoped WRITERS bucket on the user's LOCAL day, so a boundary day near local
  -- midnight can read one notch off — this can only UNDERCOUNT (never farm: it can't
  -- exceed +25/week, double-credit, or invent activity), and a single check-in marks
  -- its whole Mon..Sun week active, masking most edge cases. Known + accepted.
  for r in
    select
      (
        exists (
          select 1 from public.daily_health_snapshot s
          where s.user_id = v_uid
            and s.snapshot_date = g.d::date
            and (s.dietary_kcal > 0 or s.calories > 0 or s.workout_minutes > 0 or s.sleep_hours > 0
                 or s.energy is not null or s.sleep_quality is not null)
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

-- ── Guard ──────────────────────────────────────────────────────────────────────
do $guard$
declare
  v_src text;
  v_def boolean;
  v_cfg text[];
begin
  select p.prosrc, p.prosecdef, p.proconfig into v_src, v_def, v_cfg
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'compute_momentum' and p.pronargs = 0;
  if v_src is null then
    raise exception 'compute_momentum is missing';
  end if;
  if not v_def then
    raise exception 'compute_momentum is not security definer';
  end if;
  if not ('search_path=public, pg_temp' = any (coalesce(v_cfg, '{}'))) then
    raise exception 'compute_momentum lost its pinned search_path';
  end if;
  if position('s.energy is not null' in v_src) = 0 or position('s.sleep_quality is not null' in v_src) = 0 then
    raise exception 'compute_momentum does not count a morning check-in';
  end if;
  if position('dietary_kcal' in v_src) = 0 or position('auth.uid()' in v_src) = 0 then
    raise exception 'compute_momentum lost dietary_kcal or its auth.uid() gate';
  end if;
end;
$guard$;

commit;
