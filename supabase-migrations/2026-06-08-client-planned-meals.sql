-- Today's plan: meals a member adds themselves (e.g. "Add to today's plan" from
-- a recipe page) — distinct from coach-pushed meals. Synced to the account so it
-- shows on web + the mobile app (both read /api/client/nutrition). Idempotent.
-- Run on Supabase.

create table if not exists public.client_planned_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_on date not null default current_date,
  name text not null,
  kcal integer default 0,
  protein integer default 0,
  carbs integer default 0,
  fat integer default 0,
  source text,
  meal_ref text,                       -- recipe slug/id (for dedupe + remove)
  created_at timestamptz not null default now()
);

create index if not exists client_planned_meals_user_day_idx
  on public.client_planned_meals (user_id, planned_on);
-- one row per recipe per day
create unique index if not exists client_planned_meals_dedupe_idx
  on public.client_planned_meals (user_id, planned_on, meal_ref)
  where meal_ref is not null;

alter table public.client_planned_meals enable row level security;

drop policy if exists "planned_meals owner read" on public.client_planned_meals;
create policy "planned_meals owner read" on public.client_planned_meals
  for select using (auth.uid() = user_id);

drop policy if exists "planned_meals owner insert" on public.client_planned_meals;
create policy "planned_meals owner insert" on public.client_planned_meals
  for insert with check (auth.uid() = user_id);

drop policy if exists "planned_meals owner update" on public.client_planned_meals;
create policy "planned_meals owner update" on public.client_planned_meals
  for update using (auth.uid() = user_id);

drop policy if exists "planned_meals owner delete" on public.client_planned_meals;
create policy "planned_meals owner delete" on public.client_planned_meals
  for delete using (auth.uid() = user_id);
