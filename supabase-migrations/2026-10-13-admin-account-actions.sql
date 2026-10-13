-- The admin console's account actions (2026-10-13, PR 2 of the console; owner: "full access to
-- remove people, freeze accounts, everything on shape").
--
--   1. A coach listing can be SUSPENDED: taken off the marketplace without deleting it. A
--      `suspended_at` stamp on the listing, kept from the coach by the admin-column guard, and
--      a listing with one is never ready (so every discovery reader, which already filters on
--      listing_ready, hides it). Why and by whom lives in listing_suspensions, staff only.
--   2. An account can be FROZEN: it cannot sign in, its sessions are ended, and its listings are
--      suspended with it. The ban itself is Supabase Auth's (banned_until, set by the console
--      through the Admin API); account_freezes is the record of who froze it and why, and
--      admin_end_sessions() signs it out everywhere at once.
--   3. account_action_requests: a member's Pause / Export / Delete request from Settings. The
--      route (/api/me/account-action) has inserted into this table since it shipped, but the
--      table was never created, so every request reached the team only as an email. Now it is
--      a queue the console works.
--   4. admin_account_detail(): one account, everything the console's account page shows.
--   5. The console's changes (suspend or lift a listing, freeze or unfreeze an account) and its
--      requests queue, each a function so its record and its effect land in one transaction.
--
-- Everything here is service role only, except a member inserting their own request.
-- One transaction. Idempotent, safe to re-run.

begin;

-- ===== 1. LISTING SUSPENSIONS =====

alter table public.trainers add column if not exists suspended_at timestamptz;
alter table public.nutritionists add column if not exists suspended_at timestamptz;
-- L16: a visitor reads every coach-table column but stripe_account_id, and a column added later
-- is granted with it. A visitor can see THAT a listing is suspended (it is hidden anyway); why,
-- and by whom, is only in listing_suspensions.
grant select (suspended_at) on table public.trainers to anon;
grant select (suspended_at) on table public.nutritionists to anon;

-- The admin-column guard (2026-06-25), restated with suspended_at in its list: a coach's own
-- write cannot set, clear or move it; the service role (the console) can.
create or replace function public.guard_provider_admin_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  is_privileged boolean := current_user in ('service_role','supabase_admin','supabase_auth_admin','postgres')
                           or jwt_role = 'service_role';
  admin_cols text[] := array['verified','verified_at','featured','rating','subscribers',
                             'sort_order','trainer_of_month','nutritionist_of_month',
                             'stripe_account_id','stripe_account_status','suspended_at'];
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
        newj := jsonb_set(newj, array[k], oldj -> k);
      end if;
    end loop;
  else
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

-- Readiness (2026-10-12), restated: a suspended listing is never ready, Shape's own included.
-- The trigger still sorts after the guard, so it sees suspended_at after the guard has put back
-- a coach's attempt to clear it.
create or replace function public.provider_listing_ready_row()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_avatar text;
begin
  if new.suspended_at is not null then
    new.listing_ready := false;
    return new;
  end if;
  if new.owner_id is null then
    new.listing_ready := true;
    return new;
  end if;
  select p.avatar_url into v_avatar from public.profiles p where p.id = new.owner_id;
  new.listing_ready :=
    coalesce(new.price, 0) > 0
    and coalesce(new.stripe_account_status, '') = 'active'
    and (
      btrim(coalesce(new.listing_media ->> 'portrait', '')) <> ''
      or btrim(coalesce(v_avatar, '')) <> ''
    );
  return new;
end;
$$;

revoke all on function public.provider_listing_ready_row() from public, anon, authenticated;

create table if not exists public.listing_suspensions (
  id uuid primary key default gen_random_uuid(),
  provider_role text not null check (provider_role in ('trainer', 'nutritionist')),
  provider_id bigint not null,
  owner_id uuid references auth.users(id) on delete set null,
  listing_name text,
  reason text not null,
  -- 'admin': suspended from the console; 'freeze': suspended because its account was frozen,
  -- and lifted when the account is unfrozen (an admin suspension is not).
  source text not null default 'admin' check (source in ('admin', 'freeze')),
  suspended_by uuid references auth.users(id) on delete set null,
  suspended_by_email text not null,
  suspended_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by_email text
);

create unique index if not exists listing_suspensions_open_idx
  on public.listing_suspensions (provider_role, provider_id) where lifted_at is null;
create index if not exists listing_suspensions_owner_idx on public.listing_suspensions (owner_id);

