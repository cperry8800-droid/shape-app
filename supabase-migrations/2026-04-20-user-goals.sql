-- Per-user goal page state — goal cards, revenue calculator inputs,
-- momentum stats. Used by newdesign TrainerGoal.html and NutritionistGoal.html.
--
-- One row per (user_id, kind) so a user can have separate goal state for
-- their trainer dashboard vs. nutritionist dashboard if they wear both hats.
-- Data lives in a single JSONB blob so widgets can evolve without migrations.
--
-- Idempotent, safe to re-run.

create table if not exists public.user_goals (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.user_goals enable row level security;

drop policy if exists "user_goals_read_own" on public.user_goals;
create policy "user_goals_read_own"
  on public.user_goals for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_goals_insert_own" on public.user_goals;
create policy "user_goals_insert_own"
  on public.user_goals for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_goals_update_own" on public.user_goals;
create policy "user_goals_update_own"
  on public.user_goals for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.user_goals_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_goals_touch_updated_at on public.user_goals;
create trigger user_goals_touch_updated_at
  before update on public.user_goals
  for each row execute function public.user_goals_set_updated_at();
