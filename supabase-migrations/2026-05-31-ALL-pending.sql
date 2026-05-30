-- ============================================================================
-- Shape — ALL session migrations, bundled in dependency order (through 05-31).
-- Paste into the Supabase SQL editor and Run once. Idempotent (safe to re-run
-- even if some pieces are already applied). Order matters: the notifications
-- table is created before its triggers; calendar-events depends on
-- is_coach_on_client() from 2026-05-26-shared-clients.sql (already applied).
-- ============================================================================


-- ===== 2026-05-29-provider-rls-hardening.sql =====

-- 2026-05-29 — Provider-dashboard RLS hardening
--
-- Audit follow-up to the 2026-04-14 owner_id work. Two changes, both safe
-- and idempotent:
--
--   1. Provider read on public.profiles (subscriber names).
--      The trainer/nutritionist dashboards + analytics read a subscriber's
--      display name from public.profiles (select id, full_name … in clientIds).
--      Every OTHER table a provider reads — subscriptions, sessions,
--      daily_health_snapshot, client_profiles — has a policy that chains
--      provider access through owner_id = auth.uid(); public.profiles did
--      not. This adds the same subscription-scoped read policy so the roster
--      resolves real names AND the access is properly scoped (rather than
--      depending on a possibly-overbroad blanket read).
--
--      IMPORTANT: we deliberately do NOT run `alter table … enable row level
--      security` on profiles. If RLS is currently disabled there, enabling it
--      here would instantly revoke everyone's existing access (including a
--      user reading their own profile) and break sign-in. Creating a policy
--      while RLS is disabled is a harmless no-op; if RLS is (or later gets)
--      enabled, this policy is already in place. Toggling RLS on profiles, if
--      desired, should be a separate, deliberate migration that also ships the
--      "user reads own profile" + public-display policies.
--
--   2. Tighten provider_update_sessions WITH CHECK.
--      The original policy (2026-04-18) used `with check (true)`, so a provider
--      updating one of their own sessions could rewrite ownership columns
--      (provider_id / client_id) to arbitrary values. The USING clause already
--      restricts WHICH rows can be updated to the provider's own; mirroring it
--      in WITH CHECK ensures the row still belongs to that provider AFTER the
--      update. The app only ever updates status / meeting_url / notes, so this
--      does not affect any legitimate write.
--
-- Safe to re-run.

-- ===== 1. profiles: providers read their subscribers' rows =====

drop policy if exists "providers_read_subscriber_profiles_base" on public.profiles;
create policy "providers_read_subscriber_profiles_base"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.subscriptions s
      left join public.trainers t
        on t.id = s.provider_id and s.provider_role = 'trainer'
      left join public.nutritionists n
        on n.id = s.provider_id and s.provider_role = 'nutritionist'
      where s.client_id = profiles.id
        and s.status in ('active','trialing')
        and (t.owner_id = auth.uid() or n.owner_id = auth.uid())
    )
  );

-- ===== 2. sessions: providers can only keep their own rows on update =====

drop policy if exists "provider_update_sessions" on public.sessions;
create policy "provider_update_sessions"
  on public.sessions for update
  to authenticated
  using (
    (provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = sessions.provider_id and t.owner_id = auth.uid()
    ))
    or
    (provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = sessions.provider_id and n.owner_id = auth.uid()
    ))
  )
  with check (
    (provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = sessions.provider_id and t.owner_id = auth.uid()
    ))
    or
    (provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = sessions.provider_id and n.owner_id = auth.uid()
    ))
  );

-- ===== 2026-05-30-notifications.sql =====

-- In-app notifications.
--
-- A generic per-user notification feed: booking requests, session confirms,
-- new messages, coach pushes, etc. Rows are created server-side (service role)
-- by whatever event produced them — e.g. a client booking a session inserts a
-- notification for the coach, who is NOT the actor, so inserts bypass RLS.
-- Each user reads / marks-read / deletes only their own rows.
--
-- Added to the supabase_realtime publication so the app's bell updates live.
-- Idempotent, safe to re-run.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  type text not null default 'general',
  title text not null,
  body text not null default '',
  route text,                       -- in-app destination, e.g. 'sessions'
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id, read_at);

alter table public.notifications enable row level security;

-- Owner-only read / update (mark read) / delete. No insert policy: rows are
-- written by the service-role client from server routes (the actor is usually
-- not the recipient), which bypasses RLS.
drop policy if exists "notifications_read_own" on public.notifications;
create policy "notifications_read_own"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications for delete
  to authenticated
  using (user_id = auth.uid());

-- Live updates for the in-app bell.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ===== 2026-05-30-message-notifications.sql =====

-- Notify the recipient on every new chat message.
--
-- Done as an AFTER INSERT trigger on public.messages so it fires no matter how
-- the message was sent (website API, mobile direct insert, etc.) — one code
-- path can't be missed. SECURITY DEFINER so it can write the notification row
-- regardless of the sender's RLS.
--
-- Recipient = the other party on the conversation: if the sender is the client,
-- it's the coach (provider owner); otherwise it's the client. Requires the
-- notifications table (2026-05-30-notifications.sql). Idempotent.

