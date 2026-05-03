-- App launch waitlist. Captures email addresses from the "Notify me when the
-- Shape app launches" CTA on /newdesign/GetApp.html. Email is unique
-- (case-insensitive via the lowercased value the API stores), so repeat
-- submissions are no-ops.
--
-- Reads happen server-side via the service role; no select policy is exposed.
--
-- Idempotent, safe to re-run.

create table if not exists public.app_launch_notifications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text,
  user_agent text,
  ip text,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);

create unique index if not exists app_launch_notifications_email_uidx
  on public.app_launch_notifications (email);

create index if not exists app_launch_notifications_created_idx
  on public.app_launch_notifications (created_at desc);

alter table public.app_launch_notifications enable row level security;

-- Anyone (anon or signed-in) may add their email. No update/delete/select
-- policies — the admin dashboard reads via the service role.
drop policy if exists "anon_insert_app_launch_notifications" on public.app_launch_notifications;
create policy "anon_insert_app_launch_notifications"
  on public.app_launch_notifications for insert
  to anon, authenticated
  with check (true);
