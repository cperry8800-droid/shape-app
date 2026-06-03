-- Member-to-member direct messages.
-- Reuses conversations / conversation_participants / messages from
-- 2026-05-02-conversations-messages.sql (RLS there already grants participants
-- read + send). Idempotent — safe to re-run.

-- Dedupe key for a 1:1 member DM = sorted pair of user ids ("a:b").
alter table public.conversations add column if not exists dm_key text;
create unique index if not exists conversations_dm_key_unique_idx
  on public.conversations (dm_key)
  where dm_key is not null;

-- Find or create the 1:1 conversation between the caller and another member.
-- SECURITY DEFINER so the insert (client_id null) bypasses the client-only
-- insert policy; both members are added as participants, which is what the
-- read/send RLS keys off.
create or replace function public.get_or_create_member_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_conversation_id uuid;
begin
  if v_me is null then
    raise exception 'Authentication is required.';
  end if;
  if p_other_user_id is null or p_other_user_id = v_me then
    raise exception 'Pick another member to message.';
  end if;
  if not exists (select 1 from public.profiles where id = p_other_user_id) then
    raise exception 'Member was not found.';
  end if;

  v_key := case when v_me < p_other_user_id
                then v_me::text || ':' || p_other_user_id::text
                else p_other_user_id::text || ':' || v_me::text end;

  select id into v_conversation_id
  from public.conversations
  where dm_key = v_key
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations (kind, dm_key)
    values ('direct', v_key)
    returning id into v_conversation_id;
  end if;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values (v_conversation_id, v_me, 'member'),
         (v_conversation_id, p_other_user_id, 'member')
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;
grant execute on function public.get_or_create_member_conversation(uuid) to authenticated;

-- List the caller's member DM threads with the COUNTERPART's name resolved, so
-- each side sees the other person's name (not their own).
create or replace function public.list_member_dm_threads()
returns table (
  conversation_id uuid,
  other_id uuid,
  other_name text,
  last_message text,
  last_message_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         other.user_id,
         p.full_name,
         c.last_message,
         c.last_message_at
  from public.conversations c
  join public.conversation_participants me
    on me.conversation_id = c.id and me.user_id = auth.uid()
  join public.conversation_participants other
    on other.conversation_id = c.id and other.user_id <> auth.uid()
  left join public.profiles p on p.id = other.user_id
  where c.kind = 'direct' and c.dm_key is not null
  order by c.last_message_at desc nulls last;
$$;
grant execute on function public.list_member_dm_threads() to authenticated;
