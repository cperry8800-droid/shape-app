-- 2026-11-11 — A nutritionist's grocery note can be saved, and its notice says what it is.
--
-- The nutritionist Live console (public/newdesign/NutritionistLiveConsole.html) saves a note on the
-- client's grocery list as a coach_pushed_items row of kind 'grocery_note' (payload { text }), and the
-- member's app reads it on Grocery and Eat (/api/client/coach-meals). The live kind check took
-- 'exercise', 'meal' and 'cue' (2026-11-10-coach-live-cues.sql), never 'grocery_note', so every note
-- was refused (left by #2686).
--
--   1. The kind check takes 'grocery_note' too.
--   2. notify_on_pushed_item files a note as "Note on your grocery list", the note's words as its body,
--      routed to Eat. Without its own branch the else-branch filed it as "New exercise from your coach",
--      routed to Train. The cue, meal and exercise branches are unchanged (2026-11-10-coach-live-cues.sql),
--      as read live before this was written.
--
-- Reads and writes need nothing new: the client_read SELECT policy (client_id = auth.uid()::text), the
-- coach's insert_on_client INSERT policy and owner_update UPDATE policy (the console marks an older note
-- removed) already cover every kind.
--
-- Idempotent, safe to re-run. Until it runs, Send on the grocery note is refused and the console says
-- the note did not save.

alter table public.coach_pushed_items drop constraint if exists coach_pushed_items_kind_check;
alter table public.coach_pushed_items
  add constraint coach_pushed_items_kind_check check (kind in ('exercise', 'meal', 'cue', 'grocery_note'));

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
  if new.kind = 'grocery_note' then
    insert into public.notifications (user_id, type, title, body, route, data)
    values (uid, 'grocery', 'Note on your grocery list',
            coalesce(new.payload->>'text', ''), 'eat', jsonb_build_object('itemId', new.id));
  elsif new.kind = 'meal' and lower(coalesce(new.payload->>'grocery', '')) in ('true', 't', '1') then
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
--     → CHECK ((kind = ANY (ARRAY['exercise'::text, 'meal'::text, 'cue'::text, 'grocery_note'::text])))
--   select position('Note on your grocery list' in pg_get_functiondef('public.notify_on_pushed_item'::regproc)) > 0;
--     → true
