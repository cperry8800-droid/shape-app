-- Member-created community channels ("run club" style).
--
-- Any Shape member can create a channel (and becomes its host), any member can
-- discover + join any channel, the host can add other members, and members
-- post messages. Channels + their messages are public-readable (so they can be
-- discovered/previewed); posting requires membership. Idempotent, safe to re-run.

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  description text,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  last_message text,
  last_message_at timestamptz
);
create index if not exists channels_created_idx on public.channels (created_at desc);

create table if not exists public.channel_members (
  channel_id uuid not null references public.channels on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('host','member')),
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index if not exists channel_members_user_idx
  on public.channel_members (user_id, created_at desc);

create table if not exists public.channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels on delete cascade,
  sender_id uuid references auth.users on delete set null,
  author_name text,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists channel_messages_channel_idx
  on public.channel_messages (channel_id, created_at asc);

alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.channel_messages enable row level security;

-- ── Access helpers (security definer to avoid RLS recursion) ─────────────────
create or replace function public.is_channel_member(p_channel_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.channel_members m
    where m.channel_id = p_channel_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_channel_host(p_channel_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.channel_members m
    where m.channel_id = p_channel_id and m.user_id = auth.uid() and m.role = 'host'
  ) or exists (
    select 1 from public.channels c
    where c.id = p_channel_id and c.created_by = auth.uid()
  );
$$;

-- channels: anyone (authenticated) can discover; creator can insert; host edits
drop policy if exists "anyone reads channels" on public.channels;
create policy "anyone reads channels" on public.channels
  for select to authenticated using (true);

drop policy if exists "members create channels" on public.channels;
create policy "members create channels" on public.channels
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "host edits channel" on public.channels;
create policy "host edits channel" on public.channels
  for update to authenticated
  using (public.is_channel_host(id)) with check (public.is_channel_host(id));

-- members: public read (counts/lists); self-join or host-add; self-leave/host-remove
drop policy if exists "anyone reads channel members" on public.channel_members;
create policy "anyone reads channel members" on public.channel_members
  for select to authenticated using (true);

drop policy if exists "join or host adds members" on public.channel_members;
create policy "join or host adds members" on public.channel_members
  for insert to authenticated
  with check (user_id = auth.uid() or public.is_channel_host(channel_id));

drop policy if exists "leave or host removes members" on public.channel_members;
create policy "leave or host removes members" on public.channel_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_channel_host(channel_id));

-- messages: public read; only members post
drop policy if exists "anyone reads channel messages" on public.channel_messages;
create policy "anyone reads channel messages" on public.channel_messages
  for select to authenticated using (true);

drop policy if exists "members post channel messages" on public.channel_messages;
create policy "members post channel messages" on public.channel_messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_channel_member(channel_id));

-- keep channels.last_message fresh
create or replace function public.channel_messages_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.channels
  set last_message = new.body, last_message_at = new.created_at
  where id = new.channel_id;
  return new;
end; $$;

drop trigger if exists channel_messages_touch on public.channel_messages;
create trigger channel_messages_touch
  after insert on public.channel_messages
  for each row execute function public.channel_messages_touch();

-- create a channel + add the creator as host, atomically
create or replace function public.create_channel(p_name text, p_description text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication is required.'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Channel name is required.'; end if;
  insert into public.channels (name, description, created_by)
  values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), v_uid)
  returning id into v_id;
  insert into public.channel_members (channel_id, user_id, role)
  values (v_id, v_uid, 'host')
  on conflict (channel_id, user_id) do nothing;
  return v_id;
end; $$;
grant execute on function public.create_channel(text, text) to authenticated;

-- member directory search for the "add people" picker (returns only id + name,
-- never emails) so a host can add other Shape members to a channel.
-- ⚠ SUPERSEDED for this function by 2026-08-05-search-pattern-hardening.sql
--   (clamps the term to 80 chars, escapes LIKE metacharacters, pins pg_temp).
--   This is `create or replace`, so RE-RUNNING THIS FILE SILENTLY REVERTS that
--   hardening. Apply the 2026-08-05 file again afterwards if you ever do.
create or replace function public.search_members(p_q text default '')
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and (coalesce(p_q, '') = '' or p.full_name ilike '%' || p_q || '%')
  order by p.full_name nulls last
  limit 20;
$$;
grant execute on function public.search_members(text) to authenticated;
