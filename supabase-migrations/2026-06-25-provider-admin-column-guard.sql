-- Lock admin/system-controlled columns on the marketplace provider tables and the
-- coach-credential review row against self-service tampering.
--
-- THE HOLE (sibling class to 2026-06-25-profiles-role-elevation-guard):
--   * public.trainers / public.nutritionists have a self-UPDATE policy
--       "<tbl> update own row"  using/check (auth.uid() = owner_id)
--     with NO column restriction. So an approved coach (owns the row) can self-set
--     trust/integrity columns: verified / verified_at (the "Verified coach" badge —
--     meant to be admin-only), plus featured, sort_order (marketplace placement),
--     rating, subscribers (review/aggregate stats), and *_of_month (the "of the
--     Month" honor). None of these have any legitimate coach self-write path
--     (every legit write to these tables is service-role: the approval queue, the
--     Stripe Connect routes, and aggregation jobs).
--   * public.provider_credentials has a column-blind FOR ALL self-policy
--       "prov_cred_own"  using/check (owner_id = auth.uid())
--     so a coach can self-set review_status='approved' + reviewed_by/at + verified_rd,
--     bypassing the admin credential review that gates the Verified badge / cert
--     exposure (get_coach_certs). The coach legitimately submits via their session
--     (POST /api/coach/credentials sets review_status='pending'), so that must stay.
--
-- THE FIX: BEFORE INSERT/UPDATE triggers that, for NON-service-role callers, pin the
-- admin/system columns to their prior (or safe default) values. Service-role writers
-- (the approval / Stripe / aggregation flows) are exempt. Idempotent.

-- ── trainers + nutritionists: pin the admin/system columns ───────────────────
-- One generic function for both tables; it pins only the admin columns that exist
-- on the row (so the trainer-only / nutritionist-only *_of_month column is handled
-- without referencing a non-existent field).
create or replace function public.guard_provider_admin_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  is_privileged boolean := current_user in ('service_role','supabase_admin','supabase_auth_admin','postgres')
                           or jwt_role = 'service_role';
  -- admin/system trust columns a provider must never self-set
  admin_cols text[] := array['verified','verified_at','featured','rating','subscribers',
                             'sort_order','trainer_of_month','nutritionist_of_month'];
  newj jsonb;
  oldj jsonb;
  k text;
begin
  if is_privileged then
    return new;
  end if;

  newj := to_jsonb(new);
  if tg_op = 'UPDATE' then
    oldj := to_jsonb(old);
    foreach k in array admin_cols loop
      if newj ? k then
        newj := jsonb_set(newj, array[k], oldj -> k);   -- revert to the admin-set value
      end if;
    end loop;
  else  -- INSERT (non-service insert is RLS-denied today; defense-in-depth)
    foreach k in array admin_cols loop
      if newj ? k then
        newj := jsonb_set(newj, array[k],
          case when k in ('verified','featured','trainer_of_month','nutritionist_of_month') then 'false'::jsonb
               when k = 'sort_order' then '0'::jsonb
               else 'null'::jsonb end);
      end if;
    end loop;
  end if;
  new := jsonb_populate_record(new, newj);
  return new;
end;
$$;

drop trigger if exists trainers_guard_admin_columns on public.trainers;
create trigger trainers_guard_admin_columns
  before insert or update on public.trainers
  for each row execute function public.guard_provider_admin_columns();

drop trigger if exists nutritionists_guard_admin_columns on public.nutritionists;
create trigger nutritionists_guard_admin_columns
  before insert or update on public.nutritionists
  for each row execute function public.guard_provider_admin_columns();

-- ── provider_credentials: gate the review workflow ───────────────────────────
-- A coach may submit (review_status -> 'none'/'pending') and edit their own
-- cert/insurance/attestation fields, but the admin VERDICT columns are admin-only.
-- ANY self-write to a verified/reviewed credential row invalidates the verdict:
-- the changed (or resubmitted) credentials must be re-reviewed, so the row is sent
-- back to 'pending' and the prior verification + verdict are cleared. Only the
-- service-role approval flow can (re)grant verified_rd / verified_at / a verdict.
create or replace function public.guard_credential_review_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  is_privileged boolean := current_user in ('service_role','supabase_admin','supabase_auth_admin','postgres')
                           or jwt_role = 'service_role';
begin
  if is_privileged then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- a self-created credential row is unreviewed; a coach may submit ('pending')
    -- but can never self-approve.
    if new.review_status is null or new.review_status not in ('none','pending') then
      new.review_status := 'pending';
    end if;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_notes := null;
    new.verified_rd := false;
    new.verified_at := null;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- review_status may only move to 'none'/'pending' on a self-write; any other
    -- target (approved/rejected/changes_requested) reverts to the admin-set value.
    if new.review_status is distinct from old.review_status
       and (new.review_status is null or new.review_status not in ('none','pending')) then
      new.review_status := old.review_status;
    end if;
    -- A reviewed row touched by the coach goes back to re-review, and the prior
    -- verdict + verification are cleared regardless of which fields changed.
    if new.review_status not in ('none','pending') then
      new.review_status := 'pending';
    end if;
    new.verified_rd := false;
    new.verified_at := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_notes := null;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists provider_credentials_guard_review on public.provider_credentials;
create trigger provider_credentials_guard_review
  before insert or update on public.provider_credentials
  for each row execute function public.guard_credential_review_columns();
