do $$
begin
  create type public.shape_role as enum ('client', 'trainer', 'nutritionist');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text not null default '',
  role public.shape_role not null default 'client',
  roles text[] not null default '{}',
  phone text,
  location text,
  profile_visibility text not null default 'community',
  shape_radio_enabled boolean not null default true,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists roles text[] not null default '{}';

update public.profiles
set roles = array[role::text]
where role is not null and (roles is null or array_length(roles, 1) is null);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users on delete cascade,
  provider_id bigint not null,
  provider_role text not null check (provider_role in ('trainer','nutritionist')),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text not null default 'pending'
    check (status in ('pending','active','past_due','canceled','incomplete','trialing','unpaid')),
  price_cents int,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.one_time_purchases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid not null references auth.users on delete cascade,
  provider_id bigint not null,
  provider_role text not null check (provider_role in ('trainer','nutritionist')),
  kind text not null check (kind in ('booking','meal_plan')),
  price_cents integer not null check (price_cents > 0),
  application_fee_cents integer,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  status text not null default 'pending'
    check (status in ('pending','paid','refunded','failed','disputed'))
);

create table if not exists public.provider_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  provider_type text not null check (provider_type in ('trainer','nutritionist')),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  location text,
  specialty text,
  years_experience text,
  monthly_price text,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','in_review','approved','rejected','withdrawn')),
  reviewed_by uuid references auth.users on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  user_agent text
);

create index if not exists subscriptions_client_idx
  on public.subscriptions (client_id, status);
create index if not exists subscriptions_provider_idx
  on public.subscriptions (provider_id, provider_role, status);
create index if not exists one_time_purchases_client_id_idx
  on public.one_time_purchases(client_id);
create index if not exists one_time_purchases_provider_idx
  on public.one_time_purchases(provider_role, provider_id);
create index if not exists provider_applications_status_idx on public.provider_applications (status, created_at desc);
create index if not exists provider_applications_type_idx on public.provider_applications (provider_type, created_at desc);
create index if not exists provider_applications_email_idx on public.provider_applications (email);

create or replace function public.provider_applications_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists provider_applications_touch on public.provider_applications;
create trigger provider_applications_touch before update on public.provider_applications
  for each row execute function public.provider_applications_touch_updated_at();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.one_time_purchases enable row level security;
alter table public.provider_applications enable row level security;

drop policy if exists "profiles are readable by owner" on public.profiles;
create policy "profiles are readable by owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles are editable by owner" on public.profiles;
create policy "profiles are editable by owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles can be inserted by owner" on public.profiles;
create policy "profiles can be inserted by owner"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "clients read own subscriptions" on public.subscriptions;
create policy "clients read own subscriptions"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = client_id);

drop policy if exists "clients read own purchases" on public.one_time_purchases;
create policy "clients read own purchases"
  on public.one_time_purchases for select
  to authenticated
  using (auth.uid() = client_id);

drop policy if exists "anon_insert_provider_applications" on public.provider_applications;
create policy "anon_insert_provider_applications"
  on public.provider_applications for insert
  to anon, authenticated with check (true);

create table if not exists public.client_intakes (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  first_name text, last_name text, dob date, sex text,
  primary_goal text, experience_level text, workout_frequency text,
  injuries text, medical text, dietary text, emergency_contact text,
  accountability_style text, interests text, budget text,
  details jsonb not null default '{}'::jsonb
);

create index if not exists client_intakes_primary_goal_idx on public.client_intakes (primary_goal);

create or replace function public.client_intakes_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists client_intakes_touch on public.client_intakes;
create trigger client_intakes_touch before update on public.client_intakes
  for each row execute function public.client_intakes_touch_updated_at();

alter table public.client_intakes enable row level security;
drop policy if exists "users_insert_own_intake" on public.client_intakes;
create policy "users_insert_own_intake" on public.client_intakes for insert
  to authenticated with check (user_id = auth.uid());
drop policy if exists "users_read_own_intake" on public.client_intakes;
create policy "users_read_own_intake" on public.client_intakes for select
  to authenticated using (user_id = auth.uid());
