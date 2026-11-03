-- Voice notes in chat threads (owner, 2026-11-02: "build voice notes next").
--
-- Tap the mic in a thread's composer, talk, and send: the note is uploaded from the app straight into
-- this private bucket, and the message carries where it is (metadata.voice: path, length, waveform,
-- type). Playing it asks storage for a link that lasts an hour, so an old note keeps playing, unlike a
-- link baked into the message.
--
-- A note's path names its thread and its sender: <kind>/<thread>/<sender>/<file>, kind 'dm' (a
-- conversation) or 'ch' (a channel). voice_note_path_ok() reads it, and the policies below use it:
--   · recording (insert): only into your own folder, and only in a thread you may post in: a
--     conversation you may open, or a channel you belong to or host;
--   · playing (select): anyone who may read the thread: a conversation's people, or a channel's
--     members and host, or anyone for a public channel;
--   · removing (delete): your own notes only. There is no update: a note is never overwritten.
-- A path of any other shape is refused, so the id casts below cannot fail.
--
-- Deleting an account erases its notes too (src/lib/account-erasure.ts). They sit under their thread,
-- not under a <uid>/ folder, so the erasure asks voice_note_paths_of() (service role only) for the
-- names whose sender is that account and removes them through the storage API.
--
-- One transaction, re-runnable (the bucket is upserted, a policy is dropped only to be created again),
-- a guard at the end. Not run by this PR.

begin;
set local lock_timeout = '10s';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice-notes', 'voice-notes', false, 5242880, array['audio/mp4', 'audio/webm', 'audio/ogg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Whether the caller may play (p_write false) or record (p_write true) the note at this path.
create or replace function public.voice_note_path_ok(p_name text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_thread uuid;
  v_sender uuid;
begin
  if auth.uid() is null or p_name is null
     or p_name !~ '^(dm|ch)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{1,64}\.(m4a|webm|ogg)$' then
    return false;
  end if;
  v_kind := split_part(p_name, '/', 1);
  v_thread := split_part(p_name, '/', 2)::uuid;
  v_sender := split_part(p_name, '/', 3)::uuid;
  if coalesce(p_write, true) and v_sender <> auth.uid() then
    return false;
  end if;
  if v_kind = 'dm' then
    return public.can_access_conversation(v_thread);
  end if;
  return public.is_channel_member(v_thread) or public.is_channel_host(v_thread)
    or (not coalesce(p_write, true) and public.is_public_channel(v_thread));
end;
$$;

revoke all on function public.voice_note_path_ok(text, boolean) from public, anon;
grant execute on function public.voice_note_path_ok(text, boolean) to authenticated;

-- The names of an account's notes, by their sender segment, 1000 at a time (the erasure asks again
-- until none are left). Service role only: it reads every thread's folder.
create or replace function public.voice_note_paths_of(p_user uuid)
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'voice-notes'
    and split_part(o.name, '/', 3) = p_user::text
  order by o.name
  limit 1000
$$;

revoke all on function public.voice_note_paths_of(uuid) from public, anon, authenticated;
grant execute on function public.voice_note_paths_of(uuid) to service_role;

drop policy if exists "voice notes: a thread's people play them" on storage.objects;
create policy "voice notes: a thread's people play them" on storage.objects
  for select to authenticated
  using (bucket_id = 'voice-notes' and public.voice_note_path_ok(name, false));

drop policy if exists "voice notes: a sender records into a thread they may post in" on storage.objects;
create policy "voice notes: a sender records into a thread they may post in" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'voice-notes' and public.voice_note_path_ok(name, true));

drop policy if exists "voice notes: a sender removes their own" on storage.objects;
create policy "voice notes: a sender removes their own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'voice-notes' and (storage.foldername(name))[3] = auth.uid()::text);

-- Guard: the bucket is private with the three types, the door and the erasure's lookup are there
-- (the lookup for the service role alone), and the rules use the door.
do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'voice-notes' and public = false and file_size_limit = 5242880
      and allowed_mime_types @> array['audio/mp4', 'audio/webm', 'audio/ogg']
      and array_length(allowed_mime_types, 1) = 3
  ) then
    raise exception 'the voice-notes bucket is missing, public, or has the wrong limits';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'voice_note_path_ok' and p.prosecdef
      and pg_get_function_identity_arguments(p.oid) = 'p_name text, p_write boolean'
  ) or has_function_privilege('anon', 'public.voice_note_path_ok(text, boolean)', 'execute') then
    raise exception 'voice_note_path_ok(text, boolean) is missing, not security definer, or open to anon';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'voice_note_paths_of' and p.prosecdef
      and pg_get_function_identity_arguments(p.oid) = 'p_user uuid'
  ) or has_function_privilege('anon', 'public.voice_note_paths_of(uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.voice_note_paths_of(uuid)', 'execute')
    or not has_function_privilege('service_role', 'public.voice_note_paths_of(uuid)', 'execute') then
    raise exception 'voice_note_paths_of(uuid) is missing, not security definer, or not service-role only';
  end if;
  if (select count(*) from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and ((policyname = 'voice notes: a thread''s people play them' and cmd = 'SELECT'
              and qual like '%voice-notes%' and qual like '%voice_note_path_ok(name, false)%')
          or (policyname = 'voice notes: a sender records into a thread they may post in' and cmd = 'INSERT'
              and with_check like '%voice-notes%' and with_check like '%voice_note_path_ok(name, true)%')
          or (policyname = 'voice notes: a sender removes their own' and cmd = 'DELETE'
              and qual like '%voice-notes%' and qual like '%auth.uid()%'))) <> 3 then
    raise exception 'the voice-notes policies on storage.objects are missing or changed';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and cmd = 'UPDATE' and (qual like '%voice-notes%' or with_check like '%voice-notes%')) then
    raise exception 'a voice note must never be overwritten: no update policy on the voice-notes bucket';
  end if;
end $$;

commit;
