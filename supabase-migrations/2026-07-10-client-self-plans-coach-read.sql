-- Coach read of a member's SELF-AUTHORED training (2026-07-10).
--
-- Self-serve training (2026-07-08-self-authored-workouts.sql) left a v1 gap:
-- a coach could see a self-programming member's session LOGS but not the
-- plan itself — the self rows live in client_workouts with trainer_id NULL,
-- and the coach RLS policies are scoped to the coach's OWN authored rows.
--
-- get_client_self_plans(p_user_id) is the read: SECURITY DEFINER, gated on
-- is_coach_on_client (the get_client_stats / get_client_lifts precedent — an
-- active coach↔client subscription is the permission), returning a COMPACT
-- projection of the member's self rows: title/kind/date + the payload's
-- program stamp + weekly-repeat days + a move count. Never the full payload
-- (no loads/cues/notes — the Case File summarizes; the member's authored
-- detail stays theirs).
--
-- The read is WINDOWED to what the Case File can honestly summarize: undated
-- rows (weekly repeats / drafts) + rows dated from a week back forward,
-- nearest-first, capped 200. Without the window, a member with a long
-- self-history (two saved 26-week programs already exceed 200 rows) would
-- have the oldest rows consume the cap and the coach could miss the CURRENT
-- run entirely — or read an active program as past (Codex P2 on the PR).
-- The -7d lookback keeps "today" timezone-safe (server day vs member day)
-- and lets a just-finished run still read PAST for a few days.
--
-- Depends on is_coach_on_client(uuid) (2026-05-26-shared-clients.sql) and
-- the nullable trainer_id (2026-07-08-self-authored-workouts.sql).
-- Idempotent. Safe to re-run.

-- Partial index for the self-row read (client_workouts_client_idx covers
-- client_id alone; this one serves the trainer_id-NULL filter + date order
-- directly and stays tiny — self rows only).
create index if not exists client_workouts_self_by_date_idx
  on public.client_workouts (client_id, scheduled_date)
  where trainer_id is null;

drop function if exists public.get_client_self_plans(uuid);
create or replace function public.get_client_self_plans(p_user_id uuid)
returns table (
  id uuid,
  title text,
  kind text,
  scheduled_date date,
  repeat_dow jsonb,
  program jsonb,
  move_count int,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;
  if not public.is_coach_on_client(p_user_id) then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return query
  select w.id,
         w.title,
         w.kind,
         w.scheduled_date,
         case when jsonb_typeof(w.payload->'repeatDow') = 'array' then w.payload->'repeatDow' else null end,
         case when jsonb_typeof(w.payload->'program') = 'object' then w.payload->'program' else null end,
         case when jsonb_typeof(w.payload->'exercises') = 'array' then jsonb_array_length(w.payload->'exercises') else 0 end,
         w.created_at
    from public.client_workouts w
   where w.client_id = p_user_id
     and w.trainer_id is null
     -- The relevance window: undated (repeats/drafts) + last-week-forward.
     -- Nearest-first so the cap can only ever trim the FAR tail of a long
     -- program — never the current/upcoming sessions.
     and (w.scheduled_date is null or w.scheduled_date >= (now() at time zone 'utc')::date - 7)
   order by w.scheduled_date asc nulls first, w.created_at desc
   limit 200;
end;
$$;

revoke all on function public.get_client_self_plans(uuid) from public;
revoke all on function public.get_client_self_plans(uuid) from anon;
grant execute on function public.get_client_self_plans(uuid) to authenticated;
