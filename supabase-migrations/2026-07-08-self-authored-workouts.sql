-- Self-authored training: a member with no coach builds their own workouts,
-- programs, and race schedules. Self rows are client_workouts with a NULL
-- trainer_id, written directly by the member under RLS. Coach rows (trainer_id
-- set) stay client-untouchable and self rows stay coach-untouchable, both ways.
-- The existing coach policies remain scoped to the caller's owned trainer_id
-- rows, so this only ADDS a client-owned self-row path.
-- Requires 2026-04-18-client-workouts.sql + 2026-05-30-coach-content-notifications.sql.
-- Idempotent, safe to re-run.

-- 1. trainer_id becomes nullable (self rows carry NULL; coach rows keep their id).
alter table public.client_workouts alter column trainer_id drop not null;

-- 2. Client self-CRUD. The caller owns the row (client_id = auth.uid()) AND it is
--    a self row (trainer_id is null). Every `with check` pins BOTH, so a client
--    can never create a coach row, claim an existing one, or move a row to
--    another member. SELECT is already covered by client_read_own_client_workouts
--    (client_id = auth.uid()), which also returns self rows.
drop policy if exists "client_insert_self_workouts" on public.client_workouts;
create policy "client_insert_self_workouts"
  on public.client_workouts for insert
  to authenticated
  with check (client_id = auth.uid() and trainer_id is null);

drop policy if exists "client_update_self_workouts" on public.client_workouts;
create policy "client_update_self_workouts"
  on public.client_workouts for update
  to authenticated
  using (client_id = auth.uid() and trainer_id is null)
  with check (client_id = auth.uid() and trainer_id is null);

drop policy if exists "client_delete_self_workouts" on public.client_workouts;
create policy "client_delete_self_workouts"
  on public.client_workouts for delete
  to authenticated
  using (client_id = auth.uid() and trainer_id is null);

-- 3. Guard "New workout from your coach" so a self-save (or a 100-row program
--    materialization) never spams the member with false coach notifications.
--    Reproduces notify_on_client_workout (2026-05-30-coach-content-notifications.sql)
--    VERBATIM and adds only the self-row early-return — a NULL trainer_id notifies
--    nothing. The trigger `client_workouts_notify` still points at this function.
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
  -- Self-authored rows (no coach) must not fire the coach-content notification.
  if new.trainer_id is null then
    return new;
  end if;
  insert into public.notifications (user_id, type, title, body, route, data)
  values (new.client_id, 'workout', 'New workout from your coach',
          coalesce(new.title, ''), 'train', jsonb_build_object('workoutId', new.id));
  return new;
end;
$$;
