-- 2026-10-10 · The database-side Lows of the 2026-10-08 security review (cut 2), and the four
-- SECURITY DEFINER functions the 2026-10-03 audit left open to a caller with no account.
--
-- ⚠ DATED THE 10TH ON PURPOSE. It was written on the evening of 2026-10-09 UTC, after the
-- 2026-10-09 production capture (tests/fixtures/definer-live-2026-10-09.json) was taken. A file
-- dated the capture day that the capture does not record as applied makes the capture-day record
-- ambiguous (tests/definer-live-agreement.test.mjs); a file dated after it sits outside the
-- replay window by design, and the allow-list carries what it fixes as `fixedAfterCapture` until
-- the catalog is captured again. Nothing here depends on the date.
--
-- One transaction, re-runnable: every statement is create-or-replace, drop-if-exists, revoke or
-- grant, and the guard at the end raises on anything that did not land. Tested on a PostgreSQL 16
-- replica of the live catalog before and after, as anon, two members, a coach and the service role.
--
-- WHAT IT CLOSES, BY FINDING (the paths are on the owner's private findings page; this repo is
-- public):
--   2026-10-03 definer audit, the four left as owner calls (tests/fixtures/definer-anon-allowlist.json
--   `registeredFindings`), ruled "signed-in only" by the owner on 2026-10-09:
--     · get_follow_list        — any profile's followers and followees, to a caller with no account.
--                                Now signed-in only, and a friends- or private-tier profile's lists
--                                go to its owner and its accepted followers alone.
--     · get_active_now         — who is mid-workout or cooking right now, with names and avatars.
--     · get_active_activities  — the same, as ids. Both signed-in only now.
--     · shape_profile_visibility — any member's visibility setting. Signed-in only now.
--     · save_workout_session   — the one definer whose search_path did not end in pg_temp. Pinned.
--   L17 · user_follows was readable by anon, pending requests included; get_public_profile handed a
--        PRIVATE profile's name, username, role and points to a caller with no account.
--   L12 · refund_requests: the app inserts directly and the policy checked only client_id, so a
--        member could preset `status` (or `processed_at`, `admin_notes`).
--   L18 · profiles.username, .stripe_customer_id and .email were self-writable (username bypassing
--        set_my_username's format and uniqueness checks); league_members was fully self-writable,
--        so a member could write their own tier and cohort.
--   L19 · anonymous `CHECK (true)` inserts on consultation_bookings, contact_submissions,
--        provider_applications and app_launch_notifications; track_event had no rate cap.
--   L16 · trainers / nutritionists public read exposed stripe_account_id to anon.
--   L3  · provider_credentials: the own-row policy let a coach read the admin's review_notes (and
--        reviewed_by) directly, though the route already hides them.
--
-- WHAT IT DOES NOT DO, ON PURPOSE:
--   · profiles.phone stays member-editable (the settings screens write it).
--   · stripe_account_id stays readable by signed-in members (Stripe does not treat an account id
--     as a secret, and the coach's own dashboard, the purchase pages and the app read the row as
--     `authenticated`); only the caller with no account loses it. owner_id and
--     stripe_account_status stay public: owner_id is the coach's public user id (get_coach_certs,
--     get_coach_sale_plans_by_user take it) and the status is what shows "accepts payments".
--   · A "friends"-tier profile's card (name, avatar) stays visible; its follow lists do not.
--
-- ⚠ COLUMN-LEVEL GRANTS HAVE A MAINTENANCE RULE. Once anon's SELECT on trainers / nutritionists is
-- column-level, `select=*` by anon fails for the whole row, and a column added later is invisible
-- to anon until it is granted. Every later migration that adds a column to either table must also
-- `grant select (<column>) on table public.<table> to anon` (tests/security-review-lows.test.mjs
-- fails a migration that does not), and every reader that runs as anon lists its columns
-- (public/newdesign/marketplace.jsx, mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx).
-- The same holds for `authenticated` on provider_credentials (src/app/api/coach/credentials/route.ts).

begin;
set local lock_timeout = '10s';

-- ────────────────────────────────────────────────────────────────────────────────────────────
-- 1 · The four definers: signed-in only. Revoke from PUBLIC and anon both (revoking from PUBLIC
--     alone leaves the explicit anon grant standing).
-- ────────────────────────────────────────────────────────────────────────────────────────────
revoke execute on function public.get_active_now(integer) from public, anon;
grant execute on function public.get_active_now(integer) to authenticated, service_role;

