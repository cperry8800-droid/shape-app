-- Notify the recipient on every new chat message.
--
-- Done as an AFTER INSERT trigger on public.messages so it fires no matter how
-- the message was sent (website API, mobile direct insert, etc.) — one code
-- path can't be missed. SECURITY DEFINER so it can write the notification row
-- regardless of the sender's RLS.
--
-- Recipient = the other party on the conversation: if the sender is the client,
-- it's the coach (provider owner); otherwise it's the client. Requires the
-- notifications table (2026-05-30-notifications.sql). Idempotent.

create or replace function public.notify_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv record;
  recipient uuid;
begin
  select client_id, provider_role, provider_id
    into conv
    from public.conversations
   where id = new.conversation_id;
  if not found then
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
  );
  return new;
end;
$$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_on_new_message();