create or replace function public.notify_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv record;
  recipient uuid;
begin
  select client_id, provider_role, provider_id
    into conv
    from public.conversations
   where id = new.conversation_id;
  if not found then
    return new;
  end if;

  if conv.client_id is not null and conv.client_id = new.sender_id then
    -- Client sent it → notify the coach (provider owner).
    if conv.provider_role = 'trainer' then
      select owner_id into recipient from public.trainers where id = conv.provider_id;
    elsif conv.provider_role = 'nutritionist' then
      select owner_id into recipient from public.nutritionists where id = conv.provider_id;
    end if;
  else
    -- Coach (or other) sent it → notify the client.
    recipient := conv.client_id;
  end if;

  if recipient is null or recipient = new.sender_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, route, data)
  values (
    recipient,
    'message',
    'New message',
    left(coalesce(new.body, ''), 80),
    'messages',
    jsonb_build_object('conversationId', new.conversation_id)
  );
  return new;
end;
$$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_on_new_message();

-- ===== 2026-05-30-coach-content-notifications.sql =====

-- Notify a client when their coach sends them content:
--   * client_workouts            → new workout assigned
--   * coach_program_assignments  → new training program / meal plan
--   * coach_pushed_items         → pushed meal (feeds grocery list) / exercise
--
-- AFTER INSERT triggers so they fire regardless of which path created the row
-- (web API or mobile direct insert). SECURITY DEFINER to write the notification
-- regardless of the actor's RLS. The notifications table is already on the
-- supabase_realtime publication, so these surface as a live toast + feed item.
-- Requires 2026-05-30-notifications.sql. Idempotent, safe to re-run.

-- ===== Workout assigned =====
create or replace function public.notify_on_client_workout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'published' then
    return new;
  end if;
  insert into public.notifications (user_id, type, title, body, route, data)
  values (new.client_id, 'workout', 'New workout from your coach',
          coalesce(new.title, ''), 'train', jsonb_build_object('workoutId', new.id));
  return new;
end;
$$;

drop trigger if exists client_workouts_notify on public.client_workouts;
create trigger client_workouts_notify
  after insert on public.client_workouts
  for each row execute function public.notify_on_client_workout();

-- ===== Program / meal-plan assigned =====
create or replace function public.notify_on_program_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ttl text;
  is_meal boolean := (new.provider_role = 'nutritionist');
begin
  select title into ttl from public.coach_program_templates where id = new.program_template_id;
  insert into public.notifications (user_id, type, title, body, route, data)
  values (
    new.client_id,
    case when is_meal then 'meal_plan' else 'program' end,
    case when is_meal then 'New meal plan from your coach' else 'New training program from your coach' end,
    coalesce(ttl, ''),
    case when is_meal then 'eat' else 'train' end,
    jsonb_build_object('assignmentId', new.id)
  );
  return new;
end;
$$;

drop trigger if exists coach_program_assignments_notify on public.coach_program_assignments;
create trigger coach_program_assignments_notify
  after insert on public.coach_program_assignments
  for each row execute function public.notify_on_program_assignment();

