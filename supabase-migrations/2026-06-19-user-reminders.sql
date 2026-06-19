-- User-set reminders — members schedule their own nudges to DO & LOG things
-- (weigh-in, weekly check-in, water, progress photo, or a custom label). Distinct
-- from per-habit reminders (habit_reminders) — these are standalone, not tied to a
-- habit row. The hourly /api/cron/reminders evaluator fires each due reminder once
-- per local day (deduped via last_fired_on) into the notifications table, which the
-- existing push spine fans out. Idempotent.

create table if not exists public.user_scheduled_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null default 'custom',            -- weigh_in | checkin | water | photo | custom
  label text not null default '',
  at_time text not null default '09:00',           -- 'HH:MM' local (hour granularity at fire time)
  days int[] not null default '{0,1,2,3,4,5,6}',   -- 0=Sun … 6=Sat (local)
  tz text not null default 'UTC',
  enabled boolean not null default true,
  last_fired_on date,                              -- local date the cron last fired this (dedup)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_scheduled_reminders_user_idx on public.user_scheduled_reminders (user_id);
-- Partial index the hourly cron scans (enabled only).
create index if not exists user_scheduled_reminders_enabled_idx on public.user_scheduled_reminders (enabled) where enabled;

alter table public.user_scheduled_reminders enable row level security;
-- The member owns their reminders. The cron writes last_fired_on as the service
-- role (bypasses RLS).
drop policy if exists "user_reminders_own" on public.user_scheduled_reminders;
create policy "user_reminders_own" on public.user_scheduled_reminders for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
