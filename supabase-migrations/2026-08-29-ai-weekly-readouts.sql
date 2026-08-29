-- The weekly readout's per-member weekly claim (2026-08-29).
--
-- §C of the check-in engine design says the readout is ONE model call per
-- member per week, "enforced SERVER-SIDE under an atomic per-member claim —
-- never in the UI". This is that claim, plus the store the finished readout
-- lands in.
--
-- ===== THE WEEK KEY IS THE MONDAY DATE, NOT AN ISO 'YYYY-Www' STRING =====
-- The repo already has a guarded implementation of "which week is this":
-- bsWeekStartOf (src/lib/week-merge.mjs) returns the Monday of a date's ISO
-- week as YYYY-MM-DD, with a round-trip calendar check because Date.UTC rolls
-- Feb 30 into March 2 rather than failing. A 'YYYY-Www' key would need the ISO
-- week-NUMBERING year, where Jan 1 can belong to week 52 of the previous year —
-- a second, subtler implementation of the same question, and a class of
-- off-by-one this store has no need to own. A Monday date sorts, compares and
-- reads correctly with no arithmetic at all.
--
-- ⚠ THE WEEK IS UTC ON PURPOSE, and that is a narrower claim than it looks.
-- shape_user_tz returns NULL for every account today (client_profiles holds 0
-- rows, verified against production while writing this), so a per-member zone
-- would resolve to the same UTC fallback for everyone AND cost a lookup. More
-- importantly it would be wrong in principle here: this key only decides how
-- often a readout REGENERATES, and a per-member zone resolves one instant to
-- two different weeks for a member who travels — re-issuing a readout they
-- already read. That is the same reasoning the notification dedup recorded for
-- its own UTC week (2026-08-21). Where a member's OWN day gates what they EARN
-- — award_workout_session, award_meal_log — the per-member zone is required and
-- is used; caching is not that.
--
-- ===== A STALE CLAIM IS RECLAIMED HERE, AND IS NOT IN claim_ai_action_undo ==
-- The obvious move is to copy the undo claim's rule verbatim: it deliberately
-- REFUSES to auto-reclaim an abandoned claim, because the two crash windows are
-- indistinguishable server-side and re-running the work would double-apply a
-- data reversal. Copying that here would be the copied-guard-loses-its-rationale
-- trap this repo keeps paying for. The work between claim and finalize is a
-- model call and a write of TEXT: a generator that dies before its call did
-- nothing, and one that dies after its call spent money and mutated nothing.
-- Re-running is therefore harmless in both windows, while refusing to reclaim
-- would strand the member on the deterministic path for the REST OF THE WEEK,
-- with no way back — a member-visible failure the undo case does not have.
-- So: a claim older than p_lease_seconds may be taken, by a guarded UPDATE that
-- reports FOUND (the claim_ai_action_undo mechanism), so of any number of
-- concurrent reclaimers exactly one wins.
--
-- ===== ONLY A REAL MODEL READOUT IS STORED =====
-- finalize is called only when generation actually produced a readout; every
-- other outcome RELEASES the claim. The deterministic fallback is recomputed
-- from live correlations on each request and costs nothing, so caching it would
-- buy nothing and would spend the member's whole week on a transient OpenAI
-- outage. The store therefore means exactly "the AI readout for this week",
-- which is the thing the one-call-per-week rule exists to conserve.
--
-- ===== THE STORED CORRELATIONS ARE STORED WITH IT, DELIBERATELY =====
-- Every insight references a correlation_key the UI plots. Serving a cached
-- readout beside correlations recomputed from TODAY's rows would let an insight
-- point at a chart that has since moved or vanished — the readout would cite
-- evidence the response no longer contains. The window and sample the readout
-- was computed from are stamped on the row for the same reason: a stored
-- readout rendered under this request's window would be a claim about days it
-- never saw.
--
-- Depends on is_coach_on_client(uuid) (2026-05-26-shared-clients.sql).
-- Idempotent. Safe to re-run.

-- ===== the store =====
create table if not exists public.ai_weekly_readouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Monday of the member's week, UTC. See the header.
  week_start date not null,
  status text not null default 'generating' check (status in ('generating', 'ready')),
  -- Rotates on every claim AND every reclaim, so a superseded claimer that
  -- finishes late cannot finalize over the caller that took its lease.
  claim_token uuid not null default gen_random_uuid(),
  claimed_at timestamptz not null default now(),
  readout jsonb,
  correlations jsonb,
  source text check (source in ('openai', 'fallback')),
  window_days integer,
  sample_size integer,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index if not exists ai_weekly_readouts_user_week_idx
  on public.ai_weekly_readouts (user_id, week_start desc);

