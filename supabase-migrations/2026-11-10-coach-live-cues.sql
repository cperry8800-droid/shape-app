-- 2026-11-10 — A coach's live cue is a row of its own, not the client's focus banner.
--
-- The live panel's Send cue (public/newdesign/coachLiveWorkout.jsx, and the app's
-- ShapeCoachFeed.sendCue) posted action 'focus' to /api/{trainer,nutritionist}/console, which
-- upserts coach_focus_banners: ONE row per coach and client. So a cue ("Brace") replaced the
-- coach's weekly focus on the member's Home, and a focus saved during a workout popped up on the
-- member's workout screen as a cue. A cue is now a coach_pushed_items row of kind 'cue'
-- (payload { text }), appended per cue; the member's workout screen reads those, and the banner is
-- the focus alone.
--
--   1. The kind check takes 'cue' (it took 'exercise' and 'meal').
--   2. notify_on_pushed_item sends nothing for a cue: the member sees it live on the workout
--      screen, and its else-branch would have filed every cue as "New exercise from your coach".
--      The exercise and meal branches are unchanged (2026-06-07-grocery-pushed-notification.sql).
--
-- Reads and writes need nothing new: the client_read SELECT policy (client_id = auth.uid()::text),
-- the coach's insert_on_client INSERT policy (an active coach of this discipline only) and the
-- table's realtime publication (2026-05-23) already cover every kind.
--
-- Idempotent, safe to re-run. Run it before the code that sends action 'cue' is deployed: until
-- it runs, a cue's insert is refused by the old check and the coach is told the cue did not send.

alter table public.coach_pushed_items drop constraint if exists coach_pushed_items_kind_check;
alter table public.coach_pushed_items
  add constraint coach_pushed_items_kind_check check (kind in ('exercise', 'meal', 'cue'));

create or replace function public.notify_on_pushed_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid;
  cname text;
begin
  if new.client_id !~ '^[0-9a-fA-F-]{36}$' then
    return new;
  end if;
  -- A live cue is read on the workout screen as it lands; it is no notification.
  if new.kind = 'cue' then
    return new;
  end if;
  uid := new.client_id::uuid;
  if new.kind = 'meal' and lower(coalesce(new.payload->>'grocery', '')) in ('true', 't', '1') then
    select coalesce(full_name, 'Your coach') into cname from public.profiles where id = auth.uid();
    insert into public.notifications (user_id, type, title, body, route, data)
    values (uid, 'grocery', 'Grocery list ready',
            coalesce(cname, 'Your coach') || ' loaded your meal plan into grocery lists'
              || case when coalesce(new.payload->>'name', '') <> '' then ' — ' || (new.payload->>'name') else '' end,
            'eat', jsonb_build_object('itemId', new.id));
  elsif new.kind = 'meal' then
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

-- Verify after apply (read-only):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'coach_pushed_items_kind_check';
--     → CHECK ((kind = ANY (ARRAY['exercise'::text, 'meal'::text, 'cue'::text])))
--   select position('''cue''' in pg_get_functiondef('public.notify_on_pushed_item'::regproc)) > 0;
--     → true
