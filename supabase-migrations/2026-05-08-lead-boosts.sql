-- Lead Boosts for coach marketplace placement.
-- Idempotent and safe to re-run.

create table if not exists public.coach_lead_boosts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  provider_role text not null check (provider_role in ('trainer','nutritionist')),
  provider_id bigint not null,
  duration_days integer not null check (duration_days in (7, 14, 30)),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active'
    check (status in ('pending','active','expired','cancelled')),
  source text not null default 'shape_store'
    check (source in ('shape_store','admin','manual')),
  notes text,
  created_by uuid references auth.users on delete set null,
  constraint coach_lead_boosts_window_check check (ends_at > starts_at)
);

create index if not exists coach_lead_boosts_lookup_idx
  on public.coach_lead_boosts (provider_role, provider_id, status, ends_at desc);

create index if not exists coach_lead_boosts_active_idx
  on public.coach_lead_boosts (status, starts_at, ends_at);

create or replace function public.coach_lead_boosts_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists coach_lead_boosts_touch on public.coach_lead_boosts;
create trigger coach_lead_boosts_touch
  before update on public.coach_lead_boosts
  for each row execute function public.coach_lead_boosts_touch_updated_at();

alter table public.coach_lead_boosts enable row level security;

drop policy if exists "public_read_active_lead_boosts" on public.coach_lead_boosts;
create policy "public_read_active_lead_boosts"
  on public.coach_lead_boosts for select
  to anon, authenticated
  using (status = 'active');

drop policy if exists "trainer_write_own_lead_boosts" on public.coach_lead_boosts;
create policy "trainer_write_own_lead_boosts"
  on public.coach_lead_boosts for all
  to authenticated
  using (
    provider_role = 'trainer'
    and exists (
      select 1 from public.trainers t
      where t.id = coach_lead_boosts.provider_id
        and t.owner_id = auth.uid()
    )
  )
  with check (
    provider_role = 'trainer'
    and exists (
      select 1 from public.trainers t
      where t.id = coach_lead_boosts.provider_id
        and t.owner_id = auth.uid()
    )
  );

drop policy if exists "nutritionist_write_own_lead_boosts" on public.coach_lead_boosts;
create policy "nutritionist_write_own_lead_boosts"
  on public.coach_lead_boosts for all
  to authenticated
  using (
    provider_role = 'nutritionist'
    and exists (
      select 1 from public.nutritionists n
      where n.id = coach_lead_boosts.provider_id
        and n.owner_id = auth.uid()
    )
  )
  with check (
    provider_role = 'nutritionist'
    and exists (
      select 1 from public.nutritionists n
      where n.id = coach_lead_boosts.provider_id
        and n.owner_id = auth.uid()
    )
  );

