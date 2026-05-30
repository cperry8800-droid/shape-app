-- Client plan data model: scheduled training + prescribed meal plans.
--
-- Two gaps this closes:
--   1. client_workouts is populated (trainer dashboard assigns real workouts
--      with structured exercises) but has NO scheduling — so the app can't
--      lay assigned workouts onto a weekly calendar. We add `scheduled_date`.
--   2. There was no data model at all for prescribed meal plans. We add
--      `client_meal_plans`, mirroring client_workouts: a nutritionist assigns
--      a client a weekly menu stored as JSONB.
--
-- Idempotent, safe to re-run.

-- ===== 1. Schedule assigned workouts onto a calendar day =====

alter table public.client_workouts
  add column if not exists scheduled_date date;

create index if not exists client_workouts_client_scheduled_idx
  on public.client_workouts (client_id, scheduled_date)
  where scheduled_date is not null;

-- ===== 2. Prescribed meal plans (mirror of client_workouts) =====
--
-- One row = one weekly menu a nutritionist assigns to a client. The 7-day
-- structure (days -> meals -> ingredients/steps) lives in `payload` JSONB so
-- the builder keeps full flexibility without schema churn. Shape:
--   payload = {
--     days: [ {
--       dow: 0..6,                       -- Mon..Sun
--       title: text, kicker: text, tag: text, copy: text, coachLine: text,
--       totals:  { cal, p, c, f },
--       targets: { cal, p, c, f },
--       meals: [ {
--         time, slot, title, kcal, p, c, f, hero, brief,
--         ingredients: [ { qty, name, kcal } ], steps: [text], coachNote,
--         prep, portion, score
--       } ]
--     } ]
--   }

create table if not exists public.client_meal_plans (
  id uuid primary key default gen_random_uuid(),
  nutritionist_id bigint not null,
  client_id uuid not null,
  title text not null,
  week_start date,
  status text not null default 'published' check (status in ('published','archived')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_meal_plans_client_idx
  on public.client_meal_plans (client_id, status, created_at desc);
create index if not exists client_meal_plans_nutritionist_idx
  on public.client_meal_plans (nutritionist_id, created_at desc);

alter table public.client_meal_plans enable row level security;

-- Nutritionists who own the nutritionist row may CRUD their own assignments.
drop policy if exists "nutritionist_write_own_meal_plans" on public.client_meal_plans;
create policy "nutritionist_write_own_meal_plans"
  on public.client_meal_plans for all
  to authenticated
  using (
    exists (
      select 1 from public.nutritionists n
      where n.id = client_meal_plans.nutritionist_id and n.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.nutritionists n
      where n.id = client_meal_plans.nutritionist_id and n.owner_id = auth.uid()
    )
  );

-- Clients may read meal plans assigned to them.
drop policy if exists "client_read_own_meal_plans" on public.client_meal_plans;
create policy "client_read_own_meal_plans"
  on public.client_meal_plans for select
  to authenticated
  using (client_id = auth.uid());

create or replace function public.client_meal_plans_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_meal_plans_touch_updated_at on public.client_meal_plans;
create trigger client_meal_plans_touch_updated_at
  before update on public.client_meal_plans
  for each row execute function public.client_meal_plans_set_updated_at();
