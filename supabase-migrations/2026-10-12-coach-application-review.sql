-- 2026-10-12 · The coach application review keeps its own record: provider_applications.admin_review.
--
-- WHY. Everything the review console read about a background check (requested, completed, the
-- report id), the `approved_provider` record of an approval and the list of uploaded documents
-- lived in `details`, the jsonb the APPLICANT writes. /api/apply sanitises its shape, not its
-- meaning, so an application could arrive with a screening already "requested" and "completed",
-- a report id, an approval block, and document paths pointing anywhere in the private
-- provider-credentials bucket, which the console then signed with the service role.
--
-- WHAT. One column, written only by the admin actions in src/app/dashboard/applications/actions.ts
-- (the background-check buttons, Approve, Reject) and read by the review page:
--   { background_check: { provider, status, requested_at, completed_at, report_id, updated_at, updated_by },
--     decision: { decision, at, by }, applicant_note, approved_provider: {...}, decision_email: {...} }
-- No applicant path writes it: /api/apply names its columns (and never this one), and the table
-- has no insert or update policy for anon or authenticated (the anonymous insert policy went in
-- 2026-10-10; the guard below fails the migration if one comes back).
--
-- NOT CARRIED OVER, ON PURPOSE: a background check marked before this file lives in `details`,
-- where it cannot be told apart from an applicant's own claim, so it is not copied in. Re-mark it
-- with the buttons. (Production held no applications when this was written, 2026-10-12.)
--
-- Not a coach-table column, so the column-level grant rule for trainers / nutritionists does not
-- apply. No function, no policy, no grant change.
--
-- One transaction, re-runnable: add-if-not-exists, a comment, a unique index for one open
-- application per address and role, and the guard at the end.

begin;
set local lock_timeout = '10s';

alter table public.provider_applications
  add column if not exists admin_review jsonb not null default '{}'::jsonb;

comment on column public.provider_applications.admin_review is
  'The reviewer''s own record of the application (background check, decision, approved listing, decision email). Written only by the admin review actions; never by the applicant. See 2026-10-12-coach-application-review.sql.';

-- ONE OPEN APPLICATION PER ADDRESS AND ROLE. /api/apply answers a second submission with the open
-- one, but a read cannot stop a retry that arrives while the first request is still uploading its
-- files; this index does, and the route turns its 23505 into the same answer. /api/apply stores the
-- address lower-cased; lower() also covers a row stored before it did. (Production held no
-- applications when this was written, so the index builds over nothing.)
create unique index if not exists provider_applications_one_open_idx
  on public.provider_applications (lower(email), provider_type)
  where status in ('pending', 'in_review');

do $guard$
declare
  v_count integer;
begin
  select count(*) into v_count from information_schema.columns
  where table_schema = 'public' and table_name = 'provider_applications'
    and column_name = 'admin_review' and data_type = 'jsonb' and is_nullable = 'NO';
  if v_count <> 1 then
    raise exception 'provider_applications.admin_review (jsonb, not null) is missing';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'provider_applications'
      and indexname = 'provider_applications_one_open_idx' and indexdef like 'CREATE UNIQUE INDEX%'
  ) then
    raise exception 'provider_applications_one_open_idx (unique) is missing';
  end if;

  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.provider_applications'::regclass) then
    raise exception 'provider_applications must keep row level security on';
  end if;

  -- An applicant must have no way to write the reviewer's record: no insert or update policy for
  -- a member or a visitor (the service role bypasses RLS and needs none).
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'provider_applications'
    and cmd in ('INSERT', 'UPDATE', 'ALL')
    and roles && array['anon', 'authenticated', 'public']::name[];
  if v_count <> 0 then
    raise exception '% insert/update policies on provider_applications admit anon or authenticated: an applicant could write admin_review', v_count;
  end if;
end
$guard$;

commit;
