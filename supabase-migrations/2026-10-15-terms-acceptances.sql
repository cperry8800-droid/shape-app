-- Client-onboarding review, M4 (2026-10-15): a record that the Terms of Service and the Privacy
-- Policy were accepted, which versions, and when.
--
-- The website's sign-up required a Terms tick and kept no record of it; the app's sign-up showed no
-- Terms at all. Both now send `terms_accepted_at` in the sign-up metadata, and the server records
-- the acceptance at the account's first sign-in (src/lib/legal-acceptance.ts, from the session
-- bridge and /auth/callback): the versions in force when the account was created, and that time
-- (auth.users.created_at), never a time the browser sent.
--
-- Written by the service role only. A member can read their own rows and change none: no insert,
-- update or delete for anon or authenticated, so a row is what the server wrote. One row per account
-- and pair of versions; a later version accepted is a new row. Removed with the account (cascade).
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
end $$;
