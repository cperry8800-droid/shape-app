-- Age gate — Shape is 18+. We collect a neutral date of birth at signup and
-- DERIVE over_18 in a trigger, so the client can never self-assert it: even if a
-- request sends over_18 = true, the trigger overwrites it from date_of_birth.
-- The existing profiles RLS lets a user read/update only their own row.
-- Idempotent. Signup enforcement no-ops gracefully until this is applied.

alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists over_18 boolean;

-- ⚠ THIS DEFINITION CARRIES THE TWO FREEZES ADDED LATER, AND MUST KEEP THEM.
-- The original body did neither. Three migrations `create or replace` this
-- function (this one, 2026-08-15-profiles-dob-immutable.sql and
-- 2026-08-16-created-at-freeze-and-application-dob.sql) and all three are marked
-- safe to re-run, so replaying THIS one would otherwise reinstate a body with no
-- date_of_birth freeze (re-opening over_18 forgery by rewriting its input) and no
-- created_at freeze (re-opening the age gate's grandfather clause to backdating).
-- A DO guard inside a later migration only runs while THAT file is applied, so it
-- cannot catch a replacement afterwards. Rather than depend on apply order, every
-- replayable definition carries the FULL body;
-- tests/age-gate-null-policy.test.mjs fails the build if any migration defines
-- set_over_18() without both freezes.
create or replace function public.set_over_18() returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  is_privileged boolean := current_user in ('service_role','supabase_admin','supabase_auth_admin','postgres')
                           or jwt_role = 'service_role';
begin
  -- FREEZE FIRST, DERIVE SECOND -- BEFORE ROW triggers fire in alphabetical order,
  -- so a freeze in a sibling trigger could sort after this derivation and leave
  -- over_18 computed from a value it then reverted. Keep them in one function.
  if tg_op = 'UPDATE'
     and not is_privileged
     and old.date_of_birth is not null
     and new.date_of_birth is distinct from old.date_of_birth then
    new.date_of_birth := old.date_of_birth;
  end if;

  -- created_at is proof of legacy status for the age gate's grandfather clause,
  -- and the owner UPDATE policy carries no column restriction, so a non-privileged
  -- caller must not be able to choose it.
  if not is_privileged then
    if tg_op = 'UPDATE' then
      new.created_at := old.created_at;
    elsif tg_op = 'INSERT' then
      new.created_at := now();
    end if;
  end if;

  -- over_18 is always computed from date_of_birth — never trusted from input.
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