drop policy if exists "users_update_own_intake" on public.client_intakes;
create policy "users_update_own_intake" on public.client_intakes for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "providers_read_subscriber_intakes" on public.client_intakes;
create policy "providers_read_subscriber_intakes"
  on public.client_intakes for select
  to authenticated
  using (
    exists (
      select 1
      from public.subscriptions s
      left join public.trainers t
        on t.id = s.provider_id and s.provider_role = 'trainer'
      left join public.nutritionists n
        on n.id = s.provider_id and s.provider_role = 'nutritionist'
      where s.client_id = client_intakes.user_id
        and s.status in ('active','trialing')
        and (t.owner_id = auth.uid() or n.owner_id = auth.uid())
    )
  );

create table if not exists public.client_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.client_profiles enable row level security;

drop policy if exists "client_profiles_read_own" on public.client_profiles;
create policy "client_profiles_read_own"
  on public.client_profiles for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "client_profiles_insert_own" on public.client_profiles;
create policy "client_profiles_insert_own"
  on public.client_profiles for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "client_profiles_update_own" on public.client_profiles;
create policy "client_profiles_update_own"
  on public.client_profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.client_profiles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_profiles_touch_updated_at on public.client_profiles;
create trigger client_profiles_touch_updated_at
  before update on public.client_profiles
  for each row execute function public.client_profiles_set_updated_at();

create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  subject text,
  message text not null,
  user_agent text,
  status text not null default 'new'
);

create index if not exists contact_submissions_created_at_idx
  on public.contact_submissions (created_at desc);
create index if not exists contact_submissions_status_idx
  on public.contact_submissions (status);

alter table public.contact_submissions enable row level security;

drop policy if exists "anon_insert_contact_submissions" on public.contact_submissions;
create policy "anon_insert_contact_submissions"
  on public.contact_submissions for insert
  to anon, authenticated
  with check (true);

create table if not exists public.consultation_bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  professional_name text not null,
  professional_type text not null check (professional_type in ('trainer','nutritionist')),
  scheduled_date date not null,
  scheduled_time text not null,
  client_name text not null,
  client_email text not null,
  topic text,
  status text not null default 'pending'
);

create index if not exists consultation_bookings_scheduled_idx
  on public.consultation_bookings (scheduled_date, scheduled_time);
create index if not exists consultation_bookings_client_email_idx
  on public.consultation_bookings (client_email);

alter table public.consultation_bookings enable row level security;

drop policy if exists "anon_insert_consultation_bookings" on public.consultation_bookings;
create policy "anon_insert_consultation_bookings"
  on public.consultation_bookings for insert
  to anon, authenticated
  with check (true);

alter table public.trainers
  add column if not exists capacity_resume_at timestamptz;

alter table public.nutritionists
  add column if not exists capacity_resume_at timestamptz;

alter table public.trainers
  add column if not exists stripe_account_id text,
  add column if not exists stripe_account_status text
    check (stripe_account_status in ('pending','active','restricted','rejected'))
    default 'pending',
  add column if not exists stripe_product_id text,
  add column if not exists stripe_price_id text,
  add column if not exists session_price numeric(10,2);

alter table public.nutritionists
  add column if not exists stripe_account_id text,
  add column if not exists stripe_account_status text
    check (stripe_account_status in ('pending','active','restricted','rejected'))
    default 'pending',
  add column if not exists stripe_product_id text,
  add column if not exists stripe_price_id text,
  add column if not exists meal_plan_price numeric(10,2);

create unique index if not exists trainers_stripe_account_id_idx
  on public.trainers(stripe_account_id) where stripe_account_id is not null;
create unique index if not exists nutritionists_stripe_account_id_idx
  on public.nutritionists(stripe_account_id) where stripe_account_id is not null;

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid not null references auth.users on delete cascade,
  subscription_id uuid references public.subscriptions on delete set null,
  one_time_purchase_id uuid references public.one_time_purchases on delete set null,
  reason text,
  status text not null default 'pending'
    check (status in ('pending','approved','denied','refunded')),
  processed_at timestamptz,
  admin_notes text,
  constraint refund_requests_target_check
    check ((subscription_id is not null) <> (one_time_purchase_id is not null))
);

