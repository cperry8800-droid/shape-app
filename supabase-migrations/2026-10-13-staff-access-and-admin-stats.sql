-- The private admin console (2026-10-13, owner: "i need the ability to see all stats on website
-- and app for analytical purposes" and "have the ability to give other people in the future,
-- who make work with shape, to have access as well").
--
-- All service role only:
--   1. staff_members: who besides the owner can open /admin, and at which level;
--   2. admin_activity_log: every change a staff member makes from the console;
--   3. admin_overview_stats(): the numbers on the console's Overview;
--   4. admin_coach_stats() and admin_member_stats(): each coach's and each member's progress
--      (owner: "track stats for coaches so i can check their progress", "same for memberes");
--   5. signup_source_label(): names where an account came from, for the two above;
--   6. admin_upcoming_celebrations(): birthdays (month and day only) and Shape anniversaries
--      coming up.
--
-- ===== THE LEVELS =====
-- owner    the owner's own addresses, named in src/lib/admin-access.ts. NOT a row here: an owner
--          cannot be added, demoted or removed from the console, so no staff member can lock
--          the owner out.
-- admin    everything an owner has except the Staff page.
-- support  the help desk and (PR 2) looking people up and freezing accounts.
-- analyst  the Overview only.
-- The rank and what each level opens live in src/lib/staff-levels.mjs.
--
-- ===== WHO CAN READ IT =====
-- Nobody through the API: RLS is on and there are no policies, so only the service role (the
-- console's server code, the Supabase dashboard) reads or writes these tables. A staff level is
-- checked by the server, which then uses the service role; there is no policy that names one.
--
-- ===== WHY THE LOG KEEPS EMAILS =====
-- The log outlives both accounts: deleting the staff member's or the target's account sets its
-- id to null and keeps the row, with the emails, as the record of what was done.
--
-- Until this runs, the console still opens for the owner (and for any ADMIN_EMAILS address, as
-- an admin), its Staff page says the migration is missing, and the Overview says the same.
-- One transaction. Idempotent, safe to re-run.

begin;

create table if not exists public.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  level text not null check (level in ('admin', 'support', 'analyst')),
  added_by uuid references auth.users(id) on delete set null,
  added_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_members enable row level security;
revoke all on public.staff_members from anon, authenticated;

create table if not exists public.admin_activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text not null,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_email text,
  details jsonb not null default '{}'::jsonb,
  -- Written 'pending' BEFORE the change runs, then 'done' or 'failed': a change whose row
  -- cannot be written does not run, so there is no unlogged change.
  outcome text not null default 'pending' check (outcome in ('pending', 'done', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists admin_activity_log_created_idx on public.admin_activity_log (created_at desc);
create index if not exists admin_activity_log_target_idx on public.admin_activity_log (target_user_id) where target_user_id is not null;

alter table public.admin_activity_log enable row level security;
revoke all on public.admin_activity_log from anon, authenticated;

-- ===== WHERE A SIGN-UP CAME FROM =====
-- Every sign-up path saves `signup_source` in the new account's user metadata (owner,
-- 2026-10-13: "track signups by source too"; src/lib/signup-source.mjs says what is recorded and
-- when). This names it: a coach's referral link first, then the link's utm_source, then the
-- referring site, then the app, else 'direct'. An account made before sign-ups recorded a source
-- (or by a path that sent none) is 'not recorded'. The metadata is written by the visitor's
-- browser, so the label is lowercased and clipped whatever it says.
-- An invoker helper for the definers below; nobody else calls it.
create or replace function public.signup_source_label(p_meta jsonb)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when jsonb_typeof(p_meta -> 'signup_source') is distinct from 'object' then 'not recorded'
    when (p_meta -> 'signup_source' ->> 'coach_ref') = 'true' then 'coach link'
    else left(lower(coalesce(
      nullif(btrim(p_meta -> 'signup_source' ->> 'utm_source'), ''),
      nullif(btrim(p_meta -> 'signup_source' ->> 'referrer'), ''),
      case when p_meta -> 'signup_source' ->> 'surface' = 'app' then 'the app' end,
      'direct')), 60)
  end
$$;

revoke all on function public.signup_source_label(jsonb) from public, anon, authenticated;

-- ===== THE OVERVIEW'S NUMBERS =====
-- One call, one JSON document, so the page is one round trip however many numbers it shows.
-- A definer because it reads auth.users (sign-ups and sign-ins), which the API cannot.
--
-- Days are the owner's days: p_tz names the zone (an unknown one falls back to UTC rather than
-- failing the page). "7 days" is the last 7 calendar days including today in that zone, so a
-- day-keyed table (daily_health_snapshot) and a timestamp-keyed one count the same window.
--
-- What each number counts, so the page can say it plainly:
--   accounts          sign-in accounts (auth.users); new by created_at; signed in by last_sign_in_at
--   roles             profiles holding the role in roles[] or the legacy singular role
--   listings          coach listings on a real account (owner_id set), live = listing_ready;
--                     Shape's own listings (owner_id null) are counted apart
--   memberships       platform_subscriptions by status; MRR = active ones' price
--   coach_subs        coach subscriptions by status; gross = active ones' price; Shape's cut =
--                     price x fee_bps
--   purchases         one_time_purchases with status 'paid' (gross and Shape's application fee)
--   workouts          workout_sessions completed or reviewed, by when they ended
--   meal_days         daily_health_snapshot days with calories or dietary_kcal above zero
--   active            distinct accounts that did anything: earned points, logged a workout or a
--                     day, opened the app, sent a message or posted
--   applications      coach applications by status and role; new by created_at; decided by
--                     reviewed_at; the oldest still open (owner: "also track applicaitons, etc")
--   credentials       coaches' credential submissions by review_status
--   lists             the other ways in: app-launch email sign-ups, contact-form messages, coach
--                     waitlists (people waiting for a full coach), consultation bookings
--   consultations     sessions rows, which is where both a free consultation (/api/consultation)
--                     and a member's session request (/api/sessions/request) land; open = still
--                     'requested' and not yet past, upcoming = confirmed and not yet past
--   signup_sources    accounts by signup_source_label(): the 15 biggest sources over 30 days and
--                     all time, website or app, and the 10 biggest utm campaigns over 30 days
--   score             score_ledger points earned (positive rows), spent in the Store, and taken
--                     back as penalties; tiers = accounts per Score tier on the rank basis
--                     (shape_rank_points: the high-water mark of points earned, without Store
--                     purchases or tier bonuses), members and coaches apart. The tier thresholds
--                     are award_tier_bonuses' (0 / 750 / 2,000 / 5,000 / 15,000), and the names
--                     are the page's (src/lib/admin-overview.mjs).
--
-- ⚠ THE SERVICE ROLE ONLY. Supabase grants EXECUTE on a new function to anon and authenticated
-- by name, so `revoke ... from public` alone would leave every one of these numbers readable by
-- the whole internet through /rest/v1/rpc/. Revoked from all three by name.
create or replace function public.admin_overview_stats(p_tz text default 'America/New_York')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz text := coalesce(nullif(btrim(p_tz), ''), 'UTC');
  v_today date;
  v_from7 timestamptz;
  v_from30 timestamptz;
  v_out jsonb;
begin
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;
  v_today := (now() at time zone v_tz)::date;
  -- The start of the first day of each window, in the zone.
  v_from7 := (v_today - 6)::timestamp at time zone v_tz;
  v_from30 := (v_today - 29)::timestamp at time zone v_tz;

  with
  activity as (
    select user_id, earned_at as at from public.score_ledger
    union all
    select client_id, coalesce(ended_at, created_at) from public.workout_sessions
    union all
    select user_id, updated_at from public.daily_health_snapshot
    union all
    select user_id, ts from public.analytics_events where user_id is not null
    union all
    select sender_id, created_at from public.messages
    union all
    select author_id, created_at from public.community_posts
  ),
  recent as (
    select user_id, (at at time zone v_tz)::date as day
    from activity
    where user_id is not null and at >= v_from30
  ),
  days as (
    select d::date as day from generate_series(v_today - 29, v_today, interval '1 day') d
  ),
  signups as (
    select (created_at at time zone v_tz)::date as day, count(*) as n
    from auth.users where created_at >= v_from30 group by 1
  ),
  done_workouts as (
    select coalesce(ended_at, created_at) as at
    from public.workout_sessions where status in ('completed', 'reviewed')
  ),
  workouts_by_day as (
    select (at at time zone v_tz)::date as day, count(*) as n
    from done_workouts where at >= v_from30 group by 1
  ),
  ranks as (
    select public.shape_rank_points(p.id) as pts,
           ('trainer' = any(coalesce(p.roles, '{}')) or 'nutritionist' = any(coalesce(p.roles, '{}'))
            or p.role in ('trainer', 'nutritionist')) as is_coach
    from public.profiles p
  ),
  signup_src as (
    select u.created_at,
           public.signup_source_label(u.raw_user_meta_data) as source,
           case when u.raw_user_meta_data -> 'signup_source' ->> 'surface' in ('website', 'app')
                then u.raw_user_meta_data -> 'signup_source' ->> 'surface' else 'not recorded' end as surface,
           nullif(left(lower(btrim(coalesce(u.raw_user_meta_data -> 'signup_source' ->> 'utm_campaign', ''))), 60), '') as campaign
    from auth.users u
  ),
  applications_by_day as (
    select (created_at at time zone v_tz)::date as day, count(*) as n
    from public.provider_applications where created_at >= v_from30 group by 1
  ),
  active_by_day as (
    select day, count(distinct user_id) as n from recent group by 1
  )
  select jsonb_build_object(
    'generated_at', now(),
    'timezone', v_tz,
    'today', v_today,
    'accounts', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
      'new_7d', (select count(*) from auth.users where created_at >= v_from7),
      'new_30d', (select count(*) from auth.users where created_at >= v_from30),
      'signed_in_7d', (select count(*) from auth.users where last_sign_in_at >= v_from7),
      'signed_in_30d', (select count(*) from auth.users where last_sign_in_at >= v_from30)
    ),
    'roles', jsonb_build_object(
      'client', (select count(*) from public.profiles where 'client' = any(coalesce(roles, '{}')) or role = 'client'),
      'trainer', (select count(*) from public.profiles where 'trainer' = any(coalesce(roles, '{}')) or role = 'trainer'),
      'nutritionist', (select count(*) from public.profiles where 'nutritionist' = any(coalesce(roles, '{}')) or role = 'nutritionist')
    ),
    'listings', jsonb_build_object(
      'trainers_live', (select count(*) from public.trainers where owner_id is not null and listing_ready),
      'trainers_hidden', (select count(*) from public.trainers where owner_id is not null and not coalesce(listing_ready, false)),
      'nutritionists_live', (select count(*) from public.nutritionists where owner_id is not null and listing_ready),
      'nutritionists_hidden', (select count(*) from public.nutritionists where owner_id is not null and not coalesce(listing_ready, false)),
      'verified', (select count(*) from public.trainers where owner_id is not null and verified)
                + (select count(*) from public.nutritionists where owner_id is not null and verified),
      'shape_own', (select count(*) from public.trainers where owner_id is null)
                 + (select count(*) from public.nutritionists where owner_id is null)
    ),
    'applications', jsonb_build_object(
      'total', (select count(*) from public.provider_applications),
      'new_7d', (select count(*) from public.provider_applications where created_at >= v_from7),
      'new_30d', (select count(*) from public.provider_applications where created_at >= v_from30),
      'open', (select count(*) from public.provider_applications where status in ('pending', 'in_review')),
      'pending', (select count(*) from public.provider_applications where status = 'pending'),
      'in_review', (select count(*) from public.provider_applications where status = 'in_review'),
      'approved', (select count(*) from public.provider_applications where status = 'approved'),
      'rejected', (select count(*) from public.provider_applications where status = 'rejected'),
      'withdrawn', (select count(*) from public.provider_applications where status = 'withdrawn'),
      'open_trainer', (select count(*) from public.provider_applications where status in ('pending', 'in_review') and provider_type = 'trainer'),
      'open_nutritionist', (select count(*) from public.provider_applications where status in ('pending', 'in_review') and provider_type = 'nutritionist'),
      'approved_30d', (select count(*) from public.provider_applications where status = 'approved' and reviewed_at >= v_from30),
      'rejected_30d', (select count(*) from public.provider_applications where status = 'rejected' and reviewed_at >= v_from30),
      'oldest_open_at', (select min(created_at) from public.provider_applications where status in ('pending', 'in_review'))
    ),
    'consultations', jsonb_build_object(
      'open', (select count(*) from public.sessions where status = 'requested' and scheduled_at >= now()),
      'requested_7d', (select count(*) from public.sessions where created_at >= v_from7),
      'requested_30d', (select count(*) from public.sessions where created_at >= v_from30),
      'upcoming', (select count(*) from public.sessions where status = 'confirmed' and scheduled_at >= now()),
      'completed_30d', (select count(*) from public.sessions where status = 'completed' and scheduled_at >= v_from30),
      'declined_30d', (select count(*) from public.sessions where status = 'declined' and created_at >= v_from30),
      'cancelled_30d', (select count(*) from public.sessions where status = 'cancelled' and created_at >= v_from30),
      'expired_open', (select count(*) from public.sessions where status = 'requested' and scheduled_at < now())
    ),
    'score', jsonb_build_object(
      'earned_7d', (select coalesce(sum(delta), 0) from public.score_ledger where delta > 0 and earned_at >= v_from7),
      'earned_30d', (select coalesce(sum(delta), 0) from public.score_ledger where delta > 0 and earned_at >= v_from30),
      'earned_all', (select coalesce(sum(delta), 0) from public.score_ledger where delta > 0),
      'spent_store_all', (select coalesce(-sum(delta), 0) from public.score_ledger where delta < 0 and source_kind = 'store_redeem'),
      'penalties_30d', (select coalesce(-sum(delta), 0) from public.score_ledger
                        where delta < 0 and coalesce(source_kind, '') <> 'store_redeem' and earned_at >= v_from30),
      'earners_30d', (select count(distinct user_id) from public.score_ledger where delta > 0 and earned_at >= v_from30),
      'by_category_30d', (select coalesce(jsonb_object_agg(category, pts), '{}'::jsonb) from (
                            select category, sum(delta) as pts from public.score_ledger
                            where delta > 0 and earned_at >= v_from30 group by category) c),
      'member_tiers', (select jsonb_build_array(
                         count(*) filter (where pts < 750),
                         count(*) filter (where pts >= 750 and pts < 2000),
                         count(*) filter (where pts >= 2000 and pts < 5000),
                         count(*) filter (where pts >= 5000 and pts < 15000),
                         count(*) filter (where pts >= 15000)) from ranks where not is_coach),
      'coach_tiers', (select jsonb_build_array(
                        count(*) filter (where pts < 750),
                        count(*) filter (where pts >= 750 and pts < 2000),
                        count(*) filter (where pts >= 2000 and pts < 5000),
                        count(*) filter (where pts >= 5000 and pts < 15000),
                        count(*) filter (where pts >= 15000)) from ranks where is_coach)
    ),
    'signup_sources', jsonb_build_object(
      'sources_30d', (select coalesce(jsonb_agg(jsonb_build_object('source', x.source, 'count', x.n) order by x.n desc, x.source), '[]'::jsonb)
                      from (select source, count(*) as n from signup_src where created_at >= v_from30
                            group by source order by count(*) desc, source limit 15) x),
      'sources_all', (select coalesce(jsonb_agg(jsonb_build_object('source', x.source, 'count', x.n) order by x.n desc, x.source), '[]'::jsonb)
                      from (select source, count(*) as n from signup_src group by source order by count(*) desc, source limit 15) x),
      'surface_30d', (select coalesce(jsonb_object_agg(x.surface, x.n), '{}'::jsonb)
                      from (select surface, count(*) as n from signup_src where created_at >= v_from30 group by surface) x),
      'surface_all', (select coalesce(jsonb_object_agg(x.surface, x.n), '{}'::jsonb)
                      from (select surface, count(*) as n from signup_src group by surface) x),
      'campaigns_30d', (select coalesce(jsonb_agg(jsonb_build_object('campaign', x.campaign, 'count', x.n) order by x.n desc, x.campaign), '[]'::jsonb)
                        from (select campaign, count(*) as n from signup_src where created_at >= v_from30 and campaign is not null
                              group by campaign order by count(*) desc, campaign limit 10) x)
    ),
    'credentials', jsonb_build_object(
      'pending', (select count(*) from public.provider_credentials where review_status = 'pending'),
      'approved', (select count(*) from public.provider_credentials where review_status = 'approved'),
      'changes_requested', (select count(*) from public.provider_credentials where review_status = 'changes_requested'),
      'rejected', (select count(*) from public.provider_credentials where review_status = 'rejected')
    ),
    'lists', jsonb_build_object(
      'app_launch_all', (select count(*) from public.app_launch_notifications),
      'app_launch_30d', (select count(*) from public.app_launch_notifications where created_at >= v_from30),
      'contact_all', (select count(*) from public.contact_submissions),
      'contact_30d', (select count(*) from public.contact_submissions where created_at >= v_from30),
      'waitlist_waiting', (select count(*) from public.coach_waitlist where status = 'waiting'),
      'waitlist_30d', (select count(*) from public.coach_waitlist where created_at >= v_from30),
      'consultations_30d', (select count(*) from public.consultation_bookings where created_at >= v_from30),
      'help_30d', (select count(*) from public.support_requests where created_at >= v_from30)
    ),
    'memberships', jsonb_build_object(
      'active', (select count(*) from public.platform_subscriptions where status = 'active'),
      'trialing', (select count(*) from public.platform_subscriptions where status = 'trialing'),
      'past_due', (select count(*) from public.platform_subscriptions where status in ('past_due', 'unpaid')),
      'canceled', (select count(*) from public.platform_subscriptions where status = 'canceled'),
      'new_30d', (select count(*) from public.platform_subscriptions where created_at >= v_from30),
      'mrr_cents', (select coalesce(sum(price_cents), 0) from public.platform_subscriptions where status = 'active')
    ),
    'coach_subs', jsonb_build_object(
      'active', (select count(*) from public.subscriptions where status = 'active'),
      'past_due', (select count(*) from public.subscriptions where status in ('past_due', 'unpaid')),
      'gross_mrr_cents', (select coalesce(sum(price_cents), 0) from public.subscriptions where status = 'active'),
      'shape_mrr_cents', (select coalesce(sum(round(coalesce(price_cents, 0) * coalesce(fee_bps, 0) / 10000.0)), 0)::bigint
                          from public.subscriptions where status = 'active')
    ),
    'purchases', jsonb_build_object(
      'paid_30d', (select count(*) from public.one_time_purchases where status = 'paid' and created_at >= v_from30),
      'gross_30d_cents', (select coalesce(sum(price_cents), 0) from public.one_time_purchases where status = 'paid' and created_at >= v_from30),
      'shape_30d_cents', (select coalesce(sum(application_fee_cents), 0) from public.one_time_purchases where status = 'paid' and created_at >= v_from30),
      'paid_all', (select count(*) from public.one_time_purchases where status = 'paid'),
      'gross_all_cents', (select coalesce(sum(price_cents), 0) from public.one_time_purchases where status = 'paid'),
      'shape_all_cents', (select coalesce(sum(application_fee_cents), 0) from public.one_time_purchases where status = 'paid')
    ),
    'activity', jsonb_build_object(
      'active_7d', (select count(distinct user_id) from recent where day >= v_today - 6),
      'active_30d', (select count(distinct user_id) from recent),
      'workouts_7d', (select count(*) from done_workouts where at >= v_from7),
      'workouts_30d', (select count(*) from done_workouts where at >= v_from30),
      'workouts_all', (select count(*) from done_workouts),
      'meal_days_7d', (select count(*) from public.daily_health_snapshot
                       where snapshot_date >= v_today - 6 and (coalesce(calories, 0) > 0 or coalesce(dietary_kcal, 0) > 0)),
      'meal_days_30d', (select count(*) from public.daily_health_snapshot
                        where snapshot_date >= v_today - 29 and (coalesce(calories, 0) > 0 or coalesce(dietary_kcal, 0) > 0)),
      'checkins_30d', (select count(*) from public.client_checkins where created_at >= v_from30),
      'posts_30d', (select count(*) from public.community_posts where created_at >= v_from30),
      'messages_30d', (select count(*) from public.messages where created_at >= v_from30),
      'points_30d', (select coalesce(sum(delta), 0) from public.score_ledger where delta > 0 and earned_at >= v_from30)
    ),
    'queues', jsonb_build_object(
      'help_open', (select count(*) from public.support_requests where status = 'open'),
      'refunds_pending', (select count(*) from public.refund_requests where status = 'pending'),
      'credentials_pending', (select count(*) from public.provider_credentials where review_status = 'pending')
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day,
        'signups', coalesce(s.n, 0),
        'active', coalesce(a.n, 0),
        'workouts', coalesce(w.n, 0),
        'applications', coalesce(ap.n, 0)
      ) order by d.day), '[]'::jsonb)
      from days d
      left join signups s on s.day = d.day
      left join active_by_day a on a.day = d.day
      left join workouts_by_day w on w.day = d.day
      left join applications_by_day ap on ap.day = d.day
    )
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.admin_overview_stats(text) from public, anon, authenticated;
grant execute on function public.admin_overview_stats(text) to service_role;

