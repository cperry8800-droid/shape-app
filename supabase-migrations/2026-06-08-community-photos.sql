-- Community feed photo posts (mobile + website).
-- Adds a public `community-photos` storage bucket that members can upload to
-- (their own <uid>/… folder), public read so the feed/profile can render the
-- image on either surface, plus a `photo_url` column on community_posts.
-- Idempotent — safe to re-run.

-- 1) the photo column on the post
alter table public.community_posts add column if not exists photo_url text;

-- 2) public bucket (15 MB, common image types)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-photos', 'community-photos', true, 15728640,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 15728640,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3) policies on storage.objects for this bucket
--    read: anyone (public feed); write/update/delete: the owner of the <uid>/ folder
drop policy if exists "community photos public read" on storage.objects;
create policy "community photos public read" on storage.objects
  for select using (bucket_id = 'community-photos');

drop policy if exists "community photos owner insert" on storage.objects;
create policy "community photos owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'community-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "community photos owner update" on storage.objects;
create policy "community photos owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'community-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "community photos owner delete" on storage.objects;
create policy "community photos owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'community-photos' and (storage.foldername(name))[1] = auth.uid()::text);
