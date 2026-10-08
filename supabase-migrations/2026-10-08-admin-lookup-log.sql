-- Nora's admin help-desk lookups (2026-10-08, the Ask Nora plan, step 5: "Admin help-desk
-- lookups, read-only and logged").
--
-- One row per lookup an admin asks Nora for (an account by email, its plan, a coach's payout
-- setup). Written by the chat route with the SERVICE ROLE (src/lib/ai/adminLookup.mjs):
--   1. the row is inserted BEFORE the lookup runs, naming the admin and the email asked for;
--      a lookup whose row cannot be inserted does not run, so there is no unlogged read;
--   2. it is then completed with whether an account was found, its id, and the sections read.
--
-- ===== WHO CAN READ IT =====
-- Nobody through the API: RLS is on and there are no policies, so only the service role
-- (the route, the Supabase dashboard) reads or writes it. Admins are an email allow-list in
-- the server's environment, not a database role, so there is no policy that could name them.
--
-- ===== WHY THE IDS ARE NOT REQUIRED =====
-- The log outlives both accounts: deleting the admin's or the looked-up account sets its id
-- to null and keeps the row, with the emails, as the record of the lookup.
--
-- Until this runs, Nora answers an admin's lookup with "could not be logged, so nothing was
-- looked up". Idempotent, safe to re-run.

create table if not exists public.admin_lookup_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  admin_email text not null,
  query_email text not null,
  surface text not null default 'web' check (surface in ('web', 'app')),
  found boolean,
  target_user_id uuid references auth.users(id) on delete set null,
  sections text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists admin_lookup_log_created_idx on public.admin_lookup_log (created_at desc);
create index if not exists admin_lookup_log_target_idx on public.admin_lookup_log (target_user_id) where target_user_id is not null;

alter table public.admin_lookup_log enable row level security;
revoke all on public.admin_lookup_log from anon, authenticated;

-- ===== FINDING THE ACCOUNT =====
-- By its sign-in identity, auth.users, never by profiles.email: a profile is created best
-- effort and can be missing, and it keeps the first address after an email change, so it
-- would answer "no account" for one that exists (Codex, #2264). Auth stores addresses
-- lowercased; the route lowercases the one asked for (cleanLookupEmail).
--
-- ⚠ THE SERVICE ROLE ONLY. Supabase grants EXECUTE on a new function to anon and authenticated
-- by name, so `revoke ... from public` alone would leave every account's email, sign-in times
-- and id readable by the whole internet through /rest/v1/rpc/. Revoked from all three by name.
create or replace function public.admin_account_by_email(p_email text)
returns table (id uuid, created_at timestamptz, email_confirmed_at timestamptz, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id, u.created_at, u.email_confirmed_at, u.last_sign_in_at
  from auth.users u
  where u.email = lower(btrim(p_email))
  order by u.created_at
  limit 1
$$;

revoke all on function public.admin_account_by_email(text) from public, anon, authenticated;
grant execute on function public.admin_account_by_email(text) to service_role;