-- ===== Pushed item (meal → grocery, or exercise) =====
-- coach_pushed_items.client_id is text (it also backs demo ids), so only notify
-- when it's a real auth uuid.
create or replace function public.notify_on_pushed_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  if new.client_id !~ '^[0-9a-fA-F-]{36}$' then
    return new;
  end if;
  uid := new.client_id::uuid;
  if new.kind = 'meal' then
    insert into public.notifications (user_id, type, title, body, route, data)
    values (uid, 'grocery', 'New meal + grocery items',
            coalesce(new.payload->>'name', ''), 'eat', jsonb_build_object('itemId', new.id));
  else
    insert into public.notifications (user_id, type, title, body, route, data)
    values (uid, 'workout', 'New exercise from your coach',
            coalesce(new.payload->>'name', ''), 'train', jsonb_build_object('itemId', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists coach_pushed_items_notify on public.coach_pushed_items;
create trigger coach_pushed_items_notify
  after insert on public.coach_pushed_items
  for each row execute function public.notify_on_pushed_item();

-- ===== 2026-05-30-push-tokens.sql =====

-- Device push tokens for system notifications (app closed / phone locked).
--
-- One row per (user, device token). The mobile app registers its token on
-- launch via /api/push/register; a Supabase Database Webhook on notifications
-- INSERT calls /api/push/dispatch, which looks up the recipient's tokens here
-- and sends an FCM push. Owner-only RLS; the dispatch path reads via service
-- role. Idempotent.

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  token text not null,
  platform text not null default 'unknown' check (platform in ('ios','android','web','unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token)
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_rw_own" on public.push_tokens;
create policy "push_tokens_rw_own"
  on public.push_tokens for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ===== 2026-05-30-activities.sql =====

-- Per-activity log that PRESERVES the activity type.
--
-- Today, synced activities (Strava/WHOOP) keep their type only as a community
-- post, while the daily snapshot collapses everything into "workout minutes" —
-- so a tennis match and a long run look identical in Progress/analytics. This
-- table keeps one typed row per activity (tennis, pilates, rowing, golf,
-- stairmaster, run, ride, …) so it can be broken out by type later.
--
-- Sources: 'strava' | 'whoop' | 'apple' | 'garmin' | 'manual'. The unique
-- (user_id, source, external_id) makes device sync idempotent; manual rows
-- carry a null external_id (nulls don't collide in a unique index). Owner RLS
-- + provider read for active subscribers (mirrors daily_health_snapshot).
-- Idempotent, safe to re-run.

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  source text not null default 'manual'
    check (source in ('strava','whoop','apple','garmin','manual')),
  external_id text,
  activity_type text not null default 'workout',
  title text,
  started_at timestamptz,
  duration_min integer,
  distance_km numeric,
  calories integer,
  avg_hr integer,
  strain numeric,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);

create index if not exists activities_user_idx
  on public.activities (user_id, started_at desc);
create index if not exists activities_type_idx
  on public.activities (user_id, activity_type, started_at desc);

alter table public.activities enable row level security;

drop policy if exists "activities_rw_own" on public.activities;
create policy "activities_rw_own"
  on public.activities for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Providers can read their active/trialing subscribers' activities.
drop policy if exists "activities_provider_read" on public.activities;
create policy "activities_provider_read"
  on public.activities for select
  to authenticated
  using (
    exists (
      select 1
      from public.subscriptions s
      left join public.trainers t
        on t.id = s.provider_id and s.provider_role = 'trainer'
      left join public.nutritionists n
        on n.id = s.provider_id and s.provider_role = 'nutritionist'
      where s.client_id = activities.user_id
        and s.status in ('active','trialing')
        and (t.owner_id = auth.uid() or n.owner_id = auth.uid())
    )
  );

-- ===== 2026-05-31-calendar-events.sql =====

-- Per-user calendar events — the shared backing store for the website
-- (newdesign CalendarOverlay) and the mobile app (BSCalendarScreen). Both
-- front-ends read/write the same rows via /api/calendar, so they stay in sync.
--
-- An event belongs to a user (user_id). It may be created by that user OR by a
-- coach who has an active subscription to them (created_by + created_by_role),
-- e.g. a trainer scheduling a workout on a client's Tuesday.
--
-- Coaching SESSIONS (the sessions table) are NOT duplicated here — the API
-- merges them in read-only. This table is for everything else: planned
-- workouts, meals, check-ins, reminders, rest days, milestones, etc.
--
-- Reuses is_coach_on_client(uuid) from 2026-05-26-shared-clients.sql.
-- Idempotent, safe to re-run.

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  created_by uuid references auth.users on delete set null,
  created_by_role text not null default 'self'
    check (created_by_role in ('self','trainer','nutritionist')),
  -- WORKOUT | MEAL | CHECKIN | SESSION | CONSULT | REVIEW | PLAN | ADMIN | REST
  kind text not null default 'ADMIN',
  title text not null,
  sub text,
  event_date date not null,
  event_time text,                 -- 'HH:MM' (24h) or null for all-day
  duration_min integer,
  with_name text,                  -- "with" — coach/partner display name
  location text,
  accent text,                     -- optional UI color hint
  status text not null default 'planned'
    check (status in ('planned','done','skipped','cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_events_user_date_idx
  on public.calendar_events (user_id, event_date);
create index if not exists calendar_events_creator_idx
  on public.calendar_events (created_by, event_date);

alter table public.calendar_events enable row level security;

-- ===== Read: the owner, or a coach active on the owner =====
drop policy if exists "calendar_events_read" on public.calendar_events;
create policy "calendar_events_read"
  on public.calendar_events for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_coach_on_client(user_id)
  );

-- ===== Insert: on your own calendar, or on an active client's =====
-- created_by must be the caller; created_by_role distinguishes self vs coach.
drop policy if exists "calendar_events_insert" on public.calendar_events;
create policy "calendar_events_insert"
  on public.calendar_events for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      user_id = auth.uid()
      or public.is_coach_on_client(user_id)
    )
  );

-- ===== Update: the owner, or a coach active on the owner =====
drop policy if exists "calendar_events_update" on public.calendar_events;
create policy "calendar_events_update"
  on public.calendar_events for update
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_coach_on_client(user_id)
  )
  with check (
    user_id = auth.uid()
    or public.is_coach_on_client(user_id)
  );

-- ===== Delete: the owner, or the coach who created the event =====
-- (a coach can remove what they added; the owner can remove anything on theirs)
drop policy if exists "calendar_events_delete" on public.calendar_events;
create policy "calendar_events_delete"
  on public.calendar_events for delete
  to authenticated
  using (
    user_id = auth.uid()
    or (created_by = auth.uid() and public.is_coach_on_client(user_id))
  );

-- touch updated_at
create or replace function public.calendar_events_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists calendar_events_touch on public.calendar_events;
create trigger calendar_events_touch
  before update on public.calendar_events
  for each row execute function public.calendar_events_touch_updated_at();