-- ===== EACH COACH'S PROGRESS =====
-- One row per coach listing on a real account (a coach holding both roles has two rows), for the
-- console's Coaches page. Rolling windows (now() minus 7 or 30 days). Reads auth.users for the
-- coach's email and last sign-in, hence a definer; the service role only, like the Overview.
-- A review belongs to a coach by owner_id and coach_kind; a client by an active subscription to
-- that listing; a consultation or session by sessions' provider role and id.
create or replace function public.admin_coach_stats()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with listings as (
    select 'trainer'::text as role, t.id, t.name, t.owner_id, t.created_at, t.listing_ready, t.verified, t.stripe_account_status
    from public.trainers t where t.owner_id is not null
    union all
    select 'nutritionist'::text, n.id, n.name, n.owner_id, n.created_at, n.listing_ready, n.verified, n.stripe_account_status
    from public.nutritionists n where n.owner_id is not null
  )
  select coalesce(jsonb_agg(c.doc order by c.doc->>'name', c.doc->>'role'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'role', l.role,
      'listing_id', l.id,
      'name', coalesce(nullif(btrim(l.name), ''), p.full_name, u.email),
      'owner_id', l.owner_id,
      'email', u.email,
      'listed_at', l.created_at,
      'last_sign_in_at', u.last_sign_in_at,
      'live', coalesce(l.listing_ready, false),
      'verified', coalesce(l.verified, false),
      'payouts', l.stripe_account_status,
      'clients_active', (select count(*) from public.subscriptions s
                         where s.provider_role = l.role and s.provider_id = l.id and s.status = 'active'),
      'clients_ever', (select count(distinct s.client_id) from public.subscriptions s
                       where s.provider_role = l.role and s.provider_id = l.id),
      'gross_mrr_cents', (select coalesce(sum(s.price_cents), 0) from public.subscriptions s
                          where s.provider_role = l.role and s.provider_id = l.id and s.status = 'active'),
      'shape_mrr_cents', (select coalesce(sum(round(coalesce(s.price_cents, 0) * coalesce(s.fee_bps, 0) / 10000.0)), 0)::bigint
                          from public.subscriptions s
                          where s.provider_role = l.role and s.provider_id = l.id and s.status = 'active'),
      'purchases_paid', (select count(*) from public.one_time_purchases o
                         where o.provider_role = l.role and o.provider_id = l.id and o.status = 'paid'),
      'purchases_gross_cents', (select coalesce(sum(o.price_cents), 0) from public.one_time_purchases o
                                where o.provider_role = l.role and o.provider_id = l.id and o.status = 'paid'),
      'consults_open', (select count(*) from public.sessions x
                        where x.provider_role = l.role and x.provider_id = l.id and x.status = 'requested' and x.scheduled_at >= now()),
      'consults_30d', (select count(*) from public.sessions x
                       where x.provider_role = l.role and x.provider_id = l.id and x.created_at >= now() - interval '30 days'),
      'sessions_done_30d', (select count(*) from public.sessions x
                            where x.provider_role = l.role and x.provider_id = l.id and x.status = 'completed'
                              and x.scheduled_at >= now() - interval '30 days'),
      'sessions_upcoming', (select count(*) from public.sessions x
                            where x.provider_role = l.role and x.provider_id = l.id and x.status = 'confirmed' and x.scheduled_at >= now()),
      'reviews', (select count(*) from public.coach_reviews r where r.owner_id = l.owner_id and r.coach_kind = l.role),
      'rating', (select round(avg(r.rating)::numeric, 1) from public.coach_reviews r where r.owner_id = l.owner_id and r.coach_kind = l.role),
      'waitlist', (select count(*) from public.coach_waitlist w
                   where w.provider_role = l.role and w.provider_id = l.id and w.status = 'waiting'),
      'assigned_30d', case l.role
        when 'trainer' then (select count(*) from public.client_workouts cw where cw.trainer_id = l.id and cw.created_at >= now() - interval '30 days')
        else (select count(*) from public.client_meal_plans mp where mp.nutritionist_id = l.id and mp.created_at >= now() - interval '30 days')
      end,
      'catalog', case l.role
        when 'trainer' then (select count(*) from public.trainer_workouts tw where tw.trainer_id = l.id)
        else (select count(*) from public.nutritionist_plans np where np.nutritionist_id = l.id)
      end,
      'client_workouts_30d', (select count(*) from public.workout_sessions ws
                              where ws.provider_role = l.role and ws.provider_id = l.id and ws.status in ('completed', 'reviewed')
                                and coalesce(ws.ended_at, ws.created_at) >= now() - interval '30 days'),
      'messages_30d', (select count(*) from public.messages m where m.sender_id = l.owner_id and m.created_at >= now() - interval '30 days'),
      'rank_points', public.shape_rank_points(l.owner_id)
    ) as doc
    from listings l
    left join auth.users u on u.id = l.owner_id
    left join public.profiles p on p.id = l.owner_id
  ) c
