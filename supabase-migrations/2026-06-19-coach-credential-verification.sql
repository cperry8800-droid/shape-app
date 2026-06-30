-- Coach credential verification — turns "vetted coaches" into something literally
-- true. Extends the NC1 provider_credentials table (2026-06-17) with a document +
-- admin-review workflow, adds a PRIVATE bucket for the Certificate of Insurance
-- (COI) + certification files, exposes a PUBLIC `verified` flag on the coach
-- marketplace rows (trainers/nutritionists), and a dedupe ledger for the expiry
-- re-verification cron.
--
-- The admin review queue (/dashboard/credentials) runs as the SERVICE ROLE
-- (createAdminClient), so it bypasses RLS — no admin policy is needed here; the
-- owner-RLS on provider_credentials stays authoritative for the coach's own reads.
--
-- Idempotent / safe to re-run.

-- ===== document + review-workflow columns on provider_credentials =====
alter table public.provider_credentials
  add column if not exists insurance_coi_path text,                 -- bucket path to the COI file
  add column if not exists cert_files jsonb not null default '[]'::jsonb, -- [{type,number,path,name}]
  add column if not exists review_status text not null default 'none'
    check (review_status in ('none', 'pending', 'approved', 'rejected', 'changes_requested')),
  add column if not exists submitted_at timestamptz,                -- when the coach submitted for review
  add column if not exists reviewed_by uuid,                        -- admin who reviewed
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_notes text;

create index if not exists provider_credentials_review_idx
  on public.provider_credentials (review_status, submitted_at desc);

-- ===== PUBLIC verified flag on the marketplace coach rows =====
-- These rows already have a public-read policy (the marketplace reads them), so a
-- new column is readable wherever the row is. The admin approve action mirrors the
-- credential approval onto these so the "✓ Verified" badge can render publicly
-- without exposing the private credential row.
alter table public.trainers
  add column if not exists verified boolean not null default false,
  add column if not exists verified_at timestamptz;

alter table public.nutritionists
  add column if not exists verified boolean not null default false,
  add column if not exists verified_at timestamptz;

-- ===== private bucket for COI + certification documents =====
-- Uploaded via the service-role admin client (so no anon RLS policy on
-- storage.objects is required); read back through short-lived signed URLs in the
-- admin queue. Paths: <owner_id>/coi-<timestamp>.<ext>
--                     <owner_id>/cert-<timestamp>.<ext>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'coach-credentials',
  'coach-credentials',
  false,
  10485760, -- 10 MB (a COI PDF or a photographed certificate)
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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

-- ===== expiry re-verification dedupe ledger =====
-- The weekly cron (/api/cron/credential-expiry) scans for insurance/license
-- expirations inside the 60-day window and writes ONE never-shaming heads-up per
-- coach per credential per calendar month. This ledger makes that idempotent.
create table if not exists public.coach_credential_expiry_reminders (
  owner_id uuid not null references auth.users on delete cascade,
  kind text not null,                              -- 'insurance' | 'license:<ST>'
  period text not null,                            -- 'YYYY-MM' the reminder was sent for
  sent_at timestamptz not null default now(),
  primary key (owner_id, kind, period)
);
alter table public.coach_credential_expiry_reminders enable row level security;
-- Service-role only (the cron writes; nobody reads it from the client). No policy
-- = deny-all for anon/authenticated, which is the intent.
