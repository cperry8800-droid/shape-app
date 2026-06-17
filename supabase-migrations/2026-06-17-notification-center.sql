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

-- ===== habits base tables (idempotent) =====
-- The /api/client/habits route + habit reminders need these; they were never
-- applied on some projects (habits fell back to local storage), which also broke
-- the FK below. Created here so one run makes the whole habits system + reminders
-- work server-side. Mirrors 2026-05-28-user-habits.sql; safe to re-run.
create table if not exists public.user_habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'do' check (type in ('do', 'avoid')),
  cadence text not null default 'daily',
  visibility text not null default 'private' check (visibility in ('private', 'friends', 'public')),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_habits_user_id_idx on public.user_habits (user_id);
create index if not exists user_habits_user_archived_idx on public.user_habits (user_id, archived_at);
alter table public.user_habits enable row level security;
drop policy if exists "habits readable by owner" on public.user_habits;
create policy "habits readable by owner" on public.user_habits for select using (auth.uid() = user_id);
drop policy if exists "habits insertable by owner" on public.user_habits;
create policy "habits insertable by owner" on public.user_habits for insert with check (auth.uid() = user_id);
drop policy if exists "habits updatable by owner" on public.user_habits;
create policy "habits updatable by owner" on public.user_habits for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "habits deletable by owner" on public.user_habits;
create policy "habits deletable by owner" on public.user_habits for delete using (auth.uid() = user_id);

create table if not exists public.user_habit_completions (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.user_habits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  done_on date not null,
  created_at timestamptz not null default now(),
  unique(habit_id, done_on)
);
create index if not exists user_habit_completions_user_done_idx on public.user_habit_completions (user_id, done_on desc);
create index if not exists user_habit_completions_habit_idx on public.user_habit_completions (habit_id, done_on desc);
alter table public.user_habit_completions enable row level security;
drop policy if exists "completions readable by owner" on public.user_habit_completions;
create policy "completions readable by owner" on public.user_habit_completions for select using (auth.uid() = user_id);
drop policy if exists "completions insertable by owner" on public.user_habit_completions;
create policy "completions insertable by owner" on public.user_habit_completions for insert with check (auth.uid() = user_id);
drop policy if exists "completions deletable by owner" on public.user_habit_completions;
create policy "completions deletable by owner" on public.user_habit_completions for delete using (auth.uid() = user_id);

create or replace function public.touch_user_habits_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists user_habits_touch_updated_at on public.user_habits;
create trigger user_habits_touch_updated_at before update on public.user_habits
  for each row execute function public.touch_user_habits_updated_at();

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