$$;

revoke all on function public.admin_coach_stats() from public, anon, authenticated;
grant execute on function public.admin_coach_stats() to service_role;

-- ===== EACH MEMBER'S PROGRESS =====
-- One row per account holding the member role, for the console's Members page: membership,
-- coaches, and how much they do. COUNTS ONLY: no weights, sleep, heart rate or any other health
-- value leaves the database through this. Rolling windows (now() minus 7 or 30 days).
--
-- p_search narrows by email or name (a plain substring, never a pattern); p_sort is one of
-- 'active' (most recently active first, the default), 'joined', 'points' or 'workouts'; p_limit
-- is 1 to 500. Every matching account is measured before the sort, so the page's cost grows
-- with the member count; a search narrows it.
create or replace function public.admin_member_stats(p_search text default null, p_sort text default 'active', p_limit integer default 200)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with q as (
    select lower(btrim(coalesce(p_search, ''))) as term,
           case when p_sort in ('active', 'joined', 'points', 'workouts') then p_sort else 'active' end as sort,
           least(greatest(coalesce(p_limit, 200), 1), 500) as lim
  ),
  base as (
    select p.id, p.full_name, p.roles, p.role, u.email, u.created_at, u.last_sign_in_at,
           public.signup_source_label(u.raw_user_meta_data) as source
    from public.profiles p
    join auth.users u on u.id = p.id
    cross join q
    where ('client' = any(coalesce(p.roles, '{}')) or p.role = 'client')
      and (q.term = '' or position(q.term in lower(coalesce(u.email, ''))) > 0
                       or position(q.term in lower(coalesce(p.full_name, ''))) > 0)
  ),
  measured as (
    select b.*,
      (select ps.status from public.platform_subscriptions ps where ps.client_id = b.id
       order by ps.current_period_end desc nulls last, ps.created_at desc limit 1) as membership,
      (select count(*) from public.subscriptions s where s.client_id = b.id and s.status = 'active') as coaches,
      (select count(*) from public.workout_sessions ws where ws.client_id = b.id and ws.status in ('completed', 'reviewed')
         and coalesce(ws.ended_at, ws.created_at) >= now() - interval '7 days') as workouts_7d,
      (select count(*) from public.workout_sessions ws where ws.client_id = b.id and ws.status in ('completed', 'reviewed')
         and coalesce(ws.ended_at, ws.created_at) >= now() - interval '30 days') as workouts_30d,
      (select count(*) from public.workout_sessions ws where ws.client_id = b.id and ws.status in ('completed', 'reviewed')) as workouts_all,
      (select count(*) from public.daily_health_snapshot d where d.user_id = b.id and d.snapshot_date >= current_date - 29
         and (coalesce(d.calories, 0) > 0 or coalesce(d.dietary_kcal, 0) > 0)) as meal_days_30d,
      (select count(*) from public.client_checkins c where c.user_id = b.id and c.created_at >= now() - interval '30 days') as checkins_30d,
      (select count(*) from public.sessions x where x.client_id = b.id and x.created_at >= now() - interval '30 days') as consults_30d,
      (select coalesce(sum(l.delta), 0) from public.score_ledger l where l.user_id = b.id and l.delta > 0
         and l.earned_at >= now() - interval '30 days') as points_30d,
      public.shape_rank_points(b.id) as rank_points,
      greatest(
        (select max(l.earned_at) from public.score_ledger l where l.user_id = b.id),
        (select max(coalesce(ws.ended_at, ws.created_at)) from public.workout_sessions ws where ws.client_id = b.id),
        (select max(d.updated_at) from public.daily_health_snapshot d where d.user_id = b.id),
        (select max(e.ts) from public.analytics_events e where e.user_id = b.id),
        (select max(m.created_at) from public.messages m where m.sender_id = b.id)
      ) as last_active
    from base b
  ),
  picked as (
    select m.* from measured m, q
    order by
      case when q.sort = 'joined' then m.created_at end desc nulls last,
      case when q.sort = 'points' then m.rank_points end desc nulls last,
      case when q.sort = 'workouts' then m.workouts_30d end desc nulls last,
      m.last_active desc nulls last,
      m.created_at desc
    limit (select lim from q)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'email', p.email, 'name', p.full_name,
      'coach_roles', ('trainer' = any(coalesce(p.roles, '{}')) or 'nutritionist' = any(coalesce(p.roles, '{}'))
                      or p.role in ('trainer', 'nutritionist')),
      'joined', p.created_at, 'last_sign_in_at', p.last_sign_in_at, 'last_active', p.last_active,
      'membership', p.membership, 'coaches', p.coaches, 'source', p.source,
      'workouts_7d', p.workouts_7d, 'workouts_30d', p.workouts_30d, 'workouts_all', p.workouts_all,
      'meal_days_30d', p.meal_days_30d, 'checkins_30d', p.checkins_30d, 'consults_30d', p.consults_30d,
      'points_30d', p.points_30d, 'rank_points', p.rank_points
    )) from picked p), '[]'::jsonb)
  )
