-- Device push tokens for system notifications (app closed / phone locked).
--
-- One row per (user, device token). The mobile app registers its token on
-- launch via /api/push/register; a Supabase Database Webhook on notifications
-- INSERT calls /api/push/dispatch, which looks up the recipient's tokens here
-- and sends an FCM push. Owner-only RLS; the dispatch path reads via service
-- role. Idempotent.

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  token text not null,
  platform text not null default 'unknown' check (platform in ('ios','android','web','unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token)
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_rw_own" on public.push_tokens;
create policy "push_tokens_rw_own"
  on public.push_tokens for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
