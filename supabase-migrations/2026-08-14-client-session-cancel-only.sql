-- A client may CANCEL their own booking. They may not confirm, complete, or rewrite it.
--
-- WHY
-- `client_cancel_sessions` (2026-04-18) reads, in production today:
--
--   using      (client_id = auth.uid())
--   with check (client_id = auth.uid())
--
-- Ownership and nothing else. Every column except `client_id` is therefore writable by the
-- client through PostgREST: `status`, `scheduled_at`, `provider_id`, `provider_role`,
-- `meeting_url`, `duration_min`, `notes`. The one that matters is `status` -- a member can
-- book a consultation and then mark it `confirmed` themselves, so it lands on the coach's
-- schedule as an accepted appointment the coach never accepted.
--
-- ⚠ THIS WAS LATENT UNTIL 2026-08-11 AND IS NOW REACHABLE, which is why it is fixed here
-- rather than filed. The policy keys on `client_id = auth.uid()`, and until the consultation
-- route began stamping `client_id` (`api/consultation/route.ts`, "client_id is now stamped
-- too, so a booking has an owner") every booking carried `client_id IS NULL`. NULL never
-- equals `auth.uid()`, so the policy matched no row and granted nothing. Giving bookings an
-- owner is correct and stays -- it is what makes the row readable and cancellable by the
-- person who made it -- but it is also what switched this policy on.
--
-- WHAT THE APP ACTUALLY NEEDS, verified rather than assumed: NO client code updates
-- `public.sessions` directly. Every mutation goes through `/api/sessions/manage`, which runs
-- on the CALLER's client (`clientForRequest`, so RLS applies) and gates by role --
-- `confirm`, `decline`, `complete` and `reschedule` all reject a non-coach caller, and
-- `cancel` is the only action a client may take. Narrowing this policy to the cancel
-- transition therefore removes an ability nothing legitimate was using.

-- Dropped first so this file is re-runnable: a second run must not abort on "policy already
-- exists". The window between the drop and the create holds NO client update policy at all,
-- i.e. it fails closed.
drop policy if exists "client_cancel_sessions" on public.sessions;
create policy "client_cancel_sessions"
  on public.sessions for update
  to authenticated
  using (
    client_id = auth.uid()
    and status in ('requested', 'confirmed')
  )
  with check (
    client_id = auth.uid()
    and status = 'cancelled'
  );

-- ===== The field freeze =====
-- A policy cannot express "these columns may not change": RLS has no access to the OLD row,
-- so `with check` can only describe the row's END state. The policy above therefore stops the
-- client at `status = 'cancelled'`, but in that one cancelling UPDATE they could still move
-- `scheduled_at`, repoint `provider_id`, or rewrite `duration_min` on the way past. Bounded
-- (the row lands in `cancelled`, which the USING clause excludes from any further client
-- update) but not clean -- a cancelled row is still the coach's record of what was booked.
--
-- A trigger is the only place that comparison can happen, and this mirrors the guard-columns
-- pattern already used for `coach_waitlist`.
--
-- SECURITY DEFINER deliberately. The provider check below reads `trainers`/`nutritionists`,
-- whose anon/authenticated read policies are LIVE IN PRODUCTION BUT ABSENT FROM THIS
-- DIRECTORY -- so a database rebuilt from `supabase-migrations/` alone would not have them,
-- an invoker-rights trigger would fail to see the coach's own provider row, and the coach
-- would be misread as a client and blocked from rescheduling. Definer makes the guard
-- independent of a policy this repo cannot currently reproduce.
create or replace function public.sessions_guard_client_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- No JWT: service_role (the Stripe webhook, notification fan-out, cron). Not a client action.
  if auth.uid() is null then
    return new;
  end if;

  -- The provider who owns this booking may change what a coach is entitled to change --
  -- confirm, decline, complete, reschedule, attach a meeting URL. Checked against NEW so a
  -- repoint away from their own row cannot buy an exemption.
  if (new.provider_role = 'trainer' and exists (
        select 1 from public.trainers t
        where t.id = new.provider_id and t.owner_id = auth.uid()))
     or (new.provider_role = 'nutritionist' and exists (
        select 1 from public.nutritionists n
        where n.id = new.provider_id and n.owner_id = auth.uid()))
  then
    return new;
  end if;

  -- Anything else that reached an UPDATE is the client, under the policy above. The booking is
  -- immutable to them; only its status moves, and the policy pins that to 'cancelled'.
  --
  -- ⚠ AN ALLOWLIST, NOT A LIST OF FROZEN COLUMNS. An earlier cut named five fields
  -- (provider_id, provider_role, scheduled_at, duration_min, client_id) and left every other
  -- one writable in the same cancelling statement — `client_name`, `client_email`, `type`,
  -- `topic`, `meeting_url`, and `notes`, which is the COACH's own note on the booking. That is
  -- not academic: `api/trainer/dashboard/route.ts` selects `type, status, topic, client_name`
  -- for the coach's own sessions with NO status filter and counts every row, so a cancelled
  -- record still renders and still tallies. Comparing the row wholesale means a column added to
  -- `sessions` later is frozen by default instead of silently joining the writable set.
  if (to_jsonb(new) - 'status' - 'updated_at')
       is distinct from (to_jsonb(old) - 'status' - 'updated_at')
  then
    -- No format placeholders: PL/pgSQL checks RAISE arity at COMPILE time, so a stray % here
    -- would abort this whole migration on a healthy database.
    raise exception 'sessions: a client may cancel a booking, not rewrite it';
  end if;

  return new;
end
$fn$;

drop trigger if exists sessions_guard_client_update on public.sessions;
create trigger sessions_guard_client_update
  before update on public.sessions
  for each row execute function public.sessions_guard_client_update();

-- ===== Guard =====
-- RAISE arity checked: every format string below takes exactly the arguments it names.
do $guard$
declare
  v_qual  text;
  v_check text;
  v_n     int;
begin
  select qual, with_check into v_qual, v_check
  from pg_policies
  where schemaname = 'public' and tablename = 'sessions' and policyname = 'client_cancel_sessions';

  if v_qual is null then
    raise exception 'client_cancel_sessions is missing from public.sessions';
  end if;

  -- 1. The client can only ever land the row on 'cancelled'.
  if strpos(v_check, 'cancelled') = 0 then
    raise exception 'client_cancel_sessions WITH CHECK does not pin the status to cancelled — a client can still self-confirm';
  end if;

  -- 2. ...and can only start from a live booking, so a settled row cannot be reopened.
  if strpos(v_qual, 'requested') = 0 or strpos(v_qual, 'confirmed') = 0 then
    raise exception 'client_cancel_sessions USING does not restrict the starting status';
  end if;

  -- 3. No OTHER permissive UPDATE policy hands the same ability back. Permissive policies are
  --    OR-combined, so a second one that merely checks ownership would defeat everything
  --    above. `cmd` is matched against both 'UPDATE' and 'ALL' -- Postgres reports 'ALL' for a
  --    `for all` policy, and that grants UPDATE just as surely.
  select count(*) into v_n
  from pg_policies
  where schemaname = 'public' and tablename = 'sessions'
    and cmd in ('UPDATE', 'ALL')
    and policyname <> 'client_cancel_sessions'
    and permissive = 'PERMISSIVE'
    and coalesce(with_check, qual) not like '%owner_id%';
  if v_n > 0 then
    raise exception 'another permissive UPDATE policy on public.sessions is not provider-scoped — it OR-combines past the cancel-only rule';
  end if;

  -- 4. The coach path survives. An over-tight sweep here silently breaks confirm/reschedule,
  --    which is a worse outage than the hole being closed, so it has to fail just as loudly.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sessions'
      and policyname = 'provider_update_sessions'
  ) then
    raise exception 'provider_update_sessions is gone — coaches can no longer confirm or reschedule';
  end if;

  -- 5. The field freeze is armed.
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.sessions'::regclass
      and tgname = 'sessions_guard_client_update'
      and not tgisinternal
  ) then
    raise exception 'the sessions_guard_client_update trigger is not installed';
  end if;
end
$guard$;
