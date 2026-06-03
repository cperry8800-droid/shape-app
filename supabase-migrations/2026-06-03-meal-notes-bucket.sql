-- Private Storage bucket for meal-log attachments to your coach: voice memos
-- (the "note to your coach" audio) AND meal photos. Used by
-- src/app/api/nutrition/meal-note/route.ts, which uploads via the service-role
-- admin client (so no anon RLS policy on storage.objects is required). The
-- signed URL is stored in the coach message metadata
-- (messages.metadata.audio.url / messages.metadata.photo.url).
--
-- File paths: <client_user_id>/<timestamp>.<ext>  (audio)
--             <client_user_id>/photo-<timestamp>.<ext>  (photo)
--
-- Idempotent, safe to re-run (re-run after adding photo support to widen the
-- allowed mime types on an existing bucket).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-notes',
  'meal-notes',
  false,
  15728640, -- 15 MB (covers a phone photo as well as a memo)
  array[
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/x-m4a',
    'audio/aac',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
