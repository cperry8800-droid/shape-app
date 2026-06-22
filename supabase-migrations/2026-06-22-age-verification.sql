-- Age gate — Shape is 18+. We collect a neutral date of birth at signup and
-- DERIVE over_18 in a trigger, so the client can never self-assert it: even if a
-- request sends over_18 = true, the trigger overwrites it from date_of_birth.
-- The existing profiles RLS lets a user read/update only their own row.
-- Idempotent. Signup enforcement no-ops gracefully until this is applied.

alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists over_18 boolean;

create or replace function public.set_over_18() returns trigger
  language plpgsql as $$
begin
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
