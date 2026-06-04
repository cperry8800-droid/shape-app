-- Coach plans — published programs (trainer) and meal plans (nutritionist),
-- shared between the mobile Plans/Programs page and the website. Owner-scoped.
-- The AI draft builder saves real rows here; duplicates persist too. Idempotent.

create table if not exists public.coach_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  kind text not null default 'program' check (kind in ('program', 'meal_plan')),
  name text not null,
  meta text,
  price text,
  published boolean not null default true,
  detail jsonb not null default '{}'::jsonb,   -- AI draft inputs (focus/goal/diet/calories/length/…)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_plans_owner_idx
  on public.coach_plans (owner_id, kind, created_at desc);

alter table public.coach_plans enable row level security;

drop policy if exists "plans_owner_all" on public.coach_plans;
create policy "plans_owner_all" on public.coach_plans for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create or replace function public.coach_plans_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists coach_plans_touch on public.coach_plans;
create trigger coach_plans_touch
  before update on public.coach_plans
  for each row execute function public.coach_plans_touch_updated_at();