alter table public.ai_weekly_readouts enable row level security;

-- Reads: the member, and a coach actively on that member. WRITES have no
-- policy at all — every write goes through the SECURITY DEFINER RPCs below, so
-- a caller cannot forge a 'ready' row or hand itself a claim it did not win.
drop policy if exists "own weekly readouts" on public.ai_weekly_readouts;
create policy "own weekly readouts" on public.ai_weekly_readouts
  for select using (auth.uid() = user_id);

drop policy if exists "coach reads client weekly readouts" on public.ai_weekly_readouts;
create policy "coach reads client weekly readouts" on public.ai_weekly_readouts
  for select using (public.is_coach_on_client(user_id));

-- ===== claim_weekly_readout: win the right to spend a model call =====
--
-- Returns exactly one row:
--   outcome 'ready'      -> a finished readout exists; the columns carry it and
--                           the caller MUST NOT call the model.
--   outcome 'claimed'    -> this caller holds the claim (claim_token set) and
--                           must generate, then finalize or release.
--   outcome 'generating' -> another caller holds a LIVE claim; this request
--                           serves the deterministic fallback and stores nothing.
create or replace function public.claim_weekly_readout(
  p_user_id uuid,
  p_week_start date,
  p_lease_seconds integer default 300
)
returns table (
  outcome text,
  claim_token uuid,
  readout jsonb,
  correlations jsonb,
  source text,
  window_days integer,
  sample_size integer,
  generated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_token uuid;
  v_row public.ai_weekly_readouts;
  v_lease interval;
begin
  if v_me is null then
    raise exception 'Authentication is required.';
  end if;
  if p_user_id is null or p_week_start is null then
    raise exception 'A member and a week are required.';
  end if;
  -- ⚠ THE PERMISSION CHECK IS LOAD-BEARING EVEN THOUGH THE READ IS RLS-SCOPED.
  -- The route's snapshot read already returns nothing for a member the caller
  -- cannot see, so a stranger passing someone else's id gets an empty readout
  -- rather than a leak — but without this they would still CONSUME that
  -- member's weekly claim, which is a denial of the feature, not a disclosure.
  if p_user_id <> v_me and not public.is_coach_on_client(p_user_id) then
    raise exception 'Not permitted to read this member''s readout.';
  end if;

  -- A lease under a second is not a lease; a caller passing 0 would make every
  -- concurrent request a reclaimer and defeat the whole mechanism.
  v_lease := make_interval(secs => greatest(30, least(3600, coalesce(p_lease_seconds, 300))));

  insert into public.ai_weekly_readouts (user_id, week_start)
  values (p_user_id, p_week_start)
  on conflict (user_id, week_start) do nothing
  returning public.ai_weekly_readouts.claim_token into v_token;

  if v_token is not null then
    return query select 'claimed'::text, v_token, null::jsonb, null::jsonb,
                        null::text, null::integer, null::integer, null::timestamptz;
    return;
  end if;

  select * into v_row
    from public.ai_weekly_readouts
   where user_id = p_user_id and week_start = p_week_start;

  if not found then
    -- The row was deleted between the insert's conflict and this read (a
    -- concurrent release). Tell the caller someone else is mid-flight rather
    -- than looping: the next request claims cleanly.
    return query select 'generating'::text, null::uuid, null::jsonb, null::jsonb,
                        null::text, null::integer, null::integer, null::timestamptz;
    return;
  end if;

  if v_row.status = 'ready' then
    return query select 'ready'::text, null::uuid, v_row.readout, v_row.correlations,
                        v_row.source, v_row.window_days, v_row.sample_size, v_row.generated_at;
    return;
  end if;

  -- The guarded reclaim. The claimed_at predicate is what makes it exclusive:
  -- the first reclaimer moves claimed_at to now(), so a second one's predicate
  -- no longer holds and it reports 'generating'. Rotating the token in the same
  -- statement is what stops the abandoned claimer finalizing over the winner.
  update public.ai_weekly_readouts
     set claimed_at = now(), claim_token = gen_random_uuid()
   where user_id = p_user_id
     and week_start = p_week_start
     and status = 'generating'
     and claimed_at < now() - v_lease
  returning public.ai_weekly_readouts.claim_token into v_token;

  if v_token is not null then
    return query select 'claimed'::text, v_token, null::jsonb, null::jsonb,
                        null::text, null::integer, null::integer, null::timestamptz;
    return;
  end if;

  return query select 'generating'::text, null::uuid, null::jsonb, null::jsonb,
                      null::text, null::integer, null::integer, null::timestamptz;
