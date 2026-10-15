-- Every notification reaches its screen (the notification audit, after #2360). Idempotent, safe to
-- re-run.
--
-- Owner, 2026-10-15: "should we run a seperate audit on all push notifications?" · "for a closed
-- shape app" · "any reviews on push notifications for this PR push to same PR as audit".
--
-- Called by: the messages_notify trigger (every message insert). Read by:
--   public/newdesign/pageShell.jsx           (dashInboxHref / dashInboxThreadFor)
--   mobile-app/src/broadsheet/bsNotificationRoute.mjs
--
-- ── A "New message" says which side of the thread its recipient is on ─────────
-- ⚠ AN ACCOUNT CAN BE A COACH AND A CLIENT (Codex on #2360). A message from that account's OWN
-- coach carries the thread's providerRole, and the website read that role as the recipient's: a
-- trainer who hires a nutritionist was sent to TrainerMessages.html?conversation=<their own
-- coaching thread>, which lists only threads on the trainer's own listing, and was told the
-- conversation could not be found. The notification now carries `side`: 'client' when the
-- recipient is the thread's client, 'coach' when they own its listing. Routing reads `side` first
-- and falls back to the role for a notification written before this.
--
-- The body is 2026-10-15-keep-care-team-private.sql's (which runs first: a care-team message reaches
-- the other coaches who still coach the client, never the client it is about), with `side` added.

create or replace function public.notify_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  conv record;
  recipient uuid;
  v_side text;
begin
  select client_id, provider_role, provider_id, dm_key
    into conv
    from public.conversations
   where id = new.conversation_id;
  if not found then
    return new;
  end if;

  -- A care-team thread: the other coaches on it hear, never the client it is about, and only
  -- those who still coach the client.
  if conv.provider_role is null and conv.dm_key is null and conv.client_id is not null then
    insert into public.notifications (user_id, type, title, body, route, data)
    select cp.user_id, 'message', 'New message', left(coalesce(new.body, ''), 80), 'messages',
           jsonb_build_object('conversationId', new.conversation_id, 'careTeam', true, 'side', 'coach')
      from public.conversation_participants cp
     where cp.conversation_id = new.conversation_id
       and cp.user_id is distinct from new.sender_id
       and cp.user_id <> conv.client_id
       and exists (
         select 1 from public.subscriptions s
         where s.client_id = conv.client_id
           and s.status in ('active', 'trialing')
           and (
             (s.provider_role = 'trainer' and exists (
               select 1 from public.trainers t where t.id = s.provider_id and t.owner_id = cp.user_id
             ))
             or (s.provider_role = 'nutritionist' and exists (
               select 1 from public.nutritionists n where n.id = s.provider_id and n.owner_id = cp.user_id
             ))
           )
       );
    return new;
  end if;

  if conv.client_id is not null and conv.client_id = new.sender_id then
    -- Client sent it → notify the coach (provider owner).
    if conv.provider_role = 'trainer' then
      select owner_id into recipient from public.trainers where id = conv.provider_id;
    elsif conv.provider_role = 'nutritionist' then
      select owner_id into recipient from public.nutritionists where id = conv.provider_id;
    end if;
    v_side := 'coach';
  else
    -- Coach (or other) sent it → notify the client.
    recipient := conv.client_id;
    v_side := 'client';
  end if;

  if recipient is null or recipient = new.sender_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, route, data)
  values (
    recipient,
    'message',
    'New message',
    left(coalesce(new.body, ''), 80),
    'messages',
    jsonb_build_object('conversationId', new.conversation_id)
      || case when conv.provider_role is not null then jsonb_build_object('providerRole', conv.provider_role, 'side', v_side) else '{}'::jsonb end
  );
  return new;
end;
$$;

do $$
begin
  if position('''careTeam''' in pg_get_functiondef('public.notify_on_new_message()'::regprocedure)) = 0 then
    raise exception 'notify_on_new_message lost the care-team branch (2026-10-15-keep-care-team-private.sql)';
  end if;
  if position('t.owner_id = cp.user_id' in pg_get_functiondef('public.notify_on_new_message()'::regprocedure)) = 0
     or position('n.owner_id = cp.user_id' in pg_get_functiondef('public.notify_on_new_message()'::regprocedure)) = 0 then
    raise exception 'notify_on_new_message tells a former coach about a care-team message (2026-10-15-keep-care-team-private.sql)';
  end if;
  if position('''side''' in pg_get_functiondef('public.notify_on_new_message()'::regprocedure)) = 0 then
    raise exception 'notify_on_new_message does not say which side the recipient is on';
  end if;
  if position('providerRole' in pg_get_functiondef('public.notify_on_new_message()'::regprocedure)) = 0 then
    raise exception 'notify_on_new_message does not name the thread''s role';
  end if;
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'messages' and t.tgfoid = 'public.notify_on_new_message()'::regprocedure and t.tgenabled <> 'D'
  ) then
    raise exception 'no enabled trigger on messages calls notify_on_new_message';
  end if;
end $$;