revoke execute on function public.get_active_activities() from public, anon;
grant execute on function public.get_active_activities() to authenticated, service_role;

revoke execute on function public.shape_profile_visibility(uuid) from public, anon;
grant execute on function public.shape_profile_visibility(uuid) to authenticated, service_role;

-- get_follow_list: the same body as before (accepted follows, newest first, 200), plus the gate:
-- a signed-in caller, and a friends- or private-tier profile's lists only for its owner or an
-- accepted follower. A public profile's lists are visible to any signed-in member, as before.
create or replace function public.get_follow_list(p_user_id uuid, p_kind text)
returns table(user_id uuid, full_name text, role text, since timestamp with time zone)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    pr.id,
    coalesce(pr.full_name, 'Shape member'),
    coalesce(pr.role, 'client'),
    f.created_at
  from public.user_follows f
  join public.profiles pr
    on pr.id = (case when p_kind = 'following' then f.following_id else f.follower_id end)
  where (case when p_kind = 'following' then f.follower_id else f.following_id end) = p_user_id
    and f.status = 'accepted'
    and auth.uid() is not null
    and (
      auth.uid() = p_user_id
      or public.shape_profile_visibility(p_user_id) = 'public'
      or exists (
        select 1 from public.user_follows x
        where x.follower_id = auth.uid() and x.following_id = p_user_id and x.status = 'accepted'
      )
    )
  order by f.created_at desc
  limit 200;
$$;
revoke execute on function public.get_follow_list(uuid, text) from public, anon;
grant execute on function public.get_follow_list(uuid, text) to authenticated, service_role;

-- The one unpinned definer (2026-09-18-workout-session-atomic-save.sql declared it with
-- `set search_path = public`, after the 2026-08-09 sweep).
alter function public.save_workout_session(jsonb, jsonb, jsonb) set search_path = public, pg_temp;

-- ────────────────────────────────────────────────────────────────────────────────────────────
-- 2 · L17 · the follow graph, and a private profile's card.
-- ────────────────────────────────────────────────────────────────────────────────────────────
-- user_follows: readable by signed-in members, accepted rows only, plus the caller's own rows
-- in either direction (their pending requests, sent and received). Visitors read nothing
-- directly; the counts on a public profile still come through get_follow_stats.
drop policy if exists "follows public read" on public.user_follows;
drop policy if exists follows_read_accepted_or_own on public.user_follows;
create policy follows_read_accepted_or_own on public.user_follows
  for select to authenticated
  using (status = 'accepted' or follower_id = auth.uid() or following_id = auth.uid());