$$;

revoke all on function public.admin_member_stats(text, text, integer) from public, anon, authenticated;
grant execute on function public.admin_member_stats(text, text, integer) to service_role;

-- ===== UPCOMING BIRTHDAYS AND ANNIVERSARIES =====
-- Owner, 2026-10-13: "lets track all shape members birthdays, keep tabs to send something nice
-- maybe" and "also shape member anniversieries". Within p_days (1 to 366) of today in p_tz,
-- soonest first:
--   birthdays      everyone with a date of birth on their profile (given at sign-up for the 18+
--                  check). MONTH AND DAY ONLY: the birth year, and so the age, never leaves the
--                  database through this. 'next' is the coming birthday, not the date of birth.
--   anniversaries  every account's yearly date of joining Shape (its sign-up, in p_tz), from the
--                  first full year on, with how many years it marks.
-- A 29 February date is kept on 28 February in a year without one.
--
-- ⚠ A NEW USE OF THE DATE OF BIRTH. It was collected to verify age; using it to mark birthdays
-- is a purpose the privacy policy should name. The owner's to word, not this file's.
create or replace function public.admin_upcoming_celebrations(p_tz text default 'America/New_York', p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz text := coalesce(nullif(btrim(p_tz), ''), 'UTC');
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 366);
  v_today date;
  v_birthdays jsonb;
  v_anniversaries jsonb;