create index if not exists refund_requests_client_id_idx
  on public.refund_requests(client_id);
create index if not exists refund_requests_status_idx
  on public.refund_requests(status);

alter table public.refund_requests enable row level security;

drop policy if exists "clients read own refund requests" on public.refund_requests;
create policy "clients read own refund requests" on public.refund_requests
  for select
  to authenticated
  using (auth.uid() = client_id);

drop policy if exists "clients create own refund requests" on public.refund_requests;
create policy "clients create own refund requests" on public.refund_requests
  for insert
  to authenticated
  with check (auth.uid() = client_id);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sessions'
      and column_name = 'provider_id'
      and data_type = 'uuid'
  ) then
    execute 'alter table public.sessions rename to sessions_auth_user_legacy_' ||
      to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  end if;
end $$;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_id uuid references auth.users on delete set null,
  client_name text not null,
  client_email text not null,
  provider_id bigint not null,
  provider_role text not null check (provider_role in ('trainer','nutritionist')),
  type text not null default 'video' check (type in ('video','phone','inperson','message')),
  scheduled_at timestamptz not null,
  duration_min integer not null default 15,
  status text not null default 'requested'
    check (status in ('requested','confirmed','declined','completed','cancelled')),
  meeting_url text,
  client_phone text,
  topic text,
  notes text
);

create index if not exists sessions_provider_idx
  on public.sessions (provider_role, provider_id, scheduled_at);
create index if not exists sessions_client_idx
  on public.sessions (client_id, scheduled_at desc);
create index if not exists sessions_scheduled_idx
  on public.sessions (scheduled_at);
create unique index if not exists sessions_no_conflict_idx
  on public.sessions (provider_role, provider_id, scheduled_at)
  where status in ('requested','confirmed');

alter table public.sessions enable row level security;

drop policy if exists "sessions readable by participants" on public.sessions;
drop policy if exists "clients insert session requests" on public.sessions;
drop policy if exists "participants update sessions" on public.sessions;

drop policy if exists "anon_insert_sessions" on public.sessions;
create policy "anon_insert_sessions"
  on public.sessions for insert
  to anon, authenticated
  with check (status = 'requested');

drop policy if exists "read_own_sessions" on public.sessions;
create policy "read_own_sessions"
  on public.sessions for select
  to authenticated
  using (
    client_id = auth.uid()
    or (
      provider_role = 'trainer' and exists (
        select 1 from public.trainers t
        where t.id = sessions.provider_id and t.owner_id = auth.uid()
      )
    )
    or (
      provider_role = 'nutritionist' and exists (
        select 1 from public.nutritionists n
        where n.id = sessions.provider_id and n.owner_id = auth.uid()
      )
    )
  );

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
  with check (true);

drop policy if exists "client_cancel_sessions" on public.sessions;
create policy "client_cancel_sessions"
  on public.sessions for update
  to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

create table if not exists public.provider_availability (
  id uuid primary key default gen_random_uuid(),
  provider_id bigint not null,
  provider_role text not null check (provider_role in ('trainer','nutritionist')),
  weekday smallint not null check (weekday between 0 and 6),
  start_minute integer not null check (start_minute between 0 and 1439),
  duration_min integer not null default 15,
  created_at timestamptz not null default now(),
  unique (provider_role, provider_id, weekday, start_minute)
);

create index if not exists provider_availability_lookup_idx
  on public.provider_availability (provider_role, provider_id, weekday);

alter table public.provider_availability enable row level security;

drop policy if exists "public_read_availability" on public.provider_availability;
create policy "public_read_availability"
  on public.provider_availability for select
  to anon, authenticated
  using (true);

