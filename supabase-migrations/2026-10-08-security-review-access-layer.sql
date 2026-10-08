-- Security and data review, cut 2 (2026-10-08): the access layer.
--
-- Every change here closes a finding that was verified against THIS production catalog
-- (policies, function bodies and triggers read live, and the policy holes exercised as a
-- signed-in user inside a rolled-back transaction). The findings page is private to the owner;
-- the numbers below (C1, H2, M5 ...) are its ids. The app code half of the review is a separate
-- PR; nothing here needs it to land first.
--
-- Tested before it was written down here: the whole file was applied, twice, to a local
-- PostgreSQL 16 replica built from this catalog (the tables these statements touch, all 197
-- function bodies, the triggers, all policies and grants), and 37 probes ran before and after
-- as an anonymous caller, members, coaches and the service role. Every hole below was open
-- before and closed after; every path the website and the app use still worked; the second
-- run changed nothing.
--
-- Nothing below removes a path the website or the app uses. What changes for members and
-- coaches is deliberate and named where it happens: points stop after a generous daily
-- number of hand-logged items (H8), open booking requests stop at 20 per coach (M3), and a
-- coach's Stripe columns are written only by the server (H7). What it removes:
--   C1  anonymous callers reading any member's health observations (NULL-comparison bypass);
--   C2  anonymous callers reading the full workout document of every published coach plan;
--   H1  a nutritionist inserting a meal plan for ANY member (a policy a June migration dropped,
--       which production still carried);
--   H2  a member pre-seeding two other members' direct conversation and reading it;
--   H3  a coach re-pointing assignments, pushed items and focus banners at any member;
--   H4  a member approving their own follow of a private profile;
--   H6  a coach granting themselves a Lead Boost by inserting the row;
--   H7  a coach writing their own Stripe payout account and onboarding status;
--   H8  self-awarded points with no daily cap (they convert to cash discounts);
--   H9  a linked coach claiming the undo of a member's own Nora action;
--   M3  a member filling a coach's calendar, or blocking it with one absurd duration;
--   M5  a member making themselves host of a public channel;
--   M6  a linked coach reading a member's private Nora memory notes through the audit log;
--   M7  anonymous callers reading the leaderboard (names, avatars, points, user ids);
--   M9  anonymous callers storing arbitrary JSON up to 1 MB per call in analytics.
--
-- Idempotent, safe to re-run. It is one transaction, so a failure leaves the database exactly
-- as it was. If a table is busy, the lock wait gives up after 10 seconds and the whole file
-- rolls back rather than queueing in front of the app's own queries; run it again a minute later.

begin;
set local lock_timeout = '10s';

-- =====================================================================================
-- C1 · get_health_sources: an anonymous caller must get nothing, and p_days is capped.
--
-- The old guard was `if v_uid <> auth.uid() and not is_coach_on_client(v_uid)`. With no
-- session auth.uid() is NULL, the comparison is NULL, the whole condition is NULL, and a NULL
-- `if` does not fire, so the function returned the rows. set_metric_source received the
-- explicit null guard on 2026-06-30; this reader kept its 2026-06-17 body.
-- =====================================================================================
create or replace function public.get_health_sources(p_user_id uuid, p_days integer default 7)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid  uuid := coalesce(p_user_id, auth.uid());
  v_days integer := least(greatest(coalesce(p_days, 7), 1), 400);
begin
  if auth.uid() is null then return null; end if;
  if v_uid <> auth.uid() and not public.is_coach_on_client(v_uid) then return null; end if;
  return jsonb_build_object(
    'observations', coalesce((
      select jsonb_agg(jsonb_build_object('snapshot_date', o.snapshot_date, 'metric', o.metric, 'source', o.source, 'value', o.value, 'observed_at', o.observed_at))
      from public.health_metric_observations o
      where o.user_id = v_uid and o.snapshot_date >= (current_date - v_days)
    ), '[]'::jsonb),
    'overrides', coalesce((
      select jsonb_object_agg(m.metric, m.source) from public.metric_source_overrides m where m.user_id = v_uid
    ), '{}'::jsonb)
  );
