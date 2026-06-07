-- When a coach pushes a grocery list (coach_pushed_items kind 'meal' with a
-- payload.grocery flag), the client's notification reads "{coach} loaded your
-- meal plan into grocery lists — {name}" and routes to Eat. Normal pushed meals
-- and exercises keep their existing notifications. Supersedes the meal/exercise
-- branches of notify_on_pushed_item (2026-05-30-coach-content-notifications.sql).
-- Idempotent. Run on Supabase.

create or replace function public.notify_on_pushed_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  cname text;
begin
  if new.client_id !~ '^[0-9a-fA-F-]{36}$' then
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
