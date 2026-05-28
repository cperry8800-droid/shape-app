-- User habits + completion history.
-- Replaces the previous localStorage-only client storage on ClientHabits.html
-- and in the mobile app. Each user owns their habits; each habit has a date
-- of completion in user_habit_completions.

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
create policy "habits readable by owner" on public.user_habits
  for select using (auth.uid() = user_id);

drop policy if exists "habits insertable by owner" on public.user_habits;
create policy "habits insertable by owner" on public.user_habits
  for insert with check (auth.uid() = user_id);

drop policy if exists "habits updatable by owner" on public.user_habits;
create policy "habits updatable by owner" on public.user_habits
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "habits deletable by owner" on public.user_habits;
create policy "habits deletable by owner" on public.user_habits
  for delete using (auth.uid() = user_id);

-- One row per (habit, completion date). Streak length is computed in app code
-- by counting consecutive dates ending today/yesterday.
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
create policy "completions readable by owner" on public.user_habit_completions
  for select using (auth.uid() = user_id);

drop policy if exists "completions insertable by owner" on public.user_habit_completions;
create policy "completions insertable by owner" on public.user_habit_completions
  for insert with check (auth.uid() = user_id);

drop policy if exists "completions deletable by owner" on public.user_habit_completions;
create policy "completions deletable by owner" on public.user_habit_completions
  for delete using (auth.uid() = user_id);

-- Touch updated_at on update.
create or replace function public.touch_user_habits_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists user_habits_touch_updated_at on public.user_habits;
create trigger user_habits_touch_updated_at
  before update on public.user_habits
  for each row execute function public.touch_user_habits_updated_at();
