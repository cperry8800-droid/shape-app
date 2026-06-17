-- Coach write-scope hardening — a pro may assign only to a client they ACTIVELY
-- coach, in their OWN discipline.
--
-- The gap: the client_workouts / client_meal_plans INSERT policies checked only
-- that the caller OWNS the trainer/nutritionist row — never that they hold an
-- active subscription to the target client. So any trainer could write a workout
-- (or any nutritionist a meal plan) for ANY client_id. The mobile coach app
-- assigns workouts via a DIRECT Supabase insert (services/shapeBackend.js
-- assignClientWorkout), so RLS was the only server-side gate for that path.
--
-- This migration:
--   1. is_discipline_coach_on_client(client, discipline) — a discipline-scoped
--      variant of is_coach_on_client (active/trialing sub via a provider row the
--      caller owns, for THAT discipline).
--   2. Splits the broad "for all" owner policy on each table into manage
--      (select/update/delete, owner-scoped — history stays visible/editable even
--      if the sub later lapses) + a stricter INSERT policy that ALSO requires an
--      active subscription to the target client in the matching discipline.
--
-- The /api/trainer/workout and /api/nutritionist/meal-plan routes re-check the
-- same rule for a clean 403 (and Nora's assign tools call those routes). Both
-- layers enforce; neither relies on the UI.
--
-- Idempotent. Safe to re-run.

-- ===== discipline-scoped on-client predicate =====
create or replace function public.is_discipline_coach_on_client(p_client_id uuid, p_discipline text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.client_id = p_client_id
      and s.status in ('active', 'trialing')
      and s.provider_role = p_discipline
      and (
        (p_discipline = 'trainer' and exists (
          select 1 from public.trainers t
          where t.id = s.provider_id and t.owner_id = auth.uid()
        ))
        or
        (p_discipline = 'nutritionist' and exists (
          select 1 from public.nutritionists n
          where n.id = s.provider_id and n.owner_id = auth.uid()
        ))
      )
  );
$$;

grant execute on function public.is_discipline_coach_on_client(uuid, text) to authenticated;

-- ===== client_workouts: manage (owner) + insert (owner + on-client) =====
-- Replace the single owner-only "for all" policy.
drop policy if exists "trainer_write_own_client_workouts" on public.client_workouts;

drop policy if exists "trainer_select_own_client_workouts" on public.client_workouts;
create policy "trainer_select_own_client_workouts"
  on public.client_workouts for select
  to authenticated
  using (
    exists (select 1 from public.trainers t
            where t.id = client_workouts.trainer_id and t.owner_id = auth.uid())
  );

drop policy if exists "trainer_update_own_client_workouts" on public.client_workouts;
create policy "trainer_update_own_client_workouts"
  on public.client_workouts for update
  to authenticated
  using (
    exists (select 1 from public.trainers t
            where t.id = client_workouts.trainer_id and t.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.trainers t
            where t.id = client_workouts.trainer_id and t.owner_id = auth.uid())
  );

drop policy if exists "trainer_delete_own_client_workouts" on public.client_workouts;
create policy "trainer_delete_own_client_workouts"
  on public.client_workouts for delete
  to authenticated
  using (
    exists (select 1 from public.trainers t
            where t.id = client_workouts.trainer_id and t.owner_id = auth.uid())
  );

-- INSERT: own the trainer row AND actively coach this client as a trainer.
drop policy if exists "trainer_insert_on_client_workouts" on public.client_workouts;
create policy "trainer_insert_on_client_workouts"
  on public.client_workouts for insert
  to authenticated
  with check (
    exists (select 1 from public.trainers t
            where t.id = client_workouts.trainer_id and t.owner_id = auth.uid())
    and public.is_discipline_coach_on_client(client_workouts.client_id, 'trainer')
  );

-- ===== client_meal_plans: manage (owner) + insert (owner + on-client) =====
drop policy if exists "nutritionist_write_own_meal_plans" on public.client_meal_plans;

drop policy if exists "nutritionist_select_own_meal_plans" on public.client_meal_plans;
create policy "nutritionist_select_own_meal_plans"
  on public.client_meal_plans for select
  to authenticated
  using (
    exists (select 1 from public.nutritionists n
            where n.id = client_meal_plans.nutritionist_id and n.owner_id = auth.uid())
  );

drop policy if exists "nutritionist_update_own_meal_plans" on public.client_meal_plans;
create policy "nutritionist_update_own_meal_plans"
  on public.client_meal_plans for update
  to authenticated
  using (
    exists (select 1 from public.nutritionists n
            where n.id = client_meal_plans.nutritionist_id and n.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.nutritionists n
            where n.id = client_meal_plans.nutritionist_id and n.owner_id = auth.uid())
  );

drop policy if exists "nutritionist_delete_own_meal_plans" on public.client_meal_plans;
create policy "nutritionist_delete_own_meal_plans"
  on public.client_meal_plans for delete
  to authenticated
  using (
    exists (select 1 from public.nutritionists n
            where n.id = client_meal_plans.nutritionist_id and n.owner_id = auth.uid())
  );

drop policy if exists "nutritionist_insert_on_meal_plans" on public.client_meal_plans;
create policy "nutritionist_insert_on_meal_plans"
  on public.client_meal_plans for insert
  to authenticated
  with check (
    exists (select 1 from public.nutritionists n
            where n.id = client_meal_plans.nutritionist_id and n.owner_id = auth.uid())
    and public.is_discipline_coach_on_client(client_meal_plans.client_id, 'nutritionist')
  );

-- ===== assignment keys are immutable on UPDATE =====
-- The owner-scoped UPDATE policies above intentionally allow editing a row's
-- CONTENT even after a subscription lapses (history stays editable). But an
-- unconstrained UPDATE would also let a coach REASSIGN client_id (or the
-- provider id) to a client they don't actively coach — re-opening the exact gap
-- the on-client INSERT guard closes (RLS WITH CHECK only sees the NEW row, so it
-- can't compare to the old client_id; a trigger can). Lock the assignment keys:
-- they can never change on UPDATE. Putting a row on a different client must go
-- through a fresh INSERT, which is discipline-coach gated.
create or replace function public.lock_client_workout_assignment()
returns trigger
language plpgsql
as $$
begin
  if new.client_id is distinct from old.client_id
     or new.trainer_id is distinct from old.trainer_id then
    raise exception 'client_id and trainer_id are immutable on update (reassign via insert)';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_client_workout_assignment on public.client_workouts;
create trigger trg_lock_client_workout_assignment
  before update on public.client_workouts
  for each row execute function public.lock_client_workout_assignment();

create or replace function public.lock_client_meal_plan_assignment()
returns trigger
language plpgsql
as $$
begin
  if new.client_id is distinct from old.client_id
     or new.nutritionist_id is distinct from old.nutritionist_id then
    raise exception 'client_id and nutritionist_id are immutable on update (reassign via insert)';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_client_meal_plan_assignment on public.client_meal_plans;
create trigger trg_lock_client_meal_plan_assignment
  before update on public.client_meal_plans
  for each row execute function public.lock_client_meal_plan_assignment();
