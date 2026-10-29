-- =====================================================================================
-- A time asked of a coach who isn't on Shape yet (the owner, 2026-10-29: sample times "need to be
-- clickable"; "Request, saved for her").
--
-- A seeded listing (a trainer or nutritionist row with no owner_id) shows sample open times on its
-- profile. A member taps one and asks for it; the ask is kept here against the listing. Shape's
-- owners hear of each ask (/api/listing-requests). When the listing is claimed (claim_provider_row,
-- /dashboard/claim), the coach reads the asks on their own page and every member who asked is told
-- the coach is on Shape now.
--
-- Who reads a row (RLS):
--   - the member who asked it;
--   - the account that owns the listing, once it does (trainers / nutritionists owner_id).
-- Nobody writes one through the API: the route inserts it with the service role, after checking
-- the account, the listing (it exists and has no owner), the time (in the next 60 days) and the
-- member's caps. A member's account going removes their asks (on delete cascade).
--
-- One transaction; re-runnable.
-- =====================================================================================

begin;
set local lock_timeout = '10s';

create table if not exists public.listing_time_requests (
  id uuid primary key default gen_random_uuid(),
  provider_role text not null check (provider_role in ('trainer', 'nutritionist')),
  provider_id bigint not null,
  member_id uuid not null references auth.users(id) on delete cascade,
  slot_start timestamptz not null,
  duration_min integer not null check (duration_min between 5 and 240),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  constraint listing_time_requests_once unique (provider_role, provider_id, member_id, slot_start)
);

create index if not exists listing_time_requests_listing_idx
  on public.listing_time_requests (provider_role, provider_id, slot_start);
create index if not exists listing_time_requests_member_idx
  on public.listing_time_requests (member_id, created_at desc);

alter table public.listing_time_requests enable row level security;

revoke all on table public.listing_time_requests from public;
revoke all on table public.listing_time_requests from anon;
revoke all on table public.listing_time_requests from authenticated;
grant select on table public.listing_time_requests to authenticated;

drop policy if exists listing_time_requests_member_read on public.listing_time_requests;
create policy listing_time_requests_member_read on public.listing_time_requests
  for select to authenticated
  using (member_id = (select auth.uid()));

drop policy if exists listing_time_requests_coach_read on public.listing_time_requests;
create policy listing_time_requests_coach_read on public.listing_time_requests
  for select to authenticated
  using (
    (provider_role = 'trainer' and exists (
      select 1 from public.trainers t where t.id = provider_id and t.owner_id = (select auth.uid())))
    or (provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n where n.id = provider_id and n.owner_id = (select auth.uid())))
  );

-- =====================================================================================
-- Guard: the end state, asserted. Every RAISE takes exactly the arguments its format names.
do $guard$
declare
  v_policies text[];
  v_rls boolean;
begin
  select relrowsecurity into v_rls from pg_class where oid = 'public.listing_time_requests'::regclass;
  if v_rls is not true then
    raise exception 'listing_time_requests: row level security is off';
  end if;
  select array_agg(policyname::text order by policyname) into v_policies
  from pg_policies where schemaname = 'public' and tablename = 'listing_time_requests';
  if v_policies is distinct from array['listing_time_requests_coach_read', 'listing_time_requests_member_read'] then
    raise exception 'listing_time_requests: the policies are %', v_policies;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'listing_time_requests' and cmd <> 'SELECT') then
    raise exception 'listing_time_requests: a policy lets the API write';
  end if;
  if has_table_privilege('anon', 'public.listing_time_requests', 'SELECT') then
    raise exception 'listing_time_requests: anon can read';
  end if;
  if has_table_privilege('authenticated', 'public.listing_time_requests', 'INSERT')
     or has_table_privilege('authenticated', 'public.listing_time_requests', 'UPDATE')
     or has_table_privilege('authenticated', 'public.listing_time_requests', 'DELETE') then
    raise exception 'listing_time_requests: authenticated can write';
  end if;
  if not has_table_privilege('authenticated', 'public.listing_time_requests', 'SELECT') then
    raise exception 'listing_time_requests: authenticated cannot read its own rows';
  end if;
end
$guard$;

commit;
