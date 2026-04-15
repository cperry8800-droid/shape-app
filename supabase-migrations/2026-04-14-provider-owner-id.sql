-- Phase 3 — Provider onboarding
-- Adds owner_id columns on trainers/nutritionists so the Stripe webhook
-- and provider dashboards can join a provider row to the auth.users row
-- of the person who runs that business.
--
-- Also adds RLS policies so a logged-in provider can read their own
-- subscriptions rows (where they're the provider, not the client).
--
-- Safe to re-run. Idempotent.

-- ===== Columns =====

alter table public.trainers
  add column if not exists owner_id uuid references auth.users on delete set null;

alter table public.nutritionists
  add column if not exists owner_id uuid references auth.users on delete set null;

alter table public.gyms
  add column if not exists owner_id uuid references auth.users on delete set null;

create index if not exists trainers_owner_idx
  on public.trainers (owner_id);
create index if not exists nutritionists_owner_idx
  on public.nutritionists (owner_id);
create index if not exists gyms_owner_idx
  on public.gyms (owner_id);

-- ===== Provider dashboard: self-update their own provider row =====
-- A logged-in user with a trainer/nutritionist/gym owner row can update
-- their own profile details (bio, price, tags, etc.).

drop policy if exists "trainers update own row" on public.trainers;
create policy "trainers update own row"
  on public.trainers for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "nutritionists update own row" on public.nutritionists;
create policy "nutritionists update own row"
  on public.nutritionists for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "gyms update own row" on public.gyms;
create policy "gyms update own row"
  on public.gyms for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ===== Subscriptions: providers read their own subscribers =====
-- Join auth.uid() to trainers.owner_id / nutritionists.owner_id via the
-- subscriptions.provider_id + provider_role pair.

drop policy if exists "providers read own subscriptions" on public.subscriptions;
create policy "providers read own subscriptions"
  on public.subscriptions for select
  to authenticated
  using (
    (provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = subscriptions.provider_id
        and t.owner_id = auth.uid()
    ))
    or
    (provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = subscriptions.provider_id
        and n.owner_id = auth.uid()
    ))
  );

-- ===== Claim helper =====
-- A one-shot function a newly-created provider user can call to claim an
-- existing unassigned provider row (matched by name). Use sparingly — in
-- production this should be an admin-approved flow, not self-service.
-- Kept here for dev/seed convenience.

create or replace function public.claim_provider_row(
  p_role text,
  p_provider_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_role = 'trainer' then
    update public.trainers
    set owner_id = auth.uid()
    where id = p_provider_id and owner_id is null;
  elsif p_role = 'nutritionist' then
    update public.nutritionists
    set owner_id = auth.uid()
    where id = p_provider_id and owner_id is null;
  elsif p_role = 'gym' then
    update public.gyms
    set owner_id = auth.uid()
    where id = p_provider_id and owner_id is null;
  else
    raise exception 'invalid role %', p_role;
  end if;
end;
$$;

revoke all on function public.claim_provider_row(text, bigint) from public;
grant execute on function public.claim_provider_row(text, bigint) to authenticated;
