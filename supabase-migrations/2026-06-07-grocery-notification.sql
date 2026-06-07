-- Tailored notification when a coach sends a grocery list to a client:
-- "{Coach} loaded your meal plan into grocery lists — {list}".
-- SECURITY DEFINER (writes a notification for someone other than the actor),
-- gated on is_coach_on_client so only the client's linked coach can fire it.
-- Idempotent. Run on Supabase.

create or replace function public.notify_grocery_list(p_client uuid, p_list text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cname text;
begin
  if p_client is null or not public.is_coach_on_client(p_client) then
    return;
  end if;
  select coalesce(full_name, 'Your coach') into cname from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, type, title, body, route, data)
  values (
    p_client,
    'grocery',
    'Grocery list ready',
    coalesce(cname, 'Your coach') || ' loaded your meal plan into grocery lists'
      || case when coalesce(p_list, '') <> '' then ' — ' || p_list else '' end,
    'eat',
    jsonb_build_object('list', coalesce(p_list, ''))
  );
end;
$$;

grant execute on function public.notify_grocery_list(uuid, text) to authenticated;
