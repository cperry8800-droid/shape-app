-- Notification preference center (AI9) — the authoritative gate over what each
-- person is notified about, per TYPE × per CHANNEL, plus global controls and the
-- user-scheduled habit reminders.
--
-- These tables are the SINGLE SOURCE OF TRUTH the notification sender (AI8) reads
-- before sending anything. Owner-scoped RLS; the cron reads them as the service
-- role (RLS bypassed) per-user. Idempotent.

-- ===== global controls (one row per user) =====
create table if not exists public.notification_settings (
  user_id uuid primary key references auth.users on delete cascade,
  muted boolean not null default false,          -- master mute
  quiet_start int not null default 22,           -- local hour [0-23], inclusive
  quiet_end int not null default 7,              -- local hour [0-23], exclusive
  tz text not null default 'UTC',
  daily_cap int not null default 4,              -- immediate (non-digest) cap
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
drop policy if exists "notif_settings_own" on public.notification_settings;
create policy "notif_settings_own" on public.notification_settings for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===== per-type × per-channel matrix (stores only OVERRIDES; absent = default) =====
create table if not exists public.notification_preferences (
  user_id uuid not null references auth.users on delete cascade,
  type text not null,                            -- e.g. directive, habit_reminder, client_red
  channel text not null check (channel in ('inapp','push','email')),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, type, channel)
);
alter table public.notification_preferences enable row level security;
drop policy if exists "notif_prefs_own" on public.notification_preferences;
create policy "notif_prefs_own" on public.notification_preferences for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===== habit reminders (user-scheduled, opt-in, one schedule per habit) =====
create table if not exists public.habit_reminders (
  habit_id uuid primary key references public.user_habits(id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  label text not null default '',
  at_time text not null default '09:00',         -- 'HH:MM' local
  days int[] not null default '{1,2,3,4,5}',     -- 0=Sun … 6=Sat
  tz text not null default 'UTC',
  enabled boolean not null default true,
  snooze_until timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists habit_reminders_user_idx on public.habit_reminders (user_id);
alter table public.habit_reminders enable row level security;
drop policy if exists "habit_reminders_own" on public.habit_reminders;
create policy "habit_reminders_own" on public.habit_reminders for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===== one-shot read for the app (settings + matrix + reminders) =====
create or replace function public.get_notification_center()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'settings', (
      select to_jsonb(s) from public.notification_settings s where s.user_id = auth.uid()
    ),
    'prefs', coalesce((
      select jsonb_agg(jsonb_build_object('type', p.type, 'channel', p.channel, 'enabled', p.enabled))
      from public.notification_preferences p where p.user_id = auth.uid()
    ), '[]'::jsonb),
    'reminders', coalesce((
      select jsonb_agg(to_jsonb(r)) from public.habit_reminders r where r.user_id = auth.uid()
    ), '[]'::jsonb)
  );
$$;
grant execute on function public.get_notification_center() to authenticated;
