-- Notify a client when their coach sends them content:
--   * client_workouts            → new workout assigned
--   * coach_program_assignments  → new training program / meal plan
--   * coach_pushed_items         → pushed meal (feeds grocery list) / exercise
--
-- AFTER INSERT triggers so they fire regardless of which path created the row
-- (web API or mobile direct insert). SECURITY DEFINER to write the notification
-- regardless of the actor's RLS. The notifications table is already on the
-- supabase_realtime publication, so these surface as a live toast + feed item.
-- Requires 2026-05-30-notifications.sql. Idempotent, safe to re-run.

-- ===== Workout assigned =====
create or replace function public.notify_on_client_workout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'published' then
    return new;
  end if;
  insert into public.notifications (user_id, type, title, body, route, data)
  values (new.client_id, 'workout', 'New workout from your coach',
          coalesce(new.title, ''), 'train', jsonb_build_object('workoutId', new.id));
  return new;
end;
$$;

drop trigger if exists client_workouts_notify on public.client_workouts;
create trigger client_workouts_notify
  after insert on public.client_workouts
  for each row execute function public.notify_on_client_workout();

-- ===== Program / meal-plan assigned =====
create or replace function public.notify_on_program_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ttl text;
  is_meal boolean := (new.provider_role = 'nutritionist');
begin
  select title into ttl from public.coach_program_templates where id = new.program_template_id;
  insert into public.notifications (user_id, type, title, body, route, data)
  values (
    new.client_id,
    case when is_meal then 'meal_plan' else 'program' end,
    case when is_meal then 'New meal plan from your coach' else 'New training program from your coach' end,
    coalesce(ttl, ''),
    case when is_meal then 'eat' else 'train' end,
    jsonb_build_object('assignmentId', new.id)
  );
  return new;
end;
$$;

drop trigger if exists coach_program_assignments_notify on public.coach_program_assignments;
create trigger coach_program_assignments_notify
  after insert on public.coach_program_assignments
  for each row execute function public.notify_on_program_assignment();

-- ===== Pushed item (meal → grocery, or exercise) =====
-- coach_pushed_items.client_id is text (it also backs demo ids), so only notify
-- when it's a real auth uuid.
create or replace function public.notify_on_pushed_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  if new.client_id !~ '^[0-9a-fA-F-]{36}$' then
    return new;
  end if;
  uid := new.client_id::uuid;
  if new.kind = 'meal' then
    insert into public.notifications (user_id, type, title, body, route, data)
    values (uid, 'grocery', 'New meal + grocery items',
            coalesce(new.payload->>'name', ''), 'eat', jsonb_build_object('itemId', new.id));
  else
    insert into public.notifications (user_id, type, title, body, route, data)
    values (uid, 'workout', 'New exercise from your coach',
            coalesce(new.payload->>'name', ''), 'train', jsonb_build_object('itemId', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists coach_pushed_items_notify on public.coach_pushed_items;
create trigger coach_pushed_items_notify
  after insert on public.coach_pushed_items
  for each row execute function public.notify_on_pushed_item();
