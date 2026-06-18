-- Shape Score · Weekly commitments + stake (v2 — Phase E)
--
-- A coach (for their client) or a member (solo) sets a one-ISO-week commitment on
-- auto-tracked counts ({ workouts?, checkin?, habits? }) and stakes 5–50 points,
-- two-sided: hit ALL targets → +stake, miss → −stake (floored at the 0 balance, never
-- negative). Coach-set commitments are PROPOSED and need client consent before any
-- points are at risk. The daily accountability cron settles last week's commitments.
--
-- Wins/losses use source_kind commitment_win / commitment_loss (category adherence) —
-- NOT penalty_%, so they're outside the −30/week penalty cap (it's a voluntary bet).
-- All point writes go through settle_commitment (no direct ledger writes). No CHECK
-- migration. Idempotent to re-run.

-- ── table ────────────────────────────────────────────────────────────────────
create table if not exists public.score_commitments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,   -- the committer
  created_by  uuid not null references auth.users(id) on delete cascade,   -- coach or self
  week_of     date not null,                                                -- ISO Monday
  targets     jsonb not null default '{}'::jsonb,                           -- { workouts?, checkin?, habits? }
  stake       integer not null check (stake between 5 and 50),
  status      text not null default 'active' check (status in ('proposed','active','met','missed')),
  settled_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, week_of)
);

alter table public.score_commitments enable row level security;

-- Reads: the owner + their coach. Writes go ONLY through the DEFINER RPCs below.
drop policy if exists "commitments read own or coach" on public.score_commitments;
create policy "commitments read own or coach" on public.score_commitments
  for select using (user_id = auth.uid() or public.is_coach_on_client(user_id));

-- ── set_commitment (self → active, coach → proposed) ─────────────────────────
create or replace function public.set_commitment(p_user uuid, p_targets jsonb, p_stake int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_week   date := date_trunc('week', now())::date;   -- this ISO week's Monday
  v_status text;
  v_stake  int := greatest(5, least(50, coalesce(p_stake, 0)));
  v_row    public.score_commitments;
begin
  if v_caller is null or p_user is null then return jsonb_build_object('ok', false); end if;
  if p_user = v_caller then
    v_status := 'active';                          -- self-set: live immediately
  elsif public.is_coach_on_client(p_user) then
    v_status := 'proposed';                        -- coach-set: needs client consent
  else
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  -- require at least one meaningful target
  if not ( coalesce((p_targets->>'workouts')::int, 0) > 0
        or coalesce((p_targets->>'checkin')::boolean, false)
        or coalesce((p_targets->>'habits')::int, 0) > 0 ) then
    return jsonb_build_object('ok', false, 'reason', 'no_targets');
  end if;
  insert into public.score_commitments (user_id, created_by, week_of, targets, stake, status)
    values (p_user, v_caller, v_week, coalesce(p_targets, '{}'::jsonb), v_stake, v_status)
    on conflict (user_id, week_of) do update
      set targets = excluded.targets, stake = excluded.stake,
          created_by = excluded.created_by, status = excluded.status
      where score_commitments.status in ('proposed', 'active')   -- never overwrite a settled week
    returning * into v_row;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'already_settled');
  end if;
  return jsonb_build_object('ok', true, 'id', v_row.id, 'status', v_row.status,
                            'stake', v_row.stake, 'week_of', v_row.week_of);
end $$;

grant execute on function public.set_commitment(uuid, jsonb, int) to authenticated;

-- ── accept_commitment (client consents to a coach proposal) ──────────────────
create or replace function public.accept_commitment(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if auth.uid() is null or p_id is null then return jsonb_build_object('accepted', false); end if;
  update public.score_commitments set status = 'active'
    where id = p_id and user_id = auth.uid() and status = 'proposed';
  get diagnostics v_n = row_count;
  return jsonb_build_object('accepted', v_n > 0);
end $$;

grant execute on function public.accept_commitment(uuid) to authenticated;

-- ── settle_commitment (cron, service-role only) ──────────────────────────────
create or replace function public.settle_commitment(p_user uuid, p_week date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c        public.score_commitments;
  v_workouts int;
  v_checkin  boolean;
  v_habits   int;
  v_met      boolean := true;
  v_balance  int;
  v_amount   int;
  v_skind    text;
begin
  if p_user is null or p_week is null then return jsonb_build_object('settled', false); end if;
  perform pg_advisory_xact_lock(hashtext('shape_commitment'), hashtext(p_user::text));
  select * into v_c from public.score_commitments
    where user_id = p_user and week_of = p_week and status = 'active';
  if v_c.id is null then return jsonb_build_object('settled', false, 'reason', 'none'); end if;
  if now() < p_week + 7 then return jsonb_build_object('settled', false, 'reason', 'too_early'); end if;

  -- Actuals over the commitment's ISO week [week, week+6].
  select count(distinct d) into v_workouts from (
    select snapshot_date::date as d from public.daily_health_snapshot
      where user_id = p_user and snapshot_date between p_week and p_week + 6 and coalesce(workout_minutes, 0) > 0
    union
    select (started_at)::date from public.activities
      where user_id = p_user and (started_at)::date between p_week and p_week + 6
  ) w;
  v_checkin := exists (select 1 from public.client_checkins where user_id = p_user and week_of = p_week);
  select count(*) into v_habits from public.user_habit_completions
    where user_id = p_user and done_on between p_week and p_week + 6;

  -- met = every SPECIFIED target reached (mirrors commitments.mjs commitmentMet).
  if (v_c.targets ? 'workouts') and v_workouts < coalesce((v_c.targets->>'workouts')::int, 0) then v_met := false; end if;
  if coalesce((v_c.targets->>'checkin')::boolean, false) and not v_checkin then v_met := false; end if;
  if (v_c.targets ? 'habits') and v_habits < coalesce((v_c.targets->>'habits')::int, 0) then v_met := false; end if;

  if v_met then
    v_amount := v_c.stake; v_skind := 'commitment_win';
  else
    -- loss clamped by the 0 spendable-balance floor (never go negative).
    select coalesce(sum(delta), 0) into v_balance from public.score_ledger where user_id = p_user;
    v_amount := -least(v_c.stake, greatest(0, v_balance)); v_skind := 'commitment_loss';
  end if;

  if v_amount <> 0 then
    insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
      values (p_user, 'adherence', v_skind, v_c.id, v_amount,
              case when v_met then 'Commitment kept' else 'Commitment missed' end)
      on conflict (user_id, source_kind, source_id)
        where source_kind is not null and source_id is not null
        do nothing;
  end if;
  update public.score_commitments
    set status = case when v_met then 'met' else 'missed' end, settled_at = now()
    where id = v_c.id;
  return jsonb_build_object('settled', true, 'met', v_met, 'amount', v_amount);
end $$;

revoke all on function public.settle_commitment(uuid, date) from public;
grant execute on function public.settle_commitment(uuid, date) to service_role;
