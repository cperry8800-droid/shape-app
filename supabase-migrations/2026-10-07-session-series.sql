-- Recurring sessions: the bookings of one run share a series id. Coach Schedule upgrade, step 4.
-- Idempotent, safe to re-run.
--
-- Read and written by:
--   src/lib/session-series.ts           the run's dates on the coach's clock, and where a move
--                                       of "this and following" lands
--   src/app/api/sessions/manage/route.ts create with `repeat` stamps the id on every booking it
--                                       writes; cancel and reschedule with `scope: 'following'`
--                                       act on this booking and every later active one sharing it,
--                                       a reschedule through move_session_run (below)
--   src/app/api/calendar/route.ts       hands the id to the Schedule, which offers the scope
--
-- ── WHAT IT IS ────────────────────────────────────────────────────────────────
-- A nullable uuid. A booking that is not part of a run has none, which is every row written
-- before this file and every single booking after it. Each booking of a run is still an
-- ordinary `sessions` row (its own status, time, room and reminders), so nothing that reads
-- sessions has to know runs exist; the id only says which rows "this and following" means.
--
-- ⚠ NO NEW POLICY. The rows are written by the manage route with the service role after its own
-- checks (the coach owns the provider row; the client is theirs), exactly as a single booking
-- from an empty slot is, and RLS already gives each row to its coach and its client.
--
-- ⚠ THE INDEX LEADS WITH THE SERIES, THEN THE START: "this and following" is one series read
-- from one instant on, and a single booking (no series) is not in it at all.

alter table public.sessions add column if not exists series_id uuid;

comment on column public.sessions.series_id is
  'The run this booking belongs to (recurring sessions, 2026-10-07). Null for a single booking. '
  'Written by /api/sessions/manage create with repeat; read by its cancel/reschedule scope ''following''.';

create index if not exists sessions_series_idx
  on public.sessions (series_id, scheduled_at)
  where series_id is not null;

-- ── MOVING "THIS AND FOLLOWING" IN ONE TRANSACTION ─────────────────────────────
-- The manage route checks every new time against the coach's calendar first, then hands the
-- whole move here as [{ id, at }, …] in the order that cannot collide with a booking of the same
-- run still waiting to move (latest first when the run moves later). Each update is checked by
-- sessions_no_overlap as it runs, and ANY failure (a booking that took one of the times since the
-- check, a row that is no longer active or no longer the caller's) raises, which rolls back every
-- move before it.
--
-- ⚠ THIS REPLACES A MOVE MADE ONE UPDATE AT A TIME FROM THE ROUTE, put back by more updates when
-- one failed (Codex, the review of #2234). A put-back can itself be refused (another booking took
-- the time just vacated), and the route then said "Nothing was moved" over a half-moved run.
--
-- ⚠ SECURITY INVOKER: the caller's own row-level security decides what moves. A coach moves the
-- bookings of a provider row they own (provider_update_sessions); a member's update policy only
-- ever lets a row become cancelled (client_cancel_sessions), so a member calling this moves
-- nothing. It grants no write the caller does not already have.
create or replace function public.move_session_run(p_moves jsonb)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  m record;
  hit integer;
  n integer := 0;
begin
  if jsonb_typeof(p_moves) is distinct from 'array' or jsonb_array_length(p_moves) = 0 then
    raise exception 'move_session_run needs a list of moves' using errcode = '22023';
  end if;
  -- The same ceiling a run has when it is booked (src/lib/session-series.ts).
  if jsonb_array_length(p_moves) > 60 then
    raise exception 'move_session_run moves at most 60 sessions' using errcode = '22023';
  end if;
  for m in
    select (e.value ->> 'id')::uuid as id, (e.value ->> 'at')::timestamptz as at
      from jsonb_array_elements(p_moves) with ordinality as e(value, ord)
     order by e.ord
  loop
    update public.sessions
       set scheduled_at = m.at
     where id = m.id
       and status in ('requested', 'confirmed');
    get diagnostics hit = row_count;
    if hit <> 1 then
      raise exception 'session % could not be moved', m.id using errcode = 'P0002';
    end if;
    n := n + 1;
  end loop;
  return n;
end
$$;

revoke all on function public.move_session_run(jsonb) from public, anon;
grant execute on function public.move_session_run(jsonb) to authenticated;