alter table public.listing_suspensions enable row level security;
revoke all on public.listing_suspensions from anon, authenticated;

-- ===== 2. FROZEN ACCOUNTS =====

create table if not exists public.account_freezes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  reason text not null,
  frozen_by uuid references auth.users(id) on delete set null,
  frozen_by_email text not null,
  frozen_at timestamptz not null default now(),
  unfrozen_at timestamptz,
  unfrozen_by_email text
);

create unique index if not exists account_freezes_open_idx on public.account_freezes (user_id) where unfrozen_at is null;

alter table public.account_freezes enable row level security;
revoke all on public.account_freezes from anon, authenticated;

-- Signs an account out everywhere: its refresh tokens and sessions go, so no device can renew a
-- session, and the website's and the app's server-side checks (auth.getUser, which asks Auth
-- for the session the token names) fail at once. An access token already issued still verifies
-- where only its signature is checked, until it expires (an hour at most).
-- ⚠ THE SERVICE ROLE ONLY: revoked from all three by name (Supabase grants anon and
-- authenticated directly).
create or replace function public.admin_end_sessions(p_user uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  if p_user is null then
    return 0;
  end if;
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.sessions where user_id = p_user;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.admin_end_sessions(uuid) from public, anon, authenticated;
grant execute on function public.admin_end_sessions(uuid) to service_role;

-- ===== 3. ACCOUNT REQUESTS =====

create table if not exists public.account_action_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  action text not null check (action in ('Export', 'Pause', 'Delete')),
  status text not null default 'open' check (status in ('open', 'done', 'declined')),
  note text,
  handled_by_email text,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

-- One open request per member per action: asking twice while one is open adds nothing (the
-- route's insert fails quietly and its email still goes out).
create unique index if not exists account_action_requests_open_idx
  on public.account_action_requests (user_id, action) where status = 'open';
create index if not exists account_action_requests_created_idx on public.account_action_requests (created_at desc);

alter table public.account_action_requests enable row level security;
revoke all on public.account_action_requests from anon;
revoke all on public.account_action_requests from authenticated;
grant insert on public.account_action_requests to authenticated;

-- A member files their own request, open and unhandled; nothing else, and they read nothing back.
drop policy if exists account_action_requests_insert_own on public.account_action_requests;
create policy account_action_requests_insert_own on public.account_action_requests
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'open'
    and note is null
    and handled_by_email is null
    and handled_at is null
  );

-- ===== 4. ONE ACCOUNT, FOR THE CONSOLE =====
-- Everything the account page shows, in one call. Counts and dates only for activity: like
-- admin_member_stats, no health value leaves through this. Null for an unknown id.
create or replace function public.admin_account_detail(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'created_at', u.created_at,
    'email_confirmed_at', u.email_confirmed_at,
    'last_sign_in_at', u.last_sign_in_at,
    'banned_until', u.banned_until,
    'source', public.signup_source_label(u.raw_user_meta_data),
    'profile', (select jsonb_build_object('full_name', p.full_name, 'username', p.username, 'role', p.role,
                                          'roles', p.roles, 'created_at', p.created_at)
                from public.profiles p where p.id = u.id),
    'staff_level', (select s.level from public.staff_members s where s.user_id = u.id),
    'memberships', (select coalesce(jsonb_agg(jsonb_build_object(
                      'status', ps.status, 'price_cents', ps.price_cents, 'current_period_end', ps.current_period_end,
                      'created_at', ps.created_at) order by ps.created_at desc), '[]'::jsonb)
                    from public.platform_subscriptions ps where ps.client_id = u.id),
    'coach_subscriptions', (select coalesce(jsonb_agg(jsonb_build_object(
                      'provider_role', cs.provider_role, 'provider_id', cs.provider_id, 'status', cs.status,
                      'price_cents', cs.price_cents, 'created_at', cs.created_at,
                      'coach', coalesce(
                        (select t.name from public.trainers t where cs.provider_role = 'trainer' and t.id = cs.provider_id),
                        (select n.name from public.nutritionists n where cs.provider_role = 'nutritionist' and n.id = cs.provider_id))
                    ) order by cs.created_at desc), '[]'::jsonb)
                    from public.subscriptions cs where cs.client_id = u.id),
    'listings', (select coalesce(jsonb_agg(l.doc order by l.doc->>'role'), '[]'::jsonb) from (
                   select jsonb_build_object('role', 'trainer', 'id', t.id, 'name', t.name, 'live', coalesce(t.listing_ready, false),
                     'verified', coalesce(t.verified, false), 'suspended_at', t.suspended_at,
                     'clients_active', (select count(*) from public.subscriptions s where s.provider_role = 'trainer' and s.provider_id = t.id and s.status = 'active')) as doc
                   from public.trainers t where t.owner_id = u.id
                   union all
                   select jsonb_build_object('role', 'nutritionist', 'id', n.id, 'name', n.name, 'live', coalesce(n.listing_ready, false),
                     'verified', coalesce(n.verified, false), 'suspended_at', n.suspended_at,
                     'clients_active', (select count(*) from public.subscriptions s where s.provider_role = 'nutritionist' and s.provider_id = n.id and s.status = 'active'))
                   from public.nutritionists n where n.owner_id = u.id) l),
    'freezes', (select coalesce(jsonb_agg(jsonb_build_object('reason', f.reason, 'frozen_by_email', f.frozen_by_email,
                  'frozen_at', f.frozen_at, 'unfrozen_at', f.unfrozen_at, 'unfrozen_by_email', f.unfrozen_by_email)
                  order by f.frozen_at desc), '[]'::jsonb)
                from public.account_freezes f where f.user_id = u.id),
    'suspensions', (select coalesce(jsonb_agg(jsonb_build_object('provider_role', ls.provider_role, 'provider_id', ls.provider_id,
                  'listing_name', ls.listing_name, 'reason', ls.reason, 'source', ls.source, 'suspended_by_email', ls.suspended_by_email,
                  'suspended_at', ls.suspended_at, 'lifted_at', ls.lifted_at, 'lifted_by_email', ls.lifted_by_email)
                  order by ls.suspended_at desc), '[]'::jsonb)
                from public.listing_suspensions ls where ls.owner_id = u.id),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'action', r.action, 'status', r.status, 'note', r.note,
                  'handled_by_email', r.handled_by_email, 'handled_at', r.handled_at, 'created_at', r.created_at)
                  order by r.created_at desc), '[]'::jsonb)
                from public.account_action_requests r where r.user_id = u.id),
    'activity', jsonb_build_object(
      'workouts_30d', (select count(*) from public.workout_sessions ws where ws.client_id = u.id and ws.status in ('completed', 'reviewed')
                         and coalesce(ws.ended_at, ws.created_at) >= now() - interval '30 days'),
      'workouts_all', (select count(*) from public.workout_sessions ws where ws.client_id = u.id and ws.status in ('completed', 'reviewed')),
      'meal_days_30d', (select count(*) from public.daily_health_snapshot d where d.user_id = u.id and d.snapshot_date >= current_date - 29
                          and (coalesce(d.calories, 0) > 0 or coalesce(d.dietary_kcal, 0) > 0)),
      'checkins_30d', (select count(*) from public.client_checkins c where c.user_id = u.id and c.created_at >= now() - interval '30 days'),
      'consults_30d', (select count(*) from public.sessions x where x.client_id = u.id and x.created_at >= now() - interval '30 days'),
      'points_30d', (select coalesce(sum(l.delta), 0) from public.score_ledger l where l.user_id = u.id and l.delta > 0
                       and l.earned_at >= now() - interval '30 days'),
      'rank_points', public.shape_rank_points(u.id)
    )
  )
  from auth.users u
  where u.id = p_user
