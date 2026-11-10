-- Channel pictures, and a real Shape HQ (owner, 2026-11-10: "yes create a real shape HQ"; "have
-- creators of channels upload custom pictures here for the channel avatars"). Idempotent, safe to
-- re-run. One transaction.
--
-- 1. channels.picture_path: the storage path of a channel's picture, in the channel-pictures
--    bucket, under the channel's own id. A PATH, never a URL: the apps build the address from
--    their own storage client, so a host cannot point every member's screen at an outside image
--    (a tracker, or anything else). The check holds it to <this channel's id>/<file name>.
-- 2. channels.read_only: a channel members read and only Shape posts in (the service role, as
--    the PR Wall's automatic posts are written). Shape HQ is the first.
-- 3. The channel-pictures bucket: public to read, written only by the channel's host, into the
--    folder named by the channel's id (public.can_edit_channel_picture).
-- 4. Members post channel messages only where the channel takes posts.
-- 5. Shape HQ, system-owned like the PR Wall, read-only, with Shape's welcome as its first message.
--
-- Until this runs, both apps read channels with `select *` and treat a missing column as none:
-- no picture, and every channel open to posts, as today.

begin;

-- ── 1 + 2 · the columns ─────────────────────────────────────────────────────────────────
alter table public.channels add column if not exists picture_path text;
alter table public.channels add column if not exists read_only boolean not null default false;

alter table public.channels drop constraint if exists channels_picture_path_check;
alter table public.channels add constraint channels_picture_path_check
  check (picture_path is null or picture_path ~ ('^' || id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'));

-- ── 3 · the bucket and who writes it ────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('channel-pictures', 'channel-pictures', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The folder is the channel's id; only that channel's host may write in it. A folder that is
-- not a uuid is nobody's (the cast is never attempted on it).
create or replace function public.can_edit_channel_picture(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_channel_host(p_folder::uuid)
    else false
  end;
$$;
revoke execute on function public.can_edit_channel_picture(text) from public, anon;
grant execute on function public.can_edit_channel_picture(text) to authenticated, service_role;

drop policy if exists "channel pictures public read" on storage.objects;
create policy "channel pictures public read" on storage.objects
  for select using (bucket_id = 'channel-pictures');

drop policy if exists "channel pictures host insert" on storage.objects;
create policy "channel pictures host insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'channel-pictures' and public.can_edit_channel_picture((storage.foldername(name))[1]));

drop policy if exists "channel pictures host update" on storage.objects;
create policy "channel pictures host update" on storage.objects
  for update to authenticated
  using (bucket_id = 'channel-pictures' and public.can_edit_channel_picture((storage.foldername(name))[1]));

drop policy if exists "channel pictures host delete" on storage.objects;
create policy "channel pictures host delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'channel-pictures' and public.can_edit_channel_picture((storage.foldername(name))[1]));

-- ── 4 · posting respects read_only ──────────────────────────────────────────────────────
drop policy if exists "members post channel messages" on public.channel_messages;
create policy "members post channel messages" on public.channel_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_channel_member(channel_id)
    and not exists (select 1 from public.channels c where c.id = channel_id and c.read_only)
  );

-- ── 5 · Shape HQ ────────────────────────────────────────────────────────────────────────
insert into public.channels (name, description, created_by, visibility, read_only)
select 'Shape HQ', 'The official Shape channel: product news, drops and events.', null, 'public', true
where not exists (
  select 1 from public.channels where lower(name) = 'shape hq' and created_by is null
);

update public.channels set read_only = true
where lower(name) = 'shape hq' and created_by is null and not read_only;

-- Shape's welcome, once (a channel with nothing in it reads as abandoned). The trigger on
-- channel_messages sets the channel's last message from it.
insert into public.channel_messages (channel_id, sender_id, author_name, body)
select c.id, null, 'Shape', 'Welcome to Shape HQ. Product news, drops and events from the Shape team land here.'
from public.channels c
where lower(c.name) = 'shape hq' and c.created_by is null
  and not exists (select 1 from public.channel_messages m where m.channel_id = c.id);

commit;
