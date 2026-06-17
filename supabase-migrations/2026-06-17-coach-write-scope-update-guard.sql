-- Coach write-scope hardening (follow-up) — assignment keys are IMMUTABLE on UPDATE.
--
-- The owner-only UPDATE policies on client_workouts / client_meal_plans
-- (2026-06-17-coach-write-scope.sql) let a coach UPDATE their OWN row and change
-- client_id to an unrelated client — bypassing the INSERT on-client guard and
-- re-opening unauthorized cross-client writes through UPDATE.
--
-- Rather than re-check the (possibly-lapsed) subscription on every edit — which
-- would block legitimate edits to historical assignments after a sub lapses, the
-- behaviour the UPDATE policy deliberately keeps — we FREEZE the assignment keys:
-- client_id and the provider FK cannot change once the row exists. Everything
-- else (payload, title, schedule, status) stays editable by the owner. A real
-- re-assignment is a fresh INSERT, which still runs the on-client check.
--
-- Idempotent. Safe to re-run.

-- ===== client_workouts: client_id + trainer_id immutable on UPDATE =====
create or replace function public.freeze_client_workout_keys()
returns trigger
language plpgsql
as $$
begin
  if new.client_id is distinct from old.client_id
     or new.trainer_id is distinct from old.trainer_id then
    raise exception 'client_id and trainer_id are immutable on client_workouts';
  end if;
  return new;
end;
$$;

drop trigger if exists freeze_client_workout_keys on public.client_workouts;
create trigger freeze_client_workout_keys
  before update on public.client_workouts
  for each row execute function public.freeze_client_workout_keys();

-- ===== client_meal_plans: client_id + nutritionist_id immutable on UPDATE =====
create or replace function public.freeze_client_meal_plan_keys()
returns trigger
language plpgsql
as $$
begin
  if new.client_id is distinct from old.client_id
     or new.nutritionist_id is distinct from old.nutritionist_id then
    raise exception 'client_id and nutritionist_id are immutable on client_meal_plans';
  end if;
  return new;
end;
$$;

drop trigger if exists freeze_client_meal_plan_keys on public.client_meal_plans;
create trigger freeze_client_meal_plan_keys
  before update on public.client_meal_plans
  for each row execute function public.freeze_client_meal_plan_keys();
