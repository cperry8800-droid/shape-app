-- Persisted unread counts for channels + direct messages.
--
-- Tracks a per-user last_read marker and exposes unread-count + mark-read RPCs
-- so badges survive reloads and appear when you open Chat. Idempotent.

alter table public.channel_members
  add column if not exists last_read_at timestamptz;

-- conversation_participants.last_read_at already exists (2026-05-02 migration).

-- Unread channel messages per channel I'm a member of (not my own messages).
create or replace function public.channel_unread()
returns table(channel_id uuid, unread bigint)
language sql stable security definer set search_path = public as $$
  select m.channel_id, count(*)::bigint
  from public.channel_messages m
  join public.channel_members cm on cm.channel_id = m.channel_id and cm.user_id = auth.uid()
  where m.sender_id is distinct from auth.uid()
    and (cm.last_read_at is null or m.created_at > cm.last_read_at)
  group by m.channel_id;
$$;
grant execute on function public.channel_unread() to authenticated;

create or replace function public.mark_channel_read(p_channel_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.channel_members set last_read_at = now()
  where channel_id = p_channel_id and user_id = auth.uid();
$$;
grant execute on function public.mark_channel_read(uuid) to authenticated;

-- Unread direct messages per conversation I'm part of (not my own messages).
create or replace function public.dm_unread()
returns table(conversation_id uuid, unread bigint)
language sql stable security definer set search_path = public as $$
  select msg.conversation_id, count(*)::bigint
  from public.messages msg
  join public.conversation_participants cp on cp.conversation_id = msg.conversation_id and cp.user_id = auth.uid()
  where msg.sender_id is distinct from auth.uid()
    and (cp.last_read_at is null or msg.created_at > cp.last_read_at)
  group by msg.conversation_id;
$$;
grant execute on function public.dm_unread() to authenticated;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.conversation_participants set last_read_at = now()
  where conversation_id = p_conversation_id and user_id = auth.uid();
$$;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
