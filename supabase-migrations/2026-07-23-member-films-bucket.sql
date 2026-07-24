-- M5 · The member intro film. A DEDICATED public `member-films` bucket a member can
-- upload one short intro video to (their own <uid>/… folder, gated by storage RLS),
-- public-read so their film plays inline on their Terrain profile for visitors.
--
-- Deliberately NOT a widening of `community-photos` (the member wall's bucket): the
-- existing photo-upload paths don't check file.type, so widening that bucket's
-- allowed_mime_types to accept video would let a video slip into an <img>/photo slot
-- somewhere. A separate video-only bucket keeps the two media classes disjoint — the
-- film-url guard (bsProfileFilm) also binds a film to THIS bucket + the owner folder,
-- so a photo url can never render as a film and vice-versa.
--
-- The film url rides on the existing `profile_custom` doc's `film` key (no table
-- column, no RPC). Idempotent — safe to re-run.

-- public bucket · VIDEO mimes only · 60 MB (a short intro, not a full workout video).
-- Both M4V spellings are allowed: the film pickers pass file.type straight through as
-- the upload contentType, and a device may report an .m4v as EITHER video/x-m4v or the
-- non-standard video/m4v — allowing only one would reject the other after the client
-- validation already passed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-films', 'member-films', true, 62914560,
  array['video/mp4','video/quicktime','video/webm','video/x-m4v','video/m4v']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 62914560,
      allowed_mime_types = excluded.allowed_mime_types;

-- policies on storage.objects for this bucket
--   read: anyone (visitors watch the film); write/update/delete: owner of <uid>/ only
drop policy if exists "member films public read" on storage.objects;
create policy "member films public read" on storage.objects
  for select using (bucket_id = 'member-films');

drop policy if exists "member films owner insert" on storage.objects;
create policy "member films owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'member-films' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "member films owner update" on storage.objects;
create policy "member films owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'member-films' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "member films owner delete" on storage.objects;
create policy "member films owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'member-films' and (storage.foldername(name))[1] = auth.uid()::text);