end;
$$;

-- ===== finalize_weekly_readout: store what the claim produced =====
--
-- Guarded on the claim token as well as the status, so a claimer whose lease
-- was taken writes NOTHING and its (older) readout is discarded in favour of
-- the caller that now holds the week.
create or replace function public.finalize_weekly_readout(
  p_user_id uuid,
  p_week_start date,
  p_claim_token uuid,
  p_readout jsonb,
  p_correlations jsonb,
  p_source text,
  p_window_days integer,
  p_sample_size integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Authentication is required.';
  end if;
  if p_user_id <> v_me and not public.is_coach_on_client(p_user_id) then
    raise exception 'Not permitted to write this member''s readout.';
  end if;
  if p_source is null or p_source not in ('openai', 'fallback') then
    raise exception 'Unknown readout source.';
  end if;

  update public.ai_weekly_readouts
     set status = 'ready',
         readout = p_readout,
         correlations = p_correlations,
         source = p_source,
         window_days = p_window_days,
         sample_size = p_sample_size,
         generated_at = now()
   where user_id = p_user_id
     and week_start = p_week_start
     and status = 'generating'
     and claim_token = p_claim_token;
  return found;
end;
$$;

-- ===== release_weekly_readout: hand the claim back =====
--
-- Called when generation produced nothing (no key, model down, nothing clears
-- the reportability gate). Deletes rather than flipping a status: a released
-- claim carries no readout, so leaving the row would only make the next caller
-- read an empty 'generating' it then has to reclaim on a lease it need not wait
-- for. Token-guarded for the same reason finalize is.
create or replace function public.release_weekly_readout(
  p_user_id uuid,
  p_week_start date,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Authentication is required.';
  end if;
  if p_user_id <> v_me and not public.is_coach_on_client(p_user_id) then
    raise exception 'Not permitted to write this member''s readout.';
  end if;

  delete from public.ai_weekly_readouts
   where user_id = p_user_id
     and week_start = p_week_start
     and status = 'generating'
     and claim_token = p_claim_token;
  return found;
end;
$$;

-- Supabase grants EXECUTE on a new public function to anon + authenticated by
-- default, and `revoke ... from public` does NOT remove those explicit grants —
-- the bug class 2026-06-30-rpc-authz-hardening.sql was written for. Every one
-- of these gates on auth.uid(), so anon must be revoked by name.
revoke all on function public.claim_weekly_readout(uuid, date, integer) from public, anon;
revoke all on function public.finalize_weekly_readout(uuid, date, uuid, jsonb, jsonb, text, integer, integer) from public, anon;
revoke all on function public.release_weekly_readout(uuid, date, uuid) from public, anon;
grant execute on function public.claim_weekly_readout(uuid, date, integer) to authenticated, service_role;
grant execute on function public.finalize_weekly_readout(uuid, date, uuid, jsonb, jsonb, text, integer, integer) to authenticated, service_role;
grant execute on function public.release_weekly_readout(uuid, date, uuid) to authenticated, service_role;

-- ===== structural guard =====
do $$
begin
  if to_regclass('public.ai_weekly_readouts') is null then
    raise exception 'ai_weekly_readouts was not created';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'ai_weekly_readouts' and c.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on ai_weekly_readouts';
  end if;
  -- No write policy may exist: writes go through the definer RPCs only.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'ai_weekly_readouts'
       and cmd <> 'SELECT'
  ) then
    raise exception 'ai_weekly_readouts has a non-SELECT policy; writes must stay RPC-only';
  end if;
  if has_function_privilege('anon', 'public.claim_weekly_readout(uuid, date, integer)', 'execute') then
    raise exception 'anon can still execute claim_weekly_readout';
  end if;
  if not has_function_privilege('authenticated', 'public.claim_weekly_readout(uuid, date, integer)', 'execute') then
    raise exception 'authenticated cannot execute claim_weekly_readout';
  end if;
end;
$$;