end;
$$;
revoke execute on function public.get_health_sources(uuid, integer) from public, anon;
grant execute on function public.get_health_sources(uuid, integer) to authenticated, service_role;

-- =====================================================================================
-- C2 · The public sale-plan functions return a preview, not the product.
--
-- `detail` holds the storefront preview and, for a workout program, the product itself. The
-- preview (spec 2026-07-24, "what's inside") reads buildType, media, note, the goal/diet/cals
-- meta, the outline `blocks` and a meal plan's per-day `days` (planPreview.mjs, bsPlanWeek), and
-- shows them before a purchase by design. `builder` is the full workout document, every
-- exercise, set and load: nothing reads it before a purchase (coachWorkoutLibrary.mjs already
-- summarises it into `blocks` at save time), and get_my_purchased_plans unlocks it once a
-- purchase is paid. The 2026-06-09 migration passed the whole object to these public functions;
-- they now return `detail` without `builder`. Return shapes are unchanged and every preview
-- renders as before. (Whether a meal plan's menus should show before purchase is a product
-- question about the preview, not this migration's to decide.)
-- =====================================================================================
create or replace function public.get_coach_sale_plans(p_provider_role text, p_provider_id bigint)
returns table(id uuid, kind text, name text, meta text, price text, category text, detail jsonb)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with own as (
    select case
      when p_provider_role = 'nutritionist' then (select owner_id from nutritionists where id = p_provider_id)
      else (select owner_id from trainers where id = p_provider_id)
    end as oid
  )
  select cp.id, cp.kind, cp.name, cp.meta, cp.price,
    lower(coalesce(nullif(cp.detail->>'buildType', ''), case when cp.kind = 'meal_plan' then 'meal' else 'program' end)) as category,
    (cp.detail - 'builder') as detail
  from coach_plans cp
  where cp.owner_id = (select oid from own)
    and cp.published = true
  order by cp.created_at desc
  limit 80;
$$;

create or replace function public.get_coach_sale_plans_by_user(p_user_id uuid)
returns table(id uuid, kind text, name text, meta text, price text, category text, provider_id bigint, provider_role text, detail jsonb)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select cp.id, cp.kind, cp.name, cp.meta, cp.price,
    lower(coalesce(nullif(cp.detail->>'buildType', ''), case when cp.kind = 'meal_plan' then 'meal' else 'program' end)) as category,
    case when cp.kind = 'meal_plan'
      then (select id from nutritionists where owner_id = cp.owner_id limit 1)
      else (select id from trainers where owner_id = cp.owner_id limit 1)
    end as provider_id,
    case when cp.kind = 'meal_plan' then 'nutritionist' else 'trainer' end as provider_role,
    (cp.detail - 'builder') as detail
  from coach_plans cp
  where cp.owner_id = p_user_id
    and cp.published = true
  order by cp.created_at desc
  limit 80;
$$;

-- =====================================================================================
-- H1 · client_meal_plans: the ungated ALL policy that 2026-06-17-coach-write-scope.sql dropped
-- is still live. Permissive policies OR together, so it let a nutritionist insert for any
-- member beside the gated nutritionist_insert_on_meal_plans. The gated insert, update, delete
-- and select policies stay; nothing a nutritionist does for a linked client changes.
-- =====================================================================================
drop policy if exists nutritionist_write_own_meal_plans on public.client_meal_plans;

-- =====================================================================================
-- H2 · conversations: a member-created row carries no dm_key, and the keys are frozen.
--
-- get_or_create_member_conversation finds a pair's conversation by dm_key and reuses it. The
-- insert policy let a member choose the dm_key, so a row seeded with another pair's key was
-- the one that pair later talked in, and can_access_conversation admitted the seeder as its
-- client_id. Four walls now: any seeded key is cleared; the insert policy refuses a dm_key; a
-- trigger freezes kind, dm_key, client_id and provider_* on update (the service role and the
-- definer functions, which run as their owner postgres, are exempt, as in
-- guard_provider_admin_columns); and the definer reuses only a row it created itself.
-- =====================================================================================
-- A key on a row that names a client or a provider was never written by
-- get_or_create_member_conversation (its rows carry only kind and dm_key), so it can only be a
-- seeded one. Clearing it lets the pair's next message open their own conversation; left in
-- place, the unique index on dm_key would refuse it. Production held no conversations at
-- review time, so this is expected to touch no row.
update public.conversations
   set dm_key = null
 where dm_key is not null
   and (client_id is not null or provider_id is not null or provider_role is not null);

drop policy if exists "clients create direct conversations" on public.conversations;
create policy "clients create direct conversations" on public.conversations
  for insert to authenticated
  with check (kind = 'direct' and client_id = auth.uid() and dm_key is null);

create or replace function public.freeze_conversation_keys()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  is_privileged boolean := current_user in ('service_role','supabase_admin','supabase_auth_admin','postgres')
                           or jwt_role = 'service_role';
begin
  if is_privileged then
    return new;
  end if;
  if new.kind is distinct from old.kind
     or new.dm_key is distinct from old.dm_key
     or new.client_id is distinct from old.client_id
     or new.provider_role is distinct from old.provider_role
     or new.provider_id is distinct from old.provider_id then
    raise exception 'kind, dm_key, client_id and provider are immutable on conversations'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists conversations_freeze_keys on public.conversations;
create trigger conversations_freeze_keys
  before update on public.conversations
  for each row execute function public.freeze_conversation_keys();

create or replace function public.get_or_create_member_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_conversation_id uuid;
begin
  if v_me is null then
    raise exception 'Authentication is required.';
  end if;
  if p_other_user_id is null or p_other_user_id = v_me then
    raise exception 'Pick another member to message.';
  end if;
  if not exists (select 1 from public.profiles where id = p_other_user_id) then
    raise exception 'Member was not found.';
  end if;

  v_key := case when v_me < p_other_user_id
                then v_me::text || ':' || p_other_user_id::text
                else p_other_user_id::text || ':' || v_me::text end;

  -- Only a row this function created (no client, no provider) is the pair's conversation.
  select id into v_conversation_id
  from public.conversations
  where dm_key = v_key
    and kind = 'direct'
    and client_id is null
    and provider_id is null
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations (kind, dm_key)
    values ('direct', v_key)
    returning id into v_conversation_id;
  end if;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values (v_conversation_id, v_me, 'member'),
         (v_conversation_id, p_other_user_id, 'member')
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;

-- =====================================================================================
-- H3 · The coach console tables freeze their keys on update.
--
-- coach_program_assignments, coach_pushed_items and coach_focus_banners gate the INSERT on
-- is_discipline_coach_on_client, but their UPDATE policies test ownership only, so a row
-- inserted for a linked client could be re-pointed at anyone. client_workouts and
-- client_meal_plans already have freeze triggers; these three get the same, over whichever of
-- the key columns the table has. A coach's edits to the row's content are untouched, and an
-- edit for a client whose subscription has since lapsed still works (a link check on UPDATE
-- would have refused it).
-- =====================================================================================
create or replace function public.freeze_coach_console_keys()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  is_privileged boolean := current_user in ('service_role','supabase_admin','supabase_auth_admin','postgres')
                           or jwt_role = 'service_role';
  newj jsonb := to_jsonb(new);
  oldj jsonb := to_jsonb(old);
  k text;
begin
  if is_privileged then
    return new;
  end if;
  foreach k in array array['client_id', 'owner_id', 'provider_id', 'provider_role', 'program_template_id'] loop
    if (oldj ? k) and ((newj -> k) is distinct from (oldj -> k)) then
      raise exception '% is immutable on %', k, tg_table_name using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists coach_program_assignments_freeze_keys on public.coach_program_assignments;
create trigger coach_program_assignments_freeze_keys
  before update on public.coach_program_assignments
  for each row execute function public.freeze_coach_console_keys();
drop trigger if exists coach_pushed_items_freeze_keys on public.coach_pushed_items;
create trigger coach_pushed_items_freeze_keys
  before update on public.coach_pushed_items
  for each row execute function public.freeze_coach_console_keys();
drop trigger if exists coach_focus_banners_freeze_keys on public.coach_focus_banners;
create trigger coach_focus_banners_freeze_keys
  before update on public.coach_focus_banners
  for each row execute function public.freeze_coach_console_keys();

-- =====================================================================================
-- H4 · user_follows: a member can only ask. `status` defaulted to 'accepted' and nothing
-- pinned it, so a direct insert read a private profile's followers-only posts and live
-- activity at once. toggle_follow (the only writer in the app and the website) is SECURITY
-- DEFINER and still writes 'accepted' for a public profile; respond_follow_request still
-- flips a pending row. No client inserts this table directly (checked).
-- =====================================================================================
drop policy if exists "follows self insert" on public.user_follows;
create policy "follows self insert" on public.user_follows
  for insert to authenticated
  with check (follower_id = auth.uid() and following_id <> auth.uid() and status = 'pending');

-- =====================================================================================
-- H6 · coach_lead_boosts: a coach reads their boosts and never writes the row.
--
-- The ALL policies let the owning coach insert `status = 'active'` for any length. The store
-- prices a boost at 900 to 4,980 points and nothing debited them; the route that inserts the
-- row charges nothing either (and sends a column the table does not have, so it fails today).
-- The activation path belongs in a definer RPC that debits the catalogue item in the same
-- transaction; that is the code PR. Until then no boost can be created by a coach, which is
-- the safe side. Active boosts stay public (the marketplace reads them) and an owner can read
-- all of theirs.
-- =====================================================================================
drop policy if exists trainer_write_own_lead_boosts on public.coach_lead_boosts;
drop policy if exists nutritionist_write_own_lead_boosts on public.coach_lead_boosts;
drop policy if exists coach_read_own_lead_boosts on public.coach_lead_boosts;
create policy coach_read_own_lead_boosts on public.coach_lead_boosts
  for select to authenticated
  using (
    (provider_role = 'trainer' and exists (select 1 from public.trainers t where t.id = coach_lead_boosts.provider_id and t.owner_id = auth.uid()))
    or (provider_role = 'nutritionist' and exists (select 1 from public.nutritionists n where n.id = coach_lead_boosts.provider_id and n.owner_id = auth.uid()))
  );

-- =====================================================================================
-- H7 · guard_provider_admin_columns also owns the Stripe payout columns.
--
-- Every checkout gate trusts stripe_account_status = 'active' and the payout destination is
-- stripe_account_id itself. The connect routes, the onboarding page and the webhook write
-- them with the service role, which the guard already exempts; a coach editing their own
-- listing through RLS could set either. Same body as before, two more columns.
-- =====================================================================================
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
                             'stripe_account_id','stripe_account_status'];
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

