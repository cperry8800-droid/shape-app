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
