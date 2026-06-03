-- Private Storage bucket for meal-log voice memos (the "note to your coach"
-- audio recordings). Used by src/app/api/nutrition/meal-note/route.ts, which
-- uploads via the service-role admin client (so no anon RLS policy on
-- storage.objects is required). The memo's signed URL is stored in the coach
-- message metadata (messages.metadata.audio.url).
--
-- File paths: <client_user_id>/<timestamp>.<ext>
--
-- Idempotent, safe to re-run.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-notes',
  'meal-notes',
  false,
  10485760, -- 10 MB per memo
  array[
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/x-m4a',
    'audio/aac'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
