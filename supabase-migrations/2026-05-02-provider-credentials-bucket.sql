-- Private Storage bucket for provider application file uploads.
-- Used by src/app/api/apply/route.ts, which uploads via the service-role admin
-- client (so no anon RLS policy on storage.objects is required).
--
-- File paths land in provider_applications.details under the keys
-- certProof_path, insuranceDoc_path, samplePlan_path. Reviewers fetch a
-- short-lived signed URL via the admin dashboard.
--
-- Idempotent, safe to re-run.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'provider-credentials',
  'provider-credentials',
  false,
  10485760, -- 10 MB per file
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
