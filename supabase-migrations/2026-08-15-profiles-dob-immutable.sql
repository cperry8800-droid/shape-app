-- Freeze public.profiles.date_of_birth against self-rewrite, so the derived
-- over_18 flag is actually trustworthy.
--
-- THE HOLE (verified live on 2026-08-15, not inferred from these files):
--   * `users update own profile` is UPDATE / to `authenticated` with
--     USING = WITH CHECK = (auth.uid() = id) and NO column restriction, and
--     `authenticated` holds column-level UPDATE on date_of_birth.
--   * set_over_18() recomputed over_18 from NEW.date_of_birth on every write with
--     NO privilege check — unlike guard_profile_role_elevation(), which has one.
--   * So the flag was protected against a DIRECT write and defenceless against a
--     write to its INPUT. Probed end to end against the live database: a row at
--     over_18 = false, updated by that same user through RLS as `authenticated`
--     to an adult date_of_birth, came back over_18 = true.
-- That defeated every consumer of the flag: computeMembership()'s isKnownMinor,
-- the proxy's paid-prefix age gate, and refuseKnownMinor() (src/lib/age-gate.ts).
-- Setting date_of_birth to NULL was the same bypass by another route, since NULL
-- input yields NULL over_18 and only an explicit `false` refuses.
--
-- THE FIX: for non-privileged callers, date_of_birth may be SET once but never
-- changed and never cleared. Trusted writers (service_role / migrations / a
-- support correction via createAdminClient) are exempt, so a genuine typo stays
-- fixable server-side.
--
-- WHY THE FIRST WRITE STAYS OPEN: every legitimate writer is a first write and
-- none of them edits an existing value, so this breaks no current path --
-- signup.jsx:599 and shapeBackend.js:347 write onto a freshly created row, while
-- login.jsx:140 guards on (!row || !row.date_of_birth) and
-- shapeBackend.js:278 returns early when the profile already carries a DOB.
--
-- ⚠ WHY THIS LIVES INSIDE set_over_18() AND NOT IN ITS OWN TRIGGER: BEFORE ROW
-- triggers fire in ALPHABETICAL order by trigger name, and the freeze is only
-- correct if it runs BEFORE the derivation. A separate trigger sorting after
-- profiles_set_over_18 would produce something worse than the bug it fixes:
-- over_18 recomputed from the forged date, then date_of_birth reverted, leaving a
-- row that reads as an adult while holding a minor's date of birth -- and
-- breaking the invariant that over_18 is always derived from date_of_birth.
-- Folding freeze-then-derive into one function removes the ordering hazard
-- entirely. Keep them together.
--
-- ⚠ THIS FILE ALSO CARRIES THE created_at FREEZE ADDED BY
-- 2026-08-16-created-at-freeze-and-application-dob.sql, AND MUST KEEP IT.
-- Both files `create or replace` set_over_18(), and both are marked safe to
-- re-run — so replaying THIS one after the newer file would otherwise reinstate a
-- body with no created_at freeze and silently re-open the age gate's grandfather
-- clause to backdating (the newer file's DO guard only runs while that file is
-- being applied, so it cannot catch a later replacement). Rather than rely on
-- apply order, every replayable definition of this function carries the FULL
-- freeze; tests/age-gate-null-policy.test.mjs fails the build if any migration
-- defines set_over_18() without it.
--
-- Idempotent / safe to re-run.

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

  -- CREATED_AT IS SERVER-CONTROLLED FOR NON-PRIVILEGED CALLERS -- see the header.
  -- profiles.created_at is proof of legacy status for the age gate's grandfather
  -- clause, and the owner UPDATE policy carries no column restriction, so a caller
  -- must not be able to choose it.
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
-- leaves date_of_birth untouched.
drop trigger if exists profiles_set_over_18 on public.profiles;
create trigger profiles_set_over_18 before insert or update on public.profiles
  for each row execute function public.set_over_18();
