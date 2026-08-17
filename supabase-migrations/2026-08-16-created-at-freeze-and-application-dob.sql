-- Freeze public.profiles.created_at, and add the provider_applications.dob
-- column the repo has declared since 2026-04-17 but production never had.
--
-- ── WHY (1): THE GRANDFATHER CUTOFF WAS FORGEABLE ───────────────────────────
-- The age gates now refuse an account that proves nothing about its age, unless
-- it predates ADULT_PROOF_REQUIRED_FROM (src/lib/age-derive.mjs). That check
-- reads profiles.created_at — and verified live on 2026-08-16, the owner policy
-- `users update own profile` is UPDATE to `authenticated` with
-- USING = WITH CHECK = (auth.uid() = id) and NO column restriction, exactly like
-- the hole 2026-08-15-profiles-dob-immutable.sql closed for date_of_birth. So an
-- authenticated caller with a null DOB could backdate their own row (or INSERT a
-- missing row already backdated) and be grandfathered straight past the gate.
-- A timestamp used as proof of legacy status must be server-controlled.
--
-- THE FIX: for non-privileged callers created_at is stamped by the server on
-- INSERT and immutable on UPDATE. Trusted writers (service_role / migrations /
-- the dashboard) are exempt, so a genuine backfill or support correction stays
-- possible.
--
-- ⚠ WHY THIS LIVES INSIDE set_over_18() AND NOT IN ITS OWN TRIGGER — the same
-- reason the DOB freeze does, and the reason is worth restating because getting
-- it wrong is worse than the bug: BEFORE ROW triggers fire in ALPHABETICAL order
-- by trigger name, so a separate guard could sort after the derivation and leave
-- a row whose over_18 was computed from a value the freeze then reverted. One
-- function, freeze-then-derive, removes the ordering hazard entirely. Keep them
-- together.
--
-- ── WHY (2): SCHEMA DRIFT ON provider_applications ──────────────────────────
-- 2026-04-17-provider-applications.sql declares `dob date`, but the LIVE table
-- has 18 columns and none of them is dob (checked against information_schema on
-- 2026-08-16, not read from the file). Coaches now submit a date of birth —
-- approval provisions an auth user AND a coach profile, and coach roles satisfy
-- membership automatically, so a provider row with no DOB is an entitled account
-- the gates cannot place. The application insert therefore writes this column,
-- and without it every submission would fail 42703. The route degrades (retries
-- without the column) until this migration is applied, so deploy order is free.
--
-- Idempotent / safe to re-run.

alter table public.provider_applications
  add column if not exists dob date;

create or replace function public.set_over_18() returns trigger
  language plpgsql
  -- SECURITY INVOKER (default): this only mutates NEW and reads session-scoped
  -- request GUCs, which the security context does not affect.
  set search_path = public
as $$
declare
  jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  -- PostgREST SET ROLEs to the JWT role; the service key -> 'service_role'.
  -- Raw DB/admin connections (migrations, dashboard) count as privileged too.
  is_privileged boolean := current_user in ('service_role','supabase_admin','supabase_auth_admin','postgres')
                           or jwt_role = 'service_role';
begin
  -- FREEZE FIRST, DERIVE SECOND -- see the header note on trigger ordering.
  -- Only an UPDATE can rewrite history; an INSERT is the first write by
  -- definition. `is distinct from` so a re-submit of the SAME date (the signup
  -- upsert replaying) is untouched rather than treated as tampering.
  if tg_op = 'UPDATE'
     and not is_privileged
     and old.date_of_birth is not null
     and new.date_of_birth is distinct from old.date_of_birth then
    -- Silently reverted rather than raised, matching how
    -- guard_profile_role_elevation() neutralizes self-elevation: these writes
    -- arrive inside best-effort provisioning paths that swallow errors, so
    -- raising here would surface as an unexplained signup failure.
    new.date_of_birth := old.date_of_birth;
  end if;

  -- CREATED_AT IS SERVER-CONTROLLED FOR NON-PRIVILEGED CALLERS. It is proof of
  -- legacy status for the age gate's grandfather clause, so a caller must not be
  -- able to choose it. Reverted/stamped silently, for the same reason the DOB
  -- freeze is silent: these writes ride inside best-effort provisioning paths.
  if not is_privileged then
    if tg_op = 'UPDATE' then
      new.created_at := old.created_at;
    elsif tg_op = 'INSERT' then
      new.created_at := now();
    end if;
  end if;

  -- over_18 is always computed from date_of_birth -- never trusted from input.
  if new.date_of_birth is not null then
    new.over_18 := (new.date_of_birth <= (current_date - interval '18 years'));
  else
    new.over_18 := null;
  end if;
  return new;
end;
$$;

-- Fire on every insert/update so over_18 cannot be set directly on an UPDATE that
-- leaves date_of_birth untouched, and so created_at cannot be rewritten at all.
drop trigger if exists profiles_set_over_18 on public.profiles;
create trigger profiles_set_over_18 before insert or update on public.profiles
  for each row execute function public.set_over_18();

-- Structural guard: fail loudly if either half did not land. Kept arity-safe --
-- a bare % in a dead RAISE branch aborts the whole migration at COMPILE time,
-- so every RAISE here passes exactly the arguments its format string names.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'provider_applications' and column_name = 'dob'
  ) then
    raise exception 'provider_applications.dob is missing after migration';
  end if;

  if position('new.created_at := old.created_at' in
       (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'set_over_18' and p.prokind = 'f')) = 0 then
    raise exception 'set_over_18() does not freeze created_at -- an older copy replayed over this migration';
  end if;

  if position('new.date_of_birth := old.date_of_birth' in
       (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'set_over_18' and p.prokind = 'f')) = 0 then
    raise exception 'set_over_18() lost the date_of_birth freeze -- do not ship this state';
  end if;
end;
$$;