-- =====================================================================================
-- H8 · Self-reported points get a rolling 24-hour cap per source.
--
-- activities, habit completions and public posts are the member's own rows, by design; the
-- award functions paid for every row with no limit, and points buy store credit that is
-- applied at Stripe checkout and tier rewards up to a free year (750 scripted activity rows
-- reached the 15,000-point tier in minutes). award_workout_session already caps by day; these
-- three cap by a rolling 24 hours on the ledger itself, so no clock-zone question arises.
-- The numbers are set above what a real member logs by hand (the only callers are the manual
-- log routes: /api/client/activities, /api/client/habits, /api/community/feed and the app's
-- post path; synced activities award nothing): 6 activities (at most 120 points), 24 habit
-- check-offs (72), 5 community posts (25). An item past the cap is still saved; it just earns
-- nothing. Tune the numbers here if the product needs more.
-- The count and the insert are serialized per member and source by a transaction-scoped
-- advisory lock (the store's own idiom), because the cap exists against a script, and a script
-- fires its calls at once: without the lock, concurrent calls for different ids each count the
-- same rows below the cap and each insert (CodeRabbit on #2280). The lock is released at the
-- end of the call's transaction.
-- =====================================================================================
create or replace function public.award_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid  uuid := auth.uid();
  v_min  numeric;
  v_type text;
  v_pts  int;
  v_today int;
begin
  if v_uid is null or p_activity_id is null then return; end if;
  select duration_min, activity_type into v_min, v_type
    from public.activities where id = p_activity_id and user_id = v_uid;
  if not found then return; end if;
  perform pg_advisory_xact_lock(hashtext('shape_award:activity:' || v_uid::text));
  select count(*) into v_today from public.score_ledger
    where user_id = v_uid and source_kind = 'activity' and earned_at > now() - interval '24 hours';
  if v_today >= 6 then return; end if;
  v_pts := greatest(2, least(20, round(coalesce(v_min, 10) / 5.0)))::int;
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (v_uid, 'workouts', 'activity', p_activity_id, v_pts, coalesce(v_type, 'Activity'))
    on conflict (user_id, source_kind, source_id) do nothing;
end $$;

create or replace function public.award_habit(p_completion_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_today int;
begin
  if v_uid is null or p_completion_id is null then return; end if;
  if not exists (
    select 1 from public.user_habit_completions where id = p_completion_id and user_id = v_uid
  ) then return; end if;
  perform pg_advisory_xact_lock(hashtext('shape_award:habit_completion:' || v_uid::text));
  select count(*) into v_today from public.score_ledger
    where user_id = v_uid and source_kind = 'habit_completion' and earned_at > now() - interval '24 hours';
  if v_today >= 24 then return; end if;
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (v_uid, 'habits', 'habit_completion', p_completion_id, 3, 'Habit')
    on conflict (user_id, source_kind, source_id) do nothing;
end $$;

create or replace function public.award_community_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_today int;
begin
  if v_uid is null or p_post_id is null then return; end if;
  -- Only a real, caller-owned, feed-visible, NON-MEAL, NON-MILESTONE post
  -- earns. Private/profile-only posts, other users' posts, meal shares, and
  -- work milestones award nothing here.
  if not exists (
    select 1 from public.community_posts
    where id = p_post_id and author_id = v_uid and privacy in ('public', 'community')
      and coalesce(activity_type, '') not in ('meal', 'milestone')
      and coalesce(metrics->>'kind', '') not in ('meal', 'milestone')
  ) then return; end if;
  perform pg_advisory_xact_lock(hashtext('shape_award:community_post:' || v_uid::text));
  select count(*) into v_today from public.score_ledger
    where user_id = v_uid and source_kind = 'community_post' and earned_at > now() - interval '24 hours';
  if v_today >= 5 then return; end if;
  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
    values (v_uid, 'community', 'community_post', p_post_id, 5, 'Community post')
    on conflict (user_id, source_kind, source_id) do nothing;
end $$;

-- =====================================================================================
-- M3 · sessions: a sane duration, and a bound on open requests per member.
--
-- duration_min had no CHECK; one direct insert of a year-long request made every later
-- booking fail the no-overlap constraint and advertised the block through
-- provider_busy_blocks. The routes accept 15 to 240 minutes (sessions/manage) or the fixed
-- session length, so 5 to 480 refuses nothing real. The open-request bound lives in
-- enforce_booking_rules beside the coach's own rules, and only `requested` rows reach it: a
-- coach's own bookings and runs are written `confirmed` and skip it. A member may hold 20
-- open future requests with ONE coach, which no real member needs and which stops one account
-- taking a coach's whole month. The rest of the function is the 2026-10-07 body, unchanged.
-- =====================================================================================
alter table public.sessions drop constraint if exists sessions_duration_min_check;
alter table public.sessions add constraint sessions_duration_min_check
  check (duration_min is null or (duration_min >= 5 and duration_min <= 480));

create or replace function public.enforce_booking_rules()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_buf integer;
  v_max integer;
  v_notice integer;
  v_zone text;
  v_end timestamptz;
  v_gap interval;
  v_count integer;
begin
  if new.status is distinct from 'requested' then
    return new;
  end if;

  -- One request at a time per coach. Under READ COMMITTED each statement below takes a fresh
  -- snapshot, so a request that waited here sees the one it waited for.
  perform pg_advisory_xact_lock(hashtextextended('shape.booking:' || new.provider_role || ':' || new.provider_id::text, 0));

  -- A member holds at most 20 open future requests with one coach (security review
  -- 2026-10-08, M3). Runs are written `confirmed` by the coach and never reach this.
  if new.client_id is not null then
    select count(*) into v_count
      from public.sessions s
     where s.client_id = new.client_id
       and s.provider_role = new.provider_role
       and s.provider_id = new.provider_id
       and s.status = 'requested'
       and s.id is distinct from new.id
       and s.scheduled_at > now();
    if v_count >= 20 then
      raise exception 'booking_rule:open_requests' using errcode = 'P0001', detail = '20';
    end if;
  end if;

  -- ⚠ NO ROW LEAVES ALL THREE NULL (SELECT INTO with no match), read as the defaults below.
  select r.buffer_min, r.max_per_day, r.min_notice_hours
    into v_buf, v_max, v_notice
    from public.provider_booking_rules r
   where r.provider_role = new.provider_role
     and r.provider_id = new.provider_id;
  v_buf := coalesce(v_buf, 0);
  v_notice := coalesce(v_notice, 0);

  v_end := new.scheduled_at + make_interval(mins => greatest(coalesce(new.duration_min, 15), 1));

  if v_notice > 0 and new.scheduled_at > now() and new.scheduled_at < now() + make_interval(hours => v_notice) then
    raise exception 'booking_rule:notice' using errcode = 'P0001', detail = v_notice::text;
  end if;

  if exists (
    select 1 from public.provider_time_off o
     where o.provider_role = new.provider_role
       and o.provider_id = new.provider_id
       and o.starts_at < v_end
       and o.ends_at > new.scheduled_at
  ) then
    raise exception 'booking_rule:time_off' using errcode = 'P0001';
  end if;

  if v_buf > 0 then
    v_gap := make_interval(mins => v_buf);
    if exists (
      select 1 from (
        select s.scheduled_at as s_start,
               s.scheduled_at + make_interval(mins => greatest(coalesce(s.duration_min, 15), 1)) as s_end
          from public.sessions s
         where s.provider_role = new.provider_role
           and s.provider_id = new.provider_id
           and s.status in ('requested', 'confirmed')
           and s.id is distinct from new.id
           and s.scheduled_at < v_end + v_gap
           and s.scheduled_at > new.scheduled_at - v_gap - interval '1 day'
      ) x
      where (x.s_end <= new.scheduled_at and x.s_end > new.scheduled_at - v_gap)
         or (x.s_start >= v_end and x.s_start < v_end + v_gap)
    ) then
      raise exception 'booking_rule:buffer' using errcode = 'P0001';
    end if;
  end if;

  if v_max is not null then
    if new.provider_role = 'trainer' then
      select t.timezone into v_zone from public.trainers t where t.id = new.provider_id;
    else
      select n.timezone into v_zone from public.nutritionists n where n.id = new.provider_id;
    end if;
    -- A coach with no usable zone has no local day to count; the routes refuse such a coach's
    -- bookings outright, and this does not invent a day for the app's path.
    if v_zone is not null and exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_zone) then
      select count(*) into v_count
        from public.sessions s
       where s.provider_role = new.provider_role
         and s.provider_id = new.provider_id
         and s.status in ('requested', 'confirmed')
         and s.id is distinct from new.id
         and s.scheduled_at > new.scheduled_at - interval '2 days'
         and s.scheduled_at < new.scheduled_at + interval '2 days'
         and (s.scheduled_at at time zone v_zone)::date = (new.scheduled_at at time zone v_zone)::date;
      if v_count >= v_max then
        raise exception 'booking_rule:daily_limit' using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- =====================================================================================
-- M5 · channel_members: joining a public channel makes you a member, not a host.
-- is_channel_host is `role = 'host'` and a host can rename, hide and empty a channel; the
-- self-join branch never pinned role. Hosts still add anyone with any role.
-- =====================================================================================
drop policy if exists "join public or host adds" on public.channel_members;
create policy "join public or host adds" on public.channel_members
  for insert to authenticated
  with check (
    (user_id = auth.uid() and role = 'member' and public.is_public_channel(channel_id))
    or public.is_channel_host(channel_id)
  );

-- =====================================================================================
-- M7 · The leaderboard is for signed-in members. Both functions were executable by anon and
-- the first returns user ids, names, avatars and points with no gate beyond the opt-out; the
-- route above it already requires a session.
-- =====================================================================================
revoke execute on function public.shape_leaderboard(text, integer) from public, anon;
grant execute on function public.shape_leaderboard(text, integer) to authenticated, service_role;
revoke execute on function public.shape_leaderboard_me(text) from public, anon;
grant execute on function public.shape_leaderboard_me(text) to authenticated, service_role;

-- =====================================================================================
-- M9 · track_event keeps props small. Anonymous callers could store any JSON up to the
-- proxy's 1 MB body cap, 100 times a minute, for 12 months. 4 KB of JSON text is far above any
-- event the app sends; an oversized or non-object payload is stored as {} and the event still
-- counts. Measured as text: a repetitive payload compresses, so its stored size understates it.
-- =====================================================================================
create or replace function public.track_event(p_event text, p_props jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
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
  insert into public.analytics_events (user_id, event, props)
  values (auth.uid(), p_event, p_props);
end;
$$;

-- =====================================================================================
-- M6 / H9 · ai_audit_log: only the person who asked Nora reads and undoes what she did.
-- The read policy admitted every row whose target the coach is linked to, which included the
-- member's self-service rows and the memory notes logged with their text; claim_ai_action_undo
-- admitted the same rows, so a coach could mark a member's own action undone. The first draft
-- kept a coach branch for actions a coach took (actor <> target); CodeRabbit on #2280 read what
-- that still admitted: between two coaches on one client, each could read the other's rows
-- (a nutritionist's meal-plan draft, payload and all, which the trainer's own policies do not
-- grant) and claim the undo of the other's action. The only readers are the audit route, which
-- lists the caller's own changes, and the undo button on a change the caller just confirmed,
-- so both are actor-only now. The code PR also stops logging the note text and adds the actor
-- check in undoChange. A member still cannot see what a coach did to them; that was never
-- admitted and is registered, not changed here.
-- =====================================================================================
drop policy if exists ai_audit_read_own_or_coach on public.ai_audit_log;
drop policy if exists ai_audit_read_own on public.ai_audit_log;
create policy ai_audit_read_own on public.ai_audit_log
  for select to authenticated
  using (actor_user_id = auth.uid());

create or replace function public.claim_ai_action_undo(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_me uuid := auth.uid();
  v_row public.ai_audit_log;
begin
  if v_me is null then
    raise exception 'Authentication is required.';
  end if;

  select * into v_row from public.ai_audit_log where id = p_id;
  if not found then
    return false;
  end if;

  -- The actor only. The 2026-07-10 version also admitted a coach on the target, which let a
  -- coach undo a member's own action and, between two coaches on one client, each other's.
  if v_row.actor_user_id <> v_me then
    raise exception 'Not permitted to undo this action.';
  end if;

  -- The guarded transition: of any number of concurrent callers, exactly one
  -- sees FOUND here — that caller (and only that caller) applies the reversal.
  -- undo_claimed_at marks the claim in-flight until finalize/release.
  update public.ai_audit_log
     set status = 'undone', undone_at = now(), undone_by = v_me, undo_claimed_at = now()
   where id = p_id and status = 'executed';
  return found;
end;
$$;

commit;
