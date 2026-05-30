-- In-app notifications.
--
-- A generic per-user notification feed: booking requests, session confirms,
-- new messages, coach pushes, etc. Rows are created server-side (service role)
-- by whatever event produced them — e.g. a client booking a session inserts a
-- notification for the coach, who is NOT the actor, so inserts bypass RLS.
-- Each user reads / marks-read / deletes only their own rows.
--
-- Added to the supabase_realtime publication so the app's bell updates live.
-- Idempotent, safe to re-run.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  type text not null default 'general',
  title text not null,
  body text not null default '',
  route text,                       -- in-app destination, e.g. 'sessions'
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id, read_at);

alter table public.notifications enable row level security;

-- Owner-only read / update (mark read) / delete. No insert policy: rows are
-- written by the service-role client from server routes (the actor is usually
-- not the recipient), which bypasses RLS.
drop policy if exists "notifications_read_own" on public.notifications;
create policy "notifications_read_own"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications for delete
  to authenticated
  using (user_id = auth.uid());

-- Live updates for the in-app bell.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
