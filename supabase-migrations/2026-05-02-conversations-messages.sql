-- Shared conversations/messages for client-to-provider chat.
-- Used by website and mobile app. Idempotent, safe to re-run.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  kind text not null default 'direct'
    check (kind in ('direct','room','community')),
  title text,
  provider_role text check (provider_role in ('trainer','nutritionist')),
  provider_id bigint,
  client_id uuid references auth.users on delete set null,
  last_message text,
  last_message_at timestamptz
);

create unique index if not exists conversations_direct_unique_idx
  on public.conversations (provider_role, provider_id, client_id)
  where kind = 'direct'
    and provider_role is not null
    and provider_id is not null
    and client_id is not null;

create index if not exists conversations_client_idx
  on public.conversations (client_id, last_message_at desc nulls last);
create index if not exists conversations_provider_idx
  on public.conversations (provider_role, provider_id, last_message_at desc nulls last);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member'
    check (role in ('client','trainer','nutritionist','admin','member')),
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_participants_user_idx
  on public.conversation_participants (user_id, created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations on delete cascade,
  sender_id uuid references auth.users on delete set null,
  body text not null check (char_length(trim(body)) > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at asc);

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

create or replace function public.can_access_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (
        c.client_id = auth.uid()
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

drop policy if exists "participants read conversations" on public.conversations;
create policy "participants read conversations"
  on public.conversations for select
  to authenticated
  using (public.can_access_conversation(id));

drop policy if exists "clients create direct conversations" on public.conversations;
create policy "clients create direct conversations"
  on public.conversations for insert
  to authenticated
  with check (kind = 'direct' and client_id = auth.uid());

drop policy if exists "participants update conversations" on public.conversations;
create policy "participants update conversations"
  on public.conversations for update
  to authenticated
  using (public.can_access_conversation(id))
  with check (public.can_access_conversation(id));

drop policy if exists "participants read participants" on public.conversation_participants;
create policy "participants read participants"
  on public.conversation_participants for select
  to authenticated
  using (public.can_access_conversation(conversation_id));

drop policy if exists "users add self to conversation" on public.conversation_participants;
create policy "users add self to conversation"
  on public.conversation_participants for insert
  to authenticated
  with check (user_id = auth.uid() and public.can_access_conversation(conversation_id));

drop policy if exists "participants read messages" on public.messages;
create policy "participants read messages"
  on public.messages for select
  to authenticated
  using (public.can_access_conversation(conversation_id));

drop policy if exists "participants send messages" on public.messages;
create policy "participants send messages"
  on public.messages for insert
  to authenticated
  with check (sender_id = auth.uid() and public.can_access_conversation(conversation_id));

create or replace function public.messages_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message = new.body,
      last_message_at = new.created_at,
      updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.messages_touch_conversation();

create or replace function public.get_or_create_direct_conversation(
  p_provider_role text,
  p_provider_id bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid := auth.uid();
  v_owner_id uuid;
  v_conversation_id uuid;
  v_provider_name text;
begin
  if v_client_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_provider_role not in ('trainer','nutritionist') then
    raise exception 'Invalid provider role.';
  end if;

  if p_provider_role = 'trainer' then
    select owner_id, name into v_owner_id, v_provider_name
    from public.trainers
    where id = p_provider_id;
  else
    select owner_id, name into v_owner_id, v_provider_name
    from public.nutritionists
    where id = p_provider_id;
  end if;

  if v_provider_name is null then
    raise exception 'Provider was not found.';
  end if;

  select id into v_conversation_id
  from public.conversations
  where kind = 'direct'
    and provider_role = p_provider_role
    and provider_id = p_provider_id
    and client_id = v_client_id
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations (kind, title, provider_role, provider_id, client_id)
    values ('direct', v_provider_name, p_provider_role, p_provider_id, v_client_id)
    returning id into v_conversation_id;
  end if;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values (v_conversation_id, v_client_id, 'client')
  on conflict (conversation_id, user_id) do nothing;

  if v_owner_id is not null then
    insert into public.conversation_participants (conversation_id, user_id, role)
    values (v_conversation_id, v_owner_id, p_provider_role)
    on conflict (conversation_id, user_id) do nothing;
  end if;

  return v_conversation_id;
end;
$$;

grant execute on function public.get_or_create_direct_conversation(text, bigint) to authenticated;