-- get_public_profile: the same body, and a PRIVATE profile returns no row to a caller with no
-- account. A signed-in non-follower still gets the locked card (name, avatar, username), so a
-- member can find a private profile and ask to follow it; its bio, goal, link and custom fields
-- stay behind can_view as before. Anon keeps EXECUTE: public and friends-tier cards are public
-- by design (2026-08-04).
create or replace function public.get_public_profile(p_user_id uuid)
returns table(user_id uuid, full_name text, role text, points bigint, bio text, pronouns text, goal text, link text, avatar text, is_public boolean, visibility text, can_view boolean, custom jsonb, username text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with pts as (
    select coalesce(sum(delta), 0)::bigint as points
    from public.score_ledger where user_id = p_user_id
  ),
  ident as (
    select g.data as d
    from public.user_goals g
    where g.user_id = p_user_id and g.kind = 'client_identity'
    limit 1
  ),
  cust as (
    select g.data as d
    from public.user_goals g
    where g.user_id = p_user_id and g.kind = 'profile_custom'
    limit 1
  ),
  visraw as (
    select coalesce(g.data->>'profileVisibility', 'Public') as v
    from public.user_goals g
    where g.user_id = p_user_id and g.kind = 'client_settings'
    limit 1
  ),
  vis as (
    select case
      when lower(coalesce((select v from visraw), 'public')) like 'pub%' then 'public'
      when lower(coalesce((select v from visraw), 'public')) like '%friend%'
        or lower(coalesce((select v from visraw), 'public')) like '%circle%' then 'friends'
      else 'private'
    end as norm
  ),
  fr as (
    select exists (
      select 1
      from public.conversation_participants me
      join public.conversation_participants them
        on them.conversation_id = me.conversation_id
      join public.conversations c on c.id = me.conversation_id
      where me.user_id = auth.uid()
        and them.user_id = p_user_id
        and c.dm_key is not null
    ) as is_friend
  ),
  acc as (
    select
      (select norm from vis) as norm,
      ((select norm from vis) = 'public')
        or (auth.uid() = p_user_id)
        or ((select norm from vis) = 'friends' and (select is_friend from fr))
        as can_view
  )
  select
    p.id,
    coalesce(p.full_name, 'Shape member'),
    p.role,
    (select points from pts),
    case when (select can_view from acc) then (select d->>'bio' from ident) end,
    case when (select can_view from acc) then (select d->>'pronouns' from ident) end,
    case when (select can_view from acc) then (select d->>'goal' from ident) end,
    case when (select can_view from acc) then (select d->>'link' from ident) end,
    (select d->>'photo' from ident),   -- avatar: returned for every card a caller may see
    ((select norm from vis) = 'public'),
    (select norm from acc),
    (select can_view from acc),
    case when (select can_view from acc) then (select d from cust) end,
    p.username
  from public.profiles p
  where p.id = p_user_id
    -- L17: a private profile is not a card for a caller with no account.
    and not (auth.uid() is null and (select norm from vis) = 'private');
$$;

-- ────────────────────────────────────────────────────────────────────────────────────────────
-- 3 · L12 · a refund request is inserted pending, with nothing the admin fills in.
-- ────────────────────────────────────────────────────────────────────────────────────────────
drop policy if exists "clients create own refund requests" on public.refund_requests;
drop policy if exists refund_requests_client_insert_pending on public.refund_requests;
create policy refund_requests_client_insert_pending on public.refund_requests
  for insert to authenticated
  with check (
    auth.uid() = client_id
    and status = 'pending'
    and processed_at is null
    and admin_notes is null
  );

-- ────────────────────────────────────────────────────────────────────────────────────────────
-- 4 · L18 · profiles identity columns, and league_members.
-- ────────────────────────────────────────────────────────────────────────────────────────────
-- A member's own row write keeps username (set_my_username is the only writer: it runs as the
-- function owner, which is privileged here, and checks the format and uniqueness that a direct
-- write skipped), keeps stripe_customer_id (the Stripe webhook writes it, as the service role),
-- and keeps email unless the new value is the account's own auth email (the sign-in seeds and the
-- app's profile upsert mirror auth; nothing else may set it). Silent, like the role guard on the
-- same table: the app's full-row upserts carry these columns unchanged and must not fail.
-- phone is not here: the settings screens write it.
create or replace function public.guard_profile_identity_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  claims text := nullif(current_setting('request.jwt.claims', true), '');
  jwt_role text := claims::jsonb ->> 'role';
  jwt_email text := lower(nullif(claims::jsonb ->> 'email', ''));
  is_privileged boolean := current_user in ('service_role','supabase_admin','supabase_auth_admin','postgres')
                           or jwt_role = 'service_role';
begin
  if is_privileged then return new; end if;
  if tg_op = 'INSERT' then
    new.username := null;
    new.stripe_customer_id := null;
    if new.email is not null and lower(new.email) is distinct from jwt_email then
      new.email := jwt_email;
    end if;
    return new;
  end if;
  new.username := old.username;
  new.stripe_customer_id := old.stripe_customer_id;
  if new.email is distinct from old.email and lower(new.email) is distinct from jwt_email then
    new.email := old.email;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_identity on public.profiles;
create trigger profiles_guard_identity
  before insert or update on public.profiles
  for each row execute function public.guard_profile_identity_columns();

