-- Deletion audit — one row per account deletion, written by the deletion route
-- (service role). Kept for accountability; contains NO health data, only the fact
-- of deletion + timestamps + what was purged. There is intentionally NO foreign
-- key to auth.users (the user is gone), and NO RLS policy, so only the service
-- role can read/write it (deny-all for normal users by design). Idempotent.

create table if not exists public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  tables_purged text[],
  buckets_purged text[],
  note text
);
create index if not exists account_deletions_user_idx on public.account_deletions (user_id);

alter table public.account_deletions enable row level security;
-- No policy on purpose: only the service-role deletion route touches this table.
