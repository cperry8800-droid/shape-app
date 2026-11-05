-- One time zone per account (P9, owner 2026-11-05: "all time zones should be set by user").
-- Idempotent, one transaction, safe to re-run.
--
-- ── WHAT WAS THERE ───────────────────────────────────────────────────────────
-- Three places held a zone and nobody chose any of them:
--   client_profiles.timezone          the app posted the device's zone on EVERY open
--                                     (/api/client/timezone), so a member on a trip moved
--                                     silently, and their streaks and reminders with them;
--   trainers / nutritionists.timezone stamped from the browser whenever the coach saved hours
--                                     (/api/my-availability), so saving from a laptop in
--                                     another zone moved every open hour;
-- and there was no setting.
--
-- ── WHAT THIS ADDS ───────────────────────────────────────────────────────────
-- 1. profiles.timezone: the account's own zone, the one the person sets in Settings. It is the
--    only one written from now on (/api/me/timezone); the server routes above set it only when it
--    is still empty, as a first default.
-- 2. A check on it: a name Postgres's own zone list knows (pg_timezone_names, as shape_user_tz
--    joins), or null.
-- 3. A copy of it on every table that already holds a zone, so every reader that exists today
--    (shape_user_tz, the habit and prep crons, quiet hours, the booking slots, the coach dashboard's
--    day) follows the setting without being changed:
--      - when the profile's zone changes, the person's trainers and nutritionists rows and their
--        client_profiles row (created if missing, as /api/client/timezone always did) take it;
--      - a listing or client_profiles row created later takes the profile's zone.
--    ⚠ A COACH'S OPEN HOURS FOLLOW THE CLOCK, NOT THE INSTANT. Hours are stored as a wall-clock
--    minute plus the listing's zone, so a coach who moves from New York to London keeps 9 to 5 on
--    London's clock. Booked sessions are instants and do not move.
-- 4. A backfill of every profile with no zone, from what is already stored, listing first: a
--    coach's hours are stored in the listing's zone, so taking the device's would move them.
--    Measured 2026-11-05: production holds no stored zone on any of the three tables, so this
--    changes nothing today; it is here for a database that does.
--
-- ⚠ The copy is SECURITY DEFINER, so a person's own profile write reaches their own listing and
-- client_profiles rows whatever those tables' policies allow. It touches only rows of NEW.id, the
-- row the caller's own policy let them write, and EXECUTE is revoked (a trigger does not need it).

begin;
set local lock_timeout = '10s';

alter table public.profiles add column if not exists timezone text;

-- ── 2. Only a zone Postgres knows, or null ───────────────────────────────────
create or replace function public.profiles_check_timezone()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.timezone := nullif(btrim(coalesce(new.timezone, '')), '');
  if new.timezone is not null
     and not exists (select 1 from pg_timezone_names z where z.name = new.timezone) then
    raise exception 'not a time zone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_check_timezone on public.profiles;
create trigger profiles_check_timezone
  before insert or update of timezone on public.profiles
  for each row execute function public.profiles_check_timezone();

-- ── 3a. The profile's zone reaches the tables that already hold one ─────────
create or replace function public.profiles_copy_timezone()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.timezone is null then
    return null; -- a cleared zone leaves the copies alone: nothing writes null on purpose
  end if;
  update public.trainers set timezone = new.timezone
   where owner_id = new.id and timezone is distinct from new.timezone;
  update public.nutritionists set timezone = new.timezone
   where owner_id = new.id and timezone is distinct from new.timezone;
  insert into public.client_profiles (user_id, timezone)
  values (new.id, new.timezone)
  on conflict (user_id) do update set timezone = excluded.timezone
   where public.client_profiles.timezone is distinct from excluded.timezone;
  return null;
end;
$$;

revoke all on function public.profiles_copy_timezone() from public, anon, authenticated;

drop trigger if exists profiles_copy_timezone_insert on public.profiles;
create trigger profiles_copy_timezone_insert
  after insert on public.profiles
  for each row when (new.timezone is not null)
  execute function public.profiles_copy_timezone();

drop trigger if exists profiles_copy_timezone_update on public.profiles;
create trigger profiles_copy_timezone_update
  after update of timezone on public.profiles
  for each row when (new.timezone is distinct from old.timezone)
  execute function public.profiles_copy_timezone();

-- ── 3b. A row created later takes the profile's zone ────────────────────────
-- The account's zone wins over one the inserter sent; with none set, the row keeps what it was
-- given. Not a definer: the person inserting their own row can read their own profile, and a row
-- an inserter cannot read the profile for keeps what it was given, as it does today.
create or replace function public.timezone_from_profile()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_zone text;
begin
  if tg_table_name = 'client_profiles' then
    v_owner := new.user_id;
  else
    v_owner := new.owner_id;
  end if;
  if v_owner is not null then
    select p.timezone into v_zone from public.profiles p where p.id = v_owner;
  end if;
  if v_zone is not null then
    new.timezone := v_zone;
  end if;
  return new;
end;
$$;

drop trigger if exists trainers_timezone_from_profile on public.trainers;
create trigger trainers_timezone_from_profile
  before insert on public.trainers
  for each row execute function public.timezone_from_profile();

drop trigger if exists nutritionists_timezone_from_profile on public.nutritionists;
create trigger nutritionists_timezone_from_profile
  before insert on public.nutritionists
  for each row execute function public.timezone_from_profile();

drop trigger if exists client_profiles_timezone_from_profile on public.client_profiles;
create trigger client_profiles_timezone_from_profile
  before insert on public.client_profiles
  for each row execute function public.timezone_from_profile();

-- ── 4. Backfill: the listing's zone, then the member profile's ──────────────
update public.profiles p
   set timezone = src.zone
  from (
    select p2.id,
           coalesce(
             (select t.timezone from public.trainers t
                join pg_timezone_names z on z.name = t.timezone
               where t.owner_id = p2.id order by t.id limit 1),
             (select n.timezone from public.nutritionists n
                join pg_timezone_names z on z.name = n.timezone
               where n.owner_id = p2.id order by n.id limit 1),
             (select cp.timezone from public.client_profiles cp
                join pg_timezone_names z on z.name = cp.timezone
               where cp.user_id = p2.id limit 1)
           ) as zone
      from public.profiles p2
     where p2.timezone is null
  ) src
 where p.id = src.id and p.timezone is null and src.zone is not null;

-- ── Guard: what the code relies on ──────────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'timezone') then
    raise exception 'profiles.timezone is missing';
  end if;
  if (select count(*) from pg_trigger
       where not tgisinternal
         and tgname in ('profiles_check_timezone', 'profiles_copy_timezone_insert', 'profiles_copy_timezone_update',
                        'trainers_timezone_from_profile', 'nutritionists_timezone_from_profile',
                        'client_profiles_timezone_from_profile')) <> 6 then
    raise exception 'a time zone trigger is missing';
  end if;
  if exists (select 1 from public.profiles p
              where p.timezone is not null
                and not exists (select 1 from pg_timezone_names z where z.name = p.timezone)) then
    raise exception 'profiles holds a time zone Postgres does not know';
  end if;
  if has_function_privilege('anon', 'public.profiles_copy_timezone()', 'execute')
     or has_function_privilege('authenticated', 'public.profiles_copy_timezone()', 'execute') then
    raise exception 'profiles_copy_timezone is executable by a client role';
  end if;
end;
$$;

commit;
