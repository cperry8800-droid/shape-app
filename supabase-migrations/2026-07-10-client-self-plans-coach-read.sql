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
-- Depends on is_coach_on_client(uuid) (2026-05-26-shared-clients.sql) and
-- the nullable trainer_id (2026-07-08-self-authored-workouts.sql).
-- Idempotent. Safe to re-run.

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
   order by w.scheduled_date asc nulls first, w.created_at desc
   limit 200;
end;
$$;

revoke all on function public.get_client_self_plans(uuid) from public;
revoke all on function public.get_client_self_plans(uuid) from anon;
grant execute on function public.get_client_self_plans(uuid) to authenticated;
