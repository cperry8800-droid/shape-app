-- STEP 2 of 2 — THE LOCKDOWN. Run ONLY after 2026-08-03-profiles-display-names.sql
-- has been applied AND the code that uses get_display_names() is deployed.
--
-- ⚠ THE HOLE. `profiles` carried this policy:
--
--     "profiles readable by authenticated"  SELECT  authenticated  USING (true)
--
-- and the table carries email, phone, date_of_birth, full_name, location,
-- stripe_customer_id and username. So ONE request from any account returned all
-- of it for the ENTIRE user base. Found by an access-control audit 2026-07-30 and
-- confirmed against production before this was written.
--
-- ⚠ WHY THE OBVIOUS FIX IS WRONG, since it will be the first thing anyone tries:
-- column privileges (`revoke select (email) on profiles from authenticated`) are
-- ROLE-WIDE, not row-aware. Revoking `email` from `authenticated` also stops a
-- member reading their OWN email — /api/account/export star-selects the caller's
-- own row and would break, as would settings. RLS is row-level; the fix has to be
-- policy-shaped, with a separate path for the fields other people legitimately
-- need.
--
-- ⚠ AND THE SECOND TRAP: there is NO self-read policy on profiles in this repo's
-- migration history. `USING (true)` was doing that job too. Dropping it without
-- adding one would lock every member out of their own profile. The self policy
-- below is genuinely net-new — do not assume it already existed, and verify
-- against live pg_policies rather than the repo.
--
-- THE SHAPE OF THE FIX
--   1. self          — a member reads their own row, whole.
--   2. coach         — providers_read_subscriber_profiles_base already covers a
--                      coach reading an ACTIVE/trialing client. Left untouched.
--   3. everyone else — display name + avatar ONLY, through get_display_names()
--                      (step 1), a definer that cannot return the PII columns
--                      because it does not select them.
--
-- Names and avatars are already public by design across this codebase
-- (get_public_profile, search_shape_people, get_active_now — the last granted to
-- anon), so a batch name resolver leaks nothing new. The PII is what was leaking,
-- and it is what stops leaving the table.
--
-- ⚠ SIX CALLERS READ ANOTHER USER'S ROW AND MUST BE DEPLOYED FIRST. Two of them
-- fail SILENTLY otherwise — trainer/analytics and nutritionist/analytics fall back
-- to the literal string 'Former client', so a broken read renders plausible copy:
--   src/lib/origin-attribution.ts                one-time purchasers
--   src/app/api/trainer/analytics/route.ts       churned clients
--   src/app/api/nutritionist/analytics/route.ts  churned clients
--   src/app/api/calendar/route.ts                requested-status prospects
--   src/app/api/clients/[id]/shared-overview/    a lapsed client
--   public/sessions-widget.js                    session requesters (star-select)
-- public/real-providers.js is also migrated, but off profiles entirely — it was an
-- unbounded signed-out scan and belongs on the public trainers/nutritionists rows.
--
-- The mobile app needs no change: every cross-user profile read there already
-- goes through a definer RPC.

begin;

-- ── 2. Self-read. NET-NEW — nothing else grants a member their own row ──────
drop policy if exists "profiles_read_self" on public.profiles;
create policy "profiles_read_self" on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- ── 3. Close the hole ──────────────────────────────────────────────────────
-- Dropped LAST, so that at no point in this transaction is a member unable to
-- read their own row.
drop policy if exists "profiles readable by authenticated" on public.profiles;

-- ── 4. The gate ────────────────────────────────────────────────────────────
do $guard$
declare
  v_bad text;
begin
  -- 4a. No surviving SELECT policy may be unconditional.
  select string_agg(policyname, ', ') into v_bad
  from pg_policies
  where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT'
    and coalesce(qual, 'true') in ('true', '(true)');
  if v_bad is not null then
    raise exception 'profiles still has an unconditional SELECT policy: %', v_bad;
  end if;

  -- 4b. Self-read must exist, or every member loses their own profile.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and cmd = 'SELECT' and policyname = 'profiles_read_self'
  ) then
    raise exception 'profiles_read_self is missing — members would lose their own row';
  end if;

  -- 4c. The coach path must survive untouched.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and cmd = 'SELECT' and policyname = 'providers_read_subscriber_profiles_base'
  ) then
    raise exception 'the coach read policy vanished — every Case File would break';
  end if;

  -- 4d. RLS itself must still be on. A dropped policy on an RLS-off table is
  --     not a fix, it is a no-op with a good story.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'profiles' and c.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on profiles';
  end if;

  -- 4e. The replacement path must be reachable by members and closed to anon.
  if not has_function_privilege('authenticated', 'public.get_display_names(uuid[])', 'EXECUTE') then
    raise exception 'get_display_names is not executable by authenticated — the six migrated call sites would break';
  end if;
  if has_function_privilege('anon', 'public.get_display_names(uuid[])', 'EXECUTE') then
    raise exception 'get_display_names is executable by anon';
  end if;

  -- 4f. The replacement path must still expose DISPLAY FIELDS ONLY.
  --     Asserted on the RETURN SIGNATURE, not on the source text: a prose scan
  --     false-positives on the very comment that warns against widening it (it
  --     did, on the first apply of step 1), and a signature cannot be faked.
  declare v_shape text;
  begin
    select pg_get_function_result(p.oid) into v_shape
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_display_names';
    if v_shape is distinct from 'TABLE(user_id uuid, full_name text, avatar_url text)' then
      raise exception 'get_display_names returns an unexpected shape: % - it must expose display fields ONLY', v_shape;
    end if;
  end;
end $guard$;

commit;
