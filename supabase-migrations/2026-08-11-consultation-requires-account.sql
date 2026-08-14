-- Booking a session requires a signed-in Shape account (owner ruling, 2026-08-14),
-- and a caller may only book AS THEMSELVES.
--
-- WHY
-- /api/consultation was fully anonymous. The row it writes carries status 'requested',
-- /api/availability treats 'requested' as booked, and sessions_no_conflict_idx denies the
-- slot a second way -- so anyone with no account could fill a coach's calendar with fakes
-- until real prospects saw no availability. Denial of availability, not a data leak.
--
-- ⚠ THE ROUTE-LEVEL AUTH CHECK IS DECORATIVE WITHOUT THIS FILE. The policy being replaced,
-- `anon_insert_sessions`, was granted to BOTH anon AND authenticated and its ONLY test was
-- `status = 'requested'`. So a caller could write the row STRAIGHT TO POSTGREST using the
-- publishable key that ships in every page's JavaScript, never touching the Next route --
-- bypassing its Turnstile check and the proxy rate limiter completely. Unlimited and
-- unthrottled. The migration that created it asserts in its own comment that "the API route
-- validates fields before forwarding"; that because-clause was false for this policy, because
-- the policy is reachable without the route.
--
-- ⚠ A SECOND HOLE, FOUND WHILE FIXING THE FIRST AND NOT PREVIOUSLY RECORDED. That policy also
-- never pinned `client_id`. A signed-in member could therefore insert a session row carrying
-- ANY client_id -- booking on another member's behalf, or writing an ownerless row -- and it
-- would pass. The replacement pins client_id = auth.uid(), which closes it.
--
-- WHY NOT SIMPLY DROP IT
-- Dropping without replacing would break in-app booking for signed-in members: both
-- public/supabase.js requestSession and mobile shapeBackend createSessionRequest insert into
-- `sessions` DIRECTLY under the caller's own session, not through any API route. Both set
-- client_id from the live session, so the tightened policy leaves the signed-in path working.
--
-- ⚠ ONE CALLER IS NOT UNCONDITIONALLY SAFE, and an earlier draft of this paragraph said it was.
-- public/supabase.js requestSession hard-fails without a session, so it genuinely cannot be
-- affected. mobile shapeBackend createSessionRequest does `client_id: state.user?.id || null`
-- and TOLERATES a null user (its email can come from the clientEmail argument). Under this
-- policy that insert is rejected -- `NULL = auth.uid()` is NULL, so WITH CHECK fails -- and the
-- function falls through to saveLocalRecord(..., error). So a booking attempted while auth
-- state is still unhydrated now lands ONLY in local storage. That is the intended direction of
-- the hardening (an unidentified caller must not hold a coach's slot) and it degrades to the
-- path that function already has for failure, but it is a behaviour change, not a no-op.
--
-- The consultation route itself is unaffected by RLS -- it inserts with the service-role
-- client, which bypasses row-level security. Only the direct-from-browser path changes.

-- Replace the policy rather than editing it: a create-then-drop leaves a window in which both
-- exist and the permissive one still wins, since Postgres ORs permissive policies together.
drop policy if exists anon_insert_sessions on public.sessions;

create policy client_insert_own_sessions on public.sessions
  for insert
  to authenticated
  with check (
    client_id = auth.uid()
    -- A caller may only ever create a REQUEST. Promotion to 'confirmed' is the coach's act and
    -- goes through provider_update_sessions; without this a member could self-confirm and take
    -- the slot outright.
    and status = 'requested'
  );

-- ===== Guard =====
-- RAISE arity checked: each format string below takes exactly the arguments it names. A bare %
-- in a never-executed branch aborts the whole migration at COMPILE time.
do $guard$
declare
  v_anon_insert int;
  v_new_roles   text;
  v_new_check   text;
begin
  -- 1. No INSERT-capable policy on sessions may reach `anon` any more. Checked by role
  --    membership rather than by name, so re-adding the hole under a different policy name
  --    still fails.
  --
  -- ⚠ TWO WAYS A NAIVE VERSION OF THIS CHECK CERTIFIES THE HOLE IT EXISTS TO CATCH, both of
  --    which this repo has already been bitten by once:
  --
  --    `'anon' = any (roles)` MISSES A POLICY WRITTEN WITHOUT A `TO` CLAUSE. Postgres defaults
  --    that to PUBLIC, pg_policies renders it as roles = {public}, and 'anon' = any('{public}')
  --    is FALSE -- while PUBLIC in fact grants every role, anon included. This is the LIKELIEST
  --    regression shape, not a hypothetical: omitting `TO` is the prevailing style in this
  --    repo's own migrations (see clients create own refund requests in
  --    2026-04-17-stripe-connect-and-purchases.sql), and 24 live policies in `public` carry
  --    roles = {public} today, 4 of them INSERT or ALL. Hence the array-overlap operator.
  --
  --    `cmd = 'INSERT'` MISSES A `for all` POLICY, which pg_policies reports as cmd = 'ALL' and
  --    which grants INSERT just as surely. The same blind spot was caught on
  --    2026-07-31-coach-insert-lockout.sql.
  select count(*) into v_anon_insert
  from pg_policies
  where schemaname = 'public' and tablename = 'sessions'
    and cmd in ('INSERT', 'ALL')
    and (roles && array['anon', 'public']::name[]);

  if v_anon_insert > 0 then
    raise exception '% INSERT policy/policies on public.sessions still grant anon — an anonymous caller can still write a booking straight to PostgREST',
      v_anon_insert;
  end if;

  -- 2. The replacement exists, is authenticated-only, and pins BOTH client_id and status.
  select roles::text, coalesce(with_check, '')
    into v_new_roles, v_new_check
  from pg_policies
  where schemaname = 'public' and tablename = 'sessions'
    and policyname = 'client_insert_own_sessions';

  if v_new_roles is null then
    raise exception 'client_insert_own_sessions was not created — signed-in members cannot book at all';
  end if;
  if v_new_roles <> '{authenticated}' then
    raise exception 'client_insert_own_sessions must apply to authenticated only; found %', v_new_roles;
  end if;
  if position('auth.uid()' in v_new_check) = 0 then
    raise exception 'client_insert_own_sessions does not pin client_id to auth.uid() — a member could book as somebody else';
  end if;
  if position('requested' in v_new_check) = 0 then
    raise exception 'client_insert_own_sessions does not pin status to requested — a member could self-confirm and seize the slot';
  end if;
end
$guard$;
