-- Public / private channels.
--
-- Public channels are discoverable + joinable by anyone; private channels are
-- only visible to their members (and host), and members are added by the host
-- (no self-join). Idempotent, safe to re-run.

alter table public.channels
  add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'private'));

create or replace function public.is_public_channel(p_channel_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.channels c
    where c.id = p_channel_id and c.visibility = 'public'
  );
$$;

-- channels: public are discoverable; private only to members/host
drop policy if exists "anyone reads channels" on public.channels;
drop policy if exists "read public or member channels" on public.channels;
create policy "read public or member channels" on public.channels
  for select to authenticated
  using (visibility = 'public' or public.is_channel_member(id) or public.is_channel_host(id));

-- members: readable for public channels, or if you're a member/host
drop policy if exists "anyone reads channel members" on public.channel_members;
drop policy if exists "read members of visible channels" on public.channel_members;
create policy "read members of visible channels" on public.channel_members
  for select to authenticated
  using (public.is_public_channel(channel_id) or public.is_channel_member(channel_id) or public.is_channel_host(channel_id));

-- self-join only public channels; private requires host-add
drop policy if exists "join or host adds members" on public.channel_members;
drop policy if exists "join public or host adds" on public.channel_members;
create policy "join public or host adds" on public.channel_members
  for insert to authenticated
  with check ((user_id = auth.uid() and public.is_public_channel(channel_id)) or public.is_channel_host(channel_id));

-- messages: readable for public channels, or if you're a member
drop policy if exists "anyone reads channel messages" on public.channel_messages;
drop policy if exists "read messages of visible channels" on public.channel_messages;
create policy "read messages of visible channels" on public.channel_messages
  for select to authenticated
  using (public.is_public_channel(channel_id) or public.is_channel_member(channel_id));

-- create_channel now takes a visibility argument
drop function if exists public.create_channel(text, text);
create or replace function public.create_channel(
  p_name text, p_description text default null, p_visibility text default 'public'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
  v_vis text := case when p_visibility = 'private' then 'private' else 'public' end;
begin
  if v_uid is null then raise exception 'Authentication is required.'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Channel name is required.'; end if;
  insert into public.channels (name, description, created_by, visibility)
  values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), v_uid, v_vis)
  returning id into v_id;
  insert into public.channel_members (channel_id, user_id, role)
  values (v_id, v_uid, 'host')
  on conflict (channel_id, user_id) do nothing;
  return v_id;
end; $$;
grant execute on function public.create_channel(text, text, text) to authenticated;

-- ── Pin a channel to the top of YOUR channel feed (per-user) ─────────────────
alter table public.channel_members
  add column if not exists pinned boolean not null default false;

-- security definer so it works without a channel_members UPDATE policy; only
-- ever touches the caller's own membership row.
create or replace function public.set_channel_pinned(p_channel_id uuid, p_pinned boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication is required.'; end if;
  -- auto-join a public channel on pin so it sticks in your feed
  insert into public.channel_members (channel_id, user_id, role)
  select p_channel_id, v_uid, 'member'
  where public.is_public_channel(p_channel_id)
  on conflict (channel_id, user_id) do nothing;
  update public.channel_members
  set pinned = coalesce(p_pinned, false)
  where channel_id = p_channel_id and user_id = v_uid;
end; $$;
grant execute on function public.set_channel_pinned(uuid, boolean) to authenticated;
