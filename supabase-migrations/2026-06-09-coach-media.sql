-- Coach workout media (photos + videos for plans / programs / workouts).
-- Adds a public `coach-media` storage bucket that a coach can upload to (their
-- own <uid>/… folder), public read so clients can view the demo photos/videos
-- inline on the plan. The media URLs ride in `coach_plans.detail.media`
-- (jsonb: [{ url, type:'image'|'video', name }]), so no table column is needed.
-- Idempotent — safe to re-run.

-- public bucket (200 MB to allow short demo videos; common image + video types)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'coach-media', 'coach-media', true, 209715200,
  array[
    'image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif',
    'video/mp4','video/quicktime','video/webm','video/x-m4v'
  ]
)
on conflict (id) do update
  set public = true,
      file_size_limit = 209715200,
      allowed_mime_types = excluded.allowed_mime_types;

-- policies on storage.objects for this bucket
--   read: anyone (clients view the demo media); write/update/delete: owner of <uid>/
drop policy if exists "coach media public read" on storage.objects;
create policy "coach media public read" on storage.objects
  for select using (bucket_id = 'coach-media');

drop policy if exists "coach media owner insert" on storage.objects;
create policy "coach media owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'coach-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "coach media owner update" on storage.objects;
create policy "coach media owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'coach-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "coach media owner delete" on storage.objects;
create policy "coach media owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'coach-media' and (storage.foldername(name))[1] = auth.uid()::text);