-- league_members: a member reads their own row and may delete it (leaving the League, which
-- POST /api/league does through the member's own client); the League's definer functions write it
-- (they run as the table owner). The self-write policy let a member pick their own tier and cohort.
drop policy if exists league_members_rw_own on public.league_members;
drop policy if exists league_members_read_own on public.league_members;
create policy league_members_read_own on public.league_members
  for select to authenticated
  using (user_id = auth.uid());
drop policy if exists league_members_delete_own on public.league_members;
create policy league_members_delete_own on public.league_members
  for delete to authenticated
  using (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────────────────────────────
-- 5 · L19 · anonymous inserts, and a cap on track_event.
-- ────────────────────────────────────────────────────────────────────────────────────────────
-- The four tables are written by their API routes with the service role (contact, notify-app and
-- apply switch to it in the same change; consultation already did), behind Turnstile and the
-- per-address rate limit. A direct PostgREST insert with the anon key had no limit at all.
drop policy if exists anon_insert_consultation_bookings on public.consultation_bookings;
drop policy if exists anon_insert_contact_submissions on public.contact_submissions;
drop policy if exists anon_insert_provider_applications on public.provider_applications;
drop policy if exists anon_insert_app_launch_notifications on public.app_launch_notifications;

-- check_rate_limit: a second reserved namespace, `fn:`, for buckets a definer function derives
-- itself. Like `self:`, a caller must not be able to burn it by naming the key.
create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns table(allowed boolean, remaining integer, reset_seconds integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The reserved namespaces. Buckets under `self:` are derived from auth.uid() by
  -- check_rate_limit_self, and buckets under `fn:` by a definer function from its own caller;
  -- neither may be reachable through a caller-supplied key, or a member could burn another
  -- member's allowance by naming their uuid.
  if p_key like 'self:%' or p_key like 'fn:%' then
    raise exception 'reserved rate-limit namespace' using errcode = '42501';
  end if;

  return query select * from public._rate_limit_bump(p_key, p_max, p_window_seconds);
end;
$$;

-- track_event: the same whitelist and the 4 KB props cap (M9), plus a per-caller cap: 60 events a
-- minute for a signed-in account, 120 a minute per address for a caller with none (the address is
-- Cloudflare's, in front of the Supabase API; absent, every anonymous caller shares one bucket).
-- Over the cap the event is dropped, never an error: analytics are lossy by design.
create or replace function public.track_event(p_event text, p_props jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ip text := nullif(current_setting('request.headers', true), '')::jsonb ->> 'cf-connecting-ip';
  v_key text := 'fn:track_event:' || coalesce(auth.uid()::text, 'ip:' || coalesce(v_ip, 'unknown'));
  v_allowed boolean;
begin
  if p_event not in (
    'onboarding_started','app_opened','workout_started','paywall_viewed','checkout_started',
    'session_rpe_prompted','session_rpe_dropped',
    'guardrail_evaluated'
  ) then
    return; -- silently ignore non-whitelisted names (defensive)
  end if;
  if p_props is null or jsonb_typeof(p_props) <> 'object' or octet_length(p_props::text) > 4096 then
    p_props := '{}'::jsonb;
  end if;
  select b.allowed into v_allowed
  from public._rate_limit_bump(v_key, case when auth.uid() is null then 120 else 60 end, 60) b;
  if not coalesce(v_allowed, false) then
    return;
  end if;
  insert into public.analytics_events (user_id, event, props)
  values (auth.uid(), p_event, p_props);
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────────────────────
-- 6 · L16 · stripe_account_id leaves the anonymous read of the coach tables.
-- ────────────────────────────────────────────────────────────────────────────────────────────
-- anon's SELECT becomes column-level: every column but stripe_account_id. A table-level grant
-- cannot be narrowed by a column revoke (privileges are additive), so the table grant goes and
-- the columns come back one list at a time. authenticated keeps its table-level SELECT.
-- ⚠ Any later `add column` on these tables needs `grant select (<column>) ... to anon` beside it.
revoke select on table public.trainers from anon;
grant select (
  id, name, specialty, category, price, rating, subscribers, experience, credential, credential_full,
  specialty_type, bio, color, tags, trainer_of_month, totm_quote, featured, sort_order, created_at,
  updated_at, stripe_product_id, stripe_price_id, owner_id, stripe_account_status, session_price,
  at_capacity, capacity_resume_at, verified, verified_at, monthly_offer, listing_media, timezone
) on table public.trainers to anon;

revoke select on table public.nutritionists from anon;
grant select (
  id, name, specialty, category, price, rating, subscribers, experience, credential, credential_full,
  specialty_type, bio, color, tags, services, nutritionist_of_month, notm_quote, featured, sort_order,
  created_at, updated_at, stripe_product_id, stripe_price_id, owner_id, stripe_account_status,
  meal_plan_price, at_capacity, capacity_resume_at, verified, verified_at, monthly_offer, listing_media,
  timezone
) on table public.nutritionists to anon;

-- ────────────────────────────────────────────────────────────────────────────────────────────
-- 7 · L3 · the admin's review columns leave the coach's own read.
-- ────────────────────────────────────────────────────────────────────────────────────────────
-- The guard_credential_review_columns trigger already nulls review_notes, reviewed_by,
-- reviewed_at and the verification on any self-write; this closes the read. authenticated's
-- SELECT becomes column-level, everything but review_notes and reviewed_by; its INSERT, UPDATE and
-- DELETE stay table-level under the own-row policy. (reviewed_at stays: the route shows it.)
revoke select on table public.provider_credentials from authenticated;
grant select (
  owner_id, credential_type, cdr_id, verified_rd, verified_at, insurance_carrier, insurance_policy,
  insurance_expires, attestations, updated_at, insurance_coi_path, cert_files, review_status,
  submitted_at, reviewed_at
) on table public.provider_credentials to authenticated;

-- ────────────────────────────────────────────────────────────────────────────────────────────
-- Guard: raise on anything that did not land. No dynamic SQL.
-- ────────────────────────────────────────────────────────────────────────────────────────────
do $guard$
declare
  f record;
  v_count int;
  v_cfg text;
  v_src text;
begin
  for f in
    select * from (values
      ('get_follow_list', 'p_user_id uuid, p_kind text'),
      ('get_active_now', 'p_limit integer'),
      ('get_active_activities', ''),
      ('shape_profile_visibility', 'p_user_id uuid')
    ) as t(name, args)
  loop
    select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = f.name
      and pg_get_function_identity_arguments(p.oid) = f.args
      and p.prosecdef
      and not has_function_privilege('anon', p.oid, 'execute')
      and has_function_privilege('authenticated', p.oid, 'execute')
      and coalesce(array_to_string(p.proconfig, ','), '') like '%pg_temp%';
    if v_count <> 1 then
      raise exception '%(%) must be a pinned SECURITY DEFINER that anon cannot run and authenticated can', f.name, f.args;
    end if;
  end loop;

  select array_to_string(p.proconfig, ',') into v_cfg
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'save_workout_session'
    and pg_get_function_identity_arguments(p.oid) = 'p_session jsonb, p_sets jsonb, p_samples jsonb';
  if v_cfg is null or v_cfg !~ 'search_path=public, pg_temp' then
    raise exception 'save_workout_session is not pinned to public, pg_temp (got %)', coalesce(v_cfg, 'none');
  end if;

  select p.prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_public_profile';
  if v_src is null or v_src not like '%auth.uid() is null and (select norm from vis) = ''private''%' then
    raise exception 'get_public_profile does not hide a private profile from an anonymous caller';
  end if;

  select p.prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_follow_list';
  if v_src is null or v_src not like '%auth.uid() is not null%' or v_src not like '%shape_profile_visibility(p_user_id)%' then
    raise exception 'get_follow_list does not gate on the caller and the visibility';
  end if;

  select p.prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'track_event';
  if v_src is null or v_src not like '%_rate_limit_bump(%' or v_src not like '%fn:track_event:%' then
    raise exception 'track_event does not take its rate bucket';
  end if;

  select p.prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'check_rate_limit';
  if v_src is null or v_src not like '%p_key like ''fn:%''%' then
    raise exception 'check_rate_limit does not reserve the fn: namespace';
  end if;

  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'user_follows' and policyname = 'follows public read';
  if v_count <> 0 then raise exception 'user_follows still carries the anonymous read policy'; end if;
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'user_follows' and policyname = 'follows_read_accepted_or_own'
    and cmd = 'SELECT' and 'authenticated' = any(roles)
    and qual like '%accepted%' and qual like '%follower_id = auth.uid()%' and qual like '%following_id = auth.uid()%';
  if v_count <> 1 then raise exception 'user_follows is missing follows_read_accepted_or_own'; end if;

  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'refund_requests' and policyname = 'refund_requests_client_insert_pending'
    and cmd = 'INSERT' and with_check like '%auth.uid() = client_id%' and with_check like '%status = ''pending''%'
    and with_check like '%processed_at IS NULL%' and with_check like '%admin_notes IS NULL%';
  if v_count <> 1 then raise exception 'refund_requests is missing refund_requests_client_insert_pending'; end if;
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'refund_requests' and policyname = 'clients create own refund requests';
  if v_count <> 0 then raise exception 'refund_requests still carries the unconditional insert policy'; end if;

  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'league_members' and policyname = 'league_members_rw_own';
  if v_count <> 0 then raise exception 'league_members is still self-writable'; end if;
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'league_members' and policyname = 'league_members_read_own' and cmd = 'SELECT';
  if v_count <> 1 then raise exception 'league_members is missing league_members_read_own'; end if;
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'league_members' and policyname = 'league_members_delete_own' and cmd = 'DELETE';
  if v_count <> 1 then raise exception 'league_members is missing league_members_delete_own'; end if;
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and tablename = 'league_members' and cmd in ('INSERT', 'UPDATE', 'ALL');
  if v_count <> 0 then raise exception 'league_members has % member write policies', v_count; end if;

  select count(*) into v_count from pg_policies
  where schemaname = 'public' and policyname in (
    'anon_insert_consultation_bookings', 'anon_insert_contact_submissions',
    'anon_insert_provider_applications', 'anon_insert_app_launch_notifications');
  if v_count <> 0 then raise exception '% anonymous insert policies are still in place', v_count; end if;

  select count(*) into v_count from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'profiles' and t.tgname = 'profiles_guard_identity' and not t.tgisinternal;
  if v_count <> 1 then raise exception 'profiles is missing profiles_guard_identity'; end if;

  if has_table_privilege('anon', 'public.trainers', 'select')
     or has_column_privilege('anon', 'public.trainers', 'stripe_account_id', 'select')
     or not has_column_privilege('anon', 'public.trainers', 'owner_id', 'select')
     or not has_column_privilege('anon', 'public.trainers', 'listing_media', 'select') then
    raise exception 'trainers: anon must read every column but stripe_account_id';
  end if;
  if has_table_privilege('anon', 'public.nutritionists', 'select')
     or has_column_privilege('anon', 'public.nutritionists', 'stripe_account_id', 'select')
     or not has_column_privilege('anon', 'public.nutritionists', 'owner_id', 'select')
     or not has_column_privilege('anon', 'public.nutritionists', 'services', 'select') then
    raise exception 'nutritionists: anon must read every column but stripe_account_id';
  end if;
  -- Every column but the one: a column added without its grant fails here on a re-run.
  select count(*) into v_count from information_schema.columns c
  where c.table_schema = 'public' and c.table_name in ('trainers', 'nutritionists')
    and c.column_name <> 'stripe_account_id'
    and not has_column_privilege('anon', ('public.' || c.table_name)::regclass, c.column_name, 'select');
  if v_count <> 0 then
    raise exception '% column(s) of trainers / nutritionists are not readable by anon: add their grant', v_count;
  end if;
  if not has_table_privilege('authenticated', 'public.trainers', 'select')
     or not has_table_privilege('authenticated', 'public.nutritionists', 'select') then
    raise exception 'authenticated must keep its table-level read of the coach tables';
  end if;

  if has_table_privilege('authenticated', 'public.provider_credentials', 'select')
     or has_column_privilege('authenticated', 'public.provider_credentials', 'review_notes', 'select')
     or has_column_privilege('authenticated', 'public.provider_credentials', 'reviewed_by', 'select')
     or not has_column_privilege('authenticated', 'public.provider_credentials', 'review_status', 'select')
     or not has_column_privilege('authenticated', 'public.provider_credentials', 'reviewed_at', 'select')
     or not has_table_privilege('authenticated', 'public.provider_credentials', 'update') then
    raise exception 'provider_credentials: authenticated must read every column but review_notes and reviewed_by, and keep its writes';
  end if;
  select count(*) into v_count from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'provider_credentials'
    and c.column_name not in ('review_notes', 'reviewed_by')
    and not has_column_privilege('authenticated', 'public.provider_credentials'::regclass, c.column_name, 'select');
  if v_count <> 0 then
    raise exception '% column(s) of provider_credentials are not readable by the coach: add their grant', v_count;
  end if;
end
$guard$;

commit;