begin
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;
  v_today := (now() at time zone v_tz)::date;

  -- The coming occurrence (this year's or next year's) of a month and day.
  with people as (
    select p.id, p.full_name, p.roles, p.role, u.email,
           p.date_of_birth,
           (u.created_at at time zone v_tz)::date as joined,
           ('trainer' = any(coalesce(p.roles, '{}')) or 'nutritionist' = any(coalesce(p.roles, '{}'))
            or p.role in ('trainer', 'nutritionist')) as coach
    from public.profiles p
    join auth.users u on u.id = p.id
  ),
  dates as (
    select pe.*, k.kind, k.m, k.d,
      (select min(x.day) from (
         select case when k.m = 2 and k.d = 29 and not ((y.y % 4 = 0 and y.y % 100 <> 0) or y.y % 400 = 0)
                     then make_date(y.y, 2, 28) else make_date(y.y, k.m, k.d) end as day
         from (values (extract(year from v_today)::int), (extract(year from v_today)::int + 1)) as y(y)
       ) x where x.day >= v_today and (k.kind = 'birthday' or x.day > pe.joined)) as next_day
    from people pe
    cross join lateral (
      select 'birthday'::text as kind, extract(month from pe.date_of_birth)::int as m, extract(day from pe.date_of_birth)::int as d
      where pe.date_of_birth is not null
      union all
      select 'anniversary', extract(month from pe.joined)::int, extract(day from pe.joined)::int
    ) k
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
        'id', dt.id, 'name', dt.full_name, 'email', dt.email, 'coach', dt.coach,
        'month', dt.m, 'day', dt.d, 'next', dt.next_day, 'days_until', dt.next_day - v_today
      ) order by dt.next_day, dt.full_name) filter (where dt.kind = 'birthday'), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object(
        'id', dt.id, 'name', dt.full_name, 'email', dt.email, 'coach', dt.coach,
        'joined', dt.joined, 'next', dt.next_day, 'days_until', dt.next_day - v_today,
        'years', extract(year from dt.next_day)::int - extract(year from dt.joined)::int
      ) order by dt.next_day, dt.full_name) filter (where dt.kind = 'anniversary'), '[]'::jsonb)
  into v_birthdays, v_anniversaries
  from dates dt
  where dt.next_day - v_today < v_days
    and (dt.kind = 'birthday' or extract(year from dt.next_day)::int - extract(year from dt.joined)::int >= 1);

  return jsonb_build_object('today', v_today, 'timezone', v_tz, 'days', v_days,
                            'birthdays', v_birthdays, 'anniversaries', v_anniversaries);