drop policy if exists "provider_write_availability" on public.provider_availability;
create policy "provider_write_availability"
  on public.provider_availability for all
  to authenticated
  using (
    (provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = provider_availability.provider_id and t.owner_id = auth.uid()
    ))
    or
    (provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = provider_availability.provider_id and n.owner_id = auth.uid()
    ))
  )
  with check (
    (provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = provider_availability.provider_id and t.owner_id = auth.uid()
    ))
    or
    (provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = provider_availability.provider_id and n.owner_id = auth.uid()
    ))
  );

create or replace function public.sessions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sessions_touch_updated_at on public.sessions;
create trigger sessions_touch_updated_at
  before update on public.sessions
  for each row execute function public.sessions_set_updated_at();

create table if not exists public.trainer_playlists (
  id uuid primary key default gen_random_uuid(),
  trainer_id bigint not null,
  workout_id bigint,
  title text not null,
  description text,
  spotify_playlist_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trainer_playlists_trainer_idx
  on public.trainer_playlists (trainer_id, created_at desc);
create index if not exists trainer_playlists_workout_idx
  on public.trainer_playlists (workout_id)
  where workout_id is not null;

alter table public.trainer_playlists enable row level security;

drop policy if exists "public_read_trainer_playlists" on public.trainer_playlists;
create policy "public_read_trainer_playlists"
  on public.trainer_playlists for select
  to anon, authenticated
  using (true);

drop policy if exists "trainer_write_own_playlists" on public.trainer_playlists;
create policy "trainer_write_own_playlists"
  on public.trainer_playlists for all
  to authenticated
  using (
    exists (
      select 1 from public.trainers t
      where t.id = trainer_playlists.trainer_id and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.trainers t
      where t.id = trainer_playlists.trainer_id and t.owner_id = auth.uid()
    )
  );

create or replace function public.trainer_playlists_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trainer_playlists_touch_updated_at on public.trainer_playlists;
create trigger trainer_playlists_touch_updated_at
  before update on public.trainer_playlists
  for each row execute function public.trainer_playlists_set_updated_at();

create table if not exists public.client_workouts (
  id uuid primary key default gen_random_uuid(),
  trainer_id bigint not null,
  client_id uuid not null,
  title text not null,
  description text,
  kind text not null check (kind in ('template','custom')),
  payload jsonb not null default '{}'::jsonb,
  playlist_id uuid references public.trainer_playlists(id) on delete set null,
  status text not null default 'published' check (status in ('published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_workouts_client_idx
  on public.client_workouts (client_id, created_at desc);
create index if not exists client_workouts_trainer_idx
  on public.client_workouts (trainer_id, created_at desc);

alter table public.client_workouts enable row level security;

drop policy if exists "trainer_write_own_client_workouts" on public.client_workouts;
create policy "trainer_write_own_client_workouts"
  on public.client_workouts for all
  to authenticated
  using (
    exists (
      select 1 from public.trainers t
      where t.id = client_workouts.trainer_id and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.trainers t
      where t.id = client_workouts.trainer_id and t.owner_id = auth.uid()
    )
  );

drop policy if exists "client_read_own_client_workouts" on public.client_workouts;
create policy "client_read_own_client_workouts"
  on public.client_workouts for select
  to authenticated
  using (client_id = auth.uid());

create or replace function public.client_workouts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_workouts_touch_updated_at on public.client_workouts;
create trigger client_workouts_touch_updated_at
  before update on public.client_workouts
  for each row execute function public.client_workouts_set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, roles)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::public.shape_role, 'client'),
    array[coalesce(new.raw_user_meta_data->>'role', 'client')]
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Private storage bucket for provider application resumes, certifications,
-- licenses, and insurance documents. Files are stored under {auth.uid()}/...
-- and the application row saves the bucket/path metadata in details.documents.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'provider-credentials',
  'provider-credentials',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "provider credentials read own" on storage.objects;
create policy "provider credentials read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'provider-credentials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "provider credentials upload own" on storage.objects;
create policy "provider credentials upload own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'provider-credentials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "provider credentials update own" on storage.objects;
create policy "provider credentials update own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'provider-credentials'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'provider-credentials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "provider credentials delete own" on storage.objects;
create policy "provider credentials delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'provider-credentials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Shared conversations/messages for client-to-provider chat.
-- Keep this in sync with shape-app-github/supabase-migrations/2026-05-02-conversations-messages.sql.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  kind text not null default 'direct'
    check (kind in ('direct','room','community')),
  title text,
  provider_role text check (provider_role in ('trainer','nutritionist')),
  provider_id bigint,
  client_id uuid references auth.users on delete set null,
  last_message text,
  last_message_at timestamptz
);

create unique index if not exists conversations_direct_unique_idx
  on public.conversations (provider_role, provider_id, client_id)
  where kind = 'direct'
    and provider_role is not null
    and provider_id is not null
    and client_id is not null;

create index if not exists conversations_client_idx
  on public.conversations (client_id, last_message_at desc nulls last);
create index if not exists conversations_provider_idx
  on public.conversations (provider_role, provider_id, last_message_at desc nulls last);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member'
    check (role in ('client','trainer','nutritionist','admin','member')),
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_participants_user_idx
  on public.conversation_participants (user_id, created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations on delete cascade,
  sender_id uuid references auth.users on delete set null,
  body text not null check (char_length(trim(body)) > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at asc);

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

create or replace function public.can_access_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (
        c.client_id = auth.uid()
        or exists (
          select 1
          from public.conversation_participants cp
          where cp.conversation_id = c.id and cp.user_id = auth.uid()
        )
        or (
          c.provider_role = 'trainer'
          and exists (
            select 1 from public.trainers t
            where t.id = c.provider_id and t.owner_id = auth.uid()
          )
        )
        or (
          c.provider_role = 'nutritionist'
          and exists (
            select 1 from public.nutritionists n
            where n.id = c.provider_id and n.owner_id = auth.uid()
          )
        )
      )
  );
$$;

drop policy if exists "participants read conversations" on public.conversations;
create policy "participants read conversations"
  on public.conversations for select
  to authenticated
  using (public.can_access_conversation(id));

drop policy if exists "clients create direct conversations" on public.conversations;
create policy "clients create direct conversations"
  on public.conversations for insert
  to authenticated
  with check (kind = 'direct' and client_id = auth.uid());

drop policy if exists "participants update conversations" on public.conversations;
create policy "participants update conversations"
  on public.conversations for update
  to authenticated
  using (public.can_access_conversation(id))
  with check (public.can_access_conversation(id));

drop policy if exists "participants read participants" on public.conversation_participants;
create policy "participants read participants"
  on public.conversation_participants for select
  to authenticated
  using (public.can_access_conversation(conversation_id));

drop policy if exists "users add self to conversation" on public.conversation_participants;
create policy "users add self to conversation"
  on public.conversation_participants for insert
  to authenticated
  with check (user_id = auth.uid() and public.can_access_conversation(conversation_id));

drop policy if exists "participants read messages" on public.messages;
create policy "participants read messages"
  on public.messages for select
  to authenticated
  using (public.can_access_conversation(conversation_id));

drop policy if exists "participants send messages" on public.messages;
create policy "participants send messages"
  on public.messages for insert
  to authenticated
  with check (sender_id = auth.uid() and public.can_access_conversation(conversation_id));

create or replace function public.messages_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message = new.body,
      last_message_at = new.created_at,
      updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.messages_touch_conversation();

create or replace function public.get_or_create_direct_conversation(
  p_provider_role text,
  p_provider_id bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid := auth.uid();
  v_owner_id uuid;
  v_conversation_id uuid;
  v_provider_name text;
begin
  if v_client_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_provider_role not in ('trainer','nutritionist') then
    raise exception 'Invalid provider role.';
  end if;

  if p_provider_role = 'trainer' then
    select owner_id, name into v_owner_id, v_provider_name
    from public.trainers
    where id = p_provider_id;
  else
    select owner_id, name into v_owner_id, v_provider_name
    from public.nutritionists
    where id = p_provider_id;
  end if;

  if v_provider_name is null then
    raise exception 'Provider was not found.';
  end if;

  select id into v_conversation_id
  from public.conversations
  where kind = 'direct'
    and provider_role = p_provider_role
    and provider_id = p_provider_id
    and client_id = v_client_id
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations (kind, title, provider_role, provider_id, client_id)
    values ('direct', v_provider_name, p_provider_role, p_provider_id, v_client_id)
    returning id into v_conversation_id;
  end if;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values (v_conversation_id, v_client_id, 'client')
  on conflict (conversation_id, user_id) do nothing;

  if v_owner_id is not null then
    insert into public.conversation_participants (conversation_id, user_id, role)
    values (v_conversation_id, v_owner_id, p_provider_role)
    on conflict (conversation_id, user_id) do nothing;
  end if;

  return v_conversation_id;
end;
$$;

grant execute on function public.get_or_create_direct_conversation(text, bigint) to authenticated;

-- Community workout feed: posts, likes, comments, privacy, route/metric payloads.
-- Keep this in sync with shape-app-github/supabase-migrations/2026-05-02-community-feed.sql.
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users on delete set null,
  author_name text not null default 'Shape member',
  author_role text not null default 'client'
    check (author_role in ('client','trainer','nutritionist','member')),
  privacy text not null default 'community'
    check (privacy in ('public','community','private')),
  activity_type text not null default 'workout',
  title text not null,
  status text,
  note text,
  metrics jsonb not null default '{}'::jsonb,
  route jsonb not null default '{}'::jsonb,
  source_provider text,
  source_activity_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_posts_created_idx
  on public.community_posts (created_at desc);
create index if not exists community_posts_author_idx
  on public.community_posts (author_id, created_at desc);
create unique index if not exists community_posts_source_unique_idx
  on public.community_posts (source_provider, source_activity_id)
  where source_provider is not null and source_activity_id is not null;

create table if not exists public.community_likes (
  post_id uuid not null references public.community_posts on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists community_likes_user_idx
  on public.community_likes (user_id, created_at desc);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts on delete cascade,
  user_id uuid references auth.users on delete set null,
  author_name text not null default 'Shape member',
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists community_comments_post_idx
  on public.community_comments (post_id, created_at asc);

alter table public.community_posts enable row level security;
alter table public.community_likes enable row level security;
alter table public.community_comments enable row level security;

create or replace function public.can_view_community_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_posts p
    where p.id = p_post_id
      and (
        p.privacy = 'public'
        or (p.privacy = 'community' and auth.uid() is not null)
        or p.author_id = auth.uid()
      )
  );
$$;

drop policy if exists "read visible community posts" on public.community_posts;
create policy "read visible community posts"
  on public.community_posts for select
  to anon, authenticated
  using (
    privacy = 'public'
    or (privacy = 'community' and auth.uid() is not null)
    or author_id = auth.uid()
  );

drop policy if exists "users create own community posts" on public.community_posts;
create policy "users create own community posts"
  on public.community_posts for insert
  to authenticated
  with check (author_id = auth.uid());

drop policy if exists "users update own community posts" on public.community_posts;
create policy "users update own community posts"
  on public.community_posts for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "users delete own community posts" on public.community_posts;
create policy "users delete own community posts"
  on public.community_posts for delete
  to authenticated
  using (author_id = auth.uid());

drop policy if exists "read visible community likes" on public.community_likes;
create policy "read visible community likes"
  on public.community_likes for select
  to anon, authenticated
  using (public.can_view_community_post(post_id));

drop policy if exists "users like visible community posts" on public.community_likes;
create policy "users like visible community posts"
  on public.community_likes for insert
  to authenticated
  with check (user_id = auth.uid() and public.can_view_community_post(post_id));

drop policy if exists "users unlike own community likes" on public.community_likes;
create policy "users unlike own community likes"
  on public.community_likes for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "read visible community comments" on public.community_comments;
create policy "read visible community comments"
  on public.community_comments for select
  to anon, authenticated
  using (public.can_view_community_post(post_id));

drop policy if exists "users comment on visible community posts" on public.community_comments;
create policy "users comment on visible community posts"
  on public.community_comments for insert
  to authenticated
  with check (user_id = auth.uid() and public.can_view_community_post(post_id));

drop policy if exists "users delete own community comments" on public.community_comments;
create policy "users delete own community comments"
  on public.community_comments for delete
  to authenticated
  using (user_id = auth.uid());

create or replace function public.community_posts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists community_posts_touch_updated_at on public.community_posts;
create trigger community_posts_touch_updated_at
  before update on public.community_posts
  for each row execute function public.community_posts_set_updated_at();

-- Shape-authored workout sessions: exact set/rest logs plus optional watch sensor samples.
-- The phone app owns the session timeline; watches enrich it with HR/zone/calorie/motion data.
create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users on delete cascade,
  client_workout_id uuid references public.client_workouts(id) on delete set null,
  provider_id bigint,
  provider_role text check (provider_role in ('trainer','nutritionist')),
  title text not null default 'Workout session',
  activity_type text not null default 'workout',
  status text not null default 'completed'
    check (status in ('planned','active','completed','abandoned','reviewed')),
  privacy text not null default 'private'
    check (privacy in ('private','coach','community','public')),
  source text not null default 'shape_app'
    check (source in ('shape_app','shape_session','apple_watch','apple_health','wear_os','whoop','garmin','strava','manual')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workout_sessions_client_idx
  on public.workout_sessions (client_id, created_at desc);
create index if not exists workout_sessions_provider_idx
  on public.workout_sessions (provider_role, provider_id, created_at desc)
  where provider_id is not null and provider_role is not null;
create index if not exists workout_sessions_client_workout_idx
  on public.workout_sessions (client_workout_id)
  where client_workout_id is not null;

create table if not exists public.workout_set_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  client_id uuid not null references auth.users on delete cascade,
  move_index integer not null default 0 check (move_index >= 0),
  move_name text not null,
  set_number integer not null check (set_number > 0),
  target_reps text,
  target_load text,
  started_at timestamptz,
  finished_at timestamptz,
  set_duration_seconds integer not null default 0 check (set_duration_seconds >= 0),
  rest_before_seconds integer check (rest_before_seconds is null or rest_before_seconds >= 0),
  completed boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workout_set_logs_session_idx
  on public.workout_set_logs (session_id, move_index, set_number);
create index if not exists workout_set_logs_client_idx
  on public.workout_set_logs (client_id, created_at desc);

create table if not exists public.workout_sensor_samples (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  client_id uuid not null references auth.users on delete cascade,
  provider text not null default 'shape_app'
    check (provider in ('shape_app','shape_session','apple_watch','apple_health','wear_os','whoop','garmin','strava','manual')),
  sample_type text not null
    check (sample_type in ('heart_rate','heart_rate_zone','calories','motion','cadence','power','strain','summary')),
  sampled_at timestamptz not null default now(),
  value numeric,
  unit text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workout_sensor_samples_session_idx
  on public.workout_sensor_samples (session_id, sampled_at asc);
create index if not exists workout_sensor_samples_client_idx
  on public.workout_sensor_samples (client_id, sampled_at desc);
create index if not exists workout_sensor_samples_provider_idx
  on public.workout_sensor_samples (provider, sample_type, sampled_at desc);

create table if not exists public.coach_workout_review_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  reviewer_id uuid not null references auth.users on delete cascade,
  provider_id bigint,
  provider_role text check (provider_role in ('trainer','nutritionist')),
  body text not null check (char_length(trim(body)) > 0),
  visibility text not null default 'client'
    check (visibility in ('client','coach_private','team')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_workout_review_notes_session_idx
  on public.coach_workout_review_notes (session_id, created_at asc);
create index if not exists coach_workout_review_notes_reviewer_idx
  on public.coach_workout_review_notes (reviewer_id, created_at desc);

alter table public.workout_sessions enable row level security;
alter table public.workout_set_logs enable row level security;
alter table public.workout_sensor_samples enable row level security;
alter table public.coach_workout_review_notes enable row level security;

create or replace function public.can_access_workout_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workout_sessions ws
    where ws.id = p_session_id
      and (
        ws.client_id = auth.uid()
        or (
          ws.provider_role = 'trainer'
          and exists (
            select 1 from public.trainers t
            where t.id = ws.provider_id and t.owner_id = auth.uid()
          )
        )
        or (
          ws.provider_role = 'nutritionist'
          and exists (
            select 1 from public.nutritionists n
            where n.id = ws.provider_id and n.owner_id = auth.uid()
          )
        )
      )
  );
$$;

drop policy if exists "clients insert own workout sessions" on public.workout_sessions;
create policy "clients insert own workout sessions"
  on public.workout_sessions for insert
  to authenticated
  with check (client_id = auth.uid());

drop policy if exists "participants read workout sessions" on public.workout_sessions;
create policy "participants read workout sessions"
  on public.workout_sessions for select
  to authenticated
  using (public.can_access_workout_session(id));

drop policy if exists "clients update own active workout sessions" on public.workout_sessions;
create policy "clients update own active workout sessions"
  on public.workout_sessions for update
  to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

drop policy if exists "clients insert own workout set logs" on public.workout_set_logs;
create policy "clients insert own workout set logs"
  on public.workout_set_logs for insert
  to authenticated
  with check (client_id = auth.uid() and public.can_access_workout_session(session_id));

drop policy if exists "participants read workout set logs" on public.workout_set_logs;
create policy "participants read workout set logs"
  on public.workout_set_logs for select
  to authenticated
  using (public.can_access_workout_session(session_id));

drop policy if exists "clients insert own workout sensor samples" on public.workout_sensor_samples;
create policy "clients insert own workout sensor samples"
  on public.workout_sensor_samples for insert
  to authenticated
  with check (client_id = auth.uid() and public.can_access_workout_session(session_id));

drop policy if exists "participants read workout sensor samples" on public.workout_sensor_samples;
create policy "participants read workout sensor samples"
  on public.workout_sensor_samples for select
  to authenticated
  using (public.can_access_workout_session(session_id));

drop policy if exists "participants read coach workout review notes" on public.coach_workout_review_notes;
create policy "participants read coach workout review notes"
  on public.coach_workout_review_notes for select
  to authenticated
  using (
    public.can_access_workout_session(session_id)
    and (
      visibility <> 'coach_private'
      or reviewer_id = auth.uid()
    )
  );

drop policy if exists "providers create workout review notes" on public.coach_workout_review_notes;
create policy "providers create workout review notes"
  on public.coach_workout_review_notes for insert
  to authenticated
  with check (
    reviewer_id = auth.uid()
    and public.can_access_workout_session(session_id)
    and (
      (
        provider_role = 'trainer'
        and exists (
          select 1 from public.trainers t
          where t.id = provider_id and t.owner_id = auth.uid()
        )
      )
      or (
        provider_role = 'nutritionist'
        and exists (
          select 1 from public.nutritionists n
          where n.id = provider_id and n.owner_id = auth.uid()
        )
      )
    )
  );

drop policy if exists "reviewers update own workout review notes" on public.coach_workout_review_notes;
create policy "reviewers update own workout review notes"
  on public.coach_workout_review_notes for update
  to authenticated
  using (reviewer_id = auth.uid())
  with check (reviewer_id = auth.uid());

create or replace function public.workout_sessions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workout_sessions_touch_updated_at on public.workout_sessions;
create trigger workout_sessions_touch_updated_at
  before update on public.workout_sessions
  for each row execute function public.workout_sessions_set_updated_at();

create or replace function public.coach_workout_review_notes_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists coach_workout_review_notes_touch_updated_at on public.coach_workout_review_notes;
create trigger coach_workout_review_notes_touch_updated_at
  before update on public.coach_workout_review_notes
  for each row execute function public.coach_workout_review_notes_set_updated_at();