$$;

revoke all on function public.admin_account_detail(uuid) from public, anon, authenticated;
grant execute on function public.admin_account_detail(uuid) to service_role;

-- ===== 5. THE CONSOLE'S CHANGES, EACH IN ONE TRANSACTION =====
-- The console calls these with the service role; each changes its record and the listing (or
-- the account's listings) together, so a half-made change cannot be left behind. The ban itself
-- is Supabase Auth's and is set by the console through the Admin API around these calls
-- (src/app/admin/accounts/actions.ts says in which order, and why).

-- Takes a listing off the marketplace. 'missing' (no such listing), 'already' (it has an open
-- suspension), or 'suspended'.
create or replace function public.admin_suspend_listing(
  p_role text, p_id bigint, p_reason text, p_source text, p_by uuid, p_by_email text)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_name text;
begin
  if p_role is null or p_role not in ('trainer', 'nutritionist') or p_source is null or p_source not in ('admin', 'freeze')
     or btrim(coalesce(p_reason, '')) = '' or btrim(coalesce(p_by_email, '')) = '' then
    raise exception 'admin_suspend_listing: bad arguments';
  end if;
  -- The listing row is locked first, so two suspensions of one listing run one after the other.
  if p_role = 'trainer' then
    select t.owner_id, t.name into v_owner, v_name from public.trainers t where t.id = p_id for update;
  else
    select n.owner_id, n.name into v_owner, v_name from public.nutritionists n where n.id = p_id for update;
  end if;
  if not found then
    return 'missing';
  end if;
  if exists (select 1 from public.listing_suspensions s
             where s.provider_role = p_role and s.provider_id = p_id and s.lifted_at is null) then
    return 'already';
  end if;
  insert into public.listing_suspensions (provider_role, provider_id, owner_id, listing_name, reason, source,
                                          suspended_by, suspended_by_email)
  values (p_role, p_id, v_owner, v_name, left(btrim(p_reason), 500), p_source, p_by, p_by_email);
  if p_role = 'trainer' then
    update public.trainers set suspended_at = now() where id = p_id;
  else
    update public.nutritionists set suspended_at = now() where id = p_id;
  end if;
  return 'suspended';
end;
$$;

-- Puts a listing back. Lifts only a suspension of the kind asked for: an admin's lift never ends
-- a freeze's suspension (the account is unfrozen instead), and an unfreeze never ends an
-- admin's. 'missing', 'not_suspended', 'other_source' or 'lifted'.
create or replace function public.admin_lift_listing(p_role text, p_id bigint, p_by_email text, p_source text)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_open public.listing_suspensions%rowtype;
begin
  if p_role is null or p_role not in ('trainer', 'nutritionist') or p_source is null or p_source not in ('admin', 'freeze')
     or btrim(coalesce(p_by_email, '')) = '' then
    raise exception 'admin_lift_listing: bad arguments';
  end if;
  if p_role = 'trainer' then
    perform 1 from public.trainers t where t.id = p_id for update;
  else
    perform 1 from public.nutritionists n where n.id = p_id for update;
  end if;
  if not found then
    return 'missing';
  end if;
  select * into v_open from public.listing_suspensions s
  where s.provider_role = p_role and s.provider_id = p_id and s.lifted_at is null;
  if not found then
    return 'not_suspended';
  end if;
  if v_open.source <> p_source then
    return 'other_source';
  end if;
  update public.listing_suspensions set lifted_at = now(), lifted_by_email = p_by_email where id = v_open.id;
  -- Readiness is recomputed by the listing's own trigger on this write.
  if p_role = 'trainer' then
    update public.trainers set suspended_at = null where id = p_id;
  else
    update public.nutritionists set suspended_at = null where id = p_id;
  end if;
  return 'lifted';
end;
$$;

-- Freezes an account's records: the freeze row, its listings suspended (source 'freeze'), and its
-- sessions ended. {status: 'missing' | 'already' | 'frozen', listings, sessions}.
create or replace function public.admin_freeze_account(p_user uuid, p_reason text, p_by uuid, p_by_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_listings integer := 0;
  v_sessions integer := 0;
  r record;
begin
  if p_user is null or btrim(coalesce(p_reason, '')) = '' or btrim(coalesce(p_by_email, '')) = '' then
    raise exception 'admin_freeze_account: bad arguments';
  end if;
  select u.email into v_email from auth.users u where u.id = p_user;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  -- One open freeze per account (account_freezes_open_idx): a second, concurrent freeze is
  -- 'already', never an error the console would answer by lifting the ban.
  begin
    insert into public.account_freezes (user_id, email, reason, frozen_by, frozen_by_email)
    values (p_user, v_email, left(btrim(p_reason), 500), p_by, p_by_email);
  exception when unique_violation then
    return jsonb_build_object('status', 'already');
  end;
  for r in
    select 'trainer'::text as role, t.id from public.trainers t where t.owner_id = p_user
    union all
    select 'nutritionist'::text, n.id from public.nutritionists n where n.owner_id = p_user
  loop
    if public.admin_suspend_listing(r.role, r.id, 'Account frozen: ' || btrim(p_reason), 'freeze', p_by, p_by_email) = 'suspended' then
      v_listings := v_listings + 1;
    end if;
  end loop;
  v_sessions := public.admin_end_sessions(p_user);
  return jsonb_build_object('status', 'frozen', 'listings', v_listings, 'sessions', v_sessions);
end;
$$;

-- Unfreezes an account's records: the freeze closed and the listings its freeze suspended put
-- back (an admin's own suspension stays). {status: 'not_frozen' | 'unfrozen', listings}.
create or replace function public.admin_unfreeze_account(p_user uuid, p_by_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_listings integer := 0;
  r record;
begin
  if p_user is null or btrim(coalesce(p_by_email, '')) = '' then
    raise exception 'admin_unfreeze_account: bad arguments';
  end if;
  update public.account_freezes set unfrozen_at = now(), unfrozen_by_email = p_by_email
  where user_id = p_user and unfrozen_at is null;
  if not found then
    return jsonb_build_object('status', 'not_frozen');
  end if;
  for r in
    select s.provider_role, s.provider_id from public.listing_suspensions s
    where s.owner_id = p_user and s.lifted_at is null and s.source = 'freeze'
  loop
    if public.admin_lift_listing(r.provider_role, r.provider_id, p_by_email, 'freeze') = 'lifted' then
      v_listings := v_listings + 1;
    end if;
  end loop;
  return jsonb_build_object('status', 'unfrozen', 'listings', v_listings);
end;
$$;

-- The requests queue: 'open' (oldest first, the order to work them) or 'handled' (newest first).
create or replace function public.admin_account_requests(p_status text, p_limit integer)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(x.doc order by x.rn), '[]'::jsonb)
  from (
    select row_number() over (order by
             case when p_status = 'open' then r.created_at end asc,
             case when p_status = 'open' then null else coalesce(r.handled_at, r.created_at) end desc) as rn,
           jsonb_build_object('id', r.id, 'user_id', r.user_id, 'action', r.action, 'status', r.status, 'note', r.note,
             'handled_by_email', r.handled_by_email, 'handled_at', r.handled_at, 'created_at', r.created_at,
             'email', u.email, 'name', p.full_name) as doc
    from public.account_action_requests r
    left join auth.users u on u.id = r.user_id
    left join public.profiles p on p.id = r.user_id
    where (p_status = 'open') = (r.status = 'open')
    order by rn
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
  ) x
$$;

revoke all on function public.admin_suspend_listing(text, bigint, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_lift_listing(text, bigint, text, text) from public, anon, authenticated;
revoke all on function public.admin_freeze_account(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_unfreeze_account(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_account_requests(text, integer) from public, anon, authenticated;
grant execute on function public.admin_suspend_listing(text, bigint, text, text, uuid, text) to service_role;
grant execute on function public.admin_lift_listing(text, bigint, text, text) to service_role;
grant execute on function public.admin_freeze_account(uuid, text, uuid, text) to service_role;
grant execute on function public.admin_unfreeze_account(uuid, text) to service_role;
grant execute on function public.admin_account_requests(text, integer) to service_role;

-- ===== GUARD =====
do $$
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('listing_suspensions', 'account_freezes', 'account_action_requests')
      and not c.relrowsecurity
  ) then
    raise exception 'the console''s tables must have row level security on';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('listing_suspensions', 'account_freezes')) then
    raise exception 'listing_suspensions and account_freezes must have no policies (service role only)';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'account_action_requests'
             and policyname <> 'account_action_requests_insert_own') then
    raise exception 'account_action_requests takes only the member''s own insert';
  end if;
  if has_table_privilege('authenticated', 'public.account_action_requests', 'select')
     or has_table_privilege('authenticated', 'public.account_action_requests', 'update')
     or has_table_privilege('anon', 'public.account_action_requests', 'insert')
     or has_table_privilege('authenticated', 'public.listing_suspensions', 'select')
     or has_table_privilege('authenticated', 'public.account_freezes', 'select') then
    raise exception 'the console''s tables are open to the API';
  end if;
  if exists (
    select 1 from unnest(array[
      'public.admin_end_sessions(uuid)',
      'public.admin_account_detail(uuid)',
      'public.admin_suspend_listing(text, bigint, text, text, uuid, text)',
      'public.admin_lift_listing(text, bigint, text, text)',
      'public.admin_freeze_account(uuid, text, uuid, text)',
      'public.admin_unfreeze_account(uuid, text)',
      'public.admin_account_requests(text, integer)'
    ]) f(sig)
    where has_function_privilege('anon', f.sig, 'execute') or has_function_privilege('authenticated', f.sig, 'execute')
  ) then
    raise exception 'the console''s functions must be executable by the service role only';
  end if;
  if not has_column_privilege('anon', 'public.trainers', 'suspended_at', 'select')
     or not has_column_privilege('anon', 'public.nutritionists', 'suspended_at', 'select') then
    raise exception 'suspended_at must be granted to anon (L16)';
  end if;
end;
$$;

commit;
