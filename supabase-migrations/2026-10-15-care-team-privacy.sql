-- A client never reads, or is told about, their coaches' care-team thread (the notification audit,
-- 2026-10-15). Idempotent, safe to re-run.
--
-- Owner, 2026-10-15: "go ahead, fix the privacy one first".
--
-- A care-team thread is the private coach-to-coach thread about a shared client:
-- get_or_create_coach_coach_conversation (2026-05-26-shared-clients.sql) writes it as
-- kind = 'direct', title 'Care team', NO provider, client_id = the client it is ABOUT, and the two
-- coaches as its only participants.
--
-- ⚠ TWO LEAKS, BOTH FROM READING client_id AS "THIS IS THE CLIENT'S THREAD":
-- 1. can_access_conversation (2026-05-02-conversations-messages.sql, the production definition
--    checked 2026-10-15) granted any thread whose client_id is the caller. Every policy on
--    conversations, messages and conversation_participants goes through it, so the client could
--    list the care-team thread, read every message in it, post into it, and add themselves as a
--    participant. public/newdesign/chatWidget.jsx had registered this and only stopped LISTING it.
-- 2. notify_on_new_message sent each coach's message to conv.client_id whenever the sender was
--    not the client: the client got "New message" with the first 80 characters of what their
--    coaches wrote about them, and the other coach got nothing.
--
-- So:
-- - the client branch of can_access_conversation needs a provider (provider_role is not null):
--   the coach threads a client really has (get_or_create_direct_conversation, open_coach_thread,
--   get_or_create_client_conversation) all carry one, and a care-team thread never does;
-- - a client a client-side write had added to a care-team thread is taken out;
-- - a care-team message notifies the thread's other participants (the other coach), never the
--   client, with data.careTeam so the inbox opens it where coaches read it.
--
-- Production held no conversations and no notifications on 2026-10-15: nobody was exposed.
--
-- Called by: every RLS policy on conversations, messages and conversation_participants
-- (can_access_conversation); the messages_notify trigger (notify_on_new_message).

-- ── 1. Access ───────────────────────────────────────────────────────────────────
create or replace function public.can_access_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (
        -- The client of a coach thread. A care-team thread has client_id = the client it is
        -- about and no provider; the client is not one of its people.
        (c.client_id = auth.uid() and c.provider_role is not null)
        or exists (
          select 1
          from public.conversation_participants cp
          where cp.conversation_id = c.id and cp.user_id = auth.uid()
        )
        or (
          c.provider_role = 'trainer'
          and exists (
            select 1 from public.trainers t
            where t.id = c.provider_id and t.owner_id = auth.uid()
          )
        )
        or (
          c.provider_role = 'nutritionist'
          and exists (
            select 1 from public.nutritionists n
            where n.id = c.provider_id and n.owner_id = auth.uid()
          )
        )
      )
  );
$$;

-- ── 2. A client who added themselves to a care-team thread is taken out ─────────
-- ("users add self to conversation" let them, through the client branch above.)
delete from public.conversation_participants cp
using public.conversations c
where cp.conversation_id = c.id
  and c.kind = 'direct' and c.provider_role is null and c.dm_key is null
  and c.client_id is not null and cp.user_id = c.client_id;

-- ── 3. Who hears about a message ───────────────────────────────────────────────
-- The body is 2026-10-15-coach-thread.sql's, with the care-team branch first.
create or replace function public.notify_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  conv record;
  recipient uuid;
begin
  select client_id, provider_role, provider_id, dm_key
    into conv
    from public.conversations
   where id = new.conversation_id;
  if not found then
    return new;
  end if;

  -- A care-team thread: the other coaches on it hear, never the client it is about.
  if conv.provider_role is null and conv.dm_key is null and conv.client_id is not null then
    insert into public.notifications (user_id, type, title, body, route, data)
    select cp.user_id, 'message', 'New message', left(coalesce(new.body, ''), 80), 'messages',
           jsonb_build_object('conversationId', new.conversation_id, 'careTeam', true)
      from public.conversation_participants cp
     where cp.conversation_id = new.conversation_id
       and cp.user_id is distinct from new.sender_id
       and cp.user_id <> conv.client_id;
    return new;
  end if;

  if conv.client_id is not null and conv.client_id = new.sender_id then
    -- Client sent it → notify the coach (provider owner).
    if conv.provider_role = 'trainer' then
      select owner_id into recipient from public.trainers where id = conv.provider_id;
    elsif conv.provider_role = 'nutritionist' then
      select owner_id into recipient from public.nutritionists where id = conv.provider_id;
    end if;
  else
    -- Coach (or other) sent it → notify the client.
    recipient := conv.client_id;
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
      || case when conv.provider_role is not null then jsonb_build_object('providerRole', conv.provider_role) else '{}'::jsonb end
  );
  return new;
end;
$$;

-- ── Guard ──────────────────────────────────────────────────────────────────────
do $$
declare
  v_access text := pg_get_functiondef('public.can_access_conversation(uuid)'::regprocedure);
  v_notify text := pg_get_functiondef('public.notify_on_new_message()'::regprocedure);
begin
  if position('c.client_id = auth.uid() and c.provider_role is not null' in v_access) = 0 then
    raise exception 'can_access_conversation still grants a care-team thread to its client';
  end if;
  if position('''careTeam''' in v_notify) = 0 or position('providerRole' in v_notify) = 0 then
    raise exception 'notify_on_new_message is not this migration''s';
  end if;
  if exists (
    select 1 from public.conversation_participants cp join public.conversations c on c.id = cp.conversation_id
    where c.kind = 'direct' and c.provider_role is null and c.dm_key is null and c.client_id is not null and cp.user_id = c.client_id
  ) then
    raise exception 'a client is still a participant of a care-team thread';
  end if;
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'messages' and t.tgfoid = 'public.notify_on_new_message()'::regprocedure and t.tgenabled <> 'D'
  ) then
    raise exception 'no enabled trigger on messages calls notify_on_new_message';
  end if;
end $$;
