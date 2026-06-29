-- Atomic league cohort assignment — fix the check-then-act OVERFLOW race.
--
-- assignCohort() read the per-cohort member counts for (week, tier), picked the first
-- cohort with count < 24 in JS, and the caller wrote the member into it in a SEPARATE
-- round trip. At a new ISO-week boundary, many members joining / lazy-settling
-- concurrently all read "cohort 0 has room" and all wrote themselves into cohort 0
-- (league_members has only a non-unique (week,tier,cohort) index — nothing rejects the
-- overflow) -> cohorts ballooned far past the intended 24, corrupting the top-5-promote
-- / bottom-5-relegate fairness.
--
-- This RPC takes a per-(week,tier) advisory lock, computes the first cohort below the
-- cap, and writes the member in ONE transaction, so concurrent assigners serialize and
-- fill cohorts correctly. SECURITY DEFINER (the count must see all members; the settle
-- path reseeds via the service role) but a non-service caller may only assign itself.
-- Idempotent.

create or replace function public.league_assign_cohort(
  p_user_id uuid, p_week text, p_tier text, p_settled_week text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cohort int;
begin
  -- A signed-in user may assign only THEMSELVES; the service role (auth.uid() is null)
  -- may assign anyone (the lazy-settle path reseeds the member's own row as admin).
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Serialize every assigner for this (week, tier) so the count read + the write can't
  -- interleave across sessions. Released at transaction end.
  perform pg_advisory_xact_lock(hashtext(p_week || ':' || p_tier));

  -- First cohort index (0 .. max+1) whose membership is below the 24 cap.
  with counts as (
    select cohort, count(*)::int n
    from public.league_members
    where season_week = p_week and tier = p_tier
    group by cohort
  )
  select g.c into v_cohort
  from generate_series(0, coalesce((select max(cohort) from counts), 0) + 1) as g(c)
  left join counts on counts.cohort = g.c
  where coalesce(counts.n, 0) < 24
  order by g.c
  limit 1;
  v_cohort := coalesce(v_cohort, 0);

  insert into public.league_members as lm (user_id, tier, cohort, season_week, settled_week)
  values (p_user_id, p_tier, v_cohort, p_week, p_settled_week)
  on conflict (user_id) do update set
    tier         = excluded.tier,
    cohort       = excluded.cohort,
    season_week  = excluded.season_week,
    settled_week = excluded.settled_week;

  return v_cohort;
end;
$$;

grant execute on function public.league_assign_cohort(uuid, text, text, text) to authenticated;
