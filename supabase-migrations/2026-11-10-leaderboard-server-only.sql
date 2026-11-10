-- The member board is read by the server, for the caller (Codex P1 on #2675).
--
-- WHAT WAS WRONG. Since #2675 the full board, a rank outside the top 10 and its movement are the
-- membership's (owner, 2026-11-10, after Strava). /api/leaderboard cuts a free or past-due
-- account's board to the top 10 after computeMembership, the one place that knows every way to be
-- paid (the admin allow-list included, which the database cannot see). But shape_member_board
-- stayed executable by authenticated (2026-10-15-leaderboards.sql), so any signed-in account could
-- call it through the REST API with p_limit 200 and read the whole board, every rank and its
-- movement, past the route's cut.
--
-- WHAT THIS DOES.
--   shape_member_board_for(p_viewer, p_scope, p_period, p_limit)   the board as p_viewer sees it.
--     It sets this transaction's caller to p_viewer (request.jwt.claim.sub and request.jwt.claims,
--     as PostgREST sets them for a signed-in request), so auth.uid() inside shape_member_board is
--     that account: every privacy rule, the following and team scopes and is_me read exactly as
--     for it. Then it puts the two settings back. Executable by service_role only:
--     /api/leaderboard passes the account the auth server verified (getUser).
--   shape_member_board(text, text, integer)   closed to authenticated, anon and public;
--     service_role keeps it. Its body is unchanged.
--   The old full-name boards (shape_leaderboard, shape_leaderboard_me) were closed to callers by
--   2026-10-15-leaderboards.sql already.
--
-- ⚠ RUN IT ONCE #2675 IS DEPLOYED. A route from before #2675 reads the board under the caller's
-- own session, which this closes, so its leaderboards would answer 502 until the deploy. The
-- route from #2675 reads either way: the wrapper once this has run, the session board before.
--
-- ⚠ 2026-10-15-leaderboards.sql grants shape_member_board to authenticated: a later run of it
-- reopens the board, so this file runs after it (its check below fails on an open board).
--
-- Tested on a local PostgreSQL 16 with Supabase's auth.uid() and roles: service_role reads the
-- board as each viewer (is_me follows p_viewer, and a null viewer is refused); authenticated and
-- anon can execute neither function; the settings are back after the call; a second run changed
-- nothing.
--
-- Idempotent, one transaction, lock_timeout 10 s.

begin;
set local lock_timeout = '10s';

create or replace function public.shape_member_board_for(
  p_viewer uuid,
  p_scope text default 'everyone',
  p_period text default 'month',
  p_limit integer default 50
)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  points bigint,
  rank bigint,
  prev_rank bigint,
  rank_points bigint,
  streak integer,
  training_days integer,
  meal_days integer,
  total bigint,
  is_me boolean
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_claims text := current_setting('request.jwt.claims', true);
begin
  if p_viewer is null then
    raise exception 'shape_member_board_for: no viewer' using errcode = '22023';
  end if;
  perform set_config('request.jwt.claim.sub', p_viewer::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer::text, 'role', 'authenticated')::text, true);
  return query select * from public.shape_member_board(p_scope, p_period, p_limit);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
end;
$$;

revoke all on function public.shape_member_board_for(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.shape_member_board_for(uuid, text, text, integer) to service_role;

revoke execute on function public.shape_member_board(text, text, integer) from public, anon, authenticated;
grant execute on function public.shape_member_board(text, text, integer) to service_role;

do $$
begin
  if has_function_privilege('authenticated', 'public.shape_member_board(text, text, integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.shape_member_board(text, text, integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.shape_member_board_for(uuid, text, text, integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.shape_member_board_for(uuid, text, text, integer)', 'EXECUTE') then
    raise exception 'leaderboard: the member board is still executable by a signed-in or anonymous caller';
  end if;
  if not has_function_privilege('service_role', 'public.shape_member_board_for(uuid, text, text, integer)', 'EXECUTE') then
    raise exception 'leaderboard: the server cannot read the member board';
  end if;
end;
$$;

commit;
