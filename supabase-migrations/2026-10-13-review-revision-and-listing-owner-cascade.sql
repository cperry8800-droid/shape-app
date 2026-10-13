-- Two gaps left open by #2321 (owner, 2026-10-13: "fix the approval overwrite gap too", "fix all
-- issues").
--
-- ── 1 · An admin's verdict applies to the version of the credentials the admin reviewed ─────
-- The admin reviews a coach's credentials on /dashboard/credentials and clicks a verdict. If the
-- coach changed them in between (a new certificate, other insurance), the verdict landed on the
-- new, unreviewed version: measured on a PostgreSQL 16 copy for #2321, the coach's edit committed
-- first and the approval behind it ended 'approved' with the coach's change. Nothing tied the
-- verdict to what the admin had looked at.
--
-- provider_credentials.revision is a counter the database bumps on every write (a coach's or the
-- service role's; nobody can set it). The review page carries the revision it showed, and every
-- verdict applies only while the row is still at that revision:
--   · approve_provider_credential takes it (p_revision) and returns -1, changing nothing, when
--     the row has moved on; the old three-argument form is dropped so no caller can approve
--     without one;
--   · the reject and request-changes actions filter on it (src/app/dashboard/credentials/actions.ts).
-- updated_at could not serve: a coach's direct write through prov_cred_own need not touch it.
--
-- ── 2 · A deleted account's listings go with it ────────────────────────────────────────────
-- trainers.owner_id and nutritionists.owner_id reference auth.users ON DELETE SET NULL. A coach
-- deleted anywhere but /api/account/delete (which deletes the listings itself), the Supabase
-- dashboard for one, left the listing in the marketplace with owner_id null: read as one of
-- Shape's own listings, so listing_ready (2026-10-12) put it back on show, with its Verified
-- badge, the coach's name and their photo. Both keys are ON DELETE CASCADE now, the same outcome
-- as the route. What references a listing (trainer_workouts, nutritionist_plans) already cascades.
--
-- Safe to re-run. Run it BEFORE the code that sends the revision is deployed: approval calls the
-- four-argument function. Production held 0 credential rows when this was written.

begin;

-- ── 1a · the revision ──────────────────────────────────────────────────────────────────────
alter table public.provider_credentials add column if not exists revision bigint not null default 1;

comment on column public.provider_credentials.revision is
  'Bumped on every write by provider_credentials_revision; an admin verdict applies only at the revision the admin reviewed. Never written directly.';

-- The coach's read of this table is column-level (2026-10-10, L3), so a new column is granted.
grant select (revision) on table public.provider_credentials to authenticated;

create or replace function public.provider_credentials_bump_revision()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    new.revision := coalesce(old.revision, 0) + 1;
  end if;
  return new;
end;
$$;

revoke all on function public.provider_credentials_bump_revision() from public, anon, authenticated;

drop trigger if exists provider_credentials_revision on public.provider_credentials;
create trigger provider_credentials_revision
  before insert or update on public.provider_credentials
  for each row execute function public.provider_credentials_bump_revision();

-- ── 1b · approval at the reviewed revision ────────────────────────────────────────────────
-- Returns how many listings carry the badge now; null when the owner has no credential row; -1
-- when the row is no longer at p_revision (the coach changed it since the admin looked), in which
-- case nothing changes.
drop function if exists public.approve_provider_credential(uuid, uuid, text);

create or replace function public.approve_provider_credential(p_owner uuid, p_revision bigint, p_reviewer uuid, p_notes text)
returns integer
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_now timestamptz := now();
  v_trainers integer;
  v_nutritionists integer;
begin
  update public.provider_credentials
     set review_status = 'approved', reviewed_by = p_reviewer, reviewed_at = v_now,
         review_notes = p_notes, verified_at = v_now
   where owner_id = p_owner and revision = p_revision;
  if not found then
    if exists (select 1 from public.provider_credentials where owner_id = p_owner) then
      return -1;
    end if;
    return null;
  end if;
  update public.trainers set verified = true, verified_at = v_now where owner_id = p_owner;
  get diagnostics v_trainers = row_count;
  update public.nutritionists set verified = true, verified_at = v_now where owner_id = p_owner;
  get diagnostics v_nutritionists = row_count;
  return v_trainers + v_nutritionists;
end;
$$;

comment on function public.approve_provider_credential(uuid, bigint, uuid, text) is
  'Approves p_owner''s credential at p_revision and puts the Verified badge on their listings in one transaction; -1 when the credential has changed since, null when there is none. Service role only.';

revoke all on function public.approve_provider_credential(uuid, bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_provider_credential(uuid, bigint, uuid, text) to service_role;

-- ── 2 · listings are deleted with their account ───────────────────────────────────────────
alter table public.trainers drop constraint if exists trainers_owner_id_fkey;
alter table public.trainers
  add constraint trainers_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete cascade;

alter table public.nutritionists drop constraint if exists nutritionists_owner_id_fkey;
alter table public.nutritionists
  add constraint nutritionists_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete cascade;

-- ── 3 · guard ──────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_count int;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'provider_credentials' and column_name = 'revision'
      and data_type = 'bigint' and is_nullable = 'NO'
  ) then
    raise exception 'provider_credentials.revision is missing or nullable';
  end if;
  if not has_column_privilege('authenticated', 'public.provider_credentials', 'revision', 'select') then
    raise exception 'authenticated cannot read provider_credentials.revision (the column-level grant of 2026-10-10)';
  end if;

  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.provider_credentials'::regclass and t.tgname = 'provider_credentials_revision'
      and not t.tgisinternal and t.tgenabled <> 'D'
  ) then
    raise exception 'provider_credentials_revision is missing or disabled';
  end if;

  if to_regprocedure('public.approve_provider_credential(uuid, uuid, text)') is not null then
    raise exception 'the three-argument approve_provider_credential still exists: an approval without a revision';
  end if;
  if exists (
    select 1 from pg_proc
    where oid in ('public.approve_provider_credential(uuid, bigint, uuid, text)'::regprocedure,
                  'public.provider_credentials_bump_revision()'::regprocedure)
      and (prosecdef or not coalesce(proconfig, '{}') @> array['search_path=public, pg_temp'])
  ) then
    raise exception 'approve_provider_credential and provider_credentials_bump_revision must run as their caller, pinned';
  end if;
  if has_function_privilege('anon', 'public.approve_provider_credential(uuid, bigint, uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.approve_provider_credential(uuid, bigint, uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.provider_credentials_bump_revision()', 'execute')
     or has_function_privilege('authenticated', 'public.provider_credentials_bump_revision()', 'execute') then
    raise exception 'a credential review function is executable by anon or authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.approve_provider_credential(uuid, bigint, uuid, text)', 'execute') then
    raise exception 'the service role cannot call approve_provider_credential, so approval would fail';
  end if;

  select count(*) into v_count from pg_constraint
  where contype = 'f' and confdeltype = 'c' and confrelid = 'auth.users'::regclass
    and ((conrelid = 'public.trainers'::regclass and conname = 'trainers_owner_id_fkey')
      or (conrelid = 'public.nutritionists'::regclass and conname = 'nutritionists_owner_id_fkey'));
  if v_count <> 2 then raise exception 'listing owner keys: % of 2 cascade on delete', v_count; end if;
end;
$$;

commit;
