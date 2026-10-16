-- Client-onboarding review, M4 (2026-10-15): a record that the Terms of Service and the Privacy
-- Policy were accepted, which versions, and when.
--
-- The website's sign-up required a Terms tick and kept no record of it; the app's sign-up showed no
-- Terms at all. Both now send `terms_accepted_at` in the sign-up metadata, the trigger below keeps it
-- in app_metadata as the account is created, and the server records the acceptance at the account's
-- first sign-in (src/lib/legal-acceptance.ts, from the session bridge and /auth/callback): the
-- versions in force when the account was created, and that time (auth.users.created_at), never a
-- time the browser sent.
--
-- Written by the service role only. A member can read their own rows and change none: no insert,
-- update or delete for anon or authenticated, so a row is what the server wrote. One row per account
-- and pair of versions; a later version accepted is a new row. Removed with the account (cascade).
--
-- ⚠ THE ACCEPTANCE IS TAKEN AS THE ACCOUNT IS CREATED, NOT FROM user_metadata LATER (Codex on #2379,
-- P1). user_metadata is the member's own to edit (supabase.auth.updateUser), so an old account could
-- set `terms_accepted_at` and have a record written backdated to its creation, naming versions it
-- never saw. A BEFORE INSERT trigger on auth.users copies the sign-up's flag into app_metadata, which
-- only the server writes; a later edit of user_metadata is an UPDATE and never reaches it. The server
-- records from app_metadata alone.
--
-- Idempotent: safe to re-run.

create table if not exists public.terms_acceptances (
  user_id uuid not null references auth.users (id) on delete cascade,
  terms_version text not null check (terms_version ~ '^\d{4}-\d{2}-\d{2}$'),
  privacy_version text not null check (privacy_version ~ '^\d{4}-\d{2}-\d{2}$'),
  surface text not null check (surface in ('website', 'app')),
  accepted_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, terms_version, privacy_version)
);

alter table public.terms_acceptances enable row level security;

revoke all on public.terms_acceptances from anon, authenticated;
grant select on public.terms_acceptances to authenticated;
grant select, insert on public.terms_acceptances to service_role;

drop policy if exists terms_acceptances_read_own on public.terms_acceptances;
create policy terms_acceptances_read_own on public.terms_acceptances
  for select to authenticated
  using (user_id = auth.uid());

-- The capture. Only NEW is touched, so a sign-up cannot fail on a table read; any error is swallowed
-- and the account is created without the flag (no record), never refused. The path names only the
-- catalog (its body calls built-ins and reads no table) and ends in pg_temp, as every definer here
-- does (tests/definer-grants.test.mjs): an empty path leaves pg_temp searched first.
create or replace function public.capture_terms_acceptance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if jsonb_typeof(new.raw_user_meta_data -> 'terms_accepted_at') = 'string'
     and length(new.raw_user_meta_data ->> 'terms_accepted_at') > 0 then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
      'terms_accepted_at', to_char(coalesce(new.created_at, now()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'terms_surface', case when new.raw_user_meta_data -> 'signup_source' ->> 'surface' = 'app' then 'app' else 'website' end
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

revoke all on function public.capture_terms_acceptance() from public, anon, authenticated;

drop trigger if exists capture_terms_acceptance on auth.users;
create trigger capture_terms_acceptance
  before insert on auth.users
  for each row execute function public.capture_terms_acceptance();

-- Guard: refuse to finish unless the table is as described.
do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'terms_acceptances' and c.relrowsecurity
  ) then
    raise exception 'terms_acceptances: row level security is off';
  end if;
  if has_table_privilege('authenticated', 'public.terms_acceptances', 'INSERT')
     or has_table_privilege('authenticated', 'public.terms_acceptances', 'UPDATE')
     or has_table_privilege('authenticated', 'public.terms_acceptances', 'DELETE')
     or has_table_privilege('anon', 'public.terms_acceptances', 'SELECT')
     or has_table_privilege('anon', 'public.terms_acceptances', 'INSERT') then
    raise exception 'terms_acceptances: a member or a visitor can write it, or a visitor can read it';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'terms_acceptances'
      and policyname = 'terms_acceptances_read_own' and cmd = 'SELECT'
  ) then
    raise exception 'terms_acceptances: the read-own policy is missing';
  end if;
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'auth.users'::regclass and t.tgname = 'capture_terms_acceptance'
      and t.tgenabled = 'O' and not t.tgisinternal
      and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4 and (t.tgtype & 1) = 1
      and t.tgfoid = 'public.capture_terms_acceptance()'::regprocedure
  ) then
    raise exception 'terms_acceptances: the capture trigger is not a row-level BEFORE INSERT trigger on auth.users';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'public.capture_terms_acceptance()'::regprocedure
      and p.prosecdef and p.proconfig @> array['search_path=pg_catalog, pg_temp']
  ) then
    raise exception 'terms_acceptances: the capture function is not a definer pinned to pg_catalog, pg_temp';
  end if;
  if has_function_privilege('authenticated', 'public.capture_terms_acceptance()', 'EXECUTE')
     or has_function_privilege('anon', 'public.capture_terms_acceptance()', 'EXECUTE') then
    raise exception 'terms_acceptances: a member or a visitor can call the capture function';
  end if;
end $$;