end;
$$;

revoke all on function public.admin_upcoming_celebrations(text, integer) from public, anon, authenticated;
grant execute on function public.admin_upcoming_celebrations(text, integer) to service_role;

-- ===== GUARD =====
-- Fails the run, and so rolls the whole file back, if it finds the tables open to the API or the
-- function executable by anyone but the service role.
do $$
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('staff_members', 'admin_activity_log') and not c.relrowsecurity
  ) then
    raise exception 'staff tables must have row level security on';
  end if;
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename in ('staff_members', 'admin_activity_log')
  ) then
    raise exception 'staff tables must have no policies (service role only)';
  end if;
  if has_function_privilege('anon', 'public.admin_overview_stats(text)', 'execute')
     or has_function_privilege('authenticated', 'public.admin_overview_stats(text)', 'execute')
     or has_function_privilege('anon', 'public.admin_coach_stats()', 'execute')
     or has_function_privilege('authenticated', 'public.admin_coach_stats()', 'execute')
     or has_function_privilege('anon', 'public.admin_member_stats(text, text, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.admin_member_stats(text, text, integer)', 'execute')
     or has_function_privilege('anon', 'public.admin_upcoming_celebrations(text, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.admin_upcoming_celebrations(text, integer)', 'execute') then
    raise exception 'the admin stats functions must be executable by the service role only';
  end if;
  if has_function_privilege('anon', 'public.signup_source_label(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.signup_source_label(jsonb)', 'execute') then
    raise exception 'signup_source_label is a helper for the admin functions only';
  end if;
  if has_table_privilege('anon', 'public.staff_members', 'select')
     or has_table_privilege('authenticated', 'public.staff_members', 'select')
     or has_table_privilege('anon', 'public.admin_activity_log', 'select')
     or has_table_privilege('authenticated', 'public.admin_activity_log', 'select') then
    raise exception 'staff tables must not be readable by anon or authenticated';
  end if;
end;
$$;

commit;
